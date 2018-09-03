import {applyMiddleware, compose, createStore} from 'redux'

import rootReducer from './pairsReducer'
const composeEnhancers = window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__ || compose

export default function configureStore(preloadedState) {
    const middlewares = []
    const middlewareEnhancer = applyMiddleware(...middlewares)

    const enhancers = [middlewareEnhancer]
    const composedEnhancers = composeEnhancers(...enhancers)

    const store = createStore(rootReducer, preloadedState, composedEnhancers)

    return store
}