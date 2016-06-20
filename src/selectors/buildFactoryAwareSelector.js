import shallowEqual from '../utils/shallowEqual'

// used by getStatePropsSelector and getDispatchPropsSelector to create a memoized selector function
// based on the given mapStateOrDispatchToProps function. It also detects if that function is a
// factory based on its first returned result.
// if not pure, then results should always be recomputed (except if it's ignoring prop changes)
export default function buildFactoryAwareSelector(
  pure,
  ownPropsSelector,
  selectStateOrDispatch,
  mapStateOrDispatchToProps
) {
  const noProps = {}

  // factory detection. if the first result of mapSomethingToProps is a function, use that as the
  // true mapSomethingToProps
  let map = mapStateOrDispatchToProps
  let mapProxy = function initialMapProxy(...args) {
    const result = map(...args)
    if (typeof result === 'function') {
      map = result
      mapProxy = map
      return map(...args)
    } else {
      mapProxy = map
      return result
    }
  }
  
  if (!pure) {
    return function impureFactoryAwareSelector(state, props, dispatch) {
      return mapProxy(
        selectStateOrDispatch(state, props, dispatch),
        ownPropsSelector(state, props, dispatch)
      )
    }
  }

  let lastStateOrDispatch = undefined
  let lastProps = undefined
  let lastResult = undefined

  return function pureFactoryAwareSelector(state, props, dispatch) {
    const nextStateOrDispatch = selectStateOrDispatch(state, props, dispatch)
    const nextProps = map.length === 1 ? noProps : ownPropsSelector(state, props, dispatch)

    if (lastStateOrDispatch !== nextStateOrDispatch || lastProps !== nextProps) {
      lastStateOrDispatch = nextStateOrDispatch
      lastProps = nextProps
      const nextResult = mapProxy(nextStateOrDispatch, nextProps)

      if (!lastResult || !shallowEqual(lastResult, nextResult)) {
        lastResult = nextResult
      }
    }
    return lastResult
  }
}
