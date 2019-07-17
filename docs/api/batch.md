---
id: batch
title: batch
sidebar_label: batch()
hide_title: true
---

# `batch()`

```js
batch(fn: Function)
```

React's `unstable_batchedUpdates()` API allows any React updates in an event loop tick to be batched together into a single render pass. React already uses this internally for its own event handler callbacks. This API is actually part of the renderer packages like ReactDOM and React Native, not the React core itself.

Since React-Redux needs to work in both ReactDOM and React Native environments, we've taken care of importing this API from the correct renderer at build time for our own use. We also now re-export this function publicly ourselves, renamed to `batch()`. You can use it to ensure that multiple actions dispatched outside of React only result in a single render update, like this:

```js
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
