import verifyPlainObject from '../utils/verifyPlainObject'

export function defaultMergeProps(stateProps, dispatchProps, ownProps) {
  return {
    ...ownProps,
    ...stateProps,
    ...dispatchProps
  }
}
defaultMergeProps.meta = { skipShallowEqual: true }

export function whenMergePropsIsMissing({ mergeProps }) {
  return mergeProps
    ? undefined
    : defaultMergeProps
}

export function whenMergePropsIsFunction({ mergeProps, displayName }) {
  if (typeof mergeProps !== 'function')
    return undefined

  let hasVerifiedOnce = false

  function mergePropsProxy(stateProps, dispatchProps, ownProps) {
    const mergedProps = mergeProps(stateProps, dispatchProps, ownProps)
    
    if (process.env.NODE_ENV !== 'production') {
      if (!hasVerifiedOnce) {
        hasVerifiedOnce = true
        verifyPlainObject(mergedProps, displayName, 'mergeProps')
      }
    }

    return mergedProps
  }
  mergePropsProxy.meta = mergeProps.meta || { skipShallowEqual: false }
  return mergePropsProxy
}

export default [
  whenMergePropsIsMissing,
  whenMergePropsIsFunction
]
