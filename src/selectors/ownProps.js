import shallowEqual from '../utils/shallowEqual'

export function impureOwnPropsSelector(_, props) {
  return props
}

export function buildPureOwnPropsSelector() {
  let lastProps = undefined
  return function pureOwnPropsSelector(_, nextProps) {
    if (!lastProps || !shallowEqual(lastProps, nextProps)) {
      lastProps = nextProps
    }
    return lastProps
  }
}

export function buildOwnPropsSelector(pure) {
  return pure
    ? buildPureOwnPropsSelector()
    : impureOwnPropsSelector
}
