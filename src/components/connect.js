import isPlainObject from 'lodash/isPlainObject'
import { bindActionCreators } from 'redux'
import { createSelector, createSelectorCreator, defaultMemoize } from 'reselect'

import connectAdvanced from './connectAdvanced'
import createShallowEqualSelector from '../utils/createShallowEqualSelector'
import warning from '../utils/warning'

const defaultMergeProps = (stateProps, dispatchProps, ownProps) => ({
  ...ownProps,
  ...stateProps,
  ...dispatchProps
})

const empty = {}

function verify(displayName, methodName, func) {
  if (process.env.NODE_ENV === 'production') return func

  return (...args) => {
    const props = func(...args)
    if (!isPlainObject(props)) {
      warning(
        `${methodName}() in ${displayName} must return a plain object. ` +
        `Instead received ${props}.`
      )
    }
    return props
  }
}

export default function connect(
  mapStateToProps,
  mapDispatchToProps,
  mergeProps,
  {
    pure = true,
    ...options
  } = {}
) {
  function createFactoryAwareSelector(selectFirstArg, ownPropsSelector, mapSomethingToProps) {
    const equalityCheck = pure
      ? ((a, b) => a === b)
      : ((a, b) => a === empty && b === empty)

    let map = mapSomethingToProps
    let proxy = (...args) => {
      const result = map(...args)
      if (typeof result !== 'function') return result
      map = result
      proxy = map
      return map(...args)
    }

    return createSelectorCreator(defaultMemoize, equalityCheck)(
      selectFirstArg,
      (...args) => map && map.length !== 1 ? ownPropsSelector(...args) : empty,
      (...args) => proxy(...args)
    )
  }

  function getStatePropsSelector(ownPropsSelector) {
    if (!mapStateToProps) {
      return () => empty
    }

    return createFactoryAwareSelector(
      state => state,
      ownPropsSelector,
      mapStateToProps  
    )
  }

  function getDispatchPropsSelector(ownPropsSelector) {
    if (!mapDispatchToProps) {
      return (_, __, dispatch) => ({ dispatch })
    }

    if (typeof mapDispatchToProps !== 'function') {
      return createSelector(
        (_, __, dispatch) => dispatch,
        dispatch => bindActionCreators(mapDispatchToProps, dispatch)
      )
    }

    return createFactoryAwareSelector(
      (_, __, dispatch) => dispatch,
      ownPropsSelector,
      mapDispatchToProps
    )
  }

  function selectorFactory({ displayName }) {
    const ownPropsSelector = createShallowEqualSelector((_, props) => props, props => props)

    return createShallowEqualSelector(
      verify(displayName, 'mapStateToProps', getStatePropsSelector(ownPropsSelector)),
      verify(displayName, 'mapDispatchToProps', getDispatchPropsSelector(ownPropsSelector)),
      ownPropsSelector,
      mergeProps
        ? verify(displayName, 'mergeProps', mergeProps)
        : defaultMergeProps
    )
  }

  return connectAdvanced(
    selectorFactory,
    {
      pure,
      getDisplayName: name => `Connect(${name})`,
      shouldIncludeRecomputationsProp: false,
      ...options,
      methodName: 'connect',
      shouldUseState: Boolean(mapStateToProps)
    }
  )
}
