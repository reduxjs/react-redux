/*eslint-disable react/prop-types*/

import PropTypes from 'prop-types'
import { React, Component, TestRenderer, enzyme, Provider, createProvider, connect } from '../getTestDeps.js'
import semver from 'semver'
import { createStore } from 'redux'

describe('React', () => {
  describe('Provider', () => {
      const createChild = (storeKey = 'store') => {
        class Child extends Component {
          render() {
            return <div />
          }
        }

        Child.contextTypes = {
          [storeKey]: PropTypes.object.isRequired
        }

        return Child
    }
    const Child = createChild();

    it('should enforce a single child', () => {
      const store = createStore(() => ({}))

      // Ignore propTypes warnings
      const propTypes = Provider.propTypes
      Provider.propTypes = {}

      const spy = jest.spyOn(console, 'error').mockImplementation(() => {})

      try {
        expect(() => enzyme.mount(
          <Provider store={store}>
            <div />
          </Provider>
        )).not.toThrow()

        if (semver.lt(React.version, '15.0.0')) {
          expect(() => enzyme.mount(
            <Provider store={store}>
            </Provider>
          )).toThrow(/children with exactly one child/)
        } else {
          expect(() => enzyme.mount(
            <Provider store={store}>
            </Provider>
          )).toThrow(/a single React element child/)
        }

        if (semver.lt(React.version, '15.0.0')) {
          expect(() => enzyme.mount(
            <Provider store={store}>
              <div />
              <div />
            </Provider>
          )).toThrow(/children with exactly one child/)
        } else {
          expect(() => enzyme.mount(
            <Provider store={store}>
              <div />
              <div />
            </Provider>
          )).toThrow(/a single React element child/)
        }
      } finally {
        Provider.propTypes = propTypes
        spy.mockRestore()
      }
    })

    it('should add the store to the child context', () => {
      const store = createStore(() => ({}))

      const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
      const testRenderer = enzyme.mount(
        <Provider store={store}>
          <Child />
        </Provider>
      )
      expect(spy).toHaveBeenCalledTimes(0)
      spy.mockRestore()
      
      const child = testRenderer.find(Child).instance()
      expect(child.context.store).toBe(store)
    })

    it('should add the store to the child context using a custom store key', () => {
        const store = createStore(() => ({}))
        const CustomProvider = createProvider('customStoreKey');
        const CustomChild = createChild('customStoreKey');

        const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const testRenderer = enzyme.mount(
          <CustomProvider store={store}>
            <CustomChild />
          </CustomProvider>
        )
        expect(spy).toHaveBeenCalledTimes(0)
        spy.mockRestore()

        const child = testRenderer.find(CustomChild).instance()
        expect(child.context.customStoreKey).toBe(store)
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

      const testRenderer = enzyme.mount(<ProviderContainer />)
      const child = testRenderer.find(Child).instance()
      expect(child.context.store.getState()).toEqual(11)

      let spy = jest.spyOn(console, 'error').mockImplementation(() => {})
      testRenderer.setState({ store: store2 })
      
      expect(child.context.store.getState()).toEqual(11)
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy.mock.calls[0][0]).toBe(
        '<Provider> does not support changing `store` on the fly. ' +
        'It is most likely that you see this error because you updated to ' +
        'Redux 2.x and React Redux 2.x which no longer hot reload reducers ' +
        'automatically. See https://github.com/reduxjs/react-redux/releases/' +
        'tag/v2.0.0 for the migration instructions.'
      )
      spy.mockRestore()
      
      spy = jest.spyOn(console, 'error').mockImplementation(() => {})
      testRenderer.setState({ store: store3 })
      
      expect(child.context.store.getState()).toEqual(11)
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

      enzyme.mount(<Provider store={outerStore}><Outer /></Provider>)
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

    const testRenderer = enzyme.mount(
      <Provider store={store}>
        <Container />
      </Provider>
    )

    expect(childMapStateInvokes).toBe(1)

    // The store state stays consistent when setState calls are batched
    store.dispatch({ type: 'APPEND', body: 'c' })
    expect(childMapStateInvokes).toBe(2)

    // setState calls DOM handlers are batched
    const button = testRenderer.find('button')
    button.prop('onClick')()
    expect(childMapStateInvokes).toBe(3)

    // Provider uses unstable_batchedUpdates() under the hood
    store.dispatch({ type: 'APPEND', body: 'd' })
    expect(childMapStateInvokes).toBe(4)
  })

  it('works in <StrictMode> without warnings (React 16.3+)', () => {
    if (!React.StrictMode) {
      return
    }
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const store = createStore(() => ({}))

    TestRenderer.create(
      <React.StrictMode>
        <Provider store={store}>
          <div />
        </Provider>
      </React.StrictMode>
    )

    expect(spy).not.toHaveBeenCalled()
  })
})
