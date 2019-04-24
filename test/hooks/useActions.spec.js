/*eslint-disable react/display-name*/

import React from 'react'
import { createStore } from 'redux'
import { renderHook } from 'react-hooks-testing-library'
import { Provider as ProviderMock, useActions } from '../../src/index.js'

describe('React', () => {
  describe('hooks', () => {
    describe('useActions', () => {
      let store
      let dispatchedActions = []

      beforeEach(() => {
        const reducer = (state = 0, action) => {
          dispatchedActions.push(action)

          if (action.type === 'inc1') {
            return state + 1
          }

          if (action.type === 'inc') {
            return state + action.amount
          }

          return state
        }

        store = createStore(reducer)
        dispatchedActions = []
      })

      it('supports a single action creator', () => {
        const { result } = renderHook(
          () => useActions(() => ({ type: 'inc1' })),
          { wrapper: props => <ProviderMock {...props} store={store} /> }
        )

        result.current()

        expect(dispatchedActions).toEqual([{ type: 'inc1' }])
      })

      it('supports an object of action creators', () => {
        const { result } = renderHook(
          () =>
            useActions({
              inc1: () => ({ type: 'inc1' }),
              inc2: () => ({ type: 'inc', amount: 2 })
            }),
          { wrapper: props => <ProviderMock {...props} store={store} /> }
        )

        result.current.inc1()
        result.current.inc2()

        expect(dispatchedActions).toEqual([
          { type: 'inc1' },
          { type: 'inc', amount: 2 }
        ])
      })

      it('supports an array of action creators', () => {
        const { result } = renderHook(
          () =>
            useActions([
              () => ({ type: 'inc1' }),
              () => ({ type: 'inc', amount: 2 })
            ]),
          { wrapper: props => <ProviderMock {...props} store={store} /> }
        )

        result.current[0]()
        result.current[1]()

        expect(dispatchedActions).toEqual([
          { type: 'inc1' },
          { type: 'inc', amount: 2 }
        ])
      })

      it('passes through arguments', () => {
        const reducer = (state = 0, action) => {
          dispatchedActions.push(action)
          if (action.type === 'adjust') {
            return action.isAdd ? state + action.amount : state - action.amount
          }

          return state
        }

        const store = createStore(reducer)
        dispatchedActions = []

        const { result } = renderHook(
          () =>
            useActions({
              adjust: (amount, isAdd = true) => ({
                type: 'adjust',
                amount,
                isAdd
              })
            }),
          { wrapper: props => <ProviderMock {...props} store={store} /> }
        )

        result.current.adjust(1)
        result.current.adjust(2)
        result.current.adjust(1, false)

        expect(dispatchedActions).toEqual([
          { type: 'adjust', amount: 1, isAdd: true },
          { type: 'adjust', amount: 2, isAdd: true },
          { type: 'adjust', amount: 1, isAdd: false }
        ])
      })

      // TODO: test for deps
    })
  })
})
