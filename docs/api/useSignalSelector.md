---
id: useSignalSelector
title: useSignalSelector
sidebar_label: useSignalSelector()
hide_title: true
description: 'API > useSignalSelector: fine-grained state selection with automatic dependency tracking'
---

&nbsp;

# `useSignalSelector()`

```ts
const result: Selected = useSignalSelector(
  selector: (state: RootState) => Selected,
  options?: EqualityFn | UseSelectorOptions
)
```

_added in v9.4.0_

A fine-grained variant of [`useSelector`](./useSelector.md). It reads a value from the Redux store state using a selector function, exactly like `useSelector` - but it also automatically tracks _which fields of the state the selector actually read_, and only re-runs the selector when one of those fields changes.

:::info Requires `SignalProvider`

`useSignalSelector` only works inside a [`<SignalProvider>`](./SignalProvider.md), which maintains the signal graph the hook depends on. Calling it under a standard `<Provider>` throws an error. All other React Redux APIs (`useSelector`, `useDispatch`, `connect`) work unchanged under `<SignalProvider>`, so the two hooks can be mixed freely during a migration.

:::

```jsx
import React from 'react'
import { useSignalSelector } from 'react-redux'

export const CounterComponent = () => {
  // Re-runs only when `state.counter` changes -
  // dispatches that change other parts of the state are skipped entirely
  const counter = useSignalSelector((state) => state.counter)
  return <div>{counter}</div>
}
```

With `useSelector`, every dispatched action re-runs every subscribed selector, and the results are compared to decide whether to re-render. With `useSignalSelector`, the selector receives a tracking proxy of the state. Each field access is recorded, and on later dispatches the selector is only re-run if one of the recorded fields actually changed. For apps with many mounted components, this can significantly reduce the work done per dispatch.

## API Reference

### Signature

The signature is identical to [`useSelector`](./useSelector.md):

```ts
type DevModeCheckFrequency = 'never' | 'once' | 'always'

interface UseSelectorOptions {
  equalityFn?: EqualityFn
  devModeChecks?: {
    stabilityCheck?: DevModeCheckFrequency
    identityFunctionCheck?: DevModeCheckFrequency
  }
}

const result: Selected = useSignalSelector(
  selector: (state: RootState) => Selected,
  options?: EqualityFn | UseSelectorOptions
)
```

### Parameters

Both parameters behave exactly as they do in [`useSelector`](./useSelector.md#parameters):

| Name       | Description                                                                                                                                   |
| :--------- | :-------------------------------------------------------------------------------------------------------------------------------------------- |
| `selector` | A function that receives the entire Redux store state and returns the value this component needs. Must be [pure](./useSelector.md).           |
| `options?` | Either an equality function (such as `shallowEqual`), or an options object with `equalityFn` and `devModeChecks` fields, as in `useSelector`. |

The [development mode checks](./useSelector.md#development-mode-checks) (`stabilityCheck` and `identityFunctionCheck`) work the same way, and can be configured globally on `<SignalProvider>` or per hook call.

### Returns

The return value of the selector function. Returned values are always plain Redux state values - the tracking proxies used during selector evaluation never leak into your components (see [Proxies and identity](#proxies-and-identity)).

## Usage Guide

### How it works

1. On the first run, the selector is called with a tracking proxy wrapping the state. Every field the selector reads (`state.todos`, `todo.completed`, and so on) is recorded as a dependency path.
2. On every dispatch, [`<SignalProvider>`](./SignalProvider.md) diffs the previous and next state and marks the changed paths.
3. The selector re-runs only if one of its recorded paths changed. If none did, the hook returns the cached result without calling the selector at all.
4. Each run re-records dependencies from scratch, so selectors with conditional logic stay correct as their reads change.

This is the same family of technique used by `proxy-memoize` and by fine-grained reactivity systems like Solid and Vue, applied to Redux state.

### When to use it

`useSignalSelector` helps most when:

- Many components are mounted at once, each selecting small slices of a large state
- Your app dispatches frequently, and most dispatches are irrelevant to most components
- Selectors read narrow, deep paths (`state.entities.todos[id].completed`)

It helps least (and can cost slightly more than `useSelector`) when most dispatches change state that most components read anyway, or when selectors read broad swaths of the state. Tracked selector evaluation itself costs roughly 3-4x an untracked run, so the win comes from the runs that are _skipped_, not from the runs themselves.

Because `useSelector` and `useSignalSelector` coexist under one `<SignalProvider>`, you can adopt it incrementally in the components with the highest subscription counts.

### Differences from `useSelector`

The observable behavior - what your components render, when they re-render, what values they receive - matches `useSelector` in almost all cases. The differences fall into three groups.

#### Hard constraints

| Constraint                                                                     | Explanation                                                                                                                                                                                                                                                                                                                                                                                                               |
| :----------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Requires `<SignalProvider>`**                                                | Calling `useSignalSelector` under a plain `<Provider>` throws.                                                                                                                                                                                                                                                                                                                                                            |
| **The state root must be a plain object**                                      | Path tracking operates on the root object's keys. If the root is not a plain object, the hook still works, but falls back to untracked evaluation (behaving like `useSelector`).                                                                                                                                                                                                                                          |
| **`state => state` never updates**                                             | A selector that returns the entire root state records no field reads, so no dispatch will ever re-run it. This is already an anti-pattern (`useSelector`'s [identity function check](./useSelector.md#identity-function-state--state-check) warns about it), but with `useSignalSelector` it goes from "wasteful" to "broken": the component will not update. The dev-mode check catches this.                            |
| **Selectors must not mutate state**                                            | Writing to the state from inside a selector (`state.items.sort()`, `state.foo = 1`, `delete state.bar`) throws a `TypeError` in development explaining which property the selector tried to change. `useSelector` silently allows these writes, which corrupt the store; `useSignalSelector` rejects them because the proxy sees every write. Use non-mutating alternatives (`state.items.slice().sort()`, `toSorted()`). |
| **Mutations inside `Map`, `Set`, `Date`, and class instances are not tracked** | Only plain objects and arrays get per-field tracking. Other object types are tracked by reference: replacing the instance triggers an update, but reading `myMap.get('key')` does not record a per-entry dependency. Since Redux state should be [immutably updated](https://redux.js.org/style-guide/#do-not-mutate-state) plain data anyway, this mostly matters for state produced by libraries.                       |

#### Gotchas

These are behaviors that differ from `useSelector` in ways you might notice, but that have straightforward workarounds - or need no workaround at all.

##### Proxies and identity

Inside the selector, nested objects you read from `state` are tracking proxies, not the raw state objects. The values are identical; the object identity is not. This matters only for `===` comparisons **inside the selector body** against object references obtained _outside_ the current selector run:

```ts
import { unwrap, useSignalSelector } from 'react-redux'

const selected = useSignalSelector((state) => {
  // ❌ `state.items` entries are proxies; `previouslySavedItem` is raw.
  //    This comparison is always false:
  return state.items.find((item) => item === previouslySavedItem)
})

const selected = useSignalSelector((state) => {
  // ✅ unwrap() resolves a proxy to its raw object:
  return state.items.find((item) => unwrap(item) === previouslySavedItem)
})
```

See [`unwrap`](./unwrap.md) for details. Comparisons between two values both read from `state` in the same selector run work correctly without unwrapping.

**Proxies never escape the selector.** The hook unwraps the selector's return value before handing it to React, so your components, effects, equality functions, and dispatched actions always see plain Redux state. `console.log` of a selector result shows plain data. For the same reason, avoid _storing_ a state object read during one selector run in an external variable for use later - the same rule as holding onto an Immer draft. Use `unwrap()` first if you need to do this.

##### Memoized (Reselect) selectors

Memoized selectors created with Reselect's `createSelector` work with `useSignalSelector`, following the same rules as with [`useSelector`](./useSelector.md#using-memoizing-selectors). Unchanged parts of the state keep stable proxy identities across selector runs, so Reselect's input comparisons behave the way they do with raw state: changed inputs produce cache misses and recalculation, unchanged inputs return the cached result. Cached result values are unwrapped the same way as direct returns.

##### Coarse-grained fallback for broad selectors

Selectors that enumerate the root state's keys (`Object.keys(state)`, spreading `{...state}`) or otherwise read the root without narrowing to specific fields cannot be tracked at a useful granularity. They still work correctly, but re-evaluate more often and set up their tracking eagerly, costing more at mount. Narrow selectors are both the best practice and the fast path.

##### Aliased state objects

If the same object instance is reachable via two different state paths (for example, an entity stored in two lookup tables), tracking attributes reads to the first path encountered. The consequence is only ever _extra_ selector re-runs, never missed updates.

##### Stale props and "zombie children"

`useSignalSelector` handles the [stale props / zombie children scenarios](./useSelector.md#usage-warnings) with the same user-visible outcome as `useSelector`: an error thrown from a selector during a store update does not crash the dispatch; the component re-renders and the selector re-runs with the latest props, and only a persistent error propagates to your error boundary. The internal mechanism differs (there is no nested `Subscription` hierarchy under `<SignalProvider>`), but the guidance from the `useSelector` docs - prefer defensive reads like checking `state.todos[props.id]` before using it - applies unchanged.

##### Dev-mode stability warning shows raw state

When the [selector stability check](./useSelector.md#selector-result-stability) fires, the logged `state` argument is the raw state object, not the tracking proxy, so inspecting it in the console does not register phantom dependencies. The warning's meaning and configuration are identical to `useSelector`.

#### Performance characteristics

- **Tracked evaluation costs roughly 3-4x an untracked run.** The payoff is the dispatches where the selector does not run at all. Apps where most dispatches are irrelevant to most components come out well ahead; apps where every dispatch touches state that every component reads gain nothing and pay the diff cost inside each dispatch.
- **Iteration helpers are optimized for depth-1 reads.** Array scans like `find`, `filter`, `some`, `every`, `includes`, and `slice` are tracked at the whole-array level with per-column optimization: a callback reading `item.done` depends on that one column rather than every field of every element. Reads two levels deep inside a scan callback (`item.meta.done`), and methods like `map`, `forEach`, and `reduce`, fall back to depending on the array as a whole - still correct, just coarser.
- **Conditional selectors accumulate both branches.** A selector like `state.mode === 'a' ? state.a.x : state.b.y` re-records dependencies each run, but a component that alternates between branches will track whichever paths it has read while mounted. This widens the update surface slightly; it never causes missed updates.

### Migrating an app with a bundler alias

The `react-redux/signals` entry point re-exports the entire `react-redux` API, with `useSelector` aliased to `useSignalSelector` and `Provider` aliased to `SignalProvider`. This makes trying signals across a whole app a one-line bundler config change instead of a search-and-replace:

```js title="vite.config.js"
export default defineConfig({
  resolve: {
    alias: {
      'react-redux': 'react-redux/signals',
    },
  },
})
```

The explicit names (`useSignalSelector`, `SignalProvider`, `unwrap`) are also exported from both entry points, so code written against either style keeps working.

Before flipping the alias for a whole app, audit for the patterns listed above - particularly selectors returning the root state, identity comparisons against captured references inside selectors, and in-place reads of `Map`/`Set`/class-instance state.

### TypeScript

`useSignalSelector` supports the same pre-typed setup as `useSelector` via `useSignalSelector.withTypes<RootState>()`. See [Usage with TypeScript](../using-react-redux/usage-with-typescript.md) for details on defining pre-typed hooks.

## See Also

- [`SignalProvider`](./SignalProvider.md): required to use this hook
- [`unwrap`](./unwrap.md): resolving tracking proxies for identity comparisons
- [`useSelector`](./useSelector.md): the standard selector hook this one mirrors
