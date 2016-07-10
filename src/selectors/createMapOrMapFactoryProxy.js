// Detects if the first result of mapStateToProps or mapDispatchToProps is a
// function, and uses that as the real function on subsequent calls.
export default function createMapOrMapFactoryProxy(mapToProps) {
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
