/*eslint-disable react/prop-types*/

import React from 'react'
import { createStore } from 'redux'
import { renderHook, act } from 'react-hooks-testing-library'
import { Provider as ProviderMock, useRedux } from '../../src/index.js'

describe('React', () => {
  describe('hooks', () => {
    describe('useRedux', () => {
      let store

      beforeEach(() => {
        store = createStore(({ count } = { count: -1 }) => ({
          count: count + 1
        }))
      })

      it('selects the state and binds action creators', () => {
        const { result } = renderHook(
          () =>
            useRedux(s => s.count, {
              inc: () => ({ type: '' })
            }),
          {
            wrapper: props => <ProviderMock {...props} store={store} />
          }
        )

        expect(result.current[0]).toEqual(0)

        act(() => {
          result.current[1].inc()
        })

        expect(result.current[0]).toEqual(1)
      })
    })
  })
})
