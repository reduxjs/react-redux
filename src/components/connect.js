import isPlainObject from 'lodash/isPlainObject'
import { bindActionCreators } from 'redux'
import { createSelector } from 'reselect'
import warning from '../utils/warning'

import connectToStore, { createShallowEqualSelector } from './connectToStore'

const defaultMergeProps = (stateProps, dispatchProps, ownProps) => ({
  ...ownProps,
  ...stateProps,
  ...dispatchProps
})

const empty = {}

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
  function selectorFactory({ displayName }) {
    function checkStateShape(props, methodName) {
      if (!isPlainObject(props)) {
        warning(
          `${methodName}() in ${displayName} must return a plain object. ` +
          `Instead received ${props}.`
        )
      }
    }

    function verify(methodName, selector) {
      return (...args) => {
        const result = selector(...args)
        checkStateShape(result, methodName)
        return result
      }
    }

    const ownPropsSelector = createShallowEqualSelector(
      (_, props) => props,
      props => props
    )

    function getStatePropsSelector() {
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

    function getDispatchPropsSelector() {
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

    return verify('mergeProps', createShallowEqualSelector(
      verify('mapStateToProps', getStatePropsSelector()),
      verify('mapDispatchToProps', getDispatchPropsSelector()),
      ownPropsSelector,
      mergeProps || defaultMergeProps
    ))
  }

  return connectToStore(
    selectorFactory,
    {
      pure,
      getDisplayName: name => `Connect(${name})`,
      recomputationsProp: null,
      ...options,
      methodName: 'connect',
      shouldIncludeOriginalProps: !mergeProps,
      shouldUseState: Boolean(mapStateToProps)
    }
  )
}
