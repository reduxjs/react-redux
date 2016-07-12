import { bindActionCreators } from 'redux'
import createMapOrMapFactoryProxy from './createMapOrMapFactoryProxy'

export function whenMapDispatchToPropsIsMissing(mapDispatchToProps) {
  if (!mapDispatchToProps) {
    return function justDispatch(dispatch) { 
      return { dispatch }
    } 
  }
}

export function whenMapDispatchToPropsIsObject(mapDispatchToProps) {
  if (mapDispatchToProps && typeof mapDispatchToProps === 'object') {
    return function boundActionCreators(dispatch) { 
      return bindActionCreators(mapDispatchToProps, dispatch)
    }
  }
}

export function whenMapDispatchToPropsIsFunction(mapDispatchToProps) {
  if (typeof mapDispatchToProps === 'function') {
    return createMapOrMapFactoryProxy(mapDispatchToProps)
  }
}

export default [
  whenMapDispatchToPropsIsMissing,
  whenMapDispatchToPropsIsFunction,
  whenMapDispatchToPropsIsObject
]
