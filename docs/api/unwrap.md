---
id: unwrap
title: unwrap
sidebar_label: unwrap()
hide_title: true
description: 'API > unwrap: resolving useSignalSelector tracking proxies to raw state objects'
---

&nbsp;

# `unwrap()`

```ts
const rawValue: T = unwrap(value: T)
```

_added in v9.4.0_

Resolves a [`useSignalSelector`](./useSignalSelector.md) tracking proxy to the raw state object it wraps. Safe to call on any value: non-proxy values (including primitives and `null`) are returned unchanged.

## API Reference

### Parameters

| Name    | Description                             |
| :------ | :--------------------------------------- |
| `value` | The value to unwrap - a proxy or any other value. |

### Returns

The raw state object if `value` is a tracking proxy, otherwise `value` itself.

## Usage Guide

Inside a `useSignalSelector` selector, nested objects read from `state` are tracking proxies. A proxy is never `===` to the raw object it wraps, so identity comparisons against object references captured *outside* the current selector run always fail. `unwrap` resolves the proxy so the comparison works:

```ts
import { unwrap, useSignalSelector } from 'react-redux'

const selected = useSignalSelector((state) => {
  // ❌ always false: `item` is a proxy, `currentItem` is a raw object
  // return state.items.find((item) => item === currentItem)

  // ✅ compare raw object to raw object
  return state.items.find((item) => unwrap(item) === currentItem)
})
```

The other use case is intentionally keeping a reference to a state object outside the selector (in a module-level variable, a ref, or a dispatched action payload built inside the selector). Unwrap it first, so you store the raw object rather than a proxy tied to a previous selector run:

```ts
let lastSeenUser = null

const userName = useSignalSelector((state) => {
  lastSeenUser = unwrap(state.auth.currentUser)
  return state.auth.currentUser.name
})
```

You do not need `unwrap` for:

- **Selector return values.** The hook unwraps them automatically - components, equality functions, and effects always receive plain state values.
- **Comparisons between two values both read from `state` in the same selector run.** Proxy identities are consistent within a run.
- **Anything in `useSelector`.** The standard hook never sees proxies; `unwrap` is a pass-through there.

:::caution

Reading fields from an unwrapped object inside the selector bypasses dependency tracking - changes to those fields will not re-run the selector. Unwrap as late as possible, and only for identity comparisons or for storing a reference, not for general field access.

:::

## See Also

- [`useSignalSelector`](./useSignalSelector.md), especially the [Proxies and identity](./useSignalSelector.md#proxies-and-identity) section
- [`SignalProvider`](./SignalProvider.md)
