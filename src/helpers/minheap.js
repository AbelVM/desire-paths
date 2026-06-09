// --- Binary Min-Heap Priority Queue (zero-allocation variant) ---
// Uses parallel arrays to avoid {node, score} object churn in Dijkstra hot paths.
// Nodes stored as strings (H3 cell IDs), scores as Float64Array for cache locality.
export class MinHeap {
  #nodes;
  #scores;
  #size;

  constructor(capacityHint = 256) {
    this.#nodes = new Array(capacityHint);
    this.#scores = new Float64Array(capacityHint);
    this.#size = 0;
  }

  insert(node, score) {
    if (this.#size >= this.#nodes.length) {
      const cap = this.#nodes.length * 2;
      const n = new Array(cap);
      const s = new Float64Array(cap);
      for (let i = 0; i < this.#size; i++) {
        n[i] = this.#nodes[i];
        s[i] = this.#scores[i];
      }
      this.#nodes = n;
      this.#scores = s;
    }
    this.#nodes[this.#size] = node;
    this.#scores[this.#size] = score;
    this.#up(this.#size);
    this.#size++;
  }

  extractMin() {
    if (this.#size === 0) return null;
    const minNode = this.#nodes[0];
    this.#size--;
    if (this.#size > 0) {
      this.#nodes[0] = this.#nodes[this.#size];
      this.#scores[0] = this.#scores[this.#size];
      this.#down(0);
    }
    return minNode;
  }

  size() {
    return this.#size;
  }

  #up(i) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.#scores[i] >= this.#scores[p]) break;
      const tn = this.#nodes[i];
      const ts = this.#scores[i];
      this.#nodes[i] = this.#nodes[p];
      this.#scores[i] = this.#scores[p];
      this.#nodes[p] = tn;
      this.#scores[p] = ts;
      i = p;
    }
  }

  #down(i) {
    const len = this.#size;
    while ((i << 1) + 1 < len) {
      let left = (i << 1) + 1;
      let right = left + 1;
      let best = left;
      if (right < len && this.#scores[right] < this.#scores[left]) best = right;
      if (this.#scores[i] <= this.#scores[best]) break;
      const tn = this.#nodes[i];
      const ts = this.#scores[i];
      this.#nodes[i] = this.#nodes[best];
      this.#scores[i] = this.#scores[best];
      this.#nodes[best] = tn;
      this.#scores[best] = ts;
      i = best;
    }
  }
}
