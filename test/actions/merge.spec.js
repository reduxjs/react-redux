"use strict";

import expect from "expect";
import merge from '../../src/actions/merge';
import {MERGE} from '../../src/utils/allyActionNames';

describe('actions/merge', function () {
    const path = ['one', 'two'];
    const value = 'charlie';
    it('should return an action with the type of MERGE', function () {
        const action = merge(path, value);
        expect(action).toBeA("object");
        expect(action.type).toBe(MERGE);
    });
    
    it('should return an action with a payload', function () {
        const action = merge(path, value);
        expect(action).toBeA("object");
        expect(action.payload).toBeA("object");
    });
    
    it('should have path inside of the payload', function () {
        const action = merge(path, value);
        expect(action).toBeA("object");
        expect(action.payload).toBeA("object");
        expect(action.payload.path).toBe(path);
    });
    
    it('should have a value inside of the payload', function () {
        const action = merge(path, value);
        expect(action).toBeA("object");
        expect(action.payload).toBeA("object");
        expect(action.payload.value).toBe(value);
    });
});
