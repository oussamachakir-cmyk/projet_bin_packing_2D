import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LineChart, Line, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, ScatterChart, Scatter
} from 'recharts';

const T = {
  bg: { main: '#0b1120', card: '#151e32', elevated: '#1e293b', input: '#0f172a' },
  border: { default: '#334155', focus: '#475569' },
  text: { main: '#f8fafc', muted: '#94a3b8', heading: '#e2e8f0' },
  accent: { blue: '#38bdf8', green: '#34d399', amber: '#fbbf24', rose: '#fb7185', violet: '#a78bfa', cyan: '#22d3ee' },
  font: { sans: 'Segoe UI, Roboto, Helvetica, Arial, sans-serif', mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }
};

function randNormal(mean, std) {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return z * std + mean;
}
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function generateDataset(count, binW, binH) {
  const pieces = [];
  const meanW = binW * 0.25, meanH = binH * 0.25;
  const stdW = meanW * 0.35, stdH = meanH * 0.35;
  const minDim = Math.min(binW, binH) * 0.05;
  const maxDim = Math.min(binW, binH) * 0.80;
  for (let i = 0; i < count; i++) {
    let w = clamp(Math.round(randNormal(meanW, stdW)), minDim, maxDim);
    let h = clamp(Math.round(randNormal(meanH, stdH)), minDim, maxDim);
    w = Math.max(1, w); h = Math.max(1, h);
    pieces.push({ id: i, w, h, area: w * h });
  }
  return pieces;
}

function computeStats(pieces) {
  if (!pieces.length) return null;
  const ws = pieces.map(p => p.w).sort((a, b) => a - b);
  const hs = pieces.map(p => p.h).sort((a, b) => a - b);
  const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
  const std = arr => { const m = avg(arr); return Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / arr.length); };
  const med = arr => { const n = arr.length; return n % 2 ? arr[Math.floor(n / 2)] : (arr[n / 2 - 1] + arr[n / 2]) / 2; };
  const q = (arr, pct) => arr[Math.floor(arr.length * pct)];
  return {
    count: pieces.length,
    avgW: avg(ws).toFixed(1), stdW: std(ws).toFixed(1), medW: med(ws), q1W: q(ws, 0.25), q3W: q(ws, 0.75), minW: ws[0], maxW: ws[ws.length - 1],
    avgH: avg(hs).toFixed(1), stdH: std(hs).toFixed(1), medH: med(hs), q1H: q(hs, 0.25), q3H: q(hs, 0.75), minH: hs[0], maxH: hs[hs.length - 1],
    totalArea: pieces.reduce((s, p) => s + p.area, 0), cvW: ((std(ws) / avg(ws)) * 100).toFixed(1), cvH: ((std(hs) / avg(hs)) * 100).toFixed(1)
  };
}

function buildHistogram(values, bins = 20) {
  if (!values.length) return [];
  const min = Math.min(...values), max = Math.max(...values);
  const step = (max - min) / bins || 1;
  const hist = Array.from({ length: bins }, (_, i) => ({ bin: `${Math.round(min + i * step)}-${Math.round(min + (i + 1) * step)}`, count: 0, mid: min + i * step + step / 2 }));
  values.forEach(v => { const idx = Math.min(bins - 1, Math.floor((v - min) / step)); hist[idx].count += 1; });
  return hist;
}

class Shelf {
  constructor(y, height, binWidth) {
    this.y = y; this.height = height; this.filledWidth = 0; this.binWidth = binWidth; this.pieces = [];
  }
  canFit(w) { return this.filledWidth + w <= this.binWidth; }
  place(piece, rotated) {
    const w = rotated ? piece.h : piece.w;
    const h = rotated ? piece.w : piece.h;
    const placed = { ...piece, x: this.filledWidth, y: this.y, w, h, rotated };
    this.pieces.push(placed); this.filledWidth += w; return placed;
  }
}

class Bin {
  constructor(id, width, height) {
    this.id = id; this.width = width; this.height = height; this.shelves = []; this.currentTop = 0; this.pieces = [];
  }
  openShelf(shHeight) {
    if (this.currentTop + shHeight > this.height) return null;
    const sh = new Shelf(this.currentTop, shHeight, this.width);
    this.shelves.push(sh); this.currentTop += shHeight; return sh;
  }
  addPiece(p) { this.pieces.push(p); }
}

function normalizePieces(pieces) {
  return pieces.map(p => (p.h >= p.w ? { ...p } : { ...p, w: p.h, h: p.w }));
}

function runNFDH(piecesRaw, binW, binH) {
  const start = performance.now();
  const pieces = normalizePieces(piecesRaw).sort((a, b) => b.h - a.h);
  const bins = []; let curBin = null, curShelf = null;
  for (const piece of pieces) {
    if (curShelf && curShelf.canFit(piece.w) && piece.h <= curShelf.height) {
      const p = curShelf.place(piece, false); curBin.addPiece(p); continue;
    }
    if (curBin && curBin.currentTop + piece.h <= binH) {
      curShelf = curBin.openShelf(piece.h); const p = curShelf.place(piece, false); curBin.addPiece(p);
    } else {
      curBin = new Bin(bins.length, binW, binH); bins.push(curBin);
      curShelf = curBin.openShelf(piece.h); const p = curShelf.place(piece, false); curBin.addPiece(p);
    }
  }
  return { bins, time: performance.now() - start, name: 'NFDH' };
}

function runFFDH(piecesRaw, binW, binH) {
  const start = performance.now();
  const pieces = normalizePieces(piecesRaw).sort((a, b) => b.h - a.h);
  const bins = [];
  for (const piece of pieces) {
    let placed = false;
    for (const bin of bins) {
      for (const sh of bin.shelves) {
        if (sh.canFit(piece.w) && piece.h <= sh.height) { const p = sh.place(piece, false); bin.addPiece(p); placed = true; break; }
      }
      if (placed) break;
      if (bin.currentTop + piece.h <= binH) { const sh = bin.openShelf(piece.h); const p = sh.place(piece, false); bin.addPiece(p); placed = true; break; }
    }
    if (!placed) { const bin = new Bin(bins.length, binW, binH); bins.push(bin); const sh = bin.openShelf(piece.h); const p = sh.place(piece, false); bin.addPiece(p); }
  }
  return { bins, time: performance.now() - start, name: 'FFDH' };
}

function decodeShelfFF(sequence, binW, binH) {
  const bins = [];
  for (const piece of sequence) {
    let placed = false;
    for (const bin of bins) {
      for (const sh of bin.shelves) {
        if (sh.canFit(piece.w) && piece.h <= sh.height) { const p = sh.place(piece, false); bin.addPiece(p); placed = true; break; }
        if (sh.canFit(piece.h) && piece.w <= sh.height) { const p = sh.place(piece, true); bin.addPiece(p); placed = true; break; }
      }
      if (placed) break;
      const needH = Math.min(piece.h, piece.w);
      if (bin.currentTop + needH <= binH) { const sh = bin.openShelf(needH); const p = sh.place(piece, piece.h === needH ? false : true); bin.addPiece(p); placed = true; break; }
    }
    if (!placed) {
      const bin = new Bin(bins.length, binW, binH); bins.push(bin);
      const needH = Math.min(piece.h, piece.w); const sh = bin.openShelf(needH); const p = sh.place(piece, piece.h === needH ? false : true); bin.addPiece(p);
    }
  }
  return bins;
}

function fitness(sequence, binW, binH) { return decodeShelfFF(sequence, binW, binH).length; }

function computeDiversity(pop) {
  if (pop.length < 2) return 0;
  const sample = Math.min(10, pop.length);
  let diff = 0, pairs = 0;
  for (let i = 0; i < sample; i++) {
    for (let j = i + 1; j < sample; j++) {
      for (let k = 0; k < pop[i].length; k++) {
        if (pop[i][k] !== pop[j][k]) diff++;
      }
      pairs++;
    }
  }
  return pairs > 0 ? Math.round(diff / pairs) : 0;
}

function oxCrossover(p1, p2) {
  const n = p1.length;
  const a = Math.floor(Math.random() * n);
  const b = Math.floor(Math.random() * n);
  const start = Math.min(a, b), end = Math.max(a, b);
  const child = new Array(n).fill(-1);
  const seg = new Set();
  for (let i = start; i <= end; i++) { child[i] = p1[i]; seg.add(p1[i]); }
  let pos = (end + 1) % n;
  for (let k = 0; k < n; k++) {
    const idx = (end + 1 + k) % n;
    if (!seg.has(p2[idx])) { child[pos] = p2[idx]; pos = (pos + 1) % n; }
  }
  return child;
}

// PARAMETRES ADAPTATIFS SELON TAILLE DU DATASET - SANS LIMITATION
function getGAParams(n) {
  if (n <= 100) {
    return { popSize: 60, generations: 100, maxStagnation: 10, restartPct: 0.4 };
  } else if (n <= 500) {
    return { popSize: 50, generations: 80, maxStagnation: 8, restartPct: 0.35 };
  } else if (n <= 1000) {
    return { popSize: 40, generations: 60, maxStagnation: 6, restartPct: 0.3 };
  } else {
    // Pour N > 1000: reduire pour eviter le blocage mais garder fonctionnel
    return { popSize: 30, generations: 40, maxStagnation: 5, restartPct: 0.25 };
  }
}

function runGA(piecesRaw, binW, binH, forcedPopSize, forcedGens) {
  const start = performance.now();
  const pieces = piecesRaw.map(p => ({ ...p }));
  const n = pieces.length;

  // Utiliser parametres forces ou adaptatifs
  const params = (forcedPopSize && forcedGens) 
    ? { popSize: forcedPopSize, generations: forcedGens, maxStagnation: 8, restartPct: 0.35 }
    : getGAParams(n);

  const { popSize, generations, maxStagnation, restartPct } = params;

  function randomPerm() {
    const arr = pieces.map((_, i) => i);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function permByArea()   { return pieces.map((_, i) => i).sort((a, b) => pieces[b].area - pieces[a].area); }
  function permByWidth()  { return pieces.map((_, i) => i).sort((a, b) => pieces[b].w - pieces[a].w); }
  function permByHeight() { return pieces.map((_, i) => i).sort((a, b) => pieces[b].h - pieces[a].h); }
  function permByFFDH() {
    const sorted = pieces.map((p, i) => ({ ...p, idx: i })).sort((a, b) => b.h - a.h);
    return sorted.map(p => p.idx);
  }

  function perturbedPerm(baseFn) {
    const base = baseFn();
    const nSwaps = Math.floor(base.length * 0.4);
    for (let s = 0; s < nSwaps; s++) {
      const i = Math.floor(Math.random() * base.length);
      const j = Math.floor(Math.random() * base.length);
      [base[i], base[j]] = [base[j], base[i]];
    }
    return base;
  }

  function decodePerm(perm) { return perm.map(idx => pieces[idx]); }

  // Population initiale avec PLUS de fluctuation
  let population = [
    permByArea(),
    permByHeight(),
    perturbedPerm(permByArea),
    perturbedPerm(permByHeight),
  ];
  const nPerturbed = Math.floor(popSize * restartPct);
  for (let k = 0; k < nPerturbed; k++) {
    const baseFns = [permByArea, permByWidth, permByHeight, permByFFDH];
    population.push(perturbedPerm(baseFns[k % baseFns.length]));
  }
  while (population.length < popSize) population.push(randomPerm());

  let best = null, bestFit = Infinity;
  const history = [];
  let stagnationCount = 0;
  let lastBestFit = Infinity;
  let restartCount = 0;

  for (let gen = 0; gen < generations; gen++) {
    const fits = population.map(perm => fitness(decodePerm(perm), binW, binH));
    const minFit = Math.min(...fits);
    const avgFit = fits.reduce((a, b) => a + b, 0) / fits.length;
    const maxFit = Math.max(...fits);

    // Detection de stagnation avec fluctuation
    if (minFit < lastBestFit) {
      lastBestFit = minFit;
      bestFit = minFit;
      best = population[fits.indexOf(minFit)].slice();
      stagnationCount = 0;
    } else {
      stagnationCount++;
    }

    // Mutation adaptative qui fluctue
    const baseMut = 0.15;
    const adaptiveMut = Math.min(0.80, baseMut + (stagnationCount * 0.08));

    const diversity = computeDiversity(population);

    // RESTART avec fluctuation visible - reinitialisation partielle
    if (stagnationCount >= maxStagnation) {
      restartCount++;
      const sortedIdx = fits.map((f, i) => [f, i]).sort((a, b) => a[0] - b[0]);
      const newPop = [
        population[sortedIdx[0][1]].slice(),
        population[sortedIdx[1][1]].slice()
      ];
      // Re-injecter solutions avec PERTURBATION FORTE pour fluctuation
      newPop.push(perturbedPerm(permByArea));
      newPop.push(perturbedPerm(permByHeight));
      newPop.push(perturbedPerm(permByWidth));
      newPop.push(perturbedPerm(permByFFDH));

      const nP = Math.floor(popSize * restartPct);
      for (let k = 0; k < nP; k++) {
        const baseFns = [permByArea, permByWidth, permByHeight, permByFFDH];
        newPop.push(perturbedPerm(baseFns[k % baseFns.length]));
      }
      while (newPop.length < popSize) newPop.push(randomPerm());
      population = newPop;
      stagnationCount = 0;

      history.push({
        gen: gen + 1,
        best: bestFit,
        avg: parseFloat(avgFit.toFixed(2)),
        worst: maxFit,
        diversity,
        restart: true,
        restartNum: restartCount
      });
      continue;
    }

    history.push({
      gen: gen + 1,
      best: bestFit,
      avg: parseFloat(avgFit.toFixed(2)),
      worst: maxFit,
      diversity,
      restart: false,
      restartNum: restartCount
    });

    function tournament() {
      let bIdx = Math.floor(Math.random() * popSize);
      for (let i = 0; i < 3; i++) {
        const idx = Math.floor(Math.random() * popSize);
        if (fits[idx] < fits[bIdx]) bIdx = idx;
      }
      return population[bIdx];
    }

    const newPop = [];
    const sortedIdx = fits.map((f, i) => [f, i]).sort((a, b) => a[0] - b[0]);
    newPop.push(population[sortedIdx[0][1]].slice());
    newPop.push(population[sortedIdx[1][1]].slice());

    while (newPop.length < popSize) {
      const p1 = tournament(), p2 = tournament();
      const c1 = oxCrossover(p1, p2);
      const c2 = oxCrossover(p2, p1);
      mutateDisruptive(c1, adaptiveMut);
      mutateDisruptive(c2, adaptiveMut);
      newPop.push(c1, c2);
    }
    population = newPop.slice(0, popSize);
  }

  return { bins: decodeShelfFF(decodePerm(best), binW, binH), time: performance.now() - start, name: 'GA', history };
}

function mutateDisruptive(perm, rate) {
  if (Math.random() < rate) {
    const i = Math.floor(Math.random() * perm.length);
    const j = Math.floor(Math.random() * perm.length);
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  if (Math.random() < rate * 0.8) {
    const len = Math.max(3, Math.floor(perm.length * 0.30));
    const start = Math.floor(Math.random() * (perm.length - len));
    const sub = perm.slice(start, start + len).reverse();
    for (let k = 0; k < len; k++) perm[start + k] = sub[k];
  }
  if (Math.random() < rate * 0.5) {
    const from = Math.floor(Math.random() * perm.length);
    const to = Math.floor(Math.random() * perm.length);
    const [val] = perm.splice(from, 1);
    perm.splice(to, 0, val);
  }
  if (Math.random() < rate * 0.3) {
    const len = Math.max(2, Math.floor(perm.length * 0.15));
    const start = Math.floor(Math.random() * (perm.length - len));
    const sub = perm.slice(start, start + len);
    for (let i = sub.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [sub[i], sub[j]] = [sub[j], sub[i]];
    }
    for (let k = 0; k < len; k++) perm[start + k] = sub[k];
  }
}

function runTS(piecesRaw, binW, binH, maxIter = 500, tenure = 15) {
  const start = performance.now();
  const pieces = piecesRaw.map(p => ({ ...p }));
  const n = pieces.length;
  function randomPerm() {
    const arr = pieces.map((_, i) => i);
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }
  function decodePerm(perm) { return perm.map(idx => pieces[idx]); }

  let current = pieces.map((_, i) => i).sort((a, b) => pieces[b].area - pieces[a].area);
  let currentFit = fitness(decodePerm(current), binW, binH);
  let best = current.slice(), bestFit = currentFit;
  const tabuList = [];
  for (let iter = 0; iter < maxIter; iter++) {
    let bestNeighbor = null, bestNeighborFit = Infinity, bestMove = null;
    for (let v = 0; v < 60; v++) {
      const i = Math.floor(Math.random() * n); const j = Math.floor(Math.random() * n);
      if (i === j) continue;
      const neighbor = current.slice(); [neighbor[i], neighbor[j]] = [neighbor[j], neighbor[i]];
      const f = fitness(decodePerm(neighbor), binW, binH);
      const isTabu = tabuList.some(t => t.i === j && t.j === i && t.iter > iter);
      const aspiration = f < bestFit;
      if ((!isTabu || aspiration) && f < bestNeighborFit) { bestNeighborFit = f; bestNeighbor = neighbor; bestMove = { i, j }; }
    }
    if (bestNeighbor) {
      current = bestNeighbor; currentFit = bestNeighborFit;
      tabuList.push({ i: bestMove.i, j: bestMove.j, iter: iter + tenure });
      if (currentFit < bestFit) { bestFit = currentFit; best = current.slice(); }
    }
  }
  return { bins: decodeShelfFF(decodePerm(best), binW, binH), time: performance.now() - start, name: 'TS' };
}

function computeKPIs(result, pieces, binW, binH) {
  const totalArea = pieces.reduce((s, p) => s + p.area, 0);
  const binArea = binW * binH;
  const usedBins = result.bins.length;
  const usedArea = usedBins * binArea;
  const yieldRate = totalArea / usedArea;
  const wasteRate = 1 - yieldRate;
  const lbArea = Math.ceil(totalArea / binArea);
  const lbWidth = Math.ceil(pieces.reduce((s, p) => s + p.w, 0) / binW);
  const lbHeight = Math.ceil(pieces.reduce((s, p) => s + p.h, 0) / binH);
  const lb = Math.max(lbArea, lbWidth, lbHeight);
  const gap = usedBins - lb;
  const gapPercent = ((gap / lb) * 100).toFixed(1);
  const avgFillPerBin = usedBins > 0 ? (totalArea / usedBins) / binArea * 100 : 0;
  return {
    name: result.name, bins: usedBins, lb, gap, gapPercent,
    yield: (yieldRate * 100).toFixed(2), waste: (wasteRate * 100).toFixed(2), time: result.time.toFixed(2),
    history: result.history || [], avgFill: avgFillPerBin.toFixed(1), totalArea, binArea
  };
}

function Card({ title, children, style = {}, headerRight = null }) {
  return (
    <div style={{ background: T.bg.card, borderRadius: 12, border: '1px solid ' + T.border.default, padding: 24, boxShadow: '0 10px 15px -3px rgba(0,0,0,0.3)', ...style }}>
      {title && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid ' + T.border.default, paddingBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16, color: T.text.heading, fontWeight: 600 }}>{title}</h3>
          {headerRight}
        </div>
      )}
      {children}
    </div>
  );
}

function KpiCard({ label, value, sub, color = T.accent.blue, icon = null }) {
  return (
    <div style={{ background: T.bg.card, borderRadius: 10, border: '1px solid ' + T.border.default, padding: 16, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <div style={{ width: 40, height: 40, borderRadius: 8, background: color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', color: color, fontSize: 18, fontWeight: 700 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 12, color: T.text.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: T.text.main }}>{value}</div>
        {sub && <div style={{ fontSize: 12, color: T.text.muted, marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

function ProgressBar({ value, max = 100, color = T.accent.green, height = 6 }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div style={{ width: '100%', background: T.bg.elevated, borderRadius: height, overflow: 'hidden', height }}>
      <div style={{ width: pct + '%', background: color, height: '100%', borderRadius: height, transition: 'width 0.6s ease' }} />
    </div>
  );
}

function Badge({ text, color = T.accent.blue }) {
  return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, background: color + '20', color, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{text}</span>;
}

function BinCanvas({ bins, binW, binH, title, algoName }) {
  const [idx, setIdx] = useState(0);
  const bin = bins[idx] || null;
  const scale = 260 / Math.max(binW, binH);
  const colors = ['#38bdf8', '#34d399', '#fbbf24', '#fb7185', '#a78bfa', '#22d3ee', '#f472b6', '#818cf8', '#2dd4bf', '#fdba74'];
  if (!bin) return null;
  const usedArea = bin.pieces.reduce((s, p) => s + p.w * p.h, 0);
  const totalArea = binW * binH;
  const fillPct = ((usedArea / totalArea) * 100).toFixed(1);
  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 16, color: T.text.heading }}>{title} <Badge text={algoName} color={T.accent.violet} /></h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setIdx(Math.max(0, idx - 1))} disabled={idx === 0} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid ' + T.border.default, background: T.bg.elevated, color: T.text.main, cursor: idx === 0 ? 'not-allowed' : 'pointer', fontSize: 12 }}>Bac Prec.</button>
          <span style={{ fontSize: 13, color: T.text.muted, minWidth: 80, textAlign: 'center' }}>Bac {idx + 1}/{bins.length}</span>
          <button onClick={() => setIdx(Math.min(bins.length - 1, idx + 1))} disabled={idx >= bins.length - 1} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid ' + T.border.default, background: T.bg.elevated, color: T.text.main, cursor: idx >= bins.length - 1 ? 'not-allowed' : 'pointer', fontSize: 12 }}>Bac Suiv.</button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <div>
          <svg width={binW * scale} height={binH * scale} style={{ border: '2px solid ' + T.border.focus, background: T.bg.input, borderRadius: 8 }}>
            <defs>
              <pattern id="grid" width={scale * 10} height={scale * 10} patternUnits="userSpaceOnUse">
                <path d={`M ${scale * 10} 0 L 0 0 0 ${scale * 10}`} fill="none" stroke={T.border.default} strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width={binW * scale} height={binH * scale} fill="url(#grid)" />
            {bin.pieces.map((p, i) => (
              <g key={`${p.id}-${i}`}>
                <rect x={p.x * scale} y={p.y * scale} width={Math.max(1, p.w * scale)} height={Math.max(1, p.h * scale)} fill={colors[p.id % colors.length]} stroke="#fff" strokeWidth={0.5} opacity={0.95} rx={2}>
                  <title>{`Piece ${p.id}: ${Math.round(p.w)}x${Math.round(p.h)}${p.rotated ? ' [rot]' : ''}`}</title>
                </rect>
                {p.w * scale > 24 && p.h * scale > 16 && (
                  <text x={(p.x + p.w / 2) * scale} y={(p.y + p.h / 2) * scale} textAnchor="middle" dominantBaseline="middle" fontSize={9} fill="#fff" style={{ pointerEvents: 'none' }}>{p.id}</text>
                )}
              </g>
            ))}
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ background: T.bg.elevated, borderRadius: 8, padding: 16, marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: T.text.muted, marginBottom: 4 }}>Remplissage du bac actuel</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: T.accent.green }}>{fillPct}%</div>
            <ProgressBar value={parseFloat(fillPct)} max={100} color={parseFloat(fillPct) > 80 ? T.accent.green : parseFloat(fillPct) > 50 ? T.accent.amber : T.accent.rose} height={8} />
          </div>
          <div style={{ background: T.bg.elevated, borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 12, color: T.text.muted, marginBottom: 8 }}>Statistiques du bac #{idx + 1}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13 }}>
              <div style={{ color: T.text.muted }}>Pieces:</div><div style={{ color: T.text.main, textAlign: 'right', fontWeight: 600 }}>{bin.pieces.length}</div>
              <div style={{ color: T.text.muted }}>Aire occupee:</div><div style={{ color: T.text.main, textAlign: 'right', fontWeight: 600 }}>{usedArea.toLocaleString()} mm2</div>
              <div style={{ color: T.text.muted }}>Aire libre:</div><div style={{ color: T.text.main, textAlign: 'right', fontWeight: 600 }}>{(totalArea - usedArea).toLocaleString()} mm2</div>
              <div style={{ color: T.text.muted }}>Niveaux:</div><div style={{ color: T.text.main, textAlign: 'right', fontWeight: 600 }}>{bin.shelves.length}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BinPackingDashboard() {
  const [binW, setBinW] = useState(300);
  const [binH, setBinH] = useState(150);
  const [pieceCount, setPieceCount] = useState(500);
  const [dataset, setDataset] = useState([]);
  const [results, setResults] = useState([]);
  const [rawResults, setRawResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [gaHistory, setGaHistory] = useState([]);
  const [datasetPage, setDatasetPage] = useState(0);
  const [activeAlgoVis, setActiveAlgoVis] = useState(null);
  const [benchData, setBenchData] = useState([]);
  const [benchLoading, setBenchLoading] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const pageSize = 50;

  useEffect(() => { handleGenerate(); }, []);

  function handleGenerate() {
    const data = generateDataset(pieceCount, binW, binH);
    setDataset(data); setResults([]); setRawResults([]); setGaHistory([]); setDatasetPage(0); setActiveAlgoVis(null); setBenchData([]); setProgressMsg('');
  }

  async function runAll() {
    setLoading(true); setResults([]); setRawResults([]); setGaHistory([]); setActiveAlgoVis(null); setProgressMsg('');
    await new Promise(r => setTimeout(r, 50));

    setProgressMsg('Execution NFDH...');
    await new Promise(r => setTimeout(r, 10));
    const rNFDH = runNFDH(dataset, binW, binH);

    setProgressMsg('Execution FFDH...');
    await new Promise(r => setTimeout(r, 10));
    const rFFDH = runFFDH(dataset, binW, binH);

    setProgressMsg('Execution GA (metaheuristique - peut prendre du temps)...');
    await new Promise(r => setTimeout(r, 50));
    const rGA = runGA(dataset, binW, binH);

    setProgressMsg('Execution TS (metaheuristique)...');
    await new Promise(r => setTimeout(r, 50));
    const rTS = runTS(dataset, binW, binH);

    const kpiNFDH = computeKPIs(rNFDH, dataset, binW, binH);
    const kpiFFDH = computeKPIs(rFFDH, dataset, binW, binH);
    const kpiGA = computeKPIs(rGA, dataset, binW, binH);
    const kpiTS = computeKPIs(rTS, dataset, binW, binH);
    const all = [kpiNFDH, kpiFFDH, kpiGA, kpiTS];
    setResults(all); setRawResults([rNFDH, rFFDH, rGA, rTS]); setGaHistory(rGA.history);
    const best = all.reduce((a, b) => (parseFloat(a.yield) > parseFloat(b.yield) ? a : b));
    setActiveAlgoVis(best.name);
    setLoading(false);
    setProgressMsg('');
  }

  async function runBenchmark() {
    if (!dataset.length) return;
    setBenchLoading(true);
    setBenchData([]);
    setProgressMsg('');
    await new Promise(r => setTimeout(r, 50));

    const sizes = [50, 100, 200, 500, 1000, 2000, 5000].filter(s => s <= dataset.length);
    const data = [];

    for (const size of sizes) {
      setProgressMsg(`Benchmark en cours: N=${size}...`);
      await new Promise(r => setTimeout(r, 10));

      const subset = dataset.slice(0, size);

      const r1 = runNFDH(subset, binW, binH);
      const r2 = runFFDH(subset, binW, binH);

      // GA et TS avec parametres adaptes - PAS de limitation de taille
      setProgressMsg(`Benchmark: N=${size} - GA en cours (params adaptes)...`);
      await new Promise(r => setTimeout(r, 10));
      const r3 = runGA(subset, binW, binH);

      setProgressMsg(`Benchmark: N=${size} - TS en cours...`);
      await new Promise(r => setTimeout(r, 10));
      const r4 = runTS(subset, binW, binH);

      const lb = Math.ceil(subset.reduce((s, p) => s + p.area, 0) / (binW * binH));
      data.push({ size, NFDH: r1.bins.length, FFDH: r2.bins.length, GA: r3.bins.length, TS: r4.bins.length, LB: lb });

      // Mise a jour progressive pour voir l avancement
      setBenchData([...data]);
    }

    setBenchLoading(false);
    setProgressMsg('Benchmark termine!');
  }

  const stats = useMemo(() => computeStats(dataset), [dataset]);
  const histW = useMemo(() => buildHistogram(dataset.map(p => p.w), 18), [dataset]);
  const histH = useMemo(() => buildHistogram(dataset.map(p => p.h), 18), [dataset]);
  const histArea = useMemo(() => buildHistogram(dataset.map(p => p.area), 18), [dataset]);
  const scatterData = useMemo(() => dataset.map(p => ({ x: p.w, y: p.h, area: p.area })), [dataset]);

  const chartData = useMemo(() => results.map(r => ({
    name: r.name, Bacs: r.bins, 'Borne Inf': r.lb, 'Yield (%)': parseFloat(r.yield), 'Waste (%)': parseFloat(r.waste), 'Temps (ms)': parseFloat(r.time), 'AvgFill': parseFloat(r.avgFill)
  })), [results]);

  const radarData = useMemo(() => {
    if (!results.length) return [];
    const maxTime = Math.max(...results.map(r => parseFloat(r.time))) || 1;
    return results.map(r => ({
      subject: r.name, Yield: parseFloat(r.yield), Rapidite: Math.max(0, 100 - (parseFloat(r.time) / maxTime) * 100), Optimalite: Math.max(0, 100 - parseFloat(r.gapPercent)), Robustesse: Math.max(0, 100 - parseFloat(r.waste))
    }));
  }, [results]);

  const paginatedData = dataset.slice(datasetPage * pageSize, (datasetPage + 1) * pageSize);
  const totalPages = Math.ceil(dataset.length / pageSize);

  const maxDiversity = useMemo(() => gaHistory.length ? Math.max(...gaHistory.map(h => h.diversity || 0), 1) : 1, [gaHistory]);

  return (
    <div style={{ fontFamily: T.font.sans, background: T.bg.main, color: T.text.main, minHeight: '100vh', padding: '32px 24px' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>

        {/* HEADER */}
        <header style={{ marginBottom: 40, textAlign: 'center', position: 'relative', paddingTop: 20 }}>
          <div style={{ position: 'absolute', top: 0, left: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
            <img
              src="/src/assets/ENSMR.png"
              alt="ENSMR Logo"
              style={{ height: 70, width: 'auto', borderRadius: 8, background: '#fff', padding: 4 }}
            />
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text.heading, lineHeight: 1.3 }}>ECOLE NATIONALE</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text.heading, lineHeight: 1.3 }}>SUPERIEURE DES MINES DE RABAT</div>
              <div style={{ fontSize: 12, color: T.accent.amber, fontWeight: 600, letterSpacing: 1 }}>RABAT - MAROC</div>
            </div>
          </div>

          <div style={{ display: 'inline-block', padding: '6px 16px', borderRadius: 20, background: T.accent.blue + '15', color: T.accent.blue, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16, marginTop: 20 }}>ETUDE DE CAS & BENCHMARK</div>
          <h1 style={{ fontSize: 58, margin: '16px 0 0', fontWeight: 800, letterSpacing: -0.5, background: 'linear-gradient(135deg,' + T.text.main + ' 0%,' + T.accent.blue + ' 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', lineHeight: 1.2 }}>Opticut 2D</h1>
          
        </header>



        {/* PANNEAU DE CONTROLE */}
        <Card title="2. Laboratoire de Generation des Donnees" style={{ marginBottom: 24 }} headerRight={<Badge text="Box-Muller + Troncature" color={T.accent.cyan} />}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20, marginBottom: 24 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: T.text.muted, marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Nombre de pieces (commandes)</label>
              <input type="range" min={50} max={5000} step={50} value={pieceCount} onChange={e => setPieceCount(Number(e.target.value))} style={{ width: '100%', accentColor: T.accent.blue }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 13, color: T.text.muted }}><span>50</span><span style={{ color: T.text.main, fontWeight: 700 }}>{pieceCount} pieces</span><span>5000</span></div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: T.text.muted, marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Largeur du bac (mm)</label>
              <input type="number" value={binW} onChange={e => setBinW(Number(e.target.value))} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid ' + T.border.default, background: T.bg.input, color: T.text.main, fontSize: 14 }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: T.text.muted, marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Hauteur du bac (mm)</label>
              <input type="number" value={binH} onChange={e => setBinH(Number(e.target.value))} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid ' + T.border.default, background: T.bg.input, color: T.text.main, fontSize: 14 }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button onClick={handleGenerate} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,' + T.accent.blue + ',' + T.accent.cyan + ')', color: '#fff', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px ' + T.accent.blue + '30' }}>Generer Dataset</button>
            <button onClick={runAll} disabled={loading || dataset.length === 0} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: loading ? '#334155' : 'linear-gradient(135deg,' + T.accent.green + ',' + T.accent.cyan + ')', color: '#fff', fontWeight: 700, cursor: loading || dataset.length === 0 ? 'not-allowed' : 'pointer', boxShadow: loading ? 'none' : '0 4px 12px ' + T.accent.green + '30' }}>{loading ? 'Execution en cours...' : 'Lancer Benchmark Complet'}</button>
            <button onClick={runBenchmark} disabled={benchLoading || dataset.length === 0} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: benchLoading ? '#334155' : 'linear-gradient(135deg,' + T.accent.amber + ',' + T.accent.rose + ')', color: '#fff', fontWeight: 700, cursor: benchLoading || dataset.length === 0 ? 'not-allowed' : 'pointer', boxShadow: benchLoading ? 'none' : '0 4px 12px ' + T.accent.amber + '30' }}>{benchLoading ? 'Benchmark en cours...' : 'Benchmark Scalabilite'}</button>
          </div>
          {(loading || benchLoading || progressMsg) && (
            <div style={{ marginTop: 16, padding: 12, background: T.bg.elevated, borderRadius: 8, fontSize: 13, color: T.accent.amber }}>
              {progressMsg || 'Traitement en cours...'}
            </div>
          )}
        </Card>

        {/* DATASET */}
        {dataset.length > 0 && (
          <Card title="3. Analyse du Dataset Synthetique" style={{ marginBottom: 24 }} headerRight={<Badge text={`N=${dataset.length}`} color={T.accent.green} />}>
            <p style={{ color: T.text.muted, fontSize: 14, lineHeight: 1.6, margin: '0 0 20px' }}>
              Les dimensions sont generees par la methode de <strong>Box-Muller</strong> suivant une loi normale tronquee : <span style={{ fontFamily: T.font.mono, color: T.accent.amber }}>W ~ N({Math.round(binW * 0.25)}, {Math.round(binW * 0.25 * 0.35)})</span> et <span style={{ fontFamily: T.font.mono, color: T.accent.amber }}>H ~ N({Math.round(binH * 0.25)}, {Math.round(binH * 0.25 * 0.35)})</span>. Les valeurs sont contraintes dans [<span style={{ fontFamily: T.font.mono }}>{Math.round(Math.min(binW, binH) * 0.05)}</span>, <span style={{ fontFamily: T.font.mono }}>{Math.round(Math.min(binW, binH) * 0.8)}</span>] pour eviter les pieces negligeables ou monopolisantes. Cette distribution simule la variabilite reelle des gabarits clients autour des standards industriels.
            </p>
            {stats && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 24 }}>
                  <KpiCard label="Total Pieces" value={stats.count} sub="commandes simulees" color={T.accent.blue} icon="#" />
                  <KpiCard label="Moyenne W" value={stats.avgW + ' mm'} sub={`med: ${stats.medW} mm`} color={T.accent.cyan} icon="W" />
                  <KpiCard label="Ecart-type W" value={stats.stdW + ' mm'} sub={`CV: ${stats.cvW}%`} color={T.accent.violet} icon="s" />
                  <KpiCard label="Moyenne H" value={stats.avgH + ' mm'} sub={`med: ${stats.medH} mm`} color={T.accent.green} icon="H" />
                  <KpiCard label="Ecart-type H" value={stats.stdH + ' mm'} sub={`CV: ${stats.cvH}%`} color={T.accent.amber} icon="s" />
                  <KpiCard label="Aire Totale" value={(stats.totalArea / 1e6).toFixed(2) + ' m2'} sub={`${stats.totalArea.toLocaleString()} mm2`} color={T.accent.rose} icon="A" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24, marginBottom: 24 }}>
                  <div>
                    <h4 style={{ margin: '0 0 12px', fontSize: 13, color: T.text.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Distribution Largeurs (mm)</h4>
                    <ResponsiveContainer width="100%" height={220}><BarChart data={histW}><CartesianGrid strokeDasharray="3 3" stroke={T.border.default} /><XAxis dataKey="bin" hide /><YAxis stroke={T.text.muted} fontSize={11} /><Tooltip contentStyle={{ background: T.bg.elevated, border: '1px solid ' + T.border.default, color: T.text.main }} /><Bar dataKey="count" fill={T.accent.blue} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
                  </div>
                  <div>
                    <h4 style={{ margin: '0 0 12px', fontSize: 13, color: T.text.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Distribution Hauteurs (mm)</h4>
                    <ResponsiveContainer width="100%" height={220}><BarChart data={histH}><CartesianGrid strokeDasharray="3 3" stroke={T.border.default} /><XAxis dataKey="bin" hide /><YAxis stroke={T.text.muted} fontSize={11} /><Tooltip contentStyle={{ background: T.bg.elevated, border: '1px solid ' + T.border.default, color: T.text.main }} /><Bar dataKey="count" fill={T.accent.green} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
                  </div>
                  <div>
                    <h4 style={{ margin: '0 0 12px', fontSize: 13, color: T.text.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Distribution Aires (mm2)</h4>
                    <ResponsiveContainer width="100%" height={220}><BarChart data={histArea}><CartesianGrid strokeDasharray="3 3" stroke={T.border.default} /><XAxis dataKey="bin" hide /><YAxis stroke={T.text.muted} fontSize={11} /><Tooltip contentStyle={{ background: T.bg.elevated, border: '1px solid ' + T.border.default, color: T.text.main }} /><Bar dataKey="count" fill={T.accent.amber} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
                  </div>
                  <div>
                    <h4 style={{ margin: '0 0 12px', fontSize: 13, color: T.text.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Nuage de Points W x H</h4>
                    <ResponsiveContainer width="100%" height={220}><ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}><CartesianGrid strokeDasharray="3 3" stroke={T.border.default} /><XAxis type="number" dataKey="x" name="Largeur" stroke={T.text.muted} fontSize={11} label={{ value: 'W (mm)', position: 'bottom', fill: T.text.muted, fontSize: 11 }} /><YAxis type="number" dataKey="y" name="Hauteur" stroke={T.text.muted} fontSize={11} label={{ value: 'H (mm)', angle: -90, position: 'insideLeft', fill: T.text.muted, fontSize: 11 }} /><Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ background: T.bg.elevated, border: '1px solid ' + T.border.default, color: T.text.main, fontSize: 12 }} /><Scatter name="Pieces" data={scatterData} fill={T.accent.blue} opacity={0.7} /></ScatterChart></ResponsiveContainer>
                  </div>
                </div>
                <h4 style={{ margin: '0 0 12px', fontSize: 13, color: T.text.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Apercu des donnees brutes (pagines)</h4>
                <div style={{ maxHeight: 340, overflow: 'auto', border: '1px solid ' + T.border.default, borderRadius: 8 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead style={{ position: 'sticky', top: 0, background: T.bg.elevated, zIndex: 1 }}>
                      <tr>
                        <th style={{ padding: '10px 12px', borderBottom: '1px solid ' + T.border.default, textAlign: 'left', color: T.text.heading, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>ID</th>
                        <th style={{ padding: '10px 12px', borderBottom: '1px solid ' + T.border.default, textAlign: 'right', color: T.text.heading, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>W (mm)</th>
                        <th style={{ padding: '10px 12px', borderBottom: '1px solid ' + T.border.default, textAlign: 'right', color: T.text.heading, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>H (mm)</th>
                        <th style={{ padding: '10px 12px', borderBottom: '1px solid ' + T.border.default, textAlign: 'right', color: T.text.heading, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Aire (mm2)</th>
                        <th style={{ padding: '10px 12px', borderBottom: '1px solid ' + T.border.default, textAlign: 'center', color: T.text.heading, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Rot. 90</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedData.map(p => (
                        <tr key={p.id} style={{ background: p.id % 2 === 0 ? T.bg.card : T.bg.elevated }}>
                          <td style={{ padding: '8px 12px', borderBottom: '1px solid ' + T.border.default, color: T.text.muted, fontFamily: T.font.mono, fontSize: 12 }}>{p.id}</td>
                          <td style={{ padding: '8px 12px', borderBottom: '1px solid ' + T.border.default, textAlign: 'right', color: T.text.main, fontWeight: 500 }}>{p.w}</td>
                          <td style={{ padding: '8px 12px', borderBottom: '1px solid ' + T.border.default, textAlign: 'right', color: T.text.main, fontWeight: 500 }}>{p.h}</td>
                          <td style={{ padding: '8px 12px', borderBottom: '1px solid ' + T.border.default, textAlign: 'right', color: T.accent.amber, fontFamily: T.font.mono }}>{p.area.toLocaleString()}</td>
                          <td style={{ padding: '8px 12px', borderBottom: '1px solid ' + T.border.default, textAlign: 'center', color: p.h !== p.w ? T.accent.green : T.text.muted, fontSize: 12 }}>{p.h !== p.w ? 'Oui' : 'Non'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 14 }}>
                  <button disabled={datasetPage === 0} onClick={() => setDatasetPage(datasetPage - 1)} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid ' + T.border.default, background: T.bg.elevated, color: T.text.main, cursor: datasetPage === 0 ? 'not-allowed' : 'pointer', fontSize: 12 }}>Precedent</button>
                  <span style={{ fontSize: 13, color: T.text.muted }}>Page {datasetPage + 1} / {totalPages}</span>
                  <button disabled={datasetPage >= totalPages - 1} onClick={() => setDatasetPage(datasetPage + 1)} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid ' + T.border.default, background: T.bg.elevated, color: T.text.main, cursor: datasetPage >= totalPages - 1 ? 'not-allowed' : 'pointer', fontSize: 12 }}>Suivant</button>
                </div>
              </>
            )}
          </Card>
        )}

        {/* THEORIE ALGO */}
        <Card title="4. Theorie Algorithmique" style={{ marginBottom: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
            <div style={{ background: T.bg.elevated, borderRadius: 8, padding: 16, border: '1px solid ' + T.border.default }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}><Badge text="Heuristique" color={T.accent.blue} /><span style={{ fontWeight: 700, color: T.text.heading }}>NFDH</span></div>
              <p style={{ margin: 0, fontSize: 13, color: T.text.muted, lineHeight: 1.6 }}>Next-Fit Decreasing Height. Les pieces sont triees par hauteur decroissante. Un seul niveau (shelf) actif a la fois dans le bac courant. Si la piece ne tient pas en largeur, le niveau est ferme et un nouveau est ouvert. Complexite <span style={{ fontFamily: T.font.mono, color: T.accent.amber }}>O(n log n)</span>.</p>
            </div>
            <div style={{ background: T.bg.elevated, borderRadius: 8, padding: 16, border: '1px solid ' + T.border.default }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}><Badge text="Heuristique" color={T.accent.blue} /><span style={{ fontWeight: 700, color: T.text.heading }}>FFDH</span></div>
              <p style={{ margin: 0, fontSize: 13, color: T.text.muted, lineHeight: 1.6 }}>First-Fit Decreasing Height. Meme tri initial, mais chaque piece est placee dans le premier niveau existant (parmi tous les niveaux du bac courant) ou elle tient en largeur. Meilleure reutilisation des espaces residuels. Complexite <span style={{ fontFamily: T.font.mono, color: T.accent.amber }}>O(n^2)</span> naive.</p>
            </div>
            <div style={{ background: T.bg.elevated, borderRadius: 8, padding: 16, border: '1px solid ' + T.border.default }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}><Badge text="Metaheuristique" color={T.accent.violet} /><span style={{ fontWeight: 700, color: T.text.heading }}>Algorithme Genetique</span></div>
              <p style={{ margin: 0, fontSize: 13, color: T.text.muted, lineHeight: 1.6 }}>Optimise l ordre d insertion (permutation) decode par Shelf-FF. Population diversifiee avec seeds optimaux + perturbations + aleatoire. Parametres adaptatifs selon N (popSize et generations reduits pour N eleve). Restart partiel avec fluctuation visible apres stagnation. Mutation adaptative jusqu a 80%. Operateur OX + 4 mutations disruptives combinees.</p>
            </div>
            <div style={{ background: T.bg.elevated, borderRadius: 8, padding: 16, border: '1px solid ' + T.border.default }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}><Badge text="Metaheuristique" color={T.accent.violet} /><span style={{ fontWeight: 700, color: T.text.heading }}>Recherche Tabou</span></div>
              <p style={{ margin: 0, fontSize: 13, color: T.text.muted, lineHeight: 1.6 }}>Exploration locale par swaps dans la permutation. Liste tabou de taille fixe evitant les cycles. Critere d aspiration acceptant un mouvement tabou s il ameliore le meilleur global connu. Voisinage echantillonne pour la reactivite.</p>
            </div>
          </div>
        </Card>

        {/* RESULTATS */}
        {results.length > 0 && (
          <>
            <Card title="5. Resultats & KPIs Industriels" style={{ marginBottom: 24 }} headerRight={<Badge text="Benchmark Termine" color={T.accent.green} />}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
                {(() => {
                  const bestYield = results.reduce((a, b) => parseFloat(a.yield) > parseFloat(b.yield) ? a : b);
                  const bestTime = results.reduce((a, b) => parseFloat(a.time) < parseFloat(b.time) ? a : b);
                  const avgGap = (results.reduce((s, r) => s + parseFloat(r.gapPercent), 0) / results.length).toFixed(1);
                  return (
                    <>
                      <KpiCard label="Meilleur Yield" value={bestYield.yield + '%'} sub={'Algo: ' + bestYield.name} color={T.accent.green} icon="Y" />
                      <KpiCard label="Plus Rapide" value={bestTime.time + ' ms'} sub={'Algo: ' + bestTime.name} color={T.accent.cyan} icon="T" />
                      <KpiCard label="Ecart Moyen LB" value={avgGap + '%'} sub="vs Borne Inf." color={T.accent.amber} icon="LB" />
                      <KpiCard label="Bacs Total (Best)" value={bestYield.bins + ''} sub={'LB = ' + bestYield.lb} color={T.accent.blue} icon="B" />
                    </>
                  );
                })()}
              </div>
              <div style={{ overflowX: 'auto', marginBottom: 24 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr style={{ background: T.bg.elevated }}>
                      <th style={{ textAlign: 'left', padding: 14, borderBottom: '2px solid ' + T.border.default, color: T.text.heading, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Algorithme</th>
                      <th style={{ textAlign: 'center', padding: 14, borderBottom: '2px solid ' + T.border.default, color: T.text.heading, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Bacs</th>
                      <th style={{ textAlign: 'center', padding: 14, borderBottom: '2px solid ' + T.border.default, color: T.text.heading, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Borne Inf.</th>
                      <th style={{ textAlign: 'center', padding: 14, borderBottom: '2px solid ' + T.border.default, color: T.text.heading, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Gap</th>
                      <th style={{ textAlign: 'left', padding: 14, borderBottom: '2px solid ' + T.border.default, color: T.text.heading, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Yield</th>
                      <th style={{ textAlign: 'left', padding: 14, borderBottom: '2px solid ' + T.border.default, color: T.text.heading, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Rebut</th>
                      <th style={{ textAlign: 'center', padding: 14, borderBottom: '2px solid ' + T.border.default, color: T.text.heading, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Temps (ms)</th>
                      <th style={{ textAlign: 'center', padding: 14, borderBottom: '2px solid ' + T.border.default, color: T.text.heading, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Rempliss. Moy.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => (
                      <tr key={r.name} style={{ background: i % 2 === 0 ? T.bg.card : T.bg.elevated }}>
                        <td style={{ padding: 14, borderBottom: '1px solid ' + T.border.default, fontWeight: 700, color: T.text.heading }}>{r.name}</td>
                        <td style={{ textAlign: 'center', padding: 14, borderBottom: '1px solid ' + T.border.default, color: T.text.main, fontFamily: T.font.mono }}>{r.bins}</td>
                        <td style={{ textAlign: 'center', padding: 14, borderBottom: '1px solid ' + T.border.default, color: T.text.muted, fontFamily: T.font.mono }}>{r.lb}</td>
                        <td style={{ textAlign: 'center', padding: 14, borderBottom: '1px solid ' + T.border.default, color: parseFloat(r.gapPercent) <= 5 ? T.accent.green : parseFloat(r.gapPercent) <= 20 ? T.accent.amber : T.accent.rose, fontWeight: 700 }}>{r.gapPercent}%</td>
                        <td style={{ padding: 14, borderBottom: '1px solid ' + T.border.default }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ minWidth: 48, fontWeight: 700, color: T.accent.green }}>{r.yield}%</span>
                            <div style={{ flex: 1 }}><ProgressBar value={parseFloat(r.yield)} max={100} color={parseFloat(r.yield) > 80 ? T.accent.green : parseFloat(r.yield) > 60 ? T.accent.amber : T.accent.rose} height={6} /></div>
                          </div>
                        </td>
                        <td style={{ padding: 14, borderBottom: '1px solid ' + T.border.default }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ minWidth: 48, fontWeight: 700, color: T.accent.rose }}>{r.waste}%</span>
                            <div style={{ flex: 1 }}><ProgressBar value={parseFloat(r.waste)} max={100} color={T.accent.rose} height={6} /></div>
                          </div>
                        </td>
                        <td style={{ textAlign: 'center', padding: 14, borderBottom: '1px solid ' + T.border.default, color: T.text.muted, fontFamily: T.font.mono }}>{r.time}</td>
                        <td style={{ textAlign: 'center', padding: 14, borderBottom: '1px solid ' + T.border.default, color: T.text.muted, fontFamily: T.font.mono }}>{r.avgFill}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* GRAPHIQUES */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 24, marginBottom: 24 }}>
              <Card title="Bacs vs Borne Inferieure">
                <ResponsiveContainer width="100%" height={300}><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke={T.border.default} /><XAxis dataKey="name" stroke={T.text.muted} /><YAxis stroke={T.text.muted} /><Tooltip contentStyle={{ background: T.bg.elevated, border: '1px solid ' + T.border.default, color: T.text.main }} /><Legend /><Bar dataKey="Bacs" fill={T.accent.blue} radius={[4, 4, 0, 0]} /><Bar dataKey="Borne Inf" fill={T.text.muted + '60'} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
              </Card>
              <Card title="Yield vs Waste">
                <ResponsiveContainer width="100%" height={300}><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke={T.border.default} /><XAxis dataKey="name" stroke={T.text.muted} /><YAxis domain={[0, 100]} stroke={T.text.muted} /><Tooltip contentStyle={{ background: T.bg.elevated, border: '1px solid ' + T.border.default, color: T.text.main }} /><Legend /><Bar dataKey="Yield (%)" fill={T.accent.green} radius={[4, 4, 0, 0]} /><Bar dataKey="Waste (%)" fill={T.accent.rose} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
              </Card>
              <Card title="Temps d Execution (ms)">
                <ResponsiveContainer width="100%" height={300}><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke={T.border.default} /><XAxis dataKey="name" stroke={T.text.muted} /><YAxis stroke={T.text.muted} scale="log" domain={['auto', 'auto']} /><Tooltip contentStyle={{ background: T.bg.elevated, border: '1px solid ' + T.border.default, color: T.text.main }} /><Bar dataKey="Temps (ms)" fill={T.accent.amber} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
              </Card>
              <Card title="Radar de Performance">
                <ResponsiveContainer width="100%" height={300}><RadarChart data={radarData}><PolarGrid stroke={T.border.default} /><PolarAngleAxis dataKey="subject" stroke={T.text.muted} tick={{ fill: T.text.muted, fontSize: 12 }} /><PolarRadiusAxis angle={30} domain={[0, 100]} stroke={T.border.default} /><Radar name="Yield" dataKey="Yield" stroke={T.accent.green} fill={T.accent.green} fillOpacity={0.25} /><Radar name="Rapidite" dataKey="Rapidite" stroke={T.accent.amber} fill={T.accent.amber} fillOpacity={0.25} /><Radar name="Optimalite" dataKey="Optimalite" stroke={T.accent.blue} fill={T.accent.blue} fillOpacity={0.25} /><Radar name="Robustesse" dataKey="Robustesse" stroke={T.accent.cyan} fill={T.accent.cyan} fillOpacity={0.15} /><Legend wrapperStyle={{ color: T.text.muted }} /></RadarChart></ResponsiveContainer>
              </Card>
            </div>

            {/* CONVERGENCE GA avec diversite */}
            {gaHistory.length > 0 && (
              <Card title="Convergence Genetique" style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', gap: 20, marginBottom: 10, flexWrap: 'wrap', fontSize: 12, color: T.text.muted }}>
                  <span>● <span style={{ color: T.accent.violet }}>Meilleur</span> : fitness de la meilleure solution</span>
                  <span>--- <span style={{ color: T.accent.violet + '80' }}>Moyenne</span> : fitness moyenne de la population</span>
                  <span>-- <span style={{ color: T.accent.rose + '80' }}>Pire</span> : pire individu de la population</span>
                  <span style={{ color: T.accent.amber }}>◉ Points ambre = restarts (stagnation &gt; max gens)</span>
                  <span>·· <span style={{ color: T.accent.amber + 'CC' }}>Diversite &rarr;</span> : axe droit (positions distinctes / paire)</span>
                </div>
                <ResponsiveContainer width="100%" height={340}>
                  <LineChart data={gaHistory} margin={{ top: 10, right: 70, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={T.border.default} />
                    <XAxis dataKey="gen" stroke={T.text.muted} label={{ value: 'Generation', position: 'insideBottomRight', offset: -5, fill: T.text.muted, fontSize: 11 }} />
                    <YAxis yAxisId="left" stroke={T.text.muted} domain={['auto', 'auto']} label={{ value: 'Bacs utilises', angle: -90, position: 'insideLeft', fill: T.text.muted, fontSize: 11 }} />
                    <YAxis yAxisId="right" orientation="right" stroke={T.accent.amber} domain={[0, maxDiversity]} label={{ value: 'Diversite', angle: 90, position: 'insideRight', fill: T.accent.amber, fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: T.bg.elevated, border: '1px solid ' + T.border.default, color: T.text.main }} formatter={(value, name) => [value, name]} />
                    <Legend wrapperStyle={{ color: T.text.muted, fontSize: 12 }} />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="best"
                      stroke={T.accent.violet}
                      strokeWidth={3}
                      dot={(props) => {
                        const { cx, cy, payload } = props;
                        if (payload.restart) return <circle key={`dot-${payload.gen}`} cx={cx} cy={cy} r={6} fill={T.accent.amber} stroke="white" strokeWidth={2} />;
                        return <circle key={`dot-${payload.gen}`} cx={cx} cy={cy} r={0} />;
                      }}
                      name="Meilleur"
                    />
                    <Line yAxisId="left" type="monotone" dataKey="avg" stroke={T.accent.violet + '70'} strokeWidth={2} strokeDasharray="4 4" dot={false} name="Moyenne" />
                    <Line yAxisId="left" type="monotone" dataKey="worst" stroke={T.accent.rose + '50'} strokeWidth={1} strokeDasharray="2 4" dot={false} name="Pire" />
                    <Line yAxisId="right" type="monotone" dataKey="diversity" stroke={T.accent.amber} strokeWidth={1.5} strokeDasharray="3 3" dot={false} name="Diversite &rarr;" opacity={0.85} />
                  </LineChart>
                </ResponsiveContainer>
              </Card>
            )}

            {/* BENCHMARK SCALABILITE */}
            {benchData.length > 0 && (
              <Card title="Benchmark Scalabilite — Tous Algorithmes sur Dataset Complet (Bacs vs N)" style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 12, color: T.text.muted, marginBottom: 10 }}>
                  GA et TS traitent chaque sous-ensemble en entier avec parametres adaptatifs (popSize/gens reduits pour N eleve). Courbe LB = borne inferieure theorique.
                </div>
                <ResponsiveContainer width="100%" height={340}>
                  <LineChart data={benchData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={T.border.default} />
                    <XAxis dataKey="size" stroke={T.text.muted} type="number" scale="log" domain={['auto', 'auto']} label={{ value: 'Nombre de pieces (N, echelle log)', position: 'insideBottomRight', offset: -5, fill: T.text.muted, fontSize: 12 }} />
                    <YAxis stroke={T.text.muted} label={{ value: 'Bacs utilises', angle: -90, position: 'insideLeft', fill: T.text.muted, fontSize: 12 }} />
                    <Tooltip contentStyle={{ background: T.bg.elevated, border: '1px solid ' + T.border.default, color: T.text.main }} />
                    <Legend />
                    <Line type="monotone" dataKey="NFDH" stroke={T.accent.blue} strokeWidth={2} dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="FFDH" stroke={T.accent.cyan} strokeWidth={2} dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="GA" stroke={T.accent.violet} strokeWidth={2} dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="TS" stroke={T.accent.rose} strokeWidth={2} dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="LB" stroke={T.text.muted} strokeWidth={2} strokeDasharray="6 4" dot={false} name="Borne Inf." />
                  </LineChart>
                </ResponsiveContainer>
              </Card>
            )}

            {/* VISUALISATION */}
            {rawResults.length > 0 && (
              <Card title="6. Visualisation Industrielle des Placements" style={{ marginBottom: 40 }} headerRight={
                <select value={activeAlgoVis} onChange={e => setActiveAlgoVis(e.target.value)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid ' + T.border.default, background: T.bg.input, color: T.text.main, fontSize: 13, cursor: 'pointer' }}>
                  {rawResults.map(r => (<option key={r.name} value={r.name}>{r.name}</option>))}
                </select>
              }>
                {(() => {
                  const res = rawResults.find(r => r.name === activeAlgoVis);
                  if (!res) return <div style={{ color: T.text.muted }}>Selectionnez un algorithme.</div>;
                  return <BinCanvas bins={res.bins} binW={binW} binH={binH} title="Placement Optimal" algoName={res.name} />;
                })()}
              </Card>
            )}
          </>
        )}

      </div>
    </div>
  );
}
