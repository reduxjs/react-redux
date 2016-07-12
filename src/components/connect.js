import connectAdvanced from './connectAdvanced'
import makeImpurePropsSelector from '../selectors/makeImpurePropsSelector'
import makePurePropsSelector from '../selectors/makePurePropsSelector'
import defaultMapDispatchFactories from '../selectors/mapDispatchToProps'
import defaultMapStateFactories from '../selectors/mapStateToProps'
import { defaultMergeProps } from '../selectors/mergeProps'

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
  {
    pure = true,
    withRef // ...options
  } = {}) {
  return {
    // used to compute the Connect component's displayName from the wrapped component's displayName.
    getDisplayName: name => `Connect(${name})`,

    // passed through to selectorFactory. defaults to the array of funcs returned in
    // mapDispatchToProps.js that determine the appropriate sub-selector to use for
    // mapDispatchToProps, depending on whether it's a function, object, or missing.
    mapDispatchFactories: defaultMapDispatchFactories,

    // passed through to selectorFactory. defaults to the array of funcs returned in
    // mapStateToProps.js that determine the appropriate sub-selector to use for
    // mapStateToProps, depending on whether it's a function or missing.
    mapStateFactories: defaultMapStateFactories,

    // if true, the selector returned by selectorFactory will memoize its results, allowing
    // connectAdvanced's shouldComponentUpdate to return false if final props have not changed.
    // if false, the selector will always return a new object and shouldComponentUpdate will always
    // return true.
    pure,

    // in addition to setting withRef, pure, storeKey, and renderCountProp, options can override
    // getDisplayName, mapDispatchFactories, or mapStateFactories.
    // TODO: REPLACE WITH ...OPTIONS ONCE IT'S OK TO EXPOSE NEW FUNCTIONALITY.
    withRef,

    // passed through to selectorFactory
    mapStateToProps,

    // passed through to selectorFactory
    mapDispatchToProps,

    // passed through to selectorFactory
    mergeProps: mergeProps || defaultMergeProps,

    // used in error messages
    methodName: 'connect',

    // if mapStateToProps is not given a value, the Connect component doesn't subscribe to the store
    shouldHandleStateChanges: Boolean(mapStateToProps)
  }
}

export function selectorFactory(dispatch, options) {
  function match(mapToProps, factories) {
    for (let i = factories.length - 1; i >= 0; i--) {
      const selector = factories[i](mapToProps, options)
      if (selector) return selector
    }
    return undefined
  }

  const mapStateToProps = match(options.mapStateToProps, options.mapStateFactories)
  const mapDispatchToProps = match(options.mapDispatchToProps, options.mapDispatchFactories)
  const factory = options.pure ? makePurePropsSelector : makeImpurePropsSelector

  return factory(dispatch, { ...options, mapStateToProps, mapDispatchToProps })
}

export default function connect(...args) {
  const options = buildOptions(...args)
  return connectAdvanced(selectorFactory, options)
}
