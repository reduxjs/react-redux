---
id: version-5.1.1-quick-start
title: Quick Start
hide_title: true
sidebar_label: Quick Start
original_id: quick-start
---

# Quick Start

[React-Redux](https://github.com/reduxjs/react-redux) is the official [React](https://reactjs.org/) binding for [Redux](https://redux.js.org/). It lets your React components read data from a Redux store, and dispatch actions to the store to update data.

## Installation

To use React-Redux with your React app:

```bash
npm install --save react-redux
```

or

```bash
yarn add react-redux
```

## `Provider` and `connect`

React-Redux provides `<Provider />`, which makes the Redux store available to the rest of your app:

```js
import React from "react";
import ReactDOM from "react-dom";

import { Provider } from "react-redux";
import store from "./store";

import App from "./App";

const rootElement = document.getElementById("root");
ReactDOM.render(
  <Provider store={store}>
    <App />
  </Provider>,
  rootElement
);
```

React-Redux provides a `connect` function for you to connect your component to the store.

Normally, you’ll call `connect` in this way:

```js
import { connect } from "react-redux";
import { increment, decrement, reset } from "./actionCreators";

// const Counter = ...

const mapStateToProps = (state /*, ownProps*/) => {
  return {
    counter: state.counter
  };
};

const mapDispatchToProps = { increment, decrement, reset };

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(Counter);
```
