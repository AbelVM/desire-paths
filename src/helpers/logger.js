// Leveled logger. Replaces the pervasive `console.debug && console.debug(...)`
// guards throughout the codebase. It is a no-op in production builds (Vite sets
// import.meta.env.PROD), which both cuts console noise and lets the bundler
// tree-shake the debug call sites out of the shipped bundle.

const isProd =
  typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.PROD;
const ENABLED = !isProd;

function emit(level, args) {
  if (!ENABLED) return;
  const fn = console[level];
  if (typeof fn === 'function') {
    try {
      fn.apply(console, args);
    } catch (_e) {
      // logging must never throw
    }
  }
}

export const logger = {
  debug: (...args) => emit('debug', args),
  info: (...args) => emit('info', args),
  warn: (...args) => emit('warn', args),
  error: (...args) => emit('error', args),
};

export default logger;
