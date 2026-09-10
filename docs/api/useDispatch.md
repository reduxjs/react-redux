---
id: useDispatch
title: useDispatch
sidebar_label: useDispatch()
hide_title: true
description: 'API > useDispatch: dispatching actions from React components'
---

&nbsp;

# `useDispatch()`

```ts
import type { Dispatch } from 'redux'
const dispatch: Dispatch = useDispatch()
```

_added in v7.1.0_

This hook returns a reference to the `dispatch` function from the Redux store. You may use it to dispatch actions as needed.

## API Reference

### Parameters

`useDispatch` takes no arguments.

### Returns

The `dispatch` function from the Redux store provided by the nearest [`<Provider>`](./Provider.md).

:::info

The `dispatch` function reference will be stable as long as the same store instance is being passed to the `<Provider>`.
Normally, that store instance never changes in an application.

However, the React hooks lint rules do not know that `dispatch` should be stable, and will warn that the `dispatch` variable
should be added to dependency arrays for `useEffect` and `useCallback`. The simplest solution is to do just that:

```js
export const Todos = () => {
  const dispatch = useDispatch()

  useEffect(() => {
    dispatch(fetchTodos())
    // highlight-start
    // Safe to add dispatch to the dependencies array
  }, [dispatch])
  // highlight-end
}
```

:::

## Usage Guide

### Examples

```jsx
import React from 'react'
import { useDispatch } from 'react-redux'

export const CounterComponent = ({ value }) => {
  const dispatch = useDispatch()

  return (
    <div>
      <span>{value}</span>
      <button onClick={() => dispatch({ type: 'increment-counter' })}>
        Increment counter
      </button>
    </div>
  )
}
```

When passing a callback using `dispatch` to a child component, you may sometimes want to memoize it with [`useCallback`](https://react.dev/reference/react/useCallback). _If_ the child component is trying to optimize render behavior using `React.memo()` or similar, this avoids unnecessary rendering of child components due to the changed callback reference.

```jsx
import React, { useCallback } from 'react'
import { useDispatch } from 'react-redux'

export const CounterComponent = ({ value }) => {
  const dispatch = useDispatch()
  const incrementCounter = useCallback(
    () => dispatch({ type: 'increment-counter' }),
    [dispatch],
  )

  return (
    <div>
      <span>{value}</span>
      <MyIncrementButton onIncrement={incrementCounter} />
    </div>
  )
}

export const MyIncrementButton = React.memo(({ onIncrement }) => (
  <button onClick={onIncrement}>Increment counter</button>
))
```

### TypeScript

`useDispatch` accepts a pre-typed setup via `useDispatch.withTypes<AppDispatch>()`, which lets you define the store's `dispatch` type once (including thunk support) instead of specifying it at every call site. See [Usage with TypeScript](../using-react-redux/usage-with-typescript.md) for details on defining pre-typed hooks.

## See Also

- [`useSelector`](./useSelector.md) and [`useStore`](./useStore.md): the other core React Redux hooks
- [Hooks overview](./hooks.md)
