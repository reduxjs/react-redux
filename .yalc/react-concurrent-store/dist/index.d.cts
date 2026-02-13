import * as react_jsx_runtime from 'react/jsx-runtime';
import * as React from 'react';

type ReactStore$1<Value, Action = Value> = {
    update: (action: Action) => void;
};
/**
 * Represents a data source which can be connected to React by wrapping it as a
 * React Store
 */
interface ISource<S, A> {
    /**
     * Returns an immutable snapshot of the current state
     */
    getState(): S;
    /**
     * A pure function which takes and arbitrary state and an updater/action and
     * returns a new state.
     *
     * React needs this in order to generate temporary states.
     *
     * See: https://jordaneldredge.com/notes/react-rebasing/
     */
    reducer: Reducer<S, A>;
}
type Reducer<S, A> = (state: S, action: A) => S;

declare class Emitter<T extends Array<unknown>> {
    _listeners: Array<(...value: T) => void>;
    subscribe(cb: (...value: T) => void): () => void;
    notify(...value: T): void;
}

interface ReactStore<S, A = never> {
    getState(): S;
    getCommittedState(): S;
    handleUpdate(action: A): void;
    subscribe(listener: () => void): () => void;
    commit(state: S): void;
}
declare class Store<S, A> extends Emitter<[]> implements ReactStore<S, A> {
    source: ISource<S, A>;
    state: S;
    committedState: S;
    constructor(source: ISource<S, A>);
    commit(state: S): void;
    getCommittedState(): S;
    getState(): S;
    handleUpdate(action: A): void;
}

/**
 * Concurrent-Safe Store
 *
 * The store and a associated hook ensures that when new store readers mount,
 * they will observe the same state as all other components currently mounted,
 * even if the store's state is currently updating within a slow transition.
 *
 * They further ensure that React's rebasing rules apply to state observed via
 * these hooks. Specifically, updates always apply in the order in chronological
 * order. This means that if a sync update to the store is triggered while a
 * transition update to the store is still pending that sync update will apply
 * on top of the pre-transition state (as if the transition update had not yet
 * happened), but when the transition resolves it will reflect the chronological
 * ordering of: initial, transition, sync.
 *
 * Note: Rather than expose generic versions of these hooks/providers and have them
 * read the store via context, we use a factory function which returns pre-bound
 * functions. This has the advantage of producing typed variants of the hooks.
 *
 * A more standard context based solution should also be possible.
 */
declare function createStore$1<S, A>(reducer: Reducer<S, A>, initialState: S): Store<S, A> & {
    dispatch: (action: A) => void;
};
declare function createStoreFromSource<S, A>(source: ISource<S, A>): Store<S, A>;
/**
 * A single provider which tracks commits for all stores being read in the tree.
 */
declare function StoreProvider({ children }: {
    children: React.ReactNode;
}): react_jsx_runtime.JSX.Element;
/**
 * Tearing-resistant hook for consuming application state locally within a
 * component (without prop drilling or putting state in context).
 *
 * Attempts to avoid the failure mode where the application state is updating as
 * part of a transition and a sync state change causes a new component to mount
 * that reads the application state.
 *
 * A naive implementation which simply subscribes to state changes in a useEffect
 * would incorrectly mount using the pending state causing tearing between the
 * newly mounted component (showing the new state) and the previously mounted
 * components which would still be showing the old state.
 *
 * A slightly more sophisticated approach which mounts with the currently
 * committed state would suffer from permanent tearing since the mount state
 * would not update to the pending state along with the rest of the
 * pending transition.
 *
 * This approach mounts with the currently committed state and then, if needed
 * schedules a "fixup" update inside a transition to ensure the newly mounted
 * component updates along with any other components that are part of the
 * current pending transition.
 *
 * This implementation also attempts to solve for a non-concurrent race
 * condition where state updates between initial render and when the
 * `useEffect` mounts. e.g. in the `useEffect` of another component that gets
 * mounted before this one. Here the risk is that we miss the update, since we
 * are not subscribed yet, and end up rendering the stale state with no update
 * scheduled to catch us up with the rest of the app.
 */
declare function useStoreSelector<S, T>(store: Store<S, never>, selector: (state: S, prevResult?: T) => T): T;
declare function useStore$1<S>(store: Store<S, never>): S;
declare function useStoreSelectorWithEquality<State, Selection>(store: Store<State, never>, selector: (state: State) => Selection, isEqual?: (a: Selection, b: Selection) => boolean): Selection;

type Experimental_ISource<S, A> = ISource<S, A>;
type Experimental_ReactStore<S, A = never> = ReactStore<S, A>;
type Experimental_Reducer<S, A> = Reducer<S, A>;
type Experimental_Store<S, A> = Store<S, A>;
declare const Experimental_Store: typeof Store;
declare const Experimental_StoreProvider: typeof StoreProvider;
declare const Experimental_createStoreFromSource: typeof createStoreFromSource;
declare const Experimental_useStoreSelector: typeof useStoreSelector;
declare const Experimental_useStoreSelectorWithEquality: typeof useStoreSelectorWithEquality;
declare namespace Experimental {
  export { type Experimental_ISource as ISource, type Experimental_ReactStore as ReactStore, type Experimental_Reducer as Reducer, Experimental_Store as Store, Experimental_StoreProvider as StoreProvider, createStore$1 as createStore, Experimental_createStoreFromSource as createStoreFromSource, useStore$1 as useStore, Experimental_useStoreSelector as useStoreSelector, Experimental_useStoreSelectorWithEquality as useStoreSelectorWithEquality };
}

declare function createStore<Value>(initialValue: Value): ReactStore$1<Value, Value>;
declare function createStore<Value, Action>(initialValue: Value, reducer: (currentValue: Value) => Value): ReactStore$1<Value, void>;
declare function createStore<Value, Action>(initialValue: Value, reducer: (currentValue: Value, action: Action) => Value): ReactStore$1<Value, Action>;
declare function useStore<Value>(store: ReactStore$1<Value, any>): Value;

declare const experimental: typeof Experimental;

export { type ISource, type ReactStore$1 as ReactStore, type Reducer, createStore, experimental, useStore };
