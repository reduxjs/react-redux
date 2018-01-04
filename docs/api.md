## API

<a id="provider"></a>
### `<Provider store>`

Makes the Redux store available to the `connect()` calls in the component hierarchy below. Normally, you can’t use `connect()` without wrapping a parent or ancestor component in `<Provider>`.

If you *really* need to, you can manually pass `store` as a prop to every `connect()`ed component, but we only recommend to do this for stubbing `store` in unit tests, or in non-fully-React codebases. Normally, you should just use `<Provider>`.

#### Props

* `store` (*[Redux Store](http://redux.js.org/docs/api/Store.html)*): The single Redux store in your application.
* `children` (*ReactElement*) The root of your component hierarchy.

#### Example

##### Vanilla React

```js
ReactDOM.render(
  <Provider store={store}>
    <MyRootComponent />
  </Provider>,
  rootEl
)
```

##### React Router

```js
ReactDOM.render(
  <Provider store={store}>
    <Router history={history}>
      <Route path="/" component={App}>
        <Route path="foo" component={Foo}/>
        <Route path="bar" component={Bar}/>
      </Route>
    </Router>
  </Provider>,
  document.getElementById('root')
)
```


<a id="connect"></a>
### `connect([mapStateToProps], [mapDispatchToProps], [mergeProps], [options])`

Connects a React component to a Redux store. `connect` is a facade around `connectAdvanced`, providing a convenient API for the most common use cases.

It does not modify the component class passed to it; instead, it *returns* a new, connected component class for you to use.

<a id="connect-arguments"></a>
#### Arguments

* [`mapStateToProps(state, [ownProps]): stateProps`] \(*Function*): If this argument is specified, the new component will subscribe to Redux store updates. This means that any time the store is updated, `mapStateToProps` will be called. The results of `mapStateToProps` must be a plain object, which will be merged into the component’s props. If you don't want to subscribe to store updates, pass `null` or `undefined` in place of `mapStateToProps`. 

  If your `mapStateToProps` function is declared as taking two parameters, it will be called with the store state as the first parameter and the props passed to the connected component as the second parameter, and will also be re-invoked whenever the connected component receives new props as determined by shallow equality comparisons.  (The second parameter is normally referred to as `ownProps` by convention.)

  >Note: in advanced scenarios where you need more control over the rendering performance, `mapStateToProps()` can also return a function. In this case, *that* function will be used as `mapStateToProps()` for a particular component instance. This allows you to do per-instance memoization. You can refer to [#279](https://github.com/reactjs/react-redux/pull/279) and the tests it adds for more details. Most apps never need this.

  >The `mapStateToProps` function's first argument is the entire Redux store’s state and it returns an object to be passed as props. It is often called a **selector**. Use [reselect](https://github.com/reactjs/reselect) to efficiently compose selectors and [compute derived data](http://redux.js.org/docs/recipes/ComputingDerivedData.html).

* [`mapDispatchToProps(dispatch, [ownProps]): dispatchProps`] \(*Object* or *Function*): If an object is passed, each function inside it is assumed to be a Redux action creator. An object with the same function names, but with every action creator wrapped into a `dispatch` call so they may be invoked directly, will be merged into the component’s props.  

  If a function is passed, it will be given `dispatch` as the first parameter.  It’s up to you to return an object that somehow uses `dispatch` to bind action creators in your own way. (Tip: you may use the [`bindActionCreators()`](http://reactjs.github.io/redux/docs/api/bindActionCreators.html) helper from Redux.)  
  
  If your `mapDispatchToProps` function is declared as taking two parameters, it will be called with `dispatch` as the first parameter and the props passed to the connected component as the second parameter, and will be re-invoked whenever the connected component receives new props.  (The second parameter is normally referred to as `ownProps` by convention.)

  If you do not supply your own `mapDispatchToProps` function or object full of action creators, the default `mapDispatchToProps` implementation just injects `dispatch` into your component’s props.

  >Note: in advanced scenarios where you need more control over the rendering performance, `mapDispatchToProps()` can also return a function. In this case, *that* function will be used as `mapDispatchToProps()` for a particular component instance. This allows you to do per-instance memoization. You can refer to [#279](https://github.com/reactjs/react-redux/pull/279) and the tests it adds for more details. Most apps never need this.

* [`mergeProps(stateProps, dispatchProps, ownProps): props`] \(*Function*): If specified, it is passed the result of `mapStateToProps()`, `mapDispatchToProps()`, and the parent `props`. The plain object you return from it will be passed as props to the wrapped component. You may specify this function to select a slice of the state based on props, or to bind action creators to a particular variable from props. If you omit it, `Object.assign({}, ownProps, stateProps, dispatchProps)` is used by default.

* [`options`] *(Object)* If specified, further customizes the behavior of the connector. In addition to the options passable to `connectAdvanced()` (see those below), `connect()` accepts these additional options:
  * [`pure`] *(Boolean)*: If true, `connect()` will avoid re-renders and calls to `mapStateToProps`, `mapDispatchToProps`, and `mergeProps` if the relevant state/props objects remain equal based on their respective equality checks. Assumes that the wrapped component is a “pure” component and does not rely on any input or state other than its props and the selected Redux store’s state. Default value: `true`
  * [`areStatesEqual`] *(Function)*: When pure, compares incoming store state to its previous value. Default value: `strictEqual (===)`
  * [`areOwnPropsEqual`] *(Function)*: When pure, compares incoming props to its previous value. Default value: `shallowEqual`
  * [`areStatePropsEqual`] *(Function)*: When pure, compares the result of `mapStateToProps` to its previous value. Default value: `shallowEqual`
  * [`areMergedPropsEqual`] *(Function)*: When pure, compares the result of `mergeProps` to its previous value. Default value: `shallowEqual`
  * [`storeKey`] *(String)*: The key of the context from where to read the store. You probably only need this if you are in the inadvisable position of having multiple stores. Default value: `'store'`

<a id="connect-arguments-arity"></a>
##### The arity of mapStateToProps and mapDispatchToProps determines whether they receive ownProps

> Note: `ownProps` **is not passed** to `mapStateToProps` and `mapDispatchToProps` if the formal definition of the function contains one mandatory parameter (function has length 1). For example, functions defined like below won't receive `ownProps` as the second argument.
```javascript
function mapStateToProps(state) {
  console.log(state); // state
  console.log(arguments[1]); // undefined
}
```
```javascript
const mapStateToProps = (state, ownProps = {}) => {
  console.log(state); // state
  console.log(ownProps); // undefined
}
```
Functions with no mandatory parameters or two parameters **will receive** `ownProps`.
```javascript
const mapStateToProps = (state, ownProps) => {
  console.log(state); // state
  console.log(ownProps); // ownProps
}
```
```javascript
function mapStateToProps() {
  console.log(arguments[0]); // state
  console.log(arguments[1]); // ownProps
}
```
```javascript
const mapStateToProps = (...args) => {
  console.log(args[0]); // state
  console.log(args[1]); // ownProps
}
```

<a id="connect-optimizing"></a>
##### Optimizing connect when options.pure is true

When `options.pure` is true, `connect` performs several equality checks that are used to avoid unnecessary calls to `mapStateToProps`, `mapDispatchToProps`, `mergeProps`, and ultimately to `render`. These include `areStatesEqual`, `areOwnPropsEqual`, `areStatePropsEqual`, and `areMergedPropsEqual`. While the defaults are probably appropriate 99% of the time, you may wish to override them with custom implementations for performance or other reasons. Here are several examples:

* You may wish to override `areStatesEqual` if your `mapStateToProps` function is computationally expensive and is also only concerned with a small slice of your state. For example: `areStatesEqual: (next, prev) => prev.entities.todos === next.entities.todos`; this would effectively ignore state changes for everything but that slice of state.

* You may wish to override `areStatesEqual` to always return false (`areStatesEqual: () => false`) if you have impure reducers that mutate your store state. (This would likely impact the other equality checks as well, depending on your `mapStateToProps` function.)

* You may wish to override `areOwnPropsEqual` as a way to whitelist incoming props. You'd also have to implement `mapStateToProps`, `mapDispatchToProps` and `mergeProps` to also whitelist props. (It may be simpler to achieve this other ways, for example by using [recompose's mapProps](https://github.com/acdlite/recompose/blob/master/docs/API.md#mapprops).)

* You may wish to override `areStatePropsEqual` to use `strictEqual` if your `mapStateToProps` uses a memoized selector that will only return a new object if a relevant prop has changed. This would be a very slight performance improvement, since would avoid extra equality checks on individual props each time `mapStateToProps` is called.

* You may wish to override `areMergedPropsEqual` to implement a `deepEqual` if your selectors produce complex props. ex: nested objects, new arrays, etc. (The deep equal check should be faster than just re-rendering.)

#### Returns

A higher-order React component class that passes state and action creators into your component derived from the supplied arguments. This is created by `connectAdvanced`, and details of this higher-order component are covered there.

<a id="connect-examples"></a>
#### Examples

##### Inject just `dispatch` and don't listen to store

```js
export default connect()(TodoApp)
```

##### Inject all action creators  (`addTodo`, `completeTodo`, ...) without subscribing to the store

```js
import * as actionCreators from './actionCreators'

export default connect(null, actionCreators)(TodoApp)
```

##### Inject `dispatch` and every field in the global state

>Don’t do this! It kills any performance optimizations because `TodoApp` will rerender after every state change.  
>It’s better to have more granular `connect()` on several components in your view hierarchy that each only  
>listen to a relevant slice of the state.

```js
export default connect(state => state)(TodoApp)
```

##### Inject `dispatch` and `todos`

```js
function mapStateToProps(state) {
  return { todos: state.todos }
}

export default connect(mapStateToProps)(TodoApp)
```

##### Inject `todos` and all action creators

```js
import * as actionCreators from './actionCreators'

function mapStateToProps(state) {
  return { todos: state.todos }
}

export default connect(mapStateToProps, actionCreators)(TodoApp)
```

##### Inject `todos` and all action creators (`addTodo`, `completeTodo`, ...) as `actions`

```js
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

#####  Inject `todos` and a specific action creator (`addTodo`)

```js
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

#####  Inject `todos` and specific action creators (`addTodo` and `deleteTodo`) with shorthand syntax
```js
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

##### Inject `todos`, todoActionCreators as `todoActions`, and counterActionCreators as `counterActions`

```js
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

##### Inject `todos`, and todoActionCreators and counterActionCreators together as `actions`

```js
import * as todoActionCreators from './todoActionCreators'
import * as counterActionCreators from './counterActionCreators'
import { bindActionCreators } from 'redux'

function mapStateToProps(state) {
  return { todos: state.todos }
}

function mapDispatchToProps(dispatch) {
  return {
    actions: bindActionCreators(Object.assign({}, todoActionCreators, counterActionCreators), dispatch)
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(TodoApp)
```

##### Inject `todos`, and all todoActionCreators and counterActionCreators directly as props

```js
import * as todoActionCreators from './todoActionCreators'
import * as counterActionCreators from './counterActionCreators'
import { bindActionCreators } from 'redux'

function mapStateToProps(state) {
  return { todos: state.todos }
}

function mapDispatchToProps(dispatch) {
  return bindActionCreators(Object.assign({}, todoActionCreators, counterActionCreators), dispatch)
}

export default connect(mapStateToProps, mapDispatchToProps)(TodoApp)
```

##### Inject `todos` of a specific user depending on props

```js
import * as actionCreators from './actionCreators'

function mapStateToProps(state, ownProps) {
  return { todos: state.todos[ownProps.userId] }
}

export default connect(mapStateToProps)(TodoApp)
```

##### Inject `todos` of a specific user depending on props, and inject `props.userId` into the action

```js
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

##### Factory functions
Factory functions can be used for performance optimizations

```js
import { addTodo } from './actionCreators'

function mapStateToPropsFactory(initialState, initialProps) {
  const getSomeProperty= createSelector(...);
  const anotherProperty = 200 + initialState[initialProps.another];
  return function(state){
    return {
      anotherProperty,
      someProperty: getSomeProperty(state),
      todos: state.todos
    }
  }
}

function mapDispatchToPropsFactory(initialState, initialProps) {
  function goToSomeLink(){
    initialProps.history.push('some/link');
  }
  return function(dispatch){
    return {
      addTodo
    }
  }
}


export default connect(mapStateToPropsFactory, mapDispatchToPropsFactory)(TodoApp)
```

<a id="connectAdvanced"></a>
### `connectAdvanced(selectorFactory, [connectOptions])`

Connects a React component to a Redux store. It is the base for `connect()` but is less opinionated about how to combine `state`, `props`, and `dispatch` into your final props. It makes no assumptions about defaults or memoization of results, leaving those responsibilities to the caller.

It does not modify the component class passed to it; instead, it *returns* a new, connected component class for you to use.

<a id="connectAdvanced-arguments"></a>
#### Arguments

* `selectorFactory(dispatch, factoryOptions): selector(state, ownProps): props` \(*Function*): Initializes a selector function (during each instance's constructor). That selector function is called any time the connector component needs to compute new props, as a result of a store state change or receiving new props. The result of `selector` is expected to be a plain object, which is passed as the props to the wrapped component. If a consecutive call to `selector` returns the same object (`===`) as its previous call, the component will not be re-rendered. It's the responsibility of `selector` to return that previous object when appropriate.

* [`connectOptions`] *(Object)* If specified, further customizes the behavior of the connector.

  * [`getDisplayName`] *(Function)*: computes the connector component's displayName property relative to that of the wrapped component. Usually overridden by wrapper functions. Default value: `name => 'ConnectAdvanced('+name+')'`

  * [`methodName`] *(String)*: shown in error messages. Usually overridden by wrapper functions. Default value: `'connectAdvanced'`

  * [`renderCountProp`] *(String)*: if defined, a property named this value will be added to the props passed to the wrapped component. Its value will be the number of times the component has been rendered, which can be useful for tracking down unnecessary re-renders. Default value: `undefined`

  * [`shouldHandleStateChanges`] *(Boolean)*: controls whether the connector component subscribes to redux store state changes. If set to false, it will only re-render on `componentWillReceiveProps`. Default value:  `true`

  * [`storeKey`] *(String)*: the key of props/context to get the store. You probably only need this if you are in the inadvisable position of having multiple stores. Default value: `'store'`

  * [`withRef`] *(Boolean)*: If true, stores a ref to the wrapped component instance and makes it available via `getWrappedInstance()` method. Default value: `false`
 
  * Additionally, any extra options passed via `connectOptions` will be passed through to your `selectorFactory` in the `factoryOptions` argument.

<a id="connectAdvanced-returns"></a>
#### Returns

A higher-order React component class that builds props from the store state and passes them to the wrapped component. A higher-order component is a function which accepts a component argument and returns a new component.

##### Static Properties

* `WrappedComponent` *(Component)*: The original component class passed to `connectAdvanced(...)(Component)`.

##### Static Methods

All the original static methods of the component are hoisted.

##### Instance Methods

###### `getWrappedInstance(): ReactComponent`

Returns the wrapped component instance. Only available if you pass `{ withRef: true }` as part of the `options` argument.

#### Remarks

* Since `connectAdvanced` returns a higher-order component, it needs to be invoked two times. The first time with its arguments as described above, and a second time, with the component: `connectAdvanced(selectorFactory)(MyComponent)`.

* `connectAdvanced` does not modify the passed React component. It returns a new, connected component, that you should use instead.

<a id="connectAdvanced-examples"></a>
#### Examples

##### Inject `todos` of a specific user depending on props, and inject `props.userId` into the action
```js
import * as actionCreators from './actionCreators'
import { bindActionCreators } from 'redux'

function selectorFactory(dispatch) {
  let ownProps = {}
  let result = {}
  const actions = bindActionCreators(actionCreators, dispatch)
  const addTodo = (text) => actions.addTodo(ownProps.userId, text)
  return (nextState, nextOwnProps) => {
    const todos = nextState.todos[nextOwnProps.userId]
    const nextResult = { ...nextOwnProps, todos, addTodo }
    ownProps = nextOwnProps
    if (!shallowEqual(result, nextResult)) result = nextResult
    return result
  }
}
export default connectAdvanced(selectorFactory)(TodoApp)
```

<a id="createProvider"></a>
### `createProvider([storeKey])`

Creates a new `<Provider>` which will set the Redux Store on the passed key of the context. You probably only need this if you are in the inadvisable position of having multiple stores. You will also need to pass the same `storeKey` to the `options` argument of [`connect`](#connectmapstatetoprops-mapdispatchtoprops-mergeprops-options)

<a id="createProvider-arguments"></a>
#### Arguments

* [`storeKey`] (*String*): The key of the context on which to set the store. Default value: `'store'`

#### Examples
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
