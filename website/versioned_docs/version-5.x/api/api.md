---
id: api
title: Api
sidebar_label: API
hide_title: true
---

# API

<a id="provider"></a>
## Provider

Makes the Redux store available to the `connect()` calls in the component hierarchy below. Normally, you can’t use `connect()` without wrapping a parent or ancestor component in `<Provider>`.

If you *really* need to, you can manually pass `store` as a prop to every `connect()`ed component, but we only recommend to do this for stubbing `store` in unit tests, or in non-fully-React codebases. Normally, you should just use `<Provider>`.

### Props

* `store` (*[Redux Store](https://redux.js.org/api-reference/store)*): The single Redux store in your application.
* `children` (*ReactElement*) The root of your component hierarchy.

### Example

#### Vanilla React

```jsx
ReactDOM.render(
  <Provider store={store}>
    <MyRootComponent />
  </Provider>,
  rootEl
)
```

#### React Router

```jsx
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

