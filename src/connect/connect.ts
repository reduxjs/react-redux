/* eslint-disable valid-jsdoc, @typescript-eslint/no-unused-vars */
import type { Dispatch, Action, AnyAction } from 'redux'
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
  MapDispatchToPropsNonObject,
  SelectorFactory,
} from './selectorFactory'
import type {
  DefaultRootState,
  InferableComponentEnhancer,
  InferableComponentEnhancerWithProps,
  ResolveThunks,
  DispatchProp,
} from '../types'

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

/**
 * Infers the type of props that a connector will inject into a component.
 */
export type ConnectedProps<TConnector> =
  TConnector extends InferableComponentEnhancerWithProps<
    infer TInjectedProps,
    any
  >
    ? unknown extends TInjectedProps
      ? TConnector extends InferableComponentEnhancer<infer TInjectedProps>
        ? TInjectedProps
        : never
      : TInjectedProps
    : never

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

/* @public */
function connect(): InferableComponentEnhancer<DispatchProp>

/* @public */
function connect<
  TStateProps = {},
  no_dispatch = {},
  TOwnProps = {},
  State = DefaultRootState
>(
  mapStateToProps: MapStateToPropsParam<TStateProps, TOwnProps, State>
): InferableComponentEnhancerWithProps<TStateProps & DispatchProp, TOwnProps>

/* @public */
function connect<no_state = {}, TDispatchProps = {}, TOwnProps = {}>(
  mapStateToProps: null | undefined,
  mapDispatchToProps: MapDispatchToPropsNonObject<TDispatchProps, TOwnProps>
): InferableComponentEnhancerWithProps<TDispatchProps, TOwnProps>

/* @public */
function connect<no_state = {}, TDispatchProps = {}, TOwnProps = {}>(
  mapStateToProps: null | undefined,
  mapDispatchToProps: MapDispatchToPropsParam<TDispatchProps, TOwnProps>
): InferableComponentEnhancerWithProps<ResolveThunks<TDispatchProps>, TOwnProps>

/* @public */
function connect<
  TStateProps = {},
  TDispatchProps = {},
  TOwnProps = {},
  State = DefaultRootState
>(
  mapStateToProps: MapStateToPropsParam<TStateProps, TOwnProps, State>,
  mapDispatchToProps: MapDispatchToPropsNonObject<TDispatchProps, TOwnProps>
): InferableComponentEnhancerWithProps<TStateProps & TDispatchProps, TOwnProps>

/* @public */
function connect<
  TStateProps = {},
  TDispatchProps = {},
  TOwnProps = {},
  State = DefaultRootState
>(
  mapStateToProps: MapStateToPropsParam<TStateProps, TOwnProps, State>,
  mapDispatchToProps: MapDispatchToPropsParam<TDispatchProps, TOwnProps>
): InferableComponentEnhancerWithProps<
  TStateProps & ResolveThunks<TDispatchProps>,
  TOwnProps
>

/* @public */
function connect<
  no_state = {},
  no_dispatch = {},
  TOwnProps = {},
  TMergedProps = {}
>(
  mapStateToProps: null | undefined,
  mapDispatchToProps: null | undefined,
  mergeProps: MergeProps<undefined, undefined, TOwnProps, TMergedProps>
): InferableComponentEnhancerWithProps<TMergedProps, TOwnProps>

/* @public */
function connect<
  TStateProps = {},
  no_dispatch = {},
  TOwnProps = {},
  TMergedProps = {},
  State = DefaultRootState
>(
  mapStateToProps: MapStateToPropsParam<TStateProps, TOwnProps, State>,
  mapDispatchToProps: null | undefined,
  mergeProps: MergeProps<TStateProps, undefined, TOwnProps, TMergedProps>
): InferableComponentEnhancerWithProps<TMergedProps, TOwnProps>

/* @public */
function connect<
  no_state = {},
  TDispatchProps = {},
  TOwnProps = {},
  TMergedProps = {}
>(
  mapStateToProps: null | undefined,
  mapDispatchToProps: MapDispatchToPropsParam<TDispatchProps, TOwnProps>,
  mergeProps: MergeProps<undefined, TDispatchProps, TOwnProps, TMergedProps>
): InferableComponentEnhancerWithProps<TMergedProps, TOwnProps>

/* @public */
// @ts-ignore
function connect<
  TStateProps = {},
  no_dispatch = {},
  TOwnProps = {},
  State = DefaultRootState
>(
  mapStateToProps: MapStateToPropsParam<TStateProps, TOwnProps, State>,
  mapDispatchToProps: null | undefined,
  mergeProps: null | undefined,
  options: ConnectOptions<State, TStateProps, TOwnProps>
): InferableComponentEnhancerWithProps<DispatchProp & TStateProps, TOwnProps>

/* @public */
function connect<TStateProps = {}, TDispatchProps = {}, TOwnProps = {}>(
  mapStateToProps: null | undefined,
  mapDispatchToProps: MapDispatchToPropsNonObject<TDispatchProps, TOwnProps>,
  mergeProps: null | undefined,
  options: ConnectOptions<{}, TStateProps, TOwnProps>
): InferableComponentEnhancerWithProps<TDispatchProps, TOwnProps>

/* @public */
function connect<TStateProps = {}, TDispatchProps = {}, TOwnProps = {}>(
  mapStateToProps: null | undefined,
  mapDispatchToProps: MapDispatchToPropsParam<TDispatchProps, TOwnProps>,
  mergeProps: null | undefined,
  options: ConnectOptions<{}, TStateProps, TOwnProps>
): InferableComponentEnhancerWithProps<ResolveThunks<TDispatchProps>, TOwnProps>

/* @public */
function connect<
  TStateProps = {},
  TDispatchProps = {},
  TOwnProps = {},
  State = DefaultRootState
>(
  mapStateToProps: MapStateToPropsParam<TStateProps, TOwnProps, State>,
  mapDispatchToProps: MapDispatchToPropsNonObject<TDispatchProps, TOwnProps>,
  mergeProps: null | undefined,
  options: ConnectOptions<State, TStateProps, TOwnProps>
): InferableComponentEnhancerWithProps<TStateProps & TDispatchProps, TOwnProps>

/* @public */
function connect<
  TStateProps = {},
  TDispatchProps = {},
  TOwnProps = {},
  State = DefaultRootState
>(
  mapStateToProps: MapStateToPropsParam<TStateProps, TOwnProps, State>,
  mapDispatchToProps: MapDispatchToPropsParam<TDispatchProps, TOwnProps>,
  mergeProps: null | undefined,
  options: ConnectOptions<State, TStateProps, TOwnProps>
): InferableComponentEnhancerWithProps<
  TStateProps & ResolveThunks<TDispatchProps>,
  TOwnProps
>

/* @public */
function connect<
  TStateProps = {},
  TDispatchProps = {},
  TOwnProps = {},
  TMergedProps = {},
  State = DefaultRootState
>(
  mapStateToProps: MapStateToPropsParam<TStateProps, TOwnProps, State>,
  mapDispatchToProps: MapDispatchToPropsParam<TDispatchProps, TOwnProps>,
  mergeProps: MergeProps<TStateProps, TDispatchProps, TOwnProps, TMergedProps>,
  options?: ConnectOptions<State, TStateProps, TOwnProps, TMergedProps>
): InferableComponentEnhancerWithProps<TMergedProps, TOwnProps>

/**
 * Connects a React component to a Redux store.
 *
 * - Without arguments, just wraps the component, without changing the behavior / props
 *
 * - If 2 params are passed (3rd param, mergeProps, is skipped), default behavior
 * is to override ownProps (as stated in the docs), so what remains is everything that's
 * not a state or dispatch prop
 *
 * - When 3rd param is passed, we don't know if ownProps propagate and whether they
 * should be valid component props, because it depends on mergeProps implementation.
 * As such, it is the user's responsibility to extend ownProps interface from state or
 * dispatch props or both when applicable
 *
 * @param mapStateToProps A function that extracts values from state
 * @param mapDispatchToProps Setup for dispatching actions
 * @param mergeProps Optional callback to merge state and dispatch props together
 * @param options Options for configuring the connection
 *
 */
function connect(
  mapStateToProps?: unknown,
  mapDispatchToProps?: unknown,
  mergeProps?: unknown,
  {
    pure = true,
    areStatesEqual = strictEqual,
    areOwnPropsEqual = shallowEqual,
    areStatePropsEqual = shallowEqual,
    areMergedPropsEqual = shallowEqual,
    ...extraOptions
  }: ConnectOptions<unknown, unknown, unknown, unknown> = {}
): unknown {
  const initMapStateToProps = match(
    mapStateToProps,
    // @ts-ignore
    defaultMapStateToPropsFactories,
    'mapStateToProps'
  )
  const initMapDispatchToProps = match(
    mapDispatchToProps,
    // @ts-ignore
    defaultMapDispatchToPropsFactories,
    'mapDispatchToProps'
  )
  const initMergeProps = match(
    mergeProps,
    // @ts-ignore
    defaultMergePropsFactories,
    'mergeProps'
  )

  return connectAdvanced(
    defaultSelectorFactory as SelectorFactory<any, any, any, any>,
    {
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
    }
  )
}

export default connect
