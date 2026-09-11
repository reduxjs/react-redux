/*eslint-disable react/prop-types*/

import * as rtl from '@testing-library/react'
import { Provider } from 'react-redux'
import { createStore } from 'redux'

// In a React Server Components environment, React does not expose the effect
// hooks that `<Provider>` relies on, so `useIsomorphicLayoutEffect` (which
// resolves to `useLayoutEffect`/`useEffect`) ends up `undefined`. Simulate that
// here to assert `<Provider>` surfaces a clear, actionable error rather than a
// cryptic "X is not a function".
vi.mock('../../src/utils/useIsomorphicLayoutEffect', () => ({
  useIsomorphicLayoutEffect: undefined,
}))

// This mock replaces an internal source module, which only exists as a separate
// module in the `src` build. When the suite runs against the bundled build
// artifact (`TEST_DIST`), `useIsomorphicLayoutEffect` is inlined into a single
// file with no module boundary left to mock, so the RSC condition cannot be
// simulated there. The guard itself is unchanged between builds, so exercising
// it against `src` is sufficient.
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
