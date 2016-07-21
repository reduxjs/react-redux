"use strict";

import {APPEND} from '../utils/allyActionNames'

export default function append(path, value) {
    return {
        type: APPEND,
        payload: {
            path: path,
            value: value
        }
    }
}