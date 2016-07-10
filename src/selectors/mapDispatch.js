import { bindActionCreators } from 'redux'
import createMapOrMapFactoryProxy from './createMapOrMapFactoryProxy'

export function whenMapDispatchIsMissing({ mapDispatchToProps, dispatch }) {
  if (!mapDispatchToProps) {
    const dispatchProp = { dispatch }
    return function justDispatch() { return dispatchProp }
  }
}

export function whenMapDispatchIsObject({ mapDispatchToProps, dispatch }) {
  if (mapDispatchToProps && typeof mapDispatchToProps === 'object') {
    const bound = bindActionCreators(mapDispatchToProps, dispatch)
    return function boundAcitonCreators() { return bound }
  }
}

export function whenMapDispatchIsFunctionAndNotPure({ mapDispatchToProps, dispatch, pure }) {
  if (!pure && typeof mapDispatchToProps === 'function') {
    const proxy = createMapOrMapFactoryProxy(mapDispatchToProps)
    return function impureMapDispatchToProps(props) { return proxy.mapToProps(dispatch, props) }
  }
}

export function whenMapDispatchIsFunctionAndPure({ mapDispatchToProps, dispatch, pure }) {
  if (pure && typeof mapDispatchToProps === 'function') {
    const proxy = createMapOrMapFactoryProxy(mapDispatchToProps)
    let lastProps = undefined
    let result = undefined

    return function pureMapDispatchToProps(nextProps) {
      if (!lastProps || (proxy.dependsOnProps && lastProps !== nextProps)) {
        result = proxy.mapToProps(dispatch, nextProps)
        lastProps = nextProps
      }

      return result
    }
  }
}

export default [
  whenMapDispatchIsMissing,
  whenMapDispatchIsFunctionAndNotPure,
  whenMapDispatchIsFunctionAndPure,
  whenMapDispatchIsObject
]
