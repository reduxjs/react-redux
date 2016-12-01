"use strict";

import {SET} from '../utils/allyActionNames'

export default function set(path, value) {
    return {
        type: SET,
        payload: {
            path: path,
            value: value
        }
    }
}