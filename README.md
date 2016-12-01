React Redux Ally
=========================

This project spawned off of the React Redux project. The difference with this project is
a change in signature of the ally (previously connect) function, and the introduction of
some common actions and reducers that are needed to work with some of the ally Functionality.

## Differences between ally and connect

The ally function takes a single argument, which is an object. The function allows the following
parameters

* mapStateToProps: this is the same as the first argument of the connect function, and will allow
you to manually map values from the state to props of the component being wrapped.
* mapDispatchToProps: this is the same as the second argument of the connect function, and will
allow you to manually add properties to dispatch actions.
* mergeProps: this is the same as the third argument of the connect function, however the
signature is changed so that the fourth argument will be the ally props.
* options: this is the fourth argument of connect, and allows you to set the pure and withRef
property
* fields: this is the major addition to ally. Fields allow you to set properties that are
automatically mapped to the path that is provided. See below for the documentation on the
fields option.


## Philosophy difference with reducers

One of the main ideas that ally tries to implement is the idea of having full access to your
store from any component in a declarative way.

The first main idea is that any piece of data can be accessed from the root state via
a _path_, which is the chaining of properties on each object to get the desired value. A path
can either be a string in the dot format ('foo.bar') or an array of strings (['foo', 'bar']).

The second idea is that there
are certain needs for storing data for instances of components, rather than just components
or values that are intended to be shared between components. This second idea is accomplished
by specific usages of paths that are to be boxed into their own areas.

In ally, there are three types of fields: instance, component, and shared.

Instance fields have paths that are automatically prefixed by the component name, and then an
integer number that is unique to that instance. By setting the type to instance, you don't have
to worry about managing this detail.

Component fields have paths that are automatically prefixed by the component name. These values
are intended to be shared across instances of the same component.

Shared components have paths that remain unaltered. These paths are intended to be shared across
different components at different locations.


## Fields
Fields is accepted as an option to the ally function, as indicated above. Fields is an object
of objects that are used to define the fields that are available to the rendered component.
Here's a list of properties that are available to a field, and what that property does.

* name - this determines the name of the property that will be used for the field. If this
is not provided, then the key of the object will be used instead. Remember that this name ends
up as a key in the component's props, so choose wisely.
* type - the type must be either instance, component, or shared. This determines the path prefix
that will be automatically added to the path of the field. The default type is instance.
* path - this is the path of the field relative to the root of the store. This property can be a
string, array, or function that returns a string or array. If it is a function, a context with
the current props of the function, the store's state, and the store's dispatcher are made
available. (You don't want to dispatch anything here though, it's not supported.) This defaults
to the key of the object if necessary.
* defaultValue - this will be chosen if the field's value in the store is undefined. Please note
that this value will never be added to the store, but only used if the store's value is undefined.
* readonly - if this value is true, then the auto-generated setter is not added to the props. If it
is false, then the auto-generated setter with a name that is setPascalCase (e.g fooBar -> setFooBar)
is added to the props, which will dispatch a set command using the ally set action.
* getter - if this value is provided and is a function, then it will be used instead of the normal
retrieval method. If you need access to the original value, the defaultGetter function is passed in
as the first and only argument of the function.
* setter - if this value is provided and is a function, then it will be used instead of the normal
dispatch to ally set. The arguments of this function are the value and the defaultSetter function.

Example Field Definition:

```
fields {
    foo: {
        name: 'theFoo',
        type: 'component',
        path: ['data', 'foo'],
        defaultVale: 'defaultFoo',
    },
    bar: {
        type: 'component',
        getter: function () {
            return lodash.get(this.state, ['bar'])
        },
        setter: function (value) {
            this.dispatch(allyMerge('bar', value))
        }
    }
}
```

## License

MIT
