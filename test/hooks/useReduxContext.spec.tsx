import {
  createReduxContextHook,
  useReduxContext,
} from '@internal/hooks/useReduxContext'
import { renderHook } from '@testing-library/react'
import { createContext } from 'react'
import type { ReactReduxContextValue } from 'react-redux'

describe('React', () => {
  describe('hooks', () => {
    describe('useReduxContext', () => {
      it('throws if component is not wrapped in provider', () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

        expect(() => renderHook(() => useReduxContext())).toThrow(
          /could not find react-redux context value/,
        )
        spy.mockRestore()
      })
    })
    describe('createReduxContextHook', () => {
      it('throws if component is not wrapped in provider', () => {
        const customContext = createContext<ReactReduxContextValue | null>(null)
        const useCustomReduxContext = createReduxContextHook(customContext)
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

        expect(() => renderHook(() => useCustomReduxContext())).toThrow(
          /could not find react-redux context value/,
        )

        spy.mockRestore()
      })
    })
  })
})
