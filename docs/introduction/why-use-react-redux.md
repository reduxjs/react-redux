---
id: why-use-react-redux
title: Why use React-Redux
hide_title: true
sidebar_label: Why use React-Redux
---


# Why use React-Redux

[Redux](https://github.com/reduxjs/redux ) is a fairly simple library for state management, and has made working with React more manageable for everyone. However, there are several cases where people unconsiously follow tutorials or boilerplate code to integrate `redux` into their  `React` applications without understanding all the moving parts involved.

## React + Redux (without `react-redux`)

Nowadays, part of the community is still uncertain when it comes to which libraries they should install in a `React` + `Redux` app. It's no fault of anyone, as `Redux`'s popularity rises, so too do its learning materials. It's easy to get confused, especially for newcomers. It's hard to believe, but `react-redux` (`Provider` and `connect`) **is not required** in order to use `Redux` in a `React` app. For example: 


```jsx
import React from 'react'
import ReactDOM from 'react-dom'
import { createStore } from  'redux'

const counter = (state = 0, action) => {
  switch (action.type) {
    case 'INCREMENT':
      return state + 1
    case 'DECREMENT':
      return state - 1
    default:
      return state
  }
} 

const Counter = ({
  value,
  onIncrement,
  onDecrement
}) => (
  <div>
    <h1>{value}</h1>
    <button onClick={onIncrement}>+</button>
    <button onClick={onDecrement}>-</button>
  </div>
)


const store = createStore(counter)

const render = () => {
  ReactDOM.render(
    <Counter
      value={store.getState()}
      onIncrement={() =>
        store.dispatch({
          type: 'INCREMENT'           
        })            
      }
      onDecrement={() => 
        store.dispatch({
          type: 'DECREMENT'           
        })            
      }
    />,
    document.getElementById('root')
  )
}

store.subscribe(render)
render()
```  

If you had spent time looking into `redux`, you have now come to an understanding that all `Redux`'s functionalities revolve around the `store` (_further information [the three principles of Redux](https://redux.js.org/introduction/threeprinciples)_), and also realized that there is no way to directly modify the store. The only way to do so is through reducers, and the only way to trigger reducers is by dispatching actions. 

The same concept is applied to retrieve data from the `store`. 
We cannot get data directly from the `store`, instead, we can use the `getState()` method to give us a snapshot of the current state in the `store`.

The `subscribe` adds a change listener. It will be called any time an action is dispatched, and some part of the state tree may potentially have changed.

> So ultimately, **to change data, we only need to dispatch an action. To get data we simply use the `getState()`method**, and as shown in the example above, you don't need to use `react-redux` (`Provider` and `connect`) to have this ability. **It's important to know that all API's that manipulate the store, such as `dispatch`, `getState()` and `subscribe`, come strictly from `redux` store** 


## Understanding `react-Redux`

As mentioned previously, we understand that we can create an application without `react-redux`, but here are the **reasons why you should use `react-redux`**: 


### `Provider`

Provider is a `React` component given to us by the `react-redux` library. It serves just one purpose : to **provide** the `store` to all of its child components.

If we want to link our `React` application with the `react-redux`'s `Provider`, we would do it as the example shown below:

```jsx
const store = createStore(counter)

render(
  <Provider store={store}>
     <Header/>
       <Counter />
     <Footer />
  </Provider>,
  document.getElementById('root')
)
```

> Notice that the provider is wrapping the whole application, making the `store` accessible to all  of its children components (`<Header />`, `<Counter />` and `<Footer />`), which means that all components mentioned have access to the `store`.  **Have in mind that the Provider is nothing but a `component`,thus, it enables us to have multiple `Provider`'s, providing different `store`'s, for differents parts of the application.** _This is an advance technique_.



### `connect` 

Now that we have **provided** the `redux` `store` to our application, _**how do we get the state through our child components?**_


 That's how the `connect` come to play. We have previously established that there is no way to directly interact with the `store`. We can either retrieve data by obtaining its current state ( `store.getState()`), or change its state by dispatching an action (`store.dispatch`).
 
Based on the first example, we were using the methods straight from the `redux` `store`, which for that use case it happened to work just fine as **it was a very small app**. The biggest problem often occurs when the app starts to grow, for instance:

If we get the previous example, and decided not to use the `Provider` from `react-redux` we would have all the important parts such as `getState()` and `dispatch`, passed down as `props` to its respective child components, like: 

```jsx
const store = createStore(combinedReducers)

const { counter, userInfo } = store.getState()

ReactDOM.render(
  <div>
   <Header userInfo={userInfo} />
    <Counter 
      counter={counter}    
      onIncrement={() =>
        store.dispatch({
          type: 'INCREMENT'           
        })            
      }
      onDecrement={() => 
        store.dispatch({
          type: 'DECREMENT'           
        })            
      }
    />
   <Footer userInfo={userInfo} />
  </div>
  document.getElementById('root')
)
```

> It's easy to understand that in a long run, this pattern will become really hard to be maintained.
This pattern is known as _*[Props drilling](https://blog.kentcdodds.com/prop-drilling-bb62e02cb691) (check for more information on the subject)*_.

On the other hand, the `connect` comes to solve this problem. Consider this piece of code, which uses `connect` to map the `store`s' state and `dispatch` to the props of our `Counter`: 


```jsx
import { connect } from 'react-redux'

const Counter = ({
  value,
  onIncrement,
  onDecrement
}) => (
  <div>
    <h1>{value}</h1>
    <button onClick={onIncrement}>+</button>
    <button onClick={onDecrement}>-</button>
  </div>
)


const mapStateToProps = state => {
  return {
    value: state.counter
  }
}

const mapDispatchToProps = dispatch => {
  return {
    onIncrement: () =>
      dispatch({
        type: 'INCREMENT'
      }),
    onDecrement: () => 
     dispatch({
        type: 'DECREMENT'
      }),
  }
}

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(Counter)

```


`mapStateToProps` and `mapDispatchToProps` are both pure functions that provide the **`store`**'s state and `dispatch` respectively. **Therefore, both functions have to return an object, whose keys will then be passed on as the `props` of the `component` they are connected to.** (_Note tha there are other arguments in the `connect`, for more information on some complex use cases, check [API](/docs/api))_

In this case, `mapStateToProps` returns an `object` with only one key : `value`, and `mapDispatchToProps` returns an `object` with two keys the `onIncrement` and `onDecrement`.

The **connected** component (which is exported) provides `value`, `onIncrement` and `onDecrement` as props to `<Counter />`.

> It’s important to note that only components **within** the `Provider` can receive the `store`'s state and `dispatch`.

## Benefits of using `react-redux`

There are several benefits on using `react-redux` and here goes some of the major ones. 

### Modularity

The `Provider` and `connect` create a whole new world when it comes to state modularity. It enables components access the state in any direction, not just **top to down** as `React` defaults to, in other words, if `<Header />` and `<Footer />` need a piece of data from `UserInfo`, we no longer need to flux it down as `props`, **all we would have to do is `connect` these two components, and cherry pick the data we need**. The `connect` makes the component state independent, connecting the `component` directly to the `store`, despite its location in the component hierarchy. 


### Logic vs UI 

Having the ability to `connect` a component and **configurate** which kind of `props` it will be received through `mapStateToProps` and `mapDispatchToProps`, gives us an ability to create components that don't need to receive any kind of logic, **just the instructions on what to do**(_The community refers to them as stateless functional components, for more information visit [Components and Props](https://reactjs.org/docs/components-and-props.html)_). 

Also, this pattern gives us the liberty to recycle Logic for multiple components, for instance, we have `<Button />` and `<SpecialButton />`, both need to have the ability to change its text when `hovered`. We could simply `connect` them and assign `dispatch({ type: "CHANGE_TEXT"})` for both of them. 

### Testability

As mentioned above, the separation of Logic and UI also makes testing straight forward, considering that reduces its complexity, _what do I mean by that?_
> **It's much easier to test a stateless functional component with absolutely no logic than a component filled with logic within.** 

 In most cases, when we test a stateless functional component, all we have to do is test its **props**, nothing else. 
 We could also say the same for the Logic such as `reducers`, `actions`, they are nothing but pure `functions` (_For more information in pure `functions` check [Changes are made with pure functions](https://redux.js.org/introduction/threeprinciples#changes-are-made-with-pure-functions)_ )


 ### Separation of Concerns

Nowadays, one of the main issues when it comes to maintain a large project is due to how we organize it. `react-redux` provides flexibility on how to serve state to our application as well as make logic and presentational components live independently. It gives us options on how to organize the project and that's a huge benefit when it comes to large team.




