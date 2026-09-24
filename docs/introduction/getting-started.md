---
id: getting-started
title: Getting Started with React Redux
hide_title: true
sidebar_label: Getting Started
description: 'Introduction > Getting Started: First steps with React Redux'
---

&nbsp;

# Getting Started with React Redux

[React Redux](https://github.com/reduxjs/react-redux) is the official [React](https://react.dev/) UI bindings layer for [Redux](/). It lets your React components read data from a Redux store, and dispatch actions to the store to update state.

## Installation

React Redux 9.x requires **React 18 or later** / **React Native 0.69 or later**. It works with Redux 5 and Redux Toolkit 2.

If your app is still on React 16.8 or 17, use React Redux 8.x, which requires **React 16.8.3 or later** / **React Native 0.59 or later**.

### Create a React Redux App

The recommended way to start new apps with React and Redux is by using [our official Redux+TS template for Vite](https://github.com/reduxjs/redux-templates), or by creating a new Next.js project using [Next's `with-redux` template](https://github.com/vercel/next.js/tree/canary/examples/with-redux).

Both of these already have Redux Toolkit and React-Redux configured appropriately for that build tool, and come with a small example app that demonstrates how to use several of Redux Toolkit's features.

```bash
# Vite with our Redux+TS template
# (using the `tiged` tool to clone and extract the template)
npx tiged reduxjs/redux-templates/packages/vite-template-redux my-app

# Next.js using the `with-redux` template
npx create-next-app --example with-redux my-app
```

For React Native, we have [an official Redux+TS template for Expo](https://github.com/reduxjs/redux-templates/tree/master/packages/expo-template-redux-typescript):

```bash
npx tiged reduxjs/redux-templates/packages/expo-template-redux-typescript my-app
```

### An Existing React App

To use React Redux with your React app, install it as a dependency:

```bash
# If you use npm:
npm install react-redux

# Or if you use Yarn:
yarn add react-redux
```

You'll also need to [install Redux Toolkit](/toolkit/introduction/getting-started#installation) and [set up a Redux store](/usage/configuring-your-store) in your app.

React-Redux v8 is written in TypeScript, so all types are automatically included.

## API Overview

### `Provider`

React Redux includes a `<Provider />` component, which makes the Redux store available to the rest of your app:

```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'

import { Provider } from 'react-redux'
import store from './store'

import App from './App'

// As of React 18
const root = ReactDOM.createRoot(document.getElementById('root'))
root.render(
  <Provider store={store}>
    <App />
  </Provider>,
)
```

### Hooks

React Redux provides a pair of custom React hooks that allow your React components to interact with the Redux store.

`useSelector` reads a value from the store state and subscribes to updates, while `useDispatch` returns the store's `dispatch` method to let you dispatch actions.

```jsx
import React from 'react'
import { useSelector, useDispatch } from 'react-redux'
import {
  decrement,
  increment,
  incrementByAmount,
  incrementAsync,
  selectCount,
} from './counterSlice'
import styles from './Counter.module.css'

export function Counter() {
  const count = useSelector(selectCount)
  const dispatch = useDispatch()

  return (
    <div>
      <div className={styles.row}>
        <button
          className={styles.button}
          aria-label="Increment value"
          onClick={() => dispatch(increment())}
        >
          +
        </button>
        <span className={styles.value}>{count}</span>
        <button
          className={styles.button}
          aria-label="Decrement value"
          onClick={() => dispatch(decrement())}
        >
          -
        </button>
      </div>
      {/* omit additional rendering output here */}
    </div>
  )
}
```

## Learning React Redux

To learn how to use React Redux, start with the [**Redux Quick Start**](/tutorials/quick-start), then work through the [**Redux Essentials tutorial**](/tutorials/essentials/part-1-overview-concepts). The [**Tutorials Index**](/tutorials/index) lists all of the tutorials and video resources, and the [**Getting Started with Redux**](/introduction/getting-started) page has links for help and discussion.

## Docs Translations

- [Portuguese](https://fernandobelotto.github.io/react-redux)
