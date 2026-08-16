import type { Action, UnknownAction } from 'redux'
import { React } from '../utils/react'
import type { ReactReduxContextValue } from '../components/Context'
import { ReactReduxContext } from '../components/Context'
import type { PathSignalRegistry } from './pathSignalRegistry'

export interface SignalContextValue<
  SS = any,
  A extends Action<string> = UnknownAction,
> extends ReactReduxContextValue<SS, A> {
  registry: PathSignalRegistry
}

export { ReactReduxContext }

/**
 * Hook factory, which creates a `useSignalContext` hook bound to a given
 * context. Mirrors stock `createReduxContextHook`, but validates that the
 * context value came from a `<SignalProvider>` (registry present).
 *
 * @param context - Context passed to your `<SignalProvider>`.
 * @returns A `useSignalContext` hook bound to the given context.
 */
export function createSignalContextHook(
  context: React.Context<ReactReduxContextValue<
    any,
    any
  > | null> = ReactReduxContext,
) {
  return function useSignalContext<S>(): SignalContextValue<S> {
    const contextValue = React.useContext(
      context as unknown as React.Context<SignalContextValue<S> | null>,
    )

    if (!contextValue) {
      throw new Error(
        'useSignalSelector must be used within a <SignalProvider>',
      )
    }

    // Verify this is actually a signal context (has registry)
    if (!('registry' in contextValue)) {
      throw new Error(
        'useSignalSelector must be used within a <SignalProvider>, not a regular <Provider>',
      )
    }

    return contextValue
  }
}

/**
 * Reads the signal context bound to the default `ReactReduxContext`.
 */
export const useSignalContext = /* @__PURE__ */ createSignalContextHook()
