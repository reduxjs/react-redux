import shallowEqual from './shallowEqual'

const equal = shallowEqual
// wrap the source props in a shallow equals because props objects with same properties are
// semantically equal in the eyes of React... no need to return a new object.
export default function memoizeProps() {
  let lastProps = undefined
  let result = undefined

  return function memoize(nextProps) {
    if (lastProps !== nextProps) {
      if (!lastProps || !equal(lastProps, nextProps)) {
        result = nextProps
      }
      lastProps = nextProps
    }
    return result
  }
}
