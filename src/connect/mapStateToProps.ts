import {
  MapToProps,
  wrapMapToPropsConstant,
  wrapMapToPropsFunc,
} from './wrapMapToProps'

export function whenMapStateToPropsIsFunction(mapStateToProps?: MapToProps) {
  return typeof mapStateToProps === 'function'
    ? wrapMapToPropsFunc(mapStateToProps, 'mapStateToProps')
    : undefined
}

export function whenMapStateToPropsIsMissing(mapStateToProps?: MapToProps) {
  return !mapStateToProps ? wrapMapToPropsConstant(() => ({})) : undefined
}

export default [whenMapStateToPropsIsFunction, whenMapStateToPropsIsMissing]
