/*eslint-disable react/prop-types*/

import React, { Component } from 'react'
import createClass from 'create-react-class'
import PropTypes from 'prop-types'
import ReactDOM from 'react-dom'
import { createStore, applyMiddleware } from 'redux'
import { Provider as ProviderMock, connect } from '../../src/index.js'
import * as rtl from '@testing-library/react'
import 'jest-dom/extend-expect'

describe('React', () => {
  describe('connect', () => {
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
          <ul>
            {Object.keys(this.props).map(prop => (
              <li title="prop" data-testid={prop} key={prop}>
                {propMapper(this.props[prop])}
              </li>
            ))}
          </ul>
        )
      }
    }

    class ContextBoundStore {
      constructor(reducer) {
        this.reducer = reducer
        this.listeners = []
        this.state = undefined
        this.dispatch({})
      }

      getState() {
        return this.state
      }

      subscribe(listener) {
        this.listeners.push(listener)
        return () => this.listeners.filter(l => l !== listener)
      }

      dispatch(action) {
        this.state = this.reducer(this.getState(), action)
        this.listeners.forEach(l => l())
        return action
      }
    }

    function stringBuilder(prev = '', action) {
      return action.type === 'APPEND' ? prev + action.body : prev
    }

    function imitateHotReloading(TargetClass, SourceClass, container) {
      // Crude imitation of hot reloading that does the job
      Object.getOwnPropertyNames(SourceClass.prototype)
        .filter(key => typeof SourceClass.prototype[key] === 'function')
        .forEach(key => {
          if (key !== 'render' && key !== 'constructor') {
            TargetClass.prototype[key] = SourceClass.prototype[key]
          }
        })

      container.forceUpdate()
    }

    afterEach(() => rtl.cleanup())

    describe('Core subscription and prop passing behavior', () => {
      it('should receive the store state in the context', () => {
        const store = createStore(() => ({ hi: 'there' }))

        @connect(state => state)
        class Container extends Component {
          render() {
            return <Passthrough {...this.props} />
          }
        }

        const tester = rtl.render(
          <ProviderMock store={store}>
            <Container pass="through" />
          </ProviderMock>
        )

        expect(tester.getByTestId('hi')).toHaveTextContent('there')
      })

      it('should pass state and props to the given component', () => {
        const store = createStore(() => ({
          foo: 'bar',
          baz: 42,
          hello: 'world'
        }))

        @connect(
          ({ foo, baz }) => ({ foo, baz }),
          {}
        )
        class Container extends Component {
          render() {
            return <Passthrough {...this.props} />
          }
        }

        const tester = rtl.render(
          <ProviderMock store={store}>
            <Container pass="through" baz={50} />
          </ProviderMock>
        )

        expect(tester.getByTestId('pass')).toHaveTextContent('through')
        expect(tester.getByTestId('foo')).toHaveTextContent('bar')
        expect(tester.getByTestId('baz')).toHaveTextContent('42')
        expect(tester.queryByTestId('hello')).toBe(null)
      })

      it('should subscribe class components to the store changes', () => {
        const store = createStore(stringBuilder)

        @connect(state => ({ string: state }))
        class Container extends Component {
          render() {
            return <Passthrough {...this.props} />
          }
        }

        const tester = rtl.render(
          <ProviderMock store={store}>
            <Container />
          </ProviderMock>
        )
        expect(tester.getByTestId('string')).toHaveTextContent('')

        rtl.act(() => {
          store.dispatch({ type: 'APPEND', body: 'a' })
        })
        expect(tester.getByTestId('string')).toHaveTextContent('a')

        rtl.act(() => {
          store.dispatch({ type: 'APPEND', body: 'b' })
        })
        expect(tester.getByTestId('string')).toHaveTextContent('ab')
      })

      it('should subscribe pure function components to the store changes', () => {
        const store = createStore(stringBuilder)

        const Container = connect(state => ({ string: state }))(
          function Container(props) {
            return <Passthrough {...props} />
          }
        )

        const spy = jest.spyOn(console, 'error').mockImplementation(() => {})

        const tester = rtl.render(
          <ProviderMock store={store}>
            <Container />
          </ProviderMock>
        )
        expect(spy).toHaveBeenCalledTimes(0)
        spy.mockRestore()

        expect(tester.getByTestId('string')).toHaveTextContent('')
        rtl.act(() => {
          store.dispatch({ type: 'APPEND', body: 'a' })
        })

        expect(tester.getByTestId('string')).toHaveTextContent('a')
        rtl.act(() => {
          store.dispatch({ type: 'APPEND', body: 'b' })
        })

        expect(tester.getByTestId('string')).toHaveTextContent('ab')
      })

      it("should retain the store's context", () => {
        const store = new ContextBoundStore(stringBuilder)

        let Container = connect(state => ({ string: state }))(
          function Container(props) {
            return <Passthrough {...props} />
          }
        )

        const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
        const tester = rtl.render(
          <ProviderMock store={store}>
            <Container />
          </ProviderMock>
        )
        expect(spy).toHaveBeenCalledTimes(0)
        spy.mockRestore()

        expect(tester.getByTestId('string')).toHaveTextContent('')
        rtl.act(() => {
          store.dispatch({ type: 'APPEND', body: 'a' })
        })

        expect(tester.getByTestId('string')).toHaveTextContent('a')
      })

      it('should throw an error if the store is not in the props or context', () => {
        const spy = jest.spyOn(console, 'error').mockImplementation(() => {})

        class Container extends Component {
          render() {
            return <Passthrough />
          }
        }

        const decorator = connect(() => {})
        const Decorated = decorator(Container)

        expect(() => rtl.render(<Decorated />)).toThrow(
          /Could not find "store"/
        )

        spy.mockRestore()
      })
    })

    describe('Prop merging', () => {
      it('should handle additional prop changes in addition to slice', () => {
        const store = createStore(() => ({
          foo: 'bar'
        }))

        @connect(state => state)
        class ConnectContainer extends Component {
          render() {
            return <Passthrough {...this.props} pass={this.props.bar.baz} />
          }
        }

        class Container extends Component {
          constructor() {
            super()
            this.state = {
              bar: {
                baz: ''
              }
            }
          }

          componentDidMount() {
            this.setState({
              bar: Object.assign({}, this.state.bar, { baz: 'through' })
            })
          }

          render() {
            return (
              <ProviderMock store={store}>
                <ConnectContainer bar={this.state.bar} />
              </ProviderMock>
            )
          }
        }

        const tester = rtl.render(<Container />)

        expect(tester.getByTestId('foo')).toHaveTextContent('bar')
        expect(tester.getByTestId('pass')).toHaveTextContent('through')
      })

      it('should handle unexpected prop changes with forceUpdate()', () => {
        const store = createStore(() => ({}))

        @connect(state => state)
        class ConnectContainer extends Component {
          render() {
            return <Passthrough {...this.props} pass={this.props.bar} />
          }
        }

        class Container extends Component {
          constructor() {
            super()
            this.bar = 'baz'
          }

          componentDidMount() {
            this.bar = 'foo'
            this.forceUpdate()
          }

          render() {
            return (
              <ProviderMock store={store}>
                <ConnectContainer bar={this.bar} />
              </ProviderMock>
            )
          }
        }

        const tester = rtl.render(<Container />)

        expect(tester.getByTestId('bar')).toHaveTextContent('foo')
      })

      it('should remove undefined props', () => {
        const store = createStore(() => ({}))
        let props = { x: true }
        let container

        @connect(
          () => ({}),
          () => ({})
        )
        class ConnectContainer extends Component {
          render() {
            return <Passthrough {...this.props} />
          }
        }

        class HolderContainer extends Component {
          render() {
            return <ConnectContainer {...props} />
          }
        }

        const tester = rtl.render(
          <ProviderMock store={store}>
            <HolderContainer ref={instance => (container = instance)} />
          </ProviderMock>
        )

        expect(tester.getByTestId('x')).toHaveTextContent('true')

        props = {}
        container.forceUpdate()

        expect(tester.queryByTestId('x')).toBe(null)
      })

      it('should remove undefined props without mapDispatch', () => {
        const store = createStore(() => ({}))
        let props = { x: true }
        let container

        @connect(() => ({}))
        class ConnectContainer extends Component {
          render() {
            return <Passthrough {...this.props} />
          }
        }

        class HolderContainer extends Component {
          render() {
            return <ConnectContainer {...props} />
          }
        }

        const tester = rtl.render(
          <ProviderMock store={store}>
            <HolderContainer ref={instance => (container = instance)} />
          </ProviderMock>
        )

        expect(tester.getAllByTitle('prop').length).toBe(2)
        expect(tester.getByTestId('dispatch')).toHaveTextContent(
          '[function dispatch]'
        )
        expect(tester.getByTestId('x')).toHaveTextContent('true')

        props = {}
        container.forceUpdate()

        expect(tester.getAllByTitle('prop').length).toBe(1)
        expect(tester.getByTestId('dispatch')).toHaveTextContent(
          '[function dispatch]'
        )
      })

      it('should ignore deep mutations in props', () => {
        const store = createStore(() => ({
          foo: 'bar'
        }))

        @connect(state => state)
        class ConnectContainer extends Component {
          render() {
            return <Passthrough {...this.props} pass={this.props.bar.baz} />
          }
        }

        class Container extends Component {
          constructor() {
            super()
            this.state = {
              bar: {
                baz: ''
              }
            }
          }

          componentDidMount() {
            // Simulate deep object mutation
            const bar = this.state.bar
            bar.baz = 'through'
            this.setState({
              bar
            })
          }

          render() {
            return (
              <ProviderMock store={store}>
                <ConnectContainer bar={this.state.bar} />
              </ProviderMock>
            )
          }
        }

        const tester = rtl.render(<Container />)
        expect(tester.getByTestId('foo')).toHaveTextContent('bar')
        expect(tester.getByTestId('pass')).toHaveTextContent('')
      })

      it('should allow for merge to incorporate state and prop changes', () => {
        const store = createStore(stringBuilder)

        function doSomething(thing) {
          return {
            type: 'APPEND',
            body: thing
          }
        }

        let merged
        let externalSetState
        @connect(
          state => ({ stateThing: state }),
          dispatch => ({
            doSomething: whatever => dispatch(doSomething(whatever))
          }),
          (stateProps, actionProps, parentProps) => ({
            ...stateProps,
            ...actionProps,
            mergedDoSomething: (() => {
              merged = function mergedDoSomething(thing) {
                const seed = stateProps.stateThing === '' ? 'HELLO ' : ''
                actionProps.doSomething(seed + thing + parentProps.extra)
              }
              return merged
            })()
          })
        )
        class Container extends Component {
          render() {
            return <Passthrough {...this.props} />
          }
        }

        class OuterContainer extends Component {
          constructor() {
            super()
            this.state = { extra: 'z' }
            externalSetState = this.setState.bind(this)
          }

          render() {
            return (
              <ProviderMock store={store}>
                <Container extra={this.state.extra} />
              </ProviderMock>
            )
          }
        }

        const tester = rtl.render(<OuterContainer />)

        expect(tester.getByTestId('stateThing')).toHaveTextContent('')
        rtl.act(() => {
          merged('a')
        })

        expect(tester.getByTestId('stateThing')).toHaveTextContent('HELLO az')
        rtl.act(() => {
          merged('b')
        })

        expect(tester.getByTestId('stateThing')).toHaveTextContent('HELLO azbz')
        rtl.act(() => {
          externalSetState({ extra: 'Z' })
        })

        rtl.act(() => {
          merged('c')
        })

        expect(tester.getByTestId('stateThing')).toHaveTextContent(
          'HELLO azbzcZ'
        )
      })

      it('should merge actionProps into WrappedComponent', () => {
        const store = createStore(() => ({
          foo: 'bar'
        }))

        const exampleActionCreator = () => {}

        @connect(
          state => state,
          () => ({ exampleActionCreator })
        )
        class Container extends Component {
          render() {
            return <Passthrough {...this.props} />
          }
        }

        const tester = rtl.render(
          <ProviderMock store={store}>
            <Container pass="through" />
          </ProviderMock>
        )

        expect(tester.getByTestId('exampleActionCreator')).toHaveTextContent(
          '[function exampleActionCreator]'
        )
        expect(tester.getByTestId('foo')).toHaveTextContent('bar')
      })

      it('should throw an error if mapState, mapDispatch, or mergeProps returns anything but a plain object', () => {
        const store = createStore(() => ({}))

        function makeContainer(mapState, mapDispatch, mergeProps) {
          @connect(
            mapState,
            mapDispatch,
            mergeProps
          )
          class Container extends Component {
            render() {
              return <Passthrough />
            }
          }
          return React.createElement(Container)
        }

        function AwesomeMap() {}

        let spy = jest.spyOn(console, 'error').mockImplementation(() => {})
        rtl.render(
          <ProviderMock store={store}>
            {makeContainer(() => 1, () => ({}), () => ({}))}
          </ProviderMock>
        )
        expect(spy).toHaveBeenCalledTimes(1)
        expect(spy.mock.calls[0][0]).toMatch(
          /mapStateToProps\(\) in Connect\(Container\) must return a plain object/
        )
        spy.mockRestore()
        rtl.cleanup()

        spy = jest.spyOn(console, 'error').mockImplementation(() => {})
        rtl.render(
          <ProviderMock store={store}>
            {makeContainer(() => 'hey', () => ({}), () => ({}))}
          </ProviderMock>
        )
        expect(spy).toHaveBeenCalledTimes(1)
        expect(spy.mock.calls[0][0]).toMatch(
          /mapStateToProps\(\) in Connect\(Container\) must return a plain object/
        )
        spy.mockRestore()
        rtl.cleanup()

        spy = jest.spyOn(console, 'error').mockImplementation(() => {})
        rtl.render(
          <ProviderMock store={store}>
            {makeContainer(() => new AwesomeMap(), () => ({}), () => ({}))}
          </ProviderMock>
        )
        expect(spy).toHaveBeenCalledTimes(1)
        expect(spy.mock.calls[0][0]).toMatch(
          /mapStateToProps\(\) in Connect\(Container\) must return a plain object/
        )
        spy.mockRestore()
        rtl.cleanup()

        spy = jest.spyOn(console, 'error').mockImplementation(() => {})
        rtl.render(
          <ProviderMock store={store}>
            {makeContainer(() => ({}), () => 1, () => ({}))}
          </ProviderMock>
        )
        expect(spy).toHaveBeenCalledTimes(1)
        expect(spy.mock.calls[0][0]).toMatch(
          /mapDispatchToProps\(\) in Connect\(Container\) must return a plain object/
        )
        spy.mockRestore()
        rtl.cleanup()

        spy = jest.spyOn(console, 'error').mockImplementation(() => {})
        rtl.render(
          <ProviderMock store={store}>
            {makeContainer(() => ({}), () => 'hey', () => ({}))}
          </ProviderMock>
        )
        expect(spy).toHaveBeenCalledTimes(1)
        expect(spy.mock.calls[0][0]).toMatch(
          /mapDispatchToProps\(\) in Connect\(Container\) must return a plain object/
        )
        spy.mockRestore()
        rtl.cleanup()

        spy = jest.spyOn(console, 'error').mockImplementation(() => {})
        rtl.render(
          <ProviderMock store={store}>
            {makeContainer(() => ({}), () => new AwesomeMap(), () => ({}))}
          </ProviderMock>
        )
        expect(spy).toHaveBeenCalledTimes(1)
        expect(spy.mock.calls[0][0]).toMatch(
          /mapDispatchToProps\(\) in Connect\(Container\) must return a plain object/
        )
        spy.mockRestore()
        rtl.cleanup()

        spy = jest.spyOn(console, 'error').mockImplementation(() => {})
        rtl.render(
          <ProviderMock store={store}>
            {makeContainer(() => ({}), () => ({}), () => 1)}
          </ProviderMock>
        )
        expect(spy).toHaveBeenCalledTimes(1)
        expect(spy.mock.calls[0][0]).toMatch(
          /mergeProps\(\) in Connect\(Container\) must return a plain object/
        )
        spy.mockRestore()
        rtl.cleanup()

        spy = jest.spyOn(console, 'error').mockImplementation(() => {})
        rtl.render(
          <ProviderMock store={store}>
            {makeContainer(() => ({}), () => ({}), () => 'hey')}
          </ProviderMock>
        )
        expect(spy).toHaveBeenCalledTimes(1)
        expect(spy.mock.calls[0][0]).toMatch(
          /mergeProps\(\) in Connect\(Container\) must return a plain object/
        )
        spy.mockRestore()
        rtl.cleanup()

        spy = jest.spyOn(console, 'error').mockImplementation(() => {})
        rtl.render(
          <ProviderMock store={store}>
            {makeContainer(() => ({}), () => ({}), () => new AwesomeMap())}
          </ProviderMock>
        )
        expect(spy).toHaveBeenCalledTimes(1)
        expect(spy.mock.calls[0][0]).toMatch(
          /mergeProps\(\) in Connect\(Container\) must return a plain object/
        )
        spy.mockRestore()
      })
    })

    describe('Invocation behavior for mapState/mapDispatch based on number of arguments', () => {
      it('should not invoke mapState when props change if it only has one argument', () => {
        const store = createStore(stringBuilder)

        let invocationCount = 0

        /*eslint-disable no-unused-vars */
        @connect(arg1 => {
          invocationCount++
          return {}
        })
        /*eslint-enable no-unused-vars */
        class WithoutProps extends Component {
          render() {
            return <Passthrough {...this.props} />
          }
        }

        class OuterComponent extends Component {
          constructor() {
            super()
            this.state = { foo: 'FOO' }
          }

          setFoo(foo) {
            this.setState({ foo })
          }

          render() {
            return (
              <div>
                <WithoutProps {...this.state} />
              </div>
            )
          }
        }

        let outerComponent
        rtl.render(
          <ProviderMock store={store}>
            <OuterComponent ref={c => (outerComponent = c)} />
          </ProviderMock>
        )
        outerComponent.setFoo('BAR')
        outerComponent.setFoo('DID')

        expect(invocationCount).toEqual(1)
      })

      it('should invoke mapState every time props are changed if it has zero arguments', () => {
        const store = createStore(stringBuilder)

        let invocationCount = 0

        @connect(() => {
          invocationCount++
          return {}
        })
        class WithoutProps extends Component {
          render() {
            return <Passthrough {...this.props} />
          }
        }

        class OuterComponent extends Component {
          constructor() {
            super()
            this.state = { foo: 'FOO' }
          }

          setFoo(foo) {
            this.setState({ foo })
          }

          render() {
            return (
              <div>
                <WithoutProps {...this.state} />
              </div>
            )
          }
        }

        let outerComponent
        rtl.render(
          <ProviderMock store={store}>
            <OuterComponent ref={c => (outerComponent = c)} />
          </ProviderMock>
        )
        outerComponent.setFoo('BAR')
        outerComponent.setFoo('DID')

        expect(invocationCount).toEqual(3)
      })

      it('should invoke mapState every time props are changed if it has a second argument', () => {
        const store = createStore(stringBuilder)

        let propsPassedIn
        let invocationCount = 0

        @connect((state, props) => {
          invocationCount++
          propsPassedIn = props
          return {}
        })
        class WithProps extends Component {
          render() {
            return <Passthrough {...this.props} />
          }
        }

        class OuterComponent extends Component {
          constructor() {
            super()
            this.state = { foo: 'FOO' }
          }

          setFoo(foo) {
            this.setState({ foo })
          }

          render() {
            return (
              <div>
                <WithProps {...this.state} />
              </div>
            )
          }
        }

        let outerComponent
        rtl.render(
          <ProviderMock store={store}>
            <OuterComponent ref={c => (outerComponent = c)} />
          </ProviderMock>
        )

        outerComponent.setFoo('BAR')
        outerComponent.setFoo('BAZ')

        expect(invocationCount).toEqual(3)
        expect(propsPassedIn).toEqual({
          foo: 'BAZ'
        })
      })

      it('should not invoke mapDispatch when props change if it only has one argument', () => {
        const store = createStore(stringBuilder)

        let invocationCount = 0

        /*eslint-disable no-unused-vars */
        @connect(
          null,
          arg1 => {
            invocationCount++
            return {}
          }
        )
        /*eslint-enable no-unused-vars */
        class WithoutProps extends Component {
          render() {
            return <Passthrough {...this.props} />
          }
        }

        class OuterComponent extends Component {
          constructor() {
            super()
            this.state = { foo: 'FOO' }
          }

          setFoo(foo) {
            this.setState({ foo })
          }

          render() {
            return (
              <div>
                <WithoutProps {...this.state} />
              </div>
            )
          }
        }

        let outerComponent
        rtl.render(
          <ProviderMock store={store}>
            <OuterComponent ref={c => (outerComponent = c)} />
          </ProviderMock>
        )

        outerComponent.setFoo('BAR')
        outerComponent.setFoo('DID')

        expect(invocationCount).toEqual(1)
      })

      it('should invoke mapDispatch every time props are changed if it has zero arguments', () => {
        const store = createStore(stringBuilder)

        let invocationCount = 0

        @connect(
          null,
          () => {
            invocationCount++
            return {}
          }
        )
        class WithoutProps extends Component {
          render() {
            return <Passthrough {...this.props} />
          }
        }

        class OuterComponent extends Component {
          constructor() {
            super()
            this.state = { foo: 'FOO' }
          }

          setFoo(foo) {
            this.setState({ foo })
          }

          render() {
            return (
              <div>
                <WithoutProps {...this.state} />
              </div>
            )
          }
        }

        let outerComponent
        rtl.render(
          <ProviderMock store={store}>
            <OuterComponent ref={c => (outerComponent = c)} />
          </ProviderMock>
        )

        outerComponent.setFoo('BAR')
        outerComponent.setFoo('DID')

        expect(invocationCount).toEqual(3)
      })

      it('should invoke mapDispatch every time props are changed if it has a second argument', () => {
        const store = createStore(stringBuilder)

        let propsPassedIn
        let invocationCount = 0

        @connect(
          null,
          (dispatch, props) => {
            invocationCount++
            propsPassedIn = props
            return {}
          }
        )
        class WithProps extends Component {
          render() {
            return <Passthrough {...this.props} />
          }
        }

        class OuterComponent extends Component {
          constructor() {
            super()
            this.state = { foo: 'FOO' }
          }

          setFoo(foo) {
            this.setState({ foo })
          }

          render() {
            return (
              <div>
                <WithProps {...this.state} />
              </div>
            )
          }
        }

        let outerComponent
        rtl.render(
          <ProviderMock store={store}>
            <OuterComponent ref={c => (outerComponent = c)} />
          </ProviderMock>
        )

        outerComponent.setFoo('BAR')
        outerComponent.setFoo('BAZ')

        expect(invocationCount).toEqual(3)
        expect(propsPassedIn).toEqual({
          foo: 'BAZ'
        })
      })
    })

    describe('React lifeycle interactions', () => {
      it('should handle dispatches before componentDidMount', () => {
        const store = createStore(stringBuilder)

        @connect(state => ({ string: state }))
        class Container extends Component {
          componentDidMount() {
            store.dispatch({ type: 'APPEND', body: 'a' })
          }

          render() {
            return <Passthrough {...this.props} />
          }
        }
        const tester = rtl.render(
          <ProviderMock store={store}>
            <Container />
          </ProviderMock>
        )

        expect(tester.getByTestId('string')).toHaveTextContent('a')
      })

      it('should not attempt to notify unmounted child of state change', () => {
        const store = createStore(stringBuilder)

        @connect(state => ({ hide: state === 'AB' }))
        class App extends Component {
          render() {
            return this.props.hide ? null : <Container />
          }
        }

        @connect(() => ({}))
        class Container extends Component {
          render() {
            return <Child />
          }
        }

        @connect(state => ({ state }))
        class Child extends Component {
          componentDidMount() {
            if (this.props.state === 'A') {
              store.dispatch({ type: 'APPEND', body: 'B' })
            }
          }
          render() {
            return null
          }
        }

        const div = document.createElement('div')
        ReactDOM.render(
          <ProviderMock store={store}>
            <App />
          </ProviderMock>,
          div
        )

        try {
          rtl.act(() => {
            store.dispatch({ type: 'APPEND', body: 'A' })
          })
        } finally {
          ReactDOM.unmountComponentAtNode(div)
        }
      })

      it('should not attempt to set state after unmounting nested components', () => {
        const store = createStore(() => ({}))
        let mapStateToPropsCalls = 0

        let linkA, linkB

        let App = ({ children, setLocation }) => {
          const onClick = to => event => {
            event.preventDefault()
            setLocation(to)
          }
          /* eslint-disable react/jsx-no-bind */
          return (
            <div>
              <a
                href="#"
                onClick={onClick('a')}
                ref={c => {
                  linkA = c
                }}
              >
                A
              </a>
              <a
                href="#"
                onClick={onClick('b')}
                ref={c => {
                  linkB = c
                }}
              >
                B
              </a>
              {children}
            </div>
          )
          /* eslint-enable react/jsx-no-bind */
        }
        App = connect(() => ({}))(App)

        let A = () => <h1>A</h1>
        function mapState(state) {
          const calls = ++mapStateToPropsCalls
          return { calls, state }
        }
        A = connect(mapState)(A)

        const B = () => <h1>B</h1>

        class RouterMock extends React.Component {
          constructor(...args) {
            super(...args)
            this.state = { location: { pathname: 'a' } }
            this.setLocation = this.setLocation.bind(this)
          }

          setLocation(pathname) {
            this.setState({ location: { pathname } })
            store.dispatch({ type: 'TEST' })
          }

          getChildComponent(location) {
            switch (location) {
              case 'a':
                return <A />
              case 'b':
                return <B />
              default:
                throw new Error('Unknown location: ' + location)
            }
          }

          render() {
            return (
              <App setLocation={this.setLocation}>
                {this.getChildComponent(this.state.location.pathname)}
              </App>
            )
          }
        }

        const div = document.createElement('div')
        document.body.appendChild(div)
        rtl.render(
          <ProviderMock store={store}>
            <RouterMock />
          </ProviderMock>,
          div
        )

        const spy = jest.spyOn(console, 'error').mockImplementation(() => {})

        rtl.act(() => {
          linkA.click()
        })
        rtl.act(() => {
          linkB.click()
        })
        rtl.act(() => {
          linkB.click()
        })

        document.body.removeChild(div)
        // Called 2 times:
        // - Initial mount (called)
        // - After first linkA click
        // Not Called...
        // - After first linkB click, (not called because A is unmounted)
        expect(mapStateToPropsCalls).toBe(2)
        expect(spy).toHaveBeenCalledTimes(0)
        spy.mockRestore()
      })

      it('should not attempt to set state when dispatching in componentWillUnmount', () => {
        const store = createStore(stringBuilder)
        let mapStateToPropsCalls = 0

        /*eslint-disable no-unused-vars */
        @connect(
          state => ({ calls: mapStateToPropsCalls++ }),
          dispatch => ({ dispatch })
        )
        /*eslint-enable no-unused-vars */
        class Container extends Component {
          componentWillUnmount() {
            this.props.dispatch({ type: 'APPEND', body: 'a' })
          }
          render() {
            return <Passthrough {...this.props} />
          }
        }

        const div = document.createElement('div')
        ReactDOM.render(
          <ProviderMock store={store}>
            <Container />
          </ProviderMock>,
          div
        )
        expect(mapStateToPropsCalls).toBe(1)

        const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
        ReactDOM.unmountComponentAtNode(div)
        expect(spy).toHaveBeenCalledTimes(0)
        expect(mapStateToPropsCalls).toBe(1)
        spy.mockRestore()
      })

      it('should not attempt to set state after unmounting', () => {
        const store = createStore(stringBuilder)
        let mapStateToPropsCalls = 0

        @connect(
          () => ({ calls: ++mapStateToPropsCalls }),
          dispatch => ({ dispatch })
        )
        class Container extends Component {
          render() {
            return <Passthrough {...this.props} />
          }
        }

        const div = document.createElement('div')
        store.subscribe(() => {
          ReactDOM.unmountComponentAtNode(div)
        })

        rtl.act(() => {
          ReactDOM.render(
            <ProviderMock store={store}>
              <Container />
            </ProviderMock>,
            div
          )
        })

        expect(mapStateToPropsCalls).toBe(1)
        const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
        rtl.act(() => {
          store.dispatch({ type: 'APPEND', body: 'a' })
        })

        expect(spy).toHaveBeenCalledTimes(0)
        expect(mapStateToPropsCalls).toBe(1)
        spy.mockRestore()
      })

      it('should allow to clean up child state in parent componentWillUnmount', () => {
        function reducer(state = { data: null }, action) {
          switch (action.type) {
            case 'fetch':
              return { data: { profile: { name: 'April' } } }
            case 'clean':
              return { data: null }
            default:
              return state
          }
        }

        @connect(null)
        class Parent extends React.Component {
          componentWillUnmount() {
            this.props.dispatch({ type: 'clean' })
          }

          render() {
            return <Child />
          }
        }

        function mapState(state) {
          return {
            profile: state.data.profile
          }
        }

        @connect(mapState)
        class Child extends React.Component {
          render() {
            return null
          }
        }

        const store = createStore(reducer)
        rtl.act(() => {
          store.dispatch({ type: 'fetch' })
        })

        const div = document.createElement('div')
        ReactDOM.render(
          <ProviderMock store={store}>
            <Parent />
          </ProviderMock>,
          div
        )

        ReactDOM.unmountComponentAtNode(div)
      })
    })

    describe('Performance optimizations and bail-outs', () => {
      it('should shallowly compare the selected state to prevent unnecessary updates', () => {
        const store = createStore(stringBuilder)
        const spy = jest.fn(() => ({}))
        function render({ string }) {
          spy()
          return <Passthrough string={string} />
        }

        @connect(
          state => ({ string: state }),
          dispatch => ({ dispatch })
        )
        class Container extends Component {
          render() {
            return render(this.props)
          }
        }

        const tester = rtl.render(
          <ProviderMock store={store}>
            <Container />
          </ProviderMock>
        )
        expect(spy).toHaveBeenCalledTimes(1)
        expect(tester.getByTestId('string')).toHaveTextContent('')
        rtl.act(() => {
          store.dispatch({ type: 'APPEND', body: 'a' })
        })

        expect(spy).toHaveBeenCalledTimes(2)
        rtl.act(() => {
          store.dispatch({ type: 'APPEND', body: 'b' })
        })

        expect(spy).toHaveBeenCalledTimes(3)
        rtl.act(() => {
          store.dispatch({ type: 'APPEND', body: '' })
        })

        expect(spy).toHaveBeenCalledTimes(3)
      })

      it('should shallowly compare the merged state to prevent unnecessary updates', () => {
        const store = createStore(stringBuilder)
        const spy = jest.fn(() => ({}))
        const tree = {}
        function render({ string, pass }) {
          spy()
          return <Passthrough string={string} pass={pass} passVal={pass.val} />
        }

        @connect(
          state => ({ string: state }),
          dispatch => ({ dispatch }),
          (stateProps, dispatchProps, parentProps) => ({
            ...dispatchProps,
            ...stateProps,
            ...parentProps
          })
        )
        class Container extends Component {
          render() {
            return render(this.props)
          }
        }

        class Root extends Component {
          constructor(props) {
            super(props)
            this.state = { pass: '' }
            tree.setState = this.setState.bind(this)
          }

          render() {
            return (
              <ProviderMock store={store}>
                <Container pass={this.state.pass} />
              </ProviderMock>
            )
          }
        }

        const tester = rtl.render(<Root />)
        expect(spy).toHaveBeenCalledTimes(1)
        expect(tester.getByTestId('string')).toHaveTextContent('')
        expect(tester.getByTestId('pass')).toHaveTextContent('')

        rtl.act(() => {
          store.dispatch({ type: 'APPEND', body: 'a' })
        })

        expect(spy).toHaveBeenCalledTimes(2)
        expect(tester.getByTestId('string')).toHaveTextContent('a')
        expect(tester.getByTestId('pass')).toHaveTextContent('')

        rtl.act(() => {
          tree.setState({ pass: '' })
        })

        expect(spy).toHaveBeenCalledTimes(2)
        expect(tester.getByTestId('string')).toHaveTextContent('a')
        expect(tester.getByTestId('pass')).toHaveTextContent('')

        rtl.act(() => {
          tree.setState({ pass: 'through' })
        })

        expect(spy).toHaveBeenCalledTimes(3)
        expect(tester.getByTestId('string')).toHaveTextContent('a')
        expect(tester.getByTestId('pass')).toHaveTextContent('through')

        rtl.act(() => {
          tree.setState({ pass: 'through' })
        })

        expect(spy).toHaveBeenCalledTimes(3)
        expect(tester.getByTestId('string')).toHaveTextContent('a')
        expect(tester.getByTestId('pass')).toHaveTextContent('through')

        const obj = { prop: 'val' }
        rtl.act(() => {
          tree.setState({ pass: obj })
        })

        expect(spy).toHaveBeenCalledTimes(4)
        expect(tester.getByTestId('string')).toHaveTextContent('a')
        expect(tester.getByTestId('pass')).toHaveTextContent('{"prop":"val"}')

        rtl.act(() => {
          tree.setState({ pass: obj })
        })

        expect(spy).toHaveBeenCalledTimes(4)
        expect(tester.getByTestId('string')).toHaveTextContent('a')
        expect(tester.getByTestId('pass')).toHaveTextContent('{"prop":"val"}')

        const obj2 = Object.assign({}, obj, { val: 'otherval' })
        rtl.act(() => {
          tree.setState({ pass: obj2 })
        })

        expect(spy).toHaveBeenCalledTimes(5)
        expect(tester.getByTestId('string')).toHaveTextContent('a')
        expect(tester.getByTestId('pass')).toHaveTextContent(
          '{"prop":"val","val":"otherval"}'
        )

        obj2.val = 'mutation'
        rtl.act(() => {
          tree.setState({ pass: obj2 })
        })

        expect(spy).toHaveBeenCalledTimes(5)
        expect(tester.getByTestId('string')).toHaveTextContent('a')
        expect(tester.getByTestId('pass')).toHaveTextContent(
          '{"prop":"val","val":"otherval"}'
        )
      })

      it('should not render the wrapped component when mapState does not produce change', () => {
        const store = createStore(stringBuilder)
        let renderCalls = 0
        let mapStateCalls = 0

        @connect(() => {
          mapStateCalls++
          return {} // no change!
        })
        class Container extends Component {
          render() {
            renderCalls++
            return <Passthrough {...this.props} />
          }
        }

        rtl.render(
          <ProviderMock store={store}>
            <Container />
          </ProviderMock>
        )

        expect(renderCalls).toBe(1)
        expect(mapStateCalls).toBe(1)

        rtl.act(() => {
          store.dispatch({ type: 'APPEND', body: 'a' })
        })

        // After store a change mapState has been called
        expect(mapStateCalls).toBe(2)
        // But render is not because it did not make any actual changes
        expect(renderCalls).toBe(1)
      })

      it('should bail out early if mapState does not depend on props', () => {
        const store = createStore(stringBuilder)
        let renderCalls = 0
        let mapStateCalls = 0

        @connect(state => {
          mapStateCalls++
          return state === 'aaa' ? { change: 1 } : {}
        })
        class Container extends Component {
          render() {
            renderCalls++
            return <Passthrough {...this.props} />
          }
        }

        rtl.render(
          <ProviderMock store={store}>
            <Container />
          </ProviderMock>
        )

        expect(renderCalls).toBe(1)
        expect(mapStateCalls).toBe(1)

        rtl.act(() => {
          store.dispatch({ type: 'APPEND', body: 'a' })
        })

        expect(mapStateCalls).toBe(2)
        expect(renderCalls).toBe(1)

        rtl.act(() => {
          store.dispatch({ type: 'APPEND', body: 'a' })
        })

        expect(mapStateCalls).toBe(3)
        expect(renderCalls).toBe(1)

        rtl.act(() => {
          store.dispatch({ type: 'APPEND', body: 'a' })
        })

        expect(mapStateCalls).toBe(4)
        expect(renderCalls).toBe(2)
      })

      it('should not call update if mergeProps return value has not changed', () => {
        let mapStateCalls = 0
        let renderCalls = 0
        const store = createStore(stringBuilder)

        @connect(
          () => ({ a: ++mapStateCalls }),
          null,
          () => ({ changed: false })
        )
        class Container extends Component {
          render() {
            renderCalls++
            return <Passthrough {...this.props} />
          }
        }

        rtl.render(
          <ProviderMock store={store}>
            <Container />
          </ProviderMock>
        )

        expect(renderCalls).toBe(1)
        expect(mapStateCalls).toBe(1)

        rtl.act(() => {
          store.dispatch({ type: 'APPEND', body: 'a' })
        })

        expect(mapStateCalls).toBe(2)
        expect(renderCalls).toBe(1)
      })

      it('should not swallow errors when bailing out early', () => {
        const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
        const store = createStore(stringBuilder)
        let renderCalls = 0
        let mapStateCalls = 0

        @connect(state => {
          mapStateCalls++
          if (state === 'a') {
            throw new Error('Oops')
          } else {
            return {}
          }
        })
        class Container extends Component {
          render() {
            renderCalls++
            return <Passthrough {...this.props} />
          }
        }

        rtl.render(
          <ProviderMock store={store}>
            <Container />
          </ProviderMock>
        )

        expect(renderCalls).toBe(1)
        expect(mapStateCalls).toBe(1)
        expect(() => store.dispatch({ type: 'APPEND', body: 'a' })).toThrow()

        spy.mockRestore()
      })
    })

    describe('HMR handling', () => {
      it.skip('should recalculate the state and rebind the actions on hot update', () => {
        const store = createStore(() => {})
        @connect(
          null,
          () => ({ scooby: 'doo' })
        )
        class ContainerBefore extends Component {
          render() {
            return <Passthrough {...this.props} />
          }
        }
        @connect(
          () => ({ foo: 'baz' }),
          () => ({ scooby: 'foo' })
        )
        class ContainerAfter extends Component {
          render() {
            return <Passthrough {...this.props} />
          }
        }
        @connect(
          () => ({ foo: 'bar' }),
          () => ({ scooby: 'boo' })
        )
        class ContainerNext extends Component {
          render() {
            return <Passthrough {...this.props} />
          }
        }
        let container
        const tester = rtl.render(
          <ProviderMock store={store}>
            <ContainerBefore ref={instance => (container = instance)} />
          </ProviderMock>
        )
        expect(tester.queryByTestId('foo')).toBe(null)
        expect(tester.getByTestId('scooby')).toHaveTextContent('doo')
        imitateHotReloading(ContainerBefore, ContainerAfter, container)
        expect(tester.getByTestId('foo')).toHaveTextContent('baz')
        expect(tester.getByTestId('scooby')).toHaveTextContent('foo')
        imitateHotReloading(ContainerBefore, ContainerNext, container)
        expect(tester.getByTestId('foo')).toHaveTextContent('bar')
        expect(tester.getByTestId('scooby')).toHaveTextContent('boo')
      })

      it.skip('should persist listeners through hot update', () => {
        const ACTION_TYPE = 'ACTION'
        const store = createStore((state = { actions: 0 }, action) => {
          switch (action.type) {
            case ACTION_TYPE: {
              return {
                actions: state.actions + 1
              }
            }
            default:
              return state
          }
        })

        @connect(state => ({ actions: state.actions }))
        class Child extends Component {
          render() {
            return <Passthrough {...this.props} />
          }
        }

        @connect(() => ({ scooby: 'doo' }))
        class ParentBefore extends Component {
          render() {
            return <Child />
          }
        }

        @connect(() => ({ scooby: 'boo' }))
        class ParentAfter extends Component {
          render() {
            return <Child />
          }
        }

        let container
        const tester = rtl.render(
          <ProviderMock store={store}>
            <ParentBefore ref={instance => (container = instance)} />
          </ProviderMock>
        )

        imitateHotReloading(ParentBefore, ParentAfter, container)

        rtl.act(() => {
          store.dispatch({ type: ACTION_TYPE })
        })

        expect(tester.getByTestId('actions')).toHaveTextContent('1')
      })
    })

    describe('Wrapped component and HOC handling', () => {
      it('should throw an error if a component is not passed to the function returned by connect', () => {
        expect(connect()).toThrow(/You must pass a component to the function/)
      })

      it('should not error on valid component with circular structure', () => {
        const createComp = Tag => {
          const Comp = React.forwardRef(function Comp(props, ref) {
            return <Tag ref={ref}>{props.count}</Tag>
          })
          Comp.__real = Comp
          return Comp
        }

        expect(() => {
          connect()(createComp('div'))
        }).not.toThrow()
      })

      it('Should work with a memo component, if it exists', () => {
        if (React.memo) {
          const store = createStore(() => ({ hi: 'there' }))

          const Container = React.memo(props => <Passthrough {...props} />) // eslint-disable-line
          Container.displayName = 'Container'
          const WrappedContainer = connect(state => state)(Container)

          const tester = rtl.render(
            <ProviderMock store={store}>
              <WrappedContainer pass="through" />
            </ProviderMock>
          )

          expect(tester.getByTestId('hi')).toHaveTextContent('there')
        }
      })

      it('should set the displayName correctly', () => {
        expect(
          connect(state => state)(
            class Foo extends Component {
              render() {
                return <div />
              }
            }
          ).displayName
        ).toBe('Connect(Foo)')

        expect(
          connect(state => state)(
            createClass({
              displayName: 'Bar',
              render() {
                return <div />
              }
            })
          ).displayName
        ).toBe('Connect(Bar)')

        expect(
          connect(state => state)(
            // eslint: In this case, we don't want to specify a displayName because we're testing what
            // happens when one isn't defined.
            /* eslint-disable react/display-name */
            createClass({
              render() {
                return <div />
              }
            })
            /* eslint-enable react/display-name */
          ).displayName
        ).toBe('Connect(Component)')
      })

      it('should allow custom displayName', () => {
        @connect(
          null,
          null,
          null,
          { getDisplayName: name => `Custom(${name})` }
        )
        class MyComponent extends React.Component {
          render() {
            return <div />
          }
        }

        expect(MyComponent.displayName).toEqual('Custom(MyComponent)')
      })

      it('should expose the wrapped component as WrappedComponent', () => {
        class Container extends Component {
          render() {
            return <Passthrough />
          }
        }

        const decorator = connect(state => state)
        const decorated = decorator(Container)

        expect(decorated.WrappedComponent).toBe(Container)
      })

      it('should hoist non-react statics from wrapped component', () => {
        class Container extends Component {
          render() {
            return <Passthrough />
          }
        }

        Container.howIsRedux = () => 'Awesome!'
        Container.foo = 'bar'

        const decorator = connect(state => state)
        const decorated = decorator(Container)

        expect(decorated.howIsRedux).toBeInstanceOf(Function)
        expect(decorated.howIsRedux()).toBe('Awesome!')
        expect(decorated.foo).toBe('bar')
      })
    })

    describe('Store subscriptions and nesting', () => {
      it('should pass dispatch and avoid subscription if arguments are falsy', () => {
        const store = createStore(() => ({
          foo: 'bar'
        }))

        function runCheck(...connectArgs) {
          @connect(...connectArgs)
          class Container extends Component {
            render() {
              return <Passthrough {...this.props} />
            }
          }

          const tester = rtl.render(
            <ProviderMock store={store}>
              <Container pass="through" />
            </ProviderMock>
          )
          expect(tester.getAllByTestId('dispatch')[0]).toHaveTextContent(
            '[function dispatch]'
          )
          expect(tester.queryByTestId('foo')).toBe(null)
          expect(tester.getAllByTestId('pass')[0]).toHaveTextContent('through')
        }

        runCheck()
        runCheck(null, null, null)
        runCheck(false, false, false)
      })

      it('should subscribe properly when a middle connected component does not subscribe', () => {
        @connect(state => ({ count: state }))
        class A extends React.Component {
          render() {
            return <B {...this.props} />
          }
        }

        @connect() // no mapStateToProps. therefore it should be transparent for subscriptions
        class B extends React.Component {
          render() {
            return <C {...this.props} />
          }
        }

        @connect((state, props) => {
          expect(props.count).toBe(state)
          return { count: state * 10 + props.count }
        })
        class C extends React.Component {
          render() {
            return <div>{this.props.count}</div>
          }
        }

        const store = createStore((state = 0, action) =>
          action.type === 'INC' ? (state += 1) : state
        )
        rtl.render(
          <ProviderMock store={store}>
            <A />
          </ProviderMock>
        )

        rtl.act(() => {
          store.dispatch({ type: 'INC' })
        })
      })

      it('should notify nested components through a blocking component', () => {
        @connect(state => ({ count: state }))
        class Parent extends Component {
          render() {
            return (
              <BlockUpdates>
                <Child />
              </BlockUpdates>
            )
          }
        }

        class BlockUpdates extends Component {
          shouldComponentUpdate() {
            return false
          }
          render() {
            return this.props.children
          }
        }

        const mapStateToProps = jest.fn(state => ({ count: state }))
        @connect(mapStateToProps)
        class Child extends Component {
          render() {
            return <div>{this.props.count}</div>
          }
        }

        const store = createStore((state = 0, action) =>
          action.type === 'INC' ? state + 1 : state
        )
        rtl.render(
          <ProviderMock store={store}>
            <Parent />
          </ProviderMock>
        )

        expect(mapStateToProps).toHaveBeenCalledTimes(1)
        rtl.act(() => {
          store.dispatch({ type: 'INC' })
        })

        expect(mapStateToProps).toHaveBeenCalledTimes(2)
      })

      it('should not notify nested components after they are unmounted', () => {
        @connect(state => ({ count: state }))
        class Parent extends Component {
          render() {
            return this.props.count === 1 ? <Child /> : null
          }
        }

        const mapStateToProps = jest.fn(state => ({ count: state }))
        @connect(mapStateToProps)
        class Child extends Component {
          render() {
            return <div>{this.props.count}</div>
          }
        }

        const store = createStore((state = 0, action) =>
          action.type === 'INC' ? state + 1 : state
        )
        rtl.render(
          <ProviderMock store={store}>
            <Parent />
          </ProviderMock>
        )

        expect(mapStateToProps).toHaveBeenCalledTimes(0)
        store.dispatch({ type: 'INC' })
        expect(mapStateToProps).toHaveBeenCalledTimes(1)
        store.dispatch({ type: 'INC' })
        expect(mapStateToProps).toHaveBeenCalledTimes(1)
      })
    })

    describe('Custom context and store-as-prop', () => {
      it('should use a custom context provider and consumer if given as an option to connect', () => {
        class Container extends Component {
          render() {
            return <Passthrough />
          }
        }

        const context = React.createContext(null)

        let actualState

        const expectedState = { foos: {} }
        const ignoredState = { bars: {} }

        const decorator = connect(
          state => {
            actualState = state
            return {}
          },
          undefined,
          undefined,
          { context }
        )
        const Decorated = decorator(Container)

        const store1 = createStore(() => expectedState)
        const store2 = createStore(() => ignoredState)

        rtl.render(
          <ProviderMock context={context} store={store1}>
            <ProviderMock store={store2}>
              <Decorated />
            </ProviderMock>
          </ProviderMock>
        )

        expect(actualState).toEqual(expectedState)
      })

      xit('should use a custom context provider and consumer if passed as a prop to the component', () => {
        class Container extends Component {
          render() {
            return <Passthrough />
          }
        }

        const context = React.createContext(null)

        let actualState

        const expectedState = { foos: {} }
        const ignoredState = { bars: {} }

        const decorator = connect(state => {
          actualState = state
          return {}
        })
        const Decorated = decorator(Container)

        const store1 = createStore(() => expectedState)
        const store2 = createStore(() => ignoredState)

        rtl.render(
          <ProviderMock context={context} store={store1}>
            <ProviderMock store={store2}>
              <Decorated context={context} />
            </ProviderMock>
          </ProviderMock>
        )

        expect(actualState).toEqual(expectedState)
      })

      it('should ignore non-react-context values that are passed as a prop to the component', () => {
        class Container extends Component {
          render() {
            return <Passthrough />
          }
        }

        const nonContext = { someProperty: {} }

        let actualState

        const expectedState = { foos: {} }

        const decorator = connect(state => {
          actualState = state
          return {}
        })
        const Decorated = decorator(Container)

        const store = createStore(() => expectedState)

        rtl.render(
          <ProviderMock store={store}>
            <Decorated context={nonContext} />
          </ProviderMock>
        )

        expect(actualState).toEqual(expectedState)
      })

      xit('should use the store from the props instead of from the context if present', () => {
        class Container extends Component {
          render() {
            return <Passthrough />
          }
        }

        let actualState

        const expectedState = { foos: {} }
        const decorator = connect(state => {
          actualState = state
          return {}
        })
        const Decorated = decorator(Container)
        const mockStore = {
          dispatch: () => {},
          subscribe: () => {},
          getState: () => expectedState
        }

        rtl.render(<Decorated store={mockStore} />)

        expect(actualState).toEqual(expectedState)
      })

      xit('should pass through ancestor subscription when store is given as a prop', () => {
        const c3Spy = jest.fn()
        const c2Spy = jest.fn()
        const c1Spy = jest.fn()

        const Comp3 = ({ first }) => {
          c3Spy()
          return <Passthrough c={first} />
        }
        const ConnectedComp3 = connect(state => state)(Comp3)

        const Comp2 = ({ second }) => {
          c2Spy()
          return (
            <div>
              <Passthrough b={second} />
              <ConnectedComp3 />
            </div>
          )
        }
        const ConnectedComp2 = connect(state => state)(Comp2)

        const Comp1 = ({ children, first }) => {
          c1Spy()
          return (
            <div>
              <Passthrough a={first} />
              {children}
            </div>
          )
        }
        const ConnectedComp1 = connect(state => state)(Comp1)

        const reducer1 = (state = { first: '1' }, action) => {
          switch (action.type) {
            case 'CHANGE':
              return { first: '2' }
            default:
              return state
          }
        }

        const reducer2 = (state = { second: '3' }, action) => {
          switch (action.type) {
            case 'CHANGE':
              return { second: '4' }
            default:
              return state
          }
        }

        const store1 = createStore(reducer1)
        const store2 = createStore(reducer2)

        const tester = rtl.render(
          <ProviderMock store={store1}>
            <ConnectedComp1>
              <ConnectedComp2 store={store2} />
            </ConnectedComp1>
          </ProviderMock>
        )

        // Initial render: C1/C3 read from store 1, C2 reads from store 2, one render each
        expect(tester.getByTestId('a')).toHaveTextContent('1')
        expect(tester.getByTestId('b')).toHaveTextContent('3')
        expect(tester.getByTestId('c')).toHaveTextContent('1')

        expect(c3Spy).toHaveBeenCalledTimes(1)
        expect(c2Spy).toHaveBeenCalledTimes(1)
        expect(c1Spy).toHaveBeenCalledTimes(1)

        rtl.act(() => {
          store1.dispatch({ type: 'CHANGE' })
        })

        // Store 1 update: C1 and C3 should re-render, no updates for C2
        expect(tester.getByTestId('a')).toHaveTextContent('2')
        expect(tester.getByTestId('b')).toHaveTextContent('3')
        expect(tester.getByTestId('c')).toHaveTextContent('2')

        expect(c3Spy).toHaveBeenCalledTimes(2)
        expect(c2Spy).toHaveBeenCalledTimes(1)
        expect(c1Spy).toHaveBeenCalledTimes(2)

        rtl.act(() => {
          store2.dispatch({ type: 'CHANGE' })
        })

        // Store 2 update: C2 should re-render, no updates for C1 or C3
        expect(tester.getByTestId('a')).toHaveTextContent('2')
        expect(tester.getByTestId('b')).toHaveTextContent('4')
        expect(tester.getByTestId('c')).toHaveTextContent('2')

        expect(c3Spy).toHaveBeenCalledTimes(2)
        expect(c2Spy).toHaveBeenCalledTimes(2)
        expect(c1Spy).toHaveBeenCalledTimes(2)
      })

      it('should subscribe properly when a new store is provided via props', () => {
        const store1 = createStore((state = 0, action) =>
          action.type === 'INC' ? state + 1 : state
        )
        const store2 = createStore((state = 0, action) =>
          action.type === 'INC' ? state + 1 : state
        )
        const customContext = React.createContext()

        @connect(
          state => ({ count: state }),
          undefined,
          undefined,
          { context: customContext }
        )
        class A extends Component {
          render() {
            return <B />
          }
        }

        const mapStateToPropsB = jest.fn(state => ({ count: state }))
        @connect(
          mapStateToPropsB,
          undefined,
          undefined,
          { context: customContext }
        )
        class B extends Component {
          render() {
            return <C {...this.props} />
          }
        }

        const mapStateToPropsC = jest.fn(state => ({ count: state }))
        @connect(
          mapStateToPropsC,
          undefined,
          undefined,
          { context: customContext }
        )
        class C extends Component {
          render() {
            return <D />
          }
        }

        const mapStateToPropsD = jest.fn(state => ({ count: state }))
        @connect(mapStateToPropsD)
        class D extends Component {
          render() {
            return <div>{this.props.count}</div>
          }
        }

        rtl.render(
          <ProviderMock store={store1}>
            <ProviderMock context={customContext} store={store2}>
              <A />
            </ProviderMock>
          </ProviderMock>
        )
        expect(mapStateToPropsB).toHaveBeenCalledTimes(1)
        expect(mapStateToPropsC).toHaveBeenCalledTimes(1)
        expect(mapStateToPropsD).toHaveBeenCalledTimes(1)

        rtl.act(() => {
          store1.dispatch({ type: 'INC' })
        })

        expect(mapStateToPropsB).toHaveBeenCalledTimes(1)
        expect(mapStateToPropsC).toHaveBeenCalledTimes(1)
        expect(mapStateToPropsD).toHaveBeenCalledTimes(2)

        rtl.act(() => {
          store2.dispatch({ type: 'INC' })
        })
        expect(mapStateToPropsB).toHaveBeenCalledTimes(2)
        expect(mapStateToPropsC).toHaveBeenCalledTimes(2)
        expect(mapStateToPropsD).toHaveBeenCalledTimes(2)
      })
    })

    describe('Refs', () => {
      it.skip('should throw when trying to access the wrapped instance if withRef is not specified', () => {
        const store = createStore(() => ({}))

        class Container extends Component {
          render() {
            return <Passthrough />
          }
        }

        const decorator = connect(state => state)
        const Decorated = decorator(Container)

        class Wrapper extends Component {
          render() {
            return <Decorated ref={comp => comp && comp.getWrappedInstance()} />
          }
        }

        // TODO Remove this when React is fixed, per https://github.com/facebook/react/issues/11098
        const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
        expect(() =>
          rtl.render(
            <ProviderMock store={store}>
              <Wrapper />
            </ProviderMock>
          )
        ).toThrow(
          `To access the wrapped instance, you need to specify { withRef: true } in the options argument of the connect() call`
        )
        spy.mockRestore()
      })

      it('should return the instance of the wrapped component for use in calling child methods', async done => {
        const store = createStore(() => ({}))

        const someData = {
          some: 'data'
        }

        class Container extends Component {
          someInstanceMethod() {
            return someData
          }

          render() {
            return <Passthrough loaded="yes" />
          }
        }

        const decorator = connect(
          state => state,
          null,
          null,
          { forwardRef: true }
        )
        const Decorated = decorator(Container)

        const ref = React.createRef()

        class Wrapper extends Component {
          render() {
            return <Decorated ref={ref} />
          }
        }

        const tester = rtl.render(
          <ProviderMock store={store}>
            <Wrapper />
          </ProviderMock>
        )

        await rtl.waitForElement(() => tester.getByTestId('loaded'))

        expect(ref.current.someInstanceMethod()).toBe(someData)
        done()
      })

      it('should correctly separate and pass through props to the wrapped component with a forwarded ref', () => {
        const store = createStore(() => ({}))

        class Container extends Component {
          render() {
            return <Passthrough {...this.props} />
          }
        }

        const decorator = connect(
          state => state,
          null,
          null,
          { forwardRef: true }
        )
        const Decorated = decorator(Container)

        const ref = React.createRef()

        class Wrapper extends Component {
          render() {
            // The 'a' prop should eventually be passed to the wrapped component individually,
            // not sent through as `wrapperProps={ {a : 42} }`
            return <Decorated ref={ref} a={42} />
          }
        }

        const tester = rtl.render(
          <ProviderMock store={store}>
            <Wrapper />
          </ProviderMock>
        )

        expect(tester.getByTestId('a')).toHaveTextContent('42')
      })
    })

    describe('Impure behavior', () => {
      it('should return the instance of the wrapped component for use in calling child methods, impure component', async done => {
        const store = createStore(() => ({}))

        const someData = {
          some: 'data'
        }

        class Container extends Component {
          someInstanceMethod() {
            return someData
          }

          render() {
            return <Passthrough loaded="yes" />
          }
        }

        const decorator = connect(
          state => state,
          undefined,
          undefined,
          { forwardRef: true, pure: false }
        )
        const Decorated = decorator(Container)

        const ref = React.createRef()

        class Wrapper extends Component {
          render() {
            return <Decorated ref={ref} />
          }
        }

        const tester = rtl.render(
          <ProviderMock store={store}>
            <Wrapper />
          </ProviderMock>
        )

        await rtl.waitForElement(() => tester.getByTestId('loaded'))

        expect(ref.current.someInstanceMethod()).toBe(someData)
        done()
      })

      it('should wrap impure components without supressing updates', () => {
        const store = createStore(() => ({}))

        class ImpureComponent extends Component {
          render() {
            return <Passthrough statefulValue={this.context.statefulValue} />
          }
        }

        ImpureComponent.contextTypes = {
          statefulValue: PropTypes.number
        }

        const decorator = connect(
          state => state,
          null,
          null,
          { pure: false }
        )
        const Decorated = decorator(ImpureComponent)

        let externalSetState
        class StatefulWrapper extends Component {
          constructor() {
            super()
            this.state = { value: 0 }
            externalSetState = this.setState.bind(this)
          }

          getChildContext() {
            return {
              statefulValue: this.state.value
            }
          }

          render() {
            return <Decorated />
          }
        }

        StatefulWrapper.childContextTypes = {
          statefulValue: PropTypes.number
        }

        const tester = rtl.render(
          <ProviderMock store={store}>
            <StatefulWrapper />
          </ProviderMock>
        )

        expect(tester.getByTestId('statefulValue')).toHaveTextContent('0')
        externalSetState({ value: 1 })
        expect(tester.getByTestId('statefulValue')).toHaveTextContent('1')
      })

      it('calls mapState and mapDispatch for impure components', () => {
        const store = createStore(() => ({
          foo: 'foo',
          bar: 'bar'
        }))

        const mapStateSpy = jest.fn()
        const mapDispatchSpy = jest.fn().mockReturnValue({})
        const impureRenderSpy = jest.fn()

        class ImpureComponent extends Component {
          render() {
            impureRenderSpy()
            return <Passthrough statefulValue={this.props.value} />
          }
        }

        const decorator = connect(
          (state, { storeGetter }) => {
            mapStateSpy()
            return { value: state[storeGetter.storeKey] }
          },
          mapDispatchSpy,
          null,
          { pure: false }
        )
        const Decorated = decorator(ImpureComponent)

        let externalSetState
        let storeGetter
        class StatefulWrapper extends Component {
          constructor() {
            super()
            storeGetter = { storeKey: 'foo' }
            this.state = {
              storeGetter
            }
            externalSetState = this.setState.bind(this)
          }
          render() {
            return <Decorated storeGetter={this.state.storeGetter} />
          }
        }

        const tester = rtl.render(
          <ProviderMock store={store}>
            <StatefulWrapper />
          </ProviderMock>
        )

        // 1) Initial render
        expect(mapStateSpy).toHaveBeenCalledTimes(1)
        expect(mapDispatchSpy).toHaveBeenCalledTimes(1)

        // 1) Initial render
        expect(impureRenderSpy).toHaveBeenCalledTimes(1)
        expect(tester.getByTestId('statefulValue')).toHaveTextContent('foo')

        // Impure update
        storeGetter.storeKey = 'bar'
        externalSetState({ storeGetter })

        // 2) After the the impure update
        expect(mapStateSpy).toHaveBeenCalledTimes(2)
        expect(mapDispatchSpy).toHaveBeenCalledTimes(2)

        // 2) Triggered by impure update
        expect(impureRenderSpy).toHaveBeenCalledTimes(2)
        expect(tester.getByTestId('statefulValue')).toHaveTextContent('bar')
      })

      it('should update impure components whenever the state of the store changes', () => {
        const store = createStore(() => ({}))
        let renderCount = 0

        @connect(
          () => ({}),
          null,
          null,
          { pure: false }
        )
        class ImpureComponent extends React.Component {
          render() {
            ++renderCount
            return <div />
          }
        }

        rtl.render(
          <ProviderMock store={store}>
            <ImpureComponent />
          </ProviderMock>
        )

        const rendersBeforeStateChange = renderCount
        rtl.act(() => {
          store.dispatch({ type: 'ACTION' })
        })

        expect(renderCount).toBe(rendersBeforeStateChange + 1)
      })

      it('should update impure components with custom mergeProps', () => {
        let store = createStore(() => ({}))
        let renderCount = 0

        @connect(
          null,
          null,
          () => ({ a: 1 }),
          { pure: false }
        )
        class Container extends React.Component {
          render() {
            ++renderCount
            return <div />
          }
        }

        class Parent extends React.Component {
          componentDidMount() {
            this.forceUpdate()
          }
          render() {
            return <Container />
          }
        }

        rtl.render(
          <ProviderMock store={store}>
            <Parent>
              <Container />
            </Parent>
          </ProviderMock>
        )

        expect(renderCount).toBe(2)
      })
    })

    describe('Factory functions for mapState/mapDispatch', () => {
      it('should allow providing a factory function to mapStateToProps', () => {
        let updatedCount = 0
        let memoizedReturnCount = 0
        const store = createStore(() => ({ value: 1 }))

        const mapStateFactory = () => {
          let lastProp, lastVal, lastResult
          return (state, props) => {
            if (props.name === lastProp && lastVal === state.value) {
              memoizedReturnCount++
              return lastResult
            }
            lastProp = props.name
            lastVal = state.value
            return (lastResult = {
              someObject: { prop: props.name, stateVal: state.value }
            })
          }
        }

        @connect(mapStateFactory)
        class Container extends Component {
          componentDidUpdate() {
            updatedCount++
          }
          render() {
            return <Passthrough {...this.props} />
          }
        }

        rtl.render(
          <ProviderMock store={store}>
            <div>
              <Container name="a" />
              <Container name="b" />
            </div>
          </ProviderMock>
        )

        rtl.act(() => {
          store.dispatch({ type: 'test' })
        })

        expect(updatedCount).toBe(0)
        expect(memoizedReturnCount).toBe(2)
      })

      it('should allow a mapStateToProps factory consuming just state to return a function that gets ownProps', () => {
        const store = createStore(() => ({ value: 1 }))

        let initialState
        let initialOwnProps
        let secondaryOwnProps
        const mapStateFactory = function(factoryInitialState) {
          initialState = factoryInitialState
          initialOwnProps = arguments[1]
          return (state, props) => {
            secondaryOwnProps = props
            return {}
          }
        }

        @connect(mapStateFactory)
        class Container extends Component {
          render() {
            return <Passthrough {...this.props} />
          }
        }

        rtl.render(
          <ProviderMock store={store}>
            <div>
              <Container name="a" />
            </div>
          </ProviderMock>
        )

        rtl.act(() => {
          store.dispatch({ type: 'test' })
        })

        expect(initialOwnProps).toBe(undefined)
        expect(initialState).not.toBe(undefined)
        expect(secondaryOwnProps).not.toBe(undefined)
        expect(secondaryOwnProps.name).toBe('a')
      })

      it('should allow providing a factory function to mapDispatchToProps', () => {
        let updatedCount = 0
        let memoizedReturnCount = 0
        const store = createStore(() => ({ value: 1 }))

        const mapDispatchFactory = () => {
          let lastProp, lastResult
          return (dispatch, props) => {
            if (props.name === lastProp) {
              memoizedReturnCount++
              return lastResult
            }
            lastProp = props.name
            return (lastResult = { someObject: { dispatchFn: dispatch } })
          }
        }
        function mergeParentDispatch(stateProps, dispatchProps, parentProps) {
          return { ...stateProps, ...dispatchProps, name: parentProps.name }
        }

        @connect(
          null,
          mapDispatchFactory,
          mergeParentDispatch
        )
        class Passthrough extends Component {
          componentDidUpdate() {
            updatedCount++
          }
          render() {
            return <div />
          }
        }

        class Container extends Component {
          constructor(props) {
            super(props)
            this.state = { count: 0 }
          }
          componentDidMount() {
            this.setState({ count: 1 })
          }
          render() {
            const { count } = this.state
            return (
              <div>
                <Passthrough count={count} name="a" />
                <Passthrough count={count} name="b" />
              </div>
            )
          }
        }

        rtl.render(
          <ProviderMock store={store}>
            <Container />
          </ProviderMock>
        )

        rtl.act(() => {
          store.dispatch({ type: 'test' })
        })

        expect(updatedCount).toBe(0)
        expect(memoizedReturnCount).toBe(2)
      })
    })

    describe('Error handling for invalid arguments', () => {
      function renderWithBadConnect(Component) {
        const store = createStore(() => ({}))
        const spy = jest.spyOn(console, 'error').mockImplementation(() => {})

        try {
          rtl.render(
            <ProviderMock store={store}>
              <Component pass="through" />
            </ProviderMock>
          )
          return null
        } catch (error) {
          return error.message
        } finally {
          spy.mockRestore()
        }
      }

      it('should throw a helpful error for invalid mapStateToProps arguments', () => {
        @connect('invalid')
        class InvalidMapState extends React.Component {
          render() {
            return <div />
          }
        }

        const error = renderWithBadConnect(InvalidMapState)
        expect(error).toContain('string')
        expect(error).toContain('mapStateToProps')
        expect(error).toContain('InvalidMapState')
      })

      it('should throw a helpful error for invalid mapDispatchToProps arguments', () => {
        @connect(
          null,
          'invalid'
        )
        class InvalidMapDispatch extends React.Component {
          render() {
            return <div />
          }
        }

        const error = renderWithBadConnect(InvalidMapDispatch)
        expect(error).toContain('string')
        expect(error).toContain('mapDispatchToProps')
        expect(error).toContain('InvalidMapDispatch')
      })

      it('should throw a helpful error for invalid mergeProps arguments', () => {
        @connect(
          null,
          null,
          'invalid'
        )
        class InvalidMerge extends React.Component {
          render() {
            return <div />
          }
        }

        const error = renderWithBadConnect(InvalidMerge)
        expect(error).toContain('string')
        expect(error).toContain('mergeProps')
        expect(error).toContain('InvalidMerge')
      })
    })

    describe('Error handling for removed API options and StrictMode', () => {
      it('should error on withRef=true', () => {
        class Container extends Component {
          render() {
            return <div>hi</div>
          }
        }
        expect(() =>
          connect(
            undefined,
            undefined,
            undefined,
            { withRef: true }
          )(Container)
        ).toThrow(/withRef is removed/)
      })

      it('should error on receiving a custom store key', () => {
        const connectOptions = { storeKey: 'customStoreKey' }

        expect(() => {
          @connect(
            undefined,
            undefined,
            undefined,
            connectOptions
          )
          class Container extends Component {
            render() {
              return <Passthrough {...this.props} />
            }
          }
          new Container()
        }).toThrow(/storeKey has been removed/)
      })

      it.skip('should error on custom store', () => {
        function Comp() {
          return <div>hi</div>
        }
        const Container = connect()(Comp)
        function Oops() {
          return <Container store={'oops'} />
        }
        expect(() => {
          rtl.render(<Oops />)
        }).toThrow(/Passing redux store/)
      })

      it('should error on renderCount prop if specified in connect options', () => {
        function Comp(props) {
          return <div>{props.count}</div>
        }
        expect(() => {
          connect(
            undefined,
            undefined,
            undefined,
            { renderCountProp: 'count' }
          )(Comp)
        }).toThrow(/renderCountProp is removed/)
      })

      it('works in <StrictMode> without warnings (React 16.3+)', () => {
        if (!React.StrictMode) {
          return
        }
        const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
        const store = createStore(stringBuilder)

        @connect(state => ({ string: state }))
        class Container extends Component {
          render() {
            return <Passthrough {...this.props} />
          }
        }

        rtl.render(
          <React.StrictMode>
            <ProviderMock store={store}>
              <Container />
            </ProviderMock>
          </React.StrictMode>
        )

        expect(spy).not.toHaveBeenCalled()
      })
    })

    describe('Subscription and update timing correctness', () => {
      it('should pass state consistently to mapState', () => {
        const store = createStore(stringBuilder)

        rtl.act(() => {
          store.dispatch({ type: 'APPEND', body: 'a' })
        })

        let childMapStateInvokes = 0

        @connect(state => {
          return { state }
        })
        class Container extends Component {
          emitChange() {
            store.dispatch({ type: 'APPEND', body: 'b' })
          }

          render() {
            return (
              <div>
                <button onClick={this.emitChange.bind(this)}>change</button>
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
        const button = tester.getByText('change')
        rtl.fireEvent.click(button)
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
            <div
              data-testid="child"
              data-prop={props.prop}
              data-count={props.count}
            />
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
        expect(rendered.getByTestId('child').dataset.count).toEqual('0')
        expect(rendered.getByTestId('child').dataset.prop).toEqual('a')

        // Force the multi-update sequence by running this bound action creator
        rtl.act(() => parent.inc1())

        // The connected child component _should_ have rendered with the latest Redux
        // store value (3) _and_ the latest wrapper prop ('b').
        expect(rendered.getByTestId('child').dataset.count).toEqual('3')
        expect(rendered.getByTestId('child').dataset.prop).toEqual('b')
      })

      // @TODO this test doesn't make sense in a work loop async situation
      // it can be made to pass by awaiting the tree to reconcile fully but
      // because dispatches do not flush synchronously the component state
      // triggered re-render does not pick up the latest state because we haven't
      // finishehd updating earlier states
      xit('should invoke mapState always with latest store state', () => {
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

        rtl.act(() => {
          store.dispatch({ type: '' })
          store.dispatch({ type: '' })
          outerComponent.setState(({ count }) => ({ count: count + 1 }))
        })

        expect(reduxCountPassedToMapState).toEqual(3)
      })

      it('REVIEW NEEDED - should ensure top-down updates for consecutive batched updates', () => {
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
          return <div>child</div>
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

    it("should enforce top-down updates to ensure a deleted child's mapState doesn't throw errors", () => {
      const initialState = {
        a: { id: 'a', name: 'Item A' },
        b: { id: 'b', name: 'Item B' },
        c: { id: 'c', name: 'Item C' }
      }

      const reducer = (state = initialState, action) => {
        switch (action.type) {
          case 'DELETE_B': {
            const newState = { ...state }
            delete newState.b
            return newState
          }
          default:
            return state
        }
      }

      const store = createStore(reducer)

      const ListItem = ({ name }) => <div>Name: {name}</div>

      let thrownError = null

      const listItemMapState = (state, ownProps) => {
        try {
          const item = state[ownProps.id]
          // If this line executes when item B has been deleted, it will throw an error.
          // For this test to succeed, we should never execute mapState for item B after the item
          // has been deleted, because the parent should re-render the component out of existence.
          const { name } = item
          return { name }
        } catch (e) {
          thrownError = e
        }
      }

      const ConnectedListItem = connect(listItemMapState)(ListItem)

      const appMapState = state => {
        const itemIds = Object.keys(state)
        return { itemIds }
      }

      function App({ itemIds }) {
        const items = itemIds.map(id => <ConnectedListItem key={id} id={id} />)

        return (
          <div className="App">
            {items}
            <button data-testid="deleteB">Delete B</button>
          </div>
        )
      }

      const ConnectedApp = connect(appMapState)(App)

      rtl.render(
        <ProviderMock store={store}>
          <ConnectedApp />
        </ProviderMock>
      )

      // This should execute without throwing an error by itself
      rtl.act(() => {
        store.dispatch({ type: 'DELETE_B' })
      })

      expect(thrownError).toBe(null)
    })

    it('should re-throw errors that occurred in a mapState/mapDispatch function', () => {
      const counter = (state = 0, action) =>
        action.type === 'INCREMENT' ? state + 1 : state

      const store = createStore(counter)

      const appMapState = state => {
        if (state >= 1) {
          throw new Error('KABOOM!')
        }

        return { counter: state }
      }

      const App = ({ counter }) => <div>Count: {counter}</div>
      const ConnectedApp = connect(appMapState)(App)

      rtl.render(
        <ProviderMock store={store}>
          <ConnectedApp />
        </ProviderMock>
      )

      // Turn off extra console logging
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {})

      expect(() => {
        rtl.act(() => {
          store.dispatch({ type: 'INCREMENT' })
        })
      }).toThrow('KABOOM!')

      spy.mockRestore()
    })
  })
})
