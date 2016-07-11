import createMapOrMapFactoryProxy from './createMapOrMapFactoryProxy'

export function whenMapStateToPropsIsMissing({ mapStateToProps }) {
  if (!mapStateToProps) {
    const empty = {}
    return function emptyState() { return empty }
  }
}

export function whenMapStateToPropsIsFunction({ mapStateToProps }) {
  if (typeof mapStateToProps === 'function') {
    return createMapOrMapFactoryProxy(mapStateToProps)
  }
}

export default [
  whenMapStateToPropsIsMissing,
  whenMapStateToPropsIsFunction
]
