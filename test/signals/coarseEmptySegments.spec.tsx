import { describe, expect, it } from 'vitest'
import * as rtl from '@testing-library/react'
import React from 'react'
import { configureStore, createSlice } from '@reduxjs/toolkit'
import { SignalProvider, useSignalSelector } from '../../src/signals'

function makeStore() {
  const slice = createSlice({
    name: 's',
    initialState: { count: 0 },
    reducers: { inc: (s) => void s.count++ },
  })
  const store = configureStore({ reducer: slice.reducer })
  return { store, inc: slice.actions.inc }
}

// A selector that reads no top-level segment (nothing for the coarse recorder
// to attribute) can't be gated by the coarse tier, so it falls back to an
// eager deep build. It must still mount and render, and coexist with normal
// segmented selectors.
describe('coarse tier — empty-segment selectors fall back to eager build', () => {
  it('a selector that reads no state segment renders, and a segmented one alongside still updates', () => {
    const { store, inc } = makeStore()

    function Comp() {
      const constant = useSignalSelector(() => 42)
      const count = useSignalSelector((s: { count: number }) => s.count)
      return (
        <div data-testid="v">
          {constant}:{count}
        </div>
      )
    }

    rtl.render(
      <SignalProvider store={store}>
        <Comp />
      </SignalProvider>,
    )
    expect(rtl.screen.getByTestId('v').textContent).toBe('42:0')

    rtl.act(() => {
      store.dispatch(inc())
    })
    expect(rtl.screen.getByTestId('v').textContent).toBe('42:1')
  })
})
