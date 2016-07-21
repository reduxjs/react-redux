"use strict";

import expect from "expect";
import append from '../../src/actions/append';
import {APPEND} from '../../src/utils/allyActionNames';

describe('actions/append', function () {
    const path = ['one', 'two'];
    const value = 'charlie';
    it('should return an action with the type of APPEND', function () {
        const action = append(path, value);
        expect(action).toBeA("object");
        expect(action.type).toBe(APPEND);
    });
    
    it('should return an action with a payload', function () {
        const action = append(path, value);
        expect(action).toBeA("object");
        expect(action.payload).toBeA("object");
    });
    
    it('should have path inside of the payload', function () {
        const action = append(path, value);
        expect(action).toBeA("object");
        expect(action.payload).toBeA("object");
        expect(action.payload.path).toBe(path);
    });
    
    it('should have a value inside of the payload', function () {
        const action = append(path, value);
        expect(action).toBeA("object");
        expect(action.payload).toBeA("object");
        expect(action.payload.value).toBe(value);
    });
});
