---
id: quick-start
title: Quick Start
hide_title: true
sidebar_label: Quick Start
---

# Quick Start

[React Redux](https://github.com/reduxjs/react-redux) is the official [React](https://reactjs.org/) binding for [Redux](https://redux.js.org/). It lets your React components read data from a Redux store, and dispatch actions to the store to update data.

## Installation

React Redux 7.1 requires **React 16.8.3 or later.**

To use React Redux with your React app:

```bash
npm install react-redux
```

or

```bash
yarn add react-redux
```

You'll also need to [install Redux](https://redux-docs.netlify.com/introduction/installation) and [set up a Redux store](https://redux-docs.netlify.com/recipes/configuring-your-store) in your app.

## `Provider`

React Redux provides `<Provider />`, which makes the Redux store available to the rest of your app:

```js
import React from 'react'
import ReactDOM from 'react-dom'

import { Provider } from 'react-redux'
import store from './store'

import App from './App'

const rootElement = document.getElementById('root')
ReactDOM.render(
  <Provider store={store}>
    <App />
  </Provider>,
  rootElement
)
```

## `connect()`

React Redux provides a `connect` function for you to connect your component to the store.

Normally, you’ll call `connect` in this way:

```js
import { connect } from 'react-redux'
import { increment, decrement, reset } from './actionCreators'

// const Counter = ...

const mapStateToProps = (state /*, ownProps*/) => {
  return {
    counter: state.counter
  }
}

const mapDispatchToProps = { increment, decrement, reset }

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(Counter)
```

## Help and Discussion

The **[#redux channel](https://discord.gg/0ZcbPKXt5bZ6au5t)** of the **[Reactiflux Discord community](http://www.reactiflux.com)** is our official resource for all questions related to learning and using Redux. Reactiflux is a great place to hang out, ask questions, and learn - come join us!

You can also ask questions on [Stack Overflow](https://stackoverflow.com) using the **[#redux tag](https://stackoverflow.com/questions/tagged/redux)**.
