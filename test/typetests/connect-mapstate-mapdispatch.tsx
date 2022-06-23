/* eslint-disable @typescript-eslint/no-unused-vars, no-inner-declarations */

import * as React from 'react'
import * as ReactDOM from 'react-dom'
import {
  Store,
  Dispatch,
  AnyAction,
  ActionCreator,
  createStore,
  bindActionCreators,
  ActionCreatorsMapObject,
  Reducer,
} from 'redux'
import {
  connect,
  ConnectedProps,
  Provider,
  DispatchProp,
  MapStateToProps,
  ReactReduxContext,
  ReactReduxContextValue,
  Selector,
  shallowEqual,
  MapDispatchToProps,
  useDispatch,
  useSelector,
  useStore,
  createDispatchHook,
  createSelectorHook,
  createStoreHook,
  TypedUseSelectorHook,
} from '../../src/index'

// Test cases written in a way to isolate types and variables and verify the
// output of `connect` to make sure the signature is what is expected

const CustomContext = React.createContext(
  null
) as unknown as typeof ReactReduxContext

function Empty() {
  interface OwnProps {
    dispatch: Dispatch
    foo: string
  }

  class TestComponent extends React.Component<OwnProps> {}

  const Test = connect()(TestComponent)

  const verify = <Test foo="bar" />
}

function MapState() {
  interface OwnProps {
    foo: string
  }
  interface StateProps {
    bar: number
  }

  class TestComponent extends React.Component<OwnProps & StateProps> {}

  const mapStateToProps = (_: any) => ({
    bar: 1,
  })

  const Test = connect(mapStateToProps)(TestComponent)

  const verify = <Test foo="bar" />
}

function MapStateWithDispatchProp() {
  interface OwnProps {
    foo: string
  }
  interface StateProps {
    bar: number
    dispatch: Dispatch
  }

  class TestComponent extends React.Component<OwnProps & StateProps> {}

  const mapStateToProps = (_: any) => ({
    bar: 1,
  })

  const Test = connect(mapStateToProps)(TestComponent)

  const verify = <Test foo="bar" />
}

function MapStateFactory() {
  interface OwnProps {
    foo: string
  }
  interface StateProps {
    bar: number
  }

  class TestComponent extends React.Component<OwnProps & StateProps> {}

  const mapStateToProps = () => () => ({
    bar: 1,
  })

  const Test = connect(mapStateToProps)(TestComponent)

  const verify = <Test foo="bar" />
}

function MapDispatch() {
  interface OwnProps {
    foo: string
  }
  interface DispatchProps {
    onClick: () => void
  }

  class TestComponent extends React.Component<OwnProps & DispatchProps> {}

  const mapDispatchToProps = { onClick: () => {} }

  const TestNull = connect(null, mapDispatchToProps)(TestComponent)

  const verifyNull = <TestNull foo="bar" />

  const TestUndefined = connect(undefined, mapDispatchToProps)(TestComponent)

  const verifyUndefined = <TestUndefined foo="bar" />
}

function MapDispatchUnion() {
  interface OwnProps {
    foo: string
  }
  interface DispatchProps {
    onClick: () => void
  }

  class TestComponent extends React.Component<OwnProps & DispatchProps> {}

  // We deliberately cast the right-hand side to `any` because otherwise
  // TypeScript would maintain the literal value, when we deliberately want to
  // test the union type here (as per the annotation). See
  // https://github.com/Microsoft/TypeScript/issues/30310#issuecomment-472218182.
  const mapDispatchToProps: MapDispatchToProps<DispatchProps, OwnProps> =
    {} as any

  const TestNull = connect(null, mapDispatchToProps)(TestComponent)

  const verifyNull = <TestNull foo="bar" />

  const TestUndefined = connect(undefined, mapDispatchToProps)(TestComponent)

  const verifyUndefined = <TestUndefined foo="bar" />
}

function MapDispatchWithThunkActionCreators() {
  const simpleAction = (payload: boolean) => ({
    type: 'SIMPLE_ACTION',
    payload,
  })
  const thunkAction =
    (param1: number, param2: string) =>
    async (dispatch: Dispatch, { foo }: OwnProps) => {
      return foo
    }
  interface OwnProps {
    foo: string
  }
  interface TestComponentProps extends OwnProps {
    simpleAction: typeof simpleAction
    thunkAction(param1: number, param2: string): Promise<string>
  }
  class TestComponent extends React.Component<TestComponentProps> {}

  const mapStateToProps = ({ foo }: { foo: string }) => ({ foo })
  const mapDispatchToProps = { simpleAction, thunkAction }

  const Test1 = connect(null, mapDispatchToProps)(TestComponent)
  const Test2 = connect(mapStateToProps, mapDispatchToProps)(TestComponent)
  const Test3 = connect(null, mapDispatchToProps, null, {
    context: CustomContext,
  })(TestComponent)
  const Test4 = connect(mapStateToProps, mapDispatchToProps, null, {
    context: CustomContext,
  })(TestComponent)
  const verify = (
    <div>
      <Test1 foo="bar" />;
      <Test2 />
      <Test3 foo="bar" />;
      <Test4 context={CustomContext} />
    </div>
  )
}

function MapManualDispatchThatLooksLikeThunk() {
  interface OwnProps {
    foo: string
  }
  interface TestComponentProps extends OwnProps {
    remove: (item: string) => () => object
  }
  class TestComponent extends React.Component<TestComponentProps> {
    render() {
      return <div onClick={this.props.remove('someid')} />
    }
  }

  const mapStateToProps = ({ foo }: { foo: string }) => ({ foo })
  function mapDispatchToProps(dispatch: Dispatch) {
    return {
      remove(item: string) {
        return () => dispatch({ type: 'REMOVE_ITEM', item })
      },
    }
  }

  const Test1 = connect(null, mapDispatchToProps)(TestComponent)
  const Test2 = connect(mapStateToProps, mapDispatchToProps)(TestComponent)
  const Test3 = connect(null, mapDispatchToProps, null, {
    context: CustomContext,
  })(TestComponent)
  const Test4 = connect(mapStateToProps, mapDispatchToProps, null, {
    context: CustomContext,
  })(TestComponent)
  const verify = (
    <div>
      <Test1 foo="bar" />;
      <Test2 />
      <Test3 foo="bar" />;
      <Test4 />
    </div>
  )
}

function MapStateAndDispatchObject() {
  interface ClickPayload {
    count: number
  }
  const onClick: ActionCreator<ClickPayload> = () => ({ count: 1 })
  const dispatchToProps = {
    onClick,
  }

  interface OwnProps {
    foo: string
  }
  interface StateProps {
    bar: number
  }
  interface DispatchProps {
    onClick: ActionCreator<ClickPayload>
  }

  const mapStateToProps = (_: any, __: OwnProps): StateProps => ({
    bar: 1,
  })

  class TestComponent extends React.Component<
    OwnProps & StateProps & DispatchProps
  > {}

  const Test = connect(mapStateToProps, dispatchToProps)(TestComponent)

  const verify = <Test foo="bar" />
}

function MapStateAndNullishDispatch() {
  interface ClickPayload {
    count: number
  }
  const onClick: ActionCreator<ClickPayload> = () => ({ count: 1 })
  const dispatchToProps = {
    onClick,
  }

  interface OwnProps {
    foo: string
  }
  interface StateProps {
    bar: number
  }

  const mapStateToProps = (_: any, __: OwnProps): StateProps => ({
    bar: 1,
  })

  class TestComponent extends React.Component<OwnProps & StateProps> {}

  const TestDispatchPropsNull = connect(mapStateToProps, null)(TestComponent)

  const verifyNull = <TestDispatchPropsNull foo="bar" />

  const TestDispatchPropsUndefined = connect(
    mapStateToProps,
    undefined
  )(TestComponent)

  const verifyNonUn = <TestDispatchPropsUndefined foo="bar" />
}

function MapDispatchFactory() {
  interface OwnProps {
    foo: string
  }
  interface DispatchProps {
    onClick: () => void
  }

  class TestComponent extends React.Component<OwnProps & DispatchProps> {}

  const mapDispatchToPropsFactory = () => () => ({
    onClick: () => {},
  })

  const TestNull = connect(null, mapDispatchToPropsFactory)(TestComponent)

  const verifyNull = <TestNull foo="bar" />

  const TestUndefined = connect(
    undefined,
    mapDispatchToPropsFactory
  )(TestComponent)

  const verifyUndefined = <TestUndefined foo="bar" />
}

function MapStateAndDispatch() {
  interface OwnProps {
    foo: string
  }
  interface StateProps {
    bar: number
  }
  interface DispatchProps {
    onClick: () => void
  }

  class TestComponent extends React.Component<
    OwnProps & StateProps & DispatchProps
  > {}

  const mapStateToProps = () => ({
    bar: 1,
  })

  const mapDispatchToProps = () => ({
    onClick: () => {},
  })

  const Test = connect(mapStateToProps, mapDispatchToProps)(TestComponent)

  const verify = <Test foo="bar" />
}

function MapStateFactoryAndDispatch() {
  interface OwnProps {
    foo: string
  }
  interface StateProps {
    bar: number
  }
  interface DispatchProps {
    onClick: () => void
  }

  const mapStateToPropsFactory = () => () => ({
    bar: 1,
  })

  const mapDispatchToProps = () => ({
    onClick: () => {},
  })

  class TestComponent extends React.Component<
    OwnProps & StateProps & DispatchProps
  > {}

  const Test = connect(
    mapStateToPropsFactory,
    mapDispatchToProps
  )(TestComponent)

  const verify = <Test foo="bar" />
}

function MapStateFactoryAndDispatchFactory() {
  interface OwnProps {
    foo: string
  }
  interface StateProps {
    bar: number
  }
  interface DispatchProps {
    onClick: () => void
  }

  const mapStateToPropsFactory = () => () => ({
    bar: 1,
  })

  const mapDispatchToPropsFactory = () => () => ({
    onClick: () => {},
  })

  class TestComponent extends React.Component<
    OwnProps & StateProps & DispatchProps
  > {}

  const Test = connect(
    mapStateToPropsFactory,
    mapDispatchToPropsFactory
  )(TestComponent)

  const verify = <Test foo="bar" />
}

function MapStateAndDispatchAndMerge() {
  interface OwnProps {
    foo: string
  }
  interface StateProps {
    bar: number
  }
  interface DispatchProps {
    onClick: () => void
  }

  class TestComponent extends React.Component<
    OwnProps & StateProps & DispatchProps
  > {}

  const mapStateToProps = () => ({
    bar: 1,
  })

  const mapDispatchToProps = () => ({
    onClick: () => {},
  })

  const mergeProps = (
    stateProps: StateProps,
    dispatchProps: DispatchProps
  ) => ({ ...stateProps, ...dispatchProps })

  const Test = connect(
    mapStateToProps,
    mapDispatchToProps,
    mergeProps
  )(TestComponent)

  const verify = <Test foo="bar" />
}

function MapStateAndMerge() {
  interface OwnProps {
    foo: string
  }
  interface StateProps {
    bar: number
  }
  interface DispatchProps {
    onClick: () => void
  }

  class TestComponent extends React.Component<OwnProps & StateProps> {}

  const mapStateToProps = () => ({
    bar: 1,
  })

  const mergeProps = (stateProps: StateProps, _: null, ownProps: OwnProps) => ({
    ...stateProps,
    ...ownProps,
  })

  const Test = connect(mapStateToProps, null, mergeProps)(TestComponent)

  const verify = <Test foo="bar" />
}

function MapStateAndOptions() {
  interface State {
    state: string
  }
  interface OwnProps {
    foo: string
  }
  interface StateProps {
    bar: number
  }
  interface DispatchProps {
    dispatch: Dispatch
  }

  class TestComponent extends React.Component<
    OwnProps & StateProps & DispatchProps
  > {}

  const mapStateToProps = (state: State) => ({
    bar: 1,
  })

  const areStatePropsEqual = (next: StateProps, current: StateProps) => true

  const Test = connect<StateProps, DispatchProps, OwnProps, State>(
    mapStateToProps,
    null,
    null,
    {
      areStatePropsEqual,
    }
  )(TestComponent)

  const verify = <Test foo="bar" />
}
