import { renderHook } from '@testing-library/react'
import React from 'react'
import type { ProviderProps, ReactReduxContextValue } from 'react-redux'
import {
  createDispatchHook,
  Provider as ProviderMock,
  useDispatch,
} from 'react-redux'
import { createStore } from 'redux'

const store = createStore((c: number = 1): number => c + 1)
const store2 = createStore((c: number = 1): number => c + 2)

describe('React', () => {
  describe('hooks', () => {
    describe('useDispatch', () => {
      it("returns the store's dispatch function", () => {
        type PropsType = Omit<ProviderProps, 'store'>
        const { result } = renderHook(() => useDispatch(), {
          wrapper: (props: PropsType) => (
            <ProviderMock {...props} store={store} />
          ),
        })

        expect(result.current).toBe(store.dispatch)
      })
    })
    describe('createDispatchHook', () => {
      it("returns the correct store's dispatch function", () => {
        const nestedContext =
          React.createContext<ReactReduxContextValue | null>(null)
        const useCustomDispatch = createDispatchHook(nestedContext)
        const { result } = renderHook(() => useDispatch(), {
          // eslint-disable-next-line react/prop-types
          wrapper: ({ children, ...props }) => (
            <ProviderMock {...props} store={store}>
              <ProviderMock context={nestedContext} store={store2}>
                {children}
              </ProviderMock>
            </ProviderMock>
          ),
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
          ),
        })

        expect(result2.current).toBe(store2.dispatch)
      })
    })
  })
})
