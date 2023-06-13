/*eslint-disable react/prop-types*/

import type { Dispatch } from 'react'
import React, { Component } from 'react'
import ReactDOM from 'react-dom'
import { createStore } from 'redux'
import { Provider, connect, ReactReduxContext } from '../../src/index'
import * as rtl from '@testing-library/react'
import type { ReactReduxContextValue } from '../../src'
import type { Store } from 'redux'

import '@testing-library/jest-dom/extend-expect'

const createExampleTextReducer =
  () =>
  (state = 'example text') =>
    state

describe('React', () => {
  describe('Provider', () => {
    afterEach(() => rtl.cleanup())

    const createChild = (storeKey = 'store') => {
      class Child extends Component {
        render() {
          return (
            <ReactReduxContext.Consumer>
              {(props) => {
                let { store } = props as ReactReduxContextValue
                let text = ''

                if (store) {
                  text = store.getState().toString()
                }

                return (
                  <div data-testid="store">
                    {storeKey} - {text}
                  </div>
                )
              }}
            </ReactReduxContext.Consumer>
          )
        }
      }

      return Child
    }
    const Child = createChild()

    it('should not enforce a single child', () => {
      const store = createStore(() => ({}))

      const spy = jest.spyOn(console, 'error').mockImplementation(() => {})

      expect(() =>
        rtl.render(
          <Provider store={store}>
            <div />
          </Provider>
        )
      ).not.toThrow()
      //@ts-expect-error
      expect(() => rtl.render(<Provider store={store} />)).not.toThrow(
        /children with exactly one child/
      )

      expect(() =>
        rtl.render(
          <Provider store={store}>
            <div />
            <div />
          </Provider>
        )
      ).not.toThrow(/a single React element child/)
      spy.mockRestore()
    })

    it('should add the store to context', () => {
      const store = createStore(createExampleTextReducer())

      const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
      const tester = rtl.render(
        <Provider store={store}>
          <Child />
        </Provider>
      )
      expect(spy).toHaveBeenCalledTimes(0)
      spy.mockRestore()

      expect(tester.getByTestId('store')).toHaveTextContent(
        'store - example text'
      )
    })

    it('accepts new store in props', () => {
      const store1 = createStore((state: number = 10) => state + 1)
      const store2 = createStore((state: number = 10) => state * 2)
      const store3 = createStore((state: number = 10) => state * state + 1)

      interface StateType {
        store: Store
      }

      let externalSetState: Dispatch<StateType>
      class ProviderContainer extends Component<unknown, StateType> {
        constructor(props: {}) {
          super(props)
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
      expect(tester.getByTestId('store')).toHaveTextContent('store - 11')

      rtl.act(() => {
        externalSetState({ store: store2 })
      })

      expect(tester.getByTestId('store')).toHaveTextContent('store - 20')
      rtl.act(() => {
        store1.dispatch({ type: 'hi' })
      })

      expect(tester.getByTestId('store')).toHaveTextContent('store - 20')
      rtl.act(() => {
        store2.dispatch({ type: 'hi' })
      })
      expect(tester.getByTestId('store')).toHaveTextContent('store - 20')

      rtl.act(() => {
        externalSetState({ store: store3 })
      })

      expect(tester.getByTestId('store')).toHaveTextContent('store - 101')
      rtl.act(() => {
        store1.dispatch({ type: 'hi' })
      })

      expect(tester.getByTestId('store')).toHaveTextContent('store - 101')
      rtl.act(() => {
        store2.dispatch({ type: 'hi' })
      })

      expect(tester.getByTestId('store')).toHaveTextContent('store - 101')
      rtl.act(() => {
        store3.dispatch({ type: 'hi' })
      })

      expect(tester.getByTestId('store')).toHaveTextContent('store - 101')
    })

    it('should handle subscriptions correctly when there is nested Providers', () => {
      interface ActionType {
        type: string
      }
      interface TStateProps {
        count: number
      }
      const reducer = (state = 0, action: ActionType) =>
        action.type === 'INC' ? state + 1 : state

      const innerStore = createStore(reducer)
      const innerMapStateToProps = jest.fn<TStateProps, [number]>((state) => ({
        count: state,
      }))
      class Inner extends Component<TStateProps> {
        render(): JSX.Element {
          return <div>{this.props.count}</div>
        }
      }

      const WrapperInner = connect<TStateProps, unknown, unknown, number>(
        innerMapStateToProps
      )(Inner)

      const outerStore = createStore(reducer)
      class Outer extends Component {
        render() {
          return (
            <Provider store={innerStore}>
              <WrapperInner />
            </Provider>
          )
        }
      }

      const WrapperOuter = connect<TStateProps, unknown, unknown, number>(
        (state) => ({ count: state })
      )(Outer)

      rtl.render(
        <Provider store={outerStore}>
          <WrapperOuter />
        </Provider>
      )
      expect(innerMapStateToProps).toHaveBeenCalledTimes(1)

      rtl.act(() => {
        innerStore.dispatch({ type: 'INC' })
      })

      expect(innerMapStateToProps).toHaveBeenCalledTimes(2)
    })

    it('should pass state consistently to mapState', () => {
      interface ActionType {
        type: string
        body: string
      }
      function stringBuilder(prev = '', action: ActionType) {
        return action.type === 'APPEND' ? prev + action.body : prev
      }

      const store: Store = createStore(stringBuilder)

      rtl.act(() => {
        store.dispatch({ type: 'APPEND', body: 'a' })
      })

      let childMapStateInvokes = 0

      const childCalls: Array<Array<string>> = []

      interface ChildContainerProps {
        parentState: string
      }
      class ChildContainer extends Component<ChildContainerProps> {
        render() {
          return <div />
        }
      }

      const WrapperChildrenContainer = connect<
        {},
        unknown,
        ChildContainerProps,
        string
      >((state, parentProps) => {
        childMapStateInvokes++
        childCalls.push([state, parentProps.parentState])
        // The state from parent props should always be consistent with the current state
        return {}
      })(ChildContainer)

      interface TStateProps {
        state: string
      }
      class Container extends Component<TStateProps> {
        emitChange() {
          store.dispatch({ type: 'APPEND', body: 'b' })
        }

        render() {
          return (
            <div>
              <button onClick={this.emitChange.bind(this)}>change</button>
              <WrapperChildrenContainer parentState={this.props.state} />
            </div>
          )
        }
      }
      const WrapperContainer = connect<TStateProps, unknown, unknown, string>(
        (state) => ({ state })
      )(Container)

      const tester = rtl.render(
        <Provider store={store}>
          <WrapperContainer />
        </Provider>
      )

      expect(childMapStateInvokes).toBe(1)

      // The store state stays consistent when setState calls are batched
      rtl.act(() => {
        store.dispatch({ type: 'APPEND', body: 'c' })
      })

      expect(childMapStateInvokes).toBe(2)
      expect(childCalls).toEqual([
        ['a', 'a'],
        ['ac', 'ac'],
      ])

      // setState calls DOM handlers are batched
      const button = tester.getByText('change')
      rtl.fireEvent.click(button)
      expect(childMapStateInvokes).toBe(3)

      // Provider uses unstable_batchedUpdates() under the hood
      rtl.act(() => {
        store.dispatch({ type: 'APPEND', body: 'd' })
      })

      expect(childCalls).toEqual([
        ['a', 'a'],
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

    it('should unsubscribe before unmounting', () => {
      const store = createStore(createExampleTextReducer())
      const subscribe = store.subscribe

      // Keep track of unsubscribe by wrapping subscribe()
      const spy = jest.fn(() => ({}))
      store.subscribe = (listener) => {
        const unsubscribe = subscribe(listener)
        return () => {
          spy()
          return unsubscribe()
        }
      }

      const div = document.createElement('div')
      ReactDOM.render(
        <Provider store={store}>
          <div />
        </Provider>,
        div
      )

      expect(spy).toHaveBeenCalledTimes(0)
      ReactDOM.unmountComponentAtNode(div)
      expect(spy).toHaveBeenCalledTimes(1)
    })

    it('should handle store and children change in a the same render', () => {
      interface PropsType {
        value: string
      }
      interface StateType {
        nestedA: PropsType
        nestedB: PropsType
      }
      const reducerA = (state = { nestedA: { value: 'expectedA' } }) => state
      const reducerB = (state = { nestedB: { value: 'expectedB' } }) => state

      const storeA = createStore(reducerA)
      const storeB = createStore(reducerB)

      class ComponentA extends Component<PropsType> {
        render() {
          return <div data-testid="value">{this.props.value}</div>
        }
      }

      const WrapperComponentA = connect<PropsType, unknown, unknown, StateType>(
        (state) => ({
          value: state.nestedA.value,
        })
      )(ComponentA)

      class ComponentB extends Component<PropsType> {
        render() {
          return <div data-testid="value">{this.props.value}</div>
        }
      }

      const WrapperComponentB = connect<PropsType, unknown, unknown, StateType>(
        (state) => ({ value: state.nestedB.value })
      )(ComponentB)

      const { getByTestId, rerender } = rtl.render(
        <Provider store={storeA}>
          <WrapperComponentA />
        </Provider>
      )

      expect(getByTestId('value')).toHaveTextContent('expectedA')

      rerender(
        <Provider store={storeB}>
          <WrapperComponentB />
        </Provider>
      )

      expect(getByTestId('value')).toHaveTextContent('expectedB')
    })
  })
})
