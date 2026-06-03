import { n as e } from "./rolldown-runtime-DdACKOZr.js";
function t(e, t) {
  if (!e) throw new Error(t || "loader assertion failed.");
}
("undefined" != typeof self && self,
  "undefined" != typeof window && window,
  "undefined" != typeof global && global,
  "undefined" != typeof document && document);
var r = Boolean(
    "object" != typeof process ||
    "[object process]" !== String(process) ||
    process.browser,
  ),
  n =
    "undefined" != typeof process &&
    process.version &&
    /v([0-9]*)/.exec(process.version),
  i = (n && parseFloat(n[1]), globalThis),
  s = (globalThis.document, globalThis.process || {}),
  o = (globalThis.console, globalThis.navigator || {});
function a(e) {
  if ("undefined" != typeof window && "renderer" === window.process?.type)
    return !0;
  if ("undefined" != typeof process && Boolean(process.versions?.electron))
    return !0;
  const t = "undefined" != typeof navigator && navigator.userAgent,
    r = e || t;
  return Boolean(r && r.indexOf("Electron") >= 0);
}
function c() {
  return (
    !(
      "object" == typeof process &&
      "[object process]" === String(process) &&
      !process?.browser
    ) || a()
  );
}
var l = "4.1.1";
function u(e, t) {
  if (!e) throw new Error(t || "Assertion failed");
}
function h(e) {
  if (!e) return 0;
  let t;
  switch (typeof e) {
    case "number":
      t = e;
      break;
    case "object":
      t = e.logLevel || e.priority || 0;
      break;
    default:
      return 0;
  }
  return (u(Number.isFinite(t) && t >= 0), t);
}
var d,
  f = () => {},
  p = class {
    constructor({ level: e = 0 } = {}) {
      ((this.userData = {}), (this._onceCache = new Set()), (this._level = e));
    }
    set level(e) {
      this.setLevel(e);
    }
    get level() {
      return this.getLevel();
    }
    setLevel(e) {
      return ((this._level = e), this);
    }
    getLevel() {
      return this._level;
    }
    warn(e, ...t) {
      return this._log("warn", 0, e, t, { once: !0 });
    }
    error(e, ...t) {
      return this._log("error", 0, e, t);
    }
    log(e, t, ...r) {
      return this._log("log", e, t, r);
    }
    info(e, t, ...r) {
      return this._log("info", e, t, r);
    }
    once(e, t, ...r) {
      return this._log("once", e, t, r, { once: !0 });
    }
    _log(e, t, r, n, i = {}) {
      const s = (function (e) {
        const { logLevel: t, message: r } = e;
        e.logLevel = h(t);
        const n = e.args ? Array.from(e.args) : [];
        for (; n.length && n.shift() !== r; );
        switch (typeof t) {
          case "string":
          case "function":
            (void 0 !== r && n.unshift(r), (e.message = t));
            break;
          case "object":
            Object.assign(e, t);
        }
        "function" == typeof e.message && (e.message = e.message());
        const i = typeof e.message;
        return (
          u("string" === i || "object" === i),
          Object.assign(e, { args: n }, e.opts)
        );
      })({ logLevel: t, message: r, args: this._buildArgs(t, r, n), opts: i });
      return this._createLogFunction(e, s, i);
    }
    _buildArgs(e, t, r) {
      return [e, t, ...r];
    }
    _createLogFunction(e, t, r) {
      if (!this._shouldLog(t.logLevel)) return f;
      const n = this._getOnceTag(r.tag ?? t.tag ?? t.message);
      if ((r.once || t.once) && void 0 !== n) {
        if (this._onceCache.has(n)) return f;
        this._onceCache.add(n);
      }
      return this._emit(e, t);
    }
    _shouldLog(e) {
      return this.getLevel() >= h(e);
    }
    _getOnceTag(e) {
      if (void 0 !== e)
        try {
          return "string" == typeof e ? e : String(e);
        } catch {
          return;
        }
    }
  },
  g = class {
    constructor(e, t, r = "sessionStorage") {
      ((this.storage = (function (e) {
        try {
          const t = window[e],
            r = "__storage_test__";
          return (t.setItem(r, r), t.removeItem(r), t);
        } catch (t) {
          return null;
        }
      })(r)),
        (this.id = e),
        (this.config = t),
        this._loadConfiguration());
    }
    getConfiguration() {
      return this.config;
    }
    setConfiguration(e) {
      if ((Object.assign(this.config, e), this.storage)) {
        const e = JSON.stringify(this.config);
        this.storage.setItem(this.id, e);
      }
    }
    _loadConfiguration() {
      let e = {};
      if (this.storage) {
        const t = this.storage.getItem(this.id);
        e = t ? JSON.parse(t) : {};
      }
      return (Object.assign(this.config, e), this);
    }
  };
function m(e) {
  return "string" != typeof e ? e : ((e = e.toUpperCase()), d[e] || d.WHITE);
}
function _() {
  let e;
  if (c() && i.performance) e = i?.performance?.now?.();
  else if ("hrtime" in s) {
    const t = s?.hrtime?.();
    e = 1e3 * t[0] + t[1] / 1e6;
  } else e = Date.now();
  return e;
}
!(function (e) {
  ((e[(e.BLACK = 30)] = "BLACK"),
    (e[(e.RED = 31)] = "RED"),
    (e[(e.GREEN = 32)] = "GREEN"),
    (e[(e.YELLOW = 33)] = "YELLOW"),
    (e[(e.BLUE = 34)] = "BLUE"),
    (e[(e.MAGENTA = 35)] = "MAGENTA"),
    (e[(e.CYAN = 36)] = "CYAN"),
    (e[(e.WHITE = 37)] = "WHITE"),
    (e[(e.BRIGHT_BLACK = 90)] = "BRIGHT_BLACK"),
    (e[(e.BRIGHT_RED = 91)] = "BRIGHT_RED"),
    (e[(e.BRIGHT_GREEN = 92)] = "BRIGHT_GREEN"),
    (e[(e.BRIGHT_YELLOW = 93)] = "BRIGHT_YELLOW"),
    (e[(e.BRIGHT_BLUE = 94)] = "BRIGHT_BLUE"),
    (e[(e.BRIGHT_MAGENTA = 95)] = "BRIGHT_MAGENTA"),
    (e[(e.BRIGHT_CYAN = 96)] = "BRIGHT_CYAN"),
    (e[(e.BRIGHT_WHITE = 97)] = "BRIGHT_WHITE"));
})(d || (d = {}));
var E = {
    debug: (c() && console.debug) || console.log,
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
  },
  b = { enabled: !0, level: 0 },
  y = class extends p {
    constructor({ id: e } = { id: "" }) {
      (super({ level: 0 }),
        (this.VERSION = l),
        (this._startTs = _()),
        (this._deltaTs = _()),
        (this.userData = {}),
        (this.LOG_THROTTLE_TIMEOUT = 0),
        (this.id = e),
        (this.userData = {}),
        (this._storage = new g(`__probe-${this.id}__`, { [this.id]: b })),
        this.timeStamp(`${this.id} started`),
        (function (e, t = ["constructor"]) {
          const r = Object.getOwnPropertyNames(Object.getPrototypeOf(e)),
            n = e;
          for (const i of r) {
            const r = n[i];
            "function" == typeof r &&
              (t.find((e) => i === e) || (n[i] = r.bind(e)));
          }
        })(this),
        Object.seal(this));
    }
    isEnabled() {
      return this._getConfiguration().enabled;
    }
    getLevel() {
      return this._getConfiguration().level;
    }
    getTotal() {
      return Number((_() - this._startTs).toPrecision(10));
    }
    getDelta() {
      return Number((_() - this._deltaTs).toPrecision(10));
    }
    set priority(e) {
      this.level = e;
    }
    get priority() {
      return this.level;
    }
    getPriority() {
      return this.level;
    }
    enable(e = !0) {
      return (this._updateConfiguration({ enabled: e }), this);
    }
    setLevel(e) {
      return (this._updateConfiguration({ level: e }), this);
    }
    get(e) {
      return this._getConfiguration()[e];
    }
    set(e, t) {
      this._updateConfiguration({ [e]: t });
    }
    settings() {
      console.table;
    }
    assert(e, t) {
      if (!e) throw new Error(t || "Assertion failed");
    }
    warn(e, ...t) {
      return this._log("warn", 0, e, t, { method: E.warn, once: !0 });
    }
    error(e, ...t) {
      return this._log("error", 0, e, t, { method: E.error });
    }
    deprecated(e, t) {
      return this.warn(
        `\`${e}\` is deprecated and will be removed in a later version. Use \`${t}\` instead`,
      );
    }
    removed(e, t) {
      return this.error(`\`${e}\` has been removed. Use \`${t}\` instead`);
    }
    probe(e, t, ...r) {
      return this._log("log", e, t, r, { method: E.log, time: !0, once: !0 });
    }
    log(e, t, ...r) {
      return this._log("log", e, t, r, { method: E.debug });
    }
    info(e, t, ...r) {
      return this._log("info", e, t, r, { method: console.info });
    }
    once(e, t, ...r) {
      return this._log("once", e, t, r, {
        method: E.debug || E.info,
        once: !0,
      });
    }
    table(e, t, r) {
      return t
        ? this._log("table", e, t, (r && [r]) || [], {
            method: console.table || f,
            tag: T(t),
          })
        : f;
    }
    time(e, t) {
      return this._log("time", e, t, [], {
        method: console.time ? console.time : console.info,
      });
    }
    timeEnd(e, t) {
      return this._log("time", e, t, [], {
        method: console.timeEnd ? console.timeEnd : console.info,
      });
    }
    timeStamp(e, t) {
      return this._log("time", e, t, [], { method: console.timeStamp || f });
    }
    group(e, t, r = { collapsed: !1 }) {
      const n =
        (r.collapsed ? console.groupCollapsed : console.group) || console.info;
      return this._log("group", e, t, [], { method: n });
    }
    groupCollapsed(e, t, r = {}) {
      return this.group(e, t, Object.assign({}, r, { collapsed: !0 }));
    }
    groupEnd(e) {
      return this._log("groupEnd", e, "", [], {
        method: console.groupEnd || f,
      });
    }
    withGroup(e, t, r) {
      this.group(e, t)();
      try {
        r();
      } finally {
        this.groupEnd(e)();
      }
    }
    trace() {
      console.trace;
    }
    _shouldLog(e) {
      return this.isEnabled() && super._shouldLog(e);
    }
    _emit(e, t) {
      const r = t.method;
      (u(r),
        (t.total = this.getTotal()),
        (t.delta = this.getDelta()),
        (this._deltaTs = _()));
      const n = (function (e, t, r) {
        if ("string" == typeof t) {
          const o = r.time
            ? (function (e, t = 8) {
                const r = Math.max(t - e.length, 0);
                return `${" ".repeat(r)}${e}`;
              })(
                (function (e) {
                  let t;
                  return (
                    (t =
                      e < 10
                        ? `${e.toFixed(2)}ms`
                        : e < 100
                          ? `${e.toFixed(1)}ms`
                          : e < 1e3
                            ? `${e.toFixed(0)}ms`
                            : `${(e / 1e3).toFixed(2)}s`),
                    t
                  );
                })(r.total),
              )
            : "";
          ((n = t = r.time ? `${e}: ${o}  ${t}` : `${e}: ${t}`),
            (i = r.color),
            (s = r.background),
            c ||
              "string" != typeof n ||
              (i && (n = `[${m(i)}m${n}[39m`),
              s && (n = `[${m(s) + 10}m${n}[49m`)),
            (t = n));
        }
        var n, i, s;
        return t;
      })(this.id, t.message, t);
      return r.bind(console, n, ...t.args);
    }
    _getConfiguration() {
      return (
        this._storage.config[this.id] || this._updateConfiguration(b),
        this._storage.config[this.id]
      );
    }
    _updateConfiguration(e) {
      const t = this._storage.config[this.id] || { ...b };
      this._storage.setConfiguration({ [this.id]: { ...t, ...e } });
    }
  };
function T(e) {
  for (const t in e) for (const r in e[t]) return r || "untitled";
  return "empty";
}
y.VERSION = l;
var A = "4.4.2"[0] >= "0" && "4.4.2"[0] <= "9" ? "v4.4.2" : "",
  R = (function () {
    const e = new y({ id: "loaders.gl" });
    return (
      (globalThis.loaders ||= {}),
      (globalThis.loaders.log = e),
      (globalThis.loaders.version = A),
      (globalThis.probe ||= {}),
      (globalThis.probe.loaders = e),
      e
    );
  })(),
  v = (e) => "function" == typeof e,
  S = (e) => null !== e && "object" == typeof e,
  C = (e) => S(e) && e.constructor === {}.constructor,
  w = (e) =>
    "undefined" != typeof SharedArrayBuffer && e instanceof SharedArrayBuffer,
  L = (e) =>
    S(e) && "number" == typeof e.byteLength && "function" == typeof e.slice,
  O = (e) =>
    ("undefined" != typeof Response && e instanceof Response) ||
    (S(e) && v(e.arrayBuffer) && v(e.text) && v(e.json)),
  N = (e) => "undefined" != typeof Blob && e instanceof Blob,
  x = (e) =>
    ((e) =>
      ("undefined" != typeof ReadableStream && e instanceof ReadableStream) ||
      (S(e) && v(e.tee) && v(e.cancel) && v(e.getReader)))(e) ||
    ((e) =>
      S(e) &&
      v(e.read) &&
      v(e.pipe) &&
      ((e) => "boolean" == typeof e)(e.readable))(e);
function P(e, t) {
  return I(e || {}, t);
}
function I(e, t, r = 0) {
  if (r > 3) return t;
  const n = { ...e };
  for (const [i, s] of Object.entries(t))
    s && "object" == typeof s && !Array.isArray(s)
      ? (n[i] = I(n[i] || {}, t[i], r + 1))
      : (n[i] = t[i]);
  return n;
}
function M(e, t) {
  if (!e) throw new Error(t || "loaders.gl assertion failed.");
}
(globalThis._loadersgl_?.version ||
  ((globalThis._loadersgl_ = globalThis._loadersgl_ || {}),
  (globalThis._loadersgl_.version = "4.4.2")),
  globalThis._loadersgl_.version,
  "undefined" != typeof self && self,
  "undefined" != typeof window && window,
  "undefined" != typeof global && global,
  "undefined" != typeof document && document);
var B =
    "object" != typeof process ||
    "[object process]" !== String(process) ||
    process.browser,
  D = "undefined" != typeof window && void 0 !== window.orientation,
  F =
    "undefined" != typeof process &&
    process.version &&
    /v([0-9]*)/.exec(process.version),
  U =
    (F && parseFloat(F[1]),
    class {
      name;
      workerThread;
      isRunning = !0;
      result;
      _resolve = () => {};
      _reject = () => {};
      constructor(e, t) {
        ((this.name = e),
          (this.workerThread = t),
          (this.result = new Promise((e, t) => {
            ((this._resolve = e), (this._reject = t));
          })));
      }
      postMessage(e, t) {
        this.workerThread.postMessage({
          source: "loaders.gl",
          type: e,
          payload: t,
        });
      }
      done(e) {
        (M(this.isRunning), (this.isRunning = !1), this._resolve(e));
      }
      error(e) {
        (M(this.isRunning), (this.isRunning = !1), this._reject(e));
      }
    }),
  G = class {
    terminate() {}
  },
  k = new Map();
function W(e) {
  const t = new Blob([e], { type: "application/javascript" });
  return URL.createObjectURL(t);
}
function $(e, t = !0, r) {
  const n = r || new Set();
  if (e)
    if (H(e)) n.add(e);
    else if (H(e.buffer)) n.add(e.buffer);
    else if (ArrayBuffer.isView(e));
    else if (t && "object" == typeof e) for (const i in e) $(e[i], t, n);
  return void 0 === r ? Array.from(n) : [];
}
function H(e) {
  return (
    !!e &&
    (e instanceof ArrayBuffer ||
      ("undefined" != typeof MessagePort && e instanceof MessagePort) ||
      ("undefined" != typeof ImageBitmap && e instanceof ImageBitmap) ||
      ("undefined" != typeof OffscreenCanvas && e instanceof OffscreenCanvas))
  );
}
var V = () => {},
  z = class {
    name;
    source;
    url;
    terminated = !1;
    worker;
    onMessage;
    onError;
    _loadableURL = "";
    static isSupported() {
      return ("undefined" != typeof Worker && B) || (void 0 !== G && !B);
    }
    constructor(e) {
      const { name: t, source: r, url: n } = e;
      (M(r || n),
        (this.name = t),
        (this.source = r),
        (this.url = n),
        (this.onMessage = V),
        (this.onError = (e) => {}),
        (this.worker = B
          ? this._createBrowserWorker()
          : this._createNodeWorker()));
    }
    destroy() {
      ((this.onMessage = V),
        (this.onError = V),
        this.worker.terminate(),
        (this.terminated = !0));
    }
    get isRunning() {
      return Boolean(this.onMessage);
    }
    postMessage(e, t) {
      ((t = t || $(e)), this.worker.postMessage(e, t));
    }
    _getErrorFromErrorEvent(e) {
      let t = "Failed to load ";
      return (
        (t += `worker ${this.name} from ${this.url}. `),
        e.message && (t += `${e.message} in `),
        e.lineno && (t += `:${e.lineno}:${e.colno}`),
        new Error(t)
      );
    }
    _createBrowserWorker() {
      this._loadableURL = (function (e) {
        M((e.source && !e.url) || (!e.source && e.url));
        let t = k.get(e.source || e.url);
        var r;
        return (
          t ||
            (e.url &&
              ((t = (r = e.url).startsWith("http")
                ? W(
                    `try {\n  importScripts('${r}');\n} catch (error) {\n  console.error(error);\n  throw error;\n}`,
                  )
                : r),
              k.set(e.url, t)),
            e.source && ((t = W(e.source)), k.set(e.source, t))),
          M(t),
          t
        );
      })({ source: this.source, url: this.url });
      const e = new Worker(this._loadableURL, { name: this.name });
      return (
        (e.onmessage = (e) => {
          e.data
            ? this.onMessage(e.data)
            : this.onError(new Error("No data received"));
        }),
        (e.onerror = (e) => {
          (this.onError(this._getErrorFromErrorEvent(e)),
            (this.terminated = !0));
        }),
        (e.onmessageerror = (e) => {}),
        e
      );
    }
    _createNodeWorker() {
      let e;
      if (this.url)
        e = new G(
          this.url.includes(":/") || this.url.startsWith("/")
            ? this.url
            : `./${this.url}`,
          {
            eval: !1,
            type:
              this.url.endsWith(".ts") || this.url.endsWith(".mjs")
                ? "module"
                : "commonjs",
          },
        );
      else {
        if (!this.source) throw new Error("no worker");
        e = new G(this.source, { eval: !0 });
      }
      return (
        e.on("message", (e) => {
          this.onMessage(e);
        }),
        e.on("error", (e) => {
          this.onError(e);
        }),
        e.on("exit", (e) => {}),
        e
      );
    }
  },
  X = class {
    name = "unnamed";
    source;
    url;
    maxConcurrency = 1;
    maxMobileConcurrency = 1;
    onDebug = () => {};
    reuseWorkers = !0;
    props = {};
    jobQueue = [];
    idleQueue = [];
    count = 0;
    isDestroyed = !1;
    static isSupported() {
      return z.isSupported();
    }
    constructor(e) {
      ((this.source = e.source), (this.url = e.url), this.setProps(e));
    }
    destroy() {
      (this.idleQueue.forEach((e) => e.destroy()), (this.isDestroyed = !0));
    }
    setProps(e) {
      ((this.props = { ...this.props, ...e }),
        void 0 !== e.name && (this.name = e.name),
        void 0 !== e.maxConcurrency && (this.maxConcurrency = e.maxConcurrency),
        void 0 !== e.maxMobileConcurrency &&
          (this.maxMobileConcurrency = e.maxMobileConcurrency),
        void 0 !== e.reuseWorkers && (this.reuseWorkers = e.reuseWorkers),
        void 0 !== e.onDebug && (this.onDebug = e.onDebug));
    }
    async startJob(e, t = (e, t, r) => e.done(r), r = (e, t) => e.error(t)) {
      const n = new Promise(
        (n) => (
          this.jobQueue.push({ name: e, onMessage: t, onError: r, onStart: n }),
          this
        ),
      );
      return (this._startQueuedJob(), await n);
    }
    async _startQueuedJob() {
      if (!this.jobQueue.length) return;
      const e = this._getAvailableWorker();
      if (!e) return;
      const t = this.jobQueue.shift();
      if (t) {
        this.onDebug({
          message: "Starting job",
          name: t.name,
          workerThread: e,
          backlog: this.jobQueue.length,
        });
        const n = new U(t.name, e);
        ((e.onMessage = (e) => t.onMessage(n, e.type, e.payload)),
          (e.onError = (e) => t.onError(n, e)),
          t.onStart(n));
        try {
          await n.result;
        } catch (r) {
        } finally {
          this.returnWorkerToQueue(e);
        }
      }
    }
    returnWorkerToQueue(e) {
      (!B ||
      this.isDestroyed ||
      !this.reuseWorkers ||
      this.count > this._getMaxConcurrency()
        ? (e.destroy(), this.count--)
        : this.idleQueue.push(e),
        this.isDestroyed || this._startQueuedJob());
    }
    _getAvailableWorker() {
      return this.idleQueue.length > 0
        ? this.idleQueue.shift() || null
        : this.count < this._getMaxConcurrency()
          ? (this.count++,
            new z({
              name: `${this.name.toLowerCase()} (#${this.count} of ${this.maxConcurrency})`,
              source: this.source,
              url: this.url,
            }))
          : null;
    }
    _getMaxConcurrency() {
      return D ? this.maxMobileConcurrency : this.maxConcurrency;
    }
  },
  j = {
    maxConcurrency: 3,
    maxMobileConcurrency: 1,
    reuseWorkers: !0,
    onDebug: () => {},
  },
  K = class e {
    props;
    workerPools = new Map();
    static _workerFarm;
    static isSupported() {
      return z.isSupported();
    }
    static getWorkerFarm(t = {}) {
      return (
        (e._workerFarm = e._workerFarm || new e({})),
        e._workerFarm.setProps(t),
        e._workerFarm
      );
    }
    constructor(e) {
      ((this.props = { ...j }),
        this.setProps(e),
        (this.workerPools = new Map()));
    }
    destroy() {
      for (const e of this.workerPools.values()) e.destroy();
      this.workerPools = new Map();
    }
    setProps(e) {
      this.props = { ...this.props, ...e };
      for (const t of this.workerPools.values())
        t.setProps(this._getWorkerPoolProps());
    }
    getWorkerPool(e) {
      const { name: t, source: r, url: n } = e;
      let i = this.workerPools.get(t);
      return (
        i ||
          ((i = new X({ name: t, source: r, url: n })),
          i.setProps(this._getWorkerPoolProps()),
          this.workerPools.set(t, i)),
        i
      );
    }
    _getWorkerPoolProps() {
      return {
        maxConcurrency: this.props.maxConcurrency,
        maxMobileConcurrency: this.props.maxMobileConcurrency,
        reuseWorkers: this.props.reuseWorkers,
        onDebug: this.props.onDebug,
      };
    }
  };
async function Y(e, t, r, n, i) {
  const s = e.id,
    o = (function (e, t = {}) {
      const r = t[e.id] || {},
        n = B ? `${e.id}-worker.js` : `${e.id}-worker-node.js`;
      let i = r.workerUrl;
      if (
        (i || "compression" !== e.id || (i = t.workerUrl),
        "test" === (t._workerType || t?.core?._workerType) &&
          (i = B
            ? `modules/${e.module}/dist/${n}`
            : `modules/${e.module}/src/workers/${e.id}-worker-node.ts`),
        !i)
      ) {
        let t = e.version;
        "latest" === t && (t = "latest");
        const r = t ? `@${t}` : "";
        i = `https://unpkg.com/@loaders.gl/${e.module}${r}/dist/${n}`;
      }
      return (M(i), i);
    })(e, r),
    a = K.getWorkerFarm(r?.core).getWorkerPool({ name: s, url: o });
  ((r = JSON.parse(JSON.stringify(r))),
    (n = JSON.parse(JSON.stringify(n || {}))));
  const c = await a.startJob("process-on-worker", Q.bind(null, i));
  return (
    c.postMessage("process", { input: t, options: r, context: n }),
    await (
      await c.result
    ).result
  );
}
async function Q(e, t, r, n) {
  switch (r) {
    case "done":
      t.done(n);
      break;
    case "error":
      t.error(new Error(n.error));
      break;
    case "process":
      const { id: r, input: s, options: o } = n;
      try {
        const n = await e(s, o);
        t.postMessage("done", { id: r, result: n });
      } catch (i) {
        const e = i instanceof Error ? i.message : "unknown error";
        t.postMessage("error", { id: r, error: e });
      }
  }
}
function q(e) {
  if (e instanceof ArrayBuffer) return e;
  if (ArrayBuffer.isView(e)) {
    const { buffer: t, byteOffset: r, byteLength: n } = e;
    return Z(t, r, n);
  }
  return Z(e);
}
function Z(e, t = 0, r = e.byteLength - t) {
  const n = new Uint8Array(e, t, r),
    i = new Uint8Array(n.length);
  return (i.set(n), i.buffer);
}
function J() {
  let e;
  if ("undefined" != typeof window && window.performance)
    e = window.performance.now();
  else if ("undefined" != typeof process && process.hrtime) {
    const t = process.hrtime();
    e = 1e3 * t[0] + t[1] / 1e6;
  } else e = Date.now();
  return e;
}
var ee = class {
    constructor(e, t) {
      ((this.sampleSize = 1),
        (this.time = 0),
        (this.count = 0),
        (this.samples = 0),
        (this.lastTiming = 0),
        (this.lastSampleTime = 0),
        (this.lastSampleCount = 0),
        (this._count = 0),
        (this._time = 0),
        (this._samples = 0),
        (this._startTime = 0),
        (this._timerPending = !1),
        (this.name = e),
        (this.type = t),
        this.reset());
    }
    reset() {
      return (
        (this.time = 0),
        (this.count = 0),
        (this.samples = 0),
        (this.lastTiming = 0),
        (this.lastSampleTime = 0),
        (this.lastSampleCount = 0),
        (this._count = 0),
        (this._time = 0),
        (this._samples = 0),
        (this._startTime = 0),
        (this._timerPending = !1),
        this
      );
    }
    setSampleSize(e) {
      return ((this.sampleSize = e), this);
    }
    incrementCount() {
      return (this.addCount(1), this);
    }
    decrementCount() {
      return (this.subtractCount(1), this);
    }
    addCount(e) {
      return ((this._count += e), this._samples++, this._checkSampling(), this);
    }
    subtractCount(e) {
      return ((this._count -= e), this._samples++, this._checkSampling(), this);
    }
    addTime(e) {
      return (
        (this._time += e),
        (this.lastTiming = e),
        this._samples++,
        this._checkSampling(),
        this
      );
    }
    timeStart() {
      return ((this._startTime = J()), (this._timerPending = !0), this);
    }
    timeEnd() {
      return this._timerPending
        ? (this.addTime(J() - this._startTime),
          (this._timerPending = !1),
          this._checkSampling(),
          this)
        : this;
    }
    getSampleAverageCount() {
      return this.sampleSize > 0 ? this.lastSampleCount / this.sampleSize : 0;
    }
    getSampleAverageTime() {
      return this.sampleSize > 0 ? this.lastSampleTime / this.sampleSize : 0;
    }
    getSampleHz() {
      return this.lastSampleTime > 0
        ? this.sampleSize / (this.lastSampleTime / 1e3)
        : 0;
    }
    getAverageCount() {
      return this.samples > 0 ? this.count / this.samples : 0;
    }
    getAverageTime() {
      return this.samples > 0 ? this.time / this.samples : 0;
    }
    getHz() {
      return this.time > 0 ? this.samples / (this.time / 1e3) : 0;
    }
    _checkSampling() {
      this._samples === this.sampleSize &&
        ((this.lastSampleTime = this._time),
        (this.lastSampleCount = this._count),
        (this.count += this._count),
        (this.time += this._time),
        (this.samples += this._samples),
        (this._time = 0),
        (this._count = 0),
        (this._samples = 0));
    }
  },
  te = class {
    constructor(e) {
      ((this.stats = {}),
        (this.id = e.id),
        (this.stats = {}),
        this._initializeStats(e.stats),
        Object.seal(this));
    }
    get(e, t = "count") {
      return this._getOrCreate({ name: e, type: t });
    }
    get size() {
      return Object.keys(this.stats).length;
    }
    reset() {
      for (const e of Object.values(this.stats)) e.reset();
      return this;
    }
    forEach(e) {
      for (const t of Object.values(this.stats)) e(t);
    }
    getTable() {
      const e = {};
      return (
        this.forEach((t) => {
          e[t.name] = {
            time: t.time || 0,
            count: t.count || 0,
            average: t.getAverageTime() || 0,
            hz: t.getHz() || 0,
          };
        }),
        e
      );
    }
    _initializeStats(e = []) {
      e.forEach((e) => this._getOrCreate(e));
    }
    _getOrCreate(e) {
      const { name: t, type: r } = e;
      let n = this.stats[t];
      return (
        n || ((n = e instanceof ee ? e : new ee(t, r)), (this.stats[t] = n)),
        n
      );
    }
  },
  re = {};
function ne(e) {
  return e && "object" == typeof e && e.isBuffer;
}
function ie(e) {
  if (ne(e)) return e;
  if (e instanceof ArrayBuffer) return e;
  if (w(e)) return oe(e);
  if (ArrayBuffer.isView(e)) {
    const t = e.buffer;
    return 0 === e.byteOffset && e.byteLength === e.buffer.byteLength
      ? t
      : t.slice(e.byteOffset, e.byteOffset + e.byteLength);
  }
  if ("string" == typeof e) {
    const t = e;
    return new TextEncoder().encode(t).buffer;
  }
  if (e && "object" == typeof e && e._toArrayBuffer) return e._toArrayBuffer();
  throw new Error("toArrayBuffer");
}
function se(e) {
  if (e instanceof ArrayBuffer) return e;
  if (w(e)) return oe(e);
  const { buffer: t, byteOffset: r, byteLength: n } = e;
  return t instanceof ArrayBuffer && 0 === r && n === t.byteLength
    ? t
    : oe(t, r, n);
}
function oe(e, t = 0, r = e.byteLength - t) {
  const n = new Uint8Array(e, t, r),
    i = new Uint8Array(n.length);
  return (i.set(n), i.buffer);
}
function ae(e) {
  const t = e ? e.lastIndexOf("/") : -1;
  return t >= 0 ? e.substr(t + 1) : e;
}
function ce(e) {
  const t = e ? e.lastIndexOf("/") : -1;
  return t >= 0 ? e.substr(0, t) : "";
}
var le = class extends Error {
    constructor(e, t) {
      (super(e),
        (this.reason = t.reason),
        (this.url = t.url),
        (this.response = t.response));
    }
    reason;
    url;
    response;
  },
  ue = /^data:([-\w.]+\/[-\w.+]+)(;|,)/,
  he = /^([-\w.]+\/[-\w.+]+)/;
function de(e, t) {
  return e.toLowerCase() === t.toLowerCase();
}
function fe(e) {
  const t = ue.exec(e);
  return t ? t[1] : "";
}
var pe = /\?.*/;
function ge(e) {
  return e.replace(pe, "");
}
function me(e) {
  return O(e)
    ? e.url
    : N(e)
      ? ("name" in e ? e.name : "") || ""
      : "string" == typeof e
        ? e
        : "";
}
function _e(e) {
  if (O(e)) {
    const t = e.headers.get("content-type") || "",
      r = ge(e.url);
    return (
      (function (e) {
        const t = he.exec(e);
        return t ? t[1] : e;
      })(t) || fe(r)
    );
  }
  return N(e) ? e.type || "" : "string" == typeof e ? fe(e) : "";
}
async function Ee(e) {
  if (O(e)) return e;
  const t = {},
    r = (function (e) {
      return O(e)
        ? e.headers["content-length"] || -1
        : N(e)
          ? e.size
          : "string" == typeof e
            ? e.length
            : e instanceof ArrayBuffer || ArrayBuffer.isView(e)
              ? e.byteLength
              : -1;
    })(e);
  r >= 0 && (t["content-length"] = String(r));
  const n = me(e),
    i = _e(e);
  i && (t["content-type"] = i);
  const s = await (async function (e) {
    if ("string" == typeof e) return `data:,${e.slice(0, 5)}`;
    if (e instanceof Blob) {
      const t = e.slice(0, 5);
      return await new Promise((e) => {
        const r = new FileReader();
        ((r.onload = (t) => e(t?.target?.result)), r.readAsDataURL(t));
      });
    }
    return e instanceof ArrayBuffer
      ? `data:base64,${(function (e) {
          let t = "";
          const r = new Uint8Array(e);
          for (let n = 0; n < r.byteLength; n++) t += String.fromCharCode(r[n]);
          return btoa(t);
        })(e.slice(0, 5))}`
      : null;
  })(e);
  (s && (t["x-first-bytes"] = s),
    "string" == typeof e && (e = new TextEncoder().encode(e)));
  const o = new Response(e, { headers: t });
  return (Object.defineProperty(o, "url", { value: n }), o);
}
async function be(e, t) {
  if ("string" == typeof e) {
    const r = (function (e) {
      for (const t in re)
        if (e.startsWith(t)) {
          const r = re[t];
          e = e.replace(t, r);
        }
      return (
        e.startsWith("http://") || e.startsWith("https://") || (e = `${e}`),
        e
      );
    })(e);
    return (function (e) {
      return (
        !(function (e) {
          return e.startsWith("http:") || e.startsWith("https:");
        })(e) &&
        !(function (e) {
          return e.startsWith("data:");
        })(e)
      );
    })(r) && globalThis.loaders?.fetchNode
      ? globalThis.loaders?.fetchNode(r, t)
      : await fetch(r, t);
  }
  return await Ee(e);
}
var ye = new y({ id: "loaders.gl" }),
  Te = class {
    log() {
      return () => {};
    }
    info() {
      return () => {};
    }
    warn() {
      return () => {};
    }
    error() {
      return () => {};
    }
  },
  Ae = {
    core: {
      baseUrl: void 0,
      fetch: null,
      mimeType: void 0,
      fallbackMimeType: void 0,
      ignoreRegisteredLoaders: void 0,
      nothrow: !1,
      log: new (class {
        console;
        constructor() {
          this.console = console;
        }
        log(...e) {
          return this.console.log.bind(this.console, ...e);
        }
        info(...e) {
          return this.console.info.bind(this.console, ...e);
        }
        warn(...e) {
          return this.console.warn.bind(this.console, ...e);
        }
        error(...e) {
          return this.console.error.bind(this.console, ...e);
        }
      })(),
      useLocalLibraries: !1,
      CDN: "https://unpkg.com/@loaders.gl",
      worker: !0,
      maxConcurrency: 3,
      maxMobileConcurrency: 1,
      reuseWorkers: r,
      _nodeWorkers: !1,
      _workerType: "",
      limit: 0,
      _limitMB: 0,
      batchSize: "auto",
      batchDebounceMs: 0,
      metadata: !1,
      transforms: [],
    },
  },
  Re = {
    baseUri: "core.baseUrl",
    fetch: "core.fetch",
    mimeType: "core.mimeType",
    fallbackMimeType: "core.fallbackMimeType",
    ignoreRegisteredLoaders: "core.ignoreRegisteredLoaders",
    nothrow: "core.nothrow",
    log: "core.log",
    useLocalLibraries: "core.useLocalLibraries",
    CDN: "core.CDN",
    worker: "core.worker",
    maxConcurrency: "core.maxConcurrency",
    maxMobileConcurrency: "core.maxMobileConcurrency",
    reuseWorkers: "core.reuseWorkers",
    _nodeWorkers: "core.nodeWorkers",
    _workerType: "core._workerType",
    _worker: "core._workerType",
    limit: "core.limit",
    _limitMB: "core._limitMB",
    batchSize: "core.batchSize",
    batchDebounceMs: "core.batchDebounceMs",
    metadata: "core.metadata",
    transforms: "core.transforms",
    throws: "nothrow",
    dataType: "(no longer used)",
    uri: "core.baseUrl",
    method: "core.fetch.method",
    headers: "core.fetch.headers",
    body: "core.fetch.body",
    mode: "core.fetch.mode",
    credentials: "core.fetch.credentials",
    cache: "core.fetch.cache",
    redirect: "core.fetch.redirect",
    referrer: "core.fetch.referrer",
    referrerPolicy: "core.fetch.referrerPolicy",
    integrity: "core.fetch.integrity",
    keepalive: "core.fetch.keepalive",
    signal: "core.fetch.signal",
  },
  ve = [
    "baseUrl",
    "fetch",
    "mimeType",
    "fallbackMimeType",
    "ignoreRegisteredLoaders",
    "nothrow",
    "log",
    "useLocalLibraries",
    "CDN",
    "worker",
    "maxConcurrency",
    "maxMobileConcurrency",
    "reuseWorkers",
    "_nodeWorkers",
    "_workerType",
    "limit",
    "_limitMB",
    "batchSize",
    "batchDebounceMs",
    "metadata",
    "transforms",
  ];
function Se() {
  globalThis.loaders = globalThis.loaders || {};
  const { loaders: e } = globalThis;
  return (e._state || (e._state = {}), e._state);
}
function Ce() {
  const e = Se();
  return (
    (e.globalOptions = e.globalOptions || { ...Ae, core: { ...Ae.core } }),
    we(e.globalOptions)
  );
}
function we(e) {
  const t = (function (e) {
    const t = { ...e };
    return (e.core && (t.core = { ...e.core }), t);
  })(e);
  xe(t);
  for (const r of ve) t.core && void 0 !== t.core[r] && delete t[r];
  return (t.core && void 0 !== t.core._workerType && delete t._worker, t);
}
function Le(e, t, r, n, i) {
  const s = t || "Top level",
    o = t ? `${t}.` : "";
  for (const a in e) {
    const c = !t && S(e[a]);
    if (!(a in r) && ("baseUri" !== a || t) && ("workerUrl" !== a || !t))
      if (a in n)
        ye.level > 0 &&
          ye.warn(
            `${s} loader option '${o}${a}' no longer supported, use '${n[a]}'`,
          )();
      else if (!c && ye.level > 0) {
        const e = Oe(a, i);
        ye.warn(`${s} loader option '${o}${a}' not recognized. ${e}`)();
      }
  }
}
function Oe(e, t) {
  const r = e.toLowerCase();
  let n = "";
  for (const i of t)
    for (const t in i.options) {
      if (e === t) return `Did you mean '${i.id}.${t}'?`;
      const s = t.toLowerCase();
      (r.startsWith(s) || s.startsWith(r)) &&
        (n = n || `Did you mean '${i.id}.${t}'?`);
    }
  return n;
}
function Ne(e, t) {
  for (const r in t)
    if (r in t) {
      const n = t[r];
      C(n) && C(e[r]) ? (e[r] = { ...e[r], ...t[r] }) : (e[r] = t[r]);
    }
}
function xe(e) {
  void 0 !== e.baseUri &&
    ((e.core ||= {}),
    void 0 === e.core.baseUrl && (e.core.baseUrl = e.baseUri));
  for (const r of ve)
    if (void 0 !== e[r]) {
      const t = (e.core = e.core || {});
      void 0 === t[r] && (t[r] = e[r]);
    }
  const t = e._worker;
  void 0 !== t &&
    ((e.core ||= {}),
    void 0 === e.core._workerType && (e.core._workerType = t));
}
function Pe(e) {
  return !!e && (Array.isArray(e) && (e = e[0]), Array.isArray(e?.extensions));
}
function Ie(e) {
  let r;
  return (
    t(e, "null loader"),
    t(Pe(e), "invalid loader"),
    Array.isArray(e) &&
      ((r = e[1]), (e = e[0]), (e = { ...e, options: { ...e.options, ...r } })),
    (e?.parseTextSync || e?.parseText) && (e.text = !0),
    e.text || (e.binary = !0),
    e
  );
}
var Me = () => {
  const e = Se();
  return ((e.loaderRegistry = e.loaderRegistry || []), e.loaderRegistry);
};
function Be(e) {
  const t = Me();
  e = Array.isArray(e) ? e : [e];
  for (const r of e) {
    const e = Ie(r);
    t.find((t) => e === t) || t.unshift(e);
  }
}
var De = /\.([^.]+)$/;
function Fe(e) {
  const t = _e(e);
  return Boolean(
    t &&
    (t.startsWith("text/") || "application/json" === t || t.endsWith("+json")),
  );
}
function Ue(e, t = [], r, n) {
  if (!Ge(e)) return null;
  const i = we(r || {});
  if (((i.core ||= {}), t && !Array.isArray(t))) return Ie(t);
  let s = [];
  (t && (s = s.concat(t)),
    i.core.ignoreRegisteredLoaders || s.push(...Me()),
    (function (e) {
      for (const t of e) Ie(t);
    })(s));
  const o = (function (e, t, r, n) {
    const i = me(e),
      s = _e(e),
      o = ge(i) || n?.url;
    let a = null,
      c = "";
    return (
      r?.core?.mimeType &&
        ((a = We(t, r?.core?.mimeType)),
        (c = `match forced by supplied MIME type ${r?.core?.mimeType}`)),
      (a =
        a ||
        (function (e, t) {
          const r = t && De.exec(t),
            n = r && r[1];
          return n
            ? (function (e, t) {
                t = t.toLowerCase();
                for (const r of e)
                  for (const e of r.extensions)
                    if (e.toLowerCase() === t) return r;
                return null;
              })(e, n)
            : null;
        })(t, o)),
      (c = c || (a ? `matched url ${o}` : "")),
      (a = a || We(t, s)),
      (c = c || (a ? `matched MIME type ${s}` : "")),
      (a =
        a ||
        (function (e, t) {
          if (!t) return null;
          for (const r of e)
            if ("string" == typeof t) {
              if ($e(t, r)) return r;
            } else if (ArrayBuffer.isView(t)) {
              if (He(t.buffer, t.byteOffset, r)) return r;
            } else if (t instanceof ArrayBuffer && He(t, 0, r)) return r;
          return null;
        })(t, e)),
      (c = c || (a ? `matched initial data ${Ve(e)}` : "")),
      r?.core?.fallbackMimeType &&
        ((a = a || We(t, r?.core?.fallbackMimeType)),
        (c = c || (a ? `matched fallback MIME type ${s}` : ""))),
      c && R.log(1, `selectLoader selected ${a?.name}: ${c}.`),
      a
    );
  })(e, s, i, n);
  if (!o && !i.core.nothrow) throw new Error(ke(e));
  return o;
}
function Ge(e) {
  return !(e instanceof Response && 204 === e.status);
}
function ke(e) {
  const t = me(e),
    r = _e(e);
  let n = "No valid loader found (";
  ((n += t ? `${ae(t)}, ` : "no url provided, "),
    (n += `MIME type: ${r ? `"${r}"` : "not provided"}, `));
  const i = e ? Ve(e) : "";
  return (
    (n += i ? ` first bytes: "${i}"` : "first bytes: not available"),
    (n += ")"),
    n
  );
}
function We(e, t) {
  for (const r of e) {
    if (r.mimeTypes?.some((e) => de(t, e))) return r;
    if (de(t, `application/x.${r.id}`)) return r;
  }
  return null;
}
function $e(e, t) {
  return t.testText
    ? t.testText(e)
    : (Array.isArray(t.tests) ? t.tests : [t.tests]).some((t) =>
        e.startsWith(t),
      );
}
function He(e, t, r) {
  return (Array.isArray(r.tests) ? r.tests : [r.tests]).some((r) =>
    (function (e, t, r, n) {
      if (L(n))
        return (function (e, t, r) {
          if (((r = r || e.byteLength), e.byteLength < r || t.byteLength < r))
            return !1;
          const n = new Uint8Array(e),
            i = new Uint8Array(t);
          for (let s = 0; s < n.length; ++s) if (n[s] !== i[s]) return !1;
          return !0;
        })(n, e, n.byteLength);
      switch (typeof n) {
        case "function":
          return n(se(e));
        case "string":
          return n === ze(e, t, n.length);
        default:
          return !1;
      }
    })(e, t, 0, r),
  );
}
function Ve(e, t = 5) {
  return "string" == typeof e
    ? e.slice(0, t)
    : ArrayBuffer.isView(e)
      ? ze(e.buffer, e.byteOffset, t)
      : e instanceof ArrayBuffer
        ? ze(e, 0, t)
        : "";
}
function ze(e, t, r) {
  if (e.byteLength < t + r) return "";
  const n = new DataView(e);
  let i = "";
  for (let s = 0; s < r; s++) i += String.fromCharCode(n.getUint8(t + s));
  return i;
}
var Xe = 262144;
function je(e, t) {
  return r
    ? (async function* (e, t) {
        const r = e.getReader();
        let n;
        try {
          for (;;) {
            const e = n || r.read();
            t?._streamReadAhead && (n = r.read());
            const { done: i, value: s } = await e;
            if (i) return;
            yield ie(s);
          }
        } catch (i) {
          r.releaseLock();
        }
      })(e, t)
    : (async function* (e) {
        for await (const t of e) yield ie(t);
      })(e);
}
var Ke = "Cannot convert supplied data type";
async function Ye(e, t, r) {
  if ("string" == typeof e || L(e))
    return (function (e, t) {
      if (t.text && "string" == typeof e) return e;
      if ((ne(e) && (e = e.buffer), L(e))) {
        const r = (function (e) {
          return ArrayBuffer.isView(e) ? e : new Uint8Array(e);
        })(e);
        return t.text && !t.binary ? new TextDecoder("utf8").decode(r) : ie(r);
      }
      throw new Error(Ke);
    })(e, t);
  if ((N(e) && (e = await Ee(e)), O(e)))
    return (
      await (async function (e) {
        if (!e.ok)
          throw await (async function (e) {
            const t = (function (e) {
              if (e.length < 50) return e;
              const t = e.slice(e.length - 15);
              return `${e.substr(0, 32)}...${t}`;
            })(e.url);
            let r = `Failed to fetch resource (${e.status}) ${e.statusText}: ${t}`;
            r = r.length > 100 ? `${r.slice(0, 100)}...` : r;
            const n = { reason: e.statusText, url: e.url, response: e };
            try {
              const t = e.headers.get("Content-Type");
              n.reason =
                !e.bodyUsed && t?.includes("application/json")
                  ? await e.json()
                  : await e.text();
            } catch (i) {}
            return new le(r, n);
          })(e);
      })(e),
      t.binary ? await e.arrayBuffer() : await e.text()
    );
  if (
    (x(e) &&
      (e = (function (e, t) {
        if ("string" == typeof e)
          return (function* (e, t) {
            const r = t?.chunkSize || 262144;
            let n = 0;
            const i = new TextEncoder();
            for (; n < e.length; ) {
              const t = Math.min(e.length - n, r),
                s = e.slice(n, n + t);
              ((n += t), yield se(i.encode(s)));
            }
          })(e, t);
        if (e instanceof ArrayBuffer)
          return (function* (e, t = {}) {
            const { chunkSize: r = Xe } = t;
            let n = 0;
            for (; n < e.byteLength; ) {
              const t = Math.min(e.byteLength - n, r),
                i = new ArrayBuffer(t),
                s = new Uint8Array(e, n, t);
              (new Uint8Array(i).set(s), (n += t), yield i);
            }
          })(e, t);
        if (N(e))
          return (async function* (e, t) {
            const r = t?.chunkSize || 1048576;
            let n = 0;
            for (; n < e.size; ) {
              const t = n + r,
                i = await e.slice(n, t).arrayBuffer();
              ((n = t), yield i);
            }
          })(e, t);
        if (x(e)) return je(e, t);
        if (O(e)) {
          const r = e.body;
          if (!r) throw new Error("Readable stream not available on Response");
          return je(r, t);
        }
        throw new Error("makeIterator");
      })(e, r)),
    (n = e),
    (Boolean(n) && v(n[Symbol.iterator])) ||
      ((e) => Boolean(e) && v(e[Symbol.asyncIterator]))(e))
  )
    return (async function (e) {
      const t = [];
      for await (const r of e) t.push(q(r));
      return (function (...e) {
        return (function (e) {
          const t = e.map((e) =>
              e instanceof ArrayBuffer ? new Uint8Array(e) : e,
            ),
            r = t.reduce((e, t) => e + t.byteLength, 0),
            n = new Uint8Array(r);
          let i = 0;
          for (const s of t) (n.set(s, i), (i += s.byteLength));
          return n.buffer;
        })(e);
      })(...t);
    })(e);
  var n;
  throw new Error(Ke);
}
function Qe(e, t) {
  const r = Ce(),
    n = e || r,
    i = n.fetch ?? n.core?.fetch;
  return "function" == typeof i
    ? i
    : S(i)
      ? (e) => be(e, i)
      : t?.fetch
        ? t?.fetch
        : be;
}
async function qe(e, t, r, n) {
  (!t || Array.isArray(t) || Pe(t) || ((n = void 0), (r = t), (t = void 0)),
    (r = r || {}));
  const i = me((e = await e)),
    s = (function (e, t) {
      if (e && !Array.isArray(e)) return e;
      let r;
      if ((e && (r = Array.isArray(e) ? e : [e]), t && t.loaders)) {
        const e = Array.isArray(t.loaders) ? t.loaders : [t.loaders];
        r = r ? [...r, ...e] : e;
      }
      return r && r.length ? r : void 0;
    })(t, n),
    o = await (async function (e, t = [], r, n) {
      if (!Ge(e)) return null;
      const i = we(r || {});
      if (((i.core ||= {}), e instanceof Response && Fe(e))) {
        const r = Ue(
          await e.clone().text(),
          t,
          { ...i, core: { ...i.core, nothrow: !0 } },
          n,
        );
        if (r) return r;
      }
      let s = Ue(e, t, { ...i, core: { ...i.core, nothrow: !0 } }, n);
      if (s) return s;
      if (
        (N(e) && (s = Ue((e = await e.slice(0, 10).arrayBuffer()), t, i, n)),
        !s &&
          e instanceof Response &&
          Fe(e) &&
          (s = Ue(await e.clone().text(), t, i, n)),
        !s && !i.core.nothrow)
      )
        throw new Error(ke(e));
      return s;
    })(e, s, r);
  if (!o) return null;
  const a = (function (e, t, r, n) {
    return (
      (r = r || []),
      (function (e, t) {
        Le(e, null, Ae, Re, t);
        for (const r of t) {
          const n = (e && e[r.id]) || {},
            i = (r.options && r.options[r.id]) || {},
            s = (r.deprecatedOptions && r.deprecatedOptions[r.id]) || {};
          Le(n, r.id, i, s, t);
        }
      })(e, (r = Array.isArray(r) ? r : [r])),
      we(
        (function (e, t, r) {
          const n = e.options || {},
            i = { ...n };
          return (
            n.core && (i.core = { ...n.core }),
            xe(i),
            null === i.core?.log && (i.core = { ...i.core, log: new Te() }),
            Ne(i, we(Ce())),
            Ne(i, we(t)),
            (function (e, t) {
              t &&
                void 0 === e.core?.baseUrl &&
                ((e.core ||= {}), (e.core.baseUrl = ce(ge(t))));
            })(i, r),
            (function (e) {
              const t = e.core;
              if (t) for (const r of ve) void 0 !== t[r] && (e[r] = t[r]);
            })(i),
            i
          );
        })(t, e, n),
      )
    );
  })(r, o, s, i);
  return (
    (n = (function (e, t, r) {
      if (r) return r;
      const n = { fetch: Qe(t, e), ...e };
      if (n.url) {
        const e = ge(n.url);
        ((n.baseUrl = e),
          (n.queryString = (function (e) {
            const t = e.match(pe);
            return t && t[0];
          })(n.url)),
          (n.filename = ae(e)),
          (n.baseUrl = ce(e)));
      }
      return (Array.isArray(n.loaders) || (n.loaders = null), n);
    })({ url: i, _parse: qe, loaders: s }, a, n || null)),
    await (async function (e, t, r, n) {
      if (
        ((function (e) {
          M(e, "no worker provided");
          e.version;
        })(e),
        (r = P(e.options, r)),
        O(t))
      ) {
        const {
          ok: e,
          redirected: r,
          status: i,
          statusText: s,
          type: o,
          url: a,
        } = t;
        n.response = {
          headers: Object.fromEntries(t.headers.entries()),
          ok: e,
          redirected: r,
          status: i,
          statusText: s,
          type: o,
          url: a,
        };
      }
      t = await Ye(t, e, r);
      const i = e;
      if (i.parseTextSync && "string" == typeof t)
        return i.parseTextSync(t, r, n);
      if (
        (function (e, t) {
          if (!K.isSupported()) return !1;
          if (!B && !(t?._nodeWorkers ?? t?.core?._nodeWorkers)) return !1;
          const r = t?.worker ?? t?.core?.worker;
          return Boolean(e.worker && r);
        })(e, r)
      )
        return await Y(e, t, r, n, qe);
      if (i.parseText && "string" == typeof t)
        return await i.parseText(t, r, n);
      if (i.parse) return await i.parse(t, r, n);
      throw (
        M(!i.parseSync),
        new Error(`${e.id} loader - no parser found and worker is disabled`)
      );
    })(o, e, a, n)
  );
}
async function Ze(e, t, r, n) {
  let i, s;
  Array.isArray(t) || Pe(t) ? ((i = t), (s = r)) : ((i = []), (s = t));
  const o = Qe(s);
  let a = e;
  return (
    "string" == typeof e && (a = await o(e)),
    N(e) && (a = await o(e)),
    "string" == typeof e &&
      (we(s || {}).core?.baseUrl ||
        (s = { ...s, core: { ...s?.core, baseUrl: e } })),
    Array.isArray(i),
    await qe(a, i, s)
  );
}
var Je = globalThis.loaders?.parseImageNode,
  et = "undefined" != typeof Image,
  tt = "undefined" != typeof ImageBitmap,
  rt = !!r || Boolean(Je);
var nt = /^data:image\/svg\+xml/,
  it = /\.svg((\?|#).*)?$/;
function st(e) {
  return e && (nt.test(e) || it.test(e));
}
function ot(e, t) {
  if (st(t)) throw new Error("SVG cannot be parsed directly to imagebitmap");
  return new Blob([new Uint8Array(e)]);
}
async function at(e, t, r) {
  const n = (function (e, t) {
      if (st(t)) {
        let t = new TextDecoder().decode(e);
        try {
          "function" == typeof unescape &&
            "function" == typeof encodeURIComponent &&
            (t = unescape(encodeURIComponent(t)));
        } catch (r) {
          throw new Error(r.message);
        }
        return `data:image/svg+xml;base64,${btoa(t)}`;
      }
      return ot(e, t);
    })(e, r),
    i = self.URL || self.webkitURL,
    s = "string" != typeof n && i.createObjectURL(n);
  try {
    return await (async function (e, t) {
      const r = new Image();
      return (
        (r.src = e),
        t.image && t.image.decode && r.decode
          ? (await r.decode(), r)
          : await new Promise((e, t) => {
              try {
                ((r.onload = () => e(r)),
                  (r.onerror = (e) => {
                    const r = e instanceof Error ? e.message : "error";
                    t(new Error(r));
                  }));
              } catch (n) {
                t(n);
              }
            })
      );
    })(s || n, t);
  } finally {
    s && i.revokeObjectURL(s);
  }
}
var ct = !0;
var lt = !1,
  ut = !0;
function ht(e) {
  const t = dt(e);
  return (
    (function (e) {
      const t = dt(e);
      return t.byteLength >= 24 && 2303741511 === t.getUint32(0, lt)
        ? {
            mimeType: "image/png",
            width: t.getUint32(16, lt),
            height: t.getUint32(20, lt),
          }
        : null;
    })(t) ||
    (function (e) {
      const t = dt(e);
      if (
        !(
          t.byteLength >= 3 &&
          65496 === t.getUint16(0, lt) &&
          255 === t.getUint8(2)
        )
      )
        return null;
      const { tableMarkers: r, sofMarkers: n } = (function () {
        const e = new Set([65499, 65476, 65484, 65501, 65534]);
        for (let t = 65504; t < 65520; ++t) e.add(t);
        return {
          tableMarkers: e,
          sofMarkers: new Set([
            65472, 65473, 65474, 65475, 65477, 65478, 65479, 65481, 65482,
            65483, 65485, 65486, 65487, 65502,
          ]),
        };
      })();
      let i = 2;
      for (; i + 9 < t.byteLength; ) {
        const e = t.getUint16(i, lt);
        if (n.has(e))
          return {
            mimeType: "image/jpeg",
            height: t.getUint16(i + 5, lt),
            width: t.getUint16(i + 7, lt),
          };
        if (!r.has(e)) return null;
        ((i += 2), (i += t.getUint16(i, lt)));
      }
      return null;
    })(t) ||
    (function (e) {
      const t = dt(e);
      return t.byteLength >= 10 && 1195984440 === t.getUint32(0, lt)
        ? {
            mimeType: "image/gif",
            width: t.getUint16(6, ut),
            height: t.getUint16(8, ut),
          }
        : null;
    })(t) ||
    (function (e) {
      const t = dt(e);
      return t.byteLength >= 14 &&
        16973 === t.getUint16(0, lt) &&
        t.getUint32(2, ut) === t.byteLength
        ? {
            mimeType: "image/bmp",
            width: t.getUint32(18, ut),
            height: t.getUint32(22, ut),
          }
        : null;
    })(t) ||
    (function (e) {
      const t =
        (function (e, t, r = 0) {
          const n = ((i = "ftyp"), [...i].map((e) => e.charCodeAt(0)));
          var i;
          for (let s = 0; s < n.length; ++s) if (n[s] !== e[s + r]) return !1;
          return !0;
        })((r = new Uint8Array(e instanceof DataView ? e.buffer : e)), 0, 4) &&
        96 & r[8]
          ? (function (e) {
              switch (
                ((t = e), String.fromCharCode(...t.slice(8, 12)))
                  .replace("\0", " ")
                  .trim()
              ) {
                case "avif":
                case "avis":
                  return { extension: "avif", mimeType: "image/avif" };
                default:
                  return null;
              }
              var t;
            })(r)
          : null;
      var r;
      return t ? { mimeType: t.mimeType, width: 0, height: 0 } : null;
    })(t)
  );
}
function dt(e) {
  if (e instanceof DataView) return e;
  if (ArrayBuffer.isView(e)) return new DataView(e.buffer);
  if (e instanceof ArrayBuffer) return new DataView(e);
  throw new Error("toDataView");
}
var ft = {
  dataType: null,
  batchType: null,
  id: "image",
  module: "images",
  name: "Images",
  version: "4.4.2",
  mimeTypes: [
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
    "image/avif",
    "image/bmp",
    "image/vnd.microsoft.icon",
    "image/svg+xml",
  ],
  extensions: [
    "png",
    "jpg",
    "jpeg",
    "gif",
    "webp",
    "bmp",
    "ico",
    "svg",
    "avif",
  ],
  parse: async function (e, r, n) {
    const i = ((r = r || {}).image || {}).type || "auto",
      { url: s } = n || {};
    let o;
    switch (
      (function (e) {
        switch (e) {
          case "auto":
          case "data":
            return (function () {
              if (tt) return "imagebitmap";
              if (et) return "image";
              if (rt) return "data";
              throw new Error(
                "Install '@loaders.gl/polyfills' to parse images under Node.js",
              );
            })();
          default:
            return (
              (function (e) {
                switch (e) {
                  case "auto":
                    return tt || et || rt;
                  case "imagebitmap":
                    return tt;
                  case "image":
                    return et;
                  case "data":
                    return rt;
                  default:
                    throw new Error(
                      `@loaders.gl/images: image ${e} not supported in this environment`,
                    );
                }
              })(e),
              e
            );
        }
      })(i)
    ) {
      case "imagebitmap":
        o = await (async function (e, t, r) {
          let n;
          n = st(r) ? await at(e, t, r) : ot(e, r);
          const i = t && t.imagebitmap;
          return await (async function (e, t = null) {
            if (
              ((!(function (e) {
                if (!e) return !0;
                for (const t in e)
                  if (Object.prototype.hasOwnProperty.call(e, t)) return !1;
                return !0;
              })(t) &&
                ct) ||
                (t = null),
              t)
            )
              try {
                return await createImageBitmap(e, t);
              } catch (r) {
                ct = !1;
              }
            return await createImageBitmap(e);
          })(n, i);
        })(e, r, s);
        break;
      case "image":
        o = await at(e, r, s);
        break;
      case "data":
        o = await (async function (e) {
          const { mimeType: r } = ht(e) || {},
            n = globalThis.loaders?.parseImageNode;
          return (t(n), await n(e, r));
        })(e);
        break;
      default:
        t(!1);
    }
    return (
      "data" === i &&
        (o = (function (e) {
          switch (
            (function (e) {
              const t = (function (e) {
                return "undefined" != typeof ImageBitmap &&
                  e instanceof ImageBitmap
                  ? "imagebitmap"
                  : "undefined" != typeof Image && e instanceof Image
                    ? "image"
                    : e && "object" == typeof e && e.data && e.width && e.height
                      ? "data"
                      : null;
              })(e);
              if (!t) throw new Error("Not an image");
              return t;
            })(e)
          ) {
            case "data":
              return e;
            case "image":
            case "imagebitmap":
              const t = document.createElement("canvas"),
                r = t.getContext("2d");
              if (!r) throw new Error("getImageData");
              return (
                (t.width = e.width),
                (t.height = e.height),
                r.drawImage(e, 0, 0),
                r.getImageData(0, 0, e.width, e.height)
              );
            default:
              throw new Error("getImageData");
          }
        })(o)),
      o
    );
  },
  tests: [(e) => Boolean(ht(new DataView(e)))],
  options: { image: { type: "auto", decode: !0 } },
};
function pt(e, t) {
  if (!e) {
    const e = new Error(t || "shadertools: assertion failed.");
    throw (Error.captureStackTrace?.(e, pt), e);
  }
}
var gt = {
  number: {
    type: "number",
    validate: (e, t) =>
      Number.isFinite(e) &&
      "object" == typeof t &&
      (void 0 === t.max || e <= t.max) &&
      (void 0 === t.min || e >= t.min),
  },
  array: {
    type: "array",
    validate: (e, t) => Array.isArray(e) || ArrayBuffer.isView(e),
  },
};
function mt(e) {
  let t = _t(e);
  if ("object" !== t) return { value: e, ...gt[t], type: t };
  if ("object" == typeof e)
    return e
      ? void 0 !== e.type
        ? { ...e, ...gt[e.type], type: e.type }
        : void 0 === e.value
          ? { type: "object", value: e }
          : ((t = _t(e.value)), { ...e, ...gt[t], type: t })
      : { type: "object", value: null };
  throw new Error("props");
}
function _t(e) {
  return Array.isArray(e) || ArrayBuffer.isView(e) ? "array" : typeof e;
}
var Et = {
    vertex:
      "#ifdef MODULE_LOGDEPTH\n  logdepth_adjustPosition(gl_Position);\n#endif\n",
    fragment:
      "#ifdef MODULE_MATERIAL\n  fragColor = material_filterColor(fragColor);\n#endif\n\n#ifdef MODULE_LIGHTING\n  fragColor = lighting_filterColor(fragColor);\n#endif\n\n#ifdef MODULE_FOG\n  fragColor = fog_filterColor(fragColor);\n#endif\n\n#ifdef MODULE_PICKING\n  fragColor = picking_filterHighlightColor(fragColor);\n  fragColor = picking_filterPickingColor(fragColor);\n#endif\n\n#ifdef MODULE_LOGDEPTH\n  logdepth_setFragDepth();\n#endif\n",
  },
  bt = /void\s+main\s*\([^)]*\)\s*\{\n?/,
  yt = /}\n?[^{}]*$/,
  Tt = [],
  At = "__LUMA_INJECT_DECLARATIONS__";
function Rt(e) {
  const t = { vertex: {}, fragment: {} };
  for (const r in e) {
    let n = e[r];
    ("string" == typeof n && (n = { order: 0, injection: n }),
      (t[vt(r)][r] = n));
  }
  return t;
}
function vt(e) {
  const t = e.slice(0, 2);
  switch (t) {
    case "vs":
      return "vertex";
    case "fs":
      return "fragment";
    default:
      throw new Error(t);
  }
}
function St(e, t, r, n = !1) {
  const i = "vertex" === t;
  for (const s in r) {
    const t = r[s];
    (t.sort((e, t) => e.order - t.order), (Tt.length = t.length));
    for (let e = 0, r = t.length; e < r; ++e) Tt[e] = t[e].injection;
    const n = `${Tt.join("\n")}\n`;
    switch (s) {
      case "vs:#decl":
        i && (e = e.replace(At, n));
        break;
      case "vs:#main-start":
        i && (e = e.replace(bt, (e) => e + n));
        break;
      case "vs:#main-end":
        i && (e = e.replace(yt, (e) => n + e));
        break;
      case "fs:#decl":
        i || (e = e.replace(At, n));
        break;
      case "fs:#main-start":
        i || (e = e.replace(bt, (e) => e + n));
        break;
      case "fs:#main-end":
        i || (e = e.replace(yt, (e) => n + e));
        break;
      default:
        e = e.replace(s, (e) => e + n);
    }
  }
  return (
    (e = e.replace(At, "")),
    n && (e = e.replace(/\}\s*$/, (e) => e + Et[t])),
    e
  );
}
function Ct(e) {
  e.map((e) =>
    (function (e) {
      if (e.instance) return;
      Ct(e.dependencies || []);
      const { propTypes: t = {}, deprecations: r = [], inject: n = {} } = e,
        i = { normalizedInjections: Rt(n), parsedDeprecations: Lt(r) };
      (t &&
        (i.propValidators = (function (e) {
          const t = {};
          for (const [r, n] of Object.entries(e)) t[r] = mt(n);
          return t;
        })(t)),
        (e.instance = i));
      let s = {};
      (t &&
        (s = Object.entries(t).reduce((e, [t, r]) => {
          const n = r?.value;
          return (n && (e[t] = n), e);
        }, {})),
        (e.defaultUniforms = { ...e.defaultUniforms, ...s }));
    })(e),
  );
}
function wt(e, t, r) {
  e.deprecations?.forEach((e) => {
    e.regex?.test(t) &&
      (e.deprecated ? r.deprecated(e.old, e.new)() : r.removed(e.old, e.new)());
  });
}
function Lt(e) {
  return (
    e.forEach((e) => {
      "function" === e.type
        ? (e.regex = new RegExp(`\\b${e.old}\\(`))
        : (e.regex = new RegExp(`${e.type} ${e.old};`));
    }),
    e
  );
}
function Ot(e) {
  Ct(e);
  const t = {},
    r = {};
  Nt({ modules: e, level: 0, moduleMap: t, moduleDepth: r });
  const n = Object.keys(r)
    .sort((e, t) => r[t] - r[e])
    .map((e) => t[e]);
  return (Ct(n), n);
}
function Nt(e) {
  const { modules: t, level: r, moduleMap: n, moduleDepth: i } = e;
  if (r >= 5) throw new Error("Possible loop in shader dependency graph");
  for (const s of t)
    ((n[s.name] = s),
      (void 0 === i[s.name] || i[s.name] < r) && (i[s.name] = r));
  for (const s of t)
    s.dependencies &&
      Nt({
        modules: s.dependencies,
        level: r + 1,
        moduleMap: n,
        moduleDepth: i,
      });
}
var xt =
    /^(?:uniform\s+)?(?:(?:lowp|mediump|highp)\s+)?[A-Za-z0-9_]+(?:<[^>]+>)?\s+([A-Za-z0-9_]+)(?:\s*\[[^\]]+\])?\s*;/,
  Pt =
    /((?:layout\s*\([^)]*\)\s*)*)uniform\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{([\s\S]*?)\}\s*([A-Za-z_][A-Za-z0-9_]*)?\s*;/g;
function It(e) {
  return `${e.name}Uniforms`;
}
function Mt(e, t, r = {}) {
  const n = (function (e, t) {
    const r = Object.keys(e.uniformTypes || {});
    if (!r.length) return null;
    const n = (function (e, t) {
      const r = "wgsl" === t ? e.source : "vertex" === t ? e.vs : e.fs;
      return r
        ? (function (e, t, r) {
            const n =
              "wgsl" === t
                ? (function (e, t) {
                    const r = new RegExp(`\\bstruct\\s+${t}\\b`, "m").exec(e);
                    if (!r) return null;
                    const n = e.indexOf("{", r.index);
                    if (n < 0) return null;
                    let i = 0;
                    for (let s = n; s < e.length; s++) {
                      const t = e[s];
                      if ("{" !== t) {
                        if ("}" === t && (i--, 0 === i))
                          return e.slice(n + 1, s);
                      } else i++;
                    }
                    return null;
                  })(e, r)
                : (function (e, t) {
                    return Bt(e).find((e) => e.blockName === t)?.body || null;
                  })(e, r);
            if (!n) return null;
            const i = [];
            for (const s of n.split("\n")) {
              const e = s.replace(/\/\/.*$/, "").trim();
              if (!e || e.startsWith("#")) continue;
              const r =
                "wgsl" === t ? e.match(/^([A-Za-z0-9_]+)\s*:/) : e.match(xt);
              r && i.push(r[1]);
            }
            return i;
          })(r, "wgsl" === t ? "wgsl" : "glsl", It(e))
        : null;
    })(e, t);
    return n
      ? {
          moduleName: e.name,
          uniformBlockName: It(e),
          stage: t,
          expectedUniformNames: r,
          actualUniformNames: n,
          matches: Dt(r, n),
        }
      : null;
  })(e, t);
  if (!n || n.matches) return n;
  const i = (function (e) {
    const { expectedUniformNames: t, actualUniformNames: r } = e,
      n = t.filter((e) => !r.includes(e)),
      i = r.filter((e) => !t.includes(e)),
      s = [`Expected ${t.length} fields, found ${r.length}.`],
      o = (function (e, t) {
        const r = Math.min(e.length, t.length);
        for (let n = 0; n < r; n++)
          if (e[n] !== t[n])
            return `First mismatch at field ${n + 1}: expected ${e[n]}, found ${t[n]}.`;
        return e.length > t.length
          ? `Shader block ends after field ${t.length}; expected next field ${e[t.length]}.`
          : t.length > e.length
            ? `Shader block has extra field ${t.length}: ${t[e.length]}.`
            : null;
      })(t, r);
    return (
      o && s.push(o),
      n.length && s.push(`Missing from shader block (${n.length}): ${Ut(n)}.`),
      i.length && s.push(`Unexpected in shader block (${i.length}): ${Ut(i)}.`),
      t.length <= 12 &&
        r.length <= 12 &&
        (n.length || i.length) &&
        (s.push(`Expected: ${t.join(", ")}.`),
        s.push(`Actual: ${r.join(", ")}.`)),
      `${e.moduleName}: ${e.stage} shader uniform block ${e.uniformBlockName} does not match module.uniformTypes. ${s.join(" ")}`
    );
  })(n);
  return (r.log?.error?.(i, n)(), !1 !== r.throwOnError && pt(!1, i), n);
}
function Bt(e) {
  const t = [],
    r = (function (e) {
      return e.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    })(e);
  for (const n of r.matchAll(Pt)) {
    const e = n[1]?.trim() || null;
    t.push({
      blockName: n[2],
      body: n[3],
      instanceName: n[4] || null,
      layoutQualifier: e,
      hasLayoutQualifier: Boolean(e),
      isStd140: Boolean(e && /\blayout\s*\([^)]*\bstd140\b[^)]*\)/.exec(e)),
    });
  }
  return t;
}
function Dt(e, t) {
  if (e.length !== t.length) return !1;
  for (let r = 0; r < e.length; r++) if (e[r] !== t[r]) return !1;
  return !0;
}
function Ft(e) {
  return e.replace(/\s+/g, " ").trim();
}
function Ut(e, t = 8) {
  if (e.length <= t) return e.join(", ");
  const r = e.length - t;
  return `${e.slice(0, t).join(", ")}, ... (${r} more)`;
}
var Gt = [
    [/^(#version[ \t]+(100|300[ \t]+es))?[ \t]*\n/, "#version 300 es\n"],
    [/\btexture(2D|2DProj|Cube)Lod(EXT)?\(/g, "textureLod("],
    [/\btexture(2D|2DProj|Cube)(EXT)?\(/g, "texture("],
  ],
  kt = [...Gt, [Ht("attribute"), "in $1"], [Ht("varying"), "out $1"]],
  Wt = [...Gt, [Ht("varying"), "in $1"]];
function $t(e, t) {
  for (const [r, n] of t) e = e.replace(r, n);
  return e;
}
function Ht(e) {
  return new RegExp(`\\b${e}[ \\t]+(\\w+[ \\t]+\\w+(\\[\\w+\\])?;)`, "g");
}
function Vt(e, t) {
  let r = "";
  for (const n in e) {
    const i = e[n];
    if (
      ((r += `void ${i.signature} {\n`),
      i.header && (r += `  ${i.header}`),
      t[n])
    ) {
      const e = t[n];
      e.sort((e, t) => e.order - t.order);
      for (const t of e) r += `  ${t.injection}\n`;
    }
    (i.footer && (r += `  ${i.footer}`), (r += "}\n"));
  }
  return r;
}
function zt(e) {
  const t = { vertex: {}, fragment: {} };
  for (const r of e) {
    let e, n;
    ("string" != typeof r ? ((e = r), (n = e.hook)) : ((e = {}), (n = r)),
      (n = n.trim()));
    const [i, s] = n.split(":"),
      o = n.replace(/\(.+/, ""),
      a = Object.assign(e, { signature: s });
    switch (i) {
      case "vs":
        t.vertex[o] = a;
        break;
      case "fs":
        t.fragment[o] = a;
        break;
      default:
        throw new Error(i);
    }
  }
  return t;
}
function Xt(e, t = "unnamed") {
  const r = /#define[^\S\r\n]*SHADER_NAME[^\S\r\n]*([A-Za-z0-9_-]+)\s*/.exec(e);
  return r ? r[1] : t;
}
function jt(e) {
  let t = 100;
  const r = e.match(/[^\s]+/g);
  if (r && r.length >= 2 && "#version" === r[0]) {
    const e = parseInt(r[1], 10);
    Number.isFinite(e) && (t = e);
  }
  if (100 !== t && 300 !== t) throw new Error(`Invalid GLSL version ${t}`);
  return t;
}
var Kt =
    "(?:var<\\s*(uniform|storage(?:\\s*,\\s*[A-Za-z_][A-Za-z0-9_]*)?)\\s*>|var)\\s+([A-Za-z_][A-Za-z0-9_]*)",
  Yt = "\\s*",
  Qt = [
    new RegExp(
      `@binding\\(\\s*(auto|\\d+)\\s*\\)${Yt}@group\\(\\s*(\\d+)\\s*\\)${Yt}${Kt}`,
      "g",
    ),
    new RegExp(
      `@group\\(\\s*(\\d+)\\s*\\)${Yt}@binding\\(\\s*(auto|\\d+)\\s*\\)${Yt}${Kt}`,
      "g",
    ),
  ],
  qt = [
    new RegExp(
      `@binding\\(\\s*(auto|\\d+)\\s*\\)${Yt}@group\\(\\s*(\\d+)\\s*\\)${Yt}${Kt}`,
      "g",
    ),
    new RegExp(
      `@group\\(\\s*(\\d+)\\s*\\)${Yt}@binding\\(\\s*(auto|\\d+)\\s*\\)${Yt}${Kt}`,
      "g",
    ),
  ],
  Zt = [
    new RegExp(
      `@binding\\(\\s*(\\d+)\\s*\\)${Yt}@group\\(\\s*(\\d+)\\s*\\)${Yt}${Kt}`,
      "g",
    ),
    new RegExp(
      `@group\\(\\s*(\\d+)\\s*\\)${Yt}@binding\\(\\s*(\\d+)\\s*\\)${Yt}${Kt}`,
      "g",
    ),
  ],
  Jt = [
    new RegExp(
      `@binding\\(\\s*(auto)\\s*\\)\\s*@group\\(\\s*(\\d+)\\s*\\)\\s*${Kt}`,
      "g",
    ),
    new RegExp(
      `@group\\(\\s*(\\d+)\\s*\\)\\s*@binding\\(\\s*(auto)\\s*\\)\\s*${Kt}`,
      "g",
    ),
    new RegExp(
      `@binding\\(\\s*(auto)\\s*\\)\\s*@group\\(\\s*(\\d+)\\s*\\)(?:[\\s\\n\\r]*@[A-Za-z_][^\\n\\r]*)*[\\s\\n\\r]*${Kt}`,
      "g",
    ),
    new RegExp(
      `@group\\(\\s*(\\d+)\\s*\\)\\s*@binding\\(\\s*(auto)\\s*\\)(?:[\\s\\n\\r]*@[A-Za-z_][^\\n\\r]*)*[\\s\\n\\r]*${Kt}`,
      "g",
    ),
  ];
function er(e) {
  const t = e.split("");
  let r = 0,
    n = 0,
    i = !1,
    s = !1,
    o = !1;
  for (; r < e.length; ) {
    const a = e[r],
      c = e[r + 1];
    if (s) (o ? (o = !1) : "\\" === a ? (o = !0) : '"' === a && (s = !1), r++);
    else if (i) ("\n" === a || "\r" === a ? (i = !1) : (t[r] = " "), r++);
    else if (n > 0) {
      if ("/" === a && "*" === c) {
        ((t[r] = " "), (t[r + 1] = " "), n++, (r += 2));
        continue;
      }
      if ("*" === a && "/" === c) {
        ((t[r] = " "), (t[r + 1] = " "), n--, (r += 2));
        continue;
      }
      ("\n" !== a && "\r" !== a && (t[r] = " "), r++);
    } else
      '"' !== a
        ? "/" !== a || "/" !== c
          ? "/" !== a || "*" !== c
            ? r++
            : ((t[r] = " "), (t[r + 1] = " "), (n = 1), (r += 2))
          : ((t[r] = " "), (t[r + 1] = " "), (i = !0), (r += 2))
        : ((s = !0), r++);
  }
  return t.join("");
}
function tr(e, t) {
  const r = er(e),
    n = [];
  for (const i of t) {
    let s;
    for (i.lastIndex = 0, s = i.exec(r); s; ) {
      const o = i === t[0],
        a = s.index,
        c = s[0].length;
      (n.push({
        match: e.slice(a, a + c),
        index: a,
        length: c,
        bindingToken: s[o ? 1 : 2],
        groupToken: s[o ? 2 : 1],
        accessDeclaration: s[3]?.trim(),
        name: s[4],
      }),
        (s = i.exec(r)));
    }
  }
  return n.sort((e, t) => e.index - t.index);
}
function rr(e, t, r) {
  const n = tr(e, t);
  if (!n.length) return e;
  let i = "",
    s = 0;
  for (const o of n)
    ((i += e.slice(s, o.index)), (i += r(o)), (s = o.index + o.length));
  return ((i += e.slice(s)), i);
}
function nr(e) {
  return /@binding\(\s*auto\s*\)/.test(er(e));
}
var ir = [
  new RegExp(
    `@binding\\(\\s*(\\d+)\\s*\\)\\s*@group\\(\\s*(\\d+)\\s*\\)\\s*${Kt}\\s*:\\s*([^;]+);`,
    "g",
  ),
  new RegExp(
    `@group\\(\\s*(\\d+)\\s*\\)\\s*@binding\\(\\s*(\\d+)\\s*\\)\\s*${Kt}\\s*:\\s*([^;]+);`,
    "g",
  ),
];
function sr(e, t = []) {
  const r = er(e),
    n = new Map();
  for (const s of t) n.set(ar(s.name, s.group, s.location), s.moduleName);
  const i = [];
  for (const s of ir) {
    let e;
    for (s.lastIndex = 0, e = s.exec(r); e; ) {
      const t = s === ir[0],
        o = Number(e[t ? 1 : 2]),
        a = Number(e[t ? 2 : 1]),
        c = e[3]?.trim(),
        l = e[4],
        u = e[5].trim(),
        h = n.get(ar(l, a, o));
      (i.push(
        or({
          name: l,
          group: a,
          binding: o,
          owner: h ? "module" : "application",
          moduleName: h,
          accessDeclaration: c,
          resourceType: u,
        }),
      ),
        (e = s.exec(r)));
    }
  }
  return i.sort((e, t) =>
    e.group !== t.group
      ? e.group - t.group
      : e.binding !== t.binding
        ? e.binding - t.binding
        : e.name.localeCompare(t.name),
  );
}
function or(e) {
  const t = {
    name: e.name,
    group: e.group,
    binding: e.binding,
    owner: e.owner,
    kind: "unknown",
    moduleName: e.moduleName,
    resourceType: e.resourceType,
  };
  if (e.accessDeclaration) {
    const r = e.accessDeclaration.split(",").map((e) => e.trim());
    if ("uniform" === r[0]) return { ...t, kind: "uniform", access: "uniform" };
    if ("storage" === r[0]) {
      const e = r[1] || "read_write";
      return {
        ...t,
        kind: "read" === e ? "read-only-storage" : "storage",
        access: e,
      };
    }
  }
  return "sampler" === e.resourceType || "sampler_comparison" === e.resourceType
    ? {
        ...t,
        kind: "sampler",
        samplerKind:
          "sampler_comparison" === e.resourceType ? "comparison" : "filtering",
      }
    : e.resourceType.startsWith("texture_storage_")
      ? {
          ...t,
          kind: "storage-texture",
          access:
            ((r = e.resourceType),
            /,\s*([A-Za-z_][A-Za-z0-9_]*)\s*>$/.exec(r)?.[1]),
          viewDimension: cr(e.resourceType),
        }
      : e.resourceType.startsWith("texture_")
        ? {
            ...t,
            kind: "texture",
            viewDimension: cr(e.resourceType),
            sampleType: lr(e.resourceType),
            multisampled: e.resourceType.startsWith("texture_multisampled_"),
          }
        : t;
  var r;
}
function ar(e, t, r) {
  return `${t}:${r}:${e}`;
}
function cr(e) {
  return e.includes("cube_array")
    ? "cube-array"
    : e.includes("2d_array")
      ? "2d-array"
      : e.includes("cube")
        ? "cube"
        : e.includes("3d")
          ? "3d"
          : e.includes("2d")
            ? "2d"
            : e.includes("1d")
              ? "1d"
              : void 0;
}
function lr(e) {
  return e.startsWith("texture_depth_")
    ? "depth"
    : e.includes("<i32>")
      ? "sint"
      : e.includes("<u32>")
        ? "uint"
        : e.includes("<f32>")
          ? "float"
          : void 0;
}
var ur = `\n\n${At}\n`;
function hr(e) {
  const { vs: t, fs: r } = e,
    n = Ot(e.modules || []);
  return {
    vs: dr(e.platformInfo, { ...e, source: t, stage: "vertex", modules: n }),
    fs: dr(e.platformInfo, { ...e, source: r, stage: "fragment", modules: n }),
    getUniforms: fr(n),
  };
}
function dr(e, t) {
  const {
    source: r,
    stage: n,
    language: i = "glsl",
    modules: s,
    defines: o = {},
    hookFunctions: a = [],
    inject: c = {},
    prologue: l = !0,
    log: u,
  } = t;
  pt("string" == typeof r, "shader source must be a string");
  const h =
      "glsl" === i
        ? (function (e) {
            return { name: Xt(e, void 0), language: "glsl", version: jt(e) };
          })(r).version
        : -1,
    d = e.shaderLanguageVersion,
    f = 100 === h ? "#version 100" : "#version 300 es",
    p = r.split("\n").slice(1).join("\n"),
    g = {};
  (s.forEach((e) => {
    Object.assign(g, e.defines);
  }),
    Object.assign(g, o));
  let m = "";
  switch (i) {
    case "wgsl":
      break;
    case "glsl":
      m = l
        ? `${f}\n\n// ----- PROLOGUE -------------------------\n#define SHADER_TYPE_${n.toUpperCase()}\n\n${(function (
            e,
          ) {
            switch (e?.gpu.toLowerCase()) {
              case "apple":
                return "#define APPLE_GPU\n// Apple optimizes away the calculation necessary for emulated fp64\n#define LUMA_FP64_CODE_ELIMINATION_WORKAROUND 1\n#define LUMA_FP32_TAN_PRECISION_WORKAROUND 1\n// Intel GPU doesn't have full 32 bits precision in same cases, causes overflow\n#define LUMA_FP64_HIGH_BITS_OVERFLOW_WORKAROUND 1\n";
              case "nvidia":
                return "#define NVIDIA_GPU\n// Nvidia optimizes away the calculation necessary for emulated fp64\n#define LUMA_FP64_CODE_ELIMINATION_WORKAROUND 1\n";
              case "intel":
                return "#define INTEL_GPU\n// Intel optimizes away the calculation necessary for emulated fp64\n#define LUMA_FP64_CODE_ELIMINATION_WORKAROUND 1\n// Intel's built-in 'tan' function doesn't have acceptable precision\n#define LUMA_FP32_TAN_PRECISION_WORKAROUND 1\n// Intel GPU doesn't have full 32 bits precision in same cases, causes overflow\n#define LUMA_FP64_HIGH_BITS_OVERFLOW_WORKAROUND 1\n";
              case "amd":
                return "#define AMD_GPU\n";
              default:
                return "#define DEFAULT_GPU\n// Prevent driver from optimizing away the calculation necessary for emulated fp64\n#define LUMA_FP64_CODE_ELIMINATION_WORKAROUND 1\n// Headless Chrome's software shader 'tan' function doesn't have acceptable precision\n#define LUMA_FP32_TAN_PRECISION_WORKAROUND 1\n// If the GPU doesn't have full 32 bits precision, will causes overflow\n#define LUMA_FP64_HIGH_BITS_OVERFLOW_WORKAROUND 1\n";
            }
          })(
            e,
          )}\n${"fragment" === n ? "precision highp float;\n" : ""}\n\n// ----- APPLICATION DEFINES -------------------------\n\n${(function (
            e = {},
          ) {
            let t = "";
            for (const r in e) {
              const n = e[r];
              (n || Number.isFinite(n)) &&
                (t += `#define ${r.toUpperCase()} ${e[r]}\n`);
            }
            return t;
          })(g)}\n\n`
        : `${f}\n`;
  }
  const _ = zt(a),
    E = {},
    b = {},
    y = {};
  for (const T in c) {
    const e = "string" == typeof c[T] ? { injection: c[T], order: 0 } : c[T],
      t = /^(v|f)s:(#)?([\w-]+)$/.exec(T);
    if (t) {
      const r = t[2],
        n = t[3];
      r ? ("decl" === n ? (b[T] = [e]) : (y[T] = [e])) : (E[T] = [e]);
    } else y[T] = [e];
  }
  for (const T of s) {
    (u && wt(T, p, u), (m += pr(T, n, u)));
    const e = T.instance?.normalizedInjections[n] || {};
    for (const t in e) {
      const r = /^(v|f)s:#([\w-]+)$/.exec(t);
      if (r) {
        const n = "decl" === r[2] ? b : y;
        ((n[t] = n[t] || []), n[t].push(e[t]));
      } else ((E[t] = E[t] || []), E[t].push(e[t]));
    }
  }
  return (
    (m += "// ----- MAIN SHADER SOURCE -------------------------"),
    (m += ur),
    (m = St(m, n, b)),
    (m += Vt(_[n], E)),
    (m += p),
    (m = St(m, n, y)),
    "glsl" === i &&
      h !== d &&
      (m = (function (e, t) {
        if (300 !== Number(e.match(/^#version[ \t]+(\d+)/m)?.[1] || 100))
          throw new Error("luma.gl v9 only supports GLSL 3.00 shader sources");
        switch (t) {
          case "vertex":
            return $t(e, kt);
          case "fragment":
            return $t(e, Wt);
          default:
            throw new Error(t);
        }
      })(m, n)),
    "glsl" === i &&
      (function (e, t, r) {
        const n = Bt(e).filter((e) => !e.isStd140),
          i = new Set();
        for (const s of n) {
          if (i.has(s.blockName)) continue;
          i.add(s.blockName);
          const e = "",
            n = s.hasLayoutQualifier
              ? `declares ${Ft(s.layoutQualifier)} instead of layout(std140)`
              : "does not declare layout(std140)",
            o = `${e}${t} shader uniform block ${s.blockName} ${n}. luma.gl host-side shader block packing assumes explicit layout(std140) for GLSL uniform blocks. Add \`layout(std140)\` to the block declaration.`;
          r?.warn?.(o, s)();
        }
      })(m, n, u),
    m.trim()
  );
}
function fr(e) {
  return function (t) {
    const r = {};
    for (const n of e) {
      const e = n.getUniforms?.(t, r);
      Object.assign(r, e);
    }
    return r;
  };
}
function pr(e, t, r) {
  let n;
  switch (t) {
    case "vertex":
      n = e.vs || "";
      break;
    case "fragment":
      n = e.fs || "";
      break;
    case "wgsl":
      n = e.source || "";
      break;
    default:
      pt(!1);
  }
  if (!e.name) throw new Error("Shader module must have a name");
  Mt(e, t, { log: r });
  const i = e.name.toUpperCase().replace(/[^0-9a-z]/gi, "_");
  let s = `// ----- MODULE ${e.name} ---------------\n\n`;
  return ("wgsl" !== t && (s += `#define MODULE_${i}\n`), (s += `${n}\n`), s);
}
function gr(e, t, r) {
  const n = [],
    i = {
      sawSupportedBindingDeclaration: tr(e, Qt).length > 0,
      nextHintedBindingLocation:
        "number" == typeof t.firstBindingSlot ? t.firstBindingSlot : null,
    },
    s = rr(e, Qt, (e) =>
      (function (e, t) {
        const {
            module: r,
            context: n,
            bindingAssignments: i,
            relocationState: s,
          } = t,
          { match: o, bindingToken: a, groupToken: c, name: l } = e,
          u = Number(c);
        if ("auto" === a) {
          const e = Tr(u, r.name, l),
            t = n.bindingRegistry?.get(e),
            a =
              void 0 !== t
                ? t
                : null === s.nextHintedBindingLocation
                  ? yr(u, n.usedBindingsByGroup)
                  : yr(u, n.usedBindingsByGroup, s.nextHintedBindingLocation);
          return (
            Er(r.name, u, a, l),
            void 0 !== t &&
            (function (e, t, r, n) {
              const i = e.get(t);
              if (!i) return !1;
              const s = i.get(r);
              if (!s) return !1;
              if (s !== n)
                throw new Error(
                  `Registered module binding "${n}" collided with "${s}": group ${t}, binding ${r}.`,
                );
              return !0;
            })(n.reservedBindingKeysByGroup, u, a, e)
              ? (i.push({ moduleName: r.name, name: l, group: u, location: a }),
                o.replace(/@binding\(\s*auto\s*\)/, `@binding(${a})`))
              : (br(
                  n.usedBindingsByGroup,
                  u,
                  a,
                  `module "${r.name}" binding "${l}"`,
                ),
                n.bindingRegistry?.set(e, a),
                i.push({ moduleName: r.name, name: l, group: u, location: a }),
                null !== s.nextHintedBindingLocation &&
                  void 0 === t &&
                  (s.nextHintedBindingLocation = a + 1),
                o.replace(/@binding\(\s*auto\s*\)/, `@binding(${a})`))
          );
        }
        const h = Number(a);
        return (
          Er(r.name, u, h, l),
          br(n.usedBindingsByGroup, u, h, `module "${r.name}" binding "${l}"`),
          i.push({ moduleName: r.name, name: l, group: u, location: h }),
          o
        );
      })(e, {
        module: t,
        context: r,
        bindingAssignments: n,
        relocationState: i,
      }),
    );
  if (nr(e) && !i.sawSupportedBindingDeclaration)
    throw new Error(
      `Unsupported @binding(auto) declaration form in module "${t.name}". Use adjacent "@group(N)" and "@binding(auto)" decorators followed by a bindable "var" declaration.`,
    );
  return { source: s, bindingAssignments: n };
}
function mr(e) {
  const t = [],
    r = e.source || "";
  for (const n of tr(r, Qt))
    t.push({ name: n.name, group: Number(n.groupToken) });
  return t;
}
function _r(e, t, r) {
  if (0 === e && t >= 100)
    throw new Error(
      `Application binding "${r}" in group 0 uses reserved binding ${t}. Application-owned explicit group-0 bindings must stay below 100.`,
    );
}
function Er(e, t, r, n) {
  if (0 === t && r < 100)
    throw new Error(
      `Module "${e}" binding "${n}" in group 0 uses reserved application binding ${r}. Module-owned explicit group-0 bindings must be 100 or higher.`,
    );
}
function br(e, t, r, n) {
  const i = e.get(t) || new Set();
  if (i.has(r))
    throw new Error(
      `Duplicate WGSL binding assignment for ${n}: group ${t}, binding ${r}.`,
    );
  (i.add(r), e.set(t, i));
}
function yr(e, t, r) {
  const n = t.get(e) || new Set();
  let i = r ?? (0 === e ? 100 : n.size > 0 ? Math.max(...n) + 1 : 0);
  for (; n.has(i); ) i++;
  return i;
}
function Tr(e, t, r) {
  return `${e}:${t}:${r}`;
}
var Ar = "([a-zA-Z_][a-zA-Z0-9_]*)",
  Rr = new RegExp(`^\\s*\\#\\s*ifdef\\s*${Ar}\\s*$`),
  vr = new RegExp(`^\\s*\\#\\s*ifndef\\s*${Ar}\\s*(?:\\/\\/.*)?$`),
  Sr = /^\s*\#\s*else\s*(?:\/\/.*)?$/,
  Cr = /^\s*\#\s*endif\s*$/,
  wr = new RegExp(`^\\s*\\#\\s*ifdef\\s*${Ar}\\s*(?:\\/\\/.*)?$`),
  Lr = /^\s*\#\s*endif\s*(?:\/\/.*)?$/,
  Or = class e {
    static defaultShaderAssembler;
    _hookFunctions = [];
    _defaultModules = [];
    _wgslBindingRegistry = new Map();
    static getDefaultShaderAssembler() {
      return (
        (e.defaultShaderAssembler = e.defaultShaderAssembler || new e()),
        e.defaultShaderAssembler
      );
    }
    addDefaultModule(e) {
      this._defaultModules.find(
        (t) => t.name === ("string" == typeof e ? e : e.name),
      ) || this._defaultModules.push(e);
    }
    removeDefaultModule(e) {
      const t = "string" == typeof e ? e : e.name;
      this._defaultModules = this._defaultModules.filter((e) => e.name !== t);
    }
    addShaderHook(e, t) {
      (t && (e = Object.assign(t, { hook: e })), this._hookFunctions.push(e));
    }
    assembleWGSLShader(e) {
      const t = this._getModuleList(e.modules),
        r = this._hookFunctions,
        {
          source: n,
          getUniforms: i,
          bindingAssignments: s,
        } = (function (e) {
          const t = Ot(e.modules || []),
            { source: r, bindingAssignments: n } = (function (e, t) {
              const {
                source: r,
                stage: n,
                modules: i,
                hookFunctions: s = [],
                inject: o = {},
                log: a,
              } = t;
              pt("string" == typeof r, "shader source must be a string");
              const c = r;
              let l = "";
              const u = zt(s),
                h = {},
                d = {},
                f = {};
              for (const b in o) {
                const e =
                    "string" == typeof o[b]
                      ? { injection: o[b], order: 0 }
                      : o[b],
                  t = /^(v|f)s:(#)?([\w-]+)$/.exec(b);
                if (t) {
                  const r = t[2],
                    n = t[3];
                  r
                    ? "decl" === n
                      ? (d[b] = [e])
                      : (f[b] = [e])
                    : (h[b] = [e]);
                } else f[b] = [e];
              }
              const p = i,
                g = (function (e) {
                  const t = tr(e, qt),
                    r = new Map();
                  for (const s of t) {
                    if ("auto" === s.bindingToken) continue;
                    const e = Number(s.bindingToken),
                      t = Number(s.groupToken);
                    (_r(t, e, s.name),
                      br(r, t, e, `application binding "${s.name}"`));
                  }
                  const n = { sawSupportedBindingDeclaration: t.length > 0 },
                    i = rr(e, qt, (e) =>
                      (function (e, t, r) {
                        const {
                            match: n,
                            bindingToken: i,
                            groupToken: s,
                            name: o,
                          } = e,
                          a = Number(s);
                        if ("auto" === i) {
                          const e = (function (e, t) {
                            const r = t.get(e) || new Set();
                            let n = 0;
                            for (; r.has(n); ) n++;
                            return n;
                          })(a, t);
                          return (
                            _r(a, e, o),
                            br(t, a, e, `application binding "${o}"`),
                            n.replace(
                              /@binding\(\s*auto\s*\)/,
                              `@binding(${e})`,
                            )
                          );
                        }
                        return ((r.sawSupportedBindingDeclaration = !0), n);
                      })(e, r, n),
                    );
                  if (nr(e) && !n.sawSupportedBindingDeclaration)
                    throw new Error(
                      'Unsupported @binding(auto) declaration form in application WGSL. Use adjacent "@group(N)" and "@binding(auto)" decorators followed by a bindable "var" declaration.',
                    );
                  return { source: i };
                })(c),
                m = (function (e) {
                  const t = new Map();
                  for (const r of tr(e, Zt)) {
                    const e = Number(r.bindingToken),
                      n = Number(r.groupToken);
                    (_r(n, e, r.name),
                      br(t, n, e, `application binding "${r.name}"`));
                  }
                  return t;
                })(g.source),
                _ = (function (e, t, r) {
                  const n = new Map();
                  if (!t) return n;
                  for (const i of e)
                    for (const e of mr(i)) {
                      const s = Tr(e.group, i.name, e.name),
                        o = t.get(s);
                      if (void 0 !== o) {
                        const t = n.get(e.group) || new Map(),
                          i = t.get(o);
                        if (i && i !== s)
                          throw new Error(
                            `Duplicate WGSL binding reservation for modules "${i}" and "${s}": group ${e.group}, binding ${o}.`,
                          );
                        (br(r, e.group, o, `registered module binding "${s}"`),
                          t.set(o, s),
                          n.set(e.group, t));
                      }
                    }
                  return n;
                })(p, t._bindingRegistry, m),
                E = [];
              for (const b of p) {
                a && wt(b, c, a);
                const e = gr(pr(b, "wgsl", a), b, {
                  usedBindingsByGroup: m,
                  bindingRegistry: t._bindingRegistry,
                  reservedBindingKeysByGroup: _,
                });
                (E.push(...e.bindingAssignments), (l += e.source));
                const r = b.injections?.[n] || {};
                for (const t in r) {
                  const e = /^(v|f)s:#([\w-]+)$/.exec(t);
                  if (e) {
                    const n = "decl" === e[2] ? d : f;
                    ((n[t] = n[t] || []), n[t].push(r[t]));
                  } else ((h[t] = h[t] || []), h[t].push(r[t]));
                }
              }
              return (
                (l += ur),
                (l = St(l, n, d)),
                (l += Vt(u[n], h)),
                (l += (function (e) {
                  if (0 === e.length) return "";
                  let t =
                    "// ----- MODULE WGSL BINDING ASSIGNMENTS ---------------\n";
                  for (const r of e)
                    t += `// ${r.moduleName}.${r.name} -> @group(${r.group}) @binding(${r.location})\n`;
                  return ((t += "\n"), t);
                })(E)),
                (l += g.source),
                (l = St(l, n, f)),
                (function (e) {
                  const t = (function (e) {
                    return tr(e, Jt).find((e) => "auto" === e.bindingToken);
                  })(e);
                  if (!t) return;
                  const r = (function (e, t) {
                    const r = /^\/\/ ----- MODULE ([^\n]+) ---------------$/gm;
                    let n, i;
                    for (i = r.exec(e); i && i.index <= t; )
                      ((n = i[1]), (i = r.exec(e)));
                    return n;
                  })(e, t.index);
                  if (r)
                    throw new Error(
                      `Unresolved @binding(auto) for module "${r}" binding "${t.name}" remained in assembled WGSL source.`,
                    );
                  if (
                    (function (e, t) {
                      const r = e.indexOf(ur);
                      return !(r >= 0) || t > r;
                    })(e, t.index)
                  )
                    throw new Error(
                      `Unresolved @binding(auto) for application binding "${t.name}" remained in assembled WGSL source.`,
                    );
                  throw new Error(
                    `Unresolved @binding(auto) remained in assembled WGSL source near "${(function (
                      e,
                    ) {
                      return e.replace(/\s+/g, " ").trim();
                    })(t.match)}".`,
                  );
                })(l),
                { source: l, bindingAssignments: E }
              );
            })(e.platformInfo, {
              ...e,
              source: e.source,
              stage: "vertex",
              modules: t,
            });
          return {
            source: r,
            getUniforms: fr(t),
            bindingAssignments: n,
            bindingTable: sr(r, n),
          };
        })({
          ...e,
          source: e.source,
          _bindingRegistry: this._wgslBindingRegistry,
          modules: t,
          hookFunctions: r,
        }),
        o = {
          ...t.reduce((e, t) => (Object.assign(e, t.defines), e), {}),
          ...e.defines,
        },
        a =
          "wgsl" === e.platformInfo.shaderLanguage
            ? (function (e, t) {
                const r = e.split("\n"),
                  n = [],
                  i = [];
                let s = !0;
                for (const o of r) {
                  const e = o.match(wr) || o.match(Rr),
                    r = o.match(vr),
                    a = o.match(Sr),
                    c = o.match(Lr) || o.match(Cr);
                  if (e || r) {
                    const n = (e || r)?.[1],
                      o = Boolean(t?.defines?.[n]),
                      a = e ? o : !o,
                      c = s && a;
                    (i.push({ parentActive: s, branchTaken: a, active: c }),
                      (s = c));
                  } else if (a) {
                    const e = i[i.length - 1];
                    if (!e)
                      throw new Error(
                        "Encountered #else without matching #ifdef or #ifndef",
                      );
                    ((e.active = e.parentActive && !e.branchTaken),
                      (e.branchTaken = !0),
                      (s = e.active));
                  } else
                    c
                      ? (i.pop(), (s = !i.length || i[i.length - 1].active))
                      : s && n.push(o);
                }
                if (i.length > 0)
                  throw new Error(
                    "Unterminated conditional block in shader source",
                  );
                return n.join("\n");
              })(n, { defines: o })
            : n;
      return {
        source: a,
        getUniforms: i,
        modules: t,
        bindingAssignments: s,
        bindingTable: sr(a, s),
      };
    }
    assembleGLSLShaderPair(e) {
      const t = this._getModuleList(e.modules),
        r = this._hookFunctions;
      return {
        ...hr({ ...e, vs: e.vs, fs: e.fs, modules: t, hookFunctions: r }),
        modules: t,
      };
    }
    _getModuleList(e = []) {
      const t = new Array(this._defaultModules.length + e.length),
        r = {};
      let n = 0;
      for (let i = 0, s = this._defaultModules.length; i < s; ++i) {
        const e = this._defaultModules[i],
          s = e.name;
        ((t[n++] = e), (r[s] = !0));
      }
      for (let i = 0, s = e.length; i < s; ++i) {
        const s = e[i],
          o = s.name;
        r[o] || ((t[n++] = s), (r[o] = !0));
      }
      return ((t.length = n), Ct(t), t);
    }
  };
function Nr(e) {
  const { input: t, inputChannels: r, output: n } = e || {};
  if (!t)
    return "#version 300 es\nout vec4 transform_output;\nvoid main() {\n  transform_output = vec4(0);\n}";
  if (!r) throw new Error("inputChannels");
  return `#version 300 es\nin ${(function (e) {
    switch (e) {
      case 1:
        return "float";
      case 2:
        return "vec2";
      case 3:
        return "vec3";
      case 4:
        return "vec4";
      default:
        throw new Error(`invalid channels: ${e}`);
    }
  })(r)} ${t};\nout vec4 ${n};\nvoid main() {\n  ${n} = ${(function (e, t) {
    switch (t) {
      case 1:
        return `vec4(${e}, 0.0, 0.0, 1.0)`;
      case 2:
        return `vec4(${e}, 0.0, 1.0)`;
      case 3:
        return `vec4(${e}, 1.0)`;
      case 4:
        return e;
      default:
        throw new Error(`invalid channels: ${t}`);
    }
  })(t, r)};\n}`;
}
(Math.PI,
  Math.PI,
  (globalThis.mathgl = globalThis.mathgl || {
    config: {
      EPSILON: 1e-12,
      debug: !1,
      precision: 4,
      printTypes: !1,
      printDegrees: !1,
      printRowMajor: !0,
      _cartographicRadians: !1,
    },
  }));
var xr = globalThis.mathgl.config;
function Pr(e, { precision: t = xr.precision } = {}) {
  return (
    (e = (function (e) {
      return Math.round(e / xr.EPSILON) * xr.EPSILON;
    })(e)),
    `${parseFloat(e.toPrecision(t))}`
  );
}
function Ir(e) {
  return (
    Array.isArray(e) || (ArrayBuffer.isView(e) && !(e instanceof DataView))
  );
}
function Mr(e, t, r) {
  return (function (e, t, r) {
    if (Ir(e)) {
      const n = e;
      r =
        r ||
        (function (e) {
          return e.clone ? e.clone() : new Array(e.length);
        })(n);
      for (let i = 0; i < r.length && i < n.length; ++i) {
        const n = "number" == typeof e ? e : e[i];
        r[i] = t(n);
      }
      return r;
    }
    return t(e);
  })(e, (e) => Math.max(t, Math.min(r, e)));
}
function Br(e, t, r) {
  return Ir(e) ? e.map((e, n) => Br(e, t[n], r)) : r * t + (1 - r) * e;
}
function Dr(e, t, r) {
  const n = xr.EPSILON;
  r && (xr.EPSILON = r);
  try {
    if (e === t) return !0;
    if (Ir(e) && Ir(t)) {
      if (e.length !== t.length) return !1;
      for (let r = 0; r < e.length; ++r) if (!Dr(e[r], t[r])) return !1;
      return !0;
    }
    return e && e.equals
      ? e.equals(t)
      : t && t.equals
        ? t.equals(e)
        : "number" == typeof e &&
          "number" == typeof t &&
          Math.abs(e - t) <= xr.EPSILON * Math.max(1, Math.abs(e), Math.abs(t));
  } finally {
    xr.EPSILON = n;
  }
}
var Fr = class extends Array {
  clone() {
    return new this.constructor().copy(this);
  }
  fromArray(e, t = 0) {
    for (let r = 0; r < this.ELEMENTS; ++r) this[r] = e[r + t];
    return this.check();
  }
  toArray(e = [], t = 0) {
    for (let r = 0; r < this.ELEMENTS; ++r) e[t + r] = this[r];
    return e;
  }
  toObject(e) {
    return e;
  }
  from(e) {
    return Array.isArray(e) ? this.copy(e) : this.fromObject(e);
  }
  to(e) {
    return e === this ? this : Ir(e) ? this.toArray(e) : this.toObject(e);
  }
  toTarget(e) {
    return e ? this.to(e) : this;
  }
  toFloat32Array() {
    return new Float32Array(this);
  }
  toString() {
    return this.formatString(xr);
  }
  formatString(e) {
    let t = "";
    for (let r = 0; r < this.ELEMENTS; ++r)
      t += (r > 0 ? ", " : "") + Pr(this[r], e);
    return `${e.printTypes ? this.constructor.name : ""}[${t}]`;
  }
  equals(e) {
    if (!e || this.length !== e.length) return !1;
    for (let t = 0; t < this.ELEMENTS; ++t) if (!Dr(this[t], e[t])) return !1;
    return !0;
  }
  exactEquals(e) {
    if (!e || this.length !== e.length) return !1;
    for (let t = 0; t < this.ELEMENTS; ++t) if (this[t] !== e[t]) return !1;
    return !0;
  }
  negate() {
    for (let e = 0; e < this.ELEMENTS; ++e) this[e] = -this[e];
    return this.check();
  }
  lerp(e, t, r) {
    if (void 0 === r) return this.lerp(this, e, t);
    for (let n = 0; n < this.ELEMENTS; ++n) {
      const i = e[n],
        s = "number" == typeof t ? t : t[n];
      this[n] = i + r * (s - i);
    }
    return this.check();
  }
  min(e) {
    for (let t = 0; t < this.ELEMENTS; ++t) this[t] = Math.min(e[t], this[t]);
    return this.check();
  }
  max(e) {
    for (let t = 0; t < this.ELEMENTS; ++t) this[t] = Math.max(e[t], this[t]);
    return this.check();
  }
  clamp(e, t) {
    for (let r = 0; r < this.ELEMENTS; ++r)
      this[r] = Math.min(Math.max(this[r], e[r]), t[r]);
    return this.check();
  }
  add(...e) {
    for (const t of e) for (let e = 0; e < this.ELEMENTS; ++e) this[e] += t[e];
    return this.check();
  }
  subtract(...e) {
    for (const t of e) for (let e = 0; e < this.ELEMENTS; ++e) this[e] -= t[e];
    return this.check();
  }
  scale(e) {
    if ("number" == typeof e)
      for (let t = 0; t < this.ELEMENTS; ++t) this[t] *= e;
    else
      for (let t = 0; t < this.ELEMENTS && t < e.length; ++t) this[t] *= e[t];
    return this.check();
  }
  multiplyByScalar(e) {
    for (let t = 0; t < this.ELEMENTS; ++t) this[t] *= e;
    return this.check();
  }
  check() {
    if (xr.debug && !this.validate())
      throw new Error(
        `math.gl: ${this.constructor.name} some fields set to invalid numbers'`,
      );
    return this;
  }
  validate() {
    let e = this.length === this.ELEMENTS;
    for (let t = 0; t < this.ELEMENTS; ++t) e = e && Number.isFinite(this[t]);
    return e;
  }
  sub(e) {
    return this.subtract(e);
  }
  setScalar(e) {
    for (let t = 0; t < this.ELEMENTS; ++t) this[t] = e;
    return this.check();
  }
  addScalar(e) {
    for (let t = 0; t < this.ELEMENTS; ++t) this[t] += e;
    return this.check();
  }
  subScalar(e) {
    return this.addScalar(-e);
  }
  multiplyScalar(e) {
    for (let t = 0; t < this.ELEMENTS; ++t) this[t] *= e;
    return this.check();
  }
  divideScalar(e) {
    return this.multiplyByScalar(1 / e);
  }
  clampScalar(e, t) {
    for (let r = 0; r < this.ELEMENTS; ++r)
      this[r] = Math.min(Math.max(this[r], e), t);
    return this.check();
  }
  get elements() {
    return this;
  }
};
function Ur(e) {
  if (!Number.isFinite(e))
    throw new Error(`Invalid number ${JSON.stringify(e)}`);
  return e;
}
function Gr(e, t, r = "") {
  if (
    xr.debug &&
    !(function (e, t) {
      if (e.length !== t) return !1;
      for (let r = 0; r < e.length; ++r) if (!Number.isFinite(e[r])) return !1;
      return !0;
    })(e, t)
  )
    throw new Error(`math.gl: ${r} some fields set to invalid numbers'`);
  return e;
}
function kr(e, t) {
  if (!e) throw new Error(`math.gl assertion ${t}`);
}
var Wr = class extends Fr {
    get x() {
      return this[0];
    }
    set x(e) {
      this[0] = Ur(e);
    }
    get y() {
      return this[1];
    }
    set y(e) {
      this[1] = Ur(e);
    }
    len() {
      return Math.sqrt(this.lengthSquared());
    }
    magnitude() {
      return this.len();
    }
    lengthSquared() {
      let e = 0;
      for (let t = 0; t < this.ELEMENTS; ++t) e += this[t] * this[t];
      return e;
    }
    magnitudeSquared() {
      return this.lengthSquared();
    }
    distance(e) {
      return Math.sqrt(this.distanceSquared(e));
    }
    distanceSquared(e) {
      let t = 0;
      for (let r = 0; r < this.ELEMENTS; ++r) {
        const n = this[r] - e[r];
        t += n * n;
      }
      return Ur(t);
    }
    dot(e) {
      let t = 0;
      for (let r = 0; r < this.ELEMENTS; ++r) t += this[r] * e[r];
      return Ur(t);
    }
    normalize() {
      const e = this.magnitude();
      if (0 !== e) for (let t = 0; t < this.ELEMENTS; ++t) this[t] /= e;
      return this.check();
    }
    multiply(...e) {
      for (const t of e)
        for (let e = 0; e < this.ELEMENTS; ++e) this[e] *= t[e];
      return this.check();
    }
    divide(...e) {
      for (const t of e)
        for (let e = 0; e < this.ELEMENTS; ++e) this[e] /= t[e];
      return this.check();
    }
    lengthSq() {
      return this.lengthSquared();
    }
    distanceTo(e) {
      return this.distance(e);
    }
    distanceToSquared(e) {
      return this.distanceSquared(e);
    }
    getComponent(e) {
      return (
        kr(e >= 0 && e < this.ELEMENTS, "index is out of range"),
        Ur(this[e])
      );
    }
    setComponent(e, t) {
      return (
        kr(e >= 0 && e < this.ELEMENTS, "index is out of range"),
        (this[e] = t),
        this.check()
      );
    }
    addVectors(e, t) {
      return this.copy(e).add(t);
    }
    subVectors(e, t) {
      return this.copy(e).subtract(t);
    }
    multiplyVectors(e, t) {
      return this.copy(e).multiply(t);
    }
    addScaledVector(e, t) {
      return this.add(new this.constructor(e).multiplyScalar(t));
    }
  },
  $r = "undefined" != typeof Float32Array ? Float32Array : Array;
function Hr(e, t, r) {
  return ((e[0] = t[0] + r[0]), (e[1] = t[1] + r[1]), e);
}
function Vr(e, t) {
  return ((e[0] = -t[0]), (e[1] = -t[1]), e);
}
function zr(e, t, r, n) {
  const i = t[0],
    s = t[1];
  return ((e[0] = i + n * (r[0] - i)), (e[1] = s + n * (r[1] - s)), e);
}
Math.PI;
var Xr = function (e, t, r) {
  return ((e[0] = t[0] - r[0]), (e[1] = t[1] - r[1]), e);
};
function jr(e, t, r) {
  const n = t[0],
    i = t[1],
    s = t[2],
    o = r[3] * n + r[7] * i + r[11] * s || 1;
  return (
    (e[0] = (r[0] * n + r[4] * i + r[8] * s) / o),
    (e[1] = (r[1] * n + r[5] * i + r[9] * s) / o),
    (e[2] = (r[2] * n + r[6] * i + r[10] * s) / o),
    e
  );
}
function Kr(e, t, r, n) {
  const i = t[0],
    s = t[1],
    o = t[2];
  return (
    (e[0] = i + n * (r[0] - i)),
    (e[1] = s + n * (r[1] - s)),
    (e[2] = o + n * (r[2] - o)),
    e
  );
}
function Yr(e, t, r) {
  const n = t[0],
    i = t[1],
    s = t[2];
  let o = r[3] * n + r[7] * i + r[11] * s + r[15];
  return (
    (o = o || 1),
    (e[0] = (r[0] * n + r[4] * i + r[8] * s + r[12]) / o),
    (e[1] = (r[1] * n + r[5] * i + r[9] * s + r[13]) / o),
    (e[2] = (r[2] * n + r[6] * i + r[10] * s + r[14]) / o),
    e
  );
}
!(function () {
  const e = new $r(2);
  $r != Float32Array && ((e[0] = 0), (e[1] = 0));
})();
var Qr,
  qr = function (e, t, r) {
    return (
      (e[0] = t[0] - r[0]),
      (e[1] = t[1] - r[1]),
      (e[2] = t[2] - r[2]),
      e
    );
  },
  Zr = function (e) {
    const t = e[0],
      r = e[1],
      n = e[2];
    return Math.sqrt(t * t + r * r + n * n);
  },
  Jr = function (e) {
    const t = e[0],
      r = e[1],
      n = e[2];
    return t * t + r * r + n * n;
  },
  en =
    ((function () {
      const e = new $r(3);
      $r != Float32Array && ((e[0] = 0), (e[1] = 0), (e[2] = 0));
    })(),
    [0, 0, 0]),
  tn = class e extends Wr {
    static get ZERO() {
      return (Qr || ((Qr = new e(0, 0, 0)), Object.freeze(Qr)), Qr);
    }
    constructor(e = 0, t = 0, r = 0) {
      (super(-0, -0, -0),
        1 === arguments.length && Ir(e)
          ? this.copy(e)
          : (xr.debug && (Ur(e), Ur(t), Ur(r)),
            (this[0] = e),
            (this[1] = t),
            (this[2] = r)));
    }
    set(e, t, r) {
      return ((this[0] = e), (this[1] = t), (this[2] = r), this.check());
    }
    copy(e) {
      return (
        (this[0] = e[0]),
        (this[1] = e[1]),
        (this[2] = e[2]),
        this.check()
      );
    }
    fromObject(e) {
      return (
        xr.debug && (Ur(e.x), Ur(e.y), Ur(e.z)),
        (this[0] = e.x),
        (this[1] = e.y),
        (this[2] = e.z),
        this.check()
      );
    }
    toObject(e) {
      return ((e.x = this[0]), (e.y = this[1]), (e.z = this[2]), e);
    }
    get ELEMENTS() {
      return 3;
    }
    get z() {
      return this[2];
    }
    set z(e) {
      this[2] = Ur(e);
    }
    angle(e) {
      return (function (e, t) {
        const r = e[0],
          n = e[1],
          i = e[2],
          s = t[0],
          o = t[1],
          a = t[2],
          c = Math.sqrt((r * r + n * n + i * i) * (s * s + o * o + a * a)),
          l =
            c &&
            (function (e, t) {
              return e[0] * t[0] + e[1] * t[1] + e[2] * t[2];
            })(e, t) / c;
        return Math.acos(Math.min(Math.max(l, -1), 1));
      })(this, e);
    }
    cross(e) {
      return (
        (function (e, t, r) {
          const n = t[0],
            i = t[1],
            s = t[2],
            o = r[0],
            a = r[1],
            c = r[2];
          ((e[0] = i * c - s * a),
            (e[1] = s * o - n * c),
            (e[2] = n * a - i * o));
        })(this, this, e),
        this.check()
      );
    }
    rotateX({ radians: e, origin: t = en }) {
      return (
        (function (e, t, r, n) {
          const i = [],
            s = [];
          ((i[0] = t[0] - r[0]),
            (i[1] = t[1] - r[1]),
            (i[2] = t[2] - r[2]),
            (s[0] = i[0]),
            (s[1] = i[1] * Math.cos(n) - i[2] * Math.sin(n)),
            (s[2] = i[1] * Math.sin(n) + i[2] * Math.cos(n)),
            (e[0] = s[0] + r[0]),
            (e[1] = s[1] + r[1]),
            (e[2] = s[2] + r[2]));
        })(this, this, t, e),
        this.check()
      );
    }
    rotateY({ radians: e, origin: t = en }) {
      return (
        (function (e, t, r, n) {
          const i = [],
            s = [];
          ((i[0] = t[0] - r[0]),
            (i[1] = t[1] - r[1]),
            (i[2] = t[2] - r[2]),
            (s[0] = i[2] * Math.sin(n) + i[0] * Math.cos(n)),
            (s[1] = i[1]),
            (s[2] = i[2] * Math.cos(n) - i[0] * Math.sin(n)),
            (e[0] = s[0] + r[0]),
            (e[1] = s[1] + r[1]),
            (e[2] = s[2] + r[2]));
        })(this, this, t, e),
        this.check()
      );
    }
    rotateZ({ radians: e, origin: t = en }) {
      return (
        (function (e, t, r, n) {
          const i = [],
            s = [];
          ((i[0] = t[0] - r[0]),
            (i[1] = t[1] - r[1]),
            (i[2] = t[2] - r[2]),
            (s[0] = i[0] * Math.cos(n) - i[1] * Math.sin(n)),
            (s[1] = i[0] * Math.sin(n) + i[1] * Math.cos(n)),
            (s[2] = i[2]),
            (e[0] = s[0] + r[0]),
            (e[1] = s[1] + r[1]),
            (e[2] = s[2] + r[2]));
        })(this, this, t, e),
        this.check()
      );
    }
    transform(e) {
      return this.transformAsPoint(e);
    }
    transformAsPoint(e) {
      return (Yr(this, this, e), this.check());
    }
    transformAsVector(e) {
      return (jr(this, this, e), this.check());
    }
    transformByMatrix3(e) {
      return (
        (function (e, t, r) {
          const n = t[0],
            i = t[1],
            s = t[2];
          ((e[0] = n * r[0] + i * r[3] + s * r[6]),
            (e[1] = n * r[1] + i * r[4] + s * r[7]),
            (e[2] = n * r[2] + i * r[5] + s * r[8]));
        })(this, this, e),
        this.check()
      );
    }
    transformByMatrix2(e) {
      return (
        (function (e, t, r) {
          const n = t[0],
            i = t[1];
          ((e[0] = r[0] * n + r[2] * i),
            (e[1] = r[1] * n + r[3] * i),
            (e[2] = t[2]));
        })(this, this, e),
        this.check()
      );
    }
    transformByQuaternion(e) {
      return (
        (function (e, t, r) {
          const n = r[0],
            i = r[1],
            s = r[2],
            o = r[3],
            a = t[0],
            c = t[1],
            l = t[2];
          let u = i * l - s * c,
            h = s * a - n * l,
            d = n * c - i * a,
            f = i * d - s * h,
            p = s * u - n * d,
            g = n * h - i * u;
          const m = 2 * o;
          ((u *= m),
            (h *= m),
            (d *= m),
            (f *= 2),
            (p *= 2),
            (g *= 2),
            (e[0] = a + u + f),
            (e[1] = c + h + p),
            (e[2] = l + d + g));
        })(this, this, e),
        this.check()
      );
    }
  },
  rn = class extends Fr {
    toString() {
      let e = "[";
      if (xr.printRowMajor) {
        e += "row-major:";
        for (let t = 0; t < this.RANK; ++t)
          for (let r = 0; r < this.RANK; ++r)
            e += ` ${this[r * this.RANK + t]}`;
      } else {
        e += "column-major:";
        for (let t = 0; t < this.ELEMENTS; ++t) e += ` ${this[t]}`;
      }
      return ((e += "]"), e);
    }
    getElementIndex(e, t) {
      return t * this.RANK + e;
    }
    getElement(e, t) {
      return this[t * this.RANK + e];
    }
    setElement(e, t, r) {
      return ((this[t * this.RANK + e] = Ur(r)), this);
    }
    getColumn(e, t = new Array(this.RANK).fill(-0)) {
      const r = e * this.RANK;
      for (let n = 0; n < this.RANK; ++n) t[n] = this[r + n];
      return t;
    }
    setColumn(e, t) {
      const r = e * this.RANK;
      for (let n = 0; n < this.RANK; ++n) this[r + n] = t[n];
      return this;
    }
  };
function nn(e, t) {
  const r = t[0],
    n = t[1],
    i = t[2],
    s = t[3],
    o = t[4],
    a = t[5],
    c = t[6],
    l = t[7],
    u = t[8],
    h = t[9],
    d = t[10],
    f = t[11],
    p = t[12],
    g = t[13],
    m = t[14],
    _ = t[15],
    E = r * a - n * o,
    b = r * c - i * o,
    y = r * l - s * o,
    T = n * c - i * a,
    A = n * l - s * a,
    R = i * l - s * c,
    v = u * g - h * p,
    S = u * m - d * p,
    C = u * _ - f * p,
    w = h * m - d * g,
    L = h * _ - f * g,
    O = d * _ - f * m;
  let N = E * O - b * L + y * w + T * C - A * S + R * v;
  return N
    ? ((N = 1 / N),
      (e[0] = (a * O - c * L + l * w) * N),
      (e[1] = (i * L - n * O - s * w) * N),
      (e[2] = (g * R - m * A + _ * T) * N),
      (e[3] = (d * A - h * R - f * T) * N),
      (e[4] = (c * C - o * O - l * S) * N),
      (e[5] = (r * O - i * C + s * S) * N),
      (e[6] = (m * y - p * R - _ * b) * N),
      (e[7] = (u * R - d * y + f * b) * N),
      (e[8] = (o * L - a * C + l * v) * N),
      (e[9] = (n * C - r * L - s * v) * N),
      (e[10] = (p * A - g * y + _ * E) * N),
      (e[11] = (h * y - u * A - f * E) * N),
      (e[12] = (a * S - o * w - c * v) * N),
      (e[13] = (r * w - n * S + i * v) * N),
      (e[14] = (g * b - p * T - m * E) * N),
      (e[15] = (u * T - h * b + d * E) * N),
      e)
    : null;
}
function sn(e, t, r) {
  const n = t[0],
    i = t[1],
    s = t[2],
    o = t[3],
    a = t[4],
    c = t[5],
    l = t[6],
    u = t[7],
    h = t[8],
    d = t[9],
    f = t[10],
    p = t[11],
    g = t[12],
    m = t[13],
    _ = t[14],
    E = t[15];
  let b = r[0],
    y = r[1],
    T = r[2],
    A = r[3];
  return (
    (e[0] = b * n + y * a + T * h + A * g),
    (e[1] = b * i + y * c + T * d + A * m),
    (e[2] = b * s + y * l + T * f + A * _),
    (e[3] = b * o + y * u + T * p + A * E),
    (b = r[4]),
    (y = r[5]),
    (T = r[6]),
    (A = r[7]),
    (e[4] = b * n + y * a + T * h + A * g),
    (e[5] = b * i + y * c + T * d + A * m),
    (e[6] = b * s + y * l + T * f + A * _),
    (e[7] = b * o + y * u + T * p + A * E),
    (b = r[8]),
    (y = r[9]),
    (T = r[10]),
    (A = r[11]),
    (e[8] = b * n + y * a + T * h + A * g),
    (e[9] = b * i + y * c + T * d + A * m),
    (e[10] = b * s + y * l + T * f + A * _),
    (e[11] = b * o + y * u + T * p + A * E),
    (b = r[12]),
    (y = r[13]),
    (T = r[14]),
    (A = r[15]),
    (e[12] = b * n + y * a + T * h + A * g),
    (e[13] = b * i + y * c + T * d + A * m),
    (e[14] = b * s + y * l + T * f + A * _),
    (e[15] = b * o + y * u + T * p + A * E),
    e
  );
}
function on(e, t, r) {
  const n = r[0],
    i = r[1],
    s = r[2];
  let o, a, c, l, u, h, d, f, p, g, m, _;
  return (
    t === e
      ? ((e[12] = t[0] * n + t[4] * i + t[8] * s + t[12]),
        (e[13] = t[1] * n + t[5] * i + t[9] * s + t[13]),
        (e[14] = t[2] * n + t[6] * i + t[10] * s + t[14]),
        (e[15] = t[3] * n + t[7] * i + t[11] * s + t[15]))
      : ((o = t[0]),
        (a = t[1]),
        (c = t[2]),
        (l = t[3]),
        (u = t[4]),
        (h = t[5]),
        (d = t[6]),
        (f = t[7]),
        (p = t[8]),
        (g = t[9]),
        (m = t[10]),
        (_ = t[11]),
        (e[0] = o),
        (e[1] = a),
        (e[2] = c),
        (e[3] = l),
        (e[4] = u),
        (e[5] = h),
        (e[6] = d),
        (e[7] = f),
        (e[8] = p),
        (e[9] = g),
        (e[10] = m),
        (e[11] = _),
        (e[12] = o * n + u * i + p * s + t[12]),
        (e[13] = a * n + h * i + g * s + t[13]),
        (e[14] = c * n + d * i + m * s + t[14]),
        (e[15] = l * n + f * i + _ * s + t[15])),
    e
  );
}
function an(e, t, r) {
  const n = r[0],
    i = r[1],
    s = r[2];
  return (
    (e[0] = t[0] * n),
    (e[1] = t[1] * n),
    (e[2] = t[2] * n),
    (e[3] = t[3] * n),
    (e[4] = t[4] * i),
    (e[5] = t[5] * i),
    (e[6] = t[6] * i),
    (e[7] = t[7] * i),
    (e[8] = t[8] * s),
    (e[9] = t[9] * s),
    (e[10] = t[10] * s),
    (e[11] = t[11] * s),
    (e[12] = t[12]),
    (e[13] = t[13]),
    (e[14] = t[14]),
    (e[15] = t[15]),
    e
  );
}
function cn(e, t, r) {
  const n = Math.sin(r),
    i = Math.cos(r),
    s = t[4],
    o = t[5],
    a = t[6],
    c = t[7],
    l = t[8],
    u = t[9],
    h = t[10],
    d = t[11];
  return (
    t !== e &&
      ((e[0] = t[0]),
      (e[1] = t[1]),
      (e[2] = t[2]),
      (e[3] = t[3]),
      (e[12] = t[12]),
      (e[13] = t[13]),
      (e[14] = t[14]),
      (e[15] = t[15])),
    (e[4] = s * i + l * n),
    (e[5] = o * i + u * n),
    (e[6] = a * i + h * n),
    (e[7] = c * i + d * n),
    (e[8] = l * i - s * n),
    (e[9] = u * i - o * n),
    (e[10] = h * i - a * n),
    (e[11] = d * i - c * n),
    e
  );
}
function ln(e, t, r) {
  const n = Math.sin(r),
    i = Math.cos(r),
    s = t[0],
    o = t[1],
    a = t[2],
    c = t[3],
    l = t[4],
    u = t[5],
    h = t[6],
    d = t[7];
  return (
    t !== e &&
      ((e[8] = t[8]),
      (e[9] = t[9]),
      (e[10] = t[10]),
      (e[11] = t[11]),
      (e[12] = t[12]),
      (e[13] = t[13]),
      (e[14] = t[14]),
      (e[15] = t[15])),
    (e[0] = s * i + l * n),
    (e[1] = o * i + u * n),
    (e[2] = a * i + h * n),
    (e[3] = c * i + d * n),
    (e[4] = l * i - s * n),
    (e[5] = u * i - o * n),
    (e[6] = h * i - a * n),
    (e[7] = d * i - c * n),
    e
  );
}
var un;
function hn(e, t, r) {
  return (
    (e[0] = t[0] * r),
    (e[1] = t[1] * r),
    (e[2] = t[2] * r),
    (e[3] = t[3] * r),
    e
  );
}
function dn(e, t, r) {
  const n = t[0],
    i = t[1],
    s = t[2],
    o = t[3];
  return (
    (e[0] = r[0] * n + r[4] * i + r[8] * s + r[12] * o),
    (e[1] = r[1] * n + r[5] * i + r[9] * s + r[13] * o),
    (e[2] = r[2] * n + r[6] * i + r[10] * s + r[14] * o),
    (e[3] = r[3] * n + r[7] * i + r[11] * s + r[15] * o),
    e
  );
}
(!(function () {
  const e = new $r(4);
  $r != Float32Array && ((e[0] = 0), (e[1] = 0), (e[2] = 0), (e[3] = 0));
})(),
  (function (e) {
    ((e[(e.COL0ROW0 = 0)] = "COL0ROW0"),
      (e[(e.COL0ROW1 = 1)] = "COL0ROW1"),
      (e[(e.COL0ROW2 = 2)] = "COL0ROW2"),
      (e[(e.COL0ROW3 = 3)] = "COL0ROW3"),
      (e[(e.COL1ROW0 = 4)] = "COL1ROW0"),
      (e[(e.COL1ROW1 = 5)] = "COL1ROW1"),
      (e[(e.COL1ROW2 = 6)] = "COL1ROW2"),
      (e[(e.COL1ROW3 = 7)] = "COL1ROW3"),
      (e[(e.COL2ROW0 = 8)] = "COL2ROW0"),
      (e[(e.COL2ROW1 = 9)] = "COL2ROW1"),
      (e[(e.COL2ROW2 = 10)] = "COL2ROW2"),
      (e[(e.COL2ROW3 = 11)] = "COL2ROW3"),
      (e[(e.COL3ROW0 = 12)] = "COL3ROW0"),
      (e[(e.COL3ROW1 = 13)] = "COL3ROW1"),
      (e[(e.COL3ROW2 = 14)] = "COL3ROW2"),
      (e[(e.COL3ROW3 = 15)] = "COL3ROW3"));
  })(un || (un = {})));
var fn,
  pn,
  gn = (45 * Math.PI) / 180,
  mn = 1,
  _n = 0.1,
  En = 500,
  bn = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
  yn = class extends rn {
    static get IDENTITY() {
      return (pn || ((pn = new yn()), Object.freeze(pn)), pn);
    }
    static get ZERO() {
      return (
        fn ||
          ((fn = new yn([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])),
          Object.freeze(fn)),
        fn
      );
    }
    get ELEMENTS() {
      return 16;
    }
    get RANK() {
      return 4;
    }
    get INDICES() {
      return un;
    }
    constructor(e) {
      (super(-0, -0, -0, -0, -0, -0, -0, -0, -0, -0, -0, -0, -0, -0, -0, -0),
        1 === arguments.length && Array.isArray(e)
          ? this.copy(e)
          : this.identity());
    }
    copy(e) {
      return (
        (this[0] = e[0]),
        (this[1] = e[1]),
        (this[2] = e[2]),
        (this[3] = e[3]),
        (this[4] = e[4]),
        (this[5] = e[5]),
        (this[6] = e[6]),
        (this[7] = e[7]),
        (this[8] = e[8]),
        (this[9] = e[9]),
        (this[10] = e[10]),
        (this[11] = e[11]),
        (this[12] = e[12]),
        (this[13] = e[13]),
        (this[14] = e[14]),
        (this[15] = e[15]),
        this.check()
      );
    }
    set(e, t, r, n, i, s, o, a, c, l, u, h, d, f, p, g) {
      return (
        (this[0] = e),
        (this[1] = t),
        (this[2] = r),
        (this[3] = n),
        (this[4] = i),
        (this[5] = s),
        (this[6] = o),
        (this[7] = a),
        (this[8] = c),
        (this[9] = l),
        (this[10] = u),
        (this[11] = h),
        (this[12] = d),
        (this[13] = f),
        (this[14] = p),
        (this[15] = g),
        this.check()
      );
    }
    setRowMajor(e, t, r, n, i, s, o, a, c, l, u, h, d, f, p, g) {
      return (
        (this[0] = e),
        (this[1] = i),
        (this[2] = c),
        (this[3] = d),
        (this[4] = t),
        (this[5] = s),
        (this[6] = l),
        (this[7] = f),
        (this[8] = r),
        (this[9] = o),
        (this[10] = u),
        (this[11] = p),
        (this[12] = n),
        (this[13] = a),
        (this[14] = h),
        (this[15] = g),
        this.check()
      );
    }
    toRowMajor(e) {
      return (
        (e[0] = this[0]),
        (e[1] = this[4]),
        (e[2] = this[8]),
        (e[3] = this[12]),
        (e[4] = this[1]),
        (e[5] = this[5]),
        (e[6] = this[9]),
        (e[7] = this[13]),
        (e[8] = this[2]),
        (e[9] = this[6]),
        (e[10] = this[10]),
        (e[11] = this[14]),
        (e[12] = this[3]),
        (e[13] = this[7]),
        (e[14] = this[11]),
        (e[15] = this[15]),
        e
      );
    }
    identity() {
      return this.copy(bn);
    }
    fromObject(e) {
      return this.check();
    }
    fromQuaternion(e) {
      return (
        (function (e, t) {
          const r = t[0],
            n = t[1],
            i = t[2],
            s = t[3],
            o = r + r,
            a = n + n,
            c = i + i,
            l = r * o,
            u = n * o,
            h = n * a,
            d = i * o,
            f = i * a,
            p = i * c,
            g = s * o,
            m = s * a,
            _ = s * c;
          ((e[0] = 1 - h - p),
            (e[1] = u + _),
            (e[2] = d - m),
            (e[3] = 0),
            (e[4] = u - _),
            (e[5] = 1 - l - p),
            (e[6] = f + g),
            (e[7] = 0),
            (e[8] = d + m),
            (e[9] = f - g),
            (e[10] = 1 - l - h),
            (e[11] = 0),
            (e[12] = 0),
            (e[13] = 0),
            (e[14] = 0),
            (e[15] = 1));
        })(this, e),
        this.check()
      );
    }
    frustum(e) {
      const {
        left: t,
        right: r,
        bottom: n,
        top: i,
        near: s = _n,
        far: o = En,
      } = e;
      return (
        o === 1 / 0
          ? (function (e, t, r, n, i, s) {
              const o = (2 * s) / (r - t),
                a = (2 * s) / (i - n),
                c = (r + t) / (r - t),
                l = (i + n) / (i - n),
                u = -2 * s;
              ((e[0] = o),
                (e[1] = 0),
                (e[2] = 0),
                (e[3] = 0),
                (e[4] = 0),
                (e[5] = a),
                (e[6] = 0),
                (e[7] = 0),
                (e[8] = c),
                (e[9] = l),
                (e[10] = -1),
                (e[11] = -1),
                (e[12] = 0),
                (e[13] = 0),
                (e[14] = u),
                (e[15] = 0));
            })(this, t, r, n, i, s)
          : (function (e, t, r, n, i, s, o) {
              const a = 1 / (r - t),
                c = 1 / (i - n),
                l = 1 / (s - o);
              ((e[0] = 2 * s * a),
                (e[1] = 0),
                (e[2] = 0),
                (e[3] = 0),
                (e[4] = 0),
                (e[5] = 2 * s * c),
                (e[6] = 0),
                (e[7] = 0),
                (e[8] = (r + t) * a),
                (e[9] = (i + n) * c),
                (e[10] = (o + s) * l),
                (e[11] = -1),
                (e[12] = 0),
                (e[13] = 0),
                (e[14] = o * s * 2 * l),
                (e[15] = 0));
            })(this, t, r, n, i, s, o),
        this.check()
      );
    }
    lookAt(e) {
      const { eye: t, center: r = [0, 0, 0], up: n = [0, 1, 0] } = e;
      return (
        (function (e, t, r, n) {
          let i, s, o, a, c, l, u, h, d, f;
          const p = t[0],
            g = t[1],
            m = t[2],
            _ = n[0],
            E = n[1],
            b = n[2],
            y = r[0],
            T = r[1],
            A = r[2];
          Math.abs(p - y) < 1e-6 &&
          Math.abs(g - T) < 1e-6 &&
          Math.abs(m - A) < 1e-6
            ? (function (e) {
                ((e[0] = 1),
                  (e[1] = 0),
                  (e[2] = 0),
                  (e[3] = 0),
                  (e[4] = 0),
                  (e[5] = 1),
                  (e[6] = 0),
                  (e[7] = 0),
                  (e[8] = 0),
                  (e[9] = 0),
                  (e[10] = 1),
                  (e[11] = 0),
                  (e[12] = 0),
                  (e[13] = 0),
                  (e[14] = 0),
                  (e[15] = 1));
              })(e)
            : ((h = p - y),
              (d = g - T),
              (f = m - A),
              (i = 1 / Math.sqrt(h * h + d * d + f * f)),
              (h *= i),
              (d *= i),
              (f *= i),
              (s = E * f - b * d),
              (o = b * h - _ * f),
              (a = _ * d - E * h),
              (i = Math.sqrt(s * s + o * o + a * a)),
              i
                ? ((i = 1 / i), (s *= i), (o *= i), (a *= i))
                : ((s = 0), (o = 0), (a = 0)),
              (c = d * a - f * o),
              (l = f * s - h * a),
              (u = h * o - d * s),
              (i = Math.sqrt(c * c + l * l + u * u)),
              i
                ? ((i = 1 / i), (c *= i), (l *= i), (u *= i))
                : ((c = 0), (l = 0), (u = 0)),
              (e[0] = s),
              (e[1] = c),
              (e[2] = h),
              (e[3] = 0),
              (e[4] = o),
              (e[5] = l),
              (e[6] = d),
              (e[7] = 0),
              (e[8] = a),
              (e[9] = u),
              (e[10] = f),
              (e[11] = 0),
              (e[12] = -(s * p + o * g + a * m)),
              (e[13] = -(c * p + l * g + u * m)),
              (e[14] = -(h * p + d * g + f * m)),
              (e[15] = 1));
        })(this, t, r, n),
        this.check()
      );
    }
    ortho(e) {
      const {
        left: t,
        right: r,
        bottom: n,
        top: i,
        near: s = _n,
        far: o = En,
      } = e;
      return (
        (function (e, t, r, n, i, s, o) {
          const a = 1 / (t - r),
            c = 1 / (n - i),
            l = 1 / (s - o);
          ((e[0] = -2 * a),
            (e[1] = 0),
            (e[2] = 0),
            (e[3] = 0),
            (e[4] = 0),
            (e[5] = -2 * c),
            (e[6] = 0),
            (e[7] = 0),
            (e[8] = 0),
            (e[9] = 0),
            (e[10] = 2 * l),
            (e[11] = 0),
            (e[12] = (t + r) * a),
            (e[13] = (i + n) * c),
            (e[14] = (o + s) * l),
            (e[15] = 1));
        })(this, t, r, n, i, s, o),
        this.check()
      );
    }
    orthographic(e) {
      const {
        fovy: t = gn,
        aspect: r = mn,
        focalDistance: n = 1,
        near: i = _n,
        far: s = En,
      } = e;
      Tn(t);
      const o = t / 2,
        a = n * Math.tan(o),
        c = a * r;
      return this.ortho({
        left: -c,
        right: c,
        bottom: -a,
        top: a,
        near: i,
        far: s,
      });
    }
    perspective(e) {
      const {
        fovy: t = (45 * Math.PI) / 180,
        aspect: r = 1,
        near: n = 0.1,
        far: i = 500,
      } = e;
      return (
        Tn(t),
        (function (e, t, r, n, i) {
          const s = 1 / Math.tan(t / 2);
          if (
            ((e[0] = s / r),
            (e[1] = 0),
            (e[2] = 0),
            (e[3] = 0),
            (e[4] = 0),
            (e[5] = s),
            (e[6] = 0),
            (e[7] = 0),
            (e[8] = 0),
            (e[9] = 0),
            (e[11] = -1),
            (e[12] = 0),
            (e[13] = 0),
            (e[15] = 0),
            null != i && i !== 1 / 0)
          ) {
            const t = 1 / (n - i);
            ((e[10] = (i + n) * t), (e[14] = 2 * i * n * t));
          } else ((e[10] = -1), (e[14] = -2 * n));
        })(this, t, r, n, i),
        this.check()
      );
    }
    determinant() {
      return (function (e) {
        const t = e[0],
          r = e[1],
          n = e[2],
          i = e[3],
          s = e[4],
          o = e[5],
          a = e[6],
          c = e[7],
          l = e[8],
          u = e[9],
          h = e[10],
          d = e[11],
          f = e[12],
          p = e[13],
          g = e[14],
          m = t * o - r * s,
          _ = t * a - n * s,
          E = r * a - n * o,
          b = l * p - u * f,
          y = l * g - h * f,
          T = u * g - h * p;
        return (
          c * (t * T - r * y + n * b) -
          i * (s * T - o * y + a * b) +
          e[15] * (l * E - u * _ + h * m) -
          d * (f * E - p * _ + g * m)
        );
      })(this);
    }
    getScale(e = [-0, -0, -0]) {
      return (
        (e[0] = Math.sqrt(
          this[0] * this[0] + this[1] * this[1] + this[2] * this[2],
        )),
        (e[1] = Math.sqrt(
          this[4] * this[4] + this[5] * this[5] + this[6] * this[6],
        )),
        (e[2] = Math.sqrt(
          this[8] * this[8] + this[9] * this[9] + this[10] * this[10],
        )),
        e
      );
    }
    getTranslation(e = [-0, -0, -0]) {
      return ((e[0] = this[12]), (e[1] = this[13]), (e[2] = this[14]), e);
    }
    getRotation(e, t) {
      ((e = e || [
        -0, -0, -0, -0, -0, -0, -0, -0, -0, -0, -0, -0, -0, -0, -0, -0,
      ]),
        (t = t || [-0, -0, -0]));
      const r = this.getScale(t),
        n = 1 / r[0],
        i = 1 / r[1],
        s = 1 / r[2];
      return (
        (e[0] = this[0] * n),
        (e[1] = this[1] * i),
        (e[2] = this[2] * s),
        (e[3] = 0),
        (e[4] = this[4] * n),
        (e[5] = this[5] * i),
        (e[6] = this[6] * s),
        (e[7] = 0),
        (e[8] = this[8] * n),
        (e[9] = this[9] * i),
        (e[10] = this[10] * s),
        (e[11] = 0),
        (e[12] = 0),
        (e[13] = 0),
        (e[14] = 0),
        (e[15] = 1),
        e
      );
    }
    getRotationMatrix3(e, t) {
      ((e = e || [-0, -0, -0, -0, -0, -0, -0, -0, -0]),
        (t = t || [-0, -0, -0]));
      const r = this.getScale(t),
        n = 1 / r[0],
        i = 1 / r[1],
        s = 1 / r[2];
      return (
        (e[0] = this[0] * n),
        (e[1] = this[1] * i),
        (e[2] = this[2] * s),
        (e[3] = this[4] * n),
        (e[4] = this[5] * i),
        (e[5] = this[6] * s),
        (e[6] = this[8] * n),
        (e[7] = this[9] * i),
        (e[8] = this[10] * s),
        e
      );
    }
    transpose() {
      return (
        (function (e, t) {
          if (e === t) {
            const r = t[1],
              n = t[2],
              i = t[3],
              s = t[6],
              o = t[7],
              a = t[11];
            ((e[1] = t[4]),
              (e[2] = t[8]),
              (e[3] = t[12]),
              (e[4] = r),
              (e[6] = t[9]),
              (e[7] = t[13]),
              (e[8] = n),
              (e[9] = s),
              (e[11] = t[14]),
              (e[12] = i),
              (e[13] = o),
              (e[14] = a));
          } else
            ((e[0] = t[0]),
              (e[1] = t[4]),
              (e[2] = t[8]),
              (e[3] = t[12]),
              (e[4] = t[1]),
              (e[5] = t[5]),
              (e[6] = t[9]),
              (e[7] = t[13]),
              (e[8] = t[2]),
              (e[9] = t[6]),
              (e[10] = t[10]),
              (e[11] = t[14]),
              (e[12] = t[3]),
              (e[13] = t[7]),
              (e[14] = t[11]),
              (e[15] = t[15]));
        })(this, this),
        this.check()
      );
    }
    invert() {
      return (nn(this, this), this.check());
    }
    multiplyLeft(e) {
      return (sn(this, e, this), this.check());
    }
    multiplyRight(e) {
      return (sn(this, this, e), this.check());
    }
    rotateX(e) {
      return (cn(this, this, e), this.check());
    }
    rotateY(e) {
      return (
        (function (e, t, r) {
          const n = Math.sin(r),
            i = Math.cos(r),
            s = t[0],
            o = t[1],
            a = t[2],
            c = t[3],
            l = t[8],
            u = t[9],
            h = t[10],
            d = t[11];
          (t !== e &&
            ((e[4] = t[4]),
            (e[5] = t[5]),
            (e[6] = t[6]),
            (e[7] = t[7]),
            (e[12] = t[12]),
            (e[13] = t[13]),
            (e[14] = t[14]),
            (e[15] = t[15])),
            (e[0] = s * i - l * n),
            (e[1] = o * i - u * n),
            (e[2] = a * i - h * n),
            (e[3] = c * i - d * n),
            (e[8] = s * n + l * i),
            (e[9] = o * n + u * i),
            (e[10] = a * n + h * i),
            (e[11] = c * n + d * i));
        })(this, this, e),
        this.check()
      );
    }
    rotateZ(e) {
      return (ln(this, this, e), this.check());
    }
    rotateXYZ(e) {
      return this.rotateX(e[0]).rotateY(e[1]).rotateZ(e[2]);
    }
    rotateAxis(e, t) {
      return (
        (function (e, t, r, n) {
          let i,
            s,
            o,
            a,
            c,
            l,
            u,
            h,
            d,
            f,
            p,
            g,
            m,
            _,
            E,
            b,
            y,
            T,
            A,
            R,
            v,
            S,
            C,
            w,
            L = n[0],
            O = n[1],
            N = n[2],
            x = Math.sqrt(L * L + O * O + N * N);
          x < 1e-6 ||
            ((x = 1 / x),
            (L *= x),
            (O *= x),
            (N *= x),
            (s = Math.sin(r)),
            (i = Math.cos(r)),
            (o = 1 - i),
            (a = t[0]),
            (c = t[1]),
            (l = t[2]),
            (u = t[3]),
            (h = t[4]),
            (d = t[5]),
            (f = t[6]),
            (p = t[7]),
            (g = t[8]),
            (m = t[9]),
            (_ = t[10]),
            (E = t[11]),
            (b = L * L * o + i),
            (y = O * L * o + N * s),
            (T = N * L * o - O * s),
            (A = L * O * o - N * s),
            (R = O * O * o + i),
            (v = N * O * o + L * s),
            (S = L * N * o + O * s),
            (C = O * N * o - L * s),
            (w = N * N * o + i),
            (e[0] = a * b + h * y + g * T),
            (e[1] = c * b + d * y + m * T),
            (e[2] = l * b + f * y + _ * T),
            (e[3] = u * b + p * y + E * T),
            (e[4] = a * A + h * R + g * v),
            (e[5] = c * A + d * R + m * v),
            (e[6] = l * A + f * R + _ * v),
            (e[7] = u * A + p * R + E * v),
            (e[8] = a * S + h * C + g * w),
            (e[9] = c * S + d * C + m * w),
            (e[10] = l * S + f * C + _ * w),
            (e[11] = u * S + p * C + E * w),
            t !== e &&
              ((e[12] = t[12]),
              (e[13] = t[13]),
              (e[14] = t[14]),
              (e[15] = t[15])));
        })(this, this, e, t),
        this.check()
      );
    }
    scale(e) {
      return (an(this, this, Array.isArray(e) ? e : [e, e, e]), this.check());
    }
    translate(e) {
      return (on(this, this, e), this.check());
    }
    transform(e, t) {
      return 4 === e.length
        ? (Gr((t = dn(t || [-0, -0, -0, -0], e, this)), 4), t)
        : this.transformAsPoint(e, t);
    }
    transformAsPoint(e, t) {
      const { length: r } = e;
      let n;
      switch (r) {
        case 2:
          n = (function (e, t, r) {
            const n = t[0],
              i = t[1];
            return (
              (e[0] = r[0] * n + r[4] * i + r[12]),
              (e[1] = r[1] * n + r[5] * i + r[13]),
              e
            );
          })(t || [-0, -0], e, this);
          break;
        case 3:
          n = Yr(t || [-0, -0, -0], e, this);
          break;
        default:
          throw new Error("Illegal vector");
      }
      return (Gr(n, e.length), n);
    }
    transformAsVector(e, t) {
      let r;
      switch (e.length) {
        case 2:
          r = (function (e, t, r) {
            const n = t[0],
              i = t[1],
              s = r[3] * n + r[7] * i || 1;
            return (
              (e[0] = (r[0] * n + r[4] * i) / s),
              (e[1] = (r[1] * n + r[5] * i) / s),
              e
            );
          })(t || [-0, -0], e, this);
          break;
        case 3:
          r = jr(t || [-0, -0, -0], e, this);
          break;
        default:
          throw new Error("Illegal vector");
      }
      return (Gr(r, e.length), r);
    }
    transformPoint(e, t) {
      return this.transformAsPoint(e, t);
    }
    transformVector(e, t) {
      return this.transformAsPoint(e, t);
    }
    transformDirection(e, t) {
      return this.transformAsVector(e, t);
    }
    makeRotationX(e) {
      return this.identity().rotateX(e);
    }
    makeTranslation(e, t, r) {
      return this.identity().translate([e, t, r]);
    }
  };
function Tn(e) {
  if (e > 2 * Math.PI) throw Error("expected radians");
}
function An(e, t = [], r = 0) {
  const n = Math.fround(e),
    i = e - n;
  return ((t[r] = n), (t[r + 1] = i), t);
}
function Rn(e, t = !0) {
  return e ?? t;
}
function vn(e = [0, 0, 0], t = !0) {
  return t ? e.map((e) => e / 255) : [...e];
}
var Sn = {
    name: "fp32",
    vs: "#ifdef LUMA_FP32_TAN_PRECISION_WORKAROUND\n\n// All these functions are for substituting tan() function from Intel GPU only\nconst float TWO_PI = 6.2831854820251465;\nconst float PI_2 = 1.5707963705062866;\nconst float PI_16 = 0.1963495463132858;\n\nconst float SIN_TABLE_0 = 0.19509032368659973;\nconst float SIN_TABLE_1 = 0.3826834261417389;\nconst float SIN_TABLE_2 = 0.5555702447891235;\nconst float SIN_TABLE_3 = 0.7071067690849304;\n\nconst float COS_TABLE_0 = 0.9807852506637573;\nconst float COS_TABLE_1 = 0.9238795042037964;\nconst float COS_TABLE_2 = 0.8314695954322815;\nconst float COS_TABLE_3 = 0.7071067690849304;\n\nconst float INVERSE_FACTORIAL_3 = 1.666666716337204e-01; // 1/3!\nconst float INVERSE_FACTORIAL_5 = 8.333333767950535e-03; // 1/5!\nconst float INVERSE_FACTORIAL_7 = 1.9841270113829523e-04; // 1/7!\nconst float INVERSE_FACTORIAL_9 = 2.75573188446287533e-06; // 1/9!\n\nfloat sin_taylor_fp32(float a) {\n  float r, s, t, x;\n\n  if (a == 0.0) {\n    return 0.0;\n  }\n\n  x = -a * a;\n  s = a;\n  r = a;\n\n  r = r * x;\n  t = r * INVERSE_FACTORIAL_3;\n  s = s + t;\n\n  r = r * x;\n  t = r * INVERSE_FACTORIAL_5;\n  s = s + t;\n\n  r = r * x;\n  t = r * INVERSE_FACTORIAL_7;\n  s = s + t;\n\n  r = r * x;\n  t = r * INVERSE_FACTORIAL_9;\n  s = s + t;\n\n  return s;\n}\n\nvoid sincos_taylor_fp32(float a, out float sin_t, out float cos_t) {\n  if (a == 0.0) {\n    sin_t = 0.0;\n    cos_t = 1.0;\n  }\n  sin_t = sin_taylor_fp32(a);\n  cos_t = sqrt(1.0 - sin_t * sin_t);\n}\n\nfloat tan_taylor_fp32(float a) {\n    float sin_a;\n    float cos_a;\n\n    if (a == 0.0) {\n        return 0.0;\n    }\n\n    // 2pi range reduction\n    float z = floor(a / TWO_PI);\n    float r = a - TWO_PI * z;\n\n    float t;\n    float q = floor(r / PI_2 + 0.5);\n    int j = int(q);\n\n    if (j < -2 || j > 2) {\n        return 1.0 / 0.0;\n    }\n\n    t = r - PI_2 * q;\n\n    q = floor(t / PI_16 + 0.5);\n    int k = int(q);\n    int abs_k = int(abs(float(k)));\n\n    if (abs_k > 4) {\n        return 1.0 / 0.0;\n    } else {\n        t = t - PI_16 * q;\n    }\n\n    float u = 0.0;\n    float v = 0.0;\n\n    float sin_t, cos_t;\n    float s, c;\n    sincos_taylor_fp32(t, sin_t, cos_t);\n\n    if (k == 0) {\n        s = sin_t;\n        c = cos_t;\n    } else {\n        if (abs(float(abs_k) - 1.0) < 0.5) {\n            u = COS_TABLE_0;\n            v = SIN_TABLE_0;\n        } else if (abs(float(abs_k) - 2.0) < 0.5) {\n            u = COS_TABLE_1;\n            v = SIN_TABLE_1;\n        } else if (abs(float(abs_k) - 3.0) < 0.5) {\n            u = COS_TABLE_2;\n            v = SIN_TABLE_2;\n        } else if (abs(float(abs_k) - 4.0) < 0.5) {\n            u = COS_TABLE_3;\n            v = SIN_TABLE_3;\n        }\n        if (k > 0) {\n            s = u * sin_t + v * cos_t;\n            c = u * cos_t - v * sin_t;\n        } else {\n            s = u * sin_t - v * cos_t;\n            c = u * cos_t + v * sin_t;\n        }\n    }\n\n    if (j == 0) {\n        sin_a = s;\n        cos_a = c;\n    } else if (j == 1) {\n        sin_a = c;\n        cos_a = -s;\n    } else if (j == -1) {\n        sin_a = -c;\n        cos_a = s;\n    } else {\n        sin_a = -s;\n        cos_a = -c;\n    }\n    return sin_a / cos_a;\n}\n#endif\n\nfloat tan_fp32(float a) {\n#ifdef LUMA_FP32_TAN_PRECISION_WORKAROUND\n  return tan_taylor_fp32(a);\n#else\n  return tan(a);\n#endif\n}\n",
  },
  Cn =
    "\nlayout(std140) uniform fp64arithmeticUniforms {\n  uniform float ONE;\n  uniform float SPLIT;\n} fp64;\n\n/*\nAbout LUMA_FP64_CODE_ELIMINATION_WORKAROUND\n\nThe purpose of this workaround is to prevent shader compilers from\noptimizing away necessary arithmetic operations by swapping their sequences\nor transform the equation to some 'equivalent' form.\n\nThese helpers implement Dekker/Veltkamp-style error tracking. If the compiler\nfolds constants or reassociates the arithmetic, the high/low split can stop\ntracking the rounding error correctly. That failure mode tends to look fine in\nsimple coordinate setup, but then breaks down inside iterative arithmetic such\nas fp64 Mandelbrot loops.\n\nThe method is to multiply an artifical variable, ONE, which will be known to\nthe compiler to be 1 only at runtime. The whole expression is then represented\nas a polynomial with respective to ONE. In the coefficients of all terms, only one a\nand one b should appear\n\nerr = (a + b) * ONE^6 - a * ONE^5 - (a + b) * ONE^4 + a * ONE^3 - b - (a + b) * ONE^2 + a * ONE\n*/\n\nfloat prevent_fp64_optimization(float value) {\n#if defined(LUMA_FP64_CODE_ELIMINATION_WORKAROUND)\n  return value + fp64.ONE * 0.0;\n#else\n  return value;\n#endif\n}\n\n// Divide float number to high and low floats to extend fraction bits\nvec2 split(float a) {\n  // Keep SPLIT as a runtime uniform so the compiler cannot fold the Dekker\n  // split into a constant expression and reassociate the recovery steps.\n  float split = prevent_fp64_optimization(fp64.SPLIT);\n  float t = prevent_fp64_optimization(a * split);\n  float temp = t - a;\n  float a_hi = t - temp;\n  float a_lo = a - a_hi;\n  return vec2(a_hi, a_lo);\n}\n\n// Divide float number again when high float uses too many fraction bits\nvec2 split2(vec2 a) {\n  vec2 b = split(a.x);\n  b.y += a.y;\n  return b;\n}\n\n// Special sum operation when a > b\nvec2 quickTwoSum(float a, float b) {\n#if defined(LUMA_FP64_CODE_ELIMINATION_WORKAROUND)\n  float sum = (a + b) * fp64.ONE;\n  float err = b - (sum - a) * fp64.ONE;\n#else\n  float sum = a + b;\n  float err = b - (sum - a);\n#endif\n  return vec2(sum, err);\n}\n\n// General sum operation\nvec2 twoSum(float a, float b) {\n  float s = (a + b);\n#if defined(LUMA_FP64_CODE_ELIMINATION_WORKAROUND)\n  float v = (s * fp64.ONE - a) * fp64.ONE;\n  float err = (a - (s - v) * fp64.ONE) * fp64.ONE * fp64.ONE * fp64.ONE + (b - v);\n#else\n  float v = s - a;\n  float err = (a - (s - v)) + (b - v);\n#endif\n  return vec2(s, err);\n}\n\nvec2 twoSub(float a, float b) {\n  float s = (a - b);\n#if defined(LUMA_FP64_CODE_ELIMINATION_WORKAROUND)\n  float v = (s * fp64.ONE - a) * fp64.ONE;\n  float err = (a - (s - v) * fp64.ONE) * fp64.ONE * fp64.ONE * fp64.ONE - (b + v);\n#else\n  float v = s - a;\n  float err = (a - (s - v)) - (b + v);\n#endif\n  return vec2(s, err);\n}\n\nvec2 twoSqr(float a) {\n  float prod = a * a;\n  vec2 a_fp64 = split(a);\n#if defined(LUMA_FP64_CODE_ELIMINATION_WORKAROUND)\n  float err = ((a_fp64.x * a_fp64.x - prod) * fp64.ONE + 2.0 * a_fp64.x *\n    a_fp64.y * fp64.ONE * fp64.ONE) + a_fp64.y * a_fp64.y * fp64.ONE * fp64.ONE * fp64.ONE;\n#else\n  float err = ((a_fp64.x * a_fp64.x - prod) + 2.0 * a_fp64.x * a_fp64.y) + a_fp64.y * a_fp64.y;\n#endif\n  return vec2(prod, err);\n}\n\nvec2 twoProd(float a, float b) {\n  float prod = a * b;\n  vec2 a_fp64 = split(a);\n  vec2 b_fp64 = split(b);\n  // twoProd is especially sensitive because mul_fp64 and div_fp64 both depend\n  // on the split terms and cross terms staying in the original evaluation\n  // order. If the compiler folds or reassociates them, the low part tends to\n  // collapse to zero or NaN on some drivers.\n  float highProduct = prevent_fp64_optimization(a_fp64.x * b_fp64.x);\n  float crossProduct1 = prevent_fp64_optimization(a_fp64.x * b_fp64.y);\n  float crossProduct2 = prevent_fp64_optimization(a_fp64.y * b_fp64.x);\n  float lowProduct = prevent_fp64_optimization(a_fp64.y * b_fp64.y);\n#if defined(LUMA_FP64_CODE_ELIMINATION_WORKAROUND)\n  float err1 = (highProduct - prod) * fp64.ONE;\n  float err2 = crossProduct1 * fp64.ONE * fp64.ONE;\n  float err3 = crossProduct2 * fp64.ONE * fp64.ONE * fp64.ONE;\n  float err4 = lowProduct * fp64.ONE * fp64.ONE * fp64.ONE * fp64.ONE;\n#else\n  float err1 = highProduct - prod;\n  float err2 = crossProduct1;\n  float err3 = crossProduct2;\n  float err4 = lowProduct;\n#endif\n  float err = ((err1 + err2) + err3) + err4;\n  return vec2(prod, err);\n}\n\nvec2 sum_fp64(vec2 a, vec2 b) {\n  vec2 s, t;\n  s = twoSum(a.x, b.x);\n  t = twoSum(a.y, b.y);\n  s.y += t.x;\n  s = quickTwoSum(s.x, s.y);\n  s.y += t.y;\n  s = quickTwoSum(s.x, s.y);\n  return s;\n}\n\nvec2 sub_fp64(vec2 a, vec2 b) {\n  vec2 s, t;\n  s = twoSub(a.x, b.x);\n  t = twoSub(a.y, b.y);\n  s.y += t.x;\n  s = quickTwoSum(s.x, s.y);\n  s.y += t.y;\n  s = quickTwoSum(s.x, s.y);\n  return s;\n}\n\nvec2 mul_fp64(vec2 a, vec2 b) {\n  vec2 prod = twoProd(a.x, b.x);\n  // y component is for the error\n  prod.y += a.x * b.y;\n#if defined(LUMA_FP64_HIGH_BITS_OVERFLOW_WORKAROUND)\n  prod = split2(prod);\n#endif\n  prod = quickTwoSum(prod.x, prod.y);\n  prod.y += a.y * b.x;\n#if defined(LUMA_FP64_HIGH_BITS_OVERFLOW_WORKAROUND)\n  prod = split2(prod);\n#endif\n  prod = quickTwoSum(prod.x, prod.y);\n  return prod;\n}\n\nvec2 div_fp64(vec2 a, vec2 b) {\n  float xn = 1.0 / b.x;\n#if defined(LUMA_FP64_HIGH_BITS_OVERFLOW_WORKAROUND)\n  vec2 yn = mul_fp64(a, vec2(xn, 0));\n#else\n  vec2 yn = a * xn;\n#endif\n  float diff = (sub_fp64(a, mul_fp64(b, yn))).x;\n  vec2 prod = twoProd(xn, diff);\n  return sum_fp64(yn, prod);\n}\n\nvec2 sqrt_fp64(vec2 a) {\n  if (a.x == 0.0 && a.y == 0.0) return vec2(0.0, 0.0);\n  if (a.x < 0.0) return vec2(0.0 / 0.0, 0.0 / 0.0);\n\n  float x = 1.0 / sqrt(a.x);\n  float yn = a.x * x;\n#if defined(LUMA_FP64_CODE_ELIMINATION_WORKAROUND)\n  vec2 yn_sqr = twoSqr(yn) * fp64.ONE;\n#else\n  vec2 yn_sqr = twoSqr(yn);\n#endif\n  float diff = sub_fp64(a, yn_sqr).x;\n  vec2 prod = twoProd(x * 0.5, diff);\n#if defined(LUMA_FP64_HIGH_BITS_OVERFLOW_WORKAROUND)\n  return sum_fp64(split(yn), prod);\n#else\n  return sum_fp64(vec2(yn, 0.0), prod);\n#endif\n}\n",
  wn = {
    name: "fp64arithmetic",
    source:
      "struct Fp64ArithmeticUniforms {\n  ONE: f32,\n  SPLIT: f32,\n};\n\n@group(0) @binding(auto) var<uniform> fp64arithmetic : Fp64ArithmeticUniforms;\n\nfn fp64_nan(seed: f32) -> f32 {\n  let nanBits = 0x7fc00000u | select(0u, 1u, seed < 0.0);\n  return bitcast<f32>(nanBits);\n}\n\nfn fp64_runtime_zero() -> f32 {\n  return fp64arithmetic.ONE * 0.0;\n}\n\nfn prevent_fp64_optimization(value: f32) -> f32 {\n#ifdef LUMA_FP64_CODE_ELIMINATION_WORKAROUND\n  return value + fp64_runtime_zero();\n#else\n  return value;\n#endif\n}\n\nfn split(a: f32) -> vec2f {\n  let splitValue = prevent_fp64_optimization(fp64arithmetic.SPLIT + fp64_runtime_zero());\n  let t = prevent_fp64_optimization(a * splitValue);\n  let temp = prevent_fp64_optimization(t - a);\n  let aHi = prevent_fp64_optimization(t - temp);\n  let aLo = prevent_fp64_optimization(a - aHi);\n  return vec2f(aHi, aLo);\n}\n\nfn split2(a: vec2f) -> vec2f {\n  var b = split(a.x);\n  b.y = b.y + a.y;\n  return b;\n}\n\nfn quickTwoSum(a: f32, b: f32) -> vec2f {\n#ifdef LUMA_FP64_CODE_ELIMINATION_WORKAROUND\n  let sum = prevent_fp64_optimization((a + b) * fp64arithmetic.ONE);\n  let err = prevent_fp64_optimization(b - (sum - a) * fp64arithmetic.ONE);\n#else\n  let sum = prevent_fp64_optimization(a + b);\n  let err = prevent_fp64_optimization(b - (sum - a));\n#endif\n  return vec2f(sum, err);\n}\n\nfn twoSum(a: f32, b: f32) -> vec2f {\n  let s = prevent_fp64_optimization(a + b);\n#ifdef LUMA_FP64_CODE_ELIMINATION_WORKAROUND\n  let v = prevent_fp64_optimization((s * fp64arithmetic.ONE - a) * fp64arithmetic.ONE);\n  let err =\n    prevent_fp64_optimization((a - (s - v) * fp64arithmetic.ONE) *\n      fp64arithmetic.ONE *\n      fp64arithmetic.ONE *\n      fp64arithmetic.ONE) +\n    prevent_fp64_optimization(b - v);\n#else\n  let v = prevent_fp64_optimization(s - a);\n  let err = prevent_fp64_optimization(a - (s - v)) + prevent_fp64_optimization(b - v);\n#endif\n  return vec2f(s, err);\n}\n\nfn twoSub(a: f32, b: f32) -> vec2f {\n  let s = prevent_fp64_optimization(a - b);\n#ifdef LUMA_FP64_CODE_ELIMINATION_WORKAROUND\n  let v = prevent_fp64_optimization((s * fp64arithmetic.ONE - a) * fp64arithmetic.ONE);\n  let err =\n    prevent_fp64_optimization((a - (s - v) * fp64arithmetic.ONE) *\n      fp64arithmetic.ONE *\n      fp64arithmetic.ONE *\n      fp64arithmetic.ONE) -\n    prevent_fp64_optimization(b + v);\n#else\n  let v = prevent_fp64_optimization(s - a);\n  let err = prevent_fp64_optimization(a - (s - v)) - prevent_fp64_optimization(b + v);\n#endif\n  return vec2f(s, err);\n}\n\nfn twoSqr(a: f32) -> vec2f {\n  let prod = prevent_fp64_optimization(a * a);\n  let aFp64 = split(a);\n  let highProduct = prevent_fp64_optimization(aFp64.x * aFp64.x);\n  let crossProduct = prevent_fp64_optimization(2.0 * aFp64.x * aFp64.y);\n  let lowProduct = prevent_fp64_optimization(aFp64.y * aFp64.y);\n#ifdef LUMA_FP64_CODE_ELIMINATION_WORKAROUND\n  let err =\n    (prevent_fp64_optimization(highProduct - prod) * fp64arithmetic.ONE +\n      crossProduct * fp64arithmetic.ONE * fp64arithmetic.ONE) +\n    lowProduct * fp64arithmetic.ONE * fp64arithmetic.ONE * fp64arithmetic.ONE;\n#else\n  let err = ((prevent_fp64_optimization(highProduct - prod) + crossProduct) + lowProduct);\n#endif\n  return vec2f(prod, err);\n}\n\nfn twoProd(a: f32, b: f32) -> vec2f {\n  let prod = prevent_fp64_optimization(a * b);\n  let aFp64 = split(a);\n  let bFp64 = split(b);\n  let highProduct = prevent_fp64_optimization(aFp64.x * bFp64.x);\n  let crossProduct1 = prevent_fp64_optimization(aFp64.x * bFp64.y);\n  let crossProduct2 = prevent_fp64_optimization(aFp64.y * bFp64.x);\n  let lowProduct = prevent_fp64_optimization(aFp64.y * bFp64.y);\n#ifdef LUMA_FP64_CODE_ELIMINATION_WORKAROUND\n  let err1 = (highProduct - prod) * fp64arithmetic.ONE;\n  let err2 = crossProduct1 * fp64arithmetic.ONE * fp64arithmetic.ONE;\n  let err3 = crossProduct2 * fp64arithmetic.ONE * fp64arithmetic.ONE * fp64arithmetic.ONE;\n  let err4 =\n    lowProduct *\n    fp64arithmetic.ONE *\n    fp64arithmetic.ONE *\n    fp64arithmetic.ONE *\n    fp64arithmetic.ONE;\n#else\n  let err1 = highProduct - prod;\n  let err2 = crossProduct1;\n  let err3 = crossProduct2;\n  let err4 = lowProduct;\n#endif\n  let err12InputA = prevent_fp64_optimization(err1);\n  let err12InputB = prevent_fp64_optimization(err2);\n  let err12 = prevent_fp64_optimization(err12InputA + err12InputB);\n  let err123InputA = prevent_fp64_optimization(err12);\n  let err123InputB = prevent_fp64_optimization(err3);\n  let err123 = prevent_fp64_optimization(err123InputA + err123InputB);\n  let err1234InputA = prevent_fp64_optimization(err123);\n  let err1234InputB = prevent_fp64_optimization(err4);\n  let err = prevent_fp64_optimization(err1234InputA + err1234InputB);\n  return vec2f(prod, err);\n}\n\nfn sum_fp64(a: vec2f, b: vec2f) -> vec2f {\n  var s = twoSum(a.x, b.x);\n  let t = twoSum(a.y, b.y);\n  s.y = prevent_fp64_optimization(s.y + t.x);\n  s = quickTwoSum(s.x, s.y);\n  s.y = prevent_fp64_optimization(s.y + t.y);\n  s = quickTwoSum(s.x, s.y);\n  return s;\n}\n\nfn sub_fp64(a: vec2f, b: vec2f) -> vec2f {\n  var s = twoSub(a.x, b.x);\n  let t = twoSub(a.y, b.y);\n  s.y = prevent_fp64_optimization(s.y + t.x);\n  s = quickTwoSum(s.x, s.y);\n  s.y = prevent_fp64_optimization(s.y + t.y);\n  s = quickTwoSum(s.x, s.y);\n  return s;\n}\n\nfn mul_fp64(a: vec2f, b: vec2f) -> vec2f {\n  var prod = twoProd(a.x, b.x);\n  let crossProduct1 = prevent_fp64_optimization(a.x * b.y);\n  prod.y = prevent_fp64_optimization(prod.y + crossProduct1);\n#ifdef LUMA_FP64_HIGH_BITS_OVERFLOW_WORKAROUND\n  prod = split2(prod);\n#endif\n  prod = quickTwoSum(prod.x, prod.y);\n  let crossProduct2 = prevent_fp64_optimization(a.y * b.x);\n  prod.y = prevent_fp64_optimization(prod.y + crossProduct2);\n#ifdef LUMA_FP64_HIGH_BITS_OVERFLOW_WORKAROUND\n  prod = split2(prod);\n#endif\n  prod = quickTwoSum(prod.x, prod.y);\n  return prod;\n}\n\nfn div_fp64(a: vec2f, b: vec2f) -> vec2f {\n  let xn = prevent_fp64_optimization(1.0 / b.x);\n  let yn = mul_fp64(a, vec2f(xn, fp64_runtime_zero()));\n  let diff = prevent_fp64_optimization(sub_fp64(a, mul_fp64(b, yn)).x);\n  let prod = twoProd(xn, diff);\n  return sum_fp64(yn, prod);\n}\n\nfn sqrt_fp64(a: vec2f) -> vec2f {\n  if (a.x == 0.0 && a.y == 0.0) {\n    return vec2f(0.0, 0.0);\n  }\n  if (a.x < 0.0) {\n    let nanValue = fp64_nan(a.x);\n    return vec2f(nanValue, nanValue);\n  }\n\n  let x = prevent_fp64_optimization(1.0 / sqrt(a.x));\n  let yn = prevent_fp64_optimization(a.x * x);\n#ifdef LUMA_FP64_CODE_ELIMINATION_WORKAROUND\n  let ynSqr = twoSqr(yn) * fp64arithmetic.ONE;\n#else\n  let ynSqr = twoSqr(yn);\n#endif\n  let diff = prevent_fp64_optimization(sub_fp64(a, ynSqr).x);\n  let prod = twoProd(prevent_fp64_optimization(x * 0.5), diff);\n#ifdef LUMA_FP64_HIGH_BITS_OVERFLOW_WORKAROUND\n  return sum_fp64(split(yn), prod);\n#else\n  return sum_fp64(vec2f(yn, 0.0), prod);\n#endif\n}\n",
    fs: Cn,
    vs: Cn,
    defaultUniforms: { ONE: 1, SPLIT: 4097 },
    uniformTypes: { ONE: "f32", SPLIT: "f32" },
    fp64ify: An,
    fp64LowPart: function (e) {
      return e - Math.fround(e);
    },
    fp64ifyMatrix4: function (e) {
      const t = new Float32Array(32);
      for (let r = 0; r < 4; ++r)
        for (let n = 0; n < 4; ++n) {
          const i = 4 * r + n;
          An(e[4 * n + r], t, 2 * i);
        }
      return t;
    },
  },
  Ln =
    "layout(std140) uniform floatColorsUniforms {\n  float useByteColors;\n} floatColors;\n\nvec3 floatColors_normalize(vec3 inputColor) {\n  return floatColors.useByteColors > 0.5 ? inputColor / 255.0 : inputColor;\n}\n\nvec4 floatColors_normalize(vec4 inputColor) {\n  return floatColors.useByteColors > 0.5 ? inputColor / 255.0 : inputColor;\n}\n\nvec4 floatColors_premultiplyAlpha(vec4 inputColor) {\n  return vec4(inputColor.rgb * inputColor.a, inputColor.a);\n}\n\nvec4 floatColors_unpremultiplyAlpha(vec4 inputColor) {\n  return inputColor.a > 0.0 ? vec4(inputColor.rgb / inputColor.a, inputColor.a) : vec4(0.0);\n}\n\nvec4 floatColors_premultiply_alpha(vec4 inputColor) {\n  return floatColors_premultiplyAlpha(inputColor);\n}\n\nvec4 floatColors_unpremultiply_alpha(vec4 inputColor) {\n  return floatColors_unpremultiplyAlpha(inputColor);\n}\n",
  On = {
    name: "floatColors",
    props: {},
    uniforms: {},
    vs: Ln,
    fs: Ln,
    source:
      "struct floatColorsUniforms {\n  useByteColors: f32\n};\n\n@group(0) @binding(auto) var<uniform> floatColors : floatColorsUniforms;\n\nfn floatColors_normalize(inputColor: vec3<f32>) -> vec3<f32> {\n  return select(inputColor, inputColor / 255.0, floatColors.useByteColors > 0.5);\n}\n\nfn floatColors_normalize4(inputColor: vec4<f32>) -> vec4<f32> {\n  return select(inputColor, inputColor / 255.0, floatColors.useByteColors > 0.5);\n}\n\nfn floatColors_premultiplyAlpha(inputColor: vec4<f32>) -> vec4<f32> {\n  return vec4<f32>(inputColor.rgb * inputColor.a, inputColor.a);\n}\n\nfn floatColors_unpremultiplyAlpha(inputColor: vec4<f32>) -> vec4<f32> {\n  return select(\n    vec4<f32>(0.0),\n    vec4<f32>(inputColor.rgb / inputColor.a, inputColor.a),\n    inputColor.a > 0.0\n  );\n}\n\nfn floatColors_premultiply_alpha(inputColor: vec4<f32>) -> vec4<f32> {\n  return floatColors_premultiplyAlpha(inputColor);\n}\n\nfn floatColors_unpremultiply_alpha(inputColor: vec4<f32>) -> vec4<f32> {\n  return floatColors_unpremultiplyAlpha(inputColor);\n}\n",
    uniformTypes: { useByteColors: "f32" },
    defaultUniforms: { useByteColors: !0 },
  },
  Nn = {
    props: {},
    uniforms: {},
    name: "picking",
    uniformTypes: {
      isActive: "f32",
      isAttribute: "f32",
      isHighlightActive: "f32",
      useByteColors: "f32",
      highlightedObjectColor: "vec3<f32>",
      highlightColor: "vec4<f32>",
    },
    defaultUniforms: {
      isActive: !1,
      isAttribute: !1,
      isHighlightActive: !1,
      useByteColors: !0,
      highlightedObjectColor: [0, 0, 0],
      highlightColor: [0, 1, 1, 1],
    },
    vs: "layout(std140) uniform pickingUniforms {\n  float isActive;\n  float isAttribute;\n  float isHighlightActive;\n  float useByteColors;\n  vec3 highlightedObjectColor;\n  vec4 highlightColor;\n} picking;\n\nout vec4 picking_vRGBcolor_Avalid;\n\n// Normalize unsigned byte color to 0-1 range\nvec3 picking_normalizeColor(vec3 color) {\n  return picking.useByteColors > 0.5 ? color / 255.0 : color;\n}\n\n// Normalize unsigned byte color to 0-1 range\nvec4 picking_normalizeColor(vec4 color) {\n  return picking.useByteColors > 0.5 ? color / 255.0 : color;\n}\n\nbool picking_isColorZero(vec3 color) {\n  return dot(color, vec3(1.0)) < 0.00001;\n}\n\nbool picking_isColorValid(vec3 color) {\n  return dot(color, vec3(1.0)) > 0.00001;\n}\n\n// Check if this vertex is highlighted \nbool isVertexHighlighted(vec3 vertexColor) {\n  vec3 highlightedObjectColor = picking_normalizeColor(picking.highlightedObjectColor);\n  return\n    bool(picking.isHighlightActive) && picking_isColorZero(abs(vertexColor - highlightedObjectColor));\n}\n\n// Set the current picking color\nvoid picking_setPickingColor(vec3 pickingColor) {\n  pickingColor = picking_normalizeColor(pickingColor);\n\n  if (bool(picking.isActive)) {\n    // Use alpha as the validity flag. If pickingColor is [0, 0, 0] fragment is non-pickable\n    picking_vRGBcolor_Avalid.a = float(picking_isColorValid(pickingColor));\n\n    if (!bool(picking.isAttribute)) {\n      // Stores the picking color so that the fragment shader can render it during picking\n      picking_vRGBcolor_Avalid.rgb = pickingColor;\n    }\n  } else {\n    // Do the comparison with selected item color in vertex shader as it should mean fewer compares\n    picking_vRGBcolor_Avalid.a = float(isVertexHighlighted(pickingColor));\n  }\n}\n\nvoid picking_setPickingAttribute(float value) {\n  if (bool(picking.isAttribute)) {\n    picking_vRGBcolor_Avalid.r = value;\n  }\n}\n\nvoid picking_setPickingAttribute(vec2 value) {\n  if (bool(picking.isAttribute)) {\n    picking_vRGBcolor_Avalid.rg = value;\n  }\n}\n\nvoid picking_setPickingAttribute(vec3 value) {\n  if (bool(picking.isAttribute)) {\n    picking_vRGBcolor_Avalid.rgb = value;\n  }\n}\n",
    fs: "layout(std140) uniform pickingUniforms {\n  float isActive;\n  float isAttribute;\n  float isHighlightActive;\n  float useByteColors;\n  vec3 highlightedObjectColor;\n  vec4 highlightColor;\n} picking;\n\nin vec4 picking_vRGBcolor_Avalid;\n\n/*\n * Returns highlight color if this item is selected.\n */\nvec4 picking_filterHighlightColor(vec4 color) {\n  // If we are still picking, we don't highlight\n  if (picking.isActive > 0.5) {\n    return color;\n  }\n\n  bool selected = bool(picking_vRGBcolor_Avalid.a);\n\n  if (selected) {\n    // Blend in highlight color based on its alpha value\n    float highLightAlpha = picking.highlightColor.a;\n    float blendedAlpha = highLightAlpha + color.a * (1.0 - highLightAlpha);\n    float highLightRatio = highLightAlpha / blendedAlpha;\n\n    vec3 blendedRGB = mix(color.rgb, picking.highlightColor.rgb, highLightRatio);\n    return vec4(blendedRGB, blendedAlpha);\n  } else {\n    return color;\n  }\n}\n\n/*\n * Returns picking color if picking enabled else unmodified argument.\n */\nvec4 picking_filterPickingColor(vec4 color) {\n  if (bool(picking.isActive)) {\n    if (picking_vRGBcolor_Avalid.a == 0.0) {\n      discard;\n    }\n    return picking_vRGBcolor_Avalid;\n  }\n  return color;\n}\n\n/*\n * Returns picking color if picking is enabled if not\n * highlight color if this item is selected, otherwise unmodified argument.\n */\nvec4 picking_filterColor(vec4 color) {\n  vec4 highlightColor = picking_filterHighlightColor(color);\n  return picking_filterPickingColor(highlightColor);\n}\n",
    getUniforms: function (e = {}, t) {
      const r = {},
        n = Rn(e.useByteColors, !0);
      return (
        void 0 === e.highlightedObjectColor ||
          (null === e.highlightedObjectColor
            ? (r.isHighlightActive = !1)
            : ((r.isHighlightActive = !0),
              (r.highlightedObjectColor = e.highlightedObjectColor.slice(
                0,
                3,
              )))),
        e.highlightColor &&
          (r.highlightColor = (function (e, t = !0) {
            const r = vn(e.slice(0, 3), t),
              n = Number.isFinite(e[3]),
              i = n ? e[3] : 1;
            return [r[0], r[1], r[2], t && n ? i / 255 : i];
          })(e.highlightColor, n)),
        void 0 !== e.isActive &&
          ((r.isActive = Boolean(e.isActive)),
          (r.isAttribute = Boolean(e.isAttribute))),
        void 0 !== e.useByteColors &&
          (r.useByteColors = Boolean(e.useByteColors)),
        r
      );
    },
  },
  xn = [
    "Adapter",
    "GPU",
    "GPU Type",
    "GPU Backend",
    "Frame Rate",
    "CPU Time",
    "GPU Time",
    "GPU Memory",
    "Buffer Memory",
    "Texture Memory",
    "Referenced Buffer Memory",
    "Referenced Texture Memory",
    "Swap Chain Texture",
  ],
  Pn = new WeakMap(),
  In = new WeakMap(),
  Mn = new (class {
    stats = new Map();
    getStats(e) {
      return this.get(e);
    }
    get(e) {
      this.stats.has(e) || this.stats.set(e, new te({ id: e }));
      const t = this.stats.get(e);
      return (
        "GPU Time and Memory" === e &&
          (function (e, t) {
            const r = e.stats;
            let n = !1;
            for (const c of t) r[c] || (e.get(c), (n = !0));
            const i = Object.keys(r).length,
              s = Pn.get(e);
            if (!n && s?.orderedStatNames === t && s.statCount === i) return;
            const o = {};
            let a = In.get(t);
            a || ((a = new Set(t)), In.set(t, a));
            for (const c of t) r[c] && (o[c] = r[c]);
            for (const [c, l] of Object.entries(r)) a.has(c) || (o[c] = l);
            for (const c of Object.keys(r)) delete r[c];
            (Object.assign(r, o),
              Pn.set(e, { orderedStatNames: t, statCount: i }));
          })(t, xn),
        t
      );
    }
  })(),
  Bn = new y({ id: "luma.gl" }),
  Dn = {};
function Fn(e = "id") {
  return ((Dn[e] = Dn[e] || 1), `${e}-${Dn[e]++}`);
}
var Un = "GPU Resource Counts",
  Gn = "Resource Counts",
  kn = "GPU Time and Memory",
  Wn = [
    "Resources",
    "Buffers",
    "Textures",
    "Samplers",
    "TextureViews",
    "Framebuffers",
    "QuerySets",
    "Shaders",
    "RenderPipelines",
    "ComputePipelines",
    "PipelineLayouts",
    "VertexArrays",
    "RenderPasss",
    "ComputePasss",
    "CommandEncoders",
    "CommandBuffers",
  ].flatMap((e) => [`${e} Created`, `${e} Active`]),
  $n = [
    "Resources",
    "Buffers",
    "Textures",
    "Samplers",
    "TextureViews",
    "Framebuffers",
    "QuerySets",
    "Shaders",
    "RenderPipelines",
    "SharedRenderPipelines",
    "ComputePipelines",
    "PipelineLayouts",
    "VertexArrays",
    "RenderPasss",
    "ComputePasss",
    "CommandEncoders",
    "CommandBuffers",
  ].flatMap((e) => [`${e} Created`, `${e} Active`]),
  Hn = new WeakMap(),
  Vn = new WeakMap(),
  zn = class {
    static defaultProps = { id: "undefined", handle: void 0, userData: void 0 };
    toString() {
      return `${this[Symbol.toStringTag] || this.constructor.name}:"${this.id}"`;
    }
    id;
    props;
    userData = {};
    _device;
    destroyed = !1;
    allocatedBytes = 0;
    allocatedBytesName = null;
    _attachedResources = new Set();
    constructor(e, t, r) {
      if (!e) throw new Error("no device");
      ((this._device = e),
        (this.props = (function (e, t) {
          const r = { ...t };
          for (const n in e) void 0 !== e[n] && (r[n] = e[n]);
          return r;
        })(t, r)));
      const n =
        "undefined" !== this.props.id
          ? this.props.id
          : Fn(this[Symbol.toStringTag]);
      ((this.props.id = n),
        (this.id = n),
        (this.userData = this.props.userData || {}),
        this.addStats());
    }
    destroy() {
      this.destroyed || this.destroyResource();
    }
    delete() {
      return (this.destroy(), this);
    }
    getProps() {
      return this.props;
    }
    attachResource(e) {
      this._attachedResources.add(e);
    }
    detachResource(e) {
      this._attachedResources.delete(e);
    }
    destroyAttachedResource(e) {
      this._attachedResources.delete(e) && e.destroy();
    }
    destroyAttachedResources() {
      for (const e of this._attachedResources) e.destroy();
      this._attachedResources = new Set();
    }
    destroyResource() {
      this.destroyed ||
        (this.destroyAttachedResources(),
        this.removeStats(),
        (this.destroyed = !0));
    }
    removeStats() {
      const e = Kn(this._device),
        t = e ? Yn() : 0,
        r = [
          this._device.statsManager.getStats(Un),
          this._device.statsManager.getStats(Gn),
        ],
        n = jn(this._device);
      for (const s of r) Xn(s, n);
      const i = this.getStatsName();
      for (const s of r)
        (s.get("Resources Active").decrementCount(),
          s.get(`${i}s Active`).decrementCount());
      e &&
        ((e.statsBookkeepingCalls = (e.statsBookkeepingCalls || 0) + 1),
        (e.statsBookkeepingTimeMs =
          (e.statsBookkeepingTimeMs || 0) + (Yn() - t)));
    }
    trackAllocatedMemory(e, t = this.getStatsName()) {
      const r = Kn(this._device),
        n = r ? Yn() : 0,
        i = this._device.statsManager.getStats(kn);
      (this.allocatedBytes > 0 &&
        this.allocatedBytesName &&
        (i.get("GPU Memory").subtractCount(this.allocatedBytes),
        i
          .get(`${this.allocatedBytesName} Memory`)
          .subtractCount(this.allocatedBytes)),
        i.get("GPU Memory").addCount(e),
        i.get(`${t} Memory`).addCount(e),
        r &&
          ((r.statsBookkeepingCalls = (r.statsBookkeepingCalls || 0) + 1),
          (r.statsBookkeepingTimeMs =
            (r.statsBookkeepingTimeMs || 0) + (Yn() - n))),
        (this.allocatedBytes = e),
        (this.allocatedBytesName = t));
    }
    trackReferencedMemory(e, t = this.getStatsName()) {
      this.trackAllocatedMemory(e, `Referenced ${t}`);
    }
    trackDeallocatedMemory(e = this.getStatsName()) {
      if (0 === this.allocatedBytes)
        return void (this.allocatedBytesName = null);
      const t = Kn(this._device),
        r = t ? Yn() : 0,
        n = this._device.statsManager.getStats(kn);
      (n.get("GPU Memory").subtractCount(this.allocatedBytes),
        n
          .get(`${this.allocatedBytesName || e} Memory`)
          .subtractCount(this.allocatedBytes),
        t &&
          ((t.statsBookkeepingCalls = (t.statsBookkeepingCalls || 0) + 1),
          (t.statsBookkeepingTimeMs =
            (t.statsBookkeepingTimeMs || 0) + (Yn() - r))),
        (this.allocatedBytes = 0),
        (this.allocatedBytesName = null));
    }
    trackDeallocatedReferencedMemory(e = this.getStatsName()) {
      this.trackDeallocatedMemory(`Referenced ${e}`);
    }
    addStats() {
      const e = this.getStatsName(),
        t = Kn(this._device),
        r = t ? Yn() : 0,
        n = [
          this._device.statsManager.getStats(Un),
          this._device.statsManager.getStats(Gn),
        ],
        i = jn(this._device);
      for (const s of n) Xn(s, i);
      for (const s of n)
        (s.get("Resources Created").incrementCount(),
          s.get("Resources Active").incrementCount(),
          s.get(`${e}s Created`).incrementCount(),
          s.get(`${e}s Active`).incrementCount());
      (t &&
        ((t.statsBookkeepingCalls = (t.statsBookkeepingCalls || 0) + 1),
        (t.statsBookkeepingTimeMs =
          (t.statsBookkeepingTimeMs || 0) + (Yn() - r))),
        (function (e, t) {
          const r = Kn(e);
          if (r && r.activeDefaultFramebufferAcquireDepth)
            switch (
              ((r.transientCanvasResourceCreates =
                (r.transientCanvasResourceCreates || 0) + 1),
              t)
            ) {
              case "Texture":
                r.transientCanvasTextureCreates =
                  (r.transientCanvasTextureCreates || 0) + 1;
                break;
              case "TextureView":
                r.transientCanvasTextureViewCreates =
                  (r.transientCanvasTextureViewCreates || 0) + 1;
                break;
              case "Sampler":
                r.transientCanvasSamplerCreates =
                  (r.transientCanvasSamplerCreates || 0) + 1;
                break;
              case "Framebuffer":
                r.transientCanvasFramebufferCreates =
                  (r.transientCanvasFramebufferCreates || 0) + 1;
            }
        })(this._device, e));
    }
    getStatsName() {
      return (function (e) {
        let t = Object.getPrototypeOf(e);
        for (; t; ) {
          const r = Object.getPrototypeOf(t);
          if (!r || r === zn.prototype)
            return Qn(t) || e[Symbol.toStringTag] || e.constructor.name;
          t = r;
        }
        return e[Symbol.toStringTag] || e.constructor.name;
      })(this);
    }
  };
function Xn(e, t) {
  const r = e.stats;
  let n = !1;
  for (const c of t) r[c] || (e.get(c), (n = !0));
  const i = Object.keys(r).length,
    s = Hn.get(e);
  if (!n && s?.orderedStatNames === t && s.statCount === i) return;
  const o = {};
  let a = Vn.get(t);
  a || ((a = new Set(t)), Vn.set(t, a));
  for (const c of t) r[c] && (o[c] = r[c]);
  for (const [c, l] of Object.entries(r)) a.has(c) || (o[c] = l);
  for (const c of Object.keys(r)) delete r[c];
  (Object.assign(r, o), Hn.set(e, { orderedStatNames: t, statCount: i }));
}
function jn(e) {
  return "webgl" === e.type ? $n : Wn;
}
function Kn(e) {
  const t = e.userData["cpu-hotspot-profiler"];
  return t?.enabled ? t : null;
}
function Yn() {
  return globalThis.performance?.now?.() ?? Date.now();
}
function Qn(e) {
  const t = Object.getOwnPropertyDescriptor(e, Symbol.toStringTag);
  return "function" == typeof t?.get
    ? t.get.call(e)
    : "string" == typeof t?.value
      ? t.value
      : null;
}
var qn = class e extends zn {
    static INDEX = 16;
    static VERTEX = 32;
    static UNIFORM = 64;
    static STORAGE = 128;
    static INDIRECT = 256;
    static QUERY_RESOLVE = 512;
    static MAP_READ = 1;
    static MAP_WRITE = 2;
    static COPY_SRC = 4;
    static COPY_DST = 8;
    get [Symbol.toStringTag]() {
      return "Buffer";
    }
    usage;
    indexType;
    updateTimestamp;
    constructor(t, r) {
      const n = { ...r };
      ((r.usage || 0) & e.INDEX &&
        !r.indexType &&
        (r.data instanceof Uint32Array
          ? (n.indexType = "uint32")
          : r.data instanceof Uint16Array
            ? (n.indexType = "uint16")
            : r.data instanceof Uint8Array && (n.indexType = "uint8")),
        delete n.data,
        super(t, n, e.defaultProps),
        (this.usage = n.usage || 0),
        (this.indexType = n.indexType),
        (this.updateTimestamp = t.incrementTimestamp()));
    }
    clone(e) {
      return this.device.createBuffer({ ...this.props, ...e });
    }
    static DEBUG_DATA_MAX_LENGTH = 32;
    debugData = new ArrayBuffer(0);
    _setDebugData(t, r, n) {
      let i,
        s = null;
      ArrayBuffer.isView(t) ? ((s = t), (i = t.buffer)) : (i = t);
      const o = Math.min(t ? t.byteLength : n, e.DEBUG_DATA_MAX_LENGTH);
      if (null === i) this.debugData = new ArrayBuffer(o);
      else {
        const e = Math.min(s?.byteOffset || 0, i.byteLength),
          t = Math.max(0, i.byteLength - e),
          r = Math.min(o, t);
        this.debugData = new Uint8Array(i, e, r).slice().buffer;
      }
    }
    static defaultProps = {
      ...zn.defaultProps,
      usage: 0,
      byteLength: 0,
      byteOffset: 0,
      data: null,
      indexType: "uint16",
      onMapped: void 0,
    };
  },
  Zn = new (class {
    getDataTypeInfo(e) {
      const [t, r, n] = Jn[e],
        i = e.includes("norm");
      return {
        signedType: t,
        primitiveType: r,
        byteLength: n,
        normalized: i,
        integer: !i && !e.startsWith("float"),
        signed: e.startsWith("s"),
      };
    }
    getNormalizedDataType(e) {
      const t = e;
      switch (t) {
        case "uint8":
          return "unorm8";
        case "sint8":
          return "snorm8";
        case "uint16":
          return "unorm16";
        case "sint16":
          return "snorm16";
        default:
          return t;
      }
    }
    alignTo(e, t) {
      switch (t) {
        case 1:
          return e;
        case 2:
          return e + (e % 2);
        default:
          return e + ((4 - (e % 4)) % 4);
      }
    }
    getDataType(e) {
      const t = ArrayBuffer.isView(e) ? e.constructor : e;
      if (t === Uint8ClampedArray) return "uint8";
      const r = Object.values(Jn).find((e) => t === e[4]);
      if (!r) throw new Error(t.name);
      return r[0];
    }
    getTypedArrayConstructor(e) {
      const [, , , , t] = Jn[e];
      return t;
    }
  })(),
  Jn = {
    uint8: ["uint8", "u32", 1, !1, Uint8Array],
    sint8: ["sint8", "i32", 1, !1, Int8Array],
    unorm8: ["uint8", "f32", 1, !0, Uint8Array],
    snorm8: ["sint8", "f32", 1, !0, Int8Array],
    uint16: ["uint16", "u32", 2, !1, Uint16Array],
    sint16: ["sint16", "i32", 2, !1, Int16Array],
    unorm16: ["uint16", "u32", 2, !0, Uint16Array],
    snorm16: ["sint16", "i32", 2, !0, Int16Array],
    float16: ["float16", "f16", 2, !1, Uint16Array],
    float32: ["float32", "f32", 4, !1, Float32Array],
    uint32: ["uint32", "u32", 4, !1, Uint32Array],
    sint32: ["sint32", "i32", 4, !1, Int32Array],
  },
  ei = new (class {
    getVertexFormatInfo(e) {
      let t;
      e.endsWith("-webgl") && (e.replace("-webgl", ""), (t = !0));
      const [r, n] = e.split("x"),
        i = r,
        s = n ? parseInt(n) : 1,
        o = Zn.getDataTypeInfo(i),
        a = {
          type: i,
          components: s,
          byteLength: o.byteLength * s,
          integer: o.integer,
          signed: o.signed,
          normalized: o.normalized,
        };
      return (t && (a.webglOnly = !0), a);
    }
    makeVertexFormat(e, t, r) {
      const n = r ? Zn.getNormalizedDataType(e) : e;
      switch (n) {
        case "unorm8":
          return 1 === t ? "unorm8" : 3 === t ? "unorm8x3-webgl" : `${n}x${t}`;
        case "snorm8":
          return 1 === t ? "snorm8" : 3 === t ? "snorm8x3-webgl" : `${n}x${t}`;
        case "uint8":
        case "sint8":
        case "float16":
          if (1 === t || 3 === t) throw new Error(`size: ${t}`);
          return `${n}x${t}`;
        case "uint16":
          return 1 === t ? "uint16" : 3 === t ? "uint16x3-webgl" : `${n}x${t}`;
        case "sint16":
          return 1 === t ? "sint16" : 3 === t ? "sint16x3-webgl" : `${n}x${t}`;
        case "unorm16":
          return 1 === t
            ? "unorm16"
            : 3 === t
              ? "unorm16x3-webgl"
              : `${n}x${t}`;
        case "snorm16":
          return 1 === t
            ? "snorm16"
            : 3 === t
              ? "snorm16x3-webgl"
              : `${n}x${t}`;
        default:
          return 1 === t ? n : `${n}x${t}`;
      }
    }
    getVertexFormatFromAttribute(e, t, r) {
      if (!t || t > 4) throw new Error(`size ${t}`);
      const n = t,
        i = Zn.getDataType(e);
      return this.makeVertexFormat(i, n, r);
    }
    getCompatibleVertexFormat(e) {
      let t;
      switch (e.primitiveType) {
        case "f32":
          t = "float32";
          break;
        case "i32":
          t = "sint32";
          break;
        case "u32":
          t = "uint32";
          break;
        case "f16":
          return e.components <= 2 ? "float16x2" : "float16x4";
      }
      return 1 === e.components ? t : `${t}x${e.components}`;
    }
  })(),
  ti = "texture-compression-bc",
  ri = "texture-compression-astc",
  ni = "texture-compression-etc2",
  ii = "texture-compression-pvrtc-webgl",
  si = "texture-compression-atc-webgl",
  oi = "float32-renderable-webgl",
  ai = "float16-renderable-webgl",
  ci = "snorm8-renderable-webgl",
  li = "norm16-webgl",
  ui = "norm16-renderable-webgl",
  hi = "snorm16-renderable-webgl",
  di = "float32-filterable",
  fi = "float16-filterable-webgl";
function pi(e) {
  const t = gi[e];
  if (!t) throw new Error(`Unsupported texture format ${e}`);
  return t;
}
var gi = {
    r8unorm: {},
    rg8unorm: {},
    "rgb8unorm-webgl": {},
    rgba8unorm: {},
    "rgba8unorm-srgb": {},
    r8snorm: { render: ci },
    rg8snorm: { render: ci },
    "rgb8snorm-webgl": {},
    rgba8snorm: { render: ci },
    r8uint: {},
    rg8uint: {},
    rgba8uint: {},
    r8sint: {},
    rg8sint: {},
    rgba8sint: {},
    bgra8unorm: {},
    "bgra8unorm-srgb": {},
    r16unorm: { f: li, render: ui },
    rg16unorm: { f: li, render: ui },
    "rgb16unorm-webgl": { f: li, render: !1 },
    rgba16unorm: { f: li, render: ui },
    r16snorm: { f: li, render: hi },
    rg16snorm: { f: li, render: hi },
    "rgb16snorm-webgl": { f: li, render: !1 },
    rgba16snorm: { f: li, render: hi },
    r16uint: {},
    rg16uint: {},
    rgba16uint: {},
    r16sint: {},
    rg16sint: {},
    rgba16sint: {},
    r16float: { render: ai, filter: "float16-filterable-webgl" },
    rg16float: { render: ai, filter: fi },
    rgba16float: { render: ai, filter: fi },
    r32uint: {},
    rg32uint: {},
    rgba32uint: {},
    r32sint: {},
    rg32sint: {},
    rgba32sint: {},
    r32float: { render: oi, filter: di },
    rg32float: { render: !1, filter: di },
    "rgb32float-webgl": { render: oi, filter: di },
    rgba32float: { render: oi, filter: di },
    "rgba4unorm-webgl": {
      channels: "rgba",
      bitsPerChannel: [4, 4, 4, 4],
      packed: !0,
    },
    "rgb565unorm-webgl": {
      channels: "rgb",
      bitsPerChannel: [5, 6, 5, 0],
      packed: !0,
    },
    "rgb5a1unorm-webgl": {
      channels: "rgba",
      bitsPerChannel: [5, 5, 5, 1],
      packed: !0,
    },
    rgb9e5ufloat: {
      channels: "rgb",
      packed: !0,
      render: "rgb9e5ufloat-renderable-webgl",
    },
    rg11b10ufloat: {
      channels: "rgb",
      bitsPerChannel: [11, 11, 10, 0],
      packed: !0,
      p: 1,
      render: oi,
    },
    rgb10a2unorm: {
      channels: "rgba",
      bitsPerChannel: [10, 10, 10, 2],
      packed: !0,
      p: 1,
    },
    rgb10a2uint: {
      channels: "rgba",
      bitsPerChannel: [10, 10, 10, 2],
      packed: !0,
      p: 1,
    },
    stencil8: {
      attachment: "stencil",
      bitsPerChannel: [8, 0, 0, 0],
      dataType: "uint8",
    },
    depth16unorm: {
      attachment: "depth",
      bitsPerChannel: [16, 0, 0, 0],
      dataType: "uint16",
    },
    depth24plus: {
      attachment: "depth",
      bitsPerChannel: [24, 0, 0, 0],
      dataType: "uint32",
    },
    depth32float: {
      attachment: "depth",
      bitsPerChannel: [32, 0, 0, 0],
      dataType: "float32",
    },
    "depth24plus-stencil8": {
      attachment: "depth-stencil",
      bitsPerChannel: [24, 8, 0, 0],
      packed: !0,
    },
    "depth32float-stencil8": {
      attachment: "depth-stencil",
      bitsPerChannel: [32, 8, 0, 0],
      packed: !0,
    },
    "bc1-rgb-unorm-webgl": { f: ti },
    "bc1-rgb-unorm-srgb-webgl": { f: ti },
    "bc1-rgba-unorm": { f: ti },
    "bc1-rgba-unorm-srgb": { f: ti },
    "bc2-rgba-unorm": { f: ti },
    "bc2-rgba-unorm-srgb": { f: ti },
    "bc3-rgba-unorm": { f: ti },
    "bc3-rgba-unorm-srgb": { f: ti },
    "bc4-r-unorm": { f: ti },
    "bc4-r-snorm": { f: ti },
    "bc5-rg-unorm": { f: ti },
    "bc5-rg-snorm": { f: ti },
    "bc6h-rgb-ufloat": { f: ti },
    "bc6h-rgb-float": { f: ti },
    "bc7-rgba-unorm": { f: ti },
    "bc7-rgba-unorm-srgb": { f: ti },
    "etc2-rgb8unorm": { f: ni },
    "etc2-rgb8unorm-srgb": { f: ni },
    "etc2-rgb8a1unorm": { f: ni },
    "etc2-rgb8a1unorm-srgb": { f: ni },
    "etc2-rgba8unorm": { f: ni },
    "etc2-rgba8unorm-srgb": { f: ni },
    "eac-r11unorm": { f: ni },
    "eac-r11snorm": { f: ni },
    "eac-rg11unorm": { f: ni },
    "eac-rg11snorm": { f: ni },
    "astc-4x4-unorm": { f: ri },
    "astc-4x4-unorm-srgb": { f: ri },
    "astc-5x4-unorm": { f: ri },
    "astc-5x4-unorm-srgb": { f: ri },
    "astc-5x5-unorm": { f: ri },
    "astc-5x5-unorm-srgb": { f: ri },
    "astc-6x5-unorm": { f: ri },
    "astc-6x5-unorm-srgb": { f: ri },
    "astc-6x6-unorm": { f: ri },
    "astc-6x6-unorm-srgb": { f: ri },
    "astc-8x5-unorm": { f: ri },
    "astc-8x5-unorm-srgb": { f: ri },
    "astc-8x6-unorm": { f: ri },
    "astc-8x6-unorm-srgb": { f: ri },
    "astc-8x8-unorm": { f: ri },
    "astc-8x8-unorm-srgb": { f: ri },
    "astc-10x5-unorm": { f: ri },
    "astc-10x5-unorm-srgb": { f: ri },
    "astc-10x6-unorm": { f: ri },
    "astc-10x6-unorm-srgb": { f: ri },
    "astc-10x8-unorm": { f: ri },
    "astc-10x8-unorm-srgb": { f: ri },
    "astc-10x10-unorm": { f: ri },
    "astc-10x10-unorm-srgb": { f: ri },
    "astc-12x10-unorm": { f: ri },
    "astc-12x10-unorm-srgb": { f: ri },
    "astc-12x12-unorm": { f: ri },
    "astc-12x12-unorm-srgb": { f: ri },
    "pvrtc-rgb4unorm-webgl": { f: ii },
    "pvrtc-rgba4unorm-webgl": { f: ii },
    "pvrtc-rgb2unorm-webgl": { f: ii },
    "pvrtc-rgba2unorm-webgl": { f: ii },
    "etc1-rbg-unorm-webgl": { f: "texture-compression-etc1-webgl" },
    "atc-rgb-unorm-webgl": { f: si },
    "atc-rgba-unorm-webgl": { f: si },
    "atc-rgbai-unorm-webgl": { f: si },
  },
  mi = /^(r|rg|rgb|rgba|bgra)([0-9]*)([a-z]*)(-srgb)?(-webgl)?$/,
  _i = ["rgb", "rgba", "bgra"],
  Ei = ["depth", "stencil"],
  bi = [
    "bc1",
    "bc2",
    "bc3",
    "bc4",
    "bc5",
    "bc6",
    "bc7",
    "etc1",
    "etc2",
    "eac",
    "atc",
    "astc",
    "pvrtc",
  ],
  yi = new (class {
    isColor(e) {
      return _i.some((t) => e.startsWith(t));
    }
    isDepthStencil(e) {
      return Ei.some((t) => e.startsWith(t));
    }
    isCompressed(e) {
      return bi.some((t) => e.startsWith(t));
    }
    getInfo(e) {
      return Ti(e);
    }
    getCapabilities(e) {
      return (function (e) {
        const t = pi(e),
          r = {
            format: e,
            create: t.f ?? !0,
            render: t.render ?? !0,
            filter: t.filter ?? !0,
            blend: t.blend ?? !0,
            store: t.store ?? !0,
          },
          n = Ti(e),
          i = e.startsWith("depth") || e.startsWith("stencil"),
          s = n?.signed,
          o = n?.integer,
          a = n?.webgl,
          c = Boolean(n?.compressed);
        return ((r.render &&= !i && !c), (r.filter &&= !(i || s || o || a)), r);
      })(e);
    }
    computeMemoryLayout(e) {
      return (function ({
        format: e,
        width: t,
        height: r,
        depth: n,
        byteAlignment: i,
      }) {
        const {
            bytesPerPixel: s,
            bytesPerBlock: o = s,
            blockWidth: a = 1,
            blockHeight: c = 1,
            compressed: l = !1,
          } = yi.getInfo(e),
          u = l ? Math.ceil(t / a) : t,
          h = l ? Math.ceil(r / c) : r,
          d = u * o,
          f = Math.ceil(d / i) * i;
        return {
          bytesPerPixel: s,
          bytesPerRow: f,
          rowsPerImage: h,
          depthOrArrayLayers: n,
          bytesPerImage: f * h,
          byteLength: f * h * n,
        };
      })(e);
    }
  })();
function Ti(e) {
  let t = (function (e) {
    const t = pi(e),
      r = t.bytesPerPixel || 1,
      n = t.bitsPerChannel || [8, 8, 8, 8];
    return (
      delete t.bitsPerChannel,
      delete t.bytesPerPixel,
      delete t.f,
      delete t.render,
      delete t.filter,
      delete t.blend,
      delete t.store,
      {
        ...t,
        format: e,
        attachment: t.attachment || "color",
        channels: t.channels || "r",
        components: t.components || t.channels?.length || 1,
        bytesPerPixel: r,
        bitsPerChannel: n,
        dataType: t.dataType || "uint8",
        srgb: t.srgb ?? !1,
        packed: t.packed ?? !1,
        webgl: t.webgl ?? !1,
        integer: t.integer ?? !1,
        signed: t.signed ?? !1,
        normalized: t.normalized ?? !1,
        compressed: t.compressed ?? !1,
      }
    );
  })(e);
  if (yi.isCompressed(e)) {
    ((t.channels = "rgb"),
      (t.components = 3),
      (t.bytesPerPixel = 1),
      (t.srgb = !1),
      (t.compressed = !0),
      (t.bytesPerBlock = (function (e) {
        return e.startsWith("bc1") ||
          e.startsWith("bc4") ||
          e.startsWith("etc1") ||
          e.startsWith("etc2-rgb8") ||
          e.startsWith("etc2-rgb8a1") ||
          e.startsWith("eac-r11") ||
          "atc-rgb-unorm-webgl" === e
          ? 8
          : e.startsWith("bc2") ||
              e.startsWith("bc3") ||
              e.startsWith("bc5") ||
              e.startsWith("bc6h") ||
              e.startsWith("bc7") ||
              e.startsWith("etc2-rgba8") ||
              e.startsWith("eac-rg11") ||
              e.startsWith("astc") ||
              "atc-rgba-unorm-webgl" === e ||
              "atc-rgbai-unorm-webgl" === e
            ? 16
            : e.startsWith("pvrtc")
              ? 8
              : 16;
      })(e)));
    const r = (function (e) {
      const t = /.*-(\d+)x(\d+)-.*/.exec(e);
      if (t) {
        const [, e, r] = t;
        return { blockWidth: Number(e), blockHeight: Number(r) };
      }
      return e.startsWith("bc") ||
        e.startsWith("etc1") ||
        e.startsWith("etc2") ||
        e.startsWith("eac") ||
        e.startsWith("atc") ||
        e.startsWith("pvrtc-rgb4") ||
        e.startsWith("pvrtc-rgba4")
        ? { blockWidth: 4, blockHeight: 4 }
        : e.startsWith("pvrtc-rgb2") || e.startsWith("pvrtc-rgba2")
          ? { blockWidth: 8, blockHeight: 4 }
          : null;
    })(e);
    r && ((t.blockWidth = r.blockWidth), (t.blockHeight = r.blockHeight));
  }
  const r = t.packed ? null : mi.exec(e);
  if (r) {
    const [, n, i, s, o, a] = r,
      c = `${s}${i}`,
      l = Zn.getDataTypeInfo(c),
      u = 8 * l.byteLength,
      h = n?.length ?? 1,
      d = [u, h >= 2 ? u : 0, h >= 3 ? u : 0, h >= 4 ? u : 0];
    ((t = {
      format: e,
      attachment: t.attachment,
      dataType: l.signedType,
      components: h,
      channels: n,
      integer: l.integer,
      signed: l.signed,
      normalized: l.normalized,
      bitsPerChannel: d,
      bytesPerPixel: l.byteLength * h,
      packed: t.packed,
      srgb: t.srgb,
    }),
      "-webgl" === a && (t.webgl = !0),
      "-srgb" === o && (t.srgb = !0));
  }
  return (
    e.endsWith("-webgl") && (t.webgl = !0),
    e.endsWith("-srgb") && (t.srgb = !0),
    t
  );
}
function Ai(e) {
  return (
    ("undefined" != typeof ImageData && e instanceof ImageData) ||
    ("undefined" != typeof ImageBitmap && e instanceof ImageBitmap) ||
    ("undefined" != typeof HTMLImageElement && e instanceof HTMLImageElement) ||
    ("undefined" != typeof HTMLVideoElement && e instanceof HTMLVideoElement) ||
    ("undefined" != typeof VideoFrame && e instanceof VideoFrame) ||
    ("undefined" != typeof HTMLCanvasElement &&
      e instanceof HTMLCanvasElement) ||
    ("undefined" != typeof OffscreenCanvas && e instanceof OffscreenCanvas)
  );
}
function Ri(e) {
  if (
    ("undefined" != typeof ImageData && e instanceof ImageData) ||
    ("undefined" != typeof ImageBitmap && e instanceof ImageBitmap) ||
    ("undefined" != typeof HTMLCanvasElement &&
      e instanceof HTMLCanvasElement) ||
    ("undefined" != typeof OffscreenCanvas && e instanceof OffscreenCanvas)
  )
    return { width: e.width, height: e.height };
  if ("undefined" != typeof HTMLImageElement && e instanceof HTMLImageElement)
    return { width: e.naturalWidth, height: e.naturalHeight };
  if ("undefined" != typeof HTMLVideoElement && e instanceof HTMLVideoElement)
    return { width: e.videoWidth, height: e.videoHeight };
  if ("undefined" != typeof VideoFrame && e instanceof VideoFrame)
    return { width: e.displayWidth, height: e.displayHeight };
  throw new Error("Unknown image type");
}
var vi = class {};
function Si(e) {
  if (void 0 !== e) {
    if (
      null === e ||
      "string" == typeof e ||
      "number" == typeof e ||
      "boolean" == typeof e
    )
      return e;
    if (e instanceof Error) return e.message;
    if (Array.isArray(e)) return e.map(Si);
    if ("object" == typeof e) {
      if (
        (function (e) {
          return (
            "toString" in e &&
            "function" == typeof e.toString &&
            e.toString !== Object.prototype.toString
          );
        })(e)
      ) {
        const t = String(e);
        if ("[object Object]" !== t) return t;
      }
      return (function (e) {
        return "message" in e && "type" in e;
      })(e)
        ? (function (e) {
            const t = "string" == typeof e.type ? e.type : "message",
              r = "string" == typeof e.message ? e.message : "",
              n = "number" == typeof e.lineNum ? e.lineNum : null,
              i = "number" == typeof e.linePos ? e.linePos : null;
            return `${t}${null !== n && null !== i ? ` @ ${n}:${i}` : null !== n ? ` @ ${n}` : ""}: ${r}`.trim();
          })(e)
        : e.constructor?.name || "Object";
    }
    return String(e);
  }
}
var Ci = class {
    features;
    disabledFeatures;
    constructor(e = [], t) {
      ((this.features = new Set(e)), (this.disabledFeatures = t || {}));
    }
    *[Symbol.iterator]() {
      yield* this.features;
    }
    has(e) {
      return !this.disabledFeatures?.[e] && this.features.has(e);
    }
  },
  wi = class e {
    static defaultProps = {
      id: null,
      powerPreference: "high-performance",
      failIfMajorPerformanceCaveat: !1,
      createCanvasContext: void 0,
      webgl: {},
      onError: (e, t) => {},
      onResize: (e, t) => {
        const [r, n] = e.getDevicePixelSize();
        Bn.log(1, `${e} resized => ${r}x${n}px`)();
      },
      onPositionChange: (e, t) => {
        const [r, n] = e.getPosition();
        Bn.log(1, `${e} repositioned => ${r},${n}`)();
      },
      onVisibilityChange: (e) =>
        Bn.log(1, `${e} Visibility changed ${e.isVisible}`)(),
      onDevicePixelRatioChange: (e, t) =>
        Bn.log(1, `${e} DPR changed ${t.oldRatio} => ${e.devicePixelRatio}`)(),
      debug: Li(),
      debugGPUTime: !1,
      debugShaders: Bn.get("debug-shaders") || void 0,
      debugFramebuffers: Boolean(Bn.get("debug-framebuffers")),
      debugFactories: Boolean(Bn.get("debug-factories")),
      debugWebGL: Boolean(Bn.get("debug-webgl")),
      debugSpectorJS: void 0,
      debugSpectorJSUrl: void 0,
      _reuseDevices: !1,
      _requestMaxLimits: !0,
      _cacheShaders: !0,
      _destroyShaders: !1,
      _cachePipelines: !0,
      _sharePipelines: !0,
      _destroyPipelines: !1,
      _initializeFeatures: !0,
      _disabledFeatures: { "compilation-status-async-webgl": !0 },
      _handle: void 0,
    };
    get [Symbol.toStringTag]() {
      return "Device";
    }
    toString() {
      return `Device(${this.id})`;
    }
    id;
    props;
    userData = {};
    statsManager = Mn;
    _factories = {};
    timestamp = 0;
    _reused = !1;
    _moduleData = {};
    _textureCaps = {};
    _debugGPUTimeQuery = null;
    constructor(t) {
      ((this.props = { ...e.defaultProps, ...t }),
        (this.id =
          this.props.id || Fn(this[Symbol.toStringTag].toLowerCase())));
    }
    getVertexFormatInfo(e) {
      return ei.getVertexFormatInfo(e);
    }
    isVertexFormatSupported(e) {
      return !0;
    }
    getTextureFormatInfo(e) {
      return yi.getInfo(e);
    }
    getTextureFormatCapabilities(e) {
      let t = this._textureCaps[e];
      if (!t) {
        const r = this._getDeviceTextureFormatCapabilities(e);
        ((t = this._getDeviceSpecificTextureFormatCapabilities(r)),
          (this._textureCaps[e] = t));
      }
      return t;
    }
    getMipLevelCount(e, t, r = 1) {
      return 1 + Math.floor(Math.log2(Math.max(e, t, r)));
    }
    isExternalImage(e) {
      return Ai(e);
    }
    getExternalImageSize(e) {
      return Ri(e);
    }
    isTextureFormatSupported(e) {
      return this.getTextureFormatCapabilities(e).create;
    }
    isTextureFormatFilterable(e) {
      return this.getTextureFormatCapabilities(e).filter;
    }
    isTextureFormatRenderable(e) {
      return this.getTextureFormatCapabilities(e).render;
    }
    isTextureFormatCompressed(e) {
      return yi.isCompressed(e);
    }
    getSupportedCompressedTextureFormats() {
      const e = [];
      for (const t of Object.keys(gi))
        this.isTextureFormatCompressed(t) &&
          this.isTextureFormatSupported(t) &&
          e.push(t);
      return e;
    }
    pushDebugGroup(e) {
      this.commandEncoder.pushDebugGroup(e);
    }
    popDebugGroup() {
      this.commandEncoder?.popDebugGroup();
    }
    insertDebugMarker(e) {
      this.commandEncoder?.insertDebugMarker(e);
    }
    loseDevice() {
      return !1;
    }
    incrementTimestamp() {
      return this.timestamp++;
    }
    reportError(e, t, ...r) {
      if (!this.props.onError(e, t)) {
        const n = (function (e, t) {
          return [Si(e), ...t.map(Si).filter((e) => void 0 !== e)].filter(
            (e) => void 0 !== e,
          );
        })(t, r);
        return Bn.error(
          "webgl" === this.type ? "%cWebGL" : "%cWebGPU",
          "color: white; background: red; padding: 2px 6px; border-radius: 3px;",
          e.message,
          ...n,
        );
      }
      return () => {};
    }
    debug() {
      this.props.debug ||
        Bn.once(
          0,
          "'Type luma.log.set({debug: true}) in console to enable debug breakpoints',\nor create a device with the 'debug: true' prop.",
        )();
    }
    getDefaultCanvasContext() {
      if (!this.canvasContext)
        throw new Error(
          "Device has no default CanvasContext. See props.createCanvasContext",
        );
      return this.canvasContext;
    }
    createFence() {
      throw new Error("createFence() not implemented");
    }
    beginRenderPass(e) {
      return this.commandEncoder.beginRenderPass(e);
    }
    beginComputePass(e) {
      return this.commandEncoder.beginComputePass(e);
    }
    generateMipmapsWebGPU(e) {
      throw new Error("not implemented");
    }
    _createSharedRenderPipelineWebGL(e) {
      throw new Error("_createSharedRenderPipelineWebGL() not implemented");
    }
    _createBindGroupLayoutWebGPU(e, t) {
      throw new Error("_createBindGroupLayoutWebGPU() not implemented");
    }
    _createBindGroupWebGPU(e, t, r, n, i) {
      throw new Error("_createBindGroupWebGPU() not implemented");
    }
    _supportsDebugGPUTime() {
      return (
        this.features.has("timestamp-query") &&
        Boolean(this.props.debug || this.props.debugGPUTime)
      );
    }
    _enableDebugGPUTime(e = 256) {
      if (!this._supportsDebugGPUTime()) return null;
      if (this._debugGPUTimeQuery) return this._debugGPUTimeQuery;
      try {
        ((this._debugGPUTimeQuery = this.createQuerySet({
          type: "timestamp",
          count: e,
        })),
          (this.commandEncoder = this.createCommandEncoder({
            id: this.commandEncoder.props.id,
            timeProfilingQuerySet: this._debugGPUTimeQuery,
          })));
      } catch {
        this._debugGPUTimeQuery = null;
      }
      return this._debugGPUTimeQuery;
    }
    _disableDebugGPUTime() {
      this._debugGPUTimeQuery &&
        (this.commandEncoder.getTimeProfilingQuerySet() ===
          this._debugGPUTimeQuery &&
          (this.commandEncoder = this.createCommandEncoder({
            id: this.commandEncoder.props.id,
          })),
        this._debugGPUTimeQuery.destroy(),
        (this._debugGPUTimeQuery = null));
    }
    _isDebugGPUTimeEnabled() {
      return null !== this._debugGPUTimeQuery;
    }
    getCanvasContext() {
      return this.getDefaultCanvasContext();
    }
    readPixelsToArrayWebGL(e, t) {
      throw new Error("not implemented");
    }
    readPixelsToBufferWebGL(e, t) {
      throw new Error("not implemented");
    }
    setParametersWebGL(e) {
      throw new Error("not implemented");
    }
    getParametersWebGL(e) {
      throw new Error("not implemented");
    }
    withParametersWebGL(e, t) {
      throw new Error("not implemented");
    }
    clearWebGL(e) {
      throw new Error("not implemented");
    }
    resetWebGL() {
      throw new Error("not implemented");
    }
    getModuleData(e) {
      return ((this._moduleData[e] ||= {}), this._moduleData[e]);
    }
    static _getCanvasContextProps(e) {
      return !0 === e.createCanvasContext ? {} : e.createCanvasContext;
    }
    _getDeviceTextureFormatCapabilities(e) {
      const t = yi.getCapabilities(e),
        r = (e) => ("string" == typeof e ? this.features.has(e) : e) ?? !0,
        n = r(t.create);
      return {
        format: e,
        create: n,
        render: n && r(t.render),
        filter: n && r(t.filter),
        blend: n && r(t.blend),
        store: n && r(t.store),
      };
    }
    _normalizeBufferProps(e) {
      (e instanceof ArrayBuffer || ArrayBuffer.isView(e)) && (e = { data: e });
      const t = { ...e };
      if (
        (e.usage || 0) & qn.INDEX &&
        (e.indexType ||
          (e.data instanceof Uint32Array
            ? (t.indexType = "uint32")
            : e.data instanceof Uint16Array
              ? (t.indexType = "uint16")
              : e.data instanceof Uint8Array &&
                ((t.data = new Uint16Array(e.data)), (t.indexType = "uint16"))),
        !t.indexType)
      )
        throw new Error(
          "indices buffer content must be of type uint16 or uint32",
        );
      return t;
    }
  };
function Li() {
  return (
    (e = Bn.get("debug")),
    (t = (function () {
      const e = globalThis.process;
      if (e?.env) return e.env.NODE_ENV;
    })()),
    null != e ? Boolean(e) : void 0 !== t && "production" !== t
  );
  var e, t;
}
var Oi =
    "No matching device found. Ensure `@luma.gl/webgl` and/or `@luma.gl/webgpu` modules are imported.",
  Ni = class e {
    static defaultProps = {
      ...wi.defaultProps,
      type: "best-available",
      adapters: void 0,
      waitForPageLoad: !0,
    };
    stats = Mn;
    log = Bn;
    VERSION = "9.3.3";
    spector;
    preregisteredAdapters = new Map();
    constructor() {
      if (globalThis.luma) {
        if (globalThis.luma.VERSION !== this.VERSION)
          throw (
            Bn.error(
              `Found luma.gl ${globalThis.luma.VERSION} while initialzing ${this.VERSION}`,
            )(),
            Bn.error(
              "'yarn why @luma.gl/core' can help identify the source of the conflict",
            )(),
            new Error("luma.gl - multiple versions detected: see console log")
          );
        Bn.error("This version of luma.gl has already been initialized")();
      }
      (Bn.log(
        1,
        `${this.VERSION} - set luma.log.level=1 (or higher) to trace rendering`,
      )(),
        (globalThis.luma = this));
    }
    async createDevice(t = {}) {
      const r = { ...e.defaultProps, ...t },
        n = this.selectAdapter(r.type, r.adapters);
      if (!n) throw new Error(Oi);
      return (r.waitForPageLoad && (await n.pageLoaded), await n.create(r));
    }
    async attachDevice(e, t) {
      const r = this._getTypeFromHandle(e, t.adapters),
        n = r && this.selectAdapter(r, t.adapters);
      if (!n) throw new Error(Oi);
      return await n?.attach?.(e, t);
    }
    registerAdapters(e) {
      for (const t of e) this.preregisteredAdapters.set(t.type, t);
    }
    getSupportedAdapters(e = []) {
      const t = this._getAdapterMap(e);
      return Array.from(t)
        .map(([, e]) => e)
        .filter((e) => e.isSupported?.())
        .map((e) => e.type);
    }
    getBestAvailableAdapterType(e = []) {
      const t = ["webgpu", "webgl", "null"],
        r = this._getAdapterMap(e);
      for (const n of t) if (r.get(n)?.isSupported?.()) return n;
      return null;
    }
    selectAdapter(e, t = []) {
      let r = e;
      "best-available" === e && (r = this.getBestAvailableAdapterType(t));
      const n = this._getAdapterMap(t);
      return (r && n.get(r)) || null;
    }
    enforceWebGL2(e = !0, t = []) {
      const r = this._getAdapterMap(t).get("webgl");
      (r || Bn.warn("enforceWebGL2: webgl adapter not found")(),
        r?.enforceWebGL2?.(e));
    }
    setDefaultDeviceProps(t) {
      Object.assign(e.defaultProps, t);
    }
    _getAdapterMap(e = []) {
      const t = new Map(this.preregisteredAdapters);
      for (const r of e) t.set(r.type, r);
      return t;
    }
    _getTypeFromHandle(e, t = []) {
      return e instanceof WebGL2RenderingContext
        ? "webgl"
        : ("undefined" != typeof GPUDevice && e instanceof GPUDevice) ||
            e?.queue
          ? "webgpu"
          : null === e
            ? "null"
            : (e instanceof WebGLRenderingContext
                ? Bn.warn("WebGL1 is not supported", e)()
                : Bn.warn("Unknown handle type", e)(),
              null);
    }
  },
  xi = new Ni(),
  Pi = class {
    get pageLoaded() {
      return (
        Bi ||
          (Bi =
            Mi() || "undefined" == typeof window
              ? Promise.resolve()
              : new Promise((e) => window.addEventListener("load", () => e()))),
        Bi
      );
    }
  },
  Ii = c() && "undefined" != typeof document,
  Mi = () => Ii && "complete" === document.readyState,
  Bi = null,
  Di = class {
    props;
    _resizeObserver;
    _intersectionObserver;
    _observeDevicePixelRatioTimeout = null;
    _observeDevicePixelRatioMediaQuery = null;
    _handleDevicePixelRatioChange = () => this._refreshDevicePixelRatio();
    _trackPositionInterval = null;
    _started = !1;
    get started() {
      return this._started;
    }
    constructor(e) {
      this.props = e;
    }
    start() {
      if (!this._started && this.props.canvas) {
        ((this._started = !0),
          (this._intersectionObserver ||= new IntersectionObserver((e) =>
            this.props.onIntersection(e),
          )),
          (this._resizeObserver ||= new ResizeObserver((e) =>
            this.props.onResize(e),
          )),
          this._intersectionObserver.observe(this.props.canvas));
        try {
          this._resizeObserver.observe(this.props.canvas, {
            box: "device-pixel-content-box",
          });
        } catch {
          this._resizeObserver.observe(this.props.canvas, {
            box: "content-box",
          });
        }
        ((this._observeDevicePixelRatioTimeout = setTimeout(
          () => this._refreshDevicePixelRatio(),
          0,
        )),
          this.props.trackPosition && this._trackPosition());
      }
    }
    stop() {
      this._started &&
        ((this._started = !1),
        this._observeDevicePixelRatioTimeout &&
          (clearTimeout(this._observeDevicePixelRatioTimeout),
          (this._observeDevicePixelRatioTimeout = null)),
        this._observeDevicePixelRatioMediaQuery &&
          (this._observeDevicePixelRatioMediaQuery.removeEventListener(
            "change",
            this._handleDevicePixelRatioChange,
          ),
          (this._observeDevicePixelRatioMediaQuery = null)),
        this._trackPositionInterval &&
          (clearInterval(this._trackPositionInterval),
          (this._trackPositionInterval = null)),
        this._resizeObserver?.disconnect(),
        this._intersectionObserver?.disconnect());
    }
    _refreshDevicePixelRatio() {
      this._started &&
        (this.props.onDevicePixelRatioChange(),
        this._observeDevicePixelRatioMediaQuery?.removeEventListener(
          "change",
          this._handleDevicePixelRatioChange,
        ),
        (this._observeDevicePixelRatioMediaQuery = matchMedia(
          `(resolution: ${window.devicePixelRatio}dppx)`,
        )),
        this._observeDevicePixelRatioMediaQuery.addEventListener(
          "change",
          this._handleDevicePixelRatioChange,
          { once: !0 },
        ));
    }
    _trackPosition(e = 100) {
      this._trackPositionInterval ||
        (this._trackPositionInterval = setInterval(() => {
          this._started
            ? this.props.onPositionChange()
            : this._trackPositionInterval &&
              (clearInterval(this._trackPositionInterval),
              (this._trackPositionInterval = null));
        }, e));
    }
  };
function Fi(e, t) {
  if (!e) {
    const e = new Error(t ?? "luma.gl assertion failed.");
    throw (Error.captureStackTrace?.(e, Fi), e);
  }
}
function Ui(e, t) {
  return (Fi(e, t), e);
}
var Gi = class e {
  static isHTMLCanvas(e) {
    return (
      "undefined" != typeof HTMLCanvasElement && e instanceof HTMLCanvasElement
    );
  }
  static isOffscreenCanvas(e) {
    return (
      "undefined" != typeof OffscreenCanvas && e instanceof OffscreenCanvas
    );
  }
  static defaultProps = {
    id: void 0,
    canvas: null,
    width: 800,
    height: 600,
    useDevicePixels: !0,
    autoResize: !0,
    container: null,
    visible: !0,
    alphaMode: "opaque",
    colorSpace: "srgb",
    trackPosition: !1,
  };
  id;
  props;
  canvas;
  htmlCanvas;
  offscreenCanvas;
  type;
  initialized;
  isInitialized = !1;
  isVisible = !0;
  cssWidth;
  cssHeight;
  devicePixelRatio;
  devicePixelWidth;
  devicePixelHeight;
  drawingBufferWidth;
  drawingBufferHeight;
  _initializedResolvers = (function () {
    let e, t;
    return {
      promise: new Promise((r, n) => {
        ((e = r), (t = n));
      }),
      resolve: e,
      reject: t,
    };
  })();
  _canvasObserver;
  _position = [0, 0];
  destroyed = !1;
  _needsDrawingBufferResize = !0;
  toString() {
    return `${this[Symbol.toStringTag]}(${this.id})`;
  }
  constructor(t) {
    ((this.props = { ...e.defaultProps, ...t }),
      (t = this.props),
      (this.initialized = this._initializedResolvers.promise),
      c()
        ? t.canvas
          ? "string" == typeof t.canvas
            ? (this.canvas = ki(t.canvas))
            : (this.canvas = t.canvas)
          : (this.canvas = (function (e) {
              const { width: t, height: r } = e,
                n = document.createElement("canvas");
              ((n.id = Fn("lumagl-auto-created-canvas")),
                (n.width = t || 1),
                (n.height = r || 1),
                (n.style.width = Number.isFinite(t) ? `${t}px` : "100%"),
                (n.style.height = Number.isFinite(r) ? `${r}px` : "100%"),
                e?.visible || (n.style.visibility = "hidden"));
              const i = (function (e) {
                if ("string" == typeof e) {
                  const t = document.getElementById(e);
                  if (!t) throw new Error(`${e} is not an HTML element`);
                  return t;
                }
                return e || document.body;
              })(e?.container || null);
              return (i.insertBefore(n, i.firstChild), n);
            })(t))
        : (this.canvas = { width: t.width || 1, height: t.height || 1 }),
      e.isHTMLCanvas(this.canvas)
        ? ((this.id = t.id || this.canvas.id),
          (this.type = "html-canvas"),
          (this.htmlCanvas = this.canvas))
        : e.isOffscreenCanvas(this.canvas)
          ? ((this.id = t.id || "offscreen-canvas"),
            (this.type = "offscreen-canvas"),
            (this.offscreenCanvas = this.canvas))
          : ((this.id = t.id || "node-canvas-context"), (this.type = "node")),
      (this.cssWidth = this.htmlCanvas?.clientWidth || this.canvas.width),
      (this.cssHeight = this.htmlCanvas?.clientHeight || this.canvas.height),
      (this.devicePixelWidth = this.canvas.width),
      (this.devicePixelHeight = this.canvas.height),
      (this.drawingBufferWidth = this.canvas.width),
      (this.drawingBufferHeight = this.canvas.height),
      (this.devicePixelRatio = globalThis.devicePixelRatio || 1),
      (this._position = [0, 0]),
      (this._canvasObserver = new Di({
        canvas: this.htmlCanvas,
        trackPosition: this.props.trackPosition,
        onResize: (e) => this._handleResize(e),
        onIntersection: (e) => this._handleIntersection(e),
        onDevicePixelRatioChange: () => this._observeDevicePixelRatio(),
        onPositionChange: () => this.updatePosition(),
      })));
  }
  destroy() {
    this.destroyed ||
      ((this.destroyed = !0), this._stopObservers(), (this.device = null));
  }
  setProps(e) {
    return (
      "useDevicePixels" in e &&
        ((this.props.useDevicePixels = e.useDevicePixels || !1),
        this._updateDrawingBufferSize()),
      this
    );
  }
  getCurrentFramebuffer(e) {
    return (
      this._resizeDrawingBufferIfNeeded(),
      this._getCurrentFramebuffer(e)
    );
  }
  getCSSSize() {
    return [this.cssWidth, this.cssHeight];
  }
  getPosition() {
    return this._position;
  }
  getDevicePixelSize() {
    return [this.devicePixelWidth, this.devicePixelHeight];
  }
  getDrawingBufferSize() {
    return [this.drawingBufferWidth, this.drawingBufferHeight];
  }
  getMaxDrawingBufferSize() {
    const e = this.device.limits.maxTextureDimension2D;
    return [e, e];
  }
  setDrawingBufferSize(e, t) {
    ((e = Math.floor(e)),
      (t = Math.floor(t)),
      (this.drawingBufferWidth === e && this.drawingBufferHeight === t) ||
        ((this.drawingBufferWidth = e),
        (this.drawingBufferHeight = t),
        (this._needsDrawingBufferResize = !0)));
  }
  getDevicePixelRatio() {
    return ("undefined" != typeof window && window.devicePixelRatio) || 1;
  }
  cssToDevicePixels(e, t = !0) {
    const r = this.cssToDeviceRatio(),
      [n, i] = this.getDrawingBufferSize();
    return (function (e, t, r, n, i) {
      const s = e,
        o = Wi(s[0], t, r);
      let a = $i(s[1], t, n, i),
        c = Wi(s[0] + 1, t, r);
      const l = c === r - 1 ? c : c - 1;
      let u;
      return (
        (c = $i(s[1] + 1, t, n, i)),
        i
          ? ((c = 0 === c ? c : c + 1), (u = a), (a = c))
          : (u = c === n - 1 ? c : c - 1),
        {
          x: o,
          y: a,
          width: Math.max(l - o + 1, 1),
          height: Math.max(u - a + 1, 1),
        }
      );
    })(e, r, n, i, t);
  }
  getPixelSize() {
    return this.getDevicePixelSize();
  }
  getAspect() {
    const [e, t] = this.getDrawingBufferSize();
    return e > 0 && t > 0 ? e / t : 1;
  }
  cssToDeviceRatio() {
    try {
      const [e] = this.getDrawingBufferSize(),
        [t] = this.getCSSSize();
      return t ? e / t : 1;
    } catch {
      return 1;
    }
  }
  resize(e) {
    this.setDrawingBufferSize(e.width, e.height);
  }
  _setAutoCreatedCanvasId(e) {
    "lumagl-auto-created-canvas" === this.htmlCanvas?.id &&
      (this.htmlCanvas.id = e);
  }
  _startObservers() {
    this.destroyed || this._canvasObserver.start();
  }
  _stopObservers() {
    this._canvasObserver.stop();
  }
  _handleIntersection(e) {
    if (this.destroyed) return;
    const t = e.find((e) => e.target === this.canvas);
    if (!t) return;
    const r = t.isIntersecting;
    this.isVisible !== r &&
      ((this.isVisible = r), this.device.props.onVisibilityChange(this));
  }
  _handleResize(e) {
    if (this.destroyed) return;
    const t = e.find((e) => e.target === this.canvas);
    if (!t) return;
    const r = Ui(t.contentBoxSize?.[0]);
    ((this.cssWidth = r.inlineSize), (this.cssHeight = r.blockSize));
    const n = this.getDevicePixelSize(),
      i =
        t.devicePixelContentBoxSize?.[0]?.inlineSize ||
        r.inlineSize * devicePixelRatio,
      s =
        t.devicePixelContentBoxSize?.[0]?.blockSize ||
        r.blockSize * devicePixelRatio,
      [o, a] = this.getMaxDrawingBufferSize();
    ((this.devicePixelWidth = Math.max(1, Math.min(i, o))),
      (this.devicePixelHeight = Math.max(1, Math.min(s, a))),
      this._updateDrawingBufferSize(),
      this.device.props.onResize(this, { oldPixelSize: n }));
  }
  _updateDrawingBufferSize() {
    if (this.props.autoResize)
      if ("number" == typeof this.props.useDevicePixels) {
        const e = this.props.useDevicePixels;
        this.setDrawingBufferSize(this.cssWidth * e, this.cssHeight * e);
      } else
        this.props.useDevicePixels
          ? this.setDrawingBufferSize(
              this.devicePixelWidth,
              this.devicePixelHeight,
            )
          : this.setDrawingBufferSize(this.cssWidth, this.cssHeight);
    (this._initializedResolvers.resolve(),
      (this.isInitialized = !0),
      this.updatePosition());
  }
  _resizeDrawingBufferIfNeeded() {
    this._needsDrawingBufferResize &&
      ((this._needsDrawingBufferResize = !1),
      (this.drawingBufferWidth === this.canvas.width &&
        this.drawingBufferHeight === this.canvas.height) ||
        ((this.canvas.width = this.drawingBufferWidth),
        (this.canvas.height = this.drawingBufferHeight),
        this._configureDevice()));
  }
  _observeDevicePixelRatio() {
    if (this.destroyed || !this._canvasObserver.started) return;
    const e = this.devicePixelRatio;
    ((this.devicePixelRatio = window.devicePixelRatio),
      this.updatePosition(),
      this.device.props.onDevicePixelRatioChange?.(this, { oldRatio: e }));
  }
  updatePosition() {
    if (this.destroyed) return;
    const e = this.htmlCanvas?.getBoundingClientRect();
    if (e) {
      const t = [e.left, e.top];
      if (
        ((this._position ??= t),
        t[0] !== this._position[0] || t[1] !== this._position[1])
      ) {
        const e = this._position;
        ((this._position = t),
          this.device.props.onPositionChange?.(this, { oldPosition: e }));
      }
    }
  }
};
function ki(e) {
  const t = document.getElementById(e);
  if (!Gi.isHTMLCanvas(t)) throw new Error("Object is not a canvas element");
  return t;
}
function Wi(e, t, r) {
  return Math.min(Math.round(e * t), r - 1);
}
function $i(e, t, r, n) {
  return n
    ? Math.max(0, r - 1 - Math.round(e * t))
    : Math.min(Math.round(e * t), r - 1);
}
var Hi = class extends Gi {
    static defaultProps = Gi.defaultProps;
  },
  Vi = class extends Gi {},
  zi = class e extends zn {
    static defaultProps = {
      ...zn.defaultProps,
      type: "color-sampler",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
      addressModeW: "clamp-to-edge",
      magFilter: "nearest",
      minFilter: "nearest",
      mipmapFilter: "none",
      lodMinClamp: 0,
      lodMaxClamp: 32,
      compare: "less-equal",
      maxAnisotropy: 1,
    };
    get [Symbol.toStringTag]() {
      return "Sampler";
    }
    constructor(t, r) {
      super(t, (r = e.normalizeProps(t, r)), e.defaultProps);
    }
    static normalizeProps(e, t) {
      return t;
    }
  },
  Xi = {
    "1d": "1d",
    "2d": "2d",
    "2d-array": "2d",
    cube: "2d",
    "cube-array": "2d",
    "3d": "3d",
  },
  ji = class e extends zn {
    static SAMPLE = 4;
    static STORAGE = 8;
    static RENDER = 16;
    static COPY_SRC = 1;
    static COPY_DST = 2;
    static TEXTURE = 4;
    static RENDER_ATTACHMENT = 16;
    dimension;
    baseDimension;
    format;
    width;
    height;
    depth;
    mipLevels;
    samples;
    byteAlignment;
    ready = Promise.resolve(this);
    isReady = !0;
    updateTimestamp;
    get [Symbol.toStringTag]() {
      return "Texture";
    }
    toString() {
      return `Texture(${this.id},${this.format},${this.width}x${this.height})`;
    }
    constructor(t, r, n) {
      if (
        (super(t, (r = e.normalizeProps(t, r)), e.defaultProps),
        (this.dimension = this.props.dimension),
        (this.baseDimension = Xi[this.dimension]),
        (this.format = this.props.format),
        (this.width = this.props.width),
        (this.height = this.props.height),
        (this.depth = this.props.depth),
        (this.mipLevels = this.props.mipLevels),
        (this.samples = this.props.samples || 1),
        "cube" === this.dimension && (this.depth = 6),
        void 0 === this.props.width || void 0 === this.props.height)
      )
        if (t.isExternalImage(r.data)) {
          const e = t.getExternalImageSize(r.data);
          ((this.width = e?.width || 1), (this.height = e?.height || 1));
        } else
          ((this.width = 1),
            (this.height = 1),
            (void 0 !== this.props.width && void 0 !== this.props.height) ||
              Bn.warn(
                `${this} created with undefined width or height. This is deprecated. Use DynamicTexture instead.`,
              )());
      ((this.byteAlignment = n?.byteAlignment || 1),
        (this.updateTimestamp = t.incrementTimestamp()));
    }
    clone(e) {
      return this.device.createTexture({ ...this.props, ...e });
    }
    setSampler(e) {
      this.sampler = e instanceof zi ? e : this.device.createSampler(e);
    }
    copyImageData(e) {
      const { data: t, depth: r, ...n } = e;
      this.writeData(t, {
        ...n,
        depthOrArrayLayers: n.depthOrArrayLayers ?? r,
      });
    }
    computeMemoryLayout(e = {}) {
      const {
          width: t = this.width,
          height: r = this.height,
          depthOrArrayLayers: n = this.depth,
        } = this._normalizeTextureReadOptions(e),
        { format: i, byteAlignment: s } = this;
      return yi.computeMemoryLayout({
        format: i,
        width: t,
        height: r,
        depth: n,
        byteAlignment: s,
      });
    }
    readBuffer(e, t) {
      throw new Error("readBuffer not implemented");
    }
    readDataAsync(e) {
      throw new Error("readBuffer not implemented");
    }
    writeBuffer(e, t) {
      throw new Error("readBuffer not implemented");
    }
    writeData(e, t) {
      throw new Error("readBuffer not implemented");
    }
    readDataSyncWebGL(e) {
      throw new Error("readDataSyncWebGL not available");
    }
    generateMipmapsWebGL() {
      throw new Error("generateMipmapsWebGL not available");
    }
    static normalizeProps(e, t) {
      const r = { ...t },
        { width: n, height: i } = r;
      return (
        "number" == typeof n && (r.width = Math.max(1, Math.ceil(n))),
        "number" == typeof i && (r.height = Math.max(1, Math.ceil(i))),
        r
      );
    }
    _initializeData(e) {
      this.device.isExternalImage(e)
        ? this.copyExternalImage({
            image: e,
            width: this.width,
            height: this.height,
            depth: this.depth,
            mipLevel: 0,
            x: 0,
            y: 0,
            z: 0,
            aspect: "all",
            colorSpace: "srgb",
            premultipliedAlpha: !1,
            flipY: !1,
          })
        : e &&
          this.copyImageData({
            data: e,
            mipLevel: 0,
            x: 0,
            y: 0,
            z: 0,
            aspect: "all",
          });
    }
    _normalizeCopyImageDataOptions(e) {
      const { data: t, depth: r, ...n } = e,
        i = this._normalizeTextureWriteOptions({
          ...n,
          depthOrArrayLayers: n.depthOrArrayLayers ?? r,
        });
      return { data: t, depth: i.depthOrArrayLayers, ...i };
    }
    _normalizeCopyExternalImageOptions(t) {
      const r = e._omitUndefined(t),
        n = r.mipLevel ?? 0,
        i = this._getMipLevelSize(n),
        s = this.device.getExternalImageSize(t.image),
        o = { ...e.defaultCopyExternalImageOptions, ...i, ...s, ...r };
      return (
        (o.width = Math.min(o.width, i.width - o.x)),
        (o.height = Math.min(o.height, i.height - o.y)),
        (o.depth = Math.min(o.depth, i.depthOrArrayLayers - o.z)),
        o
      );
    }
    _normalizeTextureReadOptions(t) {
      const r = e._omitUndefined(t),
        n = r.mipLevel ?? 0,
        i = this._getMipLevelSize(n),
        s = { ...e.defaultTextureReadOptions, ...i, ...r };
      return (
        (s.width = Math.min(s.width, i.width - s.x)),
        (s.height = Math.min(s.height, i.height - s.y)),
        (s.depthOrArrayLayers = Math.min(
          s.depthOrArrayLayers,
          i.depthOrArrayLayers - s.z,
        )),
        s
      );
    }
    _getSupportedColorReadOptions(e) {
      const t = this._normalizeTextureReadOptions(e),
        r = yi.getInfo(this.format);
      switch (
        (this._validateColorReadAspect(t),
        this._validateColorReadFormat(r),
        this.dimension)
      ) {
        case "2d":
        case "cube":
        case "cube-array":
        case "2d-array":
        case "3d":
          return t;
        default:
          throw new Error(
            `${this} color readback does not support ${this.dimension} textures`,
          );
      }
    }
    _validateColorReadAspect(e) {
      if ("all" !== e.aspect)
        throw new Error(`${this} color readback only supports aspect 'all'`);
    }
    _validateColorReadFormat(e) {
      if (e.compressed)
        throw new Error(
          `${this} color readback does not support compressed formats (${this.format})`,
        );
      switch (e.attachment) {
        case "color":
          return;
        case "depth":
          throw new Error(
            `${this} color readback does not support depth formats (${this.format})`,
          );
        case "stencil":
          throw new Error(
            `${this} color readback does not support stencil formats (${this.format})`,
          );
        case "depth-stencil":
          throw new Error(
            `${this} color readback does not support depth-stencil formats (${this.format})`,
          );
        default:
          throw new Error(
            `${this} color readback does not support format ${this.format}`,
          );
      }
    }
    _normalizeTextureWriteOptions(t) {
      const r = e._omitUndefined(t),
        n = r.mipLevel ?? 0,
        i = this._getMipLevelSize(n),
        s = { ...e.defaultTextureWriteOptions, ...i, ...r };
      ((s.width = Math.min(s.width, i.width - s.x)),
        (s.height = Math.min(s.height, i.height - s.y)),
        (s.depthOrArrayLayers = Math.min(
          s.depthOrArrayLayers,
          i.depthOrArrayLayers - s.z,
        )));
      const o = yi.computeMemoryLayout({
          format: this.format,
          width: s.width,
          height: s.height,
          depth: s.depthOrArrayLayers,
          byteAlignment: this.byteAlignment,
        }),
        a = o.bytesPerPixel * s.width;
      if (
        ((s.bytesPerRow = r.bytesPerRow ?? o.bytesPerRow),
        (s.rowsPerImage = r.rowsPerImage ?? s.height),
        s.bytesPerRow < a)
      )
        throw new Error(
          `bytesPerRow (${s.bytesPerRow}) must be at least ${a} for ${this.format}`,
        );
      if (s.rowsPerImage < s.height)
        throw new Error(
          `rowsPerImage (${s.rowsPerImage}) must be at least ${s.height} for ${this.format}`,
        );
      const c = this.device.getTextureFormatInfo(this.format).bytesPerPixel;
      if (c && s.bytesPerRow % c !== 0)
        throw new Error(
          `bytesPerRow (${s.bytesPerRow}) must be a multiple of bytesPerPixel (${c}) for ${this.format}`,
        );
      return s;
    }
    _getMipLevelSize(e) {
      return {
        width: Math.max(1, this.width >> e),
        height: "1d" === this.baseDimension ? 1 : Math.max(1, this.height >> e),
        depthOrArrayLayers:
          "3d" === this.dimension ? Math.max(1, this.depth >> e) : this.depth,
      };
    }
    getAllocatedByteLength() {
      let e = 0;
      for (let t = 0; t < this.mipLevels; t++) {
        const {
          width: r,
          height: n,
          depthOrArrayLayers: i,
        } = this._getMipLevelSize(t);
        e += yi.computeMemoryLayout({
          format: this.format,
          width: r,
          height: n,
          depth: i,
          byteAlignment: 1,
        }).byteLength;
      }
      return e * this.samples;
    }
    static _omitUndefined(e) {
      return Object.fromEntries(
        Object.entries(e).filter(([, e]) => void 0 !== e),
      );
    }
    static defaultProps = {
      ...zn.defaultProps,
      data: null,
      dimension: "2d",
      format: "rgba8unorm",
      usage: e.SAMPLE | e.RENDER | e.COPY_DST,
      width: void 0,
      height: void 0,
      depth: 1,
      mipLevels: 1,
      samples: void 0,
      sampler: {},
      view: void 0,
    };
    static defaultCopyDataOptions = {
      data: void 0,
      byteOffset: 0,
      bytesPerRow: void 0,
      rowsPerImage: void 0,
      width: void 0,
      height: void 0,
      depthOrArrayLayers: void 0,
      depth: 1,
      mipLevel: 0,
      x: 0,
      y: 0,
      z: 0,
      aspect: "all",
    };
    static defaultCopyExternalImageOptions = {
      image: void 0,
      sourceX: 0,
      sourceY: 0,
      width: void 0,
      height: void 0,
      depth: 1,
      mipLevel: 0,
      x: 0,
      y: 0,
      z: 0,
      aspect: "all",
      colorSpace: "srgb",
      premultipliedAlpha: !1,
      flipY: !1,
    };
    static defaultTextureReadOptions = {
      x: 0,
      y: 0,
      z: 0,
      width: void 0,
      height: void 0,
      depthOrArrayLayers: 1,
      mipLevel: 0,
      aspect: "all",
    };
    static defaultTextureWriteOptions = {
      byteOffset: 0,
      bytesPerRow: void 0,
      rowsPerImage: void 0,
      x: 0,
      y: 0,
      z: 0,
      width: void 0,
      height: void 0,
      depthOrArrayLayers: 1,
      mipLevel: 0,
      aspect: "all",
    };
  },
  Ki = class e extends zn {
    get [Symbol.toStringTag]() {
      return "TextureView";
    }
    constructor(t, r) {
      super(t, r, e.defaultProps);
    }
    static defaultProps = {
      ...zn.defaultProps,
      format: void 0,
      dimension: void 0,
      aspect: "all",
      baseMipLevel: 0,
      mipLevelCount: void 0,
      baseArrayLayer: 0,
      arrayLayerCount: void 0,
    };
  };
function Yi(e, t, r, n) {
  if (n?.inlineSource)
    return `\n${(function (e, t) {
      let r = "";
      for (let n = t - 2; n <= t; n++) {
        const i = e[n - 1];
        void 0 !== i && (r += Qi(i, t, void 0));
      }
      return r;
    })(
      t,
      r,
    )}${e.linePos > 0 ? `${" ".repeat(e.linePos + 5)}^^^\n` : ""}${e.type.toUpperCase()}: ${e.message}\n\n`;
  const i = "error" === e.type ? "red" : "orange";
  return n?.html
    ? `<div class='luma-compiler-log-${e.type}' style="color:${i};"><b> ${e.type.toUpperCase()}: ${e.message}</b></div>`
    : `${e.type.toUpperCase()}: ${e.message}`;
}
function Qi(e, t, r) {
  const n = r?.html
    ? e
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;")
    : e;
  return `${(function (e) {
    let t = "";
    for (let r = e.length; r < 4; ++r) t += " ";
    return t + e;
  })(String(t))}: ${n}${r?.html ? "<br/>" : "\n"}`;
}
var qi = class e extends zn {
  get [Symbol.toStringTag]() {
    return "Shader";
  }
  stage;
  source;
  compilationStatus = "pending";
  constructor(t, r) {
    (super(
      t,
      {
        id: Zi(
          (r = {
            ...r,
            debugShaders: r.debugShaders || t.props.debugShaders || "errors",
          }),
        ),
        ...r,
      },
      e.defaultProps,
    ),
      (this.stage = this.props.stage),
      (this.source = this.props.source));
  }
  getCompilationInfoSync() {
    return null;
  }
  getTranslatedSource() {
    return null;
  }
  async debugShader() {
    const e = this.props.debugShaders;
    switch (e) {
      case "never":
        return;
      case "errors":
        if ("success" === this.compilationStatus) return;
    }
    const t = await this.getCompilationInfo();
    ("warnings" === e && 0 === t?.length) || this._displayShaderLog(t, this.id);
  }
  _displayShaderLog(e, t) {
    if ("undefined" == typeof document || !document?.createElement) return;
    const r = t,
      n = `${this.stage} shader "${r}"`,
      i = (function (e, t, r) {
        let n = "";
        const i = t.split(/\r?\n/),
          s = e.slice().sort((e, t) => e.lineNum - t.lineNum);
        switch (r?.showSourceCode || "no") {
          case "all":
            let t = 0;
            for (let e = 1; e <= i.length; e++) {
              const o = i[e - 1],
                a = s[t];
              for (
                o && a && (n += Qi(o, e, r));
                s.length > t && a.lineNum === e;
              ) {
                const e = s[t++];
                e && (n += Yi(e, i, e.lineNum, { ...r, inlineSource: !1 }));
              }
            }
            for (; s.length > t; ) {
              const e = s[t++];
              e && (n += Yi(e, [], 0, { ...r, inlineSource: !1 }));
            }
            return n;
          case "issues":
          case "no":
            for (const s of e)
              n += Yi(s, i, s.lineNum, {
                inlineSource: "no" !== r?.showSourceCode,
              });
            return n;
        }
      })(e, this.source, { showSourceCode: "all", html: !0 }),
      s = this.getTranslatedSource(),
      o = document.createElement("div");
    ((o.innerHTML = `<h1>Compilation error in ${n}</h1>\n<div style="display:flex;position:fixed;top:10px;right:20px;gap:2px;">\n<button id="copy">Copy source</button><br/>\n<button id="close">Close</button>\n</div>\n<code><pre>${i}</pre></code>`),
      s &&
        (o.innerHTML += `<br /><h1>Translated Source</h1><br /><br /><code><pre>${s}</pre></code>`),
      (o.style.top = "0"),
      (o.style.left = "0"),
      (o.style.background = "white"),
      (o.style.position = "fixed"),
      (o.style.zIndex = "9999"),
      (o.style.maxWidth = "100vw"),
      (o.style.maxHeight = "100vh"),
      (o.style.overflowY = "auto"),
      document.body.appendChild(o),
      o.querySelector(".luma-compiler-log-error")?.scrollIntoView(),
      (o.querySelector("button#close").onclick = () => {
        o.remove();
      }),
      (o.querySelector("button#copy").onclick = () => {
        navigator.clipboard.writeText(this.source);
      }));
  }
  static defaultProps = {
    ...zn.defaultProps,
    language: "auto",
    stage: void 0,
    source: "",
    sourceMap: null,
    entryPoint: "main",
    debugShaders: void 0,
  };
};
function Zi(e) {
  return (
    (function (e, t = "unnamed") {
      return (
        /#define[\s*]SHADER_NAME[\s*]([A-Za-z0-9_-]+)[\s*]/.exec(e)?.[1] ?? t
      );
    })(e.source) ||
    e.id ||
    Fn(`unnamed ${e.stage}-shader`)
  );
}
var Ji = class e extends zn {
    get [Symbol.toStringTag]() {
      return "Framebuffer";
    }
    width;
    height;
    constructor(t, r = {}) {
      (super(t, r, e.defaultProps),
        (this.width = this.props.width),
        (this.height = this.props.height));
    }
    clone(e) {
      const t = this.colorAttachments.map((t) => t.texture.clone(e)),
        r =
          this.depthStencilAttachment &&
          this.depthStencilAttachment.texture.clone(e);
      return this.device.createFramebuffer({
        ...this.props,
        ...e,
        colorAttachments: t,
        depthStencilAttachment: r,
      });
    }
    resize(e) {
      let t = !e;
      if (e) {
        const [r, n] = Array.isArray(e) ? e : [e.width, e.height];
        ((t = t || n !== this.height || r !== this.width),
          (this.width = r),
          (this.height = n));
      }
      t &&
        (Bn.log(
          2,
          `Resizing framebuffer ${this.id} to ${this.width}x${this.height}`,
        )(),
        this.resizeAttachments(this.width, this.height));
    }
    autoCreateAttachmentTextures() {
      if (
        0 === this.props.colorAttachments.length &&
        !this.props.depthStencilAttachment
      )
        throw new Error("Framebuffer has noattachments");
      this.colorAttachments = this.props.colorAttachments.map((e, t) => {
        if ("string" == typeof e) {
          const r = this.createColorTexture(e, t);
          return (this.attachResource(r), r.view);
        }
        return e instanceof ji ? e.view : e;
      });
      const e = this.props.depthStencilAttachment;
      if (e)
        if ("string" == typeof e) {
          const t = this.createDepthStencilTexture(e);
          (this.attachResource(t), (this.depthStencilAttachment = t.view));
        } else this.depthStencilAttachment = e instanceof ji ? e.view : e;
    }
    createColorTexture(e, t) {
      return this.device.createTexture({
        id: `${this.id}-color-attachment-${t}`,
        usage: ji.RENDER_ATTACHMENT,
        format: e,
        width: this.width,
        height: this.height,
        sampler: { magFilter: "linear", minFilter: "linear" },
      });
    }
    createDepthStencilTexture(e) {
      return this.device.createTexture({
        id: `${this.id}-depth-stencil-attachment`,
        usage: ji.RENDER_ATTACHMENT,
        format: e,
        width: this.width,
        height: this.height,
      });
    }
    resizeAttachments(e, t) {
      if (
        (this.colorAttachments.forEach((r, n) => {
          const i = r.texture.clone({ width: e, height: t });
          (this.destroyAttachedResource(r),
            (this.colorAttachments[n] = i.view),
            this.attachResource(i.view));
        }),
        this.depthStencilAttachment)
      ) {
        const r = this.depthStencilAttachment.texture.clone({
          width: e,
          height: t,
        });
        (this.destroyAttachedResource(this.depthStencilAttachment),
          (this.depthStencilAttachment = r.view),
          this.attachResource(r));
      }
      this.updateAttachments();
    }
    static defaultProps = {
      ...zn.defaultProps,
      width: 1,
      height: 1,
      colorAttachments: [],
      depthStencilAttachment: null,
    };
  },
  es = class e extends zn {
    get [Symbol.toStringTag]() {
      return "RenderPipeline";
    }
    shaderLayout;
    bufferLayout;
    linkStatus = "pending";
    hash = "";
    sharedRenderPipeline = null;
    get isPending() {
      return (
        "pending" === this.linkStatus ||
        "pending" === this.vs.compilationStatus ||
        "pending" === this.fs?.compilationStatus
      );
    }
    get isErrored() {
      return (
        "error" === this.linkStatus ||
        "error" === this.vs.compilationStatus ||
        "error" === this.fs?.compilationStatus
      );
    }
    constructor(t, r) {
      (super(t, r, e.defaultProps),
        (this.shaderLayout = this.props.shaderLayout),
        (this.bufferLayout = this.props.bufferLayout || []),
        (this.sharedRenderPipeline = this.props._sharedRenderPipeline || null));
    }
    static defaultProps = {
      ...zn.defaultProps,
      vs: null,
      vertexEntryPoint: "vertexMain",
      vsConstants: {},
      fs: null,
      fragmentEntryPoint: "fragmentMain",
      fsConstants: {},
      shaderLayout: null,
      bufferLayout: [],
      topology: "triangle-list",
      colorAttachmentFormats: void 0,
      depthStencilAttachmentFormat: void 0,
      parameters: {},
      varyings: void 0,
      bufferMode: void 0,
      disableWarnings: !1,
      _sharedRenderPipeline: void 0,
      bindings: void 0,
      bindGroups: void 0,
    };
  },
  ts = class extends zn {
    get [Symbol.toStringTag]() {
      return "SharedRenderPipeline";
    }
    constructor(e, t) {
      super(e, t, {
        ...zn.defaultProps,
        handle: void 0,
        vs: void 0,
        fs: void 0,
        varyings: void 0,
        bufferMode: void 0,
      });
    }
  },
  rs = class e extends zn {
    get [Symbol.toStringTag]() {
      return "ComputePipeline";
    }
    hash = "";
    shaderLayout;
    constructor(t, r) {
      (super(t, r, e.defaultProps), (this.shaderLayout = r.shaderLayout));
    }
    static defaultProps = {
      ...zn.defaultProps,
      shader: void 0,
      entryPoint: void 0,
      constants: {},
      shaderLayout: void 0,
    };
  },
  ns = class e {
    static defaultProps = { ...es.defaultProps };
    static getDefaultPipelineFactory(t) {
      const r = t.getModuleData("@luma.gl/core");
      return (
        (r.defaultPipelineFactory ||= new e(t)),
        r.defaultPipelineFactory
      );
    }
    device;
    _hashCounter = 0;
    _hashes = {};
    _renderPipelineCache = {};
    _computePipelineCache = {};
    _sharedRenderPipelineCache = {};
    get [Symbol.toStringTag]() {
      return "PipelineFactory";
    }
    toString() {
      return `PipelineFactory(${this.device.id})`;
    }
    constructor(e) {
      this.device = e;
    }
    createRenderPipeline(e) {
      if (!this.device.props._cachePipelines)
        return this.device.createRenderPipeline(e);
      const t = { ...es.defaultProps, ...e },
        r = this._renderPipelineCache,
        n = this._hashRenderPipeline(t);
      let i = r[n]?.resource;
      if (i)
        (r[n].useCount++,
          this.device.props.debugFactories &&
            Bn.log(
              3,
              `${this}: ${r[n].resource} reused, count=${r[n].useCount}, (id=${e.id})`,
            )());
      else {
        const e =
          "webgl" === this.device.type && this.device.props._sharePipelines
            ? this.createSharedRenderPipeline(t)
            : void 0;
        ((i = this.device.createRenderPipeline({
          ...t,
          id: t.id ? `${t.id}-cached` : Fn("unnamed-cached"),
          _sharedRenderPipeline: e,
        })),
          (i.hash = n),
          (r[n] = { resource: i, useCount: 1 }),
          this.device.props.debugFactories &&
            Bn.log(3, `${this}: ${i} created, count=${r[n].useCount}`)());
      }
      return i;
    }
    createComputePipeline(e) {
      if (!this.device.props._cachePipelines)
        return this.device.createComputePipeline(e);
      const t = { ...rs.defaultProps, ...e },
        r = this._computePipelineCache,
        n = this._hashComputePipeline(t);
      let i = r[n]?.resource;
      return (
        i
          ? (r[n].useCount++,
            this.device.props.debugFactories &&
              Bn.log(
                3,
                `${this}: ${r[n].resource} reused, count=${r[n].useCount}, (id=${e.id})`,
              )())
          : ((i = this.device.createComputePipeline({
              ...t,
              id: t.id ? `${t.id}-cached` : void 0,
            })),
            (i.hash = n),
            (r[n] = { resource: i, useCount: 1 }),
            this.device.props.debugFactories &&
              Bn.log(3, `${this}: ${i} created, count=${r[n].useCount}`)()),
        i
      );
    }
    release(e) {
      if (!this.device.props._cachePipelines) return void e.destroy();
      const t = this._getCache(e),
        r = e.hash;
      (t[r].useCount--,
        0 === t[r].useCount
          ? (this._destroyPipeline(e),
            this.device.props.debugFactories &&
              Bn.log(3, `${this}: ${e} released and destroyed`)())
          : t[r].useCount < 0
            ? (Bn.error(`${this}: ${e} released, useCount < 0, resetting`)(),
              (t[r].useCount = 0))
            : this.device.props.debugFactories &&
              Bn.log(3, `${this}: ${e} released, count=${t[r].useCount}`)());
    }
    createSharedRenderPipeline(e) {
      const t = this._hashSharedRenderPipeline(e);
      let r = this._sharedRenderPipelineCache[t];
      return (
        r ||
          ((r = {
            resource: this.device._createSharedRenderPipelineWebGL(e),
            useCount: 0,
          }),
          (this._sharedRenderPipelineCache[t] = r)),
        r.useCount++,
        r.resource
      );
    }
    releaseSharedRenderPipeline(e) {
      if (!e.sharedRenderPipeline) return;
      const t = this._hashSharedRenderPipeline(e.sharedRenderPipeline.props),
        r = this._sharedRenderPipelineCache[t];
      r &&
        (r.useCount--,
        0 === r.useCount &&
          (r.resource.destroy(), delete this._sharedRenderPipelineCache[t]));
    }
    _destroyPipeline(e) {
      const t = this._getCache(e);
      return (
        !!this.device.props._destroyPipelines &&
        (delete t[e.hash],
        e.destroy(),
        e instanceof es && this.releaseSharedRenderPipeline(e),
        !0)
      );
    }
    _getCache(e) {
      let t;
      if (
        (e instanceof rs && (t = this._computePipelineCache),
        e instanceof es && (t = this._renderPipelineCache),
        !t)
      )
        throw new Error(`${this}`);
      if (!t[e.hash]) throw new Error(`${this}: ${e} matched incorrect entry`);
      return t;
    }
    _hashComputePipeline(e) {
      const { type: t } = this.device;
      return `${t}/C/${this._getHash(e.shader.source)}SL${this._getHash(JSON.stringify(e.shaderLayout))}`;
    }
    _hashRenderPipeline(e) {
      const t = e.vs ? this._getHash(e.vs.source) : 0,
        r = e.fs ? this._getHash(e.fs.source) : 0,
        n = this._getWebGLVaryingHash(e),
        i = this._getHash(JSON.stringify(e.shaderLayout)),
        s = this._getHash(JSON.stringify(e.bufferLayout)),
        { type: o } = this.device;
      if ("webgl" === o) {
        const a = this._getHash(JSON.stringify(e.parameters));
        return `${o}/R/${t}/${r}V${n}T${e.topology}P${a}SL${i}BL${s}`;
      }
      {
        const a = this._getHash(
            JSON.stringify({
              vertexEntryPoint: e.vertexEntryPoint,
              fragmentEntryPoint: e.fragmentEntryPoint,
            }),
          ),
          c = this._getHash(JSON.stringify(e.parameters)),
          l = this._getWebGPUAttachmentHash(e);
        return `${o}/R/${t}/${r}V${n}T${e.topology}EP${a}P${c}SL${i}BL${s}A${l}`;
      }
    }
    _hashSharedRenderPipeline(e) {
      return `webgl/S/${e.vs ? this._getHash(e.vs.source) : 0}/${e.fs ? this._getHash(e.fs.source) : 0}V${this._getWebGLVaryingHash(e)}`;
    }
    _getHash(e) {
      return (
        void 0 === this._hashes[e] && (this._hashes[e] = this._hashCounter++),
        this._hashes[e]
      );
    }
    _getWebGLVaryingHash(e) {
      const { varyings: t = [], bufferMode: r = null } = e;
      return this._getHash(JSON.stringify({ varyings: t, bufferMode: r }));
    }
    _getWebGPUAttachmentHash(e) {
      const t = e.colorAttachmentFormats ?? [this.device.preferredColorFormat],
        r = e.parameters?.depthWriteEnabled
          ? e.depthStencilAttachmentFormat || this.device.preferredDepthFormat
          : null;
      return this._getHash(
        JSON.stringify({
          colorAttachmentFormats: t,
          depthStencilAttachmentFormat: r,
        }),
      );
    }
  },
  is = class e {
    static defaultProps = { ...qi.defaultProps };
    static getDefaultShaderFactory(t) {
      const r = t.getModuleData("@luma.gl/core");
      return ((r.defaultShaderFactory ||= new e(t)), r.defaultShaderFactory);
    }
    device;
    _cache = {};
    get [Symbol.toStringTag]() {
      return "ShaderFactory";
    }
    toString() {
      return `${this[Symbol.toStringTag]}(${this.device.id})`;
    }
    constructor(e) {
      this.device = e;
    }
    createShader(e) {
      if (!this.device.props._cacheShaders) return this.device.createShader(e);
      const t = this._hashShader(e);
      let r = this._cache[t];
      if (r)
        (r.useCount++,
          this.device.props.debugFactories &&
            Bn.log(
              3,
              `${this}: Reusing shader ${r.resource.id} count=${r.useCount}`,
            )());
      else {
        const n = this.device.createShader({
          ...e,
          id: e.id ? `${e.id}-cached` : void 0,
        });
        ((this._cache[t] = r = { resource: n, useCount: 1 }),
          this.device.props.debugFactories &&
            Bn.log(3, `${this}: Created new shader ${n.id}`)());
      }
      return r.resource;
    }
    release(e) {
      if (!this.device.props._cacheShaders) return void e.destroy();
      const t = this._hashShader(e),
        r = this._cache[t];
      if (r)
        if ((r.useCount--, 0 === r.useCount))
          this.device.props._destroyShaders &&
            (delete this._cache[t],
            r.resource.destroy(),
            this.device.props.debugFactories &&
              Bn.log(3, `${this}: Releasing shader ${e.id}, destroyed`)());
        else {
          if (r.useCount < 0)
            throw new Error(
              `ShaderFactory: Shader ${e.id} released too many times`,
            );
          this.device.props.debugFactories &&
            Bn.log(
              3,
              `${this}: Releasing shader ${e.id} count=${r.useCount}`,
            )();
        }
    }
    _hashShader(e) {
      return `${e.stage}:${e.source}`;
    }
  };
function ss(e, t, r) {
  const n = e.bindings.find(
    (e) =>
      e.name === t ||
      `${e.name.toLocaleLowerCase()}uniforms` === t.toLocaleLowerCase(),
  );
  return (
    n ||
      r?.ignoreWarnings ||
      Bn.warn(`Binding ${t} not set: Not found in shader layout.`)(),
    n || null
  );
}
function os(e, t) {
  if (!t) return {};
  if (
    (function (e) {
      const t = Object.keys(e);
      return t.length > 0 && t.every((e) => /^\d+$/.test(e));
    })(t)
  )
    return Object.fromEntries(
      Object.entries(t).map(([e, t]) => [Number(e), { ...t }]),
    );
  const r = {};
  for (const [n, i] of Object.entries(t)) {
    const t = ss(e, n)?.group ?? 0;
    ((r[t] ||= {}), (r[t][n] = i));
  }
  return r;
}
function as(e) {
  const t = {};
  for (const r of Object.values(e)) Object.assign(t, r);
  return t;
}
var cs = class e extends zn {
    static defaultClearColor = [0, 0, 0, 1];
    static defaultClearDepth = 1;
    static defaultClearStencil = 0;
    get [Symbol.toStringTag]() {
      return "RenderPass";
    }
    constructor(t, r) {
      super(t, (r = e.normalizeProps(t, r)), e.defaultProps);
    }
    static normalizeProps(e, t) {
      return t;
    }
    static defaultProps = {
      ...zn.defaultProps,
      framebuffer: null,
      parameters: void 0,
      clearColor: e.defaultClearColor,
      clearColors: void 0,
      clearDepth: e.defaultClearDepth,
      clearStencil: e.defaultClearStencil,
      depthReadOnly: !1,
      stencilReadOnly: !1,
      discard: !1,
      occlusionQuerySet: void 0,
      timestampQuerySet: void 0,
      beginTimestampIndex: void 0,
      endTimestampIndex: void 0,
    };
  },
  ls = class e extends zn {
    get [Symbol.toStringTag]() {
      return "CommandEncoder";
    }
    _timeProfilingQuerySet = null;
    _timeProfilingSlotCount = 0;
    _gpuTimeMs;
    constructor(t, r) {
      (super(t, r, e.defaultProps),
        (this._timeProfilingQuerySet = r.timeProfilingQuerySet ?? null),
        (this._timeProfilingSlotCount = 0),
        (this._gpuTimeMs = void 0));
    }
    async resolveTimeProfilingQuerySet() {
      if (((this._gpuTimeMs = void 0), !this._timeProfilingQuerySet)) return;
      const e = Math.floor(this._timeProfilingSlotCount / 2);
      if (e <= 0) return;
      const t = 2 * e,
        r = await this._timeProfilingQuerySet.readResults({
          firstQuery: 0,
          queryCount: t,
        });
      let n = 0n;
      for (let i = 0; i < t; i += 2) n += r[i + 1] - r[i];
      this._gpuTimeMs = Number(n) / 1e6;
    }
    getTimeProfilingSlotCount() {
      return this._timeProfilingSlotCount;
    }
    getTimeProfilingQuerySet() {
      return this._timeProfilingQuerySet;
    }
    _applyTimeProfilingToPassProps(e) {
      const t = e || {};
      if (!this._supportsTimestampQueries() || !this._timeProfilingQuerySet)
        return t;
      if (
        void 0 !== t.timestampQuerySet ||
        void 0 !== t.beginTimestampIndex ||
        void 0 !== t.endTimestampIndex
      )
        return t;
      const r = this._timeProfilingSlotCount;
      return r + 1 >= this._timeProfilingQuerySet.props.count
        ? t
        : ((this._timeProfilingSlotCount += 2),
          {
            ...t,
            timestampQuerySet: this._timeProfilingQuerySet,
            beginTimestampIndex: r,
            endTimestampIndex: r + 1,
          });
    }
    _supportsTimestampQueries() {
      return this.device.features.has("timestamp-query");
    }
    static defaultProps = {
      ...zn.defaultProps,
      measureExecutionTime: void 0,
      timeProfilingQuerySet: void 0,
    };
  },
  us = class e extends zn {
    get [Symbol.toStringTag]() {
      return "CommandBuffer";
    }
    constructor(t, r) {
      super(t, r, e.defaultProps);
    }
    static defaultProps = { ...zn.defaultProps };
  };
function hs(e) {
  const t = _s[fs(e)];
  if (!t) throw new Error(`Unsupported variable shader type: ${e}`);
  return t;
}
function ds(e) {
  return Es[e] || e;
}
function fs(e) {
  return bs[e] || e;
}
var ps = new (class {
    getVariableShaderTypeInfo(e) {
      return hs(e);
    }
    getAttributeShaderTypeInfo(e) {
      return (function (e) {
        const t = ms[ds(e)];
        if (!t) throw new Error(`Unsupported attribute shader type: ${e}`);
        const [r, n] = t,
          i = "i32" === r || "u32" === r,
          s = "u32" !== r;
        return {
          primitiveType: r,
          components: n,
          byteLength: gs[r] * n,
          integer: i,
          signed: s,
        };
      })(e);
    }
    makeShaderAttributeType(e, t) {
      return (function (e, t) {
        return 1 === t ? e : `vec${t}<${e}>`;
      })(e, t);
    }
    resolveAttributeShaderTypeAlias(e) {
      return ds(e);
    }
    resolveVariableShaderTypeAlias(e) {
      return fs(e);
    }
  })(),
  gs = { f32: 4, f16: 2, i32: 4, u32: 4 },
  ms = {
    f32: ["f32", 1],
    "vec2<f32>": ["f32", 2],
    "vec3<f32>": ["f32", 3],
    "vec4<f32>": ["f32", 4],
    f16: ["f16", 1],
    "vec2<f16>": ["f16", 2],
    "vec3<f16>": ["f16", 3],
    "vec4<f16>": ["f16", 4],
    i32: ["i32", 1],
    "vec2<i32>": ["i32", 2],
    "vec3<i32>": ["i32", 3],
    "vec4<i32>": ["i32", 4],
    u32: ["u32", 1],
    "vec2<u32>": ["u32", 2],
    "vec3<u32>": ["u32", 3],
    "vec4<u32>": ["u32", 4],
  },
  _s = {
    f32: { type: "f32", components: 1 },
    f16: { type: "f16", components: 1 },
    i32: { type: "i32", components: 1 },
    u32: { type: "u32", components: 1 },
    "vec2<f32>": { type: "f32", components: 2 },
    "vec3<f32>": { type: "f32", components: 3 },
    "vec4<f32>": { type: "f32", components: 4 },
    "vec2<f16>": { type: "f16", components: 2 },
    "vec3<f16>": { type: "f16", components: 3 },
    "vec4<f16>": { type: "f16", components: 4 },
    "vec2<i32>": { type: "i32", components: 2 },
    "vec3<i32>": { type: "i32", components: 3 },
    "vec4<i32>": { type: "i32", components: 4 },
    "vec2<u32>": { type: "u32", components: 2 },
    "vec3<u32>": { type: "u32", components: 3 },
    "vec4<u32>": { type: "u32", components: 4 },
    "mat2x2<f32>": { type: "f32", components: 4 },
    "mat2x3<f32>": { type: "f32", components: 6 },
    "mat2x4<f32>": { type: "f32", components: 8 },
    "mat3x2<f32>": { type: "f32", components: 6 },
    "mat3x3<f32>": { type: "f32", components: 9 },
    "mat3x4<f32>": { type: "f32", components: 12 },
    "mat4x2<f32>": { type: "f32", components: 8 },
    "mat4x3<f32>": { type: "f32", components: 12 },
    "mat4x4<f32>": { type: "f32", components: 16 },
    "mat2x2<f16>": { type: "f16", components: 4 },
    "mat2x3<f16>": { type: "f16", components: 6 },
    "mat2x4<f16>": { type: "f16", components: 8 },
    "mat3x2<f16>": { type: "f16", components: 6 },
    "mat3x3<f16>": { type: "f16", components: 9 },
    "mat3x4<f16>": { type: "f16", components: 12 },
    "mat4x2<f16>": { type: "f16", components: 8 },
    "mat4x3<f16>": { type: "f16", components: 12 },
    "mat4x4<f16>": { type: "f16", components: 16 },
    "mat2x2<i32>": { type: "i32", components: 4 },
    "mat2x3<i32>": { type: "i32", components: 6 },
    "mat2x4<i32>": { type: "i32", components: 8 },
    "mat3x2<i32>": { type: "i32", components: 6 },
    "mat3x3<i32>": { type: "i32", components: 9 },
    "mat3x4<i32>": { type: "i32", components: 12 },
    "mat4x2<i32>": { type: "i32", components: 8 },
    "mat4x3<i32>": { type: "i32", components: 12 },
    "mat4x4<i32>": { type: "i32", components: 16 },
    "mat2x2<u32>": { type: "u32", components: 4 },
    "mat2x3<u32>": { type: "u32", components: 6 },
    "mat2x4<u32>": { type: "u32", components: 8 },
    "mat3x2<u32>": { type: "u32", components: 6 },
    "mat3x3<u32>": { type: "u32", components: 9 },
    "mat3x4<u32>": { type: "u32", components: 12 },
    "mat4x2<u32>": { type: "u32", components: 8 },
    "mat4x3<u32>": { type: "u32", components: 12 },
    "mat4x4<u32>": { type: "u32", components: 16 },
  },
  Es = {
    vec2i: "vec2<i32>",
    vec3i: "vec3<i32>",
    vec4i: "vec4<i32>",
    vec2u: "vec2<u32>",
    vec3u: "vec3<u32>",
    vec4u: "vec4<u32>",
    vec2f: "vec2<f32>",
    vec3f: "vec3<f32>",
    vec4f: "vec4<f32>",
    vec2h: "vec2<f16>",
    vec3h: "vec3<f16>",
    vec4h: "vec4<f16>",
  },
  bs = {
    vec2i: "vec2<i32>",
    vec3i: "vec3<i32>",
    vec4i: "vec4<i32>",
    vec2u: "vec2<u32>",
    vec3u: "vec3<u32>",
    vec4u: "vec4<u32>",
    vec2f: "vec2<f32>",
    vec3f: "vec3<f32>",
    vec4f: "vec4<f32>",
    vec2h: "vec2<f16>",
    vec3h: "vec3<f16>",
    vec4h: "vec4<f16>",
    mat2x2f: "mat2x2<f32>",
    mat2x3f: "mat2x3<f32>",
    mat2x4f: "mat2x4<f32>",
    mat3x2f: "mat3x2<f32>",
    mat3x3f: "mat3x3<f32>",
    mat3x4f: "mat3x4<f32>",
    mat4x2f: "mat4x2<f32>",
    mat4x3f: "mat4x3<f32>",
    mat4x4f: "mat4x4<f32>",
    mat2x2i: "mat2x2<i32>",
    mat2x3i: "mat2x3<i32>",
    mat2x4i: "mat2x4<i32>",
    mat3x2i: "mat3x2<i32>",
    mat3x3i: "mat3x3<i32>",
    mat3x4i: "mat3x4<i32>",
    mat4x2i: "mat4x2<i32>",
    mat4x3i: "mat4x3<i32>",
    mat4x4i: "mat4x4<i32>",
    mat2x2u: "mat2x2<u32>",
    mat2x3u: "mat2x3<u32>",
    mat2x4u: "mat2x4<u32>",
    mat3x2u: "mat3x2<u32>",
    mat3x3u: "mat3x3<u32>",
    mat3x4u: "mat3x4<u32>",
    mat4x2u: "mat4x2<u32>",
    mat4x3u: "mat4x3<u32>",
    mat4x4u: "mat4x4<u32>",
    mat2x2h: "mat2x2<f16>",
    mat2x3h: "mat2x3<f16>",
    mat2x4h: "mat2x4<f16>",
    mat3x2h: "mat3x2<f16>",
    mat3x3h: "mat3x3<f16>",
    mat3x4h: "mat3x4<f16>",
    mat4x2h: "mat4x2<f16>",
    mat4x3h: "mat4x3<f16>",
    mat4x4h: "mat4x4<f16>",
  };
function ys(e, t) {
  const r = {};
  for (const n of e.attributes) {
    const i = Ts(e, t, n.name);
    i && (r[n.name] = i);
  }
  return r;
}
function Ts(e, t, r) {
  const n = (function (e, t) {
      const r = e.attributes.find((e) => e.name === t);
      return (
        r || Bn.warn(`shader layout attribute "${t}" not present in shader`),
        r || null
      );
    })(e, r),
    i = (function (e, t) {
      As(e);
      let r = (function (e, t) {
        for (const r of e)
          if (r.format && r.name === t)
            return {
              attributeName: r.name,
              bufferName: t,
              stepMode: r.stepMode,
              vertexFormat: r.format,
              byteOffset: 0,
              byteStride: r.byteStride || 0,
            };
        return null;
      })(e, t);
      return (
        r ||
        ((r = (function (e, t) {
          for (const r of e) {
            let e = r.byteStride;
            if ("number" != typeof r.byteStride)
              for (const t of r.attributes || [])
                e += ei.getVertexFormatInfo(t.format).byteLength;
            const n = r.attributes?.find((e) => e.attribute === t);
            if (n)
              return {
                attributeName: n.attribute,
                bufferName: r.name,
                stepMode: r.stepMode,
                vertexFormat: n.format,
                byteOffset: n.byteOffset,
                byteStride: e,
              };
          }
          return null;
        })(e, t)),
        r ||
          (Bn.warn(`layout for attribute "${t}" not present in buffer layout`),
          null))
      );
    })(t, r);
  if (!n) return null;
  const s = ps.getAttributeShaderTypeInfo(n.type),
    o = ei.getCompatibleVertexFormat(s),
    a = i?.vertexFormat || o,
    c = ei.getVertexFormatInfo(a);
  return {
    attributeName: i?.attributeName || n.name,
    bufferName: i?.bufferName || n.name,
    location: n.location,
    shaderType: n.type,
    primitiveType: s.primitiveType,
    shaderComponents: s.components,
    vertexFormat: a,
    bufferDataType: c.type,
    bufferComponents: c.components,
    normalized: c.normalized,
    integer: s.integer,
    stepMode: i?.stepMode || n.stepMode || "vertex",
    byteOffset: i?.byteOffset || 0,
    byteStride: i?.byteStride || 0,
  };
}
function As(e) {
  for (const t of e)
    ((t.attributes && t.format) || (!t.attributes && !t.format)) &&
      Bn.warn(
        `BufferLayout ${name} must have either 'attributes' or 'format' field`,
      );
}
var Rs = class e extends zn {
    static defaultProps = {
      ...zn.defaultProps,
      shaderLayout: void 0,
      bufferLayout: [],
    };
    get [Symbol.toStringTag]() {
      return "VertexArray";
    }
    maxVertexAttributes;
    attributeInfos;
    indexBuffer = null;
    attributes;
    constructor(t, r) {
      (super(t, r, e.defaultProps),
        (this.maxVertexAttributes = t.limits.maxVertexAttributes),
        (this.attributes = new Array(this.maxVertexAttributes).fill(null)),
        (this.attributeInfos = (function (e, t, r = 16) {
          const n = ys(e, t),
            i = new Array(r).fill(null);
          for (const s of Object.values(n)) i[s.location] = s;
          return i;
        })(r.shaderLayout, r.bufferLayout, this.maxVertexAttributes)));
    }
    setConstantWebGL(e, t) {
      this.device.reportError(
        new Error("constant attributes not supported"),
        this,
      )();
    }
  },
  vs = class e extends zn {
    static defaultProps = { ...zn.defaultProps, layout: void 0, buffers: {} };
    get [Symbol.toStringTag]() {
      return "TransformFeedback";
    }
    constructor(t, r) {
      super(t, r, e.defaultProps);
    }
  },
  Ss = class e extends zn {
    get [Symbol.toStringTag]() {
      return "QuerySet";
    }
    constructor(t, r) {
      super(t, r, e.defaultProps);
    }
    static defaultProps = { ...zn.defaultProps, type: void 0, count: void 0 };
  },
  Cs = class e extends zn {
    static defaultProps = { ...zn.defaultProps };
    get [Symbol.toStringTag]() {
      return "Fence";
    }
    constructor(t, r = {}) {
      super(t, r, e.defaultProps);
    }
  };
function ws(e, t) {
  switch (t) {
    case 1:
      return e;
    case 2:
      return e + (e % 2);
    default:
      return e + ((4 - (e % 4)) % 4);
  }
}
function Ls(e) {
  const [, , , , t] = Ns[e];
  return t;
}
var Os,
  Ns = {
    uint8: ["uint8", "u32", 1, !1, Uint8Array],
    sint8: ["sint8", "i32", 1, !1, Int8Array],
    unorm8: ["uint8", "f32", 1, !0, Uint8Array],
    snorm8: ["sint8", "f32", 1, !0, Int8Array],
    uint16: ["uint16", "u32", 2, !1, Uint16Array],
    sint16: ["sint16", "i32", 2, !1, Int16Array],
    unorm16: ["uint16", "u32", 2, !0, Uint16Array],
    snorm16: ["sint16", "i32", 2, !0, Int16Array],
    float16: ["float16", "f16", 2, !1, Uint16Array],
    float32: ["float32", "f32", 4, !1, Float32Array],
    uint32: ["uint32", "u32", 4, !1, Uint32Array],
    sint32: ["sint32", "i32", 4, !1, Int32Array],
  };
function xs(e, t = {}) {
  const r = { ...e },
    n = t.layout ?? "std140",
    i = {};
  let s = 0;
  for (const [o, a] of Object.entries(r)) s = Ms(i, o, a, s, n);
  return (
    (s = ws(s, Ds(r, n))),
    { layout: n, byteLength: 4 * s, uniformTypes: r, fields: i }
  );
}
function Ps(e, t) {
  const r = fs(e),
    n = hs(r),
    i = /^mat(\d)x(\d)<.+>$/.exec(r);
  if (i) {
    const e = Number(i[1]),
      s = Number(i[2]),
      o = Fs(s, r, n.type),
      a = (function (e, t, r) {
        return "std140" === r ? 4 : ws(e, t);
      })(o.size, o.alignment, t);
    return {
      alignment: o.alignment,
      size: e * a,
      components: e * s,
      columns: e,
      rows: s,
      columnStride: a,
      shaderType: r,
      type: n.type,
    };
  }
  const s = /^vec(\d)<.+>$/.exec(r);
  return s
    ? Fs(Number(s[1]), r, n.type)
    : {
        alignment: 1,
        size: 1,
        components: 1,
        columns: 1,
        rows: 1,
        columnStride: 1,
        shaderType: r,
        type: n.type,
      };
}
function Is(e) {
  return Boolean(e) && "object" == typeof e && !Array.isArray(e);
}
function Ms(e, t, r, n, i) {
  if ("string" == typeof r) {
    const s = Ps(r, i),
      o = ws(n, s.alignment);
    return ((e[t] = { offset: o, ...s }), o + s.size);
  }
  if (Array.isArray(r)) {
    if (Array.isArray(r[0]))
      throw new Error(`Nested arrays are not supported for ${t}`);
    const s = r[0],
      o = r[1],
      a = Us(s, i),
      c = ws(n, Ds(r, i));
    for (let r = 0; r < o; r++) Ms(e, `${t}[${r}]`, s, c + r * a, i);
    return c + a * o;
  }
  if (Is(r)) {
    const s = Ds(r, i);
    let o = ws(n, s);
    for (const [n, a] of Object.entries(r)) o = Ms(e, `${t}.${n}`, a, o, i);
    return ws(o, s);
  }
  throw new Error(`Unsupported CompositeShaderType for ${t}`);
}
function Bs(e, t) {
  if ("string" == typeof e) return Ps(e, t).size;
  if (Array.isArray(e)) {
    const r = e[0],
      n = e[1];
    if (Array.isArray(r)) throw new Error("Nested arrays are not supported");
    return Us(r, t) * n;
  }
  let r = 0;
  for (const n of Object.values(e)) {
    const e = n;
    ((r = ws(r, Ds(e, t))), (r += Bs(e, t)));
  }
  return ws(r, Ds(e, t));
}
function Ds(e, t) {
  if ("string" == typeof e) return Ps(e, t).alignment;
  if (Array.isArray(e)) {
    const r = Ds(e[0], t);
    return Gs(t) ? Math.max(r, 4) : r;
  }
  let r = 1;
  for (const n of Object.values(e)) {
    const e = Ds(n, t);
    r = Math.max(r, e);
  }
  return (function (e) {
    return "std140" === e || "wgsl-uniform" === e;
  })(t)
    ? Math.max(r, 4)
    : r;
}
function Fs(e, t, r, n) {
  return {
    alignment: 2 === e ? 2 : 4,
    size: 3 === e ? 3 : e,
    components: e,
    columns: 1,
    rows: e,
    columnStride: 3 === e ? 3 : e,
    shaderType: t,
    type: r,
  };
}
function Us(e, t) {
  return (function (e, t, r) {
    return ws(e, Gs(r) ? 4 : t);
  })(Bs(e, t), Ds(e, t), t);
}
function Gs(e) {
  return "std140" === e || "wgsl-uniform" === e;
}
function ks(e) {
  return ((!Os || Os.byteLength < e) && (Os = new ArrayBuffer(e)), Os);
}
function Ws(e) {
  return Array.isArray(e)
    ? 0 === e.length || "number" == typeof e[0]
    : (function (e) {
        return ArrayBuffer.isView(e) && !(e instanceof DataView);
      })(e);
}
var $s = class {
  layout;
  constructor(e) {
    this.layout = e;
  }
  has(e) {
    return Boolean(this.layout.fields[e]);
  }
  get(e) {
    const t = this.layout.fields[e];
    return t ? { offset: t.offset, size: t.size } : void 0;
  }
  getFlatUniformValues(e) {
    const t = {};
    for (const [r, n] of Object.entries(e)) {
      const e = this.layout.uniformTypes[r];
      e
        ? this._flattenCompositeValue(t, r, e, n)
        : this.layout.fields[r] && (t[r] = n);
    }
    return t;
  }
  getData(e) {
    const t = ks(this.layout.byteLength);
    new Uint8Array(t, 0, this.layout.byteLength).fill(0);
    const r = {
        i32: new Int32Array(t),
        u32: new Uint32Array(t),
        f32: new Float32Array(t),
        f16: new Uint16Array(t),
      },
      n = this.getFlatUniformValues(e);
    for (const [i, s] of Object.entries(n)) this._writeLeafValue(r, i, s);
    return new Uint8Array(t, 0, this.layout.byteLength);
  }
  _flattenCompositeValue(e, t, r, n) {
    if (void 0 !== n)
      if ("string" == typeof r || this.layout.fields[t]) e[t] = n;
      else {
        if (Array.isArray(r)) {
          const i = r[0],
            s = r[1];
          if (Array.isArray(i))
            throw new Error(`Nested arrays are not supported for ${t}`);
          if ("string" == typeof i && Ws(n))
            return void this._flattenPackedArray(e, t, i, s, n);
          if (!Array.isArray(n))
            return void Bn.warn(
              `Unsupported uniform array value for ${t}:`,
              n,
            )();
          for (let r = 0; r < Math.min(n.length, s); r++) {
            const s = n[r];
            void 0 !== s && this._flattenCompositeValue(e, `${t}[${r}]`, i, s);
          }
          return;
        }
        if (
          Is(r) &&
          (function (e) {
            return (
              Boolean(e) &&
              "object" == typeof e &&
              !Array.isArray(e) &&
              !ArrayBuffer.isView(e)
            );
          })(n)
        )
          for (const [i, s] of Object.entries(n)) {
            if (void 0 === s) continue;
            const n = `${t}.${i}`;
            this._flattenCompositeValue(e, n, r[i], s);
          }
        else Bn.warn(`Unsupported uniform value for ${t}:`, n)();
      }
  }
  _flattenPackedArray(e, t, r, n, i) {
    const s = i,
      o = Ps(r, this.layout.layout).components;
    for (let a = 0; a < n; a++) {
      const r = a * o;
      if (r >= s.length) break;
      e[`${t}[${a}]`] = 1 === o ? Number(s[r]) : Hs(i, r, r + o);
    }
  }
  _writeLeafValue(e, t, r) {
    const n = this.layout.fields[t];
    if (!n) return void Bn.warn(`Uniform ${t} not found in layout`)();
    const {
        type: i,
        components: s,
        columns: o,
        rows: a,
        offset: c,
        columnStride: l,
      } = n,
      u = e[i];
    if (1 === s) return void (u[c] = Number(r));
    const h = r;
    if (1 === o) {
      for (let e = 0; e < s; e++) u[c + e] = Number(h[e] ?? 0);
      return;
    }
    let d = 0;
    for (let f = 0; f < o; f++) {
      const e = c + f * l;
      for (let t = 0; t < a; t++) u[e + t] = Number(h[d++] ?? 0);
    }
  }
};
function Hs(e, t, r) {
  return Array.prototype.slice.call(e, t, r);
}
var Vs = class {
    name;
    uniforms = {};
    modifiedUniforms = {};
    modified = !0;
    bindingLayout = {};
    needsRedraw = "initialized";
    constructor(e) {
      if (((this.name = e?.name || "unnamed"), e?.name && e?.shaderLayout)) {
        const t = e?.shaderLayout.bindings?.find(
          (t) => "uniform" === t.type && t.name === e?.name,
        );
        if (!t) throw new Error(e?.name);
        const r = t;
        for (const e of r.uniforms || []) this.bindingLayout[e.name] = e;
      }
    }
    setUniforms(e) {
      for (const [t, r] of Object.entries(e))
        (this._setUniform(t, r),
          this.needsRedraw || this.setNeedsRedraw(`${this.name}.${t}=${r}`));
    }
    setNeedsRedraw(e) {
      this.needsRedraw = this.needsRedraw || e;
    }
    getAllUniforms() {
      return (
        (this.modifiedUniforms = {}),
        (this.needsRedraw = !1),
        this.uniforms || {}
      );
    }
    _setUniform(e, t) {
      var r;
      (function (e, t, r = 16) {
        if (e === t) return !0;
        const n = e,
          i = t;
        if (!Ws(n) || !Ws(i)) return !1;
        if (n.length !== i.length) return !1;
        const s = Math.min(r, 128);
        if (n.length > s) return !1;
        for (let o = 0; o < n.length; ++o) if (i[o] !== n[o]) return !1;
        return !0;
      })(this.uniforms[e], t) ||
        ((this.uniforms[e] = Ws((r = t)) ? r.slice() : r),
        (this.modifiedUniforms[e] = !0),
        (this.modified = !0));
    }
  },
  zs = class {
    device;
    uniformBlocks = new Map();
    shaderBlockLayouts = new Map();
    shaderBlockWriters = new Map();
    uniformBuffers = new Map();
    constructor(e, t) {
      this.device = e;
      for (const [r, n] of Object.entries(t)) {
        const t = r,
          i = xs(n.uniformTypes ?? {}, { layout: n.layout ?? Xs(e) }),
          s = new $s(i);
        (this.shaderBlockLayouts.set(t, i), this.shaderBlockWriters.set(t, s));
        const o = new Vs({ name: r });
        (o.setUniforms(s.getFlatUniformValues(n.defaultUniforms || {})),
          this.uniformBlocks.set(t, o));
      }
    }
    destroy() {
      for (const e of this.uniformBuffers.values()) e.destroy();
    }
    setUniforms(e) {
      for (const [t, r] of Object.entries(e)) {
        const e = t,
          n = this.shaderBlockWriters.get(e)?.getFlatUniformValues(r || {});
        this.uniformBlocks.get(e)?.setUniforms(n || {});
      }
      this.updateUniformBuffers();
    }
    getUniformBufferByteLength(e) {
      const t = this.shaderBlockLayouts.get(e)?.byteLength || 0;
      return Math.max(t, 1024);
    }
    getUniformBufferData(e) {
      const t = this.uniformBlocks.get(e)?.getAllUniforms() || {};
      return this.shaderBlockWriters.get(e)?.getData(t) || new Uint8Array(0);
    }
    createUniformBuffer(e, t) {
      t && this.setUniforms(t);
      const r = this.getUniformBufferByteLength(e),
        n = this.device.createBuffer({
          usage: qn.UNIFORM | qn.COPY_DST,
          byteLength: r,
        }),
        i = this.getUniformBufferData(e);
      return (n.write(i), n);
    }
    getManagedUniformBuffer(e) {
      if (!this.uniformBuffers.get(e)) {
        const t = this.getUniformBufferByteLength(e),
          r = this.device.createBuffer({
            usage: qn.UNIFORM | qn.COPY_DST,
            byteLength: t,
          });
        this.uniformBuffers.set(e, r);
      }
      return this.uniformBuffers.get(e);
    }
    updateUniformBuffers() {
      let e = !1;
      for (const t of this.uniformBlocks.keys()) {
        const r = this.updateUniformBuffer(t);
        e ||= r;
      }
      return (e && Bn.log(3, `UniformStore.updateUniformBuffers(): ${e}`)(), e);
    }
    updateUniformBuffer(e) {
      const t = this.uniformBlocks.get(e);
      let r = this.uniformBuffers.get(e),
        n = !1;
      if (r && t?.needsRedraw) {
        n ||= t.needsRedraw;
        const i = this.getUniformBufferData(e);
        ((r = this.uniformBuffers.get(e)), r?.write(i));
        const s = this.uniformBlocks.get(e)?.getAllUniforms();
        Bn.log(4, `Writing to uniform buffer ${String(e)}`, i, s)();
      }
      return n;
    }
  };
function Xs(e) {
  return "webgpu" === e.type ? "wgsl-uniform" : "std140";
}
var js =
    "precision highp int;\n\n// #if (defined(SHADER_TYPE_FRAGMENT) && defined(LIGHTING_FRAGMENT)) || (defined(SHADER_TYPE_VERTEX) && defined(LIGHTING_VERTEX))\nstruct AmbientLight {\n  vec3 color;\n};\n\nstruct PointLight {\n  vec3 color;\n  vec3 position;\n  vec3 attenuation; // 2nd order x:Constant-y:Linear-z:Exponential\n};\n\nstruct SpotLight {\n  vec3 color;\n  vec3 position;\n  vec3 direction;\n  vec3 attenuation;\n  vec2 coneCos;\n};\n\nstruct DirectionalLight {\n  vec3 color;\n  vec3 direction;\n};\n\nstruct UniformLight {\n  vec3 color;\n  vec3 position;\n  vec3 direction;\n  vec3 attenuation;\n  vec2 coneCos;\n};\n\nlayout(std140) uniform lightingUniforms {\n  int enabled;\n  int directionalLightCount;\n  int pointLightCount;\n  int spotLightCount;\n  vec3 ambientColor;\n  UniformLight lights[5];\n} lighting;\n\nPointLight lighting_getPointLight(int index) {\n  UniformLight light = lighting.lights[index];\n  return PointLight(light.color, light.position, light.attenuation);\n}\n\nSpotLight lighting_getSpotLight(int index) {\n  UniformLight light = lighting.lights[lighting.pointLightCount + index];\n  return SpotLight(light.color, light.position, light.direction, light.attenuation, light.coneCos);\n}\n\nDirectionalLight lighting_getDirectionalLight(int index) {\n  UniformLight light =\n    lighting.lights[lighting.pointLightCount + lighting.spotLightCount + index];\n  return DirectionalLight(light.color, light.direction);\n}\n\nfloat getPointLightAttenuation(PointLight pointLight, float distance) {\n  return pointLight.attenuation.x\n       + pointLight.attenuation.y * distance\n       + pointLight.attenuation.z * distance * distance;\n}\n\nfloat getSpotLightAttenuation(SpotLight spotLight, vec3 positionWorldspace) {\n  vec3 light_direction = normalize(positionWorldspace - spotLight.position);\n  float coneFactor = smoothstep(\n    spotLight.coneCos.y,\n    spotLight.coneCos.x,\n    dot(normalize(spotLight.direction), light_direction)\n  );\n  float distanceAttenuation = getPointLightAttenuation(\n    PointLight(spotLight.color, spotLight.position, spotLight.attenuation),\n    distance(spotLight.position, positionWorldspace)\n  );\n  return distanceAttenuation / max(coneFactor, 0.0001);\n}\n\n// #endif\n",
  Ks = {
    props: {},
    uniforms: {},
    name: "lighting",
    defines: {},
    uniformTypes: {
      enabled: "i32",
      directionalLightCount: "i32",
      pointLightCount: "i32",
      spotLightCount: "i32",
      ambientColor: "vec3<f32>",
      lights: [
        {
          color: "vec3<f32>",
          position: "vec3<f32>",
          direction: "vec3<f32>",
          attenuation: "vec3<f32>",
          coneCos: "vec2<f32>",
        },
        5,
      ],
    },
    defaultUniforms: Zs(),
    bindingLayout: [{ name: "lighting", group: 2 }],
    firstBindingSlot: 0,
    source:
      "// #if (defined(SHADER_TYPE_FRAGMENT) && defined(LIGHTING_FRAGMENT)) || (defined(SHADER_TYPE_VERTEX) && defined(LIGHTING_VERTEX))\nconst MAX_LIGHTS: i32 = 5;\n\nstruct AmbientLight {\n  color: vec3<f32>,\n};\n\nstruct PointLight {\n  color: vec3<f32>,\n  position: vec3<f32>,\n  attenuation: vec3<f32>, // 2nd order x:Constant-y:Linear-z:Exponential\n};\n\nstruct SpotLight {\n  color: vec3<f32>,\n  position: vec3<f32>,\n  direction: vec3<f32>,\n  attenuation: vec3<f32>,\n  coneCos: vec2<f32>,\n};\n\nstruct DirectionalLight {\n  color: vec3<f32>,\n  direction: vec3<f32>,\n};\n\nstruct UniformLight {\n  color: vec3<f32>,\n  position: vec3<f32>,\n  direction: vec3<f32>,\n  attenuation: vec3<f32>,\n  coneCos: vec2<f32>,\n};\n\nstruct lightingUniforms {\n  enabled: i32,\n  directionalLightCount: i32,\n  pointLightCount: i32,\n  spotLightCount: i32,\n  ambientColor: vec3<f32>,\n  lights: array<UniformLight, 5>,\n};\n\n@group(2) @binding(auto) var<uniform> lighting : lightingUniforms;\n\nfn lighting_getPointLight(index: i32) -> PointLight {\n  let light = lighting.lights[index];\n  return PointLight(light.color, light.position, light.attenuation);\n}\n\nfn lighting_getSpotLight(index: i32) -> SpotLight {\n  let light = lighting.lights[lighting.pointLightCount + index];\n  return SpotLight(light.color, light.position, light.direction, light.attenuation, light.coneCos);\n}\n\nfn lighting_getDirectionalLight(index: i32) -> DirectionalLight {\n  let light = lighting.lights[lighting.pointLightCount + lighting.spotLightCount + index];\n  return DirectionalLight(light.color, light.direction);\n}\n\nfn getPointLightAttenuation(pointLight: PointLight, distance: f32) -> f32 {\n  return pointLight.attenuation.x\n       + pointLight.attenuation.y * distance\n       + pointLight.attenuation.z * distance * distance;\n}\n\nfn getSpotLightAttenuation(spotLight: SpotLight, positionWorldspace: vec3<f32>) -> f32 {\n  let lightDirection = normalize(positionWorldspace - spotLight.position);\n  let coneFactor = smoothstep(\n    spotLight.coneCos.y,\n    spotLight.coneCos.x,\n    dot(normalize(spotLight.direction), lightDirection)\n  );\n  let distanceAttenuation = getPointLightAttenuation(\n    PointLight(spotLight.color, spotLight.position, spotLight.attenuation),\n    distance(spotLight.position, positionWorldspace)\n  );\n  return distanceAttenuation / max(coneFactor, 0.0001);\n}\n",
    vs: js,
    fs: js,
    getUniforms: function (e, t = {}) {
      if (!(e = e ? { ...e } : e)) return Zs();
      e.lights && (e = { ...e, ...Qs(e.lights), lights: void 0 });
      const {
        useByteColors: r,
        ambientLight: n,
        pointLights: i,
        spotLights: s,
        directionalLights: o,
      } = e || {};
      if (
        !(
          n ||
          (i && i.length > 0) ||
          (s && s.length > 0) ||
          (o && o.length > 0)
        )
      )
        return { ...Zs(), enabled: 0 };
      const a = {
        ...Zs(),
        ...Ys({
          useByteColors: r,
          ambientLight: n,
          pointLights: i,
          spotLights: s,
          directionalLights: o,
        }),
      };
      return (void 0 !== e.enabled && (a.enabled = e.enabled ? 1 : 0), a);
    },
  };
function Ys({
  useByteColors: e,
  ambientLight: t,
  pointLights: r = [],
  spotLights: n = [],
  directionalLights: i = [],
}) {
  const s = Js();
  let o = 0,
    a = 0,
    c = 0,
    l = 0;
  for (const u of r) {
    if (o >= 5) break;
    ((s[o] = {
      ...s[o],
      color: qs(u, e),
      position: u.position,
      attenuation: u.attenuation || [1, 0, 0],
    }),
      o++,
      a++);
  }
  for (const u of n) {
    if (o >= 5) break;
    ((s[o] = {
      ...s[o],
      color: qs(u, e),
      position: u.position,
      direction: u.direction,
      attenuation: u.attenuation || [1, 0, 0],
      coneCos: eo(u),
    }),
      o++,
      c++);
  }
  for (const u of i) {
    if (o >= 5) break;
    ((s[o] = { ...s[o], color: qs(u, e), direction: u.direction }), o++, l++);
  }
  return (
    r.length + n.length + i.length > 5 &&
      Bn.warn("MAX_LIGHTS exceeded, truncating to 5")(),
    {
      ambientColor: qs(t, e),
      directionalLightCount: l,
      pointLightCount: a,
      spotLightCount: c,
      lights: s,
    }
  );
}
function Qs(e) {
  const t = { pointLights: [], spotLights: [], directionalLights: [] };
  for (const r of e || [])
    switch (r.type) {
      case "ambient":
        t.ambientLight = r;
        break;
      case "directional":
        t.directionalLights?.push(r);
        break;
      case "point":
        t.pointLights?.push(r);
        break;
      case "spot":
        t.spotLights?.push(r);
    }
  return t;
}
function qs(e = {}, t) {
  const { color: r = [0, 0, 0], intensity: n = 1 } = e;
  return vn(r, Rn(t, !0)).map((e) => e * n);
}
function Zs() {
  return {
    enabled: 1,
    directionalLightCount: 0,
    pointLightCount: 0,
    spotLightCount: 0,
    ambientColor: [0.1, 0.1, 0.1],
    lights: Js(),
  };
}
function Js() {
  return Array.from({ length: 5 }, () => ({
    color: [1, 1, 1],
    position: [1, 1, 2],
    direction: [1, 1, 1],
    attenuation: [1, 0, 0],
    coneCos: [1, 0],
  }));
}
function eo(e) {
  const t = e.innerConeAngle ?? 0,
    r = e.outerConeAngle ?? Math.PI / 4;
  return [Math.cos(t), Math.cos(r)];
}
var to,
  ro,
  no,
  io =
    "layout(std140) uniform phongMaterialUniforms {\n  uniform bool unlit;\n  uniform float ambient;\n  uniform float diffuse;\n  uniform float shininess;\n  uniform vec3  specularColor;\n} material;\n",
  so =
    "layout(std140) uniform phongMaterialUniforms {\n  uniform bool unlit;\n  uniform float ambient;\n  uniform float diffuse;\n  uniform float shininess;\n  uniform vec3  specularColor;\n} material;\n\nvec3 lighting_getLightColor(vec3 surfaceColor, vec3 light_direction, vec3 view_direction, vec3 normal_worldspace, vec3 color) {\n  vec3 halfway_direction = normalize(light_direction + view_direction);\n  float lambertian = dot(light_direction, normal_worldspace);\n  float specular = 0.0;\n  if (lambertian > 0.0) {\n    float specular_angle = max(dot(normal_worldspace, halfway_direction), 0.0);\n    specular = pow(specular_angle, material.shininess);\n  }\n  lambertian = max(lambertian, 0.0);\n  return (lambertian * material.diffuse * surfaceColor + specular * floatColors_normalize(material.specularColor)) * color;\n}\n\nvec3 lighting_getLightColor(vec3 surfaceColor, vec3 cameraPosition, vec3 position_worldspace, vec3 normal_worldspace) {\n  vec3 lightColor = surfaceColor;\n\n  if (material.unlit) {\n    return surfaceColor;\n  }\n\n  if (lighting.enabled == 0) {\n    return lightColor;\n  }\n\n  vec3 view_direction = normalize(cameraPosition - position_worldspace);\n  lightColor = material.ambient * surfaceColor * lighting.ambientColor;\n\n  for (int i = 0; i < lighting.pointLightCount; i++) {\n    PointLight pointLight = lighting_getPointLight(i);\n    vec3 light_position_worldspace = pointLight.position;\n    vec3 light_direction = normalize(light_position_worldspace - position_worldspace);\n    float light_attenuation = getPointLightAttenuation(pointLight, distance(light_position_worldspace, position_worldspace));\n    lightColor += lighting_getLightColor(surfaceColor, light_direction, view_direction, normal_worldspace, pointLight.color / light_attenuation);\n  }\n\n  for (int i = 0; i < lighting.spotLightCount; i++) {\n    SpotLight spotLight = lighting_getSpotLight(i);\n    vec3 light_position_worldspace = spotLight.position;\n    vec3 light_direction = normalize(light_position_worldspace - position_worldspace);\n    float light_attenuation = getSpotLightAttenuation(spotLight, position_worldspace);\n    lightColor += lighting_getLightColor(surfaceColor, light_direction, view_direction, normal_worldspace, spotLight.color / light_attenuation);\n  }\n\n  for (int i = 0; i < lighting.directionalLightCount; i++) {\n    DirectionalLight directionalLight = lighting_getDirectionalLight(i);\n    lightColor += lighting_getLightColor(surfaceColor, -directionalLight.direction, view_direction, normal_worldspace, directionalLight.color);\n  }\n  \n  return lightColor;\n}\n",
  oo =
    "struct phongMaterialUniforms {\n  unlit: u32,\n  ambient: f32,\n  diffuse: f32,\n  shininess: f32,\n  specularColor: vec3<f32>,\n};\n\n@group(3) @binding(auto) var<uniform> phongMaterial : phongMaterialUniforms;\n\nfn lighting_getLightColor(surfaceColor: vec3<f32>, light_direction: vec3<f32>, view_direction: vec3<f32>, normal_worldspace: vec3<f32>, color: vec3<f32>) -> vec3<f32> {\n  let halfway_direction: vec3<f32> = normalize(light_direction + view_direction);\n  var lambertian: f32 = dot(light_direction, normal_worldspace);\n  var specular: f32 = 0.0;\n  if (lambertian > 0.0) {\n    let specular_angle = max(dot(normal_worldspace, halfway_direction), 0.0);\n    specular = pow(specular_angle, phongMaterial.shininess);\n  }\n  lambertian = max(lambertian, 0.0);\n  return (\n    lambertian * phongMaterial.diffuse * surfaceColor +\n    specular * floatColors_normalize(phongMaterial.specularColor)\n  ) * color;\n}\n\nfn lighting_getLightColor2(surfaceColor: vec3<f32>, cameraPosition: vec3<f32>, position_worldspace: vec3<f32>, normal_worldspace: vec3<f32>) -> vec3<f32> {\n  var lightColor: vec3<f32> = surfaceColor;\n\n  if (phongMaterial.unlit != 0u) {\n    return surfaceColor;\n  }\n\n  if (lighting.enabled == 0) {\n    return lightColor;\n  }\n\n  let view_direction: vec3<f32> = normalize(cameraPosition - position_worldspace);\n  lightColor = phongMaterial.ambient * surfaceColor * lighting.ambientColor;\n\n  for (var i: i32 = 0; i < lighting.pointLightCount; i++) {\n    let pointLight: PointLight = lighting_getPointLight(i);\n    let light_position_worldspace: vec3<f32> = pointLight.position;\n    let light_direction: vec3<f32> = normalize(light_position_worldspace - position_worldspace);\n    let light_attenuation = getPointLightAttenuation(\n      pointLight,\n      distance(light_position_worldspace, position_worldspace)\n    );\n    lightColor += lighting_getLightColor(\n      surfaceColor,\n      light_direction,\n      view_direction,\n      normal_worldspace,\n      pointLight.color / light_attenuation\n    );\n  }\n\n  for (var i: i32 = 0; i < lighting.spotLightCount; i++) {\n    let spotLight: SpotLight = lighting_getSpotLight(i);\n    let light_position_worldspace: vec3<f32> = spotLight.position;\n    let light_direction: vec3<f32> = normalize(light_position_worldspace - position_worldspace);\n    let light_attenuation = getSpotLightAttenuation(spotLight, position_worldspace);\n    lightColor += lighting_getLightColor(\n      surfaceColor,\n      light_direction,\n      view_direction,\n      normal_worldspace,\n      spotLight.color / light_attenuation\n    );\n  }\n\n  for (var i: i32 = 0; i < lighting.directionalLightCount; i++) {\n    let directionalLight: DirectionalLight = lighting_getDirectionalLight(i);\n    lightColor += lighting_getLightColor(surfaceColor, -directionalLight.direction, view_direction, normal_worldspace, directionalLight.color);\n  }  \n  \n  return lightColor;\n}\n\nfn lighting_getSpecularLightColor(cameraPosition: vec3<f32>, position_worldspace: vec3<f32>, normal_worldspace: vec3<f32>) -> vec3<f32>{\n  var lightColor = vec3<f32>(0, 0, 0);\n  let surfaceColor = vec3<f32>(0, 0, 0);\n\n  if (lighting.enabled != 0) {\n    let view_direction = normalize(cameraPosition - position_worldspace);\n\n    for (var i: i32 = 0; i < lighting.pointLightCount; i++) {\n      let pointLight: PointLight = lighting_getPointLight(i);\n      let light_position_worldspace: vec3<f32> = pointLight.position;\n      let light_direction: vec3<f32> = normalize(light_position_worldspace - position_worldspace);\n      let light_attenuation = getPointLightAttenuation(\n        pointLight,\n        distance(light_position_worldspace, position_worldspace)\n      );\n      lightColor += lighting_getLightColor(\n        surfaceColor,\n        light_direction,\n        view_direction,\n        normal_worldspace,\n        pointLight.color / light_attenuation\n      );\n    }\n\n    for (var i: i32 = 0; i < lighting.spotLightCount; i++) {\n      let spotLight: SpotLight = lighting_getSpotLight(i);\n      let light_position_worldspace: vec3<f32> = spotLight.position;\n      let light_direction: vec3<f32> = normalize(light_position_worldspace - position_worldspace);\n      let light_attenuation = getSpotLightAttenuation(spotLight, position_worldspace);\n      lightColor += lighting_getLightColor(\n        surfaceColor,\n        light_direction,\n        view_direction,\n        normal_worldspace,\n        spotLight.color / light_attenuation\n      );\n    }\n\n    for (var i: i32 = 0; i < lighting.directionalLightCount; i++) {\n        let directionalLight: DirectionalLight = lighting_getDirectionalLight(i);\n        lightColor += lighting_getLightColor(surfaceColor, -directionalLight.direction, view_direction, normal_worldspace, directionalLight.color);\n    }\n  }\n  return lightColor;\n}\n",
  ao = {
    props: {},
    name: "gouraudMaterial",
    bindingLayout: [{ name: "gouraudMaterial", group: 3 }],
    vs: so.replace("phongMaterial", "gouraudMaterial"),
    fs: io.replace("phongMaterial", "gouraudMaterial"),
    source: oo.replaceAll("phongMaterial", "gouraudMaterial"),
    defines: { LIGHTING_VERTEX: !0 },
    dependencies: [Ks, On],
    uniformTypes: {
      unlit: "i32",
      ambient: "f32",
      diffuse: "f32",
      shininess: "f32",
      specularColor: "vec3<f32>",
    },
    defaultUniforms: {
      unlit: !1,
      ambient: 0.35,
      diffuse: 0.6,
      shininess: 32,
      specularColor: [38.25, 38.25, 38.25],
    },
    getUniforms: (e) => ({ ...ao.defaultUniforms, ...e }),
  },
  co = {
    name: "phongMaterial",
    firstBindingSlot: 0,
    bindingLayout: [{ name: "phongMaterial", group: 3 }],
    dependencies: [Ks, On],
    source: oo,
    vs: io,
    fs: so,
    defines: { LIGHTING_FRAGMENT: !0 },
    uniformTypes: {
      unlit: "i32",
      ambient: "f32",
      diffuse: "f32",
      shininess: "f32",
      specularColor: "vec3<f32>",
    },
    defaultUniforms: {
      unlit: !1,
      ambient: 0.35,
      diffuse: 0.6,
      shininess: 32,
      specularColor: [38.25, 38.25, 38.25],
    },
    getUniforms: (e) => ({ ...co.defaultUniforms, ...e }),
  };
(!(function (e) {
  ((e[(e.Start = 1)] = "Start"),
    (e[(e.Move = 2)] = "Move"),
    (e[(e.End = 4)] = "End"),
    (e[(e.Cancel = 8)] = "Cancel"));
})(to || (to = {})),
  (function (e) {
    ((e[(e.None = 0)] = "None"),
      (e[(e.Left = 1)] = "Left"),
      (e[(e.Right = 2)] = "Right"),
      (e[(e.Up = 4)] = "Up"),
      (e[(e.Down = 8)] = "Down"),
      (e[(e.Horizontal = 3)] = "Horizontal"),
      (e[(e.Vertical = 12)] = "Vertical"),
      (e[(e.All = 15)] = "All"));
  })(ro || (ro = {})),
  (function (e) {
    ((e[(e.Possible = 1)] = "Possible"),
      (e[(e.Began = 2)] = "Began"),
      (e[(e.Changed = 4)] = "Changed"),
      (e[(e.Ended = 8)] = "Ended"),
      (e[(e.Recognized = 8)] = "Recognized"),
      (e[(e.Cancelled = 16)] = "Cancelled"),
      (e[(e.Failed = 32)] = "Failed"));
  })(no || (no = {})));
var lo = "manipulation",
  uo = "none",
  ho = "pan-x",
  fo = "pan-y",
  po = class {
    constructor(e, t) {
      ((this.actions = ""), (this.manager = e), this.set(t));
    }
    set(e) {
      ("compute" === e && (e = this.compute()),
        this.manager.element &&
          ((this.manager.element.style.touchAction = e), (this.actions = e)));
    }
    update() {
      this.set(this.manager.options.touchAction);
    }
    compute() {
      let e = [];
      for (const t of this.manager.recognizers)
        t.options.enable && (e = e.concat(t.getTouchAction()));
      return (function (e) {
        if (e.includes("none")) return uo;
        const t = e.includes(ho),
          r = e.includes(fo);
        return t && r
          ? uo
          : t || r
            ? t
              ? ho
              : fo
            : e.includes("manipulation")
              ? lo
              : "auto";
      })(e.join(" "));
    }
  };
function go(e) {
  return e.trim().split(/\s+/g);
}
function mo(e, t, r) {
  if (e) for (const n of go(t)) e.addEventListener(n, r, !1);
}
function _o(e, t, r) {
  if (e) for (const n of go(t)) e.removeEventListener(n, r, !1);
}
function Eo(e) {
  return (e.ownerDocument || e).defaultView;
}
function bo(e) {
  const t = e.length;
  if (1 === t)
    return { x: Math.round(e[0].clientX), y: Math.round(e[0].clientY) };
  let r = 0,
    n = 0,
    i = 0;
  for (; i < t; ) ((r += e[i].clientX), (n += e[i].clientY), i++);
  return { x: Math.round(r / t), y: Math.round(n / t) };
}
function yo(e) {
  const t = [];
  let r = 0;
  for (; r < e.pointers.length; )
    ((t[r] = {
      clientX: Math.round(e.pointers[r].clientX),
      clientY: Math.round(e.pointers[r].clientY),
    }),
      r++);
  return {
    timeStamp: Date.now(),
    pointers: t,
    center: bo(t),
    deltaX: e.deltaX,
    deltaY: e.deltaY,
  };
}
function To(e, t) {
  const r = t.x - e.x,
    n = t.y - e.y;
  return Math.sqrt(r * r + n * n);
}
function Ao(e, t) {
  const r = t.clientX - e.clientX,
    n = t.clientY - e.clientY;
  return Math.sqrt(r * r + n * n);
}
function Ro(e, t) {
  const r = t.clientX - e.clientX,
    n = t.clientY - e.clientY;
  return (180 * Math.atan2(n, r)) / Math.PI;
}
function vo(e, t) {
  return e === t
    ? ro.None
    : Math.abs(e) >= Math.abs(t)
      ? e < 0
        ? ro.Left
        : ro.Right
      : t < 0
        ? ro.Up
        : ro.Down;
}
function So(e, t, r) {
  return { x: t / e || 0, y: r / e || 0 };
}
var Co = class {
    constructor(e) {
      ((this.evEl = ""),
        (this.evWin = ""),
        (this.evTarget = ""),
        (this.domHandler = (e) => {
          this.manager.options.enable && this.handler(e);
        }),
        (this.manager = e),
        (this.element = e.element),
        (this.target = e.options.inputTarget || e.element));
    }
    callback(e, t) {
      !(function (e, t, r) {
        const n = r.pointers.length,
          i = r.changedPointers.length,
          s = t & to.Start && n - i === 0,
          o = t & (to.End | to.Cancel) && n - i === 0;
        ((r.isFirst = Boolean(s)),
          (r.isFinal = Boolean(o)),
          s && (e.session = {}),
          (r.eventType = t));
        const a = (function (e, t) {
          const { session: r } = e,
            { pointers: n } = t,
            { length: i } = n;
          (r.firstInput || (r.firstInput = yo(t)),
            i > 1 && !r.firstMultiple
              ? (r.firstMultiple = yo(t))
              : 1 === i && (r.firstMultiple = !1));
          const { firstInput: s, firstMultiple: o } = r,
            a = o ? o.center : s.center,
            c = (t.center = bo(n));
          ((t.timeStamp = Date.now()),
            (t.deltaTime = t.timeStamp - s.timeStamp),
            (t.angle = (function (e, t) {
              const r = t.x - e.x,
                n = t.y - e.y;
              return (180 * Math.atan2(n, r)) / Math.PI;
            })(a, c)),
            (t.distance = To(a, c)));
          const { deltaX: l, deltaY: u } = (function (e, t) {
            const r = t.center;
            let n = e.offsetDelta,
              i = e.prevDelta;
            const s = e.prevInput;
            return (
              (t.eventType !== to.Start && s?.eventType !== to.End) ||
                ((i = e.prevDelta = { x: s?.deltaX || 0, y: s?.deltaY || 0 }),
                (n = e.offsetDelta = { x: r.x, y: r.y })),
              { deltaX: i.x + (r.x - n.x), deltaY: i.y + (r.y - n.y) }
            );
          })(r, t);
          ((t.deltaX = l),
            (t.deltaY = u),
            (t.offsetDirection = vo(t.deltaX, t.deltaY)));
          const h = So(t.deltaTime, t.deltaX, t.deltaY);
          var d, f;
          ((t.overallVelocityX = h.x),
            (t.overallVelocityY = h.y),
            (t.overallVelocity = Math.abs(h.x) > Math.abs(h.y) ? h.x : h.y),
            (t.scale = o
              ? ((d = o.pointers), Ao((f = n)[0], f[1]) / Ao(d[0], d[1]))
              : 1),
            (t.rotation = o
              ? (function (e, t) {
                  return Ro(t[1], t[0]) - Ro(e[1], e[0]);
                })(o.pointers, n)
              : 0),
            (t.maxPointers = r.prevInput
              ? t.pointers.length > r.prevInput.maxPointers
                ? t.pointers.length
                : r.prevInput.maxPointers
              : t.pointers.length));
          let p = e.element;
          return (
            (function (e, t) {
              let r = e;
              for (; r; ) {
                if (r === t) return !0;
                r = r.parentNode;
              }
              return !1;
            })(t.srcEvent.target, p) && (p = t.srcEvent.target),
            (t.target = p),
            (function (e, t) {
              const r = e.lastInterval || t,
                n = t.timeStamp - r.timeStamp;
              let i, s, o, a;
              if (
                t.eventType !== to.Cancel &&
                (n > 25 || void 0 === r.velocity)
              ) {
                const c = t.deltaX - r.deltaX,
                  l = t.deltaY - r.deltaY,
                  u = So(n, c, l);
                ((s = u.x),
                  (o = u.y),
                  (i = Math.abs(u.x) > Math.abs(u.y) ? u.x : u.y),
                  (a = vo(c, l)),
                  (e.lastInterval = t));
              } else
                ((i = r.velocity),
                  (s = r.velocityX),
                  (o = r.velocityY),
                  (a = r.direction));
              ((t.velocity = i),
                (t.velocityX = s),
                (t.velocityY = o),
                (t.direction = a));
            })(r, t),
            t
          );
        })(e, r);
        (e.emit("hammer.input", a), e.recognize(a), (e.session.prevInput = a));
      })(this.manager, e, t);
    }
    init() {
      (mo(this.element, this.evEl, this.domHandler),
        mo(this.target, this.evTarget, this.domHandler),
        mo(Eo(this.element), this.evWin, this.domHandler));
    }
    destroy() {
      (_o(this.element, this.evEl, this.domHandler),
        _o(this.target, this.evTarget, this.domHandler),
        _o(Eo(this.element), this.evWin, this.domHandler));
    }
  },
  wo = {
    pointerdown: to.Start,
    pointermove: to.Move,
    pointerup: to.End,
    pointercancel: to.Cancel,
    pointerout: to.Cancel,
  },
  Lo = class extends Co {
    constructor(e) {
      (super(e),
        (this.evEl = "pointerdown"),
        (this.evWin = "pointermove pointerup pointercancel"),
        (this.store = this.manager.session.pointerEvents = []),
        this.init());
    }
    handler(e) {
      const { store: t } = this;
      let r = !1;
      const n = wo[e.type],
        i = e.pointerType,
        s = "touch" === i;
      let o = t.findIndex((t) => t.pointerId === e.pointerId);
      (n & to.Start && (e.buttons || s)
        ? o < 0 && (t.push(e), (o = t.length - 1))
        : n & (to.End | to.Cancel) && (r = !0),
        o < 0 ||
          ((t[o] = e),
          this.callback(n, {
            pointers: t,
            changedPointers: [e],
            eventType: n,
            pointerType: i,
            srcEvent: e,
          }),
          r && t.splice(o, 1)));
    }
  },
  Oo = ["", "webkit", "Moz", "MS", "ms", "o"];
function No(e, t) {
  const r = t[0].toUpperCase() + t.slice(1);
  for (const n of Oo) {
    const i = n ? n + r : t;
    if (i in e) return i;
  }
}
var xo = {
    touchAction: "compute",
    enable: !0,
    inputTarget: null,
    cssProps: {
      userSelect: "none",
      userDrag: "none",
      touchCallout: "none",
      tapHighlightColor: "rgba(0,0,0,0)",
    },
  },
  Po = class {
    constructor(e, t) {
      ((this.options = {
        ...xo,
        ...t,
        cssProps: { ...xo.cssProps, ...t.cssProps },
        inputTarget: t.inputTarget || e,
      }),
        (this.handlers = {}),
        (this.session = {}),
        (this.recognizers = []),
        (this.oldCssProps = {}),
        (this.element = e),
        (this.input = new Lo(this)),
        (this.touchAction = new po(this, this.options.touchAction)),
        this.toggleCssProps(!0));
    }
    set(e) {
      return (
        Object.assign(this.options, e),
        e.touchAction && this.touchAction.update(),
        e.inputTarget &&
          (this.input.destroy(),
          (this.input.target = e.inputTarget),
          this.input.init()),
        this
      );
    }
    stop(e) {
      this.session.stopped = e ? 2 : 1;
    }
    recognize(e) {
      const { session: t } = this;
      if (t.stopped) return;
      let r;
      this.session.prevented && e.srcEvent.preventDefault();
      const { recognizers: n } = this;
      let { curRecognizer: i } = t;
      (!i || (i && i.state & no.Recognized)) && (i = t.curRecognizer = null);
      let s = 0;
      for (; s < n.length; )
        ((r = n[s]),
          2 === t.stopped || (i && r !== i && !r.canRecognizeWith(i))
            ? r.reset()
            : r.recognize(e),
          !i &&
            r.state & (no.Began | no.Changed | no.Ended) &&
            (i = t.curRecognizer = r),
          s++);
    }
    get(e) {
      const { recognizers: t } = this;
      for (let r = 0; r < t.length; r++)
        if (t[r].options.event === e) return t[r];
      return null;
    }
    add(e) {
      if (Array.isArray(e)) {
        for (const t of e) this.add(t);
        return this;
      }
      const t = this.get(e.options.event);
      return (
        t && this.remove(t),
        this.recognizers.push(e),
        (e.manager = this),
        this.touchAction.update(),
        e
      );
    }
    remove(e) {
      if (Array.isArray(e)) {
        for (const t of e) this.remove(t);
        return this;
      }
      const t = "string" == typeof e ? this.get(e) : e;
      if (t) {
        const { recognizers: e } = this,
          r = e.indexOf(t);
        -1 !== r && (e.splice(r, 1), this.touchAction.update());
      }
      return this;
    }
    on(e, t) {
      if (!e || !t) return;
      const { handlers: r } = this;
      for (const n of go(e)) ((r[n] = r[n] || []), r[n].push(t));
    }
    off(e, t) {
      if (!e) return;
      const { handlers: r } = this;
      for (const n of go(e))
        t ? r[n] && r[n].splice(r[n].indexOf(t), 1) : delete r[n];
    }
    emit(e, t) {
      const r = this.handlers[e] && this.handlers[e].slice();
      if (!r || !r.length) return;
      const n = t;
      ((n.type = e),
        (n.preventDefault = function () {
          t.srcEvent.preventDefault();
        }));
      let i = 0;
      for (; i < r.length; ) (r[i](n), i++);
    }
    destroy() {
      (this.toggleCssProps(!1),
        (this.handlers = {}),
        (this.session = {}),
        this.input.destroy(),
        (this.element = null));
    }
    toggleCssProps(e) {
      const { element: t } = this;
      if (t) {
        for (const [r, n] of Object.entries(this.options.cssProps)) {
          const i = No(t.style, r);
          e
            ? ((this.oldCssProps[i] = t.style[i]), (t.style[i] = n))
            : (t.style[i] = this.oldCssProps[i] || "");
        }
        e || (this.oldCssProps = {});
      }
    }
  },
  Io = 1;
function Mo(e) {
  return e & no.Cancelled
    ? "cancel"
    : e & no.Ended
      ? "end"
      : e & no.Changed
        ? "move"
        : e & no.Began
          ? "start"
          : "";
}
var Bo = class {
    constructor(e) {
      ((this.options = e),
        (this.id = Io++),
        (this.state = no.Possible),
        (this.simultaneous = {}),
        (this.requireFail = []));
    }
    set(e) {
      return (
        Object.assign(this.options, e),
        this.manager.touchAction.update(),
        this
      );
    }
    recognizeWith(e) {
      if (Array.isArray(e)) {
        for (const t of e) this.recognizeWith(t);
        return this;
      }
      let t;
      if ("string" == typeof e) {
        if (((t = this.manager.get(e)), !t))
          throw new Error(`Cannot find recognizer ${e}`);
      } else t = e;
      const { simultaneous: r } = this;
      return (r[t.id] || ((r[t.id] = t), t.recognizeWith(this)), this);
    }
    dropRecognizeWith(e) {
      if (Array.isArray(e)) {
        for (const t of e) this.dropRecognizeWith(t);
        return this;
      }
      let t;
      return (
        (t = "string" == typeof e ? this.manager.get(e) : e),
        t && delete this.simultaneous[t.id],
        this
      );
    }
    requireFailure(e) {
      if (Array.isArray(e)) {
        for (const t of e) this.requireFailure(t);
        return this;
      }
      let t;
      if ("string" == typeof e) {
        if (((t = this.manager.get(e)), !t))
          throw new Error(`Cannot find recognizer ${e}`);
      } else t = e;
      const { requireFail: r } = this;
      return (-1 === r.indexOf(t) && (r.push(t), t.requireFailure(this)), this);
    }
    dropRequireFailure(e) {
      if (Array.isArray(e)) {
        for (const t of e) this.dropRequireFailure(t);
        return this;
      }
      let t;
      if (((t = "string" == typeof e ? this.manager.get(e) : e), t)) {
        const e = this.requireFail.indexOf(t);
        e > -1 && this.requireFail.splice(e, 1);
      }
      return this;
    }
    hasRequireFailures() {
      return Boolean(this.requireFail.find((e) => e.options.enable));
    }
    canRecognizeWith(e) {
      return Boolean(this.simultaneous[e.id]);
    }
    emit(e) {
      if (!e) return;
      const { state: t } = this;
      (t < no.Ended && this.manager.emit(this.options.event + Mo(t), e),
        this.manager.emit(this.options.event, e),
        e.additionalEvent && this.manager.emit(e.additionalEvent, e),
        t >= no.Ended && this.manager.emit(this.options.event + Mo(t), e));
    }
    tryEmit(e) {
      this.canEmit() ? this.emit(e) : (this.state = no.Failed);
    }
    canEmit() {
      let e = 0;
      for (; e < this.requireFail.length; ) {
        if (!(this.requireFail[e].state & (no.Failed | no.Possible))) return !1;
        e++;
      }
      return !0;
    }
    recognize(e) {
      const t = { ...e };
      if (!this.options.enable)
        return (this.reset(), void (this.state = no.Failed));
      (this.state & (no.Recognized | no.Cancelled | no.Failed) &&
        (this.state = no.Possible),
        (this.state = this.process(t)),
        this.state & (no.Began | no.Changed | no.Ended | no.Cancelled) &&
          this.tryEmit(t));
    }
    getEventNames() {
      return [this.options.event];
    }
    reset() {}
  },
  Do = class extends Bo {
    attrTest(e) {
      const t = this.options.pointers;
      return 0 === t || e.pointers.length === t;
    }
    process(e) {
      const { state: t } = this,
        { eventType: r } = e,
        n = t & (no.Began | no.Changed),
        i = this.attrTest(e);
      return n && (r & to.Cancel || !i)
        ? t | no.Cancelled
        : n || i
          ? r & to.End
            ? t | no.Ended
            : t & no.Began
              ? t | no.Changed
              : no.Began
          : no.Failed;
    }
  },
  Fo = class extends Bo {
    constructor(e = {}) {
      (super({
        enable: !0,
        event: "tap",
        pointers: 1,
        taps: 1,
        interval: 300,
        time: 250,
        threshold: 9,
        posThreshold: 10,
        ...e,
      }),
        (this.pTime = null),
        (this.pCenter = null),
        (this._timer = null),
        (this._input = null),
        (this.count = 0));
    }
    getTouchAction() {
      return [lo];
    }
    process(e) {
      const { options: t } = this,
        r = e.pointers.length === t.pointers,
        n = e.distance < t.threshold,
        i = e.deltaTime < t.time;
      if ((this.reset(), e.eventType & to.Start && 0 === this.count))
        return this.failTimeout();
      if (n && i && r) {
        if (e.eventType !== to.End) return this.failTimeout();
        const r = !this.pTime || e.timeStamp - this.pTime < t.interval,
          n = !this.pCenter || To(this.pCenter, e.center) < t.posThreshold;
        if (
          ((this.pTime = e.timeStamp),
          (this.pCenter = e.center),
          n && r ? (this.count += 1) : (this.count = 1),
          (this._input = e),
          this.count % t.taps === 0)
        )
          return this.hasRequireFailures()
            ? ((this._timer = setTimeout(() => {
                ((this.state = no.Recognized), this.tryEmit(this._input));
              }, t.interval)),
              no.Began)
            : no.Recognized;
      }
      return no.Failed;
    }
    failTimeout() {
      return (
        (this._timer = setTimeout(() => {
          this.state = no.Failed;
        }, this.options.interval)),
        no.Failed
      );
    }
    reset() {
      clearTimeout(this._timer);
    }
    emit(e) {
      this.state === no.Recognized &&
        ((e.tapCount = this.count), this.manager.emit(this.options.event, e));
    }
  },
  Uo = ["", "start", "move", "end", "cancel", "up", "down", "left", "right"],
  Go = class extends Do {
    constructor(e = {}) {
      (super({
        enable: !0,
        pointers: 1,
        event: "pan",
        threshold: 10,
        direction: ro.All,
        ...e,
      }),
        (this.pX = null),
        (this.pY = null));
    }
    getTouchAction() {
      const {
          options: { direction: e },
        } = this,
        t = [];
      return (
        e & ro.Horizontal && t.push(fo),
        e & ro.Vertical && t.push(ho),
        t
      );
    }
    getEventNames() {
      return Uo.map((e) => this.options.event + e);
    }
    directionTest(e) {
      const { options: t } = this;
      let r = !0,
        { distance: n } = e,
        { direction: i } = e;
      const s = e.deltaX,
        o = e.deltaY;
      return (
        i & t.direction ||
          (t.direction & ro.Horizontal
            ? ((i = 0 === s ? ro.None : s < 0 ? ro.Left : ro.Right),
              (r = s !== this.pX),
              (n = Math.abs(e.deltaX)))
            : ((i = 0 === o ? ro.None : o < 0 ? ro.Up : ro.Down),
              (r = o !== this.pY),
              (n = Math.abs(e.deltaY)))),
        (e.direction = i),
        r && n > t.threshold && Boolean(i & t.direction)
      );
    }
    attrTest(e) {
      return (
        super.attrTest(e) &&
        (Boolean(this.state & no.Began) ||
          (!(this.state & no.Began) && this.directionTest(e)))
      );
    }
    emit(e) {
      ((this.pX = e.deltaX), (this.pY = e.deltaY));
      const t = ro[e.direction].toLowerCase();
      (t && (e.additionalEvent = this.options.event + t), super.emit(e));
    }
  },
  ko = ["", "start", "move", "end", "cancel", "in", "out"],
  Wo = class extends Do {
    constructor(e = {}) {
      super({ enable: !0, event: "pinch", threshold: 0, pointers: 2, ...e });
    }
    getTouchAction() {
      return [uo];
    }
    getEventNames() {
      return ko.map((e) => this.options.event + e);
    }
    attrTest(e) {
      return (
        super.attrTest(e) &&
        (Math.abs(e.scale - 1) > this.options.threshold ||
          Boolean(this.state & no.Began))
      );
    }
    emit(e) {
      if (1 !== e.scale) {
        const t = e.scale < 1 ? "in" : "out";
        e.additionalEvent = this.options.event + t;
      }
      super.emit(e);
    }
  },
  $o = class {
    constructor(e, t, r) {
      ((this.element = e), (this.callback = t), (this.options = r));
    }
  },
  Ho =
    "undefined" != typeof navigator && navigator.userAgent
      ? navigator.userAgent.toLowerCase()
      : "",
  Vo =
    ("undefined" != typeof window ? window : global,
    -1 !== Ho.indexOf("firefox")),
  zo = 4.000244140625,
  Xo = class extends $o {
    constructor(e, t, r) {
      (super(e, t, { enable: !0, ...r }),
        (this.handleEvent = (e) => {
          if (!this.options.enable) return;
          let t = e.deltaY;
          (globalThis.WheelEvent &&
            (Vo &&
              e.deltaMode === globalThis.WheelEvent.DOM_DELTA_PIXEL &&
              (t /= globalThis.devicePixelRatio),
            e.deltaMode === globalThis.WheelEvent.DOM_DELTA_LINE && (t *= 40)),
            0 !== t && t % zo === 0 && (t = Math.floor(t / zo)),
            e.shiftKey && t && (t *= 0.25),
            this.callback({
              type: "wheel",
              center: { x: e.clientX, y: e.clientY },
              delta: -t,
              srcEvent: e,
              pointerType: "mouse",
              target: e.target,
            }));
        }),
        e.addEventListener("wheel", this.handleEvent, { passive: !1 }));
    }
    destroy() {
      this.element.removeEventListener("wheel", this.handleEvent);
    }
    enableEventType(e, t) {
      "wheel" === e && (this.options.enable = t);
    }
  },
  jo = [
    "mousedown",
    "mousemove",
    "mouseup",
    "mouseover",
    "mouseout",
    "mouseleave",
  ],
  Ko = class extends $o {
    constructor(e, t, r) {
      (super(e, t, { enable: !0, ...r }),
        (this.handleEvent = (e) => {
          (this.handleOverEvent(e),
            this.handleOutEvent(e),
            this.handleEnterEvent(e),
            this.handleLeaveEvent(e),
            this.handleMoveEvent(e));
        }),
        (this.pressed = !1));
      const { enable: n } = this.options;
      ((this.enableMoveEvent = n),
        (this.enableLeaveEvent = n),
        (this.enableEnterEvent = n),
        (this.enableOutEvent = n),
        (this.enableOverEvent = n),
        jo.forEach((t) => e.addEventListener(t, this.handleEvent)));
    }
    destroy() {
      jo.forEach((e) => this.element.removeEventListener(e, this.handleEvent));
    }
    enableEventType(e, t) {
      switch (e) {
        case "pointermove":
          this.enableMoveEvent = t;
          break;
        case "pointerover":
          this.enableOverEvent = t;
          break;
        case "pointerout":
          this.enableOutEvent = t;
          break;
        case "pointerenter":
          this.enableEnterEvent = t;
          break;
        case "pointerleave":
          this.enableLeaveEvent = t;
      }
    }
    handleOverEvent(e) {
      this.enableOverEvent &&
        "mouseover" === e.type &&
        this._emit("pointerover", e);
    }
    handleOutEvent(e) {
      this.enableOutEvent &&
        "mouseout" === e.type &&
        this._emit("pointerout", e);
    }
    handleEnterEvent(e) {
      this.enableEnterEvent &&
        "mouseenter" === e.type &&
        this._emit("pointerenter", e);
    }
    handleLeaveEvent(e) {
      this.enableLeaveEvent &&
        "mouseleave" === e.type &&
        this._emit("pointerleave", e);
    }
    handleMoveEvent(e) {
      if (this.enableMoveEvent)
        switch (e.type) {
          case "mousedown":
            e.button >= 0 && (this.pressed = !0);
            break;
          case "mousemove":
            (0 === e.buttons && (this.pressed = !1),
              this.pressed || this._emit("pointermove", e));
            break;
          case "mouseup":
            this.pressed = !1;
        }
    }
    _emit(e, t) {
      this.callback({
        type: e,
        center: { x: t.clientX, y: t.clientY },
        srcEvent: t,
        pointerType: "mouse",
        target: t.target,
      });
    }
  },
  Yo = ["keydown", "keyup"],
  Qo = class extends $o {
    constructor(e, t, r) {
      (super(e, t, { enable: !0, tabIndex: 0, ...r }),
        (this.handleEvent = (e) => {
          const t = e.target || e.srcElement;
          ("INPUT" === t.tagName && "text" === t.type) ||
            "TEXTAREA" === t.tagName ||
            (this.enableDownEvent &&
              "keydown" === e.type &&
              this.callback({
                type: "keydown",
                srcEvent: e,
                key: e.key,
                target: e.target,
              }),
            this.enableUpEvent &&
              "keyup" === e.type &&
              this.callback({
                type: "keyup",
                srcEvent: e,
                key: e.key,
                target: e.target,
              }));
        }),
        (this.enableDownEvent = this.options.enable),
        (this.enableUpEvent = this.options.enable),
        (e.tabIndex = this.options.tabIndex),
        (e.style.outline = "none"),
        Yo.forEach((t) => e.addEventListener(t, this.handleEvent)));
    }
    destroy() {
      Yo.forEach((e) => this.element.removeEventListener(e, this.handleEvent));
    }
    enableEventType(e, t) {
      ("keydown" === e && (this.enableDownEvent = t),
        "keyup" === e && (this.enableUpEvent = t));
    }
  },
  qo = class extends $o {
    constructor(e, t, r) {
      (super(e, t, r),
        (this.handleEvent = (e) => {
          this.options.enable &&
            this.callback({
              type: "contextmenu",
              center: { x: e.clientX, y: e.clientY },
              srcEvent: e,
              pointerType: "mouse",
              target: e.target,
            });
        }),
        e.addEventListener("contextmenu", this.handleEvent));
    }
    destroy() {
      this.element.removeEventListener("contextmenu", this.handleEvent);
    }
    enableEventType(e, t) {
      "contextmenu" === e && (this.options.enable = t);
    }
  },
  Zo = {
    pointerdown: 1,
    pointermove: 2,
    pointerup: 4,
    mousedown: 1,
    mousemove: 2,
    mouseup: 4,
  };
function Jo(e) {
  const t = Zo[e.srcEvent.type];
  if (!t) return null;
  const { buttons: r, button: n } = e.srcEvent;
  let i = !1,
    s = !1,
    o = !1;
  return (
    2 === t
      ? ((i = Boolean(1 & r)), (s = Boolean(4 & r)), (o = Boolean(2 & r)))
      : ((i = 0 === n), (s = 1 === n), (o = 2 === n)),
    { leftButton: i, middleButton: s, rightButton: o }
  );
}
function ea(e, t) {
  const r = e.center;
  if (!r) return null;
  const n = t.getBoundingClientRect(),
    i = n.width / t.offsetWidth || 1,
    s = n.height / t.offsetHeight || 1;
  return {
    center: r,
    offsetCenter: {
      x: (r.x - n.left - t.clientLeft) / i,
      y: (r.y - n.top - t.clientTop) / s,
    },
  };
}
var ta = { srcElement: "root", priority: 0 },
  ra = class {
    constructor(e, t) {
      ((this.handleEvent = (e) => {
        if (this.isEmpty()) return;
        const t = this._normalizeEvent(e);
        let r = e.srcEvent.target;
        for (; r && r !== t.rootElement; ) {
          if ((this._emit(t, r), t.handled)) return;
          r = r.parentNode;
        }
        this._emit(t, "root");
      }),
        (this.eventManager = e),
        (this.recognizerName = t),
        (this.handlers = []),
        (this.handlersByElement = new Map()),
        (this._active = !1));
    }
    isEmpty() {
      return !this._active;
    }
    add(e, t, r, n = !1, i = !1) {
      const { handlers: s, handlersByElement: o } = this,
        a = { ...ta, ...r };
      let c = o.get(a.srcElement);
      c || ((c = []), o.set(a.srcElement, c));
      const l = {
        type: e,
        handler: t,
        srcElement: a.srcElement,
        priority: a.priority,
      };
      (n && (l.once = !0),
        i && (l.passive = !0),
        s.push(l),
        (this._active = this._active || !l.passive));
      let u = c.length - 1;
      for (; u >= 0 && !(c[u].priority >= l.priority); ) u--;
      c.splice(u + 1, 0, l);
    }
    remove(e, t) {
      const { handlers: r, handlersByElement: n } = this;
      for (let i = r.length - 1; i >= 0; i--) {
        const s = r[i];
        if (s.type === e && s.handler === t) {
          r.splice(i, 1);
          const e = n.get(s.srcElement);
          (e.splice(e.indexOf(s), 1), 0 === e.length && n.delete(s.srcElement));
        }
      }
      this._active = r.some((e) => !e.passive);
    }
    _emit(e, t) {
      const r = this.handlersByElement.get(t);
      if (r) {
        let t = !1;
        const n = () => {
            e.handled = !0;
          },
          i = () => {
            ((e.handled = !0), (t = !0));
          },
          s = [];
        for (let o = 0; o < r.length; o++) {
          const { type: a, handler: c, once: l } = r[o];
          if (
            (c({
              ...e,
              type: a,
              stopPropagation: n,
              stopImmediatePropagation: i,
            }),
            l && s.push(r[o]),
            t)
          )
            break;
        }
        for (let e = 0; e < s.length; e++) {
          const { type: t, handler: r } = s[e];
          this.remove(t, r);
        }
      }
    }
    _normalizeEvent(e) {
      const t = this.eventManager.getElement();
      return {
        ...e,
        ...Jo(e),
        ...ea(e, t),
        preventDefault: () => {
          e.srcEvent.preventDefault();
        },
        stopImmediatePropagation: null,
        stopPropagation: null,
        handled: !1,
        rootElement: t,
      };
    }
  };
function na(e) {
  if ("recognizer" in e) return e;
  let t;
  const r = Array.isArray(e) ? [...e] : [e];
  return (
    (t =
      "function" == typeof r[0] ? new (r.shift())(r.shift() || {}) : r.shift()),
    {
      recognizer: t,
      recognizeWith: "string" == typeof r[0] ? [r[0]] : r[0],
      requireFailure: "string" == typeof r[1] ? [r[1]] : r[1],
    }
  );
}
var ia = class {
  constructor(e = null, t = {}) {
    if (
      ((this._onBasicInput = (e) => {
        this.manager.emit(e.srcEvent.type, e);
      }),
      (this._onOtherEvent = (e) => {
        this.manager.emit(e.type, e);
      }),
      (this.options = {
        recognizers: [],
        events: {},
        touchAction: "compute",
        tabIndex: 0,
        cssProps: {},
        ...t,
      }),
      (this.events = new Map()),
      (this.element = e),
      e)
    ) {
      this.manager = new Po(e, this.options);
      for (const e of this.options.recognizers) {
        const { recognizer: t, recognizeWith: r, requireFailure: n } = na(e);
        (this.manager.add(t),
          r && t.recognizeWith(r),
          n && t.requireFailure(n));
      }
      (this.manager.on("hammer.input", this._onBasicInput),
        (this.wheelInput = new Xo(e, this._onOtherEvent, { enable: !1 })),
        (this.moveInput = new Ko(e, this._onOtherEvent, { enable: !1 })),
        (this.keyInput = new Qo(e, this._onOtherEvent, {
          enable: !1,
          tabIndex: t.tabIndex,
        })),
        (this.contextmenuInput = new qo(e, this._onOtherEvent, { enable: !1 })),
        this.on(this.options.events));
    }
  }
  getElement() {
    return this.element;
  }
  destroy() {
    this.element &&
      (this.wheelInput.destroy(),
      this.moveInput.destroy(),
      this.keyInput.destroy(),
      this.contextmenuInput.destroy(),
      this.manager.destroy());
  }
  on(e, t, r) {
    this._addEventHandler(e, t, r, !1);
  }
  once(e, t, r) {
    this._addEventHandler(e, t, r, !0);
  }
  watch(e, t, r) {
    this._addEventHandler(e, t, r, !1, !0);
  }
  off(e, t) {
    this._removeEventHandler(e, t);
  }
  _toggleRecognizer(e, t) {
    const { manager: r } = this;
    if (!r) return;
    const n = r.get(e);
    (n && (n.set({ enable: t }), r.touchAction.update()),
      this.wheelInput?.enableEventType(e, t),
      this.moveInput?.enableEventType(e, t),
      this.keyInput?.enableEventType(e, t),
      this.contextmenuInput?.enableEventType(e, t));
  }
  _addEventHandler(e, t, r, n, i) {
    if ("string" != typeof e) {
      r = t;
      for (const [t, s] of Object.entries(e))
        this._addEventHandler(t, s, r, n, i);
      return;
    }
    const { manager: s, events: o } = this;
    if (!s) return;
    let a = o.get(e);
    if (!a) {
      const t = this._getRecognizerName(e) || e;
      ((a = new ra(this, t)), o.set(e, a), s && s.on(e, a.handleEvent));
    }
    (a.add(e, t, r, n, i),
      a.isEmpty() || this._toggleRecognizer(a.recognizerName, !0));
  }
  _removeEventHandler(e, t) {
    if ("string" != typeof e) {
      for (const [t, r] of Object.entries(e)) this._removeEventHandler(t, r);
      return;
    }
    const { events: r } = this,
      n = r.get(e);
    if (n && (n.remove(e, t), n.isEmpty())) {
      const { recognizerName: e } = n;
      let t = !1;
      for (const n of r.values())
        if (n.recognizerName === e && !n.isEmpty()) {
          t = !0;
          break;
        }
      t || this._toggleRecognizer(e, !1);
    }
  }
  _getRecognizerName(e) {
    return this.manager.recognizers.find((t) => t.getEventNames().includes(e))
      ?.options.event;
  }
};
function sa(e, t) {
  const r = dn([], t, e);
  return (hn(r, r, 1 / r[3]), r);
}
function oa(e, t, r) {
  return e < t ? t : e > r ? r : e;
}
var aa =
  Math.log2 ||
  function (e) {
    return Math.log(e) * Math.LOG2E;
  };
function ca(e, t) {
  if (!e) throw new Error(t || "@math.gl/web-mercator: assertion failed.");
}
var la = Math.PI,
  ua = la / 4,
  ha = la / 180,
  da = 180 / la,
  fa = 512,
  pa = 85.051129,
  ga = 1.5;
function ma(e) {
  const [t, r] = e;
  (ca(Number.isFinite(t)),
    ca(Number.isFinite(r) && r >= -90 && r <= 90, "invalid latitude"));
  const n = r * ha;
  return [
    (fa * (t * ha + la)) / (2 * la),
    (fa * (la + Math.log(Math.tan(ua + 0.5 * n)))) / (2 * la),
  ];
}
function _a(e) {
  const [t, r] = e,
    n = (t / fa) * (2 * la) - la,
    i = 2 * (Math.atan(Math.exp((r / fa) * (2 * la) - la)) - ua);
  return [n * da, i * da];
}
function Ea(e) {
  const { latitude: t } = e;
  return (
    ca(Number.isFinite(t)),
    (function (e) {
      return aa(e);
    })(4003e4 * Math.cos(t * ha)) - 9
  );
}
function ba(e) {
  return 12790407194604047e-21 / Math.cos(e * ha);
}
function ya(e) {
  const { latitude: t, longitude: r, highPrecision: n = !1 } = e;
  ca(Number.isFinite(t) && Number.isFinite(r));
  const i = Math.cos(t * ha),
    s = 512 / 360,
    o = s / i,
    a = 12790407194604047e-21 / i,
    c = {
      unitsPerMeter: [a, a, a],
      metersPerUnit: [1 / a, 1 / a, 1 / a],
      unitsPerDegree: [s, o, a],
      degreesPerUnit: [0.703125, 1 / o, 1 / a],
    };
  if (n) {
    const e = (ha * Math.tan(t * ha)) / i,
      r = (s * e) / 2,
      n = 12790407194604047e-21 * e,
      l = (n / o) * a;
    ((c.unitsPerDegree2 = [0, r, n]), (c.unitsPerMeter2 = [l, 0, l]));
  }
  return c;
}
function Ta(e, t) {
  const [r, n, i] = e,
    [s, o, a] = t,
    { unitsPerMeter: c, unitsPerMeter2: l } = ya({
      longitude: r,
      latitude: n,
      highPrecision: !0,
    }),
    u = ma(e);
  ((u[0] += s * (c[0] + l[0] * o)), (u[1] += o * (c[1] + l[1] * o)));
  const h = _a(u),
    d = (i || 0) + (a || 0);
  return Number.isFinite(i) || Number.isFinite(a) ? [h[0], h[1], d] : h;
}
function Aa(e) {
  const {
      height: t,
      pitch: r,
      bearing: n,
      altitude: i,
      scale: s,
      center: o,
    } = e,
    a = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  (on(a, a, [0, 0, -i]), cn(a, a, -r * ha), ln(a, a, n * ha));
  const c = s / t;
  var l, u;
  return (
    an(a, a, [c, c, c]),
    o &&
      on(
        a,
        a,
        (((l = [])[0] = -(u = o)[0]), (l[1] = -u[1]), (l[2] = -u[2]), l),
      ),
    a
  );
}
function Ra(e) {
  const {
    width: t,
    height: r,
    altitude: n,
    pitch: i = 0,
    offset: s,
    center: o,
    scale: a,
    nearZMultiplier: c = 1,
    farZMultiplier: l = 1,
  } = e;
  let { fovy: u = va(ga) } = e;
  void 0 !== n && (u = va(n));
  const h = u * ha,
    d = i * ha,
    f = Sa(u);
  let p = f;
  o && (p += (o[2] * a) / Math.cos(d) / r);
  const g = h * (0.5 + (s ? s[1] : 0) / r),
    m =
      (Math.sin(g) * p) /
      Math.sin(oa(Math.PI / 2 - d - g, 0.01, Math.PI - 0.01)),
    _ = Math.sin(d) * m + p,
    E = 10 * p;
  return {
    fov: h,
    aspect: t / r,
    focalDistance: f,
    near: c,
    far: Math.min(_ * l, E),
  };
}
function va(e) {
  return 2 * Math.atan(0.5 / e) * da;
}
function Sa(e) {
  return 0.5 / Math.tan(0.5 * e * ha);
}
function Ca(e, t) {
  const [r, n, i = 0] = e;
  return (
    ca(Number.isFinite(r) && Number.isFinite(n) && Number.isFinite(i)),
    sa(t, [r, n, i, 1])
  );
}
function wa(e, t, r = 0) {
  const [n, i, s] = e;
  if (
    (ca(Number.isFinite(n) && Number.isFinite(i), "invalid pixel coordinate"),
    Number.isFinite(s))
  )
    return sa(t, [n, i, s, 1]);
  const o = sa(t, [n, i, 0, 1]),
    a = sa(t, [n, i, 1, 1]),
    c = o[2],
    l = a[2];
  return zr([], o, a, c === l ? 0 : ((r || 0) - c) / (l - c));
}
function La(e) {
  const {
      width: t,
      height: r,
      bounds: n,
      minExtent: i = 0,
      maxZoom: s = 24,
      offset: o = [0, 0],
    } = e,
    [[a, c], [l, u]] = n,
    h = (function (e = 0) {
      return "number" == typeof e
        ? { top: e, bottom: e, left: e, right: e }
        : (ca(
            Number.isFinite(e.top) &&
              Number.isFinite(e.bottom) &&
              Number.isFinite(e.left) &&
              Number.isFinite(e.right),
          ),
          e);
    })(e.padding),
    d = ma([a, oa(u, -85.051129, pa)]),
    f = ma([l, oa(c, -85.051129, pa)]),
    p = [
      Math.max(Math.abs(f[0] - d[0]), i),
      Math.max(Math.abs(f[1] - d[1]), i),
    ],
    g = [
      t - h.left - h.right - 2 * Math.abs(o[0]),
      r - h.top - h.bottom - 2 * Math.abs(o[1]),
    ];
  ca(g[0] > 0 && g[1] > 0);
  const m = g[0] / p[0],
    _ = g[1] / p[1],
    E = (h.right - h.left) / 2 / m,
    b = (h.top - h.bottom) / 2 / _,
    y = _a([(f[0] + d[0]) / 2 + E, (f[1] + d[1]) / 2 + b]),
    T = Math.min(s, aa(Math.abs(Math.min(m, _))));
  return (ca(Number.isFinite(T)), { longitude: y[0], latitude: y[1], zoom: T });
}
var Oa = Math.PI / 180;
function Na(e, t = 0) {
  const { width: r, height: n, unproject: i } = e,
    s = { targetZ: t },
    o = i([0, n], s),
    a = i([r, n], s);
  let c, l;
  return (
    (e.fovy ? 0.5 * e.fovy * Oa : Math.atan(0.5 / e.altitude)) >
    (90 - e.pitch) * Oa - 0.01
      ? ((c = xa(e, 0, t)), (l = xa(e, r, t)))
      : ((c = i([0, 0], s)), (l = i([r, 0], s))),
    [o, a, l, c]
  );
}
function xa(e, t, r) {
  const { pixelUnprojectionMatrix: n } = e,
    i = sa(n, [t, 0, 1, 1]),
    s = sa(n, [t, e.height, 1, 1]),
    o = _a(
      zr(
        [],
        i,
        s,
        (r * e.distanceScales.unitsPerMeter[2] - i[2]) / (s[2] - i[2]),
      ),
    );
  return (o.push(r), o);
}
var Pa = 1,
  Ia = 1,
  Ma = class {
    time = 0;
    channels = new Map();
    animations = new Map();
    playing = !1;
    lastEngineTime = -1;
    constructor() {}
    addChannel(e) {
      const {
          delay: t = 0,
          duration: r = Number.POSITIVE_INFINITY,
          rate: n = 1,
          repeat: i = 1,
        } = e,
        s = Pa++,
        o = { time: 0, delay: t, duration: r, rate: n, repeat: i };
      return (this._setChannelTime(o, this.time), this.channels.set(s, o), s);
    }
    removeChannel(e) {
      this.channels.delete(e);
      for (const [t, r] of this.animations)
        r.channel === e && this.detachAnimation(t);
    }
    isFinished(e) {
      const t = this.channels.get(e);
      return void 0 !== t && this.time >= t.delay + t.duration * t.repeat;
    }
    getTime(e) {
      if (void 0 === e) return this.time;
      const t = this.channels.get(e);
      return void 0 === t ? -1 : t.time;
    }
    setTime(e) {
      this.time = Math.max(0, e);
      const t = this.channels.values();
      for (const n of t) this._setChannelTime(n, this.time);
      const r = this.animations.values();
      for (const n of r) {
        const { animation: e, channel: t } = n;
        e.setTime(this.getTime(t));
      }
    }
    play() {
      this.playing = !0;
    }
    pause() {
      ((this.playing = !1), (this.lastEngineTime = -1));
    }
    reset() {
      this.setTime(0);
    }
    attachAnimation(e, t) {
      const r = Ia++;
      return (
        this.animations.set(r, { animation: e, channel: t }),
        e.setTime(this.getTime(t)),
        r
      );
    }
    detachAnimation(e) {
      this.animations.delete(e);
    }
    update(e) {
      this.playing &&
        (-1 === this.lastEngineTime && (this.lastEngineTime = e),
        this.setTime(this.time + (e - this.lastEngineTime)),
        (this.lastEngineTime = e));
    }
    _setChannelTime(e, t) {
      const r = t - e.delay;
      r >= e.duration * e.repeat
        ? (e.time = e.duration * e.rate)
        : ((e.time = Math.max(0, r) % e.duration), (e.time *= e.rate));
    }
  },
  Ba = 0,
  Da = class e {
    static defaultAnimationLoopProps = {
      device: null,
      onAddHTML: () => "",
      onInitialize: async () => null,
      onRender: () => {},
      onFinalize: () => {},
      onError: (e) => {},
      stats: void 0,
      autoResizeViewport: !1,
    };
    device = null;
    canvas = null;
    props;
    animationProps = null;
    timeline = null;
    stats;
    sharedStats;
    cpuTime;
    gpuTime;
    frameRate;
    display;
    _needsRedraw = "initialized";
    _initialized = !1;
    _running = !1;
    _animationFrameId = null;
    _nextFramePromise = null;
    _resolveNextFrame = null;
    _cpuStartTime = 0;
    _error = null;
    _lastFrameTime = 0;
    constructor(t) {
      if (
        ((this.props = { ...e.defaultAnimationLoopProps, ...t }),
        !(t = this.props).device)
      )
        throw new Error("No device provided");
      ((this.stats = t.stats || new te({ id: "animation-loop-" + Ba++ })),
        (this.sharedStats = xi.stats.get("Animation Loop")),
        (this.frameRate = this.stats.get("Frame Rate")),
        this.frameRate.setSampleSize(1),
        (this.cpuTime = this.stats.get("CPU Time")),
        (this.gpuTime = this.stats.get("GPU Time")),
        this.setProps({ autoResizeViewport: t.autoResizeViewport }),
        (this.start = this.start.bind(this)),
        (this.stop = this.stop.bind(this)),
        (this._onMousemove = this._onMousemove.bind(this)),
        (this._onMouseleave = this._onMouseleave.bind(this)));
    }
    destroy() {
      (this.stop(),
        this._setDisplay(null),
        this.device?._disableDebugGPUTime());
    }
    delete() {
      this.destroy();
    }
    reportError(e) {
      (this.props.onError(e), (this._error = e));
    }
    setNeedsRedraw(e) {
      return ((this._needsRedraw = this._needsRedraw || e), this);
    }
    needsRedraw() {
      const e = this._needsRedraw;
      return ((this._needsRedraw = !1), e);
    }
    setProps(e) {
      return (
        "autoResizeViewport" in e &&
          (this.props.autoResizeViewport = e.autoResizeViewport || !1),
        this
      );
    }
    async start() {
      if (this._running) return this;
      this._running = !0;
      try {
        if (!this._initialized) {
          if (
            ((this._initialized = !0),
            await this._initDevice(),
            this._initialize(),
            !this._running)
          )
            return null;
          await this.props.onInitialize(this._getAnimationProps());
        }
        return this._running
          ? (this._cancelAnimationFrame(), this._requestAnimationFrame(), this)
          : null;
      } catch (e) {
        const t = e instanceof Error ? e : new Error("Unknown error");
        throw (this.props.onError(t), t);
      }
    }
    stop() {
      return (
        this._running &&
          (this.animationProps &&
            !this._error &&
            this.props.onFinalize(this.animationProps),
          this._cancelAnimationFrame(),
          (this._nextFramePromise = null),
          (this._resolveNextFrame = null),
          (this._running = !1),
          (this._lastFrameTime = 0)),
        this
      );
    }
    redraw(e) {
      return (
        this.device?.isLost ||
          this._error ||
          (this._beginFrameTimers(e),
          this._setupFrame(),
          this._updateAnimationProps(),
          this._renderFrame(this._getAnimationProps()),
          this._clearNeedsRedraw(),
          this._resolveNextFrame &&
            (this._resolveNextFrame(this),
            (this._nextFramePromise = null),
            (this._resolveNextFrame = null)),
          this._endFrameTimers()),
        this
      );
    }
    attachTimeline(e) {
      return ((this.timeline = e), this.timeline);
    }
    detachTimeline() {
      this.timeline = null;
    }
    waitForRender() {
      return (
        this.setNeedsRedraw("waitForRender"),
        this._nextFramePromise ||
          (this._nextFramePromise = new Promise((e) => {
            this._resolveNextFrame = e;
          })),
        this._nextFramePromise
      );
    }
    async toDataURL() {
      if (
        (this.setNeedsRedraw("toDataURL"),
        await this.waitForRender(),
        this.canvas instanceof HTMLCanvasElement)
      )
        return this.canvas.toDataURL();
      throw new Error("OffscreenCanvas");
    }
    _initialize() {
      (this._startEventHandling(),
        this._initializeAnimationProps(),
        this._updateAnimationProps(),
        this._resizeViewport(),
        this.device?._enableDebugGPUTime());
    }
    _setDisplay(e) {
      (this.display &&
        (this.display.destroy(), (this.display.animationLoop = null)),
        e && (e.animationLoop = this),
        (this.display = e));
    }
    _requestAnimationFrame() {
      this._running &&
        (this._animationFrameId = (function (e) {
          const t =
            "undefined" != typeof window
              ? window.requestAnimationFrame ||
                window.webkitRequestAnimationFrame ||
                window.mozRequestAnimationFrame
              : null;
          return t
            ? t.call(window, e)
            : setTimeout(
                () =>
                  e(
                    "undefined" != typeof performance
                      ? performance.now()
                      : Date.now(),
                  ),
                1e3 / 60,
              );
        })(this._animationFrame.bind(this)));
    }
    _cancelAnimationFrame() {
      null !== this._animationFrameId &&
        ((function (e) {
          const t =
            "undefined" != typeof window
              ? window.cancelAnimationFrame ||
                window.webkitCancelAnimationFrame ||
                window.mozCancelAnimationFrame
              : null;
          t ? t.call(window, e) : clearTimeout(e);
        })(this._animationFrameId),
        (this._animationFrameId = null));
    }
    _animationFrame(e) {
      this._running && (this.redraw(e), this._requestAnimationFrame());
    }
    _renderFrame(e) {
      this.display
        ? this.display._renderFrame(e)
        : (this.props.onRender(this._getAnimationProps()),
          this.device?.submit());
    }
    _clearNeedsRedraw() {
      this._needsRedraw = !1;
    }
    _setupFrame() {
      this._resizeViewport();
    }
    _initializeAnimationProps() {
      const e = this.device?.getDefaultCanvasContext();
      if (!this.device || !e) throw new Error("loop");
      const t = e?.canvas,
        r = e.props.useDevicePixels;
      this.animationProps = {
        animationLoop: this,
        device: this.device,
        canvasContext: e,
        canvas: t,
        useDevicePixels: r,
        timeline: this.timeline,
        needsRedraw: !1,
        width: 1,
        height: 1,
        aspect: 1,
        time: 0,
        startTime: Date.now(),
        engineTime: 0,
        tick: 0,
        tock: 0,
        _mousePosition: null,
      };
    }
    _getAnimationProps() {
      if (!this.animationProps) throw new Error("animationProps");
      return this.animationProps;
    }
    _updateAnimationProps() {
      if (!this.animationProps) return;
      const { width: e, height: t, aspect: r } = this._getSizeAndAspect();
      ((e === this.animationProps.width && t === this.animationProps.height) ||
        this.setNeedsRedraw("drawing buffer resized"),
        r !== this.animationProps.aspect &&
          this.setNeedsRedraw("drawing buffer aspect changed"),
        (this.animationProps.width = e),
        (this.animationProps.height = t),
        (this.animationProps.aspect = r),
        (this.animationProps.needsRedraw = this._needsRedraw),
        (this.animationProps.engineTime =
          Date.now() - this.animationProps.startTime),
        this.timeline && this.timeline.update(this.animationProps.engineTime),
        (this.animationProps.tick = Math.floor(
          (this.animationProps.time / 1e3) * 60,
        )),
        this.animationProps.tock++,
        (this.animationProps.time = this.timeline
          ? this.timeline.getTime()
          : this.animationProps.engineTime));
    }
    async _initDevice() {
      if (((this.device = await this.props.device), !this.device))
        throw new Error("No device provided");
      this.canvas = this.device.getDefaultCanvasContext().canvas || null;
    }
    _createInfoDiv() {
      if (this.canvas && this.props.onAddHTML) {
        const e = document.createElement("div");
        (document.body.appendChild(e), (e.style.position = "relative"));
        const t = document.createElement("div");
        ((t.style.position = "absolute"),
          (t.style.left = "10px"),
          (t.style.bottom = "10px"),
          (t.style.width = "300px"),
          (t.style.background = "white"),
          this.canvas instanceof HTMLCanvasElement &&
            e.appendChild(this.canvas),
          e.appendChild(t));
        const r = this.props.onAddHTML(t);
        r && (t.innerHTML = r);
      }
    }
    _getSizeAndAspect() {
      if (!this.device) return { width: 1, height: 1, aspect: 1 };
      const [e, t] = this.device
        .getDefaultCanvasContext()
        .getDrawingBufferSize();
      return { width: e, height: t, aspect: e > 0 && t > 0 ? e / t : 1 };
    }
    _resizeViewport() {
      this.props.autoResizeViewport &&
        this.device.gl &&
        this.device.gl.viewport(
          0,
          0,
          this.device.gl.drawingBufferWidth,
          this.device.gl.drawingBufferHeight,
        );
    }
    _beginFrameTimers(e) {
      const t =
        e ??
        ("undefined" != typeof performance ? performance.now() : Date.now());
      if (this._lastFrameTime) {
        const e = t - this._lastFrameTime;
        e > 0 && this.frameRate.addTime(e);
      }
      ((this._lastFrameTime = t),
        this.device?._isDebugGPUTimeEnabled() && this._consumeEncodedGpuTime(),
        this.cpuTime.timeStart());
    }
    _endFrameTimers() {
      (this.device?._isDebugGPUTimeEnabled() && this._consumeEncodedGpuTime(),
        this.cpuTime.timeEnd(),
        this._updateSharedStats());
    }
    _consumeEncodedGpuTime() {
      if (!this.device) return;
      const e = this.device.commandEncoder._gpuTimeMs;
      void 0 !== e &&
        (this.gpuTime.addTime(e),
        (this.device.commandEncoder._gpuTimeMs = void 0));
    }
    _updateSharedStats() {
      if (this.stats !== this.sharedStats) {
        for (const e of Object.keys(this.sharedStats.stats))
          this.stats.stats[e] || delete this.sharedStats.stats[e];
        this.stats.forEach((e) => {
          const t = this.sharedStats.get(e.name, e.type);
          ((t.sampleSize = e.sampleSize),
            (t.time = e.time),
            (t.count = e.count),
            (t.samples = e.samples),
            (t.lastTiming = e.lastTiming),
            (t.lastSampleTime = e.lastSampleTime),
            (t.lastSampleCount = e.lastSampleCount),
            (t._count = e._count),
            (t._time = e._time),
            (t._samples = e._samples),
            (t._startTime = e._startTime),
            (t._timerPending = e._timerPending));
        });
      }
    }
    _startEventHandling() {
      this.canvas &&
        (this.canvas.addEventListener(
          "mousemove",
          this._onMousemove.bind(this),
        ),
        this.canvas.addEventListener(
          "mouseleave",
          this._onMouseleave.bind(this),
        ));
    }
    _onMousemove(e) {
      e instanceof MouseEvent &&
        (this._getAnimationProps()._mousePosition = [e.offsetX, e.offsetY]);
    }
    _onMouseleave(e) {
      this._getAnimationProps()._mousePosition = null;
    }
  },
  Fa = {};
function Ua(e = "id") {
  return ((Fa[e] = Fa[e] || 1), `${e}-${Fa[e]++}`);
}
var Ga = class {
  id;
  userData = {};
  topology;
  bufferLayout = [];
  vertexCount;
  indices;
  attributes;
  constructor(e) {
    if (
      ((this.id = e.id || Ua("geometry")),
      (this.topology = e.topology),
      (this.indices = e.indices || null),
      (this.attributes = e.attributes),
      (this.vertexCount = e.vertexCount),
      (this.bufferLayout = e.bufferLayout || []),
      this.indices && !(this.indices.usage & qn.INDEX))
    )
      throw new Error("Index buffer must have INDEX usage");
  }
  destroy() {
    this.indices?.destroy();
    for (const e of Object.values(this.attributes)) e.destroy();
  }
  getVertexCount() {
    return this.vertexCount;
  }
  getAttributes() {
    return this.attributes;
  }
  getIndexes() {
    return this.indices || null;
  }
  _calculateVertexCount(e) {
    return e.byteLength / 12;
  }
};
var ka = "__debugFramebufferState";
function Wa(e) {
  const {
      framebuffer: t,
      targetWidth: r,
      targetHeight: n,
      topPx: i,
      leftPx: s,
      minimap: o,
    } = e,
    a = o ? Math.max(Math.floor(r / 4), 1) : r,
    c = o ? Math.max(Math.floor(n / 4), 1) : n,
    l = Math.min(a / t.width, c / t.height),
    u = Math.max(Math.floor(t.width * l), 1),
    h = Math.max(Math.floor(t.height * l), 1),
    d = s,
    f = Math.max(n - i - h, 0);
  return [d, f, d + u, f + h, h];
}
function $a(e, t) {
  if (!e) return t;
  const r = Number.parseInt(e, 10);
  return Number.isFinite(r) ? r : t;
}
function Ha(e, t, r) {
  if (e === t) return !0;
  if (!r || !e || !t) return !1;
  if (Array.isArray(e)) {
    if (!Array.isArray(t) || e.length !== t.length) return !1;
    for (let n = 0; n < e.length; n++) if (!Ha(e[n], t[n], r - 1)) return !1;
    return !0;
  }
  if (Array.isArray(t)) return !1;
  if ("object" == typeof e && "object" == typeof t) {
    const n = Object.keys(e),
      i = Object.keys(t);
    if (n.length !== i.length) return !1;
    for (const s of n) {
      if (!t.hasOwnProperty(s)) return !1;
      if (!Ha(e[s], t[s], r - 1)) return !1;
    }
    return !0;
  }
  return !1;
}
var Va = class {
  bufferLayouts;
  constructor(e) {
    this.bufferLayouts = e;
  }
  getBufferLayout(e) {
    return this.bufferLayouts.find((t) => t.name === e) || null;
  }
  getAttributeNamesForBuffer(e) {
    return e.attributes ? e.attributes?.map((e) => e.attribute) : [e.name];
  }
  mergeBufferLayouts(e, t) {
    const r = [...e];
    for (const n of t) {
      const e = r.findIndex((e) => e.name === n.name);
      e < 0 ? r.push(n) : (r[e] = n);
    }
    return r;
  }
  getBufferIndex(e) {
    const t = this.bufferLayouts.findIndex((t) => t.name === e);
    return (
      -1 === t && Bn.warn(`BufferLayout: Missing buffer for "${e}".`)(),
      t
    );
  }
};
function za(e, t) {
  let r = 1 / 0;
  for (const n of e) {
    const e = t[n];
    void 0 !== e && (r = Math.min(r, e));
  }
  return r;
}
function Xa(e, t) {
  if (!e || !t.some((e) => e.bindingLayout?.length)) return e;
  const r = { ...e, bindings: e.bindings.map((e) => ({ ...e })) };
  "attributes" in (e || {}) && (r.attributes = e?.attributes || []);
  for (const n of t)
    for (const e of n.bindingLayout || [])
      for (const t of Ka(e.name)) {
        const n = r.bindings.find((e) => e.name === t);
        0 === n?.group && (n.group = e.group);
      }
  return r;
}
function ja(e) {
  return Boolean(
    e.uniformTypes &&
    !(function (e) {
      for (const t in e) return !1;
      return !0;
    })(e.uniformTypes),
  );
}
function Ka(e) {
  const t = new Set([e, `${e}Uniforms`]);
  return (e.endsWith("Uniforms") || t.add(`${e}Sampler`), [...t]);
}
function Ya(e, t = {}) {
  const r = { bindings: {}, uniforms: {} };
  return (
    Object.keys(e).forEach((n) => {
      const i = e[n];
      var s;
      Object.prototype.hasOwnProperty.call(t, n) ||
      (function (e) {
        return (
          (function (e) {
            return ArrayBuffer.isView(e) && !(e instanceof DataView);
          })(e) ||
          (function (e) {
            return (
              !!Array.isArray(e) && (0 === e.length || "number" == typeof e[0])
            );
          })(e)
        );
      })((s = i)) ||
      "number" == typeof s ||
      "boolean" == typeof s
        ? (r.uniforms[n] = i)
        : (r.bindings[n] = i);
    }),
    r
  );
}
var Qa = class {
  options = { disableWarnings: !1 };
  modules;
  moduleUniforms;
  moduleBindings;
  constructor(e, t) {
    Object.assign(this.options, t);
    const r = Ot(Object.values(e).filter(rc));
    for (const n of r) e[n.name] = n;
    (Bn.log(1, "Creating ShaderInputs with modules", Object.keys(e))(),
      (this.modules = e),
      (this.moduleUniforms = {}),
      (this.moduleBindings = {}));
    for (const [n, i] of Object.entries(e))
      i &&
        (this._addModule(i),
        i.name &&
          n !== i.name &&
          !this.options.disableWarnings &&
          Bn.warn(`Module name: ${n} vs ${i.name}`)());
  }
  destroy() {}
  setProps(e) {
    for (const t of Object.keys(e)) {
      const r = t,
        n = e[r] || {},
        i = this.modules[r];
      if (i) {
        const e = this.moduleUniforms[r],
          t = this.moduleBindings[r],
          { uniforms: s, bindings: o } = Ya(
            i.getUniforms?.(n, e) || n,
            i.uniformTypes,
          );
        ((this.moduleUniforms[r] = qa(e, s, i.uniformTypes)),
          (this.moduleBindings[r] = { ...t, ...o }));
      } else this.options.disableWarnings || Bn.warn(`Module ${t} not found`)();
    }
  }
  getModules() {
    return Object.values(this.modules);
  }
  getUniformValues() {
    return this.moduleUniforms;
  }
  getBindingValues() {
    const e = {};
    for (const t of Object.values(this.moduleBindings)) Object.assign(e, t);
    return e;
  }
  getDebugTable() {
    const e = {};
    for (const [t, r] of Object.entries(this.moduleUniforms))
      for (const [n, i] of Object.entries(r))
        e[`${t}.${n}`] = {
          type: this.modules[t].uniformTypes?.[n],
          value: String(i),
        };
    return e;
  }
  _addModule(e) {
    const t = e.name;
    ((this.moduleUniforms[t] = qa({}, e.defaultUniforms || {}, e.uniformTypes)),
      (this.moduleBindings[t] = {}));
  }
};
function qa(e = {}, t = {}, r = {}) {
  const n = { ...e };
  for (const [i, s] of Object.entries(t))
    void 0 !== s && (n[i] = Za(e[i], s, r[i]));
  return n;
}
function Za(e, t, r) {
  if (!r || "string" == typeof r) return Ja(t);
  if (Array.isArray(r)) {
    if (ec(t) || !Array.isArray(t)) return Ja(t);
    const n = Array.isArray(e) && !ec(e) ? [...e] : [],
      i = n.slice();
    for (let e = 0; e < t.length; e++) {
      const s = t[e];
      void 0 !== s && (i[e] = Za(n[e], s, r[0]));
    }
    return i;
  }
  if (!tc(t)) return Ja(t);
  const n = r,
    i = tc(e) ? e : {},
    s = { ...i };
  for (const [o, a] of Object.entries(t))
    void 0 !== a && (s[o] = Za(i[o], a, n[o]));
  return s;
}
function Ja(e) {
  return ArrayBuffer.isView(e)
    ? Array.prototype.slice.call(e)
    : Array.isArray(e)
      ? ec(e)
        ? e.slice()
        : e.map((e) => (void 0 === e ? void 0 : Ja(e)))
      : tc(e)
        ? Object.fromEntries(
            Object.entries(e).map(([e, t]) => [
              e,
              void 0 === t ? void 0 : Ja(t),
            ]),
          )
        : e;
}
function ec(e) {
  return (
    ArrayBuffer.isView(e) ||
    (Array.isArray(e) && (0 === e.length || "number" == typeof e[0]))
  );
}
function tc(e) {
  return (
    Boolean(e) &&
    "object" == typeof e &&
    !Array.isArray(e) &&
    !ArrayBuffer.isView(e)
  );
}
function rc(e) {
  return Boolean(e?.dependencies);
}
var nc = { "+X": 0, "-X": 1, "+Y": 2, "-Y": 3, "+Z": 4, "-Z": 5 };
function ic(e) {
  return e ? (Array.isArray(e) ? (e[0] ?? null) : e) : null;
}
function sc(e) {
  if (Ai(e)) return Ri(e);
  if ("object" == typeof e && "width" in e && "height" in e)
    return { width: e.width, height: e.height };
  throw new Error("Unsupported mip-level data");
}
function oc(e) {
  return (
    "object" == typeof e &&
    null !== e &&
    "data" in e &&
    "width" in e &&
    "height" in e
  );
}
function ac(e) {
  return ArrayBuffer.isView(e);
}
function cc(e) {
  const { textureFormat: t, format: r } = e;
  if (t && r && t !== r)
    throw new Error(
      `Conflicting texture formats "${t}" and "${r}" provided for the same mip level`,
    );
  return t ?? r;
}
function lc(e) {
  const t = nc[e];
  if (void 0 === t) throw new Error(`Invalid cube face: ${e}`);
  return t;
}
function uc(e, t) {
  return 6 * e + lc(t);
}
function hc(e) {
  throw new Error("setTexture1DData not supported in WebGL.");
}
function dc(e, t, r, n) {
  const i = ((s = t), Array.isArray(s) ? s : [s]);
  var s;
  const o = e,
    a = [];
  for (let c = 0; c < i.length; c++) {
    const e = i[c];
    if (Ai(e)) a.push({ type: "external-image", image: e, z: o, mipLevel: c });
    else if (oc(e))
      a.push({
        type: "texture-data",
        data: e,
        textureFormat: cc(e),
        z: o,
        mipLevel: c,
      });
    else {
      if (!ac(e) || !r) throw new Error("Unsupported 2D mip-level payload");
      a.push({
        type: "texture-data",
        data: {
          data: e,
          width: Math.max(1, r.width >> c),
          height: Math.max(1, r.height >> c),
          ...(n ? { format: n } : {}),
        },
        textureFormat: n,
        z: o,
        mipLevel: c,
      });
    }
  }
  return a;
}
function fc(e) {
  const t = [];
  for (let r = 0; r < e.length; r++) t.push(...dc(r, e[r]));
  return t;
}
function pc(e) {
  const t = [];
  for (let r = 0; r < e.length; r++) t.push(...dc(r, e[r]));
  return t;
}
function gc(e) {
  const t = [];
  for (const [r, n] of Object.entries(e)) {
    const e = lc(r);
    t.push(...dc(e, n));
  }
  return t;
}
function mc(e) {
  const t = [];
  return (
    e.forEach((e, r) => {
      for (const [n, i] of Object.entries(e)) {
        const e = uc(r, n);
        t.push(...dc(e, i));
      }
    }),
    t
  );
}
var _c = class e {
  device;
  id;
  props;
  _texture = null;
  _sampler = null;
  _view = null;
  ready;
  isReady = !1;
  destroyed = !1;
  resolveReady = () => {};
  rejectReady = () => {};
  get texture() {
    if (!this._texture) throw new Error("Texture not initialized yet");
    return this._texture;
  }
  get sampler() {
    if (!this._sampler) throw new Error("Sampler not initialized yet");
    return this._sampler;
  }
  get view() {
    if (!this._view) throw new Error("View not initialized yet");
    return this._view;
  }
  get [Symbol.toStringTag]() {
    return "DynamicTexture";
  }
  toString() {
    const e = this._texture?.width ?? this.props.width ?? "?",
      t = this._texture?.height ?? this.props.height ?? "?";
    return `DynamicTexture:"${this.id}":${e}x${t}px:(${this.isReady ? "ready" : "loading..."})`;
  }
  constructor(t, r) {
    this.device = t;
    const n = Ua("dynamic-texture"),
      i = r;
    ((this.props = { ...e.defaultProps, id: n, ...r, data: null }),
      (this.id = this.props.id),
      (this.ready = new Promise((e, t) => {
        ((this.resolveReady = e), (this.rejectReady = t));
      })),
      this.initAsync(i));
  }
  async initAsync(e) {
    try {
      const t = await this._loadAllData(e);
      this._checkNotDestroyed();
      const r = t.data
          ? (function (e) {
              if (!e.data) return [];
              const t =
                  e.width && e.height
                    ? { width: e.width, height: e.height }
                    : void 0,
                r = "format" in e ? e.format : void 0;
              switch (e.dimension) {
                case "1d":
                  return hc(e.data);
                case "2d":
                  return dc(0, e.data, t, r);
                case "3d":
                  return fc(e.data);
                case "2d-array":
                  return pc(e.data);
                case "cube":
                  return gc(e.data);
                case "cube-array":
                  return mc(e.data);
                default:
                  throw new Error(`Unhandled dimension ${e.dimension}`);
              }
            })({ ...t, width: e.width, height: e.height, format: e.format })
          : [],
        n = "format" in e && void 0 !== e.format,
        i = "usage" in e && void 0 !== e.usage,
        s = (() => {
          if (this.props.width && this.props.height)
            return { width: this.props.width, height: this.props.height };
          return (
            (function (e) {
              const { dimension: t, data: r } = e;
              if (!r) return null;
              switch (t) {
                case "1d": {
                  const e = ic(r);
                  if (!e) return null;
                  const { width: t } = sc(e);
                  return { width: t, height: 1 };
                }
                case "2d": {
                  const e = ic(r);
                  return e ? sc(e) : null;
                }
                case "3d":
                case "2d-array": {
                  if (!Array.isArray(r) || 0 === r.length) return null;
                  const e = ic(r[0]);
                  return e ? sc(e) : null;
                }
                case "cube": {
                  const e = Object.keys(r)[0] ?? null;
                  if (!e) return null;
                  const t = ic(r[e]);
                  return t ? sc(t) : null;
                }
                case "cube-array": {
                  if (!Array.isArray(r) || 0 === r.length) return null;
                  const e = r[0],
                    t = Object.keys(e)[0] ?? null;
                  if (!t) return null;
                  const n = ic(e[t]);
                  return n ? sc(n) : null;
                }
                default:
                  return null;
              }
            })(t) || {
              width: this.props.width || 1,
              height: this.props.height || 1,
            }
          );
        })();
      if (!s || s.width <= 0 || s.height <= 0)
        throw new Error(`${this} size could not be determined or was zero`);
      const o = (function (e, t, r, n) {
          if (0 === t.length)
            return {
              subresources: t,
              mipLevels: 1,
              format: n.format,
              hasExplicitMipChain: !1,
            };
          const i = new Map();
          for (const u of t) {
            const e = i.get(u.z) ?? [];
            (e.push(u), i.set(u.z, e));
          }
          const s = t.some((e) => e.mipLevel > 0);
          let o = n.format,
            a = Number.POSITIVE_INFINITY;
          const c = [];
          for (const [u, h] of i) {
            const t = [...h].sort((e, t) => e.mipLevel - t.mipLevel),
              n = t[0];
            if (!n || 0 !== n.mipLevel)
              throw new Error(
                `DynamicTexture: slice ${u} is missing mip level 0`,
              );
            const i = bc(e, n);
            if (i.width !== r.width || i.height !== r.height)
              throw new Error(
                `DynamicTexture: slice ${u} base level dimensions ${i.width}x${i.height} do not match expected ${r.width}x${r.height}`,
              );
            const s = Ec(n);
            if (s) {
              if (o && o !== s)
                throw new Error(
                  `DynamicTexture: slice ${u} base level format "${s}" does not match texture format "${o}"`,
                );
              o = s;
            }
            const l =
              o && e.isTextureFormatCompressed(o)
                ? yc(e, i.width, i.height, o)
                : e.getMipLevelCount(i.width, i.height);
            let d = 0;
            for (let r = 0; r < t.length; r++) {
              const n = t[r];
              if (!n || n.mipLevel !== r) break;
              if (r >= l) break;
              const s = bc(e, n),
                a = Math.max(1, i.width >> r),
                u = Math.max(1, i.height >> r);
              if (s.width !== a || s.height !== u) break;
              const h = Ec(n);
              if (h && (o || (o = h), h !== o)) break;
              (d++, c.push(n));
            }
            a = Math.min(a, d);
          }
          const l = Number.isFinite(a) ? Math.max(1, a) : 1;
          return {
            subresources: c.filter((e) => e.mipLevel < l),
            mipLevels: l,
            format: o,
            hasExplicitMipChain: s,
          };
        })(this.device, r, s, { format: n ? e.format : void 0 }),
        a = o.format ?? this.props.format,
        c = { ...this.props, ...s, format: a, mipLevels: 1, data: void 0 };
      this.device.isTextureFormatCompressed(a) &&
        !i &&
        (c.usage = ji.SAMPLE | ji.COPY_DST);
      const l =
        this.props.mipmaps &&
        !o.hasExplicitMipChain &&
        !this.device.isTextureFormatCompressed(a);
      if ("webgpu" === this.device.type && l) {
        const e =
          "3d" === this.props.dimension
            ? ji.SAMPLE | ji.STORAGE | ji.COPY_DST | ji.COPY_SRC
            : ji.SAMPLE | ji.RENDER | ji.COPY_DST | ji.COPY_SRC;
        c.usage |= e;
      }
      const u = this.device.getMipLevelCount(c.width, c.height),
        h = o.hasExplicitMipChain
          ? o.mipLevels
          : "auto" === this.props.mipLevels
            ? u
            : Math.max(1, Math.min(u, this.props.mipLevels ?? 1)),
        d = { ...c, mipLevels: h };
      ((this._texture = this.device.createTexture(d)),
        (this._sampler = this.texture.sampler),
        (this._view = this.texture.view),
        o.subresources.length && this._setTextureSubresources(o.subresources),
        !this.props.mipmaps ||
          o.hasExplicitMipChain ||
          l ||
          Bn.warn(
            `${this} skipping auto-generated mipmaps for compressed texture format`,
          )(),
        l && this.generateMipmaps(),
        (this.isReady = !0),
        this.resolveReady(this.texture),
        Bn.info(0, `${this} created`)());
    } catch (t) {
      const e = t instanceof Error ? t : new Error(String(t));
      this.rejectReady(e);
    }
  }
  destroy() {
    (this._texture &&
      (this._texture.destroy(),
      (this._texture = null),
      (this._sampler = null),
      (this._view = null)),
      (this.destroyed = !0));
  }
  generateMipmaps() {
    "webgl" === this.device.type
      ? this.texture.generateMipmapsWebGL()
      : "webgpu" === this.device.type
        ? this.device.generateMipmapsWebGPU(this.texture)
        : Bn.warn(`${this} mipmaps not supported on ${this.device.type}`);
  }
  setSampler(e = {}) {
    this._checkReady();
    const t = e instanceof zi ? e : this.device.createSampler(e);
    (this.texture.setSampler(t), (this._sampler = t));
  }
  async readBuffer(e = {}) {
    this.isReady || (await this.ready);
    const t = e.width ?? this.texture.width,
      r = e.height ?? this.texture.height,
      n = e.depthOrArrayLayers ?? this.texture.depth,
      i = this.texture.computeMemoryLayout({
        width: t,
        height: r,
        depthOrArrayLayers: n,
      }),
      s = this.device.createBuffer({
        byteLength: i.byteLength,
        usage: qn.COPY_DST | qn.MAP_READ,
      });
    this.texture.readBuffer(
      { ...e, width: t, height: r, depthOrArrayLayers: n },
      s,
    );
    const o = this.device.createFence();
    return (await o.signaled, o.destroy(), s);
  }
  async readAsync(e = {}) {
    this.isReady || (await this.ready);
    const t = e.width ?? this.texture.width,
      r = e.height ?? this.texture.height,
      n = e.depthOrArrayLayers ?? this.texture.depth,
      i = this.texture.computeMemoryLayout({
        width: t,
        height: r,
        depthOrArrayLayers: n,
      }),
      s = await this.readBuffer(e),
      o = await s.readAsync(0, i.byteLength);
    return (s.destroy(), o.buffer);
  }
  resize(e) {
    if (
      (this._checkReady(),
      e.width === this.texture.width && e.height === this.texture.height)
    )
      return !1;
    const t = this.texture;
    return (
      (this._texture = t.clone(e)),
      (this._sampler = this.texture.sampler),
      (this._view = this.texture.view),
      t.destroy(),
      Bn.info(`${this} resized`),
      !0
    );
  }
  getCubeFaceIndex(e) {
    const t = nc[e];
    if (void 0 === t) throw new Error(`Invalid cube face: ${e}`);
    return t;
  }
  getCubeArrayFaceIndex(e, t) {
    return 6 * e + this.getCubeFaceIndex(t);
  }
  setTexture1DData(e) {
    if ((this._checkReady(), "1d" !== this.texture.props.dimension))
      throw new Error(`${this} is not 1d`);
    const t = hc();
    this._setTextureSubresources(t);
  }
  setTexture2DData(e, t = 0) {
    if ((this._checkReady(), "2d" !== this.texture.props.dimension))
      throw new Error(`${this} is not 2d`);
    const r = dc(t, e);
    this._setTextureSubresources(r);
  }
  setTexture3DData(e) {
    if ("3d" !== this.texture.props.dimension)
      throw new Error(`${this} is not 3d`);
    const t = fc(e);
    this._setTextureSubresources(t);
  }
  setTextureArrayData(e) {
    if ("2d-array" !== this.texture.props.dimension)
      throw new Error(`${this} is not 2d-array`);
    const t = pc(e);
    this._setTextureSubresources(t);
  }
  setTextureCubeData(e) {
    if ("cube" !== this.texture.props.dimension)
      throw new Error(`${this} is not cube`);
    const t = gc(e);
    this._setTextureSubresources(t);
  }
  setTextureCubeArrayData(e) {
    if ("cube-array" !== this.texture.props.dimension)
      throw new Error(`${this} is not cube-array`);
    const t = mc(e);
    this._setTextureSubresources(t);
  }
  _setTextureSubresources(e) {
    for (const t of e) {
      const { z: e, mipLevel: r } = t;
      switch (t.type) {
        case "external-image":
          const { image: n, flipY: i } = t;
          this.texture.copyExternalImage({
            image: n,
            z: e,
            mipLevel: r,
            flipY: i,
          });
          break;
        case "texture-data":
          const { data: s, textureFormat: o } = t;
          if (o && o !== this.texture.format)
            throw new Error(
              `${this} mip level ${r} uses format "${o}" but texture format is "${this.texture.format}"`,
            );
          this.texture.writeData(s.data, {
            x: 0,
            y: 0,
            z: e,
            width: s.width,
            height: s.height,
            depthOrArrayLayers: 1,
            mipLevel: r,
          });
          break;
        default:
          throw new Error("Unsupported 2D mip-level payload");
      }
    }
  }
  async _loadAllData(e) {
    const t = await Tc(e.data);
    return { dimension: e.dimension ?? "2d", data: t ?? null };
  }
  _checkNotDestroyed() {
    this.destroyed && Bn.warn(`${this} already destroyed`);
  }
  _checkReady() {
    this.isReady ||
      Bn.warn(`${this} Cannot perform this operation before ready`);
  }
  static defaultProps = {
    ...ji.defaultProps,
    dimension: "2d",
    data: null,
    mipmaps: !1,
  };
};
function Ec(e) {
  if ("texture-data" === e.type) return e.textureFormat ?? cc(e.data);
}
function bc(e, t) {
  switch (t.type) {
    case "external-image":
      return e.getExternalImageSize(t.image);
    case "texture-data":
      return { width: t.data.width, height: t.data.height };
    default:
      throw new Error("Unsupported texture subresource");
  }
}
function yc(e, t, r, n) {
  const { blockWidth: i = 1, blockHeight: s = 1 } = e.getTextureFormatInfo(n);
  let o = 1;
  for (let a = 1; ; a++) {
    const e = Math.max(1, t >> a),
      n = Math.max(1, r >> a);
    if (e < i || n < s) break;
    o++;
  }
  return o;
}
async function Tc(e) {
  if (((e = await e), Array.isArray(e))) return await Promise.all(e.map(Tc));
  if (e && "object" == typeof e && e.constructor === Object) {
    const t = e,
      r = await Promise.all(Object.values(t).map(Tc)),
      n = Object.keys(t),
      i = {};
    for (let e = 0; e < n.length; e++) i[n[e]] = r[e];
    return i;
  }
  return e;
}
var Ac,
  Rc = "render pipeline initialization failed",
  vc = class e {
    static defaultProps = {
      ...es.defaultProps,
      source: void 0,
      vs: null,
      fs: null,
      id: "unnamed",
      handle: void 0,
      userData: {},
      defines: {},
      modules: [],
      geometry: null,
      indexBuffer: null,
      attributes: {},
      constantAttributes: {},
      bindings: {},
      uniforms: {},
      varyings: [],
      isInstanced: void 0,
      instanceCount: 0,
      vertexCount: 0,
      shaderInputs: void 0,
      material: void 0,
      pipelineFactory: void 0,
      shaderFactory: void 0,
      transformFeedback: void 0,
      shaderAssembler: Or.getDefaultShaderAssembler(),
      debugShaders: void 0,
      disableWarnings: void 0,
    };
    device;
    id;
    source;
    vs;
    fs;
    pipelineFactory;
    shaderFactory;
    userData = {};
    parameters;
    topology;
    bufferLayout;
    isInstanced = void 0;
    instanceCount = 0;
    vertexCount;
    indexBuffer = null;
    bufferAttributes = {};
    constantAttributes = {};
    bindings = {};
    vertexArray;
    transformFeedback = null;
    pipeline;
    shaderInputs;
    material = null;
    _uniformStore;
    _attributeInfos = {};
    _gpuGeometry = null;
    props;
    _pipelineNeedsUpdate = "newly created";
    _needsRedraw = "initializing";
    _destroyed = !1;
    _lastDrawTimestamp = -1;
    _bindingTable = [];
    get [Symbol.toStringTag]() {
      return "Model";
    }
    toString() {
      return `Model(${this.id})`;
    }
    constructor(t, r) {
      ((this.props = { ...e.defaultProps, ...r }),
        (r = this.props),
        (this.id = r.id || Ua("model")),
        (this.device = t),
        Object.assign(this.userData, r.userData),
        (this.material = r.material || null));
      const n = Object.fromEntries(
          this.props.modules?.map((e) => [e.name, e]) || [],
        ),
        i =
          r.shaderInputs ||
          new Qa(n, { disableWarnings: this.props.disableWarnings });
      this.setShaderInputs(i);
      const s = (function (e) {
          return {
            type: e.type,
            shaderLanguage: e.info.shadingLanguage,
            shaderLanguageVersion: e.info.shadingLanguageVersion,
            gpu: e.info.gpu,
            features: e.features,
          };
        })(t),
        o =
          (this.props.modules?.length > 0
            ? this.props.modules
            : this.shaderInputs?.getModules()) || [];
      if (
        ((this.props.shaderLayout = Xa(this.props.shaderLayout, o) || null),
        "webgpu" === this.device.type && this.props.source)
      ) {
        const {
          source: e,
          getUniforms: r,
          bindingTable: n,
        } = this.props.shaderAssembler.assembleWGSLShader({
          platformInfo: s,
          ...this.props,
          modules: o,
        });
        ((this.source = e),
          (this._getModuleUniforms = r),
          (this._bindingTable = n));
        const i = t.getShaderLayout?.(this.source);
        this.props.shaderLayout =
          Xa(this.props.shaderLayout || i || null, o) || null;
      } else {
        const {
          vs: e,
          fs: t,
          getUniforms: r,
        } = this.props.shaderAssembler.assembleGLSLShaderPair({
          platformInfo: s,
          ...this.props,
          modules: o,
        });
        ((this.vs = e),
          (this.fs = t),
          (this._getModuleUniforms = r),
          (this._bindingTable = []));
      }
      ((this.vertexCount = this.props.vertexCount),
        (this.instanceCount = this.props.instanceCount),
        (this.topology = this.props.topology),
        (this.bufferLayout = this.props.bufferLayout),
        (this.parameters = this.props.parameters),
        r.geometry && this.setGeometry(r.geometry),
        (this.pipelineFactory =
          r.pipelineFactory || ns.getDefaultPipelineFactory(this.device)),
        (this.shaderFactory =
          r.shaderFactory || is.getDefaultShaderFactory(this.device)),
        (this.pipeline = this._updatePipeline()),
        (this.vertexArray = t.createVertexArray({
          shaderLayout: this.pipeline.shaderLayout,
          bufferLayout: this.pipeline.bufferLayout,
        })),
        this._gpuGeometry && this._setGeometryAttributes(this._gpuGeometry),
        "isInstanced" in r && (this.isInstanced = r.isInstanced),
        r.instanceCount && this.setInstanceCount(r.instanceCount),
        r.vertexCount && this.setVertexCount(r.vertexCount),
        r.indexBuffer && this.setIndexBuffer(r.indexBuffer),
        r.attributes && this.setAttributes(r.attributes),
        r.constantAttributes &&
          this.setConstantAttributes(r.constantAttributes),
        r.bindings && this.setBindings(r.bindings),
        r.transformFeedback && (this.transformFeedback = r.transformFeedback));
    }
    destroy() {
      this._destroyed ||
        (this.pipelineFactory.release(this.pipeline),
        this.shaderFactory.release(this.pipeline.vs),
        this.pipeline.fs &&
          this.pipeline.fs !== this.pipeline.vs &&
          this.shaderFactory.release(this.pipeline.fs),
        this._uniformStore.destroy(),
        this._gpuGeometry?.destroy(),
        (this._destroyed = !0));
    }
    needsRedraw() {
      this._getBindingsUpdateTimestamp() > this._lastDrawTimestamp &&
        this.setNeedsRedraw("contents of bound textures or buffers updated");
      const e = this._needsRedraw;
      return ((this._needsRedraw = !1), e);
    }
    setNeedsRedraw(e) {
      this._needsRedraw ||= e;
    }
    getBindingDebugTable() {
      return this._bindingTable;
    }
    predraw() {
      (this.updateShaderInputs(), (this.pipeline = this._updatePipeline()));
    }
    draw(e) {
      const t = this._areBindingsLoading();
      if (t)
        return (
          Bn.info(2, `>>> DRAWING ABORTED ${this.id}: ${t} not loaded`)(),
          !1
        );
      try {
        (e.pushDebugGroup(`${this}.predraw(${e})`), this.predraw());
      } finally {
        e.popDebugGroup();
      }
      let r,
        n = this.pipeline.isErrored;
      try {
        if (
          (e.pushDebugGroup(`${this}.draw(${e})`),
          this._logDrawCallStart(),
          (this.pipeline = this._updatePipeline()),
          (n = this.pipeline.isErrored),
          n)
        )
          (Bn.info(2, `>>> DRAWING ABORTED ${this.id}: ${Rc}`)(), (r = !1));
        else {
          const t = this._getBindings(),
            n = this._getBindGroups(),
            { indexBuffer: i } = this.vertexArray,
            s = i ? i.byteLength / ("uint32" === i.indexType ? 4 : 2) : void 0;
          r = this.pipeline.draw({
            renderPass: e,
            vertexArray: this.vertexArray,
            isInstanced: this.isInstanced,
            vertexCount: this.vertexCount,
            instanceCount: this.instanceCount,
            indexCount: s,
            transformFeedback: this.transformFeedback || void 0,
            bindings: t,
            bindGroups: n,
            _bindGroupCacheKeys: this._getBindGroupCacheKeys(),
            uniforms: this.props.uniforms,
            parameters: this.parameters,
            topology: this.topology,
          });
        }
      } finally {
        (e.popDebugGroup(), this._logDrawCallEnd());
      }
      return (
        this._logFramebuffer(e),
        r
          ? ((this._lastDrawTimestamp = this.device.timestamp),
            (this._needsRedraw = !1))
          : (this._needsRedraw = n
              ? Rc
              : "waiting for resource initialization"),
        r
      );
    }
    setGeometry(e) {
      this._gpuGeometry?.destroy();
      const t =
        e &&
        (function (e, t) {
          if (t instanceof Ga) return t;
          const r = (function (e, t) {
              if (!t.indices) return;
              const r = t.indices.value;
              return e.createBuffer({ usage: qn.INDEX, data: r });
            })(e, t),
            { attributes: n, bufferLayout: i } = (function (e, t) {
              const r = [],
                n = {};
              for (const [i, s] of Object.entries(t.attributes)) {
                let t = i;
                switch (i) {
                  case "POSITION":
                    t = "positions";
                    break;
                  case "NORMAL":
                    t = "normals";
                    break;
                  case "TEXCOORD_0":
                    t = "texCoords";
                    break;
                  case "TEXCOORD_1":
                    t = "texCoords1";
                    break;
                  case "COLOR_0":
                    t = "colors";
                }
                if (s) {
                  n[t] = e.createBuffer({ data: s.value, id: `${i}-buffer` });
                  const { value: o, size: a, normalized: c } = s;
                  if (void 0 === a)
                    throw new Error(`Attribute ${i} is missing a size`);
                  r.push({
                    name: t,
                    format: ei.getVertexFormatFromAttribute(o, a, c),
                  });
                }
              }
              return {
                attributes: n,
                bufferLayout: r,
                vertexCount: t._calculateVertexCount(t.attributes, t.indices),
              };
            })(e, t);
          return new Ga({
            topology: t.topology || "triangle-list",
            bufferLayout: i,
            vertexCount: t.vertexCount,
            indices: r,
            attributes: n,
          });
        })(this.device, e);
      if (t) {
        this.setTopology(t.topology || "triangle-list");
        const e = new Va(this.bufferLayout);
        ((this.bufferLayout = e.mergeBufferLayouts(
          t.bufferLayout,
          this.bufferLayout,
        )),
          this.vertexArray && this._setGeometryAttributes(t));
      }
      this._gpuGeometry = t;
    }
    setTopology(e) {
      e !== this.topology &&
        ((this.topology = e), this._setPipelineNeedsUpdate("topology"));
    }
    setBufferLayout(e) {
      const t = new Va(this.bufferLayout);
      ((this.bufferLayout = this._gpuGeometry
        ? t.mergeBufferLayouts(e, this._gpuGeometry.bufferLayout)
        : e),
        this._setPipelineNeedsUpdate("bufferLayout"),
        (this.pipeline = this._updatePipeline()),
        (this.vertexArray = this.device.createVertexArray({
          shaderLayout: this.pipeline.shaderLayout,
          bufferLayout: this.pipeline.bufferLayout,
        })),
        this._gpuGeometry && this._setGeometryAttributes(this._gpuGeometry));
    }
    setParameters(e) {
      Ha(e, this.parameters, 2) ||
        ((this.parameters = e), this._setPipelineNeedsUpdate("parameters"));
    }
    setInstanceCount(e) {
      ((this.instanceCount = e),
        void 0 === this.isInstanced && e > 0 && (this.isInstanced = !0),
        this.setNeedsRedraw("instanceCount"));
    }
    setVertexCount(e) {
      ((this.vertexCount = e), this.setNeedsRedraw("vertexCount"));
    }
    setShaderInputs(e) {
      ((this.shaderInputs = e),
        (this._uniformStore = new zs(this.device, this.shaderInputs.modules)));
      for (const [t, r] of Object.entries(this.shaderInputs.modules))
        if (ja(r) && !this.material?.ownsModule(t)) {
          const e = this._uniformStore.getManagedUniformBuffer(t);
          this.bindings[`${t}Uniforms`] = e;
        }
      this.setNeedsRedraw("shaderInputs");
    }
    setMaterial(e) {
      ((this.material = e), this.setNeedsRedraw("material"));
    }
    updateShaderInputs() {
      (this._uniformStore.setUniforms(this.shaderInputs.getUniformValues()),
        this.setBindings(
          this._getNonMaterialBindings(this.shaderInputs.getBindingValues()),
        ),
        this.setNeedsRedraw("shaderInputs"));
    }
    setBindings(e) {
      (Object.assign(this.bindings, e), this.setNeedsRedraw("bindings"));
    }
    setTransformFeedback(e) {
      ((this.transformFeedback = e), this.setNeedsRedraw("transformFeedback"));
    }
    setIndexBuffer(e) {
      (this.vertexArray.setIndexBuffer(e), this.setNeedsRedraw("indexBuffer"));
    }
    setAttributes(e, t) {
      const r = t?.disableWarnings ?? this.props.disableWarnings;
      (e.indices &&
        Bn.warn(
          `Model:${this.id} setAttributes() - indexBuffer should be set using setIndexBuffer()`,
        )(),
        (this.bufferLayout = (function (e, t) {
          const r = Object.fromEntries(
              e.attributes.map((e) => [e.name, e.location]),
            ),
            n = t.slice();
          return (
            n.sort((e, t) => {
              const n = e.attributes
                  ? e.attributes.map((e) => e.attribute)
                  : [e.name],
                i = t.attributes
                  ? t.attributes.map((e) => e.attribute)
                  : [t.name];
              return za(n, r) - za(i, r);
            }),
            n
          );
        })(this.pipeline.shaderLayout, this.bufferLayout)));
      const n = new Va(this.bufferLayout);
      for (const [i, s] of Object.entries(e)) {
        const e = n.getBufferLayout(i);
        if (!e) {
          r ||
            Bn.warn(`Model(${this.id}): Missing layout for buffer "${i}".`)();
          continue;
        }
        const t = n.getAttributeNamesForBuffer(e);
        let o = !1;
        for (const r of t) {
          const e = this._attributeInfos[r];
          if (e) {
            const t =
              "webgpu" === this.device.type
                ? n.getBufferIndex(e.bufferName)
                : e.location;
            (this.vertexArray.setBuffer(t, s), (o = !0));
          }
        }
        o ||
          r ||
          Bn.warn(
            `Model(${this.id}): Ignoring buffer "${s.id}" for unknown attribute "${i}"`,
          )();
      }
      this.setNeedsRedraw("attributes");
    }
    setConstantAttributes(e, t) {
      for (const [r, n] of Object.entries(e)) {
        const e = this._attributeInfos[r];
        e
          ? this.vertexArray.setConstantWebGL(e.location, n)
          : (t?.disableWarnings ?? this.props.disableWarnings) ||
            Bn.warn(
              `Model "${this.id}: Ignoring constant supplied for unknown attribute "${r}"`,
            )();
      }
      this.setNeedsRedraw("constants");
    }
    _areBindingsLoading() {
      for (const e of Object.values(this.bindings))
        if (e instanceof _c && !e.isReady) return e.id;
      for (const e of Object.values(this.material?.bindings || {}))
        if (e instanceof _c && !e.isReady) return e.id;
      return !1;
    }
    _getBindings() {
      const e = {};
      for (const [t, r] of Object.entries(this.bindings))
        r instanceof _c ? r.isReady && (e[t] = r.texture) : (e[t] = r);
      return e;
    }
    _getBindGroups() {
      const e = this.pipeline?.shaderLayout ||
          this.props.shaderLayout || { bindings: [] },
        t = e.bindings.length
          ? os(e, this._getBindings())
          : { 0: this._getBindings() };
      if (!this.material) return t;
      for (const [r, n] of Object.entries(this.material.getBindingsByGroup())) {
        const e = Number(r);
        t[e] = { ...(t[e] || {}), ...n };
      }
      return t;
    }
    _getBindGroupCacheKeys() {
      const e = this.material?.getBindGroupCacheKey(3);
      return e ? { 3: e } : {};
    }
    _getBindingsUpdateTimestamp() {
      let e = 0;
      for (const t of Object.values(this.bindings))
        t instanceof Ki
          ? (e = Math.max(e, t.texture.updateTimestamp))
          : t instanceof qn || t instanceof ji
            ? (e = Math.max(e, t.updateTimestamp))
            : t instanceof _c
              ? (e = t.texture ? Math.max(e, t.texture.updateTimestamp) : 1 / 0)
              : t instanceof zi || (e = Math.max(e, t.buffer.updateTimestamp));
      return Math.max(e, this.material?.getBindingsUpdateTimestamp() || 0);
    }
    _setGeometryAttributes(e) {
      const t = { ...e.attributes };
      for (const [r] of Object.entries(t))
        this.pipeline.shaderLayout.attributes.find((e) => e.name === r) ||
          "positions" === r ||
          delete t[r];
      ((this.vertexCount = e.vertexCount),
        this.setIndexBuffer(e.indices || null),
        this.setAttributes(e.attributes, { disableWarnings: !0 }),
        this.setAttributes(t, { disableWarnings: this.props.disableWarnings }),
        this.setNeedsRedraw("geometry attributes"));
    }
    _setPipelineNeedsUpdate(e) {
      ((this._pipelineNeedsUpdate ||= e), this.setNeedsRedraw(e));
    }
    _updatePipeline() {
      if (this._pipelineNeedsUpdate) {
        let e = null,
          t = null;
        (this.pipeline &&
          (Bn.log(
            1,
            `Model ${this.id}: Recreating pipeline because "${this._pipelineNeedsUpdate}".`,
          )(),
          (e = this.pipeline.vs),
          (t = this.pipeline.fs)),
          (this._pipelineNeedsUpdate = !1));
        const r = this.shaderFactory.createShader({
          id: `${this.id}-vertex`,
          stage: "vertex",
          source: this.source || this.vs,
          debugShaders: this.props.debugShaders,
        });
        let n = null;
        (this.source
          ? (n = r)
          : this.fs &&
            (n = this.shaderFactory.createShader({
              id: `${this.id}-fragment`,
              stage: "fragment",
              source: this.source || this.fs,
              debugShaders: this.props.debugShaders,
            })),
          (this.pipeline = this.pipelineFactory.createRenderPipeline({
            ...this.props,
            bindings: void 0,
            bufferLayout: this.bufferLayout,
            topology: this.topology,
            parameters: this.parameters,
            bindGroups: this._getBindGroups(),
            vs: r,
            fs: n,
          })),
          (this._attributeInfos = ys(
            this.pipeline.shaderLayout,
            this.bufferLayout,
          )),
          e && this.shaderFactory.release(e),
          t && t !== e && this.shaderFactory.release(t));
      }
      return this.pipeline;
    }
    _lastLogTime = 0;
    _logOpen = !1;
    _logDrawCallStart() {
      const e = Bn.level > 3 ? 0 : 1e4;
      Bn.level < 2 ||
        Date.now() - this._lastLogTime < e ||
        ((this._lastLogTime = Date.now()),
        (this._logOpen = !0),
        Bn.group(2, `>>> DRAWING MODEL ${this.id}`, {
          collapsed: Bn.level <= 2,
        })());
    }
    _logDrawCallEnd() {
      if (this._logOpen) {
        const e = (function (e) {
          const t = {},
            r = "Values";
          if (0 === e.attributes.length && !e.varyings?.length)
            return { "No attributes or varyings": { [r]: "N/A" } };
          for (const n of e.attributes)
            n &&
              (t[`in ${n.location} ${n.name}: ${n.type}`] = {
                [r]: n.stepMode || "vertex",
              });
          for (const n of e.varyings || [])
            t[`out ${n.location} ${n.name}`] = { [r]: JSON.stringify(n) };
          return t;
        })(this.pipeline.shaderLayout, this.id);
        Bn.table(2, e)();
        const t = this.shaderInputs.getDebugTable();
        Bn.table(2, t)();
        const r = this._getAttributeDebugTable();
        (Bn.table(2, this._attributeInfos)(),
          Bn.table(2, r)(),
          Bn.groupEnd(2)(),
          (this._logOpen = !1));
      }
    }
    _drawCount = 0;
    _logFramebuffer(e) {
      const t = this.device.props.debugFramebuffers;
      if ((this._drawCount++, !t)) return;
      const r = e.props.framebuffer;
      !(function (e, t, r) {
        if ("webgl" !== e.device.type) return;
        const n =
          ((i = e.device),
          (i.userData[ka] ||= { flushing: !1, queuedFramebuffers: [] }),
          i.userData[ka]);
        var i;
        n.flushing ||
          ((function (e) {
            const t = e.props.framebuffer;
            return !t || null === t.handle;
          })(e)
            ? (function (e, t, r) {
                if (0 === r.queuedFramebuffers.length) return;
                const { gl: n } = e.device,
                  i = n.getParameter(36010),
                  s = n.getParameter(36006),
                  [o, a] = e.device
                    .getDefaultCanvasContext()
                    .getDrawingBufferSize();
                let c = $a(t.top, 8);
                const l = $a(t.left, 8);
                r.flushing = !0;
                try {
                  for (const e of r.queuedFramebuffers) {
                    const [r, i, s, u, h] = Wa({
                      framebuffer: e,
                      targetWidth: o,
                      targetHeight: a,
                      topPx: c,
                      leftPx: l,
                      minimap: t.minimap,
                    });
                    (n.bindFramebuffer(36008, e.handle),
                      n.bindFramebuffer(36009, null),
                      n.blitFramebuffer(
                        0,
                        0,
                        e.width,
                        e.height,
                        r,
                        i,
                        s,
                        u,
                        16384,
                        9728,
                      ),
                      (c += h + 8));
                  }
                } finally {
                  (n.bindFramebuffer(36008, i),
                    n.bindFramebuffer(36009, s),
                    (r.flushing = !1));
                }
              })(e, r, n)
            : t &&
              "colorAttachments" in t &&
              null !== t.handle &&
              (n.queuedFramebuffers.includes(t) ||
                n.queuedFramebuffers.push(t)));
      })(e, r, { id: r?.id || `${this.id}-framebuffer`, minimap: !0 });
    }
    _getAttributeDebugTable() {
      const e = {};
      for (const [t, r] of Object.entries(this._attributeInfos)) {
        const n = this.vertexArray.attributes[r.location];
        e[r.location] = {
          name: t,
          type: r.shaderType,
          values: n
            ? this._getBufferOrConstantValues(n, r.bufferDataType)
            : "null",
        };
      }
      if (this.vertexArray.indexBuffer) {
        const { indexBuffer: t } = this.vertexArray,
          r =
            "uint32" === t.indexType
              ? new Uint32Array(t.debugData)
              : new Uint16Array(t.debugData);
        e.indices = {
          name: "indices",
          type: t.indexType,
          values: r.toString(),
        };
      }
      return e;
    }
    _getBufferOrConstantValues(e, t) {
      const r = Zn.getTypedArrayConstructor(t);
      return (e instanceof qn ? new r(e.debugData) : e).toString();
    }
    _getNonMaterialBindings(e) {
      if (!this.material) return e;
      const t = {};
      for (const [r, n] of Object.entries(e))
        this.material.ownsBinding(r) || (t[r] = n);
      return t;
    }
  },
  Sc = class e {
    device;
    model;
    transformFeedback;
    static defaultProps = {
      ...vc.defaultProps,
      outputs: void 0,
      feedbackBuffers: void 0,
    };
    static isSupported(e) {
      return "webgl" === e?.info?.type;
    }
    constructor(t, r = e.defaultProps) {
      if (!e.isSupported(t))
        throw new Error("BufferTransform not yet implemented on WebGPU");
      ((this.device = t),
        (this.model = new vc(this.device, {
          id: r.id || "buffer-transform-model",
          fs: r.fs || Nr(),
          topology: r.topology || "point-list",
          varyings: r.outputs || r.varyings,
          ...r,
        })),
        (this.transformFeedback = this.device.createTransformFeedback({
          layout: this.model.pipeline.shaderLayout,
          buffers: r.feedbackBuffers,
        })),
        this.model.setTransformFeedback(this.transformFeedback),
        Object.seal(this));
    }
    destroy() {
      this.model && this.model.destroy();
    }
    delete() {
      this.destroy();
    }
    run(e) {
      (e?.inputBuffers && this.model.setAttributes(e.inputBuffers),
        e?.outputBuffers && this.transformFeedback.setBuffers(e.outputBuffers));
      const t = this.device.beginRenderPass(e);
      (this.model.draw(t), t.end());
    }
    getBuffer(e) {
      return this.transformFeedback.getBuffer(e);
    }
    readAsync(e) {
      const t = this.getBuffer(e);
      if (!t) throw new Error("BufferTransform#getBuffer");
      if (t instanceof qn) return t.readAsync();
      const { buffer: r, byteOffset: n = 0, byteLength: i = r.byteLength } = t;
      return r.readAsync(n, i);
    }
  },
  Cc = class {
    id;
    topology;
    vertexCount;
    indices;
    attributes;
    userData = {};
    constructor(e) {
      const {
        attributes: t = {},
        indices: r = null,
        vertexCount: n = null,
      } = e;
      ((this.id = e.id || Ua("geometry")),
        (this.topology = e.topology),
        r && (this.indices = ArrayBuffer.isView(r) ? { value: r, size: 1 } : r),
        (this.attributes = {}));
      for (const [i, s] of Object.entries(t)) {
        const e = ArrayBuffer.isView(s) ? { value: s } : s;
        if (!ArrayBuffer.isView(e.value))
          throw new Error(
            `${this._print(i)}: must be typed array or object with value as typed array`,
          );
        if (
          (("POSITION" !== i && "positions" !== i) || e.size || (e.size = 3),
          "indices" === i)
        ) {
          if (this.indices) throw new Error("Multiple indices detected");
          this.indices = e;
        } else this.attributes[i] = e;
      }
      (this.indices &&
        void 0 !== this.indices.isIndexed &&
        ((this.indices = Object.assign({}, this.indices)),
        delete this.indices.isIndexed),
        (this.vertexCount =
          n || this._calculateVertexCount(this.attributes, this.indices)));
    }
    getVertexCount() {
      return this.vertexCount;
    }
    getAttributes() {
      return this.indices
        ? { indices: this.indices, ...this.attributes }
        : this.attributes;
    }
    _print(e) {
      return `Geometry ${this.id} attribute ${e}`;
    }
    _setAttributes(e, t) {
      return this;
    }
    _calculateVertexCount(e, t) {
      if (t) return t.value.length;
      let r = 1 / 0;
      for (const n of Object.values(e)) {
        const { value: e, size: t, constant: i } = n;
        !i && e && void 0 !== t && t >= 1 && (r = Math.min(r, e.length / t));
      }
      return r;
    }
  };
!(function (e) {
  ((e[(e.DEPTH_BUFFER_BIT = 256)] = "DEPTH_BUFFER_BIT"),
    (e[(e.STENCIL_BUFFER_BIT = 1024)] = "STENCIL_BUFFER_BIT"),
    (e[(e.COLOR_BUFFER_BIT = 16384)] = "COLOR_BUFFER_BIT"),
    (e[(e.POINTS = 0)] = "POINTS"),
    (e[(e.LINES = 1)] = "LINES"),
    (e[(e.LINE_LOOP = 2)] = "LINE_LOOP"),
    (e[(e.LINE_STRIP = 3)] = "LINE_STRIP"),
    (e[(e.TRIANGLES = 4)] = "TRIANGLES"),
    (e[(e.TRIANGLE_STRIP = 5)] = "TRIANGLE_STRIP"),
    (e[(e.TRIANGLE_FAN = 6)] = "TRIANGLE_FAN"),
    (e[(e.ZERO = 0)] = "ZERO"),
    (e[(e.ONE = 1)] = "ONE"),
    (e[(e.SRC_COLOR = 768)] = "SRC_COLOR"),
    (e[(e.ONE_MINUS_SRC_COLOR = 769)] = "ONE_MINUS_SRC_COLOR"),
    (e[(e.SRC_ALPHA = 770)] = "SRC_ALPHA"),
    (e[(e.ONE_MINUS_SRC_ALPHA = 771)] = "ONE_MINUS_SRC_ALPHA"),
    (e[(e.DST_ALPHA = 772)] = "DST_ALPHA"),
    (e[(e.ONE_MINUS_DST_ALPHA = 773)] = "ONE_MINUS_DST_ALPHA"),
    (e[(e.DST_COLOR = 774)] = "DST_COLOR"),
    (e[(e.ONE_MINUS_DST_COLOR = 775)] = "ONE_MINUS_DST_COLOR"),
    (e[(e.SRC_ALPHA_SATURATE = 776)] = "SRC_ALPHA_SATURATE"),
    (e[(e.CONSTANT_COLOR = 32769)] = "CONSTANT_COLOR"),
    (e[(e.ONE_MINUS_CONSTANT_COLOR = 32770)] = "ONE_MINUS_CONSTANT_COLOR"),
    (e[(e.CONSTANT_ALPHA = 32771)] = "CONSTANT_ALPHA"),
    (e[(e.ONE_MINUS_CONSTANT_ALPHA = 32772)] = "ONE_MINUS_CONSTANT_ALPHA"),
    (e[(e.FUNC_ADD = 32774)] = "FUNC_ADD"),
    (e[(e.FUNC_SUBTRACT = 32778)] = "FUNC_SUBTRACT"),
    (e[(e.FUNC_REVERSE_SUBTRACT = 32779)] = "FUNC_REVERSE_SUBTRACT"),
    (e[(e.BLEND_EQUATION = 32777)] = "BLEND_EQUATION"),
    (e[(e.BLEND_EQUATION_RGB = 32777)] = "BLEND_EQUATION_RGB"),
    (e[(e.BLEND_EQUATION_ALPHA = 34877)] = "BLEND_EQUATION_ALPHA"),
    (e[(e.BLEND_DST_RGB = 32968)] = "BLEND_DST_RGB"),
    (e[(e.BLEND_SRC_RGB = 32969)] = "BLEND_SRC_RGB"),
    (e[(e.BLEND_DST_ALPHA = 32970)] = "BLEND_DST_ALPHA"),
    (e[(e.BLEND_SRC_ALPHA = 32971)] = "BLEND_SRC_ALPHA"),
    (e[(e.BLEND_COLOR = 32773)] = "BLEND_COLOR"),
    (e[(e.ARRAY_BUFFER_BINDING = 34964)] = "ARRAY_BUFFER_BINDING"),
    (e[(e.ELEMENT_ARRAY_BUFFER_BINDING = 34965)] =
      "ELEMENT_ARRAY_BUFFER_BINDING"),
    (e[(e.LINE_WIDTH = 2849)] = "LINE_WIDTH"),
    (e[(e.ALIASED_POINT_SIZE_RANGE = 33901)] = "ALIASED_POINT_SIZE_RANGE"),
    (e[(e.ALIASED_LINE_WIDTH_RANGE = 33902)] = "ALIASED_LINE_WIDTH_RANGE"),
    (e[(e.CULL_FACE_MODE = 2885)] = "CULL_FACE_MODE"),
    (e[(e.FRONT_FACE = 2886)] = "FRONT_FACE"),
    (e[(e.DEPTH_RANGE = 2928)] = "DEPTH_RANGE"),
    (e[(e.DEPTH_WRITEMASK = 2930)] = "DEPTH_WRITEMASK"),
    (e[(e.DEPTH_CLEAR_VALUE = 2931)] = "DEPTH_CLEAR_VALUE"),
    (e[(e.DEPTH_FUNC = 2932)] = "DEPTH_FUNC"),
    (e[(e.STENCIL_CLEAR_VALUE = 2961)] = "STENCIL_CLEAR_VALUE"),
    (e[(e.STENCIL_FUNC = 2962)] = "STENCIL_FUNC"),
    (e[(e.STENCIL_FAIL = 2964)] = "STENCIL_FAIL"),
    (e[(e.STENCIL_PASS_DEPTH_FAIL = 2965)] = "STENCIL_PASS_DEPTH_FAIL"),
    (e[(e.STENCIL_PASS_DEPTH_PASS = 2966)] = "STENCIL_PASS_DEPTH_PASS"),
    (e[(e.STENCIL_REF = 2967)] = "STENCIL_REF"),
    (e[(e.STENCIL_VALUE_MASK = 2963)] = "STENCIL_VALUE_MASK"),
    (e[(e.STENCIL_WRITEMASK = 2968)] = "STENCIL_WRITEMASK"),
    (e[(e.STENCIL_BACK_FUNC = 34816)] = "STENCIL_BACK_FUNC"),
    (e[(e.STENCIL_BACK_FAIL = 34817)] = "STENCIL_BACK_FAIL"),
    (e[(e.STENCIL_BACK_PASS_DEPTH_FAIL = 34818)] =
      "STENCIL_BACK_PASS_DEPTH_FAIL"),
    (e[(e.STENCIL_BACK_PASS_DEPTH_PASS = 34819)] =
      "STENCIL_BACK_PASS_DEPTH_PASS"),
    (e[(e.STENCIL_BACK_REF = 36003)] = "STENCIL_BACK_REF"),
    (e[(e.STENCIL_BACK_VALUE_MASK = 36004)] = "STENCIL_BACK_VALUE_MASK"),
    (e[(e.STENCIL_BACK_WRITEMASK = 36005)] = "STENCIL_BACK_WRITEMASK"),
    (e[(e.VIEWPORT = 2978)] = "VIEWPORT"),
    (e[(e.SCISSOR_BOX = 3088)] = "SCISSOR_BOX"),
    (e[(e.COLOR_CLEAR_VALUE = 3106)] = "COLOR_CLEAR_VALUE"),
    (e[(e.COLOR_WRITEMASK = 3107)] = "COLOR_WRITEMASK"),
    (e[(e.UNPACK_ALIGNMENT = 3317)] = "UNPACK_ALIGNMENT"),
    (e[(e.PACK_ALIGNMENT = 3333)] = "PACK_ALIGNMENT"),
    (e[(e.MAX_TEXTURE_SIZE = 3379)] = "MAX_TEXTURE_SIZE"),
    (e[(e.MAX_VIEWPORT_DIMS = 3386)] = "MAX_VIEWPORT_DIMS"),
    (e[(e.SUBPIXEL_BITS = 3408)] = "SUBPIXEL_BITS"),
    (e[(e.RED_BITS = 3410)] = "RED_BITS"),
    (e[(e.GREEN_BITS = 3411)] = "GREEN_BITS"),
    (e[(e.BLUE_BITS = 3412)] = "BLUE_BITS"),
    (e[(e.ALPHA_BITS = 3413)] = "ALPHA_BITS"),
    (e[(e.DEPTH_BITS = 3414)] = "DEPTH_BITS"),
    (e[(e.STENCIL_BITS = 3415)] = "STENCIL_BITS"),
    (e[(e.POLYGON_OFFSET_UNITS = 10752)] = "POLYGON_OFFSET_UNITS"),
    (e[(e.POLYGON_OFFSET_FACTOR = 32824)] = "POLYGON_OFFSET_FACTOR"),
    (e[(e.TEXTURE_BINDING_2D = 32873)] = "TEXTURE_BINDING_2D"),
    (e[(e.SAMPLE_BUFFERS = 32936)] = "SAMPLE_BUFFERS"),
    (e[(e.SAMPLES = 32937)] = "SAMPLES"),
    (e[(e.SAMPLE_COVERAGE_VALUE = 32938)] = "SAMPLE_COVERAGE_VALUE"),
    (e[(e.SAMPLE_COVERAGE_INVERT = 32939)] = "SAMPLE_COVERAGE_INVERT"),
    (e[(e.COMPRESSED_TEXTURE_FORMATS = 34467)] = "COMPRESSED_TEXTURE_FORMATS"),
    (e[(e.VENDOR = 7936)] = "VENDOR"),
    (e[(e.RENDERER = 7937)] = "RENDERER"),
    (e[(e.VERSION = 7938)] = "VERSION"),
    (e[(e.IMPLEMENTATION_COLOR_READ_TYPE = 35738)] =
      "IMPLEMENTATION_COLOR_READ_TYPE"),
    (e[(e.IMPLEMENTATION_COLOR_READ_FORMAT = 35739)] =
      "IMPLEMENTATION_COLOR_READ_FORMAT"),
    (e[(e.BROWSER_DEFAULT_WEBGL = 37444)] = "BROWSER_DEFAULT_WEBGL"),
    (e[(e.STATIC_DRAW = 35044)] = "STATIC_DRAW"),
    (e[(e.STREAM_DRAW = 35040)] = "STREAM_DRAW"),
    (e[(e.DYNAMIC_DRAW = 35048)] = "DYNAMIC_DRAW"),
    (e[(e.ARRAY_BUFFER = 34962)] = "ARRAY_BUFFER"),
    (e[(e.ELEMENT_ARRAY_BUFFER = 34963)] = "ELEMENT_ARRAY_BUFFER"),
    (e[(e.BUFFER_SIZE = 34660)] = "BUFFER_SIZE"),
    (e[(e.BUFFER_USAGE = 34661)] = "BUFFER_USAGE"),
    (e[(e.CURRENT_VERTEX_ATTRIB = 34342)] = "CURRENT_VERTEX_ATTRIB"),
    (e[(e.VERTEX_ATTRIB_ARRAY_ENABLED = 34338)] =
      "VERTEX_ATTRIB_ARRAY_ENABLED"),
    (e[(e.VERTEX_ATTRIB_ARRAY_SIZE = 34339)] = "VERTEX_ATTRIB_ARRAY_SIZE"),
    (e[(e.VERTEX_ATTRIB_ARRAY_STRIDE = 34340)] = "VERTEX_ATTRIB_ARRAY_STRIDE"),
    (e[(e.VERTEX_ATTRIB_ARRAY_TYPE = 34341)] = "VERTEX_ATTRIB_ARRAY_TYPE"),
    (e[(e.VERTEX_ATTRIB_ARRAY_NORMALIZED = 34922)] =
      "VERTEX_ATTRIB_ARRAY_NORMALIZED"),
    (e[(e.VERTEX_ATTRIB_ARRAY_POINTER = 34373)] =
      "VERTEX_ATTRIB_ARRAY_POINTER"),
    (e[(e.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING = 34975)] =
      "VERTEX_ATTRIB_ARRAY_BUFFER_BINDING"),
    (e[(e.CULL_FACE = 2884)] = "CULL_FACE"),
    (e[(e.FRONT = 1028)] = "FRONT"),
    (e[(e.BACK = 1029)] = "BACK"),
    (e[(e.FRONT_AND_BACK = 1032)] = "FRONT_AND_BACK"),
    (e[(e.BLEND = 3042)] = "BLEND"),
    (e[(e.DEPTH_TEST = 2929)] = "DEPTH_TEST"),
    (e[(e.DITHER = 3024)] = "DITHER"),
    (e[(e.POLYGON_OFFSET_FILL = 32823)] = "POLYGON_OFFSET_FILL"),
    (e[(e.SAMPLE_ALPHA_TO_COVERAGE = 32926)] = "SAMPLE_ALPHA_TO_COVERAGE"),
    (e[(e.SAMPLE_COVERAGE = 32928)] = "SAMPLE_COVERAGE"),
    (e[(e.SCISSOR_TEST = 3089)] = "SCISSOR_TEST"),
    (e[(e.STENCIL_TEST = 2960)] = "STENCIL_TEST"),
    (e[(e.NO_ERROR = 0)] = "NO_ERROR"),
    (e[(e.INVALID_ENUM = 1280)] = "INVALID_ENUM"),
    (e[(e.INVALID_VALUE = 1281)] = "INVALID_VALUE"),
    (e[(e.INVALID_OPERATION = 1282)] = "INVALID_OPERATION"),
    (e[(e.OUT_OF_MEMORY = 1285)] = "OUT_OF_MEMORY"),
    (e[(e.CONTEXT_LOST_WEBGL = 37442)] = "CONTEXT_LOST_WEBGL"),
    (e[(e.CW = 2304)] = "CW"),
    (e[(e.CCW = 2305)] = "CCW"),
    (e[(e.DONT_CARE = 4352)] = "DONT_CARE"),
    (e[(e.FASTEST = 4353)] = "FASTEST"),
    (e[(e.NICEST = 4354)] = "NICEST"),
    (e[(e.GENERATE_MIPMAP_HINT = 33170)] = "GENERATE_MIPMAP_HINT"),
    (e[(e.BYTE = 5120)] = "BYTE"),
    (e[(e.UNSIGNED_BYTE = 5121)] = "UNSIGNED_BYTE"),
    (e[(e.SHORT = 5122)] = "SHORT"),
    (e[(e.UNSIGNED_SHORT = 5123)] = "UNSIGNED_SHORT"),
    (e[(e.INT = 5124)] = "INT"),
    (e[(e.UNSIGNED_INT = 5125)] = "UNSIGNED_INT"),
    (e[(e.FLOAT = 5126)] = "FLOAT"),
    (e[(e.DOUBLE = 5130)] = "DOUBLE"),
    (e[(e.DEPTH_COMPONENT = 6402)] = "DEPTH_COMPONENT"),
    (e[(e.ALPHA = 6406)] = "ALPHA"),
    (e[(e.RGB = 6407)] = "RGB"),
    (e[(e.RGBA = 6408)] = "RGBA"),
    (e[(e.LUMINANCE = 6409)] = "LUMINANCE"),
    (e[(e.LUMINANCE_ALPHA = 6410)] = "LUMINANCE_ALPHA"),
    (e[(e.UNSIGNED_SHORT_4_4_4_4 = 32819)] = "UNSIGNED_SHORT_4_4_4_4"),
    (e[(e.UNSIGNED_SHORT_5_5_5_1 = 32820)] = "UNSIGNED_SHORT_5_5_5_1"),
    (e[(e.UNSIGNED_SHORT_5_6_5 = 33635)] = "UNSIGNED_SHORT_5_6_5"),
    (e[(e.FRAGMENT_SHADER = 35632)] = "FRAGMENT_SHADER"),
    (e[(e.VERTEX_SHADER = 35633)] = "VERTEX_SHADER"),
    (e[(e.COMPILE_STATUS = 35713)] = "COMPILE_STATUS"),
    (e[(e.DELETE_STATUS = 35712)] = "DELETE_STATUS"),
    (e[(e.LINK_STATUS = 35714)] = "LINK_STATUS"),
    (e[(e.VALIDATE_STATUS = 35715)] = "VALIDATE_STATUS"),
    (e[(e.ATTACHED_SHADERS = 35717)] = "ATTACHED_SHADERS"),
    (e[(e.ACTIVE_ATTRIBUTES = 35721)] = "ACTIVE_ATTRIBUTES"),
    (e[(e.ACTIVE_UNIFORMS = 35718)] = "ACTIVE_UNIFORMS"),
    (e[(e.MAX_VERTEX_ATTRIBS = 34921)] = "MAX_VERTEX_ATTRIBS"),
    (e[(e.MAX_VERTEX_UNIFORM_VECTORS = 36347)] = "MAX_VERTEX_UNIFORM_VECTORS"),
    (e[(e.MAX_VARYING_VECTORS = 36348)] = "MAX_VARYING_VECTORS"),
    (e[(e.MAX_COMBINED_TEXTURE_IMAGE_UNITS = 35661)] =
      "MAX_COMBINED_TEXTURE_IMAGE_UNITS"),
    (e[(e.MAX_VERTEX_TEXTURE_IMAGE_UNITS = 35660)] =
      "MAX_VERTEX_TEXTURE_IMAGE_UNITS"),
    (e[(e.MAX_TEXTURE_IMAGE_UNITS = 34930)] = "MAX_TEXTURE_IMAGE_UNITS"),
    (e[(e.MAX_FRAGMENT_UNIFORM_VECTORS = 36349)] =
      "MAX_FRAGMENT_UNIFORM_VECTORS"),
    (e[(e.SHADER_TYPE = 35663)] = "SHADER_TYPE"),
    (e[(e.SHADING_LANGUAGE_VERSION = 35724)] = "SHADING_LANGUAGE_VERSION"),
    (e[(e.CURRENT_PROGRAM = 35725)] = "CURRENT_PROGRAM"),
    (e[(e.NEVER = 512)] = "NEVER"),
    (e[(e.LESS = 513)] = "LESS"),
    (e[(e.EQUAL = 514)] = "EQUAL"),
    (e[(e.LEQUAL = 515)] = "LEQUAL"),
    (e[(e.GREATER = 516)] = "GREATER"),
    (e[(e.NOTEQUAL = 517)] = "NOTEQUAL"),
    (e[(e.GEQUAL = 518)] = "GEQUAL"),
    (e[(e.ALWAYS = 519)] = "ALWAYS"),
    (e[(e.KEEP = 7680)] = "KEEP"),
    (e[(e.REPLACE = 7681)] = "REPLACE"),
    (e[(e.INCR = 7682)] = "INCR"),
    (e[(e.DECR = 7683)] = "DECR"),
    (e[(e.INVERT = 5386)] = "INVERT"),
    (e[(e.INCR_WRAP = 34055)] = "INCR_WRAP"),
    (e[(e.DECR_WRAP = 34056)] = "DECR_WRAP"),
    (e[(e.NEAREST = 9728)] = "NEAREST"),
    (e[(e.LINEAR = 9729)] = "LINEAR"),
    (e[(e.NEAREST_MIPMAP_NEAREST = 9984)] = "NEAREST_MIPMAP_NEAREST"),
    (e[(e.LINEAR_MIPMAP_NEAREST = 9985)] = "LINEAR_MIPMAP_NEAREST"),
    (e[(e.NEAREST_MIPMAP_LINEAR = 9986)] = "NEAREST_MIPMAP_LINEAR"),
    (e[(e.LINEAR_MIPMAP_LINEAR = 9987)] = "LINEAR_MIPMAP_LINEAR"),
    (e[(e.TEXTURE_MAG_FILTER = 10240)] = "TEXTURE_MAG_FILTER"),
    (e[(e.TEXTURE_MIN_FILTER = 10241)] = "TEXTURE_MIN_FILTER"),
    (e[(e.TEXTURE_WRAP_S = 10242)] = "TEXTURE_WRAP_S"),
    (e[(e.TEXTURE_WRAP_T = 10243)] = "TEXTURE_WRAP_T"),
    (e[(e.TEXTURE_2D = 3553)] = "TEXTURE_2D"),
    (e[(e.TEXTURE = 5890)] = "TEXTURE"),
    (e[(e.TEXTURE_CUBE_MAP = 34067)] = "TEXTURE_CUBE_MAP"),
    (e[(e.TEXTURE_BINDING_CUBE_MAP = 34068)] = "TEXTURE_BINDING_CUBE_MAP"),
    (e[(e.TEXTURE_CUBE_MAP_POSITIVE_X = 34069)] =
      "TEXTURE_CUBE_MAP_POSITIVE_X"),
    (e[(e.TEXTURE_CUBE_MAP_NEGATIVE_X = 34070)] =
      "TEXTURE_CUBE_MAP_NEGATIVE_X"),
    (e[(e.TEXTURE_CUBE_MAP_POSITIVE_Y = 34071)] =
      "TEXTURE_CUBE_MAP_POSITIVE_Y"),
    (e[(e.TEXTURE_CUBE_MAP_NEGATIVE_Y = 34072)] =
      "TEXTURE_CUBE_MAP_NEGATIVE_Y"),
    (e[(e.TEXTURE_CUBE_MAP_POSITIVE_Z = 34073)] =
      "TEXTURE_CUBE_MAP_POSITIVE_Z"),
    (e[(e.TEXTURE_CUBE_MAP_NEGATIVE_Z = 34074)] =
      "TEXTURE_CUBE_MAP_NEGATIVE_Z"),
    (e[(e.MAX_CUBE_MAP_TEXTURE_SIZE = 34076)] = "MAX_CUBE_MAP_TEXTURE_SIZE"),
    (e[(e.TEXTURE0 = 33984)] = "TEXTURE0"),
    (e[(e.ACTIVE_TEXTURE = 34016)] = "ACTIVE_TEXTURE"),
    (e[(e.REPEAT = 10497)] = "REPEAT"),
    (e[(e.CLAMP_TO_EDGE = 33071)] = "CLAMP_TO_EDGE"),
    (e[(e.MIRRORED_REPEAT = 33648)] = "MIRRORED_REPEAT"),
    (e[(e.TEXTURE_WIDTH = 4096)] = "TEXTURE_WIDTH"),
    (e[(e.TEXTURE_HEIGHT = 4097)] = "TEXTURE_HEIGHT"),
    (e[(e.FLOAT_VEC2 = 35664)] = "FLOAT_VEC2"),
    (e[(e.FLOAT_VEC3 = 35665)] = "FLOAT_VEC3"),
    (e[(e.FLOAT_VEC4 = 35666)] = "FLOAT_VEC4"),
    (e[(e.INT_VEC2 = 35667)] = "INT_VEC2"),
    (e[(e.INT_VEC3 = 35668)] = "INT_VEC3"),
    (e[(e.INT_VEC4 = 35669)] = "INT_VEC4"),
    (e[(e.BOOL = 35670)] = "BOOL"),
    (e[(e.BOOL_VEC2 = 35671)] = "BOOL_VEC2"),
    (e[(e.BOOL_VEC3 = 35672)] = "BOOL_VEC3"),
    (e[(e.BOOL_VEC4 = 35673)] = "BOOL_VEC4"),
    (e[(e.FLOAT_MAT2 = 35674)] = "FLOAT_MAT2"),
    (e[(e.FLOAT_MAT3 = 35675)] = "FLOAT_MAT3"),
    (e[(e.FLOAT_MAT4 = 35676)] = "FLOAT_MAT4"),
    (e[(e.SAMPLER_2D = 35678)] = "SAMPLER_2D"),
    (e[(e.SAMPLER_CUBE = 35680)] = "SAMPLER_CUBE"),
    (e[(e.LOW_FLOAT = 36336)] = "LOW_FLOAT"),
    (e[(e.MEDIUM_FLOAT = 36337)] = "MEDIUM_FLOAT"),
    (e[(e.HIGH_FLOAT = 36338)] = "HIGH_FLOAT"),
    (e[(e.LOW_INT = 36339)] = "LOW_INT"),
    (e[(e.MEDIUM_INT = 36340)] = "MEDIUM_INT"),
    (e[(e.HIGH_INT = 36341)] = "HIGH_INT"),
    (e[(e.FRAMEBUFFER = 36160)] = "FRAMEBUFFER"),
    (e[(e.RENDERBUFFER = 36161)] = "RENDERBUFFER"),
    (e[(e.RGBA4 = 32854)] = "RGBA4"),
    (e[(e.RGB5_A1 = 32855)] = "RGB5_A1"),
    (e[(e.RGB565 = 36194)] = "RGB565"),
    (e[(e.DEPTH_COMPONENT16 = 33189)] = "DEPTH_COMPONENT16"),
    (e[(e.STENCIL_INDEX = 6401)] = "STENCIL_INDEX"),
    (e[(e.STENCIL_INDEX8 = 36168)] = "STENCIL_INDEX8"),
    (e[(e.DEPTH_STENCIL = 34041)] = "DEPTH_STENCIL"),
    (e[(e.RENDERBUFFER_WIDTH = 36162)] = "RENDERBUFFER_WIDTH"),
    (e[(e.RENDERBUFFER_HEIGHT = 36163)] = "RENDERBUFFER_HEIGHT"),
    (e[(e.RENDERBUFFER_INTERNAL_FORMAT = 36164)] =
      "RENDERBUFFER_INTERNAL_FORMAT"),
    (e[(e.RENDERBUFFER_RED_SIZE = 36176)] = "RENDERBUFFER_RED_SIZE"),
    (e[(e.RENDERBUFFER_GREEN_SIZE = 36177)] = "RENDERBUFFER_GREEN_SIZE"),
    (e[(e.RENDERBUFFER_BLUE_SIZE = 36178)] = "RENDERBUFFER_BLUE_SIZE"),
    (e[(e.RENDERBUFFER_ALPHA_SIZE = 36179)] = "RENDERBUFFER_ALPHA_SIZE"),
    (e[(e.RENDERBUFFER_DEPTH_SIZE = 36180)] = "RENDERBUFFER_DEPTH_SIZE"),
    (e[(e.RENDERBUFFER_STENCIL_SIZE = 36181)] = "RENDERBUFFER_STENCIL_SIZE"),
    (e[(e.FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE = 36048)] =
      "FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE"),
    (e[(e.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME = 36049)] =
      "FRAMEBUFFER_ATTACHMENT_OBJECT_NAME"),
    (e[(e.FRAMEBUFFER_ATTACHMENT_TEXTURE_LEVEL = 36050)] =
      "FRAMEBUFFER_ATTACHMENT_TEXTURE_LEVEL"),
    (e[(e.FRAMEBUFFER_ATTACHMENT_TEXTURE_CUBE_MAP_FACE = 36051)] =
      "FRAMEBUFFER_ATTACHMENT_TEXTURE_CUBE_MAP_FACE"),
    (e[(e.COLOR_ATTACHMENT0 = 36064)] = "COLOR_ATTACHMENT0"),
    (e[(e.DEPTH_ATTACHMENT = 36096)] = "DEPTH_ATTACHMENT"),
    (e[(e.STENCIL_ATTACHMENT = 36128)] = "STENCIL_ATTACHMENT"),
    (e[(e.DEPTH_STENCIL_ATTACHMENT = 33306)] = "DEPTH_STENCIL_ATTACHMENT"),
    (e[(e.NONE = 0)] = "NONE"),
    (e[(e.FRAMEBUFFER_COMPLETE = 36053)] = "FRAMEBUFFER_COMPLETE"),
    (e[(e.FRAMEBUFFER_INCOMPLETE_ATTACHMENT = 36054)] =
      "FRAMEBUFFER_INCOMPLETE_ATTACHMENT"),
    (e[(e.FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT = 36055)] =
      "FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT"),
    (e[(e.FRAMEBUFFER_INCOMPLETE_DIMENSIONS = 36057)] =
      "FRAMEBUFFER_INCOMPLETE_DIMENSIONS"),
    (e[(e.FRAMEBUFFER_UNSUPPORTED = 36061)] = "FRAMEBUFFER_UNSUPPORTED"),
    (e[(e.FRAMEBUFFER_BINDING = 36006)] = "FRAMEBUFFER_BINDING"),
    (e[(e.RENDERBUFFER_BINDING = 36007)] = "RENDERBUFFER_BINDING"),
    (e[(e.READ_FRAMEBUFFER = 36008)] = "READ_FRAMEBUFFER"),
    (e[(e.DRAW_FRAMEBUFFER = 36009)] = "DRAW_FRAMEBUFFER"),
    (e[(e.MAX_RENDERBUFFER_SIZE = 34024)] = "MAX_RENDERBUFFER_SIZE"),
    (e[(e.INVALID_FRAMEBUFFER_OPERATION = 1286)] =
      "INVALID_FRAMEBUFFER_OPERATION"),
    (e[(e.UNPACK_FLIP_Y_WEBGL = 37440)] = "UNPACK_FLIP_Y_WEBGL"),
    (e[(e.UNPACK_PREMULTIPLY_ALPHA_WEBGL = 37441)] =
      "UNPACK_PREMULTIPLY_ALPHA_WEBGL"),
    (e[(e.UNPACK_COLORSPACE_CONVERSION_WEBGL = 37443)] =
      "UNPACK_COLORSPACE_CONVERSION_WEBGL"),
    (e[(e.READ_BUFFER = 3074)] = "READ_BUFFER"),
    (e[(e.UNPACK_ROW_LENGTH = 3314)] = "UNPACK_ROW_LENGTH"),
    (e[(e.UNPACK_SKIP_ROWS = 3315)] = "UNPACK_SKIP_ROWS"),
    (e[(e.UNPACK_SKIP_PIXELS = 3316)] = "UNPACK_SKIP_PIXELS"),
    (e[(e.PACK_ROW_LENGTH = 3330)] = "PACK_ROW_LENGTH"),
    (e[(e.PACK_SKIP_ROWS = 3331)] = "PACK_SKIP_ROWS"),
    (e[(e.PACK_SKIP_PIXELS = 3332)] = "PACK_SKIP_PIXELS"),
    (e[(e.TEXTURE_BINDING_3D = 32874)] = "TEXTURE_BINDING_3D"),
    (e[(e.UNPACK_SKIP_IMAGES = 32877)] = "UNPACK_SKIP_IMAGES"),
    (e[(e.UNPACK_IMAGE_HEIGHT = 32878)] = "UNPACK_IMAGE_HEIGHT"),
    (e[(e.MAX_3D_TEXTURE_SIZE = 32883)] = "MAX_3D_TEXTURE_SIZE"),
    (e[(e.MAX_ELEMENTS_VERTICES = 33e3)] = "MAX_ELEMENTS_VERTICES"),
    (e[(e.MAX_ELEMENTS_INDICES = 33001)] = "MAX_ELEMENTS_INDICES"),
    (e[(e.MAX_TEXTURE_LOD_BIAS = 34045)] = "MAX_TEXTURE_LOD_BIAS"),
    (e[(e.MAX_FRAGMENT_UNIFORM_COMPONENTS = 35657)] =
      "MAX_FRAGMENT_UNIFORM_COMPONENTS"),
    (e[(e.MAX_VERTEX_UNIFORM_COMPONENTS = 35658)] =
      "MAX_VERTEX_UNIFORM_COMPONENTS"),
    (e[(e.MAX_ARRAY_TEXTURE_LAYERS = 35071)] = "MAX_ARRAY_TEXTURE_LAYERS"),
    (e[(e.MIN_PROGRAM_TEXEL_OFFSET = 35076)] = "MIN_PROGRAM_TEXEL_OFFSET"),
    (e[(e.MAX_PROGRAM_TEXEL_OFFSET = 35077)] = "MAX_PROGRAM_TEXEL_OFFSET"),
    (e[(e.MAX_VARYING_COMPONENTS = 35659)] = "MAX_VARYING_COMPONENTS"),
    (e[(e.FRAGMENT_SHADER_DERIVATIVE_HINT = 35723)] =
      "FRAGMENT_SHADER_DERIVATIVE_HINT"),
    (e[(e.RASTERIZER_DISCARD = 35977)] = "RASTERIZER_DISCARD"),
    (e[(e.VERTEX_ARRAY_BINDING = 34229)] = "VERTEX_ARRAY_BINDING"),
    (e[(e.MAX_VERTEX_OUTPUT_COMPONENTS = 37154)] =
      "MAX_VERTEX_OUTPUT_COMPONENTS"),
    (e[(e.MAX_FRAGMENT_INPUT_COMPONENTS = 37157)] =
      "MAX_FRAGMENT_INPUT_COMPONENTS"),
    (e[(e.MAX_SERVER_WAIT_TIMEOUT = 37137)] = "MAX_SERVER_WAIT_TIMEOUT"),
    (e[(e.MAX_ELEMENT_INDEX = 36203)] = "MAX_ELEMENT_INDEX"),
    (e[(e.RED = 6403)] = "RED"),
    (e[(e.RGB8 = 32849)] = "RGB8"),
    (e[(e.RGBA8 = 32856)] = "RGBA8"),
    (e[(e.RGB10_A2 = 32857)] = "RGB10_A2"),
    (e[(e.TEXTURE_3D = 32879)] = "TEXTURE_3D"),
    (e[(e.TEXTURE_WRAP_R = 32882)] = "TEXTURE_WRAP_R"),
    (e[(e.TEXTURE_MIN_LOD = 33082)] = "TEXTURE_MIN_LOD"),
    (e[(e.TEXTURE_MAX_LOD = 33083)] = "TEXTURE_MAX_LOD"),
    (e[(e.TEXTURE_BASE_LEVEL = 33084)] = "TEXTURE_BASE_LEVEL"),
    (e[(e.TEXTURE_MAX_LEVEL = 33085)] = "TEXTURE_MAX_LEVEL"),
    (e[(e.TEXTURE_COMPARE_MODE = 34892)] = "TEXTURE_COMPARE_MODE"),
    (e[(e.TEXTURE_COMPARE_FUNC = 34893)] = "TEXTURE_COMPARE_FUNC"),
    (e[(e.SRGB = 35904)] = "SRGB"),
    (e[(e.SRGB8 = 35905)] = "SRGB8"),
    (e[(e.SRGB8_ALPHA8 = 35907)] = "SRGB8_ALPHA8"),
    (e[(e.COMPARE_REF_TO_TEXTURE = 34894)] = "COMPARE_REF_TO_TEXTURE"),
    (e[(e.RGBA32F = 34836)] = "RGBA32F"),
    (e[(e.RGB32F = 34837)] = "RGB32F"),
    (e[(e.RGBA16F = 34842)] = "RGBA16F"),
    (e[(e.RGB16F = 34843)] = "RGB16F"),
    (e[(e.TEXTURE_2D_ARRAY = 35866)] = "TEXTURE_2D_ARRAY"),
    (e[(e.TEXTURE_BINDING_2D_ARRAY = 35869)] = "TEXTURE_BINDING_2D_ARRAY"),
    (e[(e.R11F_G11F_B10F = 35898)] = "R11F_G11F_B10F"),
    (e[(e.RGB9_E5 = 35901)] = "RGB9_E5"),
    (e[(e.RGBA32UI = 36208)] = "RGBA32UI"),
    (e[(e.RGB32UI = 36209)] = "RGB32UI"),
    (e[(e.RGBA16UI = 36214)] = "RGBA16UI"),
    (e[(e.RGB16UI = 36215)] = "RGB16UI"),
    (e[(e.RGBA8UI = 36220)] = "RGBA8UI"),
    (e[(e.RGB8UI = 36221)] = "RGB8UI"),
    (e[(e.RGBA32I = 36226)] = "RGBA32I"),
    (e[(e.RGB32I = 36227)] = "RGB32I"),
    (e[(e.RGBA16I = 36232)] = "RGBA16I"),
    (e[(e.RGB16I = 36233)] = "RGB16I"),
    (e[(e.RGBA8I = 36238)] = "RGBA8I"),
    (e[(e.RGB8I = 36239)] = "RGB8I"),
    (e[(e.RED_INTEGER = 36244)] = "RED_INTEGER"),
    (e[(e.RGB_INTEGER = 36248)] = "RGB_INTEGER"),
    (e[(e.RGBA_INTEGER = 36249)] = "RGBA_INTEGER"),
    (e[(e.R8 = 33321)] = "R8"),
    (e[(e.RG8 = 33323)] = "RG8"),
    (e[(e.R16F = 33325)] = "R16F"),
    (e[(e.R32F = 33326)] = "R32F"),
    (e[(e.RG16F = 33327)] = "RG16F"),
    (e[(e.RG32F = 33328)] = "RG32F"),
    (e[(e.R8I = 33329)] = "R8I"),
    (e[(e.R8UI = 33330)] = "R8UI"),
    (e[(e.R16I = 33331)] = "R16I"),
    (e[(e.R16UI = 33332)] = "R16UI"),
    (e[(e.R32I = 33333)] = "R32I"),
    (e[(e.R32UI = 33334)] = "R32UI"),
    (e[(e.RG8I = 33335)] = "RG8I"),
    (e[(e.RG8UI = 33336)] = "RG8UI"),
    (e[(e.RG16I = 33337)] = "RG16I"),
    (e[(e.RG16UI = 33338)] = "RG16UI"),
    (e[(e.RG32I = 33339)] = "RG32I"),
    (e[(e.RG32UI = 33340)] = "RG32UI"),
    (e[(e.R8_SNORM = 36756)] = "R8_SNORM"),
    (e[(e.RG8_SNORM = 36757)] = "RG8_SNORM"),
    (e[(e.RGB8_SNORM = 36758)] = "RGB8_SNORM"),
    (e[(e.RGBA8_SNORM = 36759)] = "RGBA8_SNORM"),
    (e[(e.RGB10_A2UI = 36975)] = "RGB10_A2UI"),
    (e[(e.TEXTURE_IMMUTABLE_FORMAT = 37167)] = "TEXTURE_IMMUTABLE_FORMAT"),
    (e[(e.TEXTURE_IMMUTABLE_LEVELS = 33503)] = "TEXTURE_IMMUTABLE_LEVELS"),
    (e[(e.UNSIGNED_INT_2_10_10_10_REV = 33640)] =
      "UNSIGNED_INT_2_10_10_10_REV"),
    (e[(e.UNSIGNED_INT_10F_11F_11F_REV = 35899)] =
      "UNSIGNED_INT_10F_11F_11F_REV"),
    (e[(e.UNSIGNED_INT_5_9_9_9_REV = 35902)] = "UNSIGNED_INT_5_9_9_9_REV"),
    (e[(e.FLOAT_32_UNSIGNED_INT_24_8_REV = 36269)] =
      "FLOAT_32_UNSIGNED_INT_24_8_REV"),
    (e[(e.UNSIGNED_INT_24_8 = 34042)] = "UNSIGNED_INT_24_8"),
    (e[(e.HALF_FLOAT = 5131)] = "HALF_FLOAT"),
    (e[(e.RG = 33319)] = "RG"),
    (e[(e.RG_INTEGER = 33320)] = "RG_INTEGER"),
    (e[(e.INT_2_10_10_10_REV = 36255)] = "INT_2_10_10_10_REV"),
    (e[(e.CURRENT_QUERY = 34917)] = "CURRENT_QUERY"),
    (e[(e.QUERY_RESULT = 34918)] = "QUERY_RESULT"),
    (e[(e.QUERY_RESULT_AVAILABLE = 34919)] = "QUERY_RESULT_AVAILABLE"),
    (e[(e.ANY_SAMPLES_PASSED = 35887)] = "ANY_SAMPLES_PASSED"),
    (e[(e.ANY_SAMPLES_PASSED_CONSERVATIVE = 36202)] =
      "ANY_SAMPLES_PASSED_CONSERVATIVE"),
    (e[(e.MAX_DRAW_BUFFERS = 34852)] = "MAX_DRAW_BUFFERS"),
    (e[(e.DRAW_BUFFER0 = 34853)] = "DRAW_BUFFER0"),
    (e[(e.DRAW_BUFFER1 = 34854)] = "DRAW_BUFFER1"),
    (e[(e.DRAW_BUFFER2 = 34855)] = "DRAW_BUFFER2"),
    (e[(e.DRAW_BUFFER3 = 34856)] = "DRAW_BUFFER3"),
    (e[(e.DRAW_BUFFER4 = 34857)] = "DRAW_BUFFER4"),
    (e[(e.DRAW_BUFFER5 = 34858)] = "DRAW_BUFFER5"),
    (e[(e.DRAW_BUFFER6 = 34859)] = "DRAW_BUFFER6"),
    (e[(e.DRAW_BUFFER7 = 34860)] = "DRAW_BUFFER7"),
    (e[(e.DRAW_BUFFER8 = 34861)] = "DRAW_BUFFER8"),
    (e[(e.DRAW_BUFFER9 = 34862)] = "DRAW_BUFFER9"),
    (e[(e.DRAW_BUFFER10 = 34863)] = "DRAW_BUFFER10"),
    (e[(e.DRAW_BUFFER11 = 34864)] = "DRAW_BUFFER11"),
    (e[(e.DRAW_BUFFER12 = 34865)] = "DRAW_BUFFER12"),
    (e[(e.DRAW_BUFFER13 = 34866)] = "DRAW_BUFFER13"),
    (e[(e.DRAW_BUFFER14 = 34867)] = "DRAW_BUFFER14"),
    (e[(e.DRAW_BUFFER15 = 34868)] = "DRAW_BUFFER15"),
    (e[(e.MAX_COLOR_ATTACHMENTS = 36063)] = "MAX_COLOR_ATTACHMENTS"),
    (e[(e.COLOR_ATTACHMENT1 = 36065)] = "COLOR_ATTACHMENT1"),
    (e[(e.COLOR_ATTACHMENT2 = 36066)] = "COLOR_ATTACHMENT2"),
    (e[(e.COLOR_ATTACHMENT3 = 36067)] = "COLOR_ATTACHMENT3"),
    (e[(e.COLOR_ATTACHMENT4 = 36068)] = "COLOR_ATTACHMENT4"),
    (e[(e.COLOR_ATTACHMENT5 = 36069)] = "COLOR_ATTACHMENT5"),
    (e[(e.COLOR_ATTACHMENT6 = 36070)] = "COLOR_ATTACHMENT6"),
    (e[(e.COLOR_ATTACHMENT7 = 36071)] = "COLOR_ATTACHMENT7"),
    (e[(e.COLOR_ATTACHMENT8 = 36072)] = "COLOR_ATTACHMENT8"),
    (e[(e.COLOR_ATTACHMENT9 = 36073)] = "COLOR_ATTACHMENT9"),
    (e[(e.COLOR_ATTACHMENT10 = 36074)] = "COLOR_ATTACHMENT10"),
    (e[(e.COLOR_ATTACHMENT11 = 36075)] = "COLOR_ATTACHMENT11"),
    (e[(e.COLOR_ATTACHMENT12 = 36076)] = "COLOR_ATTACHMENT12"),
    (e[(e.COLOR_ATTACHMENT13 = 36077)] = "COLOR_ATTACHMENT13"),
    (e[(e.COLOR_ATTACHMENT14 = 36078)] = "COLOR_ATTACHMENT14"),
    (e[(e.COLOR_ATTACHMENT15 = 36079)] = "COLOR_ATTACHMENT15"),
    (e[(e.SAMPLER_3D = 35679)] = "SAMPLER_3D"),
    (e[(e.SAMPLER_2D_SHADOW = 35682)] = "SAMPLER_2D_SHADOW"),
    (e[(e.SAMPLER_2D_ARRAY = 36289)] = "SAMPLER_2D_ARRAY"),
    (e[(e.SAMPLER_2D_ARRAY_SHADOW = 36292)] = "SAMPLER_2D_ARRAY_SHADOW"),
    (e[(e.SAMPLER_CUBE_SHADOW = 36293)] = "SAMPLER_CUBE_SHADOW"),
    (e[(e.INT_SAMPLER_2D = 36298)] = "INT_SAMPLER_2D"),
    (e[(e.INT_SAMPLER_3D = 36299)] = "INT_SAMPLER_3D"),
    (e[(e.INT_SAMPLER_CUBE = 36300)] = "INT_SAMPLER_CUBE"),
    (e[(e.INT_SAMPLER_2D_ARRAY = 36303)] = "INT_SAMPLER_2D_ARRAY"),
    (e[(e.UNSIGNED_INT_SAMPLER_2D = 36306)] = "UNSIGNED_INT_SAMPLER_2D"),
    (e[(e.UNSIGNED_INT_SAMPLER_3D = 36307)] = "UNSIGNED_INT_SAMPLER_3D"),
    (e[(e.UNSIGNED_INT_SAMPLER_CUBE = 36308)] = "UNSIGNED_INT_SAMPLER_CUBE"),
    (e[(e.UNSIGNED_INT_SAMPLER_2D_ARRAY = 36311)] =
      "UNSIGNED_INT_SAMPLER_2D_ARRAY"),
    (e[(e.MAX_SAMPLES = 36183)] = "MAX_SAMPLES"),
    (e[(e.SAMPLER_BINDING = 35097)] = "SAMPLER_BINDING"),
    (e[(e.PIXEL_PACK_BUFFER = 35051)] = "PIXEL_PACK_BUFFER"),
    (e[(e.PIXEL_UNPACK_BUFFER = 35052)] = "PIXEL_UNPACK_BUFFER"),
    (e[(e.PIXEL_PACK_BUFFER_BINDING = 35053)] = "PIXEL_PACK_BUFFER_BINDING"),
    (e[(e.PIXEL_UNPACK_BUFFER_BINDING = 35055)] =
      "PIXEL_UNPACK_BUFFER_BINDING"),
    (e[(e.COPY_READ_BUFFER = 36662)] = "COPY_READ_BUFFER"),
    (e[(e.COPY_WRITE_BUFFER = 36663)] = "COPY_WRITE_BUFFER"),
    (e[(e.COPY_READ_BUFFER_BINDING = 36662)] = "COPY_READ_BUFFER_BINDING"),
    (e[(e.COPY_WRITE_BUFFER_BINDING = 36663)] = "COPY_WRITE_BUFFER_BINDING"),
    (e[(e.FLOAT_MAT2x3 = 35685)] = "FLOAT_MAT2x3"),
    (e[(e.FLOAT_MAT2x4 = 35686)] = "FLOAT_MAT2x4"),
    (e[(e.FLOAT_MAT3x2 = 35687)] = "FLOAT_MAT3x2"),
    (e[(e.FLOAT_MAT3x4 = 35688)] = "FLOAT_MAT3x4"),
    (e[(e.FLOAT_MAT4x2 = 35689)] = "FLOAT_MAT4x2"),
    (e[(e.FLOAT_MAT4x3 = 35690)] = "FLOAT_MAT4x3"),
    (e[(e.UNSIGNED_INT_VEC2 = 36294)] = "UNSIGNED_INT_VEC2"),
    (e[(e.UNSIGNED_INT_VEC3 = 36295)] = "UNSIGNED_INT_VEC3"),
    (e[(e.UNSIGNED_INT_VEC4 = 36296)] = "UNSIGNED_INT_VEC4"),
    (e[(e.UNSIGNED_NORMALIZED = 35863)] = "UNSIGNED_NORMALIZED"),
    (e[(e.SIGNED_NORMALIZED = 36764)] = "SIGNED_NORMALIZED"),
    (e[(e.VERTEX_ATTRIB_ARRAY_INTEGER = 35069)] =
      "VERTEX_ATTRIB_ARRAY_INTEGER"),
    (e[(e.VERTEX_ATTRIB_ARRAY_DIVISOR = 35070)] =
      "VERTEX_ATTRIB_ARRAY_DIVISOR"),
    (e[(e.TRANSFORM_FEEDBACK_BUFFER_MODE = 35967)] =
      "TRANSFORM_FEEDBACK_BUFFER_MODE"),
    (e[(e.MAX_TRANSFORM_FEEDBACK_SEPARATE_COMPONENTS = 35968)] =
      "MAX_TRANSFORM_FEEDBACK_SEPARATE_COMPONENTS"),
    (e[(e.TRANSFORM_FEEDBACK_VARYINGS = 35971)] =
      "TRANSFORM_FEEDBACK_VARYINGS"),
    (e[(e.TRANSFORM_FEEDBACK_BUFFER_START = 35972)] =
      "TRANSFORM_FEEDBACK_BUFFER_START"),
    (e[(e.TRANSFORM_FEEDBACK_BUFFER_SIZE = 35973)] =
      "TRANSFORM_FEEDBACK_BUFFER_SIZE"),
    (e[(e.TRANSFORM_FEEDBACK_PRIMITIVES_WRITTEN = 35976)] =
      "TRANSFORM_FEEDBACK_PRIMITIVES_WRITTEN"),
    (e[(e.MAX_TRANSFORM_FEEDBACK_INTERLEAVED_COMPONENTS = 35978)] =
      "MAX_TRANSFORM_FEEDBACK_INTERLEAVED_COMPONENTS"),
    (e[(e.MAX_TRANSFORM_FEEDBACK_SEPARATE_ATTRIBS = 35979)] =
      "MAX_TRANSFORM_FEEDBACK_SEPARATE_ATTRIBS"),
    (e[(e.INTERLEAVED_ATTRIBS = 35980)] = "INTERLEAVED_ATTRIBS"),
    (e[(e.SEPARATE_ATTRIBS = 35981)] = "SEPARATE_ATTRIBS"),
    (e[(e.TRANSFORM_FEEDBACK_BUFFER = 35982)] = "TRANSFORM_FEEDBACK_BUFFER"),
    (e[(e.TRANSFORM_FEEDBACK_BUFFER_BINDING = 35983)] =
      "TRANSFORM_FEEDBACK_BUFFER_BINDING"),
    (e[(e.TRANSFORM_FEEDBACK = 36386)] = "TRANSFORM_FEEDBACK"),
    (e[(e.TRANSFORM_FEEDBACK_PAUSED = 36387)] = "TRANSFORM_FEEDBACK_PAUSED"),
    (e[(e.TRANSFORM_FEEDBACK_ACTIVE = 36388)] = "TRANSFORM_FEEDBACK_ACTIVE"),
    (e[(e.TRANSFORM_FEEDBACK_BINDING = 36389)] = "TRANSFORM_FEEDBACK_BINDING"),
    (e[(e.FRAMEBUFFER_ATTACHMENT_COLOR_ENCODING = 33296)] =
      "FRAMEBUFFER_ATTACHMENT_COLOR_ENCODING"),
    (e[(e.FRAMEBUFFER_ATTACHMENT_COMPONENT_TYPE = 33297)] =
      "FRAMEBUFFER_ATTACHMENT_COMPONENT_TYPE"),
    (e[(e.FRAMEBUFFER_ATTACHMENT_RED_SIZE = 33298)] =
      "FRAMEBUFFER_ATTACHMENT_RED_SIZE"),
    (e[(e.FRAMEBUFFER_ATTACHMENT_GREEN_SIZE = 33299)] =
      "FRAMEBUFFER_ATTACHMENT_GREEN_SIZE"),
    (e[(e.FRAMEBUFFER_ATTACHMENT_BLUE_SIZE = 33300)] =
      "FRAMEBUFFER_ATTACHMENT_BLUE_SIZE"),
    (e[(e.FRAMEBUFFER_ATTACHMENT_ALPHA_SIZE = 33301)] =
      "FRAMEBUFFER_ATTACHMENT_ALPHA_SIZE"),
    (e[(e.FRAMEBUFFER_ATTACHMENT_DEPTH_SIZE = 33302)] =
      "FRAMEBUFFER_ATTACHMENT_DEPTH_SIZE"),
    (e[(e.FRAMEBUFFER_ATTACHMENT_STENCIL_SIZE = 33303)] =
      "FRAMEBUFFER_ATTACHMENT_STENCIL_SIZE"),
    (e[(e.FRAMEBUFFER_DEFAULT = 33304)] = "FRAMEBUFFER_DEFAULT"),
    (e[(e.DEPTH24_STENCIL8 = 35056)] = "DEPTH24_STENCIL8"),
    (e[(e.DRAW_FRAMEBUFFER_BINDING = 36006)] = "DRAW_FRAMEBUFFER_BINDING"),
    (e[(e.READ_FRAMEBUFFER_BINDING = 36010)] = "READ_FRAMEBUFFER_BINDING"),
    (e[(e.RENDERBUFFER_SAMPLES = 36011)] = "RENDERBUFFER_SAMPLES"),
    (e[(e.FRAMEBUFFER_ATTACHMENT_TEXTURE_LAYER = 36052)] =
      "FRAMEBUFFER_ATTACHMENT_TEXTURE_LAYER"),
    (e[(e.FRAMEBUFFER_INCOMPLETE_MULTISAMPLE = 36182)] =
      "FRAMEBUFFER_INCOMPLETE_MULTISAMPLE"),
    (e[(e.UNIFORM_BUFFER = 35345)] = "UNIFORM_BUFFER"),
    (e[(e.UNIFORM_BUFFER_BINDING = 35368)] = "UNIFORM_BUFFER_BINDING"),
    (e[(e.UNIFORM_BUFFER_START = 35369)] = "UNIFORM_BUFFER_START"),
    (e[(e.UNIFORM_BUFFER_SIZE = 35370)] = "UNIFORM_BUFFER_SIZE"),
    (e[(e.MAX_VERTEX_UNIFORM_BLOCKS = 35371)] = "MAX_VERTEX_UNIFORM_BLOCKS"),
    (e[(e.MAX_FRAGMENT_UNIFORM_BLOCKS = 35373)] =
      "MAX_FRAGMENT_UNIFORM_BLOCKS"),
    (e[(e.MAX_COMBINED_UNIFORM_BLOCKS = 35374)] =
      "MAX_COMBINED_UNIFORM_BLOCKS"),
    (e[(e.MAX_UNIFORM_BUFFER_BINDINGS = 35375)] =
      "MAX_UNIFORM_BUFFER_BINDINGS"),
    (e[(e.MAX_UNIFORM_BLOCK_SIZE = 35376)] = "MAX_UNIFORM_BLOCK_SIZE"),
    (e[(e.MAX_COMBINED_VERTEX_UNIFORM_COMPONENTS = 35377)] =
      "MAX_COMBINED_VERTEX_UNIFORM_COMPONENTS"),
    (e[(e.MAX_COMBINED_FRAGMENT_UNIFORM_COMPONENTS = 35379)] =
      "MAX_COMBINED_FRAGMENT_UNIFORM_COMPONENTS"),
    (e[(e.UNIFORM_BUFFER_OFFSET_ALIGNMENT = 35380)] =
      "UNIFORM_BUFFER_OFFSET_ALIGNMENT"),
    (e[(e.ACTIVE_UNIFORM_BLOCKS = 35382)] = "ACTIVE_UNIFORM_BLOCKS"),
    (e[(e.UNIFORM_TYPE = 35383)] = "UNIFORM_TYPE"),
    (e[(e.UNIFORM_SIZE = 35384)] = "UNIFORM_SIZE"),
    (e[(e.UNIFORM_BLOCK_INDEX = 35386)] = "UNIFORM_BLOCK_INDEX"),
    (e[(e.UNIFORM_OFFSET = 35387)] = "UNIFORM_OFFSET"),
    (e[(e.UNIFORM_ARRAY_STRIDE = 35388)] = "UNIFORM_ARRAY_STRIDE"),
    (e[(e.UNIFORM_MATRIX_STRIDE = 35389)] = "UNIFORM_MATRIX_STRIDE"),
    (e[(e.UNIFORM_IS_ROW_MAJOR = 35390)] = "UNIFORM_IS_ROW_MAJOR"),
    (e[(e.UNIFORM_BLOCK_BINDING = 35391)] = "UNIFORM_BLOCK_BINDING"),
    (e[(e.UNIFORM_BLOCK_DATA_SIZE = 35392)] = "UNIFORM_BLOCK_DATA_SIZE"),
    (e[(e.UNIFORM_BLOCK_ACTIVE_UNIFORMS = 35394)] =
      "UNIFORM_BLOCK_ACTIVE_UNIFORMS"),
    (e[(e.UNIFORM_BLOCK_ACTIVE_UNIFORM_INDICES = 35395)] =
      "UNIFORM_BLOCK_ACTIVE_UNIFORM_INDICES"),
    (e[(e.UNIFORM_BLOCK_REFERENCED_BY_VERTEX_SHADER = 35396)] =
      "UNIFORM_BLOCK_REFERENCED_BY_VERTEX_SHADER"),
    (e[(e.UNIFORM_BLOCK_REFERENCED_BY_FRAGMENT_SHADER = 35398)] =
      "UNIFORM_BLOCK_REFERENCED_BY_FRAGMENT_SHADER"),
    (e[(e.OBJECT_TYPE = 37138)] = "OBJECT_TYPE"),
    (e[(e.SYNC_CONDITION = 37139)] = "SYNC_CONDITION"),
    (e[(e.SYNC_STATUS = 37140)] = "SYNC_STATUS"),
    (e[(e.SYNC_FLAGS = 37141)] = "SYNC_FLAGS"),
    (e[(e.SYNC_FENCE = 37142)] = "SYNC_FENCE"),
    (e[(e.SYNC_GPU_COMMANDS_COMPLETE = 37143)] = "SYNC_GPU_COMMANDS_COMPLETE"),
    (e[(e.UNSIGNALED = 37144)] = "UNSIGNALED"),
    (e[(e.SIGNALED = 37145)] = "SIGNALED"),
    (e[(e.ALREADY_SIGNALED = 37146)] = "ALREADY_SIGNALED"),
    (e[(e.TIMEOUT_EXPIRED = 37147)] = "TIMEOUT_EXPIRED"),
    (e[(e.CONDITION_SATISFIED = 37148)] = "CONDITION_SATISFIED"),
    (e[(e.WAIT_FAILED = 37149)] = "WAIT_FAILED"),
    (e[(e.SYNC_FLUSH_COMMANDS_BIT = 1)] = "SYNC_FLUSH_COMMANDS_BIT"),
    (e[(e.COLOR = 6144)] = "COLOR"),
    (e[(e.DEPTH = 6145)] = "DEPTH"),
    (e[(e.STENCIL = 6146)] = "STENCIL"),
    (e[(e.MIN = 32775)] = "MIN"),
    (e[(e.MAX = 32776)] = "MAX"),
    (e[(e.DEPTH_COMPONENT24 = 33190)] = "DEPTH_COMPONENT24"),
    (e[(e.STREAM_READ = 35041)] = "STREAM_READ"),
    (e[(e.STREAM_COPY = 35042)] = "STREAM_COPY"),
    (e[(e.STATIC_READ = 35045)] = "STATIC_READ"),
    (e[(e.STATIC_COPY = 35046)] = "STATIC_COPY"),
    (e[(e.DYNAMIC_READ = 35049)] = "DYNAMIC_READ"),
    (e[(e.DYNAMIC_COPY = 35050)] = "DYNAMIC_COPY"),
    (e[(e.DEPTH_COMPONENT32F = 36012)] = "DEPTH_COMPONENT32F"),
    (e[(e.DEPTH32F_STENCIL8 = 36013)] = "DEPTH32F_STENCIL8"),
    (e[(e.INVALID_INDEX = 4294967295)] = "INVALID_INDEX"),
    (e[(e.TIMEOUT_IGNORED = -1)] = "TIMEOUT_IGNORED"),
    (e[(e.MAX_CLIENT_WAIT_TIMEOUT_WEBGL = 37447)] =
      "MAX_CLIENT_WAIT_TIMEOUT_WEBGL"),
    (e[(e.UNMASKED_VENDOR_WEBGL = 37445)] = "UNMASKED_VENDOR_WEBGL"),
    (e[(e.UNMASKED_RENDERER_WEBGL = 37446)] = "UNMASKED_RENDERER_WEBGL"),
    (e[(e.MAX_TEXTURE_MAX_ANISOTROPY_EXT = 34047)] =
      "MAX_TEXTURE_MAX_ANISOTROPY_EXT"),
    (e[(e.TEXTURE_MAX_ANISOTROPY_EXT = 34046)] = "TEXTURE_MAX_ANISOTROPY_EXT"),
    (e[(e.R16_EXT = 33322)] = "R16_EXT"),
    (e[(e.RG16_EXT = 33324)] = "RG16_EXT"),
    (e[(e.RGB16_EXT = 32852)] = "RGB16_EXT"),
    (e[(e.RGBA16_EXT = 32859)] = "RGBA16_EXT"),
    (e[(e.R16_SNORM_EXT = 36760)] = "R16_SNORM_EXT"),
    (e[(e.RG16_SNORM_EXT = 36761)] = "RG16_SNORM_EXT"),
    (e[(e.RGB16_SNORM_EXT = 36762)] = "RGB16_SNORM_EXT"),
    (e[(e.RGBA16_SNORM_EXT = 36763)] = "RGBA16_SNORM_EXT"),
    (e[(e.COMPRESSED_RGB_S3TC_DXT1_EXT = 33776)] =
      "COMPRESSED_RGB_S3TC_DXT1_EXT"),
    (e[(e.COMPRESSED_RGBA_S3TC_DXT1_EXT = 33777)] =
      "COMPRESSED_RGBA_S3TC_DXT1_EXT"),
    (e[(e.COMPRESSED_RGBA_S3TC_DXT3_EXT = 33778)] =
      "COMPRESSED_RGBA_S3TC_DXT3_EXT"),
    (e[(e.COMPRESSED_RGBA_S3TC_DXT5_EXT = 33779)] =
      "COMPRESSED_RGBA_S3TC_DXT5_EXT"),
    (e[(e.COMPRESSED_SRGB_S3TC_DXT1_EXT = 35916)] =
      "COMPRESSED_SRGB_S3TC_DXT1_EXT"),
    (e[(e.COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT = 35917)] =
      "COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT"),
    (e[(e.COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT = 35918)] =
      "COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT"),
    (e[(e.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT = 35919)] =
      "COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT"),
    (e[(e.COMPRESSED_RED_RGTC1_EXT = 36283)] = "COMPRESSED_RED_RGTC1_EXT"),
    (e[(e.COMPRESSED_SIGNED_RED_RGTC1_EXT = 36284)] =
      "COMPRESSED_SIGNED_RED_RGTC1_EXT"),
    (e[(e.COMPRESSED_RED_GREEN_RGTC2_EXT = 36285)] =
      "COMPRESSED_RED_GREEN_RGTC2_EXT"),
    (e[(e.COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT = 36286)] =
      "COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT"),
    (e[(e.COMPRESSED_RGBA_BPTC_UNORM_EXT = 36492)] =
      "COMPRESSED_RGBA_BPTC_UNORM_EXT"),
    (e[(e.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT = 36493)] =
      "COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT"),
    (e[(e.COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT = 36494)] =
      "COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT"),
    (e[(e.COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT = 36495)] =
      "COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT"),
    (e[(e.COMPRESSED_R11_EAC = 37488)] = "COMPRESSED_R11_EAC"),
    (e[(e.COMPRESSED_SIGNED_R11_EAC = 37489)] = "COMPRESSED_SIGNED_R11_EAC"),
    (e[(e.COMPRESSED_RG11_EAC = 37490)] = "COMPRESSED_RG11_EAC"),
    (e[(e.COMPRESSED_SIGNED_RG11_EAC = 37491)] = "COMPRESSED_SIGNED_RG11_EAC"),
    (e[(e.COMPRESSED_RGB8_ETC2 = 37492)] = "COMPRESSED_RGB8_ETC2"),
    (e[(e.COMPRESSED_RGBA8_ETC2_EAC = 37493)] = "COMPRESSED_RGBA8_ETC2_EAC"),
    (e[(e.COMPRESSED_SRGB8_ETC2 = 37494)] = "COMPRESSED_SRGB8_ETC2"),
    (e[(e.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC = 37495)] =
      "COMPRESSED_SRGB8_ALPHA8_ETC2_EAC"),
    (e[(e.COMPRESSED_RGB8_PUNCHTHROUGH_ALPHA1_ETC2 = 37496)] =
      "COMPRESSED_RGB8_PUNCHTHROUGH_ALPHA1_ETC2"),
    (e[(e.COMPRESSED_SRGB8_PUNCHTHROUGH_ALPHA1_ETC2 = 37497)] =
      "COMPRESSED_SRGB8_PUNCHTHROUGH_ALPHA1_ETC2"),
    (e[(e.COMPRESSED_RGB_PVRTC_4BPPV1_IMG = 35840)] =
      "COMPRESSED_RGB_PVRTC_4BPPV1_IMG"),
    (e[(e.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG = 35842)] =
      "COMPRESSED_RGBA_PVRTC_4BPPV1_IMG"),
    (e[(e.COMPRESSED_RGB_PVRTC_2BPPV1_IMG = 35841)] =
      "COMPRESSED_RGB_PVRTC_2BPPV1_IMG"),
    (e[(e.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG = 35843)] =
      "COMPRESSED_RGBA_PVRTC_2BPPV1_IMG"),
    (e[(e.COMPRESSED_RGB_ETC1_WEBGL = 36196)] = "COMPRESSED_RGB_ETC1_WEBGL"),
    (e[(e.COMPRESSED_RGB_ATC_WEBGL = 35986)] = "COMPRESSED_RGB_ATC_WEBGL"),
    (e[(e.COMPRESSED_RGBA_ATC_EXPLICIT_ALPHA_WEBGL = 35986)] =
      "COMPRESSED_RGBA_ATC_EXPLICIT_ALPHA_WEBGL"),
    (e[(e.COMPRESSED_RGBA_ATC_INTERPOLATED_ALPHA_WEBGL = 34798)] =
      "COMPRESSED_RGBA_ATC_INTERPOLATED_ALPHA_WEBGL"),
    (e[(e.COMPRESSED_RGBA_ASTC_4x4_KHR = 37808)] =
      "COMPRESSED_RGBA_ASTC_4x4_KHR"),
    (e[(e.COMPRESSED_RGBA_ASTC_5x4_KHR = 37809)] =
      "COMPRESSED_RGBA_ASTC_5x4_KHR"),
    (e[(e.COMPRESSED_RGBA_ASTC_5x5_KHR = 37810)] =
      "COMPRESSED_RGBA_ASTC_5x5_KHR"),
    (e[(e.COMPRESSED_RGBA_ASTC_6x5_KHR = 37811)] =
      "COMPRESSED_RGBA_ASTC_6x5_KHR"),
    (e[(e.COMPRESSED_RGBA_ASTC_6x6_KHR = 37812)] =
      "COMPRESSED_RGBA_ASTC_6x6_KHR"),
    (e[(e.COMPRESSED_RGBA_ASTC_8x5_KHR = 37813)] =
      "COMPRESSED_RGBA_ASTC_8x5_KHR"),
    (e[(e.COMPRESSED_RGBA_ASTC_8x6_KHR = 37814)] =
      "COMPRESSED_RGBA_ASTC_8x6_KHR"),
    (e[(e.COMPRESSED_RGBA_ASTC_8x8_KHR = 37815)] =
      "COMPRESSED_RGBA_ASTC_8x8_KHR"),
    (e[(e.COMPRESSED_RGBA_ASTC_10x5_KHR = 37816)] =
      "COMPRESSED_RGBA_ASTC_10x5_KHR"),
    (e[(e.COMPRESSED_RGBA_ASTC_10x6_KHR = 37817)] =
      "COMPRESSED_RGBA_ASTC_10x6_KHR"),
    (e[(e.COMPRESSED_RGBA_ASTC_10x8_KHR = 37818)] =
      "COMPRESSED_RGBA_ASTC_10x8_KHR"),
    (e[(e.COMPRESSED_RGBA_ASTC_10x10_KHR = 37819)] =
      "COMPRESSED_RGBA_ASTC_10x10_KHR"),
    (e[(e.COMPRESSED_RGBA_ASTC_12x10_KHR = 37820)] =
      "COMPRESSED_RGBA_ASTC_12x10_KHR"),
    (e[(e.COMPRESSED_RGBA_ASTC_12x12_KHR = 37821)] =
      "COMPRESSED_RGBA_ASTC_12x12_KHR"),
    (e[(e.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR = 37840)] =
      "COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR"),
    (e[(e.COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR = 37841)] =
      "COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR"),
    (e[(e.COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR = 37842)] =
      "COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR"),
    (e[(e.COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR = 37843)] =
      "COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR"),
    (e[(e.COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR = 37844)] =
      "COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR"),
    (e[(e.COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR = 37845)] =
      "COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR"),
    (e[(e.COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR = 37846)] =
      "COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR"),
    (e[(e.COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR = 37847)] =
      "COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR"),
    (e[(e.COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR = 37848)] =
      "COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR"),
    (e[(e.COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR = 37849)] =
      "COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR"),
    (e[(e.COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR = 37850)] =
      "COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR"),
    (e[(e.COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR = 37851)] =
      "COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR"),
    (e[(e.COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR = 37852)] =
      "COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR"),
    (e[(e.COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR = 37853)] =
      "COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR"),
    (e[(e.QUERY_COUNTER_BITS_EXT = 34916)] = "QUERY_COUNTER_BITS_EXT"),
    (e[(e.CURRENT_QUERY_EXT = 34917)] = "CURRENT_QUERY_EXT"),
    (e[(e.QUERY_RESULT_EXT = 34918)] = "QUERY_RESULT_EXT"),
    (e[(e.QUERY_RESULT_AVAILABLE_EXT = 34919)] = "QUERY_RESULT_AVAILABLE_EXT"),
    (e[(e.TIME_ELAPSED_EXT = 35007)] = "TIME_ELAPSED_EXT"),
    (e[(e.TIMESTAMP_EXT = 36392)] = "TIMESTAMP_EXT"),
    (e[(e.GPU_DISJOINT_EXT = 36795)] = "GPU_DISJOINT_EXT"),
    (e[(e.COMPLETION_STATUS_KHR = 37297)] = "COMPLETION_STATUS_KHR"),
    (e[(e.DEPTH_CLAMP_EXT = 34383)] = "DEPTH_CLAMP_EXT"),
    (e[(e.FIRST_VERTEX_CONVENTION_WEBGL = 36429)] =
      "FIRST_VERTEX_CONVENTION_WEBGL"),
    (e[(e.LAST_VERTEX_CONVENTION_WEBGL = 36430)] =
      "LAST_VERTEX_CONVENTION_WEBGL"),
    (e[(e.PROVOKING_VERTEX_WEBL = 36431)] = "PROVOKING_VERTEX_WEBL"),
    (e[(e.POLYGON_MODE_WEBGL = 2880)] = "POLYGON_MODE_WEBGL"),
    (e[(e.POLYGON_OFFSET_LINE_WEBGL = 10754)] = "POLYGON_OFFSET_LINE_WEBGL"),
    (e[(e.LINE_WEBGL = 6913)] = "LINE_WEBGL"),
    (e[(e.FILL_WEBGL = 6914)] = "FILL_WEBGL"),
    (e[(e.MAX_CLIP_DISTANCES_WEBGL = 3378)] = "MAX_CLIP_DISTANCES_WEBGL"),
    (e[(e.MAX_CULL_DISTANCES_WEBGL = 33529)] = "MAX_CULL_DISTANCES_WEBGL"),
    (e[(e.MAX_COMBINED_CLIP_AND_CULL_DISTANCES_WEBGL = 33530)] =
      "MAX_COMBINED_CLIP_AND_CULL_DISTANCES_WEBGL"),
    (e[(e.CLIP_DISTANCE0_WEBGL = 12288)] = "CLIP_DISTANCE0_WEBGL"),
    (e[(e.CLIP_DISTANCE1_WEBGL = 12289)] = "CLIP_DISTANCE1_WEBGL"),
    (e[(e.CLIP_DISTANCE2_WEBGL = 12290)] = "CLIP_DISTANCE2_WEBGL"),
    (e[(e.CLIP_DISTANCE3_WEBGL = 12291)] = "CLIP_DISTANCE3_WEBGL"),
    (e[(e.CLIP_DISTANCE4_WEBGL = 12292)] = "CLIP_DISTANCE4_WEBGL"),
    (e[(e.CLIP_DISTANCE5_WEBGL = 12293)] = "CLIP_DISTANCE5_WEBGL"),
    (e[(e.CLIP_DISTANCE6_WEBGL = 12294)] = "CLIP_DISTANCE6_WEBGL"),
    (e[(e.CLIP_DISTANCE7_WEBGL = 12295)] = "CLIP_DISTANCE7_WEBGL"),
    (e[(e.POLYGON_OFFSET_CLAMP_EXT = 36379)] = "POLYGON_OFFSET_CLAMP_EXT"),
    (e[(e.LOWER_LEFT_EXT = 36001)] = "LOWER_LEFT_EXT"),
    (e[(e.UPPER_LEFT_EXT = 36002)] = "UPPER_LEFT_EXT"),
    (e[(e.NEGATIVE_ONE_TO_ONE_EXT = 37726)] = "NEGATIVE_ONE_TO_ONE_EXT"),
    (e[(e.ZERO_TO_ONE_EXT = 37727)] = "ZERO_TO_ONE_EXT"),
    (e[(e.CLIP_ORIGIN_EXT = 37724)] = "CLIP_ORIGIN_EXT"),
    (e[(e.CLIP_DEPTH_MODE_EXT = 37725)] = "CLIP_DEPTH_MODE_EXT"),
    (e[(e.SRC1_COLOR_WEBGL = 35065)] = "SRC1_COLOR_WEBGL"),
    (e[(e.SRC1_ALPHA_WEBGL = 34185)] = "SRC1_ALPHA_WEBGL"),
    (e[(e.ONE_MINUS_SRC1_COLOR_WEBGL = 35066)] = "ONE_MINUS_SRC1_COLOR_WEBGL"),
    (e[(e.ONE_MINUS_SRC1_ALPHA_WEBGL = 35067)] = "ONE_MINUS_SRC1_ALPHA_WEBGL"),
    (e[(e.MAX_DUAL_SOURCE_DRAW_BUFFERS_WEBGL = 35068)] =
      "MAX_DUAL_SOURCE_DRAW_BUFFERS_WEBGL"),
    (e[(e.MIRROR_CLAMP_TO_EDGE_EXT = 34627)] = "MIRROR_CLAMP_TO_EDGE_EXT"));
})(Ac || (Ac = {}));
var wc = {
    WEBGL_depth_texture: { UNSIGNED_INT_24_8_WEBGL: 34042 },
    OES_element_index_uint: {},
    OES_texture_float: {},
    OES_texture_half_float: { HALF_FLOAT_OES: 5131 },
    EXT_color_buffer_float: {},
    OES_standard_derivatives: { FRAGMENT_SHADER_DERIVATIVE_HINT_OES: 35723 },
    EXT_frag_depth: {},
    EXT_blend_minmax: { MIN_EXT: 32775, MAX_EXT: 32776 },
    EXT_shader_texture_lod: {},
  },
  Lc = (e) => ({
    drawBuffersWEBGL: (t) => e.drawBuffers(t),
    COLOR_ATTACHMENT0_WEBGL: 36064,
    COLOR_ATTACHMENT1_WEBGL: 36065,
    COLOR_ATTACHMENT2_WEBGL: 36066,
    COLOR_ATTACHMENT3_WEBGL: 36067,
  }),
  Oc = (e) => ({
    VERTEX_ARRAY_BINDING_OES: 34229,
    createVertexArrayOES: () => e.createVertexArray(),
    deleteVertexArrayOES: (t) => e.deleteVertexArray(t),
    isVertexArrayOES: (t) => e.isVertexArray(t),
    bindVertexArrayOES: (t) => e.bindVertexArray(t),
  }),
  Nc = (e) => ({
    VERTEX_ATTRIB_ARRAY_DIVISOR_ANGLE: 35070,
    drawArraysInstancedANGLE: (...t) => e.drawArraysInstanced(...t),
    drawElementsInstancedANGLE: (...t) => e.drawElementsInstanced(...t),
    vertexAttribDivisorANGLE: (...t) => e.vertexAttribDivisor(...t),
  });
async function xc(e, t) {
  const r = document.getElementsByTagName("head")[0];
  if (!r) throw new Error("loadScript");
  const n = document.createElement("script");
  return (
    n.setAttribute("type", "text/javascript"),
    n.setAttribute("src", e),
    t && (n.id = t),
    new Promise((t, i) => {
      ((n.onload = t),
        (n.onerror = (t) => i(new Error(`Unable to load script '${e}': ${t}`))),
        r.appendChild(n));
    })
  );
}
function Pc(e) {
  const t = e.luma || { _polyfilled: !1, extensions: {}, softwareRenderer: !1 };
  return ((t._polyfilled ??= !1), (t.extensions ||= {}), (e.luma = t), t);
}
var Ic = null,
  Mc = !1,
  Bc = {
    debugSpectorJS: Bn.get("debug-spectorjs"),
    debugSpectorJSUrl:
      "https://cdn.jsdelivr.net/npm/spectorjs@0.9.30/dist/spector.bundle.js",
    gl: void 0,
  };
function Dc(e) {
  return ((e.luma = e.luma || {}), e.luma);
}
function Fc(e, t = {}) {
  return t.debugWebGL || t.traceWebGL
    ? (function (e, t) {
        if (!globalThis.WebGLDebugUtils)
          return (Bn.warn("webgl-debug not loaded")(), e);
        const r = Dc(e);
        if (r.debugContext) return r.debugContext;
        globalThis.WebGLDebugUtils.init({ ...Ac, ...e });
        const n = globalThis.WebGLDebugUtils.makeDebugContext(
          e,
          Gc.bind(null, t),
          kc.bind(null, t),
        );
        for (const o in Ac)
          o in n || "number" != typeof Ac[o] || (n[o] = Ac[o]);
        class i {}
        (Object.setPrototypeOf(n, Object.getPrototypeOf(e)),
          Object.setPrototypeOf(i, n));
        const s = Object.create(i);
        return (
          (r.realContext = e),
          (r.debugContext = s),
          (s.luma = r),
          (s.debug = !0),
          s
        );
      })(e, t)
    : (function (e) {
        const t = Dc(e);
        return t.realContext ? t.realContext : e;
      })(e);
}
function Uc(e, t) {
  t = Array.from(t).map((e) => (void 0 === e ? "undefined" : e));
  let r = globalThis.WebGLDebugUtils.glFunctionArgsToString(e, t);
  return (
    (r = `${r.slice(0, 100)}${r.length > 100 ? "..." : ""}`),
    `gl.${e}(${r})`
  );
}
function Gc(e, t, r, n) {
  n = Array.from(n).map((e) => (void 0 === e ? "undefined" : e));
  const i = `${globalThis.WebGLDebugUtils.glEnumToString(t)} in gl.${r}(${globalThis.WebGLDebugUtils.glFunctionArgsToString(r, n)})`;
  throw (
    Bn.error(
      "%cWebGL",
      "color: white; background: red; padding: 2px 6px; border-radius: 3px;",
      i,
    )(),
    new Error(i)
  );
}
function kc(e, t, r) {
  let n = "";
  e.traceWebGL &&
    Bn.level >= 1 &&
    ((n = Uc(t, r)),
    Bn.info(
      1,
      "%cWebGL",
      "color: white; background: blue; padding: 2px 6px; border-radius: 3px;",
      n,
    )());
  for (const i of r) void 0 === i && (n = n || Uc(t, r));
}
var Wc = {},
  $c = function (e, t, r) {
    let n = Promise.resolve();
    if (t && t.length > 0) {
      const e = document.getElementsByTagName("link"),
        s = document.querySelector("meta[property=csp-nonce]"),
        o = s?.nonce || s?.getAttribute("nonce");
      ((i = t.map((t) => {
        if (
          ((t = (function (e, t) {
            return new URL(e, t).href;
          })(t, r)),
          t in Wc)
        )
          return;
        Wc[t] = !0;
        const n = t.endsWith(".css"),
          i = n ? '[rel="stylesheet"]' : "";
        if (r)
          for (let r = e.length - 1; r >= 0; r--) {
            const i = e[r];
            if (i.href === t && (!n || "stylesheet" === i.rel)) return;
          }
        else if (document.querySelector(`link[href="${t}"]${i}`)) return;
        const s = document.createElement("link");
        return (
          (s.rel = n ? "stylesheet" : "modulepreload"),
          n || (s.as = "script"),
          (s.crossOrigin = ""),
          (s.href = t),
          o && s.setAttribute("nonce", o),
          document.head.appendChild(s),
          n
            ? new Promise((e, r) => {
                (s.addEventListener("load", e),
                  s.addEventListener("error", () =>
                    r(new Error(`Unable to preload CSS for ${t}`)),
                  ));
              })
            : void 0
        );
      })),
        (n = Promise.all(
          i.map((e) =>
            Promise.resolve(e).then(
              (e) => ({ status: "fulfilled", value: e }),
              (e) => ({ status: "rejected", reason: e }),
            ),
          ),
        )));
    }
    var i;
    function s(e) {
      const t = new Event("vite:preloadError", { cancelable: !0 });
      if (((t.payload = e), window.dispatchEvent(t), !t.defaultPrevented))
        throw e;
    }
    return n.then((t) => {
      for (const e of t || []) "rejected" === e.status && s(e.reason);
      return e().catch(s);
    });
  },
  Hc = new (class extends Pi {
    type = "webgl";
    constructor() {
      (super(), (wi.defaultProps = { ...wi.defaultProps, ...Bc }));
    }
    enforceWebGL2(e) {
      !(function (e = !0) {
        const t = HTMLCanvasElement.prototype;
        if (!e && t.originalGetContext)
          return (
            (t.getContext = t.originalGetContext),
            void (t.originalGetContext = void 0)
          );
        ((t.originalGetContext = t.getContext),
          (t.getContext = function (e, t) {
            if ("webgl" === e || "experimental-webgl" === e) {
              const e = this.originalGetContext("webgl2", t);
              return (
                e instanceof HTMLElement &&
                  (function (e) {
                    e.getExtension("EXT_color_buffer_float");
                    const t = {
                        ...wc,
                        WEBGL_disjoint_timer_query: e.getExtension(
                          "EXT_disjoint_timer_query_webgl2",
                        ),
                        WEBGL_draw_buffers: Lc(e),
                        OES_vertex_array_object: Oc(e),
                        ANGLE_instanced_arrays: Nc(e),
                      },
                      r = e.getExtension;
                    e.getExtension = function (n) {
                      return r.call(e, n) || (n in t ? t[n] : null);
                    };
                    const n = e.getSupportedExtensions;
                    e.getSupportedExtensions = function () {
                      return (n.apply(e) || [])?.concat(Object.keys(t));
                    };
                  })(e),
                e
              );
            }
            return this.originalGetContext(e, t);
          }));
      })(e);
    }
    isSupported() {
      return "undefined" != typeof WebGL2RenderingContext;
    }
    isDeviceHandle(e) {
      return (
        ("undefined" != typeof WebGL2RenderingContext &&
          e instanceof WebGL2RenderingContext) ||
        ("undefined" != typeof WebGLRenderingContext &&
          e instanceof WebGLRenderingContext &&
          Bn.warn("WebGL1 is not supported", e)(),
        !1)
      );
    }
    async attach(e, t = {}) {
      const { WebGLDevice: r } = await $c(
        async () => {
          const { WebGLDevice: e } = await Promise.resolve().then(() => Iu);
          return { WebGLDevice: e };
        },
        void 0,
        import.meta.url,
      );
      if (e instanceof r) return e;
      const n = r.getDeviceFromContext(e);
      if (n) return n;
      if (
        !(function (e) {
          return (
            ("undefined" != typeof WebGL2RenderingContext &&
              e instanceof WebGL2RenderingContext) ||
            Boolean(e && "function" == typeof e.createVertexArray)
          );
        })(e)
      )
        throw new Error("Invalid WebGL2RenderingContext");
      const i = !0 === t.createCanvasContext ? {} : t.createCanvasContext;
      return new r({
        ...t,
        _handle: e,
        createCanvasContext: { canvas: e.canvas, autoResize: !1, ...i },
      });
    }
    async create(e = {}) {
      const { WebGLDevice: t } = await $c(
          async () => {
            const { WebGLDevice: e } = await Promise.resolve().then(() => Iu);
            return { WebGLDevice: e };
          },
          void 0,
          import.meta.url,
        ),
        r = [];
      ((e.debugWebGL || e.debug) &&
        r.push(
          (async function () {
            c() &&
              !globalThis.WebGLDebugUtils &&
              ((globalThis.global = globalThis.global || globalThis),
              (globalThis.global.module = {}),
              await xc("https://unpkg.com/webgl-debug@2.0.1/index.js"));
          })(),
        ),
        e.debugSpectorJS &&
          r.push(
            (async function (e) {
              if (!globalThis.SPECTOR)
                try {
                  await xc(e.debugSpectorJSUrl || Bc.debugSpectorJSUrl);
                } catch (t) {
                  Bn.warn(String(t));
                }
            })(e),
          ));
      const n = await Promise.allSettled(r);
      for (const i of n)
        "rejected" === i.status &&
          Bn.error(`Failed to initialize debug libraries ${i.reason}`)();
      try {
        const r = new t(e);
        Bn.groupCollapsed(1, `WebGLDevice ${r.id} created`)();
        const n = `${r._reused ? "Reusing" : "Created"} device with WebGL2 ${r.props.debug ? "debug " : ""}context: ${r.info.vendor}, ${r.info.renderer} for canvas: ${r.canvasContext.id}`;
        return (Bn.probe(1, n)(), Bn.table(1, r.info)(), r);
      } finally {
        (Bn.groupEnd(1)(),
          Bn.info(
            1,
            "%cWebGL call tracing: luma.log.set('debug-webgl') ",
            "color: white; background: blue; padding: 2px 6px; border-radius: 3px;",
          )());
      }
    }
  })(),
  Vc = {
    3042: !1,
    32773: new Float32Array([0, 0, 0, 0]),
    32777: 32774,
    34877: 32774,
    32969: 1,
    32968: 0,
    32971: 1,
    32970: 0,
    3106: new Float32Array([0, 0, 0, 0]),
    3107: [!0, !0, !0, !0],
    2884: !1,
    2885: 1029,
    2929: !1,
    2931: 1,
    2932: 513,
    2928: new Float32Array([0, 1]),
    2930: !0,
    3024: !0,
    35725: null,
    36006: null,
    36007: null,
    34229: null,
    34964: null,
    2886: 2305,
    33170: 4352,
    2849: 1,
    32823: !1,
    32824: 0,
    10752: 0,
    32926: !1,
    32928: !1,
    32938: 1,
    32939: !1,
    3089: !1,
    3088: new Int32Array([0, 0, 1024, 1024]),
    2960: !1,
    2961: 0,
    2968: 4294967295,
    36005: 4294967295,
    2962: 519,
    2967: 0,
    2963: 4294967295,
    34816: 519,
    36003: 0,
    36004: 4294967295,
    2964: 7680,
    2965: 7680,
    2966: 7680,
    34817: 7680,
    34818: 7680,
    34819: 7680,
    2978: [0, 0, 1024, 1024],
    36389: null,
    36662: null,
    36663: null,
    35053: null,
    35055: null,
    35723: 4352,
    36010: null,
    35977: !1,
    3333: 4,
    3317: 4,
    37440: !1,
    37441: !1,
    37443: 37444,
    3330: 0,
    3332: 0,
    3331: 0,
    3314: 0,
    32878: 0,
    3316: 0,
    3315: 0,
    32877: 0,
  },
  zc = (e, t, r) => (t ? e.enable(r) : e.disable(r)),
  Xc = (e, t, r) => e.hint(r, t),
  jc = (e, t, r) => e.pixelStorei(r, t),
  Kc = (e, t, r) => {
    const n = 36006 === r ? 36009 : 36008;
    return e.bindFramebuffer(n, t);
  },
  Yc = (e, t, r) => {
    const n = {
      34964: 34962,
      36662: 36662,
      36663: 36663,
      35053: 35051,
      35055: 35052,
    }[r];
    e.bindBuffer(n, t);
  };
function Qc(e) {
  return (
    Array.isArray(e) || (ArrayBuffer.isView(e) && !(e instanceof DataView))
  );
}
var qc = {
  3042: zc,
  32773: (e, t) => e.blendColor(...t),
  32777: "blendEquation",
  34877: "blendEquation",
  32969: "blendFunc",
  32968: "blendFunc",
  32971: "blendFunc",
  32970: "blendFunc",
  3106: (e, t) => e.clearColor(...t),
  3107: (e, t) => e.colorMask(...t),
  2884: zc,
  2885: (e, t) => e.cullFace(t),
  2929: zc,
  2931: (e, t) => e.clearDepth(t),
  2932: (e, t) => e.depthFunc(t),
  2928: (e, t) => e.depthRange(...t),
  2930: (e, t) => e.depthMask(t),
  3024: zc,
  35723: Xc,
  35725: (e, t) => e.useProgram(t),
  36007: (e, t) => e.bindRenderbuffer(36161, t),
  36389: (e, t) => e.bindTransformFeedback?.(36386, t),
  34229: (e, t) => e.bindVertexArray(t),
  36006: Kc,
  36010: Kc,
  34964: Yc,
  36662: Yc,
  36663: Yc,
  35053: Yc,
  35055: Yc,
  2886: (e, t) => e.frontFace(t),
  33170: Xc,
  2849: (e, t) => e.lineWidth(t),
  32823: zc,
  32824: "polygonOffset",
  10752: "polygonOffset",
  35977: zc,
  32926: zc,
  32928: zc,
  32938: "sampleCoverage",
  32939: "sampleCoverage",
  3089: zc,
  3088: (e, t) => e.scissor(...t),
  2960: zc,
  2961: (e, t) => e.clearStencil(t),
  2968: (e, t) => e.stencilMaskSeparate(1028, t),
  36005: (e, t) => e.stencilMaskSeparate(1029, t),
  2962: "stencilFuncFront",
  2967: "stencilFuncFront",
  2963: "stencilFuncFront",
  34816: "stencilFuncBack",
  36003: "stencilFuncBack",
  36004: "stencilFuncBack",
  2964: "stencilOpFront",
  2965: "stencilOpFront",
  2966: "stencilOpFront",
  34817: "stencilOpBack",
  34818: "stencilOpBack",
  34819: "stencilOpBack",
  2978: (e, t) => e.viewport(...t),
  34383: zc,
  10754: zc,
  12288: zc,
  12289: zc,
  12290: zc,
  12291: zc,
  12292: zc,
  12293: zc,
  12294: zc,
  12295: zc,
  3333: jc,
  3317: jc,
  37440: jc,
  37441: jc,
  37443: jc,
  3330: jc,
  3332: jc,
  3331: jc,
  3314: jc,
  32878: jc,
  3316: jc,
  3315: jc,
  32877: jc,
  framebuffer: (e, t) => {
    const r = t && "handle" in t ? t.handle : t;
    return e.bindFramebuffer(36160, r);
  },
  blend: (e, t) => (t ? e.enable(3042) : e.disable(3042)),
  blendColor: (e, t) => e.blendColor(...t),
  blendEquation: (e, t) => {
    const r = "number" == typeof t ? [t, t] : t;
    e.blendEquationSeparate(...r);
  },
  blendFunc: (e, t) => {
    const r = 2 === t?.length ? [...t, ...t] : t;
    e.blendFuncSeparate(...r);
  },
  clearColor: (e, t) => e.clearColor(...t),
  clearDepth: (e, t) => e.clearDepth(t),
  clearStencil: (e, t) => e.clearStencil(t),
  colorMask: (e, t) => e.colorMask(...t),
  cull: (e, t) => (t ? e.enable(2884) : e.disable(2884)),
  cullFace: (e, t) => e.cullFace(t),
  depthTest: (e, t) => (t ? e.enable(2929) : e.disable(2929)),
  depthFunc: (e, t) => e.depthFunc(t),
  depthMask: (e, t) => e.depthMask(t),
  depthRange: (e, t) => e.depthRange(...t),
  dither: (e, t) => (t ? e.enable(3024) : e.disable(3024)),
  derivativeHint: (e, t) => {
    e.hint(35723, t);
  },
  frontFace: (e, t) => e.frontFace(t),
  mipmapHint: (e, t) => e.hint(33170, t),
  lineWidth: (e, t) => e.lineWidth(t),
  polygonOffsetFill: (e, t) => (t ? e.enable(32823) : e.disable(32823)),
  polygonOffset: (e, t) => e.polygonOffset(...t),
  sampleCoverage: (e, t) => e.sampleCoverage(t[0], t[1] || !1),
  scissorTest: (e, t) => (t ? e.enable(3089) : e.disable(3089)),
  scissor: (e, t) => e.scissor(...t),
  stencilTest: (e, t) => (t ? e.enable(2960) : e.disable(2960)),
  stencilMask: (e, t) => {
    t = Qc(t) ? t : [t, t];
    const [r, n] = t;
    (e.stencilMaskSeparate(1028, r), e.stencilMaskSeparate(1029, n));
  },
  stencilFunc: (e, t) => {
    t = Qc(t) && 3 === t.length ? [...t, ...t] : t;
    const [r, n, i, s, o, a] = t;
    (e.stencilFuncSeparate(1028, r, n, i),
      e.stencilFuncSeparate(1029, s, o, a));
  },
  stencilOp: (e, t) => {
    t = Qc(t) && 3 === t.length ? [...t, ...t] : t;
    const [r, n, i, s, o, a] = t;
    (e.stencilOpSeparate(1028, r, n, i), e.stencilOpSeparate(1029, s, o, a));
  },
  viewport: (e, t) => e.viewport(...t),
};
function Zc(e, t, r) {
  return void 0 !== t[e] ? t[e] : r[e];
}
var Jc = {
    blendEquation: (e, t, r) =>
      e.blendEquationSeparate(Zc(32777, t, r), Zc(34877, t, r)),
    blendFunc: (e, t, r) =>
      e.blendFuncSeparate(
        Zc(32969, t, r),
        Zc(32968, t, r),
        Zc(32971, t, r),
        Zc(32970, t, r),
      ),
    polygonOffset: (e, t, r) =>
      e.polygonOffset(Zc(32824, t, r), Zc(10752, t, r)),
    sampleCoverage: (e, t, r) =>
      e.sampleCoverage(Zc(32938, t, r), Zc(32939, t, r)),
    stencilFuncFront: (e, t, r) =>
      e.stencilFuncSeparate(
        1028,
        Zc(2962, t, r),
        Zc(2967, t, r),
        Zc(2963, t, r),
      ),
    stencilFuncBack: (e, t, r) =>
      e.stencilFuncSeparate(
        1029,
        Zc(34816, t, r),
        Zc(36003, t, r),
        Zc(36004, t, r),
      ),
    stencilOpFront: (e, t, r) =>
      e.stencilOpSeparate(1028, Zc(2964, t, r), Zc(2965, t, r), Zc(2966, t, r)),
    stencilOpBack: (e, t, r) =>
      e.stencilOpSeparate(
        1029,
        Zc(34817, t, r),
        Zc(34818, t, r),
        Zc(34819, t, r),
      ),
  },
  el = {
    enable: (e, t) => e({ [t]: !0 }),
    disable: (e, t) => e({ [t]: !1 }),
    pixelStorei: (e, t, r) => e({ [t]: r }),
    hint: (e, t, r) => e({ [t]: r }),
    useProgram: (e, t) => e({ 35725: t }),
    bindRenderbuffer: (e, t, r) => e({ 36007: r }),
    bindTransformFeedback: (e, t, r) => e({ 36389: r }),
    bindVertexArray: (e, t) => e({ 34229: t }),
    bindFramebuffer: (e, t, r) => {
      switch (t) {
        case 36160:
          return e({ 36006: r, 36010: r });
        case 36009:
          return e({ 36006: r });
        case 36008:
          return e({ 36010: r });
        default:
          return null;
      }
    },
    bindBuffer: (e, t, r) => {
      const n = {
        34962: [34964],
        36662: [36662],
        36663: [36663],
        35051: [35053],
        35052: [35055],
      }[t];
      return n ? e({ [n]: r }) : { valueChanged: !0 };
    },
    blendColor: (e, t, r, n, i) => e({ 32773: new Float32Array([t, r, n, i]) }),
    blendEquation: (e, t) => e({ 32777: t, 34877: t }),
    blendEquationSeparate: (e, t, r) => e({ 32777: t, 34877: r }),
    blendFunc: (e, t, r) => e({ 32969: t, 32968: r, 32971: t, 32970: r }),
    blendFuncSeparate: (e, t, r, n, i) =>
      e({ 32969: t, 32968: r, 32971: n, 32970: i }),
    clearColor: (e, t, r, n, i) => e({ 3106: new Float32Array([t, r, n, i]) }),
    clearDepth: (e, t) => e({ 2931: t }),
    clearStencil: (e, t) => e({ 2961: t }),
    colorMask: (e, t, r, n, i) => e({ 3107: [t, r, n, i] }),
    cullFace: (e, t) => e({ 2885: t }),
    depthFunc: (e, t) => e({ 2932: t }),
    depthRange: (e, t, r) => e({ 2928: new Float32Array([t, r]) }),
    depthMask: (e, t) => e({ 2930: t }),
    frontFace: (e, t) => e({ 2886: t }),
    lineWidth: (e, t) => e({ 2849: t }),
    polygonOffset: (e, t, r) => e({ 32824: t, 10752: r }),
    sampleCoverage: (e, t, r) => e({ 32938: t, 32939: r }),
    scissor: (e, t, r, n, i) => e({ 3088: new Int32Array([t, r, n, i]) }),
    stencilMask: (e, t) => e({ 2968: t, 36005: t }),
    stencilMaskSeparate: (e, t, r) => e({ [1028 === t ? 2968 : 36005]: r }),
    stencilFunc: (e, t, r, n) =>
      e({ 2962: t, 2967: r, 2963: n, 34816: t, 36003: r, 36004: n }),
    stencilFuncSeparate: (e, t, r, n, i) =>
      e({
        [1028 === t ? 2962 : 34816]: r,
        [1028 === t ? 2967 : 36003]: n,
        [1028 === t ? 2963 : 36004]: i,
      }),
    stencilOp: (e, t, r, n) =>
      e({ 2964: t, 2965: r, 2966: n, 34817: t, 34818: r, 34819: n }),
    stencilOpSeparate: (e, t, r, n, i) =>
      e({
        [1028 === t ? 2964 : 34817]: r,
        [1028 === t ? 2965 : 34818]: n,
        [1028 === t ? 2966 : 34819]: i,
      }),
    viewport: (e, t, r, n, i) => e({ 2978: [t, r, n, i] }),
  },
  tl = (e, t) => e.isEnabled(t),
  rl = {
    3042: tl,
    2884: tl,
    2929: tl,
    3024: tl,
    32823: tl,
    32926: tl,
    32928: tl,
    3089: tl,
    2960: tl,
    35977: tl,
  },
  nl = new Set([
    34016, 36388, 36387, 35983, 35368, 34965, 35739, 35738, 3074, 34853, 34854,
    34855, 34856, 34857, 34858, 34859, 34860, 34861, 34862, 34863, 34864, 34865,
    34866, 34867, 34868, 35097, 32873, 35869, 32874, 34068,
  ]);
function il(e, t) {
  if (
    (function (e) {
      for (const t in e) return !1;
      return !0;
    })(t)
  )
    return;
  const r = {};
  for (const i in t) {
    const n = Number(i),
      s = qc[i];
    s && ("string" == typeof s ? (r[s] = !0) : s(e, t[i], n));
  }
  const n = e.lumaState?.cache;
  if (n) for (const i in r) (0, Jc[i])(e, t, n);
}
function sl(e, t = Vc) {
  if ("number" == typeof t) {
    const r = t,
      n = rl[r];
    return n ? n(e, r) : e.getParameter(r);
  }
  const r = Array.isArray(t) ? t : Object.keys(t),
    n = {};
  for (const i of r) {
    const t = rl[i];
    n[i] = t ? t(e, Number(i)) : e.getParameter(Number(i));
  }
  return n;
}
function ol(e, t) {
  if (e === t) return !0;
  if (al(e) && al(t) && e.length === t.length) {
    for (let r = 0; r < e.length; ++r) if (e[r] !== t[r]) return !1;
    return !0;
  }
  return !1;
}
function al(e) {
  return Array.isArray(e) || ArrayBuffer.isView(e);
}
var cl = class {
  static get(e) {
    return e.lumaState;
  }
  gl;
  program = null;
  stateStack = [];
  enable = !0;
  cache = null;
  log;
  initialized = !1;
  constructor(e, t) {
    ((this.gl = e),
      (this.log = t?.log || (() => {})),
      (this._updateCache = this._updateCache.bind(this)),
      Object.seal(this));
  }
  push(e = {}) {
    this.stateStack.push({});
  }
  pop() {
    const e = this.stateStack[this.stateStack.length - 1];
    (il(this.gl, e), this.stateStack.pop());
  }
  trackState(e, t) {
    if (
      ((this.cache = t?.copyState ? sl(e) : Object.assign({}, Vc)),
      this.initialized)
    )
      throw new Error("WebGLStateTracker");
    ((this.initialized = !0),
      (this.gl.lumaState = this),
      (function (e) {
        const t = e.useProgram.bind(e);
        e.useProgram = function (r) {
          const n = cl.get(e);
          n.program !== r && (t(r), (n.program = r));
        };
      })(e));
    for (const r in el) ul(e, r, el[r]);
    (ll(e, "getParameter"), ll(e, "isEnabled"));
  }
  _updateCache(e) {
    let t,
      r = !1;
    const n =
      this.stateStack.length > 0
        ? this.stateStack[this.stateStack.length - 1]
        : null;
    for (const i in e) {
      const s = e[i],
        o = this.cache[i];
      ol(s, o) ||
        ((r = !0), (t = o), n && !(i in n) && (n[i] = o), (this.cache[i] = s));
    }
    return { valueChanged: r, oldValue: t };
  }
};
function ll(e, t) {
  const r = e[t].bind(e);
  ((e[t] = function (t) {
    if (void 0 === t || nl.has(t)) return r(t);
    const n = cl.get(e);
    return (t in n.cache || (n.cache[t] = r(t)), n.enable ? n.cache[t] : r(t));
  }),
    Object.defineProperty(e[t], "name", {
      value: `${t}-from-cache`,
      configurable: !1,
    }));
}
function ul(e, t, r) {
  if (!e[t]) return;
  const n = e[t].bind(e);
  ((e[t] = function (...t) {
    const { valueChanged: i, oldValue: s } = r(cl.get(e)._updateCache, ...t);
    return (i && n(...t), s);
  }),
    Object.defineProperty(e[t], "name", {
      value: `${t}-to-cache`,
      configurable: !1,
    }));
}
function hl(e, t, r) {
  return (void 0 === r[t] && (r[t] = e.getExtension(t) || null), r[t]);
}
function dl(e, t) {
  return /NVIDIA/i.exec(e) || /NVIDIA/i.exec(t)
    ? "nvidia"
    : /INTEL/i.exec(e) || /INTEL/i.exec(t)
      ? "intel"
      : /Apple/i.exec(e) || /Apple/i.exec(t)
        ? "apple"
        : /AMD/i.exec(e) || /AMD/i.exec(t) || /ATI/i.exec(e) || /ATI/i.exec(t)
          ? "amd"
          : /SwiftShader/i.exec(e) || /SwiftShader/i.exec(t)
            ? "software"
            : "unknown";
}
function fl(e, t) {
  if (/SwiftShader/i.exec(e) || /SwiftShader/i.exec(t)) return "cpu";
  switch (dl(e, t)) {
    case "apple":
      return (function (e, t) {
        return /Apple (M\d|A\d|GPU)/i.test(`${e} ${t}`);
      })(e, t)
        ? "integrated"
        : "unknown";
    case "intel":
      return "integrated";
    case "software":
      return "cpu";
    case "unknown":
      return "unknown";
    default:
      return "discrete";
  }
}
function pl(e) {
  switch (e) {
    case "uint8":
    case "unorm8":
      return 5121;
    case "sint8":
    case "snorm8":
      return 5120;
    case "uint16":
    case "unorm16":
      return 5123;
    case "sint16":
    case "snorm16":
      return 5122;
    case "uint32":
      return 5125;
    case "sint32":
      return 5124;
    case "float16":
      return 5131;
    case "float32":
      return 5126;
  }
  throw new Error(String(e));
}
var gl = "WEBGL_compressed_texture_s3tc",
  ml = "WEBGL_compressed_texture_s3tc_srgb",
  _l = "EXT_texture_compression_rgtc",
  El = "EXT_texture_compression_bptc",
  bl = "EXT_render_snorm",
  yl = "EXT_color_buffer_float",
  Tl = "snorm8-renderable-webgl",
  Al = "norm16-renderable-webgl",
  Rl = "snorm16-renderable-webgl",
  vl = "float16-renderable-webgl",
  Sl = "float32-renderable-webgl",
  Cl = {
    "float32-renderable-webgl": { extensions: [yl] },
    "float16-renderable-webgl": { extensions: ["EXT_color_buffer_half_float"] },
    "rgb9e5ufloat-renderable-webgl": {
      extensions: ["WEBGL_render_shared_exponent"],
    },
    "snorm8-renderable-webgl": { extensions: [bl] },
    "norm16-webgl": { extensions: ["EXT_texture_norm16"] },
    "norm16-renderable-webgl": { features: ["norm16-webgl"] },
    "snorm16-renderable-webgl": {
      features: ["norm16-webgl"],
      extensions: [bl],
    },
    "float32-filterable": { extensions: ["OES_texture_float_linear"] },
    "float16-filterable-webgl": {
      extensions: ["OES_texture_half_float_linear"],
    },
    "texture-filterable-anisotropic-webgl": {
      extensions: ["EXT_texture_filter_anisotropic"],
    },
    "texture-blend-float-webgl": { extensions: ["EXT_float_blend"] },
    "texture-compression-bc": { extensions: [gl, ml, _l, El] },
    "texture-compression-bc5-webgl": { extensions: [_l] },
    "texture-compression-bc7-webgl": { extensions: [El] },
    "texture-compression-etc2": {
      extensions: ["WEBGL_compressed_texture_etc"],
    },
    "texture-compression-astc": {
      extensions: ["WEBGL_compressed_texture_astc"],
    },
    "texture-compression-etc1-webgl": {
      extensions: ["WEBGL_compressed_texture_etc1"],
    },
    "texture-compression-pvrtc-webgl": {
      extensions: ["WEBGL_compressed_texture_pvrtc"],
    },
    "texture-compression-atc-webgl": {
      extensions: ["WEBGL_compressed_texture_atc"],
    },
  };
function wl(e, t, r) {
  return Ll(e, t, r, new Set());
}
function Ll(e, t, r, n) {
  const i = Cl[t];
  if (!i) return !1;
  if (n.has(t)) return !1;
  n.add(t);
  const s = (i.features || []).every((t) => Ll(e, t, r, n));
  return (
    n.delete(t),
    !!s && (i.extensions || []).every((t) => Boolean(hl(e, t, r)))
  );
}
var Ol = {
  r8unorm: { gl: 33321, rb: !0 },
  r8snorm: { gl: 36756, r: Tl },
  r8uint: { gl: 33330, rb: !0 },
  r8sint: { gl: 33329, rb: !0 },
  rg8unorm: { gl: 33323, rb: !0 },
  rg8snorm: { gl: 36757, r: Tl },
  rg8uint: { gl: 33336, rb: !0 },
  rg8sint: { gl: 33335, rb: !0 },
  r16uint: { gl: 33332, rb: !0 },
  r16sint: { gl: 33331, rb: !0 },
  r16float: { gl: 33325, rb: !0, r: vl },
  r16unorm: { gl: 33322, rb: !0, r: Al },
  r16snorm: { gl: 36760, r: Rl },
  "rgba4unorm-webgl": { gl: 32854, rb: !0 },
  "rgb565unorm-webgl": { gl: 36194, rb: !0 },
  "rgb5a1unorm-webgl": { gl: 32855, rb: !0 },
  "rgb8unorm-webgl": { gl: 32849 },
  "rgb8snorm-webgl": { gl: 36758 },
  rgba8unorm: { gl: 32856 },
  "rgba8unorm-srgb": { gl: 35907 },
  rgba8snorm: { gl: 36759, r: Tl },
  rgba8uint: { gl: 36220 },
  rgba8sint: { gl: 36238 },
  bgra8unorm: {},
  "bgra8unorm-srgb": {},
  rg16uint: { gl: 33338 },
  rg16sint: { gl: 33337 },
  rg16float: { gl: 33327, rb: !0, r: vl },
  rg16unorm: { gl: 33324, r: Al },
  rg16snorm: { gl: 36761, r: Rl },
  r32uint: { gl: 33334, rb: !0 },
  r32sint: { gl: 33333, rb: !0 },
  r32float: { gl: 33326, r: Sl },
  rgb9e5ufloat: { gl: 35901, r: "rgb9e5ufloat-renderable-webgl" },
  rg11b10ufloat: { gl: 35898, rb: !0 },
  rgb10a2unorm: { gl: 32857, rb: !0 },
  rgb10a2uint: { gl: 36975, rb: !0 },
  "rgb16unorm-webgl": { gl: 32852, r: !1 },
  "rgb16snorm-webgl": { gl: 36762, r: !1 },
  rg32uint: { gl: 33340, rb: !0 },
  rg32sint: { gl: 33339, rb: !0 },
  rg32float: { gl: 33328, rb: !0, r: Sl },
  rgba16uint: { gl: 36214, rb: !0 },
  rgba16sint: { gl: 36232, rb: !0 },
  rgba16float: { gl: 34842, r: vl },
  rgba16unorm: { gl: 32859, rb: !0, r: Al },
  rgba16snorm: { gl: 36763, r: Rl },
  "rgb32float-webgl": {
    gl: 34837,
    x: yl,
    r: Sl,
    dataFormat: 6407,
    types: [5126],
  },
  rgba32uint: { gl: 36208, rb: !0 },
  rgba32sint: { gl: 36226, rb: !0 },
  rgba32float: { gl: 34836, rb: !0, r: Sl },
  stencil8: { gl: 36168, rb: !0 },
  depth16unorm: { gl: 33189, dataFormat: 6402, types: [5123], rb: !0 },
  depth24plus: { gl: 33190, dataFormat: 6402, types: [5125] },
  depth32float: { gl: 36012, dataFormat: 6402, types: [5126], rb: !0 },
  "depth24plus-stencil8": {
    gl: 35056,
    rb: !0,
    depthTexture: !0,
    dataFormat: 34041,
    types: [34042],
  },
  "depth32float-stencil8": {
    gl: 36013,
    dataFormat: 34041,
    types: [36269],
    rb: !0,
  },
  "bc1-rgb-unorm-webgl": { gl: 33776, x: gl },
  "bc1-rgb-unorm-srgb-webgl": { gl: 35916, x: ml },
  "bc1-rgba-unorm": { gl: 33777, x: gl },
  "bc1-rgba-unorm-srgb": { gl: 35916, x: ml },
  "bc2-rgba-unorm": { gl: 33778, x: gl },
  "bc2-rgba-unorm-srgb": { gl: 35918, x: ml },
  "bc3-rgba-unorm": { gl: 33779, x: gl },
  "bc3-rgba-unorm-srgb": { gl: 35919, x: ml },
  "bc4-r-unorm": { gl: 36283, x: _l },
  "bc4-r-snorm": { gl: 36284, x: _l },
  "bc5-rg-unorm": { gl: 36285, x: _l },
  "bc5-rg-snorm": { gl: 36286, x: _l },
  "bc6h-rgb-ufloat": { gl: 36495, x: El },
  "bc6h-rgb-float": { gl: 36494, x: El },
  "bc7-rgba-unorm": { gl: 36492, x: El },
  "bc7-rgba-unorm-srgb": { gl: 36493, x: El },
  "etc2-rgb8unorm": { gl: 37492 },
  "etc2-rgb8unorm-srgb": { gl: 37494 },
  "etc2-rgb8a1unorm": { gl: 37496 },
  "etc2-rgb8a1unorm-srgb": { gl: 37497 },
  "etc2-rgba8unorm": { gl: 37493 },
  "etc2-rgba8unorm-srgb": { gl: 37495 },
  "eac-r11unorm": { gl: 37488 },
  "eac-r11snorm": { gl: 37489 },
  "eac-rg11unorm": { gl: 37490 },
  "eac-rg11snorm": { gl: 37491 },
  "astc-4x4-unorm": { gl: 37808 },
  "astc-4x4-unorm-srgb": { gl: 37840 },
  "astc-5x4-unorm": { gl: 37809 },
  "astc-5x4-unorm-srgb": { gl: 37841 },
  "astc-5x5-unorm": { gl: 37810 },
  "astc-5x5-unorm-srgb": { gl: 37842 },
  "astc-6x5-unorm": { gl: 37811 },
  "astc-6x5-unorm-srgb": { gl: 37843 },
  "astc-6x6-unorm": { gl: 37812 },
  "astc-6x6-unorm-srgb": { gl: 37844 },
  "astc-8x5-unorm": { gl: 37813 },
  "astc-8x5-unorm-srgb": { gl: 37845 },
  "astc-8x6-unorm": { gl: 37814 },
  "astc-8x6-unorm-srgb": { gl: 37846 },
  "astc-8x8-unorm": { gl: 37815 },
  "astc-8x8-unorm-srgb": { gl: 37847 },
  "astc-10x5-unorm": { gl: 37816 },
  "astc-10x5-unorm-srgb": { gl: 37848 },
  "astc-10x6-unorm": { gl: 37817 },
  "astc-10x6-unorm-srgb": { gl: 37849 },
  "astc-10x8-unorm": { gl: 37818 },
  "astc-10x8-unorm-srgb": { gl: 37850 },
  "astc-10x10-unorm": { gl: 37819 },
  "astc-10x10-unorm-srgb": { gl: 37851 },
  "astc-12x10-unorm": { gl: 37820 },
  "astc-12x10-unorm-srgb": { gl: 37852 },
  "astc-12x12-unorm": { gl: 37821 },
  "astc-12x12-unorm-srgb": { gl: 37853 },
  "pvrtc-rgb4unorm-webgl": { gl: 35840 },
  "pvrtc-rgba4unorm-webgl": { gl: 35842 },
  "pvrtc-rgb2unorm-webgl": { gl: 35841 },
  "pvrtc-rgba2unorm-webgl": { gl: 35843 },
  "etc1-rbg-unorm-webgl": { gl: 36196 },
  "atc-rgb-unorm-webgl": { gl: 35986 },
  "atc-rgba-unorm-webgl": { gl: 35986 },
  "atc-rgbai-unorm-webgl": { gl: 34798 },
};
function Nl(e) {
  const t = Ol[e],
    r = (function (e) {
      const t = Ol[e]?.gl;
      if (void 0 === t) throw new Error(`Unsupported texture format ${e}`);
      return t;
    })(e),
    n = yi.getInfo(e);
  return (
    n.compressed && (t.dataFormat = r),
    {
      internalFormat: r,
      format: t?.dataFormat || xl(n.channels, n.integer, n.normalized, r),
      type: n.dataType ? pl(n.dataType) : t?.types?.[0] || 5121,
      compressed: n.compressed || !1,
    }
  );
}
function xl(e, t, r, n) {
  if (6408 === n || 6407 === n) return n;
  switch (e) {
    case "r":
      return t && !r ? 36244 : 6403;
    case "rg":
      return t && !r ? 33320 : 33319;
    case "rgb":
      return t && !r ? 36248 : 6407;
    case "rgba":
      return t && !r ? 36249 : 6408;
    case "bgra":
      throw new Error("bgra pixels not supported by WebGL");
    default:
      return 6408;
  }
}
var Pl = {
    "depth-clip-control": "EXT_depth_clamp",
    "timestamp-query": "EXT_disjoint_timer_query_webgl2",
    "compilation-status-async-webgl": "KHR_parallel_shader_compile",
    "polygon-mode-webgl": "WEBGL_polygon_mode",
    "provoking-vertex-webgl": "WEBGL_provoking_vertex",
    "shader-clip-cull-distance-webgl": "WEBGL_clip_cull_distance",
    "shader-noperspective-interpolation-webgl":
      "NV_shader_noperspective_interpolation",
    "shader-conservative-depth-webgl": "EXT_conservative_depth",
  },
  Il = class extends Ci {
    gl;
    extensions;
    testedFeatures = new Set();
    constructor(e, t, r) {
      (super([], r),
        (this.gl = e),
        (this.extensions = t),
        hl(e, "EXT_color_buffer_float", t));
    }
    *[Symbol.iterator]() {
      const e = this.getFeatures();
      for (const t of e) this.has(t) && (yield t);
      return [];
    }
    has(e) {
      return (
        !this.disabledFeatures?.[e] &&
        (this.testedFeatures.has(e) ||
          (this.testedFeatures.add(e),
          (function (e) {
            return e in Cl;
          })(e) &&
            wl(this.gl, e, this.extensions) &&
            this.features.add(e),
          this.getWebGLFeature(e) && this.features.add(e)),
        this.features.has(e))
      );
    }
    initializeFeatures() {
      const e = this.getFeatures().filter((e) => "polygon-mode-webgl" !== e);
      for (const t of e) this.has(t);
    }
    getFeatures() {
      return [...Object.keys(Pl), ...Object.keys(Cl)];
    }
    getWebGLFeature(e) {
      const t = Pl[e];
      return "string" == typeof t
        ? Boolean(hl(this.gl, t, this.extensions))
        : Boolean(t);
    }
  },
  Ml = class extends vi {
    get maxTextureDimension1D() {
      return 0;
    }
    get maxTextureDimension2D() {
      return this.getParameter(3379);
    }
    get maxTextureDimension3D() {
      return this.getParameter(32883);
    }
    get maxTextureArrayLayers() {
      return this.getParameter(35071);
    }
    get maxBindGroups() {
      return 0;
    }
    get maxDynamicUniformBuffersPerPipelineLayout() {
      return 0;
    }
    get maxDynamicStorageBuffersPerPipelineLayout() {
      return 0;
    }
    get maxSampledTexturesPerShaderStage() {
      return this.getParameter(35660);
    }
    get maxSamplersPerShaderStage() {
      return this.getParameter(35661);
    }
    get maxStorageBuffersPerShaderStage() {
      return 0;
    }
    get maxStorageTexturesPerShaderStage() {
      return 0;
    }
    get maxUniformBuffersPerShaderStage() {
      return this.getParameter(35375);
    }
    get maxUniformBufferBindingSize() {
      return this.getParameter(35376);
    }
    get maxStorageBufferBindingSize() {
      return 0;
    }
    get minUniformBufferOffsetAlignment() {
      return this.getParameter(35380);
    }
    get minStorageBufferOffsetAlignment() {
      return 0;
    }
    get maxVertexBuffers() {
      return 16;
    }
    get maxVertexAttributes() {
      return this.getParameter(34921);
    }
    get maxVertexBufferArrayStride() {
      return 2048;
    }
    get maxInterStageShaderVariables() {
      return this.getParameter(35659);
    }
    get maxComputeWorkgroupStorageSize() {
      return 0;
    }
    get maxComputeInvocationsPerWorkgroup() {
      return 0;
    }
    get maxComputeWorkgroupSizeX() {
      return 0;
    }
    get maxComputeWorkgroupSizeY() {
      return 0;
    }
    get maxComputeWorkgroupSizeZ() {
      return 0;
    }
    get maxComputeWorkgroupsPerDimension() {
      return 0;
    }
    gl;
    limits = {};
    constructor(e) {
      (super(), (this.gl = e));
    }
    getParameter(e) {
      return (
        void 0 === this.limits[e] && (this.limits[e] = this.gl.getParameter(e)),
        this.limits[e] || 0
      );
    }
  },
  Bl = class extends Ji {
    device;
    gl;
    handle;
    colorAttachments = [];
    depthStencilAttachment = null;
    constructor(e, t) {
      super(e, t);
      const r = null === t.handle;
      ((this.device = e),
        (this.gl = e.gl),
        (this.handle =
          this.props.handle || r
            ? this.props.handle
            : this.gl.createFramebuffer()),
        r ||
          (e._setWebGLDebugMetadata(this.handle, this, { spector: this.props }),
          t.handle ||
            (this.autoCreateAttachmentTextures(), this.updateAttachments())));
    }
    destroy() {
      (super.destroy(),
        this.destroyed ||
          null === this.handle ||
          this.props.handle ||
          this.gl.deleteFramebuffer(this.handle));
    }
    updateAttachments() {
      const e = this.gl.bindFramebuffer(36160, this.handle);
      for (let t = 0; t < this.colorAttachments.length; ++t) {
        const e = this.colorAttachments[t];
        if (e) {
          const r = 36064 + t;
          this._attachTextureView(r, e);
        }
      }
      if (this.depthStencilAttachment) {
        const e = (function (e) {
          switch (yi.getInfo(e).attachment) {
            case "depth":
              return 36096;
            case "stencil":
              return 36128;
            case "depth-stencil":
              return 33306;
            default:
              throw new Error(`Not a depth stencil format: ${e}`);
          }
        })(this.depthStencilAttachment.props.format);
        this._attachTextureView(e, this.depthStencilAttachment);
      }
      if (this.device.props.debug) {
        const e = this.gl.checkFramebufferStatus(36160);
        if (36053 !== e)
          throw new Error(
            `Framebuffer ${(function (e) {
              switch (e) {
                case 36053:
                  return "success";
                case 36054:
                  return "Mismatched attachments";
                case 36055:
                  return "No attachments";
                case 36057:
                  return "Height/width mismatch";
                case 36061:
                  return "Unsupported or split attachments";
                case 36182:
                  return "Samples mismatch";
                default:
                  return `${e}`;
              }
            })(e)}`,
          );
      }
      this.gl.bindFramebuffer(36160, e);
    }
    _attachTextureView(e, t) {
      const { gl: r } = this.device,
        { texture: n } = t,
        i = t.props.baseMipLevel,
        s = t.props.baseArrayLayer;
      switch ((r.bindTexture(n.glTarget, n.handle), n.glTarget)) {
        case 35866:
        case 32879:
          r.framebufferTextureLayer(36160, e, n.handle, i, s);
          break;
        case 34067:
          const t = (function (e) {
            return e < 34069 ? e + 34069 : e;
          })(s);
          r.framebufferTexture2D(36160, e, t, n.handle, i);
          break;
        case 3553:
          r.framebufferTexture2D(36160, e, 3553, n.handle, i);
          break;
        default:
          throw new Error("Illegal texture type");
      }
      r.bindTexture(n.glTarget, null);
    }
    resizeAttachments(e, t) {
      if (null === this.handle)
        return ((this.width = e), void (this.height = t));
      super.resizeAttachments(e, t);
    }
  },
  Dl = class extends Hi {
    device;
    handle = null;
    _framebuffer = null;
    get [Symbol.toStringTag]() {
      return "WebGLCanvasContext";
    }
    constructor(e, t) {
      (super(t),
        (this.device = e),
        this._setAutoCreatedCanvasId(`${this.device.id}-canvas`),
        this._configureDevice());
    }
    _configureDevice() {
      (this.drawingBufferWidth === this._framebuffer?.width &&
        this.drawingBufferHeight === this._framebuffer?.height) ||
        this._framebuffer?.resize([
          this.drawingBufferWidth,
          this.drawingBufferHeight,
        ]);
    }
    _getCurrentFramebuffer() {
      return (
        (this._framebuffer ||= new Bl(this.device, {
          id: "canvas-context-framebuffer",
          handle: null,
          width: this.drawingBufferWidth,
          height: this.drawingBufferHeight,
        })),
        this._framebuffer
      );
    }
  },
  Fl = class extends Vi {
    device;
    handle = null;
    context2d;
    get [Symbol.toStringTag]() {
      return "WebGLPresentationContext";
    }
    constructor(e, t = {}) {
      (super(t), (this.device = e));
      const r = `${this[Symbol.toStringTag]}(${this.id})`;
      if (!this.device.getDefaultCanvasContext().offscreenCanvas)
        throw new Error(
          `${r}: WebGL PresentationContext requires the default CanvasContext canvas to be an OffscreenCanvas`,
        );
      const n = this.canvas.getContext("2d");
      if (!n) throw new Error(`${r}: Failed to create 2d presentation context`);
      ((this.context2d = n),
        this._setAutoCreatedCanvasId(`${this.device.id}-presentation-canvas`),
        this._configureDevice(),
        this._startObservers());
    }
    present() {
      (this._resizeDrawingBufferIfNeeded(), this.device.submit());
      const e = this.device.getDefaultCanvasContext(),
        [t, r] = e.getDrawingBufferSize();
      if (
        0 !== this.drawingBufferWidth &&
        0 !== this.drawingBufferHeight &&
        0 !== t &&
        0 !== r &&
        0 !== e.canvas.width &&
        0 !== e.canvas.height
      ) {
        if (
          t !== this.drawingBufferWidth ||
          r !== this.drawingBufferHeight ||
          e.canvas.width !== this.drawingBufferWidth ||
          e.canvas.height !== this.drawingBufferHeight
        )
          throw new Error(
            `${this[Symbol.toStringTag]}(${this.id}): Default canvas context size ${t}x${r} does not match presentation size ${this.drawingBufferWidth}x${this.drawingBufferHeight}`,
          );
        (this.context2d.clearRect(
          0,
          0,
          this.drawingBufferWidth,
          this.drawingBufferHeight,
        ),
          this.context2d.drawImage(e.canvas, 0, 0));
      }
    }
    _configureDevice() {}
    _getCurrentFramebuffer(e) {
      const t = this.device.getDefaultCanvasContext();
      return (
        t.setDrawingBufferSize(
          this.drawingBufferWidth,
          this.drawingBufferHeight,
        ),
        t.getCurrentFramebuffer(e)
      );
    }
  },
  Ul = {};
function Gl(e = "id") {
  return ((Ul[e] = Ul[e] || 1), `${e}-${Ul[e]++}`);
}
var kl = class extends qn {
  device;
  gl;
  handle;
  glTarget;
  glUsage;
  glIndexType = 5123;
  byteLength = 0;
  bytesUsed = 0;
  constructor(e, t = {}) {
    (super(e, t), (this.device = e), (this.gl = this.device.gl));
    const r = "object" == typeof t ? t.handle : void 0;
    var n;
    ((this.handle = r || this.gl.createBuffer()),
      e._setWebGLDebugMetadata(this.handle, this, {
        spector: { ...this.props, data: typeof this.props.data },
      }),
      (this.glTarget =
        (n = this.props.usage) & qn.INDEX
          ? 34963
          : n & qn.VERTEX
            ? 34962
            : n & qn.UNIFORM
              ? 35345
              : 34962),
      (this.glUsage = (function (e) {
        return e & qn.INDEX || e & qn.VERTEX
          ? 35044
          : e & qn.UNIFORM
            ? 35048
            : 35044;
      })(this.props.usage)),
      (this.glIndexType = "uint32" === this.props.indexType ? 5125 : 5123),
      t.data
        ? this._initWithData(t.data, t.byteOffset, t.byteLength)
        : this._initWithByteLength(t.byteLength || 0));
  }
  destroy() {
    !this.destroyed &&
      this.handle &&
      (this.removeStats(),
      this.props.handle
        ? this.trackDeallocatedReferencedMemory("Buffer")
        : (this.trackDeallocatedMemory(), this.gl.deleteBuffer(this.handle)),
      (this.destroyed = !0),
      (this.handle = null));
  }
  _initWithData(e, t = 0, r = e.byteLength + t) {
    const n = this.glTarget;
    (this.gl.bindBuffer(n, this.handle),
      this.gl.bufferData(n, r, this.glUsage),
      this.gl.bufferSubData(n, t, e),
      this.gl.bindBuffer(n, null),
      (this.bytesUsed = r),
      (this.byteLength = r),
      this._setDebugData(e, t, r),
      this.props.handle
        ? this.trackReferencedMemory(r, "Buffer")
        : this.trackAllocatedMemory(r));
  }
  _initWithByteLength(e) {
    let t = e;
    0 === e && (t = new Float32Array(0));
    const r = this.glTarget;
    return (
      this.gl.bindBuffer(r, this.handle),
      this.gl.bufferData(r, t, this.glUsage),
      this.gl.bindBuffer(r, null),
      (this.bytesUsed = e),
      (this.byteLength = e),
      this._setDebugData(null, 0, e),
      this.props.handle
        ? this.trackReferencedMemory(e, "Buffer")
        : this.trackAllocatedMemory(e),
      this
    );
  }
  write(e, t = 0) {
    const r = ArrayBuffer.isView(e) ? e : new Uint8Array(e),
      n = 36663;
    (this.gl.bindBuffer(n, this.handle),
      this.gl.bufferSubData(n, t, r),
      this.gl.bindBuffer(n, null),
      this._setDebugData(e, t, e.byteLength));
  }
  async mapAndWriteAsync(e, t = 0, r = this.byteLength - t) {
    const n = new ArrayBuffer(r);
    (await e(n, "copied"), this.write(n, t));
  }
  async readAsync(e = 0, t) {
    return this.readSyncWebGL(e, t);
  }
  async mapAndReadAsync(e, t = 0, r) {
    return await e((await this.readAsync(t, r)).buffer, "copied");
  }
  readSyncWebGL(e = 0, t) {
    t = t ?? this.byteLength - e;
    const r = new Uint8Array(t);
    return (
      this.gl.bindBuffer(36662, this.handle),
      this.gl.getBufferSubData(36662, e, r, 0, t),
      this.gl.bindBuffer(36662, null),
      this._setDebugData(r, e, t),
      r
    );
  }
};
function Wl(e) {
  const t = e.toLowerCase();
  return ["warning", "error", "info"].includes(t) ? t : "info";
}
var $l = class extends qi {
  device;
  handle;
  constructor(e, t) {
    switch ((super(e, t), (this.device = e), this.props.stage)) {
      case "vertex":
        this.handle = this.props.handle || this.device.gl.createShader(35633);
        break;
      case "fragment":
        this.handle = this.props.handle || this.device.gl.createShader(35632);
        break;
      default:
        throw new Error(this.props.stage);
    }
    e._setWebGLDebugMetadata(this.handle, this, { spector: this.props });
    const r = this._compile(this.source);
    r &&
      "function" == typeof r.catch &&
      r.catch(() => {
        this.compilationStatus = "error";
      });
  }
  destroy() {
    this.handle &&
      (this.removeStats(),
      this.device.gl.deleteShader(this.handle),
      (this.destroyed = !0),
      (this.handle.destroyed = !0));
  }
  get asyncCompilationStatus() {
    return this._waitForCompilationComplete().then(
      () => (this._getCompilationStatus(), this.compilationStatus),
    );
  }
  async getCompilationInfo() {
    return (
      await this._waitForCompilationComplete(),
      this.getCompilationInfoSync()
    );
  }
  getCompilationInfoSync() {
    const e = this.device.gl.getShaderInfoLog(this.handle);
    return e
      ? (function (e) {
          const t = e.split(/\r?\n/),
            r = [];
          for (const n of t) {
            if (n.length <= 1) continue;
            const e = n.trim(),
              t = n.split(":"),
              i = t[0]?.trim();
            if (2 === t.length) {
              const [n, s] = t;
              if (!n || !s) {
                r.push({
                  message: e,
                  type: Wl(i || "info"),
                  lineNum: 0,
                  linePos: 0,
                });
                continue;
              }
              r.push({
                message: s.trim(),
                type: Wl(n),
                lineNum: 0,
                linePos: 0,
              });
              continue;
            }
            const [s, o, a, ...c] = t;
            if (!s || !o || !a) {
              r.push({
                message: t.slice(1).join(":").trim() || e,
                type: Wl(i || "info"),
                lineNum: 0,
                linePos: 0,
              });
              continue;
            }
            let l = parseInt(a, 10);
            Number.isNaN(l) && (l = 0);
            let u = parseInt(o, 10);
            (Number.isNaN(u) && (u = 0),
              r.push({
                message: c.join(":").trim(),
                type: Wl(s),
                lineNum: l,
                linePos: u,
              }));
          }
          return r;
        })(e)
      : [];
  }
  getTranslatedSource() {
    return (
      this.device
        .getExtension("WEBGL_debug_shaders")
        .WEBGL_debug_shaders?.getTranslatedShaderSource(this.handle) || null
    );
  }
  _compile(e) {
    e = e.startsWith("#version ") ? e : `#version 300 es\n${e}`;
    const { gl: t } = this.device;
    if (
      (t.shaderSource(this.handle, e),
      t.compileShader(this.handle),
      this.device.props.debug)
    ) {
      if (this.device.features.has("compilation-status-async-webgl"))
        return (
          Bn.once(1, "Shader compilation is asynchronous")(),
          this._waitForCompilationComplete().then(() => {
            (Bn.info(
              2,
              `Shader ${this.id} - async compilation complete: ${this.compilationStatus}`,
            )(),
              this._getCompilationStatus(),
              this.debugShader());
          })
        );
      if (
        (this._getCompilationStatus(),
        this.debugShader(),
        "error" === this.compilationStatus)
      )
        throw new Error(
          `GLSL compilation errors in ${this.props.stage} shader ${this.props.id}`,
        );
    } else this.compilationStatus = "pending";
  }
  async _waitForCompilationComplete() {
    const e = async (e) => await new Promise((t) => setTimeout(t, e));
    if (!this.device.features.has("compilation-status-async-webgl"))
      return void (await e(10));
    const { gl: t } = this.device;
    for (;;) {
      if (t.getShaderParameter(this.handle, 37297)) return;
      await e(10);
    }
  }
  _getCompilationStatus() {
    this.compilationStatus = this.device.gl.getShaderParameter(
      this.handle,
      35713,
    )
      ? "success"
      : "error";
  }
};
function Hl(e, t) {
  return jl(e, t, {
    never: 512,
    less: 513,
    equal: 514,
    "less-equal": 515,
    greater: 516,
    "not-equal": 517,
    "greater-equal": 518,
    always: 519,
  });
}
function Vl(e, t) {
  return jl(e, t, {
    keep: 7680,
    zero: 0,
    replace: 7681,
    invert: 5386,
    "increment-clamp": 7682,
    "decrement-clamp": 7683,
    "increment-wrap": 34055,
    "decrement-wrap": 34056,
  });
}
function zl(e, t) {
  return jl(e, t, {
    add: 32774,
    subtract: 32778,
    "reverse-subtract": 32779,
    min: 32775,
    max: 32776,
  });
}
function Xl(e, t, r = "color") {
  return jl(e, t, {
    one: 1,
    zero: 0,
    src: 768,
    "one-minus-src": 769,
    dst: 774,
    "one-minus-dst": 775,
    "src-alpha": 770,
    "one-minus-src-alpha": 771,
    "dst-alpha": 772,
    "one-minus-dst-alpha": 773,
    "src-alpha-saturated": 776,
    constant: "color" === r ? 32769 : 32771,
    "one-minus-constant": "color" === r ? 32770 : 32772,
    src1: 768,
    "one-minus-src1": 769,
    "src1-alpha": 770,
    "one-minus-src1-alpha": 771,
  });
}
function jl(e, t, r) {
  if (!(t in r))
    throw new Error(
      (function (e, t) {
        return `Illegal parameter ${t} for ${e}`;
      })(e, t),
    );
  return r[t];
}
function Kl(e) {
  const t = {};
  return (
    e.addressModeU && (t[10242] = Yl(e.addressModeU)),
    e.addressModeV && (t[10243] = Yl(e.addressModeV)),
    e.addressModeW && (t[32882] = Yl(e.addressModeW)),
    e.magFilter && (t[10240] = Ql(e.magFilter)),
    (e.minFilter || e.mipmapFilter) &&
      (t[10241] = (function (e, t = "none") {
        if (!t) return Ql(e);
        switch (t) {
          case "none":
            return Ql(e);
          case "nearest":
            switch (e) {
              case "nearest":
                return 9984;
              case "linear":
                return 9985;
            }
            break;
          case "linear":
            switch (e) {
              case "nearest":
                return 9986;
              case "linear":
                return 9987;
            }
        }
      })(e.minFilter || "linear", e.mipmapFilter)),
    void 0 !== e.lodMinClamp && (t[33082] = e.lodMinClamp),
    void 0 !== e.lodMaxClamp && (t[33083] = e.lodMaxClamp),
    "comparison-sampler" === e.type && (t[34892] = 34894),
    e.compare && (t[34893] = Hl("compare", e.compare)),
    e.maxAnisotropy && (t[34046] = e.maxAnisotropy),
    t
  );
}
function Yl(e) {
  switch (e) {
    case "clamp-to-edge":
      return 33071;
    case "repeat":
      return 10497;
    case "mirror-repeat":
      return 33648;
  }
}
function Ql(e) {
  switch (e) {
    case "nearest":
      return 9728;
    case "linear":
      return 9729;
  }
}
var ql = class extends zi {
  device;
  handle;
  parameters;
  constructor(e, t) {
    (super(e, t),
      (this.device = e),
      (this.parameters = Kl(t)),
      (this.handle = t.handle || this.device.gl.createSampler()),
      this._setSamplerParameters(this.parameters));
  }
  destroy() {
    this.handle &&
      (this.device.gl.deleteSampler(this.handle), (this.handle = void 0));
  }
  toString() {
    return `Sampler(${this.id},${JSON.stringify(this.props)})`;
  }
  _setSamplerParameters(e) {
    for (const [t, r] of Object.entries(e)) {
      const e = Number(t);
      switch (e) {
        case 33082:
        case 33083:
          this.device.gl.samplerParameterf(this.handle, e, r);
          break;
        default:
          this.device.gl.samplerParameteri(this.handle, e, r);
      }
    }
  }
};
function Zl(e, t, r) {
  if (
    (function (e) {
      for (const t in e) return !1;
      return !0;
    })(t)
  )
    return r(e);
  const { nocatch: n = !0 } = t,
    i = cl.get(e);
  let s;
  if ((i.push(), il(e, t), n)) ((s = r(e)), i.pop());
  else
    try {
      s = r(e);
    } finally {
      i.pop();
    }
  return s;
}
var Jl = class extends Ki {
  device;
  gl;
  handle;
  texture;
  constructor(e, t) {
    (super(e, { ...ji.defaultProps, ...t }),
      (this.device = e),
      (this.gl = this.device.gl),
      (this.handle = null),
      (this.texture = t.texture));
  }
};
function eu(e) {
  return tu[e];
}
var tu = {
    5124: "sint32",
    5125: "uint32",
    5122: "sint16",
    5123: "uint16",
    5120: "sint8",
    5121: "uint8",
    5126: "float32",
    5131: "float16",
    33635: "uint16",
    32819: "uint16",
    32820: "uint16",
    33640: "uint32",
    35899: "uint32",
    35902: "uint32",
    34042: "uint32",
    36269: "uint32",
  },
  ru = class extends ji {
    device;
    gl;
    handle;
    sampler = void 0;
    view;
    glTarget;
    glFormat;
    glType;
    glInternalFormat;
    compressed;
    _textureUnit = 0;
    _framebuffer = null;
    _framebufferAttachmentKey = null;
    constructor(e, t) {
      (super(e, t, { byteAlignment: 1 }),
        (this.device = e),
        (this.gl = this.device.gl));
      const r = Nl(this.props.format);
      ((this.glTarget = (function (e) {
        switch (e) {
          case "1d":
          case "cube-array":
            break;
          case "2d":
            return 3553;
          case "3d":
            return 32879;
          case "cube":
            return 34067;
          case "2d-array":
            return 35866;
        }
        throw new Error(e);
      })(this.props.dimension)),
        (this.glInternalFormat = r.internalFormat),
        (this.glFormat = r.format),
        (this.glType = r.type),
        (this.compressed = r.compressed),
        (this.handle = this.props.handle || this.gl.createTexture()),
        this.device._setWebGLDebugMetadata(this.handle, this, {
          spector: this.props,
        }),
        this.gl.bindTexture(this.glTarget, this.handle));
      const {
        dimension: n,
        width: i,
        height: s,
        depth: o,
        mipLevels: a,
        glTarget: c,
        glInternalFormat: l,
      } = this;
      if (!this.compressed)
        switch (n) {
          case "2d":
          case "cube":
            this.gl.texStorage2D(c, a, l, i, s);
            break;
          case "2d-array":
          case "3d":
            this.gl.texStorage3D(c, a, l, i, s, o);
            break;
          default:
            throw new Error(n);
        }
      (this.gl.bindTexture(this.glTarget, null),
        this._initializeData(t.data),
        this.props.handle
          ? this.trackReferencedMemory(this.getAllocatedByteLength(), "Texture")
          : this.trackAllocatedMemory(this.getAllocatedByteLength(), "Texture"),
        this.setSampler(this.props.sampler),
        (this.view = new Jl(this.device, { ...this.props, texture: this })),
        Object.seal(this));
    }
    destroy() {
      this.handle &&
        (this._framebuffer?.destroy(),
        (this._framebuffer = null),
        (this._framebufferAttachmentKey = null),
        this.removeStats(),
        this.props.handle
          ? this.trackDeallocatedReferencedMemory("Texture")
          : (this.gl.deleteTexture(this.handle),
            this.trackDeallocatedMemory("Texture")),
        (this.destroyed = !0));
    }
    createView(e) {
      return new Jl(this.device, { ...e, texture: this });
    }
    setSampler(e = {}) {
      super.setSampler(e);
      const t = Kl(this.sampler.props);
      this._setSamplerParameters(t);
    }
    copyExternalImage(e) {
      const t = this._normalizeCopyExternalImageOptions(e);
      if (t.sourceX || t.sourceY)
        throw new Error("WebGL does not support sourceX/sourceY)");
      const { glFormat: r, glType: n } = this,
        {
          image: i,
          depth: s,
          mipLevel: o,
          x: a,
          y: c,
          z: l,
          width: u,
          height: h,
        } = t,
        d = nu(this.glTarget, this.dimension, l),
        f = t.flipY ? { 37440: !0 } : {};
      return (
        this.gl.bindTexture(this.glTarget, this.handle),
        Zl(this.gl, f, () => {
          switch (this.dimension) {
            case "2d":
            case "cube":
              this.gl.texSubImage2D(d, o, a, c, u, h, r, n, i);
              break;
            case "2d-array":
            case "3d":
              this.gl.texSubImage3D(d, o, a, c, l, u, h, s, r, n, i);
          }
        }),
        this.gl.bindTexture(this.glTarget, null),
        { width: t.width, height: t.height }
      );
    }
    copyImageData(e) {
      super.copyImageData(e);
    }
    readBuffer(e = {}, t) {
      if (!t)
        throw new Error(`${this} readBuffer requires a destination buffer`);
      const r = this._getSupportedColorReadOptions(e),
        n = e.byteOffset ?? 0,
        i = this.computeMemoryLayout(r);
      if (t.byteLength < n + i.byteLength)
        throw new Error(
          `${this} readBuffer target is too small (${t.byteLength} < ${n + i.byteLength})`,
        );
      const s = t;
      this.gl.bindBuffer(35051, s.handle);
      try {
        this._readColorTextureLayers(r, i, (e) => {
          this.gl.readPixels(
            r.x,
            r.y,
            r.width,
            r.height,
            this.glFormat,
            this.glType,
            n + e,
          );
        });
      } finally {
        this.gl.bindBuffer(35051, null);
      }
      return t;
    }
    async readDataAsync(e = {}) {
      throw new Error(
        `${this} readDataAsync is deprecated; use readBuffer() with an explicit destination buffer or DynamicTexture.readAsync()`,
      );
    }
    writeBuffer(e, t = {}) {
      const r = this._normalizeTextureWriteOptions(t),
        {
          width: n,
          height: i,
          depthOrArrayLayers: s,
          mipLevel: o,
          byteOffset: a,
          x: c,
          y: l,
          z: u,
        } = r,
        { glFormat: h, glType: d, compressed: f } = this,
        p = nu(this.glTarget, this.dimension, u);
      if (f)
        throw new Error(
          "writeBuffer for compressed textures is not implemented in WebGL",
        );
      const { bytesPerPixel: g } = this.device.getTextureFormatInfo(
          this.format,
        ),
        m = g ? r.bytesPerRow / g : void 0,
        _ = {
          3317: this.byteAlignment,
          ...(void 0 !== m ? { 3314: m } : {}),
          32878: r.rowsPerImage,
        };
      (this.gl.bindTexture(this.glTarget, this.handle),
        this.gl.bindBuffer(35052, e.handle),
        Zl(this.gl, _, () => {
          switch (this.dimension) {
            case "2d":
            case "cube":
              this.gl.texSubImage2D(p, o, c, l, n, i, h, d, a);
              break;
            case "2d-array":
            case "3d":
              this.gl.texSubImage3D(p, o, c, l, u, n, i, s, h, d, a);
          }
        }),
        this.gl.bindBuffer(35052, null),
        this.gl.bindTexture(this.glTarget, null));
    }
    writeData(e, t = {}) {
      const r = this._normalizeTextureWriteOptions(t),
        n = ArrayBuffer.isView(e) ? e : new Uint8Array(e),
        {
          width: i,
          height: s,
          depthOrArrayLayers: o,
          mipLevel: a,
          x: c,
          y: l,
          z: u,
          byteOffset: h,
        } = r,
        { glFormat: d, glType: f, compressed: p } = this,
        g = nu(this.glTarget, this.dimension, u);
      let m;
      if (!p) {
        const { bytesPerPixel: e } = this.device.getTextureFormatInfo(
          this.format,
        );
        e && (m = r.bytesPerRow / e);
      }
      const _ = this.compressed
          ? {}
          : {
              3317: this.byteAlignment,
              ...(void 0 !== m ? { 3314: m } : {}),
              32878: r.rowsPerImage,
            },
        E = (function (e, t) {
          if (t % e.BYTES_PER_ELEMENT !== 0)
            throw new Error(
              `Texture byteOffset ${t} must align to typed array element size ${e.BYTES_PER_ELEMENT}`,
            );
          return t / e.BYTES_PER_ELEMENT;
        })(n, h),
        b = p
          ? (function (e, t = 0) {
              return t
                ? new e.constructor(
                    e.buffer,
                    e.byteOffset + t,
                    (e.byteLength - t) / e.BYTES_PER_ELEMENT,
                  )
                : e;
            })(n, h)
          : n,
        y = this._getMipLevelSize(a),
        T =
          0 === c &&
          0 === l &&
          0 === u &&
          i === y.width &&
          s === y.height &&
          o === y.depthOrArrayLayers;
      (this.gl.bindTexture(this.glTarget, this.handle),
        this.gl.bindBuffer(35052, null),
        Zl(this.gl, _, () => {
          switch (this.dimension) {
            case "2d":
            case "cube":
              p
                ? T
                  ? this.gl.compressedTexImage2D(g, a, d, i, s, 0, b)
                  : this.gl.compressedTexSubImage2D(g, a, c, l, i, s, d, b)
                : this.gl.texSubImage2D(g, a, c, l, i, s, d, f, n, E);
              break;
            case "2d-array":
            case "3d":
              p
                ? T
                  ? this.gl.compressedTexImage3D(g, a, d, i, s, o, 0, b)
                  : this.gl.compressedTexSubImage3D(
                      g,
                      a,
                      c,
                      l,
                      u,
                      i,
                      s,
                      o,
                      d,
                      b,
                    )
                : this.gl.texSubImage3D(g, a, c, l, u, i, s, o, d, f, n, E);
          }
        }),
        this.gl.bindTexture(this.glTarget, null));
    }
    _getRowByteAlignment(e, t) {
      return 1;
    }
    _getFramebuffer() {
      return (
        (this._framebuffer ||= this.device.createFramebuffer({
          id: `framebuffer-for-${this.id}`,
          width: this.width,
          height: this.height,
          colorAttachments: [this],
        })),
        this._framebuffer
      );
    }
    readDataSyncWebGL(e = {}) {
      const t = this._getSupportedColorReadOptions(e),
        r = this.computeMemoryLayout(t),
        n = Ls(eu(this.glType)),
        i = new n(r.byteLength / n.BYTES_PER_ELEMENT);
      return (
        this._readColorTextureLayers(t, r, (e) => {
          const s = new n(
            i.buffer,
            i.byteOffset + e,
            r.bytesPerImage / n.BYTES_PER_ELEMENT,
          );
          this.gl.readPixels(
            t.x,
            t.y,
            t.width,
            t.height,
            this.glFormat,
            this.glType,
            s,
          );
        }),
        i.buffer
      );
    }
    _readColorTextureLayers(e, t, r) {
      const n = this._getFramebuffer(),
        i = t.bytesPerRow / t.bytesPerPixel,
        s = { 3333: this.byteAlignment, ...(i !== e.width ? { 3330: i } : {}) },
        o = this.gl.getParameter(3074),
        a = this.gl.bindFramebuffer(36160, n.handle);
      try {
        (this.gl.readBuffer(36064),
          Zl(this.gl, s, () => {
            for (let i = 0; i < e.depthOrArrayLayers; i++)
              (this._attachReadSubresource(n, e.mipLevel, e.z + i),
                r(i * t.bytesPerImage));
          }));
      } finally {
        (this.gl.bindFramebuffer(36160, a || null), this.gl.readBuffer(o));
      }
    }
    _attachReadSubresource(e, t, r) {
      const n = `${t}:${r}`;
      if (this._framebufferAttachmentKey !== n) {
        switch (this.dimension) {
          case "2d":
            this.gl.framebufferTexture2D(36160, 36064, 3553, this.handle, t);
            break;
          case "cube":
            this.gl.framebufferTexture2D(
              36160,
              36064,
              nu(this.glTarget, this.dimension, r),
              this.handle,
              t,
            );
            break;
          case "2d-array":
          case "3d":
            this.gl.framebufferTextureLayer(36160, 36064, this.handle, t, r);
            break;
          default:
            throw new Error(
              `${this} color readback does not support ${this.dimension} textures`,
            );
        }
        if (this.device.props.debug) {
          const t = Number(this.gl.checkFramebufferStatus(36160));
          if (36053 !== t)
            throw new Error(`${e} incomplete for ${this} readback (${t})`);
        }
        this._framebufferAttachmentKey = n;
      }
    }
    generateMipmapsWebGL(e) {
      if (
        (this.device.isTextureFormatRenderable(this.props.format) &&
          this.device.isTextureFormatFilterable(this.props.format)) ||
        (Bn.warn(
          `${this} is not renderable or filterable, may not be able to generate mipmaps`,
        )(),
        e?.force)
      )
        try {
          (this.gl.bindTexture(this.glTarget, this.handle),
            this.gl.generateMipmap(this.glTarget));
        } catch (t) {
          Bn.warn(`Error generating mipmap for ${this}: ${t.message}`)();
        } finally {
          this.gl.bindTexture(this.glTarget, null);
        }
    }
    _setSamplerParameters(e) {
      (Bn.log(2, `${this.id} sampler parameters`, this.device.getGLKeys(e))(),
        this.gl.bindTexture(this.glTarget, this.handle));
      for (const [t, r] of Object.entries(e)) {
        const e = Number(t),
          n = r;
        switch (e) {
          case 33082:
          case 33083:
            this.gl.texParameterf(this.glTarget, e, n);
            break;
          case 10240:
          case 10241:
          case 10242:
          case 10243:
          case 32882:
          case 34892:
          case 34893:
            this.gl.texParameteri(this.glTarget, e, n);
            break;
          case 34046:
            this.device.features.has("texture-filterable-anisotropic-webgl") &&
              this.gl.texParameteri(this.glTarget, e, n);
        }
      }
      this.gl.bindTexture(this.glTarget, null);
    }
    _getActiveUnit() {
      return this.gl.getParameter(34016) - 33984;
    }
    _bind(e) {
      const { gl: t } = this;
      return (
        void 0 !== e && ((this._textureUnit = e), t.activeTexture(33984 + e)),
        t.bindTexture(this.glTarget, this.handle),
        e
      );
    }
    _unbind(e) {
      const { gl: t } = this;
      return (
        void 0 !== e && ((this._textureUnit = e), t.activeTexture(33984 + e)),
        t.bindTexture(this.glTarget, null),
        e
      );
    }
  };
function nu(e, t, r) {
  return "cube" === t ? 34069 + r : e;
}
function iu(e, t, r, n) {
  const i = e;
  let s = n;
  (!0 === s && (s = 1), !1 === s && (s = 0));
  const o = "number" == typeof s ? [s] : s;
  switch (r) {
    case 35678:
    case 35680:
    case 35679:
    case 35682:
    case 36289:
    case 36292:
    case 36293:
    case 36298:
    case 36299:
    case 36300:
    case 36303:
    case 36306:
    case 36307:
    case 36308:
    case 36311:
      if ("number" != typeof n)
        throw new Error("samplers must be set to integers");
      return e.uniform1i(t, n);
    case 5126:
      return e.uniform1fv(t, o);
    case 35664:
      return e.uniform2fv(t, o);
    case 35665:
      return e.uniform3fv(t, o);
    case 35666:
      return e.uniform4fv(t, o);
    case 5124:
    case 35670:
      return e.uniform1iv(t, o);
    case 35667:
    case 35671:
      return e.uniform2iv(t, o);
    case 35668:
    case 35672:
      return e.uniform3iv(t, o);
    case 35669:
    case 35673:
      return e.uniform4iv(t, o);
    case 5125:
      return i.uniform1uiv(t, o, 1);
    case 36294:
      return i.uniform2uiv(t, o, 2);
    case 36295:
      return i.uniform3uiv(t, o, 3);
    case 36296:
      return i.uniform4uiv(t, o, 4);
    case 35674:
      return e.uniformMatrix2fv(t, !1, o);
    case 35675:
      return e.uniformMatrix3fv(t, !1, o);
    case 35676:
      return e.uniformMatrix4fv(t, !1, o);
    case 35685:
      return i.uniformMatrix2x3fv(t, !1, o);
    case 35686:
      return i.uniformMatrix2x4fv(t, !1, o);
    case 35687:
      return i.uniformMatrix3x2fv(t, !1, o);
    case 35688:
      return i.uniformMatrix3x4fv(t, !1, o);
    case 35689:
      return i.uniformMatrix4x2fv(t, !1, o);
    case 35690:
      return i.uniformMatrix4x3fv(t, !1, o);
  }
  throw new Error("Illegal uniform");
}
var su = class extends es {
  device;
  handle;
  vs;
  fs;
  introspectedLayout;
  bindings = {};
  uniforms = {};
  varyings = null;
  _uniformCount = 0;
  _uniformSetters = {};
  get [Symbol.toStringTag]() {
    return "WEBGLRenderPipeline";
  }
  constructor(e, t) {
    (super(e, t), (this.device = e));
    const r =
      this.sharedRenderPipeline ||
      this.device._createSharedRenderPipelineWebGL(t);
    ((this.sharedRenderPipeline = r),
      (this.handle = r.handle),
      (this.vs = r.vs),
      (this.fs = r.fs),
      (this.linkStatus = r.linkStatus),
      (this.introspectedLayout = r.introspectedLayout),
      this.device._setWebGLDebugMetadata(this.handle, this, {
        spector: { id: this.props.id },
      }),
      (this.shaderLayout = t.shaderLayout
        ? (function (e, t) {
            const r = {
              ...e,
              attributes: e.attributes.map((e) => ({ ...e })),
              bindings: e.bindings.map((e) => ({ ...e })),
            };
            for (const n of t?.attributes || []) {
              const e = r.attributes.find((e) => e.name === n.name);
              e
                ? ((e.type = n.type || e.type),
                  (e.stepMode = n.stepMode || e.stepMode))
                : Bn.warn(
                    `shader layout attribute ${n.name} not present in shader`,
                  );
            }
            for (const n of t?.bindings || []) {
              const e = ou(r, n.name);
              e
                ? Object.assign(e, n)
                : Bn.warn(
                    `shader layout binding ${n.name} not present in shader`,
                  );
            }
            return r;
          })(this.introspectedLayout, t.shaderLayout)
        : this.introspectedLayout));
  }
  destroy() {
    this.destroyed ||
      (this.sharedRenderPipeline &&
        !this.props._sharedRenderPipeline &&
        this.sharedRenderPipeline.destroy(),
      this.destroyResource());
  }
  setBindings(e, t) {
    const r = as(os(this.shaderLayout, e));
    for (const [n, i] of Object.entries(r)) {
      const e = ou(this.shaderLayout, n);
      if (e) {
        switch (
          (i ||
            Bn.warn(
              `Unsetting binding "${n}" in render pipeline "${this.id}"`,
            )(),
          e.type)
        ) {
          case "uniform":
            if (!(i instanceof kl || i.buffer instanceof kl))
              throw new Error("buffer value");
            break;
          case "texture":
            if (!(i instanceof Jl || i instanceof ru || i instanceof Bl))
              throw new Error(`${this} Bad texture binding for ${n}`);
            break;
          case "sampler":
            Bn.warn(`Ignoring sampler ${n}`)();
            break;
          default:
            throw new Error(e.type);
        }
        this.bindings[n] = i;
      } else {
        const e = this.shaderLayout.bindings
          .map((e) => `"${e.name}"`)
          .join(", ");
        t?.disableWarnings ||
          Bn.warn(
            `No binding "${n}" in render pipeline "${this.id}", expected one of ${e}`,
            i,
          )();
      }
    }
  }
  draw(e) {
    this._syncLinkStatus();
    const t = e.bindGroups ? as(e.bindGroups) : e.bindings || this.bindings,
      {
        renderPass: r,
        parameters: n = this.props.parameters,
        topology: i = this.props.topology,
        vertexArray: s,
        vertexCount: o,
        instanceCount: a,
        isInstanced: c = !1,
        firstVertex: l = 0,
        transformFeedback: u,
        uniforms: h = this.uniforms,
      } = e,
      d = (function (e) {
        switch (e) {
          case "point-list":
            return 0;
          case "line-list":
            return 1;
          case "line-strip":
            return 3;
          case "triangle-list":
            return 4;
          case "triangle-strip":
            return 5;
          default:
            throw new Error(e);
        }
      })(i),
      f = Boolean(s.indexBuffer),
      p = s.indexBuffer?.glIndexType;
    if ("success" !== this.linkStatus)
      return (
        Bn.info(
          2,
          `RenderPipeline:${this.id}.draw() aborted - waiting for shader linking`,
        )(),
        !1
      );
    if (!this._areTexturesRenderable(t))
      return (
        Bn.info(
          2,
          `RenderPipeline:${this.id}.draw() aborted - textures not yet loaded`,
        )(),
        !1
      );
    (this.device.gl.useProgram(this.handle),
      s.bindBeforeRender(r),
      u && u.begin(this.props.topology),
      this._applyBindings(t, { disableWarnings: this.props.disableWarnings }),
      this._applyUniforms(h));
    const g = r;
    return (
      (function (e, t, r, n) {
        if (
          (function (e) {
            let t = !0;
            for (const r in e) {
              t = !1;
              break;
            }
            return t;
          })(t)
        )
          return n(e);
        const i = e;
        i.pushState();
        try {
          return (
            (function (e, t) {
              const r = e,
                { gl: n } = r;
              if (t.cullMode)
                switch (t.cullMode) {
                  case "none":
                    n.disable(2884);
                    break;
                  case "front":
                    (n.enable(2884), n.cullFace(1028));
                    break;
                  case "back":
                    (n.enable(2884), n.cullFace(1029));
                }
              if (
                (t.frontFace &&
                  n.frontFace(
                    jl("frontFace", t.frontFace, { ccw: 2305, cw: 2304 }),
                  ),
                t.unclippedDepth &&
                  e.features.has("depth-clip-control") &&
                  n.enable(34383),
                void 0 !== t.depthBias &&
                  (n.enable(32823),
                  n.polygonOffset(t.depthBias, t.depthBiasSlopeScale || 0)),
                t.provokingVertex && e.features.has("provoking-vertex-webgl"))
              ) {
                const e = r.getExtension(
                    "WEBGL_provoking_vertex",
                  ).WEBGL_provoking_vertex,
                  n = jl("provokingVertex", t.provokingVertex, {
                    first: 36429,
                    last: 36430,
                  });
                e?.provokingVertexWEBGL(n);
              }
              if (
                (t.polygonMode || t.polygonOffsetLine) &&
                e.features.has("polygon-mode-webgl")
              ) {
                if (t.polygonMode) {
                  const e =
                      r.getExtension("WEBGL_polygon_mode").WEBGL_polygon_mode,
                    n = jl("polygonMode", t.polygonMode, {
                      fill: 6914,
                      line: 6913,
                    });
                  (e?.polygonModeWEBGL(1028, n), e?.polygonModeWEBGL(1029, n));
                }
                t.polygonOffsetLine && n.enable(10754);
              }
              if (
                (e.features.has("shader-clip-cull-distance-webgl") &&
                  (t.clipDistance0 && n.enable(12288),
                  t.clipDistance1 && n.enable(12289),
                  t.clipDistance2 && n.enable(12290),
                  t.clipDistance3 && n.enable(12291),
                  t.clipDistance4 && n.enable(12292),
                  t.clipDistance5 && n.enable(12293),
                  t.clipDistance6 && n.enable(12294),
                  t.clipDistance7 && n.enable(12295)),
                void 0 !== t.depthWriteEnabled &&
                  n.depthMask(t.depthWriteEnabled),
                t.depthCompare &&
                  ("always" !== t.depthCompare
                    ? n.enable(2929)
                    : n.disable(2929),
                  n.depthFunc(Hl("depthCompare", t.depthCompare))),
                void 0 !== t.clearDepth && n.clearDepth(t.clearDepth),
                t.stencilWriteMask)
              ) {
                const e = t.stencilWriteMask;
                (n.stencilMaskSeparate(1028, e),
                  n.stencilMaskSeparate(1029, e));
              }
              if (
                (t.stencilReadMask &&
                  Bn.warn("stencilReadMask not supported under WebGL"),
                t.stencilCompare)
              ) {
                const e = t.stencilReadMask || 4294967295,
                  r = Hl("depthCompare", t.stencilCompare);
                ("always" !== t.stencilCompare
                  ? n.enable(2960)
                  : n.disable(2960),
                  n.stencilFuncSeparate(1028, r, 0, e),
                  n.stencilFuncSeparate(1029, r, 0, e));
              }
              if (
                t.stencilPassOperation &&
                t.stencilFailOperation &&
                t.stencilDepthFailOperation
              ) {
                const e = Vl("stencilPassOperation", t.stencilPassOperation),
                  r = Vl("stencilFailOperation", t.stencilFailOperation),
                  i = Vl(
                    "stencilDepthFailOperation",
                    t.stencilDepthFailOperation,
                  );
                (n.stencilOpSeparate(1028, r, i, e),
                  n.stencilOpSeparate(1029, r, i, e));
              }
              switch (t.blend) {
                case !0:
                  n.enable(3042);
                  break;
                case !1:
                  n.disable(3042);
              }
              if (t.blendColorOperation || t.blendAlphaOperation) {
                const e = zl(
                    "blendColorOperation",
                    t.blendColorOperation || "add",
                  ),
                  r = zl("blendAlphaOperation", t.blendAlphaOperation || "add");
                n.blendEquationSeparate(e, r);
                const i = Xl(
                    "blendColorSrcFactor",
                    t.blendColorSrcFactor || "one",
                  ),
                  s = Xl(
                    "blendColorDstFactor",
                    t.blendColorDstFactor || "zero",
                  ),
                  o = Xl("blendAlphaSrcFactor", t.blendAlphaSrcFactor || "one"),
                  a = Xl(
                    "blendAlphaDstFactor",
                    t.blendAlphaDstFactor || "zero",
                  );
                n.blendFuncSeparate(i, s, o, a);
              }
            })(e, t),
            il(i.gl, r),
            n(e)
          );
        } finally {
          i.popState();
        }
      })(this.device, n, g.glParameters, () => {
        (f && c
          ? this.device.gl.drawElementsInstanced(d, o || 0, p, l, a || 0)
          : f
            ? this.device.gl.drawElements(d, o || 0, p, l)
            : c
              ? this.device.gl.drawArraysInstanced(d, l, o || 0, a || 0)
              : this.device.gl.drawArrays(d, l, o || 0),
          u && u.end());
      }),
      s.unbindAfterRender(r),
      !0
    );
  }
  _areTexturesRenderable(e) {
    let t = !0;
    for (const r of this.shaderLayout.bindings)
      au(e, r.name) ||
        (Bn.warn(`Binding ${r.name} not found in ${this.id}`)(), (t = !1));
    return t;
  }
  _applyBindings(e, t) {
    if ((this._syncLinkStatus(), "success" !== this.linkStatus)) return;
    const { gl: r } = this.device;
    r.useProgram(this.handle);
    let n = 0,
      i = 0;
    for (const s of this.shaderLayout.bindings) {
      const t = au(e, s.name);
      if (!t) throw new Error(`No value for binding ${s.name} in ${this.id}`);
      switch (s.type) {
        case "uniform":
          const { name: e } = s,
            o = r.getUniformBlockIndex(this.handle, e);
          if (4294967295 === o)
            throw new Error(`Invalid uniform block name ${e}`);
          if ((r.uniformBlockBinding(this.handle, o, i), t instanceof kl))
            r.bindBufferBase(35345, i, t.handle);
          else {
            const e = t;
            r.bindBufferRange(
              35345,
              i,
              e.buffer.handle,
              e.offset || 0,
              e.size || e.buffer.byteLength - (e.offset || 0),
            );
          }
          i += 1;
          break;
        case "texture":
          if (!(t instanceof Jl || t instanceof ru || t instanceof Bl))
            throw new Error("texture");
          let a;
          if (t instanceof Jl) a = t.texture;
          else if (t instanceof ru) a = t;
          else {
            if (!(t instanceof Bl && t.colorAttachments[0] instanceof Jl))
              throw new Error("No texture");
            (Bn.warn(
              "Passing framebuffer in texture binding may be deprecated. Use fbo.colorAttachments[0] instead",
            )(),
              (a = t.colorAttachments[0].texture));
          }
          (r.activeTexture(33984 + n),
            r.bindTexture(a.glTarget, a.handle),
            (n += 1));
          break;
        case "sampler":
          break;
        case "storage":
        case "read-only-storage":
          throw new Error(`binding type '${s.type}' not supported in WebGL`);
      }
    }
  }
  _applyUniforms(e) {
    for (const t of this.shaderLayout.uniforms || []) {
      const { name: r, location: n, type: i, textureUnit: s } = t,
        o = e[r] ?? s;
      void 0 !== o && iu(this.device.gl, n, i, o);
    }
  }
  _syncLinkStatus() {
    this.linkStatus = this.sharedRenderPipeline.linkStatus;
  }
};
function ou(e, t) {
  return e.bindings.find(
    (e) =>
      e.name === t || e.name === `${t}Uniforms` || `${e.name}Uniforms` === t,
  );
}
function au(e, t) {
  return e[t] || e[`${t}Uniforms`] || e[t.replace(/Uniforms$/, "")];
}
function cu(e) {
  return hu[e];
}
function lu(e) {
  return Boolean(du[e]);
}
function uu(e) {
  return du[e];
}
var hu = {
    5126: "f32",
    35664: "vec2<f32>",
    35665: "vec3<f32>",
    35666: "vec4<f32>",
    5124: "i32",
    35667: "vec2<i32>",
    35668: "vec3<i32>",
    35669: "vec4<i32>",
    5125: "u32",
    36294: "vec2<u32>",
    36295: "vec3<u32>",
    36296: "vec4<u32>",
    35670: "f32",
    35671: "vec2<f32>",
    35672: "vec3<f32>",
    35673: "vec4<f32>",
    35674: "mat2x2<f32>",
    35685: "mat2x3<f32>",
    35686: "mat2x4<f32>",
    35687: "mat3x2<f32>",
    35675: "mat3x3<f32>",
    35688: "mat3x4<f32>",
    35689: "mat4x2<f32>",
    35690: "mat4x3<f32>",
    35676: "mat4x4<f32>",
  },
  du = {
    35678: { viewDimension: "2d", sampleType: "float" },
    35680: { viewDimension: "cube", sampleType: "float" },
    35679: { viewDimension: "3d", sampleType: "float" },
    35682: { viewDimension: "3d", sampleType: "depth" },
    36289: { viewDimension: "2d-array", sampleType: "float" },
    36292: { viewDimension: "2d-array", sampleType: "depth" },
    36293: { viewDimension: "cube", sampleType: "float" },
    36298: { viewDimension: "2d", sampleType: "sint" },
    36299: { viewDimension: "3d", sampleType: "sint" },
    36300: { viewDimension: "cube", sampleType: "sint" },
    36303: { viewDimension: "2d-array", sampleType: "uint" },
    36306: { viewDimension: "2d", sampleType: "uint" },
    36307: { viewDimension: "3d", sampleType: "uint" },
    36308: { viewDimension: "cube", sampleType: "uint" },
    36311: { viewDimension: "2d-array", sampleType: "uint" },
  },
  fu = {
    uint8: 5121,
    sint8: 5120,
    unorm8: 5121,
    snorm8: 5120,
    uint16: 5123,
    sint16: 5122,
    unorm16: 5123,
    snorm16: 5122,
    uint32: 5125,
    sint32: 5124,
    float16: 5131,
    float32: 5126,
  };
function pu(e) {
  if ("]" !== e[e.length - 1]) return { name: e, length: 1, isArray: !1 };
  const t = /([^[]*)(\[[0-9]+\])?/.exec(e);
  return {
    name: Ui(t?.[1], `Failed to parse GLSL uniform name ${e}`),
    length: t?.[2] ? 1 : 0,
    isArray: Boolean(t?.[2]),
  };
}
var gu = class extends ts {
    device;
    handle;
    vs;
    fs;
    introspectedLayout = { attributes: [], bindings: [], uniforms: [] };
    linkStatus = "pending";
    constructor(e, t) {
      (super(e, t),
        (this.device = e),
        (this.handle = t.handle || this.device.gl.createProgram()),
        (this.vs = t.vs),
        (this.fs = t.fs),
        t.varyings &&
          t.varyings.length > 0 &&
          this.device.gl.transformFeedbackVaryings(
            this.handle,
            t.varyings,
            t.bufferMode || 35981,
          ),
        this._linkShaders(),
        Bn.time(3, `RenderPipeline ${this.id} - shaderLayout introspection`)(),
        (this.introspectedLayout = (function (e, t) {
          const r = { attributes: [], bindings: [] };
          r.attributes = (function (e, t) {
            const r = [],
              n = e.getProgramParameter(t, 35721);
            for (let i = 0; i < n; i++) {
              const n = e.getActiveAttrib(t, i);
              if (!n) throw new Error("activeInfo");
              const { name: s, type: o } = n,
                a = e.getAttribLocation(t, s);
              if (a >= 0) {
                const e = cu(o),
                  t = /instance/i.test(s) ? "instance" : "vertex";
                r.push({ name: s, location: a, stepMode: t, type: e });
              }
            }
            return (r.sort((e, t) => e.location - t.location), r);
          })(e, t);
          const n = (function (e, t) {
            const r = (r, n) => e.getActiveUniformBlockParameter(t, r, n),
              n = [],
              i = e.getProgramParameter(t, 35382);
            for (let s = 0; s < i; s++) {
              const i = {
                  name: e.getActiveUniformBlockName(t, s) || "",
                  location: r(s, 35391),
                  byteLength: r(s, 35392),
                  vertex: r(s, 35396),
                  fragment: r(s, 35398),
                  uniformCount: r(s, 35394),
                  uniforms: [],
                },
                o = r(s, 35395) || [],
                a = e.getActiveUniforms(t, o, 35383),
                c = e.getActiveUniforms(t, o, 35384),
                l = e.getActiveUniforms(t, o, 35387),
                u = e.getActiveUniforms(t, o, 35388);
              for (let r = 0; r < i.uniformCount; ++r) {
                const n = o[r];
                if (void 0 !== n) {
                  const s = e.getActiveUniform(t, n);
                  if (!s) throw new Error("activeInfo");
                  const o = cu(a[r]);
                  i.uniforms.push({
                    name: s.name,
                    format: o,
                    type: a[r],
                    arrayLength: c[r],
                    byteOffset: l[r],
                    byteStride: u[r],
                  });
                }
              }
              const h = new Set(
                  i.uniforms
                    .map((e) => e.name.split(".")[0])
                    .filter((e) => Boolean(e)),
                ),
                d = i.name.replace(/Uniforms$/, "");
              if (1 === h.size && !h.has(i.name) && !h.has(d)) {
                const [e] = h;
                Bn.warn(
                  `Uniform block "${i.name}" uses GLSL instance "${e}". luma.gl binds uniform buffers by block name ("${i.name}") and alias ("${d}"). Prefer matching the instance name to one of those to avoid confusing silent mismatches.`,
                )();
              }
              n.push(i);
            }
            return (n.sort((e, t) => e.location - t.location), n);
          })(e, t);
          for (const a of n) {
            const e = a.uniforms.map((e) => ({
              name: e.name,
              format: e.format,
              byteOffset: e.byteOffset,
              byteStride: e.byteStride,
              arrayLength: e.arrayLength,
            }));
            r.bindings.push({
              type: "uniform",
              name: a.name,
              group: 0,
              location: a.location,
              visibility: (a.vertex ? 1 : 0) & (a.fragment ? 2 : 0),
              minBindingSize: a.byteLength,
              uniforms: e,
            });
          }
          const i = (function (e, t) {
            const r = [],
              n = e.getProgramParameter(t, 35718);
            for (let i = 0; i < n; i++) {
              const n = e.getActiveUniform(t, i);
              if (!n) throw new Error("activeInfo");
              const { name: s, size: o, type: a } = n,
                { name: c, isArray: l } = pu(s);
              let u = e.getUniformLocation(t, c);
              const h = { location: u, name: c, size: o, type: a, isArray: l };
              if ((r.push(h), h.size > 1))
                for (let i = 0; i < h.size; i++) {
                  const n = `${c}[${i}]`;
                  u = e.getUniformLocation(t, n);
                  const s = { ...h, name: n, location: u };
                  r.push(s);
                }
            }
            return r;
          })(e, t);
          let s = 0;
          for (const a of i)
            if (lu(a.type)) {
              const { viewDimension: e, sampleType: t } = uu(a.type);
              (r.bindings.push({
                type: "texture",
                name: a.name,
                group: 0,
                location: s,
                viewDimension: e,
                sampleType: t,
              }),
                (a.textureUnit = s),
                (s += 1));
            }
          i.length && (r.uniforms = i);
          const o = (function (e, t) {
            const r = [],
              n = e.getProgramParameter(t, 35971);
            for (let i = 0; i < n; i++) {
              const n = e.getTransformFeedbackVarying(t, i);
              if (!n) throw new Error("activeInfo");
              const { name: s, type: o, size: a } = n,
                { type: c, components: l } = hs(cu(o));
              r.push({ location: i, name: s, type: c, size: a * l });
            }
            return (r.sort((e, t) => e.location - t.location), r);
          })(e, t);
          return (o?.length && (r.varyings = o), r);
        })(this.device.gl, this.handle)),
        Bn.timeEnd(
          3,
          `RenderPipeline ${this.id} - shaderLayout introspection`,
        )());
    }
    destroy() {
      this.destroyed ||
        (this.device.gl.useProgram(null),
        this.device.gl.deleteProgram(this.handle),
        (this.handle.destroyed = !0),
        this.destroyResource());
    }
    async _linkShaders() {
      const { gl: e } = this.device;
      if (
        (e.attachShader(this.handle, this.vs.handle),
        e.attachShader(this.handle, this.fs.handle),
        Bn.time(4, `linkProgram for ${this.id}`)(),
        e.linkProgram(this.handle),
        Bn.timeEnd(4, `linkProgram for ${this.id}`)(),
        !this.device.features.has("compilation-status-async-webgl"))
      ) {
        const e = this._getLinkStatus();
        return void this._reportLinkStatus(e);
      }
      (Bn.once(1, "RenderPipeline linking is asynchronous")(),
        await this._waitForLinkComplete(),
        Bn.info(
          2,
          `RenderPipeline ${this.id} - async linking complete: ${this.linkStatus}`,
        )());
      const t = this._getLinkStatus();
      this._reportLinkStatus(t);
    }
    async _reportLinkStatus(e) {
      if ("success" !== e) {
        const t = "link-error" === e ? "Link error" : "Validation error";
        switch (this.vs.compilationStatus) {
          case "error":
            throw (
              this.vs.debugShader(),
              new Error(`${this} ${t} during compilation of ${this.vs}`)
            );
          case "pending":
            (await this.vs.asyncCompilationStatus, this.vs.debugShader());
        }
        switch (this.fs?.compilationStatus) {
          case "error":
            throw (
              this.fs.debugShader(),
              new Error(`${this} ${t} during compilation of ${this.fs}`)
            );
          case "pending":
            (await this.fs.asyncCompilationStatus, this.fs.debugShader());
        }
        const r = this.device.gl.getProgramInfoLog(this.handle);
        (this.device.reportError(new Error(`${t} during ${e}: ${r}`), this)(),
          this.device.debug());
      }
    }
    _getLinkStatus() {
      const { gl: e } = this.device;
      return e.getProgramParameter(this.handle, 35714)
        ? (this._initializeSamplerUniforms(),
          e.validateProgram(this.handle),
          e.getProgramParameter(this.handle, 35715)
            ? ((this.linkStatus = "success"), "success")
            : ((this.linkStatus = "error"), "validation-error"))
        : ((this.linkStatus = "error"), "link-error");
    }
    _initializeSamplerUniforms() {
      const { gl: e } = this.device;
      e.useProgram(this.handle);
      let t = 0;
      const r = e.getProgramParameter(this.handle, 35718);
      for (let n = 0; n < r; n++) {
        const r = e.getActiveUniform(this.handle, n);
        if (r && lu(r.type)) {
          const n = r.name.endsWith("[0]"),
            i = n ? r.name.slice(0, -3) : r.name,
            s = e.getUniformLocation(this.handle, i);
          null !== s && (t = this._assignSamplerUniform(s, r, n, t));
        }
      }
    }
    _assignSamplerUniform(e, t, r, n) {
      const { gl: i } = this.device;
      if (r && t.size > 1) {
        const r = Int32Array.from({ length: t.size }, (e, t) => n + t);
        return (i.uniform1iv(e, r), n + t.size);
      }
      return (i.uniform1i(e, n), n + 1);
    }
    async _waitForLinkComplete() {
      const e = async (e) => await new Promise((t) => setTimeout(t, e));
      if (!this.device.features.has("compilation-status-async-webgl"))
        return void (await e(10));
      const { gl: t } = this.device;
      for (;;) {
        if (t.getProgramParameter(this.handle, 37297)) return;
        await e(10);
      }
    }
  },
  mu = class extends us {
    device;
    handle = null;
    commands = [];
    constructor(e, t = {}) {
      (super(e, t), (this.device = e));
    }
    _executeCommands(e = this.commands) {
      for (const t of e)
        switch (t.name) {
          case "copy-buffer-to-buffer":
            _u(this.device, t.options);
            break;
          case "copy-buffer-to-texture":
            Eu(this.device, t.options);
            break;
          case "copy-texture-to-buffer":
            bu(this.device, t.options);
            break;
          case "copy-texture-to-texture":
            yu(this.device, t.options);
            break;
          default:
            throw new Error(t.name);
        }
    }
  };
function _u(e, t) {
  const r = t.sourceBuffer,
    n = t.destinationBuffer;
  (e.gl.bindBuffer(36662, r.handle),
    e.gl.bindBuffer(36663, n.handle),
    e.gl.copyBufferSubData(
      36662,
      36663,
      t.sourceOffset ?? 0,
      t.destinationOffset ?? 0,
      t.size,
    ),
    e.gl.bindBuffer(36662, null),
    e.gl.bindBuffer(36663, null));
}
function Eu(e, t) {
  throw new Error("copyBufferToTexture is not supported in WebGL");
}
function bu(e, t) {
  const {
    sourceTexture: r,
    mipLevel: n = 0,
    aspect: i = "all",
    width: s = t.sourceTexture.width,
    height: o = t.sourceTexture.height,
    depthOrArrayLayers: a,
    origin: c = [0, 0, 0],
    destinationBuffer: l,
    byteOffset: u = 0,
    bytesPerRow: h,
    rowsPerImage: d,
  } = t;
  if (r instanceof ji)
    return void r.readBuffer(
      {
        x: c[0] ?? 0,
        y: c[1] ?? 0,
        z: c[2] ?? 0,
        width: s,
        height: o,
        depthOrArrayLayers: a,
        mipLevel: n,
        aspect: i,
        byteOffset: u,
      },
      l,
    );
  if ("all" !== i) throw new Error("aspect not supported in WebGL");
  if (0 !== n || void 0 !== a || h || d) throw new Error("not implemented");
  const { framebuffer: f, destroyFramebuffer: p } = Tu(r);
  let g;
  try {
    const t = l,
      r = s || f.width,
      n = o || f.height,
      i = Nl(Ui(f.colorAttachments[0]).texture.props.format),
      a = i.format,
      h = i.type;
    (e.gl.bindBuffer(35051, t.handle),
      (g = e.gl.bindFramebuffer(36160, f.handle)),
      e.gl.readPixels(c[0], c[1], r, n, a, h, u));
  } finally {
    (e.gl.bindBuffer(35051, null),
      void 0 !== g && e.gl.bindFramebuffer(36160, g),
      p && f.destroy());
  }
}
function yu(e, t) {
  const {
    sourceTexture: r,
    destinationMipLevel: n = 0,
    origin: i = [0, 0],
    destinationOrigin: s = [0, 0, 0],
    destinationTexture: o,
  } = t;
  let {
    width: a = t.destinationTexture.width,
    height: c = t.destinationTexture.height,
  } = t;
  const { framebuffer: l, destroyFramebuffer: u } = Tu(r),
    [h = 0, d = 0] = i,
    [f, p, g] = s,
    m = e.gl.bindFramebuffer(36160, l.handle);
  let _, E;
  if (!(o instanceof ru)) throw new Error("invalid destination");
  switch (
    ((_ = o),
    (a = Number.isFinite(a) ? a : _.width),
    (c = Number.isFinite(c) ? c : _.height),
    _._bind(0),
    (E = _.glTarget),
    E)
  ) {
    case 3553:
    case 34067:
      e.gl.copyTexSubImage2D(E, n, f, p, h, d, a, c);
      break;
    case 35866:
    case 32879:
      e.gl.copyTexSubImage3D(E, n, f, p, g, h, d, a, c);
  }
  (_ && _._unbind(), e.gl.bindFramebuffer(36160, m), u && l.destroy());
}
function Tu(e) {
  if (e instanceof ji) {
    const { width: t, height: r, id: n } = e;
    return {
      framebuffer: e.device.createFramebuffer({
        id: `framebuffer-for-${n}`,
        width: t,
        height: r,
        colorAttachments: [e],
      }),
      destroyFramebuffer: !0,
    };
  }
  return { framebuffer: e, destroyFramebuffer: !1 };
}
var Au = [1, 2, 4, 8],
  Ru = class extends cs {
    device;
    handle = null;
    glParameters = {};
    constructor(e, t) {
      (super(e, t), (this.device = e));
      const r = this.props.framebuffer,
        n = !r || null === r.handle;
      let i;
      if (
        (n && e.getDefaultCanvasContext()._resizeDrawingBufferIfNeeded(),
        !t?.parameters?.viewport)
      )
        if (!n && r) {
          const { width: e, height: t } = r;
          i = [0, 0, e, t];
        } else {
          const [t, r] = e.getDefaultCanvasContext().getDrawingBufferSize();
          i = [0, 0, t, r];
        }
      if (
        (this.device.pushState(),
        this.setParameters({ viewport: i, ...this.props.parameters }),
        !n && r?.colorAttachments.length)
      ) {
        const e = r.colorAttachments.map((e, t) => 36064 + t);
        this.device.gl.drawBuffers(e);
      } else n && this.device.gl.drawBuffers([1029]);
      (this.clear(),
        this.props.timestampQuerySet &&
          void 0 !== this.props.beginTimestampIndex &&
          this.props.timestampQuerySet.writeTimestamp(
            this.props.beginTimestampIndex,
          ));
    }
    end() {
      this.destroyed ||
        (this.props.timestampQuerySet &&
          void 0 !== this.props.endTimestampIndex &&
          this.props.timestampQuerySet.writeTimestamp(
            this.props.endTimestampIndex,
          ),
        this.device.popState(),
        this.destroy());
    }
    pushDebugGroup(e) {}
    popDebugGroup() {}
    insertDebugMarker(e) {}
    setParameters(e = {}) {
      const t = { ...this.glParameters };
      ((t.framebuffer = this.props.framebuffer || null),
        this.props.depthReadOnly && (t.depthMask = !this.props.depthReadOnly),
        (t.stencilMask = this.props.stencilReadOnly ? 0 : 1),
        (t[35977] = this.props.discard),
        e.viewport &&
          (e.viewport.length >= 6
            ? ((t.viewport = e.viewport.slice(0, 4)),
              (t.depthRange = [e.viewport[4], e.viewport[5]]))
            : (t.viewport = e.viewport)),
        e.scissorRect && ((t.scissorTest = !0), (t.scissor = e.scissorRect)),
        e.blendConstant && (t.blendColor = e.blendConstant),
        void 0 !== e.stencilReference &&
          ((t[2967] = e.stencilReference), (t[36003] = e.stencilReference)),
        "colorMask" in e &&
          (t.colorMask = Au.map((t) => Boolean(t & e.colorMask))),
        (this.glParameters = t),
        il(this.device.gl, t));
    }
    beginOcclusionQuery(e) {
      this.props.occlusionQuerySet?.beginOcclusionQuery();
    }
    endOcclusionQuery() {
      this.props.occlusionQuerySet?.endOcclusionQuery();
    }
    clear() {
      const e = { ...this.glParameters };
      let t = 0;
      (this.props.clearColors &&
        this.props.clearColors.forEach((e, t) => {
          e && this.clearColorBuffer(t, e);
        }),
        !1 !== this.props.clearColor &&
          void 0 === this.props.clearColors &&
          ((t |= 16384), (e.clearColor = this.props.clearColor)),
        !1 !== this.props.clearDepth &&
          ((t |= 256), (e.clearDepth = this.props.clearDepth)),
        !1 !== this.props.clearStencil &&
          ((t |= 1024), (e.clearStencil = this.props.clearStencil)),
        0 !== t &&
          Zl(this.device.gl, e, () => {
            this.device.gl.clear(t);
          }));
    }
    clearColorBuffer(e = 0, t = [0, 0, 0, 0]) {
      Zl(this.device.gl, { framebuffer: this.props.framebuffer }, () => {
        switch (t.constructor) {
          case Int8Array:
          case Int16Array:
          case Int32Array:
            this.device.gl.clearBufferiv(6144, e, t);
            break;
          case Uint8Array:
          case Uint8ClampedArray:
          case Uint16Array:
          case Uint32Array:
            this.device.gl.clearBufferuiv(6144, e, t);
            break;
          case Float32Array:
            this.device.gl.clearBufferfv(6144, e, t);
            break;
          default:
            throw new Error("clearColorBuffer: color must be typed array");
        }
      });
    }
  },
  vu = class extends ls {
    device;
    handle = null;
    commandBuffer;
    constructor(e, t) {
      (super(e, t),
        (this.device = e),
        (this.commandBuffer = new mu(e, {
          id: `${this.props.id}-command-buffer`,
        })));
    }
    destroy() {
      this.destroyResource();
    }
    finish(e) {
      return (
        e?.id &&
          this.commandBuffer.id !== e.id &&
          ((this.commandBuffer.id = e.id),
          (this.commandBuffer.props.id = e.id)),
        this.destroy(),
        this.commandBuffer
      );
    }
    beginRenderPass(e = {}) {
      return new Ru(this.device, this._applyTimeProfilingToPassProps(e));
    }
    beginComputePass(e = {}) {
      throw new Error("ComputePass not supported in WebGL");
    }
    copyBufferToBuffer(e) {
      this.commandBuffer.commands.push({
        name: "copy-buffer-to-buffer",
        options: e,
      });
    }
    copyBufferToTexture(e) {
      this.commandBuffer.commands.push({
        name: "copy-buffer-to-texture",
        options: e,
      });
    }
    copyTextureToBuffer(e) {
      this.commandBuffer.commands.push({
        name: "copy-texture-to-buffer",
        options: e,
      });
    }
    copyTextureToTexture(e) {
      this.commandBuffer.commands.push({
        name: "copy-texture-to-texture",
        options: e,
      });
    }
    pushDebugGroup(e) {}
    popDebugGroup() {}
    insertDebugMarker(e) {}
    resolveQuerySet(e, t, r) {
      throw new Error("resolveQuerySet is not supported in WebGL");
    }
    writeTimestamp(e, t) {
      e.writeTimestamp(t);
    }
  },
  Su = class e extends Rs {
    get [Symbol.toStringTag]() {
      return "VertexArray";
    }
    device;
    handle;
    buffer = null;
    bufferValue = null;
    static isConstantAttributeZeroSupported(e) {
      return (
        "Chrome" ==
        (c()
          ? a(t)
            ? "Electron"
            : (o.userAgent || "").indexOf("Edge") > -1
              ? "Edge"
              : globalThis.chrome
                ? "Chrome"
                : globalThis.safari
                  ? "Safari"
                  : globalThis.mozInnerScreenX
                    ? "Firefox"
                    : "Unknown"
          : "Node")
      );
      var t;
    }
    constructor(e, t) {
      (super(e, t),
        (this.device = e),
        (this.handle = this.device.gl.createVertexArray()));
    }
    destroy() {
      (super.destroy(),
        this.buffer && this.buffer?.destroy(),
        this.handle &&
          (this.device.gl.deleteVertexArray(this.handle),
          (this.handle = void 0)));
    }
    setIndexBuffer(e) {
      const t = e;
      if (t && 34963 !== t.glTarget) throw new Error("Use .setBuffer()");
      (this.device.gl.bindVertexArray(this.handle),
        this.device.gl.bindBuffer(34963, t ? t.handle : null),
        (this.indexBuffer = t),
        this.device.gl.bindVertexArray(null));
    }
    setBuffer(e, t) {
      const r = t;
      if (34963 === r.glTarget) throw new Error("Use .setIndexBuffer()");
      const {
        size: n,
        type: i,
        stride: s,
        offset: o,
        normalized: a,
        integer: c,
        divisor: l,
      } = this._getAccessor(e);
      (this.device.gl.bindVertexArray(this.handle),
        this.device.gl.bindBuffer(34962, r.handle),
        c
          ? this.device.gl.vertexAttribIPointer(e, n, i, s, o)
          : this.device.gl.vertexAttribPointer(e, n, i, a, s, o),
        this.device.gl.bindBuffer(34962, null),
        this.device.gl.enableVertexAttribArray(e),
        this.device.gl.vertexAttribDivisor(e, l || 0),
        (this.attributes[e] = r),
        this.device.gl.bindVertexArray(null));
    }
    setConstantWebGL(e, t) {
      (this._enable(e, !1), (this.attributes[e] = t));
    }
    bindBeforeRender() {
      (this.device.gl.bindVertexArray(this.handle),
        this._applyConstantAttributes());
    }
    unbindAfterRender() {
      this.device.gl.bindVertexArray(null);
    }
    _applyConstantAttributes() {
      for (let e = 0; e < this.maxVertexAttributes; ++e) {
        const t = this.attributes[e];
        ArrayBuffer.isView(t) && this.device.setConstantAttributeWebGL(e, t);
      }
    }
    _getAccessor(e) {
      const t = this.attributeInfos[e];
      if (!t) throw new Error(`Unknown attribute location ${e}`);
      const r = pl(t.bufferDataType);
      return {
        size: t.bufferComponents,
        type: r,
        stride: t.byteStride,
        offset: t.byteOffset,
        normalized: t.normalized,
        integer: t.integer,
        divisor: "instance" === t.stepMode ? 1 : 0,
      };
    }
    _enable(t, r = !0) {
      const n = e.isConstantAttributeZeroSupported(this.device) || 0 !== t;
      (r || n) &&
        ((t = Number(t)),
        this.device.gl.bindVertexArray(this.handle),
        r
          ? this.device.gl.enableVertexAttribArray(t)
          : this.device.gl.disableVertexAttribArray(t),
        this.device.gl.bindVertexArray(null));
    }
    getConstantBuffer(e, t) {
      const r = ((n = t), Array.isArray(n) ? new Float32Array(n) : n);
      var n;
      const i = r.byteLength * e,
        s = r.length * e;
      if (this.buffer && i !== this.buffer.byteLength)
        throw new Error(
          `Buffer size is immutable, byte length ${i} !== ${this.buffer.byteLength}.`,
        );
      let o = !this.buffer;
      if (
        ((this.buffer =
          this.buffer || this.device.createBuffer({ byteLength: i })),
        (o ||= !(function (e, t) {
          if (
            !e ||
            !t ||
            e.length !== t.length ||
            e.constructor !== t.constructor
          )
            return !1;
          for (let r = 0; r < e.length; ++r) if (e[r] !== t[r]) return !1;
          return !0;
        })(r, this.bufferValue)),
        o)
      ) {
        const e = (function (e, t) {
          return new e(ks(e.BYTES_PER_ELEMENT * t), 0, t);
        })(t.constructor, s);
        (!(function (e) {
          const { target: t, source: r, start: n = 0, count: i = 1 } = e,
            s = r.length,
            o = i * s;
          let a = 0;
          for (let c = n; a < s; a++) t[c++] = r[a] ?? 0;
          for (; a < o; )
            a < o - a
              ? (t.copyWithin(n + a, n, n + a), (a *= 2))
              : (t.copyWithin(n + a, n, n + o - a), (a = o));
        })({ target: e, source: r, start: 0, count: s }),
          this.buffer.write(e),
          (this.bufferValue = t));
      }
      return this.buffer;
    }
  },
  Cu = class extends vs {
    device;
    gl;
    handle;
    layout;
    buffers = {};
    unusedBuffers = {};
    bindOnUse = !0;
    _bound = !1;
    constructor(e, t) {
      (super(e, t),
        (this.device = e),
        (this.gl = e.gl),
        (this.handle = this.props.handle || this.gl.createTransformFeedback()),
        (this.layout = this.props.layout),
        t.buffers && this.setBuffers(t.buffers),
        Object.seal(this));
    }
    destroy() {
      (this.gl.deleteTransformFeedback(this.handle), super.destroy());
    }
    begin(e = "point-list") {
      (this.gl.bindTransformFeedback(36386, this.handle),
        this.bindOnUse && this._bindBuffers(),
        this.gl.beginTransformFeedback(
          (function (e) {
            switch (e) {
              case "point-list":
                return 0;
              case "line-list":
              case "line-strip":
                return 1;
              case "triangle-list":
              case "triangle-strip":
                return 4;
              default:
                throw new Error(e);
            }
          })(e),
        ));
    }
    end() {
      (this.gl.endTransformFeedback(),
        this.bindOnUse && this._unbindBuffers(),
        this.gl.bindTransformFeedback(36386, null));
    }
    setBuffers(e) {
      ((this.buffers = {}),
        (this.unusedBuffers = {}),
        this.bind(() => {
          for (const [t, r] of Object.entries(e)) this.setBuffer(t, r);
        }));
    }
    setBuffer(e, t) {
      const r = this._getVaryingIndex(e),
        { buffer: n, byteLength: i, byteOffset: s } = this._getBufferRange(t);
      if (r < 0)
        return (
          (this.unusedBuffers[e] = n),
          void Bn.warn(`${this.id} unusedBuffers varying buffer ${e}`)()
        );
      ((this.buffers[r] = { buffer: n, byteLength: i, byteOffset: s }),
        this.bindOnUse || this._bindBuffer(r, n, s, i));
    }
    getBuffer(e) {
      if (wu(e)) return this.buffers[e] || null;
      const t = this._getVaryingIndex(e);
      return this.buffers[t] ?? null;
    }
    bind(e = this.handle) {
      if ("function" != typeof e)
        return (this.gl.bindTransformFeedback(36386, e), this);
      let t;
      return (
        this._bound
          ? (t = e())
          : (this.gl.bindTransformFeedback(36386, this.handle),
            (this._bound = !0),
            (t = e()),
            (this._bound = !1),
            this.gl.bindTransformFeedback(36386, null)),
        t
      );
    }
    unbind() {
      this.bind(null);
    }
    _getBufferRange(e) {
      if (e instanceof kl)
        return { buffer: e, byteOffset: 0, byteLength: e.byteLength };
      const {
        buffer: t,
        byteOffset: r = 0,
        byteLength: n = e.buffer.byteLength,
      } = e;
      return { buffer: t, byteOffset: r, byteLength: n };
    }
    _getVaryingIndex(e) {
      if (wu(e)) return Number(e);
      for (const t of this.layout.varyings || [])
        if (e === t.name) return t.location;
      return -1;
    }
    _bindBuffers() {
      for (const [e, t] of Object.entries(this.buffers)) {
        const {
          buffer: r,
          byteLength: n,
          byteOffset: i,
        } = this._getBufferRange(t);
        this._bindBuffer(Number(e), r, i, n);
      }
    }
    _unbindBuffers() {
      for (const e in this.buffers)
        this.gl.bindBufferBase(35982, Number(e), null);
    }
    _bindBuffer(e, t, r = 0, n) {
      const i = t && t.handle;
      i && void 0 !== n
        ? this.gl.bindBufferRange(35982, e, i, r, n)
        : this.gl.bindBufferBase(35982, e, i);
    }
  };
function wu(e) {
  return "number" == typeof e ? Number.isInteger(e) : /^\d+$/.test(e);
}
var Lu = class extends Ss {
    device;
    handle;
    _timestampPairs = [];
    _pendingReads = new Set();
    _occlusionQuery = null;
    _occlusionActive = !1;
    get [Symbol.toStringTag]() {
      return "QuerySet";
    }
    constructor(e, t) {
      if ((super(e, t), (this.device = e), "timestamp" === t.type)) {
        if (t.count < 2)
          throw new Error(
            "Timestamp QuerySet requires at least two query slots",
          );
        ((this._timestampPairs = new Array(Math.ceil(t.count / 2))
          .fill(null)
          .map(() => ({ activeQuery: null, completedQueries: [] }))),
          (this.handle = null));
      } else {
        if (t.count > 1)
          throw new Error("WebGL occlusion QuerySet can only have one value");
        const e = this.device.gl.createQuery();
        if (!e) throw new Error("WebGL query not supported");
        this.handle = e;
      }
      Object.seal(this);
    }
    destroy() {
      if (!this.destroyed) {
        this.handle && this.device.gl.deleteQuery(this.handle);
        for (const e of this._timestampPairs) {
          e.activeQuery &&
            (this._cancelPendingQuery(e.activeQuery),
            this.device.gl.deleteQuery(e.activeQuery.handle));
          for (const t of e.completedQueries)
            (this._cancelPendingQuery(t), this.device.gl.deleteQuery(t.handle));
        }
        this._occlusionQuery &&
          (this._cancelPendingQuery(this._occlusionQuery),
          this.device.gl.deleteQuery(this._occlusionQuery.handle));
        for (const e of Array.from(this._pendingReads))
          this._cancelPendingQuery(e);
        this.destroyResource();
      }
    }
    isResultAvailable(e) {
      return "timestamp" === this.props.type
        ? void 0 === e
          ? this._timestampPairs.some((e, t) =>
              this._isTimestampPairAvailable(t),
            )
          : this._isTimestampPairAvailable(this._getTimestampPairIndex(e))
        : !!this._occlusionQuery &&
            this._pollQueryAvailability(this._occlusionQuery);
    }
    async readResults(e) {
      const t = e?.firstQuery || 0,
        r = e?.queryCount || this.props.count - t;
      if ((this._validateRange(t, r), "timestamp" === this.props.type)) {
        const e = new Array(r).fill(0n),
          n = Math.floor(t / 2),
          i = Math.floor((t + r - 1) / 2);
        for (let s = n; s <= i; s++) {
          const n = await this._consumeTimestampPairResult(s),
            i = 2 * s,
            o = i + 1;
          (i >= t && i < t + r && (e[i - t] = 0n),
            o >= t && o < t + r && (e[o - t] = n));
        }
        return e;
      }
      if (!this._occlusionQuery)
        throw new Error("Occlusion query has not been started");
      return [await this._consumeQueryResult(this._occlusionQuery)];
    }
    async readTimestampDuration(e, t) {
      if ("timestamp" !== this.props.type)
        throw new Error("Timestamp durations require a timestamp QuerySet");
      if (e < 0 || t >= this.props.count || t <= e)
        throw new Error("Timestamp duration range is out of bounds");
      if (e % 2 != 0 || t !== e + 1)
        throw new Error(
          "WebGL timestamp durations require adjacent even/odd query indices",
        );
      const r = await this._consumeTimestampPairResult(
        this._getTimestampPairIndex(e),
      );
      return Number(r) / 1e6;
    }
    beginOcclusionQuery() {
      if ("occlusion" !== this.props.type)
        throw new Error("Occlusion queries require an occlusion QuerySet");
      if (!this.handle)
        throw new Error("WebGL occlusion query is not available");
      if (this._occlusionActive)
        throw new Error("Occlusion query is already active");
      (this.device.gl.beginQuery(35887, this.handle),
        (this._occlusionQuery = {
          handle: this.handle,
          promise: null,
          result: null,
          disjoint: !1,
          cancelled: !1,
          pollRequestId: null,
          resolve: null,
          reject: null,
        }),
        (this._occlusionActive = !0));
    }
    endOcclusionQuery() {
      if (!this._occlusionActive)
        throw new Error("Occlusion query is not active");
      (this.device.gl.endQuery(35887), (this._occlusionActive = !1));
    }
    writeTimestamp(e) {
      if ("timestamp" !== this.props.type)
        throw new Error("Timestamp writes require a timestamp QuerySet");
      const t = this._getTimestampPairIndex(e),
        r = this._timestampPairs[t];
      if (e % 2 == 0) {
        if (r.activeQuery)
          throw new Error("Timestamp query pair is already active");
        const e = this.device.gl.createQuery();
        if (!e) throw new Error("WebGL query not supported");
        const t = {
          handle: e,
          promise: null,
          result: null,
          disjoint: !1,
          cancelled: !1,
          pollRequestId: null,
          resolve: null,
          reject: null,
        };
        return (this.device.gl.beginQuery(35007, e), void (r.activeQuery = t));
      }
      if (!r.activeQuery)
        throw new Error("Timestamp query pair was ended before it was started");
      (this.device.gl.endQuery(35007),
        r.completedQueries.push(r.activeQuery),
        (r.activeQuery = null));
    }
    _validateRange(e, t) {
      if (e < 0 || t < 0 || e + t > this.props.count)
        throw new Error("Query read range is out of bounds");
    }
    _getTimestampPairIndex(e) {
      if (e < 0 || e >= this.props.count)
        throw new Error("Query index is out of bounds");
      return Math.floor(e / 2);
    }
    _isTimestampPairAvailable(e) {
      const t = this._timestampPairs[e];
      return (
        !(!t || 0 === t.completedQueries.length) &&
        this._pollQueryAvailability(t.completedQueries[0])
      );
    }
    _pollQueryAvailability(e) {
      if (e.cancelled || this.destroyed) return ((e.result = 0n), !0);
      if (null !== e.result || e.disjoint) return !0;
      if (!this.device.gl.getQueryParameter(e.handle, 34919)) return !1;
      const t = Boolean(this.device.gl.getParameter(36795));
      return (
        (e.disjoint = t),
        (e.result = t
          ? 0n
          : BigInt(this.device.gl.getQueryParameter(e.handle, 34918))),
        !0
      );
    }
    async _consumeTimestampPairResult(e) {
      const t = this._timestampPairs[e];
      if (!t || 0 === t.completedQueries.length)
        throw new Error("Timestamp query pair has no completed result");
      const r = t.completedQueries.shift();
      try {
        return await this._consumeQueryResult(r);
      } finally {
        this.device.gl.deleteQuery(r.handle);
      }
    }
    _consumeQueryResult(e) {
      return (
        e.promise ||
          (this._pendingReads.add(e),
          (e.promise = new Promise((t, r) => {
            ((e.resolve = t), (e.reject = r));
            const n = () => {
              if (((e.pollRequestId = null), e.cancelled || this.destroyed))
                return (
                  this._pendingReads.delete(e),
                  (e.promise = null),
                  (e.resolve = null),
                  (e.reject = null),
                  void t(0n)
                );
              this._pollQueryAvailability(e)
                ? (this._pendingReads.delete(e),
                  (e.promise = null),
                  (e.resolve = null),
                  (e.reject = null),
                  e.disjoint
                    ? r(
                        new Error(
                          "GPU timestamp query was invalidated by a disjoint event",
                        ),
                      )
                    : t(e.result || 0n))
                : (e.pollRequestId = this._requestAnimationFrame(n));
            };
            n();
          }))),
        e.promise
      );
    }
    _cancelPendingQuery(e) {
      if (
        (this._pendingReads.delete(e),
        (e.cancelled = !0),
        null !== e.pollRequestId &&
          (this._cancelAnimationFrame(e.pollRequestId),
          (e.pollRequestId = null)),
        e.resolve)
      ) {
        const t = e.resolve;
        ((e.promise = null), (e.resolve = null), (e.reject = null), t(0n));
      }
    }
    _requestAnimationFrame(e) {
      return requestAnimationFrame(e);
    }
    _cancelAnimationFrame(e) {
      cancelAnimationFrame(e);
    }
  },
  Ou = class extends Cs {
    device;
    gl;
    handle;
    signaled;
    _signaled = !1;
    constructor(e, t = {}) {
      (super(e, {}), (this.device = e), (this.gl = e.gl));
      const r =
        this.props.handle ||
        this.gl.fenceSync(this.gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      if (!r) throw new Error("Failed to create WebGL fence");
      ((this.handle = r),
        (this.signaled = new Promise((e) => {
          const t = () => {
            const r = this.gl.clientWaitSync(this.handle, 0, 0);
            r === this.gl.ALREADY_SIGNALED || r === this.gl.CONDITION_SATISFIED
              ? ((this._signaled = !0), e())
              : setTimeout(t, 1);
          };
          t();
        })));
    }
    isSignaled() {
      if (this._signaled) return !0;
      const e = this.gl.getSyncParameter(this.handle, this.gl.SYNC_STATUS);
      return ((this._signaled = e === this.gl.SIGNALED), this._signaled);
    }
    destroy() {
      this.destroyed || this.gl.deleteSync(this.handle);
    }
  };
function Nu(e) {
  switch (e) {
    case 6406:
    case 33326:
    case 6403:
    case 36244:
      return 1;
    case 33339:
    case 33340:
    case 33328:
    case 33320:
    case 33319:
      return 2;
    case 6407:
    case 36248:
    case 34837:
      return 3;
    case 6408:
    case 36249:
    case 34836:
      return 4;
    default:
      return 0;
  }
}
function xu(e) {
  return e instanceof Ji
    ? { framebuffer: e, deleteFramebuffer: !1 }
    : { framebuffer: Pu(e), deleteFramebuffer: !0 };
}
function Pu(e, t) {
  const { device: r, width: n, height: i, id: s } = e;
  return r.createFramebuffer({
    ...t,
    id: `framebuffer-for-${s}`,
    width: n,
    height: i,
    colorAttachments: [e],
  });
}
var Iu = e({ WebGLDevice: () => Mu }),
  Mu = class e extends wi {
    static getDeviceFromContext(e) {
      return e ? (e.luma?.device ?? null) : null;
    }
    type = "webgl";
    handle;
    features;
    limits;
    info;
    canvasContext;
    preferredColorFormat = "rgba8unorm";
    preferredDepthFormat = "depth24plus";
    commandEncoder;
    lost;
    _resolveContextLost;
    gl;
    _constants;
    extensions;
    _polyfilled = !1;
    spectorJS;
    get [Symbol.toStringTag]() {
      return "WebGLDevice";
    }
    toString() {
      return `${this[Symbol.toStringTag]}(${this.id})`;
    }
    isVertexFormatSupported(e) {
      return "unorm8x4-bgra" !== e;
    }
    constructor(t) {
      super({ ...t, id: t.id || Gl("webgl-device") });
      const r = wi._getCanvasContextProps(t);
      if (!r)
        throw new Error(
          "WebGLDevice requires props.createCanvasContext to be set",
        );
      const n = r.canvas?.gl ?? null;
      let i = e.getDeviceFromContext(n);
      if (i)
        throw new Error(`WebGL context already attached to device ${i.id}`);
      ((this.canvasContext = new Dl(this, r)),
        (this.lost = new Promise((e) => {
          this._resolveContextLost = e;
        })));
      const s = { ...t.webgl };
      ("premultiplied" === r.alphaMode && (s.premultipliedAlpha = !0),
        void 0 !== t.powerPreference && (s.powerPreference = t.powerPreference),
        void 0 !== t.failIfMajorPerformanceCaveat &&
          (s.failIfMajorPerformanceCaveat = t.failIfMajorPerformanceCaveat));
      const o =
        this.props._handle ||
        (function (e, t, r) {
          let n = "";
          const i = (e) => {
            const t = e.statusMessage;
            t && (n ||= t);
          };
          e.addEventListener("webglcontextcreationerror", i, !1);
          const s = !0 !== r.failIfMajorPerformanceCaveat,
            o = {
              preserveDrawingBuffer: !0,
              ...r,
              failIfMajorPerformanceCaveat: !0,
            };
          let a = null;
          try {
            ((a ||= e.getContext("webgl2", o)),
              !a &&
                o.failIfMajorPerformanceCaveat &&
                (n ||=
                  "Only software GPU is available. Set `failIfMajorPerformanceCaveat: false` to allow."));
            let r = !1;
            if (
              (!a &&
                s &&
                ((o.failIfMajorPerformanceCaveat = !1),
                (a = e.getContext("webgl2", o)),
                (r = !0)),
              a ||
                ((a = e.getContext("webgl", {})),
                a && ((a = null), (n ||= "Your browser only supports WebGL1"))),
              !a)
            )
              throw (
                (n ||= "Your browser does not support WebGL"),
                new Error(`Failed to create WebGL context: ${n}`)
              );
            Pc(a).softwareRenderer = r;
            const { onContextLost: i, onContextRestored: c } = t;
            return (
              e.addEventListener("webglcontextlost", (e) => i(e), !1),
              e.addEventListener("webglcontextrestored", (e) => c(e), !1),
              a
            );
          } finally {
            e.removeEventListener("webglcontextcreationerror", i, !1);
          }
        })(
          this.canvasContext.canvas,
          {
            onContextLost: (e) =>
              this._resolveContextLost?.({
                reason: "destroyed",
                message:
                  "Entered sleep mode, or too many apps or browser tabs are using the GPU.",
              }),
            onContextRestored: (e) => {},
          },
          s,
        );
      if (!o) throw new Error("WebGL context creation failed");
      if (((i = e.getDeviceFromContext(o)), i)) {
        if (t._reuseDevices)
          return (
            Bn.log(
              1,
              `Not creating a new Device, instead returning a reference to Device ${i.id} already attached to WebGL context`,
              i,
            )(),
            this.canvasContext.destroy(),
            (i._reused = !0),
            i
          );
        throw new Error(`WebGL context already attached to device ${i.id}`);
      }
      ((this.handle = o),
        (this.gl = o),
        (this.spectorJS = (function (e) {
          if (!(e = { ...Bc, ...e }).debugSpectorJS) return null;
          if (!Ic && globalThis.SPECTOR && !globalThis.luma?.spector) {
            Bn.probe(
              1,
              "SPECTOR found and initialized. Start with `luma.spector.displayUI()`",
            )();
            const { Spector: e } = globalThis.SPECTOR;
            ((Ic = new e()), globalThis.luma && (globalThis.luma.spector = Ic));
          }
          if (!Ic) return null;
          if (
            (Mc ||
              ((Mc = !0),
              Ic.spyCanvases(),
              Ic?.onCaptureStarted.add((e) =>
                Bn.info("Spector capture started:", e)(),
              ),
              Ic?.onCapture.add((e) => {
                (Bn.info("Spector capture complete:", e)(),
                  Ic?.getResultUI(),
                  Ic?.resultView.display(),
                  Ic?.resultView.addCapture(e));
              })),
            e.gl)
          ) {
            const t = Pc(e.gl),
              r = t.device;
            (Ic?.startCapture(e.gl, 500),
              (t.device = r),
              new Promise((e) => setTimeout(e, 2e3)).then((e) => {
                (Bn.info("Spector capture stopped after 2 seconds")(),
                  Ic?.stopCapture());
              }));
          }
          return Ic;
        })({ ...this.props, gl: this.handle })));
      const a = Pc(this.handle);
      ((a.device = this),
        a.extensions || (a.extensions = {}),
        (this.extensions = a.extensions),
        (this.info = (function (e, t) {
          const r = e.getParameter(7936),
            n = e.getParameter(7937);
          hl(e, "WEBGL_debug_renderer_info", t);
          const i = t.WEBGL_debug_renderer_info,
            s = e.getParameter(i ? i.UNMASKED_VENDOR_WEBGL : 7936) || r,
            o = e.getParameter(i ? i.UNMASKED_RENDERER_WEBGL : 7937) || n,
            a = e.getParameter(7938),
            c = dl(s, o),
            l = (function (e, t) {
              return /Metal/i.exec(e) || /Metal/i.exec(t)
                ? "metal"
                : /ANGLE/i.exec(e) || /ANGLE/i.exec(t)
                  ? "opengl"
                  : "unknown";
            })(s, o);
          return {
            type: "webgl",
            gpu: c,
            gpuType: fl(s, o),
            gpuBackend: l,
            vendor: s,
            renderer: o,
            version: a,
            shadingLanguage: "glsl",
            shadingLanguageVersion: 300,
          };
        })(this.gl, this.extensions)),
        (this.limits = new Ml(this.gl)),
        (this.features = new Il(
          this.gl,
          this.extensions,
          this.props._disabledFeatures,
        )),
        this.props._initializeFeatures && this.features.initializeFeatures(),
        new cl(this.gl, { log: (...e) => Bn.log(1, ...e)() }).trackState(
          this.gl,
          { copyState: !1 },
        ),
        (t.debug || t.debugWebGL) &&
          ((this.gl = Fc(this.gl, {
            debugWebGL: !0,
            traceWebGL: t.debugWebGL,
          })),
          Bn.warn("WebGL debug mode activated. Performance reduced.")()),
        t.debugWebGL && (Bn.level = Math.max(Bn.level, 1)),
        (this.commandEncoder = new vu(this, { id: `${this}-command-encoder` })),
        this.canvasContext._startObservers());
    }
    destroy() {
      (this.commandEncoder?.destroy(),
        this.props._reuseDevices ||
          this._reused ||
          (Pc(this.handle).device = null));
    }
    get isLost() {
      return this.gl.isContextLost();
    }
    createCanvasContext(e) {
      throw new Error("WebGL only supports a single canvas");
    }
    createPresentationContext(e) {
      return new Fl(this, e || {});
    }
    createBuffer(e) {
      const t = this._normalizeBufferProps(e);
      return new kl(this, t);
    }
    createTexture(e) {
      return new ru(this, e);
    }
    createExternalTexture(e) {
      throw new Error("createExternalTexture() not implemented");
    }
    createSampler(e) {
      return new ql(this, e);
    }
    createShader(e) {
      return new $l(this, e);
    }
    createFramebuffer(e) {
      return new Bl(this, e);
    }
    createVertexArray(e) {
      return new Su(this, e);
    }
    createTransformFeedback(e) {
      return new Cu(this, e);
    }
    createQuerySet(e) {
      return new Lu(this, e);
    }
    createFence() {
      return new Ou(this);
    }
    createRenderPipeline(e) {
      return new su(this, e);
    }
    _createSharedRenderPipelineWebGL(e) {
      return new gu(this, e);
    }
    createComputePipeline(e) {
      throw new Error("ComputePipeline not supported in WebGL");
    }
    createCommandEncoder(e = {}) {
      return new vu(this, e);
    }
    submit(e) {
      let t = null;
      e ||
        ({ submittedCommandEncoder: t, commandBuffer: e } =
          this._finalizeDefaultCommandEncoderForSubmit());
      try {
        (e._executeCommands(),
          t &&
            t
              .resolveTimeProfilingQuerySet()
              .then(() => {
                this.commandEncoder._gpuTimeMs = t._gpuTimeMs;
              })
              .catch(() => {}));
      } finally {
        e.destroy();
      }
    }
    _finalizeDefaultCommandEncoderForSubmit() {
      const e = this.commandEncoder,
        t = e.finish();
      return (
        this.commandEncoder.destroy(),
        (this.commandEncoder = this.createCommandEncoder({
          id: e.props.id,
          timeProfilingQuerySet: e.getTimeProfilingQuerySet(),
        })),
        { submittedCommandEncoder: e, commandBuffer: t }
      );
    }
    readPixelsToArrayWebGL(e, t) {
      return (function (e, t) {
        const {
          sourceX: r = 0,
          sourceY: n = 0,
          sourceAttachment: i = 0,
        } = t || {};
        let {
          target: s = null,
          sourceWidth: o,
          sourceHeight: a,
          sourceDepth: c,
          sourceFormat: l,
          sourceType: u,
        } = t || {};
        const { framebuffer: h, deleteFramebuffer: d } = xu(e),
          { gl: f, handle: p } = h;
        ((o ||= h.width), (a ||= h.height));
        const g = h.colorAttachments[i]?.texture;
        if (!g) throw new Error(`Invalid framebuffer attachment ${i}`);
        ((c = g?.depth || 1),
          (l ||= g?.glFormat || 6408),
          (u ||= g?.glType || 5121),
          (s = (function (e, t, r, n, i) {
            if (e) return e;
            t ||= 5121;
            const s = eu(t);
            return new (Zn.getTypedArrayConstructor(s))(n * i * Nu(r));
          })(s, u, l, o, a)));
        const m = Zn.getDataType(s);
        u = u || fu[m];
        const _ = f.bindFramebuffer(36160, p);
        return (
          f.readBuffer(36064 + i),
          f.readPixels(r, n, o, a, l, u, s),
          f.readBuffer(36064),
          f.bindFramebuffer(36160, _ || null),
          d && h.destroy(),
          s
        );
      })(e, t);
    }
    readPixelsToBufferWebGL(e, t) {
      return (function (e, t) {
        const {
          target: r,
          sourceX: n = 0,
          sourceY: i = 0,
          sourceFormat: s = 6408,
          targetByteOffset: o = 0,
        } = t || {};
        let { sourceWidth: a, sourceHeight: c, sourceType: l } = t || {};
        const { framebuffer: u, deleteFramebuffer: h } = xu(e);
        ((a = a || u.width), (c = c || u.height));
        const d = u;
        l = l || 5121;
        let f = r;
        if (!f) {
          const e =
            o +
            a *
              c *
              Nu(s) *
              (function (e) {
                switch (e) {
                  case 5121:
                    return 1;
                  case 33635:
                  case 32819:
                  case 32820:
                    return 2;
                  case 5126:
                    return 4;
                  default:
                    return 0;
                }
              })(l);
          f = d.device.createBuffer({ byteLength: e });
        }
        const p = e.device.createCommandEncoder();
        return (
          p.copyTextureToBuffer({
            sourceTexture: e,
            width: a,
            height: c,
            origin: [n, i],
            destinationBuffer: f,
            byteOffset: o,
          }),
          p.destroy(),
          h && u.destroy(),
          f
        );
      })(e, t);
    }
    setParametersWebGL(e) {
      il(this.gl, e);
    }
    getParametersWebGL(e) {
      return sl(this.gl, e);
    }
    withParametersWebGL(e, t) {
      return Zl(this.gl, e, t);
    }
    resetWebGL() {
      (Bn.warn(
        "WebGLDevice.resetWebGL is deprecated, use only for debugging",
      )(),
        il(this.gl, Vc));
    }
    _getDeviceSpecificTextureFormatCapabilities(e) {
      return (function (e, t, r) {
        let n = t.create;
        const i = Ol[t.format];
        (void 0 === i?.gl && (n = !1),
          i?.x && (n = n && Boolean(hl(e, i.x, r))),
          "stencil8" === t.format && (n = !1));
        const s = !1 !== i?.r && (void 0 === i?.r || wl(e, i.r, r)),
          o =
            n &&
            t.render &&
            s &&
            (function (e, t, r) {
              const n = Ol[t],
                i = n?.gl;
              if (void 0 === i) return !1;
              if (n?.x && !hl(e, n.x, r)) return !1;
              const s = e.getParameter(32873),
                o = e.getParameter(36006),
                a = e.createTexture(),
                c = e.createFramebuffer();
              if (!a || !c) return !1;
              let l = Number(e.getError());
              for (; 0 !== l; ) l = e.getError();
              let u = !1;
              try {
                if (
                  (e.bindTexture(3553, a),
                  e.texStorage2D(3553, 1, i, 1, 1),
                  0 !== Number(e.getError()))
                )
                  return !1;
                (e.bindFramebuffer(36160, c),
                  e.framebufferTexture2D(36160, 36064, 3553, a, 0),
                  (u =
                    36053 === Number(e.checkFramebufferStatus(36160)) &&
                    0 === Number(e.getError())));
              } finally {
                (e.bindFramebuffer(36160, o),
                  e.deleteFramebuffer(c),
                  e.bindTexture(3553, s),
                  e.deleteTexture(a));
              }
              return u;
            })(e, t.format, r);
        return {
          format: t.format,
          create: n && t.create,
          render: o,
          filter: n && t.filter,
          blend: n && t.blend,
          store: n && t.store,
        };
      })(this.gl, e, this.extensions);
    }
    loseDevice() {
      let e = !1;
      const t = this.getExtension("WEBGL_lose_context").WEBGL_lose_context;
      return (
        t && ((e = !0), t.loseContext()),
        this._resolveContextLost?.({
          reason: "destroyed",
          message: "Application triggered context loss",
        }),
        e
      );
    }
    pushState() {
      cl.get(this.gl).push();
    }
    popState() {
      cl.get(this.gl).pop();
    }
    getGLKey(e, t) {
      const r = Number(e);
      for (const n in this.gl) if (this.gl[n] === r) return `GL.${n}`;
      return t?.emptyIfUnknown ? "" : String(e);
    }
    getGLKeys(e) {
      const t = { emptyIfUnknown: !0 };
      return Object.entries(e).reduce(
        (e, [r, n]) => (
          (e[`${r}:${this.getGLKey(r, t)}`] = `${n}:${this.getGLKey(n, t)}`),
          e
        ),
        {},
      );
    }
    setConstantAttributeWebGL(e, t) {
      const r = this.limits.maxVertexAttributes;
      this._constants = this._constants || new Array(r).fill(null);
      const n = this._constants[e];
      switch (
        (n &&
          (function (e, t) {
            if (
              !e ||
              !t ||
              e.length !== t.length ||
              e.constructor !== t.constructor
            )
              return !1;
            for (let r = 0; r < e.length; ++r) if (e[r] !== t[r]) return !1;
            return !0;
          })(n, t) &&
          Bn.info(
            1,
            `setConstantAttributeWebGL(${e}) could have been skipped, value unchanged`,
          )(),
        (this._constants[e] = t),
        t.constructor)
      ) {
        case Float32Array:
          !(function (e, t, r) {
            switch (r.length) {
              case 1:
                e.gl.vertexAttrib1fv(t, r);
                break;
              case 2:
                e.gl.vertexAttrib2fv(t, r);
                break;
              case 3:
                e.gl.vertexAttrib3fv(t, r);
                break;
              case 4:
                e.gl.vertexAttrib4fv(t, r);
            }
          })(this, e, t);
          break;
        case Int32Array:
          !(function (e, t, r) {
            e.gl.vertexAttribI4iv(t, r);
          })(this, e, t);
          break;
        case Uint32Array:
          !(function (e, t, r) {
            e.gl.vertexAttribI4uiv(t, r);
          })(this, e, t);
          break;
        default:
          throw new Error("constant");
      }
    }
    getExtension(e) {
      return (hl(this.gl, e, this.extensions), this.extensions);
    }
    _setWebGLDebugMetadata(e, t, r) {
      ((e.luma = t),
        (e.__SPECTOR_Metadata = { props: r.spector, id: r.spector.id }));
    }
  },
  Bu = { CLOCKWISE: 1, COUNTER_CLOCKWISE: -1 };
function Du(e, t, r = {}) {
  return (
    (function (e, t = {}) {
      return Math.sign(
        (function (e, t = {}) {
          const { start: r = 0, end: n = e.length, plane: i = "xy" } = t,
            s = t.size || 2;
          let o = 0;
          const a = Fu[i[0]],
            c = Fu[i[1]];
          for (let l = r, u = n - s; l < n; l += s)
            ((o += (e[l + a] - e[u + a]) * (e[l + c] + e[u + c])), (u = l));
          return o / 2;
        })(e, t),
      );
    })(e, r) !== t &&
    ((function (e, t) {
      const { start: r = 0, end: n = e.length, size: i = 2 } = t,
        s = (n - r) / i,
        o = Math.floor(s / 2);
      for (let a = 0; a < o; ++a) {
        const t = r + a * i,
          n = r + (s - 1 - a) * i;
        for (let r = 0; r < i; ++r) {
          const i = e[t + r];
          ((e[t + r] = e[n + r]), (e[n + r] = i));
        }
      }
    })(e, r),
    !0)
  );
}
var Fu = { x: 0, y: 1, z: 2 };
function Uu(e, t) {
  const r = t.length,
    n = e.length;
  if (n > 0) {
    let i = !0;
    for (let s = 0; s < r; s++)
      if (e[n - r + s] !== t[s]) {
        i = !1;
        break;
      }
    if (i) return !1;
  }
  for (let i = 0; i < r; i++) e[n + i] = t[i];
  return !0;
}
function Gu(e, t) {
  const r = t.length;
  for (let n = 0; n < r; n++) e[n] = t[n];
}
function ku(e, t, r, n, i = []) {
  const s = n + t * r;
  for (let o = 0; o < r; o++) i[o] = e[s + o];
  return i;
}
function Wu(e, t, r, n, i = []) {
  let s, o;
  if (8 & r) ((s = (n[3] - e[1]) / (t[1] - e[1])), (o = 3));
  else if (4 & r) ((s = (n[1] - e[1]) / (t[1] - e[1])), (o = 1));
  else if (2 & r) ((s = (n[2] - e[0]) / (t[0] - e[0])), (o = 2));
  else {
    if (!(1 & r)) return null;
    ((s = (n[0] - e[0]) / (t[0] - e[0])), (o = 0));
  }
  for (let a = 0; a < e.length; a++)
    i[a] = (1 & o) === a ? n[o] : s * (t[a] - e[a]) + e[a];
  return i;
}
function $u(e, t) {
  let r = 0;
  return (
    e[0] < t[0] ? (r |= 1) : e[0] > t[2] && (r |= 2),
    e[1] < t[1] ? (r |= 4) : e[1] > t[3] && (r |= 8),
    r
  );
}
function Hu(e, t) {
  const {
      size: r = 2,
      broken: n = !1,
      gridResolution: i = 10,
      gridOffset: s = [0, 0],
      startIndex: o = 0,
      endIndex: a = e.length,
    } = t || {},
    c = (a - o) / r;
  let l = [];
  const u = [l],
    h = ku(e, 0, r, o);
  let d, f;
  const p = Xu(h, i, s, []),
    g = [];
  Uu(l, h);
  for (let m = 1; m < c; m++) {
    for (d = ku(e, m, r, o, d), f = $u(d, p); f; ) {
      Wu(h, d, f, p, g);
      const e = $u(g, p);
      (e && (Wu(h, g, e, p, g), (f = e)),
        Uu(l, g),
        Gu(h, g),
        ju(p, i, f),
        n && l.length > r && ((l = []), u.push(l), Uu(l, h)),
        (f = $u(d, p)));
    }
    (Uu(l, d), Gu(h, d));
  }
  return n ? u : u[0];
}
function Vu(e, t = null, r) {
  if (!e.length) return [];
  const {
      size: n = 2,
      gridResolution: i = 10,
      gridOffset: s = [0, 0],
      edgeTypes: o = !1,
    } = r || {},
    a = [],
    c = [
      {
        pos: e,
        types: o ? new Array(e.length / n).fill(1) : null,
        holes: t || [],
      },
    ],
    l = [[], []];
  let u = [];
  for (; c.length; ) {
    const { pos: e, types: t, holes: r } = c.shift();
    (Ku(e, n, r[0] || e.length, l), (u = Xu(l[0], i, s, u)));
    const h = $u(l[1], u);
    if (h) {
      let i = zu(e, t, n, 0, r[0] || e.length, u, h);
      const s = { pos: i[0].pos, types: i[0].types, holes: [] },
        a = { pos: i[1].pos, types: i[1].types, holes: [] };
      c.push(s, a);
      for (let c = 0; c < r.length; c++)
        ((i = zu(e, t, n, r[c], r[c + 1] || e.length, u, h)),
          i[0] &&
            (s.holes.push(s.pos.length),
            (s.pos = Yu(s.pos, i[0].pos)),
            o && (s.types = Yu(s.types, i[0].types))),
          i[1] &&
            (a.holes.push(a.pos.length),
            (a.pos = Yu(a.pos, i[1].pos)),
            o && (a.types = Yu(a.types, i[1].types))));
    } else {
      const n = { positions: e };
      (o && (n.edgeTypes = t), r.length && (n.holeIndices = r), a.push(n));
    }
  }
  return a;
}
function zu(e, t, r, n, i, s, o) {
  const a = (i - n) / r,
    c = [],
    l = [],
    u = [],
    h = [],
    d = [];
  let f, p, g;
  const m = ku(e, a - 1, r, n);
  let _ = Math.sign(8 & o ? m[1] - s[3] : m[0] - s[2]),
    E = t && t[a - 1],
    b = 0,
    y = 0;
  for (let T = 0; T < a; T++)
    ((f = ku(e, T, r, n, f)),
      (p = Math.sign(8 & o ? f[1] - s[3] : f[0] - s[2])),
      (g = t && t[n / r + T]),
      p &&
        _ &&
        _ !== p &&
        (Wu(m, f, o, s, d), Uu(c, d) && u.push(E), Uu(l, d) && h.push(E)),
      p <= 0
        ? (Uu(c, f) && u.push(g), (b -= p))
        : u.length && (u[u.length - 1] = 0),
      p >= 0
        ? (Uu(l, f) && h.push(g), (y += p))
        : h.length && (h[h.length - 1] = 0),
      Gu(m, f),
      (_ = p),
      (E = g));
  return [
    b ? { pos: c, types: t && u } : null,
    y ? { pos: l, types: t && h } : null,
  ];
}
function Xu(e, t, r, n) {
  const i = Math.floor((e[0] - r[0]) / t) * t + r[0],
    s = Math.floor((e[1] - r[1]) / t) * t + r[1];
  return ((n[0] = i), (n[1] = s), (n[2] = i + t), (n[3] = s + t), n);
}
function ju(e, t, r) {
  8 & r
    ? ((e[1] += t), (e[3] += t))
    : 4 & r
      ? ((e[1] -= t), (e[3] -= t))
      : 2 & r
        ? ((e[0] += t), (e[2] += t))
        : 1 & r && ((e[0] -= t), (e[2] -= t));
}
function Ku(e, t, r, n) {
  let i = 1 / 0,
    s = -1 / 0,
    o = 1 / 0,
    a = -1 / 0;
  for (let c = 0; c < r; c += t) {
    const t = e[c],
      r = e[c + 1];
    ((i = t < i ? t : i),
      (s = t > s ? t : s),
      (o = r < o ? r : o),
      (a = r > a ? r : a));
  }
  return ((n[0][0] = i), (n[0][1] = o), (n[1][0] = s), (n[1][1] = a), n);
}
function Yu(e, t) {
  for (let r = 0; r < t.length; r++) e.push(t[r]);
  return e;
}
function Qu(e, t) {
  const {
      size: r = 2,
      startIndex: n = 0,
      endIndex: i = e.length,
      normalize: s = !0,
    } = t || {},
    o = e.slice(n, i);
  eh(o, r, 0, i - n);
  const a = Hu(o, {
    size: r,
    broken: !0,
    gridResolution: 360,
    gridOffset: [-180, -180],
  });
  if (s) for (const c of a) th(c, r);
  return a;
}
function qu(e, t = null, r) {
  const { size: n = 2, normalize: i = !0, edgeTypes: s = !1 } = r || {};
  t = t || [];
  const o = [],
    a = [];
  let c = 0,
    l = 0;
  for (let h = 0; h <= t.length; h++) {
    const i = t[h] || e.length,
      s = l,
      u = Zu(e, n, c, i);
    for (let t = u; t < i; t++) o[l++] = e[t];
    for (let t = c; t < u; t++) o[l++] = e[t];
    (eh(o, n, s, l), Ju(o, n, s, l, r?.maxLatitude), (c = i), (a[h] = l));
  }
  a.pop();
  const u = Vu(o, a, {
    size: n,
    gridResolution: 360,
    gridOffset: [-180, -180],
    edgeTypes: s,
  });
  if (i) for (const h of u) th(h.positions, n);
  return u;
}
function Zu(e, t, r, n) {
  let i = -1,
    s = -1;
  for (let o = r + 1; o < n; o += t) {
    const t = Math.abs(e[o]);
    t > i && ((i = t), (s = o - 1));
  }
  return s;
}
function Ju(e, t, r, n, i = 85.051129) {
  const s = e[r],
    o = e[n - t];
  if (Math.abs(s - o) > 180) {
    const n = ku(e, 0, t, r);
    ((n[0] += 360 * Math.round((o - s) / 360)),
      Uu(e, n),
      (n[1] = Math.sign(n[1]) * i),
      Uu(e, n),
      (n[0] = s),
      Uu(e, n));
  }
}
function eh(e, t, r, n) {
  let i,
    s = e[0];
  for (let o = r; o < n; o += t) {
    i = e[o];
    const t = i - s;
    ((t > 180 || t < -180) && (i -= 360 * Math.round(t / 360)), (e[o] = s = i));
  }
}
function th(e, t) {
  let r;
  const n = e.length / t;
  for (let s = 0; s < n && ((r = e[s * t]), (r + 180) % 360 == 0); s++);
  const i = 360 * -Math.round(r / 360);
  if (0 !== i) for (let s = 0; s < n; s++) e[s * t] += i;
}
export {
  Kr as $,
  Wo as A,
  qn as B,
  Aa as C,
  _a as D,
  ba as E,
  ao as F,
  hn as G,
  wn as H,
  Ls as I,
  sn as J,
  dn as K,
  ji as L,
  Fo as M,
  ro as N,
  Ca as O,
  co as P,
  Zr as Q,
  xi as R,
  Ra as S,
  wa as T,
  Sn as U,
  Nn as V,
  yn as W,
  on as X,
  an as Y,
  tn as Z,
  Ta as _,
  Bu as a,
  Mr as at,
  ya as b,
  Hc as c,
  Or as ct,
  vc as d,
  Be as dt,
  Jr as et,
  Da as f,
  te as ft,
  pa as g,
  La as h,
  Hu as i,
  Xr as it,
  Go as j,
  ia as k,
  Cc as l,
  ft as lt,
  Na as m,
  Qu as n,
  Hr as nt,
  Du as o,
  Dr as ot,
  Ma as p,
  y as pt,
  nn as q,
  Vu as r,
  Vr as rt,
  Mu as s,
  Br as st,
  qu as t,
  qr as tt,
  Sc as u,
  Ze as ut,
  va as v,
  ma as w,
  Ea as x,
  Sa as y,
  Zn as z,
};
