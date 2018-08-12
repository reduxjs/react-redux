import hoistStatics from 'hoist-non-react-statics'
import invariant from 'invariant'
import React, { Component, PureComponent, createElement } from 'react'

import {ReactReduxContext} from "./context";

let hotReloadingVersion = 0


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

    // the key of props/context to get the store
    storeKey = 'store',

    // if true, the wrapped element is exposed by this HOC via the getWrappedInstance() function.
    withRef = false,

    // additional options are passed through to the selectorFactory
    ...connectOptions
  } = {}
) {
  const version = hotReloadingVersion++


  return function wrapWithConnect(WrappedComponent) {
    invariant(
      typeof WrappedComponent === 'function',
      `You must pass a component to the function returned by ` +
      `${methodName}. Instead received ${JSON.stringify(WrappedComponent)}`
    )

    const wrappedComponentName = WrappedComponent.displayName
      || WrappedComponent.name
      || 'Component'

    const displayName = getDisplayName(wrappedComponentName)

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


    const OuterBaseComponent = connectOptions.pure ? PureComponent : Component;

    class ConnectInner extends Component {
      constructor(props) {
        super(props);

        this.state = {
          wrapperProps : props.wrapperProps,
          renderCount : 0,
          store : props.store,
          error : null,
          childPropsSelector : this.createChildSelector(props.store),
          childProps : {},
        }

        this.state = {
          ...this.state,
          ...ConnectInner.getChildPropsState(props, this.state)
        }
      }

      createChildSelector(store = this.state.store) {
        return selectorFactory(store.dispatch, selectorFactoryOptions)
      }

      static getChildPropsState(props, state) {
        try {
          const nextProps = state.childPropsSelector(props.storeState, props.wrapperProps)
          if (nextProps === state.childProps) return null
          return { childProps: nextProps }
        } catch (error) {
          return { error }
        }
      }

      static getDerivedStateFromProps(props, state) {
        const nextChildProps = ConnectInner.getChildPropsState(props, state)

        if(nextChildProps === null) {
          return null;
        }

        return {
          ...nextChildProps,
          wrapperProps : props.wrapperProps,
        }
      }

      shouldComponentUpdate(nextProps, nextState) {
        const childPropsChanged = nextState.childProps !== this.state.childProps;
        const storeStateChanged = nextProps.storeState !== this.props.storeState;
        const hasError = !!nextState.error;

        let wrapperPropsChanged = false;

        const shouldUpdate = childPropsChanged || hasError;
        return shouldUpdate;

      }

      render() {
        if(this.state.error) {
          throw this.state.error;
        }

        return <WrappedComponent {...this.state.childProps} />
      }
    }

    class Connect extends OuterBaseComponent {
      constructor(props) {
        super(props)

        this.renderInner = this.renderInner.bind(this);
      }
/*
      addExtraProps(props) {
          if (!withRef && !renderCountProp) return props;

        // make a shallow copy so that fields added don't leak to the original selector.
        // this is especially important for 'ref' since that's a reference back to the component
        // instance. a singleton memoized selector would then be holding a reference to the
        // instance, preventing the instance from being garbage collected, and that would be bad
        const withExtras = { ...props }
        //if (withRef) withExtras.ref = this.setWrappedInstance
        if (renderCountProp) withExtras[renderCountProp] = this.renderCount++

        return withExtras
      }
*/

      renderInner(providerValue) {
          const {storeState, store} = providerValue;

          return (
            <ConnectInner
              key={this.version}
              storeState={storeState}
              store={store}
              wrapperProps={this.props}
            />
          );
      }

      render() {
          return (
              <ReactReduxContext.Consumer>
                  {this.renderInner}
              </ReactReduxContext.Consumer>
          )
      }
    }

    Connect.WrappedComponent = WrappedComponent
    Connect.displayName = displayName

    // TODO We're losing the ability to add a store as a prop. Not sure there's anything we can do about that.

      // TODO With connect no longer managing subscriptions, I _think_ is is all unneeded
      /*
    if (process.env.NODE_ENV !== 'production') {
      Connect.prototype.componentWillUpdate = function componentWillUpdate() {
        // We are hot reloading!
        if (this.version !== version) {
          this.version = version
          this.initSelector()

          // If any connected descendants don't hot reload (and resubscribe in the process), their
          // listeners will be lost when we unsubscribe. Unfortunately, by copying over all
          // listeners, this does mean that the old versions of connected descendants will still be
          // notified of state changes; however, their onStateChange function is a no-op so this
          // isn't a huge deal.
          let oldListeners = [];

          if (this.subscription) {
            oldListeners = this.subscription.listeners.get()
            this.subscription.tryUnsubscribe()
          }
          this.initSubscription()
          if (shouldHandleStateChanges) {
            this.subscription.trySubscribe()
            oldListeners.forEach(listener => this.subscription.listeners.subscribe(listener))
          }
        }
      }
    }
    */

    return hoistStatics(Connect, WrappedComponent)
  }
}
