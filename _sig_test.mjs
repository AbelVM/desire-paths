import { gridDisk } from 'h3-js';
import { computeGradientBatch } from './src/helpers/spatialTasks.js';

function makeAOI(n){
  const seed = '8928308280fffff';
  const cells = new Set(); const stack=[seed];
  while(cells.size<n){const c=stack.pop(); if(cells.has(c))continue; cells.add(c); for(const n2 of gridDisk(c,1)) if(!cells.has(n2)) stack.push(n2);}
  return [...cells];
}
for (const [n, t] of [[2000,2000],[4000,4000],[8000,8000]]) {
  const arr=makeAOI(n);
  const frictionEntries = {};
  for (const c of arr) frictionEntries[c] = 1 + (c.charCodeAt(c.length-1)%5);
  const t0=Date.now();
  const g = computeGradientBatch({ frictionEntries, targets: arr.slice(0,t) });
  console.log(`n=${n} targets=${t} -> ${Object.keys(g).length} in ${Date.now()-t0}ms`);
}
