import { bindActionCreators } from 'redux'
import createMapOrMapFactoryProxy from './createMapOrMapFactoryProxy'

export function whenMapDispatchToPropsIsMissing({ mapDispatchToProps, dispatch }) {
  if (!mapDispatchToProps) {
    const dispatchProp = { dispatch }
    return function justDispatch() { return dispatchProp }
  }
}

export function whenMapDispatchToPropsIsObject({ mapDispatchToProps, dispatch }) {
  if (mapDispatchToProps && typeof mapDispatchToProps === 'object') {
    const bound = bindActionCreators(mapDispatchToProps, dispatch)
    return function boundActionCreators() { return bound }
  }
}

export function whenMapDispatchToPropsIsFunction({ mapDispatchToProps }) {
  if (typeof mapDispatchToProps === 'function') {
    return createMapOrMapFactoryProxy(mapDispatchToProps)
  }
}

export default [
  whenMapDispatchToPropsIsMissing,
  whenMapDispatchToPropsIsFunction,
  whenMapDispatchToPropsIsObject
]
