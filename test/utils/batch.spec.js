/*eslint-disable react/prop-types*/

import React from 'react'
import { createStore } from 'redux'
import { Provider as ProviderMock, batch, connect } from '../../src/index.js'
import * as rtl from 'react-testing-library'
import 'jest-dom/extend-expect'

describe('React', () => {
  describe('batch', () => {
    afterEach(() => rtl.cleanup())

    it('should render only once for batched dispatches', () => {
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

      const mapStateSpy = jest.fn()
      const renderSpy = jest.fn()

      const componentDecorator = connect(state => {
        mapStateSpy()

        return {
          foo: state.foo,
          bar: state.bar,
          baz: state.baz
        }
      })

      const component = () => {
        renderSpy()
        return <div>Hello</div>
      }

      const Component = componentDecorator(component)

      rtl.render(
        <ProviderMock store={store}>
          <Component />
        </ProviderMock>
      )

      // 1. Initial render
      expect(mapStateSpy).toHaveBeenCalledTimes(1)
      expect(renderSpy).toHaveBeenCalledTimes(1)

      rtl.act(() => {
        store.dispatch({ type: 'FOO', payload: 1 })
      })
      rtl.act(() => {
        store.dispatch({ type: 'BAR', payload: 1 })
      })

      // 2. Separate store dispatches (sanity check)
      expect(mapStateSpy).toHaveBeenCalledTimes(3)
      expect(renderSpy).toHaveBeenCalledTimes(3)

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
      expect(renderSpy).toHaveBeenCalledTimes(4)
    })
  })
})
