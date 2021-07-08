import { ActionCreatorsMapObject, Dispatch } from 'redux'
import { FixTypeLater } from '../types'
import bindActionCreators from '../utils/bindActionCreators'
import { wrapMapToPropsConstant, wrapMapToPropsFunc } from './wrapMapToProps'

export function whenMapDispatchToPropsIsFunction(
  mapDispatchToProps: ActionCreatorsMapObject | FixTypeLater
) {
  return typeof mapDispatchToProps === 'function'
    ? wrapMapToPropsFunc(mapDispatchToProps, 'mapDispatchToProps')
    : undefined
}

export function whenMapDispatchToPropsIsMissing(mapDispatchToProps: undefined) {
  return !mapDispatchToProps
    ? wrapMapToPropsConstant((dispatch: Dispatch) => ({
        dispatch,
      }))
    : undefined
}

export function whenMapDispatchToPropsIsObject(
  mapDispatchToProps: ActionCreatorsMapObject
) {
  return mapDispatchToProps && typeof mapDispatchToProps === 'object'
    ? wrapMapToPropsConstant((dispatch: Dispatch) =>
        bindActionCreators(mapDispatchToProps, dispatch)
      )
    : undefined
}

export default [
  whenMapDispatchToPropsIsFunction,
  whenMapDispatchToPropsIsMissing,
  whenMapDispatchToPropsIsObject,
]
