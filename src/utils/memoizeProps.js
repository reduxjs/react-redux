import shallowEqual from './shallowEqual'

const equal = shallowEqual
// wrap the source props in a shallow equals because props objects with same properties are
// semantically equal in the eyes of React... no need to return a new object.
export default function memoizeProps() {
  let prevProps = undefined
  let result = undefined

  return function memoize(nextProps) {
    if (nextProps === prevProps) {
      return nextProps
    }

    if (result === undefined || !equal(prevProps, nextProps)) {
      return result = prevProps = nextProps
    }

    prevProps = nextProps
    return result
  }
}
