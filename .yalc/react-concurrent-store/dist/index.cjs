"use strict";Object.defineProperty(exports, "__esModule", {value: true}); function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { newObj[key] = obj[key]; } } } newObj.default = obj; return newObj; } }var __defProp = Object.defineProperty;
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
  useStoreSelector: () => useStoreSelector
});

// src/experimental/useStore.tsx









var _react = require('react'); var React = _interopRequireWildcard(_react);

// src/experimental/Store.ts



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
        _react.startTransition.call(void 0, () => {
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
        "Imblance in concurrent-safe store reference counting. This is a bug in react-use-store, please report it."
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
var _jsxruntime = require('react/jsx-runtime');
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
var storeManagerContext = _react.createContext.call(void 0, null);
var CommitTracker = _react.memo.call(void 0, 
  ({ storeManager }) => {
    const [allStates, setAllStates] = _react.useState.call(void 0, 
      storeManager.getAllCommittedStates()
    );
    _react.useEffect.call(void 0, () => {
      const unsubscribe = storeManager.subscribe(() => {
        const allStates2 = storeManager.getAllStates();
        setAllStates(allStates2);
      });
      return () => {
        unsubscribe();
        storeManager.sweep();
      };
    }, [storeManager]);
    _react.useLayoutEffect.call(void 0, () => {
      storeManager.commitAllStates(allStates);
    }, [storeManager, allStates]);
    return null;
  }
);
function StoreProvider({ children }) {
  const [storeManager] = _react.useState.call(void 0, () => new StoreManager());
  return /* @__PURE__ */ _jsxruntime.jsxs.call(void 0, storeManagerContext.Provider, { value: storeManager, children: [
    /* @__PURE__ */ _jsxruntime.jsx.call(void 0, CommitTracker, { storeManager }),
    children
  ] });
}
function useStoreSelector(store, selector) {
  const storeManager = _react.useContext.call(void 0, storeManagerContext);
  if (storeManager == null) {
    throw new Error(
      "Expected useStoreSelector to be rendered within a StoreProvider."
    );
  }
  const previousStoreRef = _react.useRef.call(void 0, store);
  if (store !== previousStoreRef.current) {
    throw new Error(
      "useStoreSelector does not currently support dynamic stores"
    );
  }
  const previousSelectorRef = _react.useRef.call(void 0, selector);
  if (selector !== previousSelectorRef.current) {
    throw new Error(
      "useStoreSelector does not currently support dynamic selectors"
    );
  }
  const [state, setState] = _react.useState.call(void 0, () => selector(store.getState()));
  _react.useLayoutEffect.call(void 0, () => {
    storeManager.addStore(store);
    const mountState = selector(store.getState());
    const mountCommittedState = selector(store.getCommittedState());
    if (state !== mountCommittedState) {
      setState(mountCommittedState);
    }
    if (mountState !== mountCommittedState) {
      _react.startTransition.call(void 0, () => {
        setState(mountState);
      });
    }
    const unsubscribe = store.subscribe(() => {
      const state2 = store.getState();
      setState(selector(state2));
    });
    return () => {
      unsubscribe();
      storeManager.removeStore(store);
    };
  }, []);
  return state;
}
function identity(x) {
  return x;
}
function useStore(store) {
  return useStoreSelector(store, identity);
}

// src/useStore.ts


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
  const [cache, setCache] = _react.useState.call(void 0, () => store._current);
  const [_, startTransition3] = _react.useTransition.call(void 0, );
  _react.useEffect.call(void 0, () => {
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




exports.createStore = createStore2; exports.experimental = experimental; exports.useStore = useStore2;
//# sourceMappingURL=index.cjs.map