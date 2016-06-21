import hoistStatics from 'hoist-non-react-statics'
import invariant from 'invariant'
import { Component, PropTypes, createElement } from 'react'

import Subscription from '../utils/Subscription'
import defaultBuildSelector from '../utils/buildSelector'
import storeShape from '../utils/storeShape'

let hotReloadingVersion = 0
export default function connectAdvanced(
  /*
    selectorFactory is a func is responsible for returning the selector function used to compute new
    props from state, props, and dispatch. For example:

      export default connectAdvanced(() => (state, props, dispatch) => ({
        thing: state.things[props.thingId],
        saveThing: fields => dispatch(actionCreators.saveThing(props.thingId, fields)),
      }))(YourComponent)
  */
  selectorFactory,
  // options object:
  {
    // this is the function that invokes the selectorFactory and enhances it with a few important
    // behaviors. you probably want to leave this alone unless you've read and understand the source
    // for components/connectAdvanced.js and utils/buildSelector.js, then maybe you can use this as
    // an injection point for custom behavior, for example hooking in some custom devtools.
    buildSelector = defaultBuildSelector,

    // if true, the selector receieves the current store state as the first arg, and this HOC
    // subscribes to store changes during componentDidMount. if false, null is passed as the first
    // arg of selector and store.subscribe() is never called.
    dependsOnState = true,

    // the func used to compute this HOC's displayName from the wrapped component's displayName.
    // probably overridden by wrapper functions such as connect()
    getDisplayName = name => `ConnectAdvanced(${name})`,

    // shown in error messages
    // probably overridden by wrapper functions such as connect()
    methodName = 'connectAdvanced',

    // if true, shouldComponentUpdate will only be true of the selector recomputes for nextProps.
    // if false, shouldComponentUpdate will always be true.
    pure = true,

    // if defined, the name of the property passed to the wrapped element indicating the number of
    // recomputations since it was mounted. useful for watching in react devtools for unnecessary
    // re-renders.
    recomputationsProp = undefined,

    // the key of props/context to get the store
    storeKey = 'store',

    // if true, the wrapped element is exposed by this HOC via the getWrappedInstance() function.
    withRef = false,

    ...connectOptions
  } = {}
) {
  const subscriptionKey = storeKey + 'Subscription'
  const version = hotReloadingVersion++

  return function wrapWithConnect(WrappedComponent) {
    class Connect extends Component {
      constructor(props, context) {
        super(props, context)

        this.version = version
        this.state = {}
        this.store = this.props[storeKey] || this.context[storeKey]
        this.parentSub = this.props[subscriptionKey] || this.context[subscriptionKey]

        invariant(this.store,
          `Could not find "${storeKey}" in either the context or ` +
          `props of "${Connect.displayName}". ` +
          `Either wrap the root component in a <Provider>, ` +
          `or explicitly pass "${storeKey}" as a prop to "${Connect.displayName}".`
        )

        this.initSelector()
        this.initSubscription()
      }

      getChildContext() {
        return { [subscriptionKey]: this.subscription }
      }

      componentDidMount() {
        if (!dependsOnState) return

        this.subscription.trySubscribe()

        // check for recomputations that happened after this component has rendered, such as
        // when a child component dispatches an action in its componentWillMount
        if (this.lastRenderedProps !== this.selector(this.props)) {
          this.forceUpdate()
        }
      }

      shouldComponentUpdate(nextProps) {
        return !pure || this.lastRenderedProps !== this.selector(nextProps)
      }

      componentWillUnmount() {
        this.subscription.tryUnsubscribe()
        // these are just to guard against extra memory leakage if a parent element doesn't
        // dereference this instance properly, such as an async callback that never finishes
        this.subscription = { isSubscribed: () => false }
        this.store = null
        this.parentSub = null
        this.selector = () => this.lastRenderedProps
      }

      getWrappedInstance() {
        invariant(withRef,
          `To access the wrapped instance, you need to specify ` +
          `{ withRef: true } in the options argument of the ${methodName}() call.`
        )
        return this.wrappedInstance
      }

      initSelector() {
        this.lastRenderedProps = null

        this.selector = buildSelector({
          ...connectOptions,
          displayName: Connect.displayName,
          dispatch: this.store.dispatch,
          getState: dependsOnState ? this.store.getState : (() => null),
          ref: withRef ? (ref => { this.wrappedInstance = ref }) : undefined,
          WrappedComponent,
          selectorFactory,
          recomputationsProp,
          methodName,
          pure,
          dependsOnState,
          storeKey,
          withRef
        })
      }

      initSubscription() {
        this.subscription = new Subscription(
          this.store,
          this.parentSub,
          this.onStateChange.bind(this)
        )
      }

      isSubscribed() {
        return this.subscription.isSubscribed()
      }

      onStateChange(callback) {
        if (dependsOnState && this.shouldComponentUpdate(this.props)) {
          this.setState({}, callback)
        } else {
          callback()
        }
      }

      render() {
        return createElement(
          WrappedComponent,
          this.lastRenderedProps = this.selector(this.props)
        )
      }
    }

    const wrappedComponentName = WrappedComponent.displayName
      || WrappedComponent.name
      || 'Component'

    Connect.displayName = getDisplayName(wrappedComponentName)
    Connect.WrappedComponent = WrappedComponent
    
    Connect.propTypes = {
      [storeKey]: storeShape,
      [subscriptionKey]: PropTypes.instanceOf(Subscription)
    }
    Connect.contextTypes = {
      [storeKey]: storeShape,
      [subscriptionKey]: PropTypes.instanceOf(Subscription)
    }
    Connect.childContextTypes = {
      [subscriptionKey]: PropTypes.instanceOf(Subscription).isRequired
    }

    if (process.env.NODE_ENV !== 'production') {
      Connect.prototype.componentWillUpdate = function componentWillUpdate() {
        // We are hot reloading!
        if (this.version !== version) {
          this.version = version
          this.initSelector()

          this.subscription.tryUnsubscribe()
          this.initSubscription()
          if (dependsOnState) this.subscription.trySubscribe()
        }
      }
    }

    return hoistStatics(Connect, WrappedComponent)
  }
}
