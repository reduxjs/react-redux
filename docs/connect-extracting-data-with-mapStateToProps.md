---
id: connect-extracting-data-with-mapStateToProps
title: Connect: Extracting Data with `mapStateToProps`
hide_title: true
sidebar_label: Connect: Extracting Data with `mapStateToProps`
---

# Connect: Extracting Data with `mapStateToProps`
As the first argument passed in to `connect`, `mapStateToProps` is used for selecting the part of the data from the store that the connected component needs. It’s frequently referred to as just `mapState` for short.

- It is called every time the store state changes.
- It receives the entire store state, and should return an object of data this component needs.


## Defining `mapStateToProps`

`mapStateToProps` should be defined as a function:

```jsx
function mapStateToProps(state[, ownProps])
```

It should take `state`, optionally `ownProps`, and return a plain object containing the data that the connected component needs.

### Arguments

- `state`

The `mapStateToProps` function should always be written with at least `state` passed in. It will be called every time when the store changes. If you do not wish to subscribe to the store, pass `null` or `undefined` to `connect` in place of `mapStateToProps`.

```jsx
// TodoList.js 
// ...

const mapStateToProps = state => {
  const { todos } = state;
  return { todoList: todos.allIds };
};
    
export default connect(mapStateToProps)(TodoList);
```

- `ownProps` (optional)

You may define the function with a second argument, `ownProps`, if your component needs the data from its own props to retrieve data from the store.

```jsx
// Todo.js

const mapStateToProps = (state, ownProps) => {
  const { visibilityFilter } = state;
  const { id } = ownProps;
  const todo = getTodoById(state, id);

  // component receives additionally:
  return { todo, visibilityFilter };
};
```

**The arity of `mapStateToProps` affects its behavior:**

With just `state`, the function runs whenever the root store state object is different. With `state, ownProps`, it runs any time the store state is different AND when the wrapper props have changed.

**Mandatory number of arguments determines whether `mapStateToProps` will receive `ownProps`:**

If the formal definition of the function contains one mandatory parameter, `mapStateToProps` will _not_ receive `ownProps`:

```jsx
function mapStateToProps(state) {
  console.log(state);        // state
  console.log(arguments[1]); // undefined
}
const mapStateToProps = (state, ownProps = {}) => {
  console.log(state);    // state
  console.log(ownProps); // undefined
}
```

It _will_ receive `ownProps` when the formal definition of the function contains zero or two mandatory parameters:

```jsx
const mapStateToProps = (state, ownProps) => {
  console.log(state);    // state
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

### Return
In the most common usages, you should let your `mapStateToProps` return a plain object that contains the data the component needs:

- it will be merged into the component’s props
- it will be used to decide whether the component will re-render


> Note: In advanced scenarios where you need more control over the rendering performance, `mapStateToProps` can also return a function. In this case, that function will be used as `mapStateToProps` for a particular component instance. This allows you to do per-instance memoization. You can refer to [#279](https://github.com/reduxjs/react-redux/pull/279) and the tests it adds for more details. Most apps never need this.

React-Redux internally implements the `shouldComponentUpdate` method such that the wrapper component re-renders precisely when the data it needs change. By default, React-Redux decides whether the contents of the object returned from `mapStateToProps` are different using `===` comparison on each fields of the returned object. Returning a mutated object of the same reference is a common mistake resulting in component not re-rendering when expected.

However, if `mapStateToProps` is written in such way that it returns a different copy of the data each time, the component may re-render too many times:

```jsx
const mapStateToProps = state => {
  // re-renders even if the list may remain the same
  return {
    completedTodos: state.todos.filter(todo => todo.completed)
  };
}
```

To summarize the behavior of the component wrapped by `connect` with `mapStateToProps` to extract data from the store:

|                              | `(state) => stateProps`                | `(state, ownProps) => stateProps`                                                            |
| ---------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------- |
| `mapStateToProps` runs when: | store `state` is `===` different       | store `state` changes <br /> or <br />any field of `ownProps` is different                   |
| component re-renders when:   | any field of `stateProps` is different | any field of `stateProps` is different <br /> or <br /> any field of `ownProps` is different |

New CodeSandbox [here](https://codesandbox.io/s/yvvqxj4p11):

- `TodoList` now connects to `todos.allIds`
- `Todo` connects to `todos.byIds` with `id` from `ownProps`, and gets `visibilityFilter`
- `Todo` contains a simpler filter in itself to determine whether to show or hide each todo
- a bunch of commented out console logs to play around and see how the component behaves


## Keys to Good Redux Performance

### `mapStateToProps` Functions Should Be Fast

Whenever the store changes, all of the `mapStateToProps` functions of all of the connected components will run. That is a lot of callings of `mapStateToProps` at a very high frequency. `mapStateToProps` should be fast. 

Avoid doing very expensive work in `mapStateToProps` unless absolutely necessary. This includes:

**Complex filtering and transformations**

You will probably need to do complex transformations at some point. Consider first whether the transformation fits better in another place:

- Reducer is a potentially better candidate, because it concerns its own related data.
- Component’s lifecycle events such as `componentDidUpdate` or `render`, because their number of calls are cut down by `mapStateToProps` functions.
- If `mapStateToProps` is unavoidably the most suitable place for some costly computations, we suggest using memoized selectors. You may refer to the links at the end of this section for more information.

**Expensive functions such as `toJS()` of `Immutable.js`**

[Immutable.js author Lee Byron on Twitter](https://twitter.com/leeb/status/746733697093668864?lang=en) explicitly advises avoiding `toJS` when performance is a concern:

> Perf tip for #immutablejs: avoid .toJS() .toObject() and .toArray() all slow full-copy operations which render structural sharing useless.

There's several other performance concerns to take into consideration with Immutable.js - see the list of links at the end of this post for more information.

**Await async function calls**

A `mapStateToProps` function should be pure and 100% synchronous, like a reducer — state (+ownProps) in, resulting props out. 
No AJAX calls, no async stuff, no dispatching actions.

### Let `mapStateToProps` Reshape the Data from the Store

`mapStateToProps` functions can, and should, do a lot more than just `return state.someSlice`. 
They have the responsibility of "re-shaping" store data as needed for that component. 
However, such computations should subject to its own performance requirement mentioned above.

### Do Not Return New References of Objects

To avoid unnecessary re-rendering, do not return new references of objects.

Whenever the store state changes, all connected components will receive the updated store state and run `mapStateToProps` functions with them. 
Odds are the changes happen only to a small slice of the store, and unrelated components should just receive the same data. 

React-Redux does those shallow comparisons to avoid unnecessary re-rendering. 
However, it’s easy to accidentally return new object or array references every time, which would cause your component to re-render even if the data is actually the same.

Some examples are:

- Mapping over arrays `array.map`
- Merging arrays with `array.concat`
- Copying values with `Object.assign`
- Copying values with the spread operator `{ ...oldState, ...newData }`

In `mapState` functions, it suffices to use the dot accessor for object values

```jsx
const mapStateToProps = state => {
  // destructuring is ok
  const { todos } = state;
  return {
    // do this:
    user: state.user,
    todos,
  }
}
```

### Connect More Components

Overall performance is a balance between the overhead of more `mapStateToProps` calls, and time spent by React re-rendering. 
Redux subscriptions are O(n) - every additional subscriber means a bit more work every time an action is dispatched. 
Fortunately, benchmarks have shown that the cost of more connected components is generally less than the cost of more wasted re-rendering.
See this FAQ ["Should I only connect my top component, or can I connect multiple components in my tree?"](https://redux.js.org/faq/reactredux#react-multiple-components) for more discussions.

<!--
## Next Up
- Connect: Dispatching Actions with `mapDispatchToProps` →
- Further optimizing `mapStateToProps` performances by writing memoized selectors or using Reselect →
- Understanding whys and hows →
-->

## Links and References

**Tutorials**

- [Practical Redux Series, Part 6: Connected Lists, Forms, and Performance](https://blog.isquaredsoftware.com/2017/01/practical-redux-part-6-connected-lists-forms-and-performance/)

**Performance**

- [Lee Byron's Tweet Suggesting to avoid `toJS`, `toArray` and `toObject` for Performance](https://twitter.com/leeb/status/746733697093668864)
- [Improving React and Redux performance with Reselect](https://blog.rangle.io/react-and-redux-performance-with-reselect/)
- [Relevant links to immutable data](https://github.com/markerikson/react-redux-links/blob/master/react-performance.md#immutable-data)

**Q&A**

- [Why Is My Component Re-Rendering Too Often?](https://redux.js.org/faq/reactredux#why-is-my-component-re-rendering-too-often)
- [Why isn't my component re-rendering, or my mapStateToProps running](https://redux.js.org/faq/reactredux#why-isnt-my-component-re-rendering-or-my-mapstatetoprops-running)
- [How can I speed up my mapStateToProps?](https://redux.js.org/faq/reactredux#why-is-my-component-re-rendering-too-often)
- [Should I only connect my top component, or can I connect multiple components in my tree?](https://redux.js.org/faq/reactredux#why-is-my-component-re-rendering-too-often)