"use strict";

import {REMOVE} from '../utils/allyActionNames'

export default function remove(path) {
    return {
        type: REMOVE,
        payload: {
            path: path
        }
    }
}