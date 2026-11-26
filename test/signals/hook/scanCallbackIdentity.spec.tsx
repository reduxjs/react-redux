/**
 * Identity comparisons between two state values inside a selector, at mount
 * (probe tier) and after the hook has been promoted (deep tier).
 *
 * Inside the callback of an array scan method (`find`, `filter`, `some`, ...)
 * the deep tier hands the callback a scan proxy for each element, which is a
 * different proxy from the one a direct read like `s.current` returns. Two
 * different proxies of the same object are never `===`, so comparing them
 * inside the callback needs `unwrap` on both sides. This and the narrowed
 * dependency of an object whose field was also read are documented limits;
 * these tests pin them so a change in either direction is noticed.
 */
import { configureStore, createSlice } from '@reduxjs/toolkit'
import * as rtl from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  SignalProvider,
  unwrap,
  useSignalSelector,
} from '../../../src/signals/index'
import { promoteToDeepTier, renderSignalSelector } from '../helpers/react'

type Item = { id: number }

const makeStore = () => {
  const current: Item = { id: 2 }
  const slice = createSlice({
    name: 'data',
    initialState: {
      items: [{ id: 1 }, current] as Item[],
      current,
      tick: 0,
    },
    reducers: {
      tick: (state) => {
        state.tick += 1
      },
    },
    extraReducers: (builder) => {
      builder.addCase('replaceCurrent', (state) => {
        state.current = { id: state.current.id }
      })
    },
  })
  const store = configureStore({ reducer: { data: slice.reducer } })
  return { store, tick: slice.actions.tick }
}

type RootState = ReturnType<ReturnType<typeof makeStore>['store']['getState']>

afterEach(() => {
  rtl.cleanup()
})

function renderInBothTiers<R>(selector: (s: RootState) => R) {
  const { store, tick } = makeStore()
  const seen = renderSignalSelector(store, selector)
  const probeTier = seen.current
  promoteToDeepTier(store, tick())
  const deepTier = seen.current
  return { probeTier, deepTier }
}

describe('identity comparisons between state values', () => {
  it('works for a direct comparison in both tiers', () => {
    const result = renderInBothTiers(
      (s) => s.data.items[1] === s.data.current && s.data.tick >= 0,
    )
    expect(result).toEqual({ probeTier: true, deepTier: true })
  })

  it('works for indexOf and includes in both tiers', () => {
    const result = renderInBothTiers(
      (s) =>
        `${s.data.items.indexOf(s.data.current)}:${s.data.items.includes(s.data.current)}:${s.data.tick >= 0}`,
    )
    expect(result).toEqual({
      probeTier: '1:true:true',
      deepTier: '1:true:true',
    })
  })

  it('works inside a scan callback with unwrap on both sides', () => {
    const result = renderInBothTiers(
      (s) => s.data.items.find((i) => unwrap(i) === unwrap(s.data.current))?.id,
    )
    expect(result).toEqual({ probeTier: 2, deepTier: 2 })
  })

  it('does not re-run for an identity change of an object whose field was also read', () => {
    const { store, tick } = makeStore()
    const saved = store.getState().data.current
    let result: boolean | undefined
    function Comp() {
      result = useSignalSelector(
        (s: RootState) =>
          s.data.current.id > 0 && unwrap(s.data.current) === saved,
      )
      return null
    }
    rtl.render(
      <SignalProvider store={store}>
        <Comp />
      </SignalProvider>,
    )
    rtl.act(() => {
      store.dispatch(tick())
    })
    expect(result).toBe(true)
    rtl.act(() => {
      store.dispatch({ type: 'replaceCurrent' })
    })
    // The state object changed identity but the selector only depends on
    // `current.id`, so the result stays stale.
    expect(store.getState().data.current).not.toBe(saved)
    expect(result).toBe(true)
  })

  it('does not match inside a scan callback without unwrap after promotion', () => {
    const result = renderInBothTiers(
      (s) => s.data.items.find((i) => i === s.data.current)?.id,
    )
    expect(result).toEqual({ probeTier: 2, deepTier: undefined })
  })
})
