import * as rtl from '@testing-library/react'
import { Provider } from 'react-redux'
import { createStore } from 'redux'

// Simulates the React Server Components build of React, which has no effect hooks
vi.mock('../../src/utils/useIsomorphicLayoutEffect', () => ({
  useIsomorphicLayoutEffect: undefined,
}))

// The bundled build inlines `useIsomorphicLayoutEffect`, so there is no module to mock
const describeSource = process.env.TEST_DIST ? describe.skip : describe

describeSource('React', () => {
  describe('Provider in a React Server Component environment', () => {
    it('throws an actionable error when React effect hooks are unavailable', () => {
      const store = createStore(() => ({}))

      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

      expect(() =>
        rtl.render(
          <Provider store={store}>
            <div />
          </Provider>,
        ),
      ).toThrow(/React Server Component/)

      spy.mockRestore()
    })
  })
})
