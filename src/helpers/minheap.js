// --- Binary Min-Heap Priority Queue for O(1) Fetch / O(log N) Insert ---
export class MinHeap {
  constructor() {
    this.data = [];
  }
  insert(node, score) {
    this.data.push({ node, score });
    this.up(this.data.length - 1);
  }
  extractMin() {
    if (this.data.length === 0) return null;
    const min = this.data[0];
    const end = this.data.pop();
    if (this.data.length > 0) {
      this.data[0] = end;
      this.down(0);
    }
    return min.node;
  }
  size() {
    return this.data.length;
  }
  up(i) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.data[i].score >= this.data[p].score) break;
      const tmp = this.data[i];
      this.data[i] = this.data[p];
      this.data[p] = tmp;
      i = p;
    }
  }
  down(i) {
    const len = this.data.length;
    while ((i << 1) + 1 < len) {
      let left = (i << 1) + 1,
        right = left + 1,
        best = left;
      if (right < len && this.data[right].score < this.data[left].score) best = right;
      if (this.data[i].score <= this.data[best].score) break;
      const tmp = this.data[i];
      this.data[i] = this.data[best];
      this.data[best] = tmp;
      i = best;
    }
  }
}
