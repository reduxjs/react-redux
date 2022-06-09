/* eslint-disable @typescript-eslint/no-unused-vars, no-inner-declarations */
import { Component, ReactElement } from 'react'
import React from 'react'
import ReactDOM from 'react-dom'
import {
  configureStore,
  createSlice,
  createAsyncThunk,
  Store,
  Dispatch,
  bindActionCreators,
  AnyAction,
  ThunkAction,
  Action,
} from '@reduxjs/toolkit'
import {
  MapStateToProps,
  DispatchProp,
  connect,
  Provider,
  ConnectedProps,
  useDispatch,
  useSelector,
  TypedUseSelectorHook,
} from '../../src/index'
import { expectType } from '../typeTestHelpers'

import {
  CounterState,
  counterSlice,
  increment,
  incrementAsync,
  AppDispatch,
  AppThunk,
  RootState,
  fetchCount,
} from './counterApp'

import objectAssign from 'object-assign'

class Counter extends Component<any, any> {
  render() {
    return <button onClick={this.props.onIncrement}>{this.props.value}</button>
  }
}

function mapStateToProps(state: CounterState) {
  return {
    value: state.counter,
  }
}

// Which action creators does it want to receive by props?
function mapDispatchToProps(dispatch: Dispatch<AnyAction>) {
  return {
    onIncrement: () => dispatch(increment()),
  }
}

connect(mapStateToProps, mapDispatchToProps)(Counter)

class CounterContainer extends Component<any, any> {}
const ConnectedCounterContainer = connect(mapStateToProps)(CounterContainer)

// Ensure connect's first two arguments can be replaced by wrapper functions
interface ICounterStateProps {
  value: number
}
interface ICounterDispatchProps {
  onIncrement: () => void
}
connect<ICounterStateProps, ICounterDispatchProps, {}, CounterState>(
  () => mapStateToProps,
  () => mapDispatchToProps
)(Counter)
// only first argument
connect<ICounterStateProps, {}, {}, CounterState>(() => mapStateToProps)(
  Counter
)
// wrap only one argument
connect<ICounterStateProps, ICounterDispatchProps, {}, CounterState>(
  mapStateToProps,
  () => mapDispatchToProps
)(Counter)
// with extra arguments
connect<ICounterStateProps, ICounterDispatchProps, {}, {}, CounterState>(
  () => mapStateToProps,
  () => mapDispatchToProps,
  (s: ICounterStateProps, d: ICounterDispatchProps) => objectAssign({}, s, d),
  { forwardRef: true }
)(Counter)

class App extends Component<any, any> {
  render(): React.ReactNode {
    // ...
    return null
  }
}

const targetEl = document.getElementById('root')

ReactDOM.render(
  <Provider store={store}>
    <App />
  </Provider>,
  targetEl
)

declare var store: Store<TodoState>
class MyRootComponent extends Component<any, any> {}
class TodoApp extends Component<any, any> {}
interface TodoState {
  todos: string[] | string
}
interface TodoProps {
  userId: number
}
interface DispatchProps {
  addTodo(userId: number, text: string): void
  // action: Function
}

const addTodo = (userId: number, text: string) => ({
  type: 'todos/todoAdded',
  payload: { userId, text },
})
const actionCreators = { addTodo }
type AddTodoAction = ReturnType<typeof addTodo>
declare var todoActionCreators: { [type: string]: (...args: any[]) => any }
declare var counterActionCreators: { [type: string]: (...args: any[]) => any }

ReactDOM.render(
  <Provider store={store}>
    <MyRootComponent />
  </Provider>,
  document.body
)

// Inject just dispatch and don't listen to store

connect()(TodoApp)

// Inject dispatch and every field in the global state

connect((state: TodoState) => state)(TodoApp)

// Inject dispatch and todos

function mapStateToProps2(state: TodoState) {
  return { todos: state.todos }
}

export default connect(mapStateToProps2)(TodoApp)

// Inject todos and all action creators (addTodo, completeTodo, ...)

connect(mapStateToProps2, actionCreators)(TodoApp)

// Inject todos and all action creators (addTodo, completeTodo, ...) as actions

function mapDispatchToProps2(dispatch: Dispatch<AnyAction>) {
  return { actions: bindActionCreators(actionCreators, dispatch) }
}

connect(mapStateToProps2, mapDispatchToProps2)(TodoApp)

// Inject todos and a specific action creator (addTodo)

function mapDispatchToProps3(dispatch: Dispatch<AnyAction>) {
  return bindActionCreators({ addTodo }, dispatch)
}

connect(mapStateToProps2, mapDispatchToProps3)(TodoApp)

// Inject todos, todoActionCreators as todoActions, and counterActionCreators as counterActions

function mapDispatchToProps4(dispatch: Dispatch<AnyAction>) {
  return {
    todoActions: bindActionCreators(todoActionCreators, dispatch),
    counterActions: bindActionCreators(counterActionCreators, dispatch),
  }
}

connect(mapStateToProps2, mapDispatchToProps4)(TodoApp)

// Inject todos, and todoActionCreators and counterActionCreators together as actions

//function mapStateToProps(state) {
//    return { todos: state.todos };
//}

function mapDispatchToProps5(dispatch: Dispatch<AnyAction>) {
  return {
    actions: bindActionCreators(
      objectAssign({}, todoActionCreators, counterActionCreators),
      dispatch
    ),
  }
}

connect(mapStateToProps2, mapDispatchToProps5)(TodoApp)

// Inject todos, and all todoActionCreators and counterActionCreators directly as props

function mapDispatchToProps6(dispatch: Dispatch<AnyAction>) {
  return bindActionCreators(
    objectAssign({}, todoActionCreators, counterActionCreators),
    dispatch
  )
}

connect(mapStateToProps2, mapDispatchToProps6)(TodoApp)

// Inject todos of a specific user depending on props

function mapStateToProps3(state: TodoState, ownProps: TodoProps): TodoState {
  return { todos: state.todos[ownProps.userId] }
}

connect(mapStateToProps3)(TodoApp)

// Inject todos of a specific user depending on props, and inject props.userId into the action

function mergeProps(
  stateProps: TodoState,
  dispatchProps: DispatchProps,
  ownProps: TodoProps
): { addTodo: (userId: string) => void } & TodoState {
  return objectAssign({}, ownProps, {
    todos: stateProps.todos[ownProps.userId],
    addTodo: (text: string) => dispatchProps.addTodo(ownProps.userId, text),
  })
}

connect(mapStateToProps2, actionCreators, mergeProps)(TodoApp)

interface TestProp {
  property1: number
  someOtherProperty?: string
}
interface TestState {
  isLoaded: boolean
  state1: number
}
class TestComponent extends Component<TestProp, TestState> {}
const WrappedTestComponent = connect()(TestComponent)

// return value of the connect()(TestComponent) is of the type TestComponent
let ATestComponent: React.ComponentType<TestProp>
ATestComponent = TestComponent
ATestComponent = WrappedTestComponent

let anElement: ReactElement<TestProp>
;<TestComponent property1={42} />
;<WrappedTestComponent property1={42} />
;<ATestComponent property1={42} />

// @ts-expect-error
;<ATestComponent property1={42} dummyField={123} />

class NonComponent {}
// this doesn't compile
// @ts-expect-error
connect()(NonComponent)

// stateless functions
interface HelloMessageProps {
  name: string
}
function HelloMessage(props: HelloMessageProps) {
  return <div>Hello {props.name}</div>
}
let ConnectedHelloMessage = connect()(HelloMessage)
ReactDOM.render(
  <HelloMessage name="Sebastian" />,
  document.getElementById('content')
)
ReactDOM.render(
  <ConnectedHelloMessage name="Sebastian" />,
  document.getElementById('content')
)

// stateless functions that uses mapStateToProps and mapDispatchToProps
namespace TestStatelessFunctionWithMapArguments {
  interface GreetingProps {
    name: string
    onClick: () => void
  }

  function Greeting(props: GreetingProps) {
    return <div>Hello {props.name}</div>
  }

  const mapStateToProps = (state: any, ownProps: GreetingProps) => {
    return {
      name: 'Connected! ' + ownProps.name,
    }
  }

  const mapDispatchToProps = (
    dispatch: Dispatch<AnyAction>,
    ownProps: GreetingProps
  ) => {
    return {
      onClick: () => {
        dispatch({ type: 'GREETING', name: ownProps.name })
      },
    }
  }

  const ConnectedGreeting = connect(
    mapStateToProps,
    mapDispatchToProps
  )(Greeting)
}

// https://github.com/DefinitelyTyped/DefinitelyTyped/issues/8787
namespace TestTOwnPropsInference {
  interface OwnProps {
    own: string
  }

  interface StateProps {
    state: string
  }

  class OwnPropsComponent extends React.Component<OwnProps & StateProps, {}> {
    render() {
      return <div />
    }
  }

  function mapStateToPropsWithoutOwnProps(state: any): StateProps {
    return { state: 'string' }
  }

  function mapStateToPropsWithOwnProps(
    state: any,
    ownProps: OwnProps
  ): StateProps {
    return { state: 'string' }
  }

  const ConnectedWithoutOwnProps = connect(mapStateToPropsWithoutOwnProps)(
    OwnPropsComponent
  )
  const ConnectedWithOwnProps = connect(mapStateToPropsWithOwnProps)(
    OwnPropsComponent
  )
  const ConnectedWithTypeHint = connect<StateProps, {}, OwnProps>(
    mapStateToPropsWithoutOwnProps
  )(OwnPropsComponent)

  // @ts-expect-error
  React.createElement(ConnectedWithoutOwnProps, { anything: 'goes!' })

  // This compiles, as expected.
  React.createElement(ConnectedWithOwnProps, { own: 'string' })

  // This should not compile, which is good.
  // @ts-expect-error
  React.createElement(ConnectedWithOwnProps, { missingOwn: true })

  // This compiles, as expected.
  React.createElement(ConnectedWithTypeHint, { own: 'string' })

  // This should not compile, which is good.
  // @ts-expect-error
  React.createElement(ConnectedWithTypeHint, { missingOwn: true })

  interface AllProps {
    own: string
    state: string
  }

  class AllPropsComponent extends React.Component<AllProps & DispatchProp> {
    render() {
      return <div />
    }
  }

  type PickedOwnProps = Pick<AllProps, 'own'>
  type PickedStateProps = Pick<AllProps, 'state'>

  const mapStateToPropsForPicked: MapStateToProps<
    PickedStateProps,
    PickedOwnProps,
    {}
  > = (state: any): PickedStateProps => {
    return { state: 'string' }
  }
  const ConnectedWithPickedOwnProps = connect(mapStateToPropsForPicked)(
    AllPropsComponent
  )
  ;<ConnectedWithPickedOwnProps own="blah" />
}

namespace ConnectedPropsTest {
  interface RootState {
    isOn: boolean
  }

  const mapState1 = (state: RootState) => ({
    isOn: state.isOn,
  })

  const mapDispatch1 = {
    toggleOn: () => ({ type: 'TOGGLE_IS_ON' }),
  }

  const connector1 = connect(mapState1, mapDispatch1)

  // The inferred type will look like:
  // {isOn: boolean, toggleOn: () => void}
  type PropsFromRedux1 = ConnectedProps<typeof connector1>

  expectType<{ isOn: boolean; toggleOn: () => void }>({} as PropsFromRedux1)

  const exampleThunk = (id: number) => async (dispatch: Dispatch) => {
    return 'test'
  }

  const mapDispatch2 = { exampleThunk }

  // Connect should "resolve thunks", so that instead of typing the return value of the
  // prop as the thunk function, it dives down and uses the return value of the thunk function itself
  const connector2 = connect(null, mapDispatch2)
  type PropsFromRedux2 = ConnectedProps<typeof connector2>

  expectType<{ exampleThunk: (id: number) => Promise<string> }>(
    {} as PropsFromRedux2
  )
}
