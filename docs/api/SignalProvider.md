---
id: SignalProvider
title: SignalProvider
sidebar_label: SignalProvider
hide_title: true
description: 'API > SignalProvider: a drop-in replacement for Provider that enables signal-based selector tracking'
---

&nbsp;

# `SignalProvider`

_added in v9.4.0_

`<SignalProvider>` is a drop-in replacement for [`<Provider>`](./Provider.md) that enables fine-grained, signal-based state tracking for the [`useSignalSelector`](./useSignalSelector.md) hook.

Like `<Provider>`, it makes the Redux `store` available to any nested components. In addition, it maintains an internal graph of "path signals" that represent individual fields within the Redux state. On every dispatch, it diffs the previous and next state, and updates only the signals for the fields that actually changed. `useSignalSelector` uses that graph to re-run selectors only when a field they actually read has changed.

```jsx
import { SignalProvider } from 'react-redux'

const store = createStore(rootReducer)

const root = ReactDOM.createRoot(document.getElementById('root'))
root.render(
  <SignalProvider store={store}>
    <App />
  </SignalProvider>,
)
```

:::tip

All of the standard React Redux APIs - [`useSelector`](./useSelector.md), [`useDispatch`](./useDispatch.md), [`useStore`](./useStore.md), and [`connect`](./connect.md) - work unchanged inside a `<SignalProvider>`. They receive the plain Redux state and behave exactly as they do under `<Provider>`. Only components that use `useSignalSelector` opt in to the fine-grained tracking behavior.

:::

## API Reference

### Props

`SignalProvider` accepts the same props as [`<Provider>`](./Provider.md):

| Name                     | Description                                                                                                                                         |
| :----------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------- |
| `store`                  | The single Redux store in your application.                                                                                                         |
| `children`               | The top-level React elements in your component tree.                                                                                                |
| `context?`               | An optional custom context instance, as with `<Provider>`.                                                                                          |
| `serverState?`           | An optional server state snapshot, used during initial hydration to keep the UI output consistent with the server-generated HTML.                   |
| `stabilityCheck?`        | Global default for the `useSelector`/`useSignalSelector` [selector stability check](./useSelector.md#selector-result-stability) (development only). |
| `identityFunctionCheck?` | Global default for the [identity function check](./useSelector.md#identity-function-state--state-check) (development only).                         |

## Usage Guide

### Differences from `Provider`

`<SignalProvider>` behaves like `<Provider>`, with these differences:

#### The state must be a plain object

The root of your Redux state must be a plain JavaScript object, because the state diffing and path tracking operate on its keys. This is reflected in the types: `SignalProvider`'s state generic is constrained to `S extends object`, where `Provider` accepts any state type.

Standard Redux usage with `combineReducers` or Redux Toolkit's `configureStore` always produces a plain object root, so this only matters if your root reducer returns a primitive, a class instance, or another non-plain value. Those setups should keep using `<Provider>` and `useSelector`.

#### Every dispatch runs a state diff

Before notifying subscribers, `<SignalProvider>` compares the previous and next state and updates the changed path signals. This is a structural walk of the changed portions of the state, and adds some work to each dispatch in exchange for skipping selector re-runs in components. See the [`useSignalSelector` performance notes](./useSignalSelector.md#performance-characteristics) for the tradeoffs.

#### The signal graph is keyed to the store

Each `<SignalProvider>` owns one signal registry per store instance. Swapping the `store` prop starts over with a fresh registry, the same way `<Provider>` resets its subscriptions. Multiple `<SignalProvider>`s with different stores (via custom contexts) keep fully independent signal graphs.

### When should I use `SignalProvider`?

Use `<SignalProvider>` if you want to adopt [`useSignalSelector`](./useSignalSelector.md) anywhere in your app. Since all the other React Redux APIs work unchanged, it is safe to swap in at the root and migrate components incrementally.

If your app does not use `useSignalSelector`, there is no benefit to `<SignalProvider>` - the per-dispatch diff adds cost without anything consuming its results. Use the standard `<Provider>`.

## See Also

- [`useSignalSelector`](./useSignalSelector.md): the hook that consumes the signal graph
- [`Provider`](./Provider.md): the standard store provider
