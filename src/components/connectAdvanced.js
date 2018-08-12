import hoistStatics from 'hoist-non-react-statics'
import invariant from 'invariant'
import React, { Component, PureComponent } from 'react'
import * as propTypes from 'prop-types'
import shallowEqual from 'shallow-equals'

import { Consumer } from './Context'

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

    // the key of props/context to get the store [**does nothing, use consumer**]
    storeKey = false,

    // if true, the wrapped element is exposed by this HOC via the getWrappedInstance() function.
    withRef = false,

    // the context consumer to use
    consumer = Consumer,

    // additional options are passed through to the selectorFactory
    ...connectOptions
  } = {}
) {
  const subscriptionKey = storeKey + 'Subscription'
  const version = hotReloadingVersion++

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

    const FinalWrapper = connectOptions.pure ?
      class PureWrapper extends PureComponent {
        render() {
          return <WrappedComponent {...this.props} />
        }
      } : WrappedComponent

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

    class ReduxConsumer extends Component {
      constructor(props) {
        super(props)
        invariant(!props[storeKey],
          'storeKey is deprecated and does not do anything. To use a custom redux store for a single component, ' +
          'create a custom React context with React.createContext() and pass the Provider to react-redux\'s provider ' +
          'and the Consumer to this component as in <Provider context={context.Provider}><' +
          wrappedComponentName + ' consumer={context.Consumer} /></Provider>'
        )
        this.memoizedProps = this.makeMemoizer()
        this.renderWrappedComponent = this.renderWrappedComponent.bind(this)
      }

      makeMemoizer() {
        let lastProps
        let lastState
        let lastDerivedProps
        let lastStore
        let sourceSelector
        let called = false
        return (state, props, store) => {
          if (called) {
            const sameProps = connectOptions.pure && shallowEqual(lastProps, props)
            const sameState = lastState === state
            if (sameProps && sameState) {
              return lastDerivedProps
            }
          }
          if (store !== lastStore) {
            sourceSelector = selectorFactory(store.dispatch, selectorFactoryOptions)
          }
          lastStore = store
          called = true
          lastProps = props
          lastState = state
          const nextProps = sourceSelector(state, props)
          if (shallowEqual(lastDerivedProps, nextProps)) {
            return lastDerivedProps
          }
          lastDerivedProps = nextProps
          return lastDerivedProps
        }
      }

      addExtraProps(props) {
        if (!withRef && !renderCountProp && !(this.propsMode && this.subscription)) return props
        // make a shallow copy so that fields added don't leak to the original selector.
        // this is especially important for 'ref' since that's a reference back to the component
        // instance. a singleton memoized selector would then be holding a reference to the
        // instance, preventing the instance from being garbage collected, and that would be bad
        const withExtras = { ...props }
        if (withRef) withExtras.ref = this.setWrappedInstance
        if (renderCountProp) withExtras[renderCountProp] = this.renderCount++
        if (this.propsMode && this.subscription) withExtras[subscriptionKey] = this.subscription
        return withExtras
      }

      renderWrappedComponent(value) {
        invariant(value,
          `Could not find "store" in either the context of ` +
          `"${displayName}". Either wrap the root component in a <Provider>, ` +
          `or pass a custom React context provider to <Provider> and the corresponding ` +
          `React context consumer to ${displayName}.`
        )
        const { state, store } = value
        const derivedProps = this.memoizedProps(state, this.props, store)
        return <FinalWrapper {...derivedProps} />
      }

      render() {
        const MyConsumer = this.props.consumer || consumer
        return (
          <MyConsumer>
            {this.renderWrappedComponent}
          </MyConsumer>
        )
      }
    }

    class Connect extends Component {
      constructor(props, context) {
        super(props, context)

        this.version = version
        this.renderCount = 0
        this.propsMode = Boolean(props[storeKey])
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

      render() {
        return (
          <ReduxConsumer {...this.props} />
        )
      }
    }

    Connect.WrappedComponent = WrappedComponent
    Connect.displayName = displayName
    Connect.propTypes = {
      context: propTypes.object
    }

    if (false && process.env.NODE_ENV !== 'production') {
      Connect.prototype.componentDidUpdate = function componentDidUpdate() {
        // We are hot reloading!
        if (this.version !== version) {
          this.version = version

          // If any connected descendants don't hot reload (and resubscribe in the process), their
          // listeners will be lost when we unsubscribe. Unfortunately, by copying over all
          // listeners, this does mean that the old versions of connected descendants will still be
          // notified of state changes; however, their onStateChange function is a no-op so this
          // isn't a huge deal.
          let oldListeners = [];

          if (this.subscription) {
            oldListeners = this.subscription.listeners.get()
            this.subscription.tryUnsubscribe()
          }
          this.initSubscription()
          if (shouldHandleStateChanges) {
            this.subscription.trySubscribe()
            oldListeners.forEach(listener => this.subscription.listeners.subscribe(listener))
          }

          this.createSelector()
          this.triggerUpdateOnStoreStateChange()
        }
      }
    }

    return hoistStatics(Connect, WrappedComponent)
  }
}
