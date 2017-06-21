import { wrapMapToPropsConstant, wrapMapToPropsFunc, wrapMapStateObject } from './wrapMapToProps'

export function whenMapStateToPropsIsFunction(mapStateToProps) {
  return (typeof mapStateToProps === 'function')
    ? wrapMapToPropsFunc(mapStateToProps, 'mapStateToProps')
    : undefined
}

export function whenMapStateToPropsIsObject(mapStateToProps) {
  return (typeof mapStateToProps === 'object')
    ? wrapMapStateObject(mapStateToProps, 'mapStateToProps')
    : undefined
}

export function whenMapStateToPropsIsMissing(mapStateToProps) {
  return (!mapStateToProps)
    ? wrapMapToPropsConstant(() => ({}))
    : undefined
}

export default [
  whenMapStateToPropsIsFunction,
  whenMapStateToPropsIsObject,
  whenMapStateToPropsIsMissing
]
