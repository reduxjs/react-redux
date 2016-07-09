
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
  const noProps = {}
  let lastStorePart = undefined
  let lastProps = undefined
  let result = undefined

  function pureFactoryAwareSelector(storePart, props) {
    const nextStorePart = storePart
    const nextProps = proxy.dependsOnProps ? props : noProps

    if (lastStorePart !== nextStorePart || lastProps !== nextProps) {
      result = proxy.mapToProps(nextStorePart, nextProps)
      lastStorePart = nextStorePart
      lastProps = nextProps
      pureFactoryAwareSelector.dependsOnProps = proxy.dependsOnProps    
    }
    return result
  }

  pureFactoryAwareSelector.dependsOnProps = proxy.dependsOnProps
  return pureFactoryAwareSelector
}

export default function createFactoryAwareSelector(pure, mapToProps) {
  const create = pure ? createPureFactoryAwareSelector : createImpureFactoryAwareSelector
  return create(mapToProps)
}
