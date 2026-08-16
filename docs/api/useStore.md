---
id: useStore
title: useStore
sidebar_label: useStore()
hide_title: true
description: 'API > useStore: accessing the Redux store instance directly'
---

&nbsp;

# `useStore()`

```ts
import type { Store } from 'redux'
const store: Store = useStore()
```

_added in v7.1.0_

This hook returns a reference to the same Redux store that was passed in to the `<Provider>` component.

This hook should probably not be used frequently. Prefer [`useSelector()`](./useSelector.md) as your primary choice. However, this may be useful for less common scenarios that do require access to the store, such as replacing reducers.

## API Reference

### Parameters

`useStore` takes no arguments.

### Returns

The Redux store instance provided by the nearest [`<Provider>`](./Provider.md).

## Usage Guide

### Examples

```js
import React from 'react'
import { useStore } from 'react-redux'

export const ExampleComponent = ({ value }) => {
  const store = useStore()

  const onClick = () => {
    // Not _recommended_, but safe
    // This avoids subscribing to the state via `useSelector`
    // Prefer moving this logic into a thunk instead
    const numTodos = store.getState().todos.length
  }

  // EXAMPLE ONLY! Do not do this in a real app.
  // The component will not automatically update if the store state changes
  return <div>{store.getState().todos.length}</div>
}
```

### TypeScript

`useStore` accepts a pre-typed setup via `useStore.withTypes<AppStore>()`, which lets you define the store type once instead of specifying it at every call site. See [Usage with TypeScript](../using-react-redux/usage-with-typescript.md) for details on defining pre-typed hooks.

## See Also

- [`useSelector`](./useSelector.md) and [`useDispatch`](./useDispatch.md): the other core React Redux hooks
- [Accessing the Store](../using-react-redux/accessing-store.md): other techniques for store access, including custom context
- [Hooks overview](./hooks.md)
