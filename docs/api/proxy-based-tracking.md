---
id: proxy-based-tracking
title: Proxy-based Tracking
sidebar_label: Proxy-based Tracking
hide_title: true
---

# Proxy-based Tracking

This document describes about `useTrackedState` hook.

## How does this get used?

`useTrackedState` is a hook that can be used instead of `useSelector`.
It doesn't mean to replace `useSelector` completely.
It gives a new way of connecting Redux store to React.

> **Note**: It's not completely new in the sense that there already exists a library for `connect`: [beautiful-react-redux](https://github.com/theKashey/beautiful-react-redux)

The usage of `useTrackedState` is extremely simple.

```jsx
import React from 'react'
import { useTrackedState } from 'react-redux'

export const CounterComponent = () => {
  const { counter } = useTrackedState()
  return <div>{counter}</div>
}
```

Using props is intuitive.

```jsx
import React from 'react'
import { useTrackedState } from 'react-redux'

export const TodoListItem = props => {
  const state = useTrackedState()
  const todo = state.todos[props.id]
  return <div>{todo.text}</div>
}
```

## Why would you want to use it?

> For beginners: Far easier to understand Redux and R-R without the notion of selectors
> 
> For intermediates: Never needs to worry about memoized selectors
> 
> For experts: No stale props issue

## What are the differences in behavior compared to useSelector?

### Capabilities

A selector can create a derived values. For example:

```js
const isYoung = state => state.person.age < 11;
```

This selector computes a boolean value.

```js
const young = useSelector(isYoung);
```

With useSelector, a component only re-renders when the result of `isYoung` is changed.

```js
const young = useTrackedState().person.age < 11;
```

Whereas with useTrackedState, a component re-renders whenever the `age` value is changed.

### Caveats

Proxy-based tracking may not work 100% as expected.

> - Proxied states are referentially equal only in per-hook basis
> 
> ```js
> const state1 = useTrackedState();
> const state2 = useTrackedState();
> // state1 and state2 is not referentially equal
> // even if the underlying redux state is referentially equal.
> ```
> 
> You should use `useTrackedState` only once in a component.
> 
> - An object referential change doesn't trigger re-render if an property of the object is accessed in previous render
> 
> ```js
> const state = useTrackedState();
> const { foo } = state;
> return <Child key={foo.id} foo={foo} />;
> 
> const Child = React.memo(({ foo }) => {
>   // ...
> };
> // if foo doesn't change, Child won't render, so foo.id is only marked as used.
> // it won't trigger Child to re-render even if foo is changed.
> ```
> 
> It's recommended to use primitive values for props with memo'd components.
> 
> - Proxied state shouldn't be used outside of render
> 
> ```js
> const state = useTrackedState();
> const dispatch = useUpdate();
> dispatch({ type: 'FOO', value: state.foo }); // This may lead unexpected behavior if state.foo is an object
> dispatch({ type: 'FOO', value: state.fooStr }); // This is OK if state.fooStr is a string
> ```
> 
> It's recommended to use primitive values for `dispatch`, `setState` and others.

### Performance

useSelector is sometimes more performant because Proxies are overhead.

useTrackedState is sometimes more performant because it doesn't need to invoke a selector when checking for updates.

## What are the limitations in browser support?

Proxies are not supported in old browsers like IE11, and React Native (JavaScript Core).

However, one could use [proxy-polyfill](https://github.com/GoogleChrome/proxy-polyfill) with care.

There are some limitations with the polyfill. Most notably, it will fail to track undefined properties.

```js
const state = { count: 0 }

// this works with polyfill.
state.count

// this won't work with polyfill.
state.foo
```

So, if the state shape is defined initially and never changed, it should be fine.

`Object.key()` and `in` operater is not supported. There might be other cases that polyfill doesn't support.
