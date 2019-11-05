import React, { Component } from 'react'
import { View, Button, Text, unstable_batchedUpdates } from 'react-native'
import { createStore, applyMiddleware } from 'redux'
import { Provider as ProviderMock, connect } from '../../src/index.js'
import * as rtl from '@testing-library/react-native'

describe('React Native', () => {
  const propMapper = prop => {
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
  class Passthrough extends Component {
    render() {
      return (
        <View>
          {Object.keys(this.props).map(prop => (
            <View title="prop" testID={prop} key={prop}>
              {propMapper(this.props[prop])}
            </View>
          ))}
        </View>
      )
    }
  }

  function stringBuilder(prev = '', action) {
    return action.type === 'APPEND' ? prev + action.body : prev
  }

  afterEach(() => rtl.cleanup())

  describe('Subscription and update timing correctness', () => {
    it('should pass state consistently to mapState', () => {
      const store = createStore(stringBuilder)

      rtl.act(() => {
        store.dispatch({ type: 'APPEND', body: 'a' })
      })

      let childMapStateInvokes = 0

      @connect(state => ({ state }))
      class Container extends Component {
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
              <ChildContainer parentState={this.props.state} />
            </View>
          )
        }
      }

      const childCalls = []
      @connect((state, parentProps) => {
        childMapStateInvokes++
        childCalls.push([state, parentProps.parentState])
        // The state from parent props should always be consistent with the current state
        expect(state).toEqual(parentProps.parentState)
        return {}
      })
      class ChildContainer extends Component {
        render() {
          return <Passthrough {...this.props} />
        }
      }

      const tester = rtl.render(
        <ProviderMock store={store}>
          <Container />
        </ProviderMock>
      )

      expect(childMapStateInvokes).toBe(1)
      expect(childCalls).toEqual([['a', 'a']])

      rtl.act(() => {
        store.dispatch({ type: 'APPEND', body: 'c' })
      })
      expect(childMapStateInvokes).toBe(2)
      expect(childCalls).toEqual([['a', 'a'], ['ac', 'ac']])

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
        ['acbd', 'acbd']
      ])
    })

    it('should invoke mapState always with latest props', () => {
      const store = createStore((state = 0) => state + 1)

      let propsPassedIn

      @connect(reduxCount => {
        return { reduxCount }
      })
      class InnerComponent extends Component {
        render() {
          propsPassedIn = this.props
          return <Passthrough {...this.props} />
        }
      }

      class OuterComponent extends Component {
        constructor() {
          super()
          this.state = { count: 0 }
        }

        render() {
          return <InnerComponent {...this.state} />
        }
      }

      let outerComponent
      rtl.render(
        <ProviderMock store={store}>
          <OuterComponent ref={c => (outerComponent = c)} />
        </ProviderMock>
      )
      outerComponent.setState(({ count }) => ({ count: count + 1 }))
      store.dispatch({ type: '' })

      expect(propsPassedIn.count).toEqual(1)
      expect(propsPassedIn.reduxCount).toEqual(2)
    })

    it('should use the latest props when updated between actions', () => {
      const reactCallbackMiddleware = store => {
        let callback

        return next => action => {
          if (action.type === 'SET_COMPONENT_CALLBACK') {
            callback = action.payload
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

      const counter = (state = 0, action) => {
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

      const Child = connect(count => ({ count }))(function(props) {
        return (
          <View>
            <Text testID="child-prop">{props.prop}</Text>
            <Text testID="child-count">{props.count}</Text>
          </View>
        )
      })
      class Parent extends Component {
        constructor() {
          super()
          this.state = {
            prop: 'a'
          }
          this.inc1 = () => store.dispatch({ type: 'INC1' })
          store.dispatch({
            type: 'SET_COMPONENT_CALLBACK',
            payload: () => this.setState({ prop: 'b' })
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

      let parent
      const rendered = rtl.render(<Parent ref={ref => (parent = ref)} />)
      expect(rendered.getByTestId('child-count').children).toEqual(['0'])
      expect(rendered.getByTestId('child-prop').children).toEqual(['a'])

      // Force the multi-update sequence by running this bound action creator
      parent.inc1()

      // The connected child component _should_ have rendered with the latest Redux
      // store value (3) _and_ the latest wrapper prop ('b').
      expect(rendered.getByTestId('child-count').children).toEqual(['3'])
      expect(rendered.getByTestId('child-prop').children).toEqual(['b'])
    })

    it('should invoke mapState always with latest store state', () => {
      const store = createStore((state = 0) => state + 1)

      let reduxCountPassedToMapState

      @connect(reduxCount => {
        reduxCountPassedToMapState = reduxCount
        return reduxCount < 2 ? { a: 'a' } : { a: 'b' }
      })
      class InnerComponent extends Component {
        render() {
          return <Passthrough {...this.props} />
        }
      }

      class OuterComponent extends Component {
        constructor() {
          super()
          this.state = { count: 0 }
        }

        render() {
          return <InnerComponent {...this.state} />
        }
      }

      let outerComponent
      rtl.render(
        <ProviderMock store={store}>
          <OuterComponent ref={c => (outerComponent = c)} />
        </ProviderMock>
      )

      store.dispatch({ type: '' })
      store.dispatch({ type: '' })
      outerComponent.setState(({ count }) => ({ count: count + 1 }))

      expect(reduxCountPassedToMapState).toEqual(3)
    })

    it('should ensure top-down updates for consecutive batched updates', () => {
      const INC = 'INC'
      const reducer = (c = 0, { type }) => (type === INC ? c + 1 : c)
      const store = createStore(reducer)

      let executionOrder = []
      let expectedExecutionOrder = [
        'parent map',
        'parent render',
        'child map',
        'child render'
      ]

      const ChildImpl = () => {
        executionOrder.push('child render')
        return <View>child</View>
      }

      const Child = connect(state => {
        executionOrder.push('child map')
        return { state }
      })(ChildImpl)

      const ParentImpl = () => {
        executionOrder.push('parent render')
        return <Child />
      }

      const Parent = connect(state => {
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
})
