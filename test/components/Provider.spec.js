/*eslint-disable react/prop-types*/

import React, { Component } from 'react'
import PropTypes from 'prop-types'
import semver from 'semver'
import { createStore } from 'redux'
import { Provider, createProvider, connect } from '../../src/index.js'
import { Consumer } from '../../src/components/Context.js'
import * as rtl from 'react-testing-library'
import 'jest-dom/extend-expect'

describe('React', () => {
  describe('Provider', () => {
    afterEach(() => rtl.cleanup())
    const createChild = (storeKey = 'store') => {
      class Child extends Component {
        render() {
          return (
            <Consumer>
              {(value) => {
                return (
                  <div data-testid="store">
                    {storeKey} - {value && value.store.mine ? value.store.mine : ''}
                  </div>
                )
              }}
            </Consumer>
          )
        }
      }

      return Child
    }
    const Child = createChild();

    it('should not enforce a single child', () => {
      const store = createStore(() => ({}))

      // Ignore propTypes warnings
      const propTypes = Provider.propTypes
      Provider.propTypes = {}

      const spy = jest.spyOn(console, 'error').mockImplementation(() => {})

      expect(() => rtl.render(
        <Provider store={store}>
          <div />
        </Provider>
      )).not.toThrow()

      expect(() => rtl.render(
        <Provider store={store}>
        </Provider>
      )).not.toThrow(/children with exactly one child/)

      expect(() => rtl.render(
        <Provider store={store}>
          <div />
          <div />
        </Provider>
      )).not.toThrow(/a single React element child/)
      spy.mockRestore()
    })

    it('should add the store to the child context', () => {
      const store = createStore(() => ({}))
      store.mine = 'hi'

      const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
      const tester = rtl.render(
        <Provider store={store}>
          <Child />
        </Provider>
      )
      expect(spy).toHaveBeenCalledTimes(0)
      spy.mockRestore()

      expect(tester.getByTestId('store')).toHaveTextContent('store - hi')
    })

    it('should add the store to the child context using a custom store key', () => {
      const store = createStore(() => ({}))
      store.mine = 'hi'
      const CustomProvider = createProvider('customStoreKey');
      const CustomChild = createChild('customStoreKey');

      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const tester = rtl.render(
        <CustomProvider store={store}>
          <CustomChild />
        </CustomProvider>
      )
      expect(spy).toHaveBeenCalledTimes(0)
      spy.mockRestore()

      expect(tester.getByTestId('store')).toHaveTextContent('customStoreKey - hi')
    })

    it('accepts new store in props', () => {
      const store1 = createStore((state = 10) => state + 1)
      store1.mine = '1'
      const store2 = createStore((state = 10) => state * 2)
      store2.mine = '2'
      const store3 = createStore((state = 10) => state * state)
      store3.mine = '3'

      let externalSetState
      class ProviderContainer extends Component {
        constructor() {
          super()
          this.state = { store: store1 }
          externalSetState = this.setState.bind(this)
        }
        render() {
          return (
            <Provider store={this.state.store}>
              <Child />
            </Provider>
          )
        }
      }

      const tester = rtl.render(<ProviderContainer />)
      expect(tester.getByTestId('store')).toHaveTextContent('store - 1')

      let spy = jest.spyOn(console, 'error').mockImplementation(() => {})
      externalSetState({ store: store2 })

      expect(tester.getByTestId('store')).toHaveTextContent('store - 1')
      expect(spy).toHaveBeenCalledTimes(0)
      spy.mockRestore()
      
      spy = jest.spyOn(console, 'error').mockImplementation(() => {})
      externalSetState({ store: store3 })

      expect(tester.getByTestId('store')).toHaveTextContent('store - 2')
      expect(spy).toHaveBeenCalledTimes(0)
      spy.mockRestore()
    })

    it('should handle subscriptions correctly when there is nested Providers', () => {
      const reducer = (state = 0, action) => (action.type === 'INC' ? state + 1 : state)

      const innerStore = createStore(reducer)
      const innerMapStateToProps = jest.fn(state => ({ count: state }))
      @connect(innerMapStateToProps)
      class Inner extends Component {
        render() { return <div>{this.props.count}</div> }
      }

      const outerStore = createStore(reducer)
      @connect(state => ({ count: state }))
      class Outer extends Component {
        render() { return <Provider store={innerStore}><Inner /></Provider> }
      }

      rtl.render(<Provider store={outerStore}><Outer /></Provider>)
      expect(innerMapStateToProps).toHaveBeenCalledTimes(1)

      innerStore.dispatch({ type: 'INC'})
      expect(innerMapStateToProps).toHaveBeenCalledTimes(2)
    })
  })

  it('should pass state consistently to mapState', () => {
    function stringBuilder(prev = '', action) {
      return action.type === 'APPEND'
        ? prev + action.body
        : prev
    }

    const store = createStore(stringBuilder)

    store.dispatch({ type: 'APPEND', body: 'a' })
    let childMapStateInvokes = 0

    @connect(state => ({ state }), null, null, { withRef: true })
    class Container extends Component {
      emitChange() {
        store.dispatch({ type: 'APPEND', body: 'b' })
      }

      render() {
        return (
          <div>
            <button ref="button" onClick={this.emitChange.bind(this)}>change</button>
            <ChildContainer parentState={this.props.state} />
          </div>
        )
      }
    }

    const childCalls = []
    @connect((state, parentProps) => {
      childMapStateInvokes++
      childCalls.push([state, parentProps.parentState])
      // The state from parent props should always be consistent with the current state
      //expect(state).toEqual(parentProps.parentState)
      return {}
    })
    class ChildContainer extends Component {
      render() {
        return <div />
      }
    }

    const tester = rtl.render(
      <Provider store={store}>
        <Container />
      </Provider>
    )

    expect(childMapStateInvokes).toBe(1)

    // The store state stays consistent when setState calls are batched
    store.dispatch({ type: 'APPEND', body: 'c' })
    expect(childMapStateInvokes).toBe(2)
    expect(childCalls).toEqual([
      ['a',  'a'],
      ['ac', 'ac']
    ])

    // setState calls DOM handlers are batched

    const button = tester.getByText('change')
    rtl.fireEvent.click(button)
    expect(childMapStateInvokes).toBe(3)

    // Provider uses unstable_batchedUpdates() under the hood
    store.dispatch({ type: 'APPEND', body: 'd' })
    expect(childCalls).toEqual([
      ['a',  'a'],
      ['ac', 'ac'], // then store update is processed
      ['acb', 'acb'], // then store update is processed
      ['acbd', 'acbd'], // then store update is processed
    ])
    expect(childMapStateInvokes).toBe(4)
  })

  it('works in <StrictMode> without warnings (React 16.3+)', () => {
    if (!React.StrictMode) {
      return
    }
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const store = createStore(() => ({}))

    rtl.render(
      <React.StrictMode>
        <Provider store={store}>
          <div />
        </Provider>
      </React.StrictMode>
    )

    expect(spy).not.toHaveBeenCalled()
  })
})
