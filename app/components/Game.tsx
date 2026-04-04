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
  status: "menu" | "playing" | "win" | "shop";
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
}

// ─── Persistence ─────────────────────────────────────────────────────────────
interface SaveData {
  coins: number;
  owned: string[];
  eqHair: string;
  eqTrail: string;
  eqDeath: string;
}

function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem("summit_save");
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { coins: 0, owned: [], eqHair: "", eqTrail: "", eqDeath: "" };
}

function writeSave(gs: GameState) {
  try {
    const data: SaveData = {
      coins: gs.coins,
      owned: Array.from(gs.ownedCosmetics),
      eqHair: gs.equippedHair,
      eqTrail: gs.equippedTrail,
      eqDeath: gs.equippedDeathEffect,
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
    { platforms: [{ x: 0, y: H - T, w: 160, h: T },{ x: 0, y: 0, w: T, h: H },{ x: W - T, y: 0, w: T, h: H },{ x: 0, y: 0, w: W, h: T },{ x: 350, y: 350, w: 100, h: T },{ x: 550, y: 250, w: 100, h: T },{ x: 650, y: H - T, w: 150, h: T }], spikes: Array.from({ length: 24 }, (_, i) => ({ x: 170 + i * 20, y: H - T, dir: "up" as const })), strawberries: [{ x: 590, y: 220, collected: false }], springs: [], crumbles: [], spawn: { x: 50, y: H - T - PH - 2 }, exitX: W - T - PW - 2 },
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

// ─── Sound Effects ───────────────────────────────────────────────────────────
let audioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext { if (!audioCtx) audioCtx = new AudioContext(); return audioCtx; }

function sfx(type: string) {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    const t = ctx.currentTime;
    switch (type) {
      case "jump": osc.type = "square"; osc.frequency.setValueAtTime(280, t); osc.frequency.linearRampToValueAtTime(560, t + 0.08); gain.gain.setValueAtTime(0.12, t); gain.gain.linearRampToValueAtTime(0, t + 0.1); osc.start(t); osc.stop(t + 0.1); break;
      case "walljump": osc.type = "square"; osc.frequency.setValueAtTime(200, t); osc.frequency.linearRampToValueAtTime(600, t + 0.06); osc.frequency.linearRampToValueAtTime(400, t + 0.12); gain.gain.setValueAtTime(0.12, t); gain.gain.linearRampToValueAtTime(0, t + 0.12); osc.start(t); osc.stop(t + 0.12); break;
      case "dash": { const buf = ctx.createBuffer(1, ctx.sampleRate * 0.15, ctx.sampleRate); const data = buf.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length); const noise = ctx.createBufferSource(); noise.buffer = buf; const ng = ctx.createGain(); ng.gain.setValueAtTime(0.15, t); ng.gain.linearRampToValueAtTime(0, t + 0.15); const filt = ctx.createBiquadFilter(); filt.type = "bandpass"; filt.frequency.setValueAtTime(2000, t); filt.frequency.linearRampToValueAtTime(500, t + 0.15); filt.Q.value = 2; noise.connect(filt); filt.connect(ng); ng.connect(ctx.destination); noise.start(t); noise.stop(t + 0.15); osc.type = "sawtooth"; osc.frequency.setValueAtTime(150, t); osc.frequency.linearRampToValueAtTime(80, t + 0.1); gain.gain.setValueAtTime(0.08, t); gain.gain.linearRampToValueAtTime(0, t + 0.1); osc.start(t); osc.stop(t + 0.1); break; }
      case "death": { osc.type = "square"; osc.frequency.setValueAtTime(400, t); osc.frequency.linearRampToValueAtTime(80, t + 0.3); gain.gain.setValueAtTime(0.15, t); gain.gain.linearRampToValueAtTime(0, t + 0.3); osc.start(t); osc.stop(t + 0.3); const buf = ctx.createBuffer(1, ctx.sampleRate * 0.12, ctx.sampleRate); const data = buf.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length); const noise = ctx.createBufferSource(); noise.buffer = buf; const ng = ctx.createGain(); ng.gain.setValueAtTime(0.2, t); ng.gain.linearRampToValueAtTime(0, t + 0.12); noise.connect(ng); ng.connect(ctx.destination); noise.start(t); noise.stop(t + 0.12); break; }
      case "strawberry": { osc.type = "sine"; osc.frequency.setValueAtTime(523, t); osc.frequency.setValueAtTime(659, t + 0.08); osc.frequency.setValueAtTime(784, t + 0.16); osc.frequency.setValueAtTime(1047, t + 0.24); gain.gain.setValueAtTime(0.12, t); gain.gain.setValueAtTime(0.12, t + 0.28); gain.gain.linearRampToValueAtTime(0, t + 0.4); osc.start(t); osc.stop(t + 0.4); break; }
      case "spring": osc.type = "sine"; osc.frequency.setValueAtTime(200, t); osc.frequency.exponentialRampToValueAtTime(800, t + 0.12); osc.frequency.exponentialRampToValueAtTime(400, t + 0.2); gain.gain.setValueAtTime(0.15, t); gain.gain.linearRampToValueAtTime(0, t + 0.2); osc.start(t); osc.stop(t + 0.2); break;
      case "land": osc.type = "triangle"; osc.frequency.setValueAtTime(120, t); osc.frequency.linearRampToValueAtTime(60, t + 0.06); gain.gain.setValueAtTime(0.08, t); gain.gain.linearRampToValueAtTime(0, t + 0.06); osc.start(t); osc.stop(t + 0.06); break;
      case "crumble": { const buf = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate); const data = buf.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) * 0.5; const noise = ctx.createBufferSource(); noise.buffer = buf; const ng = ctx.createGain(); ng.gain.setValueAtTime(0.15, t); ng.gain.linearRampToValueAtTime(0, t + 0.2); const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 800; noise.connect(f); f.connect(ng); ng.connect(ctx.destination); noise.start(t); noise.stop(t + 0.2); gain.gain.setValueAtTime(0, t); osc.start(t); osc.stop(t + 0.01); break; }
      case "roomenter": osc.type = "sine"; osc.frequency.setValueAtTime(440, t); osc.frequency.setValueAtTime(554, t + 0.1); osc.frequency.setValueAtTime(659, t + 0.2); gain.gain.setValueAtTime(0.08, t); gain.gain.linearRampToValueAtTime(0, t + 0.35); osc.start(t); osc.stop(t + 0.35); break;
      case "win": { const notes = [523, 659, 784, 1047, 784, 1047]; osc.type = "square"; for (let i = 0; i < notes.length; i++) osc.frequency.setValueAtTime(notes[i], t + i * 0.15); gain.gain.setValueAtTime(0.1, t); gain.gain.linearRampToValueAtTime(0, t + notes.length * 0.15 + 0.3); osc.start(t); osc.stop(t + notes.length * 0.15 + 0.3); break; }
      case "coin": osc.type = "sine"; osc.frequency.setValueAtTime(800, t); osc.frequency.setValueAtTime(1200, t + 0.05); gain.gain.setValueAtTime(0.1, t); gain.gain.linearRampToValueAtTime(0, t + 0.1); osc.start(t); osc.stop(t + 0.1); break;
      case "buy": osc.type = "sine"; osc.frequency.setValueAtTime(600, t); osc.frequency.setValueAtTime(800, t + 0.05); osc.frequency.setValueAtTime(1000, t + 0.1); gain.gain.setValueAtTime(0.1, t); gain.gain.linearRampToValueAtTime(0, t + 0.15); osc.start(t); osc.stop(t + 0.15); break;
      case "shield": osc.type = "sine"; osc.frequency.setValueAtTime(500, t); osc.frequency.setValueAtTime(300, t + 0.15); gain.gain.setValueAtTime(0.12, t); gain.gain.linearRampToValueAtTime(0, t + 0.2); osc.start(t); osc.stop(t + 0.2); break;
      default: gain.gain.setValueAtTime(0, t); osc.start(t); osc.stop(t + 0.01);
    }
  } catch { /* ignore */ }
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
  const [status, setStatus] = useState<"menu" | "playing" | "win" | "shop">("menu");
  const [shopTab, setShopTab] = useState<"boosters" | "cosmetics">("boosters");
  const [, forceUpdate] = useState(0);

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
    gs.deaths++; gs.screenShake = 8;
    sfx("death");
    const colors = getDeathColors(gs);
    spawnParticles(gs, p.x + PW / 2, p.y + PH / 2, colors[0], 20, 8);
    spawnParticles(gs, p.x + PW / 2, p.y + PH / 2, colors[1], 10, 6);
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
    // Clear room-scoped boosters
    gs.checkpoint = null;
    gs.doubleDashActive = false;
    gs.springBoostActive = false;
    gs.slowMoFrames = 0;
    // Keep shield across rooms
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
    };
    gsRef.current = gs;
    setStatus("playing");
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
      if (p.deadTimer <= 0) respawnPlayer(gs);
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

    // Gravity
    if (p.dashing <= 0) {
      if (p.wallDir !== 0 && p.vy > 0) p.vy = Math.min(p.vy + GRAVITY * 0.4 * slowMo, WALL_SLIDE_SPEED);
      else p.vy = Math.min(p.vy + GRAVITY * slowMo, MAX_FALL);
    }

    // Collisions
    p.x += p.vx;
    const allSolids = [...room.platforms];
    for (const c of room.crumbles) { if (c.visible) allSolids.push({ x: c.x, y: c.y, w: c.w, h: TILE }); }
    for (const plat of allSolids) { if (rectsOverlap({ x: p.x, y: p.y, w: PW, h: PH }, plat)) { if (p.vx > 0) p.x = plat.x - PW; else if (p.vx < 0) p.x = plat.x + plat.w; p.vx = 0; } }

    p.y += p.vy; p.grounded = false;
    for (const plat of allSolids) {
      if (rectsOverlap({ x: p.x, y: p.y, w: PW, h: PH }, plat)) {
        if (p.vy > 0) {
          p.y = plat.y - PH; p.grounded = true; p.canDash = true; p.dashCount = 0;
          p.hairColor = getHairColor(gs);
          if (p.vy > 4) { spawnParticles(gs, p.x + PW / 2, p.y + PH, "rgba(255,255,255,0.4)", 3); sfx("land"); }
        } else if (p.vy < 0) { p.y = plat.y + plat.h; }
        p.vy = 0;
      }
    }

    // Walls
    p.wallDir = 0;
    if (!p.grounded) {
      for (const plat of allSolids) {
        if (rectsOverlap({ x: p.x - 2, y: p.y + 2, w: 2, h: PH - 4 }, plat) && left) p.wallDir = -1;
        if (rectsOverlap({ x: p.x + PW, y: p.y + 2, w: 2, h: PH - 4 }, plat) && right) p.wallDir = 1;
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

    // Room transition
    if (p.x >= room.exitX && p.grounded) {
      gs.coins += 1; sfx("coin");
      if (gs.currentRoom < gs.rooms.length - 1) {
        enterRoom(gs, gs.currentRoom + 1); sfx("roomenter");
      } else {
        gs.coins += 5;
        gs.status = "win"; setStatus("win"); sfx("win");
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
    if (justPressed("Tab")) { gs.status = "shop"; setStatus("shop"); }

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
            <h1 className="text-5xl font-bold text-cyan-400 mb-1 tracking-widest" style={{ fontFamily: "monospace", textShadow: "0 0 20px rgba(100,200,255,0.5)" }}>SUMMIT</h1>
            <p className="text-indigo-300 mb-6 text-sm tracking-wider">REACH THE TOP</p>
            <div className="flex gap-3 mb-4">
              <button onClick={initGame} className="px-8 py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-lg rounded transition-colors" style={{ fontFamily: "monospace" }}>CLIMB</button>
              <button onClick={() => { if (!gsRef.current) initGame(); setStatus("shop"); if (gsRef.current) gsRef.current.status = "shop"; }} className="px-6 py-3 bg-yellow-600/80 hover:bg-yellow-500 text-white font-bold text-lg rounded transition-colors" style={{ fontFamily: "monospace" }}>🪙 SHOP</button>
            </div>
            <p className="text-yellow-400 text-sm mb-4" style={{ fontFamily: "monospace" }}>🪙 {loadSave().coins} coins</p>
            <div className="text-gray-500 text-xs text-center space-y-1" style={{ fontFamily: "monospace" }}>
              <p>Arrow Keys / WASD — Move · C / Space — Jump · X / Shift — Dash</p>
              <p>Tab — Shop · Q — Activate Slow-Mo · E — Place Checkpoint</p>
            </div>
          </div>
        )}

        {/* Win */}
        {status === "win" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 rounded-lg">
            <div className="mb-2 text-5xl">⛰️</div>
            <h2 className="text-4xl font-bold text-cyan-400 mb-4" style={{ fontFamily: "monospace", textShadow: "0 0 20px rgba(100,200,255,0.5)" }}>SUMMIT REACHED</h2>
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
                <button onClick={() => { setStatus("playing"); gs.status = "playing"; }} className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded">✕ CLOSE</button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-3">
              <button onClick={() => setShopTab("boosters")} className={`px-4 py-2 rounded text-sm font-bold ${shopTab === "boosters" ? "bg-cyan-600 text-white" : "bg-gray-800 text-gray-400"}`}>BOOSTERS</button>
              <button onClick={() => setShopTab("cosmetics")} className={`px-4 py-2 rounded text-sm font-bold ${shopTab === "cosmetics" ? "bg-cyan-600 text-white" : "bg-gray-800 text-gray-400"}`}>COSMETICS</button>
            </div>

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
      </div>

      <div className="flex gap-6 text-gray-600 text-xs" style={{ fontFamily: "monospace" }}>
        <span>Arrows/WASD: Move</span>
        <span>C/Space: Jump</span>
        <span>X/Shift: Dash</span>
        <span>Tab: Shop</span>
        <span>Q: Slow-Mo</span>
        <span>E: Checkpoint</span>
      </div>
    </div>
  );
}
