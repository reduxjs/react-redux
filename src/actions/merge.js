"use strict";

import {MERGE} from '../utils/allyActionNames'

export default function merge(path, value) {
    return {
        type: MERGE,
        payload: {
            path: path,
            value: value
        }
    }
}