/*eslint-disable react/prop-types*/

import expect from 'expect'
import React, { Children, Component } from 'react'
import createClass from 'create-react-class'
import PropTypes from 'prop-types'
import ReactDOM from 'react-dom'
import TestUtils from 'react-dom/test-utils'
import { createStore } from 'redux'
import { connect } from '../../src/index'

describe('React', () => {
  describe('connect', () => {
    class Passthrough extends Component {
      render() {
        return <div />
      }
    }

    class ProviderMock extends Component {
      getChildContext() {
        return { store: this.props.store }
      }

      render() {
        return Children.only(this.props.children)
      }
    }
    ProviderMock.childContextTypes = {
      store: PropTypes.object.isRequired
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

    function imitateHotReloading(TargetClass, SourceClass, container) {
      // Crude imitation of hot reloading that does the job
      Object.getOwnPropertyNames(SourceClass.prototype).filter(key =>
        typeof SourceClass.prototype[key] === 'function'
      ).forEach(key => {
        if (key !== 'render' && key !== 'constructor') {
          TargetClass.prototype[key] = SourceClass.prototype[key]
        }
      })

      container.forceUpdate()
    }

    it('should receive the store in the context', () => {
      const store = createStore(() => ({}))

      @connect()
      class Container extends Component {
        render() {
          return <Passthrough {...this.props} />
        }
      }

      const tree = TestUtils.renderIntoDocument(
        <ProviderMock store={store}>
          <Container pass="through" />
        </ProviderMock>
      )

      const container = TestUtils.findRenderedComponentWithType(tree, Container)
      expect(container.context.store).toBe(store)
    })

    it('should pass state and props to the given component', () => {
      const store = createStore(() => ({
        foo: 'bar',
        baz: 42,
        hello: 'world'
      }))

      @connect(({ foo, baz }) => ({ foo, baz }))
      class Container extends Component {
        render() {
          return <Passthrough {...this.props} />
        }
      }

      const container = TestUtils.renderIntoDocument(
        <ProviderMock store={store}>
          <Container pass="through" baz={50} />
        </ProviderMock>
      )
      const stub = TestUtils.findRenderedComponentWithType(container, Passthrough)
      expect(stub.props.pass).toEqual('through')
      expect(stub.props.foo).toEqual('bar')
      expect(stub.props.baz).toEqual(42)
      expect(stub.props.hello).toEqual(undefined)
      expect(() =>
        TestUtils.findRenderedComponentWithType(container, Container)
      ).toNotThrow()
    })

    it('should subscribe class components to the store changes', () => {
      const store = createStore(stringBuilder)

      @connect(state => ({ string: state }) )
      class Container extends Component {
        render() {
          return <Passthrough {...this.props}/>
        }
      }

      const tree = TestUtils.renderIntoDocument(
        <ProviderMock store={store}>
          <Container />
        </ProviderMock>
      )

      const stub = TestUtils.findRenderedComponentWithType(tree, Passthrough)
      expect(stub.props.string).toBe('')
      store.dispatch({ type: 'APPEND', body: 'a' })
      expect(stub.props.string).toBe('a')
      store.dispatch({ type: 'APPEND', body: 'b' })
      expect(stub.props.string).toBe('ab')
    })

    it('should subscribe pure function components to the store changes', () => {
      const store = createStore(stringBuilder)

      let Container = connect(
        state => ({ string: state })
      )(function Container(props) {
        return <Passthrough {...props}/>
      })

      const spy = expect.spyOn(console, 'error')
      const tree = TestUtils.renderIntoDocument(
        <ProviderMock store={store}>
          <Container />
        </ProviderMock>
      )
      spy.destroy()
      expect(spy.calls.length).toBe(0)

      const stub = TestUtils.findRenderedComponentWithType(tree, Passthrough)
      expect(stub.props.string).toBe('')
      store.dispatch({ type: 'APPEND', body: 'a' })
      expect(stub.props.string).toBe('a')
      store.dispatch({ type: 'APPEND', body: 'b' })
      expect(stub.props.string).toBe('ab')
    })

    it('should retain the store\'s context', () => {
      const store = new ContextBoundStore(stringBuilder)

      let Container = connect(
        state => ({ string: state })
      )(function Container(props) {
        return <Passthrough {...props}/>
      })

      const spy = expect.spyOn(console, 'error')
      const tree = TestUtils.renderIntoDocument(
        <ProviderMock store={store}>
          <Container />
        </ProviderMock>
      )
      spy.destroy()
      expect(spy.calls.length).toBe(0)

      const stub = TestUtils.findRenderedComponentWithType(tree, Passthrough)
      expect(stub.props.string).toBe('')
      store.dispatch({ type: 'APPEND', body: 'a' })
      expect(stub.props.string).toBe('a')
    })

    it('should handle dispatches before componentDidMount', () => {
      const store = createStore(stringBuilder)

      @connect(state => ({ string: state }) )
      class Container extends Component {
        componentWillMount() {
          store.dispatch({ type: 'APPEND', body: 'a' })
        }

        render() {
          return <Passthrough {...this.props}/>
        }
      }

      const tree = TestUtils.renderIntoDocument(
        <ProviderMock store={store}>
          <Container />
        </ProviderMock>
      )

      const stub = TestUtils.findRenderedComponentWithType(tree, Passthrough)
      expect(stub.props.string).toBe('a')
    })

    it('should handle additional prop changes in addition to slice', () => {
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

      const container = TestUtils.renderIntoDocument(<Container />)
      const stub = TestUtils.findRenderedComponentWithType(container, Passthrough)
      expect(stub.props.foo).toEqual('bar')
      expect(stub.props.pass).toEqual('through')
    })

    it('should handle unexpected prop changes with forceUpdate()', () => {
      const store = createStore(() => ({}))

      @connect(state => state)
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
            <ProviderMock store={store}>
              <ConnectContainer bar={this.bar} ref={c => this.c = c} />
            </ProviderMock>
          )
        }
      }

      const container = TestUtils.renderIntoDocument(<Container />)
      const stub = TestUtils.findRenderedComponentWithType(container, Passthrough)
      expect(stub.props.bar).toEqual('foo')
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

      TestUtils.renderIntoDocument(
        <ProviderMock store={store}>
          <HolderContainer ref={instance => container = instance} />
        </ProviderMock>
      )

      const propsBefore = {
        ...TestUtils.findRenderedComponentWithType(container, Passthrough).props
      }

      props = {}
      container.forceUpdate()

      const propsAfter = {
        ...TestUtils.findRenderedComponentWithType(container, Passthrough).props
      }

      expect(propsBefore.x).toEqual(true)
      expect('x' in propsAfter).toEqual(false, 'x prop must be removed')
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

      TestUtils.renderIntoDocument(
        <ProviderMock store={store}>
          <HolderContainer ref={instance => container = instance} />
        </ProviderMock>
      )

      const propsBefore = {
        ...TestUtils.findRenderedComponentWithType(container, Passthrough).props
      }

      props = {}
      container.forceUpdate()

      const propsAfter = {
        ...TestUtils.findRenderedComponentWithType(container, Passthrough).props
      }

      expect(propsBefore.x).toEqual(true)
      expect('x' in propsAfter).toEqual(false, 'x prop must be removed')
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
            <ProviderMock store={store}>
              <ConnectContainer bar={this.state.bar} />
            </ProviderMock>
          )
        }
      }

      const container = TestUtils.renderIntoDocument(<Container />)
      const stub = TestUtils.findRenderedComponentWithType(container, Passthrough)
      expect(stub.props.foo).toEqual('bar')
      expect(stub.props.pass).toEqual('')
    })

    it('should allow for merge to incorporate state and prop changes', () => {
      const store = createStore(stringBuilder)

      function doSomething(thing) {
        return {
          type: 'APPEND',
          body: thing
        }
      }

      @connect(
        state => ({ stateThing: state }),
        dispatch => ({
          doSomething: (whatever) => dispatch(doSomething(whatever))
        }),
        (stateProps, actionProps, parentProps) => ({
          ...stateProps,
          ...actionProps,
          mergedDoSomething(thing) {
            const seed = stateProps.stateThing === '' ? 'HELLO ' : ''
            actionProps.doSomething(seed + thing + parentProps.extra)
          }
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
        }

        render() {
          return (
            <ProviderMock store={store}>
              <Container extra={this.state.extra} />
            </ProviderMock>
          )
        }
      }

      const tree = TestUtils.renderIntoDocument(<OuterContainer />)
      const stub = TestUtils.findRenderedComponentWithType(tree, Passthrough)
      expect(stub.props.stateThing).toBe('')
      stub.props.mergedDoSomething('a')
      expect(stub.props.stateThing).toBe('HELLO az')
      stub.props.mergedDoSomething('b')
      expect(stub.props.stateThing).toBe('HELLO azbz')
      tree.setState({ extra: 'Z' })
      stub.props.mergedDoSomething('c')
      expect(stub.props.stateThing).toBe('HELLO azbzcZ')
    })

    it('should merge actionProps into WrappedComponent', () => {
      const store = createStore(() => ({
        foo: 'bar'
      }))

      @connect(
        state => state,
        dispatch => ({ dispatch })
      )
      class Container extends Component {
        render() {
          return <Passthrough {...this.props} />
        }
      }

      const container = TestUtils.renderIntoDocument(
        <ProviderMock store={store}>
          <Container pass="through" />
        </ProviderMock>
      )
      const stub = TestUtils.findRenderedComponentWithType(container, Passthrough)
      expect(stub.props.dispatch).toEqual(store.dispatch)
      expect(stub.props.foo).toEqual('bar')
      expect(() =>
        TestUtils.findRenderedComponentWithType(container, Container)
      ).toNotThrow()
      const decorated = TestUtils.findRenderedComponentWithType(container, Container)
      expect(decorated.isSubscribed()).toBe(true)
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
      TestUtils.renderIntoDocument(
        <ProviderMock store={store}>
          <OuterComponent ref={c => outerComponent = c} />
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
      TestUtils.renderIntoDocument(
        <ProviderMock store={store}>
          <OuterComponent ref={c => outerComponent = c} />
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
      TestUtils.renderIntoDocument(
        <ProviderMock store={store}>
          <OuterComponent ref={c => outerComponent = c} />
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
      TestUtils.renderIntoDocument(
        <ProviderMock store={store}>
          <OuterComponent ref={c => outerComponent = c} />
        </ProviderMock>
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
      TestUtils.renderIntoDocument(
        <ProviderMock store={store}>
          <OuterComponent ref={c => outerComponent = c} />
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
      TestUtils.renderIntoDocument(
        <ProviderMock store={store}>
          <OuterComponent ref={c => outerComponent = c} />
        </ProviderMock>
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

      function runCheck(...connectArgs) {
        @connect(...connectArgs)
        class Container extends Component {
          render() {
            return <Passthrough {...this.props} />
          }
        }

        const container = TestUtils.renderIntoDocument(
          <ProviderMock store={store}>
            <Container pass="through" />
          </ProviderMock>
        )
        const stub = TestUtils.findRenderedComponentWithType(container, Passthrough)
        expect(stub.props.dispatch).toEqual(store.dispatch)
        expect(stub.props.foo).toBe(undefined)
        expect(stub.props.pass).toEqual('through')
        expect(() =>
          TestUtils.findRenderedComponentWithType(container, Container)
        ).toNotThrow()
        const decorated = TestUtils.findRenderedComponentWithType(container, Container)
        expect(decorated.isSubscribed()).toBe(false)
      }

      runCheck()
      runCheck(null, null, null)
      runCheck(false, false, false)
    })

    it('should unsubscribe before unmounting', () => {
      const store = createStore(stringBuilder)
      const subscribe = store.subscribe

      // Keep track of unsubscribe by wrapping subscribe()
      const spy = expect.createSpy(() => ({}))
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
        <ProviderMock store={store}>
          <Container />
        </ProviderMock>,
        div
      )

      expect(spy.calls.length).toBe(0)
      ReactDOM.unmountComponentAtNode(div)
      expect(spy.calls.length).toBe(1)
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
        <ProviderMock store={store}>
          <Container />
        </ProviderMock>,
        div
      )

      expect(mapStateToPropsCalls).toBe(1)
      const spy = expect.spyOn(console, 'error')
      store.dispatch({ type: 'APPEND', body: 'a' })
      spy.destroy()
      expect(spy.calls.length).toBe(0)
      expect(mapStateToPropsCalls).toBe(1)
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
        componentWillReceiveProps(nextProps) {
          if (nextProps.state === 'A') {
            store.dispatch({ type: 'APPEND', body: 'B' });
          }
        }
        render() {
          return null;
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
        (<ProviderMock store={store}>
          <RouterMock />
        </ProviderMock>),
        div
      )

      const spy = expect.spyOn(console, 'error')

      linkA.click()
      linkB.click()
      linkB.click()

      spy.destroy()
      document.body.removeChild(div)
      expect(mapStateToPropsCalls).toBe(3)
      expect(spy.calls.length).toBe(0)
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
        <ProviderMock store={store}>
          <Container />
        </ProviderMock>,
        div
      )
      expect(mapStateToPropsCalls).toBe(1)

      const spy = expect.spyOn(console, 'error')
      ReactDOM.unmountComponentAtNode(div)
      spy.destroy()
      expect(spy.calls.length).toBe(0)
      expect(mapStateToPropsCalls).toBe(1)
    })

    it('should shallowly compare the selected state to prevent unnecessary updates', () => {
      const store = createStore(stringBuilder)
      const spy = expect.createSpy(() => ({}))
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

      const tree = TestUtils.renderIntoDocument(
        <ProviderMock store={store}>
          <Container />
        </ProviderMock>
      )

      const stub = TestUtils.findRenderedComponentWithType(tree, Passthrough)
      expect(spy.calls.length).toBe(1)
      expect(stub.props.string).toBe('')
      store.dispatch({ type: 'APPEND', body: 'a' })
      expect(spy.calls.length).toBe(2)
      store.dispatch({ type: 'APPEND', body: 'b' })
      expect(spy.calls.length).toBe(3)
      store.dispatch({ type: 'APPEND', body: '' })
      expect(spy.calls.length).toBe(3)
    })

    it('should shallowly compare the merged state to prevent unnecessary updates', () => {
      const store = createStore(stringBuilder)
      const spy = expect.createSpy(() => ({}))
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
        }

        render() {
          return (
            <ProviderMock store={store}>
              <Container pass={this.state.pass} />
            </ProviderMock>
          )
        }
      }

      const tree = TestUtils.renderIntoDocument(<Root />)
      const stub = TestUtils.findRenderedComponentWithType(tree, Passthrough)
      expect(spy.calls.length).toBe(1)
      expect(stub.props.string).toBe('')
      expect(stub.props.pass).toBe('')

      store.dispatch({ type: 'APPEND', body: 'a' })
      expect(spy.calls.length).toBe(2)
      expect(stub.props.string).toBe('a')
      expect(stub.props.pass).toBe('')

      tree.setState({ pass: '' })
      expect(spy.calls.length).toBe(2)
      expect(stub.props.string).toBe('a')
      expect(stub.props.pass).toBe('')

      tree.setState({ pass: 'through' })
      expect(spy.calls.length).toBe(3)
      expect(stub.props.string).toBe('a')
      expect(stub.props.pass).toBe('through')

      tree.setState({ pass: 'through' })
      expect(spy.calls.length).toBe(3)
      expect(stub.props.string).toBe('a')
      expect(stub.props.pass).toBe('through')

      const obj = { prop: 'val' }
      tree.setState({ pass: obj })
      expect(spy.calls.length).toBe(4)
      expect(stub.props.string).toBe('a')
      expect(stub.props.pass).toBe(obj)

      tree.setState({ pass: obj })
      expect(spy.calls.length).toBe(4)
      expect(stub.props.string).toBe('a')
      expect(stub.props.pass).toBe(obj)

      const obj2 = Object.assign({}, obj, { val: 'otherval' })
      tree.setState({ pass: obj2 })
      expect(spy.calls.length).toBe(5)
      expect(stub.props.string).toBe('a')
      expect(stub.props.pass).toBe(obj2)

      obj2.val = 'mutation'
      tree.setState({ pass: obj2 })
      expect(spy.calls.length).toBe(5)
      expect(stub.props.string).toBe('a')
      expect(stub.props.passVal).toBe('otherval')
    })

    it('should throw an error if a component is not passed to the function returned by connect', () => {
      expect(connect()).toThrow(
        /You must pass a component to the function/
      )
    })

    it('should throw an error if mapState, mapDispatch, or mergeProps returns anything but a plain object', () => {
      const store = createStore(() => ({}))

      function makeContainer(mapState, mapDispatch, mergeProps) {
        return React.createElement(
          @connect(mapState, mapDispatch, mergeProps)
          class Container extends Component {
            render() {
              return <Passthrough />
            }
          }
        )
      }

      function AwesomeMap() { }

      let spy = expect.spyOn(console, 'error')
      TestUtils.renderIntoDocument(
        <ProviderMock store={store}>
          {makeContainer(() => 1, () => ({}), () => ({}))}
        </ProviderMock>
      )
      expect(spy.calls.length).toBe(1)
      expect(spy.calls[0].arguments[0]).toMatch(
        /mapStateToProps\(\) in Connect\(Container\) must return a plain object/
      )
      spy.destroy()

      spy = expect.spyOn(console, 'error')
      TestUtils.renderIntoDocument(
        <ProviderMock store={store}>
          {makeContainer(() => 'hey', () => ({}), () => ({}))}
        </ProviderMock>
      )
      expect(spy.calls.length).toBe(1)
      expect(spy.calls[0].arguments[0]).toMatch(
        /mapStateToProps\(\) in Connect\(Container\) must return a plain object/
      )
      spy.destroy()

      spy = expect.spyOn(console, 'error')
      TestUtils.renderIntoDocument(
        <ProviderMock store={store}>
          {makeContainer(() => new AwesomeMap(), () => ({}), () => ({}))}
        </ProviderMock>
      )
      expect(spy.calls.length).toBe(1)
      expect(spy.calls[0].arguments[0]).toMatch(
        /mapStateToProps\(\) in Connect\(Container\) must return a plain object/
      )
      spy.destroy()

      spy = expect.spyOn(console, 'error')
      TestUtils.renderIntoDocument(
        <ProviderMock store={store}>
          {makeContainer(() => ({}), () => 1, () => ({}))}
        </ProviderMock>
      )
      expect(spy.calls.length).toBe(1)
      expect(spy.calls[0].arguments[0]).toMatch(
        /mapDispatchToProps\(\) in Connect\(Container\) must return a plain object/
      )
      spy.destroy()

      spy = expect.spyOn(console, 'error')
      TestUtils.renderIntoDocument(
        <ProviderMock store={store}>
          {makeContainer(() => ({}), () => 'hey', () => ({}))}
        </ProviderMock>
      )
      expect(spy.calls.length).toBe(1)
      expect(spy.calls[0].arguments[0]).toMatch(
        /mapDispatchToProps\(\) in Connect\(Container\) must return a plain object/
      )
      spy.destroy()

      spy = expect.spyOn(console, 'error')
      TestUtils.renderIntoDocument(
        <ProviderMock store={store}>
          {makeContainer(() => ({}), () => new AwesomeMap(), () => ({}))}
        </ProviderMock>
      )
      expect(spy.calls.length).toBe(1)
      expect(spy.calls[0].arguments[0]).toMatch(
        /mapDispatchToProps\(\) in Connect\(Container\) must return a plain object/
      )
      spy.destroy()

      spy = expect.spyOn(console, 'error')
      TestUtils.renderIntoDocument(
        <ProviderMock store={store}>
          {makeContainer(() => ({}), () => ({}), () => 1)}
        </ProviderMock>
      )
      expect(spy.calls.length).toBe(1)
      expect(spy.calls[0].arguments[0]).toMatch(
        /mergeProps\(\) in Connect\(Container\) must return a plain object/
      )
      spy.destroy()

      spy = expect.spyOn(console, 'error')
      TestUtils.renderIntoDocument(
        <ProviderMock store={store}>
          {makeContainer(() => ({}), () => ({}), () => 'hey')}
        </ProviderMock>
      )
      expect(spy.calls.length).toBe(1)
      expect(spy.calls[0].arguments[0]).toMatch(
        /mergeProps\(\) in Connect\(Container\) must return a plain object/
      )
      spy.destroy()

      spy = expect.spyOn(console, 'error')
      TestUtils.renderIntoDocument(
        <ProviderMock store={store}>
          {makeContainer(() => ({}), () => ({}), () => new AwesomeMap())}
        </ProviderMock>
      )
      expect(spy.calls.length).toBe(1)
      expect(spy.calls[0].arguments[0]).toMatch(
        /mergeProps\(\) in Connect\(Container\) must return a plain object/
      )
      spy.destroy()
    })

    it('should recalculate the state and rebind the actions on hot update', () => {
      const store = createStore(() => {})

      @connect(
        null,
        () => ({ scooby: 'doo' })
      )
      class ContainerBefore extends Component {
        render() {
          return (
            <Passthrough {...this.props} />
          )
        }
      }

      @connect(
        () => ({ foo: 'baz' }),
        () => ({ scooby: 'foo' })
      )
      class ContainerAfter extends Component {
        render() {
          return (
            <Passthrough {...this.props} />
          )
        }
      }

      @connect(
        () => ({ foo: 'bar' }),
        () => ({ scooby: 'boo' })
      )
      class ContainerNext extends Component {
        render() {
          return (
            <Passthrough {...this.props} />
          )
        }
      }

      let container
      TestUtils.renderIntoDocument(
        <ProviderMock store={store}>
          <ContainerBefore ref={instance => container = instance} />
        </ProviderMock>
      )
      const stub = TestUtils.findRenderedComponentWithType(container, Passthrough)
      expect(stub.props.foo).toEqual(undefined)
      expect(stub.props.scooby).toEqual('doo')

      imitateHotReloading(ContainerBefore, ContainerAfter, container)
      expect(stub.props.foo).toEqual('baz')
      expect(stub.props.scooby).toEqual('foo')

      imitateHotReloading(ContainerBefore, ContainerNext, container)
      expect(stub.props.foo).toEqual('bar')
      expect(stub.props.scooby).toEqual('boo')
    })

    it('should persist listeners through hot update', () => {
      const ACTION_TYPE = "ACTION"
      const store = createStore((state = {actions: 0}, action) => {
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

      @connect(
        (state) => ({ actions: state.actions })
      )
      class Child extends Component {
        render() {
          return <Passthrough {...this.props}/>
        }
      }

      @connect(
        () => ({ scooby: 'doo' })
      )
      class ParentBefore extends Component {
        render() {
          return (
            <Child />
          )
        }
      }

      @connect(
        () => ({ scooby: 'boo' })
      )
      class ParentAfter extends Component {
        render() {
          return (
            <Child />
          )
        }
      }

      let container
      TestUtils.renderIntoDocument(
        <ProviderMock store={store}>
          <ParentBefore ref={instance => container = instance}/>
        </ProviderMock>
      )

      const stub = TestUtils.findRenderedComponentWithType(container, Passthrough)

      imitateHotReloading(ParentBefore, ParentAfter, container)

      store.dispatch({type: ACTION_TYPE})

      expect(stub.props.actions).toEqual(1)
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

      expect(decorated.howIsRedux).toBeA('function')
      expect(decorated.howIsRedux()).toBe('Awesome!')
      expect(decorated.foo).toBe('bar')
    })

    it('should use the store from the props instead of from the context if present', () => {
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

      TestUtils.renderIntoDocument(<Decorated store={mockStore} />)

      expect(actualState).toEqual(expectedState)
    })

    it('should throw an error if the store is not in the props or context', () => {
      class Container extends Component {
        render() {
          return <Passthrough />
        }
      }

      const decorator = connect(() => {})
      const Decorated = decorator(Container)

      expect(() =>
        TestUtils.renderIntoDocument(<Decorated />)
      ).toThrow(
        /Could not find "store"/
      )
    })

    it('should throw when trying to access the wrapped instance if withRef is not specified', () => {
      const store = createStore(() => ({}))

      class Container extends Component {
        render() {
          return <Passthrough />
        }
      }

      const decorator = connect(state => state)
      const Decorated = decorator(Container)

      const tree = TestUtils.renderIntoDocument(
        <ProviderMock store={store}>
          <Decorated />
        </ProviderMock>
      )

      const decorated = TestUtils.findRenderedComponentWithType(tree, Decorated)
      expect(() => decorated.getWrappedInstance()).toThrow(
        /To access the wrapped instance, you need to specify \{ withRef: true \} in the options argument of the connect\(\) call\./
      )
    })

    it('should return the instance of the wrapped component for use in calling child methods', () => {
      const store = createStore(() => ({}))

      const someData = {
        some: 'data'
      }

      class Container extends Component {
        someInstanceMethod() {
          return someData
        }

        render() {
          return <Passthrough />
        }
      }

      const decorator = connect(state => state, null, null, { withRef: true })
      const Decorated = decorator(Container)

      const tree = TestUtils.renderIntoDocument(
        <ProviderMock store={store}>
          <Decorated />
        </ProviderMock>
      )

      const decorated = TestUtils.findRenderedComponentWithType(tree, Decorated)

      expect(() => decorated.someInstanceMethod()).toThrow()
      expect(decorated.getWrappedInstance().someInstanceMethod()).toBe(someData)
      expect(decorated.wrappedInstance.someInstanceMethod()).toBe(someData)
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

      class StatefulWrapper extends Component {
        constructor() {
          super()
          this.state = { value: 0 }
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

      const tree = TestUtils.renderIntoDocument(
        <ProviderMock store={store}>
          <StatefulWrapper />
        </ProviderMock>
      )

      const target = TestUtils.findRenderedComponentWithType(tree, Passthrough)
      const wrapper = TestUtils.findRenderedComponentWithType(tree, StatefulWrapper)
      expect(target.props.statefulValue).toEqual(0)
      wrapper.setState({ value: 1 })
      expect(target.props.statefulValue).toEqual(1)
    })

    it('calls mapState and mapDispatch for impure components', () => {
      const store = createStore(() => ({
        foo: 'foo',
        bar: 'bar'
      }))

      const mapStateSpy = expect.createSpy()
      const mapDispatchSpy = expect.createSpy().andReturn({})

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

      class StatefulWrapper extends Component {
        constructor() {
          super()
          this.state = {
            storeGetter: { storeKey: 'foo' }
          }
        }
        render() {
          return <Decorated storeGetter={this.state.storeGetter} />
        }
      }


      const tree = TestUtils.renderIntoDocument(
        <ProviderMock store={store}>
          <StatefulWrapper />
        </ProviderMock>
      )

      const target = TestUtils.findRenderedComponentWithType(tree, Passthrough)
      const wrapper = TestUtils.findRenderedComponentWithType(tree, StatefulWrapper)

      expect(mapStateSpy.calls.length).toBe(2)
      expect(mapDispatchSpy.calls.length).toBe(2)
      expect(target.props.statefulValue).toEqual('foo')

      // Impure update
      const storeGetter = wrapper.state.storeGetter
      storeGetter.storeKey = 'bar'
      wrapper.setState({ storeGetter })

      expect(mapStateSpy.calls.length).toBe(3)
      expect(mapDispatchSpy.calls.length).toBe(3)
      expect(target.props.statefulValue).toEqual('bar')
    })

    it('should pass state consistently to mapState', () => {
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
          return <Passthrough {...this.props}/>
        }
      }

      const tree = TestUtils.renderIntoDocument(
        <ProviderMock store={store}>
          <Container />
        </ProviderMock>
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

      store.dispatch({ type: 'APPEND', body: 'd' })
      expect(childMapStateInvokes).toBe(4)
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

      TestUtils.renderIntoDocument(
        <ProviderMock store={store}>
          <Container />
        </ProviderMock>
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

      TestUtils.renderIntoDocument(
        <ProviderMock store={store}>
          <Container />
        </ProviderMock>
      )

      expect(renderCalls).toBe(1)
      expect(mapStateCalls).toBe(1)

      const spy = expect.spyOn(Container.prototype, 'setState').andCallThrough()

      store.dispatch({ type: 'APPEND', body: 'a' })
      expect(mapStateCalls).toBe(2)
      expect(renderCalls).toBe(1)
      expect(spy.calls.length).toBe(0)

      store.dispatch({ type: 'APPEND', body: 'a' })
      expect(mapStateCalls).toBe(3)
      expect(renderCalls).toBe(1)
      expect(spy.calls.length).toBe(0)

      store.dispatch({ type: 'APPEND', body: 'a' })
      expect(mapStateCalls).toBe(4)
      expect(renderCalls).toBe(2)
      expect(spy.calls.length).toBe(1)

      spy.destroy()
    })

    it('should not swallow errors when bailing out early', () => {
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

      TestUtils.renderIntoDocument(
        <ProviderMock store={store}>
          <Container />
        </ProviderMock>
      )

      expect(renderCalls).toBe(1)
      expect(mapStateCalls).toBe(1)
      expect(
        () => store.dispatch({ type: 'APPEND', body: 'a' })
      ).toThrow('Oops')
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
        componentWillUpdate() {
          updatedCount++
        }
        render() {
          return <Passthrough {...this.props} />
        }
      }

      TestUtils.renderIntoDocument(
        <ProviderMock store={store}>
          <div>
            <Container name="a" />
            <Container name="b" />
          </div>
        </ProviderMock>
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

      TestUtils.renderIntoDocument(
        <ProviderMock store={store}>
          <div>
            <Container name="a" />
          </div>
        </ProviderMock>
      )

      store.dispatch({ type: 'test' })
      expect(initialOwnProps).toBe(undefined)
      expect(initialState).toNotBe(undefined)
      expect(secondaryOwnProps).toNotBe(undefined)
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

      @connect(null, mapDispatchFactory, mergeParentDispatch)
      class Passthrough extends Component {
        componentWillUpdate() {
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

      TestUtils.renderIntoDocument(
        <ProviderMock store={store}>
          <Container />
        </ProviderMock>
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

      TestUtils.renderIntoDocument(
        <ProviderMock store={store}>
          <Container />
        </ProviderMock>
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

      TestUtils.renderIntoDocument(
        <ProviderMock store={store}>
          <Parent>
            <Container />
          </Parent>
        </ProviderMock>
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
        componentWillMount() {
          this.props.dispatch({ type: 'fetch' })
        }

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
      const div = document.createElement('div')
      ReactDOM.render(
        <ProviderMock store={store}>
          <Parent />
        </ProviderMock>,
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

      TestUtils.renderIntoDocument(
        <ProviderMock store={store}>
          <ImpureComponent />
        </ProviderMock>
      )

      const rendersBeforeStateChange = renderCount
      store.dispatch({ type: 'ACTION' })
      expect(renderCount).toBe(rendersBeforeStateChange + 1)
    })

    function renderWithBadConnect(Component) {
      const store = createStore(() => ({}))

      try {
        TestUtils.renderIntoDocument(
          <ProviderMock store={store}>
            <Component pass="through" />
          </ProviderMock>
        )
        return null
      } catch (error) {
        return error.message
      }
    }
    it('should throw a helpful error for invalid mapStateToProps arguments', () => {
      @connect('invalid')
      class InvalidMapState extends React.Component { render() { return <div></div> } }

      const error = renderWithBadConnect(InvalidMapState)
      expect(error).toInclude('string')
      expect(error).toInclude('mapStateToProps')
      expect(error).toInclude('InvalidMapState')
    })
    it('should throw a helpful error for invalid mapDispatchToProps arguments', () => {
      @connect(null, 'invalid')
      class InvalidMapDispatch extends React.Component { render() { return <div></div> } }

      const error = renderWithBadConnect(InvalidMapDispatch)
      expect(error).toInclude('string')
      expect(error).toInclude('mapDispatchToProps')
      expect(error).toInclude('InvalidMapDispatch')
    })
    it('should throw a helpful error for invalid mergeProps arguments', () => {
      @connect(null, null, 'invalid')
      class InvalidMerge extends React.Component { render() { return <div></div> } }

      const error = renderWithBadConnect(InvalidMerge)
      expect(error).toInclude('string')
      expect(error).toInclude('mergeProps')
      expect(error).toInclude('InvalidMerge')
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

      const mapStateToProps = expect.createSpy().andCall(state => ({ count: state }))
      @connect(mapStateToProps)
      class Child extends Component {
        render() { return <div>{this.props.count}</div> }
      }

      const store = createStore((state = 0, action) => (action.type === 'INC' ? state + 1 : state))
      TestUtils.renderIntoDocument(<ProviderMock store={store}><Parent /></ProviderMock>)

      expect(mapStateToProps.calls.length).toBe(1)
      store.dispatch({ type: 'INC' })
      expect(mapStateToProps.calls.length).toBe(2)
    })

    it('should subscribe properly when a middle connected component does not subscribe', () => {

      @connect(state => ({ count: state }))
      class A extends React.Component { render() { return <B {...this.props} /> }}

      @connect() // no mapStateToProps. therefore it should be transparent for subscriptions
      class B extends React.Component { render() { return <C {...this.props} /> }}

      @connect((state, props) => {
        expect(props.count).toBe(state)
        return { count: state * 10 + props.count }
      })
      class C extends React.Component { render() { return <div>{this.props.count}</div> }}

      const store = createStore((state = 0, action) => (action.type === 'INC' ? state += 1 : state))
      TestUtils.renderIntoDocument(<ProviderMock store={store}><A /></ProviderMock>)

      store.dispatch({ type: 'INC' })
    })

    it('should subscribe properly when a new store is provided via props', () => {
      const store1 = createStore((state = 0, action) => (action.type === 'INC' ? state + 1 : state))
      const store2 = createStore((state = 0, action) => (action.type === 'INC' ? state + 1 : state))

      @connect(state => ({ count: state }))
      class A extends Component {
        render() { return <B store={store2} /> }
      }

      const mapStateToPropsB = expect.createSpy().andCall(state => ({ count: state }))
      @connect(mapStateToPropsB)
      class B extends Component {
        render() { return <C {...this.props} /> }
      }

      const mapStateToPropsC = expect.createSpy().andCall(state => ({ count: state }))
      @connect(mapStateToPropsC)
      class C extends Component {
        render() { return <D /> }
      }

      const mapStateToPropsD = expect.createSpy().andCall(state => ({ count: state }))
      @connect(mapStateToPropsD)
      class D extends Component {
        render() { return <div>{this.props.count}</div> }
      }

      TestUtils.renderIntoDocument(<ProviderMock store={store1}><A /></ProviderMock>)
      expect(mapStateToPropsB.calls.length).toBe(1)
      expect(mapStateToPropsC.calls.length).toBe(1)
      expect(mapStateToPropsD.calls.length).toBe(1)

      store1.dispatch({ type: 'INC' })
      expect(mapStateToPropsB.calls.length).toBe(1)
      expect(mapStateToPropsC.calls.length).toBe(1)
      expect(mapStateToPropsD.calls.length).toBe(2)

      store2.dispatch({ type: 'INC' })
      expect(mapStateToPropsB.calls.length).toBe(2)
      expect(mapStateToPropsC.calls.length).toBe(2)
      expect(mapStateToPropsD.calls.length).toBe(2)
    })
  })
})
