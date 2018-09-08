# Quick Start

### 1. Install

```console
foo@bar:~$ npm install --save react-redux
```

### 2. Set up the `<Provider />`

```js
import React from "react";
import ReactDOM from "react-dom";
import TodoApp from "./TodoApp";

import { Provider } from "react-redux";
import store from "./redux/store";

const rootElement = document.getElementById("root");
ReactDOM.render(
  <Provider store={store}>
    <TodoApp />
  </Provider>,
  rootElement
);
```

### 3. Connect a component

```js
connect(mapStateToProps, dispatchProps)(Component)
```
