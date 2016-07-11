// Detects if the first result of mapStateToProps or mapDispatchToProps is a
// function, and uses that as the real function on subsequent calls.
export default function createMapOrMapFactoryProxy(mapToProps) {
  const meta = {
    dependsOnProps: mapToProps.length !== 1
  }

  let actualMapToProps = function firstRun(storePart, props) {
    const firstResult = mapToProps(storePart, props)

    if (typeof firstResult === 'function') {
      actualMapToProps = firstResult
      meta.dependsOnProps = firstResult.length !== 1    
      return firstResult(storePart, props)
    } else {
      actualMapToProps = mapToProps
      return firstResult
    }
  }

  function mapToPropsProxy(storePart, props) { return actualMapToProps(storePart, props) }
  mapToPropsProxy.meta = meta
  return mapToPropsProxy
}
