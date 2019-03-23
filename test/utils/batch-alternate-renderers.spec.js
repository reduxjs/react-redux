/*eslint-disable react/prop-types*/

import React from 'react'
import { createStore } from 'redux'
import {
  Provider as ProviderMock,
  batch,
  connect
} from '../../src/alternate-renderers.js'

import * as rtl from 'react-testing-library'
import 'jest-dom/extend-expect'

describe('React', () => {
  describe('defaultNoopBatch', () => {
    afterEach(() => rtl.cleanup())

    it('should call the dispatch callback', () => {
      const initialState = { foo: '', bar: '' }
      const reducer = (state = initialState, action) => {
        switch (action.type) {
          case 'FOO':
            state = { ...state, foo: action.payload }
            break
          case 'BAR':
            state = { ...state, bar: action.payload }
            break
        }
        return state
      }
      const store = createStore(reducer)
      const mapStateSpy = jest.fn(state => ({ foo: state.foo, bar: state.bar }))
      const componentSpy = jest.fn(() => <div>Hello</div>)
      const Component = connect(mapStateSpy)(componentSpy)

      rtl.render(
        <ProviderMock store={store}>
          <Component />
        </ProviderMock>
      )

      // 1. Initial render
      expect(mapStateSpy).toHaveBeenCalledTimes(1)
      expect(componentSpy).toHaveBeenCalledTimes(1)

      rtl.act(() => {
        store.dispatch({ type: 'FOO', payload: 1 })
      })
      rtl.act(() => {
        store.dispatch({ type: 'BAR', payload: 1 })
      })

      // 2. Separate store dispatches (sanity check)
      expect(mapStateSpy).toHaveBeenCalledTimes(3)
      expect(componentSpy).toHaveBeenCalledTimes(3)

      batch(() => {
        rtl.act(() => {
          store.dispatch({ type: 'FOO', payload: 2 })
        })
        rtl.act(() => {
          store.dispatch({ type: 'BAR', payload: 2 })
        })
      })

      // 2. Batched store dispatches
      expect(mapStateSpy).toHaveBeenCalledTimes(5)
      expect(componentSpy).toHaveBeenCalledTimes(5)
      expect(componentSpy).toHaveBeenLastCalledWith(
        {
          bar: 2,
          dispatch: store.dispatch,
          foo: 2
        },
        {}
      )
    })
  })
})
