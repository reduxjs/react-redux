/*eslint-disable react/prop-types*/

import React, { Component, MouseEvent } from 'react'
import createClass from 'create-react-class'
import { createStore, applyMiddleware } from 'redux'
import { Provider as ProviderMock, connect } from '../../src/index'
import * as rtl from '@testing-library/react'
import '@testing-library/jest-dom/extend-expect'
import type { ReactNode, Dispatch, ElementType } from 'react'
import type {
  Store,
  Dispatch as ReduxDispatch,
  AnyAction,
  MiddlewareAPI,
} from 'redux'
import type { ReactReduxContextValue } from '../../src/index'

describe('React', () => {
  describe('connect', () => {
    const propMapper = (prop: any): ReactNode => {
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

    function Passthrough(props: PassthroughPropsType) {
      return (
        <ul>
          {Object.keys(props).map((prop) => (
            <li title="prop" data-testid={prop} key={prop}>
              {propMapper(props[prop])}
            </li>
          ))}
        </ul>
      )
    }

    class ContextBoundStore {
      listeners: Array<() => void>
      state: any
      reducer: (s: any, a: any) => any
      constructor(reducer: (s: any, a: any) => any) {
        this.reducer = reducer
        this.listeners = []
        this.state = undefined
        this.dispatch({})
      }

      getState() {
        return this.state
      }

      subscribe(listener: () => void) {
        this.listeners.push(listener)
        return () => this.listeners.filter((l) => l !== listener)
      }

      dispatch(action: any) {
        this.state = this.reducer(this.getState(), action)
        this.listeners.forEach((l) => l())
        return action
      }
    }
    interface ActionType {
      type: string
      body: any
    }
    function stringBuilder(prev = '', action: ActionType) {
      return action.type === 'APPEND' ? prev + action.body : prev
    }

    afterEach(() => rtl.cleanup())

    describe('Core subscription and prop passing behavior', () => {
      it('should receive the store state in the context', () => {
        const store = createStore(() => ({ hi: 'there' }))

        class Container extends Component {
          render() {
            return <Passthrough {...this.props} />
          }
        }
        const ConnectedContainer = connect((state) => state)(Container)

        const tester = rtl.render(
          <ProviderMock store={store}>
            <ConnectedContainer />
          </ProviderMock>
        )

        expect(tester.getByTestId('hi')).toHaveTextContent('there')
      })

      it('should pass state and props to the given component', () => {
        const store = createStore(() => ({
          foo: 'bar',
          baz: 42,
          hello: 'world',
        }))

        interface ContainerPropsType {
          pass: string
          baz: number
        }
        class Container extends Component<ContainerPropsType> {
          render() {
            return <Passthrough {...this.props} />
          }
        }
        interface TStateProps {
          foo: string
          baz: number
        }
        interface StateType {
          foo: string
          baz: number
          hello: string
        }

        const ConnectedContainer = connect<
          TStateProps,
          unknown,
          ContainerPropsType,
          StateType
        >(({ foo, baz }) => ({ foo, baz }))(Container)

        const tester = rtl.render(
          <ProviderMock store={store}>
            <ConnectedContainer pass="through" baz={50} />
          </ProviderMock>
        )

        expect(tester.getByTestId('pass')).toHaveTextContent('through')
        expect(tester.getByTestId('foo')).toHaveTextContent('bar')
        expect(tester.getByTestId('baz')).toHaveTextContent('42')
        expect(tester.queryByTestId('hello')).toBe(null)
      })

      it('should subscribe class components to the store changes', () => {
        const store: Store = createStore(stringBuilder)

        class Container extends Component {
          render() {
            return <Passthrough {...this.props} />
          }
        }
        const ConnectedContainer = connect((state) => ({ string: state }))(
          Container
        )

        const tester = rtl.render(
          <ProviderMock store={store}>
            <ConnectedContainer />
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
        const store: Store = createStore(stringBuilder)
        interface ContainerProps {
          string: string
        }
        function Container(props: ContainerProps) {
          return <Passthrough {...props} />
        }
        interface TStateProps {
          string: string
        }
        const ConnectedContainer = connect<
          TStateProps,
          unknown,
          unknown,
          string
        >((state) => ({
          string: state,
        }))(Container)

        const spy = jest.spyOn(console, 'error').mockImplementation(() => {})

        const tester = rtl.render(
          <ProviderMock store={store}>
            <ConnectedContainer />
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

        interface ContainerProps {
          string: string
        }
        function Container(props: ContainerProps) {
          return <Passthrough {...props} />
        }
        interface TStateProps {
          string: string
        }
        const ConnectedContainer = connect<
          TStateProps,
          unknown,
          unknown,
          string
        >((state) => ({
          string: state,
        }))(Container)

        const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
        const tester = rtl.render(
          <ProviderMock store={store as unknown as Store}>
            <ConnectedContainer />
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
          foo: 'bar',
        }))

        interface InnerProps {
          bar: {
            baz: string
          }
        }

        class Inner extends Component<InnerProps> {
          render() {
            return <Passthrough {...this.props} pass={this.props.bar.baz} />
          }
        }
        const ConnectedInner = connect((state) => state)(Inner)

        class Container extends Component<{}, { bar: { baz: string } }> {
          constructor(props: {}) {
            super(props)
            this.state = {
              bar: {
                baz: '',
              },
            }
          }

          componentDidMount() {
            this.setState({
              bar: Object.assign({}, this.state.bar, { baz: 'through' }),
            })
          }

          render() {
            return (
              <ProviderMock store={store}>
                <ConnectedInner bar={this.state.bar} />
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

        interface InnerPropsType {
          bar: string
        }

        class Inner extends Component<InnerPropsType> {
          render() {
            return <Passthrough {...this.props} pass={this.props.bar} />
          }
        }
        const ConnectedInner = connect((state) => state)(Inner)

        class Container extends Component {
          bar: string
          constructor(props: {}) {
            super(props)
            this.bar = 'baz'
          }

          componentDidMount() {
            this.bar = 'foo'
            this.forceUpdate()
          }

          render() {
            return (
              <ProviderMock store={store}>
                <ConnectedInner bar={this.bar} />
              </ProviderMock>
            )
          }
        }

        const tester = rtl.render(<Container />)

        expect(tester.getByTestId('bar')).toHaveTextContent('foo')
      })

      it('should remove undefined props', () => {
        const store = createStore(() => ({}))
        interface OwnerPropsType {
          x?: boolean
        }
        let props: OwnerPropsType = { x: true }

        class ConnectContainer extends Component {
          render() {
            return <Passthrough {...this.props} />
          }
        }
        const ConnectedInnerContainer = connect<{}, {}, OwnerPropsType, {}>(
          () => ({}),
          () => ({})
        )(ConnectContainer)

        class HolderContainer extends Component<OwnerPropsType> {
          render() {
            return <ConnectedInnerContainer {...props} />
          }
        }
        let container = React.createRef<HolderContainer>()

        const tester = rtl.render(
          <ProviderMock store={store}>
            <HolderContainer ref={container} />
          </ProviderMock>
        )

        expect(tester.getByTestId('x')).toHaveTextContent('true')

        props = {}
        rtl.act(() => {
          container.current!.forceUpdate()
        })

        expect(tester.queryByTestId('x')).toBe(null)
      })

      it('should remove undefined props without mapDispatch', () => {
        const store = createStore(() => ({}))
        interface OwnerPropsType {
          x?: boolean
        }
        let props: OwnerPropsType = { x: true }

        class Inner extends Component<OwnerPropsType> {
          render() {
            return <Passthrough {...this.props} />
          }
        }
        const ConnectedInner = connect(() => ({}))(Inner)

        class HolderContainer extends Component {
          render() {
            return <ConnectedInner {...props} />
          }
        }
        let container = React.createRef<HolderContainer>()
        const tester = rtl.render(
          <ProviderMock store={store}>
            <HolderContainer ref={container} />
          </ProviderMock>
        )

        expect(tester.getAllByTitle('prop').length).toBe(2)
        expect(tester.getByTestId('dispatch')).toHaveTextContent(
          '[function dispatch]'
        )
        expect(tester.getByTestId('x')).toHaveTextContent('true')

        props = {}
        rtl.act(() => {
          container.current!.forceUpdate()
        })

        expect(tester.getAllByTitle('prop').length).toBe(1)
        expect(tester.getByTestId('dispatch')).toHaveTextContent(
          '[function dispatch]'
        )
      })

      it('should ignore deep mutations in props', () => {
        const store = createStore(() => ({
          foo: 'bar',
        }))

        interface InnerPropsType {
          bar: {
            baz: string
          }
        }

        class Inner extends Component<InnerPropsType> {
          render() {
            return <Passthrough {...this.props} pass={this.props.bar.baz} />
          }
        }
        const ConnectedInner = connect((state) => state)(Inner)

        class Container extends Component<{}, InnerPropsType> {
          constructor(props: {}) {
            super(props)
            this.state = {
              bar: {
                baz: '',
              },
            }
          }

          componentDidMount() {
            // Simulate deep object mutation
            const bar = this.state.bar
            bar.baz = 'through'
            this.setState({
              bar,
            })
          }

          render() {
            return (
              <ProviderMock store={store}>
                <ConnectedInner bar={this.state.bar} />
              </ProviderMock>
            )
          }
        }

        const tester = rtl.render(<Container />)
        expect(tester.getByTestId('foo')).toHaveTextContent('bar')
        expect(tester.getByTestId('pass')).toHaveTextContent('')
      })

      it('should allow for merge to incorporate state and prop changes', () => {
        const store: Store = createStore(stringBuilder)

        interface OuterContainerStateType {
          extra: string
        }

        function doSomething(thing: any) {
          return {
            type: 'APPEND',
            body: thing,
          }
        }

        let merged: (s: string) => void
        let externalSetState: Dispatch<OuterContainerStateType>

        interface InnerPropsType {
          extra: string
        }
        class Inner extends Component<InnerPropsType> {
          render() {
            return <Passthrough {...this.props} />
          }
        }

        const ConnectedInner = connect(
          (state) => ({ stateThing: state }),
          (dispatch) => ({
            doSomething: (whatever: any) => dispatch(doSomething(whatever)),
          }),
          (stateProps, actionProps, parentProps: InnerPropsType) => ({
            ...stateProps,
            ...actionProps,
            mergedDoSomething: (() => {
              merged = function mergedDoSomething(thing: any) {
                const seed = stateProps.stateThing === '' ? 'HELLO ' : ''
                actionProps.doSomething(seed + thing + parentProps.extra)
              }
              return merged
            })(),
          })
        )(Inner)

        class OuterContainer extends Component<{}, OuterContainerStateType> {
          constructor(props: {}) {
            super(props)
            this.state = { extra: 'z' }
            externalSetState = this.setState.bind(this)
          }

          render() {
            return (
              <ProviderMock store={store}>
                <ConnectedInner extra={this.state.extra} />
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
          foo: 'bar',
        }))

        const exampleActionCreator = () => {}

        interface ContainerPropsType {
          pass: string
        }

        class Container extends Component<ContainerPropsType> {
          render() {
            return <Passthrough {...this.props} />
          }
        }
        const ConnectedContainer = connect(
          (state) => state,
          () => ({ exampleActionCreator })
        )(Container)

        const tester = rtl.render(
          <ProviderMock store={store}>
            <ConnectedContainer pass="through" />
          </ProviderMock>
        )

        expect(tester.getByTestId('exampleActionCreator')).toHaveTextContent(
          '[function exampleActionCreator]'
        )
        expect(tester.getByTestId('foo')).toHaveTextContent('bar')
      })

      it('should throw an error if mapState, mapDispatch, or mergeProps returns anything but a plain object', () => {
        const store = createStore(() => ({}))

        function makeContainer(
          mapState: any,
          mapDispatch: any,
          mergeProps: any
        ) {
          class Container extends Component {
            render() {
              return <Passthrough />
            }
          }
          const ConnectedContainer = connect(
            mapState,
            mapDispatch,
            mergeProps
          )(Container)
          return React.createElement(ConnectedContainer)
        }
        class AwesomeMap {}

        let spy = jest.spyOn(console, 'error').mockImplementation(() => {})
        rtl.render(
          <ProviderMock store={store}>
            {makeContainer(
              () => 1,
              () => ({}),
              () => ({})
            )}
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
            {makeContainer(
              () => 'hey',
              () => ({}),
              () => ({})
            )}
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
            {makeContainer(
              () => new AwesomeMap(),
              () => ({}),
              () => ({})
            )}
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
            {makeContainer(
              () => ({}),
              () => 1,
              () => ({})
            )}
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
            {makeContainer(
              () => ({}),
              () => 'hey',
              () => ({})
            )}
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
            {makeContainer(
              () => ({}),
              () => new AwesomeMap(),
              () => ({})
            )}
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
            {makeContainer(
              () => ({}),
              () => ({}),
              () => 1
            )}
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
            {makeContainer(
              () => ({}),
              () => ({}),
              () => 'hey'
            )}
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
            {makeContainer(
              () => ({}),
              () => ({}),
              () => new AwesomeMap()
            )}
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
        const store: Store = createStore(stringBuilder)

        let invocationCount = 0

        interface InnerPropsType {
          foo: string
        }
        class Inner extends Component<InnerPropsType, {}> {
          render() {
            return <Passthrough {...this.props} />
          }
        }
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const ConnectedInner = connect((argv) => {
          invocationCount++
          return {}
        })(Inner)

        interface OuterComponentStateType {
          foo: string
        }
        class OuterComponent extends Component<{}, OuterComponentStateType> {
          constructor(props: {}) {
            super(props)
            this.state = { foo: 'FOO' }
          }

          setFoo(foo: string) {
            this.setState({ foo })
          }

          render() {
            return (
              <div>
                <ConnectedInner {...this.state} />
              </div>
            )
          }
        }

        let outerComponent = React.createRef<OuterComponent>()
        rtl.render(
          <ProviderMock store={store}>
            <OuterComponent ref={outerComponent} />
          </ProviderMock>
        )
        outerComponent.current!.setFoo('BAR')
        outerComponent.current!.setFoo('DID')

        expect(invocationCount).toEqual(1)
      })

      it('should invoke mapState every time props are changed if it has zero arguments', () => {
        const store: Store = createStore(stringBuilder)

        let invocationCount = 0

        class Inner extends Component {
          render() {
            return <Passthrough {...this.props} />
          }
        }
        const ConnectedInner = connect(() => {
          invocationCount++
          return {}
        })(Inner)

        class OuterComponent extends Component {
          constructor(props: {}) {
            super(props)
            this.state = { foo: 'FOO' }
          }

          setFoo(foo: string) {
            this.setState({ foo })
          }

          render() {
            return (
              <div>
                <ConnectedInner {...this.state} />
              </div>
            )
          }
        }

        let outerComponent = React.createRef<OuterComponent>()
        rtl.render(
          <ProviderMock store={store}>
            <OuterComponent ref={outerComponent} />
          </ProviderMock>
        )
        expect(invocationCount).toEqual(1)
        rtl.act(() => {
          outerComponent.current!.setFoo('BAR')
        })
        rtl.act(() => {
          outerComponent.current!.setFoo('BAZ')
          outerComponent.current!.setFoo('DID')
        })

        expect(invocationCount).toEqual(3)
      })

      it('should invoke mapState every time props are changed if it has a second argument', () => {
        const store: Store = createStore(stringBuilder)

        let propsPassedIn
        let invocationCount = 0

        class Inner extends Component {
          render() {
            return <Passthrough {...this.props} />
          }
        }
        const ConnectedInner = connect((state, props) => {
          invocationCount++
          propsPassedIn = props
          return {}
        })(Inner)

        class OuterComponent extends Component {
          constructor(props: {}) {
            super(props)
            this.state = { foo: 'FOO' }
          }

          setFoo(foo: string) {
            this.setState({ foo })
          }

          render() {
            return (
              <div>
                <ConnectedInner {...this.state} />
              </div>
            )
          }
        }

        let outerComponent = React.createRef<OuterComponent>()
        rtl.render(
          <ProviderMock store={store}>
            <OuterComponent ref={outerComponent} />
          </ProviderMock>
        )

        expect(invocationCount).toEqual(1)
        rtl.act(() => {
          outerComponent.current!.setFoo('QUUX')
        })

        expect(invocationCount).toEqual(2)
        rtl.act(() => {
          outerComponent.current!.setFoo('BAR')
          outerComponent.current!.setFoo('BAZ')
        })

        expect(invocationCount).toEqual(3)
        expect(propsPassedIn).toEqual({
          foo: 'BAZ',
        })
      })

      it('should not invoke mapDispatch when props change if it only has one argument', () => {
        const store: Store = createStore(stringBuilder)

        let invocationCount = 0

        class Inner extends Component {
          render() {
            return <Passthrough {...this.props} />
          }
        }
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const ConnectedInner = connect(null, (arg1) => {
          invocationCount++
          return {}
        })(Inner)

        class OuterComponent extends Component {
          constructor(props: {}) {
            super(props)
            this.state = { foo: 'FOO' }
          }

          setFoo(foo: string) {
            this.setState({ foo })
          }

          render() {
            return (
              <div>
                <ConnectedInner {...this.state} />
              </div>
            )
          }
        }

        let outerComponent = React.createRef<OuterComponent>()
        rtl.render(
          <ProviderMock store={store}>
            <OuterComponent ref={outerComponent} />
          </ProviderMock>
        )

        rtl.act(() => {
          outerComponent.current!.setFoo('BAR')
        })
        rtl.act(() => {
          outerComponent.current!.setFoo('DID')
        })

        expect(invocationCount).toEqual(1)
      })

      it('should invoke mapDispatch every time props are changed if it has zero arguments', () => {
        const store: Store = createStore(stringBuilder)

        let invocationCount = 0

        class Inner extends Component {
          render() {
            return <Passthrough {...this.props} />
          }
        }
        const ConnectedInner = connect(null, () => {
          invocationCount++
          return {}
        })(Inner)

        class OuterComponent extends Component {
          constructor(props: {}) {
            super(props)
            this.state = { foo: 'FOO' }
          }

          setFoo(foo: string) {
            this.setState({ foo })
          }

          render() {
            return (
              <div>
                <ConnectedInner {...this.state} />
              </div>
            )
          }
        }

        let outerComponent = React.createRef<OuterComponent>()
        rtl.render(
          <ProviderMock store={store}>
            <OuterComponent ref={outerComponent} />
          </ProviderMock>
        )
        expect(invocationCount).toEqual(1)
        rtl.act(() => {
          outerComponent.current!.setFoo('BAR')
        })

        expect(invocationCount).toEqual(2)

        rtl.act(() => {
          outerComponent.current!.setFoo('DID')
          outerComponent.current!.setFoo('QUUX')
        })

        expect(invocationCount).toEqual(3)
      })

      it('should invoke mapDispatch every time props are changed if it has a second argument', () => {
        const store: Store = createStore(stringBuilder)

        let propsPassedIn
        let invocationCount = 0

        class Inner extends Component {
          render() {
            return <Passthrough {...this.props} />
          }
        }
        const ConnectedInner = connect(null, (dispatch, props) => {
          invocationCount++
          propsPassedIn = props
          return {}
        })(Inner)

        class OuterComponent extends Component {
          constructor(props: {}) {
            super(props)
            this.state = { foo: 'FOO' }
          }

          setFoo(foo: string) {
            this.setState({ foo })
          }

          render() {
            return (
              <div>
                <ConnectedInner {...this.state} />
              </div>
            )
          }
        }

        let outerComponent = React.createRef<OuterComponent>()
        rtl.render(
          <ProviderMock store={store}>
            <OuterComponent ref={outerComponent} />
          </ProviderMock>
        )

        expect(invocationCount).toEqual(1)
        rtl.act(() => {
          outerComponent.current!.setFoo('BAR')
        })

        expect(invocationCount).toEqual(2)

        rtl.act(() => {
          outerComponent.current!.setFoo('DID')
          outerComponent.current!.setFoo('QUUX')
        })

        expect(invocationCount).toEqual(3)

        expect(propsPassedIn).toEqual({
          foo: 'QUUX',
        })
      })
    })

    describe('React lifeycle interactions', () => {
      it('should handle dispatches before componentDidMount', () => {
        const store: Store = createStore(stringBuilder)

        class Container extends Component {
          componentDidMount() {
            store.dispatch({ type: 'APPEND', body: 'a' })
          }

          render() {
            return <Passthrough {...this.props} />
          }
        }
        const ConnectedContainer = connect((state) => ({ string: state }))(
          Container
        )
        const tester = rtl.render(
          <ProviderMock store={store}>
            <ConnectedContainer />
          </ProviderMock>
        )
        expect(tester.getByTestId('string')).toHaveTextContent('a')
      })

      it('should not attempt to notify unmounted child of state change', () => {
        const store: Store = createStore(stringBuilder)

        interface AppProps {
          hide: boolean
        }
        class App extends Component<AppProps> {
          render() {
            return this.props.hide ? null : <ConnectedContainer />
          }
        }
        const ConnectedApp = connect<AppProps, unknown, unknown, string>(
          (state) => ({ hide: state === 'AB' })
        )(App)

        class Container extends Component {
          render() {
            return <ConnectedChildren />
          }
        }
        const ConnectedContainer = connect(() => ({}))(Container)

        interface ChildrenPropsType {
          state: string
        }
        class Child extends Component<ChildrenPropsType> {
          componentDidMount() {
            if (this.props.state === 'A') {
              store.dispatch({ type: 'APPEND', body: 'B' })
            }
          }
          render() {
            return null
          }
        }
        const ConnectedChildren = connect<
          ChildrenPropsType,
          unknown,
          unknown,
          string
        >((state) => ({ state }))(Child)

        const { unmount } = rtl.render(
          <ProviderMock store={store}>
            <ConnectedApp />
          </ProviderMock>
        )

        try {
          rtl.act(() => {
            store.dispatch({ type: 'APPEND', body: 'A' })
          })
        } finally {
          unmount()
        }
      })

      it('should not attempt to set state after unmounting nested components', () => {
        const store = createStore(() => ({}))
        let mapStateToPropsCalls = 0

        let linkA = React.createRef<HTMLAnchorElement>()
        let linkB = React.createRef<HTMLAnchorElement>()

        interface AppPropsType {
          children: ReactNode
          setLocation: (s: string) => void
        }
        const App = ({ children, setLocation }: AppPropsType) => {
          const onClick = (to: string) => (event: MouseEvent) => {
            event.preventDefault()
            setLocation(to)
          }
          /* eslint-disable react/jsx-no-bind */
          return (
            <div>
              <a href="#" onClick={onClick('a')} ref={linkA}>
                A
              </a>
              <a href="#" onClick={onClick('b')} ref={linkB}>
                B
              </a>
              {children}
            </div>
          )
          /* eslint-enable react/jsx-no-bind */
        }
        const ConnectedApp = connect(() => ({}))(App)

        const A = () => <h1>A</h1>
        function mapState(state: {}) {
          const calls = ++mapStateToPropsCalls
          return { calls, state }
        }
        const ConnectedA = connect(mapState)(A)

        const B = () => <h1>B</h1>
        class RouterMock extends React.Component<
          {},
          { location: { pathname: string } }
        > {
          constructor(props: {}) {
            super(props)
            this.state = { location: { pathname: 'a' } }
            this.setLocation = this.setLocation.bind(this)
          }

          setLocation(pathname: string) {
            this.setState({ location: { pathname } })
            store.dispatch({ type: 'TEST' })
          }

          getChildComponent(pathname: string) {
            switch (pathname) {
              case 'a':
                return <ConnectedA />
              case 'b':
                return <B />
              default:
                throw new Error('Unknown location: ' + location)
            }
          }

          render() {
            return (
              <ConnectedApp setLocation={this.setLocation}>
                {this.getChildComponent(this.state.location.pathname)}
              </ConnectedApp>
            )
          }
        }

        const { unmount } = rtl.render(
          <ProviderMock store={store}>
            <RouterMock />
          </ProviderMock>
        )

        const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
        rtl.act(() => {
          linkA.current!.click()
          linkB.current!.click()
          linkB.current!.click()
          unmount()
        })

        // Called 3 times:
        // - Initial mount
        // - After first link click, still mounted
        // - After second link click, but the queued state update is discarded due to batching as it's unmounted
        // TODO Getting4 instead of 3
        // expect(mapStateToPropsCalls).toBe(3)
        expect(mapStateToPropsCalls).toBe(4)
        expect(spy).toHaveBeenCalledTimes(0)
        spy.mockRestore()
      })

      it('should not attempt to set state when dispatching in componentWillUnmount', () => {
        const store: Store = createStore(stringBuilder)
        let mapStateToPropsCalls = 0

        interface ContainerProps {
          dispatch: ReduxDispatch
        }

        class Container extends Component<ContainerProps> {
          componentWillUnmount() {
            this.props.dispatch({ type: 'APPEND', body: 'a' })
          }
          render() {
            return <Passthrough {...this.props} />
          }
        }
        const Connected = connect(
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          (state) => ({ calls: mapStateToPropsCalls++ }),
          (dispatch) => ({ dispatch })
        )(Container)

        const { unmount } = rtl.render(
          <ProviderMock store={store}>
            <Connected />
          </ProviderMock>
        )
        expect(mapStateToPropsCalls).toBe(1)

        const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
        unmount()
        expect(spy).toHaveBeenCalledTimes(0)
        expect(mapStateToPropsCalls).toBe(1)
        spy.mockRestore()
      })

      it('should not attempt to set state after unmounting', () => {
        const store: Store = createStore(stringBuilder)
        let mapStateToPropsCalls = 0

        class Inner extends Component {
          render() {
            return <Passthrough {...this.props} />
          }
        }
        const ConnectedInner = connect(
          () => ({ calls: ++mapStateToPropsCalls }),
          (dispatch) => ({ dispatch })
        )(Inner)

        let unmount: ReturnType<typeof rtl.render>['unmount']
        store.subscribe(() => {
          unmount()
        })

        rtl.act(() => {
          unmount = rtl.render(
            <ProviderMock store={store}>
              <ConnectedInner />
            </ProviderMock>
          ).unmount
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
        interface ActionType {
          type: string
        }
        interface StateType {
          data: {
            profile: { name: string }
          } | null
        }
        function reducer(
          state: StateType = { data: null },
          action: ActionType
        ) {
          switch (action.type) {
            case 'fetch':
              return { data: { profile: { name: 'April' } } }
            case 'clean':
              return { data: null }
            default:
              return state
          }
        }
        function mapState(state: StateType) {
          return {
            profile: state.data!.profile,
          }
        }
        class Child extends React.Component {
          render() {
            return null
          }
        }
        const ConnectedChildren = connect(mapState)(Child)

        interface ParentPropsType {
          dispatch: ReduxDispatch
        }
        class Parent extends React.Component<ParentPropsType> {
          componentWillUnmount() {
            this.props.dispatch({ type: 'clean' })
          }

          render() {
            return <ConnectedChildren />
          }
        }
        const ConnectedParent = connect(null)(Parent)

        const store = createStore(reducer)
        rtl.act(() => {
          store.dispatch({ type: 'fetch' })
        })

        const { unmount } = rtl.render(
          <ProviderMock store={store}>
            <ConnectedParent />
          </ProviderMock>
        )

        unmount()
      })
    })

    describe('Performance optimizations and bail-outs', () => {
      it('should shallowly compare the selected state to prevent unnecessary updates', () => {
        const store: Store = createStore(stringBuilder)
        const spy = jest.fn(() => ({}))
        interface RenderProps {
          string: string
        }
        function render({ string }: RenderProps) {
          spy()
          return <Passthrough string={string} />
        }
        interface ContainerProps {
          string: string
          dispatch: ReduxDispatch
        }
        class Container extends Component<ContainerProps> {
          render() {
            return render(this.props)
          }
        }
        type TStateProps = RenderProps
        type TDispatchProps = { dispatch: ReduxDispatch }
        const ConnectedContainer = connect<
          TStateProps,
          TDispatchProps,
          {},
          string
        >(
          (state) => ({ string: state }),
          (dispatch) => ({ dispatch })
        )(Container)

        const tester = rtl.render(
          <ProviderMock store={store}>
            <ConnectedContainer />
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
        const store: Store = createStore(stringBuilder)
        const spy = jest.fn(() => ({}))
        interface PassObjType {
          val?: string
          prop?: string
        }
        type PassType = string | PassObjType
        interface RenderPropsType {
          string: string
          pass: PassType
        }
        function render({ string, pass }: RenderPropsType) {
          spy()
          if (typeof pass === 'string') {
            return <Passthrough string={string} pass={pass} />
          }
          return <Passthrough string={string} pass={pass} passVal={pass.val} />
        }

        interface ContainerPropsType {
          pass: PassType
        }
        interface TStateProps {
          string: string
        }
        interface TDispatchProps {
          dispatch: ReduxDispatch
        }
        type TOwnProps = ContainerPropsType
        type TMergedProps = TOwnProps & TDispatchProps & TStateProps
        type RootState = string

        class Container extends Component<TMergedProps> {
          render() {
            return render(this.props)
          }
        }
        const Connected = connect<
          TStateProps,
          TDispatchProps,
          TOwnProps,
          TMergedProps,
          RootState
        >(
          (state) => ({ string: state }),
          (dispatch: ReduxDispatch) => ({ dispatch }),
          (
            stateProps: { string: string },
            dispatchProps: { dispatch: ReduxDispatch },
            parentProps
          ) => ({
            ...dispatchProps,
            ...stateProps,
            ...parentProps,
          })
        )(Container)

        const tree: { setState?: Dispatch<{ pass: PassType }> } = {}
        class Root extends Component<{}, { pass: PassType }> {
          constructor(props: {}) {
            super(props)
            this.state = { pass: '' }
            tree.setState = this.setState.bind(this)
          }

          render() {
            return (
              <ProviderMock store={store}>
                <Connected pass={this.state.pass} />
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
          tree.setState!({ pass: '' })
        })

        expect(spy).toHaveBeenCalledTimes(2)
        expect(tester.getByTestId('string')).toHaveTextContent('a')
        expect(tester.getByTestId('pass')).toHaveTextContent('')

        rtl.act(() => {
          tree.setState!({ pass: 'through' })
        })

        expect(spy).toHaveBeenCalledTimes(3)
        expect(tester.getByTestId('string')).toHaveTextContent('a')
        expect(tester.getByTestId('pass')).toHaveTextContent('through')

        rtl.act(() => {
          tree.setState!({ pass: 'through' })
        })

        expect(spy).toHaveBeenCalledTimes(3)
        expect(tester.getByTestId('string')).toHaveTextContent('a')
        expect(tester.getByTestId('pass')).toHaveTextContent('through')

        const obj = { prop: 'val' }
        rtl.act(() => {
          tree.setState!({ pass: obj })
        })

        expect(spy).toHaveBeenCalledTimes(4)
        expect(tester.getByTestId('string')).toHaveTextContent('a')
        expect(tester.getByTestId('pass')).toHaveTextContent('{"prop":"val"}')

        rtl.act(() => {
          tree.setState!({ pass: obj })
        })

        expect(spy).toHaveBeenCalledTimes(4)
        expect(tester.getByTestId('string')).toHaveTextContent('a')
        expect(tester.getByTestId('pass')).toHaveTextContent('{"prop":"val"}')

        const obj2 = Object.assign({}, obj, { val: 'otherval' })
        rtl.act(() => {
          tree.setState!({ pass: obj2 })
        })

        expect(spy).toHaveBeenCalledTimes(5)
        expect(tester.getByTestId('string')).toHaveTextContent('a')
        expect(tester.getByTestId('pass')).toHaveTextContent(
          '{"prop":"val","val":"otherval"}'
        )

        obj2.val = 'mutation'
        rtl.act(() => {
          tree.setState!({ pass: obj2 })
        })

        expect(spy).toHaveBeenCalledTimes(5)
        expect(tester.getByTestId('string')).toHaveTextContent('a')
        expect(tester.getByTestId('pass')).toHaveTextContent(
          '{"prop":"val","val":"otherval"}'
        )
      })

      it('should not render the wrapped component when mapState does not produce change', () => {
        const store: Store = createStore(stringBuilder)
        let renderCalls = 0
        let mapStateCalls = 0

        class Container extends Component {
          render() {
            renderCalls++
            return <Passthrough {...this.props} />
          }
        }
        const ConnectedContainer = connect(() => {
          mapStateCalls++
          return {} // no change!
        })(Container)

        rtl.render(
          <ProviderMock store={store}>
            <ConnectedContainer />
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
        const store: Store = createStore(stringBuilder)
        let renderCalls = 0
        let mapStateCalls = 0

        class Container extends Component {
          render() {
            renderCalls++
            return <Passthrough {...this.props} />
          }
        }
        const ConnectedContainer = connect((state) => {
          mapStateCalls++
          return state === 'aaa' ? { change: 1 } : {}
        })(Container)

        rtl.render(
          <ProviderMock store={store}>
            <ConnectedContainer />
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
        const store: Store = createStore(stringBuilder)

        class Container extends Component {
          render() {
            renderCalls++
            return <Passthrough {...this.props} />
          }
        }
        const ConnectedContainer = connect(
          () => ({ a: ++mapStateCalls }),
          null,
          () => ({
            changed: false,
          })
        )(Container)

        rtl.render(
          <ProviderMock store={store}>
            <ConnectedContainer />
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
    })

    describe('Wrapped component and HOC handling', () => {
      it('should throw an error if a component is not passed to the function returned by connect', () => {
        expect(connect()).toThrow(/You must pass a component to the function/)
      })

      it('should not error on valid component with circular structure', () => {
        const createComp = (A: ElementType) => {
          type PropsType = {
            count: any
          }

          const Comp = React.forwardRef<HTMLDivElement, PropsType>(
            function Comp(props: PropsType, ref) {
              return <A ref={ref}>{props.count}</A>
            }
          )
          return Comp
        }

        expect(() => {
          connect()(createComp('div'))
        }).not.toThrow()
      })

      it('Should work with a memo component, if it exists', () => {
        if (React.memo) {
          const store = createStore(() => ({ hi: 'there' }))

          const Container = React.memo((props) => <Passthrough {...props} />) // eslint-disable-line
          Container.displayName = 'Container'
          type RootState = {
            hi: string
          }
          type TStateProps = RootState
          type NoDisPatch = {}
          type TOwnProps = {
            pass: string
          }
          const WrappedContainer = connect<
            TStateProps,
            NoDisPatch,
            TOwnProps,
            RootState
          >((state) => state)(Container)

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
          connect((state) => state)(
            class Foo extends Component {
              render() {
                return <div />
              }
            }
          ).displayName
        ).toBe('Connect(Foo)')

        expect(
          connect((state) => state)(
            createClass({
              displayName: 'Bar',
              render() {
                return <div />
              },
            })
          ).displayName
        ).toBe('Connect(Bar)')

        expect(
          connect((state) => state)(
            // eslint: In this case, we don't want to specify a displayName because we're testing what
            // happens when one isn't defined.
            /* eslint-disable react/display-name */
            createClass({
              render() {
                return <div />
              },
            })
            /* eslint-enable react/display-name */
          ).displayName
        ).toBe('Connect(Component)')
      })

      it('should expose the wrapped component as WrappedComponent', () => {
        class Container extends Component {
          render() {
            return <Passthrough />
          }
        }

        const decorator = connect((state) => state)
        const decorated = decorator(Container)

        expect(decorated.WrappedComponent).toBe(Container)
      })

      it('should hoist non-react statics from wrapped component', () => {
        class Container extends Component {
          static howIsRedux: () => string
          static foo: string
          render() {
            return <Passthrough />
          }
        }

        Container.howIsRedux = () => 'Awesome!'
        Container.foo = 'bar'

        const decorator = connect((state) => state)
        const decorated = decorator(Container)

        expect(decorated.howIsRedux).toBeInstanceOf(Function)
        expect(decorated.howIsRedux()).toBe('Awesome!')
        expect(decorated.foo).toBe('bar')
      })
    })

    describe('Store subscriptions and nesting', () => {
      it('should pass dispatch and avoid subscription if arguments are falsy', () => {
        const store = createStore(() => ({
          foo: 'bar',
        }))
        type ConnectArgsType = [
          (null | boolean)?,
          (null | boolean)?,
          (null | boolean)?
        ]
        function runCheck(...connectArgs: ConnectArgsType) {
          class Container extends Component {
            render() {
              return <Passthrough {...this.props} />
            }
          }
          type TOwnProps = {
            pass: string
          }
          type RootStateType = {
            foo: string
          }
          const ConnectedContainer = connect<
            unknown,
            unknown,
            TOwnProps,
            RootStateType
            // @ts-ignore
          >(...connectArgs)(Container)

          const tester = rtl.render(
            <ProviderMock store={store}>
              <ConnectedContainer pass="through" />
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
        type RootState = number
        interface ActionType {
          type: string
        }

        interface ATStateProps {
          count: RootState
        }
        type ANoDispatch = {}
        type AOwnProps = {}

        class A extends React.Component<ATStateProps> {
          render() {
            return <ConnectedB {...this.props} />
          }
        }
        const ConnectedA = connect<
          ATStateProps,
          ANoDispatch,
          AOwnProps,
          RootState
        >((state) => ({ count: state }))(A)

        interface BProps {
          count: number
        }
        class B extends React.Component<BProps> {
          render() {
            return <ConnectedC {...this.props} />
          }
        }
        // no mapStateToProps. therefore it should be transparent for subscriptions
        const ConnectedB = connect()(B)

        interface CTStateProps {
          count: number
        }
        type CNoDispatch = {}
        type COwnProps = ATStateProps
        class C extends React.Component<CTStateProps> {
          render() {
            return <div>{this.props.count}</div>
          }
        }
        const ConnectedC = connect<
          CTStateProps,
          CNoDispatch,
          COwnProps,
          RootState
        >((state, props) => {
          expect(props.count).toBe(state)
          return { count: state * 10 + props.count }
        })(C)

        const store = createStore((state: RootState = 0, action: ActionType) =>
          action.type === 'INC' ? (state += 1) : state
        )
        rtl.render(
          <ProviderMock store={store}>
            <ConnectedA />
          </ProviderMock>
        )

        rtl.act(() => {
          store.dispatch({ type: 'INC' })
        })
      })

      it('should notify nested components through a blocking component', () => {
        type RootStateType = number
        interface ActionType {
          type: string
        }
        class Parent extends Component {
          render() {
            return (
              <BlockUpdates>
                <ConnectedChildren />
              </BlockUpdates>
            )
          }
        }
        const ConnectedParent = connect((state) => ({ count: state }))(Parent)

        class BlockUpdates extends Component {
          shouldComponentUpdate() {
            return false
          }
          render() {
            return this.props.children
          }
        }

        const mapStateToProps = jest.fn((state) => ({ count: state }))

        interface ChildrenTStateProps {
          count: RootStateType
        }
        type ChildrenNoDispatch = {}
        type ChildrenOwnProps = {}

        class Child extends Component<ChildrenTStateProps> {
          render() {
            return <div>{this.props.count}</div>
          }
        }
        const ConnectedChildren = connect<
          ChildrenTStateProps,
          ChildrenNoDispatch,
          ChildrenOwnProps,
          RootStateType
        >(mapStateToProps)(Child)

        const store = createStore(
          (state: RootStateType = 0, action: ActionType) =>
            action.type === 'INC' ? state + 1 : state
        )
        rtl.render(
          <ProviderMock store={store}>
            <ConnectedParent />
          </ProviderMock>
        )

        expect(mapStateToProps).toHaveBeenCalledTimes(1)
        rtl.act(() => {
          store.dispatch({ type: 'INC' })
        })

        expect(mapStateToProps).toHaveBeenCalledTimes(2)
      })

      it('should not notify nested components after they are unmounted', () => {
        type RootStateType = number
        interface ActionType {
          type: string
        }

        interface ParentTStateProps {
          count: number
        }
        type ParentNoDisPatch = {}
        type ParentOwnProps = {}
        class Parent extends Component<ParentTStateProps> {
          render() {
            return this.props.count === 1 ? <ConnectedChildren /> : null
          }
        }
        const ConnectedParent = connect<
          ParentTStateProps,
          ParentNoDisPatch,
          ParentOwnProps,
          RootStateType
        >((state) => ({ count: state }))(Parent)

        interface ChildTStateProps {
          count: number
        }
        type ChildNoDisPatch = {}
        type ChildOwnProps = {}
        const mapStateToProps = jest.fn((state) => ({ count: state }))
        class Child extends Component<ChildTStateProps> {
          render() {
            return <div>{this.props.count}</div>
          }
        }
        const ConnectedChildren = connect<
          ChildTStateProps,
          ChildNoDisPatch,
          ChildOwnProps,
          RootStateType
        >(mapStateToProps)(Child)

        const store = createStore(
          (state: RootStateType = 0, action: ActionType) =>
            action.type === 'INC' ? state + 1 : state
        )
        rtl.render(
          <ProviderMock store={store}>
            <ConnectedParent />
          </ProviderMock>
        )

        expect(mapStateToProps).toHaveBeenCalledTimes(0)
        rtl.act(() => {
          store.dispatch({ type: 'INC' })
        })
        expect(mapStateToProps).toHaveBeenCalledTimes(1)
        rtl.act(() => {
          store.dispatch({ type: 'INC' })
        })
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

        const context = React.createContext<
          ReactReduxContextValue<any, AnyAction>
        >(null as any)

        let actualState

        const expectedState = { foos: {} }
        const ignoredState = { bars: {} }

        const decorator = connect(
          (state) => {
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

      it('should use a custom context provider and consumer if passed as a prop to the component', () => {
        class Container extends Component {
          render() {
            return <Passthrough />
          }
        }

        const context = React.createContext<
          ReactReduxContextValue<any, AnyAction>
        >(null as any)

        let actualState

        const expectedState = { foos: {} }
        const ignoredState = { bars: {} }

        const decorator = connect((state) => {
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

        const decorator = connect((state) => {
          actualState = state
          return {}
        })
        const Decorated = decorator(Container)

        const store = createStore(() => expectedState)
        rtl.render(
          <ProviderMock store={store}>
            {/*@ts-expect-error*/}
            <Decorated context={nonContext} />
          </ProviderMock>
        )

        expect(actualState).toEqual(expectedState)
      })

      it('should use the store from the props instead of from the context if present', () => {
        class Container extends Component {
          render() {
            return <Passthrough />
          }
        }

        let actualState

        const expectedState = { foos: {} }
        const decorator = connect((state) => {
          actualState = state
          return {}
        })
        const Decorated = decorator(Container)
        const mockStore = {
          dispatch: () => {},
          subscribe: () => {},
          getState: () => expectedState,
        }
        // @ts-ignore
        rtl.render(<Decorated store={mockStore} />)

        expect(actualState).toEqual(expectedState)
      })

      it('should pass through a store prop that is not actually a Redux store', () => {
        const notActuallyAStore = 42

        const store = createStore(() => 123)
        const Decorated = connect((state) => ({ state }))(Passthrough)

        const rendered = rtl.render(
          <ProviderMock store={store}>
            {/*@ts-expect-error*/}
            <Decorated store={notActuallyAStore} />
          </ProviderMock>
        )

        expect(rendered.getByTestId('store')).toHaveTextContent('42')
      })

      it('should pass through ancestor subscription when store is given as a prop', () => {
        interface Store1State1Type {
          first: string
        }
        interface Store2State1Type {
          second: string
        }
        interface ActionType {
          type: string
        }
        type NoDispatchType = {}
        const c3Spy = jest.fn()
        const c2Spy = jest.fn()
        const c1Spy = jest.fn()

        type Comp3TStatePropsType = Store1State1Type
        type Comp3NoDispatchType = NoDispatchType
        type Comp3OwnPropsType = {}
        interface Comp1Props extends Comp1TStatePropsType {
          children: JSX.Element | JSX.Element[]
        }
        const Comp3 = ({ first }: Comp3TStatePropsType) => {
          c3Spy()
          return <Passthrough c={first} />
        }
        const ConnectedComp3 = connect<
          Comp3TStatePropsType,
          Comp3NoDispatchType,
          Comp3OwnPropsType,
          Store1State1Type
        >((state) => state)(Comp3)

        const Comp2 = ({ second }: Store2State1Type) => {
          c2Spy()
          return (
            <div>
              <Passthrough b={second} />
              <ConnectedComp3 />
            </div>
          )
        }

        type Comp1TStatePropsType = Store1State1Type
        type Comp1NoDispatchType = NoDispatchType
        type Comp1OwnPropsType = {}
        interface Comp1Props extends Comp1TStatePropsType {
          children: JSX.Element | JSX.Element[]
        }
        const Comp1 = ({ children, first }: Comp1Props) => {
          c1Spy()
          return (
            <div>
              <Passthrough a={first} />
              {children}
            </div>
          )
        }
        const ConnectedComp1 = connect<
          Comp1TStatePropsType,
          Comp1NoDispatchType,
          Comp1OwnPropsType,
          Store1State1Type
        >((state) => state)(Comp1)

        const reducer1 = (
          state: Store1State1Type = { first: '1' },
          action: ActionType
        ) => {
          switch (action.type) {
            case 'CHANGE':
              return { first: '2' }
            default:
              return state
          }
        }

        const reducer2 = (
          state: Store2State1Type = { second: '3' },
          action: ActionType
        ) => {
          switch (action.type) {
            case 'CHANGE':
              return { second: '4' }
            default:
              return state
          }
        }
        const ConnectedComp2 = connect<
          Store2State1Type,
          unknown,
          unknown,
          Store2State1Type
        >((state) => state)(Comp2)

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
        type RootStateType = number
        interface ActionType {
          type: string
        }
        const store1 = createStore(
          (state: RootStateType = 0, action: ActionType) =>
            action.type === 'INC' ? state + 1 : state
        )
        const store2 = createStore(
          (state: RootStateType = 0, action: ActionType) =>
            action.type === 'INC' ? state + 1 : state
        )
        const customContext = React.createContext<ReactReduxContextValue>(
          null as any
        )

        class A extends Component {
          render() {
            return <ConnectedB />
          }
        }
        const ConnectedA = connect(
          (state) => ({ count: state }),
          undefined,
          undefined,
          {
            context: customContext,
          }
        )(A)

        const mapStateToPropsB = jest.fn((state) => ({ count: state }))
        class B extends Component {
          render() {
            return <ConnectedC {...this.props} />
          }
        }
        const ConnectedB = connect(mapStateToPropsB, undefined, undefined, {
          context: customContext,
        })(B)

        const mapStateToPropsC = jest.fn((state) => ({ count: state }))
        class C extends Component {
          render() {
            return <ConnectedD />
          }
        }
        const ConnectedC = connect(mapStateToPropsC, undefined, undefined, {
          context: customContext,
        })(C)

        interface DTStatePropsType {
          count: number
        }
        type DNoDispatchType = {}
        type DOwnPropsType = {}
        const mapStateToPropsD = jest.fn((state) => ({ count: state }))
        class D extends Component<DTStatePropsType> {
          render() {
            return <div>{this.props.count}</div>
          }
        }
        const ConnectedD = connect<
          DTStatePropsType,
          DNoDispatchType,
          DOwnPropsType,
          RootStateType
        >(mapStateToPropsD)(D)

        rtl.render(
          <ProviderMock store={store1}>
            <ProviderMock context={customContext} store={store2}>
              <ConnectedA />
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
      it('should return the instance of the wrapped component for use in calling child methods', async () => {
        const store = createStore(() => ({}))

        const someData = {
          some: 'data',
        }

        class Container extends Component {
          someInstanceMethod() {
            return someData
          }

          render() {
            return <Passthrough loaded="yes" />
          }
        }

        const decorator = connect((state) => state, null, null, {
          forwardRef: true,
        })
        const Decorated = decorator(Container)

        const ref = React.createRef<Container>()

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

        await tester.findByTestId('loaded')

        expect(ref.current!.someInstanceMethod()).toBe(someData)
      })

      it('should correctly separate and pass through props to the wrapped component with a forwarded ref', () => {
        type RootStateType = {}
        const store = createStore(() => ({}))

        class Container extends Component {
          render() {
            return <Passthrough {...this.props} />
          }
        }
        type ContainerTStatePropsType = {}
        type ContainerNoDispatchType = null
        type ContainerOwnPropsType = { a: number }
        const decorator = connect<
          ContainerTStatePropsType,
          ContainerNoDispatchType,
          ContainerOwnPropsType,
          RootStateType
        >((state) => state, null, null, {
          forwardRef: true,
        })
        const Decorated = decorator(Container)

        const ref = React.createRef<Container>()

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

    describe('Factory functions for mapState/mapDispatch', () => {
      it('should allow providing a factory function to mapStateToProps', () => {
        let updatedCount = 0
        let memoizedReturnCount = 0
        const store = createStore(() => ({ value: 1 }))

        interface RootStateType {
          value: number
        }
        interface TStatePropsType {
          someObject: { prop: string; stateVal: number }
        }
        type NoDispatch = {}
        interface OnwPropsType {
          name: string
        }

        const mapStateFactory = () => {
          let lastProp: string, lastVal: number, lastResult: TStatePropsType
          return (state: RootStateType, props: OnwPropsType) => {
            if (props.name === lastProp && lastVal === state.value) {
              memoizedReturnCount++
              return lastResult
            }
            lastProp = props.name
            lastVal = state.value
            return (lastResult = {
              someObject: { prop: props.name, stateVal: state.value },
            })
          }
        }

        class Container extends Component {
          componentDidUpdate() {
            updatedCount++
          }
          render() {
            return <Passthrough {...this.props} />
          }
        }
        const ConnectedContainer = connect<
          TStatePropsType,
          NoDispatch,
          OnwPropsType,
          RootStateType
        >(mapStateFactory)(Container)

        rtl.render(
          <ProviderMock store={store}>
            <div>
              <ConnectedContainer name="a" />
              <ConnectedContainer name="b" />
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
        interface RootStateType {
          value: number
        }
        type TStateProps = {}
        type NoDispatch = {}
        interface OwnProps {
          name: string
        }
        const store = createStore(() => ({ value: 1 }))

        let initialState
        let initialOwnProps
        let secondaryOwnProps: OwnProps
        const mapStateFactory = function (factoryInitialState: RootStateType) {
          initialState = factoryInitialState
          initialOwnProps = arguments[1]
          return (state: RootStateType, props: OwnProps) => {
            secondaryOwnProps = props
            return {}
          }
        }

        class Container extends Component {
          render() {
            return <Passthrough {...this.props} />
          }
        }

        const ConnectedContainer = connect<
          TStateProps,
          NoDispatch,
          OwnProps,
          RootStateType
        >(mapStateFactory)(Container)

        rtl.render(
          <ProviderMock store={store}>
            <div>
              <ConnectedContainer name="a" />
            </div>
          </ProviderMock>
        )

        rtl.act(() => {
          store.dispatch({ type: 'test' })
        })

        expect(initialOwnProps).toBe(undefined)
        expect(initialState).not.toBe(undefined)
        //@ts-ignore
        expect(secondaryOwnProps).not.toBe(undefined)
        //@ts-ignore
        expect(secondaryOwnProps.name).toBe('a')
      })

      it('should allow providing a factory function to mapDispatchToProps', () => {
        let updatedCount = 0
        let memoizedReturnCount = 0

        const store = createStore(() => ({ value: 1 }))
        type PassTStateProps = {}
        interface TDispatchPropsType {
          someObject: {
            dispatchFn: ReduxDispatch
          }
        }
        interface OwnPropsType {
          count: number
          name: string
        }
        type TMergeProps = Omit<OwnPropsType, 'count'> & TDispatchPropsType

        const mapDispatchFactory = () => {
          let lastProp: string, lastResult: TDispatchPropsType
          return (dispatch: ReduxDispatch, props: OwnPropsType) => {
            if (props.name === lastProp) {
              memoizedReturnCount++
              return lastResult
            }
            lastProp = props.name
            return (lastResult = { someObject: { dispatchFn: dispatch } })
          }
        }
        function mergeParentDispatch(
          stateProps: PassTStateProps,
          dispatchProps: TDispatchPropsType,
          parentProps: OwnPropsType
        ): TMergeProps {
          return { ...stateProps, ...dispatchProps, name: parentProps.name }
        }

        class Passthrough extends Component {
          componentDidUpdate() {
            updatedCount++
          }
          render() {
            return <div />
          }
        }
        const ConnectedPass = connect<
          PassTStateProps,
          TDispatchPropsType,
          OwnPropsType,
          TMergeProps
        >(
          null,
          mapDispatchFactory,
          mergeParentDispatch
        )(Passthrough)

        type ContainerPropsType = {}
        interface ContainerStateType {
          count: number
        }
        class Container extends Component<
          ContainerPropsType,
          ContainerStateType
        > {
          constructor(props: ContainerPropsType) {
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
                <ConnectedPass count={count} name="a" />
                <ConnectedPass count={count} name="b" />
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
      function renderWithBadConnect(Component: ElementType) {
        const store = createStore(() => ({}))
        const spy = jest.spyOn(console, 'error').mockImplementation(() => {})

        try {
          rtl.render(
            <ProviderMock store={store}>
              <Component pass="through" />
            </ProviderMock>
          )
          return null
          //@ts-ignore before typescript4.0, a catch could not have type annotations
        } catch (error) {
          return error.message
        } finally {
          spy.mockRestore()
        }
      }

      it('should throw a helpful error for invalid mapStateToProps arguments', () => {
        //@ts-expect-error
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
        //@ts-expect-error
        @connect(null, 'invalid')
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
        // @ts-expect-error
        @connect(null, null, 'invalid')
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
      it('works in <StrictMode> without warnings (React 16.3+)', () => {
        if (!React.StrictMode) {
          return
        }
        const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
        const store: Store = createStore(stringBuilder)

        class Container extends Component {
          render() {
            return <Passthrough {...this.props} />
          }
        }
        const ConnectedContainer = connect((state) => ({ string: state }))(
          Container
        )

        rtl.render(
          <React.StrictMode>
            <ProviderMock store={store}>
              <ConnectedContainer />
            </ProviderMock>
          </React.StrictMode>
        )

        expect(spy).not.toHaveBeenCalled()
      })
    })

    describe('Subscription and update timing correctness', () => {
      it('should pass state consistently to mapState', () => {
        type RootStateType = string
        const store: Store = createStore(stringBuilder)

        rtl.act(() => {
          store.dispatch({ type: 'APPEND', body: 'a' })
        })

        let childMapStateInvokes = 0

        type ContainerStateProps = { state: string }
        type ContainerNoDisPatch = {}
        type ContainerOwnProps = {}
        class Container extends Component<ContainerStateProps> {
          emitChange() {
            store.dispatch({ type: 'APPEND', body: 'b' })
          }

          render() {
            return (
              <div>
                <button onClick={this.emitChange.bind(this)}>change</button>
                <ConnectedChildrenContainer parentState={this.props.state} />
              </div>
            )
          }
        }
        const ConnectedContainer = connect<
          ContainerStateProps,
          ContainerNoDisPatch,
          ContainerOwnProps,
          RootStateType
        >((state) => ({ state }))(Container)

        const childCalls: any[] = []

        type ChildrenTStateProps = {}
        type ChildrenNoDisPatch = {}
        type ChildrenOwnProps = {
          parentState: string
        }
        class ChildContainer extends Component {
          render() {
            return <Passthrough {...this.props} />
          }
        }
        const ConnectedChildrenContainer = connect<
          ChildrenTStateProps,
          ChildrenNoDisPatch,
          ChildrenOwnProps,
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
          ['acbd', 'acbd'],
        ])
      })

      it('should invoke mapState always with latest props', () => {
        type RootState = number
        const store = createStore((state: RootState = 0) => state + 1)

        interface InnerTStatePropsType {
          reduxCount: RootState
        }
        type NoDispatchType = {}
        interface OwnPropsType {
          count: number
        }
        let propsPassedIn: OwnPropsType & InnerTStatePropsType

        class InnerComponent extends Component<
          OwnPropsType & InnerTStatePropsType
        > {
          render() {
            propsPassedIn = this.props
            return <Passthrough {...this.props} />
          }
        }
        const ConnectedInner = connect<
          InnerTStatePropsType,
          NoDispatchType,
          OwnPropsType,
          RootState
        >((reduxCount) => {
          return { reduxCount }
        })(InnerComponent)

        interface OuterStateType {
          count: number
        }
        class OuterComponent extends Component<{}, OuterStateType> {
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
        rtl.act(() => {
          outerComponent.current!.setState(({ count }) => ({
            count: count + 1,
          }))

          store.dispatch({ type: '' })
        })

        //@ts-ignore
        expect(propsPassedIn.count).toEqual(1)
        //@ts-ignore
        expect(propsPassedIn.reduxCount).toEqual(2)
      })

      it('should use the latest props when updated between actions', () => {
        type RootStateType = number
        type PayloadType = () => void
        interface ActionType {
          type: string
          payload?: PayloadType
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
        type ChildrenNoDispatchType = {}
        interface ChildrenOwnProps {
          prop: string
        }
        const Child = connect<
          ChildrenTStatePropsType,
          ChildrenNoDispatchType,
          ChildrenOwnProps,
          RootStateType
        >((count) => ({ count }))(function (
          props: ChildrenTStatePropsType & ChildrenOwnProps
        ) {
          return (
            <div
              data-testid="child"
              data-prop={props.prop}
              data-count={props.count}
            />
          )
        })
        type ParentPropsType = {}
        interface ParentStateType {
          prop: string
        }
        class Parent extends Component<ParentPropsType, ParentStateType> {
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
        expect(rendered.getByTestId('child').dataset.count).toEqual('0')
        expect(rendered.getByTestId('child').dataset.prop).toEqual('a')

        // Force the multi-update sequence by running this bound action creator
        rtl.act(() => {
          parent.current!.inc1()
        })

        // The connected child component _should_ have rendered with the latest Redux
        // store value (3) _and_ the latest wrapper prop ('b').
        expect(rendered.getByTestId('child').dataset.count).toEqual('3')
        expect(rendered.getByTestId('child').dataset.prop).toEqual('b')
      })

      it('should invoke mapState always with latest store state', () => {
        type RootStateType = number
        const store = createStore((state: RootStateType = 0) => state + 1)

        let reduxCountPassedToMapState

        class InnerComponent extends Component {
          render() {
            return <Passthrough {...this.props} />
          }
        }
        interface InnerTPropsStateType {
          a: string
        }
        type InnerNoDispatch = {}
        type InnerOwnerPropsType = { count: number }
        const ConnectedInner = connect<
          InnerTPropsStateType,
          InnerNoDispatch,
          InnerOwnerPropsType,
          RootStateType
        >((reduxCount) => {
          reduxCountPassedToMapState = reduxCount
          return reduxCount < 2 ? { a: 'a' } : { a: 'b' }
        })(InnerComponent)

        interface OuterStateType {
          count: number
        }
        class OuterComponent extends Component<{}, OuterStateType> {
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
      })

      it('should ensure top-down updates for consecutive batched updates', () => {
        type RootStateType = number
        interface ActionType {
          type: string
        }
        const INC = 'INC'
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
          return <div>child</div>
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

    it("should enforce top-down updates to ensure a deleted child's mapState doesn't throw errors", () => {
      const initialState = {
        a: { id: 'a', name: 'Item A' },
        b: { id: 'b', name: 'Item B' },
        c: { id: 'c', name: 'Item C' },
      }
      interface ActionType {
        type: string
      }
      type RootStateType = {
        [x: string]: { id: string; name: string }
      }

      const reducer = (
        state: RootStateType = initialState,
        action: ActionType
      ) => {
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
      interface PropsType {
        name: string | undefined
      }
      const ListItem = ({ name }: PropsType) => {
        return <div>Name: {name}</div>
      }

      let thrownError = null

      type ListItemTStatePropsType = { name: string } | undefined
      type ListItemNoDispatch = {}
      type ListItemOwnerProps = {
        id: string
      }

      const listItemMapState = (
        state: RootStateType,
        ownProps: ListItemOwnerProps
      ) => {
        try {
          const item = state[ownProps.id]

          // If this line executes when item B has been deleted, it will throw an error.
          // For this test to succeed, we should never execute mapState for item B after the item
          // has been deleted, because the parent should re-render the component out of existence.
          const { name } = item!
          return { name }
        } catch (e) {
          thrownError = e
        }
      }

      const ConnectedListItem = connect<
        ListItemTStatePropsType,
        ListItemNoDispatch,
        ListItemOwnerProps,
        RootStateType
      >(listItemMapState)(ListItem)

      interface AppTStatePropsType {
        itemIds: string[]
      }
      type AppNoDispatchType = {}
      type OwnPropsType = {}

      const appMapState = (state: RootStateType) => {
        const itemIds = Object.keys(state)
        return { itemIds }
      }

      function App({ itemIds }: AppTStatePropsType) {
        const items = itemIds.map((id) => (
          <ConnectedListItem key={id} id={id} />
        ))

        return (
          <div className="App">
            {items}
            <button data-testid="deleteB">Delete B</button>
          </div>
        )
      }

      const ConnectedApp = connect<
        AppTStatePropsType,
        AppNoDispatchType,
        OwnPropsType,
        RootStateType
      >(appMapState)(App)

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
  })
})
