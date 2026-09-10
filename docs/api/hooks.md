---
id: hooks
title: Hooks
sidebar_label: Hooks Overview
hide_title: true
description: 'API > Hooks: an overview of the React Redux hooks APIs'
---

&nbsp;

# Hooks

React's ["hooks" APIs](https://react.dev/reference/react#) give function components the ability to use local component state, execute side effects, and more. React also lets us write [custom hooks](https://react.dev/learn/reusing-logic-with-custom-hooks#extracting-your-own-custom-hook-from-a-component), which let us extract reusable hooks to add our own behavior on top of React's built-in hooks.

React Redux includes its own custom hook APIs, which allow your React components to subscribe to the Redux store and dispatch actions.

:::tip

**We recommend using the React-Redux hooks API as the default approach in your React components.**

The existing `connect` API still works and will continue to be supported, but the hooks API is simpler and works better with TypeScript.

:::

These hooks were first added in v7.1.0.

Each hook has its own API reference page. This page provides an overview of the available hooks and shared usage information.

## Using Hooks in a React Redux App

As with `connect()`, you should start by wrapping your entire application in a `<Provider>` component to make the store available throughout the component tree:

```jsx
const store = createStore(rootReducer)

// As of React 18
const root = ReactDOM.createRoot(document.getElementById('root'))
root.render(
  <Provider store={store}>
    <App />
  </Provider>,
)
```

From there, you may import any of the listed React Redux hooks APIs and use them within your function components.

## The Hooks APIs

### `useSelector()`

Reads a value from the Redux store state using a selector function, and subscribes the component so it re-renders when that value changes. This is the primary hook for reading Redux state in components.

**[Full `useSelector` API reference →](./useSelector.md)**

### `useDispatch()`

Returns the store's `dispatch` function, so components can dispatch actions in event handlers and effects.

**[Full `useDispatch` API reference →](./useDispatch.md)**

### `useStore()`

Returns the Redux store instance itself. Rarely needed - prefer `useSelector` for reading state.

**[Full `useStore` API reference →](./useStore.md)**

### `useSignalSelector()`

_added in v9.4.0_

A fine-grained variant of `useSelector` that automatically tracks which parts of the state the selector reads, and only re-runs the selector when those parts change. Requires wrapping the app in [`<SignalProvider>`](./SignalProvider.md) instead of `<Provider>`.

**[Full `useSignalSelector` API reference →](./useSignalSelector.md)**

## Custom context

The `<Provider>` component allows you to specify an alternate context via the `context` prop. This is useful if you're building a complex reusable component, and you don't want your store to collide with any Redux store your consumers' applications might use.

To access an alternate context via the hooks API, use the hook creator functions:

```js
import React from 'react'
import {
  Provider,
  createStoreHook,
  createDispatchHook,
  createSelectorHook,
} from 'react-redux'

const MyContext = React.createContext(null)

// Export your custom hooks if you wish to use them in other files.
export const useStore = createStoreHook(MyContext)
export const useDispatch = createDispatchHook(MyContext)
export const useSelector = createSelectorHook(MyContext)

const myStore = createStore(rootReducer)

export function MyProvider({ children }) {
  return (
    <Provider context={MyContext} store={myStore}>
      {children}
    </Provider>
  )
}
```

See [Accessing the Store](../using-react-redux/accessing-store.md) for more details on context usage, multiple stores, and accessing the store directly.

## Usage Warnings

Because the hooks subscribe to the store individually rather than forming the nested subscription hierarchy that `connect` uses, there are a couple of edge cases around "stale props" and "zombie children" that can occur when selectors rely on props. In practice these are a rare concern - `useSelector` handles them automatically by catching selector errors during store updates and re-running the selector on the next render.

See [`useSelector`: Stale Props and "Zombie Children"](./useSelector.md#usage-warnings) for the full explanation.

## Hooks Recipes

We've pared down our hooks API from the original alpha release, focusing on a more minimal set of API primitives.
However, you may still wish to use some of the approaches we tried in your own apps. These examples should be ready
to copy and paste into your own codebase.

### Recipe: `useActions()`

This hook was in our original alpha release, but removed in `v7.1.0-alpha.4`, based on [Dan Abramov's suggestion](https://github.com/reduxjs/react-redux/issues/1252#issuecomment-488160930).
That suggestion was based on "binding action creators" not being as useful in a hooks-based use case, and causing too
much conceptual overhead and syntactic complexity.

You should probably prefer to call the [`useDispatch`](./useDispatch.md) hook in your components to retrieve a reference to `dispatch`,
and manually call `dispatch(someActionCreator())` in callbacks and effects as needed. You may also use the Redux
[`bindActionCreators`](https://redux.js.org/api/bindactioncreators) function in your own code to bind action creators,
or "manually" bind them like `const boundAddTodo = (text) => dispatch(addTodo(text))`.

However, if you'd like to still use this hook yourself, here's a copy-pastable version that supports passing in action
creators as a single function, an array, or an object.

```js
import { bindActionCreators } from 'redux'
import { useDispatch } from 'react-redux'
import { useMemo } from 'react'

export function useActions(actions, deps) {
  const dispatch = useDispatch()
  return useMemo(
    () => {
      if (Array.isArray(actions)) {
        return actions.map((a) => bindActionCreators(a, dispatch))
      }
      return bindActionCreators(actions, dispatch)
    },
    deps ? [dispatch, ...deps] : [dispatch],
  )
}
```

### Recipe: `useShallowEqualSelector()`

```js
import { useSelector, shallowEqual } from 'react-redux'

export function useShallowEqualSelector(selector) {
  return useSelector(selector, shallowEqual)
}
```

### Additional considerations when using hooks

There are some architectural trade-offs to take into consideration when deciding whether to use hooks or not. Mark Erikson summarizes these nicely in his two blog posts [Thoughts on React Hooks, Redux, and Separation of Concerns](https://blog.isquaredsoftware.com/2019/07/blogged-answers-thoughts-on-hooks/) and [Hooks, HOCs, and Tradeoffs](https://blog.isquaredsoftware.com/2019/09/presentation-hooks-hocs-tradeoffs/).
