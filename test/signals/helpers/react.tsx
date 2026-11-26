import * as rtl from '@testing-library/react'
import * as React from 'react'
import { legacy_createStore as createStore } from 'redux'
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

type Replace = { type: 'replace'; payload: object }
/** A reducer whose only action, `replace`, swaps in a whole new state. */
export const replaceReducer = (
  s: object = {},
  a: Replace | { type: string },
) => (a.type === 'replace' ? (a as Replace).payload : s)

const cloneShallow = (v: unknown): unknown =>
  Array.isArray(v) ? [...v] : v !== null && typeof v === 'object' ? { ...v } : v

/**
 * Renders one `useSignalSelector` hook over a store whose only action
 * replaces the whole state, then promotes it to the deep tier.
 * `unmountHook()` unmounts the hook but keeps the provider mounted, so
 * `registry.current` can be checked for leftovers.
 */
export function renderPromotedWithReplace<S extends object>(
  initial: S,
  selector: (s: S) => unknown,
) {
  const store = createStore(replaceReducer, initial)
  const seen: { current: unknown } = { current: undefined }
  const registry: { current: PathSignalRegistry | undefined } = {
    current: undefined,
  }
  function Grab() {
    registry.current = useSignalContext().registry
    return null
  }
  function Comp() {
    seen.current = useSignalSelector(selector)
    return null
  }
  const view = rtl.render(
    <SignalProvider store={store}>
      <Grab />
      <Comp />
    </SignalProvider>,
  )
  const replace = (payload: object) =>
    rtl.act(() => {
      store.dispatch({ type: 'replace', payload })
    })
  // New references for every root value wake the hook's coarse
  // subscription and move it to the deep (signal-tracked) tier.
  const state = store.getState() as Record<string, unknown>
  replace(
    Object.fromEntries(
      Object.entries(state).map(([k, v]) => [k, cloneShallow(v)]),
    ),
  )
  const unmountHook = () =>
    view.rerender(
      <SignalProvider store={store}>
        <Grab />
      </SignalProvider>,
    )
  return { replace, seen, registry, unmountHook }
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
