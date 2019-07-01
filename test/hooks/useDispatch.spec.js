import React from 'react'
import { createStore } from 'redux'
import { renderHook } from '@testing-library/react-hooks'
import { Provider as ProviderMock, useDispatch } from '../../src/index.js'

const store = createStore(c => c + 1)

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
  })
})
