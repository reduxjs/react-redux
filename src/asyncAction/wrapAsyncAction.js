import { fetchConstants } from './constants'

export const wrapAsyncAction = asyncAction => actionArgs => (
  dispatch,
  getState
) => {
  const pending = suspender => ({
    type: fetchConstants.FETCH_PENDING,
    suspender
  })
  const success = result => ({ type: fetchConstants.FETCH_SUCCESS, result })
  const error = error => ({ type: fetchConstants.FETCH_FAILURE, error })

  dispatch(
    pending(
      dispatch(asyncAction(actionArgs)).then(
        r => dispatch(success(r)),
        e => dispatch(error(e))
      )
    )
  )

  return {
    read() {
      const { reactReduxFetcher: state } = getState()
      switch (state.status) {
        case fetchConstants.FETCH_PENDING:
          throw state.suspender
        case fetchConstants.FETCH_SUCCESS:
          return state.result
        case fetchConstants.FETCH_FAILURE:
          throw error
        default:
          return state
      }
    }
  }
}
