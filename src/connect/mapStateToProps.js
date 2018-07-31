import { wrapMapToPropsConstant, wrapMapToPropsFunc } from './wrapMapToProps'

export function whenMapStateToPropsIsFunction(mapStateToProps) {
  return (typeof mapStateToProps === 'function' 
    && wrapMapToPropsFunc(mapStateToProps, 'mapStateToProps'))
}

export function whenMapStateToPropsIsMissing(mapStateToProps) {
  return (!mapStateToProps && wrapMapToPropsConstant(() => ({})))
}

export default [
  whenMapStateToPropsIsFunction,
  whenMapStateToPropsIsMissing
]
