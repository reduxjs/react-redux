import React, { Component } from 'react'
import PropTypes from 'prop-types'
import * as rtl from 'react-testing-library'
import 'jest-dom/extend-expect'

import { createStore } from 'redux'
import { LegacyProvider } from '../../src/index.js'
import { ReactReduxContext } from '../../src/components/Context'

const createExampleTextReducer = () => (state = 'example text') => state

describe('LegacyProvider', () => {
  afterEach(() => rtl.cleanup())

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

  it('passes through everything to the new Provider and provides the new Context as well', () => {
    class Child extends Component {
      render() {
        return (
          <ReactReduxContext.Consumer>
            {({ storeState }) => {
              return <div data-testid="store">{storeState}</div>
            }}
          </ReactReduxContext.Consumer>
        )
      }
    }

    const store = createStore(createExampleTextReducer())

    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const tester = rtl.render(
      <LegacyProvider store={store}>
        <Child />
      </LegacyProvider>
    )
    expect(spy).toHaveBeenCalledTimes(0)
    spy.mockRestore()

    expect(tester.getByTestId('store')).toHaveTextContent('example text')
  })
})
