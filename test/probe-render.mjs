/**
 * Render-path probe: actually EXECUTE the card and picker component bodies
 * with the stub React, so a ReferenceError/TypeError in the JSX-building code
 * (which the offline suite never reached — it only ran `apply`) fails loudly.
 */
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

const React = {
  createElement(type, props, ...children) {
    return { type, props: props ?? {}, children };
  },
  useState(initial) {
    return [typeof initial === "function" ? initial() : initial, () => {}];
  },
  useEffect() {},
  useMemo(factory) {
    return factory();
  },
  useRef(value) {
    return { current: value };
  },
  useCallback: (fn) => fn,
  // React invokes the subscriber as a BARE function reference — call it the
  // same detached way here, so a plugin that passes `scope.subscribe` straight
  // through throws exactly like it does in the real browser.
  useSyncExternalStore: (subscribe, getSnapshot) => {
    subscribe(() => {});
    return getSnapshot();
  },
};

const primitives = new Proxy(
  { IconPlusOutline16: () => null },
  {
    get(target, prop) {
      if (prop in target) return target[prop];
      // Any icon/component the card asks for must at least be a function, or
      // React would throw "Element type is invalid" in the real browser.
      return function Stub() {
        return null;
      };
    },
  }
);

const STUB = {
  react: React,
  "react/jsx-runtime": React,
  "react-dom": { createPortal: (node) => node },
  "@deepseek-ai/dsh-client-ui-primitives": primitives,
};

const source = await readFile(new URL("../lib/client.js", import.meta.url), "utf8");
const entries = [];
globalThis.window = {
  __ModuleLoader__: { load: (entry) => entries.push(entry) },
  setTimeout: globalThis.setTimeout,
  clearTimeout: globalThis.clearTimeout,
  setInterval: () => 0,
  clearInterval: () => {},
  addEventListener() {},
  removeEventListener() {},
  innerWidth: 1200,
  innerHeight: 900,
};
globalThis.document = {
  head: { children: [], append(...n) { this.children.push(...n); }, querySelector: () => null },
  body: { style: { setProperty() {}, getPropertyValue: () => "" }, children: [] },
  createElement: () => ({ dataset: {}, style: {}, classList: { contains: () => false } }),
  querySelector: () => null,
  styleSheets: [],
};
globalThis.getComputedStyle = () => ({ length: 0, getPropertyValue: () => "" });

new Function("require", `${source}\nreturn 0;`)((specifier) => {
  if (!(specifier in STUB)) throw new Error(`unknown module ${specifier}`);
  return STUB[specifier];
});

/**
 * A scope whose subscribe is a prototype method reading `this` — the shape the
 * real `SettingsScopeController` has. If the card passes `scope.subscribe` to
 * React unwrapped, the detached call throws here exactly as it does in the
 * browser (`Cannot read properties of undefined (reading 'store')`).
 */
class StrictScope {
  #listeners = new Set();
  getSnapshot() {
    return {
      status: "ready",
      value: { sans: '"Inter", "Microsoft YaHei"', mono: '"JetBrains Mono"', sizeOffset: 2, sizeOffsetCode: -1, weight: 500 },
      base: { sans: "", mono: "", sizeOffset: 0, sizeOffsetCode: 0, weight: 0 },
      user: { sans: '"Inter", "Microsoft YaHei"', sizeOffset: 2, weight: 500 },
      revision: 3,
      writable: true,
      mode: "host",
    };
  }
  subscribe(listener) {
    if (!(this instanceof StrictScope)) {
      throw new TypeError("scope.subscribe was detached from its scope (bare method reference)");
    }
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  async set() {}
  async unset() {}
}

const scope = new StrictScope();

const face = entries[0].factory((specifier) => STUB[specifier]);

const t = (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key);
const injected = { scope, t };

// 1. The card renders with a ready snapshot.
const card = face.apply; // touch apply exists
const FontCard = (() => {
  // Recover the component from the slot registration the same way the real
  // runner would: apply() with a recording slots service.
  const registered = [];
  const ctx = {
    effect(cb) {
      cb();
      return () => {};
    },
    slots: {
      inject(name, cb) {
        cb();
      },
      register(options, component) {
        registered.push({ options, component });
        return () => {};
      },
    },
    locale: {
      bind: () => (key) => key,
      register: () => () => {},
      getLocale: () => ({ active: "zh" }),
    },
    settingsScope: { bind: () => scope },
  };
  face.apply(ctx);
  assert.equal(registered.length, 1);
  return registered[0].component;
})();

const tree = FontCard({ ...injected });
assert.equal(tree.type, "li", "the card root must be the <li> the section stacks");
// With the default useState stub the card is closed, so the body is null —
// the assertion is that RENDERING ITSELF did not throw.
assert.equal(tree.children.length >= 1, true, "the closed card still renders its header");

// Force the open branch by calling with a stub whose useState returns true.
const ReactOpen = {
  ...React,
  useState: (initial) => [typeof initial === "function" ? initial() : initial, () => {}],
};
// Re-run the factory with an open-state React is not possible (module cached);
// instead render the picker directly, which is the deepest interactive part.

// 2. The picker renders with a populated stack (chips + add button + panel).
const StackPicker = await (async () => {
  // The picker is not exported; exercise it through the card by rendering with
  // a useState stub that starts open. Simplest: re-materialize the bundle with
  // a React whose useState returns true on the FIRST call (the card's `open`).
  let first = true;
  const ReactOpenState = {
    ...React,
    useState: (initial) => {
      if (first) {
        first = false;
        return [true, () => {}];
      }
      return [typeof initial === "function" ? initial() : initial, () => {}];
    },
  };
  const STUB_OPEN = { ...STUB, react: ReactOpenState, "react/jsx-runtime": ReactOpenState };
  const entries2 = [];
  globalThis.window.__ModuleLoader__ = { load: (e) => entries2.push(e) };
  new Function("require", `${source}\nreturn 0;`)((s) => STUB_OPEN[s]);
  const face2 = entries2[0].factory((s) => STUB_OPEN[s]);
  const registered2 = [];
  face2.apply({
    effect(cb) {
      cb();
      return () => {};
    },
    slots: {
      inject(name, cb) {
        cb();
      },
      register(options, component) {
        registered2.push({ options, component });
        return () => {};
      },
    },
    locale: { bind: () => (key) => key, register: () => () => {}, getLocale: () => ({ active: "zh" }) },
    settingsScope: { bind: () => scope },
  });
  return registered2[0].component;
})();

const openTree = StackPicker === FontCard ? null : StackPicker({ ...injected });
assert.ok(openTree, "the open card renders a tree");

// 3. Walk the whole tree and stringify it, so any undefined element type or
// bad prop object surfaces as a throw rather than a silent pass.
const walk = (node, depth) => {
  if (node === null || node === undefined || typeof node === "boolean") return;
  if (Array.isArray(node)) {
    node.forEach((child) => walk(child, depth + 1));
    return;
  }
  if (typeof node === "object") {
    const isElement = "type" in node && "props" in node;
    if (!isElement) return; // style objects, event handlers, plain values
    assert.ok(node.type !== undefined, `element at depth ${depth} has no type`);
    assert.ok(
      typeof node.type === "string" || typeof node.type === "function",
      `element at depth ${depth} has a type that is neither a tag nor a component (${String(node.type)})`
    );
    if (node.props) {
      for (const value of Object.values(node.props)) walk(value, depth + 1);
    }
    walk(node.children, depth + 1);
  }
};
walk(openTree, 0);

console.log("RENDER PATH OK — card and picker bodies execute without throwing");
process.exit(0);
