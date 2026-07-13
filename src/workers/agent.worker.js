import { logger } from '../helpers/logger.js';
import { computeAgentBatch } from '../helpers/agentTasks.js';

/**
 * Thin adapter for agent batch handling.
 * Exposes a function so the main spatial worker can delegate agent work.
 */
export function handleAgentBatch(payload) {
  return computeAgentBatch(payload || {});
}

// If this module is loaded as a dedicated worker script, handle messages here.
// Only attach a top-level message handler when this module is the dedicated
// worker entrypoint. When imported into another worker module (e.g. spatial.worker)
// we must not register a global message listener because it would receive and
// interfere with that worker's own messages.
const isWorkerEntrypoint =
  typeof self !== 'undefined' &&
  typeof self.addEventListener === 'function' &&
  typeof import.meta !== 'undefined' &&
  typeof self.location !== 'undefined' &&
  import.meta.url === (self.location && self.location.href);

if (isWorkerEntrypoint) {
  self.addEventListener('message', (event) => {
    const data = event.data || {};
    const payload = data && data.kind === 'agent-batch' && data.payload ? data.payload : data;
    try {
      logger.debug('agent.worker: received agent-batch', {
        planLength: payload?.plan?.length ?? null,
      });
      const ret = computeAgentBatch(payload || {});
      logger.debug('agent.worker: finished computeAgentBatch', {
        processed: ret?.result?.processed ?? ret?.processed ?? 0,
      });
      if (ret && Array.isArray(ret.transfers)) {
        self.postMessage({ ok: true, result: ret.result }, ret.transfers);
      } else {
        self.postMessage({ ok: true, result: ret && ret.result ? ret.result : ret });
      }
    } catch (error) {
      console.error('agent.worker: error', error);
      self.postMessage({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}
