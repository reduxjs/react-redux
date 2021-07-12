import { renderHook } from '@testing-library/react-hooks'
import { useReduxContext } from '../../src/hooks/useReduxContext'

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
  })
})
