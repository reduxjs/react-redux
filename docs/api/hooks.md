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

These hooks were first added in v7.1.0.

This page reflects the latest alpha, which is currently **v7.1.0-alpha.4**.

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
const result : any = useSelector(selector : Function, deps : any[])
```

Allows you to extract data from the Redux store state, using a selector function.

> **Note**: The selector function should be [pure](https://en.wikipedia.org/wiki/Pure_function) since it is potentially executed multiple times and at arbitrary points in time.

The selector is approximately equivalent to the [`mapStateToProps` argument to `connect`](../using-react-redux/connect-extracting-data-with-mapStateToProps.md) conceptually. The selector will be called with the entire Redux store state as its only argument. The selector will be run whenever the function component renders. `useSelector()` will also subscribe to the Redux store, and run your selector whenever an action is dispatched.

However, there are some differences between the selectors passed to `useSelector()` and a `mapState` function:

- The selector may return any value as a result, not just an object. The return value of the selector will be used as the return value of the `useSelector()` hook.
- The selector function used will be based on the `deps` array. If no deps array is provided, the latest passed-in selector function will be used when the component renders, and also when any actions are dispatched before the next render. If a deps array is provided, the last saved selector will be used, and that selector will be overwritten whenever the deps array contents have changed. Therefore, the deps are only required if the selector needs to be referentially stable, e.g. if you are using memoizing selectors.
- When an action is dispatched, `useSelector()` will do a shallow comparison of the previous selector result value and the current result value. If they are different, the component will be forced to re-render. If they are the same, they component will not re-render.
- The selector function does _not_ receive an `ownProps` argument. However, props can be used through closure (see the examples below) or by using a curried selector. If you are providing `deps` to `useSelector()` make sure they contain all the props you are using.

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

Using props via closure to determine what to extract:

```jsx
import React from 'react'
import { useSelector } from 'react-redux'

export const TodoListItem = props => {
  const todo = useSelector(state => state.todos[props.id])
  return <div>{todo.text}</div>
}
```

Using `deps` to ensure the same selector is used in each render:

```jsx
import React from 'react'
import { useSelector } from 'react-redux'
import { createSelector } from 'reselect'

const allOtherTodos = createSelector(
  state => state.todos,
  (_, id) => id,
  (todos, id) => todos.filter(todo => todo.id !== id)
)

export const OtherTodoListItems = ({ id }) => {
  const otherTodos = useSelector(s => allOtherTodos(s, id), [id])
  return <div>{otherTodos.length}</div>
}
```

## Removed: `useActions()`

This hook was removed in `v7.1.0-alpha.4`, based on [Dan Abramov's suggestion](https://github.com/reduxjs/react-redux/issues/1252#issuecomment-488160930).
That suggestion was based on "binding action creators" not being as useful in a hooks-based use case, and causing too
much conceptual overhead and syntactic complexity.

Instead, you should call the [`useDispatch`](#usedispatch) hook in your components to retrieve a reference to `dispatch`,
and manually call `dispatch(someActionCreator())` in callbacks and effects as needed. You may also use the Redux
[`bindActionCreators`](https://redux.js.org/api/bindactioncreators) function in your own code to bind action creators,
or "manually" bind them like `const boundAddTodo = (text) => dispatch(addTodo(text))`.

If you still wish to use the `useActions()` hook, you may copy and paste this implementation into your own app:

```js
import { bindActionCreators } from 'redux'
import { useDispatch } from 'react-redux'
import { useMemo } from 'react'

export function useActions(actions, deps) {
  const dispatch = useDispatch()
  return useMemo(() => {
    if (Array.isArray(actions)) {
      return actions.map(a => bindActionCreators(a, dispatch))
    }

    return bindActionCreators(actions, dispatch)
  }, deps)
}
```

## Removed: `useRedux()`

This hook was removed in `v7.1.0-alpha.3`, on the grounds that it didn't provide any real benefit.

If you were using it in your own code, please replace that with separate calls to `useSelector()` and `useDispatch()`.

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

This hook should probably not be used frequently. Prefer `useSelector()` as your primary choice. However, this may be useful for less common scenarios that do require access to the store, such as replacing reducers.

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

`useSelector()` tries to deal with this by catching all errors that are thrown when the selector is executed due to a store update (but not when it is executed during rendering). When an error occurs, the component will be forced to render, at which point the selector is executed again. This works as long as the selector is a pure function and you do not depend on the selector throwing errors.

If you prefer to deal with this issue yourself, here are some possible options for avoiding these problems altogether with `useSelector()`:

- Don't rely on props in your selector function for extracting data
- In cases where you do rely on props in your selector function _and_ those props may change over time, _or_ the data you're extracting may be based on items that can be deleted, try writing the selector functions defensively. Don't just reach straight into `state.todos[props.id].name` - read `state.todos[props.id]` first, and verify that it exists before trying to read `todo.name`.
- Because `connect` adds the necessary `Subscription` to the context provider, wrapping the component with `connect` (without any arguments, i.e. `connect()(MyComponent)` will keep those issues from occurring.

> **Note**: For a longer description of this issue, see [this chat log that describes the problems in more detail](https://gist.github.com/markerikson/faac6ae4aca7b82a058e13216a7888ec), as well as [issue #1179](https://github.com/reduxjs/react-redux/issues/1179).

### Performance

As mentioned earlier, `useSelector()` will do basic shallow comparisons of return values when running the selector function after an action is dispatched. However, unlike `connect()`, `useSelector()` does not do anything to prevent your own function component from completing a re-render if the derived state has changed.

If further performance optimizations are necessary, you may consider either wrapping your function component in `React.memo(MyFunctionComponent)`, or using `useMemo()` to memoize the render output of your component:

```jsx
// Option 1: use React.memo() to keep the component from re-rendering

const CounterComponent = props => {
  const counter = useSelector(state => state.counter)
  return (
    <div>
      {props.name}: {counter}
    </div>
  )
}

export const MemoizedCounterComponent = React.memo(CounterComponent)

// Option 2: let the component re-render, but memoize output

export const CounterComponent = props => {
  const counter = useSelector(state => state.counter)

  const renderedChildren = useMemo(() => {
    return (
      <div>
        {props.name}: {counter}
      </div>
    )
  }, [props.name, counter])

  return renderedChildren
}
```
