# Getting Started

[Redux](https://github.com/reduxjs/redux) has no knowledge of [React](https://reactjs.org/).
You may create your [Redux](https://github.com/reduxjs/redux) app using other UI rendering frameworks, or not using any frameworks at all.
`react-redux` is the official [React](https://reactjs.org/) binding for [Redux](https://github.com/reduxjs/redux).
It lets your [React](https://reactjs.org/) components read data and dispatch actions from and to a [Redux](https://github.com/reduxjs/redux) store.

## Installation

To use `react-redux` with your [React](https://reactjs.org/) app:

```
npm install --save react-redux
```

<!-- perhaps add link to an extra quick start section? -->

## … In A Few Words

`react-redux` provides the `connect()`function to help you connect a [React](https://reactjs.org/) component to the [Redux](https://github.com/reduxjs/redux) `store`.

It enables you to:

1. Read data from the [Redux](https://github.com/reduxjs/redux) `store` into your app’s connected components as props
2. Dispatch actions to your `store` from any of your app’s connected components

You can provide a function to specify which data you want to read from the store. By convention, it’s called `mapStateToProps`. To specify the actions you plan to dispatch, you provide the second parameter. By convention, we call it `mapDispatchToProps` . While it’s normally an object containing all the actions, it can also be a function.

Normally, you’ll call `connect` in this fashion:

Calling `connect` will return a function that waits for you to pass in your unconnected component.
To obtain your connected component, you then call that function and pass in the component you’d like to subscribe to the store.

```jsx
const connectToStore = connect(
  mapStateToProps,
  mapDispatchToProps
);
const connectedComponent = connectToStore(Component);

// We normally do both in one step, like this:
connect(
  mapStateToProps,
  mapDispatchToProps
)(Component);
```

## A Todo List Example

Jump to

- 🤞 [Just show me the code](https://codesandbox.io/s/5w8l097704)
- 👆 [Providing the store](###providing-the-store)
- ✌️ [Common Ways of Calling Connect](###common-ways-of-calling-connect)

**The React UI Components**

As an example, we will create a Todo List app using [React](https://reactjs.org/) and [Redux](https://github.com/reduxjs/redux). Suppose we have our [React](https://reactjs.org/) UI components implemented as follows:

- `TodoApp` is the entry component for our app. It renders the header, the `AddTodo`, `TodoList`, and `VisibilityFilters` components
- `AddTodo` is the component that allows a user to input a todo item and add to the list upon clicking its “Add Todo” button
  - It sets state with the user’s input upon `onBlur`, and uses that value for adding a todo when the user clicks on the “Add Todo” button
  - It is waiting for an `addTodo` handler function passed down as props to handle the user’s add todo interaction
- `TodoList` is the component that renders the list of todos
- `Todo` is the component that renders a single todo item
  - It waits for a `toggleTodo` handler function, with which we toggle the todo as upon `onClick` of the todo
- `VisibilityFilters` renders a simple set of filters: _all_, _completed_, and _incomplete._ Clicking on each one of them filters the todos
  - It accepts an `activeFilter` prop from the parent that indicates which filter is currently selected by the user. An active filter is rendered with an underscore
  - It waits for a `setFilter` handler function to handle setting filters
- `constants` holds the constants data for our app, mainly visibility filters
- And finally `style.css` is the stylesheet, and `index` renders our app to the DOM

We’ll start by briefly describing our UI components. For the full code source, check out [this CodeSandbox](https://codesandbox.io/s/mo7p88po0j).

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
├── index.js
├── TodoApp.js
├── constants.js
└── style.css
```

```jsx
// TodoApp.js
import React from "react";
import AddTodo from "./components/AddTodo";
import TodoList from "./components/TodoList";
import VisibilityFilters from "./components/VisibilityFilters";
import "./styles.css";

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
  }

  render() {
    return (
      <div>
        <input ref={r => (this.input = r)} />
        <button
          className="add-todo"
          onClick={() => {} /** waiting for AddTodo onClick handler */}
        >
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
    onClick={() => {} /** waiting for toggleTodo handler */}
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
            onClick={() => {} /** waiting for setFilter handler*/}
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

```jsx
// index.js
import React from "react";
import ReactDOM from "react-dom";

import TodoApp from "./TodoApp";

const rootElement = document.getElementById("root");
ReactDOM.render(<TodoApp />, rootElement);
```

```JavaScript
// constants.js
export const VISIBILITY_FILTERS = {
  ALL: "all",
  COMPLETED: "completed",
  INCOMPLETE: "incomplete"
};
```

```css
/** styles.css**/

.todo-app {
  font-family: sans-serif;
}

/** add todo **/
.add-todo {
  margin-left: 0.5rem;
}

/** todo list **/
.todo-list {
  margin-top: 1rem;
  text-align: left;
  list-style: none;
}

/** todo item **/
.todo-item {
  font-family: monospace;
  cursor: pointer;
  line-height: 1.5;
}
.todo-item__text--completed {
  text-decoration: line-through;
  color: lightgray;
}

/** visibility filters **/
.filter {
  padding: 0.3rem 0;
  margin: 0 0.3rem;
  cursor: pointer;
}
.filter--active {
  border-bottom: 1px solid black;
}
```

</details>

**The Redux Store**

Suppose also that we have created the [Redux](https://github.com/reduxjs/redux) as follows. To learn about designing your [Redux](https://github.com/reduxjs/redux) store, [the official Redux docs](https://redux.js.org/basics) has an excellent guide and we will not cover the same topics again.

- Reducers
  - A `todoList` reducer with a state that holds a list `id` ‘s of each todo. Defaults to `[]`.
  - A `todoMap` reducer with a state that holds the mapping to each todo. Defaults to `{}`.
  - Each todo is a simple object of two fields, `content` that is a string describing the todo, and `completed` a boolean indicating whether the todo is completed
- Action Creators
  - `addTodo` creates the action to add todo’s. It takes a single string variable `content` and returns an `ADD_TODO` action with `payload` containing a self-incremented `id` and `content`
  - `toggleTodo` creates the action to toggle todo’s. It takes a single number variable `id` and returns a `TOGGLE_TODO` action with `payload` containing `id` only
  - `setFilter` creates the action to set the app’s active filter. It takes a single string variable `filter` and returns a `SET_FILTER` action with `payload` containing the `filter` itself
- Action Types
  - We use a file `actionTypes.js` to hold the constants of action types to be reused
- Selectors
  - `getTodoList` returns the `todoList` state
  - `getTodoById` finds the todo in the store given by `id`
  - `getTodos` is slightly more complex. It takes all the `id`s from `todoList` state, finds each todo in the `todoMap` state, and returns the final array of todo’s.

<details>
  <summary>Expand Code</summary>

```
.
└── redux
├── reducers
│ ├── index.js
│ ├── todoList.js
│ ├── todoMap.js
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
// redux/reducers/todoList.js
import { ADD_TODO } from "../actionTypes";

const defaultState = [];
const todoList = (state = defaultState, action) => {
  switch (action.type) {
    case ADD_TODO: {
      const { id } = action.payload;
      return [...state, id];
    }
    default:
      return state;
  }
};

export default todoList;
```

```JavaScript
// redux/reducers/todoMap.js
import { ADD_TODO, TOGGLE_TODO } from "../actionTypes";

const defaultState = {};

const todoMap = (state = defaultState, action) => {
  switch (action.type) {
    case ADD_TODO: {
      const { id, content } = action.payload;
      return {
        ...state,
        [id]: {
          content,
          completed: false
        }
      };
    }
    case TOGGLE_TODO: {
      const { id } = action.payload;
      const currentTodo = state[id];
      return {
        ...state,
        [id]: { ...currentTodo, completed: !currentTodo.completed }
      };
    }
    default:
      return state;
  }
};

export default todoMap;
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
export const getTodoList = store => store.todoList;

export const getTodoById = (store, id) => ({ ...store.todoMap[id], id });

/**
 * example of a slightly more complex selector
 * select from store combining information from multiple reducers
 */
export const getTodos = store =>
  getTodoList(store).map(id => getTodoById(store, id));
```

```JavaScript
// redux/actionTypes.js
export const ADD_TODO = "ADD_TODO";
export const TOGGLE_TODO = "TOGGLE_TODO";
export const SET_FILTER = "SET_FILTER";
```

</details>

Once again you may check out the code here [CodeSandbox](https://codesandbox.io/s/5w8l097704)

We now show how to connect this store to our app using `react-redux`.

### Providing the Store

First we need to make the `store` available to our app. To do this, we wrap our app with the `<Provider />` api provided by `react-redux`.

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

Notice how our `<TodoApp />` is now wrapped with the `<Provider />` with `store` passed in as a prop. The `store` object has a few methods that do their magic. But we won’t go into them, yet. We’ll explain them later in the “whys and hows” section.

![](https://d2mxuefqeaa7sj.cloudfront.net/s_630DC123DAA5434307EAAA11ADF93376B702FDF3645C9313F6B041E413AA4611_1536403768209_image.png)

### Connecting the Components

Our components need to read values from the [Redux](http://redux.js.org/) store (and re-read the values when the store updates). They also need to dispatch actions to trigger updates.

`connect` takes in two parameters. The first one allows you to define which pieces of data from the store are needed by this component. The second one allows you to indicate which actions that component might dispatch. By convention, they are called `mapStateToProps` and `mapDispatchToProps`, respectively. The return of this call is another function that waits for you to feed in your component on a second call. This is one of a common practices of implementing _higher order components._ Feel free to read more on that.

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

![](https://d2mxuefqeaa7sj.cloudfront.net/s_630DC123DAA5434307EAAA11ADF93376B702FDF3645C9313F6B041E413AA4611_1536402763972_image.png)

Try to type something in the input box and click “Add Todo”. Nothing happens. Why? We still need to implement what triggers the dispatch of our action `addTodo`. That would be the `onClick` event of the “Add Todo” button:

```jsx
// components/AddTodo.js

import React from "react";
import { connect } from "react-redux";
import { addTodo } from "../redux/actions";

class AddTodo extends React.Component {
  constructor(props) {
    super(props);
    this.state = { input: "" };
  }

  updateInput = input => {
    this.setState({ input });
  };

  render() {
    return (
      <div>
        <input onBlur={e => this.updateInput(e.target.value)} />
        <button
          className="add-todo"
          onClick={() => this.props.addTodo(this.state.input)}
        >
          Add Todo
        </button>
      </div>
    );
  }
}

export default connect(
  null, // will not subscribe to the store
  { addTodo }
)(AddTodo);
```

Now our `<AddTodo />` is connected to the store. It _should_ dispatch an action to change the store upon the user’s add todo interaction. But we are unable to see it before our `<TodoList />` is also connected to the store. So let’s do it now.

The `<TodoList />` component is responsible for rendering the list of todos. Therefore, it needs to read data from the store. We enable it by calling `connect` with the `mapState` parameter, a function describing which part of the data we need from the store.

Our `<Todo />` component takes the todo item as props. We have this information from the `todoMap` store. However, we also need the information from the `todoList` store indicating which todos and in what order they should be rendered. Our `mapStateToProps` function may look like this:

```jsx
// components/TodoList.js

// ...other imports
import { connect } from "react-redux";

const TodoList = // ... UI component implementation

const mapStateToProps = state => {
  const { todoList, todoMap } = state;
  const todos = [];
  todoList.map(id => todos.push({ ...todoMap[id], id }));
  return { todos };
};

export default connect(mapStateToProps)(TodoList);
```

Luckily we have a selector that does exactly this. We may simply import the selector and use it here.

```jsx
// components/TodoList.js

// ...other imports
import { connect } from "react-redux";
import { getTodos } from "../redux/selectors";

const TodoList = // ... UI component implementation

export default connect(state => ({ todos: getTodos(state) }))(TodoList);
```

So that provides with a motivation to write selector functions for complex computation. You may further optimize by using [Reselect](https://github.com/reduxjs/reselect). <!--We (will) also have a section on this topic: [Usage with Selectors and / or Reselect](http://#).-->

Now that our `<TodoList />` is connected to the store. It should receive the list of todos, map over them, and pass each todo to the `<Todo />` component, which will in turn render them to the screen.

![](https://d2mxuefqeaa7sj.cloudfront.net/s_630DC123DAA5434307EAAA11ADF93376B702FDF3645C9313F6B041E413AA4611_1536405730234_image.png)

We will connect more components.
Before we do this, let’s pause and learn a bit more about `connect` first.

### Common ways of calling `connect`

Depending on what kind of components you are working with, there are different ways of calling `connect` , with the most common ones summarized as below:

|                               | Subscribe to Store                                                                                                     | Do Not Subscribe to Store                                    |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Inject Action Creators        | `connect(mapStateToProps,` ` mapDispatchToProps``)(Component) ` | `connect(null,` ` mapDispatchToProps``)(Component) ` |
| Do Not Inject Action Creators | `connect(mapStateToProps)(Component)`                                                                                  | `connect()(Component)` _Component will receive_ `*dispatch*` |

#### 1. Subscribe to the store and inject action creators

```
import { addTodo } from './actionCreators';
// ... Component
const mapStateToProps = state => state.partOfState;
export default connect(mapStateToProps, { addTodo })(Component);
```

#### 2. Do not subscribe to the store and inject action creators

```jsx
import * as actionCreators from "./actionCreators";
// ... Component
export default connect(
  null,
  actionCreators
)(Component);
```

#### 3. Subscribe to the store and do not inject action creators

```jsx
// ... Component
const mapStateToProps = state => state.partOfState;
export default connect(mapStateToProps)(Component);
```

#### 4. Do not subscribe to the store and do not inject action creators

```jsx
// ... Component
export default connect()(Component); // Component will receive `dispatch`
```

<!-- TODO: Put up link to the page that further explains connect -->

Now let’s connect the rest of our `<TodoApp />`.

How should we implement the interaction of toggling todos? A keen reader might already have an answer. If you have your environment set up and have followed through up until this point, now is a good time to leave it aside and implement the feature by itself. There would be no surprise that we connect our `<Todo />` to dispatch `toggleTodo` in a similar fashion:

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

![](https://d2mxuefqeaa7sj.cloudfront.net/s_630DC123DAA5434307EAAA11ADF93376B702FDF3645C9313F6B041E413AA4611_1536419073312_image.png)

There are some common practices in implementing React applications. One such example is to separate components into _presentational_ components and _container_ components. [This article](https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0) by Dan Abramov has a nice introduction. If this is a practice that you would like to follow, `react-redux` is with you. Check out here to learn about some of the best practices to program with `react-redux`.

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

Meanwhile, we also need to update our `<TodoList />` component to filter todos according to the active filter. Previously the `mapStateToProps` we passed to the `<TodoList />` `connect` function call was simply the selector that selects the whole list of todos. Let’s add the filter within this `mapStateToProps`.

```jsx
// components/TodoList.js

// ...

const mapStateToProps = state => {
  const { visibilityFilter } = state;
  const allTodos = getTodos(state);
  return {
    todos:
      visibilityFilter === VISIBILITY_FILTERS.ALL
        ? allTodos
        : visibilityFilter === VISIBILITY_FILTERS.COMPLETED
          ? allTodos.filter(todo => todo.completed)
          : allTodos.filter(todo => !todo.completed)
  };
};

export default connect(mapStateToProps)(TodoList);
```

## 🎉🎊

![](https://d2mxuefqeaa7sj.cloudfront.net/s_630DC123DAA5434307EAAA11ADF93376B702FDF3645C9313F6B041E413AA4611_1536418948690_image.png)

## References

- Usage with React https://redux.js.org/basics/usagewithreact
