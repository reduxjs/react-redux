import hoistStatics from 'hoist-non-react-statics'
import invariant from 'invariant'
import PropTypes from 'prop-types'
import { Component, createElement } from 'react'

import { storeShape } from '../utils/PropTypes'

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
  const version = hotReloadingVersion++

  const contextTypes = {
    [storeKey]: storeShape,
    subscribeFirst: PropTypes.func,
  }
  const childContextTypes = {
    subscribeFirst: PropTypes.func,
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

        this.renderCount = 0
        this.result = {}
        this.state = {}
        this.version = version

        this.onStoreStateChange = this.onStoreStateChange.bind(this)
        this.setWrappedInstance = this.setWrappedInstance.bind(this)
        this.subscribe = this.subscribe.bind(this)

        this.initSelector()
      }

      getChildContext() {
        return {
          subscribeFirst: shouldHandleStateChanges
            ? this.subscribe
            : this.context.subscribeFirst
        }
      }

      componentDidMount() {
        // componentWillMount fires during server side rendering, but componentDidMount and
        // componentWillUnmount do not. Because of this, subscribe happens during ...didMount.
        // Otherwise, unsubscription would never take place during SSR, causing a memory leak.
        // To handle the case where a child component may have triggered a state change by
        // dispatching an action in its componentWillMount, we have to re-run the select and maybe
        // re-render.

        if (shouldHandleStateChanges) {
          this.subscribe()
          this.onStoreStateChange()
        }
      }

      componentWillReceiveProps(nextProps) {
        this.runSelector(nextProps)
      }

      shouldComponentUpdate() {
        return this.shouldUpdate
      }

      componentWillUnmount() {
        if (this.unsubscribe) this.unsubscribe()
        this.unsubscribe = null
        this.runSelector = noop
        this.shouldUpdate = false
      }

      getStore() {
        const store = this.props[storeKey] || this.context[storeKey]

        invariant(store,
          `Could not find "${storeKey}" in either the context or props of ` +
          `"${displayName}". Either wrap the root component in a <Provider>, ` +
          `or explicitly pass "${storeKey}" as a prop to "${displayName}".`
        )
      
        return store
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
        const store = this.getStore()
        const selector = selectorFactory(store.dispatch, selectorFactoryOptions)

        this.runSelector = (props) => {
          try {
            const nextProps = selector(store.getState(), props)

            if (nextProps !== this.result.props || this.result.error) {
              this.shouldUpdate = true
              this.result = { props: nextProps }
            }
          } catch (error) {
            this.shouldUpdate = true
            this.result = { error }
          }
        }

        this.runSelector(this.props)
      }

      isSubscribed() {
        return Boolean(this.unsubscribe)
      }

      subscribe() {
        if (!this.unsubscribe) { 
          if (this.context.subscribeFirst) this.context.subscribeFirst()
          this.unsubscribe = this.getStore().subscribe(this.onStoreStateChange)
        }
      }

      onStoreStateChange() {
        if (!this.unsubscribe) return

        this.setState((prevState, props) => {
          this.runSelector(props)
          return this.shouldUpdate ? {} : null
        });
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
        this.shouldUpdate = false
        const result = this.result

        if (result.error) {
          throw result.error
        } else {
          return createElement(WrappedComponent, this.addExtraProps(result.props))
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

          if (this.unsubscribe) this.unsubscribe();
          if (shouldHandleStateChanges) this.subscribe()
        }
      }
    }

    return hoistStatics(Connect, WrappedComponent)
  }
}
