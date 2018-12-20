---
id: create-provider
title: createProvider
sidebar_label: createProvider() (deprecated)
hide_title: true
---

# `createProvider()`

> Note: This function is supported in v5.x only, and is no longer supported in v6.

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
