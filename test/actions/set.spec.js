"use strict";

import expect from "expect";
import set from '../../src/actions/set';
import {SET} from '../../src/utils/allyActionNames';

describe('actions/set', function () {
    const path = ['one', 'two'];
    const value = 'charlie';
    it('should return an action with the type of SET', function () {
        const action = set(path, value);
        expect(action).toBeA("object");
        expect(action.type).toBe(SET);
    });
    
    it('should return an action with a payload', function () {
        const action = set(path, value);
        expect(action).toBeA("object");
        expect(action.payload).toBeA("object");
    });
    
    it('should have path inside of the payload', function () {
        const action = set(path, value);
        expect(action).toBeA("object");
        expect(action.payload).toBeA("object");
        expect(action.payload.path).toBe(path);
    });
    
    it('should have a value inside of the payload', function () {
        const action = set(path, value);
        expect(action).toBeA("object");
        expect(action.payload).toBeA("object");
        expect(action.payload.value).toBe(value);
    });
});
