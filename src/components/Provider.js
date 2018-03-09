import React, { Component, Children } from 'react'
import PropTypes from 'prop-types'
import { storeShape, subscriptionShape } from '../utils/PropTypes'
import warning from '../utils/warning'

import {ReactReduxContext} from "./context";

let didWarnAboutReceivingStore = false
function warnAboutReceivingStore() {
  if (didWarnAboutReceivingStore) {
    return
  }
  didWarnAboutReceivingStore = true

  warning(
    '<Provider> does not support changing `store` on the fly. ' +
    'It is most likely that you see this error because you updated to ' +
    'Redux 2.x and React Redux 2.x which no longer hot reload reducers ' +
    'automatically. See https://github.com/reactjs/react-redux/releases/' +
    'tag/v2.0.0 for the migration instructions.'
  )
}

export function createProvider(storeKey = 'store', subKey) {
    //const subscriptionKey = subKey || `${storeKey}Subscription`

    class Provider extends Component {
        /*
        getChildContext() {
          return { [storeKey]: this[storeKey], [subscriptionKey]: null }
        }
        */

        constructor(props, context) {
          super(props, context)
          //this[storeKey] = props.store;

            const {store} = props;

          if(!store || !store.getState || !store.dispatch) {
              throw new Error("Must pass a valid Redux store as a prop to Provider");
          }

            this.state = {
                storeState : store.getState(),
                dispatch : store.dispatch,
            };
        }

        componentDidMount() {
            const {store} = this.props;

            this.unsubscribe = store.subscribe( () => {
                console.log("Provider subscription running");
                this.setState({storeState : store.getState()});
            });
        }

        render() {
            console.log("Provider re-rendering");

            return (
                <ReactReduxContext.Provider value={this.state}>
                    {Children.only(this.props.children)}
                </ReactReduxContext.Provider>
            );
        }
    }

    if (process.env.NODE_ENV !== 'production') {
      Provider.prototype.componentWillReceiveProps = function (nextProps) {
        if (this[storeKey] !== nextProps.store) {
          warnAboutReceivingStore()
        }
      }
    }


    Provider.propTypes = {
        store: storeShape.isRequired,
        children: PropTypes.element.isRequired,
    }
    /*
    Provider.childContextTypes = {
        [storeKey]: storeShape.isRequired,
        [subscriptionKey]: subscriptionShape,
    }
    */

    return Provider
}

export default createProvider()
