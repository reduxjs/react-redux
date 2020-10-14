---
id: provider
title: Provider
sidebar_label: Provider
---

# `<Provider />`

## Overview

The `<Provider />` makes the Redux `store` available to any nested components that have been wrapped in the `connect()` function.

Since any React component in a React-Redux app can be connected, most applications will render a `<Provider>` at the top level, with the entire app’s component tree inside of it.

Normally, you can’t use a connected component unless it is nested inside of a `<Provider>` .

Note: If you really need to, you can manually pass `store` as a prop to a connected component, but we only recommend to do this for stubbing `store` in unit tests, or in non-fully-React codebases. Normally, you should just use `<Provider>`.

### Props

`store` (Redux Store)
The single Redux `store` in your application.

`children` (ReactElement)
The root of your component hierarchy.


### Example Usage

In the example below, the `<App />` component is our root-level component. This means it’s at the very top of our component hierarchy.

**Vanilla React Example**

```jsx
    import React from 'react';
    import ReactDOM from 'react-dom';
    import { Provider } from 'react-redux';

    import { App } from './App';
    import createStore from './createReduxStore';

    const store = createStore();

    ReactDOM.render(
      <Provider store={store}>
        <App />
      </Provider>,
      document.getElementById('root')
    )
```    


**Usage with React Router**

```jsx
    import React from 'react';
    import ReactDOM from 'react-dom';
    import { Provider } from 'react-redux';
    import { Router, Route } from 'react-router-dom';

    import { App } from './App';
    import { Foo } from './Foo';
    import { Bar } from './Bar';
    import createStore from './createReduxStore';

    const store = createStore();

    ReactDOM.render(
      <Provider store={store}>
        <Router history={history}>
          <Route path="/" component={App}>
            <Route path="foo" component={Foo}/>
            <Route path="bar" component={Bar}/>
          </Route>
        </Router>
      </Provider>,
      document.getElementById('root')
    )
```    

## createProvider

```js
createProvider([storeKey])
```

Creates a new `<Provider>` which will set the Redux Store on the passed key of the context. You probably only need this if you are in the inadvisable position of having multiple stores. You will also need to pass the same `storeKey` to the `options` argument of [`connect`](#connectmapstatetoprops-mapdispatchtoprops-mergeprops-options)

### Arguments

* [`storeKey`] (*String*): The key of the context on which to set the store. Default value: `'store'`

### Examples
Before creating multiple stores, please go through this FAQ: [Can or should I create multiple stores?](http://redux.js.org/docs/faq/StoreSetup.html#can-or-should-i-create-multiple-stores-can-i-import-my-store-directly-and-use-it-in-components-myself)

```js
import {connect, createProvider} from 'react-redux'

const STORE_KEY = 'componentStore'

export const Provider = createProvider(STORE_KEY)

function connectExtended(
  mapStateToProps,
  mapDispatchToProps,
  mergeProps,
  options = {}
) {
  options.storeKey = STORE_KEY
  return connect(
    mapStateToProps,
    mapDispatchToProps,
    mergeProps,
    options
  )
}

export {connectExtended as connect}
```
Now you can import the above `Provider` and `connect` and use them.
