import React from 'react'
import { createStore } from 'redux'
import * as rtl from 'react-testing-library'
import { Provider as ProviderMock, useDispatch } from '../../src/index.js'

const store = createStore(c => c + 1)

describe('React', () => {
  describe('hooks', () => {
    describe(useDispatch.name, () => {
      afterEach(() => rtl.cleanup())

      it("returns the store's dispatch function", () => {
        let dispatch

        const Comp = () => {
          dispatch = useDispatch()
          return <div />
        }

        rtl.render(
          <ProviderMock store={store}>
            <Comp />
          </ProviderMock>
        )

        expect(dispatch).toBe(store.dispatch)
      })
    })
  })
})
