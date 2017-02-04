/*eslint-disable react/prop-types*/

import expect from 'expect'
import React from 'react'
import TestUtils from 'react-addons-test-utils'
import { combineReducers, createStore } from 'redux'
import { Provider, SubProvider, combineConnected, connect } from '../../src/index'

describe('React', () => {
  describe('combineConnected', () => {
    it('should create SubProviders with the given subStates', () => {
      const reducer = (state = 0, action) => {
        return (action === "INC") ? state + 1 : state;
      }
      const mapStateToProps = expect.createSpy().andCall(state => ({ count: state }))

      @connect(mapStateToProps)
      class Counter extends React.Component {
        render() {
          return <div>{ this.props.count }</div>
        }
      }

      const store = createStore(combineReducers({
        counter: reducer
      }));

      let { counter: MyCounter } = combineConnected({
        counter: Counter
      });

      let tree;
      expect(() => {
        tree = TestUtils.renderIntoDocument(
          <Provider store={store}>
            <MyCounter />
          </Provider>
          )
      }).toNotThrow()
      const subprovider = TestUtils.findRenderedComponentWithType(tree, SubProvider)
      expect(subprovider).toExist();

      expect(mapStateToProps).toHaveBeenCalledWith(0, {});
    })

    it('should return components under the correct keys', () => {
      @connect()
      class Child extends React.Component {
        render() {
          return <div />
        }
      }

      let { child: Child1 } = combineConnected({
        child: Child
      });

      expect(Child1).toExist();

      let { child: Child2, Child3 } = combineConnected({
        child: { Child3: Child }
      });

      expect(Child2).toNotExist();
      expect(Child3).toExist();

      let Child4 = Child;
      expect(Child4).toEqual(Child);

      ({ Child4 } = combineConnected({
        child: { Child4 }
      }));

      expect(Child4).toExist();
      expect(Child4).toNotEqual(Child);
    })
  })
})
