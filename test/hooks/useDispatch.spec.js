import React from 'react'
import { createStore } from 'redux'
import { renderHook } from 'react-hooks-testing-library'
import {
  Provider as ProviderMock,
  useDispatch,
  createDispatchHook,
  createReduxContextHook
} from '../../src/index.js'

const store = createStore(c => c + 1)
const store2 = createStore(c => c + 2)

describe('React', () => {
  describe('hooks', () => {
    describe('useDispatch', () => {
      it("returns the store's dispatch function", () => {
        const { result } = renderHook(() => useDispatch(), {
          wrapper: props => <ProviderMock {...props} store={store} />
        })

        expect(result.current).toBe(store.dispatch)
      })
    })
    describe('createDispatchHook', () => {
      it("returns the correct store's dispatch function", () => {
        const nestedContext = React.createContext(null)
        const useCustomDispatch = createDispatchHook(
          createReduxContextHook(nestedContext)
        )
        const { result } = renderHook(() => useDispatch(), {
          // eslint-disable-next-line react/prop-types
          wrapper: ({ children, ...props }) => (
            <ProviderMock {...props} store={store}>
              <ProviderMock context={nestedContext} store={store2}>
                {children}
              </ProviderMock>
            </ProviderMock>
          )
        })

        expect(result.current).toBe(store.dispatch)

        const { result: result2 } = renderHook(() => useCustomDispatch(), {
          // eslint-disable-next-line react/prop-types
          wrapper: ({ children, ...props }) => (
            <ProviderMock {...props} store={store}>
              <ProviderMock context={nestedContext} store={store2}>
                {children}
              </ProviderMock>
            </ProviderMock>
          )
        })

        expect(result2.current).toBe(store2.dispatch)
      })
    })
  })
})
