---
id: static-typing
title: Static Typing
hide_title: true
sidebar_label: Static Typing
---

# Static Typing

React-Redux is currently written in plain JavaScript. However, it works well with static type systems such as TypeScript and Flow.

## TypeScript

React-Redux doesn't ship with its own type definitions. If you are using Typescript you should install the [`@types/react-redux` type definitions](https://npm.im/@types/react-redux) from npm. In addition to typing the library functions, the types also export some helpers to make it easier to write typesafe interfaces between your Redux store and your React components.

### Defining the Root State Type

Both `mapState` and `useSelector` depend on declaring the type of the complete Redux store state value. While this type could be written by hand, the easiest way to define it is to have TypeScript infer it based on what your root reducer function returns. This way, the type is automatically updated as the reducer functions are modified.

```ts
// rootReducer.ts
export const rootReducer = combineReducers({
  posts: postsReducer,
  comments: commentsReducer,
  users: usersReducer
})

export type RootState = ReturnType<typeof rootReducer>
// {posts: PostsState, comments: CommentsState, users: UsersState}
```

### Typing the `useSelector` hook

When writing selector functions for use with `useSelector`, you should explicitly define the type of the `state` parameter. TS should be able to then infer the return type of the selector, which will be reused as the return type of the `useSelector` hook:

```ts
interface RootState {
  isOn: boolean
}

// TS infers type: (state: RootState) => boolean
const selectIsOn = (state: RootState) => state.isOn

// TS infers `isOn` is boolean
const isOn = useSelector(selectIsOn)
```

If you want to avoid repeating the `state` type declaration, you can define a typed `useSelector` hook using a helper type exported by `@types/react-redux`:

```ts
// reducer.ts
import { useSelector, TypedUseSelectorHook } from 'react-redux'

interface RootState {
  isOn: boolean
}

export const useTypedSelector: TypedUseSelectorHook<RootState> = useSelector

// my-component.tsx
import { useTypedSelector } from './reducer.ts'

const isOn = useTypedSelector(state => state.isOn)
```

### Typing the `useDispatch` hook

By default, the return value of `useDispatch` is the standard `Dispatch` type defined by the Redux core types, so no declarations are needed:

```ts
const dispatch = useDispatch()
```

If you have a customized version of the `Dispatch` type, you may use that type explicitly:

```ts
// store.ts
export type AppDispatch = typeof store.dispatch

// MyComponent.tsx
const dispatch: AppDispatch = useDispatch()
```

### Typing the `connect` higher order component

#### Manually Typing `connect`

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
  isOn: state.isOn
})

const mapDispatch = {
  toggleOn: () => ({ type: 'TOGGLE_IS_ON' })
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
  mapDispatch
)(MyComponent)
```

It is also possible to shorten this somewhat, by inferring the types of `mapState` and `mapDispatch`:

```ts
const mapState = (state: RootState) => ({
  isOn: state.isOn
})

const mapDispatch = {
  toggleOn: () => ({ type: 'TOGGLE_IS_ON' })
}

type StateProps = ReturnType<typeof mapState>
type DispatchProps = typeof mapDispatch

type Props = StateProps & DispatchProps & OwnProps
```

However, inferring the type of `mapDispatch` this way will break if it is defined as an object and also refers to thunks.

#### Inferring The Connected Props Automatically

`connect` consists of two functions that are called sequentially. The first function accepts `mapState` and `mapDispatch` as arguments, and returns a second function. The second function accepts the component to be wrapped, and returns a new wrapper component that passes down the props from `mapState` and `mapDispatch`. Normally, both functions are called together, like `connect(mapState, mapDispatch)(MyComponent)`.

As of v7.1.2, the `@types/react-redux` package exposes a helper type, `ConnectedProps`, that can extract the return types of `mapStateToProps` and `mapDispatchToProps` from the first function. This means that if you split the `connect` call into two steps, all of the "props from Redux" can be inferred automatically without having to write them by hand. While this approach may feel unusual if you've been using React-Redux for a while, it does simplify the type declarations considerably.

```ts
import { connect, ConnectedProps } from 'react-redux'

interface RootState {
  isOn: boolean
}

const mapState = (state: RootState) => ({
  isOn: state.isOn
})

const mapDispatch = {
  toggleOn: () => ({ type: 'TOGGLE_IS_ON' })
}

const connector = connect(
  mapState,
  mapDispatch
)

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

### Recommendations

The hooks API is generally simpler to use with static types. **If you're looking for the easiest solution for using static types with React-Redux, use the hooks API.**

If you're using `connect`, **we recommend using the `ConnectedProps<T>` approach for inferring the props from Redux**, as that requires the fewest explicit type declarations.

## Resources

For additional information, see these additional resources:

- [Redux docs: Usage with TypeScript](https://redux.js.org/recipes/usage-with-typescript): Examples of how to declare types for actions, reducers, and the store
- [Redux Toolkit docs: Advanced Tutorial](https://redux-toolkit.js.org/tutorials/advanced-tutorial): shows how to use RTK and the React-Redux hooks API with TypeScript
- [React+TypeScript Cheatsheet](https://github.com/typescript-cheatsheets/react-typescript-cheatsheet): a comprehensive guide to using React with TypeScript
- [React + Redux in TypeScript Guide](https://github.com/piotrwitek/react-redux-typescript-guide): extensive information on patterns for using React and Redux with TypeScript
