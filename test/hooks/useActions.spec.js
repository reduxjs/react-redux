import React from 'react'
import { createStore } from 'redux'
import * as rtl from 'react-testing-library'
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

      afterEach(() => rtl.cleanup())

      it('supports a single action creator', () => {
        const Comp = () => {
          const inc1 = useActions(() => ({ type: 'inc1' }))

          return (
            <>
              <button id="bInc1" onClick={inc1} />
            </>
          )
        }

        const { container } = rtl.render(
          <ProviderMock store={store}>
            <Comp />
          </ProviderMock>
        )

        const bInc1 = container.querySelector('#bInc1')

        rtl.fireEvent.click(bInc1)

        expect(dispatchedActions).toEqual([{ type: 'inc1' }])
      })

      it('supports an object of action creators', () => {
        const Comp = () => {
          const { inc1, inc2 } = useActions({
            inc1: () => ({ type: 'inc1' }),
            inc2: () => ({ type: 'inc', amount: 2 })
          })

          return (
            <>
              <button id="bInc1" onClick={inc1} />
              <button id="bInc2" onClick={inc2} />
            </>
          )
        }

        const { container } = rtl.render(
          <ProviderMock store={store}>
            <Comp />
          </ProviderMock>
        )

        const bInc1 = container.querySelector('#bInc1')
        const bInc2 = container.querySelector('#bInc2')

        rtl.fireEvent.click(bInc1)
        rtl.fireEvent.click(bInc2)

        expect(dispatchedActions).toEqual([
          { type: 'inc1' },
          { type: 'inc', amount: 2 }
        ])
      })

      it('supports an array of action creators', () => {
        const Comp = () => {
          const [inc1, inc2] = useActions([
            () => ({ type: 'inc1' }),
            () => ({ type: 'inc', amount: 2 })
          ])

          return (
            <>
              <button id="bInc1" onClick={inc1} />
              <button id="bInc2" onClick={inc2} />
            </>
          )
        }

        const { container } = rtl.render(
          <ProviderMock store={store}>
            <Comp />
          </ProviderMock>
        )

        const bInc1 = container.querySelector('#bInc1')
        const bInc2 = container.querySelector('#bInc2')

        rtl.fireEvent.click(bInc1)
        rtl.fireEvent.click(bInc2)

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

        const Comp = () => {
          const { adjust } = useActions({
            adjust: (amount, isAdd = true) => ({
              type: 'adjust',
              amount,
              isAdd
            })
          })

          return (
            <>
              <button id="bInc1" onClick={() => adjust(1)} />
              <button id="bInc2" onClick={() => adjust(2)} />
              <button id="bDec1" onClick={() => adjust(1, false)} />
            </>
          )
        }

        const { container } = rtl.render(
          <ProviderMock store={store}>
            <Comp />
          </ProviderMock>
        )

        const bInc1 = container.querySelector('#bInc1')
        const bInc2 = container.querySelector('#bInc2')
        const bDec1 = container.querySelector('#bDec1')

        rtl.fireEvent.click(bInc1)
        rtl.fireEvent.click(bInc2)
        rtl.fireEvent.click(bDec1)

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
