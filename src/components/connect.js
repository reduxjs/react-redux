import flow from 'lodash/flow'

import connectAdvanced from './connectAdvanced'
import verifyPlainObject from '../utils/verifyPlainObject'
import { createFinalPropsSelector } from '../selectors/getFinalProps'
import defaultMapDispatchFactories from '../selectors/mapDispatch'
import defaultMapStateFactories from '../selectors/mapState'
import { defaultMergeProps } from '../selectors/mergeProps'

/*
  connect combines mapStateToProps, mapDispatchToProps, and mergeProps into a final selector that
  is compatible with connectAdvanced. The functions in the selectors folder are the individual
  pieces of that final selector.

  First, buildOptions combines its args with some meta into an options object that's passed to
  connectAdvanced, which will pass a modified version of that options object to selectorFactory.

    options modifications:
      added: dispatch, displayName, WrappedComponent
      removed: getDisplayName, renderCountProp

  Each time selectorFactory is called (whenever an instance of the component in connectAdvanced is
  constructed or hot reloaded), it uses the modified options object to build a selector function:

    1. Create the getState selector by matching mapStateToProps to the mapStateFactories array
       passed in from buildOptions.

       The default behaviors (from mapState.js) check mapStateToProps for a function or missing
       value. This could be overridden by supplying a custom value to the mapStateFactories
       property of connect's options argument
    
    2. Create the getDispatch selector by matching mapDispatchToProps to the mapDispatchFactories
       array passed in from buildOptions.

       The default behaviors (from mapDispatch.js) check mapDispatchToProps for a function, object,
       or missing value. The could be overridden by supplying a custom value to the
       mapDispatchFactories property of connect's options argument.
    
    3. Wrap the getState, getDispatch, and mergeProps selectors in functions that check that their
       return values are plain objects (on their first invocation.)

       This is to inform the developer that they made a mistake coding the function the supplied
       for any of mapStateToProps, mapDispatchToProps, or mergeProps.

    4. Combine getState, getDispatch, and mergeProps selectors into the final props selector, by
       passing the getState's results, getDispatch's results, and original props to mergeProps.
       (See getFinalProps.js)

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

    // passed through to selectorFactory. defaults to the array of funcs returned in mapDispatch.js
    // that determine the appropriate sub-selector to use for mapDispatchToProps, depending on
    // whether it's a function, object, or missing.
    mapDispatchFactories: defaultMapDispatchFactories,

    // passed through to selectorFactory. defaults to the array of funcs returned in mapState.js
    // that determine the appropriate sub-selector to use for mapStateToProps, depending on
    // whether it's a function or missing.
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
    // or pass state to the selector returned by selectorFactory.
    dependsOnState: Boolean(mapStateToProps)
  }
}

export function addStateAndDispatchSelectors(options) {
  function match(factories) {
    for (let i = factories.length - 1; i >= 0; i--) {
      const selector = factories[i](options)
      if (selector) return selector
    }
    return undefined
  }

  return {
    ...options,
    getState: match(options.mapStateFactories),
    getDispatch: match(options.mapDispatchFactories)
  }
}

export function wrapWithVerify({ getState, getDispatch, mergeProps, ...options }) {
  const verify = (methodName, func) => verifyPlainObject(options.displayName, methodName, func)
  return {
    ...options,
    getState: verify('mapStateToProps', getState),
    getDispatch: verify('mapDispatchToProps', getDispatch),
    mergeProps: verify('mergeProps', mergeProps)
  }
}

export function selectorFactory(options) {
  return flow(
    addStateAndDispatchSelectors,
    wrapWithVerify,
    createFinalPropsSelector
  )(options)
}

export default function connect(...args) {
  const options = buildOptions(...args)
  return connectAdvanced(selectorFactory, options)
}
