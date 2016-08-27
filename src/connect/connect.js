import connectAdvanced from '../components/connectAdvanced'
import defaultMapDispatchToPropsFactories from './mapDispatchToProps'
import defaultMapStateToPropsFactories from './mapStateToProps'
import defaultMergePropsFactories from './mergeProps'
import defaultSelectorFactory from './selectorFactory'

/*
  connect is a facade over connectAdvanced. It turns its args into a compatible
  selectorFactory, which has the signature:

    (dispatch, options) => (nextState, nextOwnProps) => nextFinalProps
  
  connect passes its args to connectAdvanced as options, which will in turn pass them to
  selectorFactory each time a Connect component instance is instantiated or hot reloaded.

  selectorFactory returns a final props selector from its mapStateToProps,
  mapStateToPropsFactories, mapDispatchToProps, mapDispatchToPropsFactories, mergeProps,
  mergePropsFactories, and pure args.

  The resulting final props selector is called by the Connect component instance whenever
  it receives new props or store state.
 */

function match(arg, factories) {
  for (let i = factories.length - 1; i >= 0; i--) {
    const result = factories[i](arg)
    if (result) return result
  }
  return undefined
}

export function buildConnectOptions(
  mapStateToProps,
  mapDispatchToProps,
  mergeProps,
  {
    mapStateToPropsFactories = defaultMapStateToPropsFactories,
    mapDispatchToPropsFactories = defaultMapDispatchToPropsFactories,
    mergePropsFactories = defaultMergePropsFactories,
    selectorFactory = defaultSelectorFactory,
    pure = true,
    ...options
  } = {}
) {
  const initMapStateToProps = match(mapStateToProps, mapStateToPropsFactories)
  const initMapDispatchToProps = match(mapDispatchToProps, mapDispatchToPropsFactories)
  const initMergeProps = match(mergeProps, mergePropsFactories)

  return {
    // used in error messages
    methodName: 'connect',

     // used to compute Connect's displayName from the wrapped component's displayName.
    getDisplayName: name => `Connect(${name})`,

    // if mapStateToProps is falsy, the Connect component doesn't subscribe to store state changes
    shouldHandleStateChanges: Boolean(mapStateToProps),

    // passed through to selectorFactory
    selectorFactory,
    initMapStateToProps,
    initMapDispatchToProps,
    initMergeProps,
    pure,

    // any addional options args can override defaults of connect or connectAdvanced
    ...options
  }
}

export default function connect(...args) {
  const options = buildConnectOptions(...args)
  return connectAdvanced(options.selectorFactory, options)
}
