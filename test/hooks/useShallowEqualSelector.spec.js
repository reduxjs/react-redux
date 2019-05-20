/*eslint-disable react/prop-types*/

import React from 'react'
import { createStore } from 'redux'
import * as rtl from 'react-testing-library'
import {
  Provider as ProviderMock,
  useShallowEqualSelector
} from '../../src/index.js'

describe('React', () => {
  describe('hooks', () => {
    describe('useShallowEqualSelector', () => {
      let store
      let renderedItems = []

      beforeEach(() => {
        store = createStore(({ count } = { count: -1 }) => ({
          count: count + 1
        }))
        renderedItems = []
      })

      afterEach(() => rtl.cleanup())

      describe('performance optimizations and bail-outs', () => {
        it('allows shallow equal to prevent unnecessary updates', () => {
          store = createStore(() => ({ foo: 'bar' }))

          const Comp = () => {
            const value = useShallowEqualSelector(s => s)
            renderedItems.push(value)
            return <div />
          }

          rtl.render(
            <ProviderMock store={store}>
              <Comp />
            </ProviderMock>
          )

          expect(renderedItems.length).toBe(1)

          store.dispatch({ type: '' })

          expect(renderedItems.length).toBe(1)
        })

        it('should rerender when shallowEqual returns false', () => {
          store = createStore(() => ({ foo: {} }))

          const Comp = () => {
            const value = useShallowEqualSelector(s => s)
            renderedItems.push(value)
            return <div />
          }

          rtl.render(
            <ProviderMock store={store}>
              <Comp />
            </ProviderMock>
          )

          expect(renderedItems.length).toBe(1)

          store.dispatch({ type: '' })

          expect(renderedItems.length).toBe(2)
        })
      })
    })
  })
})
