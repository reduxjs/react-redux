import createMapOrMapFactoryProxy from './createMapOrMapFactoryProxy'

export function whenMapStateIsMissing({ mapStateToProps }) {
  if (!mapStateToProps) {
    const empty = {}
    return function emptyState() { return empty }
  }
}

export function whenMapStateIsFunctionAndNotPure({ mapStateToProps, pure }) {
  if (!pure && typeof mapStateToProps === 'function') {
    const proxy = createMapOrMapFactoryProxy(mapStateToProps)
    return function impureMapStateToProps(state, props) { return proxy.mapToProps(state, props) }
  }
}

export function whenMapStateIsFunctionAndPure({ mapStateToProps, pure }) {
  if (pure && typeof mapStateToProps === 'function') {
    const proxy = createMapOrMapFactoryProxy(mapStateToProps)
    let lastState = undefined
    let lastProps = undefined
    let result = undefined

    return function pureMapStateToProps(nextState, nextProps) {
      if (lastState !== nextState || (proxy.dependsOnProps && lastProps !== nextProps)) {
        result = proxy.mapToProps(nextState, nextProps)
        lastState = nextState
        lastProps = nextProps
      }

      return result
    }
  }
}

export default [
  whenMapStateIsMissing,
  whenMapStateIsFunctionAndNotPure,
  whenMapStateIsFunctionAndPure
]
