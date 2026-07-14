# REVIEW REQUEST for a desire paths simulator

## Executive Summary

The desire paths simulator is a mature, high-performance agent-based pedestrian flow simulator that has undergone extensive iterative refinement through 13 code reviews. The architecture has converged on a strong set of patterns: SAB-backed typed arrays for zero-copy worker sharing, CSR-backed visibility/bearing indices, Dial's algorithm for gradient Dijkstra, and wave-based ABM parallelism.

**Current State**: The codebase is at review13 commit (b82b105) with all high-priority fixes implemented. The system is production-ready for its current scale but shows signs of technical debt that should be addressed before city-scale deployment.

## Architecture Strengths (Preserve)

| Pattern | Location | Why it works |
|---------|----------|--------------|
| SAB-backed `frictionArr` / `affArr` | `grid.js:232-236`, `spatialWorker.js:319-324` | Zero-copy share across worker batches; stable cache key |
| CSR visibility/bearing with binary search | `bearingIndex.js`, `spatialTasks.js` | O(log P) lookups, no per-pair Map at city scale |
| Dial's algorithm with pooled buckets | `dijkstra.js:350-400` | ~C·V ops, zero comparisons; pooled arrays eliminate GC churn |
| `FrictionArrayMap` thin view | `frictionStore.js` | Map interface preserved, 2× memory win vs dual Maps |
| Wave-based ABM with shared SAB footprint | `spatialWorker.js:778-789` | Preserves positive feedback (later agents follow earlier trails) while keeping worker parallelism |
| Lazy CSR rebuild with generation caching | `compute.js:88-111`, `grid.js:312` | Avoids O(N) Proxy construction when only worker path runs |
| PowerCache for gradients | `compute.js:155-163` | Bounded LRU, O(1) get/set, automatic eviction |

## Current Issues (Post-review13)

### 1. Correctness Risks

#### 1.1 BFS detour fallback returns impassable straight line
**File**: `agentStep.js:105`
**Severity**: Medium

```javascript
if (!found) return straight; // fallback; movement loop will stop safely
```

**Risk**: When the bounded BFS detour fails to find a path around an obstacle, the function returns the original `straight` line — which was already determined to contain impassable cells. This relies on an implicit contract with the caller.

**Fix**: Return `[curr]` (no movement) when no detour exists, or add assertion in the movement loop.

#### 1.2 `getMainThreadVisibilityBearing` skips reconstruction when Worker exists
**File**: `compute.js:103`
**Severity**: Low

```javascript
if (csr && viewHexes && typeof Worker === 'undefined') {
```

**Risk**: Main-thread visibility/bearing indices are only rebuilt when `Worker` is undefined. In the browser, the main-thread preview kernel would get `null` indices and fall back to slow path-cell visibility.

**Fix**: Document that main-thread indices are intentionally omitted in the browser.

### 2. Memory Leaks

#### 2.1 Idle worker cleanup interval never cleared
**File**: `spatialWorker.js:122-154`
**Severity**: Low

```javascript
let _idleCleanupInterval = null;
function _startIdleCleanup() {
  if (_idleCleanupInterval) return;
  _idleCleanupInterval = setInterval(() => { ... }, 60_000);
}
```

**Risk**: Interval is started on first worker creation but never cleared, leaving dangling intervals in long-lived SPA.

**Fix**: Clear interval in `terminateAllWorkers` / `drainWorkerPool` when last worker is retired.

#### 2.2 Base friction/affordance snapshots double memory at remap
**File**: `grid.js:261-262`
**Severity**: Low

```javascript
state._baseFrictionArr = frictionArr.slice();
state._baseAffArr = affArr.slice();
```

**Impact**: At city scale (N ≈ 500K), each slice is 2 MB, total 4 MB unnecessary.

**Fix**: Store `Set` of edited cell indices with base values instead of full slices.

### 3. Performance Bottlenecks

#### 3.1 `ui.js` is a 1632-line god module
**File**: `ui.js`
**Severity**: Medium

`setupUI` handles: DOM refs, toast notifications, tabs, simulation params, context menus, drag (mouse + touch), long-press, keyboard shortcuts, panel collapse, and Surface Edition init. The function is 1632 lines with deeply nested closures.

**Impact**: Hot-reload / re-init is fragile (manual listener cleanup via `uiCleanupListeners`).

**Fix**: Split into modules: `uiToast.js`, `uiContextMenu.js`, `uiDrag.js`, `uiSimParams.js`, `uiKeyboard.js`.

#### 3.2 `cornersImpassable` nested loop on every diagonal step
**File**: `agentStep.js:16-34`
**Severity**: Low

```javascript
for (let i = 0; i < neighborsA.length; i++) {
  const c = neighborsA[i];
  if (c === a || c === b) continue;
  let isNeighbor = false;
  for (let j = 0; j < neighborsB.length; j++) {
    if (neighborsB[j] === c) { isNeighbor = true; break; }
  }
  if (!isNeighbor) continue;
  // ...
}
```

**Impact**: O(36) per diagonal step at thousands of agents × hundreds of ticks.

**Fix**: Precompute shared-corner lookup using r=1 adjacency CSR.

#### 3.3 `mapCells` iterates `Object.keys(val)` for every multi-friction cell
**File**: `grid.js:410-414`
**Severity**: Low

```javascript
let min = Infinity;
for (const k in val) {
  const v = val[k];
  if (typeof v === 'number' && v < min) min = v;
}
```

**Impact**: O(total layers) when drawing obstacles.

**Fix**: Track min friction incrementally when adding/updating layers.

### 4. Robustness Gaps

#### 4.1 Worker task timeout is 10 minutes
**File**: `spatialWorker.js:67`
**Severity**: Medium

```javascript
const WORKER_TASK_TIMEOUT = 600_000; // 10m
```

**Impact**: Hung worker blocks simulation for up to 10 minutes before timeout.

**Fix**: Reduce to 30-60 seconds for interactive use.

#### 4.2 No cancellation support for long-running simulations
**File**: `compute.js:271-681`
**Severity**: Medium

`computeDesirePaths` has no `AbortSignal` support. Double-click "Reveal desire lines" could race two simulations.

**Fix**: Accept `AbortSignal` in `computeDesirePaths` and propagate to worker tasks.

#### 4.3 Error swallowing in gradient fallback
**File**: `compute.js:329-335`
**Severity**: Low

```javascript
} catch (err) {
  try { logger.warn('...', err); } catch (_e) {}
  state._visibilityBearingCSR = null;
}
```

**Impact**: CSR rebuild failure falls back to slow path-cell visibility with no user warning.

**Fix**: Surface toast/alert when CSR rebuild fails.

### 5. Design Weaknesses

#### 5.1 `state` is a god object
**File**: `main.js`, `map.js`, `compute.js`, `grid.js`, `ui.js`
**Severity**: Medium

`state` / `map` accumulates 40+ properties from 6+ modules. No interface, type definition, or ownership contract.

**Impact**: Refactoring is risky; unclear which module "owns" a property.

**Fix**: Introduce `SimulationState` class with explicit getters/setters.

#### 5.2 Worker protocol is string-based and ad-hoc
**File**: `spatialWorker.js:372-470`, `spatial.worker.js:15-66`
**Severity**: Low

Workers dispatch on `data.kind` strings (`'fast-scan'`, `'gradient-batch'`, `'agent-batch'`, etc.).

**Fix**: Use typed protocol (e.g., `TaskType` enum) or registry pattern.

## Test Coverage Gaps

- **No test for BFS detour fallback path** (`agentStep.js:105`): The `!found` branch is untested.
- **No test for double-click simulation race**: Two concurrent `computeDesirePaths` calls could corrupt `pathDesireScores`.
- **No test for worker timeout + retry + local fallback chain**: Full fallback path not exercised.
- **No test for `clearSurfaceEditions` with concurrent mutation**: Map iteration safety unverified.

## Recommendations (Prioritized)

| Priority | Ref | Item | Effort | Impact | Status |
|----------|-----|------|--------|--------|--------|
| P1 | §4.2 | Add cancellation (AbortController) to `computeDesirePaths` | Medium | Prevents race conditions on double-click | Implemented |
| P1 | §1.1 | Fix BFS detour fallback in `agentStep.js:105` | Small | Eliminates correctness risk | Implemented |
| P1 | §2.1 | Clear idle cleanup interval in `terminateAllWorkers` | Small | Fixes memory leak | Implemented |
| P2 | §5.1 | Split `ui.js` into focused modules | Large | Improves maintainability | Deferred |
| P2 | §4.1 | Reduce worker timeout from 10m to 30-60s | Small | Faster failure recovery | Implemented |
| P2 | §4.3 | Surface user warning when CSR rebuild fails | Small | Better UX at city scale | Implemented |
| P3 | §3.2 | Precompute shared-corner lookup for `cornersImpassable` | Medium | Removes O(36) hot-path loop | Implemented |
| P3 | §3.3 | Track min friction incrementally in `mapCells` | Medium | Eliminates O(layers) scan per cell | Implemented |
| P3 | §2.2 | Replace full base-array slices with dirty-cell map | Medium | Saves 4 MB at city scale | Implemented |
| P4 | §1.2 | Document main-thread index omission in browser | Small | Prevents future silent degradation | Implemented |

## Implementation Status

**Implemented (9 of 10):** All P1–P3 and P4 recommendations from the table have been implemented. The only deferred item is the `ui.js` split (P2, large effort).

## Conclusion

The codebase is production-ready for its current scale. The architecture decisions (SAB sharing, CSR indices, Dial's algorithm, wave-based ABM) are sound and well-executed. All high-priority fixes from this review have been implemented:

- **Correctness**: BFS detour fallback fix
- **Robustness**: Cancellation support, worker timeout reduction, CSR rebuild warning  
- **Memory**: Idle cleanup interval, dirty-cell map
- **Performance**: Shared-corner lookup, incremental min friction

The `ui.js` god module remains the largest technical debt item and should be addressed in the next refactor cycle. The system is ready for city-scale deployment with the implemented improvements.