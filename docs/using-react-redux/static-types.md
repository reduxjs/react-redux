---
id: static-types
title: Type safety and React-Redux
hide_title: true
sidebar_label: Type safety and React-Redux
---

# Type safety and React-Redux

The [`react-redux` type definitions](https://npm.im/@types/react-redux) export some helpers to make it easier to write typesafe interfaces between your redux store and your React components.

## Typing the useSelector hook

If you manually type your selector functions, `useSelector` will return the same type as your selector

```ts
// selectIsOn always returns a boolean, so isOn is typed as a boolean
const isOn = useSelector(selectIsOn)
```

Otherwise `useSelector` requires you to manually type the state argument every time you use it.

```ts
const isOn = useSelector((state: MyStateType) => state.isOn)
```

If you'd like, you can define a typed `useSelect` hook using a helper type

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

React-redux exposes a helper type, `ConnectedProps`, that can extract the return type of mapStateToProps and mapDispatchToProps.

```ts
import { connect, ConnectedProps } from 'react-redux'

interface MyStateType {
  isOn: boolean
}

const connector = connect(
  (state: MyStateType) => ({
    isOn: state.isOn
  }),
  (dispatch: any) => ({
    toggleOn: () => dispatch({ type: 'TOGGLE_IS_ON' })
  })
)

type PropsFromRedux = ConnectedProps<typeof connector>
```

The return type of `ConnectedProps` can then be used to type your props object.

```tsx
interface Props extends PropsFromRedux {
  backgroundColor: string
}

export const MyComponent = connector((props: Props) => (
  <div style={{ backgroundColor: props.backgroundColor }}>
    <button onClick={props.toggleOn}>
      Toggle is {props.isOn ? 'ON' : 'OFF'}
    </button>
  </div>
))
```

If you are using untyped selectors or for some other reason would rather, you can also pass type arguments to `connect` and use those same types to create your own props type.

```ts
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

const connector = connect<
  StateProps,
  DispatchProps,
  OwnProps
>(/* arguments as above */)
```
