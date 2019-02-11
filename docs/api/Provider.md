---
id: provider
title: Provider
sidebar_label: Provider
hide_title: true
---

# `Provider`

## Overview

The `<Provider />` makes the Redux `store` available to any nested components that have been wrapped in the `connect()` function.

Since any React component in a React Redux app can be connected, most applications will render a `<Provider>` at the top level, with the entire app’s component tree inside of it.

Normally, you can’t use a connected component unless it is nested inside of a `<Provider>`.

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

**Note:** You do not need to provide custom context in order to access the store.
React Redux exports the context instance it uses by default so that you can access the store by:

```js
import { ReactReduxContext } from 'react-redux'

// in your connected component
render() {
  return (
    <ReactReduxContext.Consumer>
      {({ store }) => {
        // do something with the store here
      }}
    </ReactReduxContext.Consumer>
  )
}
```

### Example Usage

In the example below, the `<App />` component is our root-level component. This means it’s at the very top of our component hierarchy.

**Vanilla React Example**

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

**Usage with React Router**

```jsx
import React from 'react'
import ReactDOM from 'react-dom'
import { Provider } from 'react-redux'
import { Router, Route } from 'react-router-dom'

import { App } from './App'
import { Foo } from './Foo'
import { Bar } from './Bar'
import createStore from './createReduxStore'

const store = createStore()

ReactDOM.render(
  <Provider store={store}>
    <Router history={history}>
      <Route exact path="/" component={App} />
      <Route path="/foo" component={Foo} />
      <Route path="/bar" component={Bar} />
    </Router>
  </Provider>,
  document.getElementById('root')
)
```
