---
id: accessing-store
title: Accessing the Store
hide_title: true
sidebar_label: Accessing the Store
---

# Accessing the Store

## Using `ReactReduxContext`

React Redux provides the necessary API that allows you to dispatch actions and subscribe to the store. Normally, you should not need to directly access the store. 

In case you need to, React Redux exports the default context instance it uses so that you may access the store by:

```js
import { ReactReduxContext } from 'react-redux'

// in your connected component
render() {
  return (
    <ReactReduxContext.Consumer>
      {({ store }) => <div>{store}</div>}
    </ReactReduxContext.Consumer>
  )
}
```

## Providing Custom Context

Instead of using the default context instance from React Redux, you may supply your own customize context instance.

```js
<Provider context={MyContext} store={store}>
  <App />
</Provider>
```

If you supply a custom context, React Redux will use that context instance instead of the one it creates and exports by default. 

After you’ve supplied the custom context to `<Provider />`, you will need to supply this context instance to all of your connected components that are expected to connect to the same store:

```js
export default connect(mapState, mapDispatch, null, {
  context: MyContext
})(MyComponent);

// or
const ConnectedComponent = connect(mapState, mapDispatch)(MyComponent);
<ConnectedComponent context={MyContext} />
```

The following runtime error occurs when React Redux does not find a store in the context it is looking. For example:
- You provided a custom context instance to `<Provider />`, but did not provide the same instance (or did not provide any) to your connected components.
- You provided a custom context to your connected component, but did not provide the same instance (or did not provide any) to `<Provider />`.

> Invariant Violation 
> 
> Could not find "store" in the context of "Connect(MyComponent)". Either wrap the root component in a <Provider>, or pass a custom React context provider to <Provider> and the corresponding React context consumer to Connect(Todo) in connect options.

## Multiple Stores

[Redux was designed to use a single store](https://redux.js.org/api/store#a-note-for-flux-users). 
However, if you are in an unavoidable position to use multiple stores, with v6 you may do so by providing (multiple) custom contexts. 
This also provides a natural isolation of the stores as they live in separate context instances.

```js
// a naive example
const ContextA = React.createContext();
const ContextB = React.createContext();

// assuming reducerA and reducerB are proper reducer functions
const storeA = createStore(reducerA);
const storeB = createStore(reducerB);

// supply the context instances to Provider
return (
  <Provider store={storeA} context={ContextA} />
    <Provider store={storeB} context={ContextB}>
      <App />
    </Provider>
  </Provider>
);

// fetch the corresponding store with connected components
// you need to use the correct context
connect(mapStateA, null, null, { context: ContextA })(MyComponentA)

// it is possible to chain connect()
// in this case MyComponent will receive stateProps, dispatchProps, mergedProps, etc from both stores
compose(
  connect(mapStateA, null, null, { context: ContextA }),
  connect(mapStateB, null, null, { context: ContextB })
)(MyComponent);
```

CodeSandbox example: [A reading list app with theme using a separate store](https://codesandbox.io/s/92pm9n2kl4), implemented by providing (multiple) custom context(s).

Related issue: [#1132](https://github.com/reduxjs/react-redux/issues/1132).