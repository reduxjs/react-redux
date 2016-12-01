"use strict";

import {APPEND} from '../utils/allyActionNames'
import lodash from 'lodash';
//import invariant from 'invariant'

export default function append(state, action) {
    if (!action || action.type !== APPEND) {
        return state;
    }
    //TODO: properly apply error handling for malformed actions
    //invariant(action.payload, 'payload missing from action');
    const {path, value} = action.payload;
    //invariant(path, 'path missing from payload');
    //invariant(typeof value !== 'undefined', 'value missing from payload');
    const arrayValue = lodash.get(state, path);
    if (typeof arrayValue.push !== 'function') {
        return state;
    }
    arrayValue.push(value);
    return lodash.clone(state);
}

append.type = APPEND;