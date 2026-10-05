import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import type { AgentEvent, McpServerId } from '@mawa/shared';
import { summaryKo } from '../lib/copy.js';

/**
 * The agent's run as a night-shift ops office, drawn in code (no image assets).
 * Every MCP server is a person in their own room (GitHub, 메일, 일정, eCampus); the agent walks
 * between them and carries the results back as glowing data; the model is an AI core behind a
 * security gate, where the data policy's guard strips what it masks before anything goes in.
 * Nothing is staged: every move is one run event (tool_call_started → walk to that room and light
 * it, llm_request → scan at the gate with the masked count, …), queued with a minimum duration so
 * a fast replay stays readable.
 */

// ================================================================ geometry (logical pixels)
const W = 400;
const H = 225;
const CORRIDOR = 115;
type Spot = { x: number; y: number };
type RoomId = McpServerId | 'agent' | 'ai';
type Room = { x: number; y: number; w: number; h: number; door: number; label: string; neon: string; sign: string };
const TOP = { y: 22, h: 78 };
const BOT = { y: 126, h: 95 };
const COLS = [6, 138, 270];
const ROOMS: Record<RoomId, Room> = {
  github: { x: COLS[0]!, ...TOP, w: 124, door: 68, label: 'GitHub 개발실', neon: '#a78bfa', sign: 'GIT' },
  gmail: { x: COLS[1]!, ...TOP, w: 124, door: 200, label: '메일실', neon: '#fb7185', sign: 'MAIL' },
  calendar: { x: COLS[2]!, ...TOP, w: 124, door: 332, label: '일정실', neon: '#2dd4bf', sign: 'CAL' },
  lms: { x: COLS[0]!, ...BOT, w: 124, door: 68, label: 'eCampus 자료실', neon: '#a3e635', sign: 'LMS' },
  agent: { x: COLS[1]!, ...BOT, w: 124, door: 200, label: '내 자리', neon: '#60a5fa', sign: 'HQ' },
  ai: { x: COLS[2]!, ...BOT, w: 124, door: 332, label: 'AI 회의실', neon: '#e879f9', sign: 'AI' },
};
const SEAT: Record<McpServerId, Spot> = { github: { x: 68, y: 70 }, gmail: { x: 200, y: 70 }, calendar: { x: 332, y: 70 }, lms: { x: 68, y: 178 } };
const VISIT: Record<RoomId, Spot> = { github: { x: 84, y: 96 }, gmail: { x: 216, y: 96 }, calendar: { x: 348, y: 96 }, lms: { x: 86, y: 212 }, agent: { x: 200, y: 180 }, ai: { x: 312, y: 206 } };
const DESKS: Array<{ x: number; y: number; w: number }> = [{ x: 46, y: 70, w: 46 }, { x: 178, y: 70, w: 46 }, { x: 310, y: 70, w: 46 }, { x: 46, y: 178, w: 46 }, { x: 168, y: 180, w: 64 }];
const GUARD: Spot = { x: 352, y: 124 };
const GATE_X = 332;
const CORE: Spot = { x: 356, y: 184 };
const PRINTER: Spot = { x: 246, y: 170 };

// ================================================================ palette helpers
const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)] as const;
const mix = (a: string, b: string, t: number) => { const A = hex(a), B = hex(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i]! - v) * t)).join(',')})`; };
const rgba = (h: string, a: number) => { const [r, g, b] = hex(h); return `rgba(${r},${g},${b},${a})`; };
// Stable per-cell noise for textures and blinking windows.
const noise = (x: number, y: number, s = 0) => { const n = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return n - Math.floor(n); };

// ================================================================ sprites (14×20)
// K outline · H hair · h hair light · S skin · E eye · C shirt · c shirt light · D shirt shade · P trousers · B shoes · Q cap · Y badge
const HEAD = ['.....KKKK.....', '...KKHHHHKK...', '..KHhhHHHHHK..', '..KHHHHHHHHK..', '..KHSSSSSSHK..', '..KSSESSESSK..', '..KSSSSSSSSK..', '...KSSSSSSK...', '....KKSSKK....'];
const CAP = ['....KKKKKK....', '...KQQQQQQK...', '..KQQQYQQQQK..', '.KKKKKKKKKKKK.', '..KHSSSSSSHK..', '..KSSESSESSK..', '..KSSSSSSSSK..', '...KSSSSSSK...', '....KKSSKK....'];
const TORSO = ['...KCCCCCCK...', '..KCcCCCCCCK..', '.KSKCCCCCCKSK.', '.KSKCCCCCCKSK.', '.KSKDCCCCDKSK.', '..KKDDDDDDKK..', '....KPPPPK....'];
const TORSO_TYPE = ['...KCCCCCCK...', '..KCcCCCCCCK..', '.KCCCCCCCCCCK.', 'KSSCCCCCCCCSSK', '.KKDCCCCCCDKK.', '..KKDDDDDDKK..', '....KPPPPK....'];
const LEGS = {
  stand: ['....KPKKPK....', '....KPKKPK....', '....KBKKBK....', '.....K..K.....'],
  walk1: ['...KPK.KPK....', '...KPK..KPK...', '...KBK..KBK...', '....K....K....'],
  walk2: ['....KPK.KPK...', '....KPK..KPK..', '....KBK..KBK..', '.....K....K...'],
};
type Look = { H: string; h: string; C: string; c: string; D: string; P: string; cap?: boolean };
const LOOK: Record<string, Look> = {
  agent: { H: '#2b1d16', h: '#4a3426', C: '#2563eb', c: '#60a5fa', D: '#1e3a8a', P: '#1f2937' },
  github: { H: '#15151f', h: '#2f2f45', C: '#7c3aed', c: '#a78bfa', D: '#4c1d95', P: '#18181b' },
  gmail: { H: '#7c2d12', h: '#b45309', C: '#e11d48', c: '#fb7185', D: '#881337', P: '#27272a' },
  calendar: { H: '#0b1220', h: '#1f2a44', C: '#0d9488', c: '#2dd4bf', D: '#134e4a', P: '#1f2937' },
  lms: { H: '#a16207', h: '#ca8a04', C: '#4d7c0f', c: '#a3e635', D: '#365314', P: '#292524' },
  guard: { H: '#0b1220', h: '#1f2a44', C: '#1e3a8a', c: '#3b82f6', D: '#172554', P: '#0f172a', cap: true },
};

function blit(g: CanvasRenderingContext2D, rows: string[], pal: Record<string, string>, x: number, y: number) {
  for (let j = 0; j < rows.length; j++) {
    const row = rows[j]!;
    for (let i = 0; i < row.length; i++) { const c = pal[row[i]!]; if (c) { g.fillStyle = c; g.fillRect(x + i, y + j, 1, 1); } }
  }
}
function person(g: CanvasRenderingContext2D, who: string, x: number, y: number, pose: 'stand' | 'walk1' | 'walk2' | 'type', t: number) {
  const L = LOOK[who] ?? LOOK['agent']!;
  const pal: Record<string, string> = { K: '#0b0d16', S: '#f1c39a', E: '#0b0d16', H: L.H, h: L.h, C: L.C, c: L.c, D: L.D, P: L.P, B: '#0b0d16', Q: '#0f172a', Y: '#facc15' };
  const bob = pose === 'walk2' ? -1 : 0;
  const ox = Math.round(x - 7);
  const oy = Math.round(y - 20 + bob);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(ox + 3, Math.round(y) - 1, 8, 2);
  blit(g, L.cap ? CAP : HEAD, pal, ox, oy);
  blit(g, pose === 'type' && Math.floor(t / 170) % 2 === 0 ? TORSO_TYPE : TORSO, pal, ox, oy + 9);
  blit(g, LEGS[pose === 'type' ? 'stand' : pose], pal, ox, oy + 16);
}

// ================================================================ neon pixel font (3×5)
const GLYPH: Record<string, string[]> = {
  G: ['111', '100', '101', '101', '111'], I: ['111', '010', '010', '010', '111'], T: ['111', '010', '010', '010', '010'],
  M: ['101', '111', '111', '101', '101'], A: ['010', '101', '111', '101', '101'], L: ['100', '100', '100', '100', '111'],
  C: ['111', '100', '100', '100', '111'], S: ['111', '100', '111', '001', '111'], H: ['101', '101', '111', '101', '101'], Q: ['111', '101', '101', '111', '011'],
};
function neon(g: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, on: number) {
  let cx = x;
  for (const ch of text) {
    const gl = GLYPH[ch];
    if (gl) gl.forEach((row, j) => { for (let i = 0; i < 3; i++) if (row[i] === '1') { g.fillStyle = !P.night ? mix(color, '#0f172a', 0.25) : on > 0.5 ? mix(color, '#ffffff', 0.35) : rgba(color, 0.35); g.fillRect(cx + i, y + j, 1, 1); } });
    cx += 4;
  }
}

// ================================================================ two themes: night shift (dark UI) / daytime (light UI)
type Pal = { shell: string; corr: [string, string]; runner: string; runnerEdge: string; panelLine: string; panelSpeck: string; panel: string; trim: string; base: string; floor: string; seam: string; grain: string; rug: string; rugEdge: [number, number]; signBox: string; closed: string; wall: string; wallHi: string; dark: number; signLit: number; night: boolean };
const NIGHT: Pal = { shell: '#0d1020', corr: ['#1a1d2e', '#181b2b'], runner: '#23283f', runnerEdge: '#2a3050', panelLine: '#1d2138', panelSpeck: '#262b47', panel: '#222743', trim: '#30365a', base: '#141727', floor: '#241e2c', seam: '#181420', grain: '#3a3044', rug: '#1b1d2c', rugEdge: [0.22, 0.38], signBox: '#10121f', closed: '#3b3f55', wall: '#0b0d18', wallHi: '#2a2f4a', dark: 0.72, signLit: 1, night: true };
const DAY: Pal = { shell: '#cfd6e2', corr: ['#d9dfe8', '#d3d9e3'], runner: '#c3cad8', runnerEdge: '#b3bccd', panelLine: '#e3dccf', panelSpeck: '#f4efe6', panel: '#efe9de', trim: '#ffffff', base: '#c9bfae', floor: '#d8c3a5', seam: '#bfa786', grain: '#e4d2b8', rug: '#f3f4f6', rugEdge: [0.28, 0.5], signBox: '#ffffff', closed: '#9aa3b5', wall: '#8a93a8', wallHi: '#b6bdcc', dark: 0.16, signLit: 0, night: false };
let P: Pal = NIGHT;

// ================================================================ static layer (rebuilt when the set of rooms changes)
function buildStatic(present: Set<McpServerId>): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  // Building shell.
  g.fillStyle = P.shell; g.fillRect(0, 0, W, H);
  // Window wall: night sky + skyline (drawn per frame for blinking lights); mullions here.
  g.fillStyle = P.wall; g.fillRect(0, 0, W, 22);
  // Corridor: dark floor + runner + edge lights.
  for (let x = 0; x < W; x++) for (let y = 104; y < 126; y++) { const n = noise(x, y); g.fillStyle = n > 0.5 ? P.corr[0] : P.corr[1]; g.fillRect(x, y, 1, 1); }
  g.fillStyle = P.runner; g.fillRect(0, 110, W, 10);
  g.fillStyle = P.runnerEdge; g.fillRect(0, 110, W, 1); g.fillRect(0, 119, W, 1);
  for (const [id, r] of Object.entries(ROOMS) as Array<[RoomId, Room]>) {
    // Back wall: panels, top trim, baseboard.
    for (let x = r.x; x < r.x + r.w; x++) for (let y = r.y; y < r.y + 18; y++) { g.fillStyle = (x - r.x) % 20 === 0 ? P.panelLine : noise(x, y, 1) > 0.92 ? P.panelSpeck : P.panel; g.fillRect(x, y, 1, 1); }
    g.fillStyle = P.trim; g.fillRect(r.x, r.y, r.w, 1);
    g.fillStyle = P.base; g.fillRect(r.x, r.y + 18, r.w, 2);
    // Floor: dark wood planks, slight per-room tint.
    for (let y = r.y + 20; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      const plank = Math.floor((y - r.y) / 5);
      const seam = (y - r.y) % 5 === 0 || (x + plank * 17) % 31 === 0;
      const base = mix(P.floor, r.neon, 0.06);
      g.fillStyle = seam ? P.seam : noise(x, plank, 2) > 0.85 ? mix(base, P.grain, 0.5) : base;
      g.fillRect(x, y, 1, 1);
    }
    // Rug in the room colour.
    const rx = r.x + 22, ry = r.y + r.h - 34, rw = r.w - 44, rh = 22;
    g.fillStyle = mix(P.rug, r.neon, P.rugEdge[0]); g.fillRect(rx, ry, rw, rh);
    g.fillStyle = mix(P.rug, r.neon, P.rugEdge[1]); g.fillRect(rx, ry, rw, 1); g.fillRect(rx, ry + rh - 1, rw, 1); g.fillRect(rx + 2, ry + 2, rw - 4, 1); g.fillRect(rx + 2, ry + rh - 3, rw - 4, 1);
    // Neon sign frame.
    g.fillStyle = P.signBox; g.fillRect(r.x + 6, r.y + 4, r.sign.length * 4 + 5, 9);
    // Unconnected source: the room stays dark (drawn in the light pass) and gets a closed sign.
    if (id !== 'agent' && id !== 'ai' && !present.has(id)) { g.fillStyle = P.closed; g.fillRect(r.door - 8, r.y + r.h - 3, 16, 2); }
  }
  // Walls between rooms (tops), front walls with door gaps.
  g.fillStyle = P.wall;
  for (const x of [0, 130, 262, 394]) { g.fillRect(x, 22, 6, 82); g.fillRect(x, 126, 6, 99); }
  for (const r of Object.values(ROOMS)) {
    const fy = r.y < CORRIDOR ? r.y + r.h : r.y - 2;
    g.fillStyle = P.wall; g.fillRect(r.x, fy, r.door - 12 - r.x, 4); g.fillRect(r.door + 12, fy, r.x + r.w - r.door - 12, 4);
    g.fillStyle = P.wallHi; g.fillRect(r.x, fy, r.door - 12 - r.x, 1); g.fillRect(r.door + 12, fy, r.x + r.w - r.door - 12, 1);
  }
  g.fillStyle = P.wall; g.fillRect(0, 221, W, 4);
  furniture(g);
  return c;
}

function furniture(g: CanvasRenderingContext2D) {
  const rect = (x: number, y: number, w: number, h: number, c: string) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  const plant = (x: number, y: number) => { rect(x, y + 8, 7, 6, '#3f2a1e'); rect(x, y + 8, 7, 1, '#5a3d2b'); rect(x + 2, y, 3, 8, '#166534'); rect(x - 1, y + 2, 3, 4, '#15803d'); rect(x + 5, y + 1, 3, 4, '#15803d'); rect(x + 3, y + 1, 1, 2, '#22c55e'); };
  const shelf = (x: number, y: number, w: number, h: number) => {
    rect(x, y, w, h, '#2b2032'); rect(x, y, w, 1, '#3d2f47');
    const books = ['#7c3aed', '#2563eb', '#e11d48', '#0d9488', '#ca8a04', '#64748b'];
    for (let row = 0; row < Math.floor(h / 8); row++) { rect(x + 1, y + row * 8 + 7, w - 2, 1, '#1a1220'); for (let i = 0; i < w - 3; i += 2 + (i % 3 === 0 ? 1 : 0)) rect(x + 2 + i, y + row * 8 + 2 + ((i * 7) % 3), 2, 5 - ((i * 7) % 3), books[(i + row * 3) % books.length]!); }
  };
  // GitHub: server rack, poster, plant.
  rect(108, 30, 14, 34, '#151827'); rect(108, 30, 14, 1, '#2a2f4a'); for (let i = 0; i < 6; i++) rect(110, 33 + i * 5, 10, 3, '#1f2337');
  rect(92, 26, 10, 12, '#1b1f33'); rect(93, 27, 8, 10, '#312e81'); rect(95, 29, 4, 1, '#a78bfa'); rect(95, 31, 3, 1, '#a78bfa');
  plant(12, 84);
  // Gmail: pigeonhole wall + cart.
  rect(232, 28, 26, 22, '#2b2032'); for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) { rect(233 + i * 6, 29 + j * 7, 5, 6, '#170f1c'); if ((i * 3 + j) % 3 !== 1) rect(233 + i * 6, 32 + j * 7, 5, 2, '#e5e7eb'); }
  rect(146, 84, 14, 8, '#3b3f55'); rect(146, 84, 14, 1, '#52577a'); rect(148, 82, 10, 3, '#e5e7eb');
  // Calendar: wall screen frame, clock.
  rect(366, 26, 26, 18, '#0b0d18'); rect(344, 27, 9, 9, '#1b1f33'); rect(345, 28, 7, 7, '#e2e8f0'); rect(348, 29, 1, 3, '#0f172a'); rect(348, 31, 3, 1, '#0f172a');
  plant(380, 84);
  // eCampus: tall shelves + reading lamp.
  shelf(12, 144, 26, 32); shelf(98, 144, 28, 32);
  rect(42, 164, 1, 10, '#64748b'); rect(39, 162, 7, 3, '#facc15');
  // HQ: wall status screen, printer, sofa.
  rect(200, 128, 46, 15, '#0b0d18');
  rect(240, 164, 16, 10, '#cbd5e1'); rect(240, 164, 16, 2, '#94a3b8'); rect(242, 168, 12, 1, '#1f2937'); rect(240, 174, 16, 2, '#64748b');
  rect(146, 200, 18, 9, '#1e3a8a'); rect(146, 196, 18, 5, '#2563eb'); rect(146, 196, 2, 13, '#1e3a8a'); rect(162, 196, 2, 13, '#1e3a8a');
  // AI core room: pedestal + holo screen frame.
  rect(346, 196, 20, 6, '#1b1f33'); rect(344, 202, 24, 3, '#10121f'); rect(346, 196, 20, 1, '#3d4470');
  rect(336, 128, 40, 15, '#0b0d18');
  plant(380, 140);
}

// ================================================================ per-frame layers
function sky(g: CanvasRenderingContext2D, t: number) {
  if (!P.night) {
    const grd = g.createLinearGradient(0, 0, 0, 22); grd.addColorStop(0, '#60a5fa'); grd.addColorStop(1, '#dbeafe'); g.fillStyle = grd; g.fillRect(0, 0, W, 22);
    g.fillStyle = '#fde68a'; g.fillRect(366, 3, 7, 7); g.fillStyle = '#fef3c7'; g.fillRect(367, 4, 3, 3);
    for (let k = 0; k < 4; k++) { const x = Math.round(((t / 120 + k * 117) % (W + 40)) - 30), y = 3 + k * 3; g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(x, y, 16, 3); g.fillRect(x + 4, y - 2, 8, 2); }
    for (let x = 0; x < W; x += 9) {
      const h = 6 + Math.floor(noise(x, 1) * 13), w = 7 + Math.floor(noise(x, 2) * 3);
      g.fillStyle = noise(x, 3) > 0.5 ? '#94a3b8' : '#a5b4c8'; g.fillRect(x, 22 - h, w, h);
      for (let wy = 22 - h + 2; wy < 21; wy += 3) for (let wx = x + 1; wx < x + w - 1; wx += 2) if (noise(wx, wy) > 0.55) { g.fillStyle = '#dbeafe'; g.fillRect(wx, wy, 1, 1); }
    }
    g.fillStyle = P.wall; for (let x = 0; x < W; x += 50) g.fillRect(x, 0, 3, 22); g.fillRect(0, 20, W, 2);
    return;
  }
  const grd = g.createLinearGradient(0, 0, 0, 22); grd.addColorStop(0, '#0a1030'); grd.addColorStop(1, '#1d2250'); g.fillStyle = grd; g.fillRect(0, 0, W, 22);
  g.fillStyle = '#f8fafc'; g.fillRect(368, 4, 5, 5); g.fillStyle = '#cbd5e1'; g.fillRect(371, 4, 2, 2);
  for (let i = 0; i < 40; i++) { const x = (i * 53) % W, y = (i * 7) % 9; if (noise(i, 0) > 0.5) { g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(x, y, 1, 1); } }
  for (let x = 0; x < W; x += 9) {
    const h = 6 + Math.floor(noise(x, 1) * 13), w = 7 + Math.floor(noise(x, 2) * 3);
    g.fillStyle = noise(x, 3) > 0.5 ? '#0b0e22' : '#0e1229'; g.fillRect(x, 22 - h, w, h);
    for (let wy = 22 - h + 2; wy < 21; wy += 3) for (let wx = x + 1; wx < x + w - 1; wx += 2) if (noise(wx, wy, Math.floor(t / 1800 + noise(wx, wy) * 5)) > 0.72) { g.fillStyle = noise(wx, wy, 9) > 0.7 ? '#93c5fd' : '#fcd34d'; g.fillRect(wx, wy, 1, 1); }
  }
  g.fillStyle = P.wall; for (let x = 0; x < W; x += 50) g.fillRect(x, 0, 3, 22); g.fillRect(0, 20, W, 2);
}

function monitor(g: CanvasRenderingContext2D, x: number, y: number, w: number, on: boolean, tint: string, t: number) {
  g.fillStyle = '#0b0d16'; g.fillRect(x, y, w, 10); g.fillStyle = on ? mix('#0b1120', tint, 0.35) : P.night ? '#141827' : '#475569'; g.fillRect(x + 1, y + 1, w - 2, 7);
  if (on) for (let i = 0; i < 3; i++) { g.fillStyle = mix(tint, '#ffffff', 0.4); g.fillRect(x + 2, y + 2 + i * 2, 2 + ((Math.floor(t / 140) + i * 4) % (w - 5)), 1); }
  g.fillStyle = '#0b0d16'; g.fillRect(x + Math.floor(w / 2) - 1, y + 10, 2, 2);
}

function deskFront(g: CanvasRenderingContext2D, d: { x: number; y: number; w: number }) {
  g.fillStyle = '#3a2a22'; g.fillRect(d.x, d.y - 4, d.w, 4);
  g.fillStyle = '#4e382c'; g.fillRect(d.x, d.y - 4, d.w, 1);
  g.fillStyle = '#2a1e18'; g.fillRect(d.x, d.y, d.w, 7);
  g.fillStyle = '#1c140f'; g.fillRect(d.x + 2, d.y + 7, 2, 3); g.fillRect(d.x + d.w - 4, d.y + 7, 2, 3);
  g.fillStyle = '#5c4434'; g.fillRect(d.x + 4, d.y + 2, d.w - 8, 1);
}

type Particle = { x0: number; y0: number; to: Spot | 'agent'; t: number; dur: number; color: string; size: number; fall?: boolean; delay: number };

// ================================================================ director: events → actions
type Bubble = { text: string; tone?: 'ok' | 'warn' | 'bad' | 'think' };
type Actor = 'agent' | McpServerId | 'guard' | 'ai';
type Say = Partial<Record<Actor, Bubble | null>>;
type Fx = { from: RoomId | 'core' | 'agent'; to: 'agent' | 'core' | 'printer'; n: number; masked?: number };
type Action = { ms: number; walkTo?: RoomId; carry?: number; active?: RoomId[]; say?: Say; print?: number; status?: string; fx?: Fx; scan?: boolean; count?: { calls?: number; masked?: number; sources?: number } };
const SHORT: Record<string, string> = {
  get_recent_commits: '커밋 조회', get_pull_requests: 'PR 조회', get_open_issues: '이슈 조회', get_repository_activity: '저장소 활동',
  search_emails: '메일 검색', get_email: '메일 본문', search_project_emails: '프로젝트 메일',
  get_events: '이번 주 일정', get_upcoming_events: '다가오는 일정', search_events: '일정 검색',
  get_courses: '수강 과목', get_upcoming_deadlines: '마감 조회', get_assignments: '과제 상태',
};
const toolOf = (n: string) => SHORT[n.split('__').pop() ?? n] ?? n.split('__').pop() ?? n;
const cut = (s: string, n = 34) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function actionsFor(e: AgentEvent): Action[] {
  switch (e.type) {
    case 'agent_run_started': return [{ ms: 1400, walkTo: 'agent', active: ['agent'], say: { agent: { text: `질문 받음 · ${cut(e.prompt, 24)}` } }, status: '질문을 받았습니다' }];
    case 'mcp_server_connected': return [{ ms: 450, active: [e.server], say: { [e.server]: { text: `온라인 · ${e.serverInfo.name}`, tone: 'ok' } } as Say, status: `${ROOMS[e.server].label} 연결` }];
    case 'tool_discovered': return [{ ms: 700, say: { agent: { text: `도구 ${e.tools.length}개 확인` } }, status: `도구 ${e.tools.length}개를 확인했습니다` }];
    case 'llm_request': {
      const masked = e.maskedEmails + e.maskedPii;
      return [
        { ms: 900, walkTo: 'ai', active: ['ai'], say: { agent: null }, status: e.phase === 'plan' ? 'AI에게 어떤 도구를 쓸지 묻는 중' : '모은 자료를 AI에게 넘기는 중' },
        { ms: 1300, scan: true, active: ['ai'], fx: { from: 'agent', to: 'core', n: e.phase === 'plan' ? 6 : 14, masked }, ...(e.phase === 'analysis' ? { count: { masked } } : {}), say: { guard: { text: masked ? `스캔 · 가림 ${masked}건` : '스캔 · 통과', tone: masked ? 'warn' : 'ok' } } },
        { ms: e.phase === 'plan' ? 800 : 1500, active: ['ai'], say: { ai: { text: e.phase === 'plan' ? '어떤 자료가 필요할까…' : '리포트 쓰는 중…', tone: 'think' } } },
      ];
    }
    case 'llm_response': return [{ ms: 1300, active: ['ai'], say: { ai: { text: e.toolCalls.length ? `필요: ${cut(e.toolCalls.map((c) => toolOf(c.name)).join(', '), 30)}` : '자료 충분해요', tone: 'ok' }, guard: null }, status: e.toolCalls.length ? `AI가 도구 ${e.toolCalls.length}개를 골랐습니다` : 'AI가 자료가 충분하다고 했습니다' }];
    case 'tool_call_started': {
      const verify = e.call.id.startsWith('verify_');
      return [{ ms: 900, walkTo: e.call.server, active: [e.call.server], say: { agent: null, ai: null, [e.call.server]: { text: `${verify ? '누락 검사 · ' : ''}${toolOf(e.call.name)}…` } } as Say, status: `${ROOMS[e.call.server].label}: ${toolOf(e.call.name)}` }];
    }
    case 'tool_call_completed': {
      const rows = Array.isArray(e.result.output.data) ? e.result.output.data.length : 1;
      return [{ ms: 900, carry: 1, active: [e.call.server], fx: { from: e.call.server, to: 'agent', n: Math.min(10, Math.max(3, rows)) }, count: { calls: 1 }, say: { [e.call.server]: { text: cut(summaryKo(e.result.output.summary), 26), tone: 'ok' } } as Say }];
    }
    case 'tool_call_failed': return [{ ms: 1200, active: [e.call.server], say: { [e.call.server]: { text: `실패 · ${cut(e.result.error.message, 22)}`, tone: 'bad' } } as Say, status: `${ROOMS[e.call.server].label} 호출 실패` }];
    case 'tool_call_denied': return [{ ms: 1300, scan: true, say: { guard: { text: `차단 · ${toolOf(e.call.name)}`, tone: 'bad' } }, status: `정책이 ${toolOf(e.call.name)} 호출을 막았습니다` }];
    case 'tool_call_adjusted': return [{ ms: 1000, say: { guard: { text: `범위 줄임 · ${cut(e.changes.join(', '), 20)}`, tone: 'warn' } } }];
    case 'policy_applied': return e.excluded.length || e.blockedTools.length ? [{ ms: 1100, scan: true, say: { guard: { text: `정책 적용 · 제외 ${e.excluded.length}건`, tone: 'warn' } } }] : [];
    case 'context_aggregated': return [{ ms: 1300, walkTo: 'agent', active: ['agent'], say: { agent: { text: `자료 ${e.totalItems}건 정리` } }, status: `자료 ${e.totalItems}건을 정리했습니다` }];
    case 'report_generated': return [{ ms: 1800, walkTo: 'agent', print: 8, active: ['agent', 'ai'], fx: { from: 'core', to: 'printer', n: 12 }, count: { sources: e.report.sources.length }, say: { ai: { text: '완성!', tone: 'ok' }, agent: { text: `리포트 출력 · 출처 ${e.report.sources.length}건`, tone: 'ok' }, guard: null }, status: '리포트가 나왔습니다' }];
    case 'coverage_checked': return [{ ms: 1300, walkTo: 'agent', active: ['agent'], say: { agent: { text: e.missed.length ? `누락 검사 · 빠진 것 ${e.missed.length}건` : '누락 검사 · 빠진 것 없음', tone: e.missed.length ? 'warn' : 'ok' } } }];
    case 'agent_run_completed': return [{ ms: 1500, walkTo: 'agent', active: ['agent'], say: { agent: e.status === 'success' ? { text: '끝! 리포트를 확인하세요', tone: 'ok' } : { text: `실패 · ${cut(e.error ?? '', 24)}`, tone: 'bad' } }, status: e.status === 'success' ? '실행 완료' : '실행 실패' }];
    default: return [];
  }
}

// ================================================================ component
type Mover = { x: number; y: number; path: Spot[] };
const ACTORS: Actor[] = ['agent', 'github', 'gmail', 'calendar', 'lms', 'guard', 'ai'];
const NAME: Record<Actor, string> = { agent: '에이전트', github: 'GitHub 담당', gmail: '메일 담당', calendar: '일정 담당', lms: 'eCampus 담당', guard: '보안 담당 · 정책', ai: 'AI 모델' };

/** What a person in the office is, for the info card: their MCP server and what they did this run. */
function infoOf(a: Actor, events: AgentEvent[]): { title: string; lines: string[] } {
  if (a === 'agent') return { title: '에이전트 · MCP 클라이언트', lines: [`도구 호출 ${events.filter((e) => e.type === 'tool_call_completed').length}회`, '질문을 받아 담당자에게 자료를 받아 오고, AI에게 넘기고, 리포트를 출력합니다.'] };
  if (a === 'ai') {
    const llm = [...events].reverse().find((e) => e.type === 'llm_response' || e.type === 'llm_request');
    return { title: 'AI 모델', lines: [llm && (llm.type === 'llm_request' || llm.type === 'llm_response') ? `${llm.provider}/${llm.model}` : '아직 요청 없음', `요청 ${events.filter((e) => e.type === 'llm_request').length}회 · 받은 자료는 보안 게이트를 거친 것뿐`] };
  }
  if (a === 'guard') {
    const masked = events.reduce((n, e) => n + (e.type === 'llm_request' ? e.maskedEmails + e.maskedPii : 0), 0);
    const analysis = [...events].reverse().find((e) => e.type === 'llm_request' && e.phase === 'analysis');
    const inReport = analysis && analysis.type === 'llm_request' ? analysis.maskedEmails + analysis.maskedPii : 0;
    const denied = events.filter((e) => e.type === 'tool_call_denied').length;
    const excluded = events.flatMap((e) => (e.type === 'policy_applied' ? e.excluded : [])).length;
    return { title: '보안 담당 · 데이터 정책', lines: [`리포트용 자료에서 가림 ${inReport}건 · 모든 요청 합계 ${masked}건 (같은 값이 여러 요청에 들어가면 요청마다 셉니다)`, `호출 차단 ${denied}건 · 제외 ${excluded}건`, '허용된 도구만 통과시키고, 메일 주소·개인정보를 가립니다.'] };
  }
  const hello = events.find((e) => e.type === 'mcp_server_connected' && e.server === a);
  const tools = events.flatMap((e) => (e.type === 'tool_discovered' ? e.tools.filter((t) => t.server === a) : []));
  const done = events.filter((e) => e.type === 'tool_call_completed' && e.call.server === a);
  const lastDone = done.at(-1);
  return {
    title: `${NAME[a]} · ${hello && hello.type === 'mcp_server_connected' ? `${hello.serverInfo.name} v${hello.serverInfo.version}` : 'MCP 서버'}`,
    lines: [`도구 ${tools.length}개${tools.length ? ` (${tools.map((t) => toolOf(t.name)).join(', ')})` : ''} · 이번 실행 호출 ${done.length}회`, lastDone && lastDone.type === 'tool_call_completed' ? `마지막 결과: ${summaryKo(lastDone.result.output.summary)}` : '이번 실행에서 아직 부르지 않았습니다.'],
  };
}

function roomAt(p: Spot): RoomId | null {
  for (const [id, r] of Object.entries(ROOMS) as Array<[RoomId, Room]>) if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return id;
  return null;
}
function route(from: Spot, to: RoomId): Spot[] {
  const target = VISIT[to];
  const a = roomAt(from);
  if (a === to) return [target];
  const pts: Spot[] = [];
  if (a) pts.push({ x: ROOMS[a].door, y: from.y }, { x: ROOMS[a].door, y: CORRIDOR });
  else pts.push({ x: from.x, y: CORRIDOR });
  pts.push({ x: ROOMS[to].door, y: CORRIDOR }, { x: ROOMS[to].door, y: target.y }, target);
  return pts;
}

/** The app's resolved theme (index.html / useTheme set data-theme on <html>). */
function useResolvedTheme(): 'light' | 'dark' {
  const read = () => (typeof document !== 'undefined' && document.documentElement.dataset['theme'] === 'light' ? 'light' : 'dark');
  const [t, setT] = useState<'light' | 'dark'>(read);
  useEffect(() => {
    const o = new MutationObserver(() => setT(read()));
    o.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => o.disconnect();
  }, []);
  return t;
}

export function AgentOffice({ events, live, servers, headingRef }: { events: AgentEvent[]; live: boolean; servers: McpServerId[]; headingRef?: React.Ref<HTMLHeadingElement> }) {
  const theme = useResolvedTheme();
  const canvas = useRef<HTMLCanvasElement>(null);
  const tags = useRef<Partial<Record<Actor, HTMLElement | null>>>({});
  const bubbles = useRef<Partial<Record<Actor, HTMLDivElement | null>>>({});
  const hud = useRef<HTMLDivElement>(null);
  const frameEl = useRef<HTMLDivElement>(null);
  // Overlay text is placed on whole CSS pixels (no translate(-50%)), so it stays sharp at any size.
  const scale = useRef(1);
  useEffect(() => {
    const el = frameEl.current;
    if (!el) return;
    const ro = new ResizeObserver(() => { scale.current = el.clientWidth / W; });
    ro.observe(el);
    scale.current = el.clientWidth / W;
    return () => ro.disconnect();
  }, []);
  const mode = useRef<HTMLSpanElement>(null);
  const hudSm = useRef<HTMLSpanElement>(null);
  const modeSm = useRef<HTMLSpanElement>(null);
  const reduced = useMemo(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const [status, setStatus] = useState('질문을 기다리는 중');
  const [log, setLog] = useState<string[]>([]);
  const [playing, setPlaying] = useState(true);
  const [picked, setPicked] = useState<Actor | null>(null);
  const present = useMemo(() => new Set(servers), [servers]);
  const presentKey = [...present].sort().join(',');
  const fresh = () => ({ queue: [] as Action[], fed: 0, current: null as Action | null, left: 0, agent: { ...VISIT.agent, path: [] } as Mover, say: {} as Say, active: new Set<RoomId>(), carry: 0, printed: 0, playing: true, scan: 0, particles: [] as Particle[], calls: 0, masked: 0, sources: 0, replaying: false, ended: false });
  const sim = useRef(fresh());
  const runKey = events.find((e) => e.type === 'agent_run_started')?.runId ?? '';

  const pushLog = (line: string) => setLog((l) => [...l.slice(-2), line]);

  function applyInstant(a: Action) {
    const s = sim.current;
    if (a.walkTo) s.agent = { ...VISIT[a.walkTo], path: [] };
    if (a.carry) s.carry += a.carry;
    if (a.print) { s.printed = a.print; s.carry = 0; }
    if (a.say) for (const [k, v] of Object.entries(a.say)) s.say[k as Actor] = v ?? null;
    if (a.count) { s.calls += a.count.calls ?? 0; s.masked += a.count.masked ?? 0; s.sources = a.count.sources ?? s.sources; }
    s.active = new Set(a.active ?? []);
  }

  // A new run (or none): reset; a finished run that is only being shown jumps to its end state.
  useEffect(() => {
    sim.current = fresh();
    const s = sim.current;
    s.say.agent = { text: '질문을 기다리는 중' };
    setLog([]);
    if (!live && events.length) {
      for (const e of events) for (const a of actionsFor(e)) applyInstant(a);
      s.fed = events.length;
      setStatus('지난 실행 · 다시 보기로 재생');
    }
  }, [runKey]);

  // Feed new events into the queue as they arrive.
  useEffect(() => {
    const s = sim.current;
    // The same run id replayed again (demo button): start the office over.
    if (events.length < s.fed) { sim.current = fresh(); sim.current.say.agent = { text: '질문을 기다리는 중' }; }
    const s2 = sim.current;
    for (const e of events.slice(s2.fed)) { s2.queue.push(...actionsFor(e)); if (e.type === 'agent_run_completed') s2.ended = true; }
    s2.fed = events.length;
  }, [events]);

  const replay = () => {
    const keep = sim.current.fed;
    sim.current = fresh();
    const s = sim.current;
    s.fed = keep; s.replaying = true;
    s.queue = events.flatMap(actionsFor);
    setLog([]);
    setPlaying(true);
  };

  useEffect(() => {
    const g = canvas.current?.getContext('2d');
    if (!g) return;
    g.imageSmoothingEnabled = false;
    P = theme === 'light' ? DAY : NIGHT;
    const base = buildStatic(present);
    const light = document.createElement('canvas'); light.width = W; light.height = H;
    const lg = light.getContext('2d')!;
    const roomLight = new Map<RoomId, number>();
    let raf = 0;
    let last = performance.now();
    let lastStatus = '';
    const spot = (to: Fx['to'] | Fx['from'], s: typeof sim.current): Spot => (to === 'agent' ? { x: s.agent.x, y: s.agent.y - 10 } : to === 'core' ? { x: CORE.x, y: CORE.y - 14 } : to === 'printer' ? PRINTER : { x: SEAT[to as McpServerId]?.x ?? VISIT[to as RoomId].x, y: (SEAT[to as McpServerId]?.y ?? VISIT[to as RoomId].y) - 12 });

    const frame = (now: number) => {
      const s = sim.current;
      const dt = Math.min(100, now - last);
      last = now;
      if (s.playing) {
        // Live: never fall far behind the run (catch up within ~2.5 s once it has ended). Replay: watchable pace.
        // Remaining time = queued action time + walking still to do (current path, ~one corridor trip per queued walk).
        let walk = 0; let at: Spot = s.agent;
        for (const p of s.agent.path) { walk += Math.hypot(p.x - at.x, p.y - at.y); at = p; }
        walk += s.queue.filter((a) => a.walkTo).length * 220;
        const backlog = s.queue.reduce((n, a) => n + a.ms, 0) + Math.max(0, s.left) + walk / 0.075;
        const speed = s.replaying ? (s.queue.length > 24 ? 3 : s.queue.length > 10 ? 2 : 1) : Math.min(16, Math.max(1, s.ended ? backlog / 1800 : backlog / 3500));
        if (!s.current && s.queue.length) {
          const a = s.queue.shift()!;
          s.current = a; s.left = a.ms;
          if (a.walkTo) s.agent.path = reduced ? [VISIT[a.walkTo]] : route(s.agent, a.walkTo);
          if (a.carry) s.carry += a.carry;
          if (a.print) { s.printed = 0; s.carry = 0; }
          if (a.say) for (const [k, v] of Object.entries(a.say)) s.say[k as Actor] = v ?? null;
          if (a.active) s.active = new Set(a.active);
          if (a.scan) s.scan = 1;
          if (a.count) { s.calls += a.count.calls ?? 0; s.masked += a.count.masked ?? 0; s.sources = a.count.sources ?? s.sources; }
          if (a.fx && !reduced) {
            const from = spot(a.fx.from, s);
            for (let i = 0; i < a.fx.n; i++) s.particles.push({ x0: from.x + (i % 3) - 1, y0: from.y + ((i * 5) % 3), to: a.fx.to === 'agent' ? 'agent' : spot(a.fx.to, s), t: 0, dur: 650, color: a.fx.from === 'agent' ? '#e0f2fe' : a.fx.from === 'core' ? ROOMS.ai.neon : ROOMS[a.fx.from].neon, size: 2, delay: i * 55 });
            // What the gate masks never reaches the core: red bits drop at the gate.
            for (let i = 0; i < Math.min(12, a.fx.masked ?? 0); i++) s.particles.push({ x0: GATE_X - 6 + ((i * 7) % 13), y0: 112, to: { x: GATE_X - 6 + ((i * 7) % 13), y: 124 }, t: 0, dur: 700, color: '#f43f5e', size: 2, fall: true, delay: 300 + i * 60 });
          }
          if (a.status && a.status !== lastStatus) { lastStatus = a.status; setStatus(a.status); pushLog(a.status); }
        }
        let remaining = (reduced ? 9999 : 0.075 * speed) * dt;
        while (remaining > 0 && s.agent.path.length) {
          const p = s.agent.path[0]!;
          const dx = p.x - s.agent.x, dy = p.y - s.agent.y, d = Math.hypot(dx, dy);
          if (d <= remaining) { s.agent.x = p.x; s.agent.y = p.y; s.agent.path.shift(); remaining -= d; } else { s.agent.x += (dx / d) * remaining; s.agent.y += (dy / d) * remaining; remaining = 0; }
        }
        if (s.current) {
          if (s.current.print && s.printed < s.current.print) s.printed += dt / 110;
          s.left -= dt * speed;
          if (s.left <= 0 && !s.agent.path.length) s.current = null;
        }
        if (s.scan > 0) s.scan = Math.max(0, s.scan - dt / 1400);
        for (const p of s.particles) { if (p.delay > 0) p.delay -= dt * speed; else p.t += dt * speed; }
        s.particles = s.particles.filter((p) => p.t < p.dur);
        if (s.replaying && !s.queue.length && !s.current) s.replaying = false;
      }
      // Room lights ease toward on (active), dim (idle) or off (not connected).
      for (const id of Object.keys(ROOMS) as RoomId[]) {
        const target = id !== 'agent' && id !== 'ai' && !present.has(id) ? 0 : s.active.has(id) ? 1 : P.night ? 0.38 : 0.8;
        const cur = roomLight.get(id) ?? target;
        roomLight.set(id, cur + (target - cur) * Math.min(1, dt / 220));
      }

      // ---- draw
      g.globalCompositeOperation = 'source-over';
      g.drawImage(base, 0, 0);
      sky(g, now);
      const flick = (id: RoomId) => (noise(Math.floor(now / 90), id.length) > 0.97 ? 0 : 1) * (roomLight.get(id) ?? 0);
      for (const [id, r] of Object.entries(ROOMS) as Array<[RoomId, Room]>) neon(g, r.sign, r.x + 9, r.y + 6, r.neon, flick(id) > 0.2 ? 1 : 0.3);
      // Wall screens: calendar week grid, HQ status, AI holo text.
      for (let i = 0; i < 7; i++) for (let j = 0; j < 3; j++) { g.fillStyle = i === 3 && j === 1 ? '#f43f5e' : s.active.has('calendar') ? '#5eead4' : '#1f4d4a'; g.fillRect(368 + i * 3, 29 + j * 4, 2, 2); }
      g.fillStyle = s.printed > 0 ? '#22c55e' : s.active.has('agent') ? '#3b82f6' : '#1e293b'; g.fillRect(202, 130, Math.round(42 * Math.min(1, (s.calls + (s.printed > 0 ? 4 : 0)) / 10)), 2);
      for (let i = 0; i < 3; i++) { g.fillStyle = s.active.has('agent') ? '#93c5fd' : '#334155'; g.fillRect(202, 134 + i * 3, 10 + ((i * 13 + Math.floor(now / 400)) % 30), 1); }
      for (let i = 0; i < 3; i++) { g.fillStyle = s.active.has('ai') ? mix(ROOMS.ai.neon, '#ffffff', 0.3) : '#3b2453'; g.fillRect(338, 131 + i * 3, 8 + ((i * 11 + Math.floor(now / 160)) % 28), 1); }
      // Server rack LEDs.
      for (let i = 0; i < 6; i++) { g.fillStyle = s.active.has('github') && noise(i, Math.floor(now / 120)) > 0.4 ? '#4ade80' : '#14532d'; g.fillRect(118, 34 + i * 5, 1, 1); g.fillStyle = noise(i, Math.floor(now / 700)) > 0.5 ? '#facc15' : '#3f3f1a'; g.fillRect(116, 34 + i * 5, 1, 1); }
      // Monitors on desks (behind people).
      monitor(g, 52, 56, 13, s.active.has('github'), ROOMS.github.neon, now); monitor(g, 72, 56, 13, s.active.has('github'), '#38bdf8', now);
      monitor(g, 194, 56, 14, s.active.has('gmail'), ROOMS.gmail.neon, now);
      monitor(g, 326, 56, 14, s.active.has('calendar'), ROOMS.calendar.neon, now);
      monitor(g, 62, 164, 14, s.active.has('lms'), ROOMS.lms.neon, now);
      monitor(g, 176, 164, 13, true, '#38bdf8', now); monitor(g, 194, 163, 13, s.active.has('agent'), ROOMS.agent.neon, now); monitor(g, 212, 164, 13, true, '#38bdf8', now);
      // Printer output.
      if (s.printed > 0) { const n = Math.min(8, Math.floor(s.printed)); g.fillStyle = '#f8fafc'; g.fillRect(243, 174, 10, n); g.fillStyle = '#94a3b8'; for (let i = 1; i < n; i += 2) g.fillRect(244, 174 + i, 7, 1); }
      // Security gate: posts, bar, scanning laser.
      g.fillStyle = '#1e2440'; g.fillRect(GATE_X - 12, 104, 3, 22); g.fillRect(GATE_X + 9, 104, 3, 22); g.fillStyle = '#334075'; g.fillRect(GATE_X - 12, 103, 24, 2);
      g.fillStyle = s.scan > 0 ? '#f43f5e' : '#22c55e'; g.fillRect(GATE_X - 11, 106, 1, 1); g.fillRect(GATE_X + 10, 106, 1, 1);
      if (s.scan > 0) { const ly = 106 + Math.floor(((now / 60) % 18)); g.fillStyle = 'rgba(244,63,94,0.85)'; g.fillRect(GATE_X - 9, ly, 18, 1); }

      // People and desks, painter-sorted by feet.
      const thinking = s.say.ai?.tone === 'think';
      const draws: Array<{ y: number; f: () => void }> = [];
      for (const d of DESKS) draws.push({ y: d.y + 6, f: () => deskFront(g, d) });
      for (const id of ['github', 'gmail', 'calendar', 'lms'] as const) if (present.has(id)) { const busy = s.active.has(id) && (s.say[id]?.text.endsWith('…') ?? false); draws.push({ y: SEAT[id].y, f: () => person(g, id, SEAT[id].x, SEAT[id].y, busy ? 'type' : 'stand', now) }); }
      draws.push({ y: GUARD.y, f: () => person(g, 'guard', GUARD.x, GUARD.y, 'stand', now) });
      const walking = s.agent.path.length > 0;
      draws.push({ y: s.agent.y, f: () => {
        person(g, 'agent', s.agent.x, s.agent.y, walking ? (Math.floor(now / 130) % 2 ? 'walk1' : 'walk2') : 'stand', now);
        if (s.carry > 0) { const cx = Math.round(s.agent.x) + 6, cy = Math.round(s.agent.y) - 12; g.fillStyle = '#e0f2fe'; g.fillRect(cx, cy, 4, 4); g.fillStyle = '#38bdf8'; g.fillRect(cx + 1, cy + 1, 2, 2); }
      } });
      // AI core: pedestal glow, orb, two orbiting rings.
      draws.push({ y: CORE.y + 14, f: () => {
        const pulse = thinking ? 0.5 + 0.5 * Math.sin(now / 140) : 0.5 + 0.2 * Math.sin(now / 700);
        const oy = CORE.y - 14 + Math.round(Math.sin(now / 500) * 1.5);
        g.fillStyle = mix('#4c1d95', '#f0abfc', pulse); g.fillRect(CORE.x - 4, oy - 4, 8, 8); g.fillRect(CORE.x - 5, oy - 3, 10, 6); g.fillRect(CORE.x - 3, oy - 5, 6, 10);
        g.fillStyle = '#fdf4ff'; g.fillRect(CORE.x - 2, oy - 3, 2, 2);
        const spin = now / (thinking ? 160 : 600);
        for (let k = 0; k < 2; k++) for (let i = 0; i < 10; i++) { const a = spin * (k ? -1 : 1) + (i / 10) * Math.PI * 2; const x = CORE.x + Math.cos(a) * (10 + k * 3), y = oy + Math.sin(a) * (3 + k * 2); g.fillStyle = Math.sin(a) > 0 ? (k ? '#f0abfc' : '#c4b5fd') : 'rgba(196,181,253,0.4)'; g.fillRect(Math.round(x), Math.round(y), 1, 1); }
      } });
      draws.sort((a, b) => a.y - b.y).forEach((d) => d.f());

      // Data in flight.
      for (const p of s.particles) {
        if (p.delay > 0) continue;
        const k = p.t / p.dur, e = p.fall ? k * k : 1 - (1 - k) * (1 - k);
        const to = p.to === 'agent' ? { x: s.agent.x + 7, y: s.agent.y - 11 } : p.to;
        const x = p.x0 + (to.x - p.x0) * e, y = p.y0 + (to.y - p.y0) * e - (p.fall ? 0 : Math.sin(k * Math.PI) * 10);
        g.fillStyle = p.fall ? rgba(p.color, 1 - k) : p.color; g.fillRect(Math.round(x), Math.round(y), p.size, p.size);
      }

      // ---- lighting: darkness with holes for room lights, monitors, neon, core.
      lg.globalCompositeOperation = 'source-over';
      lg.clearRect(0, 0, W, H);
      lg.fillStyle = P.night ? `rgba(3,5,16,${P.dark})` : `rgba(40,52,84,${P.dark})`; lg.fillRect(0, 0, W, H);
      lg.globalCompositeOperation = 'destination-out';
      const hole = (x: number, y: number, r: number, a: number) => { if (a <= 0.01) return; const gr = lg.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); lg.fillStyle = gr; lg.fillRect(x - r, y - r, r * 2, r * 2); };
      for (const [id, r] of Object.entries(ROOMS) as Array<[RoomId, Room]>) { const v = roomLight.get(id) ?? 0; hole(r.x + r.w / 2, r.y + r.h / 2, 70, 0.95 * v); hole(r.x + 14, r.y + 8, 18, 0.9 * flick(id)); }
      hole(W / 2, 11, 260, 0.75); // window wall
      hole(s.agent.x, s.agent.y - 8, 22, 0.45); // the agent always readable
      hole(GATE_X, 114, 26, 0.6); hole(GUARD.x, GUARD.y - 8, 16, 0.4);
      hole(CORE.x, CORE.y - 14, 34, thinking ? 0.95 : 0.7);
      for (const x of [40, 120, 200, 280, 360]) hole(x, 115, 14, 0.35); // corridor floor lights
      g.drawImage(light, 0, 0);
      // Coloured glow on top (additive).
      g.globalCompositeOperation = 'lighter';
      const glow = (x: number, y: number, r: number, c: string, a0: number) => { const a = a0 * (P.night ? 1 : 0.35); if (a <= 0.01) return; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, rgba(c, a)); gr.addColorStop(1, rgba(c, 0)); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); };
      for (const [id, r] of Object.entries(ROOMS) as Array<[RoomId, Room]>) { glow(r.x + 9 + r.sign.length * 2, r.y + 8, 16, r.neon, 0.35 * flick(id)); if (s.active.has(id)) glow(r.x + r.w / 2, r.y + r.h - 20, 50, r.neon, 0.12); }
      glow(CORE.x, CORE.y - 14, thinking ? 30 : 20, ROOMS.ai.neon, thinking ? 0.45 : 0.25);
      if (s.scan > 0) glow(GATE_X, 114, 22, '#f43f5e', 0.35 * s.scan);
      for (const p of s.particles) if (p.delay <= 0 && !p.fall) { const k = p.t / p.dur, e = 1 - (1 - k) * (1 - k); const to = p.to === 'agent' ? { x: s.agent.x + 7, y: s.agent.y - 11 } : p.to; glow(p.x0 + (to.x - p.x0) * e + 1, p.y0 + (to.y - p.y0) * e - Math.sin(k * Math.PI) * 10 + 1, 5, p.color, 0.5); }
      g.globalCompositeOperation = 'source-over';

      // ---- HTML overlay
      const pos: Record<Actor, Spot> = { agent: { x: s.agent.x, y: s.agent.y }, github: { x: SEAT.github.x, y: SEAT.github.y + 10 }, gmail: { x: SEAT.gmail.x, y: SEAT.gmail.y + 10 }, calendar: { x: SEAT.calendar.x, y: SEAT.calendar.y + 10 }, lms: { x: SEAT.lms.x, y: SEAT.lms.y + 10 }, guard: GUARD, ai: { x: CORE.x, y: CORE.y + 8 } };
      const k = scale.current, fw = W * k;
      for (const a of ACTORS) {
        const p = pos[a];
        const tag = tags.current[a];
        if (tag && tag.offsetParent) {
          const w = tag.offsetWidth;
          tag.style.left = `${Math.round(Math.min(Math.max(p.x * k - w / 2, 2), fw - w - 2))}px`;
          tag.style.top = `${Math.round((p.y + 1) * k)}px`;
        }
        const b = bubbles.current[a];
        if (b) {
          const msg = s.say[a];
          const off = a !== 'agent' && a !== 'guard' && a !== 'ai' && !present.has(a);
          b.style.display = msg && !off ? '' : 'none';
          if (msg && !off) {
            if (b.dataset['text'] !== msg.text) { b.dataset['text'] = msg.text; b.textContent = msg.text; }
            b.dataset['tone'] = msg.tone ?? '';
            // Above the head: seated people's head is 20px above their seat, the core floats higher.
            const head = a === 'ai' ? CORE.y - 30 : a === 'agent' || a === 'guard' ? p.y - 23 : SEAT[a].y - 22;
            const bw = b.offsetWidth, bh = b.offsetHeight;
            const left = Math.round(Math.min(Math.max(p.x * k - bw / 2, 4), fw - bw - 4));
            b.style.left = `${left}px`;
            b.style.top = `${Math.round(head * k - bh)}px`;
            // Keep the tail pointing at the speaker even when the bubble is pushed in from an edge.
            b.style.setProperty('--tail', `${Math.round(Math.min(Math.max(p.x * k - left, 8), bw - 8))}px`);
          }
        }
      }
      const hudText = `도구 ${s.calls} · 가림 ${s.masked} · 출처 ${s.sources}`;
      const modeText = live ? 'LIVE' : s.replaying ? 'REPLAY' : s.fed ? 'DONE' : 'IDLE';
      for (const el of [hud.current, hudSm.current]) if (el && el.textContent !== hudText) el.textContent = hudText;
      for (const el of [mode.current, modeSm.current]) if (el && el.textContent !== modeText) el.textContent = modeText;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [presentKey, reduced, live, theme]);

  const toggle = () => { const s = sim.current; s.playing = !s.playing; setPlaying(s.playing); };

  return (
    <section aria-labelledby="office-heading" className="surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="office-heading" ref={headingRef} tabIndex={-1} className="text-[15px] font-semibold outline-none">에이전트 사무실</h2>
          <p className="text-[13px] text-text-3">MCP 서버마다 담당자 한 명. 실행 이벤트 그대로 움직입니다. 이름표를 누르면 담당 정보가 보입니다.</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={toggle} aria-label={playing ? '일시정지' : '재생'} className="hairline inline-flex min-h-9 items-center gap-1 rounded-md px-2.5 text-xs text-text-2 hover:text-text">{playing ? <Pause className="h-3.5 w-3.5" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}{playing ? '일시정지' : '재생'}</button>
          <button type="button" onClick={replay} disabled={live || !events.length} className="hairline inline-flex min-h-9 items-center gap-1 rounded-md px-2.5 text-xs text-text-2 hover:text-text disabled:opacity-40"><RotateCcw className="h-3.5 w-3.5" aria-hidden />다시 보기</button>
        </div>
      </div>
      <div ref={frameEl} className="office-frame relative mt-3 overflow-hidden rounded-xl" data-theme={theme} style={{ aspectRatio: `${W} / ${H}` }}>
        <canvas ref={canvas} width={W} height={H} role="img" aria-label={`에이전트 사무실 그림. 지금: ${status}`} className="block h-full w-full" style={{ imageRendering: 'pixelated' }} />
        <div aria-hidden className="office-scan pointer-events-none absolute inset-0" />
        {(Object.keys(ROOMS) as RoomId[]).map((id) => (
          <span key={id} aria-hidden className="office-room pointer-events-none absolute" style={{ left: `${((ROOMS[id].x + ROOMS[id].sign.length * 4 + 17) / W) * 100}%`, top: `${((ROOMS[id].y + 4) / H) * 100}%` }}>
            {ROOMS[id].label}{id !== 'agent' && id !== 'ai' && !present.has(id) ? ' · 연결 안 됨' : ''}
          </span>
        ))}
        <div aria-hidden className="office-hud pointer-events-none absolute right-2 top-1.5 flex items-center gap-2">
          <span className="office-live"><span ref={mode}>IDLE</span></span>
          <span ref={hud} />
        </div>
        {ACTORS.map((a) => (
          <div key={a}>
            <button type="button" aria-label={`${NAME[a]} 정보`} aria-pressed={picked === a} onClick={() => setPicked(picked === a ? null : a)} ref={(el) => { tags.current[a] = el; }} className={`office-tag absolute cursor-pointer whitespace-nowrap ${a !== 'agent' && a !== 'guard' && a !== 'ai' && !present.has(a) ? 'hidden' : ''}`} data-who={a} data-picked={picked === a || undefined}>{NAME[a]}</button>
            <div aria-hidden ref={(el) => { bubbles.current[a] = el; }} style={{ display: 'none' }} className="office-bubble pointer-events-none absolute whitespace-nowrap" />
          </div>
        ))}
        {log.length > 0 && (
          <ol aria-hidden className="office-log pointer-events-none absolute bottom-1.5 left-2">
            {log.map((l, i) => <li key={`${i}-${l}`} style={{ opacity: 0.45 + (i / Math.max(1, log.length - 1)) * 0.55 }}>› {l}</li>)}
          </ol>
        )}
      </div>
      <div aria-hidden className="office-hud-sm mt-2 items-center gap-2"><span className="office-live"><span ref={modeSm}>IDLE</span></span><span ref={hudSm} /></div>
      {picked && (() => { const i = infoOf(picked, events); return (
        <div role="region" aria-label={`${NAME[picked]} 정보`} className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-[13px]">
          <div className="font-semibold text-text">{i.title}</div>
          {i.lines.map((l) => <div key={l} className="text-text-2">{l}</div>)}
        </div>
      ); })()}
      <p aria-live="polite" className="mt-2 text-[13px] text-text-2"><span className="text-text-3">지금 · </span>{status}</p>
    </section>
  );
}
