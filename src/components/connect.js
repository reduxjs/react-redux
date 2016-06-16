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
    pure = true,
    withRef = false
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
      if (!mapStateToProps) return () => empty

      if (!pure) {
        return (state, props) => mapStateToProps(state, props)
      }

      if (mapStateToProps.length === 1) {
        return createSelector(
          state => state,
          mapStateToProps
        )
      }

      return createSelector(
        state => state,
        ownPropsSelector,
        mapStateToProps
      )
    }

    function getDispatchPropsSelector() {
      if (!mapDispatchToProps) return (_, __, dispatch) => ({ dispatch })

      if (typeof mapDispatchToProps !== 'function') {
        return createSelector(
          (_, __, dispatch) => dispatch,
          dispatch => bindActionCreators(mapDispatchToProps, dispatch)
        )
      }

      if (!pure) {
        return (_, props, dispatch) => mapDispatchToProps(dispatch, props)
      }

      if (mapDispatchToProps.length === 1) {
        return createSelector(
          (_, __, dispatch) => dispatch,
          mapDispatchToProps
        )
      }

      return createSelector(
        (_, __, dispatch) => dispatch,
        ownPropsSelector,
        mapDispatchToProps
      )
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
      withRef,
      getDisplayName: name => `Connect(${name})`,
      recomputationsProp: null,
      shouldIncludeOriginalProps: !mergeProps,
      shouldUseState: Boolean(mapStateToProps)
    }
  )
}
