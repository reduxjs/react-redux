import createMapToPropsProxy from './createMapToPropsProxy'

export function whenMapStateToPropsIsMissing({ mapStateToProps }) {
  if (mapStateToProps) return undefined

  const empty = {}
  function emptyState() { return empty }
  emptyState.meta = { dependsOnProps: false }
  return emptyState
}

export function whenMapStateToPropsIsFunction({ mapStateToProps, displayName }) {
  return typeof mapStateToProps === 'function'
    ? createMapToPropsProxy(mapStateToProps, displayName, 'mapStateToProps')
    : undefined
}

export default [
  whenMapStateToPropsIsMissing,
  whenMapStateToPropsIsFunction
]
