/**
 * A selector can return a state object inside a derived result and also
 * read a field through that same object. The returned object must still
 * update when a field the selector did NOT read changes, because the
 * component holds the whole object.
 */
import { configureStore, createSlice } from '@reduxjs/toolkit'
import * as rtl from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SignalProvider, useSignalSelector } from '../../../src/signals/index'
import shallowEqual from '../../../src/utils/shallowEqual'
import type { EqualityFn } from '../../../src/types'

interface User {
  name: string
  age: number
}

const userSlice = createSlice({
  name: 'user',
  initialState: { name: 'Ann', age: 0 } as User,
  reducers: {
    birthday: (state) => {
      state.age += 1
    },
  },
})

const makeStore = () =>
  configureStore({
    reducer: { user: userSlice.reducer, other: (s: number = 0) => s },
  })

type RootState = ReturnType<ReturnType<typeof makeStore>['getState']>

afterEach(() => {
  rtl.cleanup()
})

const shapes: Array<[string, (s: RootState) => { u: User }]> = [
  ['{ u: s.user, n: s.user.name }', (s) => ({ u: s.user, n: s.user.name })],
  [
    '{ u: s.user, arr: [s.user, s.user.name] }',
    (s) => ({ u: s.user, arr: [s.user, s.user.name] }),
  ],
]

const equalities: Array<[string, EqualityFn<any> | undefined]> = [
  ['shallowEqual', shallowEqual],
  ['reference equality', undefined],
]

describe('state object embedded in a derived result and read through', () => {
  for (const [shapeName, selector] of shapes) {
    for (const [eqName, equalityFn] of equalities) {
      it(`${shapeName} with ${eqName} updates when an unread field changes`, () => {
        const store = makeStore()
        let seen: User | undefined

        function Comp() {
          const result = useSignalSelector(selector, equalityFn)
          seen = result.u
          return null
        }

        rtl.render(
          <SignalProvider store={store}>
            <Comp />
          </SignalProvider>,
        )
        expect(seen).toBe(store.getState().user)

        for (let i = 1; i <= 3; i++) {
          rtl.act(() => {
            store.dispatch(userSlice.actions.birthday())
          })
          expect(seen?.age).toBe(i)
          expect(seen).toBe(store.getState().user)
        }
      })
    }
  }

  it('returning the state object alone still updates', () => {
    const store = makeStore()
    let seen: User | undefined

    function Comp() {
      seen = useSignalSelector(
        (s: RootState) => ({ u: s.user }),
        shallowEqual,
      ).u
      return null
    }

    rtl.render(
      <SignalProvider store={store}>
        <Comp />
      </SignalProvider>,
    )
    for (let i = 1; i <= 3; i++) {
      rtl.act(() => {
        store.dispatch(userSlice.actions.birthday())
      })
      expect(seen?.age).toBe(i)
    }
  })
})
