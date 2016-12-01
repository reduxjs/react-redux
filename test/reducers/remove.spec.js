"use strict";
import expect from 'expect';
import remove from '../../src/reducers/remove';
import {REMOVE, SET} from '../../src/utils/allyActionNames';

describe('reducers/remove', function () {
    const path = ['one', 'two'];
    let initialState, action;
    
    beforeEach(function () {
        action = {
            type: REMOVE,
            payload: {
                path: path
            }
        };
        initialState = {
            one: {
                two: 2,
                three: {
                    four: 4
                }
            }
        }
    });
    
    it('should not change the state if the action type is different', function () {
        action.type = SET;
        const newState = remove(initialState, action);
        expect(newState).toBe(initialState);
    });
    
    it('should not change the state if the path does not exist', function () {
        action.payload.path = ['one', 'four'];
        const newState = remove(initialState, action);
        expect(newState).toBe(initialState);
    });

    it('should not change the state if the unset operation fails', function () {
        action.payload.path = ['cannotBeDeleted'];
        Object.defineProperty(initialState, 'cannotBeDeleted', {
            enumerable: true,
            configurable: false,
            writable: false,
            value: 'Nayh Nayh'
        });
        const newState = remove(initialState, action);
        expect(newState).toBe(initialState);
    });

    it('should remove a value at a key', function () {
        action.payload.path = ['one', 'two'];
        const newState = remove(initialState, action);
        expect(newState).toNotBe(initialState);
        expect(newState).toEqual({
            one: {
                three: {
                    four: 4
                }
            }
        })
    });

    it('should remove an entire object at a key', function () {
        action.payload.path = ['one', 'three'];
        const newState = remove(initialState, action);
        expect(newState).toNotBe(initialState);
        expect(newState).toEqual({
            one: {
                two: 2
            }
        })
    });
});