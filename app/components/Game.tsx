"use client";

import { useEffect, useRef, useCallback, useState } from "react";

// ─── Constants ───────────────────────────────────────────────────────────────
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 500;
const GRAVITY = 0.6;
const FRICTION = 0.8;
const PLAYER_SPEED = 5;
const JUMP_FORCE = -12;
const PLAYER_WIDTH = 30;
const PLAYER_HEIGHT = 40;
const COIN_SIZE = 16;
const ENEMY_WIDTH = 30;
const ENEMY_HEIGHT = 30;
const CAMERA_OFFSET_X = 300;

// ─── Types ───────────────────────────────────────────────────────────────────
interface Platform {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  type?: "normal" | "moving";
  moveRange?: number;
  moveSpeed?: number;
  originX?: number;
}

interface Coin {
  x: number;
  y: number;
  collected: boolean;
}

interface Enemy {
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
  direction: number;
  minX: number;
  maxX: number;
  alive: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  grounded: boolean;
  jumping: boolean;
  facing: number;
  frame: number;
  frameTimer: number;
}

interface GameState {
  player: Player;
  platforms: Platform[];
  coins: Coin[];
  enemies: Enemy[];
  particles: Particle[];
  camera: { x: number; y: number };
  score: number;
  lives: number;
  status: "menu" | "playing" | "gameover" | "win";
  levelWidth: number;
}

// ─── Level Builder ───────────────────────────────────────────────────────────
function createLevel(): Omit<GameState, "status"> {
  const platforms: Platform[] = [
    // Ground
    { x: 0, y: 460, width: 600, height: 40, color: "#4a7c59" },
    { x: 700, y: 460, width: 400, height: 40, color: "#4a7c59" },
    { x: 1200, y: 460, width: 600, height: 40, color: "#4a7c59" },
    { x: 1900, y: 460, width: 500, height: 40, color: "#4a7c59" },
    { x: 2500, y: 460, width: 700, height: 40, color: "#4a7c59" },

    // Floating platforms
    { x: 200, y: 350, width: 120, height: 20, color: "#8B6914" },
    { x: 400, y: 280, width: 100, height: 20, color: "#8B6914" },
    { x: 620, y: 350, width: 80, height: 20, color: "#8B6914" },
    { x: 800, y: 300, width: 120, height: 20, color: "#8B6914" },
    { x: 1000, y: 380, width: 100, height: 20, color: "#8B6914" },
    { x: 1150, y: 280, width: 140, height: 20, color: "#8B6914" },
    { x: 1400, y: 350, width: 100, height: 20, color: "#8B6914" },
    { x: 1550, y: 260, width: 120, height: 20, color: "#8B6914" },
    { x: 1750, y: 340, width: 100, height: 20, color: "#8B6914" },
    { x: 1950, y: 280, width: 130, height: 20, color: "#8B6914" },
    { x: 2150, y: 200, width: 100, height: 20, color: "#8B6914" },
    { x: 2350, y: 320, width: 120, height: 20, color: "#8B6914" },
    { x: 2600, y: 260, width: 100, height: 20, color: "#8B6914" },
    { x: 2800, y: 350, width: 150, height: 20, color: "#8B6914" },

    // Moving platform
    {
      x: 1100, y: 200, width: 80, height: 20, color: "#D4A017",
      type: "moving", moveRange: 120, moveSpeed: 1, originX: 1100,
    },
    {
      x: 2400, y: 180, width: 80, height: 20, color: "#D4A017",
      type: "moving", moveRange: 100, moveSpeed: 1.5, originX: 2400,
    },
  ];

  const coins: Coin[] = [
    // Ground coins
    { x: 100, y: 430, collected: false },
    { x: 150, y: 430, collected: false },
    { x: 750, y: 430, collected: false },
    { x: 800, y: 430, collected: false },
    { x: 1300, y: 430, collected: false },
    { x: 2000, y: 430, collected: false },
    { x: 2600, y: 430, collected: false },
    { x: 2650, y: 430, collected: false },
    // Platform coins
    { x: 250, y: 320, collected: false },
    { x: 440, y: 250, collected: false },
    { x: 850, y: 270, collected: false },
    { x: 1200, y: 250, collected: false },
    { x: 1590, y: 230, collected: false },
    { x: 2000, y: 250, collected: false },
    { x: 2180, y: 170, collected: false },
    { x: 2640, y: 230, collected: false },
    { x: 2870, y: 320, collected: false },
    // High coins (reward for exploration)
    { x: 1130, y: 160, collected: false },
    { x: 2430, y: 140, collected: false },
  ];

  const enemies: Enemy[] = [
    { x: 300, y: 430, width: ENEMY_WIDTH, height: ENEMY_HEIGHT, speed: 1.5, direction: 1, minX: 100, maxX: 500, alive: true },
    { x: 900, y: 430, width: ENEMY_WIDTH, height: ENEMY_HEIGHT, speed: 2, direction: -1, minX: 750, maxX: 1050, alive: true },
    { x: 1400, y: 430, width: ENEMY_WIDTH, height: ENEMY_HEIGHT, speed: 1.8, direction: 1, minX: 1250, maxX: 1700, alive: true },
    { x: 2100, y: 430, width: ENEMY_WIDTH, height: ENEMY_HEIGHT, speed: 2.2, direction: -1, minX: 1950, maxX: 2300, alive: true },
    { x: 2700, y: 430, width: ENEMY_WIDTH, height: ENEMY_HEIGHT, speed: 1.5, direction: 1, minX: 2550, maxX: 2900, alive: true },
  ];

  return {
    player: {
      x: 50, y: 400, vx: 0, vy: 0,
      width: PLAYER_WIDTH, height: PLAYER_HEIGHT,
      grounded: false, jumping: false, facing: 1,
      frame: 0, frameTimer: 0,
    },
    platforms,
    coins,
    enemies,
    particles: [],
    camera: { x: 0, y: 0 },
    score: 0,
    lives: 3,
    levelWidth: 3200,
  };
}

// ─── Drawing Helpers ─────────────────────────────────────────────────────────
function drawPlayer(ctx: CanvasRenderingContext2D, player: Player, camera: { x: number; y: number }) {
  const px = player.x - camera.x;
  const py = player.y - camera.y;

  ctx.save();
  ctx.translate(px + player.width / 2, py + player.height / 2);
  ctx.scale(player.facing, 1);

  // Body
  ctx.fillStyle = "#E84855";
  ctx.fillRect(-player.width / 2, -player.height / 2 + 10, player.width, player.height - 10);

  // Head
  ctx.fillStyle = "#FFD6BA";
  ctx.beginPath();
  ctx.arc(0, -player.height / 2 + 8, 10, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  ctx.fillStyle = "#333";
  ctx.fillRect(2, -player.height / 2 + 5, 3, 3);

  // Hat
  ctx.fillStyle = "#2B4570";
  ctx.fillRect(-8, -player.height / 2 - 2, 16, 6);
  ctx.fillRect(-5, -player.height / 2 - 7, 10, 6);

  // Legs animation
  const legOffset = player.grounded && Math.abs(player.vx) > 0.5
    ? Math.sin(player.frame * 0.3) * 5
    : 0;

  ctx.fillStyle = "#2B4570";
  ctx.fillRect(-player.width / 2 + 2, player.height / 2 - 10 + legOffset, 10, 10);
  ctx.fillRect(player.width / 2 - 12, player.height / 2 - 10 - legOffset, 10, 10);

  ctx.restore();
}

function drawPlatform(ctx: CanvasRenderingContext2D, platform: Platform, camera: { x: number; y: number }) {
  const px = platform.x - camera.x;
  const py = platform.y - camera.y;

  if (platform.height >= 40) {
    // Ground - draw with grass effect
    ctx.fillStyle = "#5B8C5A";
    ctx.fillRect(px, py, platform.width, 8);
    ctx.fillStyle = "#6B4226";
    ctx.fillRect(px, py + 8, platform.width, platform.height - 8);
    // Grass blades
    ctx.fillStyle = "#7BC67E";
    for (let i = 0; i < platform.width; i += 12) {
      ctx.fillRect(px + i, py - 2, 3, 5);
    }
  } else {
    // Floating platform
    ctx.fillStyle = platform.color;
    ctx.fillRect(px, py, platform.width, platform.height);
    ctx.fillStyle = "#6B4226";
    ctx.fillRect(px, py + platform.height - 4, platform.width, 4);
    // Top highlight
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.fillRect(px, py, platform.width, 3);
  }
}

function drawCoin(ctx: CanvasRenderingContext2D, coin: Coin, camera: { x: number; y: number }, time: number) {
  if (coin.collected) return;
  const px = coin.x - camera.x;
  const py = coin.y - camera.y + Math.sin(time * 0.05) * 3;

  // Glow
  ctx.fillStyle = "rgba(255, 215, 0, 0.3)";
  ctx.beginPath();
  ctx.arc(px, py, COIN_SIZE, 0, Math.PI * 2);
  ctx.fill();

  // Coin body
  ctx.fillStyle = "#FFD700";
  ctx.beginPath();
  ctx.arc(px, py, COIN_SIZE / 2, 0, Math.PI * 2);
  ctx.fill();

  // Shine
  ctx.fillStyle = "#FFF8DC";
  ctx.beginPath();
  ctx.arc(px - 2, py - 2, COIN_SIZE / 5, 0, Math.PI * 2);
  ctx.fill();
}

function drawEnemy(ctx: CanvasRenderingContext2D, enemy: Enemy, camera: { x: number; y: number }, time: number) {
  if (!enemy.alive) return;
  const px = enemy.x - camera.x;
  const py = enemy.y - camera.y;

  ctx.save();
  ctx.translate(px + enemy.width / 2, py + enemy.height / 2);

  // Body
  ctx.fillStyle = "#7B2D8B";
  ctx.fillRect(-enemy.width / 2, -enemy.height / 2, enemy.width, enemy.height);

  // Angry eyes
  ctx.fillStyle = "#fff";
  ctx.fillRect(-10, -8, 7, 7);
  ctx.fillRect(3, -8, 7, 7);
  ctx.fillStyle = "#E84855";
  ctx.fillRect(-8, -6, 4, 4);
  ctx.fillRect(5, -6, 4, 4);

  // Spikes on top
  ctx.fillStyle = "#9B3DAB";
  for (let i = -12; i <= 12; i += 8) {
    const spikeH = 5 + Math.sin(time * 0.1 + i) * 2;
    ctx.fillRect(i - 2, -enemy.height / 2 - spikeH, 4, spikeH);
  }

  ctx.restore();
}

function drawBackground(ctx: CanvasRenderingContext2D, camera: { x: number; y: number }) {
  // Sky gradient
  const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
  grad.addColorStop(0, "#1a1a2e");
  grad.addColorStop(0.5, "#16213e");
  grad.addColorStop(1, "#0f3460");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Stars
  ctx.fillStyle = "#fff";
  for (let i = 0; i < 60; i++) {
    const sx = ((i * 137.5 + 50) % 1200) - (camera.x * 0.1) % 1200;
    const sy = (i * 73.1 + 20) % (CANVAS_HEIGHT * 0.6);
    const size = (i % 3) + 1;
    ctx.globalAlpha = 0.4 + (i % 5) * 0.12;
    ctx.fillRect(sx < 0 ? sx + 1200 : sx, sy, size, size);
  }
  ctx.globalAlpha = 1;

  // Background mountains (parallax)
  ctx.fillStyle = "#0a1628";
  ctx.beginPath();
  ctx.moveTo(0, CANVAS_HEIGHT);
  for (let x = 0; x <= CANVAS_WIDTH + 100; x += 50) {
    const wx = x + camera.x * 0.15;
    const h = 200 + Math.sin(wx * 0.005) * 80 + Math.sin(wx * 0.012) * 40;
    ctx.lineTo(x, CANVAS_HEIGHT - h);
  }
  ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.fill();

  // Midground hills
  ctx.fillStyle = "#112240";
  ctx.beginPath();
  ctx.moveTo(0, CANVAS_HEIGHT);
  for (let x = 0; x <= CANVAS_WIDTH + 100; x += 30) {
    const wx = x + camera.x * 0.3;
    const h = 120 + Math.sin(wx * 0.008) * 50 + Math.sin(wx * 0.02) * 25;
    ctx.lineTo(x, CANVAS_HEIGHT - h);
  }
  ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.fill();
}

function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[], camera: { x: number; y: number }) {
  for (const p of particles) {
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - camera.x, p.y - camera.y, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

function drawFlag(ctx: CanvasRenderingContext2D, x: number, camera: { x: number; y: number }, time: number) {
  const px = x - camera.x;
  const py = 380;

  // Pole
  ctx.fillStyle = "#ccc";
  ctx.fillRect(px, py, 5, 80);

  // Flag with wave
  ctx.fillStyle = "#FFD700";
  ctx.beginPath();
  ctx.moveTo(px + 5, py);
  ctx.lineTo(px + 45 + Math.sin(time * 0.05) * 5, py + 10);
  ctx.lineTo(px + 45 + Math.sin(time * 0.05 + 1) * 5, py + 25);
  ctx.lineTo(px + 5, py + 35);
  ctx.closePath();
  ctx.fill();

  // Star on flag
  ctx.fillStyle = "#E84855";
  ctx.font = "16px sans-serif";
  ctx.fillText("★", px + 15, py + 24);
}

function drawHUD(ctx: CanvasRenderingContext2D, score: number, lives: number, totalCoins: number) {
  // Score
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(10, 10, 160, 36);
  ctx.fillStyle = "#FFD700";
  ctx.font = "bold 18px monospace";
  ctx.fillText(`★ ${score} / ${totalCoins}`, 20, 34);

  // Lives
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(CANVAS_WIDTH - 120, 10, 110, 36);
  ctx.fillStyle = "#E84855";
  ctx.font = "bold 18px monospace";
  ctx.fillText(`♥ x ${lives}`, CANVAS_WIDTH - 110, 34);
}

// ─── Game Component ──────────────────────────────────────────────────────────
export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameStateRef = useRef<GameState | null>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const animFrameRef = useRef<number>(0);
  const timeRef = useRef<number>(0);
  const [status, setStatus] = useState<"menu" | "playing" | "gameover" | "win">("menu");

  const totalCoins = useRef(0);

  const initGame = useCallback(() => {
    const level = createLevel();
    totalCoins.current = level.coins.length;
    gameStateRef.current = { ...level, status: "playing" };
    setStatus("playing");
  }, []);

  const spawnParticles = useCallback((x: number, y: number, color: string, count: number) => {
    if (!gameStateRef.current) return;
    for (let i = 0; i < count; i++) {
      gameStateRef.current.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 6,
        vy: (Math.random() - 0.5) * 6 - 2,
        life: 1,
        color,
        size: 2 + Math.random() * 3,
      });
    }
  }, []);

  const update = useCallback(() => {
    const gs = gameStateRef.current;
    if (!gs || gs.status !== "playing") return;

    const keys = keysRef.current;
    const p = gs.player;

    // ── Player movement ──
    if (keys.has("ArrowLeft") || keys.has("a")) {
      p.vx = -PLAYER_SPEED;
      p.facing = -1;
    } else if (keys.has("ArrowRight") || keys.has("d")) {
      p.vx = PLAYER_SPEED;
      p.facing = 1;
    } else {
      p.vx *= FRICTION;
    }

    if ((keys.has("ArrowUp") || keys.has("w") || keys.has(" ")) && p.grounded) {
      p.vy = JUMP_FORCE;
      p.grounded = false;
      p.jumping = true;
    }

    // Apply gravity
    p.vy += GRAVITY;
    p.x += p.vx;
    p.y += p.vy;

    // Animation frame
    p.frameTimer++;
    if (p.frameTimer > 6) {
      p.frame++;
      p.frameTimer = 0;
    }

    // ── Update moving platforms ──
    for (const plat of gs.platforms) {
      if (plat.type === "moving" && plat.originX !== undefined) {
        plat.x = plat.originX + Math.sin(timeRef.current * 0.02 * (plat.moveSpeed || 1)) * (plat.moveRange || 0);
      }
    }

    // ── Platform collisions ──
    p.grounded = false;
    for (const plat of gs.platforms) {
      if (
        p.x + p.width > plat.x &&
        p.x < plat.x + plat.width &&
        p.y + p.height > plat.y &&
        p.y + p.height < plat.y + plat.height + 15 &&
        p.vy >= 0
      ) {
        p.y = plat.y - p.height;
        p.vy = 0;
        p.grounded = true;
        p.jumping = false;
      }
    }

    // ── Coin collection ──
    for (const coin of gs.coins) {
      if (coin.collected) continue;
      const dx = (p.x + p.width / 2) - coin.x;
      const dy = (p.y + p.height / 2) - coin.y;
      if (Math.sqrt(dx * dx + dy * dy) < 24) {
        coin.collected = true;
        gs.score++;
        spawnParticles(coin.x, coin.y, "#FFD700", 8);
      }
    }

    // ── Enemy updates & collision ──
    for (const enemy of gs.enemies) {
      if (!enemy.alive) continue;
      enemy.x += enemy.speed * enemy.direction;
      if (enemy.x <= enemy.minX || enemy.x + enemy.width >= enemy.maxX) {
        enemy.direction *= -1;
      }

      // Check collision with player
      if (
        p.x + p.width > enemy.x &&
        p.x < enemy.x + enemy.width &&
        p.y + p.height > enemy.y &&
        p.y < enemy.y + enemy.height
      ) {
        // Stomped from above
        if (p.vy > 0 && p.y + p.height < enemy.y + enemy.height / 2 + 10) {
          enemy.alive = false;
          p.vy = JUMP_FORCE * 0.6;
          gs.score += 2;
          spawnParticles(enemy.x + enemy.width / 2, enemy.y, "#7B2D8B", 12);
        } else {
          // Player hit
          gs.lives--;
          spawnParticles(p.x + p.width / 2, p.y + p.height / 2, "#E84855", 15);
          if (gs.lives <= 0) {
            gs.status = "gameover";
            setStatus("gameover");
            return;
          }
          // Respawn player nearby
          p.x = Math.max(0, p.x - 100);
          p.y = 300;
          p.vx = 0;
          p.vy = 0;
        }
      }
    }

    // ── Particles ──
    gs.particles = gs.particles.filter((part) => {
      part.x += part.vx;
      part.y += part.vy;
      part.vy += 0.1;
      part.life -= 0.03;
      return part.life > 0;
    });

    // ── Fall off screen ──
    if (p.y > CANVAS_HEIGHT + 50) {
      gs.lives--;
      if (gs.lives <= 0) {
        gs.status = "gameover";
        setStatus("gameover");
        return;
      }
      p.x = Math.max(0, p.x - 200);
      p.y = 300;
      p.vx = 0;
      p.vy = 0;
    }

    // ── Level bounds ──
    if (p.x < 0) p.x = 0;

    // ── Win condition: reach flag at end of level ──
    const flagX = gs.levelWidth - 200;
    if (p.x + p.width > flagX && p.grounded) {
      gs.status = "win";
      setStatus("win");
      return;
    }

    // ── Camera ──
    gs.camera.x = Math.max(0, Math.min(p.x - CAMERA_OFFSET_X, gs.levelWidth - CANVAS_WIDTH));
  }, [spawnParticles]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const gs = gameStateRef.current;
    if (!canvas || !gs) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const time = timeRef.current;

    drawBackground(ctx, gs.camera);

    // Flag
    drawFlag(ctx, gs.levelWidth - 200, gs.camera, time);

    // Platforms
    for (const plat of gs.platforms) {
      const screenX = plat.x - gs.camera.x;
      if (screenX > -plat.width && screenX < CANVAS_WIDTH + plat.width) {
        drawPlatform(ctx, plat, gs.camera);
      }
    }

    // Coins
    for (const coin of gs.coins) {
      drawCoin(ctx, coin, gs.camera, time);
    }

    // Enemies
    for (const enemy of gs.enemies) {
      drawEnemy(ctx, enemy, gs.camera, time);
    }

    // Particles
    drawParticles(ctx, gs.particles, gs.camera);

    // Player
    drawPlayer(ctx, gs.player, gs.camera);

    // HUD
    drawHUD(ctx, gs.score, gs.lives, totalCoins.current);
  }, []);

  const gameLoop = useCallback(() => {
    timeRef.current++;
    update();
    render();
    animFrameRef.current = requestAnimationFrame(gameLoop);
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
      animFrameRef.current = requestAnimationFrame(gameLoop);
      return () => cancelAnimationFrame(animFrameRef.current);
    }
  }, [status, gameLoop]);

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="rounded-lg border-2 border-indigo-500/30 shadow-2xl shadow-indigo-500/20"
        />

        {/* Menu overlay */}
        {status === "menu" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 rounded-lg">
            <h1 className="text-5xl font-bold text-yellow-400 mb-2 tracking-wider drop-shadow-lg">
              PIXEL RUNNER
            </h1>
            <p className="text-indigo-300 mb-8 text-lg">A Platformer Adventure</p>
            <button
              onClick={initGame}
              className="px-8 py-3 bg-red-500 hover:bg-red-400 text-white font-bold text-xl rounded-lg transition-colors shadow-lg"
            >
              START GAME
            </button>
            <div className="mt-6 text-gray-400 text-sm text-center space-y-1">
              <p>Arrow Keys / WASD to move</p>
              <p>Space / Up to jump</p>
              <p>Stomp enemies from above!</p>
            </div>
          </div>
        )}

        {/* Game Over overlay */}
        {status === "gameover" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 rounded-lg">
            <h2 className="text-5xl font-bold text-red-500 mb-4 drop-shadow-lg">GAME OVER</h2>
            <p className="text-gray-300 text-xl mb-2">
              Score: {gameStateRef.current?.score || 0} / {totalCoins.current}
            </p>
            <button
              onClick={initGame}
              className="mt-4 px-8 py-3 bg-red-500 hover:bg-red-400 text-white font-bold text-xl rounded-lg transition-colors"
            >
              TRY AGAIN
            </button>
          </div>
        )}

        {/* Win overlay */}
        {status === "win" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 rounded-lg">
            <h2 className="text-5xl font-bold text-yellow-400 mb-4 drop-shadow-lg">YOU WIN!</h2>
            <p className="text-gray-300 text-xl mb-2">
              Score: {gameStateRef.current?.score || 0} / {totalCoins.current}
            </p>
            {gameStateRef.current && gameStateRef.current.score >= totalCoins.current && (
              <p className="text-yellow-300 text-lg mb-2">Perfect Score!</p>
            )}
            <button
              onClick={initGame}
              className="mt-4 px-8 py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-bold text-xl rounded-lg transition-colors"
            >
              PLAY AGAIN
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-8 text-gray-500 text-sm">
        <span>Arrow Keys / WASD: Move</span>
        <span>Space / Up: Jump</span>
        <span>Stomp enemies from above</span>
        <span>Collect all coins and reach the flag!</span>
      </div>
    </div>
  );
}
