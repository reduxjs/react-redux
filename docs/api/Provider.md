---
id: provider
title: Provider
sidebar_label: Provider
hide_title: true
---

# `Provider`

## Overview

The `<Provider>` component makes the Redux `store` available to any nested components that need to access the Redux store.

Since any React component in a React Redux app can be connected to the store, most applications will render a `<Provider>` at the top level, with the entire app’s component tree inside of it.

The [Hooks](./hooks.md) and [`connect`](./connect.md) APIs can then access the provided store instance via React's Context mechanism.

### Props

`store` ([Redux Store](https://redux.js.org/api/store))
The single Redux `store` in your application.

`children` (ReactElement)
The root of your component hierarchy.

`context`
You may provide a context instance. If you do so, you will need to provide the same context instance to all of your connected components as well. Failure to provide the correct context results in runtime error:

> Invariant Violation
>
> Could not find "store" in the context of "Connect(MyComponent)". Either wrap the root component in a `<Provider>`, or pass a custom React context provider to `<Provider>` and the corresponding React context consumer to Connect(Todo) in connect options.



### Example Usage

In the example below, the `<App />` component is our root-level component. This means it’s at the very top of our component hierarchy.


```jsx
import React from 'react'
import ReactDOM from 'react-dom'
import { Provider } from 'react-redux'

import { App } from './App'
import createStore from './createReduxStore'

const store = createStore()

ReactDOM.render(
  <Provider store={store}>
    <App />
  </Provider>,
  document.getElementById('root')
)
```

