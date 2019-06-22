---
id: version-5.x-annotating-connected-components-with-flow
title: Annotating Connected Components with Flow
hide_title: true
sidebar_label: Annotating Connected Components with Flow
original_id: annotating-connected-components-with-flow
---

# Annotating Connected Components with Flow

After Flow 0.85, Flow starts [Asking for Required Annotations](https://medium.com/flow-type/asking-for-required-annotations-64d4f9c1edf8) on implicit calls of higher order components within each file import — export cycle. This facilitates Flow to merge type information from file dependencies _before_ it walks the type structure and conducts type inference.

This helps Flow gain significantly better coverage on higher order components. But it also asks that we explicitly annotate the connected components at file exports. Exporting implicit calls of `connect` will raise error:

    Missing type annotation for OP. OP is a type parameter declared in function type [1] and was implicitly
    instantiated at call of connect [2].

In general, to make Flow happy with connect after 0.85 is a two-phase fix. First, you need to explicitly annotate each connected components at file exports. This shall clear all the “implicitly instantiated” errors. Then, if your codebase contains mismatched types between component definitions and usages, Flow will report those errors after you fix the implicit instantiation errors.

## Fixing the “implicitly instantiated” errors at calls of `connect`

> **Note:** We need `React.AbstractComponent` from Flow v0.89+

### Annotating at function return

The easiest way to annotate connected components is to annotate at function call return. To do this, we need to know to types of props in our components:

- `OwnProps`: likely contain or equal to what you need as the second parameter to `mapStateToProps`. If there are props that are not used by `mapStateToProps`, i.e., the props that "pass through", include them here in `OwnProps` as well
- `Props`: `OwnProps` plus the props passed in by `mapStateToProps` and `mapDispatchToProps`

> **Note:** Inexact objects don't spread nor `$Diff` very well. It is strongly recommended that you use exact objects for connected components all the time.

```js
type OwnProps = {|
  passthrough: string,
  forMapStateToProps: string
|}

type Props = {|
  ...OwnProps,
  fromMapStateToProps: string,
  dispatch1: () => void
|}
```

With `OwnProps` and `Props` in figured out, we are now ready to annotate the connected components.

In _component definition_, annotate the props with `Props`. The component will have access to all the injected props from `connect`:

```jsx
import * as React from 'react'

const MyComponent = (props: Props) => (
  <div onClick={props.dispatch1}>
    {props.passthrough}
    {props.fromMapStateToProps}
  </div>
)
```

When we export, this is also when we normally call `connect`, annotate the exported component with _just_ `OwnProps`:

```jsx
import * as React from 'react'

// const MyComponent = ...

export default (connect(
  mapStateToProps,
  mapDispatchToProps
)(MyComponent): React.AbstractComponent<OwnProps>)
```

### Annotating by providing explicit type parameters

We may also annotate connected components by providing explicit type parameters at call of `connect` with the help of the [newest Flow Typed library definition for React Redux](https://github.com/flow-typed/flow-typed/blob/master/definitions/npm/react-redux_v5.x.x/flow_v0.89.x-/react-redux_v5.x.x.js). Note that this will also require Flow v0.89+.

The Flow Typed library definition declares `connect` as follows:

```js
declare export function connect<-P, -OP, -SP, -DP, -S, -D>(
  mapStateToProps?: null | void,
  mapDispatchToProps?: null | void,
  mergeProps?: null | void,
  options?: ?Options<S, OP, {||}, MergeOP<OP, D>>
): Connector<P, OP, MergeOP<OP, D>>
```

The libdef also contains a [glossary of the abbreviations](https://github.com/flow-typed/flow-typed/blob/master/definitions/npm/react-redux_v5.x.x/flow_v0.89.x-/react-redux_v5.x.x.js#L14) which decrypts the signature to:

```jsx
connect<Props, OwnProps, StateProps, DispatchProps, State, Dispatch>(…)
```

For the most common ways to connect components, we won't need all of the parameters. Normally, we need only `OwnProps` and `Props` at the call of `connect`, and `State` at the definition of `mapStateToProps`.

We may use `_` ([what's this?](https://github.com/facebook/flow/commit/ec70da4510d3a092fa933081c083bd0e513d0518)) as placeholder at unused type parameter positions. A common `connect` call may look like this:

```jsx
connect<Props, OwnProps, _, _, _, _>(…)
```

We include examples for three major use cases of annotating `connect` with Flow:

- Connecting stateless component with `mapStateToProps`
- Connecting components with `mapDispatchToProps` of action creators
- Connecting components with `mapStateToProps` and `mapDispatchToProps` of action creators

#### Connecting stateless component with `mapStateToProps`

```jsx
type OwnProps = {|
  passthrough: number,
  forMapStateToProps: string,
|};
type Props = {|
  ...OwnProps,
  fromStateToProps: string
|};
const Com = (props: Props) => <div>{props.passthrough} {props.fromStateToProps}</div>

type State = {a: number};
type InputProps = {
  forMapStateToProps: string
};
const mapStateToProps = (state: State, props: InputProps) => {
  return {
    fromStateToProps: 'str' + state.a
  }
};

const Connected = connect<Props, OwnProps, _, _, _, _>(mapStateToProps)(Com);
```

#### Connecting components with `mapDispatchToProps` of action creators

```jsx
type OwnProps = {|
  passthrough: number,
|};
type Props = {|
  ...OwnProps,
  dispatch1: (num: number) => void,
  dispatch2: () => void
|};
class Com extends React.Component<Props> {
  render() {
    return <div>{this.props.passthrough}</div>;
  }
}

const mapDispatchToProps = {
  dispatch1: (num: number) => {},
  dispatch2: () => {}
};
const Connected = connect<Props, OwnProps, _, _, _, _>(null, mapDispatchToProps)(Com);
e.push(Connected);
<Connected passthrough={123} />;
```

#### Connecting components with `mapStateToProps` and `mapDispatchToProps` of action creators

```jsx
type OwnProps = {|
  passthrough: number,
  forMapStateToProps: string
|};
type Props = {|
  ...OwnProps,
  dispatch1: () => void,
  dispatch2: () => void,
  fromMapStateToProps: number
|};
class Com extends React.Component<Props> {
  render() {
    return <div>{this.props.passthrough}</div>;
  }
}
type State = {a: number}
type MapStateToPropsProps = {forMapStateToProps: string}
const mapStateToProps = (state: State, props: MapStateToPropsProps) => {
  return {
    fromMapStateToProps: state.a
  }
}
const mapDispatchToProps = {
  dispatch1: () => {},
  dispatch2: () => {}
};
const Connected = connect<Props, OwnProps, _, _, _, _>(mapStateToProps, mapDispatchToProps)(Com);
```

### Annotating nested higher order components with connect

If you are at the unfortunate position where your component is wrapped with nested higher order component, it is probably more difficult to annotate by providing explicit type parameters, as doing so will probably require that you tediously take away props at each layer. It is agian easier to annotate at function return:

```jsx
type OwnProps = {|
  passthrough: number,
  forMapStateToProps: string,
|}
type Props = {|
  ...OwnProps,
  injectedA: string,
  injectedB: string,
  fromMapStateToProps: string,
  dispatch1: (number) => void,
  dispatch2: () => void,
|}

const Component = (props: Props) => { // annotate the component with all props including injected props
  /** ... */
}

const mapStateToProps = (state: State, ownProps: OwnProps) => {
  return { fromMapStateToProps: 'str' + ownProps.forMapStateToProps },
}
const mapDispatchToProps = {
  dispatch1: number => {},
  dispatch2: () => {},
}

export default (compose(
  connect(mapStateToProps, mapDispatchToProps),
  withA,
  withB,
)(Component): React.AbstractComponent<OwnProps>)  // export the connected component without injected props
```

## Benefits of this version

After fixing the implicit instantiation errors, if your code contains mismatched types between connected components, the total number of errors may go _up_. This is the result of Flow's improved coverage. If you are using console output for the Flow errors, you may not be able to see those errors until you clear other errors. These additional errors are grouped together, all tied back to React Redux's library definition, and have friendly error messages that will pin point you to the lines of code to the errors.

![](https://i.imgur.com/mt79yaC.png)

## References

**Articles**

- [Asking for Required Annotations](https://medium.com/flow-type/asking-for-required-annotations-64d4f9c1edf8)

**Upgrading guides**

- [Ville's and Jordan Brown's guide: _Adding Type Parameters to Connect_](https://gist.github.com/jbrown215/f425203ef30fdc8a28c213b90ba7a794)
- [Quick Note Fixing `connect` FlowType Annotation after 0.89](https://dev.to/wgao19/quick-note-fixing-connect-flowtype-annotation-after-089-joi)

**Talks**

- [Flow Be Happy](https://engineers.sg/video/flow-be-happy-reactjs-singapore--3419) A talk on upgrading Flow past 0.85, [slides](https://flow-be-happy.netlify.com/)

**Others**

- [Flow Typed tests for React Redux `connect`](https://github.com/flow-typed/flow-typed/blob/master/definitions/npm/react-redux_v5.x.x/flow_v0.89.x-/test_connect.js)
- [flow-typed/#2946: Discussion after 0.85](https://github.com/flow-typed/flow-typed/issues/2946)
- Add support for Flow 0.89+: [#3012](https://github.com/flow-typed/flow-typed/pull/3035), [#3035](https://github.com/flow-typed/flow-typed/pull/3035)
- [What's `_`?](https://github.com/facebook/flow/commit/ec70da4510d3a092fa933081c083bd0e513d0518)
