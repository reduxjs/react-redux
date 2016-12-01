"use strict";

import set from './set';
import append from './append';
import merge from './merge';
import remove from './remove';

export const reducers = {
    [set.type]: set,
    [append.type]: append,
    [merge.type]: merge,
    [remove.type]: remove
};

export default function allyData(state, action) {
    if (!action || !action.type) {
        return state;
    }
    var reducer = reducers[action.type];
    if (typeof reducer !== 'function') {
        return state;
    }
    return reducer(state, action);
}
