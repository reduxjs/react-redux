---
id: version-5.1.1-basic-tutorial
title: Basic Tutorial
hide_title: true
sidebar_label: Basic Tutorial
original_id: basic-tutorial
---

# Basic Tutorial

To see how to use React-Redux in practice, we’ll show a step-by-step example by creating a todo list app.

## A Todo List Example

**Jump to**

- 🤞 [Just show me the code](https://codesandbox.io/s/9on71rvnyo)
- 👆 [Providing the store](#providing-the-store)
- ✌️ [Connecting the Component](#connecting-the-components)

**The React UI Components**

We have implemented our React UI components as follows:

- `TodoApp` is the entry component for our app. It renders the header, the `AddTodo`, `TodoList`, and `VisibilityFilters` components.
- `AddTodo` is the component that allows a user to input a todo item and add to the list upon clicking its “Add Todo” button:
  - It uses a controlled input that sets state upon `onChange`.
  - When the user clicks on the “Add Todo” button, it dispatches the action (that we will provide using React-Redux) to add the todo to the store.
- `TodoList` is the component that renders the list of todos:
  - It renders the filtered list of todos when one of the `VisibilityFilters` is selected.
- `Todo` is the component that renders a single todo item:
  - It renders the todo content, and shows that a todo is completed by crossing it out.
  - It dispatches the action to toggle the todo's complete status upon `onClick`.
- `VisibilityFilters` renders a simple set of filters: _all_, _completed_, and _incomplete._ Clicking on each one of them filters the todos:
  - It accepts an `activeFilter` prop from the parent that indicates which filter is currently selected by the user. An active filter is rendered with an underscore.
  - It dispatches the `setFilter` action to update the selected filter.
- `constants` holds the constants data for our app.
- And finally `index` renders our app to the DOM.

<br />

**The Redux Store**

The Redux portion of the application has been set up using the [patterns recommended in the Redux docs](https://redux.js.org):

- Store
  - `todos`: A normalized reducer of todos. It contains a `byIds` map of all todos and a `allIds` that contains the list of all ids.
  - `visibilityFilters`: A simple string `all`, `completed`, or `incomplete`.
- Action Creators
  - `addTodo` creates the action to add todos. It takes a single string variable `content` and returns an `ADD_TODO` action with `payload` containing a self-incremented `id` and `content`
  - `toggleTodo` creates the action to toggle todos. It takes a single number variable `id` and returns a `TOGGLE_TODO` action with `payload` containing `id` only
  - `setFilter` creates the action to set the app’s active filter. It takes a single string variable `filter` and returns a `SET_FILTER` action with `payload` containing the `filter` itself
- Reducers
  - The `todos` reducer
    - Appends the `id` to its `allIds` field and sets the todo within its `byIds` field upon receiving the `ADD_TODO` action
    - Toggles the `completed` field for the todo upon receiving the `TOGGLE_TODO` action
  - The `visibilityFilters` reducer sets its slice of store to the new filter it receives from the `SET_FILTER` action payload
- Action Types
  - We use a file `actionTypes.js` to hold the constants of action types to be reused
- Selectors
  - `getTodoList` returns the `allIds` list from the `todos` store
  - `getTodoById` finds the todo in the store given by `id`
  - `getTodos` is slightly more complex. It takes all the `id`s from `allIds`, finds each todo in `byIds`, and returns the final array of todos
  - `getTodosByVisibilityFilter` filters the todos according to the visibility filter

You may check out [this CodeSandbox](https://codesandbox.io/s/6vwyqrpqk3) for the source code of the UI components and the unconnected Redux store described above.

<br />

We will now show how to connect this store to our app using React-Redux.

### Providing the Store

First we need to make the `store` available to our app. To do this, we wrap our app with the `<Provider />` API provided by React-Redux.

```jsx
// index.js
import React from "react";
import ReactDOM from "react-dom";
import TodoApp from "./TodoApp";

import { Provider } from "react-redux";
import store from "./redux/store";

const rootElement = document.getElementById("root");
ReactDOM.render(
  <Provider store={store}>
    <TodoApp />
  </Provider>,
  rootElement
);
```

Notice how our `<TodoApp />` is now wrapped with the `<Provider />` with `store` passed in as a prop.

![](https://i.imgur.com/LV0XvwA.png)

### Connecting the Components

React-Redux provides a `connect` function for you to read values from the Redux store (and re-read the values when the store updates). 

The `connect` function takes two arguments, both optional:

- `mapStateToProps`: called every time the store state changes. It receives the entire store state, and should return an object of data this component needs.

- `mapDispatchToProps`: this parameter can either be a function, or an object.
  - If it’s a function, it will be called once on component creation. It will receive `dispatch` as an argument, and should return an object full of functions that use `dispatch` to dispatch actions.
  - If it’s an object full of action creators, each action creator will be turned into a prop function that automatically dispatches its action when called. **Note**: We recommend using this “object shorthand” form.

Normally, you’ll call `connect` in this way:

```js
const mapStateToProps = (state, ownProps) => ({
  // ... computed data from state and optionally ownProps
});

const mapDispatchToProps = {
  // ... normally is an object full of action creators
};

// `connect` returns a new function that accepts the component to wrap:
const connectToStore = connect(
  mapStateToProps,
  mapDispatchToProps
);
// and that function returns the connected, wrapper component:
const ConnectedComponent = connectToStore(Component);

// We normally do both in one step, like this:
connect(
  mapStateToProps,
  mapDispatchToProps
)(Component);
```

Let’s work on `<AddTodo />` first. It needs to trigger changes to the `store` to add new todos. Therefore, it needs to be able to `dispatch` actions to the store. Here’s how we do it.

Our `addTodo` action creator looks like this:

```js
// redux/actions.js
import { ADD_TODO } from "./actionTypes";

let nextTodoId = 0;
export const addTodo = content => ({
  type: ADD_TODO,
  payload: {
    id: ++nextTodoId,
    content
  }
});

// ... other actions
```

By passing it to `connect`, our component receives it as a prop, and it will automatically dispatch the action when it’s called.

```js
// components/AddTodo.js

// ... other imports
import { connect } from "react-redux";
import { addTodo } from "../redux/actions";

class AddTodo extends React.Component {
  // ... component implementation
}

export default connect(
  null,
  { addTodo }
)(AddTodo);
```

Notice now that `<AddTodo />` is wrapped with a parent component called `<Connect(AddTodo) />`. Meanwhile, `<AddTodo />` now gains one prop: the `addTodo` action.

![](https://i.imgur.com/u6aXbwl.png)

We also need to implement the `handleAddTodo` function to let it dispatch the `addTodo` action and reset the input

```jsx
// components/AddTodo.js

import React from "react";
import { connect } from "react-redux";
import { addTodo } from "../redux/actions";

class AddTodo extends React.Component {
  // ...

  handleAddTodo = () => {
    // dispatches actions to add todo
    this.props.addTodo(this.state.input);

    // sets state back to empty string
    this.setState({ input: "" });
  };

  render() {
    return (
      <div>
        <input
          onChange={e => this.updateInput(e.target.value)}
          value={this.state.input}
        />
        <button className="add-todo" onClick={this.handleAddTodo}>
          Add Todo
        </button>
      </div>
    );
  }
}

export default connect(
  null,
  { addTodo }
)(AddTodo);
```

Now our `<AddTodo />` is connected to the store. When we add a todo it would dispatch an action to change the store. We are not seeing it in the app because the other components are not connected yet. If you have the Redux DevTools Extension hooked up, you should see the action being dispatched:

![](https://i.imgur.com/kHvkqhI.png)

You should also see that the store has changed accordingly:

![](https://i.imgur.com/yx27RVC.png)

The `<TodoList />` component is responsible for rendering the list of todos. Therefore, it needs to read data from the store. We enable it by calling `connect` with the `mapStateToProps` parameter, a function describing which part of the data we need from the store.

Our `<Todo />` component takes the todo item as props. We have this information from the `byIds` field of the `todos`. However, we also need the information from the `allIds` field of the store indicating which todos and in what order they should be rendered. Our `mapStateToProps` function may look like this:

```js
// components/TodoList.js

// ...other imports
import { connect } from "react-redux";

const TodoList = // ... UI component implementation

const mapStateToProps = state => {
  const { byIds, allIds } = state.todos || {};
  const todos =
    allIds && allIds.length
      ? allIds.map(id => (byIds ? { ...byIds[id], id } : null))
      : null;
  return { todos };
};

export default connect(mapStateToProps)(TodoList);
```

Luckily we have a selector that does exactly this. We may simply import the selector and use it here.

```js
// redux/selectors.js

export const getTodosState = store => store.todos;

export const getTodoList = store =>
  getTodosState(store) ? getTodosState(store).allIds : [];

export const getTodoById = (store, id) =>
  getTodosState(store) ? { ...getTodosState(store).byIds[id], id } : {};

export const getTodos = store =>
  getTodoList(store).map(id => getTodoById(store, id));
```

```js
// components/TodoList.js

// ...other imports
import { connect } from "react-redux";
import { getTodos } from "../redux/selectors";

const TodoList = // ... UI component implementation

export default connect(state => ({ todos: getTodos(state) }))(TodoList);
```

We recommend encapsulating any complex lookups or computations of data in selector functions. In addition, you can further optimize the performance by using [Reselect](https://github.com/reduxjs/reselect) to write “memoized” selectors that can skip unnecessary work. (See [the Redux docs page on Computing Derived Data](https://redux.js.org/recipes/computingderiveddata#sharing-selectors-across-multiple-components) and the blog post [Idiomatic Redux: Using Reselect Selectors for Encapsulation and Performance](https://blog.isquaredsoftware.com/2017/12/idiomatic-redux-using-reselect-selectors/) for more information on why and how to use selector functions.)

Now that our `<TodoList />` is connected to the store. It should receive the list of todos, map over them, and pass each todo to the `<Todo />` component. `<Todo />` will in turn render them to the screen. Now try adding a todo. It should come up on our todo list!

![](https://i.imgur.com/N68xvrG.png)

We will connect more components. Before we do this, let’s pause and learn a bit more about `connect` first.

### Common ways of calling `connect`

Depending on what kind of components you are working with, there are different ways of calling `connect` , with the most common ones summarized as below:

|                               | Do Not Subscribe to the Store                  | Subscribe to the Store                                    |
| ----------------------------- | ---------------------------------------------- | --------------------------------------------------------- |
| Do Not Inject Action Creators | `connect()(Component)`                         | `connect(mapStateToProps)(Component)`                     |
| Inject Action Creators        | `connect(null, mapDispatchToProps)(Component)` | `connect(mapStateToProps, mapDispatchToProps)(Component)` |

#### Do not subscribe to the store and do not inject action creators

If you call `connect` without providing any arguments, your component will:

- _not_ re-render when the store changes
- receive `props.dispatch` that you may use to manually dispatch action

```js
// ... Component
export default connect()(Component); // Component will receive `dispatch` (just like our <TodoList />!)
```

#### Subscribe to the store and do not inject action creators

If you call `connect` with only `mapStateToProps`, your component will:

- subscribe to the values that `mapStateToProps` extracts from the store, and re-render only when those values have changed
- receive `props.dispatch` that you may use to manually dispatch action

```js
// ... Component
const mapStateToProps = state => state.partOfState;
export default connect(mapStateToProps)(Component);
```

#### Do not subscribe to the store and inject action creators

If you call `connect` with only `mapDispatchToProps`, your component will:

- _not_ re-render when the store changes
- receive each of the action creators you inject with `mapDispatchToProps` as props and automatically dispatch the actions upon being called

```js
import { addTodo } from "./actionCreators";
// ... Component
export default connect(
  null,
  { addTodo }
)(Component);
```

#### Subscribe to the store and inject action creators

If you call `connect` with both `mapStateToProps` and `mapDispatchToProps`, your component will:

- subscribe to the values that `mapStateToProps` extracts from the store, and re-render only when those values have changed
- receive all of the action creators you inject with `mapDispatchToProps` as props and automatically dispatch the actions upon being called.

```js
import * as actionCreators from "./actionCreators";
// ... Component
const mapStateToProps = state => state.partOfState;
export default connect(
  mapStateToProps,
  actionCreators
)(Component);
```

These four cases cover the most basic usages of `connect`. To read more about `connect`, continue reading our [API section](./api.md) that explains it in more detail.

<!-- TODO: Put up link to the page that further explains connect -->

---

Now let’s connect the rest of our `<TodoApp />`.

How should we implement the interaction of toggling todos? A keen reader might already have an answer. If you have your environment set up and have followed through up until this point, now is a good time to leave it aside and implement the feature by yourself. There would be no surprise that we connect our `<Todo />` to dispatch `toggleTodo` in a similar way:

```js
// components/Todo.js

// ... other imports
import { connect } from "react-redux";
import { toggleTodo } from "../redux/actions";

const Todo = // ... component implementation

export default connect(
  null,
  { toggleTodo }
)(Todo);
```

Now our todo’s can be toggled complete. We’re almost there!

![](https://i.imgur.com/4UBXYtj.png)

Finally, let’s implement our `VisibilityFilters` feature.

The `<VisibilityFilters />` component needs to be able to read from the store which filter is currently active, and dispatch actions to the store. Therefore, we need to pass both a `mapStateToProps` and `mapDispatchToProps`. The `mapStateToProps` here can be a simple accessor of the `visibilityFilter` state. And the `mapDispatchToProps` will contain the `setFilter` action creator.

```js
// components/VisibilityFilters.js

// ... other imports
import { connect } from "react-redux";
import { setFilter } from "../redux/actions";

const VisibilityFilters = // ... component implementation

const mapStateToProps = state => {
  return { activeFilter: state.visibilityFilter };
};
export default connect(
  mapStateToProps,
  { setFilter }
)(VisibilityFilters);
```

Meanwhile, we also need to update our `<TodoList />` component to filter todos according to the active filter. Previously the `mapStateToProps` we passed to the `<TodoList />` `connect` function call was simply the selector that selects the whole list of todos. Let’s write another selector to help filtering todos by their status.

```js
// redux/selectors.js

// ... other selectors
export const getTodosByVisibilityFilter = (store, visibilityFilter) => {
  const allTodos = getTodos(store);
  switch (visibilityFilter) {
    case VISIBILITY_FILTERS.COMPLETED:
      return allTodos.filter(todo => todo.completed);
    case VISIBILITY_FILTERS.INCOMPLETE:
      return allTodos.filter(todo => !todo.completed);
    case VISIBILITY_FILTERS.ALL:
    default:
      return allTodos;
  }
};
```

And connecting to the store with the help of the selector:

```js
// components/TodoList.js

// ...

const mapStateToProps = state => {
  const { visibilityFilter } = state;
  const todos = getTodosByVisibilityFilter(state, visibilityFilter);
  return { todos };
};

export default connect(mapStateToProps)(TodoList);
```

Now we've finished a very simple example of a todo app with React-Redux. All our components are connected! Isn't that nice? 🎉🎊

![](https://i.imgur.com/ONqer2R.png)

## Links

- [Usage with React](https://redux.js.org/basics/usagewithreact)
- [Using the React-Redux Bindings](https://blog.isquaredsoftware.com/presentations/workshops/redux-fundamentals/react-redux.html)
- [Higher Order Components in Depth](https://medium.com/@franleplant/react-higher-order-components-in-depth-cf9032ee6c3e)
- [Computing Derived Data](https://redux.js.org/recipes/computingderiveddata#sharing-selectors-across-multiple-components)
- [Idiomatic Redux: Using Reselect Selectors for Encapsulation and Performance](https://blog.isquaredsoftware.com/2017/12/idiomatic-redux-using-reselect-selectors/)

## Get More Help

- [Reactiflux](https://www.reactiflux.com) Redux channel
- [StackOverflow](https://stackoverflow.com/questions/tagged/react-redux)
- [GitHub Issues](https://github.com/reduxjs/react-redux/issues/)
