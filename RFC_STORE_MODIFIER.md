# RFC - Dynamically modify the store from within the component tree

The original version of this RFC can be found in [#1150](https://github.com/reduxjs/react-redux/issues/1150)

The goal of this RFC is to provide an official way to modify the store from within the component tree (without getting it directly from `ReactReduxContext`). Modifications to the store might result in subtle bugs, especially with concurrent rendering, and should be considered unsafe.

The only guarantee React-Redux makes, is that if you use `replaceReducer` as a modification, the `storeState` on context will be patched with the new state for all children, even for the current render.

The secondary goal of this RFC is to make it easier out of the box to code split reducers.

(This file itself is never meant to be merged)

## Summary of problem (recap of #1126)

Omitted for brevity, see summary of the problem space in [#1150](https://github.com/reduxjs/react-redux/issues/1150), read early discussions in [#1126](https://github.com/reduxjs/react-redux/issues/1126)

## Proposed solution

Please note that this is just a rough sketch of what a solution could look like. I’d love feedback and to get a discussion going around both large issues and small. I've listed alternative solutions towards the end.

My hope is that this solution strikes a balance between being immediately useful and preserving the flexibility for users/libraries to construct a root-reducer and injection techniques however they feel like.

I am NOT proposing to hide the `ReactReduxContext` or disallow getting the store directly from it, merely to keep it as a non-public API for usecases not covered by this RFC.

**Goals:**

- Add API for adding reducers from the component tree
- Optionally: Make it easier/safer to do other dynamic store modifications (register sagas, epics etc)
- Do not require direct use of `store` or `ReactReduxContext` in userland
- Flexible API that supports both simple and complex usecases well
- Both existing and new libraries should be able to build more complex solutions on top of this API, but not have to worry about the intricacies of patching `storeState` on context when replacing reducers
- Small surface area
- Aligned with `react-redux` v6 approach for preparing for concurrent-safeness
- SSR-support

### Example usage

(Some imports etc omitted for brevity)

```jsx
import { withModifiedStore } from 'react-redux'
import reducer from './namesReducer'

function Greeter({ currentName }) {
  return `Hi ${currentName}!`
}

const mapStateToProps = state => ({
  currentName: state.names.currentName
})

// Structure of this object is not prescriptive,
// it depends entirely on the implementation of
// modifyStore
// In a sense this is quite like an action, in that it
// is an object that should describe the store modification
const modification = {
  newReducers: {
    names: reducer
  }
}

export default withModifiedStore(modification)(
  connect(mapStateToProps)(Greeter)
)
```

```jsx
import staticReducers from './staticReducers'

// Example simple userland implementation
let reducers = { ...staticReducers }
function modifyStore({ newReducers }, storeProxy, state) {
  reducers = { ...reducers, ...newReducers }
  storeProxy.replaceReducer(combineReducers(reducers))
}

const DynamicGreeter = React.lazy(() => import('./Greeter'))

ReactDOM.render(
  <Provider store={store} modifyStore={modifyStore}>
    <Suspense fallback={<div>Loading...</div>}>
      <DynamicGreeter />
    </Suspense>
  </Provider>
)
```

### API

#### `modifyStore(modification, storeProxy, state)`

This is a callback that is supposed to be implemented by the user/by libraries and passed into `Provider` or directly into `StoreModifier` or `withModifiedStore`.

Most implementations of `modifyStore` need to be stateful, and the only way to support this for SSR is to create one stateful instance per request. Passing it into `<Provider>` puts the function on the context behind the scenes and is the recommended approach even if SSR is not needed.

**Arguments (automatically passed in to the function)**

1. `modification` is an object that can contain any data that needs to be passed from the calling site (`<StoreModifier>`), for example reducers to be added to the store. There is no prescribed shape for this object, it is supposed to differ between implementations

2. `storeProxy` here is a wrapped version of `store` that spies on `replaceReducer` to be able to safely patch the context with the new state if it is called. Maybe this should be a stripped down version of `store`, leaving out `subscribe` and possibly other methods unsafe to use here? Could also keep them in but provide warnings.

3. `state` is passed in, in case it is needed for conditional logic, because `getState` is kind of unsafe here. This `state`-object contains the current state _stored on context for this render_ and is not the latest version of the state in the store.

**Returns**

This function can optionally return a cleanup-function, this will be called when the calling component unmounts. This way users can optionally implement functionality for removing reducers/unregistering sagas/epics when they are no longer needed.

#### `<StoreModifier modification={} modifyStore={}>{children}</StoreModifier>`

This component calls the `modifyStore` with the `modification` provided, a `storeProxy` and the current `storeState` from context. If `modifyStore` is not passed in directly, it is read from context. This only happens once. If a callback is returned from `modifyStore`, this is called on unmount.

If `replaceReducer` is called in `modifyStore`, this component wraps the children with a new context-provider with an updated `storeState`. The provider is only rendered on the first render pass since `storeState` will be correct after this.

**Arguments**

1. `modification` is an object that will be passed into `modifyStore`

2. `modifyStore` is an optional prop that allows for passing in a `modifyStore`-function directly to `<StoreModifier>`. This makes it possible to avoid having to pass it down via context and simplifying the API when SSR-support is not needed (libraries could support both versions).

3. `children` are the children that needs a modified store

#### `withModifiedStore(modification, options)(WrappedComponent)`

This is a Higher-Order-Component that wraps the `WrappedComponent` in a `<StoreModifier>`. It additionally takes care of hoisting statics on `WrappedComponent` and can optionally `forwardRef` to the wrapped component. As opposed to using `<StoreModifier>` directly, this HOC also supports using a custom `context` (if you are using something other than the default `ReactReduxContext`).

**Arguments**

1. `modification` is an object that will be passed into `modifyStore`

2. `options` is an optional object with the shape of: `{ context, forwardRef, modifyStore }`. `context` can be used to consume a custom context. If `forwardRef` is true, adding a ref to the connected wrapper component will actually return the instance of the wrapped component, (both these correspond to the same options in `connect`). `modifyStore` is for passing in a custom `modifyStore`-function, see description in `<StoreModifier>`.

3. `WrappedComponent` is the component to be wrapped with `<StoreModifier>`

**Returns**

A component that wraps the `WrappedComponent` in a `StoreModifier`

#### `createStoreModifier(context)`

This function returns a `StoreModifier`-component that uses the custom context provided to it. Can be used when a custom context is needed, but you don't want to use the HOC that supports this out of the box (libraries that want to avoid an extra component nesting for example).

**Arguments**

1. `context` is the custom context that you want the resulting component to use

**Returns**

A `StoreModifier`-component that uses the `context` passed in

### Unsolved questions

- Can naming be improved?
- It would be possible to support a middleware-style API for `modifyStore`, [as per this comment](https://github.com/reduxjs/react-redux/issues/1150#issuecomment-450596584). This could be implemented in userland, but it might make sense to add this as the official API to encourage modular `storeModifiers`?
  - In that case: How do we deal with namespacing-issues in the `modifier`-object?
  - API? `modifyStore` can take either a function or an array of functions? Or should users call a `composeStoreModifiers` manually if they wish to use several?
- Can part of the initial setup of a store also be described as a `modification` that is run manually after store creation? For example running sagas etc.
- If the above two points are true, should the primary concept of `storeModifier`/`storeModifiers` actually live in Redux, while only the `<Provider>`, `<StoreModifier>` and `withModifiedStore` be implemented here in React-Redux?
- Is this feasible to implement and maintain?
- Is this API flexible enough to build on safely as "concurrent rendering" evolves? Are there scenarios in which this API becomes limiting and hard to support?
- Should there be a default `modifyStore`-function that supports simple cases (that is, dynamically adding reducers)? What should it look like?

I think it would be possible to backport this to React-Redux <6 using legacy context. The positive side of that is that any library based on this solution could then support React-Redux <6 out of the box which would also allow for an incremental upgrade-path. Considering increased maintainer burden and lessened incentives to upgrade to v6, this might not be desirable though.

## Alternative solutions

Details omitted for brevity, see descriptions for these alternative solutions in [#1150](https://github.com/reduxjs/react-redux/issues/1150)

**Status quo** - Determine that it is fine that these solutions rely on non-public APIs

**Make ReactReduxContext part of public API** - Leave implementation to userland

**Add escape hatch for tearing** - As proposed in [#1126](https://github.com/reduxjs/react-redux/issues/1126)

**Add same functionality directly to existing connect-HOC** - Add a new option to connect

**Different API from the proposed one** - Based around same solution

**Something else?** - There might very well be solutions I have not thought about.

The actual implementation of this RFC could conceivably be hooks-based if backwards compatibility (to 16.4) is sacrificed, but it would be tricky to implement an ergonomic API that **is a hook** since they can not provide context, only consume it. I might have missed some smart solution though.

---

This is by no means a finished suggestion, I’d love to get a discussion going to improve it! Would it solve your usecase? It is a good fit to include in `react-redux`? Etc..
