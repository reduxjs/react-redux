import connectAdvanced from './connectAdvanced'
import defaultMapDispatchToPropsFactories from '../selectors/mapDispatchToProps'
import defaultMapStateToPropsFactories from '../selectors/mapStateToProps'
import defaultMergePropsFactories from '../selectors/mergeProps'
import selectorFactory from '../selectors/selectorFactory'

/*
  connect combines mapStateToProps, mapDispatchToProps, and mergeProps into a final selector that
  is compatible with connectAdvanced. The functions in the selectors folder are the individual
  pieces of that final selector.

  First, buildOptions combines its args with some meta into an options object that's passed to
  connectAdvanced, which will pass a modified* version of that options object to selectorFactory.

    *values added to options: displayName, WrappedComponent

  Each time selectorFactory is called (whenever an instance of the component in connectAdvanced is
  constructed or hot reloaded), it uses the modified options object to build a selector function:

    1. Convert mapStateToProps into a selector by matching it to the mapStateFactories array
       passed in from buildOptions.

       The default behaviors (from mapStateToProps.js) check mapStateToProps for a function
       or missing value. This could be overridden by supplying a custom value to the
       mapStateFactories property of connect's options argument
    
    2. Convert mapDispatchToProps into a selector by matching it to the mapDispatchFactories
       array passed in from buildOptions.

       The default behaviors (from mapDispatchToProps.js) check mapDispatchToProps for a
       function, object, or missing value. This could be overridden by supplying a custom
       value to the mapDispatchFactories property of connect's options argument.
    
    3. Combine mapStateToProps, mapDispatchToProps, and mergeProps selectors into either a pure
       (makePurePropsSelector.js) or impure (makeImpurePropsSelector.js) final props selector.

  The resulting final props selector is called by the component instance whenever it receives new
  props or is notified by the store subscription.
 */

export function buildOptions(
  mapStateToProps,
  mapDispatchToProps,
  mergeProps,
  { pure = true, ...options } = {}
) {
  return {
    // passed through to selectorFactory
    mapStateToProps,
    mapStateToPropsFactories: defaultMapStateToPropsFactories,

    // passed through to selectorFactory
    mapDispatchToProps,
    mapDispatchToPropsFactories: defaultMapDispatchToPropsFactories,

    // passed through to selectorFactory
    mergeProps,
    mergePropsFactories: defaultMergePropsFactories,

    // if true, the selector returned by selectorFactory will memoize its results, allowing
    // connectAdvanced's shouldComponentUpdate to return false if final props have not changed.
    // if false, the selector will always return a new object and shouldComponentUpdate will always
    // return true.
    pure,

    // used to compute the Connect component's displayName from the wrapped component's displayName.
    getDisplayName: name => `Connect(${name})`,

    // if mapStateToProps is not given a value, the Connect component doesn't subscribe to the store
    shouldHandleStateChanges: Boolean(mapStateToProps),

    // in addition to setting withRef, pure, storeKey, and renderCountProp, options can override
    // getDisplayName, mapDispatchFactories, or mapStateFactories.
    // TODO: REPLACE with ...options ONCE IT'S OK TO EXPOSE NEW FUNCTIONALITY.
    withRef: options.withRef, // ...options,

    // used in error messages
    methodName: 'connect'
  }
}

export default function connect(...args) {
  const options = buildOptions(...args)
  return connectAdvanced(selectorFactory, options)
}
