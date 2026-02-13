var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/experimental/index.ts
var experimental_exports = {};
__export(experimental_exports, {
  Store: () => Store,
  StoreProvider: () => StoreProvider,
  createStore: () => createStore,
  createStoreFromSource: () => createStoreFromSource,
  useStore: () => useStore,
  useStoreSelector: () => useStoreSelector,
  useStoreSelectorWithEquality: () => useStoreSelectorWithEquality
});

// src/experimental/useStore.tsx
import {
  createContext,
  memo,
  startTransition as startTransition2,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useDebugValue
} from "react";

// src/experimental/Store.ts
import * as React from "react";
import { startTransition } from "react";

// src/experimental/Emitter.ts
var Emitter = class {
  constructor() {
    this._listeners = [];
  }
  subscribe(cb) {
    const wrapped = (...value) => cb(...value);
    this._listeners.push(wrapped);
    return () => {
      this._listeners = this._listeners.filter((s) => s !== wrapped);
    };
  }
  notify(...value) {
    this._listeners.forEach((cb) => {
      cb(...value);
    });
  }
};

// src/experimental/Store.ts
var sharedReactInternals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
function reactTransitionIsActive() {
  return !!sharedReactInternals.T;
}
var Store = class extends Emitter {
  constructor(source) {
    super();
    this.source = source;
    this.state = source.getState();
    this.committedState = source.getState();
  }
  commit(state) {
    this.committedState = state;
  }
  getCommittedState() {
    return this.committedState;
  }
  getState() {
    return this.state;
  }
  handleUpdate(action) {
    const noPendingTransitions = this.committedState === this.state;
    this.state = this.source.getState();
    if (reactTransitionIsActive()) {
      this.notify();
    } else {
      if (noPendingTransitions) {
        this.committedState = this.state;
        this.notify();
      } else {
        const newState = this.state;
        this.committedState = this.source.reducer(this.committedState, action);
        this.state = this.committedState;
        this.notify();
        this.state = newState;
        startTransition(() => {
          this.notify();
        });
      }
    }
  }
};

// src/experimental/StoreManager.ts
var StoreManager = class extends Emitter {
  constructor() {
    super(...arguments);
    this._storeRefCounts = /* @__PURE__ */ new Map();
  }
  getAllCommittedStates() {
    return new Map(
      Array.from(this._storeRefCounts.keys()).map((store) => [
        store,
        store.getCommittedState()
      ])
    );
  }
  getAllStates() {
    return new Map(
      Array.from(this._storeRefCounts.keys()).map((store) => [
        store,
        store.getState()
      ])
    );
  }
  addStore(store) {
    const prev = this._storeRefCounts.get(store);
    if (prev == null) {
      this._storeRefCounts.set(store, {
        unsubscribe: store.subscribe(() => {
          this.notify();
        }),
        count: 1
      });
    } else {
      this._storeRefCounts.set(store, { ...prev, count: prev.count + 1 });
    }
  }
  commitAllStates(state) {
    for (const [store, committedState] of state) {
      store.commit(committedState);
    }
    this.sweep();
  }
  removeStore(store) {
    const prev = this._storeRefCounts.get(store);
    if (prev == null) {
      throw new Error(
        "Imbalance in concurrent-safe store reference counting. This is a bug in react-use-store, please report it."
      );
    }
    this._storeRefCounts.set(store, {
      unsubscribe: prev.unsubscribe,
      count: prev.count - 1
    });
  }
  sweep() {
    for (const [store, refs] of this._storeRefCounts) {
      if (refs.count < 1) {
        refs.unsubscribe();
        this._storeRefCounts.delete(store);
      }
    }
  }
};

// src/experimental/useStore.tsx
import { jsx, jsxs } from "react/jsx-runtime";
function createStore(reducer, initialState) {
  let state = initialState;
  const store = new Store({
    getState: () => state,
    reducer
  });
  store.dispatch = (action) => {
    state = reducer(state, action);
    store.handleUpdate(action);
  };
  return store;
}
function createStoreFromSource(source) {
  return new Store(source);
}
var storeManagerContext = createContext(null);
var CommitTracker = memo(
  ({ storeManager }) => {
    const [allStates, setAllStates] = useState(
      storeManager.getAllCommittedStates()
    );
    useEffect(() => {
      const unsubscribe = storeManager.subscribe(() => {
        const allStates2 = storeManager.getAllStates();
        setAllStates(allStates2);
      });
      return () => {
        unsubscribe();
        storeManager.sweep();
      };
    }, [storeManager]);
    useLayoutEffect(() => {
      storeManager.commitAllStates(allStates);
    }, [storeManager, allStates]);
    return null;
  }
);
function StoreProvider({ children }) {
  const [storeManager] = useState(() => new StoreManager());
  return /* @__PURE__ */ jsxs(storeManagerContext.Provider, { value: storeManager, children: [
    /* @__PURE__ */ jsx(CommitTracker, { storeManager }),
    children
  ] });
}
function useStoreSelector(store, selector) {
  const storeManager = useContext(storeManagerContext);
  if (storeManager == null) {
    throw new Error(
      "Expected useStoreSelector to be rendered within a StoreProvider."
    );
  }
  const previousStoreRef = useRef(store);
  if (store !== previousStoreRef.current) {
    throw new Error(
      "useStoreSelector does not currently support dynamic stores"
    );
  }
  const [hookState, setState] = useState(() => ({
    value: selector(store.getState(), void 0),
    selector
  }));
  const selectorChange = hookState.selector !== selector;
  const state = selectorChange ? selector(store.getState(), hookState.value) : hookState.value;
  useLayoutEffect(() => {
    storeManager.addStore(store);
    const mountState = selector(store.getState(), hookState.value);
    const mountCommittedState = selector(
      store.getCommittedState(),
      hookState.value
    );
    function setHookState(value) {
      setState((prev) => {
        if (is(prev.value, value) && prev.selector === selector) {
          return prev;
        }
        return { value, selector };
      });
    }
    if (state !== mountCommittedState) {
      setHookState(mountCommittedState);
    }
    if (mountState !== mountCommittedState) {
      startTransition2(() => {
        setHookState(mountState);
      });
    }
    const unsubscribe = store.subscribe(() => {
      const currentStoreState = store.getState();
      setState((prev) => {
        const newValue = selector(currentStoreState, prev.value);
        if (is(prev.value, newValue) && prev.selector === selector) {
          return prev;
        }
        return { value: newValue, selector };
      });
    });
    return () => {
      unsubscribe();
      storeManager.removeStore(store);
    };
  }, [selector]);
  return state;
}
function identity(x) {
  return x;
}
function useStore(store) {
  return useStoreSelector(store, identity);
}
function is(x, y) {
  if (x === y) {
    return x !== 0 || y !== 0 || 1 / x === 1 / y;
  } else {
    return x !== x && y !== y;
  }
}
function useStoreSelectorWithEquality(store, selector, isEqual = Object.is) {
  const memoizedSelector = useMemo(() => {
    let hasMemo = false;
    let memoizedSnapshot;
    let memoizedSelection;
    const memoizedSelector2 = (nextSnapshot, prevResult) => {
      if (!hasMemo) {
        hasMemo = true;
        memoizedSnapshot = nextSnapshot;
        const nextSelection2 = selector(nextSnapshot);
        if (prevResult !== void 0 && isEqual(prevResult, nextSelection2)) {
          memoizedSelection = prevResult;
          return prevResult;
        }
        memoizedSelection = nextSelection2;
        return nextSelection2;
      }
      const prevSnapshot = memoizedSnapshot;
      const prevSelection = memoizedSelection;
      if (is(prevSnapshot, nextSnapshot)) {
        return prevSelection;
      }
      const nextSelection = selector(nextSnapshot);
      if (isEqual !== void 0 && isEqual(prevSelection, nextSelection)) {
        memoizedSnapshot = nextSnapshot;
        return prevSelection;
      }
      memoizedSnapshot = nextSnapshot;
      memoizedSelection = nextSelection;
      return nextSelection;
    };
    return memoizedSelector2;
  }, [selector, isEqual]);
  const value = useStoreSelector(store, memoizedSelector);
  useDebugValue(value);
  return value;
}

// src/useStore.ts
import { useEffect as useEffect2, useState as useState2, useTransition } from "react";

// src/types.ts
var REACT_STORE_TYPE = Symbol.for("react.store");

// src/useStore.ts
var isStore = (value) => {
  return value && "$$typeof" in value && value.$$typeof === REACT_STORE_TYPE;
};
function createStore2(initialValue, reducer) {
  const store = {
    $$typeof: REACT_STORE_TYPE,
    _listeners: /* @__PURE__ */ new Set(),
    _current: initialValue,
    _sync: initialValue,
    _transition: initialValue,
    refresh: () => {
      store._listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      store._listeners.add(listener);
      return () => {
        store._listeners.delete(listener);
      };
    },
    update: (action) => {
      store._transition = reducer ? reducer(store._transition, action) : action;
      store.refresh();
    }
  };
  return store;
}
function useStore2(store) {
  if (!isStore(store)) {
    throw new Error(
      "Invalid store type. Ensure you are using a valid React store."
    );
  }
  const [cache, setCache] = useState2(() => store._current);
  const [_, startTransition3] = useTransition();
  useEffect2(() => {
    return store.subscribe(() => {
      store._sync = store._transition;
      startTransition3(() => {
        setCache(store._current = store._sync);
      });
    });
  }, [store]);
  return cache;
}

// src/index.ts
var experimental = experimental_exports;
export {
  createStore2 as createStore,
  experimental,
  useStore2 as useStore
};
//# sourceMappingURL=index.js.map