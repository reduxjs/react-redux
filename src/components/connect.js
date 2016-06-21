import connectAdvanced from './connectAdvanced'
import verifyPlainObject from '../utils/verifyPlainObject'
import { createFinalPropsComponents, createFinalPropsSelector } from '../selectors/getFinalProps'

export function wrapWithVerify(displayName, { getState, getDispatch, getOwnProps, mergeProps }) {
  return {
    getState: verifyPlainObject(displayName, 'mapStateToProps', getState),
    getDispatch: verifyPlainObject(displayName, 'mapDispatchToProps', getDispatch),
    getOwnProps,
    mergeProps: !mergeProps.isDefault
      ? verifyPlainObject(displayName, 'mergeProps', mergeProps)
      : mergeProps
  }
}

// create a connectAdvanced-compatible selectorFactory function that applies the results of
// mapStateToProps, mapDispatchToProps, and mergeProps
export function selectorFactory(options) {
  return createFinalPropsSelector(
    options.pure,
    wrapWithVerify(
      options.displayName,
      createFinalPropsComponents(options)
    )
  )
}

export function buildOptions(mapStateToProps, mapDispatchToProps, mergeProps, options) {
  return {
    getDisplayName: name => `Connect(${name})`,
    ...options,
    mapStateToProps,
    mapDispatchToProps,
    mergeProps, 
    methodName: 'connect',
    dependsOnState: Boolean(mapStateToProps)
  }
}

export default function connect() {
  return connectAdvanced(
    selectorFactory,
    buildOptions.apply(undefined, arguments)
  )
}
