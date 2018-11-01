import hoistStatics from 'hoist-non-react-statics'
import invariant from 'invariant'
import React, { Component, PureComponent } from 'react'
import propTypes from 'prop-types'
import { isValidElementType } from 'react-is'

import {ReactReduxContext} from './Context'

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
    storeKey = 'store',

    // REMOVED: expose the wrapped component via refs
    withRef = false,

    // use React's forwardRef to expose a ref of the wrapped component
    forwardRef = false,

    // the context consumer to use
    context = ReactReduxContext,

    // additional options are passed through to the selectorFactory
    ...connectOptions
  } = {}
) {
  invariant(renderCountProp === undefined,
    `renderCountProp is removed. render counting is built into the latest React dev tools profiling extension`
  )

  invariant(!withRef,
    "withRef is removed. To access the wrapped instance, use a ref on the connected component"
  )

  invariant(storeKey === 'store',
    'storeKey has been removed and does not do anything. To use a custom redux store for a single component, ' +
    'create a custom React context with React.createContext() and pass the Provider to react-redux\'s provider ' +
    'and the Consumer to this component as in <Provider context={context.Provider}><' +
    'ConnectedComponent consumer={context.Consumer} /></Provider>'
  )


  const Context = context

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

    let PureWrapper

    if (forwardRef) {
      class PureWrapperRef extends Component {
        shouldComponentUpdate(nextProps) {
          return nextProps.derivedProps !== this.props.derivedProps
        }

        render() {
          let { forwardRef, derivedProps } = this.props
          return <WrappedComponent {...derivedProps} ref={forwardRef} />
        }
      }
      PureWrapperRef.propTypes = {
        derivedProps: propTypes.object,
        forwardRef: propTypes.oneOfType([
          propTypes.func,
          propTypes.object
        ])
      }
      PureWrapper = PureWrapperRef
    } else {
      class PureWrapperNoRef extends Component {
        shouldComponentUpdate(nextProps) {
          return nextProps.derivedProps !== this.props.derivedProps
        }

        render() {
          return <WrappedComponent {...this.props.derivedProps} />
        }
      }
      PureWrapperNoRef.propTypes = {
        derivedProps: propTypes.object,
      }
      PureWrapper = PureWrapperNoRef
    }

    const selectorFactoryOptions = {
      ...connectOptions,
      getDisplayName,
      methodName,
      renderCountProp,
      shouldHandleStateChanges,
      storeKey,
      displayName,
      wrappedComponentName,
      WrappedComponent
    }

    const OuterBase = connectOptions.pure ? PureComponent : Component

    class Connect extends OuterBase {
      constructor(props) {
        super(props)
        invariant(forwardRef ? !props.props[storeKey] : !props[storeKey],
          'Passing redux store in props has been removed and does not do anything. ' +
          'To use a custom redux store for a single component, ' +
          'create a custom React context with React.createContext() and pass the Provider to react-redux\'s provider ' +
          'and the Consumer to this component\'s connect as in <Provider context={context.Provider}></Provider>' +
          ` and connect(mapState, mapDispatch, undefined, { consumer=context.consumer })(${wrappedComponentName})`
        )
        this.generatedDerivedProps = this.makeDerivedPropsGenerator()
        this.renderWrappedComponent = this.renderWrappedComponent.bind(this)
      }

      makeDerivedPropsGenerator() {
        let lastProps
        let lastState
        let lastDerivedProps
        let lastStore
        let sourceSelector
        return (state, props, store) => {
          if ((connectOptions.pure && lastProps === props) && (lastState === state)) {
            return lastDerivedProps
          }
          if (store !== lastStore) {
            lastStore = store
            sourceSelector = selectorFactory(store.dispatch, selectorFactoryOptions)
          }
          lastProps = props
          lastState = state
          const nextProps = sourceSelector(state, props)
          if (lastDerivedProps === nextProps) {
            return lastDerivedProps
          }
          lastDerivedProps = nextProps
          return lastDerivedProps
        }
      }

      renderWrappedComponentWithRef(value) {
        invariant(value,
          `Could not find "store" in the context of ` +
          `"${displayName}". Either wrap the root component in a <Provider>, ` +
          `or pass a custom React context provider to <Provider> and the corresponding ` +
          `React context consumer to ${displayName} in connect options.`
        )
        const { storeState, store } = value
        const { forwardRef, props } = this.props
        let derivedProps = this.generatedDerivedProps(storeState, props, store)
        if (connectOptions.pure) {
          return <PureWrapper derivedProps={derivedProps} forwardRef={forwardRef} />
        }

        return <WrappedComponent {...derivedProps} ref={forwardRef} />
      }

      renderWrappedComponent(value) {
        invariant(value,
          `Could not find "store" in the context of ` +
          `"${displayName}". Either wrap the root component in a <Provider>, ` +
          `or pass a custom React context provider to <Provider> and the corresponding ` +
          `React context consumer to ${displayName} in connect options.`
        )
        const { storeState, store } = value
        let derivedProps = this.generatedDerivedProps(storeState, this.props, store)
        if (connectOptions.pure) {
          return <PureWrapper derivedProps={derivedProps} />
        }

        return <WrappedComponent {...derivedProps} />
      }

      render() {
        if (this.props.unstable_observedBits) {
          return (
            <Context.Consumer unstable_observedBits={this.props.unstable_observedBits}>
              {this.renderWrappedComponent}
            </Context.Consumer>
          )
        }
        return (
          <Context.Consumer>
            {this.renderWrappedComponent}
          </Context.Consumer>
        )
      }
    }

    Connect.WrappedComponent = WrappedComponent
    Connect.displayName = displayName
    if (forwardRef) {
      Connect.prototype.renderWrappedComponent = Connect.prototype.renderWrappedComponentWithRef
      Connect.propTypes = {
        props: propTypes.object,
        forwardRef: propTypes.oneOfType([
          propTypes.func,
          propTypes.object
        ])
      }
    }

    if (!forwardRef) {
      return hoistStatics(Connect, WrappedComponent)
    }

    function forwardRef(props, ref) {
      return <Connect props={props} forwardRef={ref} />
    }

    const forwarded = React.forwardRef(forwardRef)
    forwarded.displayName = displayName
    forwarded.WrappedComponent = WrappedComponent
    return hoistStatics(forwarded, WrappedComponent)
  }
}
