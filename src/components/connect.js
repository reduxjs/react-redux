import { flow } from 'lodash'

import connectAdvanced from './connectAdvanced'
import verifyPlainObject from '../utils/verifyPlainObject'
import { createFinalPropsSelector } from '../selectors/getFinalProps'
import { addGetOwnProps } from '../selectors/getOwnProps'
import { addGetDispatch, getDefaultMapDispatchFactories } from '../selectors/mapDispatch'
import { addGetState, getDefaultMapStateFactories } from '../selectors/mapState'
import { defaultMergeProps } from '../selectors/mergeProps'

export function wrapWithVerify({ getState, getDispatch, mergeProps, ...options }) {
  const verify = (methodName, func) => verifyPlainObject(options.displayName, methodName, func)
  return {
    ...options,
    getState: verify('mapStateToProps', getState),
    getDispatch: verify('mapDispatchToProps', getDispatch),
    mergeProps: verify('mergeProps', mergeProps)
  }
}

export function selectorFactory(options) {
  return flow(
    addGetOwnProps,
    addGetState,
    addGetDispatch,
    wrapWithVerify,
    createFinalPropsSelector
  )(options)
}

export function buildOptions(mapStateToProps, mapDispatchToProps, mergeProps, options) {
  return {
    getDisplayName: name => `Connect(${name})`,
    mapDispatchFactories: getDefaultMapDispatchFactories(),
    mapStateFactories: getDefaultMapStateFactories(),
    ...options,
    mapStateToProps,
    mapDispatchToProps,
    mergeProps: mergeProps || defaultMergeProps, 
    methodName: 'connect',
    dependsOnState: Boolean(mapStateToProps)
  }
}

export default function connect(...args) {
  const options = buildOptions(...args)
  return connectAdvanced(selectorFactory, options)
}
