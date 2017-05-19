import { wrapMapToPropsConstant, wrapMapToPropsFunc } from './wrapMapToProps'

export function whenMapStateToPropsIsFunction(mapStateToProps) {
  return (typeof mapStateToProps === 'function')
    ? wrapMapToPropsFunc(mapStateToProps, 'mapStateToProps')
    : undefined
}

function getSelectorFromObject(objectSelectors) {
  return function (state) {
    const result = {};
    Object.keys(objectSelectors).forEach(function (key) {
      result[key] = objectSelectors[key](state);
    });
    return result;
  };
}

function isValidmapStateToPropsObj(mapStateToProps) {
  return typeof mapStateToProps === 'object' && Object
    .keys(mapStateToProps)
    .map(function (key) { return mapStateToProps[key] })
    .every(function (val) { return typeof val === 'function'; });
}

export function whenMapStateToPropsIsObject(mapStateToProps) {
  return (isValidmapStateToPropsObj(mapStateToProps)) ?
    wrapMapToPropsFunc(
      getSelectorFromObject(mapStateToProps), 'mapStateToProps'
    ) :
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
