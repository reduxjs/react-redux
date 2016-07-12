
export function defaultMergeProps(stateProps, dispatchProps, ownProps) {
  return {
    ...ownProps,
    ...stateProps,
    ...dispatchProps
  }
}
defaultMergeProps.meta = { skipShallowEqual: true }
