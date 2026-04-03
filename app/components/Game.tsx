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
const JUMP_CUT = -3; // vy cap when releasing jump early
const WALL_SLIDE_SPEED = 1.2;
const WALL_JUMP_H = 5;
const WALL_JUMP_V = -9;
const DASH_SPEED = 10;
const DASH_DURATION = 8; // frames
const DASH_COOLDOWN = 4;
const COYOTE_FRAMES = 6;
const JUMP_BUFFER_FRAMES = 6;
const CRUMBLE_DELAY = 18;
const CRUMBLE_RESPAWN = 180;
const SPRING_FORCE = -13;
const PW = 12; // player width
const PH = 16; // player height
const HAIR_COUNT = 5;

// ─── Types ───────────────────────────────────────────────────────────────────
interface Rect { x: number; y: number; w: number; h: number }

interface Spike { x: number; y: number; dir: "up" | "down" | "left" | "right" }

interface Strawberry { x: number; y: number; collected: boolean }

interface Spring { x: number; y: number; activated: number }

interface CrumblePlatform {
  x: number; y: number; w: number;
  timer: number; // >0 means crumbling countdown
  respawnTimer: number; // >0 means broken, counting to respawn
  visible: boolean;
}

interface Room {
  platforms: Rect[];
  spikes: Spike[];
  strawberries: Strawberry[];
  springs: Spring[];
  crumbles: CrumblePlatform[];
  spawn: { x: number; y: number };
  exitX: number; // right edge trigger
}

interface HairNode { x: number; y: number }

interface Player {
  x: number; y: number;
  vx: number; vy: number;
  grounded: boolean;
  wallDir: number; // -1 left wall, 1 right wall, 0 none
  facing: number;
  canDash: boolean;
  dashing: number; // frames remaining
  dashDir: { x: number; y: number };
  dashCooldown: number;
  coyoteTimer: number;
  jumpBuffer: number;
  jumpHeld: boolean;
  dead: boolean;
  deadTimer: number;
  hair: HairNode[];
  hairColor: string;
}

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; color: string; size: number;
}

interface Snowflake {
  x: number; y: number; speed: number; drift: number; size: number;
}

interface GameState {
  player: Player;
  rooms: Room[];
  currentRoom: number;
  deaths: number;
  strawberriesCollected: number;
  totalStrawberries: number;
  particles: Particle[];
  snow: Snowflake[];
  status: "menu" | "playing" | "win";
  screenShake: number;
  time: number;
}

// ─── Room Definitions ────────────────────────────────────────────────────────
function createRooms(): Room[] {
  const T = TILE;
  return [
    // Room 0: Tutorial - basic movement
    {
      platforms: [
        { x: 0, y: H - T, w: W, h: T }, // floor
        { x: 0, y: 0, w: T, h: H }, // left wall
        { x: W - T, y: 0, w: T, h: H }, // right wall
        { x: 0, y: 0, w: W, h: T }, // ceiling
        { x: 200, y: 380, w: 100, h: T },
        { x: 400, y: 320, w: 100, h: T },
        { x: 580, y: 260, w: 120, h: T },
      ],
      spikes: [],
      strawberries: [
        { x: 250, y: 355, collected: false },
        { x: 640, y: 235, collected: false },
      ],
      springs: [],
      crumbles: [],
      spawn: { x: 50, y: H - T - PH - 2 },
      exitX: W - T - PW - 2,
    },
    // Room 1: Introduce spikes
    {
      platforms: [
        { x: 0, y: H - T, w: 200, h: T },
        { x: 0, y: 0, w: T, h: H },
        { x: W - T, y: 0, w: T, h: H },
        { x: 0, y: 0, w: W, h: T },
        { x: 300, y: H - T, w: 200, h: T },
        { x: 600, y: H - T, w: 200, h: T },
        { x: 150, y: 360, w: 80, h: T },
        { x: 420, y: 300, w: 80, h: T },
        { x: 650, y: 360, w: 80, h: T },
      ],
      spikes: [
        // Pit spikes
        { x: 210, y: H - T, dir: "up" },
        { x: 230, y: H - T, dir: "up" },
        { x: 250, y: H - T, dir: "up" },
        { x: 270, y: H - T, dir: "up" },
        { x: 290, y: H - T, dir: "up" },
        { x: 510, y: H - T, dir: "up" },
        { x: 530, y: H - T, dir: "up" },
        { x: 550, y: H - T, dir: "up" },
        { x: 570, y: H - T, dir: "up" },
        { x: 590, y: H - T, dir: "up" },
      ],
      strawberries: [
        { x: 450, y: 270, collected: false },
      ],
      springs: [],
      crumbles: [],
      spawn: { x: 40, y: H - T - PH - 2 },
      exitX: W - T - PW - 2,
    },
    // Room 2: Wall jumping
    {
      platforms: [
        { x: 0, y: H - T, w: W, h: T },
        { x: 0, y: 0, w: T, h: H },
        { x: W - T, y: 0, w: T, h: H },
        { x: 0, y: 0, w: W, h: T },
        // Left shaft walls
        { x: 180, y: 160, w: T, h: 340 },
        { x: 300, y: 100, w: T, h: 340 },
        // Top platform
        { x: 300, y: 100, w: 200, h: T },
        { x: 550, y: 150, w: 100, h: T },
        { x: 650, y: H - 120, w: 130, h: T },
      ],
      spikes: [
        // Bottom of shaft
        { x: 200, y: H - T, dir: "up" },
        { x: 220, y: H - T, dir: "up" },
        { x: 240, y: H - T, dir: "up" },
        { x: 260, y: H - T, dir: "up" },
        { x: 280, y: H - T, dir: "up" },
      ],
      strawberries: [
        { x: 240, y: 180, collected: false },
        { x: 700, y: H - 145, collected: false },
      ],
      springs: [],
      crumbles: [],
      spawn: { x: 50, y: H - T - PH - 2 },
      exitX: W - T - PW - 2,
    },
    // Room 3: Dash introduction
    {
      platforms: [
        { x: 0, y: H - T, w: 160, h: T },
        { x: 0, y: 0, w: T, h: H },
        { x: W - T, y: 0, w: T, h: H },
        { x: 0, y: 0, w: W, h: T },
        { x: 350, y: 350, w: 100, h: T },
        { x: 550, y: 250, w: 100, h: T },
        { x: 650, y: H - T, w: 150, h: T },
      ],
      spikes: [
        { x: 170, y: H - T, dir: "up" },
        { x: 190, y: H - T, dir: "up" },
        { x: 210, y: H - T, dir: "up" },
        { x: 230, y: H - T, dir: "up" },
        { x: 250, y: H - T, dir: "up" },
        { x: 270, y: H - T, dir: "up" },
        { x: 290, y: H - T, dir: "up" },
        { x: 310, y: H - T, dir: "up" },
        { x: 330, y: H - T, dir: "up" },
        { x: 350, y: H - T, dir: "up" },
        { x: 370, y: H - T, dir: "up" },
        { x: 390, y: H - T, dir: "up" },
        { x: 410, y: H - T, dir: "up" },
        { x: 430, y: H - T, dir: "up" },
        { x: 450, y: H - T, dir: "up" },
        { x: 470, y: H - T, dir: "up" },
        { x: 490, y: H - T, dir: "up" },
        { x: 510, y: H - T, dir: "up" },
        { x: 530, y: H - T, dir: "up" },
        { x: 550, y: H - T, dir: "up" },
        { x: 570, y: H - T, dir: "up" },
        { x: 590, y: H - T, dir: "up" },
        { x: 610, y: H - T, dir: "up" },
        { x: 630, y: H - T, dir: "up" },
      ],
      strawberries: [
        { x: 590, y: 220, collected: false },
      ],
      springs: [],
      crumbles: [],
      spawn: { x: 50, y: H - T - PH - 2 },
      exitX: W - T - PW - 2,
    },
    // Room 4: Springs
    {
      platforms: [
        { x: 0, y: H - T, w: 120, h: T },
        { x: 0, y: 0, w: T, h: H },
        { x: W - T, y: 0, w: T, h: H },
        { x: 0, y: 0, w: W, h: T },
        { x: 250, y: H - T, w: 80, h: T },
        { x: 500, y: 350, w: 80, h: T },
        { x: 300, y: 180, w: 100, h: T },
        { x: 600, y: H - T, w: 200, h: T },
      ],
      spikes: [
        { x: 130, y: H - T, dir: "up" },
        { x: 150, y: H - T, dir: "up" },
        { x: 170, y: H - T, dir: "up" },
        { x: 190, y: H - T, dir: "up" },
        { x: 210, y: H - T, dir: "up" },
        { x: 230, y: H - T, dir: "up" },
        { x: 340, y: H - T, dir: "up" },
        { x: 360, y: H - T, dir: "up" },
        { x: 380, y: H - T, dir: "up" },
        { x: 400, y: H - T, dir: "up" },
        { x: 420, y: H - T, dir: "up" },
        { x: 440, y: H - T, dir: "up" },
        { x: 460, y: H - T, dir: "up" },
        { x: 480, y: H - T, dir: "up" },
        { x: 500, y: H - T, dir: "up" },
        { x: 520, y: H - T, dir: "up" },
        { x: 540, y: H - T, dir: "up" },
        { x: 560, y: H - T, dir: "up" },
        { x: 580, y: H - T, dir: "up" },
      ],
      strawberries: [
        { x: 340, y: 150, collected: false },
      ],
      springs: [
        { x: 275, y: H - T - 12, activated: 0 },
        { x: 525, y: 350 - 12, activated: 0 },
      ],
      crumbles: [],
      spawn: { x: 40, y: H - T - PH - 2 },
      exitX: W - T - PW - 2,
    },
    // Room 5: Crumbling platforms
    {
      platforms: [
        { x: 0, y: H - T, w: 100, h: T },
        { x: 0, y: 0, w: T, h: H },
        { x: W - T, y: 0, w: T, h: H },
        { x: 0, y: 0, w: W, h: T },
        { x: 680, y: H - T, w: 120, h: T },
      ],
      spikes: [
        { x: 110, y: H - T, dir: "up" },
        { x: 130, y: H - T, dir: "up" },
        { x: 150, y: H - T, dir: "up" },
        { x: 170, y: H - T, dir: "up" },
        { x: 190, y: H - T, dir: "up" },
        { x: 210, y: H - T, dir: "up" },
        { x: 230, y: H - T, dir: "up" },
        { x: 250, y: H - T, dir: "up" },
        { x: 270, y: H - T, dir: "up" },
        { x: 290, y: H - T, dir: "up" },
        { x: 310, y: H - T, dir: "up" },
        { x: 330, y: H - T, dir: "up" },
        { x: 350, y: H - T, dir: "up" },
        { x: 370, y: H - T, dir: "up" },
        { x: 390, y: H - T, dir: "up" },
        { x: 410, y: H - T, dir: "up" },
        { x: 430, y: H - T, dir: "up" },
        { x: 450, y: H - T, dir: "up" },
        { x: 470, y: H - T, dir: "up" },
        { x: 490, y: H - T, dir: "up" },
        { x: 510, y: H - T, dir: "up" },
        { x: 530, y: H - T, dir: "up" },
        { x: 550, y: H - T, dir: "up" },
        { x: 570, y: H - T, dir: "up" },
        { x: 590, y: H - T, dir: "up" },
        { x: 610, y: H - T, dir: "up" },
        { x: 630, y: H - T, dir: "up" },
        { x: 650, y: H - T, dir: "up" },
        { x: 670, y: H - T, dir: "up" },
      ],
      strawberries: [
        { x: 400, y: 300, collected: false },
      ],
      springs: [],
      crumbles: [
        { x: 150, y: 400, w: 60, timer: 0, respawnTimer: 0, visible: true },
        { x: 280, y: 350, w: 60, timer: 0, respawnTimer: 0, visible: true },
        { x: 410, y: 330, w: 60, timer: 0, respawnTimer: 0, visible: true },
        { x: 530, y: 360, w: 60, timer: 0, respawnTimer: 0, visible: true },
        { x: 630, y: 300, w: 60, timer: 0, respawnTimer: 0, visible: true },
      ],
      spawn: { x: 40, y: H - T - PH - 2 },
      exitX: W - T - PW - 2,
    },
    // Room 6: Combining everything
    {
      platforms: [
        { x: 0, y: H - T, w: 100, h: T },
        { x: 0, y: 0, w: T, h: H },
        { x: W - T, y: 0, w: T, h: H },
        { x: 0, y: 0, w: W, h: T },
        { x: 200, y: 300, w: T, h: 200 }, // vertical wall for wall jumping
        { x: 320, y: 200, w: T, h: 200 },
        { x: 400, y: 120, w: 200, h: T },
        { x: 650, y: 200, w: T, h: 80 },
        { x: 650, y: H - T, w: 150, h: T },
        { x: 650, y: 350, w: 130, h: T },
      ],
      spikes: [
        { x: 110, y: H - T, dir: "up" },
        { x: 130, y: H - T, dir: "up" },
        { x: 150, y: H - T, dir: "up" },
        { x: 170, y: H - T, dir: "up" },
        { x: 190, y: H - T, dir: "up" },
        { x: 330, y: H - T, dir: "up" },
        { x: 350, y: H - T, dir: "up" },
        { x: 370, y: H - T, dir: "up" },
        { x: 390, y: H - T, dir: "up" },
        { x: 410, y: H - T, dir: "up" },
        { x: 430, y: H - T, dir: "up" },
        { x: 450, y: H - T, dir: "up" },
        { x: 470, y: H - T, dir: "up" },
        { x: 490, y: H - T, dir: "up" },
        { x: 510, y: H - T, dir: "up" },
        { x: 530, y: H - T, dir: "up" },
        { x: 550, y: H - T, dir: "up" },
        { x: 570, y: H - T, dir: "up" },
        { x: 590, y: H - T, dir: "up" },
        { x: 610, y: H - T, dir: "up" },
        { x: 630, y: H - T, dir: "up" },
        // Ceiling spikes above wall jump shaft
        { x: 220, y: T, dir: "down" },
        { x: 240, y: T, dir: "down" },
        { x: 260, y: T, dir: "down" },
        { x: 280, y: T, dir: "down" },
        { x: 300, y: T, dir: "down" },
      ],
      strawberries: [
        { x: 260, y: 220, collected: false },
        { x: 500, y: 90, collected: false },
      ],
      springs: [
        { x: 700, y: 350 - 12, activated: 0 },
      ],
      crumbles: [],
      spawn: { x: 40, y: H - T - PH - 2 },
      exitX: W - T - PW - 2,
    },
    // Room 7: Final challenge
    {
      platforms: [
        { x: 0, y: H - T, w: 80, h: T },
        { x: 0, y: 0, w: T, h: H },
        { x: W - T, y: 0, w: T, h: H },
        { x: 0, y: 0, w: W, h: T },
        // Stepping stones
        { x: 160, y: 420, w: 40, h: T },
        { x: 280, y: 360, w: 40, h: T },
        // Walls for wall jump section
        { x: 380, y: 180, w: T, h: 200 },
        { x: 480, y: 120, w: T, h: 260 },
        // Final platform
        { x: 550, y: 100, w: 230, h: T },
        { x: 550, y: 100, w: T, h: 400 },
        { x: 650, y: 300, w: 130, h: T },
      ],
      spikes: [
        { x: 90, y: H - T, dir: "up" },
        { x: 110, y: H - T, dir: "up" },
        { x: 130, y: H - T, dir: "up" },
        { x: 150, y: H - T, dir: "up" },
        { x: 210, y: H - T, dir: "up" },
        { x: 230, y: H - T, dir: "up" },
        { x: 250, y: H - T, dir: "up" },
        { x: 270, y: H - T, dir: "up" },
        { x: 330, y: H - T, dir: "up" },
        { x: 350, y: H - T, dir: "up" },
        { x: 370, y: H - T, dir: "up" },
        { x: 500, y: H - T, dir: "up" },
        { x: 520, y: H - T, dir: "up" },
        { x: 540, y: H - T, dir: "up" },
        // Wall spikes
        { x: 380, y: 350, dir: "right" },
        { x: 380, y: 330, dir: "right" },
        { x: 480, y: 200, dir: "left" },
        { x: 480, y: 220, dir: "left" },
      ],
      strawberries: [
        { x: 430, y: 200, collected: false },
        { x: 700, y: 270, collected: false },
      ],
      springs: [
        { x: 290, y: 360 - 12, activated: 0 },
      ],
      crumbles: [
        { x: 160, y: 420, w: 40, timer: 0, respawnTimer: 0, visible: true },
      ],
      spawn: { x: 30, y: H - T - PH - 2 },
      exitX: W - T - PW - 2,
    },
  ];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function rectsOverlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function spikeHitbox(s: Spike): { x: number; y: number; w: number; h: number } {
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
    flakes.push({
      x: Math.random() * W,
      y: Math.random() * H,
      speed: 0.3 + Math.random() * 0.8,
      drift: Math.random() * 0.5 - 0.25,
      size: 1 + Math.random() * 2,
    });
  }
  return flakes;
}

function createPlayer(spawn: { x: number; y: number }): Player {
  const hair: HairNode[] = [];
  for (let i = 0; i < HAIR_COUNT; i++) {
    hair.push({ x: spawn.x + PW / 2, y: spawn.y });
  }
  return {
    x: spawn.x, y: spawn.y, vx: 0, vy: 0,
    grounded: false, wallDir: 0, facing: 1,
    canDash: true, dashing: 0, dashDir: { x: 0, y: 0 }, dashCooldown: 0,
    coyoteTimer: 0, jumpBuffer: 0, jumpHeld: false,
    dead: false, deadTimer: 0,
    hair, hairColor: "#E84855",
  };
}

// ─── Sound Effects (Web Audio API) ───────────────────────────────────────────
let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

function sfx(type: "jump" | "walljump" | "dash" | "death" | "strawberry" | "spring" | "land" | "crumble" | "roomenter" | "win") {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    const t = ctx.currentTime;

    switch (type) {
      case "jump":
        osc.type = "square";
        osc.frequency.setValueAtTime(280, t);
        osc.frequency.linearRampToValueAtTime(560, t + 0.08);
        gain.gain.setValueAtTime(0.12, t);
        gain.gain.linearRampToValueAtTime(0, t + 0.1);
        osc.start(t); osc.stop(t + 0.1);
        break;

      case "walljump":
        osc.type = "square";
        osc.frequency.setValueAtTime(200, t);
        osc.frequency.linearRampToValueAtTime(600, t + 0.06);
        osc.frequency.linearRampToValueAtTime(400, t + 0.12);
        gain.gain.setValueAtTime(0.12, t);
        gain.gain.linearRampToValueAtTime(0, t + 0.12);
        osc.start(t); osc.stop(t + 0.12);
        break;

      case "dash": {
        // Whoosh noise
        const buf = ctx.createBuffer(1, ctx.sampleRate * 0.15, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
          data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buf;
        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.15, t);
        noiseGain.gain.linearRampToValueAtTime(0, t + 0.15);
        const filter = ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.setValueAtTime(2000, t);
        filter.frequency.linearRampToValueAtTime(500, t + 0.15);
        filter.Q.value = 2;
        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(ctx.destination);
        noise.start(t); noise.stop(t + 0.15);
        // Tonal component
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(150, t);
        osc.frequency.linearRampToValueAtTime(80, t + 0.1);
        gain.gain.setValueAtTime(0.08, t);
        gain.gain.linearRampToValueAtTime(0, t + 0.1);
        osc.start(t); osc.stop(t + 0.1);
        break;
      }

      case "death": {
        // Descending crunch
        osc.type = "square";
        osc.frequency.setValueAtTime(400, t);
        osc.frequency.linearRampToValueAtTime(80, t + 0.3);
        gain.gain.setValueAtTime(0.15, t);
        gain.gain.linearRampToValueAtTime(0, t + 0.3);
        osc.start(t); osc.stop(t + 0.3);
        // Noise burst
        const buf = ctx.createBuffer(1, ctx.sampleRate * 0.12, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
        const noise = ctx.createBufferSource();
        noise.buffer = buf;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.2, t);
        ng.gain.linearRampToValueAtTime(0, t + 0.12);
        noise.connect(ng); ng.connect(ctx.destination);
        noise.start(t); noise.stop(t + 0.12);
        break;
      }

      case "strawberry": {
        // Sparkly ascending chime
        osc.type = "sine";
        osc.frequency.setValueAtTime(523, t); // C5
        osc.frequency.setValueAtTime(659, t + 0.08); // E5
        osc.frequency.setValueAtTime(784, t + 0.16); // G5
        osc.frequency.setValueAtTime(1047, t + 0.24); // C6
        gain.gain.setValueAtTime(0.12, t);
        gain.gain.setValueAtTime(0.12, t + 0.28);
        gain.gain.linearRampToValueAtTime(0, t + 0.4);
        osc.start(t); osc.stop(t + 0.4);
        // Harmony
        const osc2 = ctx.createOscillator();
        const g2 = ctx.createGain();
        osc2.connect(g2); g2.connect(ctx.destination);
        osc2.type = "sine";
        osc2.frequency.setValueAtTime(659, t + 0.08);
        osc2.frequency.setValueAtTime(784, t + 0.16);
        osc2.frequency.setValueAtTime(1047, t + 0.24);
        osc2.frequency.setValueAtTime(1319, t + 0.32);
        g2.gain.setValueAtTime(0.06, t + 0.08);
        g2.gain.linearRampToValueAtTime(0, t + 0.45);
        osc2.start(t + 0.08); osc2.stop(t + 0.45);
        break;
      }

      case "spring":
        osc.type = "sine";
        osc.frequency.setValueAtTime(200, t);
        osc.frequency.exponentialRampToValueAtTime(800, t + 0.12);
        osc.frequency.exponentialRampToValueAtTime(400, t + 0.2);
        gain.gain.setValueAtTime(0.15, t);
        gain.gain.linearRampToValueAtTime(0, t + 0.2);
        osc.start(t); osc.stop(t + 0.2);
        break;

      case "land":
        osc.type = "triangle";
        osc.frequency.setValueAtTime(120, t);
        osc.frequency.linearRampToValueAtTime(60, t + 0.06);
        gain.gain.setValueAtTime(0.08, t);
        gain.gain.linearRampToValueAtTime(0, t + 0.06);
        osc.start(t); osc.stop(t + 0.06);
        break;

      case "crumble": {
        const buf = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) * 0.5;
        const noise = ctx.createBufferSource();
        noise.buffer = buf;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.15, t);
        ng.gain.linearRampToValueAtTime(0, t + 0.2);
        const filt = ctx.createBiquadFilter();
        filt.type = "lowpass"; filt.frequency.value = 800;
        noise.connect(filt); filt.connect(ng); ng.connect(ctx.destination);
        noise.start(t); noise.stop(t + 0.2);
        gain.gain.setValueAtTime(0, t); // silence the main osc
        osc.start(t); osc.stop(t + 0.01);
        break;
      }

      case "roomenter":
        osc.type = "sine";
        osc.frequency.setValueAtTime(440, t);
        osc.frequency.setValueAtTime(554, t + 0.1);
        osc.frequency.setValueAtTime(659, t + 0.2);
        gain.gain.setValueAtTime(0.08, t);
        gain.gain.linearRampToValueAtTime(0, t + 0.35);
        osc.start(t); osc.stop(t + 0.35);
        break;

      case "win": {
        // Victory fanfare
        const notes = [523, 659, 784, 1047, 784, 1047];
        const dur = 0.15;
        osc.type = "square";
        for (let i = 0; i < notes.length; i++) {
          osc.frequency.setValueAtTime(notes[i], t + i * dur);
        }
        gain.gain.setValueAtTime(0.1, t);
        gain.gain.setValueAtTime(0.1, t + notes.length * dur - 0.05);
        gain.gain.linearRampToValueAtTime(0, t + notes.length * dur + 0.3);
        osc.start(t); osc.stop(t + notes.length * dur + 0.3);
        // Harmony layer
        const osc2 = ctx.createOscillator();
        const g2 = ctx.createGain();
        osc2.connect(g2); g2.connect(ctx.destination);
        osc2.type = "sine";
        for (let i = 0; i < notes.length; i++) {
          osc2.frequency.setValueAtTime(notes[i] * 0.5, t + i * dur);
        }
        g2.gain.setValueAtTime(0.06, t);
        g2.gain.linearRampToValueAtTime(0, t + notes.length * dur + 0.3);
        osc2.start(t); osc2.stop(t + notes.length * dur + 0.3);
        break;
      }
    }
  } catch {
    // Audio not available — silently ignore
  }
}

// ─── Drawing ─────────────────────────────────────────────────────────────────
function drawBg(ctx: CanvasRenderingContext2D, roomIdx: number, time: number) {
  // Gradient shifts per room for variety
  const hueShift = roomIdx * 15;
  const r1 = 10 + Math.sin(hueShift * 0.02) * 5;
  const g1 = 10 + roomIdx * 2;
  const b1 = 30 + roomIdx * 5;
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, `rgb(${r1},${g1},${Math.min(b1, 60)})`);
  grad.addColorStop(1, `rgb(${r1 + 10},${g1 + 5},${Math.min(b1 + 20, 80)})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Mountains
  ctx.fillStyle = `rgba(20,20,50,0.6)`;
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 40) {
    const h = 150 + Math.sin((x + roomIdx * 200) * 0.008) * 80 + Math.sin((x + roomIdx * 100) * 0.02) * 30;
    ctx.lineTo(x, H - h);
  }
  ctx.lineTo(W, H);
  ctx.fill();
}

function drawSnow(ctx: CanvasRenderingContext2D, snow: Snowflake[]) {
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  for (const s of snow) {
    ctx.fillRect(s.x, s.y, s.size, s.size);
  }
}

function drawPlatforms(ctx: CanvasRenderingContext2D, platforms: Rect[]) {
  for (const p of platforms) {
    // Main tile
    ctx.fillStyle = "#2d3a4a";
    ctx.fillRect(p.x, p.y, p.w, p.h);
    // Top edge highlight
    ctx.fillStyle = "#3d4e63";
    ctx.fillRect(p.x, p.y, p.w, 2);
    // Inner subtle grid
    ctx.fillStyle = "#253242";
    for (let tx = p.x; tx < p.x + p.w; tx += TILE) {
      ctx.fillRect(tx, p.y, 1, p.h);
    }
    for (let ty = p.y; ty < p.y + p.h; ty += TILE) {
      ctx.fillRect(p.x, ty, p.w, 1);
    }
  }
}

function drawCrumbles(ctx: CanvasRenderingContext2D, crumbles: CrumblePlatform[], time: number) {
  for (const c of crumbles) {
    if (!c.visible) continue;
    const shaking = c.timer > 0;
    const ox = shaking ? Math.sin(time * 0.8) * 2 : 0;
    ctx.fillStyle = shaking ? "#5a4a3a" : "#4a3a2a";
    ctx.fillRect(c.x + ox, c.y, c.w, TILE);
    // Cracks
    ctx.strokeStyle = "#3a2a1a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(c.x + ox + c.w * 0.3, c.y);
    ctx.lineTo(c.x + ox + c.w * 0.4, c.y + TILE);
    ctx.moveTo(c.x + ox + c.w * 0.7, c.y);
    ctx.lineTo(c.x + ox + c.w * 0.6, c.y + TILE);
    ctx.stroke();
  }
}

function drawSpikes(ctx: CanvasRenderingContext2D, spikes: Spike[]) {
  ctx.fillStyle = "#c0392b";
  for (const s of spikes) {
    ctx.beginPath();
    switch (s.dir) {
      case "up":
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x + 10, s.y - 10);
        ctx.lineTo(s.x + 20, s.y);
        break;
      case "down":
        ctx.moveTo(s.x, s.y + TILE);
        ctx.lineTo(s.x + 10, s.y + TILE + 10);
        ctx.lineTo(s.x + 20, s.y + TILE);
        break;
      case "left":
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - 10, s.y + 10);
        ctx.lineTo(s.x, s.y + 20);
        break;
      case "right":
        ctx.moveTo(s.x + TILE, s.y);
        ctx.lineTo(s.x + TILE + 10, s.y + 10);
        ctx.lineTo(s.x + TILE, s.y + 20);
        break;
    }
    ctx.fill();
  }
}

function drawStrawberries(ctx: CanvasRenderingContext2D, strawberries: Strawberry[], time: number) {
  for (const s of strawberries) {
    if (s.collected) continue;
    const bob = Math.sin(time * 0.06) * 3;
    const sx = s.x;
    const sy = s.y + bob;

    // Berry body
    ctx.fillStyle = "#e84855";
    ctx.beginPath();
    ctx.arc(sx, sy, 6, 0, Math.PI * 2);
    ctx.fill();

    // Seeds
    ctx.fillStyle = "#ffb3b8";
    ctx.fillRect(sx - 2, sy - 1, 2, 2);
    ctx.fillRect(sx + 1, sy + 1, 2, 2);

    // Leaf
    ctx.fillStyle = "#2ecc71";
    ctx.beginPath();
    ctx.moveTo(sx, sy - 6);
    ctx.lineTo(sx - 4, sy - 10);
    ctx.lineTo(sx + 4, sy - 10);
    ctx.closePath();
    ctx.fill();

    // Glow
    ctx.fillStyle = "rgba(232, 72, 85, 0.15)";
    ctx.beginPath();
    ctx.arc(sx, sy, 12, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSprings(ctx: CanvasRenderingContext2D, springs: Spring[]) {
  for (const s of springs) {
    const compressed = s.activated > 0;
    const baseY = compressed ? s.y + 6 : s.y;
    const springH = compressed ? 6 : 12;

    // Base
    ctx.fillStyle = "#7f8c8d";
    ctx.fillRect(s.x - 8, s.y + 8, 36, 4);

    // Coil
    ctx.strokeStyle = "#f1c40f";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const y = baseY + (springH / 4) * i;
      ctx.moveTo(s.x - 4, y);
      ctx.lineTo(s.x + 24, y + springH / 8);
    }
    ctx.stroke();

    // Top pad
    ctx.fillStyle = "#f39c12";
    ctx.fillRect(s.x - 6, baseY - 2, 32, 4);
  }
}

function drawPlayer2(ctx: CanvasRenderingContext2D, player: Player, time: number) {
  if (player.dead) return;

  // Hair trail
  for (let i = player.hair.length - 1; i >= 0; i--) {
    const h = player.hair[i];
    const size = 6 - i * 0.6;
    ctx.fillStyle = player.hairColor;
    ctx.globalAlpha = 1 - i * 0.15;
    ctx.beginPath();
    ctx.arc(h.x, h.y, size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const px = player.x;
  const py = player.y;

  ctx.save();
  ctx.translate(px + PW / 2, py + PH / 2);

  // Squash/stretch
  let sx = 1, sy = 1;
  if (player.dashing > 0) {
    sx = 1.3; sy = 0.7;
  } else if (!player.grounded && player.vy < -2) {
    sx = 0.85; sy = 1.15;
  } else if (!player.grounded && player.vy > 2) {
    sx = 1.1; sy = 0.9;
  }
  ctx.scale(player.facing * sx, sy);

  // Body
  ctx.fillStyle = "#4a6fa5";
  ctx.fillRect(-PW / 2, -PH / 2, PW, PH);

  // Face
  ctx.fillStyle = "#ffd6ba";
  ctx.fillRect(-PW / 2 + 1, -PH / 2 + 1, PW - 2, 7);

  // Eyes
  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(1, -PH / 2 + 3, 2, 2);

  // Hair on top
  ctx.fillStyle = player.hairColor;
  ctx.fillRect(-PW / 2 - 1, -PH / 2 - 2, PW + 2, 4);

  ctx.restore();
}

function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]) {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

function drawHUD(ctx: CanvasRenderingContext2D, deaths: number, berries: number, total: number, room: number, totalRooms: number) {
  ctx.font = "bold 14px monospace";

  // Deaths
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillRect(8, 8, 90, 24);
  ctx.fillStyle = "#c0392b";
  ctx.fillText(`💀 ${deaths}`, 16, 25);

  // Strawberries
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillRect(8, 36, 90, 24);
  ctx.fillStyle = "#e84855";
  ctx.fillText(`🍓 ${berries}/${total}`, 16, 53);

  // Room
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillRect(W - 98, 8, 90, 24);
  ctx.fillStyle = "#7f8fa6";
  ctx.fillText(`${room + 1} / ${totalRooms}`, W - 82, 25);
}

// ─── Game Component ──────────────────────────────────────────────────────────
export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gsRef = useRef<GameState | null>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const prevKeysRef = useRef<Set<string>>(new Set());
  const animRef = useRef<number>(0);
  const [status, setStatus] = useState<"menu" | "playing" | "win">("menu");

  const justPressed = useCallback((key: string) => {
    return keysRef.current.has(key) && !prevKeysRef.current.has(key);
  }, []);

  const spawnParticles = useCallback((gs: GameState, x: number, y: number, color: string, count: number, spread = 4) => {
    for (let i = 0; i < count; i++) {
      gs.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * spread,
        vy: (Math.random() - 0.5) * spread - 1,
        life: 1, color,
        size: 1 + Math.random() * 3,
      });
    }
  }, []);

  const killPlayer = useCallback((gs: GameState) => {
    const p = gs.player;
    p.dead = true;
    p.deadTimer = 20;
    gs.deaths++;
    gs.screenShake = 8;
    sfx("death");
    spawnParticles(gs, p.x + PW / 2, p.y + PH / 2, p.hairColor, 20, 8);
    spawnParticles(gs, p.x + PW / 2, p.y + PH / 2, "#fff", 10, 6);
  }, [spawnParticles]);

  const respawnPlayer = useCallback((gs: GameState) => {
    const room = gs.rooms[gs.currentRoom];
    gs.player = createPlayer(room.spawn);
    // Reset crumbles
    for (const c of room.crumbles) {
      c.timer = 0;
      c.respawnTimer = 0;
      c.visible = true;
    }
    // Reset springs
    for (const s of room.springs) {
      s.activated = 0;
    }
  }, []);

  const enterRoom = useCallback((gs: GameState, roomIdx: number) => {
    gs.currentRoom = roomIdx;
    const room = gs.rooms[roomIdx];
    gs.player = createPlayer(room.spawn);
  }, []);

  const initGame = useCallback(() => {
    const rooms = createRooms();
    let total = 0;
    for (const r of rooms) total += r.strawberries.length;
    const gs: GameState = {
      player: createPlayer(rooms[0].spawn),
      rooms,
      currentRoom: 0,
      deaths: 0,
      strawberriesCollected: 0,
      totalStrawberries: total,
      particles: [],
      snow: createSnow(),
      status: "playing",
      screenShake: 0,
      time: 0,
    };
    gsRef.current = gs;
    setStatus("playing");
  }, []);

  const update = useCallback(() => {
    const gs = gsRef.current;
    if (!gs || gs.status !== "playing") return;

    gs.time++;
    const p = gs.player;
    const room = gs.rooms[gs.currentRoom];
    const keys = keysRef.current;

    // ── Snow ──
    for (const s of gs.snow) {
      s.y += s.speed;
      s.x += s.drift + Math.sin(gs.time * 0.01 + s.x) * 0.2;
      if (s.y > H) { s.y = -5; s.x = Math.random() * W; }
      if (s.x > W) s.x = 0;
      if (s.x < 0) s.x = W;
    }

    // ── Screen shake decay ──
    if (gs.screenShake > 0) gs.screenShake -= 0.5;

    // ── Death timer ──
    if (p.dead) {
      p.deadTimer--;
      if (p.deadTimer <= 0) {
        respawnPlayer(gs);
      }
      // Update particles even when dead
      gs.particles = gs.particles.filter(part => {
        part.x += part.vx; part.y += part.vy; part.vy += 0.1; part.life -= 0.04;
        return part.life > 0;
      });
      prevKeysRef.current = new Set(keys);
      return;
    }

    // ── Input ──
    const left = keys.has("ArrowLeft") || keys.has("a");
    const right = keys.has("ArrowRight") || keys.has("d");
    const up = keys.has("ArrowUp") || keys.has("w");
    const down = keys.has("ArrowDown") || keys.has("s");
    const jumpBtn = keys.has(" ") || keys.has("c") || keys.has("ArrowUp") || keys.has("w");
    const dashBtn = justPressed("Shift") || justPressed("x") || justPressed("z");

    // ── Horizontal movement ──
    if (p.dashing <= 0) {
      if (left) { p.vx = -PLAYER_SPEED; p.facing = -1; }
      else if (right) { p.vx = PLAYER_SPEED; p.facing = 1; }
      else { p.vx *= 0.65; }
    }

    // ── Coyote & jump buffer ──
    if (p.grounded) {
      p.coyoteTimer = COYOTE_FRAMES;
    } else {
      p.coyoteTimer = Math.max(0, p.coyoteTimer - 1);
    }

    if (justPressed(" ") || justPressed("c") || justPressed("ArrowUp") || justPressed("w")) {
      p.jumpBuffer = JUMP_BUFFER_FRAMES;
    } else {
      p.jumpBuffer = Math.max(0, p.jumpBuffer - 1);
    }

    // ── Jump ──
    if (p.dashing <= 0) {
      if (p.jumpBuffer > 0 && p.coyoteTimer > 0) {
        p.vy = JUMP_FORCE;
        p.grounded = false;
        p.coyoteTimer = 0;
        p.jumpBuffer = 0;
        p.jumpHeld = true;
        sfx("jump");
        spawnParticles(gs, p.x + PW / 2, p.y + PH, "rgba(255,255,255,0.5)", 4);
      } else if (p.jumpBuffer > 0 && p.wallDir !== 0) {
        // Wall jump
        p.vx = -p.wallDir * WALL_JUMP_H;
        p.vy = WALL_JUMP_V;
        p.facing = -p.wallDir;
        p.wallDir = 0;
        p.jumpBuffer = 0;
        p.jumpHeld = true;
        p.canDash = true;
        sfx("walljump");
        spawnParticles(gs, p.x + (p.facing < 0 ? PW : 0), p.y + PH / 2, "rgba(255,255,255,0.5)", 5);
      }

      // Variable jump height
      if (!jumpBtn && p.vy < JUMP_CUT && p.jumpHeld) {
        p.vy = JUMP_CUT;
        p.jumpHeld = false;
      }
    }

    // ── Dash ──
    if (dashBtn && p.canDash && p.dashing <= 0 && p.dashCooldown <= 0) {
      let dx = right ? 1 : left ? -1 : 0;
      let dy = up ? -1 : down ? 1 : 0;
      if (dx === 0 && dy === 0) dx = p.facing;
      const len = Math.sqrt(dx * dx + dy * dy);
      p.dashDir = { x: dx / len, y: dy / len };
      p.dashing = DASH_DURATION;
      p.canDash = false;
      p.dashCooldown = DASH_COOLDOWN;
      p.hairColor = "#7ec8e3"; // blue while dash is used
      gs.screenShake = 3;
      sfx("dash");
      spawnParticles(gs, p.x + PW / 2, p.y + PH / 2, "#7ec8e3", 8, 3);
    }

    if (p.dashing > 0) {
      p.vx = p.dashDir.x * DASH_SPEED;
      p.vy = p.dashDir.y * DASH_SPEED;
      p.dashing--;
      // Dash trail particles
      if (gs.time % 2 === 0) {
        gs.particles.push({
          x: p.x + PW / 2, y: p.y + PH / 2,
          vx: 0, vy: 0, life: 0.6,
          color: p.hairColor, size: 4,
        });
      }
    } else {
      p.dashCooldown = Math.max(0, p.dashCooldown - 1);
    }

    // ── Gravity ──
    if (p.dashing <= 0) {
      if (p.wallDir !== 0 && p.vy > 0) {
        p.vy = Math.min(p.vy + GRAVITY * 0.4, WALL_SLIDE_SPEED);
      } else {
        p.vy = Math.min(p.vy + GRAVITY, MAX_FALL);
      }
    }

    // ── Move & collide ──
    // Horizontal
    p.x += p.vx;
    // Collide with solid platforms
    const allSolids = [...room.platforms];
    for (const c of room.crumbles) {
      if (c.visible) allSolids.push({ x: c.x, y: c.y, w: c.w, h: TILE });
    }

    for (const plat of allSolids) {
      if (rectsOverlap({ x: p.x, y: p.y, w: PW, h: PH }, plat)) {
        if (p.vx > 0) p.x = plat.x - PW;
        else if (p.vx < 0) p.x = plat.x + plat.w;
        p.vx = 0;
      }
    }

    // Vertical
    p.y += p.vy;
    p.grounded = false;
    for (const plat of allSolids) {
      if (rectsOverlap({ x: p.x, y: p.y, w: PW, h: PH }, plat)) {
        if (p.vy > 0) {
          p.y = plat.y - PH;
          p.grounded = true;
          p.canDash = true;
          p.hairColor = "#E84855"; // reset hair color
          if (p.vy > 4) {
            spawnParticles(gs, p.x + PW / 2, p.y + PH, "rgba(255,255,255,0.4)", 3);
            sfx("land");
          }
        } else if (p.vy < 0) {
          p.y = plat.y + plat.h;
        }
        p.vy = 0;
      }
    }

    // ── Wall detection ──
    p.wallDir = 0;
    if (!p.grounded) {
      const wallCheck = 2;
      // Check left
      for (const plat of allSolids) {
        if (rectsOverlap({ x: p.x - wallCheck, y: p.y + 2, w: wallCheck, h: PH - 4 }, plat) && left) {
          p.wallDir = -1;
        }
        if (rectsOverlap({ x: p.x + PW, y: p.y + 2, w: wallCheck, h: PH - 4 }, plat) && right) {
          p.wallDir = 1;
        }
      }
    }

    // ── Crumbling platforms ──
    for (const c of room.crumbles) {
      if (!c.visible) {
        c.respawnTimer--;
        if (c.respawnTimer <= 0) {
          c.visible = true;
          c.timer = 0;
        }
        continue;
      }
      // Check if player is standing on it
      if (p.grounded &&
        p.x + PW > c.x && p.x < c.x + c.w &&
        Math.abs(p.y + PH - c.y) < 2) {
        if (c.timer === 0) c.timer = CRUMBLE_DELAY;
      }
      if (c.timer > 0) {
        c.timer--;
        if (c.timer <= 0) {
          c.visible = false;
          c.respawnTimer = CRUMBLE_RESPAWN;
          sfx("crumble");
          spawnParticles(gs, c.x + c.w / 2, c.y + TILE / 2, "#4a3a2a", 8, 4);
        }
      }
    }

    // ── Springs ──
    for (const s of room.springs) {
      if (s.activated > 0) s.activated--;
      if (rectsOverlap({ x: p.x, y: p.y, w: PW, h: PH }, { x: s.x - 6, y: s.y - 4, w: 32, h: 16 }) && p.vy >= 0) {
        p.vy = SPRING_FORCE;
        p.grounded = false;
        p.canDash = true;
        p.hairColor = "#E84855";
        s.activated = 15;
        sfx("spring");
        spawnParticles(gs, s.x + 10, s.y, "#f1c40f", 6, 5);
      }
    }

    // ── Spike collision ──
    for (const s of room.spikes) {
      if (rectsOverlap({ x: p.x + 2, y: p.y + 2, w: PW - 4, h: PH - 4 }, spikeHitbox(s))) {
        killPlayer(gs);
        prevKeysRef.current = new Set(keys);
        return;
      }
    }

    // ── Strawberry collection ──
    for (const s of room.strawberries) {
      if (s.collected) continue;
      const dx = (p.x + PW / 2) - s.x;
      const dy = (p.y + PH / 2) - s.y;
      if (Math.sqrt(dx * dx + dy * dy) < 16) {
        s.collected = true;
        gs.strawberriesCollected++;
        sfx("strawberry");
        spawnParticles(gs, s.x, s.y, "#e84855", 10, 5);
        spawnParticles(gs, s.x, s.y, "#2ecc71", 5, 3);
      }
    }

    // ── Fall off screen ──
    if (p.y > H + 20 || p.y < -40 || p.x < -20 || p.x > W + 20) {
      killPlayer(gs);
      prevKeysRef.current = new Set(keys);
      return;
    }

    // ── Room transition ──
    if (p.x >= room.exitX && p.grounded) {
      if (gs.currentRoom < gs.rooms.length - 1) {
        enterRoom(gs, gs.currentRoom + 1);
        sfx("roomenter");
      } else {
        gs.status = "win";
        setStatus("win");
        sfx("win");
      }
      prevKeysRef.current = new Set(keys);
      return;
    }

    // ── Hair physics ──
    const headX = p.x + PW / 2;
    const headY = p.y - 1;
    for (let i = 0; i < p.hair.length; i++) {
      const target = i === 0 ? { x: headX, y: headY } : p.hair[i - 1];
      const h = p.hair[i];
      h.x += (target.x - h.x) * 0.4;
      h.y += (target.y - h.y) * 0.4;
      // Offset away from facing when moving
      h.x -= p.facing * (i * 1.2);
      h.y += i * 0.5;
    }

    // ── Particles ──
    gs.particles = gs.particles.filter(part => {
      part.x += part.vx; part.y += part.vy; part.vy += 0.08; part.life -= 0.03;
      return part.life > 0;
    });

    prevKeysRef.current = new Set(keys);
  }, [justPressed, spawnParticles, killPlayer, respawnPlayer, enterRoom]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const gs = gsRef.current;
    if (!canvas || !gs) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.save();

    // Screen shake
    if (gs.screenShake > 0) {
      const sx = (Math.random() - 0.5) * gs.screenShake;
      const sy = (Math.random() - 0.5) * gs.screenShake;
      ctx.translate(sx, sy);
    }

    const room = gs.rooms[gs.currentRoom];

    drawBg(ctx, gs.currentRoom, gs.time);
    drawSnow(ctx, gs.snow);
    drawPlatforms(ctx, room.platforms);
    drawCrumbles(ctx, room.crumbles, gs.time);
    drawSpikes(ctx, room.spikes);
    drawStrawberries(ctx, room.strawberries, gs.time);
    drawSprings(ctx, room.springs);
    drawParticles(ctx, gs.particles);
    drawPlayer2(ctx, gs.player, gs.time);
    drawHUD(ctx, gs.deaths, gs.strawberriesCollected, gs.totalStrawberries, gs.currentRoom, gs.rooms.length);

    ctx.restore();
  }, []);

  const gameLoop = useCallback(() => {
    update();
    render();
    animRef.current = requestAnimationFrame(gameLoop);
  }, [update, render]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key);
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
        e.preventDefault();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key);
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  useEffect(() => {
    if (status === "playing") {
      animRef.current = requestAnimationFrame(gameLoop);
      return () => cancelAnimationFrame(animRef.current);
    }
  }, [status, gameLoop]);

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="rounded-lg border-2 border-indigo-900/50 shadow-2xl shadow-indigo-900/30"
        />

        {status === "menu" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 rounded-lg">
            <div className="mb-2 text-6xl">🏔️</div>
            <h1 className="text-5xl font-bold text-cyan-400 mb-1 tracking-widest" style={{ fontFamily: "monospace", textShadow: "0 0 20px rgba(100,200,255,0.5)" }}>
              SUMMIT
            </h1>
            <p className="text-indigo-300 mb-8 text-sm tracking-wider">REACH THE TOP</p>
            <button
              onClick={initGame}
              className="px-8 py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-lg rounded transition-colors shadow-lg shadow-cyan-900/50"
              style={{ fontFamily: "monospace" }}
            >
              CLIMB
            </button>
            <div className="mt-8 text-gray-500 text-xs text-center space-y-1" style={{ fontFamily: "monospace" }}>
              <p>Arrow Keys / WASD — Move</p>
              <p>C / Space — Jump</p>
              <p>X / Shift — Dash</p>
              <p className="text-gray-600 mt-2">Wall slide · Wall jump · Air dash</p>
            </div>
          </div>
        )}

        {status === "win" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 rounded-lg">
            <div className="mb-2 text-5xl">⛰️</div>
            <h2 className="text-4xl font-bold text-cyan-400 mb-4" style={{ fontFamily: "monospace", textShadow: "0 0 20px rgba(100,200,255,0.5)" }}>
              SUMMIT REACHED
            </h2>
            <div className="text-gray-300 text-sm space-y-2 mb-6" style={{ fontFamily: "monospace" }}>
              <p>Deaths: <span className="text-red-400">{gsRef.current?.deaths || 0}</span></p>
              <p>Strawberries: <span className="text-red-400">{gsRef.current?.strawberriesCollected || 0}/{gsRef.current?.totalStrawberries || 0}</span></p>
            </div>
            {gsRef.current && gsRef.current.strawberriesCollected >= gsRef.current.totalStrawberries && (
              <p className="text-yellow-300 text-sm mb-4" style={{ fontFamily: "monospace" }}>✨ All strawberries collected!</p>
            )}
            <button
              onClick={initGame}
              className="px-8 py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-lg rounded transition-colors"
              style={{ fontFamily: "monospace" }}
            >
              CLIMB AGAIN
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-6 text-gray-600 text-xs" style={{ fontFamily: "monospace" }}>
        <span>Arrows/WASD: Move</span>
        <span>C/Space: Jump</span>
        <span>X/Shift: Dash</span>
        <span>Wall slide & wall jump into walls</span>
      </div>
    </div>
  );
}
