/*eslint-disable react/prop-types*/

import React from 'react'
import { createStore } from 'redux'
import { Provider, useSelector } from '../../src/index.js'
import * as rtl from '@testing-library/react'

describe('React', () => {
  describe('stale props with useSelector', () => {
    it('ignores transient errors in selector (e.g. due to stale props)', () => {
      const Parent = () => {
        const count = useSelector(count => count)
        return <Child parentCount={count} />
      }

      const Child = ({ parentCount }) => {
        const result = useSelector(count => {
          if (count !== parentCount) {
            throw new Error()
          }

          return count + parentCount
        })

        return <div>{result}</div>
      }

      const store = createStore((count = -1) => count + 1)

      const App = () => (
        <Provider store={store}>
          <Parent />
        </Provider>
      )

      rtl.render(<App />)

      rtl.act(() => {
        expect(() => store.dispatch({ type: '' })).not.toThrowError()
      })
    })

    it('ensures consistency of state and props in selector', () => {
      let selectorSawInconsistencies = false

      const Parent = () => {
        const count = useSelector(count => count)
        return <Child parentCount={count} />
      }

      const Child = ({ parentCount }) => {
        const result = useSelector(count => {
          selectorSawInconsistencies =
            selectorSawInconsistencies || count !== parentCount
          return count + parentCount
        })

        return <div>{result}</div>
      }

      const store = createStore((count = -1) => count + 1)

      const App = () => (
        <Provider store={store}>
          <Parent />
        </Provider>
      )

      rtl.render(<App />)

      rtl.act(() => {
        store.dispatch({ type: '' })
      })
      expect(selectorSawInconsistencies).toBe(false)
    })
  })
})
