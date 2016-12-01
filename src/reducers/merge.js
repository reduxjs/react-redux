"use strict";

import {MERGE} from '../utils/allyActionNames'
import lodash from 'lodash';
//import invariant from 'invariant'

export default function merge(state, action) {
    if (!action || action.type !== MERGE) {
        return state;
    }
    //TODO: properly apply error handling for malformed actions
    //invariant(action.payload, 'payload missing from action');
    const {path, value} = action.payload;
    //invariant(path, 'path missing from payload');
    //invariant(typeof value !== 'undefined', 'value missing from payload');
    let oldValue = lodash.get(state, path);
    if (lodash.isEqual(oldValue, value)) {
        return state;
    }
    var mergedValue = lodash.merge({}, oldValue, value);
    const newState = lodash.clone(state);
    return lodash.set(newState, path, mergedValue);
}

merge.type = MERGE;