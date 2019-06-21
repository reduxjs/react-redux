---
id: annotating-connected-components-with-flow
title: Annotating Connected Components with Flow
hide_title: true
sidebar_label: Annotating Connected Components with Flow
---

# Annotating Connected Components with Flow

After Flow 0.85, Flow starts [Asking for Required Annotations](https://medium.com/flow-type/asking-for-required-annotations-64d4f9c1edf8) on implicit calls of higher order components within each file import — export cycle. This facilitates Flow to merge type information from file dependencies _before_ it walks the type structure and conducts type inference.

This helps Flow gain significantly better coverage on higher order components. But it also asks that we explicitly annotate the connected components at file exports. Exporting implicit calls of `connect` will raise error:

    Missing type annotation for OP. OP is a type parameter declared in function type [1] and was implicitly
    instantiated at call of connect [2].

In general, to make Flow happy with connect after 0.85 is a two-phase fix. First, you need to explicitly annotate each connected components at file exports. This shall clear all the “implicitly instantiated” errors. Then, if your codebase contains mismatched types between component definitions and usages, Flow will report those errors after you fix the implicit instantiation errors.

## Fixing the “implicitly instantiated” errors at calls of `connect`

To begin, you need:

- Flow upgraded to v0.89+
- [Newest Flow Typed library definition for React Redux](https://github.com/flow-typed/flow-typed/blob/master/definitions/npm/react-redux_v5.x.x/flow_v0.89.x-/react-redux_v5.x.x.js)

We include three major use cases for annotating `connect` with Flow:

- Connecting stateless component with `mapStateToProps`
- Connecting components with `mapDispatchToProps` of action creators
- Connecting components with `mapStateToProps` and `mapDispatchToProps` of action creators

### Connecting stateless component with `mapStateToProps`

```jsx
type OwnProps = {|
  passthrough: number,
  forMapStateToProps: string,
|};
type Props = {
  ...OwnProps,
  fromStateToProps: string
};
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

const Connected = connect<Props, OwnProps, _,_,_,_>(mapStateToProps)(Com);
```

### Connecting components with `mapDispatchToProps` of action creators

```jsx
type OwnProps = {|
  passthrough: number,
|};
type Props = {
  ...OwnProps,
  dispatch1: (num: number) => void,
  dispatch2: () => void
};
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

### Connecting components with `mapStateToProps` and `mapDispatchToProps` of action creators

```jsx
type OwnProps = {|
  passthrough: number,
  forMapStateToProps: string
|};
type Props = {
  ...OwnProps,
  dispatch1: () => void,
  dispatch2: () => void,
  fromMapStateToProps: number
};
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

## Annotating nested higher order components with connect

If you are at the unfortunate position where your component is wrapped with nested higher order component, it is probably more difficult to annotate by providing explicit type parameters, as doing so will probably require tediously deducing prop types at each layer:

```jsx
import { compose } from "redux";

type AllProps = {/** ... */};

compose(
  connect(mapState, mapDispatch),
  withA<$Diff<$Diff<$Diff<AllProps, withDProps>, withCProps>, withBProps>>,
  withB<$Diff<$Diff<AllProps, withDProps>, withCProps>>,
  withC<$Diff<AllProps, withDProps>>,
  withD<AllProps>
)(ComponentWithEverything);
```

It is probably easier if you annotate once at file export:

```jsx
type Props = {|
  passthrough: number
|}
type AllProps = {
  // spreaded props should be exact
  ...Props,
  injectedPropA: string,
  injectedPropB: boolean,
  injectedPropC: number,
  injectedPropD: any
}

const Component = (props: AllProps) => {
  /** ... */
}

export default (compose(
  withA,
  withB,
  withC,
  withD
)(Component): React.AbstractComponent<Props>)
```

## Benefits of this version

After fixing the implicit instantiation errors, Flow now is able to report errors on type mismatches cross connected components and provide accurate error messages:

![](https://i.imgur.com/mt79yaC.png)

## References

- [Asking for Required Annotations](https://medium.com/flow-type/asking-for-required-annotations-64d4f9c1edf8)
- [Flow Typed tests for React Redux `connect`](https://github.com/flow-typed/flow-typed/blob/master/definitions/npm/react-redux_v5.x.x/flow_v0.89.x-/test_connect.js#L449)
- [Quick Note Fixing `connect` FlowType Annotation after 0.89](https://dev.to/wgao19/quick-note-fixing-connect-flowtype-annotation-after-089-joi)
- [Connect Examples from Flow Typed tests](https://github.com/flow-typed/flow-typed/blob/master/definitions/npm/react-redux_v5.x.x/flow_v0.89.x-/test_connect.js#L156)
- [Ville's and Jordan Brown's guide: _Adding Type Parameters to Connect_](https://gist.github.com/jbrown215/f425203ef30fdc8a28c213b90ba7a794)
- [flow-typed/#2946: Discussion after 0.85](https://github.com/flow-typed/flow-typed/issues/2946)
- Add support for Flow 0.89+: [#3012](https://github.com/flow-typed/flow-typed/pull/3035), [#3035](https://github.com/flow-typed/flow-typed/pull/3035)
- [What's `_`?](https://github.com/facebook/flow/commit/ec70da4510d3a092fa933081c083bd0e513d0518)
- [Flow Be Happy](https://engineers.sg/video/flow-be-happy-reactjs-singapore--3419) A talk on migrating Flow past 0.85
