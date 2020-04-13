import { createStructuredSelector } from 'reselect'

import { wrapMapToPropsConstant, wrapMapToPropsFunc } from './wrapMapToProps'

export function whenMapStateToPropsIsFunction(mapStateToProps) {
  return typeof mapStateToProps === 'function'
    ? wrapMapToPropsFunc(mapStateToProps, 'mapStateToProps')
    : undefined
}

export function whenMapStateToPropsIsMissing(mapStateToProps) {
  return !mapStateToProps ? wrapMapToPropsConstant(() => ({})) : undefined
}

export function whenMapStateToPropsIsObject(mapStateToProps) {
  return mapStateToProps && typeof mapStateToProps === 'object'
    ? wrapMapToPropsFunc(
        createStructuredSelector(mapStateToProps),
        'mapStateToProps'
      )
    : undefined
}

export default [
  whenMapStateToPropsIsFunction,
  whenMapStateToPropsIsMissing,
  whenMapStateToPropsIsObject
]
