import shallowEqual from '../utils/shallowEqual'

// factory detection. if the first result of mapToProps is a function, use that as the
// true mapToProps
export default function buildMapOrMapFactoryProxy(mapToProps) {
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

export function buildImpureFactoryAwareSelector(getOwnProps, getStorePart, mapToProps) {
  const map = buildMapOrMapFactoryProxy(mapToProps)

  return function impureFactoryAwareSelector(state, props, dispatch) {
    return map(
      getStorePart(state, props, dispatch),
      getOwnProps(state, props, dispatch)
    )
  }
}

export function buildPureFactoryAwareSelector(getOwnProps, getStorePart, mapToProps) {
  const map = buildMapOrMapFactoryProxy(mapToProps)
  const noProps = {}
  let lastStorePart = undefined
  let lastProps = undefined
  let lastResult = undefined

  return function pureFactoryAwareSelector(state, props, dispatch) {
    const nextStorePart = getStorePart(state, props, dispatch)
    const nextProps = map.dependsOnProps() ? getOwnProps(state, props, dispatch) : noProps

    if (lastStorePart !== nextStorePart || lastProps !== nextProps) {
      lastStorePart = nextStorePart
      lastProps = nextProps
      const nextResult = map(nextStorePart, nextProps)

      if (!lastResult || !shallowEqual(lastResult, nextResult)) {
        lastResult = nextResult
      }
    }
    return lastResult
  }
}

export default function buildFactoryAwareSelector(pure, getOwnProps, getStorePart, mapToProps) {
  const build = pure ? buildPureFactoryAwareSelector : buildImpureFactoryAwareSelector
  return build(getOwnProps, getStorePart, mapToProps)
}
