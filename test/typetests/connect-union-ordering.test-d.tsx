import * as React from 'react'
import { connect } from 'react-redux'

// Type tests for https://github.com/reduxjs/react-redux/issues/2244
//
// `connect`'s `mapStateToProps` / `mapDispatchToProps` parameters used to be
// typed as unions (e.g. `MapStateToPropsFactory | MapStateToProps | null |
// undefined`). A factory (`() => (state) => props`) is structurally assignable
// to its plain counterpart, so with both forms in a single union the compiler
// has to choose a "first" inference candidate for `TStateProps` /
// `TDispatchProps` - and the old and new (native, TS 7 / `tsgo`) compilers order
// union members differently, so the props were inferred incorrectly on one of
// them (collapsing the connected component's props to `{}`).
//
// The overloads are now split so the factory form is listed first as an
// explicit overload, making resolution deterministic and compiler-independent.
// These cases mirror the repro from https://github.com/lukeapage/ts-repro-1 and
// must hold regardless of the order of the union members.

type Props = Readonly<{
  stringProp: string
  defaultBooleanProp: boolean
}>

class ExampleComponent extends React.PureComponent<Props> {
  static defaultProps = {
    defaultBooleanProp: false,
  }

  render() {
    const { defaultBooleanProp, stringProp } = this.props
    return defaultBooleanProp && stringProp
  }
}

function testPlainMapStateToProps() {
  interface StateProps {
    stringProp: string
  }

  interface OwnProps {
    defaultBooleanProp?: boolean
  }

  const mapStateToProps = (state: any, props: OwnProps): StateProps => ({
    stringProp: 'a',
  })

  const Connected = connect(mapStateToProps)(ExampleComponent)

  // `stringProp` comes from the store, so it must NOT be a required own prop.
  const ok = <Connected />
  const okWithOwn = <Connected defaultBooleanProp />

  // a factory whose inner selector returns the wrong shape must still be
  // detected at the `connect` call (no inner return-type annotation)
  const badFactory = () => (state: any, props: OwnProps) => ({
    stringProp: 1,
  })

  // @ts-expect-error `stringProp` is a `number`, but the component wants a `string`
  const ConnectedBad = connect(badFactory)(ExampleComponent)
}

function testFactoryMapStateToProps() {
  interface StateProps {
    stringProp: string
  }

  interface OwnProps {
    defaultBooleanProp?: boolean
  }

  const mapStateToPropsFactory =
    () =>
    // @ts-expect-error the inner selector's annotated return type is violated
    (state: any, props: OwnProps): StateProps => ({ stringProp: 1 })

  // the factory is recognized as a factory: `TStateProps` is `StateProps`, so
  // `stringProp` is provided by the store and is not a required own prop
  const Connected = connect(mapStateToPropsFactory)(ExampleComponent)
  const ok = <Connected />
}

function testFactoryMapStateToPropsExtraProp() {
  interface StateProps {
    stringProp: string
  }

  interface OwnProps {
    defaultBooleanProp?: boolean
  }

  const mapStateToPropsFactory =
    () =>
    (state: any, props: OwnProps): StateProps => ({
      // @ts-expect-error `fakeProp` is not part of `StateProps`
      fakeProp: 1,
      stringProp: 'a',
    })

  const Connected = connect(mapStateToPropsFactory)(ExampleComponent)
  const ok = <Connected />
}

interface DispatchProps {
  onClick: () => void
}

interface DispatchOwnProps {
  id: string
}

class ClickableComponent extends React.PureComponent<
  DispatchProps & DispatchOwnProps
> {
  render() {
    return null
  }
}

function testMapDispatchToPropsForms() {
  // function form
  const mapDispatchToProps = (dispatch: any): DispatchProps => ({
    onClick: () => dispatch({ type: 'CLICK' }),
  })
  const ConnectedFn = connect(null, mapDispatchToProps)(ClickableComponent)
  const okFn = <ConnectedFn id="a" />
  // @ts-expect-error `id` is a required own prop; `onClick` is injected
  const badFn = <ConnectedFn />

  // factory form - recognized as a factory, so `onClick` is injected
  const mapDispatchToPropsFactory =
    () =>
    (dispatch: any): DispatchProps => ({
      onClick: () => dispatch({ type: 'CLICK' }),
    })
  const ConnectedFactory = connect(
    null,
    mapDispatchToPropsFactory,
  )(ClickableComponent)
  const okFactory = <ConnectedFactory id="a" />
  // @ts-expect-error `id` is a required own prop; `onClick` is injected
  const badFactory = <ConnectedFactory />

  // object form - thunk action creators are resolved and injected
  const mapDispatchObject = {
    onClick: () => ({ type: 'CLICK' as const }),
  }
  const ConnectedObj = connect(null, mapDispatchObject)(ClickableComponent)
  const okObj = <ConnectedObj id="a" />
}

function testFactoryMapStateWithFactoryMapDispatch() {
  interface StateProps {
    stringProp: string
  }

  interface OwnProps {
    defaultBooleanProp?: boolean
  }

  class Combined extends React.PureComponent<
    StateProps & DispatchProps & OwnProps
  > {
    render() {
      return null
    }
  }

  const mapStateToPropsFactory =
    () =>
    (state: any, props: OwnProps): StateProps => ({ stringProp: 'a' })

  const mapDispatchToPropsFactory =
    () =>
    (dispatch: any): DispatchProps => ({
      onClick: () => dispatch({ type: 'CLICK' }),
    })

  // covers the split "mapState (factory) + mapDispatch (factory)" overload:
  // both `stringProp` and `onClick` are injected, so neither is a required own prop
  const Connected = connect(
    mapStateToPropsFactory,
    mapDispatchToPropsFactory,
  )(Combined)
  const ok = <Connected />

  // @ts-expect-error `unknownProp` is not an own prop of the connected component
  const bad = <Connected unknownProp />
}
