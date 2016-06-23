import hoistStatics from 'hoist-non-react-statics'
import invariant from 'invariant'
import { Component, PropTypes, createElement } from 'react'

import { memoizeFinalPropsSelector } from '../selectors/getFinalProps'
import Subscription from '../utils/Subscription'
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
        this.setWrappedInstance = this.setWrappedInstance.bind(this)

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
      setWrappedInstance(ref) {
        this.wrappedInstance = ref
      }

      initSelector() {
        this.lastRenderedProps = null
        this.recomputations = 0

        function addExtraProps(props) {
          if (!withRef && !recomputationsProp) return props
          // make a shallow copy so that fields added don't leak to the original selector.
          // this is especially important for 'ref' since that's a reference back to the component
          // instance. a singleton memoized selector would then be holding a reference to the
          // instance, preventing the instance from being garbage collected, and that would be bad
          const result = { ...props }
          if (withRef) result.ref = this.setWrappedInstance
          if (recomputationsProp) result[recomputationsProp] = this.recomputations++
          return result
        }

        const sourceSelector = selectorFactory({
          // most options passed to connectAdvanced are passed along to the selectorFactory
          dependsOnState, methodName, pure, storeKey, withRef, ...connectOptions,
          // useful for factories that want to bind action creators outside the selector
          dispatch: this.store.dispatch,
          // useful for error messages
          displayName: Connect.displayName,
          // useful if a factory wants to use attributes of the component to build the selector,
          // for example: one could use its propTypes as a props whitelist
          WrappedComponent
        })

        const memoizedSelector = memoizeFinalPropsSelector(
          sourceSelector,
          addExtraProps.bind(this)
        )

        this.selector = function selector(ownProps) {
          const state = dependsOnState ? this.store.getState() : null
          return memoizedSelector(state, ownProps, this.store.dispatch)
        }
      }

      initSubscription() {
        function onStoreStateChange(notifyNestedSubs) {
          if (dependsOnState && this.shouldComponentUpdate(this.props)) {
            this.setState({}, notifyNestedSubs)
          } else {
            notifyNestedSubs()
          }
        }

        this.subscription = new Subscription(
          this.store,
          this.parentSub,
          onStoreStateChange.bind(this)
        )
      }

      isSubscribed() {
        return this.subscription.isSubscribed()
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
