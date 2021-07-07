import type { Dispatch } from 'redux'
import connectAdvanced from '../components/connectAdvanced'
import type { ConnectAdvancedOptions } from '../components/connectAdvanced'
import shallowEqual from '../utils/shallowEqual'
import defaultMapDispatchToPropsFactories from './mapDispatchToProps'
import defaultMapStateToPropsFactories from './mapStateToProps'
import defaultMergePropsFactories from './mergeProps'
import defaultSelectorFactory, {
  MapStateToPropsParam,
  MapDispatchToPropsParam,
  MergeProps,
} from './selectorFactory'
import type { DefaultRootState } from '../types'

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

function match<T>(
  arg: unknown,
  factories: ((value: unknown) => T)[],
  name: string
): T {
  for (let i = factories.length - 1; i >= 0; i--) {
    const result = factories[i](arg)
    if (result) return result
  }

  return ((dispatch: Dispatch, options: { wrappedComponentName: string }) => {
    throw new Error(
      `Invalid value of type ${typeof arg} for ${name} argument when connecting component ${
        options.wrappedComponentName
      }.`
    )
  }) as any
}

function strictEqual(a: unknown, b: unknown) {
  return a === b
}

export interface ConnectOptions<
  State = DefaultRootState,
  TStateProps = {},
  TOwnProps = {},
  TMergedProps = {}
> extends ConnectAdvancedOptions {
  pure?: boolean | undefined
  areStatesEqual?: ((nextState: State, prevState: State) => boolean) | undefined

  areOwnPropsEqual?: (
    nextOwnProps: TOwnProps,
    prevOwnProps: TOwnProps
  ) => boolean

  areStatePropsEqual?: (
    nextStateProps: TStateProps,
    prevStateProps: TStateProps
  ) => boolean
  areMergedPropsEqual?: (
    nextMergedProps: TMergedProps,
    prevMergedProps: TMergedProps
  ) => boolean
  forwardRef?: boolean | undefined
}

// createConnect with default args builds the 'official' connect behavior. Calling it with
// different options opens up some testing and extensibility scenarios
export function createConnect({
  connectHOC = connectAdvanced,
  mapStateToPropsFactories = defaultMapStateToPropsFactories,
  mapDispatchToPropsFactories = defaultMapDispatchToPropsFactories,
  mergePropsFactories = defaultMergePropsFactories,
  selectorFactory = defaultSelectorFactory,
} = {}) {
  return function connect(
    mapStateToProps: MapStateToPropsParam<unknown, unknown>,
    mapDispatchToProps: MapDispatchToPropsParam<unknown, unknown>,
    mergeProps: MergeProps<unknown, unknown, unknown, unknown>,
    {
      pure = true,
      areStatesEqual = strictEqual,
      areOwnPropsEqual = shallowEqual,
      areStatePropsEqual = shallowEqual,
      areMergedPropsEqual = shallowEqual,
      ...extraOptions
    }: ConnectOptions = {}
  ) {
    const initMapStateToProps = match(
      mapStateToProps,
      // @ts-ignore
      mapStateToPropsFactories,
      'mapStateToProps'
    )
    const initMapDispatchToProps = match(
      mapDispatchToProps,
      // @ts-ignore
      mapDispatchToPropsFactories,
      'mapDispatchToProps'
    )
    const initMergeProps = match(
      mergeProps,
      // @ts-ignore
      mergePropsFactories,
      'mergeProps'
    )

    // @ts-ignore
    return connectHOC(selectorFactory, {
      // used in error messages
      methodName: 'connect',

      // used to compute Connect's displayName from the wrapped component's displayName.
      getDisplayName: (name) => `Connect(${name})`,

      // if mapStateToProps is falsy, the Connect component doesn't subscribe to store state changes
      shouldHandleStateChanges: Boolean(mapStateToProps),

      // passed through to selectorFactory
      initMapStateToProps,
      initMapDispatchToProps,
      initMergeProps,
      pure,
      areStatesEqual,
      areOwnPropsEqual,
      areStatePropsEqual,
      areMergedPropsEqual,

      // any extra options args can override defaults of connect or connectAdvanced
      ...extraOptions,
    })
  }
}

export default /*#__PURE__*/ createConnect()
