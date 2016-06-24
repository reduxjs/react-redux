import flow from 'lodash/flow'

import connectAdvanced from './connectAdvanced'
import verifyPlainObject from '../utils/verifyPlainObject'
import { createFinalPropsSelector } from '../selectors/getFinalProps'
import defaultMapDispatchFactories from '../selectors/mapDispatch'
import defaultMapStateFactories from '../selectors/mapState'
import { defaultMergeProps } from '../selectors/mergeProps'

export function addStateAndDispatchSelectors(options) {
  function match(factories) {
    for (let i = factories.length - 1; i >= 0; i--) {
      const selector = factories[i](options)
      if (selector) return selector
    }
    return undefined
  }

  return {
    ...options,
    getState: match(options.mapStateFactories),
    getDispatch: match(options.mapDispatchFactories)
  }
}

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
    addStateAndDispatchSelectors,
    wrapWithVerify,
    createFinalPropsSelector
  )(options)
}

export function buildOptions(mapStateToProps, mapDispatchToProps, mergeProps, options) {
  return {
    getDisplayName: name => `Connect(${name})`,
    mapDispatchFactories: defaultMapDispatchFactories,
    mapStateFactories: defaultMapStateFactories,
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
