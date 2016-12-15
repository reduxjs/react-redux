import hoistStatics from 'hoist-non-react-statics'
import invariant from 'invariant'
import { Component, PropTypes, createElement } from 'react'

import Subscription from '../utils/Subscription'
import storeShape from '../utils/storeShape'

let hotReloadingVersion = 0
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

    // if defined, the name of the property passed to the wrapped element indicating the number of
    // calls to render. useful for watching in react devtools for unnecessary re-renders.
    renderCountProp = undefined,

    // determines whether this HOC subscribes to store changes
    shouldHandleStateChanges = true,

    // the key of props/context to get the store
    storeKey = 'store',

    // if true, the wrapped element is exposed by this HOC via the getWrappedInstance() function.
    withRef = false,

    // additional options are passed through to the selectorFactory
    ...connectOptions
  } = {}
) {
  const subscriptionKey = storeKey + 'Subscription'
  const version = hotReloadingVersion++

  const contextTypes = {
    [storeKey]: storeShape,
    [subscriptionKey]: PropTypes.instanceOf(Subscription),
  }
  const childContextTypes = {
    [subscriptionKey]: PropTypes.instanceOf(Subscription)
  }

  return function wrapWithConnect(WrappedComponent) {
    invariant(
      typeof WrappedComponent == 'function',
      `You must pass a component to the function returned by ` +
      `connect. Instead received ${WrappedComponent}`
    )

    const wrappedComponentName = WrappedComponent.displayName
      || WrappedComponent.name
      || 'Component'

    const displayName = getDisplayName(wrappedComponentName)

    const selectorFactoryOptions = {
      ...connectOptions,
      getDisplayName,
      methodName,
      renderCountProp,
      shouldHandleStateChanges,
      storeKey,
      withRef,
      displayName,
      wrappedComponentName,
      WrappedComponent
    }

    class Connect extends Component {
      constructor(props, context) {
        super(props, context)

        this.version = version
        this.state = {}
        this.renderCount = 0
        this.store = this.props[storeKey] || this.context[storeKey]
        this.parentSub = props[subscriptionKey] || context[subscriptionKey]

        this.setWrappedInstance = this.setWrappedInstance.bind(this)

        invariant(this.store,
          `Could not find "${storeKey}" in either the context or ` +
          `props of "${displayName}". ` +
          `Either wrap the root component in a <Provider>, ` +
          `or explicitly pass "${storeKey}" as a prop to "${displayName}".`
        )

        // make sure `getState` is properly bound in order to avoid breaking
        // custom store implementations that rely on the store's context
        this.getState = this.store.getState.bind(this.store);

        this.initSelector()
        this.initSubscription()
      }

      getChildContext() {
        return { [subscriptionKey]: this.subscription || this.parentSub }
      }

      componentDidMount() {
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

      componentWillReceiveProps(nextProps) {
        this.selector.run(nextProps)
      }

      shouldComponentUpdate() {
        return this.selector.shouldComponentUpdate
      }

      componentWillUnmount() {
        if (this.subscription) this.subscription.tryUnsubscribe()
        // these are just to guard against extra memory leakage if a parent element doesn't
        // dereference this instance properly, such as an async callback that never finishes
        this.subscription = null
        this.store = null
        this.parentSub = null
        this.selector.run = () => {}
      }

      getWrappedInstance() {
        invariant(withRef,
          `To access the wrapped instance, you need to specify ` +
          `{ withRef: true } in the options argument of the ${methodName}() call.`
        )
        return this.wrappedInstance
      }

      setWrappedInstance(ref) {
        this.wrappedInstance = ref
      }

      initSelector() {
        const { dispatch } = this.store
        const { getState } = this;
        const sourceSelector = selectorFactory(dispatch, selectorFactoryOptions)

        // wrap the selector in an object that tracks its results between runs
        const selector = this.selector = {
          shouldComponentUpdate: true,
          props: sourceSelector(getState(), this.props),
          run: function runComponentSelector(props) {
            try {
              const nextProps = sourceSelector(getState(), props)
              if (selector.error || nextProps !== selector.props) {
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
      }

      initSubscription() {
        if (shouldHandleStateChanges) {
          const subscription = this.subscription = new Subscription(this.store, this.parentSub)
          const dummyState = {}

          subscription.onStateChange = function onStateChange() {
            this.selector.run(this.props)

            if (!this.selector.shouldComponentUpdate) {
              subscription.notifyNestedSubs()
            } else {
              this.componentDidUpdate = function componentDidUpdate() {
                this.componentDidUpdate = undefined
                subscription.notifyNestedSubs()
              }

              this.setState(dummyState)
            }
          }.bind(this)
        }
      }

      isSubscribed() {
        return Boolean(this.subscription) && this.subscription.isSubscribed()
      }

      addExtraProps(props) {
        if (!withRef && !renderCountProp) return props
        // make a shallow copy so that fields added don't leak to the original selector.
        // this is especially important for 'ref' since that's a reference back to the component
        // instance. a singleton memoized selector would then be holding a reference to the
        // instance, preventing the instance from being garbage collected, and that would be bad
        const withExtras = { ...props }
        if (withRef) withExtras.ref = this.setWrappedInstance
        if (renderCountProp) withExtras[renderCountProp] = this.renderCount++
        return withExtras
      }

      render() {
        const selector = this.selector
        selector.shouldComponentUpdate = false

        if (selector.error) {
          throw selector.error
        } else {
          return createElement(WrappedComponent, this.addExtraProps(selector.props))
        }
      }
    }

    Connect.WrappedComponent = WrappedComponent
    Connect.displayName = displayName
    Connect.childContextTypes = childContextTypes
    Connect.contextTypes = contextTypes
    Connect.propTypes = contextTypes

    if (process.env.NODE_ENV !== 'production') {
      Connect.prototype.componentWillUpdate = function componentWillUpdate() {
        // We are hot reloading!
        if (this.version !== version) {
          this.version = version
          this.initSelector()

          if (this.subscription) this.subscription.tryUnsubscribe()
          this.initSubscription()
          if (shouldHandleStateChanges) this.subscription.trySubscribe()
        }
      }
    }

    return hoistStatics(Connect, WrappedComponent)
  }
}
