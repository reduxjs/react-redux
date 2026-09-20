---
id: usage-with-typescript
title: Typing connect with TypeScript
hide_title: true
sidebar_label: 'Connect: Usage with TypeScript'
description: 'Usage > TypeScript: how to type the legacy connect API'
---

&nbsp;

# Typing `connect` with TypeScript

:::warning Deprecated

`connect` is marked as deprecated as of React-Redux 9.3.0. It still works, and we do not intend to remove it, but [**we recommend using the hooks API instead**](../api/hooks.md). The hooks are also much simpler to type. For the standard TypeScript setup with `RootState`, `AppDispatch`, and pre-typed `useAppSelector` / `useAppDispatch` hooks, see [**Usage with TypeScript**](/usage/usage-with-typescript) in the Redux docs.

:::

React-Redux is written in TypeScript, and the types are included in the published package. This page covers the patterns for typing the `connect` higher-order component.

## Typing the `connect` higher order component

### Inferring The Connected Props Automatically

`connect` consists of two functions that are called sequentially. The first function accepts `mapState` and `mapDispatch` as arguments, and returns a second function. The second function accepts the component to be wrapped, and returns a new wrapper component that passes down the props from `mapState` and `mapDispatch`. Normally, both functions are called together, like `connect(mapState, mapDispatch)(MyComponent)`.

The package includes a helper type, `ConnectedProps`, that can extract the return types of `mapStateToProps` and `mapDispatchToProps` from the first function. This means that if you split the `connect` call into two steps, all of the "props from Redux" can be inferred automatically without having to write them by hand. While this approach may feel unusual if you've been using React-Redux for a while, it does simplify the type declarations considerably.

```ts
import type { ConnectedProps } from 'react-redux'
import { connect } from 'react-redux'

interface RootState {
  isOn: boolean
}

const mapState = (state: RootState) => ({
  isOn: state.isOn,
})

const mapDispatch = {
  toggleOn: () => ({ type: 'TOGGLE_IS_ON' }),
}

const connector = connect(mapState, mapDispatch)

// The inferred type will look like:
// {isOn: boolean, toggleOn: () => void}
type PropsFromRedux = ConnectedProps<typeof connector>
```

The return type of `ConnectedProps` can then be used to type your props object.

```tsx
interface Props extends PropsFromRedux {
  backgroundColor: string
}

const MyComponent = (props: Props) => (
  <div style={{ backgroundColor: props.backgroundColor }}>
    <button onClick={props.toggleOn}>
      Toggle is {props.isOn ? 'ON' : 'OFF'}
    </button>
  </div>
)

export default connector(MyComponent)
```

Because types can be defined in any order, you can still declare your component before declaring the connector if you want.

```tsx
// alternately, declare `type Props = PropsFromRedux & {backgroundColor: string}`
interface Props extends PropsFromRedux {
  backgroundColor: string;
}

const MyComponent = (props: Props) => /* same as above */

const connector = connect(/* same as above*/)

type PropsFromRedux = ConnectedProps<typeof connector>

export default connector(MyComponent)
```

### Manually Typing `connect`

The `connect` higher-order component is somewhat complex to type, because there are 3 sources of props: `mapStateToProps`, `mapDispatchToProps`, and props passed in from the parent component. Here's a full example of what it looks like to do that manually.

```tsx
import { connect } from 'react-redux'

interface StateProps {
  isOn: boolean
}

interface DispatchProps {
  toggleOn: () => void
}

interface OwnProps {
  backgroundColor: string
}

type Props = StateProps & DispatchProps & OwnProps

const mapState = (state: RootState) => ({
  isOn: state.isOn,
})

const mapDispatch = {
  toggleOn: () => ({ type: 'TOGGLE_IS_ON' }),
}

const MyComponent = (props: Props) => (
  <div style={{ backgroundColor: props.backgroundColor }}>
    <button onClick={props.toggleOn}>
      Toggle is {props.isOn ? 'ON' : 'OFF'}
    </button>
  </div>
)

// Typical usage: `connect` is called after the component is defined
export default connect<StateProps, DispatchProps, OwnProps>(
  mapState,
  mapDispatch,
)(MyComponent)
```

It is also possible to shorten this somewhat, by inferring the types of `mapState` and `mapDispatch`:

```ts
const mapState = (state: RootState) => ({
  isOn: state.isOn,
})

const mapDispatch = {
  toggleOn: () => ({ type: 'TOGGLE_IS_ON' }),
}

type StateProps = ReturnType<typeof mapState>
type DispatchProps = typeof mapDispatch

type Props = StateProps & DispatchProps & OwnProps
```

However, inferring the type of `mapDispatch` this way will break if it is defined as an object and also refers to thunks.

## Recommendations

If you're using `connect`, **we recommend using the `ConnectedProps<T>` approach for inferring the props from Redux**, as that requires the fewest explicit type declarations.

If you're able to migrate, the hooks API is simpler to type. See [Migrating to Modern Redux: Modernizing React Components](/usage/migrating-to-modern-redux#modernizing-react-components-with-react-redux) for how to convert `connect` usage to hooks.

## Resources

- [Redux docs: Usage with TypeScript](/usage/usage-with-typescript): the standard TypeScript setup for Redux Toolkit and the React-Redux hooks
- [Redux docs: Quick Start](/tutorials/quick-start): shows how to use RTK and the React-Redux hooks API with TypeScript
- [React+TypeScript Cheatsheet](https://github.com/typescript-cheatsheets/react): a comprehensive guide to using React with TypeScript
