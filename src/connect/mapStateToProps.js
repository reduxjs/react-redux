import {
  wrapMapToPropsConstant,
  wrapMapToPropsFunc,
  wrapMapToPropsObject
} from './wrapMapToProps'

export function whenMapStateToPropsIsFunction(mapStateToProps) {
  return (typeof mapStateToProps === 'function')
    ? wrapMapToPropsFunc(mapStateToProps, 'mapStateToProps')
    : undefined
}

function isValidmapStateToPropsObj(mapStateToProps) {
  return typeof mapStateToProps === 'object' && Object
    .keys(mapStateToProps)
    .map(function (key) { return mapStateToProps[key] })
    .every(function (val) { return typeof val === 'function' })
}

export function whenMapStateToPropsIsObject(mapStateToProps) {
  return (isValidmapStateToPropsObj(mapStateToProps)) ?
    wrapMapToPropsObject(mapStateToProps) :
    undefined
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
