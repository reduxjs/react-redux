"use strict";

import {REMOVE} from '../utils/allyActionNames'
import lodash from 'lodash';
//import invariant from 'invariant'

export default function remove(state, action) {
    if (!action || action.type !== REMOVE) {
        return state;
    }
    //TODO: properly apply error handling for malformed actions
    //invariant(action.payload, 'payload missing from action');
    const {path} = action.payload;
    //invariant(path, 'path missing from payload');
    if (!lodash.hasIn(state, path)) {
        return state;
    }
    /*
        An interesting caveat here is that unset can fail if the property being unset 
        is not configurable. However, after returning the clone, the property will 
        lose the property of not being configurable, so performing the action
        twice on the same object will cause the value to be deleted. We expect
        this to not be an issue in most cases, and do not intend to correct this 
        behavior.
     */
    if (lodash.unset(state, path)) {
        return lodash.clone(state);
    } else {
        return state;
    }
}

remove.type = REMOVE;