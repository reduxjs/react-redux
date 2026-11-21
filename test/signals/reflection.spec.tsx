/**
 * Reflection calls on state values inside a selector: key enumeration on
 * arrays, property descriptors, and the frozen/extensible checks. RTK
 * freezes state in development, so these run against frozen state, both
 * at mount (probe tier) and after the hook has been promoted (deep tier).
 */
import { configureStore, createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import * as rtl from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SignalProvider, useSignalSelector } from '../../src/signals'

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
type Store = ReturnType<typeof makeStore>

afterEach(() => {
  rtl.cleanup()
})

function renderSelector<R>(store: Store, selector: (s: RootState) => R) {
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
        const seen = renderSelector(store, (s) => call(s.data[field]))
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
