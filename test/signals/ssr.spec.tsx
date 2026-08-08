/**
 * Server rendering and hydration parity between stock `useSelector` and
 * `useSignalSelector`.
 *
 * Imports `Provider`/`useSelector` from their source modules rather than
 * `src/index`, so these are unaffected by the local benchmark override
 * in `src/exports.ts`.
 */
import { configureStore, createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import * as rtl from '@testing-library/react'
import React from 'react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Provider from '../../src/components/Provider'
import { useSelector } from '../../src/hooks/useSelector'
import { useSignalContext } from '../../src/signals/context'
import type { PathSignalRegistry } from '../../src/signals/pathSignalRegistry'
import { SignalProvider } from '../../src/signals/SignalProvider'
import { unwrap } from '../../src/signals/trackingProxy'
import { useSignalSelector } from '../../src/signals/useSignalSelector'

interface Todo {
  id: number
  text: string
  done: boolean
}

interface AppState {
  count: number
  todos: Todo[]
  user: { name: string; prefs: { theme: string } }
}

const initialState: AppState = {
  count: 0,
  todos: [
    { id: 1, text: 'first', done: false },
    { id: 2, text: 'second', done: true },
  ],
  user: { name: 'mark', prefs: { theme: 'dark' } },
}

const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    increment(state) {
      state.count += 1
    },
    setTheme(state, action: PayloadAction<string>) {
      state.user.prefs.theme = action.payload
    },
    toggle(state, action: PayloadAction<number>) {
      const todo = state.todos.find((t) => t.id === action.payload)
      if (todo) todo.done = !todo.done
    },
  },
})

const { increment, setTheme } = appSlice.actions

function makeStore(preloadedState?: AppState) {
  return configureStore({
    reducer: appSlice.reducer,
    preloadedState,
    middleware: (getDefault) =>
      getDefault({ immutableCheck: false, serializableCheck: false }),
  })
}

const selectCount = (state: AppState) => state.count
const selectTheme = (state: AppState) => state.user.prefs.theme
const selectDoneCount = (state: AppState) =>
  state.todos.filter((t) => t.done).length
const selectTexts = (state: AppState) => state.todos.map((t) => t.text).join(',')

function Body({
  useHook,
}: {
  useHook: <R>(selector: (state: AppState) => R) => R
}) {
  const count = useHook(selectCount)
  const theme = useHook(selectTheme)
  const done = useHook(selectDoneCount)
  const texts = useHook(selectTexts)
  return (
    <div>
      <span data-testid="count">{count}</span>
      <span data-testid="theme">{theme}</span>
      <span data-testid="done">{done}</span>
      <span data-testid="texts">{texts}</span>
    </div>
  )
}

describe('renderToString parity', () => {
  it('produces identical markup to stock useSelector', () => {
    const stockStore = makeStore()
    const signalStore = makeStore()

    const stockMarkup = renderToString(
      <Provider store={stockStore}>
        <Body useHook={useSelector} />
      </Provider>,
    )
    const signalMarkup = renderToString(
      <SignalProvider store={signalStore}>
        <Body useHook={useSignalSelector} />
      </SignalProvider>,
    )

    expect(signalMarkup).toBe(stockMarkup)
  })

  it('reflects dispatches applied before rendering', () => {
    const stockStore = makeStore()
    const signalStore = makeStore()
    for (const store of [stockStore, signalStore]) {
      store.dispatch(increment())
      store.dispatch(increment())
      store.dispatch(setTheme('light'))
    }

    const stockMarkup = renderToString(
      <Provider store={stockStore}>
        <Body useHook={useSelector} />
      </Provider>,
    )
    const signalMarkup = renderToString(
      <SignalProvider store={signalStore}>
        <Body useHook={useSignalSelector} />
      </SignalProvider>,
    )

    expect(signalMarkup).toBe(stockMarkup)
    expect(signalMarkup).toContain('light')
    expect(signalMarkup).toContain('2')
  })

  it('never leaks a tracking proxy into the selector result on the server', () => {
    const store = makeStore()
    const seen: unknown[] = []
    function Capture() {
      const user = useSignalSelector((state: AppState) => state.user)
      seen.push(user)
      return <div>{user.name}</div>
    }

    renderToString(
      <SignalProvider store={store}>
        <Capture />
      </SignalProvider>,
    )

    expect(seen).toHaveLength(1)
    expect(seen[0]).toBe(store.getState().user)
    expect(unwrap(seen[0])).toBe(seen[0])
  })

  it('registers nothing in the registry, because subscribe never runs', () => {
    const store = makeStore()
    let registry: PathSignalRegistry | undefined

    function Probe() {
      registry = useSignalContext<AppState>().registry
      const count = useSignalSelector(selectCount)
      const theme = useSignalSelector(selectTheme)
      return (
        <div>
          {count}
          {theme}
        </div>
      )
    }

    const markup = renderToString(
      <SignalProvider store={store}>
        <Probe />
      </SignalProvider>,
    )
    expect(markup).toContain('dark')

    expect(registry).toBeDefined()
    expect(registry!.size()).toBe(0)
    expect(registry!.segmentIndex.size()).toBe(0)
  })
})

describe('hydration', () => {
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

  afterEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  // React 18's server renderer warns that `useLayoutEffect` does nothing on
  // the server. Stock `Provider` triggers it too — both providers subscribe
  // through `useIsomorphicLayoutEffect`, which resolves to `useLayoutEffect`
  // under jsdom. These tests are about hydration mismatches, so the spy is
  // reset here to cover only the `hydrateRoot` call that follows.
  function mountMarkup(markup: string) {
    const rootDiv = document.createElement('div')
    document.body.appendChild(rootDiv)
    rootDiv.innerHTML = markup
    consoleErrorSpy.mockClear()
    return rootDiv
  }

  it('hydrates cleanly when the client store matches the server state', async () => {
    const ssrStore = makeStore()
    ssrStore.dispatch(increment())
    const serverState = ssrStore.getState()

    const markup = renderToString(
      <SignalProvider store={ssrStore}>
        <Body useHook={useSignalSelector} />
      </SignalProvider>,
    )
    const rootDiv = mountMarkup(markup)

    const clientStore = makeStore(serverState)
    await rtl.act(async () => {
      hydrateRoot(
        rootDiv,
        <SignalProvider store={clientStore}>
          <Body useHook={useSignalSelector} />
        </SignalProvider>,
        { onRecoverableError: (error) => console.error(error) },
      )
    })

    expect(consoleErrorSpy).not.toHaveBeenCalled()
    expect(rtl.screen.getByTestId('count').textContent).toBe('1')
  })

  it('stays reactive after hydration', async () => {
    const ssrStore = makeStore()
    const serverState = ssrStore.getState()
    const markup = renderToString(
      <SignalProvider store={ssrStore}>
        <Body useHook={useSignalSelector} />
      </SignalProvider>,
    )
    const rootDiv = mountMarkup(markup)

    const clientStore = makeStore(serverState)
    await rtl.act(async () => {
      hydrateRoot(
        rootDiv,
        <SignalProvider store={clientStore}>
          <Body useHook={useSignalSelector} />
        </SignalProvider>,
        { onRecoverableError: (error) => console.error(error) },
      )
    })
    expect(consoleErrorSpy).not.toHaveBeenCalled()

    await rtl.act(async () => {
      clientStore.dispatch(increment())
      clientStore.dispatch(setTheme('light'))
    })

    expect(rtl.screen.getByTestId('count').textContent).toBe('1')
    expect(rtl.screen.getByTestId('theme').textContent).toBe('light')
  })

  it('warns on mismatch when the client store diverged and no serverState is given', async () => {
    const ssrStore = makeStore()
    const serverState = ssrStore.getState()
    const markup = renderToString(
      <SignalProvider store={ssrStore}>
        <Body useHook={useSignalSelector} />
      </SignalProvider>,
    )
    const rootDiv = mountMarkup(markup)

    const clientStore = makeStore(serverState)
    clientStore.dispatch(increment())

    await rtl.act(async () => {
      hydrateRoot(
        rootDiv,
        <SignalProvider store={clientStore}>
          <Body useHook={useSignalSelector} />
        </SignalProvider>,
        { onRecoverableError: (error) => console.error(error) },
      )
    })

    expect(consoleErrorSpy).toHaveBeenCalled()
  })

  it('serverState suppresses the mismatch, matching stock Provider', async () => {
    const ssrStore = makeStore()
    const serverState = ssrStore.getState()
    const markup = renderToString(
      <SignalProvider store={ssrStore}>
        <Body useHook={useSignalSelector} />
      </SignalProvider>,
    )

    // Stock control: `<Provider serverState>` feeds `getServerSnapshot`
    // and hydration is clean.
    const stockRoot = mountMarkup(markup)
    const stockClientStore = makeStore(serverState)
    stockClientStore.dispatch(increment())
    await rtl.act(async () => {
      hydrateRoot(
        stockRoot,
        <Provider store={stockClientStore} serverState={serverState}>
          <Body useHook={useSelector} />
        </Provider>,
        { onRecoverableError: (error) => console.error(error) },
      )
    })
    expect(consoleErrorSpy).not.toHaveBeenCalled()
    vi.clearAllMocks()
    document.body.innerHTML = ''

    const signalRoot = mountMarkup(markup)
    const signalClientStore = makeStore(serverState)
    signalClientStore.dispatch(increment())
    await rtl.act(async () => {
      hydrateRoot(
        signalRoot,
        <SignalProvider store={signalClientStore} serverState={serverState}>
          <Body useHook={useSignalSelector} />
        </SignalProvider>,
        { onRecoverableError: (error) => console.error(error) },
      )
    })
    expect(consoleErrorSpy).not.toHaveBeenCalled()
    // Post-hydration render reads the client store, so the diverged
    // value shows up.
    expect(rtl.screen.getByTestId('count').textContent).toBe('1')
  })

  it('stays reactive after a serverState hydration', async () => {
    const ssrStore = makeStore()
    const serverState = ssrStore.getState()
    const markup = renderToString(
      <SignalProvider store={ssrStore}>
        <Body useHook={useSignalSelector} />
      </SignalProvider>,
    )
    const rootDiv = mountMarkup(markup)

    const clientStore = makeStore(serverState)
    clientStore.dispatch(setTheme('light'))
    await rtl.act(async () => {
      hydrateRoot(
        rootDiv,
        <SignalProvider store={clientStore} serverState={serverState}>
          <Body useHook={useSignalSelector} />
        </SignalProvider>,
        { onRecoverableError: (error) => console.error(error) },
      )
    })
    expect(consoleErrorSpy).not.toHaveBeenCalled()
    expect(rtl.screen.getByTestId('theme').textContent).toBe('light')

    await rtl.act(async () => {
      clientStore.dispatch(increment())
      clientStore.dispatch(setTheme('sepia'))
    })
    expect(rtl.screen.getByTestId('count').textContent).toBe('1')
    expect(rtl.screen.getByTestId('theme').textContent).toBe('sepia')
  })

  it('mixed tree: stock and signal hooks hydrate together without mismatch', async () => {
    const ssrStore = makeStore()
    ssrStore.dispatch(setTheme('light'))
    const serverState = ssrStore.getState()

    function Mixed() {
      const stockCount = useSelector(selectCount)
      const signalTheme = useSignalSelector(selectTheme)
      return (
        <div>
          <span data-testid="stock">{stockCount}</span>
          <span data-testid="signal">{signalTheme}</span>
        </div>
      )
    }

    const markup = renderToString(
      <SignalProvider store={ssrStore}>
        <Mixed />
      </SignalProvider>,
    )
    const rootDiv = mountMarkup(markup)

    const clientStore = makeStore(serverState)
    await rtl.act(async () => {
      hydrateRoot(
        rootDiv,
        <SignalProvider store={clientStore}>
          <Mixed />
        </SignalProvider>,
        { onRecoverableError: (error) => console.error(error) },
      )
    })

    expect(consoleErrorSpy).not.toHaveBeenCalled()
    expect(rtl.screen.getByTestId('signal').textContent).toBe('light')

    await rtl.act(async () => {
      clientStore.dispatch(increment())
    })
    expect(rtl.screen.getByTestId('stock').textContent).toBe('1')
  })
})
