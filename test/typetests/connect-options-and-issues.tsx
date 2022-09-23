/* eslint-disable @typescript-eslint/no-unused-vars, react/prop-types */
import * as PropTypes from 'prop-types'
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
  Connect,
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
import { ConnectPropsMaybeWithoutContext } from '../../src/types'

import { expectType } from '../typeTestHelpers'

// Test cases written in a way to isolate types and variables and verify the
// output of `connect` to make sure the signature is what is expected

const CustomContext = React.createContext(
  null
) as unknown as typeof ReactReduxContext

// https://github.com/DefinitelyTyped/DefinitelyTyped/issues/16021
function TestMergedPropsInference() {
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
    })
  )(MergedPropsComponent)

  const ConnectedWithOwn = connect<void, void, OwnProps, MergedProps>(
    undefined,
    undefined,
    () => ({
      merged: 'merged',
    })
  )(MergedPropsComponent)

  const ConnectedWithInferredDispatch = connect(
    mapStateToProps,
    undefined,
    (stateProps, dispatchProps, ownProps) => {
      expectType<DispatchProp<AnyAction>>(dispatchProps)
    }
  )(MergedPropsComponent)
}

function Issue16652() {
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
    ownProps: PassedProps
  ): GeneratedStateProps => {
    return {
      comments: ownProps.commentIds.map((id) => ({ id })),
    }
  }

  const ConnectedCommentList = connect<GeneratedStateProps, {}, PassedProps>(
    mapStateToProps
  )(CommentList)

  ;<ConnectedCommentList commentIds={['a', 'b', 'c']} />
}

function Issue15463() {
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
}

function RemoveInjectedAndPassOnRest() {
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
}

function TestControlledComponentWithoutDispatchProp() {
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
}

function TestDispatchToPropsAsObject() {
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
}

function TestInferredFunctionalComponentWithExplicitOwnProps() {
  interface Props {
    title: string
    extraText: string
    onClick: () => void
  }

  const Header = connect(
    (
      { app: { title } }: { app: { title: string } },
      { extraText }: { extraText: string }
    ) => ({
      title,
      extraText,
    }),
    (dispatch) => ({
      onClick: () => dispatch({ type: 'test' }),
    })
  )(({ title, extraText, onClick }: Props) => {
    return (
      <h1 onClick={onClick}>
        {title} {extraText}
      </h1>
    )
  })
  ;<Header extraText="text" />
}

function TestInferredFunctionalComponentWithImplicitOwnProps() {
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
    })
  )(({ title, extraText, onClick }: Props) => {
    return (
      <h1 onClick={onClick}>
        {title} {extraText}
      </h1>
    )
  })
  ;<Header extraText="text" />
}

function TestWrappedComponent() {
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
}

function TestWithoutTOwnPropsDecoratedInference() {
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
    WithoutOwnPropsComponentClass
  )
  const ConnectedWithOwnPropsStateless = connect(mapStateToProps4)(
    WithoutOwnPropsComponentStateless
  )
  const ConnectedWithTypeHintClass = connect<StateProps, void, OwnProps>(
    mapStateToProps4
  )(WithoutOwnPropsComponentClass)
  const ConnectedWithTypeHintStateless = connect<StateProps, void, OwnProps>(
    mapStateToProps4
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
    AllPropsComponent
  )
  ;<ConnectedWithPickedOwnProps own="blah" />
}

// https://github.com/DefinitelyTyped/DefinitelyTyped/issues/25321#issuecomment-387659500
function ProviderAcceptsStoreWithCustomAction() {
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
}

function TestOptionalPropsMergedCorrectly() {
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
}

function TestMoreGeneralDecorationProps() {
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
}

function TestFailsMoreSpecificInjectedProps() {
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
}

function TestLibraryManagedAttributes() {
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
    mapStateToProps
  )(Component)
  ;<ConnectedComponent2 fn={() => {}} />
}

function TestPropTypes() {
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
    mapStateToProps
  )(Component)
  ;<ConnectedComponent2 fn={() => {}} bar={0} />
}

function TestNonReactStatics() {
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
}

function TestProviderContext() {
  const store: Store = createStore((state = {}) => state)
  const nullContext = React.createContext(null)

  // To ensure type safety when consuming the context in an app, a null-context does not suffice.
  // @ts-expect-error
  ;<Provider store={store} context={nullContext}></Provider>
  ;<Provider store={store} context={CustomContext}>
    <div />
  </Provider>

  // react-redux exports a default context used internally if none is supplied, used as shown below.
  class ComponentWithDefaultContext extends React.Component {
    static contextType = ReactReduxContext
  }

  ;<Provider store={store}>
    <ComponentWithDefaultContext />
  </Provider>

  // Null is not a valid value for the context.
  // @ts-expect-error
  ;<Provider store={store} context={null} />
}

function testConnectedProps() {
  interface OwnProps {
    own: string
  }
  const Component: React.FC<OwnProps & ReduxProps> = ({ own, dispatch }) => null

  const connector = connect()
  type ReduxProps = ConnectedProps<typeof connector>

  const ConnectedComponent = connect(Component)
}

function testConnectedPropsWithState() {
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
}

function testConnectedPropsWithStateAndActions() {
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
}

function testConnectReturnType() {
  const TestComponent: React.FC = () => null

  const Test = connect()(TestComponent)

  const myHoc1 = <P,>(C: React.ComponentClass<P>): React.ComponentType<P> => C
  // @ts-expect-error
  myHoc1(Test)

  const myHoc2 = <P,>(C: React.FC<P>): React.ComponentType<P> => C
  // TODO Figure out the error here
  // myHoc2(Test)
}

function testRef() {
  const FunctionalComponent: React.FC = () => null
  const ForwardedFunctionalComponent = React.forwardRef<string>(() => null)
  class ClassComponent extends React.Component {}

  const ConnectedFunctionalComponent = connect()(FunctionalComponent)
  const ConnectedForwardedFunctionalComponent = connect()(
    ForwardedFunctionalComponent
  )
  const ConnectedClassComponent = connect()(ClassComponent)

  // Should not be able to pass any type of ref to a FunctionalComponent
  // ref is not a valid property
  ;<ConnectedFunctionalComponent
    // @ts-expect-error
    ref={React.createRef<any>()}
  ></ConnectedFunctionalComponent>
  ;<ConnectedFunctionalComponent
    // @ts-expect-error
    ref={(ref: any) => {}}
  ></ConnectedFunctionalComponent>

  // @ts-expect-error
  ;<ConnectedFunctionalComponent ref={''}></ConnectedFunctionalComponent>

  // Should be able to pass modern refs to a ForwardRefExoticComponent
  const modernRef: React.Ref<string> | undefined = undefined
  ;<ConnectedForwardedFunctionalComponent
    ref={modernRef}
  ></ConnectedForwardedFunctionalComponent>
  // Should not be able to use legacy string refs
  ;<ConnectedForwardedFunctionalComponent
    // @ts-expect-error
    ref={''}
  ></ConnectedForwardedFunctionalComponent>
  // ref type should agree with type of the forwarded ref
  ;<ConnectedForwardedFunctionalComponent
    // @ts-expect-error
    ref={React.createRef<number>()}
  ></ConnectedForwardedFunctionalComponent>
  ;<ConnectedForwardedFunctionalComponent
    // @ts-expect-error
    ref={(ref: number) => {}}
  ></ConnectedForwardedFunctionalComponent>

  // Should be able to use all refs including legacy string
  const classLegacyRef: React.LegacyRef<ClassComponent> | undefined = undefined
  ;<ConnectedClassComponent ref={classLegacyRef}></ConnectedClassComponent>
  ;<ConnectedClassComponent
    ref={React.createRef<ClassComponent>()}
  ></ConnectedClassComponent>
  ;<ConnectedClassComponent
    ref={(ref: ClassComponent) => {}}
  ></ConnectedClassComponent>
  ;<ConnectedClassComponent ref={''}></ConnectedClassComponent>
  // ref type should be the typeof the wrapped component
  ;<ConnectedClassComponent
    // @ts-expect-error
    ref={React.createRef<string>()}
  ></ConnectedClassComponent>
  // @ts-expect-error
  ;<ConnectedClassComponent ref={(ref: string) => {}}></ConnectedClassComponent>
}

function testConnectDefaultState() {
  connect((state) => {
    const s = state
    expectType<unknown>(s)
    return state
  })

  const connectWithDefaultState: Connect<{ value: number }> = connect
  connectWithDefaultState((state) => {
    const s = state
    expectType<{ value: number }>(state)
    return state
  })
}

function testPreserveDiscriminatedUnions() {
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
}

function issue1187ConnectAcceptsPropNamedContext() {
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
}
