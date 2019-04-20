/*eslint-disable react/prop-types*/

import React from 'react'
import { createStore } from 'redux'
import * as rtl from 'react-testing-library'
import { Provider as ProviderMock, useRedux } from '../../src/index.js'

describe('React', () => {
  describe('hooks', () => {
    describe(useRedux.name, () => {
      let store
      let renderedItems = []

      beforeEach(() => {
        store = createStore(({ count } = { count: -1 }) => ({
          count: count + 1
        }))
        renderedItems = []
      })

      afterEach(() => rtl.cleanup())

      it('selects the state and binds action creators', () => {
        const Comp = () => {
          const [count, { inc }] = useRedux(s => s.count, {
            inc: () => ({ type: '' })
          })
          renderedItems.push(count)
          return (
            <>
              <div>{count}</div>
              <button id="bInc" onClick={inc} />
            </>
          )
        }

        const { container } = rtl.render(
          <ProviderMock store={store}>
            <Comp />
          </ProviderMock>
        )

        const bInc = container.querySelector('#bInc')

        rtl.fireEvent.click(bInc)

        expect(renderedItems).toEqual([0, 1])
      })
    })
  })
})
