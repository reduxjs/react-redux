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
    mapStateIsFactory,
    mapDispatchIsFactory,
    pure = true,
    ...options
  } = {}
) {
  const equalityCheck = pure
    ? ((a, b) => a === b)
    : ((a, b) => a === empty && b === empty)

  function getStatePropsSelector(ownPropsSelector) {
    const mstp = mapStateIsFactory ? mapStateToProps() : mapStateToProps

    if (!mstp) {
      return () => empty
    }

    return createSelectorCreator(defaultMemoize, equalityCheck)(
      state => state,
      (...args) => mstp && mstp.length !== 1 ? ownPropsSelector(...args) : empty,
      mstp
    )
  }

  function getDispatchPropsSelector(ownPropsSelector) {
    const mdtp = mapDispatchIsFactory ? mapDispatchToProps() : mapDispatchToProps

    if (!mdtp) {
      return (_, __, dispatch) => ({ dispatch })
    }

    if (typeof mdtp !== 'function') {
      return createSelector(
        (_, __, dispatch) => dispatch,
        dispatch => bindActionCreators(mdtp, dispatch)
      )
    }

    return createSelectorCreator(defaultMemoize, equalityCheck)(
      (_, __, dispatch) => dispatch,
      (...args) => mdtp && mdtp.length !== 1 ? ownPropsSelector(...args) : empty,
      mdtp
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
