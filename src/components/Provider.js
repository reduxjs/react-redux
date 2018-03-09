import React, { Component, Children } from 'react'
import PropTypes from 'prop-types'
import { storeShape } from '../utils/PropTypes'
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

    class Provider extends Component {

        constructor(props, context) {
          super(props, context)

            const {store} = props;

            this.state = {
                storeState : store.getState(),
                dispatch : store.dispatch,
            };
        }

        componentDidMount() {
            const {store} = this.props;

            // TODO What about any actions that might have been dispatched between ctor and cDM?
            this.unsubscribe = store.subscribe( () => {
                this.setState({storeState : store.getState()});
            });
        }

        render() {
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

    return Provider
}

export default createProvider()
