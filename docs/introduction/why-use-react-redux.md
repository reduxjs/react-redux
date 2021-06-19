---
id: why-use-react-redux
title: Why Use React Redux?
hide_title: true
sidebar_label: Why Use React Redux?
description: 'Introduction > Why Use React Redux: benefits of using React Redux in a React app'
---

&nbsp;

# Why Use React Redux?

Redux itself is a standalone library that can be used with any UI layer or framework, including React, Angular, Vue, Ember, and vanilla JS. Although Redux and React are commonly used together, they are independent of each other.

If you are using Redux with any kind of UI framework, you will normally use a "UI binding" library to tie Redux together with your UI framework, rather than directly interacting with the store from your UI code.

**React Redux is the official Redux UI binding library for React**. If you are using Redux and React together, you should also use React Redux to bind these two libraries.

To understand why you should use React Redux, it may help to understand what a "UI binding library" does.

:::info

If you have questions about whether you should use Redux in general, please see these articles for discussion of when and why you might want to use Redux, and how it's intended to be used:

- [Redux docs: Motivation](https://redux.js.org/introduction/motivation)
- [Redux docs: FAQ - When should I use Redux?](https://redux.js.org/faq/general#when-should-i-use-redux)
- [You Might Not Need Redux](https://medium.com/@dan_abramov/you-might-not-need-redux-be46360cf367)
- [Idiomatic Redux: The Tao of Redux, Part 1 - Implementation and Intent](https://blog.isquaredsoftware.com/2017/05/idiomatic-redux-tao-of-redux-part-1/)

:::

## Integrating Redux with a UI

Using Redux with _any_ UI layer requires [the same consistent set of steps](https://blog.isquaredsoftware.com/presentations/workshops/redux-fundamentals/ui-layer.html#/4):

1. Create a Redux store
2. Subscribe to updates
3. Inside the subscription callback:
   1. Get the current store state
   2. Extract the data needed by this piece of UI
   3. Update the UI with the data
4. If necessary, render the UI with initial state
5. Respond to UI inputs by dispatching Redux actions

While it is possible to write this logic by hand, doing so would become very repetitive. In addition, optimizing UI performance would require complicated logic.

The process of subscribing to the store, checking for updated data, and triggering a re-render can be made more generic and reusable. **A UI binding library like React Redux handles the store interaction logic, so you don't have to write that code yourself.**

:::info

For a deeper look at how React Redux works internally and how it handles the store interaction for you, see **[Idiomatic Redux: The History and Implementation of React Redux](https://blog.isquaredsoftware.com/2018/11/react-redux-history-implementation/)**.

:::

## Reasons to Use React Redux

### It is the Official Redux UI Bindings for React

While Redux can be used with any UI layer, it was originally designed and intended for use with React. There are [UI binding layers for many other frameworks](https://redux.js.org/introduction/ecosystem#library-integration-and-bindings), but React Redux is maintained directly by the Redux team.

As the official Redux binding for React, React Redux is kept up-to-date with any API changes from either library, to ensure that your React components behave as expected. Its intended usage adopts the design principles of React - writing declarative components.

### It Implements Performance Optimizations For You

React is generally fast, but by default any updates to a component will cause React to re-render all of the components inside that part of the component tree. This does require work, and if the data for a given component hasn't changed, then re-rendering is likely some wasted effort because the requested UI output would be the same.

If performance is a concern, the best way to improve performance is to skip unnecessary re-renders, so that components only re-render when their data has actually changed. **React Redux implements many performance optimizations internally, so that your own component only re-renders when it actually needs to.**

In addition, by connecting multiple components in your React component tree, you can ensure that each connected component only extracts the specific pieces of data from the store state that are needed by that component. This means that your own component will need to re-render less often, because most of the time those specific pieces of data haven't changed.

### Community Support

As the official binding library for React and Redux, React Redux has a large community of users. This makes it easier to ask for help, learn about best practices, use libraries that build on top of React Redux, and reuse your knowledge across different applications.

## Links and References

### Understanding React Redux

- [Idiomatic Redux: The History and Implementation of React Redux](https://blog.isquaredsoftware.com/2018/11/react-redux-history-implementation/)
- [`connect.js` Explained](https://gist.github.com/gaearon/1d19088790e70ac32ea636c025ba424e)
- [Redux Fundamentals workshop slides](https://blog.isquaredsoftware.com/2018/06/redux-fundamentals-workshop-slides/)
  - [UI Layer Integration](https://blog.isquaredsoftware.com/presentations/workshops/redux-fundamentals/ui-layer.html)
  - [Using React Redux](https://blog.isquaredsoftware.com/presentations/workshops/redux-fundamentals/react-redux.html)

### Community Resources

- Discord channel: [#redux on Reactiflux](https://discord.gg/0ZcbPKXt5bZ6au5t) ([Reactiflux invite link](https://reactiflux.com))
- Stack Overflow topics: [Redux](https://stackoverflow.com/questions/tagged/redux), [React Redux](https://stackoverflow.com/questions/tagged/redux)
- Reddit: [/r/reactjs](https://www.reddit.com/r/reactjs/), [/r/reduxjs](https://www.reddit.com/r/reduxjs/)
- GitHub issues (bug reports and feature requests): https://github.com/reduxjs/react-redux/issues
- Tutorials, articles, and further resources: [React/Redux Links](https://github.com/markerikson/react-redux-links)
