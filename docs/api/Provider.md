---
id: provider
title: Provider
sidebar_label: Provider
hide_title: true
description: 'API > Provider: providing the Redux store to your React app'
---

&nbsp;

# `Provider`

## Overview

The `<Provider>` component makes the Redux `store` available to any nested components that need to access the Redux store.

Since any React component in a React Redux app can be connected to the store, most applications will render a `<Provider>` at the top level, with the entire app’s component tree inside of it.

The [Hooks](./hooks.md) and [`connect`](./connect.md) APIs can then access the provided store instance via React's Context mechanism.

### Props

```ts
interface ProviderProps<A extends Action = AnyAction, S = any> {
  /**
   * The single Redux store in your application.
   */
  store: Store<S, A>

  /**
   * An optional server state snapshot. Will be used during initial hydration render
   * if available, to ensure that the UI output is consistent with the HTML generated on the server.
   * New in 8.0
   */
  serverState?: S

  /**
   * Optional context to be used internally in react-redux. Use React.createContext()
   * to create a context to be used.
   * If this is used, you'll need to customize `connect` by supplying the same
   * context provided to the Provider.
   * Initial value doesn't matter, as it is overwritten with the internal state of Provider.
   */
  context?: Context<ReactReduxContextValue<S, A>>

  /** Global configuration for the `useSelector` stability check */
  stabilityCheck?: StabilityCheck

  /** The top-level React elements in your component tree, such as `<App />` **/
  children: ReactNode
}
```

Typically, you only need to pass `<Provider store={store}>`.

You may provide a context instance. If you do so, you will need to provide the same context instance to all of your connected components as well. Failure to provide the correct context results in this runtime error:

> Invariant Violation
>
> Could not find "store" in the context of "Connect(MyComponent)". Either wrap the root component in a `<Provider>`, or pass a custom React context provider to `<Provider>` and the corresponding React context consumer to Connect(Todo) in connect options.

## React 18 SSR Usage

As of React-Redux v8, `<Provider>` now accepts a `serverState` prop for use in SSR hydration scenarios. This is necessary if you are calling `hydrateRoot` in order to avoid hydration mismatches.

You should pass the entire serialized state from the server as the `serverState` prop, and React will use this state for the initial hydration render. After that, it will apply any updates from changes that occurred on the client during the setup process.

## Examples

### Basic Usage

In the example below, the `<App />` component is our root-level component. This means it’s at the very top of our component hierarchy.

```jsx
import React from 'react'
import ReactDOM from 'react-dom'
import { Provider } from 'react-redux'

import { App } from './App'
import createStore from './createReduxStore'

const store = createStore()

// As of React 18
const root = ReactDOM.createRoot(document.getElementById('root'))
root.render(
  <Provider store={store}>
    <App />
  </Provider>
)
```

### React 18 SSR Hydration

In this example, the client has received HTML rendered by the server, as well as a serialized Redux state attached to `window`. The serialized state is used to both pre-fill the store's contents, _and_ passed as the `serverState` prop to `<Provider>`

```tsx title="src/index.ts"
import { hydrateRoot } from 'react-dom/client'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'

const preloadedState = window.__PRELOADED_STATE__

const clientStore = configureStore({
  reducer: rootReducer,
  preloadedState,
})

hydrateRoot(
  document.getElementById('root'),
  <Provider store={clientStore} serverState={preloadedState}>
    <App />
  </Provider>
)
```
