import hoistStatics from 'hoist-non-react-statics'
import invariant from 'invariant'
import React, { Component } from 'react'
import { isValidElementType, isContextConsumer } from 'react-is'

import { ReactReduxContext } from './Context'
import Subscription from '../utils/Subscription'
import PropTypes from 'prop-types'
import { unstable_readContext } from '../utils/readContext'

const stringifyComponent = Comp => {
  try {
    return JSON.stringify(Comp)
  } catch (err) {
    return String(Comp)
  }
}

let hotReloadingVersion = 0
const dummyState = {}
function noop() {}

function makeSelectorStateful(sourceSelector, store) {
  // wrap the selector in an object that tracks its results between runs.
  const selector = {
    run: function runComponentSelector(props) {
      try {
        const nextProps = sourceSelector(store.getState(), props)
        if (nextProps !== selector.props || selector.error) {
          selector.shouldComponentUpdate = true
          selector.props = nextProps
          selector.error = null
        }
      } catch (error) {
        selector.shouldComponentUpdate = true
        selector.error = error
      }
    }
  }

  return selector
}

export default function connectAdvanced(
  /*
    selectorFactory is a func that is responsible for returning the selector function used to
    compute new props from state, props, and dispatch. For example:

      export default connectAdvanced((dispatch, options) => (state, props) => ({
        thing: state.things[props.thingId],
        saveThing: fields => dispatch(actionCreators.saveThing(props.thingId, fields)),
      }))(YourComponent)

    Access to dispatch is provided to the factory so selectorFactories can bind actionCreators
    outside of their selector as an optimization. Options passed to connectAdvanced are passed to
    the selectorFactory, along with displayName and WrappedComponent, as the second argument.

    Note that selectorFactory is responsible for all caching/memoization of inbound and outbound
    props. Do not use connectAdvanced directly without memoizing results between calls to your
    selector, otherwise the Connect component will re-render on every state or props change.
  */
  selectorFactory,
  // options object:
  {
    // the func used to compute this HOC's displayName from the wrapped component's displayName.
    // probably overridden by wrapper functions such as connect()
    getDisplayName = name => `ConnectAdvanced(${name})`,

    // shown in error messages
    // probably overridden by wrapper functions such as connect()
    methodName = 'connectAdvanced',

    // REMOVED: if defined, the name of the property passed to the wrapped element indicating the number of
    // calls to render. useful for watching in react devtools for unnecessary re-renders.
    renderCountProp = undefined,

    // determines whether this HOC subscribes to store changes
    shouldHandleStateChanges = true,

    // REMOVED: the key of props/context to get the store
    storeKey = 'store',

    // REMOVED: expose the wrapped component via refs
    withRef = false,

    // use React's forwardRef to expose a ref of the wrapped component
    forwardRef = false,

    // the context consumer to use
    context = ReactReduxContext,

    unstable_enableReadContextFromProps = false,

    // additional options are passed through to the selectorFactory
    ...connectOptions
  } = {}
) {
  invariant(
    renderCountProp === undefined,
    `renderCountProp is removed. render counting is built into the latest React dev tools profiling extension`
  )

  invariant(
    !withRef,
    'withRef is removed. To access the wrapped instance, use a ref on the connected component'
  )

  const customStoreWarningMessage =
    'To use a custom Redux store for specific components,  create a custom React context with ' +
    "React.createContext(), and pass the context object to React Redux's Provider and specific components" +
    ' like:  <Provider context={MyContext}><ConnectedComponent/></Provider> where ConnectedComponent has been created' +
    ' with {context : MyContext} option in connect'

  invariant(
    storeKey === 'store',
    'storeKey has been removed and does not do anything. ' +
      customStoreWarningMessage
  )

  const version = hotReloadingVersion++

  const Context = context

  return function wrapWithConnect(WrappedComponent) {
    if (process.env.NODE_ENV !== 'production') {
      invariant(
        isValidElementType(WrappedComponent),
        `You must pass a component to the function returned by ` +
          `${methodName}. Instead received ${stringifyComponent(
            WrappedComponent
          )}`
      )
    }

    const wrappedComponentName =
      WrappedComponent.displayName || WrappedComponent.name || 'Component'

    const displayName = getDisplayName(wrappedComponentName)

    const selectorFactoryOptions = {
      ...connectOptions,
      getDisplayName,
      methodName,
      renderCountProp,
      shouldHandleStateChanges,
      storeKey,
      displayName,
      wrappedComponentName,
      WrappedComponent
    }

    const { pure } = connectOptions

    let ContextToUse = Context

    class Connect extends Component {
      constructor(props, context) {
        super(props)
        this.version = version // TODO add HOT reload

        this.contextValueToUse = context //TODO add this.context Refresh from Provider

        this.updateContextFromProps(props) //TODO refresh props.context || props.store

        this.contextSubscription = this.contextValueToUse.subscription
        this.store = props.store || this.contextValueToUse.store
        this.propsMode = Boolean(props.store)

        invariant(
          this.store,
          `Could not find "${storeKey}" in either the context or props of ` +
            `"${displayName}". Either wrap the root component in a <Provider>, ` +
            `or explicitly pass "${storeKey}" as a prop to "${displayName}".`
        )

        this.initSelector()
        this.initSubscription()
      }

      updateContextFromProps(props) {
        if (
          unstable_enableReadContextFromProps &&
          props.context &&
          props.context.Consumer &&
          isContextConsumer(<props.context.Consumer />)
        ) {
          ContextToUse = props.context
          this.contextValueToUse = unstable_readContext(props.context)
        }
      }

      componentDidMount() {
        this.selector.shouldComponentUpdate = false
        if (!shouldHandleStateChanges) return

        // componentWillMount fires during server side rendering, but componentDidMount and
        // componentWillUnmount do not. Because of this, trySubscribe happens during ...didMount.
        // Otherwise, unsubscription would never take place during SSR, causing a memory leak.
        // To handle the case where a child component may have triggered a state change by
        // dispatching an action in its componentWillMount, we have to re-run the select and maybe
        // re-render.
        this.subscription.trySubscribe()
        this.selector.run(this.props)
        if (this.selector.shouldComponentUpdate) this.forceUpdate()
      }

      componentWillUnmount() {
        if (this.subscription) this.subscription.tryUnsubscribe()
        this.subscription = null
        this.notifyNestedSubs = noop
        this.store = null
        this.selector.run = noop
        this.selector.shouldComponentUpdate = false
      }

      shouldComponentUpdate(nextProps) {
        if (!pure || nextProps !== this.props) this.selector.run(nextProps)
        return !pure || this.selector.shouldComponentUpdate
      }

      initSelector() {
        const sourceSelector = selectorFactory(
          this.store.dispatch,
          selectorFactoryOptions
        )
        this.selector = makeSelectorStateful(sourceSelector, this.store)
        this.selector.run(this.props)
      }

      initSubscription() {
        if (!shouldHandleStateChanges) return

        // parentSub's source should match where store came from: props vs. context. A component
        // connected to the store via props shouldn't use subscription from context, or vice versa.

        //const parentSub = (this.propsMode ? this.props : this.context)[
        //  subscriptionKey
        //]
        const parentSub = this.propsMode ? undefined : this.contextSubscription

        this.subscription = new Subscription(
          this.store,
          parentSub,
          this.onStateChange.bind(this)
        )

        //if store is from Props, we need to propagate new subscription via context (rare case-use)
        this.newContextValue = this.propsMode
          ? {
              store: this.store,
              subscription: this.subscription
            }
          : undefined

        // `notifyNestedSubs` is duplicated to handle the case where the component is unmounted in
        // the middle of the notification loop, where `this.subscription` will then be null. An
        // extra null check every change can be avoided by copying the method onto `this` and then
        // replacing it with a no-op on unmount. This can probably be avoided if Subscription's
        // listeners logic is changed to not call listeners that have been unsubscribed in the
        // middle of the notification loop.
        this.notifyNestedSubs = this.subscription.notifyNestedSubs.bind(
          this.subscription
        )
      }

      onStateChange() {
        this.selector.run(this.props)

        if (!this.selector.shouldComponentUpdate) {
          this.notifyNestedSubs()
        } else {
          this.componentDidUpdate = this.notifyNestedSubsOnComponentDidUpdate
          this.setState(dummyState)
        }
      }

      notifyNestedSubsOnComponentDidUpdate() {
        // `componentDidUpdate` is conditionally implemented when `onStateChange` determines it
        // needs to notify nested subs. Once called, it unimplements itself until further state
        // changes occur. Doing it this way vs having a permanent `componentDidUpdate` that does
        // a boolean check every time avoids an extra method call most of the time, resulting
        // in some perf boost.
        this.componentDidUpdate = undefined
        this.notifyNestedSubs()
      }

      render() {
        const selector = this.selector
        selector.shouldComponentUpdate = false

        //clean wrapperProps and set ref if forwardRef
        const { context, store, forwardedRef, ...wrapperProps } = selector.props //eslint-disable-line
        if (forwardRef) wrapperProps.ref = forwardedRef

        if (selector.error) {
          throw selector.error
        } else {
          return this.newContextValue ? (
            <ContextToUse.Provider value={this.newContextValue}>
              <WrappedComponent {...wrapperProps} />
            </ContextToUse.Provider>
          ) : (
            <WrappedComponent {...wrapperProps} />
          )
        }
      }
    }

    Connect.WrappedComponent = WrappedComponent
    Connect.contextType = Context
    Connect.displayName = displayName

    Connect.propTypes = {
      store: PropTypes.shape({
        subscribe: PropTypes.func.isRequired,
        dispatch: PropTypes.func.isRequired,
        getState: PropTypes.func.isRequired
      }),
      context: PropTypes.object,
      children: PropTypes.any
    }

    if (forwardRef) {
      const forwarded = React.forwardRef((props, ref) => (
        <Connect {...props} forwardedRef={ref} />
      ))

      forwarded.displayName = displayName
      forwarded.WrappedComponent = WrappedComponent
      return hoistStatics(forwarded, WrappedComponent)
    }

    return hoistStatics(Connect, WrappedComponent)
  }
}
