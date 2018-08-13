import hoistStatics from 'hoist-non-react-statics'
import invariant from 'invariant'
import React, { Component, PureComponent } from 'react'
import * as propTypes from 'prop-types'
import shallowEqual from 'shallow-equals'
import { isValidElementType } from 'react-is'

import { Consumer } from './Context'

export default function connectAdvanced(
  /*
    selectorFactory is a func that is responsible for returning the selector function used to
    compute new props from state, props, and dispatch. For example:

      export default connectAdvanced((dispatch, options) => (state, props) => ({
        thing: state.things[props.thingId],
        saveThing: fields => dispatch(actionCreators.saveThing(props.thingId, fields)),
      }))(YourComponent)

    Access to dispatch is provided to the factory so selectorFactories can bind actionCreators
    outside of their selector as an optimization. Options passed to connectAdvanced are passed to
    the selectorFactory, along with displayName and WrappedComponent, as the second argument.

    Note that selectorFactory is responsible for all caching/memoization of inbound and outbound
    props. Do not use connectAdvanced directly without memoizing results between calls to your
    selector, otherwise the Connect component will re-render on every state or props change.
  */
  selectorFactory,
  // options object:
  {
    // the func used to compute this HOC's displayName from the wrapped component's displayName.
    // probably overridden by wrapper functions such as connect()
    getDisplayName = name => `ConnectAdvanced(${name})`,

    // shown in error messages
    // probably overridden by wrapper functions such as connect()
    methodName = 'connectAdvanced',

    // if defined, the name of the property passed to the wrapped element indicating the number of
    // calls to render. useful for watching in react devtools for unnecessary re-renders.
    renderCountProp = undefined,

    // determines whether this HOC subscribes to store changes
    shouldHandleStateChanges = true,

    // the key of props/context to get the store [**does nothing, use consumer**]
    storeKey = false,

    // if true, the wrapped element is exposed by this HOC via the getWrappedInstance() function.
    withRef = false,

    // the context consumer to use
    consumer = Consumer,

    // additional options are passed through to the selectorFactory
    ...connectOptions
  } = {}
) {
  invariant(!withRef,
    `withRef is removed. To access the wrapped instance, simply pass in ref`
  )

  return function wrapWithConnect(WrappedComponent) {
    invariant(
      isValidElementType(WrappedComponent),
      `You must pass a component to the function returned by ` +
      `${methodName}. Instead received ${JSON.stringify(WrappedComponent)}`
    )

    const wrappedComponentName = WrappedComponent.displayName
      || WrappedComponent.name
      || 'Component'

    const displayName = getDisplayName(wrappedComponentName)

    class PureWrapper extends PureComponent {
      render() {
        const { forwardRef, ...props } = this.props
        return <WrappedComponent {...props} ref={forwardRef} />
      }
    }
    PureWrapper.propTypes = {
      forwardRef: propTypes.oneOfType([
        propTypes.func,
        propTypes.object
      ])
    }

    const selectorFactoryOptions = {
      ...connectOptions,
      getDisplayName,
      methodName,
      renderCountProp,
      shouldHandleStateChanges,
      storeKey,
      withRef,
      displayName,
      wrappedComponentName,
      WrappedComponent
    }

    class Connect extends Component {
      constructor(props) {
        super(props)
        invariant(!props[storeKey],
          'storeKey is deprecated and does not do anything. To use a custom redux store for a single component, ' +
          'create a custom React context with React.createContext() and pass the Provider to react-redux\'s provider ' +
          'and the Consumer to this component as in <Provider context={context.Provider}><' +
          wrappedComponentName + ' consumer={context.Consumer} /></Provider>'
        )
        this.memoizedProps = this.makeMemoizer()
        this.renderWrappedComponent = this.renderWrappedComponent.bind(this)
        this.renderCount = 0
      }

      makeMemoizer() {
        let lastProps
        let lastState
        let lastDerivedProps
        let lastStore
        let sourceSelector
        let called = false
        return (state, props, store) => {
          if (called) {
            const sameProps = connectOptions.pure && shallowEqual(lastProps, props)
            const sameState = lastState === state
            if (sameProps && sameState) {
              return lastDerivedProps
            }
          }
          if (store !== lastStore) {
            sourceSelector = selectorFactory(store.dispatch, selectorFactoryOptions)
          }
          lastStore = store
          called = true
          lastProps = props
          lastState = state
          const nextProps = sourceSelector(state, props)
          if (shallowEqual(lastDerivedProps, nextProps)) {
            return lastDerivedProps
          }
          lastDerivedProps = nextProps
          return lastDerivedProps
        }
      }

      addExtraProps(props) {
        if (!forwardRef && !renderCountProp) return props
        // make a shallow copy so that fields added don't leak to the original selector.
        // this is especially important for 'ref' since that's a reference back to the component
        // instance. a singleton memoized selector would then be holding a reference to the
        // instance, preventing the instance from being garbage collected, and that would be bad
        const withExtras = { ...props }
        if (renderCountProp) withExtras[renderCountProp] = this.renderCount++
        return withExtras
      }

      renderWrappedComponent(value) {
        invariant(value,
          `Could not find "store" in either the context of ` +
          `"${displayName}". Either wrap the root component in a <Provider>, ` +
          `or pass a custom React context provider to <Provider> and the corresponding ` +
          `React context consumer to ${displayName}.`
        )
        const { state, store } = value
        const { forwardRef, ...otherProps } = this.props
        const derivedProps = this.addExtraProps(this.memoizedProps(state, otherProps, store))
        if (connectOptions.pure) {
          return <PureWrapper {...derivedProps} forwardRef={forwardRef}/>
        }
        return <WrappedComponent {...derivedProps} ref={forwardRef} />
      }

      render() {
        const MyConsumer = this.props.consumer || consumer
        return (
          <MyConsumer>
            {this.renderWrappedComponent}
          </MyConsumer>
        )
      }
    }

    Connect.WrappedComponent = WrappedComponent
    Connect.displayName = displayName
    Connect.propTypes = {
      consumer: propTypes.object,
      forwardRef: propTypes.oneOfType([
        propTypes.func,
        propTypes.object
      ])
    }

    function forwardRef(props, ref) {
      return <Connect {...props} forwardRef={ref} />
    }

    forwardRef.displayName = Connect.displayName
    const forwarded = React.forwardRef(forwardRef)
    forwarded.displayName = Connect.displayName
    forwarded.WrappedComponent = WrappedComponent
    return hoistStatics(forwarded, WrappedComponent)
  }
}
