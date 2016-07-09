
// factory detection. if the first result of mapToProps is a function, use that as the
// true mapToProps
export function createMapOrMapFactoryProxy(mapToProps) {
  const proxy = {
    mapToProps: firstRun,
    dependsOnProps: mapToProps.length !== 1
  }

  function firstRun(storePart, props) {
    const firstResult = mapToProps(storePart, props)

    if (typeof firstResult === 'function') {
      proxy.mapToProps = firstResult
      proxy.dependsOnProps = firstResult.length !== 1    
      return firstResult(storePart, props)
    } else {
      proxy.mapToProps = mapToProps
      return firstResult
    }
  }

  return proxy
}

export function createImpureFactoryAwareSelector(mapToProps) {
  const proxy = createMapOrMapFactoryProxy(mapToProps)

  return function impureFactoryAwareSelector(storePart, props) {
    return proxy.mapToProps(storePart, props)
  }
}

export function createPureFactoryAwareSelector(mapToProps) {
  const proxy = createMapOrMapFactoryProxy(mapToProps)
  let lastStorePart = undefined
  let lastProps = undefined
  let result = undefined

  return function pureFactoryAwareSelector(nextStorePart, nextProps) {
    if (
      lastStorePart !== nextStorePart ||
      (proxy.dependsOnProps && lastProps !== nextProps)
    ) {
      result = proxy.mapToProps(nextStorePart, nextProps)
      lastStorePart = nextStorePart
      lastProps = nextProps
    }

    return result
  }
}

export default function createFactoryAwareSelector(mapToProps, pure) {
  return pure
    ? createPureFactoryAwareSelector(mapToProps)
    : createImpureFactoryAwareSelector(mapToProps)
}
