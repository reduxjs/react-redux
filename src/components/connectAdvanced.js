import hoistStatics from 'hoist-non-react-statics'
import invariant from 'invariant'
import { Component, createElement } from 'react'
import { polyfill } from 'react-lifecycles-compat'
import shallowEqual from '../utils/shallowEqual'

import Subscription from '../utils/Subscription'
import { storeShape, subscriptionShape } from '../utils/PropTypes'

let hotReloadingVersion = 0
function noop() {}

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
    [subscriptionKey]: subscriptionShape,
  }
  const childContextTypes = {
    [subscriptionKey]: subscriptionShape,
  }

  return function wrapWithConnect(WrappedComponent) {
    invariant(
      typeof WrappedComponent == 'function',
      `You must pass a component to the function returned by ` +
      `${methodName}. Instead received ${JSON.stringify(WrappedComponent)}`
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
        this.renderCount = 0
        const store = props[storeKey] || context[storeKey]
        this.propsMode = Boolean(props[storeKey])
        this.setWrappedInstance = this.setWrappedInstance.bind(this)

        invariant(store,
          `Could not find "${storeKey}" in either the context or props of ` +
          `"${displayName}". Either wrap the root component in a <Provider>, ` +
          `or explicitly pass "${storeKey}" as a prop to "${displayName}".`
        )
        const storeState = store.getState()

        const childPropsSelector = this.createChildSelector(store)
        this.state = {
          props,
          childPropsSelector,
          childProps: {},
          store,
          storeState,
          error: null,
          subscription: null,
          lastSub: null,
          notifyNestedSubs: noop
        }
        this.state = {
          ...this.state,
          ...Connect.getChildPropsState(props, this.state)
        }
      }

      static getChildPropsState(props, state) {
        try {
          const nextProps = state.childPropsSelector(state.store.getState(), props)
          if (nextProps === state.childProps) return null
          return { childProps: nextProps }
        } catch (error) {
          return { error }
        }
      }

      static getDerivedStateFromProps(props, state) {
        let ret = null
        if (state.lastSub !== state.subscription) {
          ret = { lastSub: state.subscription }
          if (shallowEqual(props, state.props) || state.error) {
            return ret
          }
        }
        if ((connectOptions.pure && shallowEqual(props, state.props)) || state.error) return ret
        const nextChildProps = Connect.getChildPropsState(props, state)
        return {
          ...nextChildProps,
          props,
          lastSub: state.subscription
        }
      }

      getChildContext() {
        // If this component received store from props, its subscription should be transparent
        // to any descendants receiving store+subscription from context; it passes along
        // subscription passed to it. Otherwise, it shadows the parent subscription, which allows
        // Connect to control ordering of notifications to flow top-down.
        const subscription = this.propsMode ? null : this.state.subscription
        return { [subscriptionKey]: subscription || this.context[subscriptionKey] }
      }

      componentDidMount() {
        return this.updateSubscription()
      }

      shouldComponentUpdate(_, nextState) {
        if (!connectOptions.pure) {
          return true
        }
        return nextState.childProps !== this.state.childProps || nextState.error
      }

      componentWillUnmount() {
        if (this.state.subscription) this.state.subscription.tryUnsubscribe()
        this.isUnmounted = true
        this.setState({
          subscription: null,
          store: null,
          notifyNestedSubs: noop
        })
      }

      updateSubscription() {
        if (!shouldHandleStateChanges) return

        this.setState(state => {
          if (state.subscription) return null
          // parentSub's source should match where store came from: props vs. context. A component
          // connected to the store via props shouldn't use subscription from context, or vice versa.
          const parentSub = (this.propsMode ? this.props : this.context)[subscriptionKey]
          const subscription = new Subscription(this.state.store, parentSub, this.updateChildPropsFromReduxStore.bind(this))
          subscription.trySubscribe()
          return {
            subscription,
            lastSub: state.subscription,

            // `notifyNestedSubs` is duplicated to handle the case where the component is  unmounted in
            // the middle of the notification loop, where `this.state.subscription` will then be null. An
            // extra null check every change can be avoided by copying the method onto `this` and then
            // replacing it with a no-op on unmount. This can probably be avoided if Subscription's
            // listeners logic is changed to not call listeners that have been unsubscribed in the
            // middle of the notification loop.
            notifyNestedSubs: subscription.notifyNestedSubs.bind(subscription)
          }
        }, () => {
          // componentWillMount fires during server side rendering, but componentDidMount and
          // componentWillUnmount do not. Because of this, trySubscribe happens during ...didMount.
          // Otherwise, unsubscription would never take place during SSR, causing a memory leak.
          // To handle the case where a child component may have triggered a state change by
          // dispatching an action in its componentWillMount, we have to re-run the select and maybe
          // re-render.
          this.updateChildPropsFromReduxStore(false)
        })
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

      createChildSelector(store = this.state.store) {
        return selectorFactory(store.dispatch, selectorFactoryOptions)
      }

      updateChildPropsFromReduxStore(notify = true) {
        if (this.isUnmounted) {
          return
        }

        this.setState(prevState => {
          const nextState = this.state.store.getState()
          if (nextState === prevState.storeState) {
            return null
          }
          const childPropsState = Connect.getChildPropsState(this.props, {
              ...this.state,
              storeState: nextState
            })
          const ret = {
            storeState: nextState,
            ...childPropsState
          }
          if (notify && childPropsState === null) {
            this.state.notifyNestedSubs()
          }
          return ret
        }, () => {
          if (notify) this.state.notifyNestedSubs()
        })
      }

      isSubscribed() {
        return Boolean(this.state.subscription) && this.state.subscription.isSubscribed()
      }

      addExtraProps(props) {
        if (!withRef && !renderCountProp && !(this.propsMode && this.state.subscription)) return props
        // make a shallow copy so that fields added don't leak to the original selector.
        // this is especially important for 'ref' since that's a reference back to the component
        // instance. a singleton memoized selector would then be holding a reference to the
        // instance, preventing the instance from being garbage collected, and that would be bad
        const withExtras = { ...props }
        if (withRef) withExtras.ref = this.setWrappedInstance
        if (renderCountProp) withExtras[renderCountProp] = this.renderCount++
        if (this.propsMode && this.state.subscription) withExtras[subscriptionKey] = this.state.subscription
        return withExtras
      }

      render() {
        if (this.state.error) {
          throw this.state.error
        } else {
          return createElement(WrappedComponent, this.addExtraProps(this.state.childProps))
        }
      }
    }

    Connect.WrappedComponent = WrappedComponent
    Connect.displayName = displayName
    Connect.childContextTypes = childContextTypes
    Connect.contextTypes = contextTypes
    Connect.propTypes = contextTypes
    polyfill(Connect)

    if (process.env.NODE_ENV !== 'production') {
      Connect.prototype.componentDidUpdate = function componentDidUpdate() {
        // We are hot reloading!
        if (this.version !== version) {
          this.version = version

          // If any connected descendants don't hot reload (and resubscribe in the process), their
          // listeners will be lost when we unsubscribe. Unfortunately, by copying over all
          // listeners, this does mean that the old versions of connected descendants will still be
          // notified of state changes; however, their updateChildPropsFromReduxStore function is a no-op so this
          // isn't a huge deal.
          let oldListeners = [];

          if (this.state.subscription) {
            oldListeners = this.state.subscription.listeners.get()
            this.state.subscription.tryUnsubscribe()
          }
          if (shouldHandleStateChanges) {
           //this.state.subscription.trySubscribe()
            this.updateSubscription()
            oldListeners.forEach(listener => this.state.subscription.listeners.subscribe(listener))
          }

          const childPropsSelector = this.createChildSelector()
          const childProps = childPropsSelector(this.props, this.state.storeState)
          this.setState({ childPropsSelector, childProps })
        } else {
          this.updateSubscription()
        }
      }
    } else {
      Connect.prototype.componentDidUpdate = Connect.prototype.updateSubscription
    }

    return hoistStatics(Connect, WrappedComponent)
  }
}
