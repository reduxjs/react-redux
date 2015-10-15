## Quick Start

React bindings for Redux embrace the idea of [dividing “smart” and “dumb” components](https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0).

It is advisable that only top-level components of your app (such as route handlers, for example) are aware of Redux. Components below them should be “dumb” and receive all data via props.


<table>
    <thead>
        <tr>
            <th></th>
            <th scope="col" style="text-align:left">“Smart” Components</th>
            <th scope="col" style="text-align:left">“Dumb” Components</th>
        </tr>
    </thead>
    <tbody>
        <tr>
          <th scope="row" style="text-align:right">Location</th>
          <td>Top level, route handlers</td>
          <td>Middle and leaf components</td>
        </tr>
        <tr>
          <th scope="row" style="text-align:right">Aware of Redux</th>
          <td>Yes</th>
          <td>No</th>
        </tr>
        <tr>
          <th scope="row" style="text-align:right">To read data</th>
          <td>Subscribe to Redux state</td>
          <td>Read data from props</td>
        </tr>
        <tr>
          <th scope="row" style="text-align:right">To change data</th>
          <td>Dispatch Redux actions</td>
          <td>Invoke callbacks from props</td>
        </tr>
    </tbody>
</table>

### “Dumb” components are unaware of Redux

Let’s say we have a `<Counter />` “dumb” component with a number `value` prop, and an `onIncrement` function prop that it will call when user presses an “Increment” button:

```js
import { Component } from 'react';

export default class Counter extends Component {
  render() {
    return (
      <button onClick={this.props.onIncrement}>
        {this.props.value}
      </button>
    );
  }
}
```

### “Smart” components are `connect()`-ed to Redux

Here’s how we hook it up to the Redux Store.

We will use the `connect()` function provided by `react-redux` to turn a “dumb” `Counter` into a smart component. The `connect()` function lets you specify *which exact* state from the Redux store your component wants to track. This lets you subscribe on any level of granularity.

##### `containers/CounterContainer.js`

```js
import { Component } from 'react';
import { connect } from 'react-redux';

import Counter from '../components/Counter';
import { increment } from '../actionsCreators';

// Which part of the Redux global state does our component want to receive as props?
function mapStateToProps(state) {
  return {
    value: state.counter
  };
}

// Which action creators does it want to receive by props?
function mapDispatchToProps(dispatch) {
  return {
    onIncrement: () => dispatch(increment())
  };
}

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(Counter);

// You can also pass an object instead of defining `mapDispatchToProps`:
// export default connect(mapStateToProps, CounterActionCreators)(Counter);

// Or you can pass `dispatch` down as a prop if you omit `mapDispatchToProps`:
// export default connect(mapStateToProps)(Counter);

// See more recipes in detailed connect() examples below.
```

Whether to put the `connect()` call in the same file as the “dumb” component, or separately, is up to you.  
Ask yourself whether you’d want to reuse this component but bind it to different data, or not.

### Nesting

You can have many `connect()`-ed components in your app at any depth, and you can even nest them. It is, however, preferable that you try to only `connect()` top-level components such as route handlers, so the data flow in your application stays predictable.

### Support for Decorators

You might have noticed that we used parens twice when calling `connect()`. This is called partial application, and it lets people
use ES7’s proposed decorator syntax:

```js
// Unstable syntax! It might change or break in production.
@connect(mapStateToProps)
export default class CounterContainer { ... }
```

Don’t forget decorators are experimental! They desugar to function calls anyway as the example above demonstrates.

### Additional Flexibility

This is the most basic usage, but `connect()` supports many other patterns: just passing the vanilla `dispatch()` function down, binding multiple action creators, passing them in an `actions` prop, selecting parts of state and binding action creators depending on `props`, and so on. Check out the `connect()` docs below to learn more.

### Injecting Redux Store

Finally, how do we actually hook it up to the Redux store? We need to create the store somewhere at the root of our component hierarchy. For client apps, the root component is a good place. For server rendering, you can do this in the request handler.

The trick is to wrap the whole view hierarchy into a `<Provider>` from React Redux.

```js
import ReactDOM from 'react-dom';
import { Component } from 'react';
import { Provider } from 'react-redux';

class App extends Component {
  render() {
    // ...
  }
}

const targetEl = document.getElementById('root');

ReactDOM.render(
  <Provider store={store}>
    <App />
  </Provider>,
  targetEl
);
```
