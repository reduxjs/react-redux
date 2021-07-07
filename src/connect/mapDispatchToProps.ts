import { ActionCreator, ActionCreatorsMapObject, Dispatch } from 'redux'
import bindActionCreators from '../utils/bindActionCreators'
import { wrapMapToPropsConstant, wrapMapToPropsFunc } from './wrapMapToProps'

export function whenMapDispatchToPropsIsFunction(
  mapDispatchToProps: ActionCreatorsMapObject | ActionCreator<any>
) {
  return typeof mapDispatchToProps === 'function'
    ? wrapMapToPropsFunc(mapDispatchToProps, 'mapDispatchToProps')
    : undefined
}

export function whenMapDispatchToPropsIsMissing(
  mapDispatchToProps: ActionCreatorsMapObject | ActionCreator<any>
) {
  return !mapDispatchToProps
    ? wrapMapToPropsConstant((dispatch) => ({ dispatch }))
    : undefined
}

export function whenMapDispatchToPropsIsObject(
  mapDispatchToProps: ActionCreatorsMapObject | ActionCreator<any>
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
