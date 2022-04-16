---
id: troubleshooting
title: Troubleshooting
sidebar_label: Troubleshooting
hide_title: true
---

&nbsp;

## Troubleshooting

The **[#redux channel](https://discord.gg/0ZcbPKXt5bZ6au5t)** of the **[Reactiflux Discord community](http://www.reactiflux.com)** is our official resource for all questions related to learning and using Redux. Reactiflux is a great place to hang out, ask questions, and learn - come join us!

You can also ask questions on [Stack Overflow](https://stackoverflow.com) using the **[#redux tag](https://stackoverflow.com/questions/tagged/redux)**.

### My views aren’t updating!

In short,

- Reducers should never mutate state, they must return new objects, or React Redux won’t see the updates.
- Make sure you are actually _dispatching_ actions. For example, if you have an action creator like `addTodo`, just calling the imported `addTodo()` function by itself won't do anything because it just _returns_ an action, but does not _dispatch_ it. You either need to call `dispatch(addTodo())` (if using the hooks API) or `props.addTodo()` (if using `connect` + `mapDispatch`).

### Could not find "store" in either the context or props

If you have context issues,

1. [Make sure you don’t have a duplicate instance of React](https://medium.com/@dan_abramov/two-weird-tricks-that-fix-react-7cf9bbdef375) on the page.
2. Make sure you don't have multiple instances/copies of React Redux in your project.
3. Make sure you didn’t forget to wrap your root or some other ancestor component in [`<Provider>`](#provider-store).
4. Make sure you’re running the latest versions of React and React Redux.

### Invariant Violation: addComponentAsRefTo(...): Only a ReactOwner can have refs. This usually means that you’re trying to add a ref to a component that doesn’t have an owner

If you’re using React for web, this usually means you have a [duplicate React](https://medium.com/@dan_abramov/two-weird-tricks-that-fix-react-7cf9bbdef375). Follow the linked instructions to fix this.

### I'm getting a warning about useLayoutEffect in my unit tests

ReactDOM emits this warning if `useLayoutEffect` is used "on the server". React Redux tries to get around the issue by detecting whether it is running within a browser context. Jest, by default, defines enough of the browser environment that React Redux thinks it's running in a browser, causing these warnings.

You can prevent the warning by setting the `@jest-environment` for a single test file:

```jsx
// my.test.jsx
/**
 * @jest-environment node
 */
```

Or by setting it globally:

```js
// package.json
{
  "name": "my-project",
  "jest": {
    "testEnvironment": "node"
  }
}
```

See https://github.com/facebook/react/issues/14927#issuecomment-490426131
