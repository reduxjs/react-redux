"use strict"

import toPath from 'lodash/toPath'
import isArrayLike from 'lodash/isArrayLike'
import toArray from 'lodash/toArray'

export default function combinePath(...paths) {
    const combinedPath = [];
    for (const path of paths) {
        const pathArray = isArrayLike(path) && typeof path !== 'string'
            ? toArray(path)
            : toPath(path);
        combinedPath.push(...pathArray)
    }
    return combinedPath;
}