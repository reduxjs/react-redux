export { SignalProvider } from './SignalProvider'
export type { SignalProviderProps } from './SignalProvider'

export {
  createSignalSelectorHook,
  useSignalSelector,
} from './useSignalSelector'
export type { UseSignalSelector } from './useSignalSelector'

export { createSignalContextHook, useSignalContext } from './context'
export type { SignalContextValue } from './context'

export { alienEngine } from './engine'
export type {
  PathKey,
  ReactiveSignal,
  ReactiveComputed,
  SignalEngine,
  SignalScope,
} from './types'

export { createPathSignalRegistry } from './pathSignalRegistry'
export type { PathSignalRegistry } from './pathSignalRegistry'

export { createTrackingProxy, unwrap } from './trackingProxy'

export { default as shallowEqual } from '../utils/shallowEqual'

export { diffAndUpdateSignals, reconcileState } from './diff'
