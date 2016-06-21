import shallowEqual from '../utils/shallowEqual'

export function impureOwnPropsSelector(_, props) {
  return props
}

export function createPureOwnPropsSelector() {
  let lastProps = undefined
  let lastResult = undefined
  return function pureOwnPropsSelector(_, nextProps) {
    if (!lastProps || !shallowEqual(lastProps, nextProps)) {
      lastResult = nextProps
    }
    lastProps = nextProps
    return lastResult
  }
}

export function createOwnPropsSelector(pure) {
  return pure
    ? createPureOwnPropsSelector()
    : impureOwnPropsSelector
}
