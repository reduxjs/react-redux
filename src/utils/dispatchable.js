import { createSelector } from 'reselect'

export const selectDispatch = (_, __, dispatch) => dispatch

export default function dispatchable(actionCreator, ...selectorsToPartiallyApply) {
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
