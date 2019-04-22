---
id: hooks
title: Hooks
sidebar_label: Hooks
hide_title: true
---

# Hooks

React's new ["hooks" APIs](https://reactjs.org/docs/hooks-intro.html) give function components the ability to use local component state, execute side effects, and more.

React Redux now offers a set of hook APIs as an alternative to the existing `connect()` Higher Order Component. These APIs allow you to subscribe to the Redux store and dispatch actions, without having to wrap your components in `connect()`.

> **Note**: The hook APIs listed in this page are **still experimental and in alpha!** We encourage you to try them out in your applications and give feedback, but be aware that they may be changed before a final release, including potential renaming or removal.

## Using Hooks in a React Redux App

As with `connect()`, you should start by wrapping your entire application in a `<Provider>` component to make the store available throughout the component tree:

```jsx
const store = createStore(rootReducer)

ReactDOM.render(
  <Provider store={store}>
    <App />
  </Provider>,
  document.getElementById('root')
)
```

From there, you may import any of the listed React Redux hooks APIs and use them within your function components.

## `useSelector()`

```js
const result : any = useSelector(selector : Function)
```

Allows you to extract data from the Redux store state, using a selector function.

The selector is approximately equivalent to the [`mapStateToProps` argument to `connect`](../using-react-redux/connect-extracting-data-with-mapStateToProps.md) conceptually. The selector will be called with the entire Redux store state as its only argument. The selector will be run whenever the function component renders. `useSelector()` will also subscribe to the Redux store, and run your selector whenever an action is dispatched.

However, there are some differences between the selectors passed to `useSelector()` and a `mapState` function:

- The selector may return any value as a result, not just an object. The return value of the selector will be used as the return value of the `useSelector()` hook.
- When an action is dispatched, `useSelector()` will do a shallow comparison of the previous selector result value and the current result value. If they are different, the component will be forced to re-render. If they are the same, they component will not re-render.
- The selector function does _not_ receive an `ownProps` argument. If you wish to use props within the selector function to determine what values to extract, you should call the React [`useMemo()`](https://reactjs.org/docs/hooks-reference.html#usememo) or [`useCallback()`](https://reactjs.org/docs/hooks-reference.html#usecallback) hooks yourself to create a version of the selector that will be re-created whenever the props it depends on change.

> **Note**: There are potential edge cases with using props in selectors that may cause errors. See the [Usage Warnings](#usage-warnings) section of this page for further details.

You may call `useSelector()` multiple times within a single function component. Each call to `useSelector()` creates an individual subscription to the Redux store. Because of the React update batching behavior used in React Redux v7, a dispatched action that causes multiple `useSelector()`s in the same component to return new values _should_ only result in a single re-render.

#### Examples

Basic usage:

```jsx
import React from 'react'
import { useSelector } from 'react-redux'

export const CounterComponent = () => {
  const counter = useSelector(state => state.counter)
  return <div>{counter}</div>
}
```

Using props to determine what to extract:

```jsx
import React, { useCallback } from 'react'
import { useSelector } from 'react-redux'

export const TodoListItem = props => {
  const todoSelector = useCallback(() => {
    return state => state.todos[props.id]
  }, [props.id])

  const todo = useSelector(todoSelector)

  return <div>{todo.text}</div>
}
```

## `useActions()`

```js
const boundAC = useActions(actionCreator : Function, deps : any[])

const boundACsObject = useActions(actionCreators : Object<string, Function>, deps : any[])

const boundACsArray = useActions(actionCreators : Function[], deps : any[])
```

Allows you to prepare bound action creators that will dispatch actions to the Redux store when called.

This is conceptually similar to the [`mapDispatchToProps` argument to `connect`](../using-react-redux/connect-dispatching-actions-with-mapDispatchToProps.md). The action creators that are passed in will be bound using the Redux [`bindActionCreators()` utility](https://redux.js.org/api/bindactioncreators), and the bound functions will be returned.

However, there are some differences between the arguments passed to `useActions()` and the `mapDispatch` argument to `connect()`:

- `mapDispatch` may be either a function or an object. `useActions()` accepts a single action creator, an object full of action creators, or an array of action creators, and the return value will be the same form.
- `mapDispatch` is normally used once when the component is instantiated, unless it is a function with the `(dispatch, ownProps)` signature, which causes it to be called any time the props have changed. The action creators passed to `useActions()` will be re-bound (and thus have new function references) whenever the values passed in the `deps` array change. If no `deps` array is provided, the functions will be re-bound every time the component re-renders.

> **Note**: There are potential edge cases with using the object argument form and declaring the object inline. See the [Usage Warnings](#usage-warnings) section of this page for further details.

You may call `useActions()` multiple times in a single component.

#### Examples

```jsx
import React from 'react'
import { useActions } from 'react-redux'

const increaseCounter = ({ amount }) => ({
  type: 'increase-counter',
  amount
})

export const CounterComponent = ({ value }) => {
  // supports passing an object of action creators
  const { increaseCounterByOne, increaseCounterByTwo } = useActions(
    {
      increaseCounterByOne: () => increaseCounter(1),
      increaseCounterByTwo: () => increaseCounter(2)
    },
    []
  )

  // supports passing an array/tuple of action creators
  const [increaseCounterByThree, increaseCounterByFour] = useActions(
    [() => increaseCounter(3), () => increaseCounter(4)],
    []
  )

  // supports passing a single action creator
  const increaseCounterBy5 = useActions(() => increaseCounter(5), [])

  // passes through any arguments to the callback
  const increaseCounterByX = useActions(x => increaseCounter(x), [])

  return (
    <div>
      <span>{value}</span>
      <button onClick={increaseCounterByOne}>Increase counter by 1</button>
    </div>
  )
}
```

## `useRedux()`

```js
const [selectedValue, boundACs] = useRedux(selector, actionCreators)
```

This hook allows you to both extract values from the Redux store state and bind action creators in a single call. This is conceptually equivalent to the [`connect()` function](./connect.md) accepting both a `mapState` and a `mapDispatch` argument.

`useRedux()` is simply a wrapper for `useSelector()` and `useActions()`, and `useRedux()` passes its arguments directly to them. The return value is an array containing the results of `useSelector()` and `useActions()`, respectively.

Note that `useRedux()` currently does _not_ allow you to specify a dependency array for the `actionCreators` parameter, so they will be re-created every time the component renders. If you need consistent function references, consider using `useActions()` with a dependency array instead.

#### Examples

```jsx
import React from 'react'
import { useRedux } from 'react-redux'

export const CounterComponent = () => {
  const [counter, { inc1, inc }] = useRedux(state => state.counter, {
    inc1: () => ({ type: 'inc1' }),
    inc: amount => ({ type: 'inc', amount })
  })

  return (
    <>
      <div>{counter}</div>
      <button onClick={inc1}>Increment by 1</button>
      <button onClick={() => inc(5)}>Increment by 5</button>
    </>
  )
}
```

## `useDispatch()`

```js
const dispatch = useDispatch()
```

This hook returns a reference to the `dispatch` function from the Redux store. You may use it to dispatch actions as needed.

#### Examples

```jsx
import React, { useCallback } from 'react'
import { useDispatch } from 'react-redux'

export const CounterComponent = ({ value }) => {
  const dispatch = useDispatch()
  const increaseCounter = useCallback(
    () => dispatch({ type: 'increase-counter' }),
    []
  )

  return (
    <div>
      <span>{value}</span>
      <button onClick={increaseCounter}>Increase counter</button>
    </div>
  )
}
```

## `useStore()`

```js
const store = useStore()
```

This hook returns a reference to the same Redux store that was passed in to the `<Provider>` component.

This hook should probably not be used frequently. Prefer `useSelector()` and `useActions()` as your primary choices. However, this may be useful for less common scenarios that do require access to the store, such as replacing reducers.

#### Examples

```jsx
import React from 'react'
import { useStore } from 'react-redux'

export const CounterComponent = ({ value }) => {
  const store = useStore()

  // EXAMPLE ONLY! Do not do this in a real app.
  // The component will not automatically update if the store state changes
  return <div>{store.getState()}</div>
}
```

## Usage Warnings

### Stale Props and "Zombie Children"

One of the most difficult aspects of React Redux's implementation is ensuring that if your `mapStateToProps` function is defined as `(state, ownProps)`, it will be called with the "latest" props every time. Up through version 4, there were recurring bugs reported involving edge case situations, such as errors thrown from a `mapState` function for a list item whose data had just been deleted.

Starting with version 5, React Redux has attempted to guarantee that consistency with `ownProps`. In version 7, that is implemented using a custom `Subscription` class internally in `connect()`, which forms a nested hierarchy. This ensures that connected components lower in the tree will only receive store update notifications once the nearest connected ancestor has been updated. However, this relies on each `connect()` instance overriding part of the internal React context, supplying its own unique `Subscription` instance to form that nesting, and rendering the `<ReactReduxContext.Provider>` with that new context value.

With hooks, there is no way to render a context provider, which means there's also no nested hierarchy of subscriptions. Because of this, the "stale props" and "zombie child" issues may potentially re-occur in an app that relies on using hooks instead of `connect()`.

Specifically, "stale props" means any case where:

- a selector function relies on this component's props to extract data
- a parent component _would_ re-render and pass down new props as a result of an action
- but this component's selector function executes before this component has had a chance to re-render with those new props

Depending on what props were used and what the current store state is, this _may_ result in incorrect data being returned from the selector, or even an error being thrown.

"Zombie child" refers specifically to the case where:

- Multiple nested connected components are mounted in a first pass, causing a child component to subscribe to the store before its parent
- An action is dispatched that deletes data from the store, such as a todo item
- The parent component _would_ stop rendering that child as a result
- However, because the child subscribed first, its subscription runs before the parent stops rendering it. When it reads a value from the store based on props, that data no longer exists, and if the extraction logic is not careful, this may result in an error being thrown.

Some possible options for avoiding these problems with `useSelector()`:

- Don't rely on props in your selector function for extracting data
- In cases where you do rely on props in your selector function _and_ those props may change over time, _or_ the data you're extracting may be based on items that can be deleted, try writing the selector functions defensively. Don't just reach straight into `state.todos[props.id].name` - read `state.todos[props.id]` first, and verify that it exists before trying to read `todo.name`.
- Because connected components add the necessary `Subscription` to the context provider, putting a connected component in the tree just above the components with potential data issues may keep those issues from occurring.

> **Note**: For a longer description of this issue, see [this chat log that describes the problems in more detail](https://gist.github.com/markerikson/faac6ae4aca7b82a058e13216a7888ec), as well as [issue #1179](https://github.com/reduxjs/react-redux/issues/1179).

### Action Object Hoisting

Many developers are used to [using the "object shorthand" form of `mapDispatch`](../using-react-redux/connect-dispatching-actions-with-mapDispatchToProps.md#defining-mapdispatchtoprops-as-an-object) by passing multiple action creators as an inline object argument to `connect()`:

```js
export default connect(
  mapState,
  { addTodo, toggleTodo }
)(TodoList)
```

However, this pattern can be problematic when calling `useActions()`. Specifically, the combination of importing action creators by name individually, defining the actions object as an inline argument, _and_ attempting to destructure the results, can lead to hoisting problems that cause errors.

This example shows the problematic pattern:

```js
import { addTodo, toggleTodo } from './todos'

const { addTodo, toggleTodo } = useActions({
  addTodo,
  toggleTodo
})
```

Due to hoisting, the `addTodo` and `toggleTodo` imports are not used, but instead the declared variables from the const are used in the actions object.

Some options for avoiding this problem:

- Don't destructure the result of `useActions()`. Instead, keep it as a single object (`const actions = useActions()`) and reference them like `actions.addTodo`
- Define the action creators object outside the function component, either by hand (`const actionCreators = {addTodo, toggleTodo}`), or by using the "named imports as an object" syntax (`import * as todoActions from "./todoActions"`).
- Try using the single function or array forms of `useActions()`

> **Note**: for more details on this problem, see [this comment and following in issue #1179](https://github.com/reduxjs/react-redux/issues/1179#issuecomment-482473235), as well as [this codesandbox that demonstrates the issue](https://codesandbox.io/s/7yjn3m9n96).
