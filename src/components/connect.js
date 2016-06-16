import isPlainObject from 'lodash/isPlainObject'
import { bindActionCreators } from 'redux'
import { createSelector } from 'reselect'

import connectAdvanced from './connectAdvanced'
import createShallowEqualSelector from '../utils/createShallowEqualSelector'
import warning from '../utils/warning'

const defaultMergeProps = (stateProps, dispatchProps, ownProps) => ({
  ...ownProps,
  ...stateProps,
  ...dispatchProps
})

const empty = {}

function verify(displayName, methodName, selector) {
  return (...args) => {
    const props = selector(...args)
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
  function getStatePropsSelector(ownPropsSelector) {
    const mstp = mapStateIsFactory ? mapStateToProps() : mapStateToProps

    if (!mstp) {
      return () => empty
    }

    if (!pure) {
      return (state, props) => mstp(state, props)
    }

    if (mapStateToProps.length === 1) {
      return createSelector(state => state, mstp)
    }

    return createSelector(state => state, ownPropsSelector, mstp)
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

    if (!pure) {
      return (_, props, dispatch) => mdtp(dispatch, props)
    }

    if (mapDispatchToProps.length === 1) {
      return createSelector((_, __, dispatch) => dispatch, mdtp)
    }

    return createSelector((_, __, dispatch) => dispatch, ownPropsSelector, mdtp)
  }

  function selectorFactory({ displayName }) {
    const ownPropsSelector = createShallowEqualSelector((_, props) => props, props => props)

    return verify(displayName, 'mergeProps', createShallowEqualSelector(
      verify(displayName, 'mapStateToProps', getStatePropsSelector(ownPropsSelector)),
      verify(displayName, 'mapDispatchToProps', getDispatchPropsSelector(ownPropsSelector)),
      ownPropsSelector,
      mergeProps || defaultMergeProps
    ))
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
