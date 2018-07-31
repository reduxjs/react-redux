import { bindActionCreators } from 'redux'
import { wrapMapToPropsConstant, wrapMapToPropsFunc } from './wrapMapToProps'

export function whenMapDispatchToPropsIsFunction(mapDispatchToProps) {
  return (typeof mapDispatchToProps === 'function' 
    && wrapMapToPropsFunc(mapDispatchToProps, 'mapDispatchToProps'))
}

export function whenMapDispatchToPropsIsMissing(mapDispatchToProps) {
  return (!mapDispatchToProps 
    && wrapMapToPropsConstant(dispatch => ({ dispatch })))
}

export function whenMapDispatchToPropsIsObject(mapDispatchToProps) {
  return (mapDispatchToProps && typeof mapDispatchToProps === 'object' 
    && wrapMapToPropsConstant(dispatch => bindActionCreators(mapDispatchToProps, dispatch)))
}

export default [
  whenMapDispatchToPropsIsFunction,
  whenMapDispatchToPropsIsMissing,
  whenMapDispatchToPropsIsObject
]
