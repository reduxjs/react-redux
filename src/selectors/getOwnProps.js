import memoizeProps from '../utils/memoizeProps'

export function impureOwnPropsSelector(_, props) {
  return props
}

export function createPureOwnPropsSelector() {
  return memoizeProps((_, props) => props)
}

export function createOwnPropsSelector({ pure }) {
  return pure
    ? createPureOwnPropsSelector()
    : impureOwnPropsSelector
}

export function addGetOwnProps(options) {
  const getOwnProps = createOwnPropsSelector(options)
  return { getOwnProps, ...options }
}
