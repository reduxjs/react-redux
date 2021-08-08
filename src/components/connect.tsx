/* eslint-disable valid-jsdoc, @typescript-eslint/no-unused-vars */
import hoistStatics from 'hoist-non-react-statics'
import React, { useCallback, useContext, useMemo } from 'react'
import { isContextConsumer, isValidElementType } from 'react-is'
import type { Dispatch, Store } from 'redux'

import type {
  AdvancedComponentDecorator,
  ConnectedComponent,
  DefaultRootState,
  InferableComponentEnhancer,
  InferableComponentEnhancerWithProps,
  ResolveThunks,
  DispatchProp,
} from '../types'

import defaultSelectorFactory, {
  MapStateToPropsParam,
  MapDispatchToPropsParam,
  MergeProps,
  MapDispatchToPropsNonObject,
  SelectorFactoryOptions,
} from '../connect/selectorFactory'
import defaultMapDispatchToPropsFactories from '../connect/mapDispatchToProps'
import defaultMapStateToPropsFactories from '../connect/mapStateToProps'
import defaultMergePropsFactories from '../connect/mergeProps'

import shallowEqual from '../utils/shallowEqual'

import {
  ReactReduxContext,
  ReactReduxContextValue,
  ReactReduxContextInstance,
} from './Context'
import { createReduxContext } from './Provider'
import { useStoreSource } from '../utils/useStoreSource'

// Define some constant arrays just to avoid re-creating these
const EMPTY_ARRAY: [unknown, number] = [null, 0]
const NO_SUBSCRIPTION_ARRAY = [null, null]

// Attempts to stringify whatever not-really-a-component value we were given
// for logging in an error message
const stringifyComponent = (Comp: unknown) => {
  try {
    return JSON.stringify(Comp)
  } catch (err) {
    return String(Comp)
  }
}

// Reducer for our "forceUpdate" equivalent.
// This primarily stores the current error, if any,
// but also an update counter.
// Since we're returning a new array anyway, in theory the counter isn't needed.
// Or for that matter, since the dispatch gets a new object, we don't even need an array.
function storeStateUpdatesReducer(
  state: [unknown, number],
  action: { payload: unknown }
) {
  const [, updateCount] = state
  return [action.payload, updateCount + 1]
}

export interface ConnectProps {
  reactReduxForwardedRef?: React.ForwardedRef<unknown>
  context?: ReactReduxContextInstance
  store?: Store
}

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
> {
  forwardRef?: boolean
  context?: typeof ReactReduxContext
  pure?: boolean
  areStatesEqual?: (nextState: State, prevState: State) => boolean

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
function connect<
  TStateProps = {},
  TDispatchProps = {},
  TOwnProps = {},
  TMergedProps = {},
  State = DefaultRootState
>(
  mapStateToProps?: MapStateToPropsParam<TStateProps, TOwnProps, State>,
  mapDispatchToProps?: MapDispatchToPropsParam<TDispatchProps, TOwnProps>,
  mergeProps?: MergeProps<TStateProps, TDispatchProps, TOwnProps, TMergedProps>,
  {
    pure = true,
    areStatesEqual = strictEqual,
    areOwnPropsEqual = shallowEqual,
    areStatePropsEqual = shallowEqual,
    areMergedPropsEqual = shallowEqual,

    // use React's forwardRef to expose a ref of the wrapped component
    forwardRef = false,

    // the context consumer to use
    context = ReactReduxContext,
  }: ConnectOptions<unknown, unknown, unknown, unknown> = {}
): unknown {
  const Context = context

  type WrappedComponentProps = TOwnProps & ConnectProps

  const initMapStateToProps = match(
    mapStateToProps,
    // @ts-ignore
    defaultMapStateToPropsFactories,
    'mapStateToProps'
  )!
  const initMapDispatchToProps = match(
    mapDispatchToProps,
    // @ts-ignore
    defaultMapDispatchToPropsFactories,
    'mapDispatchToProps'
  )!
  const initMergeProps = match(
    mergeProps,
    // @ts-ignore
    defaultMergePropsFactories,
    'mergeProps'
  )!

  const shouldHandleStateChanges = Boolean(mapStateToProps)

  const wrapWithConnect: AdvancedComponentDecorator<
    TOwnProps,
    WrappedComponentProps
  > = ((WrappedComponent) => {
    if (
      process.env.NODE_ENV !== 'production' &&
      !isValidElementType(WrappedComponent)
    ) {
      throw new Error(
        `You must pass a component to the function returned by connect. Instead received ${stringifyComponent(
          WrappedComponent
        )}`
      )
    }

    const wrappedComponentName =
      WrappedComponent.displayName || WrappedComponent.name || 'Component'

    const displayName = `Connect(${wrappedComponentName})`

    const selectorFactoryOptions: SelectorFactoryOptions<any, any, any, any> = {
      pure,
      shouldHandleStateChanges,
      displayName,
      wrappedComponentName,
      WrappedComponent,
      initMapStateToProps,
      initMapDispatchToProps,
      // @ts-ignore
      initMergeProps,
      areStatesEqual,
      areStatePropsEqual,
      areOwnPropsEqual,
      areMergedPropsEqual,
    }

    const useChildPropsSelector = (context: ReactReduxContextValue) => {
      return useMemo(
        () =>
          defaultSelectorFactory(
            context.store.dispatch,
            selectorFactoryOptions
          ),
        [context.store]
      )
    }

    const useStateAndSubscribe = (
      context: ReactReduxContextValue,
      wrapperProps: Omit<WrappedComponentProps, 'reactReduxForwardedRef'>
    ) => {
      const childPropsSelector = useChildPropsSelector(context)
      const getSnapshot = useCallback(
        (store) => childPropsSelector(store.getState(), wrapperProps),
        [childPropsSelector, wrapperProps]
      )
      return useStoreSource(context!.storeSource, getSnapshot)
    }

    const useDispatchOnly = (
      context: ReactReduxContextValue,
      wrapperProps: Omit<WrappedComponentProps, 'reactReduxForwardedRef'>
    ) => {
      const childPropsSelector = useChildPropsSelector(context)
      return childPropsSelector(context.store.getState(), wrapperProps)
    }

    const useReduxContext = shouldHandleStateChanges
      ? useStateAndSubscribe
      : useDispatchOnly

    function ConnectFunction(props: ConnectProps & TOwnProps) {
      const [propsContext, reactReduxForwardedRef, wrapperProps] =
        useMemo(() => {
          // Distinguish between actual "data" props that were passed to the wrapper component,
          // and values needed to control behavior (forwarded refs, alternate context instances).
          // To maintain the wrapperProps object reference, memoize this destructuring.
          const { reactReduxForwardedRef, ...wrapperProps } = props
          return [props.context, reactReduxForwardedRef, wrapperProps]
        }, [props])

      const ContextToUse: ReactReduxContextInstance = useMemo(() => {
        // Users may optionally pass in a custom context instance to use instead of our ReactReduxContext.
        // Memoize the check that determines which context instance we should use.
        return propsContext &&
          propsContext.Consumer &&
          // @ts-ignore
          isContextConsumer(<propsContext.Consumer />)
          ? propsContext
          : Context
      }, [propsContext, Context])

      // Retrieve the store and ancestor subscription via context, if available
      const contextValue = useContext(ContextToUse)

      // The store _must_ exist as either a prop or in context.
      // We'll check to see if it _looks_ like a Redux store first.
      // This allows us to pass through a `store` prop that is just a plain value.
      const didStoreComeFromProps =
        Boolean(props.store) &&
        Boolean(props.store!.getState) &&
        Boolean(props.store!.dispatch)
      const didStoreComeFromContext =
        Boolean(contextValue) &&
        Boolean(contextValue!.storeSource) &&
        Boolean(contextValue!.store)

      if (
        process.env.NODE_ENV !== 'production' &&
        !didStoreComeFromProps &&
        !didStoreComeFromContext
      ) {
        throw new Error(
          `Could not find "store" in the context of ` +
            `"${displayName}". Either wrap the root component in a <Provider>, ` +
            `or pass a custom React context provider to <Provider> and the corresponding ` +
            `React context consumer to ${displayName} in connect options.`
        )
      }

      const reduxContextValue: ReactReduxContextValue = useMemo(() => {
        // Based on the previous check, one of these must be true
        return didStoreComeFromProps
          ? createReduxContext(props.store!)
          : contextValue!
      }, [didStoreComeFromProps, props.store, contextValue])

      const childProps = useReduxContext(reduxContextValue, wrapperProps)

      // Now that all that's done, we can finally try to actually render the child component.
      // We memoize the elements for the rendered child component as an optimization.
      return useMemo(
        () => (
          // @ts-ignore
          <WrappedComponent {...childProps} ref={reactReduxForwardedRef} />
        ),
        [reactReduxForwardedRef, WrappedComponent, childProps]
      )
    }

    // If we're in "pure" mode, ensure our wrapper component only re-renders when incoming props have changed.
    const _Connect = pure ? React.memo(ConnectFunction) : ConnectFunction

    type ConnectedWrapperComponent = typeof _Connect & {
      WrappedComponent: typeof WrappedComponent
    }

    const Connect = _Connect as ConnectedComponent<
      typeof WrappedComponent,
      WrappedComponentProps
    >
    Connect.WrappedComponent = WrappedComponent
    Connect.displayName = ConnectFunction.displayName = displayName

    if (forwardRef) {
      const _forwarded = React.forwardRef(function forwardConnectRef(
        props,
        ref
      ) {
        // @ts-ignore
        return <Connect {...props} reactReduxForwardedRef={ref} />
      })

      const forwarded = _forwarded as unknown as ConnectedWrapperComponent
      forwarded.displayName = displayName
      forwarded.WrappedComponent = WrappedComponent
      return hoistStatics(forwarded, WrappedComponent)
    }

    return hoistStatics(Connect, WrappedComponent)
  }) as AdvancedComponentDecorator<TOwnProps, WrappedComponentProps>

  return wrapWithConnect
}

export default connect
