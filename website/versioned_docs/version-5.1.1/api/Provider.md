---
id: version-5.1.1-provider
title: Provider
sidebar_label: Provider
original_id: provider
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
