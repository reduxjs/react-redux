import { renderHook } from '@testing-library/react-hooks'
import { createContext } from 'react'
import { ReactReduxContextValue } from '../../src/components/Context'
import {
  createReduxContextHook,
  useReduxContext,
} from '../../src/hooks/useReduxContext'

describe('React', () => {
  describe('hooks', () => {
    describe('useReduxContext', () => {
      it('throws if component is not wrapped in provider', () => {
        const spy = jest.spyOn(console, 'error').mockImplementation(() => {})

        const { result } = renderHook(() => useReduxContext())

        expect(result.error.message).toMatch(
          /could not find react-redux context value/
        )

        spy.mockRestore()
      })
    })
    describe('createReduxContextHook', () => {
      it('throws if component is not wrapped in provider', () => {
        const customContext = createContext<ReactReduxContextValue>(null as any)
        const useCustomReduxContext = createReduxContextHook(customContext)
        const spy = jest.spyOn(console, 'error').mockImplementation(() => {})

        const { result } = renderHook(() => useCustomReduxContext())

        expect(result.error.message).toMatch(
          /could not find react-redux context value/
        )

        spy.mockRestore()
      })
    })
  })
})
