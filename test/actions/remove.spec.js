"use strict";

import expect from "expect";
import remove from '../../src/actions/remove';
import {REMOVE} from '../../src/utils/allyActionNames';

describe('actions/remove', function () {
    const path = ['one', 'two'];
    it('should return an action with the type of REMOVE', function () {
        const action = remove(path);
        expect(action).toBeA("object");
        expect(action.type).toBe(REMOVE);
    });
    
    it('should return an action with a payload', function () {
        const action = remove(path);
        expect(action).toBeA("object");
        expect(action.payload).toBeA("object");
    });
    
    it('should have path inside of the payload', function () {
        const action = remove(path);
        expect(action).toBeA("object");
        expect(action.payload).toBeA("object");
        expect(action.payload.path).toBe(path);
    });
});
