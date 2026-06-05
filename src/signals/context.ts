import type { Action, UnknownAction } from 'redux'
import { React } from '../utils/react'
import type { ReactReduxContextValue } from '../components/Context'
import { ReactReduxContext } from '../components/Context'
import type { PathSignalRegistry } from './pathSignalRegistry'
import type { SignalEngine } from './types'

export interface SignalContextValue<
  SS = any,
  A extends Action<string> = UnknownAction,
> extends ReactReduxContextValue<SS, A> {
  registry: PathSignalRegistry
  engine: SignalEngine
}

export { ReactReduxContext }

export function useSignalContext<S>(): SignalContextValue<S> {
  const contextValue = React.useContext(
    ReactReduxContext as React.Context<SignalContextValue<S> | null>,
  )

  if (!contextValue) {
    throw new Error(
      'useSignalSelector must be used within a <SignalProvider>',
    )
  }

  // Verify this is actually a signal context (has registry + engine)
  if (!('registry' in contextValue) || !('engine' in contextValue)) {
    throw new Error(
      'useSignalSelector must be used within a <SignalProvider>, not a regular <Provider>',
    )
  }

  return contextValue
}
