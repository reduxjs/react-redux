# Getting Started

[React-Redux](https://github.com/reduxjs/react-redux) is the official [React](https://reactjs.org/) binding for [Redux](https://redux.js.org/). ​​It lets your React components read data from a Redux store, and dispatch actions to the store to update data.

## Installation

To use React-Redux with your React app:

```bash
npm install --save react-redux
```

or

```
yarn add react-redux
```

<!-- perhaps add link to an extra quick start section? -->

## `<Provider />` and `connect`

React-Redux consists of two main pieces. The first is a component called `<Provider />`, which makes the Redux store available to the rest of your app:

```js
import React from "react";
import ReactDOM from "react-dom";

import { Provider } from "react-redux";
import store from "./store";

import App from "./App";

const rootElement = document.getElementById("root");
ReactDOM.render(
  <Provider store={store}>
    <App />
  </Provider>,
  rootElement
);
```

The second piece is a function called `connect()`, which encapsulates the process of talking to the store.

It enables you to:

- Read data from the Redux `store` into your app’s connected components as props
- Dispatch actions to your `store` from any of your app’s connected components

Correspondingly, the `connect` function takes two arguments, both optional:

- `mapStateToProps`: called every time the store state changes. It receives the entire store state, and should return an object of data this component needs.

- `mapDispatchToProps`: this parameter can either be a function, or an object.
  - If it’s a function, it will be called once on component creation. It will receive `dispatch` as an argument, and should return an object full of functions that use `dispatch` to dispatch actions.
  - If it’s an object full of action creators, each action creator will be turned into a prop function that automatically dispatches its action when called. **Note**: We recommend using this “object shorthand” form.

Normally, you’ll call `connect` in this way:

```jsx
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

## A Todo List Example

To see this in practice, we’ll show a step-by-step example by creating a todo list app using React-Redux.

**Jump to**

- 🤞 [Just show me the code](https://codesandbox.io/s/9on71rvnyo)
- 👆 [Providing the store](#providing-the-store)
- ✌️ [Common Ways of Calling Connect](#common-ways-of-calling-connect)

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

You may check out the sourcecode below or check out this CodeSandbox: [Todo App UI Only](https://codesandbox.io/s/mo7p88po0j).

<details>
<summary>Expand Code</summary>

```
// tree structure
.
├── components
│   ├── AddTodo.js
│   ├── TodoList.js
│   ├── Todo.js
│   └── VisibilityFilters.js
├── TodoApp.js
├── constants.js
└── index.js
```

```jsx
// TodoApp.js
import React from "react";
import AddTodo from "./components/AddTodo";
import TodoList from "./components/TodoList";
import VisibilityFilters from "./components/VisibilityFilters";

export default function TodoApp() {
  return (
    <div className="todo-app">
      <h1>Todo List</h1>
      <AddTodo />
      <TodoList />
      <VisibilityFilters />
    </div>
  );
}
```

```jsx
// components/AddTodo.js

import React from "react";

class AddTodo extends React.Component {
  constructor(props) {
    super(props);
    this.state = { input: "" };
  }

  updateInput = input => {
    this.setState({ input });
  };

  handleAddTodo = () => {
    // dispatches actions to add todo
    // sets state back to empty string
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

export default AddTodo;
```

```jsx
// components/Todo.js

import React from "react";
import cx from "classnames";

const Todo = ({ todo }) => (
  <li
    className="todo-item"
    onClick={() => {} /** dispatches action to toggle todo */}
  >
    {todo && todo.completed ? "👌" : "👋"}{" "}
    <span
      className={cx(
        "todo-item__text",
        todo && todo.completed && "todo-item__text--completed"
      )}
    >
      {todo.content}
    </span>
  </li>
);

export default Todo;
```

```jsx
// components/TodoList.js

import React from "react";
import Todo from "./Todo";

const TodoList = ({ todos }) => (
  <ul className="todo-list">
    {todos && todos.length
      ? todos.map((todo, index) => {
          return <Todo key={`todo-${todo.id}`} todo={todo} />;
        })
      : "No todos, yay!"}
  </ul>
);

export default TodoList;
```

```jsx
// components/VisibilityFilters.js

import React from "react";
import cx from "classnames";
import { VISIBILITY_FILTERS } from "../constants";

const VisibilityFilters = ({ activeFilter }) => {
  return (
    <div className="visibility-filters">
      {Object.keys(VISIBILITY_FILTERS).map(filterKey => {
        const currentFilter = VISIBILITY_FILTERS[filterKey];
        return (
          <span
            key={`visibility-filter-${currentFilter}`}
            className={cx(
              "filter",
              currentFilter === activeFilter && "filter--active"
            )}
            onClick={() => {} /** dispatches action to set filter */}
          >
            {currentFilter}
          </span>
        );
      })}
    </div>
  );
};

export default VisibilityFilters;
```

```JavaScript
// constants.js
export const VISIBILITY_FILTERS = {
  ALL: "all",
  COMPLETED: "completed",
  INCOMPLETE: "incomplete"
};
```

```jsx
// index.js
import React from "react";
import ReactDOM from "react-dom";

import TodoApp from "./TodoApp";

const rootElement = document.getElementById("root");
ReactDOM.render(<TodoApp />, rootElement);
```

</details>

**The Redux Store**

We have also created the Redux as follows. To learn about designing your Redux store, [the official Redux docs](https://redux.js.org/basics) has an excellent guide.

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

Once again you may expand the code below or check out this CodeSandbox here [Todo App (UI + Unconnected Redux)](https://codesandbox.io/s/6vwyqrpqk3).

<details>
  <summary>Expand Code</summary>

```
.
└── redux
├── reducers
│ ├── index.js
│ ├── todos.js
│ └── visibilityFilters.js
├── actionTypes.js
├── actions.js
├── selectors.js
└── store.js
```

```JavaScript
// redux/store.js
import { createStore } from "redux";
import rootReducer from "./reducers";

export default createStore(rootReducer);
```

```JavaScript
// redux/reducers/index.js
import { combineReducers } from "redux";
import todoList from "./todoList";
import todoMap from "./todoMap";
import visibilityFilter from "./visibilityFilter";

export default combineReducers({ todoList, todoMap, visibilityFilter });
```

```JavaScript
// redux/reducers/todos.js
import { ADD_TODO, TOGGLE_TODO } from "../actionTypes";

const initialState = {
  allIds: [],
  byIds: {}
};

export default function(state = initialState, action) {
  switch (action.type) {
    case ADD_TODO: {
      const { id, content } = action.payload;
      return {
        ...state,
        allIds: [...state.allIds, id],
        byIds: {
          ...state.byIds,
          [id]: {
            content,
            completed: false
          }
        }
      };
    }
    case TOGGLE_TODO: {
      const { id } = action.payload;
      return {
        ...state,
        byIds: {
          ...state.byIds,
          [id]: {
            ...state.byIds[id],
            completed: !state.byIds[id].completed
          }
        }
      };
    }
    default:
      return state;
  }
}
```

```JavaScript
// redux/reducers/visibilityFilter.js
import { SET_FILTER } from "../actionTypes";
import { VISIBILITY_FILTERS } from "../../constants";

const defaultState = VISIBILITY_FILTERS.ALL;

const visibilityFilter = (state = defaultState, action) => {
  switch (action.type) {
    case SET_FILTER: {
      return action.payload.filter;
    }
    default: {
      return state;
    }
  }
};

export default visibilityFilter;
```

```JavaScript
// redux/actions.js
import { ADD_TODO, TOGGLE_TODO, SET_FILTER } from "./actionTypes";

let nextTodoId = 0;

export const addTodo = content => ({
  type: ADD_TODO,
  payload: {
    id: ++nextTodoId,
    content
  }
});

export const toggleTodo = id => ({
  type: TOGGLE_TODO,
  payload: { id }
});

export const setFilter = filter => ({ type: SET_FILTER, payload: { filter } });
```

```JavaScript
// redux/selectors.js
import { VISIBILITY_FILTERS } from "../constants";

export const getTodosState = store => store.todos;

export const getTodoList = store =>
  getTodosState(store) ? getTodosState(store).allIds : [];

export const getTodoById = (store, id) =>
  getTodoState(store) ? { ...getTodosState(store).byIds[id], id } : {};

export const getTodos = store =>
  getTodoList(store).map(id => getTodoById(store, id));

/**
 * example of a slightly more complex selector
 * select from store combining information from multiple reducers
 */
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

```JavaScript
// redux/actionTypes.js
export const ADD_TODO = "ADD_TODO";
export const TOGGLE_TODO = "TOGGLE_TODO";
export const SET_FILTER = "SET_FILTER";
```

</details>

We now show how to connect this store to our app using React-Redux.

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

Our components need to read values from the Redux store (and re-read the values when the store updates). They also need to dispatch actions to trigger updates.

`connect` takes in two parameters. The first one allows you to define which pieces of data from the store are needed by this component. The second one allows you to indicate which actions that component might dispatch. By convention, they are called `mapStateToProps` and `mapDispatchToProps`, respectively. The return of this call is another function that accepts the component on a second call. This is an example of a pattern called [_higher order components_](https://medium.com/@franleplant/react-higher-order-components-in-depth-cf9032ee6c3e).

Let’s work on `<AddTodo />` first. It needs to trigger changes to the `store` to add new todos. Therefore, it needs to be able to `dispatch` actions to the store. Here’s how we do it.

Our `addTodo` action creator looks like this:

```JavaScript
// redux/actions.js
import { ADD_TODO } from './actionTypes';

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

```jsx
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

```jsx
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

```jsx
// redux/selectors.js

export const getTodosState = store => store.todos;

export const getTodoList = store =>
  getTodosState(store) ? getTodosState(store).allIds : [];

export const getTodoById = (store, id) =>
  getTodoState(store) ? { ...getTodosState(store).byIds[id], id } : {};

/**
 * example of a slightly more complex selector
 * select from store combining information from multiple reducers
 */
export const getTodos = store =>
  getTodoList(store).map(id => getTodoById(store, id));
```

```jsx
// components/TodoList.js

// ...other imports
import { connect } from "react-redux";
import { getTodos } from "../redux/selectors";

const TodoList = // ... UI component implementation

export default connect(state => ({ todos: getTodos(state) }))(TodoList);
```

So that provides with a motivation to write selector functions for complex computation. You may further optimize the performance by using [Reselect](https://github.com/reduxjs/reselect) to write “memoized” selectors that can skip unnecessary work. See [this Redux’s docs page on Computing Derived Data](https://redux.js.org/recipes/computingderiveddata#sharing-selectors-across-multiple-components) for more information on using selectors.

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

```jsx
// ... Component
export default connect()(Component); // Component will receive `dispatch` (just like our <TodoList />!)
```

#### Subscribe to the store and do not inject action creators

If you call `connect` with only `mapStateToProps`, your component will:

- subscribe to the values that `mapStateToProps` extracts from the store, and re-render only when those values have changed
- receive `props.dispatch` that you may use to manually dispatch action

```jsx
// ... Component
const mapStateToProps = state => state.partOfState;
export default connect(mapStateToProps)(Component);
```

#### Do not subscribe to the store and inject action creators

If you call `connect` with only `mapDispatchToProps`, your component will:

- _not_ re-render when the store changes
- receive each of the action creators you inject with `mapDispatchToProps` as props and automatically dispatch the actions upon being called

```jsx
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

```jsx
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

```jsx
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

```jsx
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

```jsx
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
  <!-- - [Presentational and Container Components](https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0) -->
- [Computing Derived Data](https://redux.js.org/recipes/computingderiveddata#sharing-selectors-across-multiple-components)

## Get More Help

- [Reactiflux](https://www.reactiflux.com) Redux channel
- [StackOverflow](https://stackoverflow.com/questions/tagged/react-redux)
- [GitHub Issues](https://github.com/reduxjs/react-redux/issues/)
