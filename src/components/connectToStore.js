import hoistStatics from 'hoist-non-react-statics'
import invariant from 'invariant'
import { Component, createElement } from 'react'
import {
  createSelector,
  createSelectorCreator,
  createStructuredSelector,
  defaultMemoize
} from 'reselect'

import shallowEqual from '../utils/shallowEqual'
import storeShape from '../utils/storeShape'

export { createSelector as createSelector }
export { createStructuredSelector as createStructuredSelector }
export const createShallowEqualSelector = createSelectorCreator(defaultMemoize, shallowEqual)

export const selectDispatch = (_, __, dispatch) => dispatch

export function dispatchable(actionCreator, ...selectorsToPartiallyApply) {
  if (selectorsToPartiallyApply.length === 0) {
    return createSelector(
      selectDispatch,
      dispatch => (...args) => dispatch(actionCreator(...args))
    )
  }

  return createSelector(
    selectDispatch,
    ...selectorsToPartiallyApply,
    (dispatch, ...partialArgs) => (...args) => dispatch(actionCreator(...partialArgs, ...args))
  )
}

let hotReloadingVersion = 0

export default function connectToStore(
  /*
    this func is responsible for returning the selector function used to compute new props from
    state, props, and dispatch. For example:

      export default connectToStore(() => (state, props, dispatch) => ({
        thing: state.things[props.thingId],
        saveThing: fields => dispatch(actionCreators.saveThing(props.thingId, fields)),
      }))(YourComponent)

    Alternatively, it can return a plain object which will be passed to reselect's
    'createStructuredSelector' function to create the selector. For example:

      return connectToStore(() => ({
        thing: (state, props) => state.things[props.thingId],
        saveThing: (_, props, dispatch) => fields => (
          dispatch(actionCreators.saveThing(props.thingId, fields))
        ),
      }))(YourComponent)

    This is equivalent to wrapping the returned object in a call to `createStructuredSelector`,
    but is supported as a convenience; This is the recommended approach to defining your
    selectorFactory methods. The above example can be simplfied by using the `dispatchable` helper
    method provided with connectToStore:

      connectToStore(() => ({
        thing: (state, props) => state.things[props.thingId],
        saveThing: dispatchable(actionCreators.saveThing, (_, props) => props.thingId),
      }))(YourComponent)

    A verbose but descriptive name for `dispatchable` would be `createBoundActionCreatorSelector`.
    `dispatchable` will return a selector that binds the passed action creator arg to dispatch. Any
    additional args given will be treated as selectors whose results should be partially applied to
    the action creator.
  */
  selectorFactory,
  // options object:
  {
    // the func used to compute this HOC's displayName from the wrapped component's displayName.
    getDisplayName = name => `connectToStore(${name})`,

    // if true, shouldComponentUpdate will only be true of the selector recomputes for nextProps.
    // if false, shouldComponentUpdate will always be true.
    pure = true,

    // the name of the property passed to the wrapped element indicating the number of.
    // recomputations since it was mounted. useful for watching for unnecessary re-renders.
    recomputationsProp = process.env.NODE_ENV !== 'production' ? '__recomputations' : null,

    // if true, the props passed to this HOC are merged with the results of the selector; in the
    // case of key collision, selector value is kept and prop is discared. if false, only the
    // selector results are passed to the wrapped element.
    shouldIncludeOriginalProps = true,

    // if true, the selector receieves the current store state as the first arg, and this HOC
    // subscribes to store changes. if false, null is passed as the first arg of selector.
    shouldUseState = true,

    // the key of props/context to get the store
    storeKey = 'store',

    // if true, the wrapped element is exposed by this HOC via the getWrappedInstance() function.
    withRef = false
  } = {}
) {
  function buildSelector() {
    const { displayName, store } = this
    const factoryResult = selectorFactory({ displayName })
    const ref = withRef ? 'wrappedInstance' : undefined
    const empty = {}

    const selector = createShallowEqualSelector(
      // original props selector:
      shouldIncludeOriginalProps
        ? ((_, props) => props)
        : (() => empty),

      // sourceSelector
      typeof factoryResult === 'function'
        ? factoryResult
        : createStructuredSelector(factoryResult),

      // combine original props + selector props + ref
      (props, sourceSelectorResults) => ({
        ...props,
        ...sourceSelectorResults,
        ref
      }))

    return function runSelector(props) {
      const recomputationsBefore = selector.recomputations()
      const storeState = shouldUseState ? store.getState() : null
      const selectorResults = selector(storeState, props, store.dispatch)
      const recomputationsAfter = selector.recomputations()

      const finalProps = recomputationsProp
        ? { ...selectorResults, [recomputationsProp]: recomputationsAfter }
        : selectorResults

      return {
        props: finalProps,
        shouldUpdate: recomputationsBefore !== recomputationsAfter
      }
    }
  }

  const version = hotReloadingVersion++

  return function wrapWithConnect(WrappedComponent) {
    class Connect extends Component {
      constructor(props, context) {
        super(props, context)
        this.state = {}
      }

      componentWillMount() {
        this.version = version
        this.displayName = Connect.displayName
        this.store = this.props[storeKey] || this.context[storeKey]

        invariant(this.store,
          `Could not find "store" in either the context or ` +
          `props of "${Connect.displayName}". ` +
          `Either wrap the root component in a <Provider>, ` +
          `or explicitly pass "store" as a prop to "${Connect.displayName}".`
        )

        this.selector = buildSelector.call(this)
        this.trySubscribe()
      }

      shouldComponentUpdate(nextProps) {
        return !pure || this.selector(nextProps).shouldUpdate
      }

      componentWillUnmount() {
        if (this.unsubscribe) this.unsubscribe()
        this.unsubscribe = null
        this.selector = () => ({ props: {}, shouldUpdate: false })
        this.store = null
      }

      getWrappedInstance() {
        invariant(withRef,
          `To access the wrapped instance, you need to specify ` +
          `{ withRef: true } as the fourth argument of the connect() call.`
        )

        return this.refs.wrappedInstance
      }

      trySubscribe() {
        if (!shouldUseState || this.unsubscribe) return

        let storeUpdates = 0
        this.unsubscribe = this.store.subscribe(() => {
          if (this.unsubscribe) this.setState({ storeUpdates: storeUpdates++ })
        })
      }

      isSubscribed() {
        return typeof this.unsubscribe === 'function'
      }

      render() {
        const { props } = this.selector(this.props)
        return createElement(WrappedComponent, props)
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
        if (this.version === version) return

        // We are hot reloading!
        this.version = version
        this.trySubscribe()
        this.selector = buildSelector.call(this)
      }
    }

    return hoistStatics(Connect, WrappedComponent)
  }
}
