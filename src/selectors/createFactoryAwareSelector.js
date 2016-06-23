import memoizeProps from '../utils/memoizeProps'

// factory detection. if the first result of mapToProps is a function, use that as the
// true mapToProps
export default function createMapOrMapFactoryProxy(mapToProps) {
  let map = undefined
  function firstRun(storePart, props) {
    const result = mapToProps(storePart, props)
    if (typeof result === 'function') {
      map = result
      return map(storePart, props)
    } else {
      map = mapToProps
      return result
    }
  }

  function proxy(storePart, props) {
    return (map || firstRun)(storePart, props)
  }
  proxy.dependsOnProps = function dependsOnProps() {
    return (map || mapToProps).length !== 1
  }
  return proxy
}

export function createImpureFactoryAwareSelector(getStorePart, mapToProps) {
  const map = createMapOrMapFactoryProxy(mapToProps)

  return function impureFactoryAwareSelector(state, props, dispatch) {
    return map(
      getStorePart(state, props, dispatch),
      props
    )
  }
}

export function createPureFactoryAwareSelector(getStorePart, mapToProps) {
  const map = createMapOrMapFactoryProxy(mapToProps)
  const memoizeMapResult = memoizeProps()
  const noProps = {}
  let lastStorePart = undefined
  let lastProps = undefined
  let result = undefined

  return function pureFactoryAwareSelector(state, props, dispatch) {
    const nextStorePart = getStorePart(state, props, dispatch)
    const nextProps = map.dependsOnProps() ? props : noProps

    if (lastStorePart !== nextStorePart || lastProps !== nextProps) {
      result = memoizeMapResult(map(nextStorePart, nextProps))
      lastStorePart = nextStorePart
      lastProps = nextProps
    }
    return result
  }
}

export default function createFactoryAwareSelector(pure, getStorePart, mapToProps) {
  const create = pure ? createPureFactoryAwareSelector : createImpureFactoryAwareSelector
  return create(getStorePart, mapToProps)
}
