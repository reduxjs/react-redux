---
id: static-typing
title: Type safety and React-Redux
hide_title: true
sidebar_label: Type safety and React-Redux
---

# Type safety and React-Redux

React-redux doesn't ship with types. If you are using Typescript you should install the [`react-redux` type definitions](https://npm.im/@types/react-redux) from npm. In addition to typing the library functions, the types also export some helpers to make it easier to write typesafe interfaces between your redux store and your React components.

## Typing the useSelector hook

If your selector functions has declared a return type, `useSelector` will return that same type

```ts
const selectIsOn = (state: MyStateType) => state.isOn

const isOn = useSelector(selectIsOn)
```

Passing an inline function to `useSelector` requires you to manually type the state argument.

```ts
const isOn = useSelector((state: MyStateType) => state.isOn)
```

If you want to avoid repeating the `state` type declaration, you can define a typed `useSelect` hook using a helper type exported by `@types/react-redux`

```ts
// reducer.ts
import { useSelector, TypedUseSelectorHook } from 'react-redux'

interface MyStateType {
  isOn: boolean
}

export const useTypedSelector: TypedUseSelectorHook<MyStateType> = useSelector

// my-component.tsx
import { useTypedSelector } from './reducer.ts'

const isOn = useSelector(state => state.isOn)
```

## Typing the `connect` higher order component

The `connect` higher-order function can be a bit laborious to type, because there are 3 sources of props: mapStateToProps, mapDispatchToProps, and props passed in from the parent component. Here's a full example of what it looks like to do that manually.

```ts
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

const MyComponent = (props: Props) => (
  <div style={{ backgroundColor: props.backgroundColor }}>
    <button onClick={props.toggleOn}>
      Toggle is {props.isOn ? 'ON' : 'OFF'}
    </button>
  </div>
)

export default connect<StateProps, DispatchProps, OwnProps>(
  (state: MyStateType) => ({
    isOn: state.isOn
  }),
  {
    toggleOn: () => ({ type: 'TOGGLE_IS_ON' })
  }
)(MyComponent)
```

React-redux exposes a helper type, `ConnectedProps`, that can extract the return types of `mapStateToProp` and `mapDispatchToProps` from a `connector` function, although this means that creating the connector and exporting the connected component needs to be done in 2 separate steps.

```ts
import { connect, ConnectedProps } from 'react-redux'

interface MyStateType {
  isOn: boolean
}

const connector = connect(
  (state: MyStateType) => ({
    isOn: state.isOn
  }),
  {
    toggleOn: () => ({ type: 'TOGGLE_IS_ON' })
  }
)

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
interface Props extends PropsFromRedux {
  backgroundColor: string;
}

const MyComponent = (props: Props) => /* same as above */

const connector = connect(/* same as above*/)

type PropsFromRedux = ConnectedProps<typeof connector>

export default connector(MyComponent)
```
