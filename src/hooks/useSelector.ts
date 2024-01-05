//import * as React from 'react'
import { React } from '../utils/react'

import type { ReactReduxContextValue } from '../components/Context'
import { ReactReduxContext } from '../components/Context'
import type { EqualityFn, NoInfer, TypedUseSelectorHook } from '../types'
import type { uSESWS } from '../utils/useSyncExternalStore'
import { notInitialized } from '../utils/useSyncExternalStore'
import {
  createReduxContextHook,
  useReduxContext as useDefaultReduxContext,
} from './useReduxContext'

/**
 * The frequency of development mode checks.
 *
 * @since 8.1.0
 * @internal
 */
export type DevModeCheckFrequency = 'never' | 'once' | 'always'

/**
 * Represents the configuration for development mode checks.
 *
 * @since 9.0.0
 * @internal
 */
export interface DevModeChecks {
  /**
   * Overrides the global stability check for the selector.
   * - `once` - Run only the first time the selector is called.
   * - `always` - Run every time the selector is called.
   * - `never` - Never run the stability check.
   *
   * @default 'once'
   *
   * @since 8.1.0
   */
  stabilityCheck: DevModeCheckFrequency

  /**
   * Overrides the global identity function check for the selector.
   * - `once` - Run only the first time the selector is called.
   * - `always` - Run every time the selector is called.
   * - `never` - Never run the identity function check.
   *
   * **Note**: Previously referred to as `noopCheck`.
   *
   * @default 'once'
   *
   * @since 9.0.0
   */
  identityFunctionCheck: DevModeCheckFrequency
}

export interface UseSelectorOptions<Selected = unknown> {
  equalityFn?: EqualityFn<Selected>

  /**
   * `useSelector` performs additional checks in development mode to help
   * identify and warn about potential issues in selector behavior. This
   * option allows you to customize the behavior of these checks per selector.
   *
   * @since 9.0.0
   */
  devModeChecks?: Partial<DevModeChecks>
}

export interface UseSelector {
  <TState = unknown, Selected = unknown>(
    selector: (state: TState) => Selected,
    equalityFn?: EqualityFn<Selected>
  ): Selected
  <TState = unknown, Selected = unknown>(
    selector: (state: TState) => Selected,
    options?: UseSelectorOptions<Selected>
  ): Selected
  withTypes: <TState>() => TypedUseSelectorHook<TState>
}
// export interface UseSelector<StateType = unknown> {
//   <TState extends StateType = StateType, Selected = unknown>(
//     selector: (state: TState) => Selected,
//     equalityFn?: EqualityFn<Selected>
//   ): Selected
//   <TState extends StateType = StateType, Selected = unknown>(
//     selector: (state: TState) => Selected,
//     options?: UseSelectorOptions<Selected>
//   ): Selected
//   withTypes: <
//     OverrideStateType extends StateType
//   >() => UseSelector<OverrideStateType>
// }

let useSyncExternalStoreWithSelector = notInitialized as uSESWS
export const initializeUseSelector = (fn: uSESWS) => {
  useSyncExternalStoreWithSelector = fn
}

const refEquality: EqualityFn<any> = (a, b) => a === b

/**
 * Hook factory, which creates a `useSelector` hook bound to a given context.
 *
 * @param {React.Context} [context=ReactReduxContext] Context passed to your `<Provider>`.
 * @returns {Function} A `useSelector` hook bound to the specified context.
 */
export function createSelectorHook(
  context: React.Context<ReactReduxContextValue<
    any,
    any
  > | null> = ReactReduxContext
): UseSelector {
  const useReduxContext =
    context === ReactReduxContext
      ? useDefaultReduxContext
      : createReduxContextHook(context)

  const useSelector = <TState, Selected extends unknown>(
    selector: (state: TState) => Selected,
    equalityFnOrOptions:
      | EqualityFn<NoInfer<Selected>>
      | UseSelectorOptions<NoInfer<Selected>> = {}
  ): Selected => {
    const { equalityFn = refEquality, devModeChecks = {} } =
      typeof equalityFnOrOptions === 'function'
        ? { equalityFn: equalityFnOrOptions }
        : equalityFnOrOptions
    if (process.env.NODE_ENV !== 'production') {
      if (!selector) {
        throw new Error(`You must pass a selector to useSelector`)
      }
      if (typeof selector !== 'function') {
        throw new Error(`You must pass a function as a selector to useSelector`)
      }
      if (typeof equalityFn !== 'function') {
        throw new Error(
          `You must pass a function as an equality function to useSelector`
        )
      }
    }

    const {
      store,
      subscription,
      getServerState,
      stabilityCheck,
      identityFunctionCheck,
    } = useReduxContext()

    const firstRun = React.useRef(true)

    const wrappedSelector = React.useCallback<typeof selector>(
      {
        [selector.name](state: TState) {
          const selected = selector(state)
          if (process.env.NODE_ENV !== 'production') {
            const {
              identityFunctionCheck: finalIdentityFunctionCheck,
              stabilityCheck: finalStabilityCheck,
            } = {
              stabilityCheck,
              identityFunctionCheck,
              ...devModeChecks,
            }
            if (
              finalStabilityCheck === 'always' ||
              (finalStabilityCheck === 'once' && firstRun.current)
            ) {
              const toCompare = selector(state)
              if (!equalityFn(selected, toCompare)) {
                let stack: string | undefined = undefined
                try {
                  throw new Error()
                } catch (e) {
                  ;({ stack } = e as Error)
                }
                console.warn(
                  'Selector ' +
                    (selector.name || 'unknown') +
                    ' returned a different result when called with the same parameters. This can lead to unnecessary rerenders.' +
                    '\nSelectors that return a new reference (such as an object or an array) should be memoized: https://redux.js.org/usage/deriving-data-selectors#optimizing-selectors-with-memoization',
                  {
                    state,
                    selected,
                    selected2: toCompare,
                    stack,
                  }
                )
              }
            }
            if (
              finalIdentityFunctionCheck === 'always' ||
              (finalIdentityFunctionCheck === 'once' && firstRun.current)
            ) {
              // @ts-ignore
              if (selected === state) {
                let stack: string | undefined = undefined
                try {
                  throw new Error()
                } catch (e) {
                  ;({ stack } = e as Error)
                }
                console.warn(
                  'Selector ' +
                    (selector.name || 'unknown') +
                    ' returned the root state when called. This can lead to unnecessary rerenders.' +
                    '\nSelectors that return the entire state are almost certainly a mistake, as they will cause a rerender whenever *anything* in state changes.',
                  { stack }
                )
              }
            }
            if (firstRun.current) firstRun.current = false
          }
          return selected
        },
      }[selector.name],
      [selector, stabilityCheck, devModeChecks.stabilityCheck]
    )

    const selectedState = useSyncExternalStoreWithSelector(
      subscription.addNestedSub,
      store.getState,
      getServerState || store.getState,
      wrappedSelector,
      equalityFn
    )

    React.useDebugValue(selectedState)

    return selectedState
  }

  Object.assign(useSelector, {
    withTypes: () => useSelector,
  })

  return useSelector as UseSelector
}

/**
 * A hook to access the redux store's state. This hook takes a selector function
 * as an argument. The selector is called with the store state.
 *
 * This hook takes an optional equality comparison function as the second parameter
 * that allows you to customize the way the selected state is compared to determine
 * whether the component needs to be re-rendered.
 *
 * @param {Function} selector the selector function
 * @param {Function=} equalityFn the function that will be used to determine equality
 *
 * @returns {any} the selected state
 *
 * @example
 *
 * import React from 'react'
 * import { useSelector } from 'react-redux'
 *
 * export const CounterComponent = () => {
 *   const counter = useSelector(state => state.counter)
 *   return <div>{counter}</div>
 * }
 */
export const useSelector = /*#__PURE__*/ createSelectorHook()
