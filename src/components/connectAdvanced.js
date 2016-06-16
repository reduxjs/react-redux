import hoistStatics from 'hoist-non-react-statics'
import invariant from 'invariant'
import { Component, createElement } from 'react'

import createShallowEqualSelector from '../utils/createShallowEqualSelector'
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
    // the func used to compute this HOC's displayName from the wrapped component's displayName.
    getDisplayName = name => `ConnectAdvanced(${name})`,

    // shown in error messages
    methodName = 'connectAdvanced',

    // if true, shouldComponentUpdate will only be true of the selector recomputes for nextProps.
    // if false, shouldComponentUpdate will always be true.
    pure = true,

    // the name of the property passed to the wrapped element indicating the number of.
    // recomputations since it was mounted. useful for watching for unnecessary re-renders.
    recomputationsProp = '__recomputations',
    shouldIncludeRecomputationsProp = process.env.NODE_ENV !== 'production',

    // if true, the selector receieves the current store state as the first arg, and this HOC
    // subscribes to store changes. if false, null is passed as the first arg of selector.
    shouldUseState = true,

    // the key of props/context to get the store
    storeKey = 'store',

    // if true, the wrapped element is exposed by this HOC via the getWrappedInstance() function.
    withRef = false
  } = {}
) {
  function buildSelector({ displayName, store }) {
    // wrap the source selector in a shallow equals because props objects with
    // same properties are symantically equal to React... no need to re-render.
    const selector = createShallowEqualSelector(
      selectorFactory({ displayName, dispatch: store.dispatch }),
      result => result
    )

    return function runSelector(ownProps) {
      const before = selector.recomputations()
      const state = shouldUseState ? store.getState() : null
      const props = selector(state, ownProps, store.dispatch)
      const recomputations = selector.recomputations()

      return { props, recomputations, shouldUpdate: before !== recomputations }
    }
  }

  const version = hotReloadingVersion++

  return function wrapWithConnect(WrappedComponent) {
    class Connect extends Component {
      constructor(props, context) {
        super(props, context)
        this.state = { storeUpdates: 0 }
      }

      componentWillMount() {
        this.store = this.props[storeKey] || this.context[storeKey]
        invariant(this.store,
          `Could not find "${storeKey}" in either the context or ` +
          `props of "${Connect.displayName}". ` +
          `Either wrap the root component in a <Provider>, ` +
          `or explicitly pass "${storeKey}" as a prop to "${Connect.displayName}".`
        )

        this.init()
      }

      shouldComponentUpdate(nextProps) {
        return !pure || this.selector(nextProps).shouldUpdate
      }

      componentWillUnmount() {
        if (this.unsubscribe) this.unsubscribe()
        this.unsubscribe = null
        this.store = null
        this.selector = () => ({ props: {}, shouldUpdate: false })
      }

      init() {
        this.version = version
        
        this.selector = buildSelector({
          displayName: Connect.displayName,
          store: this.store
        })

        if (shouldUseState) {
          if (this.unsubscribe) this.unsubscribe()

          this.unsubscribe = this.store.subscribe(() => {
            if (this.unsubscribe) {
              this.setState(state => ({ storeUpdates: state.storeUpdates++ }))
            }
          })
        }
      }

      getWrappedInstance() {
        invariant(withRef,
          `To access the wrapped instance, you need to specify ` +
          `{ withRef: true } in the options argument of the ${methodName}() call.`
        )
        return this.wrappedInstance
      }

      isSubscribed() {
        return typeof this.unsubscribe === 'function'
      }

      render() {
        const { props, recomputations } = this.selector(this.props)
        
        return createElement(WrappedComponent, {
          ...props,
          ref: withRef ? (c => { this.wrappedInstance = c }) : undefined,
          [recomputationsProp]: shouldIncludeRecomputationsProp ? recomputations : undefined
        })
      }
    }

    const wrappedComponentName = WrappedComponent.displayName
      || WrappedComponent.name
      || 'Component'

    Connect.displayName = getDisplayName(wrappedComponentName)
    Connect.WrappedComponent = WrappedComponent
    Connect.contextTypes = { [storeKey]: storeShape }
    Connect.propTypes = { [storeKey]: storeShape }

    if (process.env.NODE_ENV !== 'production') {
      Connect.prototype.componentWillUpdate = function componentWillUpdate() {
        // We are hot reloading!
        if (this.version !== version) this.init()
      }
    }

    return hoistStatics(Connect, WrappedComponent)
  }
}
