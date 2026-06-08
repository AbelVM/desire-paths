// --- Binary Min-Heap Priority Queue (zero-allocation variant) ---
// Uses parallel arrays to avoid {node, score} object churn in Dijkstra hot paths.
// Nodes stored as strings (H3 cell IDs), scores as Float64Array for cache locality.
export class MinHeap {
  constructor(capacityHint = 256) {
    this._nodes = new Array(capacityHint);
    this._scores = new Float64Array(capacityHint);
    this._size = 0;
  }
  insert(node, score) {
    if (this._size >= this._nodes.length) {
      const cap = this._nodes.length * 2;
      const n = new Array(cap);
      const s = new Float64Array(cap);
      for (let i = 0; i < this._size; i++) { n[i] = this._nodes[i]; s[i] = this._scores[i]; }
      this._nodes = n;
      this._scores = s;
    }
    this._nodes[this._size] = node;
    this._scores[this._size] = score;
    this._up(this._size);
    this._size++;
  }
  extractMin() {
    if (this._size === 0) return null;
    const minNode = this._nodes[0];
    this._size--;
    if (this._size > 0) {
      this._nodes[0] = this._nodes[this._size];
      this._scores[0] = this._scores[this._size];
      this._down(0);
    }
    return minNode;
  }
  size() {
    return this._size;
  }
  _up(i) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this._scores[i] >= this._scores[p]) break;
      const tn = this._nodes[i];
      const ts = this._scores[i];
      this._nodes[i] = this._nodes[p];
      this._scores[i] = this._scores[p];
      this._nodes[p] = tn;
      this._scores[p] = ts;
      i = p;
    }
  }
  _down(i) {
    const len = this._size;
    while ((i << 1) + 1 < len) {
      let left = (i << 1) + 1;
      let right = left + 1;
      let best = left;
      if (right < len && this._scores[right] < this._scores[left]) best = right;
      if (this._scores[i] <= this._scores[best]) break;
      const tn = this._nodes[i];
      const ts = this._scores[i];
      this._nodes[i] = this._nodes[best];
      this._scores[i] = this._scores[best];
      this._nodes[best] = tn;
      this._scores[best] = ts;
      i = best;
    }
  }
}
