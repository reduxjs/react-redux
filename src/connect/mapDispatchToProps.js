import { bindActionCreators } from 'redux'
import createMapToPropsProxy from './createMapToPropsProxy'

export function whenMapDispatchToPropsIsMissing({ mapDispatchToProps, dispatch }) {
  if (mapDispatchToProps) return undefined

  const props = { dispatch }
  function justDispatch() { return props }
  justDispatch.meta = { dependsOnProps: false }
  return justDispatch
}

export function whenMapDispatchToPropsIsObject({ mapDispatchToProps, dispatch }) {
  if (!mapDispatchToProps || typeof mapDispatchToProps !== 'object') return undefined

  const props = bindActionCreators(mapDispatchToProps, dispatch)
  function boundActionCreators() { return props }
  boundActionCreators.meta = { dependsOnProps: false }
  return boundActionCreators
}

export function whenMapDispatchToPropsIsFunction({ mapDispatchToProps, displayName }) {
  return typeof mapDispatchToProps === 'function'
    ? createMapToPropsProxy(mapDispatchToProps, displayName, 'mapDispatchToProps')
    : undefined
}

export default [
  whenMapDispatchToPropsIsMissing,
  whenMapDispatchToPropsIsFunction,
  whenMapDispatchToPropsIsObject
]
