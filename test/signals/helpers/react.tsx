import * as rtl from '@testing-library/react'
import * as React from 'react'
import type { Action, Store } from 'redux'
import { useSignalContext } from '../../../src/signals/context'
import type { PathSignalRegistry } from '../../../src/signals/pathSignalRegistry'
import { SignalProvider } from '../../../src/signals/SignalProvider'
import { useSignalSelector } from '../../../src/signals/useSignalSelector'

/**
 * A `Capture` component that records the registry of the enclosing
 * `SignalProvider`, and `registry()` to read it back after render.
 */
export function createRegistryCapture() {
  let captured: PathSignalRegistry | null = null
  function Capture() {
    captured = useSignalContext().registry
    return null
  }
  function registry(): PathSignalRegistry {
    if (captured === null) throw new Error('registry not captured')
    return captured
  }
  function reset() {
    captured = null
  }
  return { Capture, registry, reset }
}

/** Renders one `useSignalSelector` hook; `seen.current` holds its latest
 *  result. */
export function renderSignalSelector<S extends object, R>(
  store: Store<S>,
  selector: (state: S) => R,
) {
  const seen: { current: R | undefined } = { current: undefined }
  function Comp() {
    seen.current = useSignalSelector(selector)
    return null
  }
  rtl.render(
    <SignalProvider store={store}>
      <Comp />
    </SignalProvider>,
  )
  return seen
}

/** Two dispatches in the selector's segment move a mounted hook past the
 *  probe tier, so it runs through tracking proxies from then on. */
export function promoteToDeepTier<A extends Action>(
  store: { dispatch(action: A): unknown },
  action: A,
) {
  rtl.act(() => {
    store.dispatch(action)
  })
  rtl.act(() => {
    store.dispatch(action)
  })
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      return <div data-testid="boundary">{this.state.error.message}</div>
    }
    return this.props.children
  }
}
