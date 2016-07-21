"use strict";
import expect from 'expect';
import set from '../../src/reducers/set';
import {SET, APPEND} from '../../src/utils/allyActionNames';

describe('reducers/set', function () {
    const path = ['one', 'two'];
    const value = {
        three: {
            four: 'delta'
        }
    };
    
    let initialState, action;
    
    beforeEach(function () {
        action = {
            type: SET,
            payload: {
                path: path,
                value: value
            }
        };
        initialState = {
            one: {
                two: {
                    five: {
                        six: 'foxtrot'
                    }
                }
            }
        };
    });

    it('should not change the state object if a different action type is provided', function () {
        action.type = APPEND;
        const newState = set(initialState, action);
        expect(newState).toBe(initialState);
    });
    
    it('should return the original state if the merged object is the same object', function () {
        action.payload.value = initialState.one.two;
        const newState = set(initialState, action);
        expect(newState).toBe(initialState);
    });
    
    it('should change the state if the merged object is identical in contents', function () {
        action.payload.value = {five: {six: 'foxtrot'}};
        const newState = set(initialState, action);
        expect(newState).toNotBe(initialState);
        expect(newState.one.two).toEqual(initialState.one.two);
    });
    
    it('should set the object if the original value is undefined', function () {
        action.payload.path = ['one', 'seven'];
        const newState = set(initialState, action);
        expect(newState).toNotBe(initialState);
        expect(newState).toEqual({
            one: {
                two: {
                    five: {
                        six: 'foxtrot'
                    }
                },
                seven: value
            }
        });
    });
    
    it('should set the object if the original value is null', function () {
        action.payload.path = ['one', 'seven'];
        initialState.one.seven = null;
        const newState = set(initialState, action);
        expect(newState).toNotBe(initialState);
        expect(newState).toEqual({
            one: {
                two: {
                    five: {
                        six: 'foxtrot'
                    }
                },
                seven: value
            }
        });
    });
    
    it('should replace an object if it already exists at that path.', function () {
        action.payload.value = 42;
        const newState = set(initialState, action);
        expect(newState).toNotBe(initialState);
        expect(newState).toEqual({
            one: {
                two: 42
            }
        });
    });
    
});