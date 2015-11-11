import expect from 'expect'
import React, { Children, PropTypes, Component } from 'react'
import TestUtils from 'react-addons-test-utils'
import { createStore } from 'redux'
import { createConnect } from '../../src/index'

describe('React', () => {
  describe('connect', () => {
    class Passthrough extends Component {
      render() {
        return <div {...this.props} />
      }
    }

    class ProviderMock extends Component {
      static childContextTypes = {
        store: PropTypes.object.isRequired
      }

      getChildContext() {
        return { store: this.props.store }
      }

      render() {
        return Children.only(this.props.children)
      }
    }

    function stringBuilder(prev = '', action) {
      return action.type === 'APPEND'
        ? prev + action.body
        : prev
    }

    it('is possible to create a custom connect with a configurable equals', () => {

      function makeDeeperShallowEqual(maxDepth) {
        return function deeperShallowEqual(objA, objB, depth = 0) {
          if (objA === objB) {
            return true
          }
          if (depth > maxDepth) {
            return objA === objB
          }
          const keysA = Object.keys(objA)
          const keysB = Object.keys(objB)
          if (keysA.length !== keysB.length) {
            return false
          }
          // Test for A's keys different from B.
          const hasOwn = Object.prototype.hasOwnProperty
          for (let i = 0; i < keysA.length; i++) {
            if (!hasOwn.call(objB, keysA[i]) || !deeperShallowEqual(objA[keysA[i]], objB[keysA[i]], depth + 1)) {
              return false
            }
          }
          return true
        }
      }

      const connect = createConnect(makeDeeperShallowEqual(1))
      const store = createStore(stringBuilder)
      let renderCalls = 0
      let mapStateCalls = 0

      @connect((state, props) => {
        mapStateCalls++
        return { a: [ 1, 2, 3, 4 ], name: props.name } // no change with new comparison!
      })
      class Container extends Component {
        render() {
          renderCalls++
          return <Passthrough {...this.props} />
        }
      }

      TestUtils.renderIntoDocument(
        <ProviderMock store={store}>
          <Container name="test" />
        </ProviderMock>
      )

      expect(renderCalls).toBe(1)
      expect(mapStateCalls).toBe(2)

      store.dispatch({ type: 'APPEND', body: 'a' })

      // After store a change mapState has been called
      expect(mapStateCalls).toBe(3)
      // But render is not because it did not make any actual changes
      expect(renderCalls).toBe(1)
    })
  })
})
