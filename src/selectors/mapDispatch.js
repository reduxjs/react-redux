import { bindActionCreators } from 'redux'

import createFactoryAwareSelector from './createFactoryAwareSelector'
import createMatchingSelector from '../selectors/createMatchingSelector'

export function whenMapDispatchIsMissing({ mapDispatchToProps, dispatch }) {
  if (!mapDispatchToProps) {
    const dispatchProp = { dispatch }
    return () => dispatchProp
  }
}

export function whenMapDispatchIsObject({ mapDispatchToProps, dispatch }) {
  if (mapDispatchToProps && typeof mapDispatchToProps === 'object') {
    const bound = bindActionCreators(mapDispatchToProps, dispatch)
    return () => bound
  }
}

export function whenMapDispatchIsFunction({ mapDispatchToProps, pure, dispatch, getOwnProps }) {
  if (typeof mapDispatchToProps === 'function') {
    return createFactoryAwareSelector(pure, getOwnProps, () => dispatch, mapDispatchToProps)    
  }
}

export function getDefaultMapDispatchFactories() {
  return [
    whenMapDispatchIsMissing,
    whenMapDispatchIsFunction,
    whenMapDispatchIsObject
  ]
}

export function createMapDispatchSelector(options) {
  return createMatchingSelector(options.mapDispatchFactories, options)
}

export function addGetDispatch(options) {
  const getDispatch = createMapDispatchSelector(options)
  return { getDispatch, ...options }
}
