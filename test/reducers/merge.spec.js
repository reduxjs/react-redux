"use strict";

import expect from "expect";
import merge from '../../src/reducers/merge'
import {MERGE, SET} from '../../src/utils/allyActionNames'

describe('reducers/merge', function () {
    const path = ['one', 'two'];
    const value = {
        three: {
            four: 'delta'
        }
    };
    
    let initialState, action;
    
    beforeEach(function () {
        action = {
            type: MERGE,
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
        action.type = SET;
        const newState = merge(initialState, action);
        expect(newState).toBe(initialState);
    });
    
    it('should return the original state if the merged object is identical', function () {
        action.payload.value = {five: {six: 'foxtrot'}};
        const newState = merge(initialState, action);
        expect(newState).toBe(initialState);
    });
    
    it('should set the object if the original value is undefined', function () {
        action.payload.path = ['one', 'seven'];
        const newState = merge(initialState, action);
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
        const newState = merge(initialState, action);
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
    
    it('should do nothing to the object if the value is not something that can be merged into it', function () {
        action.payload.value = 42;
        const newState = merge(initialState, action);
        expect(newState).toNotBe(initialState);
        expect(newState).toEqual({
            one: {
                two: {
                    five: {
                        six: 'foxtrot'
                    }
                }
            }
        });
    });
    
    it('should merge the state object with the value provided', function () {
        const newState = merge(initialState, action);
        expect(newState).toNotBe(initialState);
        expect(newState).toEqual({
            one: {
                two: {
                    three: {
                        four: 'delta'
                    },
                    five: {
                        six: 'foxtrot'
                    }
                }
            }
        });
    })
});