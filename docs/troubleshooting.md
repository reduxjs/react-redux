## Troubleshooting

Make sure to check out [Troubleshooting Redux](http://gaearon.github.io/redux/docs/Troubleshooting.html) first.

### My views aren’t updating!

See the link above.
In short,

* Reducers should never mutate state, they must return new objects, or React Redux won’t see the updates.
* Make sure you either bind action creators with the `mapDispatchToProps` argument to `connect()` or with the `bindActionCreators()` method, or that you manually call `dispatch()`. Just calling your `MyActionCreators.addTodo()` function won’t work because it just *returns* an action, but does not *dispatch* it.

### My views aren’t updating on route change with React Router 0.13

If you’re using React Router 0.13, you might [bump into this problem](https://github.com/gaearon/react-redux/issues/43). The solution is simple: whenever you use `<RouteHandler>` or the `Handler` provided by `Router.run`, pass the router state to it.

Root view:

```js
Router.run(routes, Router.HistoryLocation, (Handler, routerState) => { // note "routerState" here
  ReactDOM.render(
    <Provider store={store}>
      {/* note "routerState" here */}
      <Handler routerState={routerState} />
    </Provider>,
    document.getElementById('root')
  );
});
```

Nested view:

```js
render() {
  // Keep passing it down
  return <RouteHandler routerState={this.props.routerState} />;
}
```

Conveniently, this gives your components access to the router state!
You can also upgrade to React Router 1.0 which shouldn’t have this problem. (Let us know if it does!)

### My views aren’t updating when something changes outside of Redux

If your views depend on global state or [React “context”](http://facebook.github.io/react/docs/context.html), you might find that views decorated with `connect()` will fail to update.

>This is because `connect()` implements [shouldComponentUpdate](https://facebook.github.io/react/docs/component-specs.html#updating-shouldcomponentupdate) by default, assuming that your component will produce the same results given the same props and state. This is a similar concept to React’s [PureRenderMixin](https://facebook.github.io/react/docs/pure-render-mixin.html).

The _best_ solution to this is to make sure that your components are pure and pass any external state to them via props. This will ensure that your views do not re-render unless they actually need to re-render and will greatly speed up your application.

If that’s not practical for whatever reason (for example, if you’re using a library that depends heavily on React context), you may pass the `pure: false` option to `connect()`:

```
function mapStateToProps(state) {
  return { todos: state.todos };
}

export default connect(mapStateToProps, null, null, {
  pure: false
})(TodoApp);
```

This will remove the assumption that `TodoApp` is pure and cause it to update whenever its parent component renders. Note that this will make your application less performant, so only do this if you have no other option.

### Could not find "store" in either the context or props

If you have context issues,

1. [Make sure you don’t have a duplicate instance of React](https://medium.com/@dan_abramov/two-weird-tricks-that-fix-react-7cf9bbdef375) on the page.
2. Make sure you didn’t forget to wrap your root component in [`<Provider>`](#provider-store).
3. Make sure you’re running the latest versions of React and React Redux.

### Invariant Violation: addComponentAsRefTo(...): Only a ReactOwner can have refs. This usually means that you’re trying to add a ref to a component that doesn’t have an owner

If you’re using React for web, this usually means you have a [duplicate React](https://medium.com/@dan_abramov/two-weird-tricks-that-fix-react-7cf9bbdef375). Follow the linked instructions to fix this.
