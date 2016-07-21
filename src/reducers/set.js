"use strict";

import {SET} from '../utils/allyActionNames'
import lodash from 'lodash';
//import invariant from 'invariant'

export default function set(state, action) {
    if (!action || action.type !== SET) {
        return state;
    }
    //TODO: properly apply error handling for malformed actions
    //invariant(action.payload, 'payload missing from action');
    const {path, value} = action.payload;
    //invariant(path, 'path missing from payload');
    //invariant(typeof value !== 'undefined', 'value missing from payload');
    const oldValue = lodash.get(state, path);
    if (lodash.eq(oldValue, value)) {
        return state;
    }
    const newState = lodash.clone(state);
    return lodash.set(newState, path, value);
}

set.type = SET;