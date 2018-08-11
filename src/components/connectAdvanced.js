import hoistStatics from 'hoist-non-react-statics'
import invariant from 'invariant'
import React, { Component, createElement } from 'react'

import {ReactReduxContext} from "./context";
import { storeShape } from '../utils/PropTypes'

let hotReloadingVersion = 0
const dummyState = {}
function noop() {}
function makeSelectorStateful(sourceSelector) {
  // wrap the selector in an object that tracks its results between runs.
  const selector = {
    run: function runComponentSelector(props, storeState) {
      try {
        const nextProps = sourceSelector(storeState, props)
        if (nextProps !== selector.props || selector.error) {
          selector.shouldComponentUpdate = true
          selector.props = nextProps
          selector.error = null
        }
      } catch (error) {
        selector.shouldComponentUpdate = true
        selector.error = error
      }
    }
  }

  return selector
}

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

    class Connect extends Component {
      constructor(props) {
        super(props)

        this.version = version
        this.renderCount = 0
        this.storeState = null;


        this.setWrappedInstance = this.setWrappedInstance.bind(this)
        this.renderChild = this.renderChild.bind(this);

        // TODO How do we express the invariant of needing a Provider when it's used in render()?
        /*
        invariant(this.store,
          `Could not find "${storeKey}" in either the context or props of ` +
          `"${displayName}". Either wrap the root component in a <Provider>, ` +
          `or explicitly pass "${storeKey}" as a prop to "${displayName}".`
        )
        */
      }

      componentDidMount() {
        if (!shouldHandleStateChanges) return

        // componentWillMount fires during server side rendering, but componentDidMount and
        // componentWillUnmount do not. Because of this, trySubscribe happens during ...didMount.
        // Otherwise, unsubscription would never take place during SSR, causing a memory leak.
        // To handle the case where a child component may have triggered a state change by
        // dispatching an action in its componentWillMount, we have to re-run the select and maybe
        // re-render.
        this.selector.run(this.props, this.storeState);
        if (this.selector.shouldComponentUpdate) this.forceUpdate()
      }


      UNSAFE_componentWillReceiveProps(nextProps) {
        // TODO Do we still want/need to implement sCU / cWRP now?
        this.selector.run(nextProps, this.storeState);
      }

      shouldComponentUpdate() {
        return this.selector.shouldComponentUpdate
      }


      componentWillUnmount() {
        this.selector.run = noop
        this.selector.shouldComponentUpdate = false
      }

      getWrappedInstance() {
        invariant(withRef,
          `To access the wrapped instance, you need to specify ` +
          `{ withRef: true } in the options argument of the ${methodName}() call.`
        )
        return this.wrappedInstance
      }

      setWrappedInstance(ref) {
        this.wrappedInstance = ref
      }

      initSelector(dispatch, storeState) {
          const sourceSelector = selectorFactory(dispatch, selectorFactoryOptions)
          this.selector = makeSelectorStateful(sourceSelector)
          this.selector.run(this.props, storeState);
      }

      addExtraProps(props) {
          if (!withRef && !renderCountProp) return props;

        // make a shallow copy so that fields added don't leak to the original selector.
        // this is especially important for 'ref' since that's a reference back to the component
        // instance. a singleton memoized selector would then be holding a reference to the
        // instance, preventing the instance from being garbage collected, and that would be bad
        const withExtras = { ...props }
        if (withRef) withExtras.ref = this.setWrappedInstance
        if (renderCountProp) withExtras[renderCountProp] = this.renderCount++

        return withExtras
      }

      renderChild(providerValue) {
          const {storeState, dispatch} = providerValue;

          this.storeState = storeState;

          if(this.selector) {
            this.selector.run(this.props, storeState);
          }
          else {
              this.initSelector(dispatch, storeState);
          }

          if (this.selector.error) {
              // TODO This will unmount the whole tree now that we're throwing in render. Good idea?
              // TODO Related: https://github.com/reactjs/react-redux/issues/802
              throw this.selector.error
          }
          else if(this.selector.shouldComponentUpdate) {
              //console.log(`Re-rendering component (${displayName})`, this.selector.props);
              this.selector.shouldComponentUpdate = false;
            this.renderedElement = createElement(WrappedComponent, this.addExtraProps(this.selector.props));
          }
          else {
              //console.log(`Returning existing render result (${displayName})`, this.props)
          }

          return this.renderedElement;
      }

      render() {
          return (
              <ReactReduxContext.Consumer>
                  {this.renderChild}
              </ReactReduxContext.Consumer>
          )
      }
    }

    Connect.WrappedComponent = WrappedComponent
    Connect.displayName = displayName
    // TODO We're losing the ability to add a store as a prop. Not sure there's anything we can do about that.
    //Connect.propTypes = contextTypes

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
