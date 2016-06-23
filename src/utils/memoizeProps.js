import shallowEqual from '../utils/shallowEqual'

// wrap the source getProps func in a shallow equals because props objects with same properties are
// semantically equal in the eyes of React... no need to return a new object.
export default function memoizeProps(getProps) {
  let lastValue = undefined
  let lastResult = undefined

  return function memoize(...args) {
    const nextValue = getProps(...args)
    if (!lastValue) {
      lastValue = nextValue
      lastResult = nextValue
    } else if (lastValue !== nextValue) {
      if (!shallowEqual(lastValue, nextValue)) {
        lastResult = nextValue
      }
      lastValue = nextValue
    }
    return lastResult
  }
}
