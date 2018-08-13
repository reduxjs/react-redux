/*eslint-disable react/prop-types*/

import React, { Component } from 'react'
import createClass from 'create-react-class'
import PropTypes from 'prop-types'
import ReactDOM from 'react-dom'
import { createStore } from 'redux'
import { Provider, connect } from '../../src/index.js'
import * as rtl from 'react-testing-library'
import 'jest-dom/extend-expect'

describe('React', () => {
  describe('connect', () => {
    const propMapper = prop => {
      switch (typeof prop) {
        case 'object':
        case 'boolean':
          return JSON.stringify(prop)
        case 'function':
          if (prop.mine) {
            return '[my function ' + prop.name + ']'
          }
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
              <li title="prop" data-testid={prop} key={prop}>{propMapper(this.props[prop])}</li>
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
        return (() => this.listeners.filter(l => l !== listener))
      }

      dispatch(action) {
        this.state = this.reducer(this.getState(), action)
        this.listeners.forEach(l => l())
        return action
      }
    }

    function stringBuilder(prev = '', action) {
      return action.type === 'APPEND'
        ? prev + action.body
        : prev
    }

    afterEach(() => rtl.cleanup())

    it('should receive the store in the context', () => {
      const store = createStore(() => ({ hi: 'there' }))

      @connect(state => state)
      class Container extends Component {
        render() {
          return <Passthrough {...this.props} />
        }
      }

      const tester = rtl.render(<Provider store={store}>
        <Container pass="through" />
      </Provider>)

      expect(tester.getByTestId('hi')).toHaveTextContent('there')
    })

    it('should pass state and props to the given component', () => {
      const store = createStore(() => ({
        foo: 'bar',
        baz: 42,
        hello: 'world'
      }))

      @connect(({ foo, baz }) => ({ foo, baz }), {})
      class Container extends Component {
        render() {
          return <Passthrough {...this.props} />
        }
      }

      const tester = rtl.render(
        <Provider store={store}>
          <Container pass="through" baz={50} />
        </Provider>
      )
      expect(tester.getByTestId('pass')).toHaveTextContent('through')
      expect(tester.getByTestId('foo')).toHaveTextContent('bar')
      expect(tester.getByTestId('baz')).toHaveTextContent('42')
      expect(tester.queryByTestId('hello')).toBe(null)
    })

    it('should subscribe class components to the store changes', () => {
      const store = createStore(stringBuilder)

      @connect(state => ({ string: state }) )
      class Container extends Component {
        render() {
          return <Passthrough {...this.props}/>
        }
      }

      const tester = rtl.render(
        <Provider store={store}>
          <Container />
        </Provider>
      )
      expect(tester.getByTestId('string')).toHaveTextContent('')
      store.dispatch({ type: 'APPEND', body: 'a' })
      expect(tester.getByTestId('string')).toHaveTextContent('a')
      store.dispatch({ type: 'APPEND', body: 'b' })
      expect(tester.getByTestId('string')).toHaveTextContent('ab')
    })

    it('should subscribe pure function components to the store changes', () => {
      const store = createStore(stringBuilder)

      const Container = connect(
        state => ({ string: state }), {}
      )(function Container(props) {
        return <Passthrough {...props} />
      })

      const spy = jest.spyOn(console, 'error').mockImplementation(() => {})

      const tester = rtl.render(
        <Provider store={store}>
          <Container />
        </Provider>
      )
      expect(spy).toHaveBeenCalledTimes(0)
      spy.mockRestore()

      expect(tester.getByTestId('string')).toHaveTextContent('')
      store.dispatch({ type: 'APPEND', body: 'a' })
      expect(tester.getByTestId('string')).toHaveTextContent('a')
      store.dispatch({ type: 'APPEND', body: 'b' })
      expect(tester.getByTestId('string')).toHaveTextContent('ab')
    })

    it('should retain the store\'s context', () => {
      const store = new ContextBoundStore(stringBuilder)

      let Container = connect(
        state => ({ string: state }), {}
      )(function Container(props) {
        return <Passthrough {...props}/>
      })

      const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
      const tester = rtl.render(
        <Provider store={store}>
          <Container />
        </Provider>
      )
      expect(spy).toHaveBeenCalledTimes(0)
      spy.mockRestore()

      expect(tester.getByTestId('string')).toHaveTextContent('')
      store.dispatch({ type: 'APPEND', body: 'a' })
      expect(tester.getByTestId('string')).toHaveTextContent('a')
    })

    it('should handle dispatches before componentDidMount', () => {
      const store = createStore(stringBuilder)

      @connect(state => ({ string: state }), {})
      class Container extends Component {
        componentDidMount() {
          store.dispatch({ type: 'APPEND', body: 'a' })
        }

        render() {
          return <Passthrough {...this.props}/>
        }
      }
      const tester = rtl.render(
        <Provider store={store}>
          <Container />
        </Provider>
      )
      expect(tester.getByTestId('string')).toHaveTextContent('a')
    })

    it('should handle additional prop changes in addition to slice', () => {
      const store = createStore(() => ({
        foo: 'bar'
      }))

      @connect(state => state, {})
      class ConnectContainer extends Component {
        render() {
          return (
            <Passthrough {...this.props} pass={this.props.bar.baz} />
          )
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
            <Provider store={store}>
              <ConnectContainer bar={this.state.bar} />
             </Provider>
          )
        }
      }

      const tester = rtl.render(<Container />)

      expect(tester.getByTestId('foo')).toHaveTextContent('bar')
      expect(tester.getByTestId('pass')).toHaveTextContent('through')
    })

    it('should handle unexpected prop changes with forceUpdate()', () => {
      const store = createStore(() => ({}))

      @connect(state => state, {})
      class ConnectContainer extends Component {
        render() {
          return (
            <Passthrough {...this.props} pass={this.props.bar} />
          )
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
          this.c.forceUpdate()
        }

        render() {
          return (
            <Provider store={store}>
              <ConnectContainer bar={this.bar} ref={c => this.c = c} />
            </Provider>
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

      @connect(() => ({}), () => ({}))
      class ConnectContainer extends Component {
        render() {
          return (
            <Passthrough {...this.props} />
          )
        }
      }

      class HolderContainer extends Component {
        render() {
          return (
            <ConnectContainer {...props} />
          )
        }
      }

      const tester = rtl.render(
        <Provider store={store}>
          <HolderContainer ref={instance => container = instance} />
        </Provider>
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
          return (
            <Passthrough {...this.props} />
          )
        }
      }

      class HolderContainer extends Component {
        render() {
          return (
            <ConnectContainer {...props} />
          )
        }
      }

      const tester = rtl.render(
        <Provider store={store}>
          <HolderContainer ref={instance => container = instance} />
        </Provider>
      )

      expect(tester.getAllByTitle('prop').length).toBe(2)
      expect(tester.getByTestId('dispatch')).toHaveTextContent('[function dispatch]')
      expect(tester.getByTestId('x')).toHaveTextContent('true')

      props = {}
      container.forceUpdate()

      expect(tester.getAllByTitle('prop').length).toBe(1)
      expect(tester.getByTestId('dispatch')).toHaveTextContent('[function dispatch]')
    })

    it('should ignore deep mutations in props', () => {
      const store = createStore(() => ({
        foo: 'bar'
      }))

      @connect(state => state)
      class ConnectContainer extends Component {
        render() {
          return (
            <Passthrough {...this.props} pass={this.props.bar.baz} />
          )
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
            <Provider store={store}>
              <ConnectContainer bar={this.state.bar} />
            </Provider>
          )
        }
      }

      const tester = rtl.render(<Container/>)
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
          doSomething: (whatever) => dispatch(doSomething(whatever))
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
          return <Passthrough {...this.props}/>
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
            <Provider store={store}>
              <Container extra={this.state.extra} />
            </Provider>
          )
        }
      }

      const tester = rtl.render(<OuterContainer/>)

      expect(tester.getByTestId('stateThing')).toHaveTextContent('')
      merged('a')
      expect(tester.getByTestId('stateThing')).toHaveTextContent('HELLO az')
      merged('b')
      expect(tester.getByTestId('stateThing')).toHaveTextContent('HELLO azbz')
      externalSetState({ extra: 'Z' })
      merged('c')
      expect(tester.getByTestId('stateThing')).toHaveTextContent('HELLO azbzcZ')
    })

    it('should merge actionProps into WrappedComponent', () => {
      const store = createStore(() => ({
        foo: 'bar'
      }))
      store.dispatch.mine = 'hi'

      @connect(
        state => state,
        dispatch => ({ dispatch })
      )
      class Container extends Component {
        render() {
          return <Passthrough {...this.props} />
        }
      }

      const tester = rtl.render(
        <Provider store={store}>
          <Container pass="through" />
        </Provider>
      )

      expect(tester.getByTestId('dispatch')).toHaveTextContent('[my function dispatch]')
      expect(tester.getByTestId('foo')).toHaveTextContent('bar')
    })

    it('should not invoke mapState when props change if it only has one argument', () => {
      const store = createStore(stringBuilder)

      let invocationCount = 0

      /*eslint-disable no-unused-vars */
      @connect((arg1) => {
        invocationCount++
        return {}
      })
      /*eslint-enable no-unused-vars */
      class WithoutProps extends Component {
        render() {
          return <Passthrough {...this.props}/>
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
        <Provider store={store}>
          <OuterComponent ref={c => outerComponent = c} />
        </Provider>
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
          return <Passthrough {...this.props}/>
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
        <Provider store={store}>
          <OuterComponent ref={c => outerComponent = c} />
        </Provider>
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
          return <Passthrough {...this.props}/>
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
        <Provider store={store}>
          <OuterComponent ref={c => outerComponent = c} />
        </Provider>
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
      @connect(null, (arg1) => {
        invocationCount++
        return {}
      })
      /*eslint-enable no-unused-vars */
      class WithoutProps extends Component {
        render() {
          return <Passthrough {...this.props}/>
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
        <Provider store={store}>
          <OuterComponent ref={c => outerComponent = c} />
        </Provider>
      )

      outerComponent.setFoo('BAR')
      outerComponent.setFoo('DID')

      expect(invocationCount).toEqual(1)
    })

    it('should invoke mapDispatch every time props are changed if it has zero arguments', () => {
      const store = createStore(stringBuilder)

      let invocationCount = 0

      @connect(null, () => {
        invocationCount++
        return {}
      })

      class WithoutProps extends Component {
        render() {
          return <Passthrough {...this.props}/>
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
        <Provider store={store}>
          <OuterComponent ref={c => outerComponent = c} />
        </Provider>
      )

      outerComponent.setFoo('BAR')
      outerComponent.setFoo('DID')

      expect(invocationCount).toEqual(3)
    })

    it('should invoke mapDispatch every time props are changed if it has a second argument', () => {
      const store = createStore(stringBuilder)

      let propsPassedIn
      let invocationCount = 0

      @connect(null, (dispatch, props) => {
        invocationCount++
        propsPassedIn = props
        return {}
      })
      class WithProps extends Component {
        render() {
          return <Passthrough {...this.props}/>
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
        <Provider store={store}>
          <OuterComponent ref={c => outerComponent = c} />
        </Provider>
      )

      outerComponent.setFoo('BAR')
      outerComponent.setFoo('BAZ')

      expect(invocationCount).toEqual(3)
      expect(propsPassedIn).toEqual({
        foo: 'BAZ'
      })
    })

    it('should pass dispatch and avoid subscription if arguments are falsy', () => {
      const store = createStore(() => ({
        foo: 'bar'
      }))
      store.dispatch.mine = 'hi'

      function runCheck(...connectArgs) {
        @connect(...connectArgs)
        class Container extends Component {
          render() {
            return <Passthrough {...this.props} />
          }
        }

        const tester = rtl.render(
          <Provider store={store}>
            <Container pass="through" />
          </Provider>
        )
        expect(tester.getByTestId('dispatch')).toHaveTextContent('[my function dispatch]')
        expect(tester.queryByTestId('foo')).toBe(null)
        expect(tester.getByTestId('pass')).toHaveTextContent('through')
      }

      runCheck()
      runCheck(null, null, null)
      runCheck(false, false, false)
    })

    it('should unsubscribe before unmounting', () => {
      const store = createStore(stringBuilder)
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

      @connect(
        state => ({ string: state }),
        dispatch => ({ dispatch })
      )
      class Container extends Component {
        render() {
          return <Passthrough {...this.props} />
        }
      }

      const div = document.createElement('div')
      ReactDOM.render(
        <Provider store={store}>
          <Container />
        </Provider>,
        div
      )

      expect(spy).toHaveBeenCalledTimes(0)
      ReactDOM.unmountComponentAtNode(div)
      expect(spy).toHaveBeenCalledTimes(1)
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
      store.subscribe(() =>
        ReactDOM.unmountComponentAtNode(div)
      )
      ReactDOM.render(
        <Provider store={store}>
          <Container />
        </Provider>,
        div
      )

      expect(mapStateToPropsCalls).toBe(1)
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
      store.dispatch({ type: 'APPEND', body: 'a' })
      expect(spy).toHaveBeenCalledTimes(0)
      expect(mapStateToPropsCalls).toBe(1)
      spy.mockRestore()
    })

    it('should not attempt to notify unmounted child of state change', () => {
      const store = createStore(stringBuilder)

      @connect((state) => ({ hide: state === 'AB' }))
      class App extends Component {
        render() {
          return this.props.hide ? null : <Container />
        }
      }

      @connect(() => ({}))
      class Container extends Component {
        render() {
          return (
            <Child />
          )
        }
      }

      @connect((state) => ({ state }))
      class Child extends Component {
        componentDidMount() {
          if (this.props.state === 'A') {
            store.dispatch({ type: 'APPEND', body: 'B' });
          }
        }
        render() {
          return null;
        }
      }

      const div = document.createElement('div')
      ReactDOM.render(
        <Provider store={store}>
          <App />
        </Provider>,
        div
      )

      try {
        store.dispatch({ type: 'APPEND', body: 'A' })
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
            <a href="#" onClick={onClick('a')} ref={c => { linkA = c }}>A</a>
            <a href="#" onClick={onClick('b')} ref={c => { linkB = c }}>B</a>
            {children}
          </div>
        )
        /* eslint-enable react/jsx-no-bind */
      }
      App = connect(() => ({}))(App)


      let A = () => (<h1>A</h1>)
      A = connect(() => ({ calls: ++mapStateToPropsCalls }))(A)


      const B = () => (<h1>B</h1>)


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
            case 'a': return <A />
            case 'b': return <B />
            default: throw new Error('Unknown location: ' + location)
          }
        }

        render() {
          return (<App setLocation={this.setLocation}>
            {this.getChildComponent(this.state.location.pathname)}
          </App>)
        }
      }


      const div = document.createElement('div')
      document.body.appendChild(div)
      ReactDOM.render(
        (<Provider store={store}>
          <RouterMock />
        </Provider>),
        div
      )

      const spy = jest.spyOn(console, 'error').mockImplementation(() => {})

      linkA.click()
      linkB.click()
      linkB.click()

      document.body.removeChild(div)
      expect(mapStateToPropsCalls).toBe(2)
      expect(spy).toHaveBeenCalledTimes(0)
      spy.mockRestore()
    })

    it('should not attempt to set state when dispatching in componentWillUnmount', () => {
      const store = createStore(stringBuilder)
      let mapStateToPropsCalls = 0

      /*eslint-disable no-unused-vars */
      @connect(
        (state) => ({ calls: mapStateToPropsCalls++ }),
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
        <Provider store={store}>
          <Container />
        </Provider>,
        div
      )
      expect(mapStateToPropsCalls).toBe(1)

      const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
      ReactDOM.unmountComponentAtNode(div)
      expect(spy).toHaveBeenCalledTimes(0)
      expect(mapStateToPropsCalls).toBe(1)
      spy.mockRestore()
    })

    it('should shallowly compare the selected state to prevent unnecessary updates', () => {
      const store = createStore(stringBuilder)
      const spy = jest.fn(() => ({}))
      function render({ string }) {
        spy()
        return <Passthrough string={string}/>
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
        <Provider store={store}>
          <Container />
        </Provider>
      )
      expect(spy).toHaveBeenCalledTimes(1)
      expect(tester.getByTestId('string')).toHaveTextContent('')
      store.dispatch({ type: 'APPEND', body: 'a' })
      expect(spy).toHaveBeenCalledTimes(2)
      store.dispatch({ type: 'APPEND', body: 'b' })
      expect(spy).toHaveBeenCalledTimes(3)
      store.dispatch({ type: 'APPEND', body: '' })
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
            <Provider store={store}>
              <Container pass={this.state.pass} />
            </Provider>
          )
        }
      }

      const tester = rtl.render(<Root />)
      expect(spy).toHaveBeenCalledTimes(1)
      expect(tester.getByTestId('string')).toHaveTextContent('')
      expect(tester.getByTestId('pass')).toHaveTextContent('')

      store.dispatch({ type: 'APPEND', body: 'a' })
      expect(spy).toHaveBeenCalledTimes(2)
      expect(tester.getByTestId('string')).toHaveTextContent('a')
      expect(tester.getByTestId('pass')).toHaveTextContent('')

      tree.setState({ pass: '' })
      expect(spy).toHaveBeenCalledTimes(2)
      expect(tester.getByTestId('string')).toHaveTextContent('a')
      expect(tester.getByTestId('pass')).toHaveTextContent('')

      tree.setState({ pass: 'through' })
      expect(spy).toHaveBeenCalledTimes(3)
      expect(tester.getByTestId('string')).toHaveTextContent('a')
      expect(tester.getByTestId('pass')).toHaveTextContent('through')

      tree.setState({ pass: 'through' })
      expect(spy).toHaveBeenCalledTimes(3)
      expect(tester.getByTestId('string')).toHaveTextContent('a')
      expect(tester.getByTestId('pass')).toHaveTextContent('through')

      const obj = { prop: 'val' }
      tree.setState({ pass: obj })
      expect(spy).toHaveBeenCalledTimes(4)
      expect(tester.getByTestId('string')).toHaveTextContent('a')
      expect(tester.getByTestId('pass')).toHaveTextContent('{"prop":"val"}')

      tree.setState({ pass: obj })
      expect(spy).toHaveBeenCalledTimes(4)
      expect(tester.getByTestId('string')).toHaveTextContent('a')
      expect(tester.getByTestId('pass')).toHaveTextContent('{"prop":"val"}')

      const obj2 = Object.assign({}, obj, { val: 'otherval' })
      tree.setState({ pass: obj2 })
      expect(spy).toHaveBeenCalledTimes(5)
      expect(tester.getByTestId('string')).toHaveTextContent('a')
      expect(tester.getByTestId('pass')).toHaveTextContent('{"prop":"val","val":"otherval"}')

      obj2.val = 'mutation'
      tree.setState({ pass: obj2 })
      expect(spy).toHaveBeenCalledTimes(5)
      expect(tester.getByTestId('string')).toHaveTextContent('a')
      expect(tester.getByTestId('pass')).toHaveTextContent('{"prop":"val","val":"otherval"}')
    })

    it('should throw an error if a component is not passed to the function returned by connect', () => {
      expect(connect()).toThrow(
        /You must pass a component to the function/
      )
    })

    it('should throw an error if mapState, mapDispatch, or mergeProps returns anything but a plain object', () => {
      const store = createStore(() => ({}))

      function makeContainer(mapState, mapDispatch, mergeProps) {
        @connect(mapState, mapDispatch, mergeProps)
        class Container extends Component {
          render() {
            return <Passthrough />
          }
        }
        return React.createElement(Container)
      }

      function AwesomeMap() { }

      let spy = jest.spyOn(console, 'error').mockImplementation(() => {})
      rtl.render(
        <Provider store={store}>
          {makeContainer(() => 1, () => ({}), () => ({}))}
        </Provider>
      )
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy.mock.calls[0][0]).toMatch(
        /mapStateToProps\(\) in Connect\(Container\) must return a plain object/
      )
      spy.mockRestore()
      rtl.cleanup()

      spy = jest.spyOn(console, 'error').mockImplementation(() => {})
      rtl.render(
        <Provider store={store}>
          {makeContainer(() => 'hey', () => ({}), () => ({}))}
        </Provider>
      )
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy.mock.calls[0][0]).toMatch(
        /mapStateToProps\(\) in Connect\(Container\) must return a plain object/
      )
      spy.mockRestore()
      rtl.cleanup()

      spy = jest.spyOn(console, 'error').mockImplementation(() => {})
      rtl.render(
        <Provider store={store}>
          {makeContainer(() => new AwesomeMap(), () => ({}), () => ({}))}
        </Provider>
      )
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy.mock.calls[0][0]).toMatch(
        /mapStateToProps\(\) in Connect\(Container\) must return a plain object/
      )
      spy.mockRestore()
      rtl.cleanup()

      spy = jest.spyOn(console, 'error').mockImplementation(() => {})
      rtl.render(
        <Provider store={store}>
          {makeContainer(() => ({}), () => 1, () => ({}))}
        </Provider>
      )
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy.mock.calls[0][0]).toMatch(
        /mapDispatchToProps\(\) in Connect\(Container\) must return a plain object/
      )
      spy.mockRestore()
      rtl.cleanup()

      spy = jest.spyOn(console, 'error').mockImplementation(() => {})
      rtl.render(
        <Provider store={store}>
          {makeContainer(() => ({}), () => 'hey', () => ({}))}
        </Provider>
      )
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy.mock.calls[0][0]).toMatch(
        /mapDispatchToProps\(\) in Connect\(Container\) must return a plain object/
      )
      spy.mockRestore()
      rtl.cleanup()

      spy = jest.spyOn(console, 'error').mockImplementation(() => {})
      rtl.render(
        <Provider store={store}>
          {makeContainer(() => ({}), () => new AwesomeMap(), () => ({}))}
        </Provider>
      )
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy.mock.calls[0][0]).toMatch(
        /mapDispatchToProps\(\) in Connect\(Container\) must return a plain object/
      )
      spy.mockRestore()
      rtl.cleanup()

      spy = jest.spyOn(console, 'error').mockImplementation(() => {})
      rtl.render(
        <Provider store={store}>
          {makeContainer(() => ({}), () => ({}), () => 1)}
        </Provider>
      )
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy.mock.calls[0][0]).toMatch(
        /mergeProps\(\) in Connect\(Container\) must return a plain object/
      )
      spy.mockRestore()
      rtl.cleanup()

      spy = jest.spyOn(console, 'error').mockImplementation(() => {})
      rtl.render(
        <Provider store={store}>
          {makeContainer(() => ({}), () => ({}), () => 'hey')}
        </Provider>
      )
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy.mock.calls[0][0]).toMatch(
        /mergeProps\(\) in Connect\(Container\) must return a plain object/
      )
      spy.mockRestore()
      rtl.cleanup()

      spy = jest.spyOn(console, 'error').mockImplementation(() => {})
      rtl.render(
        <Provider store={store}>
          {makeContainer(() => ({}), () => ({}), () => new AwesomeMap())}
        </Provider>
      )
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy.mock.calls[0][0]).toMatch(
        /mergeProps\(\) in Connect\(Container\) must return a plain object/
      )
      spy.mockRestore()
    })

    it('should set the displayName correctly', () => {
      expect(connect(state => state)(
        class Foo extends Component {
          render() {
            return <div />
          }
        }
      ).displayName).toBe('Connect(Foo)')

      expect(connect(state => state)(
        createClass({
          displayName: 'Bar',
          render() {
            return <div />
          }
        })
      ).displayName).toBe('Connect(Bar)')

      expect(connect(state => state)(
        // eslint: In this case, we don't want to specify a displayName because we're testing what
        // happens when one isn't defined.
        /* eslint-disable react/display-name */
        createClass({
          render() {
            return <div />
          }
        })
        /* eslint-enable react/display-name */
      ).displayName).toBe('Connect(Component)')
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

    it('should use the store from the props instead of from the context if present', () => {
      class Container extends Component {
        render() {
          return <Passthrough />
        }
      }

      const context = React.createContext(null)

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

      rtl.render(<Provider context={context.Provider} store={mockStore}><Decorated consumer={context.Consumer} /></Provider>)

      expect(actualState).toEqual(expectedState)
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

      expect(() =>
        rtl.render(<Decorated />)
      ).toThrow(
        /Could not find "store"/
      )

      spy.mockRestore()
    })

    it('should not throw when trying to access the wrapped instance if withRef is not specified', () => {
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
          return (
            <Decorated ref={'hi'}/>
          )
        }
      }

      expect(() => rtl.render(
        <Provider store={store}>
          <Wrapper />
        </Provider>
      )).not.toThrow()
    })

    it('should return the instance of the wrapped component for use in calling child methods', async (done) => {
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

      const decorator = connect(state => state, null, null)
      const Decorated = decorator(Container)

      const ref = React.createRef()

      class Wrapper extends Component {
        render() {
          return (
            <Decorated ref={ref}/>
          )
        }
      }

      const tester = rtl.render(
        <Provider store={store}>
          <Wrapper />
        </Provider>
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

      const decorator = connect(state => state, null, null, { pure: false })
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
        <Provider store={store}>
          <StatefulWrapper />
        </Provider>
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

      class ImpureComponent extends Component {
        render() {
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
        <Provider store={store}>
          <StatefulWrapper />
        </Provider>
      )

      expect(mapStateSpy).toHaveBeenCalledTimes(1)
      expect(mapDispatchSpy).toHaveBeenCalledTimes(1)
      expect(tester.getByTestId('statefulValue')).toHaveTextContent('foo')

      // Impure update
      storeGetter.storeKey = 'bar'
      externalSetState({ storeGetter })

      expect(mapStateSpy).toHaveBeenCalledTimes(2)
      expect(mapDispatchSpy).toHaveBeenCalledTimes(2)
      expect(tester.getByTestId('statefulValue')).toHaveTextContent('bar')
    })

    it('should pass state consistently to mapState', () => {
      const store = createStore(stringBuilder)

      store.dispatch({ type: 'APPEND', body: 'a' })
      let childMapStateInvokes = 0

      @connect(state => ({ state }), null, null)
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
          return <Passthrough {...this.props}/>
        }
      }

      const tester = rtl.render(
        <Provider store={store}>
          <Container />
        </Provider>
      )

      expect(childMapStateInvokes).toBe(1)
      expect(childCalls).toEqual([
        ['a', 'a']
      ])

      // The store state stays consistent when setState calls are batched
      ReactDOM.unstable_batchedUpdates(() => {
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

      store.dispatch({ type: 'APPEND', body: 'd' })
      expect(childMapStateInvokes).toBe(4)
      expect(childCalls).toEqual([
        ['a', 'a'],
        ['ac', 'ac'],
        ['acb', 'acb'],
        ['acbd', 'acbd'],
      ])
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
        <Provider store={store}>
          <Container />
        </Provider>
      )

      expect(renderCalls).toBe(1)
      expect(mapStateCalls).toBe(1)

      store.dispatch({ type: 'APPEND', body: 'a' })

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
        <Provider store={store}>
          <Container />
        </Provider>
      )

      expect(renderCalls).toBe(1)
      expect(mapStateCalls).toBe(1)

      const spy = jest.spyOn(Provider.prototype, 'setState')

      store.dispatch({ type: 'APPEND', body: 'a' })
      expect(mapStateCalls).toBe(2)
      expect(renderCalls).toBe(1)
      expect(spy).toHaveBeenCalledTimes(1)

      store.dispatch({ type: 'APPEND', body: 'a' })
      expect(mapStateCalls).toBe(3)
      expect(renderCalls).toBe(1)
      expect(spy).toHaveBeenCalledTimes(2)

      store.dispatch({ type: 'APPEND', body: 'a' })
      expect(mapStateCalls).toBe(4)
      expect(renderCalls).toBe(2)
      expect(spy).toHaveBeenCalledTimes(3)

      spy.mockRestore()
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
        <Provider store={store}>
          <Container />
        </Provider>
      )

      expect(renderCalls).toBe(1)
      expect(mapStateCalls).toBe(1)
      expect(
        () => store.dispatch({ type: 'APPEND', body: 'a' })
      ).toThrow()

      spy.mockRestore()
    })

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
          return lastResult = { someObject: { prop: props.name, stateVal: state.value } }
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
        <Provider store={store}>
          <div>
            <Container name="a" />
            <Container name="b" />
          </div>
        </Provider>
      )

      store.dispatch({ type: 'test' })
      expect(updatedCount).toBe(0)
      expect(memoizedReturnCount).toBe(2)
    })

    it('should allow a mapStateToProps factory consuming just state to return a function that gets ownProps', () => {
      const store = createStore(() => ({ value: 1 }))

      let initialState
      let initialOwnProps
      let secondaryOwnProps
      const mapStateFactory = function (factoryInitialState) {
        initialState = factoryInitialState
        initialOwnProps = arguments[1];
        return (state, props) => {
          secondaryOwnProps = props
          return { }
        }
      }

      @connect(mapStateFactory)
      class Container extends Component {
        render() {
          return <Passthrough {...this.props} />
        }
      }

      rtl.render(
        <Provider store={store}>
          <div>
            <Container name="a" />
          </div>
        </Provider>
      )

      store.dispatch({ type: 'test' })
      expect(initialOwnProps).toBe(undefined)
      expect(initialState).not.toBe(undefined)
      expect(secondaryOwnProps).not.toBe(undefined)
      expect(secondaryOwnProps.name).toBe("a")
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
          return lastResult = { someObject: { dispatchFn: dispatch } }
        }
      }
      function mergeParentDispatch(stateProps, dispatchProps, parentProps) {
        return { ...stateProps, ...dispatchProps, name: parentProps.name }
      }

      @connect(() => ({}), mapDispatchFactory, mergeParentDispatch)
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
        <Provider store={store}>
          <Container />
        </Provider>
      )

      store.dispatch({ type: 'test' })
      expect(updatedCount).toBe(0)
      expect(memoizedReturnCount).toBe(2)
    })

    it('should not call update if mergeProps return value has not changed', () => {
      let mapStateCalls = 0
      let renderCalls = 0
      const store = createStore(stringBuilder)

      @connect(() => ({ a: ++mapStateCalls }), null, () => ({ changed: false }))
      class Container extends Component {
        render() {
          renderCalls++
          return <Passthrough {...this.props} />
        }
      }

      rtl.render(
        <Provider store={store}>
          <Container />
        </Provider>
      )

      expect(renderCalls).toBe(1)
      expect(mapStateCalls).toBe(1)

      store.dispatch({ type: 'APPEND', body: 'a' })

      expect(mapStateCalls).toBe(2)
      expect(renderCalls).toBe(1)
    })

    it('should update impure components with custom mergeProps', () => {
      let store = createStore(() => ({}))
      let renderCount = 0

      @connect(null, null, () => ({ a: 1 }), { pure: false })
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
        <Provider store={store}>
          <Parent>
            <Container />
          </Parent>
        </Provider>
      )

      expect(renderCount).toBe(2)
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

      @connect(state => ({
        profile: state.data.profile
      }))
      class Child extends React.Component {
        render() {
          return null
        }
      }

      const store = createStore(reducer)
      store.dispatch({ type: 'fetch' })
      const div = document.createElement('div')
      ReactDOM.render(
        <Provider store={store}>
          <Parent />
        </Provider>,
        div
      )

      ReactDOM.unmountComponentAtNode(div)
    })

    it('should allow custom displayName', () => {
      @connect(null, null, null, { getDisplayName: name => `Custom(${name})` })
      class MyComponent extends React.Component {
        render() {
          return <div></div>
        }
      }

      expect(MyComponent.displayName).toEqual('Custom(MyComponent)')
    })

    it('should update impure components whenever the state of the store changes', () => {
      const store = createStore(() => ({}))
      let renderCount = 0

      @connect(() => ({}), null, null, { pure: false })
      class ImpureComponent extends React.Component {
        render() {
          ++renderCount
          return <div />
        }
      }

      rtl.render(
        <Provider store={store}>
          <ImpureComponent />
        </Provider>
      )

      const rendersBeforeStateChange = renderCount
      store.dispatch({ type: 'ACTION' })
      expect(renderCount).toBe(rendersBeforeStateChange + 1)
    })

    function renderWithBadConnect(Component) {
      const store = createStore(() => ({}))
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {})

      try {
        rtl.render(
          <Provider store={store}>
            <Component pass="through" />
          </Provider>
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
      class InvalidMapState extends React.Component { render() { return <div></div> } }

      const error = renderWithBadConnect(InvalidMapState)
      expect(error).toContain('string')
      expect(error).toContain('mapStateToProps')
      expect(error).toContain('InvalidMapState')
    })

    it('should throw a helpful error for invalid mapDispatchToProps arguments', () => {
      @connect(null, 'invalid')
      class InvalidMapDispatch extends React.Component { render() { return <div></div> } }

      const error = renderWithBadConnect(InvalidMapDispatch)
      expect(error).toContain('string')
      expect(error).toContain('mapDispatchToProps')
      expect(error).toContain('InvalidMapDispatch')
    })

    it('should throw a helpful error for invalid mergeProps arguments', () => {
      @connect(null, null, 'invalid')
      class InvalidMerge extends React.Component { render() { return <div></div> } }

      const error = renderWithBadConnect(InvalidMerge)
      expect(error).toContain('string')
      expect(error).toContain('mergeProps')
      expect(error).toContain('InvalidMerge')
    })

    it('should notify nested components through a blocking component', () => {
      @connect(state => ({ count: state }))
      class Parent extends Component {
        render() { return <BlockUpdates><Child /></BlockUpdates> }
      }

      class BlockUpdates extends Component {
        shouldComponentUpdate() { return false; }
        render() { return this.props.children; }
      }

      const mapStateToProps = jest.fn(state => ({ count: state }))
      @connect(mapStateToProps)
      class Child extends Component {
        render() { return <div>{this.props.count}</div> }
      }

      const store = createStore((state = 0, action) => (action.type === 'INC' ? state + 1 : state))
      rtl.render(<Provider store={store}><Parent /></Provider>)

      expect(mapStateToProps).toHaveBeenCalledTimes(1)
      store.dispatch({ type: 'INC' })
      expect(mapStateToProps).toHaveBeenCalledTimes(2)
    })

    it('should subscribe properly when a middle connected component does not subscribe', () => {

      @connect(state => ({ count: state }))
      class A extends React.Component { render() { return <B {...this.props} /> }}

      @connect() // no mapStateToProps. therefore it should be transparent for subscriptions
      class B extends React.Component { render() { return <C {...this.props} /> }}

      let calls = []
      @connect((state, props) => {
        calls.push([state, props.count])
        return { count: state * 10 + props.count }
      })
      class C extends React.Component { render() { return <div>{this.props.count}</div> }}

      const store = createStore((state = 0, action) => (action.type === 'INC' ? state += 1 : state))
      rtl.render(<Provider store={store}><A /></Provider>)

      store.dispatch({ type: 'INC' })

      expect(calls).toEqual([
        [0, 0],
        [1, 1],
      ])
    })

    it('should subscribe properly when a new store is provided via props', () => {
      const store1 = createStore((state = 0, action) => (action.type === 'INC' ? state + 1 : state))
      const store2 = createStore((state = 0, action) => (action.type === 'INC' ? state + 1 : state))
      const customContext = React.createContext()

      @connect(state => ({ count: state }))
      class A extends Component {
        render() { return <B consumer={customContext.Consumer} /> }
      }

      const mapStateToPropsB = jest.fn(state => ({ count: state }))
      @connect(mapStateToPropsB)
      class B extends Component {
        render() { return <C {...this.props} /> }
      }

      const mapStateToPropsC = jest.fn(state => ({ count: state }))
      @connect(mapStateToPropsC)
      class C extends Component {
        render() { return <D /> }
      }

      const mapStateToPropsD = jest.fn(state => ({ count: state }))
      @connect(mapStateToPropsD)
      class D extends Component {
        render() { return <div>{this.props.count}</div> }
      }

      rtl.render(
        <Provider store={store1}>
          <Provider context={customContext.Provider} store={store2}>
            <A />
          </Provider>
        </Provider>
      )
      expect(mapStateToPropsB).toHaveBeenCalledTimes(1)
      expect(mapStateToPropsC).toHaveBeenCalledTimes(1)
      expect(mapStateToPropsD).toHaveBeenCalledTimes(1)

      store1.dispatch({ type: 'INC' })
      expect(mapStateToPropsB).toHaveBeenCalledTimes(1)
      expect(mapStateToPropsC).toHaveBeenCalledTimes(1)
      expect(mapStateToPropsD).toHaveBeenCalledTimes(2)

      store2.dispatch({ type: 'INC' })
      expect(mapStateToPropsB).toHaveBeenCalledTimes(2)
      expect(mapStateToPropsC).toHaveBeenCalledTimes(2)
      expect(mapStateToPropsD).toHaveBeenCalledTimes(2)
    })

    it('works in <StrictMode> without warnings (React 16.3+)', () => {
      if (!React.StrictMode) {
        return
      }
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
      const store = createStore(stringBuilder)

      @connect(state => ({ string: state }) )
      class Container extends Component {
        render() {
          return <Passthrough {...this.props}/>
        }
      }

      rtl.render(
        <React.StrictMode>
          <Provider store={store}>
            <Container />
          </Provider>
        </React.StrictMode>
      )

      expect(spy).not.toHaveBeenCalled()
    })

    it('should error on receiving a custom store key', () => {
      const store = createStore(() => ({}))
      store.dispatch.mine = 'hi'
      const connectOptions = { storeKey: 'customStoreKey' }


      expect(() => {
        @connect(undefined, undefined, undefined, connectOptions)
        class Container extends Component {
          render() {
            return <Passthrough {...this.props} />
          }
        }
        new Container()
      }).toThrow(/storeKey is deprecated/)
    })

    it('should error on withRef', () => {
      function Container() {
        return <div>hi</div>
      }
      expect(() => {
        connect(undefined, undefined, undefined, { withRef: true })(Container)
      }).toThrow(
        'withRef is removed. To access the wrapped instance, simply pass in ref'
      )
    })

    it('should error on custom store', () => {
      function Comp() {
        return <div>hi</div>
      }
      const Container = connect()(Comp)
      function Oops() {
        return <Container store={'oops'} />
      }
      expect(() => {
        rtl.render(<Oops />)
      }).toThrow(/passing redux store/)
    })
  })
})
