---
id: batch
title: batch
sidebar_label: batch()
hide_title: true
description: 'API > batch: batching React rendering updates'
---

&nbsp;

# `batch()`

```js
batch((fn: () => void))
```

_added in v7.0.0_

:::info

**If you're using React 18, you do not need to use the `batch` API**. React 18 automatically batches _all_ state updates, no matter where they're queued.

:::

React's `unstable_batchedUpdates()` API allows any React updates in an event loop tick to be batched together into a single render pass. React already uses this internally for its own event handler callbacks. This API is actually part of the renderer packages like ReactDOM and React Native, not the React core itself.

Since React-Redux needs to work in both ReactDOM and React Native environments, we've taken care of importing this API from the correct renderer at build time for our own use. We also now re-export this function publicly ourselves, renamed to `batch()`. You can use it to ensure that multiple actions dispatched outside of React only result in a single render update, like this:

```ts
import { batch } from 'react-redux'

function myThunk() {
  return (dispatch, getState) => {
    // should only result in one combined re-render, not two
    batch(() => {
      dispatch(increment())
      dispatch(increment())
    })
  }
}
```

## References

- [`unstable_batchedUpdates()` API from React](https://github.com/facebook/react/commit/b41883fc708cd24d77dcaa767cde814b50b457fe)
- [React 18 Working Group: Automatic Batching for Fewer Renders in React 18](https://github.com/reactwg/react-18/discussions/21)
