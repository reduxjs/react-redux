import PropTypes from 'prop-types'
import React from 'react'
import type { ActionCreator, AnyAction, Dispatch, Reducer, Store } from 'redux'
import { createStore } from 'redux'
import type {
  Connect,
  ConnectedProps,
  DispatchProp,
  MapStateToProps,
  ReactReduxContextValue,
} from '../../src/index'
import { Provider, ReactReduxContext, connect } from '../../src/index'

// Test cases written in a way to isolate types and variables and verify the
// output of `connect` to make sure the signature is what is expected

const CustomContext = React.createContext<ReactReduxContextValue | null>(null)

describe('type tests', () => {
  test('merged props inference', () => {
    // https://github.com/DefinitelyTyped/DefinitelyTyped/issues/16021

    interface StateProps {
      state: string
    }

    interface DispatchProps {
      dispatch: string
    }

    interface OwnProps {
      own: string
    }

    interface MergedProps {
      merged: string
    }

    class MergedPropsComponent extends React.Component<MergedProps> {
      render() {
        return <div />
      }
    }

    function mapStateToProps(state: any): StateProps {
      return { state: 'string' }
    }

    function mapDispatchToProps(dispatch: Dispatch): DispatchProps {
      return { dispatch: 'string' }
    }

    const ConnectedWithOwnAndState = connect<
      StateProps,
      void,
      OwnProps,
      MergedProps
    >(mapStateToProps, undefined, (stateProps: StateProps) => ({
      merged: 'merged',
    }))(MergedPropsComponent)

    const ConnectedWithOwnAndDispatch = connect<
      void,
      DispatchProps,
      OwnProps,
      MergedProps
    >(
      undefined,
      mapDispatchToProps,
      (stateProps: undefined, dispatchProps: DispatchProps) => ({
        merged: 'merged',
      }),
    )(MergedPropsComponent)

    const ConnectedWithOwn = connect<void, void, OwnProps, MergedProps>(
      undefined,
      undefined,
      () => ({
        merged: 'merged',
      }),
    )(MergedPropsComponent)

    const ConnectedWithInferredDispatch = connect(
      mapStateToProps,
      undefined,
      (stateProps, dispatchProps, ownProps) => {
        expectTypeOf(dispatchProps).toEqualTypeOf<DispatchProp<AnyAction>>()
      },
    )(MergedPropsComponent)
  })

  test('issue #16652: expose dispatch with props', () => {
    // https://github.com/DefinitelyTyped/DefinitelyTyped/pull/16652

    interface PassedProps {
      commentIds: string[]
    }

    interface GeneratedStateProps {
      comments: Array<{ id: string } | undefined>
    }

    class CommentList extends React.Component<
      PassedProps & GeneratedStateProps & DispatchProp
    > {}

    const mapStateToProps = (
      state: any,
      ownProps: PassedProps,
    ): GeneratedStateProps => {
      return {
        comments: ownProps.commentIds.map((id) => ({ id })),
      }
    }

    const ConnectedCommentList = connect<GeneratedStateProps, {}, PassedProps>(
      mapStateToProps,
    )(CommentList)

    ;<ConnectedCommentList commentIds={['a', 'b', 'c']} />
  })

  test('issue #15463', () => {
    interface SpinnerProps {
      showGlobalSpinner: boolean
    }

    class SpinnerClass extends React.Component<SpinnerProps & DispatchProp> {
      render() {
        return <div />
      }
    }

    const Spinner = connect((state: any) => {
      return { showGlobalSpinner: true }
    })(SpinnerClass)

    ;<Spinner />
  })

  test('remove injected and pass on rest', () => {
    interface TProps {
      showGlobalSpinner: boolean
      foo: string
    }
    class SpinnerClass extends React.Component<TProps & DispatchProp> {
      render() {
        return <div />
      }
    }

    const Spinner = connect((state: any) => {
      return { showGlobalSpinner: true }
    })(SpinnerClass)

    ;<Spinner foo="bar" />
  })

  test('controlled component without DispatchProp', () => {
    interface MyState {
      count: number
    }

    interface MyProps {
      label: string
      // `dispatch` is optional, but setting it to anything
      // other than Dispatch<T> will cause an error
      //
      // dispatch: Dispatch<any>; // OK
      // dispatch: number; // ERROR
    }

    function mapStateToProps(state: MyState) {
      return {
        label: `The count is ${state.count}`,
      }
    }

    class MyComponent extends React.Component<MyProps> {
      render() {
        return <span>{this.props.label}</span>
      }
    }

    const MyFuncComponent = (props: MyProps) => <span>{props.label}</span>

    const MyControlledComponent = connect(mapStateToProps)(MyComponent)
    const MyControlledFuncComponent = connect(mapStateToProps)(MyFuncComponent)
  })

  test('dispatch to props as object', () => {
    const onClick: ActionCreator<{}> = () => ({})
    const mapStateToProps = (state: any) => {
      return {
        title: state.app.title as string,
      }
    }
    const dispatchToProps = {
      onClick,
    }

    type Props = { title: string } & typeof dispatchToProps
    const HeaderComponent: React.FunctionComponent<Props> = (props) => {
      return <h1>{props.title}</h1>
    }

    const Header = connect(mapStateToProps, dispatchToProps)(HeaderComponent)
    ;<Header />
  })

  test('inferred functional component with explicit own props', () => {
    interface Props {
      title: string
      extraText: string
      onClick: () => void
    }

    const Header = connect(
      (
        { app: { title } }: { app: { title: string } },
        { extraText }: { extraText: string },
      ) => ({
        title,
        extraText,
      }),
      (dispatch) => ({
        onClick: () => dispatch({ type: 'test' }),
      }),
    )(({ title, extraText, onClick }: Props) => {
      return (
        <h1 onClick={onClick}>
          {title} {extraText}
        </h1>
      )
    })
    ;<Header extraText="text" />
  })

  test('inferred functional component with implicit own props', () => {
    interface Props {
      title: string
      extraText: string
      onClick: () => void
    }

    const Header = connect(
      ({ app: { title } }: { app: { title: string } }) => ({
        title,
      }),
      (dispatch) => ({
        onClick: () => dispatch({ type: 'test' }),
      }),
    )(({ title, extraText, onClick }: Props) => {
      return (
        <h1 onClick={onClick}>
          {title} {extraText}
        </h1>
      )
    })
    ;<Header extraText="text" />
  })

  test('wrapped component', () => {
    interface InnerProps {
      name: string
    }
    const Inner: React.FunctionComponent<InnerProps> = (props) => {
      return <h1>{props.name}</h1>
    }

    const mapStateToProps = (state: any) => {
      return {
        name: 'Connected',
      }
    }
    const Connected = connect(mapStateToProps)(Inner)

    // `Inner` and `Connected.WrappedComponent` require explicit `name` prop
    const TestInner = (props: any) => <Inner name="Inner" />
    const TestWrapped = (props: any) => (
      <Connected.WrappedComponent name="Wrapped" />
    )
    // `Connected` does not require explicit `name` prop
    const TestConnected = (props: any) => <Connected />
  })

  test('without own props decorated inference', () => {
    interface ForwardedProps {
      forwarded: string
    }

    interface OwnProps {
      own: string
    }

    interface StateProps {
      state: string
    }

    class WithoutOwnPropsComponentClass extends React.Component<
      ForwardedProps & StateProps & DispatchProp<any>
    > {
      render() {
        return <div />
      }
    }

    const WithoutOwnPropsComponentStateless: React.FunctionComponent<
      ForwardedProps & StateProps & DispatchProp<any>
    > = () => <div />

    function mapStateToProps4(state: any, ownProps: OwnProps): StateProps {
      return { state: 'string' }
    }

    // these decorations should compile, it is perfectly acceptable to receive props and ignore them
    const ConnectedWithOwnPropsClass = connect(mapStateToProps4)(
      WithoutOwnPropsComponentClass,
    )
    const ConnectedWithOwnPropsStateless = connect(mapStateToProps4)(
      WithoutOwnPropsComponentStateless,
    )
    const ConnectedWithTypeHintClass = connect<StateProps, void, OwnProps>(
      mapStateToProps4,
    )(WithoutOwnPropsComponentClass)
    const ConnectedWithTypeHintStateless = connect<StateProps, void, OwnProps>(
      mapStateToProps4,
    )(WithoutOwnPropsComponentStateless)

    // This should compile
    React.createElement(ConnectedWithOwnPropsClass, {
      own: 'string',
      forwarded: 'string',
    })
    React.createElement(ConnectedWithOwnPropsClass, {
      own: 'string',
      forwarded: 'string',
    })

    // This should not compile, it is missing ForwardedProps
    // @ts-expect-error
    React.createElement(ConnectedWithOwnPropsClass, { own: 'string' })
    // @ts-expect-error
    React.createElement(ConnectedWithOwnPropsStateless, { own: 'string' })

    // This should compile
    React.createElement(ConnectedWithOwnPropsClass, {
      own: 'string',
      forwarded: 'string',
    })
    React.createElement(ConnectedWithOwnPropsStateless, {
      own: 'string',
      forwarded: 'string',
    })

    // This should not compile, it is missing ForwardedProps
    // @ts-expect-error
    React.createElement(ConnectedWithTypeHintClass, { own: 'string' })
    // @ts-expect-error
    React.createElement(ConnectedWithTypeHintStateless, { own: 'string' })

    interface AllProps {
      own: string
      state: string
    }

    class AllPropsComponent extends React.Component<
      AllProps & DispatchProp<any>
    > {
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
      AllPropsComponent,
    )
    ;<ConnectedWithPickedOwnProps own="blah" />
  })

  test('provider accepts store with custom action', () => {
    // https://github.com/DefinitelyTyped/DefinitelyTyped/issues/25321#issuecomment-387659500

    const reducer: Reducer<
      { foo: number } | undefined,
      { type: 'foo'; payload: number }
    > = (state) => state

    const store = createStore(reducer)

    const Whatever = () => (
      <Provider store={store}>
        <div>Whatever</div>
      </Provider>
    )
  })

  test('optional props merged correctly', () => {
    interface OptionalDecorationProps {
      foo: string
      bar: number
      optionalProp?: boolean | undefined
      dependsOnDispatch?: (() => void) | undefined
    }

    class Component extends React.Component<OptionalDecorationProps> {
      render() {
        return <div />
      }
    }

    interface MapStateProps {
      foo: string
      bar: number
      optionalProp: boolean
    }

    interface MapDispatchProps {
      dependsOnDispatch: () => void
    }

    function mapStateToProps(state: any): MapStateProps {
      return {
        foo: 'foo',
        bar: 42,
        optionalProp: true,
      }
    }

    function mapDispatchToProps(dispatch: any): MapDispatchProps {
      return {
        dependsOnDispatch: () => {},
      }
    }

    const Connected = connect(mapStateToProps, mapDispatchToProps)(Component)
  })

  test('more general decoration props', () => {
    // connect() should support decoration props that are more permissive
    // than the injected props, as long as the injected props can satisfy
    // the decoration props.
    interface MoreGeneralDecorationProps {
      foo: string | number
      bar: number | 'foo'
      optionalProp?: boolean | object | undefined
      dependsOnDispatch?: (() => void) | undefined
    }

    class Component extends React.Component<MoreGeneralDecorationProps> {
      render() {
        return <div />
      }
    }

    interface MapStateProps {
      foo: string
      bar: number
      optionalProp: boolean
    }

    interface MapDispatchProps {
      dependsOnDispatch: () => void
    }

    function mapStateToProps(state: any): MapStateProps {
      return {
        foo: 'foo',
        bar: 42,
        optionalProp: true,
      }
    }

    function mapDispatchToProps(dispatch: any): MapDispatchProps {
      return {
        dependsOnDispatch: () => {},
      }
    }

    connect(mapStateToProps, mapDispatchToProps)(Component)
  })

  test('fails more specific injected props', () => {
    interface MoreSpecificDecorationProps {
      foo: string
      bar: number
      dependsOnDispatch: () => void
    }

    class Component extends React.Component<MoreSpecificDecorationProps> {
      render() {
        return <div />
      }
    }

    interface MapStateProps {
      foo: string | number
      bar: number | 'foo'
      dependsOnDispatch?: (() => void) | undefined
    }

    interface MapDispatchProps {
      dependsOnDispatch?: (() => void) | undefined
    }

    function mapStateToProps(state: any): MapStateProps {
      return {
        foo: 'foo',
        bar: 42,
      }
    }

    function mapDispatchToProps(dispatch: any): MapDispatchProps {
      return {
        dependsOnDispatch: () => {},
      }
    }

    // Since it is possible the injected props could fail to satisfy the decoration props,
    // the following line should fail to compile.
    // @ts-expect-error
    connect(mapStateToProps, mapDispatchToProps)(Component)

    // Confirm that this also fails with functional components
    const FunctionalComponent = (props: MoreSpecificDecorationProps) => null
    // @ts-expect-error
    connect(mapStateToProps, mapDispatchToProps)(Component)
  })

  test('library managed attributes', () => {
    interface OwnProps {
      bar: number
      fn: () => void
    }

    interface ExternalOwnProps {
      bar?: number | undefined
      fn: () => void
    }

    interface MapStateProps {
      foo: string
    }

    class Component extends React.Component<OwnProps & MapStateProps> {
      static defaultProps = {
        bar: 0,
      }

      render() {
        return <div />
      }
    }

    function mapStateToProps(state: any): MapStateProps {
      return {
        foo: 'foo',
      }
    }

    const ConnectedComponent = connect(mapStateToProps)(Component)
    ;<ConnectedComponent fn={() => {}} />

    const ConnectedComponent2 = connect<MapStateProps, void, ExternalOwnProps>(
      mapStateToProps,
    )(Component)
    ;<ConnectedComponent2 fn={() => {}} />
  })

  test('PropTypes', () => {
    interface OwnProps {
      bar: number
      fn: () => void
    }

    interface MapStateProps {
      foo: string
    }

    class Component extends React.Component<OwnProps & MapStateProps> {
      static propTypes = {
        foo: PropTypes.string.isRequired,
        bar: PropTypes.number.isRequired,
        fn: PropTypes.func.isRequired,
      }

      render() {
        return <div />
      }
    }

    function mapStateToProps(state: any): MapStateProps {
      return {
        foo: 'foo',
      }
    }

    const ConnectedComponent = connect(mapStateToProps)(Component)
    ;<ConnectedComponent fn={() => {}} bar={0} />

    const ConnectedComponent2 = connect<MapStateProps, void, OwnProps>(
      mapStateToProps,
    )(Component)
    ;<ConnectedComponent2 fn={() => {}} bar={0} />
  })

  test('non react statics', () => {
    interface OwnProps {
      bar: number
    }

    interface MapStateProps {
      foo: string
    }

    class Component extends React.Component<OwnProps & MapStateProps> {
      static defaultProps = {
        bar: 0,
      }

      static meaningOfLife = 42

      render() {
        return <div />
      }
    }

    function mapStateToProps(state: any): MapStateProps {
      return {
        foo: 'foo',
      }
    }

    Component.meaningOfLife
    Component.defaultProps.bar

    const ConnectedComponent = connect(mapStateToProps)(Component)

    // This is a non-React static and should be hoisted as-is.
    ConnectedComponent.meaningOfLife

    // This is a React static, so it's not hoisted.
    // However, ConnectedComponent is still a ComponentClass, which specifies `defaultProps`
    // as an optional static member. We can force an error (and assert that `defaultProps`
    // wasn't hoisted) by reaching into the `defaultProps` object without a null check.
    // @ts-expect-error
    ConnectedComponent.defaultProps.bar
  })

  test('Provider Context', () => {
    const store: Store = createStore((state = {}) => state)
    const nullContext = React.createContext(null)

    // To ensure type safety when consuming the context in an app, a null-context does not suffice.
    // @ts-expect-error
    ;<Provider store={store} context={nullContext} />
    ;<Provider store={store} context={CustomContext}>
      <div />
    </Provider>

    // react-redux exports a default context used internally if none is supplied, used as shown below.
    class ComponentWithDefaultContext extends React.Component {
      static contextType = ReactReduxContext
    }

    // eslint-disable-next-line no-extra-semi
    ;<Provider store={store}>
      <ComponentWithDefaultContext />
    </Provider>

    // Null is not a valid value for the context.
    // @ts-expect-error
    ;<Provider store={store} context={null} />
  })

  test('connected props', () => {
    interface OwnProps {
      own: string
    }
    const Component: React.FC<OwnProps & ReduxProps> = ({ own, dispatch }) =>
      null

    const connector = connect()
    type ReduxProps = ConnectedProps<typeof connector>

    const ConnectedComponent = connect(Component)
  })

  test('connected props with state', () => {
    interface OwnProps {
      own: string
    }
    const Component: React.FC<OwnProps & ReduxProps> = ({
      own,
      injected,
      dispatch,
    }) => {
      injected.slice()
      return null
    }

    const connector = connect((state: any) => ({ injected: '' }))
    type ReduxProps = ConnectedProps<typeof connector>

    const ConnectedComponent = connect(Component)
  })

  test('connected props with state and actions', () => {
    interface OwnProps {
      own: string
    }
    const actionCreator = () => ({ type: 'action' })

    const Component: React.FC<OwnProps & ReduxProps> = ({
      own,
      injected,
      actionCreator,
    }) => {
      actionCreator()
      return null
    }

    const ComponentWithDispatch: React.FC<OwnProps & ReduxProps> = ({
      own,
      // @ts-expect-error
      dispatch,
    }) => null

    const connector = connect((state: any) => ({ injected: '' }), {
      actionCreator,
    })
    type ReduxProps = ConnectedProps<typeof connector>

    const ConnectedComponent = connect(Component)
  })

  test('connect return type', () => {
    const TestComponent: React.FC = () => null

    const Test = connect()(TestComponent)

    const myHoc1 = <P,>(C: React.ComponentClass<P>): React.ComponentType<P> => C
    // @ts-expect-error
    myHoc1(Test)

    const myHoc2 = <P,>(C: React.FC<P>): React.ComponentType<P> => C
    // TODO Figure out the error here
    // myHoc2(Test)
  })

  test('Ref', () => {
    const FunctionalComponent: React.FC = () => null
    const ForwardedFunctionalComponent = React.forwardRef<string>(() => null)
    class ClassComponent extends React.Component {}

    const ConnectedFunctionalComponent = connect()(FunctionalComponent)
    const ConnectedForwardedFunctionalComponent = connect()(
      ForwardedFunctionalComponent,
    )
    const ConnectedClassComponent = connect()(ClassComponent)

    // Should not be able to pass any type of ref to a FunctionalComponent
    // ref is not a valid property
    ;<ConnectedFunctionalComponent
      // @ts-expect-error
      ref={React.createRef<any>()}
    />
    ;<ConnectedFunctionalComponent
      // @ts-expect-error
      ref={(ref: any) => {}}
    />

    // @ts-expect-error
    ;<ConnectedFunctionalComponent ref={''} />

    // Should be able to pass modern refs to a ForwardRefExoticComponent
    const modernRef: React.Ref<string> | undefined = undefined
    ;<ConnectedForwardedFunctionalComponent ref={modernRef} />
    // Should not be able to use legacy string refs
    ;<ConnectedForwardedFunctionalComponent
      // @ts-expect-error
      ref={''}
    />
    // ref type should agree with type of the forwarded ref
    ;<ConnectedForwardedFunctionalComponent
      // @ts-expect-error
      ref={React.createRef<number>()}
    />
    ;<ConnectedForwardedFunctionalComponent
      // @ts-expect-error
      ref={(ref: number) => {}}
    />

    // Should be able to use all refs including legacy string
    const classLegacyRef: React.LegacyRef<ClassComponent> | undefined =
      undefined
    ;<ConnectedClassComponent ref={classLegacyRef} />
    ;<ConnectedClassComponent ref={React.createRef<ClassComponent>()} />
    ;<ConnectedClassComponent ref={(ref: ClassComponent) => {}} />
    ;<ConnectedClassComponent ref={''} />
    ;<ConnectedClassComponent
      // @ts-expect-error ref type should be the typeof the wrapped component
      ref={React.createRef<string>()}
    />
    ;<ConnectedClassComponent
      // @ts-expect-error
      ref={(ref: string) => {}}
    />
  })

  test('connect default state', () => {
    connect((state) => {
      const s = state

      expectTypeOf(s).toBeUnknown()

      return state
    })

    const connectWithDefaultState: Connect<{ value: number }> = connect
    connectWithDefaultState((state) => {
      expectTypeOf(state).toEqualTypeOf<{ value: number }>()

      return state
    })
  })

  test('preserve discriminated unions', () => {
    type OwnPropsT = {
      color: string
    } & (
      | {
          type: 'plain'
        }
      | {
          type: 'localized'
          params: Record<string, string> | undefined
        }
    )

    class MyText extends React.Component<OwnPropsT> {}

    const ConnectedMyText = connect()(MyText)
    const someParams = { key: 'value', foo: 'bar' }

    ;<ConnectedMyText type="plain" color="red" />
    // @ts-expect-error
    ;<ConnectedMyText type="plain" color="red" params={someParams} />
    // @ts-expect-error
    ;<ConnectedMyText type="localized" color="red" />
    ;<ConnectedMyText type="localized" color="red" params={someParams} />
  })

  test('issue #1187 connect accepts prop named context', () => {
    // https://github.com/reduxjs/react-redux/issues/1187

    const mapStateToProps = (state: { name: string }) => {
      return {
        name: state.name,
      }
    }

    const connector = connect(mapStateToProps)

    type PropsFromRedux = ConnectedProps<typeof connector>

    interface IButtonOwnProps {
      label: string
      context: 'LIST' | 'CARD'
    }
    type IButtonProps = IButtonOwnProps & PropsFromRedux

    function Button(props: IButtonProps) {
      const { name, label, context } = props
      return (
        <button>
          {name} - {label} - {context}
        </button>
      )
    }

    const ConnectedButton = connector(Button)

    // Since `IButtonOwnProps` includes a field named `context`, the final
    // connected component _should_ use exactly that type, and omit the
    // built-in `context: ReactReduxContext` field definition.
    // If the types are broken, then `context` will have an error like:
    // Type '"LIST"' is not assignable to type '("LIST" | "CARD") & (Context<ReactReduxContextValue<any, AnyAction>> | undefined)'
    return <ConnectedButton label="a" context="LIST" />
  })
})
