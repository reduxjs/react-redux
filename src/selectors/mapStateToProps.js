import createMapOrMapFactoryProxy from './createMapOrMapFactoryProxy'

export function whenMapStateToPropsIsMissing(mapStateToProps) {
  if (!mapStateToProps) {
    const empty = {}
    // The state arg is to keep the args count equal to 1 so that it's
    // detected as not depends on props
    return function emptyState(state) { // eslint-disable-line no-unused-vars
      return empty
    }
  }
}

export function whenMapStateToPropsIsFunction(mapStateToProps) {
  if (typeof mapStateToProps === 'function') {
    return createMapOrMapFactoryProxy(mapStateToProps)
  }
}

export default [
  whenMapStateToPropsIsMissing,
  whenMapStateToPropsIsFunction
]
