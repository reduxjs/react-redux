import React, { Component, useLayoutEffect } from 'react'
import { View, Button, Text, unstable_batchedUpdates } from 'react-native'
import { createStore, applyMiddleware } from 'redux'
import {
  Provider as ProviderMock,
  connect,
  batch,
  useSelector,
  useDispatch,
} from '../../src/index'
import { useIsomorphicLayoutEffect } from '../../src/utils/useIsomorphicLayoutEffect'
import * as rtl from '@testing-library/react-native'
import '@testing-library/jest-native/extend-expect'

import type { MiddlewareAPI, Dispatch as ReduxDispatch } from 'redux'

describe('React Native', () => {
  const propMapper = (prop: any) => {
    switch (typeof prop) {
      case 'object':
      case 'boolean':
        return JSON.stringify(prop)
      case 'function':
        return '[function ' + prop.name + ']'
      default:
        return prop
    }
  }

  interface PassthroughPropsType {
    [x: string]: any
  }
  class Passthrough extends Component<PassthroughPropsType> {
    render() {
      return (
        <View>
          {Object.keys(this.props).map((prop) => (
            <View testID={prop} key={prop}>
              {propMapper(this.props[prop])}
            </View>
          ))}
        </View>
      )
    }
  }
  interface ActionType {
    type: string
    body?: string
  }
  function stringBuilder(prev = '', action: ActionType) {
    return action.type === 'APPEND' ? prev + action.body : prev
  }

  afterEach(() => rtl.cleanup())

  describe('batch', () => {
    it('batch should be RN unstable_batchedUpdates', () => {
      expect(batch).toBe(unstable_batchedUpdates)
    })
  })

  describe('useIsomorphicLayoutEffect', () => {
    it('useIsomorphicLayoutEffect should be useLayoutEffect', () => {
      expect(useIsomorphicLayoutEffect).toBe(useLayoutEffect)
    })
  })

  describe('Subscription and update timing correctness', () => {
    it('should pass state consistently to mapState', () => {
      type RootStateType = string
      type NoDispatch = {}

      const store = createStore(stringBuilder)

      rtl.act(() => {
        store.dispatch({ type: 'APPEND', body: 'a' })
      })

      let childMapStateInvokes = 0
      interface ContainerTStatePropsType {
        state: RootStateType
      }
      type ContainerOwnOwnPropsType = {}
      class Container extends Component<ContainerTStatePropsType> {
        emitChange() {
          store.dispatch({ type: 'APPEND', body: 'b' })
        }

        render() {
          return (
            <View>
              <Button
                title="change"
                testID="change-button"
                onPress={this.emitChange.bind(this)}
              />
              <ConnectedChildrenContainer parentState={this.props.state} />
            </View>
          )
        }
      }
      const ConnectedContainer = connect<
        ContainerTStatePropsType,
        NoDispatch,
        ContainerOwnOwnPropsType,
        RootStateType
      >((state) => ({ state }))(Container)

      const childCalls: Array<[string, string]> = []

      type ChildrenTStatePropsType = {}
      type ChildrenOwnPropsType = {
        parentState: string
      }

      class ChildContainer extends Component {
        render() {
          return <Passthrough {...this.props} />
        }
      }
      const ConnectedChildrenContainer = connect<
        ChildrenTStatePropsType,
        NoDispatch,
        ChildrenOwnPropsType,
        RootStateType
      >((state, parentProps) => {
        childMapStateInvokes++
        childCalls.push([state, parentProps.parentState])
        // The state from parent props should always be consistent with the current state
        expect(state).toEqual(parentProps.parentState)
        return {}
      })(ChildContainer)

      const tester = rtl.render(
        <ProviderMock store={store}>
          <ConnectedContainer />
        </ProviderMock>
      )

      expect(childMapStateInvokes).toBe(1)
      expect(childCalls).toEqual([['a', 'a']])

      rtl.act(() => {
        store.dispatch({ type: 'APPEND', body: 'c' })
      })
      expect(childMapStateInvokes).toBe(2)
      expect(childCalls).toEqual([
        ['a', 'a'],
        ['ac', 'ac'],
      ])

      // setState calls DOM handlers are batched
      const button = tester.getByTestId('change-button')
      rtl.fireEvent.press(button)
      expect(childMapStateInvokes).toBe(3)

      rtl.act(() => {
        store.dispatch({ type: 'APPEND', body: 'd' })
      })

      expect(childMapStateInvokes).toBe(4)
      expect(childCalls).toEqual([
        ['a', 'a'],
        ['ac', 'ac'],
        ['acb', 'acb'],
        ['acbd', 'acbd'],
      ])
    })

    it('should invoke mapState always with latest props', () => {
      // Explicitly silence "not wrapped in act()" messages for this test
      const spy = jest.spyOn(console, 'error')
      spy.mockImplementation(() => {})
      type RootStateType = number
      type NoDispatch = {}
      const store = createStore((state: RootStateType = 0) => state + 1)

      interface TStatePropsType {
        reduxCount: number
      }
      interface OwnPropsType {
        count: number
      }
      let propsPassedIn: TStatePropsType & OwnPropsType

      class InnerComponent extends Component<TStatePropsType & OwnPropsType> {
        render() {
          propsPassedIn = this.props
          return <Passthrough {...this.props} />
        }
      }
      const ConnectedInner = connect<
        TStatePropsType,
        NoDispatch,
        OwnPropsType,
        RootStateType
      >((reduxCount) => {
        return { reduxCount }
      })(InnerComponent)

      type OutStateType = {
        count: number
      }
      class OuterComponent extends Component<{}, OutStateType> {
        constructor(props: {}) {
          super(props)
          this.state = { count: 0 }
        }

        render() {
          return <ConnectedInner {...this.state} />
        }
      }

      let outerComponent = React.createRef<OuterComponent>()
      rtl.render(
        <ProviderMock store={store}>
          <OuterComponent ref={outerComponent} />
        </ProviderMock>
      )
      outerComponent.current!.setState(({ count }) => ({ count: count + 1 }))
      store.dispatch({ type: '' })
      //@ts-ignore
      expect(propsPassedIn.count).toEqual(1)
      //@ts-ignore
      expect(propsPassedIn.reduxCount).toEqual(2)

      spy.mockRestore()
    })

    it('should use the latest props when updated between actions', () => {
      // Explicitly silence "not wrapped in act()" messages for this test
      const spy = jest.spyOn(console, 'error')
      spy.mockImplementation(() => {})
      type ActionType = {
        type: string
        payload?: () => void
      }
      const reactCallbackMiddleware = (store: MiddlewareAPI) => {
        let callback: () => void

        return (next: ReduxDispatch) => (action: ActionType) => {
          if (action.type === 'SET_COMPONENT_CALLBACK') {
            callback = action.payload!
          }

          if (callback && action.type === 'INC1') {
            // Deliberately create multiple updates of different types in a row:
            // 1) Store update causes subscriber notifications
            next(action)
            // 2) React setState outside batching causes a sync re-render.
            //    Because we're not using `act()`, this won't flush pending passive effects,
            //    simulating
            callback()
            // 3) Second dispatch causes subscriber notifications again. If `connect` is working
            //    correctly, nested subscriptions won't execute until the parents have rendered,
            //    to ensure that the subscriptions have access to the latest wrapper props.
            store.dispatch({ type: 'INC2' })
            return
          }

          next(action)
        }
      }

      type RootStateType = number

      const counter = (state: RootStateType = 0, action: ActionType) => {
        if (action.type === 'INC1') {
          return state + 1
        } else if (action.type === 'INC2') {
          return state + 2
        }
        return state
      }

      const store = createStore(
        counter,
        applyMiddleware(reactCallbackMiddleware)
      )

      interface ChildrenTStatePropsType {
        count: RootStateType
      }
      type NoDispatch = {}
      type OwnPropsType = {
        prop: string
      }

      const Child = connect<
        ChildrenTStatePropsType,
        NoDispatch,
        OwnPropsType,
        RootStateType
      >((count) => ({ count }))(function (
        props: OwnPropsType & ChildrenTStatePropsType
      ) {
        return (
          <View>
            <Text testID="child-prop">{props.prop}</Text>
            <Text testID="child-count">{props.count}</Text>
          </View>
        )
      })
      interface ParentPropsType {
        prop: string
      }
      class Parent extends Component<{}, ParentPropsType> {
        inc1: () => void
        constructor(props: {}) {
          super(props)
          this.state = {
            prop: 'a',
          }
          this.inc1 = () => store.dispatch({ type: 'INC1' })
          store.dispatch({
            type: 'SET_COMPONENT_CALLBACK',
            payload: () => this.setState({ prop: 'b' }),
          })
        }

        render() {
          return (
            <ProviderMock store={store}>
              <Child prop={this.state.prop} />
            </ProviderMock>
          )
        }
      }

      let parent = React.createRef<Parent>()
      const rendered = rtl.render(<Parent ref={parent} />)
      expect(rendered.getByTestId('child-count').children).toEqual(['0'])
      expect(rendered.getByTestId('child-prop').children).toEqual(['a'])

      // Force the multi-update sequence by running this bound action creator
      parent.current!.inc1()

      // The connected child component _should_ have rendered with the latest Redux
      // store value (3) _and_ the latest wrapper prop ('b').
      expect(rendered.getByTestId('child-count')).toHaveTextContent('3')
      expect(rendered.getByTestId('child-prop')).toHaveTextContent('b')

      spy.mockRestore()
    })

    it('should invoke mapState always with latest store state', () => {
      // Explicitly silence "not wrapped in act()" messages for this test
      const spy = jest.spyOn(console, 'error')
      spy.mockImplementation(() => {})
      type RootStateType = number
      const store = createStore((state: RootStateType = 0) => state + 1)

      let reduxCountPassedToMapState

      class InnerComponent extends Component {
        render() {
          return <Passthrough {...this.props} />
        }
      }

      interface InnerTStatePropsType {
        a: string
      }
      type NoDispatch = {}
      type InnerOwnPropsType = {
        count: number
      }

      const ConnectedInner = connect<
        InnerTStatePropsType,
        NoDispatch,
        InnerOwnPropsType,
        RootStateType
      >((reduxCount) => {
        reduxCountPassedToMapState = reduxCount
        return reduxCount < 2 ? { a: 'a' } : { a: 'b' }
      })(InnerComponent)

      interface OuterState {
        count: number
      }
      class OuterComponent extends Component<{}, OuterState> {
        constructor(props: {}) {
          super(props)
          this.state = { count: 0 }
        }

        render() {
          return <ConnectedInner {...this.state} />
        }
      }

      let outerComponent = React.createRef<OuterComponent>()
      rtl.render(
        <ProviderMock store={store}>
          <OuterComponent ref={outerComponent} />
        </ProviderMock>
      )

      store.dispatch({ type: '' })
      store.dispatch({ type: '' })
      outerComponent.current!.setState(({ count }) => ({ count: count + 1 }))

      expect(reduxCountPassedToMapState).toEqual(3)

      spy.mockRestore()
    })

    it('1should ensure top-down updates for consecutive batched updates', () => {
      const INC = 'INC'
      type ActionType = {
        type: string
      }
      type RootStateType = number
      const reducer = (c: RootStateType = 0, { type }: ActionType) =>
        type === INC ? c + 1 : c
      const store = createStore(reducer)

      let executionOrder: string[] = []
      let expectedExecutionOrder = [
        'parent map',
        'parent render',
        'child map',
        'child render',
      ]

      const ChildImpl = () => {
        executionOrder.push('child render')
        return <View>child</View>
      }

      const Child = connect((state) => {
        executionOrder.push('child map')
        return { state }
      })(ChildImpl)

      const ParentImpl = () => {
        executionOrder.push('parent render')
        return <Child />
      }

      const Parent = connect((state) => {
        executionOrder.push('parent map')
        return { state }
      })(ParentImpl)

      rtl.render(
        <ProviderMock store={store}>
          <Parent />
        </ProviderMock>
      )

      executionOrder = []
      rtl.act(() => {
        store.dispatch({ type: INC })
        store.dispatch({ type: '' })
      })

      expect(executionOrder).toEqual(expectedExecutionOrder)
    })
  })

  describe('useSelector', () => {
    it('should stay in sync with the store', () => {
      // https://github.com/reduxjs/react-redux/issues/1437

      jest.useFakeTimers()

      // Explicitly silence "not wrapped in act()" messages for this test
      const spy = jest.spyOn(console, 'error')
      spy.mockImplementation(() => {})

      const INIT_STATE = { bool: false }
      type ActionType = {
        type: string
      }
      interface RootStateType {
        bool: boolean
      }

      const reducer = (
        state: RootStateType = INIT_STATE,
        action: ActionType
      ) => {
        switch (action.type) {
          case 'TOGGLE':
            return { bool: !state.bool }
          default:
            return state
        }
      }

      const store = createStore(reducer, INIT_STATE)

      const selector = (state: RootStateType) => ({
        bool: state.bool,
      })

      const ReduxBugParent = () => {
        const dispatch = useDispatch()
        const { bool } = useSelector(selector)
        const boolFromStore = store.getState().bool

        expect(boolFromStore).toBe(bool)

        return (
          <>
            <Button
              title="Click Me"
              testID="standardBatching"
              onPress={() => {
                dispatch({ type: 'NOOP' })
                dispatch({ type: 'TOGGLE' })
              }}
            />
            <Button
              title="[BUG] Click Me (setTimeout)"
              testID="setTimeout"
              onPress={() => {
                setTimeout(() => {
                  dispatch({ type: 'NOOP' })
                  dispatch({ type: 'TOGGLE' })
                }, 0)
              }}
            />
            <Button
              title="Click Me (setTimeout & batched from react-native)"
              testID="unstableBatched"
              onPress={() => {
                setTimeout(() => {
                  unstable_batchedUpdates(() => {
                    dispatch({ type: 'NOOP' })
                    dispatch({ type: 'TOGGLE' })
                  })
                }, 0)
              }}
            />
            <Button
              title="Click Me (setTimeout & batched from react-redux)"
              testID="reactReduxBatch"
              onPress={() => {
                setTimeout(() => {
                  batch(() => {
                    dispatch({ type: 'NOOP' })
                    dispatch({ type: 'TOGGLE' })
                  })
                }, 0)
              }}
            />
            <Text testID="boolFromSelector">
              bool from useSelector is {JSON.stringify(bool)}
            </Text>
            <Text testID="boolFromStore">
              bool from store.getState is {JSON.stringify(boolFromStore)}
            </Text>

            {bool !== boolFromStore && <Text>They are not same!</Text>}
          </>
        )
      }

      const ReduxBugDemo = () => {
        return (
          <ProviderMock store={store}>
            <ReduxBugParent />
          </ProviderMock>
        )
      }

      const rendered = rtl.render(<ReduxBugDemo />)

      type RenderedType = typeof rendered

      const assertValuesMatch = (rendered: RenderedType) => {
        const [, boolFromSelector] =
          rendered.getByTestId('boolFromSelector').children
        const [, boolFromStore] = rendered.getByTestId('boolFromStore').children
        expect(boolFromSelector).toBe(boolFromStore)
      }

      const clickButton = (rendered: RenderedType, testID: string) => {
        const button = rendered.getByTestId(testID)
        rtl.fireEvent.press(button)
      }

      const clickAndRender = (rendered: RenderedType, testId: string) => {
        // Note: Normally we'd wrap this all in act(), but that automatically
        // wraps your code in batchedUpdates(). The point of this bug is that it
        // specifically occurs when you are _not_ batching updates!
        clickButton(rendered, testId)
        jest.advanceTimersByTime(100)
        assertValuesMatch(rendered)
      }

      assertValuesMatch(rendered)

      clickAndRender(rendered, 'setTimeout')
      clickAndRender(rendered, 'standardBatching')
      clickAndRender(rendered, 'unstableBatched')
      clickAndRender(rendered, 'reactReduxBatch')

      spy.mockRestore()
    })
  })
})
