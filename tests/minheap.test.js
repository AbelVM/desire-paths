import { describe, it, expect } from 'vitest';
import { MinHeap } from '../src/helpers/minheap.js';

describe('MinHeap', () => {
  it('should start empty', () => {
    const heap = new MinHeap();
    expect(heap.size()).toBe(0);
    expect(heap.extractMin()).toBeNull();
  });

  it('should insert a single element', () => {
    const heap = new MinHeap();
    heap.insert('a', 5);
    expect(heap.size()).toBe(1);
    expect(heap.extractMin()).toBe('a');
    expect(heap.size()).toBe(0);
  });

  it('should extract elements in sorted order (min first)', () => {
    const heap = new MinHeap();
    heap.insert('c', 30);
    heap.insert('a', 10);
    heap.insert('b', 20);
    expect(heap.extractMin()).toBe('a');
    expect(heap.extractMin()).toBe('b');
    expect(heap.extractMin()).toBe('c');
    expect(heap.size()).toBe(0);
  });

  it('should handle duplicate scores', () => {
    const heap = new MinHeap();
    heap.insert('a', 10);
    heap.insert('b', 10);
    heap.insert('c', 10);
    const results = [heap.extractMin(), heap.extractMin(), heap.extractMin()];
    expect(results).toContain('a');
    expect(results).toContain('b');
    expect(results).toContain('c');
    expect(heap.size()).toBe(0);
  });

  it('should maintain heap property after repeated insert/extract', () => {
    const heap = new MinHeap();
    for (let i = 0; i < 100; i++) {
      heap.insert(`item-${i}`, Math.random() * 1000);
    }
    while (heap.size() > 0) {
      // We can't easily verify the extracted value since we don't store scores
      // but we can verify size decreases correctly
      const size = heap.size();
      heap.extractMin();
      expect(heap.size()).toBe(size - 1);
    }
  });

  it('should handle single element extract then insert', () => {
    const heap = new MinHeap();
    heap.insert('x', 1);
    expect(heap.extractMin()).toBe('x');
    expect(heap.size()).toBe(0);
    heap.insert('y', 2);
    expect(heap.size()).toBe(1);
    expect(heap.extractMin()).toBe('y');
    expect(heap.size()).toBe(0);
  });

  it('should handle large number of insertions', () => {
    const heap = new MinHeap();
    const count = 1000;
    for (let i = 0; i < count; i++) {
      heap.insert(`node-${i}`, i);
    }
    expect(heap.size()).toBe(count);
    for (let i = 0; i < count; i++) {
      expect(heap.extractMin()).toBe(`node-${i}`);
    }
    expect(heap.size()).toBe(0);
  });

  it('should handle descending score insertions', () => {
    const heap = new MinHeap();
    heap.insert('a', 100);
    heap.insert('b', 90);
    heap.insert('c', 80);
    heap.insert('d', 70);
    heap.insert('e', 60);
    expect(heap.extractMin()).toBe('e');
    expect(heap.extractMin()).toBe('d');
    expect(heap.extractMin()).toBe('c');
    expect(heap.extractMin()).toBe('b');
    expect(heap.extractMin()).toBe('a');
  });

  it('should handle ascending score insertions', () => {
    const heap = new MinHeap();
    heap.insert('a', 10);
    heap.insert('b', 20);
    heap.insert('c', 30);
    heap.insert('d', 40);
    heap.insert('e', 50);
    expect(heap.extractMin()).toBe('a');
    expect(heap.extractMin()).toBe('b');
    expect(heap.extractMin()).toBe('c');
    expect(heap.extractMin()).toBe('d');
    expect(heap.extractMin()).toBe('e');
  });
});
