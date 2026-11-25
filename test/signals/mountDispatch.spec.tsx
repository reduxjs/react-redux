/**
 * A child that dispatches from its own mount effects runs before the
 * provider's subscribe effect (child layout effects fire before the
 * parent's). The provider must pick up that dispatch, and every later
 * dispatch must be diffed against the state the components actually
 * rendered — not the state from the provider's first render. The
 * decisive step is a later dispatch that changes a path only the mount
 * dispatch touched, especially one that puts it back to its original
 * value: diffed against a stale baseline, that path looks unchanged.
 */
import { configureStore } from '@reduxjs/toolkit'
import * as rtl from '@testing-library/react'
import type { ReactNode } from 'react'
import React, { StrictMode, useEffect, useLayoutEffect } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  connect,
  Provider as StockProvider,
  useSelector as useStockSelector,
} from '../../src/index'
import { SignalProvider, useSignalSelector } from '../../src/signals'

afterEach(() => {
  rtl.cleanup()
})

interface State {
  a: { x: number }
  b: { y: number }
}

const makeStore = () =>
  configureStore({
    reducer: {
      a: (state = { x: 0 }, action: any) =>
        action.type === 'setX' ? { x: action.payload } : state,
      b: (state = { y: 0 }, action: any) =>
        action.type === 'setY' ? { y: action.payload } : state,
    },
  })

type Store = ReturnType<typeof makeStore>

const implementations = [
  {
    name: 'stock',
    Provider: StockProvider as (p: {
      store: Store
      children: ReactNode
    }) => ReactNode,
    useSel: useStockSelector,
  },
  {
    name: 'signals',
    Provider: SignalProvider as (p: {
      store: Store
      children: ReactNode
    }) => ReactNode,
    useSel: useSignalSelector,
  },
] as const

const effectKinds = [
  { name: 'useLayoutEffect', useMountEffect: useLayoutEffect },
  { name: 'useEffect', useMountEffect: useEffect },
] as const

describe.each(implementations)('$name: dispatch from a mount effect', (impl) => {
  const { Provider, useSel } = impl

  describe.each(effectKinds)('$name', ({ useMountEffect }) => {
    describe.each([
      { mode: 'plain', wrap: (n: ReactNode) => n },
      {
        mode: 'StrictMode',
        wrap: (n: ReactNode) => <StrictMode>{n}</StrictMode>,
      },
    ])('$mode', ({ wrap }) => {
      function setup() {
        const store = makeStore()
        const seenX: number[] = []
        const seenY: number[] = []

        function MountDispatcher() {
          useMountEffect(() => {
            if (store.getState().a.x === 0) {
              store.dispatch({ type: 'setX', payload: 1 })
            }
          }, [])
          return null
        }
        function ReadX() {
          const x = useSel((s: State) => s.a.x)
          seenX.push(x)
          return <div data-testid="x">{x}</div>
        }
        function ReadY() {
          const y = useSel((s: State) => s.b.y)
          seenY.push(y)
          return <div data-testid="y">{y}</div>
        }

        const utils = rtl.render(
          wrap(
            <Provider store={store}>
              <ReadX />
              <MountDispatcher />
              <ReadY />
            </Provider>,
          ),
        )
        const text = (id: string) => utils.getByTestId(id).textContent
        return { store, text, seenX, seenY }
      }

      it('shows the mount dispatch', () => {
        const { store, text } = setup()
        expect(store.getState().a.x).toBe(1)
        expect(text('x')).toBe('1')
        expect(text('y')).toBe('0')
      })

      it('sees a later dispatch that puts the mount-dispatched path back', () => {
        const { store, text } = setup()
        expect(text('x')).toBe('1')

        rtl.act(() => {
          store.dispatch({ type: 'setX', payload: 0 })
        })
        expect(text('x')).toBe('0')
      })

      it('sees a later dispatch that changes the mount-dispatched path again', () => {
        const { store, text } = setup()

        rtl.act(() => {
          store.dispatch({ type: 'setX', payload: 2 })
        })
        expect(text('x')).toBe('2')

        rtl.act(() => {
          store.dispatch({ type: 'setX', payload: 0 })
        })
        expect(text('x')).toBe('0')
      })

      it('sees a revert after an unrelated dispatch in between', () => {
        const { store, text } = setup()

        rtl.act(() => {
          store.dispatch({ type: 'setY', payload: 5 })
        })
        expect(text('y')).toBe('5')
        expect(text('x')).toBe('1')

        rtl.act(() => {
          store.dispatch({ type: 'setX', payload: 0 })
        })
        expect(text('x')).toBe('0')
      })

      it('does not re-render an unrelated reader on a later dispatch', () => {
        const { store, text, seenY } = setup()
        const before = seenY.length

        rtl.act(() => {
          store.dispatch({ type: 'setX', payload: 0 })
        })
        expect(text('x')).toBe('0')
        if (impl.name === 'signals') {
          expect(seenY.length).toBe(before)
        }
      })
    })
  })
})

// A layout-effect dispatch in a child runs before the provider subscribes.
// A signal hook whose reads can't be gated by top-level key builds its
// path signals at subscribe time from the post-dispatch state, so the
// provider has to advance its diff baseline to that state too; otherwise
// a later revert diffs as "unchanged" and the hook keeps the stale value.
// The connected component covers the nested-subscription side of the same
// mount order.
describe.each(effectKindsForProviderCatchUp())(
  'SignalProvider catch-up after a layout-effect mount dispatch ($mode)',
  ({ wrap }) => {
    function MountDispatcher({ store }: { store: Store }) {
      useLayoutEffect(() => {
        if (store.getState().a.x === 0) {
          store.dispatch({ type: 'setX', payload: 1 })
        }
      }, [store])
      return null
    }

    it('a connected component before the dispatcher sees the dispatch and a later revert', () => {
      const store = makeStore()
      const ShowX = ({ x }: { x: number }) => <div data-testid="x">{x}</div>
      const ConnectedX = connect((s: State) => ({ x: s.a.x }))(ShowX)

      const { getByTestId } = rtl.render(
        wrap(
          <SignalProvider store={store}>
            <ConnectedX />
            <MountDispatcher store={store} />
          </SignalProvider>,
        ),
      )
      expect(getByTestId('x').textContent).toBe('1')

      rtl.act(() => {
        store.dispatch({ type: 'setX', payload: 0 })
      })
      expect(getByTestId('x').textContent).toBe('0')
    })

    it('a hook that builds its tracking at subscribe time sees a later revert', () => {
      const store = makeStore()

      // Enumerating the root keys makes the footprint impossible to gate
      // by top-level key, so the hook tracks paths from its first commit.
      const selectX = (s: State) => (Object.keys(s).length ? s.a.x : -1)
      function ReadX() {
        const x = useSignalSelector(selectX)
        return <div data-testid="x">{x}</div>
      }

      const { getByTestId } = rtl.render(
        wrap(
          <SignalProvider store={store}>
            <ReadX />
            <MountDispatcher store={store} />
          </SignalProvider>,
        ),
      )
      expect(getByTestId('x').textContent).toBe('1')

      rtl.act(() => {
        store.dispatch({ type: 'setX', payload: 0 })
      })
      expect(getByTestId('x').textContent).toBe('0')
    })

    it('a hook already tracking paths sees a revert after a later-mounted dispatcher', () => {
      const store = makeStore()
      const selectX = (s: State) => (Object.keys(s).length ? s.a.x : -1)
      function ReadX() {
        const x = useSignalSelector(selectX)
        return <div data-testid="x">{x}</div>
      }

      const ui = (withDispatcher: boolean) =>
        wrap(
          <SignalProvider store={store}>
            <ReadX />
            {withDispatcher && <MountDispatcher store={store} />}
          </SignalProvider>,
        )
      const { getByTestId, rerender } = rtl.render(ui(false))
      expect(getByTestId('x').textContent).toBe('0')

      rerender(ui(true))
      expect(getByTestId('x').textContent).toBe('1')

      rtl.act(() => {
        store.dispatch({ type: 'setX', payload: 0 })
      })
      expect(getByTestId('x').textContent).toBe('0')
    })
  },
)

function effectKindsForProviderCatchUp() {
  return [
    { mode: 'plain', wrap: (n: ReactNode) => n },
    {
      mode: 'StrictMode',
      wrap: (n: ReactNode) => <StrictMode>{n}</StrictMode>,
    },
  ]
}

describe.each(implementations)(
  '$name: the dispatching component reads the value it dispatched',
  ({ Provider, useSel }) => {
    it('a reader that dispatches from its own layout effect on mount', () => {
      const store = makeStore()

      function SelfDispatcher() {
        const x = useSel((s: State) => s.a.x)
        useLayoutEffect(() => {
          if (store.getState().a.x === 0) {
            store.dispatch({ type: 'setX', payload: 1 })
          }
        }, [])
        return <div data-testid="x">{x}</div>
      }

      const { getByTestId } = rtl.render(
        <Provider store={store}>
          <SelfDispatcher />
        </Provider>,
      )
      expect(getByTestId('x').textContent).toBe('1')

      rtl.act(() => {
        store.dispatch({ type: 'setX', payload: 0 })
      })
      expect(getByTestId('x').textContent).toBe('0')
    })

    it('a component mounted later dispatches from its layout effect', () => {
      const store = makeStore()

      function ReadX() {
        const x = useSel((s: State) => s.a.x)
        return <div data-testid="x">{x}</div>
      }
      function LateDispatcher() {
        useLayoutEffect(() => {
          store.dispatch({ type: 'setX', payload: 1 })
        }, [])
        return null
      }

      const ui = (late: boolean) => (
        <Provider store={store}>
          <ReadX />
          {late && <LateDispatcher />}
        </Provider>
      )
      const { getByTestId, rerender } = rtl.render(ui(false))
      expect(getByTestId('x').textContent).toBe('0')

      rerender(ui(true))
      expect(getByTestId('x').textContent).toBe('1')

      rtl.act(() => {
        store.dispatch({ type: 'setX', payload: 0 })
      })
      expect(getByTestId('x').textContent).toBe('0')
    })
  },
)
