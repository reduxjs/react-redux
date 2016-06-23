import createFactoryAwareSelector from './createFactoryAwareSelector'
import createMatchingSelector from '../selectors/createMatchingSelector'

export function whenMapStateIsMissing({ mapStateToProps }) {
  if (!mapStateToProps) {
    const empty = {}
    return () => empty
  }
}

export function whenMapStateIsFunction({ mapStateToProps, pure, getOwnProps }) {
  if (typeof mapStateToProps === 'function') {
    return createFactoryAwareSelector(pure, getOwnProps, state => state, mapStateToProps)
  }
}

export function getDefaultMapStateFactories() {
  return [
    whenMapStateIsMissing,
    whenMapStateIsFunction
  ]
}

export function createMapStateSelector(options) {
  return createMatchingSelector(options.mapStateFactories, options)
}

export function addGetState(options) {
  const getState = createMapStateSelector(options)
  return { getState, ...options }
}
