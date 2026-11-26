/**
 * Reflection calls on state values inside a selector: key enumeration on
 * arrays and objects, `in` checks, property descriptors, and the
 * frozen/extensible checks. RTK
 * freezes state in development, so these run against frozen state, both
 * at mount (probe tier) and after the hook has been promoted (deep tier).
 */
import React from 'react'
import { configureStore, createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import * as rtl from '@testing-library/react'
import { Provider, useSelector, shallowEqual } from 'react-redux'
import { afterEach, describe, expect, it } from 'vitest'
import { keysMetaPath } from '../../../src/signals/arrayKeys'
import { useSignalContext } from '../../../src/signals/context'
import type { PathSignalRegistry } from '../../../src/signals/pathSignalRegistry'
import { promoteToDeepTier, renderSignalSelector } from '../helpers/react'

const IS_SIGNALS = process.env.TEST_IMPL === 'signals'

const slice = createSlice({
  name: 'data',
  initialState: {
    list: [1, 2] as number[],
    objs: [{ id: 1 }, { id: 2 }] as { id: number }[],
    obj: { a: 1 },
    tick: 0,
  },
  reducers: {
    setList: (state, action: PayloadAction<number[]>) => {
      state.list = action.payload
      state.objs = action.payload.map((id) => ({ id }))
    },
    tick: (state) => {
      state.tick += 1
    },
  },
})

const makeStore = () => configureStore({ reducer: { data: slice.reducer } })
type RootState = ReturnType<ReturnType<typeof makeStore>['getState']>

afterEach(() => {
  rtl.cleanup()
})

const arrayCalls: Array<[string, (arr: readonly unknown[]) => number]> = [
  ['Object.keys', (arr) => Object.keys(arr).length],
  ['Object.entries', (arr) => Object.entries(arr).length],
  ['Object.values', (arr) => Object.values(arr).length],
  ['object spread', (arr) => Object.keys({ ...arr }).length],
  [
    'hasOwnProperty("length")',
    (arr) =>
      Object.prototype.hasOwnProperty.call(arr, 'length') ? arr.length : -1,
  ],
  [
    'getOwnPropertyDescriptor("length")',
    (arr) => Object.getOwnPropertyDescriptor(arr, 'length')!.value as number,
  ],
  [
    'for...in',
    (arr) => {
      let n = 0
      for (const _k in arr) n++
      return n
    },
  ],
]

describe('key enumeration on state arrays', () => {
  for (const [name, call] of arrayCalls) {
    for (const field of ['list', 'objs'] as const) {
      it(`${name} on ${field} tracks through [1,2] -> [] -> [5] in both tiers`, () => {
        const store = makeStore()
        const seen = renderSignalSelector(store, (s: RootState) =>
          call(s.data[field]),
        )
        expect(seen.current).toBe(2)

        // Promote to the deep tier without changing the array.
        rtl.act(() => {
          store.dispatch(slice.actions.tick())
        })
        expect(seen.current).toBe(2)

        rtl.act(() => {
          store.dispatch(slice.actions.setList([]))
        })
        expect(seen.current).toBe(0)

        rtl.act(() => {
          store.dispatch(slice.actions.setList([5]))
        })
        expect(seen.current).toBe(1)
      })
    }
  }
})

describe('frozen and extensible checks on state proxies', () => {
  const checks: Array<[string, (v: object) => boolean]> = [
    ['Object.isFrozen', Object.isFrozen],
    ['Object.isSealed', Object.isSealed],
    ['Object.isExtensible', Object.isExtensible],
  ]

  for (const [name, check] of checks) {
    it(`${name} does not throw on root or nested proxies in either tier`, () => {
      const store = makeStore()
      expect(Object.isFrozen(store.getState().data)).toBe(true)

      const seen = renderSignalSelector(store, (s: RootState) => [
        typeof check(s),
        typeof check(s.data),
        typeof check(s.data.obj),
        typeof check(s.data.list),
        s.data.tick,
      ])
      expect(seen.current).toEqual([
        'boolean',
        'boolean',
        'boolean',
        'boolean',
        0,
      ])

      rtl.act(() => {
        store.dispatch(slice.actions.tick())
      })
      expect(seen.current).toEqual([
        'boolean',
        'boolean',
        'boolean',
        'boolean',
        1,
      ])
    })
  }
})

// Runs in both TEST_IMPL modes through the react-redux entry point.
describe('enumeration collapse (hook)', () => {
  interface Address {
    city: string
    zip: string
  }

  interface User {
    name: string
    age: number
    address: Address
    joined: Date
  }

  interface Item {
    id: number
    text: string
    done: boolean
  }

  interface State {
    user: User
    other: User
    counter: number
    items: Item[]
  }

  function makeState(): State {
    return {
      user: {
        name: 'Alice',
        age: 30,
        address: { city: 'Springfield', zip: '11111' },
        joined: new Date(2020, 0, 1),
      },
      other: {
        name: 'Bob',
        age: 41,
        address: { city: 'Shelbyville', zip: '22222' },
        joined: new Date(2021, 0, 1),
      },
      counter: 0,
      items: [
        { id: 1, text: 'a', done: false },
        { id: 2, text: 'b', done: true },
      ],
    }
  }

  const slice = createSlice({
    name: 'root',
    initialState: makeState(),
    reducers: {
      renameUser(s, a: { payload: string }) {
        s.user.name = a.payload
      },
      renameOther(s, a: { payload: string }) {
        s.other.name = a.payload
      },
      increment(s) {
        s.counter++
      },
    },
  })

  function makeStore() {
    return configureStore({ reducer: slice.reducer })
  }

  it('spread selector with shallowEqual: renders only when the object changes', () => {
    const store = makeStore()
    const renders = { user: 0 }
    let registry: PathSignalRegistry | undefined

    function CaptureRegistry() {
      registry = useSignalContext().registry
      return null
    }

    function UserCard() {
      renders.user++
      const user = useSelector((s: State) => ({ ...s.user }), shallowEqual)
      return <div data-testid="name">{user.name}</div>
    }

    rtl.render(
      <Provider store={store}>
        {IS_SIGNALS ? <CaptureRegistry /> : null}
        <UserCard />
      </Provider>,
    )
    expect(rtl.screen.getByTestId('name').textContent).toBe('Alice')
    expect(renders.user).toBe(1)

    rtl.act(() => {
      store.dispatch(slice.actions.increment())
      store.dispatch(slice.actions.renameOther('Robert'))
    })
    expect(renders.user).toBe(1)

    rtl.act(() => {
      store.dispatch(slice.actions.renameUser('Alicia'))
    })
    expect(rtl.screen.getByTestId('name').textContent).toBe('Alicia')
    expect(renders.user).toBe(2)

    if (IS_SIGNALS) {
      const paths = registry!.debugPaths()
      expect(paths).toContain('user')
      expect(paths).not.toContain('user.name')
      expect(paths).not.toContain(keysMetaPath('user'))
    }
  })
})

// `index in array` checks must re-run when the array shrinks or grows past
// that index, for keyed arrays (whose element signals live at identity
// paths, not index paths) as well as unkeyed ones.
describe('index in array', () => {
  type Item = { id: number; label: string }

  const makeItems = (n: number): Item[] =>
    Array.from({ length: n }, (_, i) => ({ id: i + 1, label: `item ${i + 1}` }))

  const makeStore = (items: unknown[]) => {
    const slice = createSlice({
      name: 'data',
      initialState: { items, tick: 0 },
      reducers: {
        tick: (state) => {
          state.tick += 1
        },
        truncate: (state, action: { payload: number }) => {
          state.items.length = action.payload
        },
        append: (state, action: { payload: unknown }) => {
          state.items.push(action.payload)
        },
      },
    })
    const store = configureStore({ reducer: { data: slice.reducer } })
    return { store, actions: slice.actions }
  }

  type RootState = { data: { items: unknown[]; tick: number } }

  function renderPromoted(
    items: unknown[],
    selector: (s: RootState) => unknown,
  ) {
    const { store, actions } = makeStore(items)
    const seen = renderSignalSelector(store, selector)
    promoteToDeepTier(store, actions.tick())
    return { store, actions, seen }
  }

  const firstIdAndHasThree = (s: RootState) =>
    `${(s.data.items[0] as Item).id}:${3 in s.data.items}`

  it('re-runs when a keyed array shrinks below the index', () => {
    const { store, actions, seen } = renderPromoted(
      makeItems(5),
      firstIdAndHasThree,
    )
    expect(seen.current).toBe('1:true')
    rtl.act(() => {
      store.dispatch(actions.truncate(3))
    })
    expect(seen.current).toBe('1:false')
  })

  it('re-runs when a keyed array grows past the index', () => {
    const { store, actions, seen } = renderPromoted(
      makeItems(3),
      firstIdAndHasThree,
    )
    expect(seen.current).toBe('1:false')
    rtl.act(() => {
      store.dispatch(actions.append({ id: 4, label: 'item 4' }))
    })
    expect(seen.current).toBe('1:true')
  })

  it('re-runs when an unkeyed array shrinks below the index', () => {
    const { store, actions, seen } = renderPromoted(
      [[1], [2], [3], [4], [5]],
      (s) => `${(s.data.items[0] as number[])[0]}:${3 in s.data.items}`,
    )
    expect(seen.current).toBe('1:true')
    rtl.act(() => {
      store.dispatch(actions.truncate(3))
    })
    expect(seen.current).toBe('1:false')
  })
})
