import type { Dispatch, Action } from 'redux'
import verifySubselectors from './verifySubselectors'
import type { DefaultRootState, EqualityFn } from '../types'

export type SelectorFactory<S, TProps, TOwnProps, TFactoryOptions> = (
  dispatch: Dispatch<Action>,
  factoryOptions: TFactoryOptions
) => Selector<S, TProps, TOwnProps>

export type Selector<S, TProps, TOwnProps = null> = TOwnProps extends
  | null
  | undefined
  ? (state: S) => TProps
  : (state: S, ownProps: TOwnProps) => TProps

export type MapStateToProps<
  TStateProps,
  TOwnProps,
  State = DefaultRootState
> = (state: State, ownProps: TOwnProps) => TStateProps

export type MapStateToPropsFactory<
  TStateProps,
  TOwnProps,
  State = DefaultRootState
> = (
  initialState: State,
  ownProps: TOwnProps
) => MapStateToProps<TStateProps, TOwnProps, State>

export type MapStateToPropsParam<
  TStateProps,
  TOwnProps,
  State = DefaultRootState
> =
  | MapStateToPropsFactory<TStateProps, TOwnProps, State>
  | MapStateToProps<TStateProps, TOwnProps, State>
  | null
  | undefined

export type MapDispatchToPropsFunction<TDispatchProps, TOwnProps> = (
  dispatch: Dispatch<Action>,
  ownProps: TOwnProps
) => TDispatchProps

export type MapDispatchToProps<TDispatchProps, TOwnProps> =
  | MapDispatchToPropsFunction<TDispatchProps, TOwnProps>
  | TDispatchProps

export type MapDispatchToPropsFactory<TDispatchProps, TOwnProps> = (
  dispatch: Dispatch<Action>,
  ownProps: TOwnProps
) => MapDispatchToPropsFunction<TDispatchProps, TOwnProps>

export type MapDispatchToPropsParam<TDispatchProps, TOwnProps> =
  | MapDispatchToPropsFactory<TDispatchProps, TOwnProps>
  | MapDispatchToProps<TDispatchProps, TOwnProps>

export type MapDispatchToPropsNonObject<TDispatchProps, TOwnProps> =
  | MapDispatchToPropsFactory<TDispatchProps, TOwnProps>
  | MapDispatchToPropsFunction<TDispatchProps, TOwnProps>

export type MergeProps<TStateProps, TDispatchProps, TOwnProps, TMergedProps> = (
  stateProps: TStateProps,
  dispatchProps: TDispatchProps,
  ownProps: TOwnProps
) => TMergedProps

export function impureFinalPropsSelectorFactory<
  TStateProps,
  TOwnProps,
  TDispatchProps,
  TMergedProps,
  State = DefaultRootState
>(
  mapStateToProps: MapStateToPropsParam<TStateProps, TOwnProps, State>,
  mapDispatchToProps: MapDispatchToPropsParam<TDispatchProps, TOwnProps>,
  mergeProps: MergeProps<TStateProps, TDispatchProps, TOwnProps, TMergedProps>,
  dispatch: Dispatch
) {
  return function impureFinalPropsSelector(state: State, ownProps: TOwnProps) {
    return mergeProps(
      // @ts-ignore
      mapStateToProps(state, ownProps),
      // @ts-ignore
      mapDispatchToProps(dispatch, ownProps),
      ownProps
    )
  }
}

interface PureSelectorFactoryComparisonOptions<
  TOwnProps,
  State = DefaultRootState
> {
  areStatesEqual: EqualityFn<State>
  areOwnPropsEqual: EqualityFn<TOwnProps>
  areStatePropsEqual: EqualityFn<unknown>
  pure?: boolean
}

export function pureFinalPropsSelectorFactory<
  TStateProps,
  TOwnProps,
  TDispatchProps,
  TMergedProps,
  State = DefaultRootState
>(
  mapStateToProps: MapStateToPropsParam<TStateProps, TOwnProps, State> & {
    dependsOnOwnProps: boolean
  },
  mapDispatchToProps: MapDispatchToPropsParam<TDispatchProps, TOwnProps> & {
    dependsOnOwnProps: boolean
  },
  mergeProps: MergeProps<TStateProps, TDispatchProps, TOwnProps, TMergedProps>,
  dispatch: Dispatch,
  {
    areStatesEqual,
    areOwnPropsEqual,
    areStatePropsEqual,
  }: PureSelectorFactoryComparisonOptions<TOwnProps, State>
) {
  let hasRunAtLeastOnce = false
  let state: State
  let ownProps: TOwnProps
  let stateProps: TStateProps
  let dispatchProps: TDispatchProps
  let mergedProps: TMergedProps

  function handleFirstCall(firstState: State, firstOwnProps: TOwnProps) {
    state = firstState
    ownProps = firstOwnProps
    // @ts-ignore
    stateProps = mapStateToProps!(state, ownProps)
    // @ts-ignore
    dispatchProps = mapDispatchToProps!(dispatch, ownProps)
    mergedProps = mergeProps(stateProps, dispatchProps, ownProps)
    hasRunAtLeastOnce = true
    return mergedProps
  }

  function handleNewPropsAndNewState() {
    // @ts-ignore
    stateProps = mapStateToProps!(state, ownProps)

    if (mapDispatchToProps!.dependsOnOwnProps)
      // @ts-ignore
      dispatchProps = mapDispatchToProps(dispatch, ownProps)

    mergedProps = mergeProps(stateProps, dispatchProps, ownProps)
    return mergedProps
  }

  function handleNewProps() {
    if (mapStateToProps!.dependsOnOwnProps)
      // @ts-ignore
      stateProps = mapStateToProps!(state, ownProps)

    if (mapDispatchToProps.dependsOnOwnProps)
      // @ts-ignore
      dispatchProps = mapDispatchToProps(dispatch, ownProps)

    mergedProps = mergeProps(stateProps, dispatchProps, ownProps)
    return mergedProps
  }

  function handleNewState() {
    const nextStateProps = mapStateToProps(state, ownProps)
    const statePropsChanged = !areStatePropsEqual(nextStateProps, stateProps)
    // @ts-ignore
    stateProps = nextStateProps

    if (statePropsChanged)
      mergedProps = mergeProps(stateProps, dispatchProps, ownProps)

    return mergedProps
  }

  function handleSubsequentCalls(nextState: State, nextOwnProps: TOwnProps) {
    const propsChanged = !areOwnPropsEqual(nextOwnProps, ownProps)
    const stateChanged = !areStatesEqual(nextState, state)
    state = nextState
    ownProps = nextOwnProps

    if (propsChanged && stateChanged) return handleNewPropsAndNewState()
    if (propsChanged) return handleNewProps()
    if (stateChanged) return handleNewState()
    return mergedProps
  }

  return function pureFinalPropsSelector(
    nextState: State,
    nextOwnProps: TOwnProps
  ) {
    return hasRunAtLeastOnce
      ? handleSubsequentCalls(nextState, nextOwnProps)
      : handleFirstCall(nextState, nextOwnProps)
  }
}

export interface SelectorFactoryOptions<
  TStateProps,
  TOwnProps,
  TDispatchProps,
  TMergedProps,
  State = DefaultRootState
> extends PureSelectorFactoryComparisonOptions<TOwnProps, State> {
  initMapStateToProps: (
    dispatch: Dispatch,
    options: PureSelectorFactoryComparisonOptions<TOwnProps, State>
  ) => MapStateToPropsParam<TStateProps, TOwnProps, State>
  initMapDispatchToProps: (
    dispatch: Dispatch,
    options: PureSelectorFactoryComparisonOptions<TOwnProps, State>
  ) => MapDispatchToPropsParam<TDispatchProps, TOwnProps>
  initMergeProps: (
    dispatch: Dispatch,
    options: PureSelectorFactoryComparisonOptions<TOwnProps, State>
  ) => MergeProps<TStateProps, TDispatchProps, TOwnProps, TMergedProps>
}

// TODO: Add more comments

// If pure is true, the selector returned by selectorFactory will memoize its results,
// allowing connectAdvanced's shouldComponentUpdate to return false if final
// props have not changed. If false, the selector will always return a new
// object and shouldComponentUpdate will always return true.

export default function finalPropsSelectorFactory<
  TStateProps,
  TOwnProps,
  TDispatchProps,
  TMergedProps,
  State = DefaultRootState
>(
  dispatch: Dispatch<Action>,
  {
    initMapStateToProps,
    initMapDispatchToProps,
    initMergeProps,
    ...options
  }: SelectorFactoryOptions<
    TStateProps,
    TOwnProps,
    TDispatchProps,
    TMergedProps,
    State
  >
) {
  const mapStateToProps = initMapStateToProps(dispatch, options)
  const mapDispatchToProps = initMapDispatchToProps(dispatch, options)
  const mergeProps = initMergeProps(dispatch, options)

  if (process.env.NODE_ENV !== 'production') {
    verifySubselectors(mapStateToProps, mapDispatchToProps, mergeProps)
  }

  const selectorFactory = options.pure
    ? pureFinalPropsSelectorFactory
    : impureFinalPropsSelectorFactory

  return selectorFactory(
    // @ts-ignore
    mapStateToProps!,
    mapDispatchToProps,
    mergeProps,
    dispatch,
    options
  )
}
