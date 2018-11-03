---
id: selector-functions
title: Selector Functions
hide_title: true
sidebar_label: Selector Functions
---

# Selector Functions

When you design a redux application, you are encouraged to have your application data in a [normalised state](https://redux.js.org/recipes/structuringreducers/normalizingstateshape#normalizing-nested-data) as well as [keep your store state minimal and derive the appropriate pieces of information when needed](https://redux.js.org/recipes/computingderiveddata). As your application grows different parts of it will require different slices of the state and to grab the correct slice we recommend to use **selector functions**. In this section, we will have a deeper look into selectors and how to correctly use **reselect**, a selector library, to create them.

## Understanding selectors

### What is a selector

A selector is any function that accepts as an argument our application state or part of it and returns the data which is required by us. We don’t need to use any library to create a selector and it doesn’t matter if we write them as an arrow function or with the `function` keyword. It is a good practice to keep our selector as a pure function which will also make it easier to test. For example:

```js
const selectRecipes = state => state.recipes;

const selectSomeSpecificField = state => state.some.deeply.nested.field;

function selectIngredientsIds(state) {
  return state.ingredients.map(ingredient => ingredient.id);
}

function selectRestaurantsInCity(restaurants, city) {
  const filteredRestaurants = restaurants.filter(restaurant => restaurant.city === city);
  return filteredRestaurants
}
```

- The name of our selectors could be anything but it is a good practice to prefix them with `select` or `get` or end the name with `Selector` i.e. `selectCity`, `getRestaurant` or `ingredientsSelector`.
- [Have a look at this Twitter poll on how to name selectors](https://twitter.com/_jayphelps/status/739905438116806656)

### Why use selectors

You may wonder why you should use selectors. The first reason is for encapsulation and reusability. For example, let's say one of our `mapStateToProps` function looks like:

```js
const mapStateToProps = (state) => {
    const data = state.some.deeply.nested.field;

    return { data };
}
```

Accessing the data like this is absolutely fine but imagine that you require the same piece of information in several other components and when you make an API call. What will happen if you change the place where that piece of data live? You will have to find every instance where you have accessed that data and change it.

So in the same way [action creators are used to encapsulate the details of creating actions](https://blog.isquaredsoftware.com/2016/10/idiomatic-redux-why-use-action-creators/), we recommend to encapsulate the access of data in one place. Ideally, only our reducer functions and selectors should know the exact state structure, so if we change where some state lives, we would only need to update those two pieces of logic.

## Selector performance

Once we have encapsulated our logic of accessing the data, the next thing to consider is performance. Imagine that we have a component that requires a very expensive operation(s) (filtering/sorting/transformation) before it gets its required information. For example:

```js
const mapStateToProps = state => {
    const { someData } = state;

    const filteredData = expensiveFiltering(someData);
    const sortedData = expensiveSorting(filteredData);
    const transformedData = expensiveTransformation(sortedData);

    return { data: transformedData };
}
```

Everytime our application state changes, the above `mapStateToProps` will run even if `someData` has not updated at all. What we really want to do in this situation is only execute our expensive operations when `someData` has changed. This is where the idea of **memoization** comes in.

### Memoization
Memoization is a form of caching where our `function` will be executed only when the `input` has changed. This means that if our `function` is called multiple times with the same `input` then it will return its cached result and not do any work.

### Reselect
One library that can help us with memoization is [reselect](https://github.com/reduxjs/reselect). Let's first look at how `reselect` works:

```js
import { createSelector } from 'reselect'

const selectBurger = state => state.burger;
const selectOrders = state => state.orders

// pass selectBurger and selectOrders as an array
const selectBurgerOrdersTotalPrice1 = createSelector(
  // input selector(s)
  [selectBurger, selectOrders],
  // output selector
  (burger, orders) => {
    return burger.price * orders.burgers;
  }
)

// pass selectBurger and selectOrders as separate arguments
const selectBurgerOrdersTotalPrice2 = createSelector(
  // input selector(s)
  selectBurger,
  selectOrders,
  // output selector
  (burger, orders) => {
    return burger.price * orders.burgers;
  }
)
```

In our example, we want to derive the total price of all burger orders. We use two input selectors `selectBurger` and `selectOrders` that give us the information about a single burger and the total number of orders respectively. Then we use `createSelector` from `reselect` to create a memoized selector function. As you can see there are several ways to create the selector - either pass the input selectors as an array or one after the other as separate arguments.

A good practice is to write our **top level input selectors** as plain functions and use `createSelector` to create memoized selectors that look up nested values. In our previous example, we have accessed the price of a burger and the total number of burger orders directly. Let's remedy that:

```js
// we keep selectBurger and selectOrders from the previous example.

const selectBurgerPrice = createSelector(
  // input selector(s)
  [selectBurger],
  // output selector
  (burger) => burger.price
);

const selectBurgerOrders = createSelector(
  // input selector(s)
  [selectOrders],
  // output selector
  (orders) => orders.burgers
);

const selectTotalBurgerOrdersPrice = createSelector(
  // input selector(s)
  [selectBurgerPrice, selectBurgerOrders],
  // output selector
  (burgerPrice, burgerOrders) => {
    console.log('Calling output selector')
    return burgerPrice * burgerOrders;
  }
);

const state = {
  burger: {
    price: 10
  },
  orders: {
    burgers: 5
  }
};

const result = selectTotalBurgerOrdersPrice(state);
// Log: 'Calling output selector'
console.log(result);
// 50

const secondResult = selectTotalBurgerOrdersPrice(state);
// No log output
console.log(result);
// 50
```

Note that here the second time we called `selectTotalBurgerOrdersPrice` our output selector function did not execute. The reason for this is that `reselect` will execute all of the `input` functions that you have given as arguments and compare the results. If any of the results are different, it will rerun our output selector and if not will return the cached result. In our case since our burger price and the number of burger orders have not changed we have received the cached result of `50`. A good thing to keep in mind is that `reselect` will use `===` operator when comparing the results of the input selectors.

### Reselect and memoization
By default `reselect` only memoizes the most recent set of parameters. This means if we call the selector multiple times with different arguments it will keep calling the output selector every time. Let's look at an example:

```js
// First call with the state and the table number one. Not memoized.
const tableOne = selectTableBill(state, 1);

// Second call with the same state and the same table number one.
// The result is memoized.
const tableOneAgain = selectTableBill(state, 1); 

// Same state but different table number.
// Result is not memoized as the inputs are different.
const tableTwo = selectTableBill(state, 2);

// Same state but different table number because
// we have previously used table number 2.
const chequeTableOneAgain = selectTableBill(state, 1); 
```

Keep in mind that we can also pass multiple arguments to our selector and `reselect` will call each selector with **the same arguments**. That's why every input selector should accept the same type of arguments or else our selector will break. For example:

```js
const selectOrders = state => state.orders;

// second argument (table) is an object
const selectDrinks = (state, table) => table.drinks;

// second argument (tableNumber) is a number
const selectTableGuests = (state, tableNumber) => guests;

const calculateBillForEachGuest = createSelector(
  // input selector(s)
  [selectOrders, selectDrinks, calculateBillForEachGuest],
  // output selector
  (orders, drinks, guests) => ...do something...
);

calculateBillForEachGuest(state, 1);
```

In this example, our selector will break because we will try to call `1.drinks` in our `selectDrinks` selector.

## React and Reselect

Let's go back to our `mapStateToProps` example from earlier. We only wanted to execute our expensive operations only when our state has changed. So let's refactor it by using what we have learnt:

```js
const selectSomeData = state => state.someData;

const selectFilteredSortedTransformedData = createSelector(
  // input selector
  [selectSomeData],
  // output selector
  (someData) => {
        const filteredData = expensiveFiltering(someData);
        const sortedData = expensiveSorting(filteredData);
        const transformedData = expensiveTransformation(sortedData);

        return transformedData;
  }
);

const mapStateToProps = state => {
    const transformedData = selectFilteredSortedTransformedData(state);

    return { data : transformedData };
};
```

Our refactor of `mapStateToProps` will now give us substantial performance improvements. There are two reasons for this:

- Our expensive operation will only run when `state.someData` has changed. So even if we `dispatch` an action that will update our `state.somethingElse`, we won't do any real work in our `mapStatetoProps`
- When we connect our component to the `redux` store, our `connect` function determines if our component needs to rerender by doing a shallow equality check using `===` operator. Since our cached result is going to be the same our component is not rerendered.

Things to keep in mind are:

- Array functions like `concat()`, `map()`, and `filter()` as well as object spread operator will return a new reference which will result in our component to rerender if we use them in our `mapStateToProps` function because our shallow comparison check will fail.
- Changing our whole state by creating a new object when an action is dispatch by doing `{ ...previousState, orders: newOrders }`. Have a look at [Immer](https://github.com/mweststrate/immer) which can help us with making those changes and keeping our data immutable.

## Advanced Optimizations

There is a specific use case that you could come across which will have an impact on performance. For example, when we render the same component multiple times:

```js
const mapStateToProps = (state, ownProps) => {
    const bill  = selectTableBill(state, ownProps.tableNumber);

    return { bill };
}

const BillComponent = props => <div>Bill: {props.bill}</div>;

export default connect(mapStateToProps)(BillComponent);

// render
<BillComponent tableNumber={1} />
<BillComponent tableNumber={2} />
```

We are rendering our `<BillComponent />` twice and passing it a `tableNumber` prop which is the only difference between the two instances. In our `mapStateToProps` function, we are using our selector `selectTableBill` which is referring to the same selector instance in our code base. We have previously discussed that `reselect` has a size cache of one so in this situation when we render and re-render our `<BillComponent />` what will happen will be:


```js
// it will not memoize. Doing a memoization with state and table number 1.
selectTableBill(state, 1);
// it will not memoize as our table parameter is different.
selectTableBill(state, 2); 
// it will not memoize as our table parameter is different.
selectTableBill(state, 1);
// it will not memoize as our table parameter is different.
selectTableBill(state, 2);
```

As you can see we are calling everytime our `selectTableBill` with different `inputs` and it will never be able to memoize properly.

To solve this `React-Redux connect` comes to the rescue. Both `mapStateToProps` and `mapDispatchToProps` accept **factory function** syntax which means we can create a different instance of our `selectTableBill` and use it there. What this will look like will be:

```js
const makeSelectTableBill = () => createSelector(
    [selectTable],
    (items, itemId) => items[itemId]
);


const mapStateToProps = state => {
    const selectTableBill = makeSelectTableBill();

    return function realMapStateToProps(state, ownProps) {
        const bill = selectTableBill(state, ownProps.tableNumber);

        return { bill };
    }
};

export default connect(mapStateToProps)(BillComponent);
```

Our `mapStateToProps` is now a closure which creates a new instance of `selectTableBill` selector. This means that when our `<BillComponent />` are now rendered on the page each of them will have a unique instance of `selectTableBill` selector and be properly memoized.

## Links and References

- [Idiomatic Redux: Using Reselect Selectors for Encapsulation and Performance](https://blog.isquaredsoftware.com/2017/12/idiomatic-redux-using-reselect-selectors/)
- [React/Redux Links: Redux Performance](https://github.com/markerikson/react-redux-links/blob/master/react-performance.md)
