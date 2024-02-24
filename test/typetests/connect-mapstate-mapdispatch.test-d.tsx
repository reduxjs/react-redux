import React from 'react'
import type { ActionCreator, Dispatch } from 'redux'
import type {
  MapDispatchToProps,
  ReactReduxContextValue,
} from 'react-redux'
import { connect } from 'react-redux'

// Test cases written in a way to isolate types and variables and verify the
// output of `connect` to make sure the signature is what is expected

const CustomContext = React.createContext<ReactReduxContextValue | null>(null)

describe('type tests', () => {
  test('empty', () => {
    interface OwnProps {
      dispatch: Dispatch
      foo: string
    }

    class TestComponent extends React.Component<OwnProps> {}

    const Test = connect()(TestComponent)

    const verify = <Test foo="bar" />
  })

  test('map state', () => {
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
  })

  test('map state with dispatch prop', () => {
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
  })

  test('map state factory', () => {
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
  })

  test('map dispatch', () => {
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
  })

  test('map dispatch union', () => {
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
  })

  test('map dispatch with thunk action creators', () => {
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
  })

  test('map manual dispatch that looks like thunk', () => {
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
  })

  test('map state and dispatch object', () => {
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
  })

  test('map state and nullish dispatch', () => {
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
      undefined,
    )(TestComponent)

    const verifyNonUn = <TestDispatchPropsUndefined foo="bar" />
  })

  test('map dispatch factory', () => {
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
      mapDispatchToPropsFactory,
    )(TestComponent)

    const verifyUndefined = <TestUndefined foo="bar" />
  })

  test('map state and dispatch', () => {
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
  })

  test('map state factory and dispatch', () => {
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
      mapDispatchToProps,
    )(TestComponent)

    const verify = <Test foo="bar" />
  })

  test('map state factory and dispatch factory', () => {
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
      mapDispatchToPropsFactory,
    )(TestComponent)

    const verify = <Test foo="bar" />
  })

  test('map state and dispatch and merge', () => {
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
      dispatchProps: DispatchProps,
    ) => ({ ...stateProps, ...dispatchProps })

    const Test = connect(
      mapStateToProps,
      mapDispatchToProps,
      mergeProps,
    )(TestComponent)

    const verify = <Test foo="bar" />
  })

  test('map state and merge', () => {
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

    const mergeProps = (
      stateProps: StateProps,
      _: null,
      ownProps: OwnProps,
    ) => ({
      ...stateProps,
      ...ownProps,
    })

    const Test = connect(mapStateToProps, null, mergeProps)(TestComponent)

    const verify = <Test foo="bar" />
  })

  test('map state and options', () => {
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
      },
    )(TestComponent)

    const verify = <Test foo="bar" />
  })
})
