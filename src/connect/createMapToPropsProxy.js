import verifyPlainObject from '../utils/verifyPlainObject'

// Used by whenMapStateToPropsIsFunction and whenMapDispatchToPropsIsFunction,
// this function wraps mapToProps in a proxy function which does several things:
// 
//  * Detects whether the mapToProps function being called depends on props, which
//    is used by selectorFactory to decide if it should reinvoke on props changes.
//    
//  * On first call, handles mapToProps if returns another function, and treats that
//    new function as the true mapToProps for subsequent calls.
//    
//  * On first call, verifies the first result is a plain object, in order to warn
//    the developer that their mapToProps function is not returning a valid result.
//    
export default function createMapToPropsProxy(mapToProps, displayName, methodName) {

  // meta.dependsOnProps is used by this function to determine whether to pass
  // props as args to the mapToProps function being wrapped. It is also used by
  // selectorFactory to determine whether this function needs to be invoked when
  // props have changed.
  // 
  // If the original mapToProps function does not have its own meta property, one
  // will be created with dependsOnProps based on mapToProps's length (number of
  // arguments). A length of one signals that mapToProps does not depend on props
  // being passed from the parent component.
  // 
  const detectedMeta = { dependsOnProps: mapToProps.length !== 1 }
  const proxyMeta = mapToProps.meta || detectedMeta

  let proxiedMapToProps
  function mapToPropsProxy(stateOrDispatch, ownProps) {
    return proxyMeta.dependsOnProps
      ? proxiedMapToProps(stateOrDispatch, ownProps)
      : proxiedMapToProps(stateOrDispatch)
  }
  mapToPropsProxy.meta = proxyMeta

  function detectFactoryAndVerify(stateOrDispatch, ownProps) {
    proxiedMapToProps = mapToProps
    let result = mapToPropsProxy(stateOrDispatch, ownProps)

    if (typeof result === 'function') {
      proxiedMapToProps = result
      detectedMeta.dependsOnProps = result.length !== 1
      result = mapToPropsProxy(stateOrDispatch, ownProps)
    }

    if (process.env.NODE_ENV !== 'production') 
      verifyPlainObject(result, displayName, methodName)

    return result
  }

  proxiedMapToProps = detectFactoryAndVerify
  return mapToPropsProxy
}
