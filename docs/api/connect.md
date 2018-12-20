---
id: connect
title: Connect
sidebar_label: connect()
hide_title: true
---

# `connect()`

## Overview

`connect()` Connects a React component to a Redux store. 

It provides its connected component with part of the data it needs from the store, and the functions it can use to dispatch actions to the store.

It does not modify the component class passed to it; instead, it returns a new, connected component class that wraps the component you passed in.

```JavaScript
function connect(mapStateToProps?, mapDispatchToProps?, mergeProps?, options?)
```

The `mapStateToProps` and `mapDispatchToProps` deals with your Redux store’s `state` and `dispatch`, respectively. `state`  and `dispatch` will be supplied to your `mapStateToProps` or `mapDispatchToProps` functions as the first argument. 

The returns of `mapStateToProps` and `mapDispatchToProps` are regarded as `stateProps` and `dispatchProps`, respectively. They will be supplied to `mergeProps`, if defined, as the first and the second argument, where the third argument will be `ownProps`. The combined result, commonly referred to as `mergedProps`, will then be supplied to your connected component.

## `connect()` Parameters

`connect` accepts four different parameters, all optional. Conventionally, they are called:

1. `mapStateToProps?: Function`
2. `mapDispatchToProps?: Function | Object`
3. `mergeProps?: Function`
4. `options?: Object`


### `mapStateToProps?: (state, ownProps?) => Object` 

The component will only subscribe to the store and receive updates if you supply a `mapStateToProps` function. i.e., the following component will *not* subscribe to the store: 

```JavaScript
import { connect } from 'react-redux';
    
const MyComponent = (props) => (<div>A component not subscribed to store</div>);
// but it will receive `dispatch`
    
export default connect()(MyComponent);
```

If a `mapStateToProps` function is specified, the new component will subscribe to Redux store updates. This means that any time the store is updated, `mapStateToProps` will be called. The results of `mapStateToProps` must be a plain object, which will be merged into the component’s props. If you don't want to subscribe to store updates, pass `null` or `undefined` in place of `mapStateToProps`.

#### Parameters

1. `state: Object`
2. `ownProps?: Object`

A `mapStateToProps` function takes a maximum of two parameters. The number of declared function parameters (a.k.a. arity) affects when it will be called. This also determines whether the function will receive ownProps. See notes [here](#the-arity-of-maptoprops-functions).

##### `state`

If your `mapStateToProps` function is declared as taking one parameter, it will be called with the store state as the parameter. And will be called whenever the store changes.

```JavaScript
const mapStateToProps = (state) => ({ todos: state.todos });
````

##### `ownProps`

If your `mapStateToProps` function is declared as taking two parameters, it will be called with the store state as the first parameter and the props passed to the connected component as the second parameter, and will also be re-invoked whenever the connected component receives new props as determined by shallow equality comparisons. 

The second parameter is normally referred to as `ownProps` by convention.

```JavaScript
const mapStateToProps = (state, ownProps) => ({ todo: state.todos[ownProps.id] });
```

#### Returns

Your `mapStateToProps` functions are expected to return an object. This object, normally referred to as `stateProps`, will be merged as props to your connected component. If you define `mergeProps`, it will be supplied as the first parameter to `mergeProps`.

The return of the `mapStateToProps` determine whether the connected component will re-render (details [here](../using-react-redux/connect-mapstate#return-values-determine-if-your-component-re-renders)).

For more details on recommended usage of `mapStateToProps`, please refer to [our guide on using `mapStateToProps`](../using-react-redux/connect-mapstate).

> You may define `mapStateToProps` and `mapDispatchToProps` as a factory function, i.e., you return a function instead of an object. In this case your returned function will be treated as the real `mapStateToProps` or `mapDispatchToProps`, and be called in subsequent calls. You may see notes on [Factory Functions](#factory-functions) or our guide on performance optimizations.


### `mapDispatchToProps?: Object | (dispatch, ownProps?) => Object`

Conventionally called `mapDispatchToProps`, this second parameter to `connect()` may either be an object, a function, or not supplied.

Your component will receive `dispatch` by default, i.e., when you do not supply a second parameter to `connect()`:

```JavaScript
// do not pass `mapDispatchToProps`
connect()(MyComponent);
connect(mapDispatch)(MyComponent);
connect(mapDispatch, null, mergeProps, options)(MyComponent);
```

If you define a `mapDispatchToProps` as a function, it will be called with maximum of two parameters. 

#### Parameters


1. `dispatch: Function`
2. `ownProps?: Object`

##### `dispatch`

If your `mapDispatchToProps` is declared as taking one parameter, it will be given the `dispatch` of your `store`. 

```JavaScript
const mapDispatchToProps = dispatch => {
  return {
    // dispatching plain actions
    increment: () => dispatch({ type: "INCREMENT" }),
    decrement: () => dispatch({ type: "DECREMENT" }),
    reset: () => dispatch({ type: "RESET" })
  };
};
```

##### `ownProps`

If your `mapDispatchToProps` function is declared as taking two parameters, it will be called with `dispatch` as the first parameter and the props passed to the connected component as the second parameter, and will be re-invoked whenever the connected component receives new props. 

The second parameter is normally referred to as `ownProps` by convention.

```JavaScript
// binds on component re-rendering
<button onClick={() => this.props.toggleTodo(this.props.todoId)} />;
    
// binds on `props` change
const mapDispatchToProps = (dispatch, ownProps) => {
  toggleTodo: () => dispatch(toggleTodo(ownProps.todoId));
};
````

The number of declared function parameters of `mapDispatchToProps` determines whether they receive ownProps. See notes [here](#the-arity-of-maptoprops-functions).

#### Returns

Your `mapDispatchToProps` functions are expected to return an object. Each fields of the object should be a function, calling which is expected to dispatch an action to the store.

The return of your `mapDispatchToProps` functions are regarded as `dispatchProps`. It will be merged as props to your connected component. If you define `mergeProps`, it will be supplied as the second parameter to `mergeProps`.

```JavaScript
const createMyAction = () => ({ type: "MY_ACTION" });
const mapDispatchToProps = (dispatch, ownProps) => {
  const boundActions = bindActionCreators({ createMyAction }, dispatch);
  return {
    dispatchPlainObject: () => dispatch({ type: "MY_ACTION" }),
    dispatchActionCreatedByActionCreator: () => dispatch(createMyAction()),
    ...boundActions,
    // you may return dispatch here
    dispatch,
  }
};
```

For more details on recommended usage, please refer to [our guide on using `mapDispatchToProps`](../using-react-redux/connect-mapdispatch).

> You may define `mapStateToProps` and `mapDispatchToProps` as a factory function, i.e., you return a function instead of an object. In this case your returned function will be treated as the real `mapStateToProps` or `mapDispatchToProps`, and be called in subsequent calls. You may see notes on [Factory Functions](#factory-functions) or our guide on performance optimizations.

#### Object Shorthand Form

`mapDispatchToProps` may be an object where each field is an [action creator](https://redux.js.org/glossary#action-creator). 

```JavaScript
import { addTodo, deleteTodo, toggleTodo } from './actionCreators'
    
const mapDispatchToProps = {
  addTodo,
  deleteTodo,
  toggleTodo,
};
    
export default connect(null, mapDispatchToProps)(TodoApp)
```

In this case, React-Redux binds the `dispatch` of your store to each of the action creators using `bindActionCreators`. The result will be regarded as `dispatchProps`, which will be either directly merged to your connected components, or supplied to `mergeProps` as the second argument.

```JavaScript
// internally, React-Redux calls bindActionCreators 
// to bind the action creators to the dispatch of your store
bindActionCreators(mapDispatchToProps, dispatch)
```

We also have a section in our `mapDispatchToProps` guide on the usage of object shorthand form [here](../using-react-redux/connect-mapdispatch#defining-mapdispatchtoprops-as-an-object).


### `mergeProps?: (stateProps, dispatchProps, ownProps) => Object`

Your connected component receives `{ ...ownProps, ...stateProps, ...dispatchProps }` by default, when you do not provide `mergeProps`.

#### Parameters

`mergeProps` should be specified with maximum of three parameters. They are the result of `mapStateToProps()`, `mapDispatchToProps()`, and the parent `props`, respectively:

1. `stateProps`
2. `dispatchProps`
3. `ownProps`

The plain object you return from it will be passed as props to the wrapped component. You may specify this function to select a slice of the state based on props, or to bind action creators to a particular variable from props. 

#### Returns

The return of `mergeProps` is often regarded as `mergedProps` and will be passed to the wrapped component.


### `options?: Object`


```JavaScript
{
  context?: Object,
  pure?: boolean,
  areStatesEqual?: Function,
  areOwnPropsEqual?: Function,
  areOwnPropsEqual?: Function,
  areStatePropsEqual?: Function,
  areMergedPropsEqual?: Function,
  forwardRef?: boolean,

  /**
   * For 5.x only, the following two options are no longer supported in >= v6
   */
  withRef?: boolean, // replaced with forwardRef in v6
  storeKey?: string, // removed in v6
}
```

#### `context: Object`

> Note: This parameter is supported in >= v6.0 only

React-Redux v6 allows you to supply custom context to be used by React-Redux. 
You need to pass the instance of your context to both `<Provider />` and your connected component.
You may pass the context to your connected component either by passing it here as a field of option, or as a prop to your connected component in rendering.

```JavaScript
// const MyContext = React.createContext();
connect(mapStateToProps, mapDispatchToProps, null, { context: MyContext })(MyComponent);
```

#### `pure: boolean`


- default value: `true`

Assumes that the wrapped component is a “pure” component and does not rely on any input or state other than its props and the selected Redux store’s state. 

When `options.pure` is true, `connect` performs several equality checks that are used to avoid unnecessary calls to `mapStateToProps`, `mapDispatchToProps`, `mergeProps`, and ultimately to `render`. These include `areStatesEqual`, `areOwnPropsEqual`, `areStatePropsEqual`, and `areMergedPropsEqual`. While the defaults are probably appropriate 99% of the time, you may wish to override them with custom implementations for performance or other reasons. 

We provide a few examples in the following sections.

#### `areStatesEqual: (next: Object, prev: Object) => boolean`


- default value: `strictEqual: (next, prev) => prev === next`

When pure, compares incoming store state to its previous value. 

_Example 1_

```JavaScript
const areStatesEqual = (next, prev) => 
  prev.entities.todos === next.entities.todos;
```

You may wish to override `areStatesEqual` if your `mapStateToProps` function is computationally expensive and is also only concerned with a small slice of your state. The example above will effectively ignore state changes for everything but that slice of state.

_Example 2_

If you have impure reducers that mutate your store state, you may wish to override `areStatesEqual` to always return false:

```JavaScript
const areStatesEqual = () => false;
```

This would likely impact the other equality checks as well, depending on your `mapStateToProps` function.

`areOwnPropsEqual: (next: Object, prev: Object) => boolean`


- default value: `shallowEqual: (objA, objB) => boolean` 
  ( returns `true` when each field of the objects is equal )

When pure, compares incoming props to its previous value.

You may wish to override `areOwnPropsEqual` as a way to whitelist incoming props. You'd also have to implement `mapStateToProps`, `mapDispatchToProps` and `mergeProps` to also whitelist props. (It may be simpler to achieve this other ways, for example by using [recompose's mapProps](https://github.com/acdlite/recompose/blob/master/docs/API.md#mapprops).)

#### `areStatePropsEqual: (next: Object, prev: Object) => boolean`

- type: `function`
- default value: `shallowEqual`

When pure, compares the result of `mapStateToProps` to its previous value. 

#### `areMergedPropsEqual: (next: Object, prev: Object) => boolean`


- default value: `shallowEqual`

When pure, compares the result of `mergeProps` to its previous value.

You may wish to override `areStatePropsEqual` to use `strictEqual` if your `mapStateToProps` uses a memoized selector that will only return a new object if a relevant prop has changed. This would be a very slight performance improvement, since would avoid extra equality checks on individual props each time `mapStateToProps` is called.

You may wish to override `areMergedPropsEqual` to implement a `deepEqual` if your selectors produce complex props. ex: nested objects, new arrays, etc. (The deep equal check may be faster than just re-rendering.)

#### `forwardRef: boolean`

> Note: This parameter is supported in >= v6.0 only

If `{forwardRef : true}` has been passed to `connect`, adding a ref to the connected wrapper component will actually return the instance of the wrapped component.


#### `withRef: boolean`

> Note: This parameter is supported in v5.x only, and is no longer supported in v6.

- default value: `false`

If true, stores a ref to the wrapped component instance and makes it available via `getWrappedInstance()` method.

#### `storeKey: string`

> Note: This parameter is supported in v5.x only, and is no longer supported in v6.

- default value: `'store'`

The key of the context from where to read the store. You probably only need this if you are in the inadvisable position of having multiple stores.


## `connect()` Returns

The return of `connect()` is a wrapper function that takes your component and returns a wrapper component with the additional props it injects.

```JavaScript
import { login, logout } from './actionCreators';
    
// first call: returns a hoc that you can use to wrap any component
const connectUser = connect(state => state.user, { login, logout });
    
// second call: returns the wrapper component with mergedProps
// you may use the hoc to enable different components to get the same behavior
const ConnectedUserLogin = connectUser(Login);
const ConnectedUserProfile = connectUser(Profile);
```

The arity of the first call affects the behavior of the wrapper component. 
We include a list of examples of different use cases. 

- Inject just `dispatch` and don't listen to store

```JavaScript
export default connect()(TodoApp)
```

- Inject all action creators (`addTodo`, `completeTodo`, ...) without subscribing to the store

```JavaScript
import * as actionCreators from './actionCreators'
    
export default connect(null, actionCreators)(TodoApp)
```

- Inject `dispatch` and every field in the global state

> Don’t do this! It kills any performance optimizations because `TodoApp` will rerender after every state change. 
> It’s better to have more granular `connect()` on several components in your view hierarchy that each only listen to a relevant slice of the state.


```JavaScript
// don't do this!
export default connect(state => state)(TodoApp)
```

- Inject `dispatch` and `todos`

```JavaScript
function mapStateToProps(state) {
  return { todos: state.todos }
}
    
export default connect(mapStateToProps)(TodoApp)
```

- Inject `todos` and all action creators

```JavaScript
import * as actionCreators from './actionCreators'
    
function mapStateToProps(state) {
  return { todos: state.todos }
}

export default connect(mapStateToProps, actionCreators)(TodoApp)
```

- Inject `todos` and all action creators (`addTodo`, `completeTodo`, ...) as `actions`

```JavaScript
import * as actionCreators from './actionCreators'
import { bindActionCreators } from 'redux'
    
function mapStateToProps(state) {
  return { todos: state.todos }
}

function mapDispatchToProps(dispatch) {
  return { actions: bindActionCreators(actionCreators, dispatch) }
}
    
export default connect(mapStateToProps, mapDispatchToProps)(TodoApp)
```

- Inject `todos` and a specific action creator (`addTodo`)

```JavaScript
import { addTodo } from './actionCreators'
import { bindActionCreators } from 'redux'
    
function mapStateToProps(state) {
  return { todos: state.todos }
}

function mapDispatchToProps(dispatch) {
  return bindActionCreators({ addTodo }, dispatch)
}
    
export default connect(mapStateToProps, mapDispatchToProps)(TodoApp)
```

- Inject `todos` and specific action creators (`addTodo` and `deleteTodo`) with shorthand syntax

```JavaScript
import { addTodo, deleteTodo } from './actionCreators'
    
function mapStateToProps(state) {
  return { todos: state.todos }
}

const mapDispatchToProps = {
  addTodo,
  deleteTodo
}
    
export default connect(mapStateToProps, mapDispatchToProps)(TodoApp)
```

- Inject `todos`, `todoActionCreators` as `todoActions`, and `counterActionCreators` as `counterActions`

```JavaScript
import * as todoActionCreators from './todoActionCreators'
import * as counterActionCreators from './counterActionCreators'
import { bindActionCreators } from 'redux'
    
function mapStateToProps(state) {
  return { todos: state.todos }
}
    
function mapDispatchToProps(dispatch) {
  return {
    todoActions: bindActionCreators(todoActionCreators, dispatch),
    counterActions: bindActionCreators(counterActionCreators, dispatch)
  }
}
    
export default connect(mapStateToProps, mapDispatchToProps)(TodoApp)
```

- Inject `todos`, and todoActionCreators and counterActionCreators together as `actions`

```JavaScript
import * as todoActionCreators from './todoActionCreators'
import * as counterActionCreators from './counterActionCreators'
import { bindActionCreators } from 'redux'
    
function mapStateToProps(state) {
  return { todos: state.todos }
}
    
function mapDispatchToProps(dispatch) {
  return {
    actions: bindActionCreators(
      { ...todoActionCreators, ...counterActionCreators }, 
      dispatch
    )
  }
}
    
export default connect(mapStateToProps, mapDispatchToProps)(TodoApp)
```

- Inject `todos`, and all `todoActionCreators` and `counterActionCreators` directly as props

```JavaScript
import * as todoActionCreators from './todoActionCreators'
import * as counterActionCreators from './counterActionCreators'
import { bindActionCreators } from 'redux'
    
function mapStateToProps(state) {
  return { todos: state.todos }
}
    
function mapDispatchToProps(dispatch) {
  return bindActionCreators(
    { ...todoActionCreators, ...counterActionCreators }, 
    dispatch
  )
}
    
export default connect(mapStateToProps, mapDispatchToProps)(TodoApp)
```

- Inject `todos` of a specific user depending on props

```JavaScript
import * as actionCreators from './actionCreators'
    
function mapStateToProps(state, ownProps) {
  return { todos: state.todos[ownProps.userId] }
}
    
export default connect(mapStateToProps)(TodoApp)
```

- Inject `todos` of a specific user depending on props, and inject `props.userId` into the action

```JavaScript
import * as actionCreators from './actionCreators'
    
function mapStateToProps(state) {
  return { todos: state.todos }
}
    
function mergeProps(stateProps, dispatchProps, ownProps) {
  return Object.assign({}, ownProps, {
    todos: stateProps.todos[ownProps.userId],
    addTodo: (text) => dispatchProps.addTodo(ownProps.userId, text)
  })
}
    
export default connect(mapStateToProps, actionCreators, mergeProps)(TodoApp)
```


## Notes

### The Arity of `mapToProps` Functions 

The number of declared function parameters of `mapStateToProps` and `mapDispatchToProps` determines whether they receive `ownProps`


> Note: `ownProps` is not passed to `mapStateToProps` and `mapDispatchToProps` if the formal definition of the function contains one mandatory parameter (function has length 1). For example, functions defined like below won't receive `ownProps` as the second argument

```JavaScript
function mapStateToProps(state) {
  console.log(state); // state
  console.log(arguments[1]); // undefined
}

const mapStateToProps = (state, ownProps = {}) => {   
  console.log(state); // state   
  console.log(ownProps); // {} 
}
```

Functions with no mandatory parameters or two parameters **will receive** `ownProps`.

```JavaScript
const mapStateToProps = (state, ownProps) => {
  console.log(state); // state
  console.log(ownProps); // ownProps
}

function mapStateToProps() {
  console.log(arguments[0]); // state
  console.log(arguments[1]); // ownProps
}

const mapStateToProps = (...args) => {
  console.log(args[0]); // state
  console.log(args[1]); // ownProps
}
```

### Factory Functions

If your `mapStateToProps` or `mapDispatchToProps` functions return a function, they will be called once when the component instantiates, and their returns will be used as the actual  `mapStateToProps`, `mapDispatchToProps`, functions respectively, in their subsequent calls.

The factory functions are commonly used with memoized selectors. This gives you the ability to create component-instance-specific selectors inside the closure:


```JavaScript
const makeUniqueSelectorInstance = () => createSelector(     
  [selectItems, selectItemId],     
  (items, itemId) => items[itemId] 
);       
const makeMapState = (state) => {     
  const selectItemForThisComponent = makeUniqueSelectorInstance();      
  return function realMapState(state, ownProps) {         
    const item = selectItemForThisComponent(state, ownProps.itemId);          
    return {item};     
  } 
};  
export default connect(makeMapState)(SomeComponent);
```