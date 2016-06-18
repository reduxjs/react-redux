import { bindActionCreators } from 'redux'
import { createSelector, createSelectorCreator, defaultMemoize } from 'reselect'

import connectAdvanced from './connectAdvanced'
import shallowEqual from '../utils/shallowEqual'
import verifyPlainObject from '../utils/verifyPlainObject'

const createShallowSelector = createSelectorCreator(defaultMemoize, shallowEqual)

export function getOwnPropsSelector(pure) {
  return pure
    ? createShallowSelector((_, props) => props, props => props)
    : ((_, props) => props)
}


// used by getStatePropsSelector and getDispatchPropsSelector to create a memoized selector function
// based on the given mapStateOrDispatchToProps function. It also detects if that function is a
// factory based on its first returned result.
// if not pure, then results should always be recomputed (except if it's ignoring prop changes)
export function createFactoryAwareSelector(
  pure,
  ownPropsSelector,
  selectStateOrDispatch,
  mapStateOrDispatchToProps
) {
  // propsSelector. if the map function only takes 1 arg, it shouldn't recompute results for props
  // changes. since this depends on map, which is mutable, propsSelector must be recomputed when
  // map changes
  const noProps = {}
  const getPropsSelector = func => (func.length !== 1 ? ownPropsSelector : (() => noProps))
  let propsSelector = getPropsSelector(mapStateOrDispatchToProps)

  // factory detection. if the first result of mapSomethingToProps is a function, use that as the
  // true mapSomethingToProps
  let map = mapStateOrDispatchToProps
  let mapProxy = (...args) => {
    const result = map(...args)
    if (typeof result === 'function') {
      map = result
      propsSelector = getPropsSelector(map)
      mapProxy = map
      return map(...args)
    } else {
      mapProxy = map
      return result
    }
  }
  
  if (pure) {
    return createSelector(
      selectStateOrDispatch,
      propsSelector,
      (...args) => mapProxy(...args)
    )
  } else {
    return (...args) => mapProxy(
      selectStateOrDispatch(...args),
      propsSelector(...args)
    )
  }
}


// normalizes the possible values of mapStateToProps into a selector
export function getStatePropsSelector(pure, ownPropsSelector, mapStateToProps) {
  if (!mapStateToProps) {
    const empty = {}
    return () => empty
  }

  return createFactoryAwareSelector(
    pure,
    ownPropsSelector,
    state => state,
    mapStateToProps
  )
}


// normalizes the possible values of mapDispatchToProps into a selector
export function getDispatchPropsSelector(pure, ownPropsSelector, mapDispatchToProps, dispatch) {
  if (!mapDispatchToProps) {
    const dispatchProps = { dispatch }
    return () => dispatchProps
  }

  if (typeof mapDispatchToProps !== 'function') {
    const bound = bindActionCreators(mapDispatchToProps, dispatch)
    return () => bound
  }

  return createFactoryAwareSelector(
    pure,
    ownPropsSelector,
    () => dispatch,
    mapDispatchToProps
  )
}


// merges the 3 props selectors into a final selector.
const defaultMergeProps = (state, dispatch, own) => ({ ...own, ...state, ...dispatch })
export function getMergedPropsSelector(
  displayName,
  statePropsSelector,
  dispatchPropsSelector,
  ownPropsSelector,
  mergeProps
) {
  return createShallowSelector(
    verifyPlainObject(displayName, 'mapStateToProps', statePropsSelector),
    verifyPlainObject(displayName, 'mapDispatchToProps', dispatchPropsSelector),
    ownPropsSelector,
    mergeProps
      ? verifyPlainObject(displayName, 'mergeProps', mergeProps)
      : defaultMergeProps
  )
}

// create a connectAdvanced-compatible selectorFactory function that applies the results of
// mapStateToProps, mapDispatchToProps, and mergeProps
export function makeSelectorFactory(mapStateToProps, mapDispatchToProps, mergeProps) {
  return function selectorFactory({ dispatch, displayName, pure }) {
    const ownPropsSelector = getOwnPropsSelector(pure)

    return getMergedPropsSelector(
      displayName,
      getStatePropsSelector(pure, ownPropsSelector, mapStateToProps),
      getDispatchPropsSelector(pure, ownPropsSelector, mapDispatchToProps, dispatch),
      ownPropsSelector,
      mergeProps
    )
  }
}

export default function connect(
  mapStateToProps,
  mapDispatchToProps,
  mergeProps,
  options
) {
  return connectAdvanced(
    makeSelectorFactory(mapStateToProps, mapDispatchToProps, mergeProps),
    {
      getDisplayName: name => `Connect(${name})`,
      ...options,
      methodName: 'connect',
      dependsOnState: Boolean(mapStateToProps)
    }
  )
}
