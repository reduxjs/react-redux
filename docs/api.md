## API

### `<Provider store>`

Makes the Redux store available to the `connect()` calls in the component hierarchy below. Normally, you can’t use `connect()` without wrapping the root component in `<Provider>`.

If you *really* need to, you can manually pass `store` as a prop to every `connect()`ed component, but we only recommend to do this for stubbing `store` in unit tests, or in non-fully-React codebases. Normally, you should just use `<Provider>`.

#### Props

* `store` (*[Redux Store](http://rackt.github.io/redux/docs/api/Store.html)*): The single Redux store in your application.
* `children` (*ReactElement*) The root of your component hierarchy.

#### Example

##### Vanilla React

```js
ReactDOM.render(
  <Provider store={store}>
    <MyRootComponent />
  </Provider>,
  rootEl
);
```

##### React Router 0.13

```js
Router.run(routes, Router.HistoryLocation, (Handler, routerState) => { // note "routerState" here
  ReactDOM.render(
    <Provider store={store}>
      {/* note "routerState" here: important to pass it down */}
      <Handler routerState={routerState} />
    </Provider>,
    document.getElementById('root')
  );
});
```

##### React Router 1.0

```js
ReactDOM.render(
  <Provider store={store}>
    <Router history={history}>...</Router>
  </Provider>,
  targetEl
);
```

### `connect([mapStateToProps], [mapDispatchToProps], [mergeProps], [options])`

Connects a React component to a Redux store.

It does not modify the component class passed to it.  
Instead, it *returns* a new, connected component class, for you to use.

#### Arguments

* [`mapStateToProps(state, [ownProps]): stateProps`] \(*Function*): If specified, the component will subscribe to Redux store updates. Any time it updates, `mapStateToProps` will be called. Its result must be a plain object, and it will be merged into the component’s props. If you omit it, the component will not be subscribed to the Redux store. If `ownProps` is specified as a second argument, its value will be the properties passed to your component, and `mapStateToProps` will be re-invoked whenever the component receives new props.

* [`mapDispatchToProps(dispatch, [ownProps]): dispatchProps`] \(*Object* or *Function*): If an object is passed, each function inside it will be assumed to be a Redux action creator. An object with the same function names, but bound to a Redux store, will be merged into the component’s props. If a function is passed, it will be given `dispatch`. It’s up to you to return an object that somehow uses `dispatch` to bind action creators in your own way. (Tip: you may use the [`bindActionCreators()`](http://rackt.github.io/redux/docs/api/bindActionCreators.html) helper from Redux.) If you omit it, the default implementation just injects `dispatch` into your component’s props. If `ownProps` is specified as a second argument, its value will be the properties passed to your component, and `mapDispatchToProps` will be re-invoked whenever the component receives new props.

* [`mergeProps(stateProps, dispatchProps, ownProps): props`] \(*Function*): If specified, it is passed the result of `mapStateToProps()`, `mapDispatchToProps()`, and the parent `props`. The plain object you return from it will be passed as props to the wrapped component. You may specify this function to select a slice of the state based on props, or to bind action creators to a particular variable from props. If you omit it, `Object.assign({}, ownProps, stateProps, dispatchProps)` is used by default.

* [`options`] *(Object)* If specified, further customizes the behavior of the connector.
  * [`pure = true`] *(Boolean)*: If true, implements `shouldComponentUpdate` and shallowly compares the result of `mergeProps`, preventing unnecessary updates, assuming that the component is a “pure” component and does not rely on any input or state other than its props and the selected Redux store’s state. *Defaults to `true`.*
  * [`withRef = false`] *(Boolean)*: If true, stores a ref to the wrapped component instance and makes it available via `getWrappedInstance()` method. *Defaults to `false`.*

#### Returns

A React component class that injects state and action creators into your component according to the specified options.

##### Static Properties

* `WrappedComponent` *(Component)*: The original component class passed to `connect()`.

##### Static Methods

All the original static methods of the component are hoisted.

##### Instance Methods

###### `getWrappedInstance(): ReactComponent`

Returns the wrapped component instance. Only available if you pass `{ withRef: true }` as part of the `connect()`’s fourth `options` argument.

#### Remarks

* It needs to be invoked two times. The first time with its arguments described above, and a second time, with the component: `connect(mapStateToProps, mapDispatchToProps, mergeProps)(MyComponent)`.

* It does not modify the passed React component. It returns a new, connected component, that you should use instead.

* The `mapStateToProps` function takes a single argument of the entire Redux store’s state and returns an object to be passed as props. It is often called a **selector**. Use [reselect](https://github.com/rackt/reselect) to efficiently compose selectors and [compute derived data](http://rackt.github.io/redux/docs/recipes/ComputingDerivedData.html).

#### Examples

##### Inject just `dispatch` and don't listen to store

```js
export default connect()(TodoApp);
```

##### Inject `dispatch` and every field in the global state

>Don’t do this! It kills any performance optimizations because `TodoApp` will rerender after every action.  
>It’s better to have more granular `connect()` on several components in your view hierarchy that each only  
>listen to a relevant slice of the state.

```js
export default connect(state => state)(TodoApp);
```

##### Inject `dispatch` and `todos`

```js
function mapStateToProps(state) {
  return { todos: state.todos };
}

export default connect(mapStateToProps)(TodoApp);
```

##### Inject `todos` and all action creators (`addTodo`, `completeTodo`, ...)

```js
import * as actionCreators from './actionCreators';

function mapStateToProps(state) {
  return { todos: state.todos };
}

export default connect(mapStateToProps, actionCreators)(TodoApp);
```

##### Inject `todos` and all action creators (`addTodo`, `completeTodo`, ...) as `actions`

```js
import * as actionCreators from './actionCreators';
import { bindActionCreators } from 'redux';

function mapStateToProps(state) {
  return { todos: state.todos };
}

function mapDispatchToProps(dispatch) {
  return { actions: bindActionCreators(actionCreators, dispatch) };
}

export default connect(mapStateToProps, mapDispatchToProps)(TodoApp);
```

#####  Inject `todos` and a specific action creator (`addTodo`)

```js
import { addTodo } from './actionCreators';
import { bindActionCreators } from 'redux';

function mapStateToProps(state) {
  return { todos: state.todos };
}

function mapDispatchToProps(dispatch) {
  return bindActionCreators({ addTodo }, dispatch);
}

export default connect(mapStateToProps, mapDispatchToProps)(TodoApp);
```

##### Inject `todos`, todoActionCreators as `todoActions`, and counterActionCreators as `counterActions`

```js
import * as todoActionCreators from './todoActionCreators';
import * as counterActionCreators from './counterActionCreators';
import { bindActionCreators } from 'redux';

function mapStateToProps(state) {
  return { todos: state.todos };
}

function mapDispatchToProps(dispatch) {
  return {
    todoActions: bindActionCreators(todoActionCreators, dispatch),
    counterActions: bindActionCreators(counterActionCreators, dispatch)
  };
}

export default connect(mapStateToProps, mapDispatchToProps)(TodoApp);
```

##### Inject `todos`, and todoActionCreators and counterActionCreators together as `actions`

```js
import * as todoActionCreators from './todoActionCreators';
import * as counterActionCreators from './counterActionCreators';
import { bindActionCreators } from 'redux';

function mapStateToProps(state) {
  return { todos: state.todos };
}

function mapDispatchToProps(dispatch) {
  return {
    actions: bindActionCreators(Object.assign({}, todoActionCreators, counterActionCreators), dispatch)
  };
}

export default connect(mapStateToProps, mapDispatchToProps)(TodoApp);
```

##### Inject `todos`, and all todoActionCreators and counterActionCreators directly as props

```js
import * as todoActionCreators from './todoActionCreators';
import * as counterActionCreators from './counterActionCreators';
import { bindActionCreators } from 'redux';

function mapStateToProps(state) {
  return { todos: state.todos };
}

function mapDispatchToProps(dispatch) {
  return bindActionCreators(Object.assign({}, todoActionCreators, counterActionCreators), dispatch);
}

export default connect(mapStateToProps, mapDispatchToProps)(TodoApp);
```

##### Inject `todos` of a specific user depending on props

```js
import * as actionCreators from './actionCreators';

function mapStateToProps(state, ownProps) {
  return { todos: state.todos[ownProps.userId] };
}

export default connect(mapStateToProps)(TodoApp);
```

##### Inject `todos` of a specific user depending on props, and inject `props.userId` into the action

```js
import * as actionCreators from './actionCreators';

function mapStateToProps(state) {
  return { todos: state.todos };
}

function mergeProps(stateProps, dispatchProps, ownProps) {
  return Object.assign({}, ownProps, {
    todos: stateProps.todos[ownProps.userId],
    addTodo: (text) => dispatchProps.addTodo(ownProps.userId, text)
  });
}

export default connect(mapStateToProps, actionCreators, mergeProps)(TodoApp);
```
