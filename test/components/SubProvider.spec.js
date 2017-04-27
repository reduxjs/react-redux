/*eslint-disable react/prop-types*/

import expect from 'expect'
import React, { PropTypes, Component } from 'react'
import TestUtils from 'react-addons-test-utils'
import { combineReducers, createStore } from 'redux'
import { Provider, SubProvider, connect } from '../../src/index'

describe('React', () => {
  describe('SubProvider', () => {
    class Child extends Component {

      render() {
        return <div />
      }
    }

    Child.contextTypes = {
      store: PropTypes.object.isRequired
    }

    it('should enforce a single child', () => {
      const store = createStore(() => ({ key: "value" }))

      // Ignore propTypes warnings
      const propTypes = SubProvider.propTypes
      SubProvider.propTypes = {}

      try {
        expect(() => TestUtils.renderIntoDocument(
          <Provider store={store}>
            <SubProvider subState="key">
              <div />
            </SubProvider>
          </Provider>
        )).toNotThrow()

        expect(() => TestUtils.renderIntoDocument(
          <Provider store={store}>
            <SubProvider subState="key">
            </SubProvider>
          </Provider>
        )).toThrow(/a single React element child/)

        expect(() => TestUtils.renderIntoDocument(
          <Provider store={store}>
            <SubProvider subState="key">
              <div />
              <div />
            </SubProvider>
          </Provider>
        )).toThrow(/a single React element child/)
      } finally {
        SubProvider.propTypes = propTypes
      }
    })

    it('should add the store proxy to the child context', () => {
      const store = createStore(() => ({ key: "value" }))

      const spy = expect.spyOn(console, 'error')
      const tree = TestUtils.renderIntoDocument(
        <Provider store={store}>
          <SubProvider subState="key">
            <Child />
          </SubProvider>
        </Provider>
      )
      spy.destroy()
      expect(spy.calls.length).toBe(0)

      const child = TestUtils.findRenderedComponentWithType(tree, Child)
      const subProvider = TestUtils.findRenderedComponentWithType(tree, SubProvider)
      expect(child.context.store).toBe(subProvider.subStore)
    })

    it('should pass store proxy calls to the real store', () => {
      const store = createStore(() => ({ key: "value" }));

      const subscribeSpy = expect.spyOn(store, "subscribe").andCallThrough();
      const dispatchSpy = expect.spyOn(store, "dispatch").andCallThrough();
      const getStateSpy = expect.spyOn(store, "getState").andCallThrough();

      const spy = expect.spyOn(console, 'error')
      const tree = TestUtils.renderIntoDocument(
        <Provider store={store}>
          <SubProvider subState="key">
            <Child />
          </SubProvider>
        </Provider>
      )
      spy.destroy()
      expect(spy.calls.length).toBe(0)

      const subProvider = TestUtils.findRenderedComponentWithType(tree, SubProvider)
      subProvider.subStore.subscribe(() => {})
      expect(subscribeSpy.calls.length).toBe(1);

      subProvider.subStore.dispatch({ type: 'ACTION' })
      expect(dispatchSpy.calls.length).toBe(1);

      subProvider.subStore.getState()
      expect(getStateSpy.calls.length).toBe(1);
    })

    it('should pass one property of state to mapStateToProps', () => {
      let reducer = (state = 0, action) => (action.type === 'INC' ? state + 1 : state)

      reducer = combineReducers({ count: reducer });
      
      const store = createStore(reducer)

      const outerMapStateToProps = expect.createSpy().andCall(state => ({ count: state.count }))
      @connect(outerMapStateToProps)
      class Outer extends Component {
        render() { return <div>{this.props.count}</div> }
      }
      const innerMapStateToProps = expect.createSpy().andCall(state => ({ count: state }))
      @connect(innerMapStateToProps)
      class Inner extends Component {
        render() { return <div>{this.props.count}</div> }
      }

      TestUtils.renderIntoDocument(
        <Provider store={store}>
          <div>
            <Outer />
            <SubProvider subState="count">
              <Inner />
            </SubProvider>
          </div>
        </Provider>)

      expect(outerMapStateToProps.calls.length).toBe(1)
      expect(outerMapStateToProps).toHaveBeenCalledWith({ count: 0 }, {});

      expect(innerMapStateToProps.calls.length).toBe(1)
      expect(innerMapStateToProps).toHaveBeenCalledWith(0, {});

      store.dispatch({ type: 'INC'})

      expect(outerMapStateToProps.calls.length).toBe(2)
      expect(outerMapStateToProps).toHaveBeenCalledWith({ count: 1 }, {});

      expect(innerMapStateToProps.calls.length).toBe(2)
      expect(innerMapStateToProps).toHaveBeenCalledWith(1, {});

    })

    it('should handle subscriptions correctly when there is nested Providers', () => {
      const innerReducer = (state = 0, action) => (action.type === 'INC' ? state + 1 : state)
      
      const innerStore = createStore(innerReducer)
      const innerMapStateToProps = expect.createSpy().andCall(state => ({ count: state }))
      @connect(innerMapStateToProps)
      class Inner extends Component {
        render() { return <div>{this.props.count}</div> }
      }

      const outerReducer = combineReducers({ i: innerReducer });

      const outerStore = createStore(outerReducer)
      @connect(state => ({ count: state }))
      class Outer extends Component {
        render() { return <Provider store={innerStore}><Inner /></Provider> }
      }
      
      TestUtils.renderIntoDocument(<Provider store={outerStore}><SubProvider subState="i"><Outer /></SubProvider></Provider>)
      expect(innerMapStateToProps.calls.length).toBe(1)

      innerStore.dispatch({ type: 'INC'})
      expect(innerMapStateToProps.calls.length).toBe(2)
    })

    it('should pass state consistently to mapState', () => {
      function stringBuilder(prev = '', action) {
        return action.type === 'APPEND'
          ? prev + action.body
          : prev
      }

      const store = createStore(combineReducers({
        string: stringBuilder
      }))

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
          return <div />
        }
      }

      const tree = TestUtils.renderIntoDocument(
        <Provider store={store}>
          <SubProvider subState="string">
            <Container />
          </SubProvider>
        </Provider>
      )

      expect(childMapStateInvokes).toBe(1)

      // The store state stays consistent when setState calls are batched
      store.dispatch({ type: 'APPEND', body: 'c' })
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
