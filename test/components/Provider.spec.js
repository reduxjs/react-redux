import expect from 'expect'
import React, { PropTypes, Component } from 'react'
import ReactDOM from 'react-dom'
import TestUtils from 'react-addons-test-utils'
import { createStore } from 'redux'
import { Provider, connect } from '../../src/index'

describe('React', () => {
  describe('Provider', () => {
    class Child extends Component {

      render() {
        return <div />
      }
    }

    Child.contextTypes = {
      store: PropTypes.object.isRequired
    }

    it('should enforce a single child', () => {
      const store = createStore(() => ({}))

      // Ignore propTypes warnings
      const propTypes = Provider.propTypes
      Provider.propTypes = {}

      try {
        expect(() => TestUtils.renderIntoDocument(
          <Provider store={store}>
            <div />
          </Provider>
        )).toNotThrow()

        expect(() => TestUtils.renderIntoDocument(
          <Provider store={store}>
          </Provider>
        )).toThrow(/exactly one child/)

        expect(() => TestUtils.renderIntoDocument(
          <Provider store={store}>
            <div />
            <div />
          </Provider>
        )).toThrow(/exactly one child/)
      } finally {
        Provider.propTypes = propTypes
      }
    })

    it('should add the store to the child context', () => {
      const store = createStore(() => ({}))

      const spy = expect.spyOn(console, 'error')
      const tree = TestUtils.renderIntoDocument(
        <Provider store={store}>
          <Child />
        </Provider>
      )
      spy.destroy()
      expect(spy.calls.length).toBe(0)

      const child = TestUtils.findRenderedComponentWithType(tree, Child)
      expect(child.context.store).toExist()
      expect(child.context.store.dispatch).toBeA('function')
      expect(child.context.store.getState).toBeA('function')
      expect(child.context.store.subscribe).toBeA('function')
    })

    it('should warn once when receiving a new store in props', () => {
      const store1 = createStore((state = 10) => state + 1)
      const store2 = createStore((state = 10) => state * 2)
      const store3 = createStore((state = 10) => state * state)

      class ProviderContainer extends Component {
        constructor() {
          super()
          this.state = { store: store1 }
        }
        render() {
          return (
            <Provider store={this.state.store}>
              <Child />
            </Provider>
          )
        }
      }

      const container = TestUtils.renderIntoDocument(<ProviderContainer />)
      const child = TestUtils.findRenderedComponentWithType(container, Child)
      expect(child.context.store.getState()).toEqual(11)

      let spy = expect.spyOn(console, 'error')
      container.setState({ store: store2 })
      spy.destroy()

      expect(child.context.store.getState()).toEqual(11)
      expect(spy.calls.length).toBe(1)
      expect(spy.calls[0].arguments[0]).toBe(
        '<Provider> does not support changing `store` on the fly. ' +
        'It is most likely that you see this error because you updated to ' +
        'Redux 2.x and React Redux 2.x which no longer hot reload reducers ' +
        'automatically. See https://github.com/reactjs/react-redux/releases/' +
        'tag/v2.0.0 for the migration instructions.'
      )

      spy = expect.spyOn(console, 'error')
      container.setState({ store: store3 })
      spy.destroy()

      expect(child.context.store.getState()).toEqual(11)
      expect(spy.calls.length).toBe(0)
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

      @connect((state, parentProps) => {
        childMapStateInvokes++
        // The state from parent props should always be consistent with the current state
        expect(state).toEqual(parentProps.parentState)
        return {}
      })
      class ChildContainer extends Component {
        render() {
          return <div {...this.props} />
        }
      }

      const tree = TestUtils.renderIntoDocument(
        <Provider store={store}>
          <Container />
        </Provider>
      )

      expect(childMapStateInvokes).toBe(1)

      // The store state stays consistent when setState calls are batched
      ReactDOM.unstable_batchedUpdates(() => {
        store.dispatch({ type: 'APPEND', body: 'c' })
      })
      expect(childMapStateInvokes).toBe(2)

      // setState calls DOM handlers are batched
      const container = TestUtils.findRenderedComponentWithType(tree, Container)
      const node = container.getWrappedInstance().refs.button
      TestUtils.Simulate.click(node)
      expect(childMapStateInvokes).toBe(3)

      // Provider uses unstable_batchedUpdates() under the hood
      store.dispatch({ type: 'APPEND', body: 'd' })
      expect(childMapStateInvokes).toBe(4)
    })
  })
})
