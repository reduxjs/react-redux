import React, { Component } from 'react'
import PropTypes from 'prop-types'
import { LegacyProvider } from '../../src/index.js'
import { createStore } from 'redux'
import * as rtl from 'react-testing-library'
import 'jest-dom/extend-expect'

const createExampleTextReducer = () => (state = 'example text') => state

describe('LegacyProvider', () => {
  it('provides a legacy context', () => {
    class LegacyChild extends Component {
      render() {
        const store = this.context.store

        let text = ''

        if (store) {
          text = store.getState().toString()
        }

        return <div data-testid="store">{text}</div>
      }
    }

    LegacyChild.contextTypes = {
      store: PropTypes.object.isRequired
    }

    const store = createStore(createExampleTextReducer())

    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const tester = rtl.render(
      <LegacyProvider store={store}>
        <LegacyChild />
      </LegacyProvider>
    )
    expect(spy).toHaveBeenCalledTimes(0)
    spy.mockRestore()

    expect(tester.getByTestId('store')).toHaveTextContent('example text')
  })
})
