"use client";

import { useEffect, useRef, useCallback, useState } from "react";

// ─── Constants ───────────────────────────────────────────────────────────────
const W = 800;
const H = 500;
const TILE = 20;
const GRAVITY = 0.55;
const MAX_FALL = 8;
const PLAYER_SPEED = 3.2;
const JUMP_FORCE = -9.5;
const JUMP_CUT = -3;
const WALL_SLIDE_SPEED = 1.2;
const WALL_JUMP_H = 5;
const WALL_JUMP_V = -9;
const DASH_SPEED = 10;
const DASH_DURATION = 8;
const DASH_COOLDOWN = 4;
const COYOTE_FRAMES = 6;
const JUMP_BUFFER_FRAMES = 6;
const CRUMBLE_DELAY = 18;
const CRUMBLE_RESPAWN = 180;
const SPRING_FORCE = -13;
const PW = 12;
const PH = 16;
const HAIR_COUNT = 5;
const HALF_GRAV_THRESHOLD = -2; // apply half gravity when vy is above this (near jump peak)
const CORNER_CORRECTION = 4; // pixels to nudge for corner correction
const WALL_JUMP_FORGIVENESS = 4; // pixels of wall-jump detection range (wider = more forgiving)

// ─── Types ───────────────────────────────────────────────────────────────────
interface Rect { x: number; y: number; w: number; h: number }
interface Spike { x: number; y: number; dir: "up" | "down" | "left" | "right" }
interface Strawberry { x: number; y: number; collected: boolean }
interface Spring { x: number; y: number; activated: number }
interface CrumblePlatform {
  x: number; y: number; w: number;
  timer: number; respawnTimer: number; visible: boolean;
}
interface Room {
  platforms: Rect[]; spikes: Spike[]; strawberries: Strawberry[];
  springs: Spring[]; crumbles: CrumblePlatform[];
  spawn: { x: number; y: number }; exitX: number;
}
interface HairNode { x: number; y: number }
interface Player {
  x: number; y: number; vx: number; vy: number;
  grounded: boolean; wallDir: number; facing: number;
  canDash: boolean; dashing: number; dashDir: { x: number; y: number }; dashCooldown: number;
  coyoteTimer: number; jumpBuffer: number; jumpHeld: boolean;
  dead: boolean; deadTimer: number;
  hair: HairNode[]; hairColor: string;
  dashCount: number; // for double dash
}
interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; color: string; size: number;
}
interface Snowflake {
  x: number; y: number; speed: number; drift: number; size: number;
}

// ─── Shop Types ──────────────────────────────────────────────────────────────
type BoosterType = "checkpoint" | "slowmo" | "shield" | "doubleDash" | "springBoost";

interface BoosterDef {
  id: BoosterType; name: string; cost: number; desc: string; icon: string;
}

interface CosmeticDef {
  id: string; type: "hair" | "trail" | "deathEffect"; name: string; cost: number; color: string;
}

const BOOSTERS: BoosterDef[] = [
  { id: "checkpoint", name: "Checkpoint", cost: 5, desc: "Place a mid-room respawn", icon: "🚩" },
  { id: "slowmo", name: "Slow-Mo", cost: 3, desc: "50% speed for 5 sec", icon: "🕐" },
  { id: "shield", name: "Air Shield", cost: 8, desc: "Survive one spike hit", icon: "🛡️" },
  { id: "doubleDash", name: "Double Dash", cost: 10, desc: "Two air dashes", icon: "💨" },
  { id: "springBoost", name: "Spring+", cost: 3, desc: "Springs launch higher", icon: "🚀" },
];

const COSMETICS: CosmeticDef[] = [
  // Hair colors
  { id: "hair_blue", type: "hair", name: "Blue Hair", cost: 10, color: "#3498db" },
  { id: "hair_purple", type: "hair", name: "Purple Hair", cost: 10, color: "#9b59b6" },
  { id: "hair_gold", type: "hair", name: "Gold Hair", cost: 10, color: "#f1c40f" },
  { id: "hair_green", type: "hair", name: "Green Hair", cost: 10, color: "#2ecc71" },
  { id: "hair_white", type: "hair", name: "White Hair", cost: 10, color: "#ecf0f1" },
  // Trails
  { id: "trail_fire", type: "trail", name: "Fire Trail", cost: 20, color: "#e67e22" },
  { id: "trail_ice", type: "trail", name: "Ice Trail", cost: 20, color: "#74b9ff" },
  { id: "trail_rainbow", type: "trail", name: "Rainbow Trail", cost: 20, color: "#fd79a8" },
  { id: "trail_stars", type: "trail", name: "Star Trail", cost: 20, color: "#ffeaa7" },
  // Death effects
  { id: "death_explode", type: "deathEffect", name: "Explosion", cost: 15, color: "#e74c3c" },
  { id: "death_dissolve", type: "deathEffect", name: "Dissolve", cost: 15, color: "#a29bfe" },
  { id: "death_shatter", type: "deathEffect", name: "Shatter", cost: 15, color: "#00cec9" },
  // Starter pack exclusive
  { id: "hair_aurora", type: "hair", name: "Aurora Hair ⭐", cost: 999, color: "#ff6b9d" },
  { id: "trail_aurora", type: "trail", name: "Aurora Trail ⭐", cost: 999, color: "#c44dff" },
];

const DEFAULT_HAIR = "#E84855";

// ─── GameState ───────────────────────────────────────────────────────────────
interface GameState {
  player: Player;
  rooms: Room[];
  currentRoom: number;
  deaths: number;
  strawberriesCollected: number;
  totalStrawberries: number;
  particles: Particle[];
  snow: Snowflake[];
  status: "menu" | "playing" | "win" | "shop" | "offer";
  screenShake: number;
  time: number;
  // Economy
  coins: number;
  ownedCosmetics: Set<string>;
  equippedHair: string; // cosmetic id or "" for default
  equippedTrail: string;
  equippedDeathEffect: string;
  // Active boosters
  activeBooster: BoosterType | null;
  shieldActive: boolean;
  doubleDashActive: boolean;
  checkpoint: { x: number; y: number } | null;
  slowMoFrames: number;
  springBoostActive: boolean;
  starterPackBought: boolean;
  roomDeaths: number;
  offerBooster: BoosterType | null;
  transitionTimer: number; // >0 = room transition animation playing
  transitionDir: number; // 1 = fading out, -1 = fading in
}

// ─── Persistence ─────────────────────────────────────────────────────────────
interface SaveData {
  coins: number;
  owned: string[];
  eqHair: string;
  eqTrail: string;
  eqDeath: string;
  starterPack: boolean;
}

function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem("summit_save");
    if (raw) { const d = JSON.parse(raw); return { ...d, starterPack: d.starterPack || false }; }
  } catch { /* ignore */ }
  return { coins: 0, owned: [], eqHair: "", eqTrail: "", eqDeath: "", starterPack: false };
}

function writeSave(gs: GameState) {
  try {
    const data: SaveData = {
      coins: gs.coins,
      owned: Array.from(gs.ownedCosmetics),
      eqHair: gs.equippedHair,
      eqTrail: gs.equippedTrail,
      eqDeath: gs.equippedDeathEffect,
      starterPack: gs.starterPackBought,
    };
    localStorage.setItem("summit_save", JSON.stringify(data));
  } catch { /* ignore */ }
}

// ─── Room Definitions ────────────────────────────────────────────────────────
function createRooms(): Room[] {
  const T = TILE;
  return [
    { platforms: [{ x: 0, y: H - T, w: W, h: T },{ x: 0, y: 0, w: T, h: H },{ x: W - T, y: 0, w: T, h: H },{ x: 0, y: 0, w: W, h: T },{ x: 200, y: 380, w: 100, h: T },{ x: 400, y: 320, w: 100, h: T },{ x: 580, y: 260, w: 120, h: T }], spikes: [], strawberries: [{ x: 250, y: 355, collected: false },{ x: 640, y: 235, collected: false }], springs: [], crumbles: [], spawn: { x: 50, y: H - T - PH - 2 }, exitX: W - T - PW - 2 },
    { platforms: [{ x: 0, y: H - T, w: 200, h: T },{ x: 0, y: 0, w: T, h: H },{ x: W - T, y: 0, w: T, h: H },{ x: 0, y: 0, w: W, h: T },{ x: 300, y: H - T, w: 200, h: T },{ x: 600, y: H - T, w: 200, h: T },{ x: 150, y: 360, w: 80, h: T },{ x: 420, y: 300, w: 80, h: T },{ x: 650, y: 360, w: 80, h: T }], spikes: [{ x: 210, y: H - T, dir: "up" },{ x: 230, y: H - T, dir: "up" },{ x: 250, y: H - T, dir: "up" },{ x: 270, y: H - T, dir: "up" },{ x: 290, y: H - T, dir: "up" },{ x: 510, y: H - T, dir: "up" },{ x: 530, y: H - T, dir: "up" },{ x: 550, y: H - T, dir: "up" },{ x: 570, y: H - T, dir: "up" },{ x: 590, y: H - T, dir: "up" }], strawberries: [{ x: 450, y: 270, collected: false }], springs: [], crumbles: [], spawn: { x: 40, y: H - T - PH - 2 }, exitX: W - T - PW - 2 },
    { platforms: [{ x: 0, y: H - T, w: W, h: T },{ x: 0, y: 0, w: T, h: H },{ x: W - T, y: 0, w: T, h: H },{ x: 0, y: 0, w: W, h: T },{ x: 180, y: 160, w: T, h: 340 },{ x: 300, y: 100, w: T, h: 340 },{ x: 300, y: 100, w: 200, h: T },{ x: 550, y: 150, w: 100, h: T },{ x: 650, y: H - 120, w: 130, h: T }], spikes: [{ x: 200, y: H - T, dir: "up" },{ x: 220, y: H - T, dir: "up" },{ x: 240, y: H - T, dir: "up" },{ x: 260, y: H - T, dir: "up" },{ x: 280, y: H - T, dir: "up" }], strawberries: [{ x: 240, y: 180, collected: false },{ x: 700, y: H - 145, collected: false }], springs: [], crumbles: [], spawn: { x: 50, y: H - T - PH - 2 }, exitX: W - T - PW - 2 },
    { platforms: [{ x: 0, y: H - T, w: 160, h: T },{ x: 0, y: 0, w: T, h: H },{ x: W - T, y: 0, w: T, h: H },{ x: 0, y: 0, w: W, h: T },{ x: 260, y: 360, w: 120, h: T },{ x: 480, y: 270, w: 120, h: T },{ x: 650, y: H - T, w: 150, h: T }], spikes: Array.from({ length: 24 }, (_, i) => ({ x: 170 + i * 20, y: H - T, dir: "up" as const })), strawberries: [{ x: 590, y: 220, collected: false }], springs: [], crumbles: [], spawn: { x: 50, y: H - T - PH - 2 }, exitX: W - T - PW - 2 },
    { platforms: [{ x: 0, y: H - T, w: 120, h: T },{ x: 0, y: 0, w: T, h: H },{ x: W - T, y: 0, w: T, h: H },{ x: 0, y: 0, w: W, h: T },{ x: 250, y: H - T, w: 80, h: T },{ x: 500, y: 350, w: 80, h: T },{ x: 300, y: 180, w: 100, h: T },{ x: 600, y: H - T, w: 200, h: T }], spikes: [...Array.from({ length: 6 }, (_, i) => ({ x: 130 + i * 20, y: H - T, dir: "up" as const })),...Array.from({ length: 13 }, (_, i) => ({ x: 340 + i * 20, y: H - T, dir: "up" as const }))], strawberries: [{ x: 340, y: 150, collected: false }], springs: [{ x: 275, y: H - T - 12, activated: 0 },{ x: 525, y: 350 - 12, activated: 0 }], crumbles: [], spawn: { x: 40, y: H - T - PH - 2 }, exitX: W - T - PW - 2 },
    { platforms: [{ x: 0, y: H - T, w: 100, h: T },{ x: 0, y: 0, w: T, h: H },{ x: W - T, y: 0, w: T, h: H },{ x: 0, y: 0, w: W, h: T },{ x: 680, y: H - T, w: 120, h: T }], spikes: Array.from({ length: 29 }, (_, i) => ({ x: 110 + i * 20, y: H - T, dir: "up" as const })), strawberries: [{ x: 400, y: 300, collected: false }], springs: [], crumbles: [{ x: 150, y: 400, w: 60, timer: 0, respawnTimer: 0, visible: true },{ x: 280, y: 350, w: 60, timer: 0, respawnTimer: 0, visible: true },{ x: 410, y: 330, w: 60, timer: 0, respawnTimer: 0, visible: true },{ x: 530, y: 360, w: 60, timer: 0, respawnTimer: 0, visible: true },{ x: 630, y: 300, w: 60, timer: 0, respawnTimer: 0, visible: true }], spawn: { x: 40, y: H - T - PH - 2 }, exitX: W - T - PW - 2 },
    { platforms: [{ x: 0, y: H - T, w: 100, h: T },{ x: 0, y: 0, w: T, h: H },{ x: W - T, y: 0, w: T, h: H },{ x: 0, y: 0, w: W, h: T },{ x: 200, y: 300, w: T, h: 200 },{ x: 320, y: 200, w: T, h: 200 },{ x: 400, y: 120, w: 200, h: T },{ x: 650, y: 200, w: T, h: 80 },{ x: 650, y: H - T, w: 150, h: T },{ x: 650, y: 350, w: 130, h: T }], spikes: [...Array.from({ length: 5 }, (_, i) => ({ x: 110 + i * 20, y: H - T, dir: "up" as const })),...Array.from({ length: 16 }, (_, i) => ({ x: 330 + i * 20, y: H - T, dir: "up" as const })),{ x: 220, y: T, dir: "down" },{ x: 240, y: T, dir: "down" },{ x: 260, y: T, dir: "down" },{ x: 280, y: T, dir: "down" },{ x: 300, y: T, dir: "down" }], strawberries: [{ x: 260, y: 220, collected: false },{ x: 500, y: 90, collected: false }], springs: [{ x: 700, y: 350 - 12, activated: 0 }], crumbles: [], spawn: { x: 40, y: H - T - PH - 2 }, exitX: W - T - PW - 2 },
    { platforms: [{ x: 0, y: H - T, w: 80, h: T },{ x: 0, y: 0, w: T, h: H },{ x: W - T, y: 0, w: T, h: H },{ x: 0, y: 0, w: W, h: T },{ x: 160, y: 420, w: 40, h: T },{ x: 280, y: 360, w: 40, h: T },{ x: 380, y: 180, w: T, h: 200 },{ x: 480, y: 120, w: T, h: 260 },{ x: 550, y: 100, w: 230, h: T },{ x: 550, y: 100, w: T, h: 400 },{ x: 650, y: 300, w: 130, h: T }], spikes: [...Array.from({ length: 4 }, (_, i) => ({ x: 90 + i * 20, y: H - T, dir: "up" as const })),...Array.from({ length: 4 }, (_, i) => ({ x: 210 + i * 20, y: H - T, dir: "up" as const })),...Array.from({ length: 3 }, (_, i) => ({ x: 330 + i * 20, y: H - T, dir: "up" as const })),...Array.from({ length: 3 }, (_, i) => ({ x: 500 + i * 20, y: H - T, dir: "up" as const })),{ x: 380, y: 350, dir: "right" },{ x: 380, y: 330, dir: "right" },{ x: 480, y: 200, dir: "left" },{ x: 480, y: 220, dir: "left" }], strawberries: [{ x: 430, y: 200, collected: false },{ x: 700, y: 270, collected: false }], springs: [{ x: 290, y: 360 - 12, activated: 0 }], crumbles: [{ x: 160, y: 420, w: 40, timer: 0, respawnTimer: 0, visible: true }], spawn: { x: 30, y: H - T - PH - 2 }, exitX: W - T - PW - 2 },
  ];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function rectsOverlap(a: Rect, b: Rect) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function spikeHitbox(s: Spike): Rect {
  const sz = 8;
  switch (s.dir) {
    case "up": return { x: s.x + 4, y: s.y - sz, w: 12, h: sz };
    case "down": return { x: s.x + 4, y: s.y, w: 12, h: sz };
    case "left": return { x: s.x - sz, y: s.y + 4, w: sz, h: 12 };
    case "right": return { x: s.x + TILE, y: s.y + 4, w: sz, h: 12 };
  }
}

function createSnow(): Snowflake[] {
  const flakes: Snowflake[] = [];
  for (let i = 0; i < 80; i++) {
    flakes.push({ x: Math.random() * W, y: Math.random() * H, speed: 0.3 + Math.random() * 0.8, drift: Math.random() * 0.5 - 0.25, size: 1 + Math.random() * 2 });
  }
  return flakes;
}

function getHairColor(gs: GameState): string {
  if (gs.equippedHair) {
    const c = COSMETICS.find(c => c.id === gs.equippedHair);
    if (c) return c.color;
  }
  return DEFAULT_HAIR;
}

function getTrailColor(gs: GameState): string {
  if (gs.equippedTrail) {
    const c = COSMETICS.find(c => c.id === gs.equippedTrail);
    if (c) return c.color;
  }
  return "#7ec8e3";
}

function getDeathColors(gs: GameState): string[] {
  if (gs.equippedDeathEffect) {
    const c = COSMETICS.find(c => c.id === gs.equippedDeathEffect);
    if (c) return [c.color, "#fff"];
  }
  return ["#E84855", "#fff"];
}

function createPlayer(spawn: { x: number; y: number }, hairColor: string = DEFAULT_HAIR): Player {
  const hair: HairNode[] = [];
  for (let i = 0; i < HAIR_COUNT; i++) hair.push({ x: spawn.x + PW / 2, y: spawn.y });
  return {
    x: spawn.x, y: spawn.y, vx: 0, vy: 0,
    grounded: false, wallDir: 0, facing: 1,
    canDash: true, dashing: 0, dashDir: { x: 0, y: 0 }, dashCooldown: 0,
    coyoteTimer: 0, jumpBuffer: 0, jumpHeld: false,
    dead: false, deadTimer: 0,
    hair, hairColor, dashCount: 0,
  };
}

// ─── Audio Settings ──────────────────────────────────────────────────────────
let sfxMuted = false;
let musicMuted = false;

function loadAudioSettings() {
  try {
    sfxMuted = localStorage.getItem("summit_sfx_muted") === "true";
    musicMuted = localStorage.getItem("summit_music_muted") === "true";
  } catch { /* ignore */ }
}
function saveAudioSettings() {
  try {
    localStorage.setItem("summit_sfx_muted", String(sfxMuted));
    localStorage.setItem("summit_music_muted", String(musicMuted));
  } catch { /* ignore */ }
}
loadAudioSettings();

// ─── Sound Effects (pre-rendered buffers) ────────────────────────────────────
let audioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext { if (!audioCtx) audioCtx = new AudioContext(); return audioCtx; }

const sfxBuffers: Record<string, AudioBuffer> = {};

function genSfxSamples(type: string, sr: number): Float32Array {
  const sq = (t: number, f: number) => Math.sin(2 * Math.PI * f * t) > 0 ? 1 : -1;
  const sn = (t: number, f: number) => Math.sin(2 * Math.PI * f * t);
  const tri = (t: number, f: number) => { const p = (t * f) % 1; return 4 * Math.abs(p - 0.5) - 1; };
  const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
  const noise = () => Math.random() * 2 - 1;

  switch (type) {
    case "jump": { const d = 0.1, s = new Float32Array(Math.floor(sr * d)); for (let i = 0; i < s.length; i++) { const t = i / sr; s[i] = sq(t, lerp(280, 560, t / d)) * (1 - t / d) * 0.3; } return s; }
    case "walljump": { const d = 0.12, s = new Float32Array(Math.floor(sr * d)); for (let i = 0; i < s.length; i++) { const t = i / sr, p = t / d; const f = p < 0.5 ? lerp(200, 600, p * 2) : lerp(600, 400, (p - 0.5) * 2); s[i] = sq(t, f) * (1 - p) * 0.3; } return s; }
    case "dash": { const d = 0.15, s = new Float32Array(Math.floor(sr * d)); for (let i = 0; i < s.length; i++) { const t = i / sr, e = 1 - t / d; s[i] = (noise() * 0.2 + sn(t, lerp(150, 80, t / d)) * 0.15) * e; } return s; }
    case "death": { const d = 0.25, s = new Float32Array(Math.floor(sr * d)); for (let i = 0; i < s.length; i++) { const t = i / sr, e = 1 - t / d; s[i] = (sq(t, lerp(400, 80, t / d)) * 0.2 + noise() * 0.1) * e; } return s; }
    case "strawberry": { const d = 0.35, s = new Float32Array(Math.floor(sr * d)); const n = [523, 659, 784, 1047]; for (let i = 0; i < s.length; i++) { const t = i / sr; const ni = Math.min(Math.floor(t / d * n.length), n.length - 1); s[i] = sn(t, n[ni]) * (1 - t / d) * 0.25; } return s; }
    case "spring": { const d = 0.18, s = new Float32Array(Math.floor(sr * d)); for (let i = 0; i < s.length; i++) { const t = i / sr, p = t / d; const f = p < 0.6 ? lerp(200, 800, p / 0.6) : lerp(800, 400, (p - 0.6) / 0.4); s[i] = sn(t, f) * (1 - p) * 0.3; } return s; }
    case "land": { const d = 0.06, s = new Float32Array(Math.floor(sr * d)); for (let i = 0; i < s.length; i++) { const t = i / sr; s[i] = tri(t, lerp(120, 60, t / d)) * (1 - t / d) * 0.2; } return s; }
    case "crumble": { const d = 0.15, s = new Float32Array(Math.floor(sr * d)); for (let i = 0; i < s.length; i++) { const t = i / sr; s[i] = noise() * (1 - t / d) * 0.2; } return s; }
    case "roomenter": { const d = 0.3, s = new Float32Array(Math.floor(sr * d)); const n = [440, 554, 659]; for (let i = 0; i < s.length; i++) { const t = i / sr; const ni = Math.min(Math.floor(t / d * n.length), n.length - 1); s[i] = sn(t, n[ni]) * (1 - t / d) * 0.2; } return s; }
    case "win": { const d = 0.9, s = new Float32Array(Math.floor(sr * d)); const n = [523, 659, 784, 1047, 784, 1047]; for (let i = 0; i < s.length; i++) { const t = i / sr; const ni = Math.min(Math.floor(t / (d / n.length)), n.length - 1); s[i] = (sq(t, n[ni]) * 0.1 + sn(t, n[ni] * 0.5) * 0.08) * Math.max(0, 1 - t / d); } return s; }
    case "coin": { const d = 0.08, s = new Float32Array(Math.floor(sr * d)); for (let i = 0; i < s.length; i++) { const t = i / sr; const f = t < d / 2 ? 800 : 1200; s[i] = sn(t, f) * (1 - t / d) * 0.2; } return s; }
    case "buy": { const d = 0.12, s = new Float32Array(Math.floor(sr * d)); const n = [600, 800, 1000]; for (let i = 0; i < s.length; i++) { const t = i / sr; const ni = Math.min(Math.floor(t / d * n.length), n.length - 1); s[i] = sn(t, n[ni]) * (1 - t / d) * 0.2; } return s; }
    case "shield": { const d = 0.18, s = new Float32Array(Math.floor(sr * d)); for (let i = 0; i < s.length; i++) { const t = i / sr; s[i] = sn(t, lerp(500, 300, t / d)) * (1 - t / d) * 0.25; } return s; }
    default: return new Float32Array(100);
  }
}

function initSfxBuffers() {
  try {
    const ctx = getAudioCtx();
    const types = ["jump", "walljump", "dash", "death", "strawberry", "spring", "land", "crumble", "roomenter", "win", "coin", "buy", "shield"];
    for (const type of types) {
      const samples = genSfxSamples(type, ctx.sampleRate);
      const buf = ctx.createBuffer(1, samples.length, ctx.sampleRate);
      buf.getChannelData(0).set(samples);
      sfxBuffers[type] = buf;
    }
  } catch { /* ignore */ }
}

const sfxCooldowns: Record<string, number> = {};

function sfx(type: string) {
  if (sfxMuted) return;
  try {
    // Cooldown: same sound can't play within 200ms
    const now = performance.now();
    if (sfxCooldowns[type] && now - sfxCooldowns[type] < 200) return;
    sfxCooldowns[type] = now;

    const ctx = getAudioCtx();
    if (!sfxBuffers[type]) initSfxBuffers();
    const buf = sfxBuffers[type];
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = 0.5;
    src.connect(gain);
    gain.connect(ctx.destination);
    src.onended = () => { try { src.disconnect(); gain.disconnect(); } catch { /* */ } };
    src.start();
  } catch { /* ignore */ }
}

// ─── Chiptune BGM (I–V–vi–IV in C major) ─────────────────────────────────────
// Notes: C=262, D=294, E=330, F=349, G=392, A=440, B=494
// Chords: I=C(C-E-G), V=G(G-B-D), vi=Am(A-C-E), IV=F(F-A-C)
const CHORD_PROG = [
  { root: 131, notes: [262, 330, 392] },  // I  = C  (C4, E4, G4)
  { root: 98,  notes: [196, 247, 294] },  // V  = G  (G3, B3, D4)
  { root: 110, notes: [220, 262, 330] },  // vi = Am (A3, C4, E4)
  { root: 87.3, notes: [175, 220, 262] }, // IV = F  (F3, A3, C4)
];

// Melody patterns per chord (scale degrees as freq multipliers from root*2)
const MELODIES = [
  // I: C major arpeggio + passing tones
  [523, 659, 784, 659, 523, 784, 659, 523],
  // V: G major rising
  [392, 494, 587, 494, 784, 587, 494, 392],
  // vi: Am descending
  [659, 523, 440, 523, 659, 523, 440, 330],
  // IV: F major bouncy
  [349, 440, 523, 440, 349, 523, 440, 349],
];

let bgmPlaying = false;
let bgmSource: AudioBufferSourceNode | null = null;
let bgmGain: GainNode | null = null;

// Generate the entire BGM loop as a single AudioBuffer — no real-time oscillators
function generateBGMBuffer(): AudioBuffer {
  const ctx = getAudioCtx();
  const SR = ctx.sampleRate;
  const BPM = 120;
  const beatDur = 60 / BPM;
  const barDur = beatDur * 4;
  const loopDur = barDur * 4;
  const len = Math.floor(SR * loopDur);
  const buf = ctx.createBuffer(1, len, SR);
  const data = buf.getChannelData(0);

  const sq = (t: number, f: number) => Math.sin(2 * Math.PI * f * t) > 0 ? 1 : -1;
  const tri = (t: number, f: number) => { const p = (t * f) % 1; return 4 * Math.abs(p - 0.5) - 1; };
  const sin = (t: number, f: number) => Math.sin(2 * Math.PI * f * t);

  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const barIdx = Math.floor(t / barDur) % 4;
    const barT = t - barIdx * barDur;
    const chord = CHORD_PROG[barIdx];
    const melody = MELODIES[barIdx];
    const eighthIdx = Math.floor(barT / (beatDur / 2)) % 8;
    const noteT = barT % (beatDur / 2);
    const noteEnv = Math.max(0, 1 - noteT / (beatDur / 2 - 0.03));

    let s = 0;
    // Bass
    s += tri(t, chord.root) * 0.08;
    // Arpeggio
    s += sq(t, chord.notes[eighthIdx % chord.notes.length]) * noteEnv * 0.025;
    // Melody
    s += sq(t, melody[eighthIdx]) * noteEnv * 0.04;
    // Kick on beats 1 and 3
    const beatInBar = Math.floor(barT / beatDur);
    if (beatInBar % 2 === 0) {
      const kickT = barT - beatInBar * beatDur;
      if (kickT < 0.08) {
        const kf = 150 - (150 - 40) * (kickT / 0.08);
        s += sin(kickT, kf) * (1 - kickT / 0.08) * 0.1;
      }
    }

    data[i] = Math.max(-0.8, Math.min(0.8, s));
  }

  return buf;
}

let bgmBuffer: AudioBuffer | null = null;

function startBGM() {
  if (bgmPlaying || musicMuted) return;
  stopBGM();
  try {
    const ctx = getAudioCtx();
    if (!bgmBuffer) bgmBuffer = generateBGMBuffer();
    bgmSource = ctx.createBufferSource();
    bgmSource.buffer = bgmBuffer;
    bgmSource.loop = true;
    bgmGain = ctx.createGain();
    bgmGain.gain.value = 0.5;
    bgmSource.connect(bgmGain);
    bgmGain.connect(ctx.destination);
    bgmSource.start();
    bgmPlaying = true;
  } catch { /* ignore */ }
}

function stopBGM() {
  bgmPlaying = false;
  if (bgmSource) { try { bgmSource.stop(); bgmSource.disconnect(); } catch { /* */ } bgmSource = null; }
  if (bgmGain) { try { bgmGain.disconnect(); } catch { /* */ } bgmGain = null; }
}

// ─── Drawing ─────────────────────────────────────────────────────────────────
function drawBg(ctx: CanvasRenderingContext2D, roomIdx: number) {
  const r1 = 10 + Math.sin(roomIdx * 0.3) * 5, g1 = 10 + roomIdx * 2, b1 = 30 + roomIdx * 5;
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, `rgb(${r1},${g1},${Math.min(b1, 60)})`);
  grad.addColorStop(1, `rgb(${r1 + 10},${g1 + 5},${Math.min(b1 + 20, 80)})`);
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(20,20,50,0.6)"; ctx.beginPath(); ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 40) { const h = 150 + Math.sin((x + roomIdx * 200) * 0.008) * 80 + Math.sin((x + roomIdx * 100) * 0.02) * 30; ctx.lineTo(x, H - h); }
  ctx.lineTo(W, H); ctx.fill();
}

function drawSnow(ctx: CanvasRenderingContext2D, snow: Snowflake[]) {
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  for (const s of snow) ctx.fillRect(s.x, s.y, s.size, s.size);
}

function drawPlatforms(ctx: CanvasRenderingContext2D, platforms: Rect[]) {
  for (const p of platforms) {
    ctx.fillStyle = "#2d3a4a"; ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = "#3d4e63"; ctx.fillRect(p.x, p.y, p.w, 2);
    ctx.fillStyle = "#253242";
    for (let tx = p.x; tx < p.x + p.w; tx += TILE) ctx.fillRect(tx, p.y, 1, p.h);
    for (let ty = p.y; ty < p.y + p.h; ty += TILE) ctx.fillRect(p.x, ty, p.w, 1);
  }
}

function drawCrumbles(ctx: CanvasRenderingContext2D, crumbles: CrumblePlatform[], time: number) {
  for (const c of crumbles) { if (!c.visible) continue; const ox = c.timer > 0 ? Math.sin(time * 0.8) * 2 : 0; ctx.fillStyle = c.timer > 0 ? "#5a4a3a" : "#4a3a2a"; ctx.fillRect(c.x + ox, c.y, c.w, TILE); }
}

function drawSpikes(ctx: CanvasRenderingContext2D, spikes: Spike[]) {
  ctx.fillStyle = "#c0392b";
  for (const s of spikes) { ctx.beginPath(); switch (s.dir) { case "up": ctx.moveTo(s.x, s.y); ctx.lineTo(s.x + 10, s.y - 10); ctx.lineTo(s.x + 20, s.y); break; case "down": ctx.moveTo(s.x, s.y + TILE); ctx.lineTo(s.x + 10, s.y + TILE + 10); ctx.lineTo(s.x + 20, s.y + TILE); break; case "left": ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - 10, s.y + 10); ctx.lineTo(s.x, s.y + 20); break; case "right": ctx.moveTo(s.x + TILE, s.y); ctx.lineTo(s.x + TILE + 10, s.y + 10); ctx.lineTo(s.x + TILE, s.y + 20); break; } ctx.fill(); }
}

function drawStrawberries(ctx: CanvasRenderingContext2D, strawberries: Strawberry[], time: number) {
  for (const s of strawberries) { if (s.collected) continue; const bob = Math.sin(time * 0.06) * 3; ctx.fillStyle = "rgba(232,72,85,0.15)"; ctx.beginPath(); ctx.arc(s.x, s.y + bob, 12, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#e84855"; ctx.beginPath(); ctx.arc(s.x, s.y + bob, 6, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#2ecc71"; ctx.beginPath(); ctx.moveTo(s.x, s.y + bob - 6); ctx.lineTo(s.x - 4, s.y + bob - 10); ctx.lineTo(s.x + 4, s.y + bob - 10); ctx.closePath(); ctx.fill(); }
}

function drawSprings(ctx: CanvasRenderingContext2D, springs: Spring[]) {
  for (const s of springs) { const compressed = s.activated > 0; const baseY = compressed ? s.y + 6 : s.y; ctx.fillStyle = "#7f8c8d"; ctx.fillRect(s.x - 8, s.y + 8, 36, 4); ctx.fillStyle = "#f39c12"; ctx.fillRect(s.x - 6, baseY - 2, 32, 4); }
}

function drawPlayer2(ctx: CanvasRenderingContext2D, player: Player, time: number, gs: GameState) {
  if (player.dead) return;
  // Hair trail
  for (let i = player.hair.length - 1; i >= 0; i--) {
    const h = player.hair[i]; const size = 6 - i * 0.6;
    ctx.fillStyle = player.hairColor; ctx.globalAlpha = 1 - i * 0.15;
    ctx.beginPath(); ctx.arc(h.x, h.y, size, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.save(); ctx.translate(player.x + PW / 2, player.y + PH / 2);
  let sx = 1, sy = 1;
  if (player.dashing > 0) { sx = 1.3; sy = 0.7; } else if (!player.grounded && player.vy < -2) { sx = 0.85; sy = 1.15; } else if (!player.grounded && player.vy > 2) { sx = 1.1; sy = 0.9; }
  ctx.scale(player.facing * sx, sy);
  ctx.fillStyle = "#4a6fa5"; ctx.fillRect(-PW / 2, -PH / 2, PW, PH);
  ctx.fillStyle = "#ffd6ba"; ctx.fillRect(-PW / 2 + 1, -PH / 2 + 1, PW - 2, 7);
  ctx.fillStyle = "#1a1a2e"; ctx.fillRect(1, -PH / 2 + 3, 2, 2);
  ctx.fillStyle = player.hairColor; ctx.fillRect(-PW / 2 - 1, -PH / 2 - 2, PW + 2, 4);
  ctx.restore();

  // Shield glow
  if (gs.shieldActive) {
    ctx.strokeStyle = "rgba(241,196,15,0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(player.x + PW / 2, player.y + PH / 2, 14 + Math.sin(time * 0.1) * 2, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]) {
  for (const p of particles) { ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, p.size, p.size); }
  ctx.globalAlpha = 1;
}

function drawCheckpoint(ctx: CanvasRenderingContext2D, cp: { x: number; y: number } | null, time: number) {
  if (!cp) return;
  ctx.fillStyle = `rgba(241,196,15,${0.5 + Math.sin(time * 0.08) * 0.3})`;
  ctx.beginPath(); ctx.moveTo(cp.x, cp.y - 12); ctx.lineTo(cp.x + 10, cp.y - 6); ctx.lineTo(cp.x, cp.y); ctx.closePath(); ctx.fill();
  ctx.fillRect(cp.x - 1, cp.y - 12, 2, 16);
}

function drawHUD(ctx: CanvasRenderingContext2D, gs: GameState) {
  ctx.font = "bold 14px monospace";
  // Deaths
  ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.fillRect(8, 8, 90, 24);
  ctx.fillStyle = "#c0392b"; ctx.fillText(`💀 ${gs.deaths}`, 16, 25);
  // Strawberries
  ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.fillRect(8, 36, 90, 24);
  ctx.fillStyle = "#e84855"; ctx.fillText(`🍓 ${gs.strawberriesCollected}/${gs.totalStrawberries}`, 16, 53);
  // Room
  ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.fillRect(W - 98, 8, 90, 24);
  ctx.fillStyle = "#7f8fa6"; ctx.fillText(`${gs.currentRoom + 1} / ${gs.rooms.length}`, W - 82, 25);
  // Coins (center top)
  ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.fillRect(W / 2 - 50, 8, 100, 24);
  ctx.fillStyle = "#f1c40f"; ctx.fillText(`🪙 ${gs.coins}`, W / 2 - 35, 25);
  // Active booster indicator
  if (gs.activeBooster) {
    const b = BOOSTERS.find(b => b.id === gs.activeBooster);
    if (b) {
      ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.fillRect(W / 2 - 50, 36, 100, 20);
      ctx.fillStyle = "#f39c12"; ctx.font = "bold 11px monospace";
      ctx.fillText(`${b.icon} ${b.name}`, W / 2 - 42, 50);
    }
  }
  // Slow-mo timer
  if (gs.slowMoFrames > 0) {
    ctx.fillStyle = "rgba(100,200,255,0.2)"; ctx.fillRect(0, 0, W * (gs.slowMoFrames / 300), 3);
  }
}

// ─── Game Component ──────────────────────────────────────────────────────────
export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gsRef = useRef<GameState | null>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const prevKeysRef = useRef<Set<string>>(new Set());
  const animRef = useRef<number>(0);
  const [status, setStatus] = useState<"menu" | "playing" | "win" | "shop" | "offer">("menu");
  const [shopTab, setShopTab] = useState<"boosters" | "cosmetics">("boosters");
  const [, forceUpdate] = useState(0);
  const [savedCoins, setSavedCoins] = useState(0);
  const [isSfxMuted, setIsSfxMuted] = useState(false);
  const [isMusicMuted, setIsMusicMuted] = useState(false);

  useEffect(() => {
    setSavedCoins(loadSave().coins);
    setIsSfxMuted(sfxMuted);
    setIsMusicMuted(musicMuted);
  }, []);

  const toggleSfx = useCallback(() => {
    sfxMuted = !sfxMuted;
    setIsSfxMuted(sfxMuted);
    saveAudioSettings();
  }, []);

  const toggleMusic = useCallback(() => {
    musicMuted = !musicMuted;
    setIsMusicMuted(musicMuted);
    saveAudioSettings();
    if (musicMuted) stopBGM(); else if (status === "playing") startBGM();
  }, [status]);

  const justPressed = useCallback((key: string) => keysRef.current.has(key) && !prevKeysRef.current.has(key), []);

  const spawnParticles = useCallback((gs: GameState, x: number, y: number, color: string, count: number, spread = 4) => {
    for (let i = 0; i < count; i++) gs.particles.push({ x, y, vx: (Math.random() - 0.5) * spread, vy: (Math.random() - 0.5) * spread - 1, life: 1, color, size: 1 + Math.random() * 3 });
  }, []);

  const killPlayer = useCallback((gs: GameState) => {
    // Shield check
    if (gs.shieldActive) {
      gs.shieldActive = false;
      gs.activeBooster = null;
      sfx("shield");
      spawnParticles(gs, gs.player.x + PW / 2, gs.player.y + PH / 2, "#f1c40f", 15, 6);
      gs.player.vy = JUMP_FORCE * 0.5;
      gs.screenShake = 4;
      return;
    }
    const p = gs.player;
    p.dead = true; p.deadTimer = 20;
    gs.deaths++; gs.roomDeaths++; gs.screenShake = 8;
    sfx("death");
    const colors = getDeathColors(gs);
    spawnParticles(gs, p.x + PW / 2, p.y + PH / 2, colors[0], 20, 8);
    spawnParticles(gs, p.x + PW / 2, p.y + PH / 2, colors[1], 10, 6);

    // Death-triggered offer: every 3 deaths in a room, if no active booster and has coins
    if (gs.roomDeaths % 3 === 0 && !gs.activeBooster && gs.coins >= 3) {
      // Offer cheapest affordable booster first, escalate with more deaths
      let offer: BoosterType = "slowmo"; // 3 coins — cheapest
      if (gs.coins >= 5 && gs.roomDeaths >= 6) offer = "checkpoint";
      if (gs.coins >= 8 && gs.roomDeaths >= 9) offer = "shield";
      gs.offerBooster = offer;
      // Show offer after respawn (delay via deadTimer)
      p.deadTimer = 25; // slightly longer to let particles settle
    }
  }, [spawnParticles]);

  const respawnPlayer = useCallback((gs: GameState) => {
    const room = gs.rooms[gs.currentRoom];
    const spawnPt = gs.checkpoint || room.spawn;
    gs.player = createPlayer(spawnPt, getHairColor(gs));
    if (gs.checkpoint) { gs.checkpoint = null; gs.activeBooster = null; }
    for (const c of room.crumbles) { c.timer = 0; c.respawnTimer = 0; c.visible = true; }
    for (const s of room.springs) { s.activated = 0; }
  }, []);

  const enterRoom = useCallback((gs: GameState, roomIdx: number) => {
    gs.currentRoom = roomIdx;
    gs.player = createPlayer(gs.rooms[roomIdx].spawn, getHairColor(gs));
    gs.checkpoint = null;
    gs.doubleDashActive = false;
    gs.springBoostActive = false;
    gs.slowMoFrames = 0;
    gs.roomDeaths = 0;
    gs.offerBooster = null;
  }, []);

  const initGame = useCallback(() => {
    const save = loadSave();
    const rooms = createRooms();
    let total = 0;
    for (const r of rooms) total += r.strawberries.length;
    const hairColor = save.eqHair ? (COSMETICS.find(c => c.id === save.eqHair)?.color || DEFAULT_HAIR) : DEFAULT_HAIR;
    const gs: GameState = {
      player: createPlayer(rooms[0].spawn, hairColor),
      rooms, currentRoom: 0, deaths: 0,
      strawberriesCollected: 0, totalStrawberries: total,
      particles: [], snow: createSnow(),
      status: "playing", screenShake: 0, time: 0,
      coins: save.coins,
      ownedCosmetics: new Set(save.owned),
      equippedHair: save.eqHair, equippedTrail: save.eqTrail, equippedDeathEffect: save.eqDeath,
      activeBooster: null, shieldActive: false, doubleDashActive: false,
      checkpoint: null, slowMoFrames: 0, springBoostActive: false,
      starterPackBought: save.starterPack,
      roomDeaths: 0, offerBooster: null,
      transitionTimer: 0, transitionDir: 0,
    };
    gsRef.current = gs;
    setStatus("playing");
    startBGM();
  }, []);

  const buyBooster = useCallback((id: BoosterType) => {
    const gs = gsRef.current; if (!gs) return;
    const def = BOOSTERS.find(b => b.id === id); if (!def) return;
    if (gs.coins < def.cost) return;
    gs.coins -= def.cost;
    gs.activeBooster = id;
    if (id === "shield") gs.shieldActive = true;
    if (id === "doubleDash") gs.doubleDashActive = true;
    if (id === "springBoost") gs.springBoostActive = true;
    sfx("buy"); writeSave(gs); forceUpdate(n => n + 1);
  }, []);

  const buyCosmetic = useCallback((id: string) => {
    const gs = gsRef.current; if (!gs) return;
    const def = COSMETICS.find(c => c.id === id); if (!def) return;
    if (gs.ownedCosmetics.has(id)) {
      // Equip
      if (def.type === "hair") { gs.equippedHair = id; gs.player.hairColor = def.color; }
      else if (def.type === "trail") gs.equippedTrail = id;
      else if (def.type === "deathEffect") gs.equippedDeathEffect = id;
    } else {
      if (gs.coins < def.cost) return;
      gs.coins -= def.cost;
      gs.ownedCosmetics.add(id);
      sfx("buy");
    }
    writeSave(gs); forceUpdate(n => n + 1);
  }, []);

  const buyStarterPack = useCallback(() => {
    const gs = gsRef.current; if (!gs || gs.starterPackBought) return;
    // In production this would trigger Apple IAP — for now simulate the purchase
    gs.starterPackBought = true;
    gs.coins += 100;
    gs.ownedCosmetics.add("hair_aurora");
    gs.ownedCosmetics.add("trail_aurora");
    gs.equippedHair = "hair_aurora";
    gs.equippedTrail = "trail_aurora";
    gs.player.hairColor = "#ff6b9d";
    sfx("strawberry"); // celebratory chime
    sfx("buy");
    writeSave(gs); forceUpdate(n => n + 1);
  }, []);

  const update = useCallback(() => {
    const gs = gsRef.current;
    if (!gs || gs.status !== "playing") return;

    const slowMo = gs.slowMoFrames > 0 ? 0.5 : 1;
    gs.time++;
    const p = gs.player;
    const room = gs.rooms[gs.currentRoom];
    const keys = keysRef.current;

    // Snow
    for (const s of gs.snow) { s.y += s.speed; s.x += s.drift + Math.sin(gs.time * 0.01 + s.x) * 0.2; if (s.y > H) { s.y = -5; s.x = Math.random() * W; } if (s.x > W) s.x = 0; if (s.x < 0) s.x = W; }
    if (gs.screenShake > 0) gs.screenShake -= 0.5;
    if (gs.slowMoFrames > 0) gs.slowMoFrames--;

    // Death timer
    if (p.dead) {
      p.deadTimer--;
      if (p.deadTimer <= 0) {
        respawnPlayer(gs);
        // Show offer popup if one is queued
        if (gs.offerBooster) {
          gs.status = "offer";
          setStatus("offer");
          prevKeysRef.current = new Set(keys);
          return;
        }
      }
      gs.particles = gs.particles.filter(part => { part.x += part.vx; part.y += part.vy; part.vy += 0.1; part.life -= 0.04; return part.life > 0; });
      prevKeysRef.current = new Set(keys); return;
    }

    const left = keys.has("ArrowLeft") || keys.has("a");
    const right = keys.has("ArrowRight") || keys.has("d");
    const up = keys.has("ArrowUp") || keys.has("w");
    const down = keys.has("ArrowDown") || keys.has("s");
    const jumpBtn = keys.has(" ") || keys.has("c") || keys.has("ArrowUp") || keys.has("w");
    const dashBtn = justPressed("Shift") || justPressed("x") || justPressed("z");

    // Activate slow-mo with Q
    if (justPressed("q") && gs.activeBooster === "slowmo" && gs.slowMoFrames <= 0) {
      gs.slowMoFrames = 300;
      gs.activeBooster = null;
      sfx("buy");
    }

    // Place checkpoint with E
    if (justPressed("e") && gs.activeBooster === "checkpoint" && !gs.checkpoint) {
      gs.checkpoint = { x: p.x, y: p.y };
      sfx("buy");
    }

    // Horizontal
    if (p.dashing <= 0) {
      if (left) { p.vx = -PLAYER_SPEED * slowMo; p.facing = -1; }
      else if (right) { p.vx = PLAYER_SPEED * slowMo; p.facing = 1; }
      else { p.vx *= 0.65; }
    }

    // Coyote & jump buffer
    if (p.grounded) p.coyoteTimer = COYOTE_FRAMES; else p.coyoteTimer = Math.max(0, p.coyoteTimer - 1);
    if (justPressed(" ") || justPressed("c") || justPressed("ArrowUp") || justPressed("w")) p.jumpBuffer = JUMP_BUFFER_FRAMES; else p.jumpBuffer = Math.max(0, p.jumpBuffer - 1);

    // Jump
    if (p.dashing <= 0) {
      if (p.jumpBuffer > 0 && p.coyoteTimer > 0) {
        p.vy = JUMP_FORCE * slowMo; p.grounded = false; p.coyoteTimer = 0; p.jumpBuffer = 0; p.jumpHeld = true;
        sfx("jump"); spawnParticles(gs, p.x + PW / 2, p.y + PH, "rgba(255,255,255,0.5)", 4);
      } else if (p.jumpBuffer > 0 && p.wallDir !== 0) {
        p.vx = -p.wallDir * WALL_JUMP_H; p.vy = WALL_JUMP_V * slowMo; p.facing = -p.wallDir; p.wallDir = 0; p.jumpBuffer = 0; p.jumpHeld = true; p.canDash = true; p.dashCount = 0;
        sfx("walljump"); spawnParticles(gs, p.x + (p.facing < 0 ? PW : 0), p.y + PH / 2, "rgba(255,255,255,0.5)", 5);
      }
      if (!jumpBtn && p.vy < JUMP_CUT && p.jumpHeld) { p.vy = JUMP_CUT; p.jumpHeld = false; }
    }

    // Dash
    const maxDashes = gs.doubleDashActive ? 2 : 1;
    if (dashBtn && p.dashCount < maxDashes && p.dashing <= 0 && p.dashCooldown <= 0) {
      let dx = right ? 1 : left ? -1 : 0;
      let dy = up ? -1 : down ? 1 : 0;
      if (dx === 0 && dy === 0) dx = p.facing;
      const len = Math.sqrt(dx * dx + dy * dy);
      p.dashDir = { x: dx / len, y: dy / len };
      p.dashing = DASH_DURATION; p.dashCount++; p.dashCooldown = DASH_COOLDOWN;
      const trailColor = getTrailColor(gs);
      p.hairColor = trailColor;
      gs.screenShake = 3;
      sfx("dash"); spawnParticles(gs, p.x + PW / 2, p.y + PH / 2, trailColor, 8, 3);
    }

    if (p.dashing > 0) {
      p.vx = p.dashDir.x * DASH_SPEED * slowMo; p.vy = p.dashDir.y * DASH_SPEED * slowMo; p.dashing--;
      if (gs.time % 2 === 0) gs.particles.push({ x: p.x + PW / 2, y: p.y + PH / 2, vx: 0, vy: 0, life: 0.6, color: p.hairColor, size: 4 });
    } else { p.dashCooldown = Math.max(0, p.dashCooldown - 1); }

    // Gravity (with half-gravity at jump peak for hangtime)
    if (p.dashing <= 0) {
      if (p.wallDir !== 0 && p.vy > 0) {
        p.vy = Math.min(p.vy + GRAVITY * 0.4 * slowMo, WALL_SLIDE_SPEED);
      } else if (p.jumpHeld && Math.abs(p.vy) < Math.abs(HALF_GRAV_THRESHOLD)) {
        // Half gravity near jump peak when holding jump — gives hangtime
        p.vy = Math.min(p.vy + GRAVITY * 0.5 * slowMo, MAX_FALL);
      } else {
        p.vy = Math.min(p.vy + GRAVITY * slowMo, MAX_FALL);
      }
    }

    // Collisions
    p.x += p.vx;
    const allSolids = [...room.platforms];
    for (const c of room.crumbles) { if (c.visible) allSolids.push({ x: c.x, y: c.y, w: c.w, h: TILE }); }
    for (const plat of allSolids) {
      if (rectsOverlap({ x: p.x, y: p.y, w: PW, h: PH }, plat)) {
        // Dash corner correction — if dashing sideways into a ledge, pop up onto it
        if (p.dashing > 0 && Math.abs(p.dashDir.y) < 0.1) {
          let popped = false;
          for (let nudge = 1; nudge <= CORNER_CORRECTION + 2; nudge++) {
            if (!rectsOverlap({ x: p.x, y: p.y - nudge, w: PW, h: PH }, plat)) {
              let blocked = false;
              for (const other of allSolids) { if (rectsOverlap({ x: p.x, y: p.y - nudge, w: PW, h: PH }, other)) { blocked = true; break; } }
              if (!blocked) { p.y -= nudge; popped = true; break; }
            }
          }
          if (popped) continue;
        }
        if (p.vx > 0) p.x = plat.x - PW; else if (p.vx < 0) p.x = plat.x + plat.w;
        p.vx = 0;
      }
    }

    p.y += p.vy; p.grounded = false;
    for (const plat of allSolids) {
      if (rectsOverlap({ x: p.x, y: p.y, w: PW, h: PH }, plat)) {
        if (p.vy > 0) {
          p.y = plat.y - PH; p.grounded = true; p.canDash = true; p.dashCount = 0;
          p.hairColor = getHairColor(gs);
          if (p.vy > 6) { spawnParticles(gs, p.x + PW / 2, p.y + PH, "rgba(255,255,255,0.4)", 3); }
        } else if (p.vy < 0) {
          // Jump corner correction — nudge player sideways if hitting a corner
          let corrected = false;
          for (let nudge = 1; nudge <= CORNER_CORRECTION; nudge++) {
            // Try nudging right
            if (!rectsOverlap({ x: p.x + nudge, y: p.y, w: PW, h: PH }, plat)) {
              let blocked = false;
              for (const other of allSolids) { if (rectsOverlap({ x: p.x + nudge, y: p.y, w: PW, h: PH }, other)) { blocked = true; break; } }
              if (!blocked) { p.x += nudge; corrected = true; break; }
            }
            // Try nudging left
            if (!rectsOverlap({ x: p.x - nudge, y: p.y, w: PW, h: PH }, plat)) {
              let blocked = false;
              for (const other of allSolids) { if (rectsOverlap({ x: p.x - nudge, y: p.y, w: PW, h: PH }, other)) { blocked = true; break; } }
              if (!blocked) { p.x -= nudge; corrected = true; break; }
            }
          }
          if (!corrected) { p.y = plat.y + plat.h; p.vy = 0; }
        } else {
          p.vy = 0;
        }
      }
    }

    // Walls (wider forgiveness window — can wall-jump from WALL_JUMP_FORGIVENESS pixels away)
    p.wallDir = 0;
    if (!p.grounded) {
      for (const plat of allSolids) {
        if (rectsOverlap({ x: p.x - WALL_JUMP_FORGIVENESS, y: p.y + 2, w: WALL_JUMP_FORGIVENESS, h: PH - 4 }, plat) && left) p.wallDir = -1;
        if (rectsOverlap({ x: p.x + PW, y: p.y + 2, w: WALL_JUMP_FORGIVENESS, h: PH - 4 }, plat) && right) p.wallDir = 1;
      }
    }

    // Crumbles
    for (const c of room.crumbles) {
      if (!c.visible) { c.respawnTimer--; if (c.respawnTimer <= 0) { c.visible = true; c.timer = 0; } continue; }
      if (p.grounded && p.x + PW > c.x && p.x < c.x + c.w && Math.abs(p.y + PH - c.y) < 2) { if (c.timer === 0) c.timer = CRUMBLE_DELAY; }
      if (c.timer > 0) { c.timer--; if (c.timer <= 0) { c.visible = false; c.respawnTimer = CRUMBLE_RESPAWN; sfx("crumble"); spawnParticles(gs, c.x + c.w / 2, c.y + TILE / 2, "#4a3a2a", 8, 4); } }
    }

    // Springs
    const springMult = gs.springBoostActive ? 1.5 : 1;
    for (const s of room.springs) {
      if (s.activated > 0) s.activated--;
      if (rectsOverlap({ x: p.x, y: p.y, w: PW, h: PH }, { x: s.x - 6, y: s.y - 4, w: 32, h: 16 }) && p.vy >= 0) {
        p.vy = SPRING_FORCE * springMult; p.grounded = false; p.canDash = true; p.dashCount = 0; p.hairColor = getHairColor(gs);
        s.activated = 15; sfx("spring"); spawnParticles(gs, s.x + 10, s.y, "#f1c40f", 6, 5);
      }
    }

    // Spikes
    for (const s of room.spikes) {
      if (rectsOverlap({ x: p.x + 2, y: p.y + 2, w: PW - 4, h: PH - 4 }, spikeHitbox(s))) {
        killPlayer(gs); prevKeysRef.current = new Set(keys); return;
      }
    }

    // Strawberries
    for (const s of room.strawberries) {
      if (s.collected) continue;
      const dx = (p.x + PW / 2) - s.x, dy = (p.y + PH / 2) - s.y;
      if (Math.sqrt(dx * dx + dy * dy) < 16) {
        s.collected = true; gs.strawberriesCollected++;
        gs.coins += 2; sfx("strawberry"); sfx("coin");
        spawnParticles(gs, s.x, s.y, "#e84855", 10, 5);
        spawnParticles(gs, s.x, s.y, "#2ecc71", 5, 3);
        writeSave(gs);
      }
    }

    // Fall
    if (p.y > H + 20 || p.y < -40 || p.x < -20 || p.x > W + 20) { killPlayer(gs); prevKeysRef.current = new Set(keys); return; }

    // Room transition animation
    if (gs.transitionTimer > 0) {
      gs.transitionTimer--;
      if (gs.transitionTimer === 10 && gs.transitionDir === 1) {
        // Midpoint: switch room at peak darkness
        if (gs.currentRoom < gs.rooms.length - 1) {
          enterRoom(gs, gs.currentRoom + 1);
        }
        gs.transitionDir = -1; // start fading in
      }
      prevKeysRef.current = new Set(keys);
      return; // freeze gameplay during transition
    }

    // Room transition trigger
    if (p.x >= room.exitX && p.grounded) {
      gs.coins += 1; sfx("coin");
      if (gs.currentRoom < gs.rooms.length - 1) {
        gs.transitionTimer = 20; gs.transitionDir = 1; // start fade out
        sfx("roomenter");
      } else {
        gs.coins += 5;
        gs.status = "win"; setStatus("win"); sfx("win"); stopBGM();
      }
      writeSave(gs); prevKeysRef.current = new Set(keys); return;
    }

    // Hair
    const headX = p.x + PW / 2, headY = p.y - 1;
    for (let i = 0; i < p.hair.length; i++) {
      const target = i === 0 ? { x: headX, y: headY } : p.hair[i - 1];
      p.hair[i].x += (target.x - p.hair[i].x) * 0.4; p.hair[i].y += (target.y - p.hair[i].y) * 0.4;
      p.hair[i].x -= p.facing * (i * 1.2); p.hair[i].y += i * 0.5;
    }

    // Particles
    gs.particles = gs.particles.filter(part => { part.x += part.vx; part.y += part.vy; part.vy += 0.08; part.life -= 0.03; return part.life > 0; });

    // Open shop with Tab
    if (justPressed("Tab")) { gs.status = "shop"; setStatus("shop"); stopBGM(); }

    prevKeysRef.current = new Set(keys);
  }, [justPressed, spawnParticles, killPlayer, respawnPlayer, enterRoom]);

  const render = useCallback(() => {
    const canvas = canvasRef.current; const gs = gsRef.current;
    if (!canvas || !gs) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    ctx.save();
    if (gs.screenShake > 0) ctx.translate((Math.random() - 0.5) * gs.screenShake, (Math.random() - 0.5) * gs.screenShake);
    const room = gs.rooms[gs.currentRoom];
    drawBg(ctx, gs.currentRoom); drawSnow(ctx, gs.snow); drawPlatforms(ctx, room.platforms);
    drawCrumbles(ctx, room.crumbles, gs.time); drawSpikes(ctx, room.spikes);
    drawStrawberries(ctx, room.strawberries, gs.time); drawSprings(ctx, room.springs);
    drawCheckpoint(ctx, gs.checkpoint, gs.time);
    drawParticles(ctx, gs.particles); drawPlayer2(ctx, gs.player, gs.time, gs);
    drawHUD(ctx, gs);

    // Room transition fade overlay
    if (gs.transitionTimer > 0) {
      const progress = gs.transitionDir === 1
        ? (20 - gs.transitionTimer) / 10  // fading out: 0 → 1
        : gs.transitionTimer / 10;         // fading in: 1 → 0
      const alpha = Math.min(1, Math.max(0, progress));
      ctx.fillStyle = `rgba(0,0,0,${alpha})`;
      ctx.fillRect(-10, -10, W + 20, H + 20);
    }

    ctx.restore();
  }, []);

  const gameLoop = useCallback(() => { update(); render(); animRef.current = requestAnimationFrame(gameLoop); }, [update, render]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { keysRef.current.add(e.key); if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Tab"].includes(e.key)) e.preventDefault(); };
    const handleKeyUp = (e: KeyboardEvent) => { keysRef.current.delete(e.key); };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => { window.removeEventListener("keydown", handleKeyDown); window.removeEventListener("keyup", handleKeyUp); };
  }, []);

  useEffect(() => {
    if (status === "playing") { animRef.current = requestAnimationFrame(gameLoop); return () => cancelAnimationFrame(animRef.current); }
  }, [status, gameLoop]);

  const gs = gsRef.current;

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="relative">
        <canvas ref={canvasRef} width={W} height={H} className="rounded-lg border-2 border-indigo-900/50 shadow-2xl shadow-indigo-900/30" />

        {/* Menu */}
        {status === "menu" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 rounded-lg">
            <div className="mb-2 text-6xl">🏔️</div>
            <h1 className="text-5xl font-bold text-cyan-400 mb-1 tracking-widest" style={{ fontFamily: "monospace", textShadow: "0 0 20px rgba(100,200,255,0.5)" }}>ASCENT</h1>
            <p className="text-indigo-300 mb-6 text-sm tracking-wider">REACH THE TOP</p>
            <div className="flex gap-3 mb-4">
              <button onClick={initGame} className="px-8 py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-lg rounded transition-colors" style={{ fontFamily: "monospace" }}>CLIMB</button>
              <button onClick={() => { if (!gsRef.current) initGame(); setStatus("shop"); if (gsRef.current) gsRef.current.status = "shop"; }} className="px-6 py-3 bg-yellow-600/80 hover:bg-yellow-500 text-white font-bold text-lg rounded transition-colors" style={{ fontFamily: "monospace" }}>🪙 SHOP</button>
            </div>
            <p className="text-yellow-400 text-sm mb-4" style={{ fontFamily: "monospace" }}>🪙 {savedCoins} coins</p>
            <div className="text-gray-500 text-xs text-center space-y-1" style={{ fontFamily: "monospace" }}>
              <p>Arrow Keys / WASD — Move · C / Space — Jump · X / Shift — Dash</p>
              <p>Tab — Shop · Q — Activate Slow-Mo · E — Place Checkpoint</p>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={toggleSfx} className={`px-3 py-1.5 rounded text-xs font-bold transition-colors ${isSfxMuted ? "bg-red-900/50 text-red-400" : "bg-gray-800 text-gray-300"}`} style={{ fontFamily: "monospace" }}>
                {isSfxMuted ? "🔇 SFX OFF" : "🔊 SFX ON"}
              </button>
              <button onClick={toggleMusic} className={`px-3 py-1.5 rounded text-xs font-bold transition-colors ${isMusicMuted ? "bg-red-900/50 text-red-400" : "bg-gray-800 text-gray-300"}`} style={{ fontFamily: "monospace" }}>
                {isMusicMuted ? "🔇 MUSIC OFF" : "🎵 MUSIC ON"}
              </button>
            </div>
          </div>
        )}

        {/* Win */}
        {status === "win" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 rounded-lg">
            <div className="mb-2 text-5xl">⛰️</div>
            <h2 className="text-4xl font-bold text-cyan-400 mb-4" style={{ fontFamily: "monospace", textShadow: "0 0 20px rgba(100,200,255,0.5)" }}>ASCENT REACHED</h2>
            <div className="text-gray-300 text-sm space-y-2 mb-4" style={{ fontFamily: "monospace" }}>
              <p>Deaths: <span className="text-red-400">{gs?.deaths || 0}</span></p>
              <p>Strawberries: <span className="text-red-400">{gs?.strawberriesCollected || 0}/{gs?.totalStrawberries || 0}</span></p>
              <p>Coins earned: <span className="text-yellow-400">🪙 {gs?.coins || 0}</span></p>
            </div>
            <div className="flex gap-3">
              <button onClick={initGame} className="px-6 py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded transition-colors" style={{ fontFamily: "monospace" }}>CLIMB AGAIN</button>
              <button onClick={() => { setStatus("shop"); if (gs) gs.status = "shop"; }} className="px-6 py-3 bg-yellow-600/80 hover:bg-yellow-500 text-white font-bold rounded transition-colors" style={{ fontFamily: "monospace" }}>🪙 SHOP</button>
            </div>
          </div>
        )}

        {/* Shop */}
        {status === "shop" && gs && (
          <div className="absolute inset-0 flex flex-col bg-black/90 rounded-lg p-4 overflow-y-auto" style={{ fontFamily: "monospace" }}>
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-xl font-bold text-cyan-400">🪙 SHOP</h2>
              <div className="flex items-center gap-4">
                <span className="text-yellow-400 font-bold">🪙 {gs.coins}</span>
                <button onClick={() => { setStatus("playing"); gs.status = "playing"; startBGM(); }} className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded">✕ CLOSE</button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-3">
              <button onClick={() => setShopTab("boosters")} className={`px-4 py-2 rounded text-sm font-bold ${shopTab === "boosters" ? "bg-cyan-600 text-white" : "bg-gray-800 text-gray-400"}`}>BOOSTERS</button>
              <button onClick={() => setShopTab("cosmetics")} className={`px-4 py-2 rounded text-sm font-bold ${shopTab === "cosmetics" ? "bg-cyan-600 text-white" : "bg-gray-800 text-gray-400"}`}>COSMETICS</button>
            </div>

            {/* Starter Pack Banner */}
            {!gs.starterPackBought && (
              <div className="mb-4 rounded-lg" style={{ background: "linear-gradient(135deg, #1a0533 0%, #2d1b69 40%, #4a1942 100%)", border: "2px solid rgba(196,77,255,0.5)", padding: "16px" }}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xl">⭐</span>
                  <span className="text-yellow-300 font-bold text-base">STARTER PACK</span>
                  <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded-full ml-auto animate-pulse">BEST VALUE</span>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2 text-sm text-gray-200">
                      <span className="w-3 h-3 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: "#ff6b9d" }} />
                      Aurora Hair (Exclusive)
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-200">
                      <span className="w-3 h-3 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: "#c44dff" }} />
                      Aurora Trail (Exclusive)
                    </div>
                    <div className="text-sm text-yellow-400 mt-1">+ 100 🪙 Coins</div>
                    <div className="text-xs text-gray-500 line-through">Value: 140 coins</div>
                  </div>
                  <button
                    onClick={buyStarterPack}
                    className="px-5 py-3 bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-500 hover:to-pink-400 text-white font-bold text-base rounded-lg shadow-lg shadow-purple-900/50 transition-all flex-shrink-0"
                  >
                    $0.99
                  </button>
                </div>
              </div>
            )}

            {shopTab === "boosters" && (
              <div className="grid grid-cols-2 gap-2">
                {BOOSTERS.map(b => (
                  <div key={b.id} className="bg-gray-800/80 rounded p-2 flex flex-col">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">{b.icon}</span>
                      <span className="text-white text-sm font-bold">{b.name}</span>
                    </div>
                    <p className="text-gray-500 text-xs mb-2">{b.desc}</p>
                    <button
                      onClick={() => buyBooster(b.id)}
                      disabled={gs.coins < b.cost || gs.activeBooster === b.id}
                      className={`mt-auto px-2 py-1 rounded text-xs font-bold ${
                        gs.activeBooster === b.id ? "bg-green-700 text-white" :
                        gs.coins < b.cost ? "bg-gray-700 text-gray-500 cursor-not-allowed" :
                        "bg-yellow-600 hover:bg-yellow-500 text-white"
                      }`}
                    >
                      {gs.activeBooster === b.id ? "ACTIVE" : `🪙 ${b.cost}`}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {shopTab === "cosmetics" && (
              <div className="space-y-3">
                {(["hair", "trail", "deathEffect"] as const).map(type => (
                  <div key={type}>
                    <h3 className="text-gray-400 text-xs mb-1 uppercase">{type === "hair" ? "Hair Colors" : type === "trail" ? "Dash Trails" : "Death Effects"}</h3>
                    <div className="grid grid-cols-3 gap-2">
                      {COSMETICS.filter(c => c.type === type).map(c => {
                        const owned = gs.ownedCosmetics.has(c.id);
                        const equipped = (type === "hair" && gs.equippedHair === c.id) || (type === "trail" && gs.equippedTrail === c.id) || (type === "deathEffect" && gs.equippedDeathEffect === c.id);
                        return (
                          <button
                            key={c.id}
                            onClick={() => buyCosmetic(c.id)}
                            disabled={!owned && gs.coins < c.cost}
                            className={`rounded p-2 text-xs font-bold flex items-center gap-2 ${
                              equipped ? "bg-cyan-700 text-white ring-2 ring-cyan-400" :
                              owned ? "bg-gray-700 text-white hover:bg-gray-600" :
                              gs.coins < c.cost ? "bg-gray-800 text-gray-600 cursor-not-allowed" :
                              "bg-gray-800 text-gray-300 hover:bg-gray-700"
                            }`}
                          >
                            <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: c.color }} />
                            <span>{c.name}</span>
                            {!owned && <span className="text-yellow-400 ml-auto">🪙{c.cost}</span>}
                            {equipped && <span className="ml-auto text-cyan-300">✓</span>}
                            {owned && !equipped && <span className="ml-auto text-gray-500">EQUIP</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Death-triggered offer */}
        {status === "offer" && gs && gs.offerBooster && (() => {
          const booster = BOOSTERS.find(b => b.id === gs.offerBooster);
          if (!booster) return null;
          const canAfford = gs.coins >= booster.cost;
          return (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70 rounded-lg" style={{ fontFamily: "monospace" }}>
              <div className="bg-gray-900 border border-yellow-500/40 rounded-xl p-5 max-w-xs text-center shadow-2xl shadow-yellow-900/20">
                <p className="text-gray-400 text-xs mb-2">Struggling? Try a boost!</p>
                <div className="flex items-center justify-center gap-2 mb-3">
                  <span className="text-2xl">{booster.icon}</span>
                  <span className="text-white font-bold text-lg">{booster.name}</span>
                </div>
                <p className="text-gray-400 text-xs mb-4">{booster.desc}</p>
                <div className="flex gap-2 justify-center">
                  <button
                    onClick={() => {
                      if (canAfford) {
                        gs.coins -= booster.cost;
                        gs.activeBooster = booster.id;
                        if (booster.id === "shield") gs.shieldActive = true;
                        if (booster.id === "doubleDash") gs.doubleDashActive = true;
                        if (booster.id === "springBoost") gs.springBoostActive = true;
                        sfx("buy");
                        writeSave(gs);
                      }
                      gs.offerBooster = null;
                      gs.status = "playing";
                      setStatus("playing");
                    }}
                    disabled={!canAfford}
                    className={`px-4 py-2 rounded font-bold text-sm ${canAfford ? "bg-yellow-600 hover:bg-yellow-500 text-white" : "bg-gray-700 text-gray-500 cursor-not-allowed"}`}
                  >
                    {canAfford ? `🪙 ${booster.cost} — BUY` : `Need ${booster.cost} coins`}
                  </button>
                  <button
                    onClick={() => {
                      gs.offerBooster = null;
                      gs.status = "playing";
                      setStatus("playing");
                    }}
                    className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded font-bold text-sm"
                  >
                    No thanks
                  </button>
                </div>
                <p className="text-gray-600 text-xs mt-3">🪙 {gs.coins} coins</p>
              </div>
            </div>
          );
        })()}
      </div>

      <div className="flex items-center gap-4 text-gray-600 text-xs" style={{ fontFamily: "monospace" }}>
        <span>Arrows/WASD: Move</span>
        <span>C/Space: Jump</span>
        <span>X/Shift: Dash</span>
        <span>Tab: Shop</span>
        <span className="mx-1 text-gray-700">|</span>
        <button onClick={toggleSfx} className="hover:text-gray-400 transition-colors">
          {isSfxMuted ? "🔇" : "🔊"}
        </button>
        <button onClick={toggleMusic} className="hover:text-gray-400 transition-colors">
          {isMusicMuted ? "🔇" : "🎵"}
        </button>
      </div>
    </div>
  );
}
