"use strict";
/* ============================================================
   皇冠对决 Crown Duel  v2.0
   HTML5 Canvas 塔防卡牌对战（单机 vs AI / 本地双人对战）
   灵感来自《部落冲突：皇室战争》的对战玩法，代码与美术均为原创实现。

   v2.0 更新：
   - 血条按阵营着色（我方绿 / 敌方红），单位增加阵营光圈
   - 单位移速下调；防御塔血量、攻速与射程提升
   - 卡牌等级 1~9（每级 +10% 血量伤害），金币升级，本地存档
   - 奖杯系统 + 5 个竞技场段位（不同战场配色）
   - 本地双人对战模式（同屏上下分阵营，支持多点触控）
   - 卡牌扩充至 12 种（新增骑士 / 炮手 / 巨人 / 治疗术）
   ============================================================ */

/* ---------------- 常量与工具 ---------------- */
const W = 420, H = 740;                    // 逻辑分辨率
const MATCH_TIME = 180;                    // 对局时长（秒）
const ELIXIR_MAX = 10, ELIXIR_START = 5, ELIXIR_RATE = 1 / 2.8;
const MAX_LV = 9;                          // 卡牌最高等级
const BRIDGE_X = W / 2;                    // 桥的位置（过河时单位会向桥靠拢）
const F = { top: 0, bottom: 565, riverTop: 252, riverBot: 302 };   // 战场几何（每局按模式计算）

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const dist2 = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---------------- 卡牌数据（基础数值，等级加成 = 1 + 0.1*(lv-1)） ---------------- */
const CARDS = {
  swordsman:  { id: 'swordsman',  name: '剑士',     emoji: '⚔️',  cost: 3, type: 'unit', hp: 680,  dmg: 95,  atk: 1.0, range: 22,  speed: 60, targets: 'any', r: 14 },
  knight:     { id: 'knight',     name: '骑士',     emoji: '🛡️', cost: 4, type: 'unit', hp: 1100, dmg: 120, atk: 1.1, range: 22,  speed: 66, targets: 'any', r: 14 },
  archer:     { id: 'archer',     name: '弓手',     emoji: '🏹',            cost: 3, type: 'unit', hp: 270,  dmg: 70,  atk: 1.0, range: 115, speed: 60, targets: 'any', r: 12 },
  rascals:    { id: 'rascals',    name: '盗贼团伙', emoji: '🥷',            cost: 3, type: 'unit', count: 3, hp: 215, dmg: 66, atk: 1.1, range: 20, speed: 74, targets: 'any', r: 11 },
  bomber:     { id: 'bomber',     name: '炮手',     emoji: '💣',            cost: 4, type: 'unit', hp: 350,  dmg: 140, atk: 1.9, range: 95, speed: 50, targets: 'any', r: 13, splash: 50 },
  ogre:       { id: 'ogre',       name: '食人魔',   emoji: '👹',            cost: 5, type: 'unit', hp: 1950, dmg: 150, atk: 1.5, range: 26, speed: 38, targets: 'buildings', r: 20 },
  giant:      { id: 'giant',      name: '巨人',     emoji: '🗿',            cost: 6, type: 'unit', hp: 2800, dmg: 110, atk: 1.7, range: 28, speed: 33, targets: 'buildings', r: 21 },
  pyromancer: { id: 'pyromancer', name: '火法师',   emoji: '🧙',            cost: 5, type: 'unit', hp: 500,  dmg: 125, atk: 1.4, range: 105, speed: 50, targets: 'any', r: 13, splash: 58 },
  guard:      { id: 'guard',      name: '王冠守卫', emoji: '\u{1F6E1}️', cost: 5, type: 'unit', hp: 1500, dmg: 165, atk: 1.6, range: 24, speed: 42, targets: 'any', r: 16 },
  fireball:   { id: 'fireball',   name: '火球术',   emoji: '💥',            cost: 4, type: 'spell', dmg: 310, radius: 72, towerFactor: 0.55 },
  arrows:     { id: 'arrows',     name: '箭雨',     emoji: '\u{1F329}️', cost: 3, type: 'spell', dmg: 105, radius: 95, towerFactor: 0.4 },
  heal:       { id: 'heal',       name: '治疗术',   emoji: '💚',            cost: 3, type: 'spell', dmg: 180, radius: 90 },
};
const DECK = ['swordsman', 'knight', 'archer', 'rascals', 'bomber', 'ogre', 'giant', 'pyromancer', 'guard', 'fireball', 'arrows', 'heal'];

/* ---------------- 竞技场（按奖杯解锁，不同配色） ---------------- */
const ARENAS = [
  { name: '新手训练场', min: 0,    grassA: '#4d9d49', grassB: '#449044', riverA: '#2f7fb8', riverB: '#3f9fd8' },
  { name: '青铜竞技场', min: 300,  grassA: '#b89960', grassB: '#a98951', riverA: '#2f6f98', riverB: '#3f7fb0' },
  { name: '白银竞技场', min: 700,  grassA: '#9aa5ad', grassB: '#8c969e', riverA: '#2f5f88', riverB: '#3f6f98' },
  { name: '黄金竞技场', min: 1200, grassA: '#c9a84e', grassB: '#b99740', riverA: '#2f7f78', riverB: '#3f8f88' },
  { name: '传奇竞技场', min: 1800, grassA: '#6a5a8c', grassB: '#5c4e7c', riverA: '#3f3f78', riverB: '#4f4f88' },
];
function arenaOf() {
  let a = ARENAS[0];
  for (const t of ARENAS) if (save.trophies >= t.min) a = t;
  return a;
}
function nextArena() {
  for (const t of ARENAS) if (save.trophies < t.min) return t;
  return null;
}

/* ---------------- 存档（奖杯 / 金币 / 卡牌等级） ---------------- */
const SAVE_KEY = 'crown-duel-save-v1';
let save = loadSave();
function loadSave() {
  try {
    const d = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (d && d.v === 1) return { v: 1, trophies: d.trophies || 0, gold: d.gold || 0, levels: d.levels || {} };
  } catch (e) { /* 首次游玩或存档损坏 */ }
  return { v: 1, trophies: 0, gold: 0, levels: {} };
}
function saveGame() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* 忽略存储失败 */ }
}
const lvOf = (id) => save.levels[id] || 1;
const mult = (lv) => 1 + (lv - 1) * 0.1;
const upgradeCost = (lv) => 60 * lv;
function upgradeCard(id) {
  const lv = lvOf(id);
  if (lv >= MAX_LV) return false;
  const cost = upgradeCost(lv);
  if (save.gold < cost) return false;
  save.gold -= cost;
  save.levels[id] = lv + 1;
  saveGame();
  AudioSys.upgrade();
  return true;
}

/* ---------------- 画布 ---------------- */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
function fitCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const bw = Math.round(W * dpr), bh = Math.round(H * dpr);
  if (canvas.width !== bw) { canvas.width = bw; canvas.height = bh; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const scale = Math.min(window.innerWidth / W, window.innerHeight / H);
  canvas.style.width = Math.floor(W * scale) + 'px';
  canvas.style.height = Math.floor(H * scale) + 'px';
}
fitCanvas();
window.addEventListener('resize', fitCanvas);

function toCanvas(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
}
function inRect(p, b) { return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h; }
function rr(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ---------------- 音效（WebAudio 实时合成） ---------------- */
const AudioSys = {
  ctx: null, master: null, muted: false,
  init() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.16;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (e) { /* 忽略音频初始化失败 */ }
  },
  tone(f0, f1, dur, type, vol, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, vol, freq = 1000, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = this.ctx.createBufferSource(); s.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = this.ctx.createGain(); g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t);
  },
  deploy() { this.tone(320, 640, 0.12, 'square', 0.5); this.tone(640, 960, 0.1, 'sine', 0.4, 0.03); },
  hit() { this.noise(0.05, 0.35, 2400); },
  arrow() { this.tone(1000, 500, 0.06, 'triangle', 0.25); },
  boom() { this.noise(0.35, 0.9, 500); this.tone(140, 50, 0.4, 'sine', 0.8); },
  towerDown() { this.noise(0.6, 1, 400); this.tone(110, 40, 0.6, 'sawtooth', 0.7, 0.05); },
  arrowRain() { this.noise(0.35, 0.5, 3000); this.tone(1600, 500, 0.25, 'triangle', 0.3); },
  upgrade() { this.tone(520, 780, 0.1, 'triangle', 0.5); this.tone(780, 1040, 0.12, 'triangle', 0.5, 0.09); },
  win() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, f, 0.18, 'triangle', 0.6, i * 0.13)); },
  lose() { [392, 330, 262, 196].forEach((f, i) => this.tone(f, f * 0.94, 0.22, 'sine', 0.6, i * 0.15)); },
  toggle() { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : 0.16; return this.muted; },
};

/* ---------------- 全局状态 ---------------- */
let uid = 1;
let state = { screen: 'menu', difficulty: 0 };
const ui = { menu: [], deck: [], over: [], hand: [], hand2: [] };   // 命中区域（每帧重建）
const drags = new Map();    // pointerId -> { id, team, x, y, sx, sy, moved }
let select = null;          // 点选待部署的卡 { id, team }
let clock = 0;              // 全局动画时钟

/* ---------------- 实体 ---------------- */
function makeTower(team, kind, x, y) {
  const king = kind === 'king';
  return {
    isTower: true, id: uid++, team, kind, x, y, r: king ? 30 : 26,
    hp: king ? 4200 : 2800, maxHp: king ? 4200 : 2800,
    dmg: king ? 68 : 52, atk: 0.7, range: king ? 135 : 150,
    cooldown: 0, awake: !king, dead: false,
  };
}
function spawnUnit(card, team, x, y, lv) {
  const m = mult(lv);
  return {
    isUnit: true, id: uid++, card, team, x, y, lv,
    hp: Math.round(card.hp * m), maxHp: Math.round(card.hp * m),
    dmg: Math.round(card.dmg * m), r: card.r, speed: card.speed,
    cooldown: 0, lunge: 0, target: null, dead: false,
  };
}
function makeProj(tw, target) {
  return { x: tw.x, y: tw.y - tw.r * 0.2, tx: target, team: tw.team, dmg: tw.dmg, speed: 380, dead: false };
}

/* ---------------- 对局初始化 ---------------- */
function drawN(queue, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    if (!queue.length) queue.push(...shuffle(DECK));
    out.push(queue.shift());
  }
  return out;
}
function levelOf(team, id) {
  // 单人模式：敌方（team1）AI 的卡牌等级取我方平均等级，保证公平
  if (state.mode === 'ai' && team === 1) return state.aiLv;
  return lvOf(id);
}
function newGame(mode, difficulty) {
  const pvp = mode === 'pvp';
  F.top = pvp ? 132 : 0;
  F.bottom = pvp ? 612 : 565;
  const cy = (F.top + F.bottom) / 2;
  F.riverTop = cy - 25; F.riverBot = cy + 25;
  const aiLv = clamp(Math.round(DECK.reduce((s, id) => s + lvOf(id), 0) / DECK.length), 1, MAX_LV);
  state = {
    mode, difficulty, screen: 'playing', over: false,
    time: MATCH_TIME, elapsed: 0, doubleSaid: false,
    elixir: [ELIXIR_START, ELIXIR_START],
    units: [], projs: [], parts: [], texts: [],
    towers: [
      makeTower(1, 'king', 210, F.top + 42), makeTower(1, 'guard', 105, F.top + 92), makeTower(1, 'guard', 315, F.top + 92),
      makeTower(0, 'guard', 105, F.bottom - 92), makeTower(0, 'guard', 315, F.bottom - 92), makeTower(0, 'king', 210, F.bottom - 42),
    ],
    crowns: [0, 0], shake: 0, win: null, reason: '', reward: null,
    arena: arenaOf(), aiLv,
    ai: { t: 1.2 },
  };
  state.queue = [shuffle(DECK), shuffle(DECK)];
  state.hand = [drawN(state.queue[0], 4), drawN(state.queue[1], 4)];
  drags.clear(); select = null;
}

/* ---------------- 特效 ---------------- */
function addText(x, y, txt, color, size) { state.texts.push({ x, y, txt, color, size, vy: -46, life: 0.8 }); }
function spawnHit(x, y) {
  for (let i = 0; i < 5; i++) state.parts.push({ x, y, vx: rand(-90, 90), vy: rand(-90, 90), g: 0, life: rand(0.15, 0.3), r: rand(1.5, 3), col: pick(['#ffe9a8', '#ffd94d', '#fff']) });
}
function spawnBoom(x, y) {
  for (let i = 0; i < 16; i++) state.parts.push({ x, y, vx: rand(-130, 130), vy: rand(-130, 130), g: 0, life: rand(0.25, 0.5), r: rand(2, 5), col: pick(['#ff9933', '#ff5533', '#ffdd55']) });
}
function spawnRing(x, y, team) {
  const col = team === 0 ? 'rgba(96,160,255,0.9)' : 'rgba(255,110,96,0.9)';
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    state.parts.push({ x, y, vx: Math.cos(a) * 70, vy: Math.sin(a) * 70, g: 0, life: 0.35, r: 2.5, col });
  }
}
function updateFx(dt) {
  for (let i = state.texts.length - 1; i >= 0; i--) {
    const t = state.texts[i];
    t.life -= dt; t.y += t.vy * dt;
    if (t.life <= 0) state.texts.splice(i, 1);
  }
  for (let i = state.parts.length - 1; i >= 0; i--) {
    const p = state.parts[i];
    p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.g || 0) * dt;
    if (p.life <= 0) state.parts.splice(i, 1);
  }
  state.shake = Math.max(0, state.shake - dt * 20);
}

/* ---------------- 伤害与胜负 ---------------- */
function damageUnit(u, dmg) {
  if (u.dead) return;
  u.hp -= dmg;
  addText(u.x + rand(-8, 8), u.y - u.r - 8, String(Math.round(dmg)), '#ffffff', 11);
  if (u.hp <= 0) { u.dead = true; spawnBoom(u.x, u.y); }
}
function damageTower(tw, dmg) {
  if (tw.dead) return;
  tw.hp -= dmg; tw.awake = true;
  addText(tw.x, tw.y - tw.r - 14, String(Math.round(dmg)), '#ffd94d', 13);
  if (tw.hp <= 0) {
    tw.hp = 0; tw.dead = true;
    const winner = 1 - tw.team;
    state.crowns[winner]++;
    AudioSys.towerDown();
    state.shake = Math.max(state.shake, 10);
    for (let i = 0; i < 34; i++) state.parts.push({ x: tw.x, y: tw.y, vx: rand(-220, 220), vy: rand(-240, 120), g: 420, life: rand(0.5, 1), r: rand(3, 7), col: pick(['#ffdd55', '#ff9933', '#ff5533', '#8a7352', '#fff']) });
    addText(tw.x, tw.y - 26, tw.kind === 'king' ? '国王塔被摧毁!' : '防御塔被摧毁!', '#ff6b5e', 17);
    if (tw.kind === 'king') endGame(winner, '国王塔被摧毁');
  }
}
function endGame(winner, reason) {
  if (state.screen !== 'playing') return;
  state.screen = 'over'; state.over = true;
  state.reason = reason || '';
  if (winner === null) {
    // 时间结束：先比摧毁塔数，再比剩余塔总血量
    if (state.crowns[0] !== state.crowns[1]) winner = state.crowns[0] > state.crowns[1] ? 0 : 1;
    else {
      const hpOf = (team) => state.towers.filter(t => t.team === team && !t.dead).reduce((s, t) => s + t.hp, 0);
      const hp0 = hpOf(0), hp1 = hpOf(1);
      if (hp0 === hp1) { state.win = null; state.reason = '时间结束 · 皇冠与塔血量均持平 · 平局'; }
      else winner = hp0 > hp1 ? 0 : 1;
    }
  }
  if (state.win === null && winner !== null) state.win = winner;
  // 奖杯与金币（仅单人模式结算）
  if (state.mode === 'ai') {
    let t = 0, g = 0;
    if (state.win === 0) { const hard = state.difficulty === 1; t = hard ? 70 : 50; g = hard ? 100 : 80; }
    else if (state.win === 1) { t = -25; g = 20; }
    else { t = 15; g = 30; }
    save.trophies = Math.max(0, save.trophies + t);
    save.gold += g;
    state.reward = { t, g };
    saveGame();
  }
  if (state.win === 0) AudioSys.win(); else if (state.win === 1) AudioSys.lose();
}

/* ---------------- 单位 ---------------- */
function findTarget(u) {
  const towers = state.towers;
  // 只攻击建筑的单位：找最近的敌方塔
  if (u.card.targets === 'buildings') {
    let best = null, bd = Infinity;
    for (const t of towers) if (!t.dead && t.team !== u.team) {
      const d = dist2(u.x, u.y, t.x, t.y);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }
  // 普通单位：优先攻击附近（横向 140 内）的敌方单位
  let best = null, bd = 190;
  for (const e of state.units) {
    if (e.dead || e.team === u.team) continue;
    if (Math.abs(e.x - u.x) > 140) continue;
    const d = dist2(u.x, u.y, e.x, e.y);
    if (d < bd) { bd = d; best = e; }
  }
  if (best) return best;
  // 否则向最近的敌方塔推进
  bd = Infinity;
  for (const t of towers) if (!t.dead && t.team !== u.team) {
    const d = dist2(u.x, u.y, t.x, t.y);
    if (d < bd) { bd = d; best = t; }
  }
  return best;
}
function doAttack(u, t) {
  if (u.card.splash) {
    spawnBoom(t.x, t.y);
    AudioSys.hit();
    for (const e of state.units) if (!e.dead && e.team !== u.team && dist2(e.x, e.y, t.x, t.y) < u.card.splash + e.r) damageUnit(e, u.dmg);
    for (const tw of state.towers) if (!tw.dead && tw.team !== u.team && dist2(tw.x, tw.y, t.x, t.y) < u.card.splash + tw.r) damageTower(tw, u.dmg);
  } else {
    spawnHit(t.x, t.y);
    AudioSys.hit();
    if (t.isTower) damageTower(t, u.dmg);
    else damageUnit(t, u.dmg);
  }
}
function updateUnits(dt) {
  const units = state.units;
  for (let i = units.length - 1; i >= 0; i--) {
    const u = units[i];
    if (u.dead) { units.splice(i, 1); continue; }
    u.cooldown -= dt;
    u.lunge = Math.max(0, u.lunge - dt * 3.2);
    if (!u.target || u.target.dead) u.target = findTarget(u);
    const t = u.target;
    if (!t) {
      u.y += u.speed * dt * (u.team === 0 ? -1 : 1);
    } else {
      const rr = u.r + (t.r || 0) + (u.card.range || 0);
      const d = dist2(u.x, u.y, t.x, t.y);
      if (d > rr) {
        const sp = u.speed * dt;
        u.x += (t.x - u.x) / d * sp;
        u.y += (t.y - u.y) / d * sp;
      } else if (u.cooldown <= 0) {
        u.cooldown = u.card.atk;
        u.lunge = 1;
        doAttack(u, t);
      }
    }
    // 过河时向桥靠拢（纯视觉引导）
    if (u.y > F.riverTop - 12 && u.y < F.riverBot + 12) u.x += (BRIDGE_X - u.x) * Math.min(1, dt * 2.2);
    u.x = clamp(u.x, 16, W - 16);
    u.y = clamp(u.y, F.top + 14, F.bottom - 14);
  }
}

/* ---------------- 防御塔与箭矢 ---------------- */
function updateTowers(dt) {
  for (const tw of state.towers) {
    if (tw.dead) continue;
    tw.cooldown -= dt;
    // 国王塔激活判定：敌方单位过河后参战
    if (tw.kind === 'king' && !tw.awake) {
      for (const u of state.units) {
        if (u.dead || u.team === tw.team) continue;
        const crossed = tw.team === 0 ? u.y > F.riverBot : u.y < F.riverTop;
        if (crossed && dist2(u.x, u.y, tw.x, tw.y) < tw.range + 40) { tw.awake = true; break; }
      }
    }
    if (tw.cooldown > 0) continue;
    let best = null, bd = tw.range;
    for (const u of state.units) {
      if (u.dead || u.team === tw.team) continue;
      if (tw.kind === 'king' && !tw.awake) continue;
      const d = dist2(u.x, u.y, tw.x, tw.y);
      if (d < bd) { bd = d; best = u; }
    }
    if (best) { tw.cooldown = tw.atk; state.projs.push(makeProj(tw, best)); AudioSys.arrow(); }
  }
}
function updateProjs(dt) {
  const projs = state.projs;
  for (let i = projs.length - 1; i >= 0; i--) {
    const p = projs[i];
    if (p.dead) { projs.splice(i, 1); continue; }
    const t = p.tx;
    if (!t || t.dead) { p.dead = true; continue; }
    const d = dist2(p.x, p.y, t.x, t.y);
    const step = p.speed * dt;
    if (d <= step + (t.r || 0)) {
      if (t.isTower) damageTower(t, p.dmg);
      else damageUnit(t, p.dmg);
      p.dead = true;
    } else {
      p.x += (t.x - p.x) / d * step;
      p.y += (t.y - p.y) / d * step;
    }
  }
}

/* ---------------- 法术 ---------------- */
function castSpell(card, x, y, team, lv) {
  const dmg = Math.round(card.dmg * mult(lv));
  if (card.id === 'heal') {
    AudioSys.upgrade();
    for (let i = 0; i < 14; i++) state.parts.push({ x: x + rand(-card.radius, card.radius), y: y + rand(-card.radius, card.radius), vx: rand(-12, 12), vy: rand(-60, -20), g: 0, life: rand(0.4, 0.8), r: rand(2, 4), col: pick(['#6ee98a', '#9dffb0', '#d8ffe0']) });
    for (const u of state.units) {
      if (u.dead || u.team !== team) continue;
      if (dist2(u.x, u.y, x, y) < card.radius + u.r) {
        u.hp = Math.min(u.maxHp, u.hp + dmg);
        addText(u.x + rand(-8, 8), u.y - u.r - 8, '+' + dmg, '#6ee98a', 11);
      }
    }
    return;
  }
  if (card.id === 'fireball') {
    AudioSys.boom();
    state.shake = Math.max(state.shake, 9);
    for (let i = 0; i < 26; i++) state.parts.push({ x, y, vx: rand(-170, 170), vy: rand(-190, 90), g: 300, life: rand(0.4, 0.85), r: rand(3, 7), col: pick(['#ffdd55', '#ff9933', '#ff5533', '#ffe9a8']) });
    for (const u of state.units) if (!u.dead && u.team !== team && dist2(u.x, u.y, x, y) < card.radius + u.r) damageUnit(u, dmg);
    for (const tw of state.towers) if (!tw.dead && tw.team !== team && dist2(tw.x, tw.y, x, y) < card.radius + tw.r) damageTower(tw, Math.round(dmg * card.towerFactor));
  } else {
    AudioSys.arrowRain();
    for (let w = 0; w < 3; w++) for (let i = 0; i < 9; i++) state.parts.push({ x: x + rand(-card.radius, card.radius), y: y - rand(0, card.radius), vx: rand(-24, 24), vy: rand(260, 400), g: 520, life: 0.5, r: 2, col: '#cfe6ff', streak: true });
    for (const u of state.units) if (!u.dead && u.team !== team && dist2(u.x, u.y, x, y) < card.radius + u.r) damageUnit(u, dmg);
    for (const tw of state.towers) if (!tw.dead && tw.team !== team && dist2(tw.x, tw.y, x, y) < card.radius + tw.r) damageTower(tw, Math.round(dmg * card.towerFactor));
  }
}

/* ---------------- 出牌 ---------------- */
function canDeploy(id, x, y, team) {
  const card = CARDS[id];
  if (state.elixir[team] < card.cost) return false;
  if (x < 18 || x > W - 18) return false;
  if (card.type === 'spell') { if (y < F.top + 26 || y > F.bottom - 14) return false; }
  else if (team === 0) { if (y < F.riverBot - 12 || y > F.bottom - 22) return false; }
  else { if (y > F.riverTop + 12 || y < F.top + 30) return false; }
  for (const tw of state.towers) if (!tw.dead && tw.team === team && dist2(tw.x, tw.y, x, y) < tw.r + 16) return false;
  return true;
}
function playCard(id, x, y, team) {
  const card = CARDS[id];
  const lv = levelOf(team, id);
  state.elixir[team] -= card.cost;
  state.hand[team].splice(state.hand[team].indexOf(id), 1);
  state.hand[team].push(drawN(state.queue[team], 1)[0]);
  if (card.type === 'spell') {
    castSpell(card, x, y, team, lv);
  } else {
    const n = card.count || 1;
    for (let k = 0; k < n; k++) {
      state.units.push(spawnUnit(card, team, x + (k - (n - 1) / 2) * 30, y + (k - (n - 1) / 2) * 12, lv));
    }
    spawnRing(x, y, team);
  }
  AudioSys.deploy();
}

/* ---------------- 主更新 ---------------- */
function update(dt) {
  state.elapsed += dt;
  state.time -= dt;
  const m2 = state.elapsed > 120 ? 2 : 1;
  if (!state.doubleSaid && m2 === 2) {
    state.doubleSaid = true;
    addText(W / 2, F.riverBot + 60, '⚡ 双倍圣水时间! ⚡', '#ffd94d', 20);
    AudioSys.tone(660, 880, 0.25, 'triangle', 0.5);
  }
  state.elixir[0] = clamp(state.elixir[0] + ELIXIR_RATE * m2 * dt, 0, ELIXIR_MAX);
  state.elixir[1] = clamp(state.elixir[1] + ELIXIR_RATE * m2 * dt, 0, ELIXIR_MAX);
  updateTowers(dt);
  updateUnits(dt);
  updateProjs(dt);
  updateFx(dt);
  if (state.mode === 'ai') aiUpdate(dt);
  if (state.time <= 0) endGame(null, '时间结束');
}

/* ---------------- AI ---------------- */
function aiUpdate(dt) {
  const ai = state.ai;
  ai.t -= dt;
  if (ai.t > 0) return;
  const easy = state.difficulty === 0;
  ai.t = easy ? rand(0.8, 1.3) : rand(0.3, 0.55);
  const el = state.elixir[1];
  const hand = state.hand[1];
  const can = hand.filter(id => CARDS[id].cost <= el);
  if (!can.length) return;

  const crossed = state.units.filter(u => !u.dead && u.team === 0 && u.y < F.riverTop);
  const centroid = (us) => {
    let cx = 0, cy = 0;
    for (const u of us) { cx += u.x; cy += u.y; }
    return { x: clamp(cx / us.length, 40, W - 40), y: clamp(cy / us.length, F.top + 40, F.top + 230) };
  };

  // 1) 火球清场：我方半场聚集了多个敌方单位
  if (!easy && can.includes('fireball') && crossed.length >= 2) {
    const c = centroid(crossed);
    if (crossed.filter(u => dist2(u.x, u.y, c.x, c.y) < 70).length >= 2) {
      playCard('fireball', c.x, c.y, 1);
      return;
    }
  }
  // 2) 箭雨压制人海
  if (!easy && can.includes('arrows') && crossed.length >= 3) {
    const c = centroid(crossed);
    playCard('arrows', c.x, c.y, 1);
    return;
  }
  // 3) 法术终结残血塔
  const weak = state.towers.filter(t => !t.dead && t.team === 0 && t.hp < (easy ? 260 : 420));
  if (weak.length && can.includes('fireball')) {
    const t = weak[0];
    playCard('fireball', t.x, t.y, 1);
    return;
  }
  // 4) 治疗：己方多单位受伤时奶一口
  if (can.includes('heal')) {
    const hurt = state.units.filter(u => !u.dead && u.team === 1 && u.hp < u.maxHp * 0.6);
    if (hurt.length >= 2) {
      const c = centroid(hurt);
      playCard('heal', c.x, c.y, 1);
      return;
    }
  }
  // 5) 防守：敌方单位过河
  if (crossed.length) {
    const threat = crossed.reduce((s, u) => s + u.card.cost, 0);
    if (threat >= (easy ? 4 : 3)) {
      const c = centroid(crossed);
      const lane = c.x < 210 ? 105 : 315;
      const opts = ['knight', 'swordsman', 'rascals', 'bomber', 'archer', 'pyromancer', 'guard'].filter(id => can.includes(id));
      if (opts.length) {
        playCard(pick(opts), lane + rand(-28, 28), rand(F.top + 128, F.top + 170), 1);
        return;
      }
    }
  }
  // 6) 进攻：攒够圣水组织推进
  if (el >= (easy ? 5.5 : 4.5)) {
    const lane = Math.random() < 0.5 ? 105 : 315;
    const opts = ['giant', 'ogre', 'guard', 'pyromancer', 'bomber', 'knight', 'archer', 'swordsman', 'rascals'].filter(id => can.includes(id));
    if (opts.length) {
      playCard(pick(opts), lane + rand(-25, 25), rand(F.top + 85, F.top + 145), 1);
      return;
    }
  }
}

/* ---------------- 渲染：战场 ---------------- */
function drawArena() {
  const a = state.arena;
  const cell = 55;
  for (let gy = F.top; gy < F.bottom; gy += cell) {
    for (let gx = 0; gx < W; gx += cell) {
      ctx.fillStyle = ((gx / cell + gy / cell) & 1) ? a.grassA : a.grassB;
      ctx.fillRect(gx, gy, cell, cell);
    }
  }
  // 中线
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(210, F.top + 12); ctx.lineTo(210, F.bottom - 12); ctx.stroke();
  // 河道
  const rg = ctx.createLinearGradient(0, F.riverTop, 0, F.riverBot);
  rg.addColorStop(0, a.riverA); rg.addColorStop(0.5, a.riverB); rg.addColorStop(1, a.riverA);
  ctx.fillStyle = rg;
  ctx.fillRect(0, F.riverTop, W, F.riverBot - F.riverTop);
  // 水波
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    const yy = F.riverTop + 12 + i * 11;
    ctx.beginPath();
    for (let xx = 0; xx <= W; xx += 14) {
      const yy2 = yy + Math.sin(xx * 0.06 + state.elapsed * 2 + i) * 2.5;
      if (xx === 0) ctx.moveTo(xx, yy2); else ctx.lineTo(xx, yy2);
    }
    ctx.stroke();
  }
  // 桥
  const bw = 110, bx = BRIDGE_X - bw / 2, by = F.riverTop - 6, bh = F.riverBot - F.riverTop + 12;
  ctx.fillStyle = '#a9743f'; ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = '#8a5c30';
  for (let i = 0; i < bh; i += 12) ctx.fillRect(bx, by + i, bw, 2);
  ctx.fillStyle = '#c98d52';
  ctx.fillRect(bx - 4, by, 4, bh); ctx.fillRect(bx + bw, by, 4, bh);
  // 石墙边界
  ctx.strokeStyle = '#8a7352'; ctx.lineWidth = 6;
  ctx.strokeRect(3, F.top + 3, W - 6, F.bottom - F.top - 6);
  ctx.strokeStyle = '#cbb48f'; ctx.lineWidth = 2;
  ctx.strokeRect(6, F.top + 6, W - 12, F.bottom - F.top - 12);
}
function hpBar(x, y, w, ratio, team, h = 5) {
  const f = clamp(ratio, 0, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(x - w / 2, y, w, h);
  // 阵营着色：我方绿色、敌方红色
  ctx.fillStyle = team === 0 ? '#4ade62' : '#ff4d4f';
  ctx.fillRect(x - w / 2, y, w * f, h);
}
function drawTower(tw) {
  if (tw.dead) {
    ctx.fillStyle = 'rgba(40,34,28,0.85)';
    ctx.beginPath(); ctx.arc(tw.x, tw.y, tw.r * 0.8, 0, Math.PI * 2); ctx.fill();
    ctx.font = '22px "Segoe UI Emoji",sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('💀', tw.x, tw.y);
    return;
  }
  const stone = '#cbb48f', dark = '#8a7352';
  const col = tw.team === 0 ? '#3d6fe0' : '#d84a42';
  // 影子
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.ellipse(tw.x, tw.y + tw.r * 0.62, tw.r + 7, tw.r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
  // 主体
  rr(tw.x - tw.r, tw.y - tw.r * 0.45, tw.r * 2, tw.r * 1.75, 6);
  ctx.fillStyle = stone; ctx.fill();
  ctx.strokeStyle = dark; ctx.lineWidth = 2; ctx.stroke();
  // 城垛
  const cw = tw.r * 0.62, ch = tw.r * 0.5;
  for (let i = -1; i <= 1; i++) {
    rr(tw.x + i * tw.r * 0.62 - cw / 2, tw.y - tw.r * 0.45 - ch, cw, ch, 3);
    ctx.fillStyle = stone; ctx.fill();
    ctx.strokeStyle = dark; ctx.stroke();
  }
  // 旗帜
  ctx.strokeStyle = dark; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(tw.x, tw.y - tw.r * 0.45 - ch);
  ctx.lineTo(tw.x, tw.y - tw.r * 0.45 - ch - 12);
  ctx.stroke();
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(tw.x, tw.y - tw.r * 0.45 - ch - 12);
  ctx.lineTo(tw.x + 11, tw.y - tw.r * 0.45 - ch - 9);
  ctx.lineTo(tw.x, tw.y - tw.r * 0.45 - ch - 6);
  ctx.closePath(); ctx.fill();
  // 国王塔皇冠
  if (tw.kind === 'king') {
    ctx.font = '16px "Segoe UI Emoji",sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('👑', tw.x, Math.max(F.top + 22, tw.y - tw.r - 24));
  }
  // 血条（阵营色）
  hpBar(tw.x, tw.y - tw.r - 10, tw.r * 2, tw.hp / tw.maxHp, tw.team);
}
function drawUnit(u) {
  // 阵营光圈 + 影子
  ctx.strokeStyle = u.team === 0 ? 'rgba(90,160,255,0.45)' : 'rgba(255,90,80,0.45)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(u.x, u.y + u.r * 0.8, u.r * 0.95, u.r * 0.4, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(u.x, u.y + u.r * 0.8, u.r * 0.9, u.r * 0.38, 0, 0, Math.PI * 2); ctx.fill();
  const sc = 1 + u.lunge * 0.14;
  ctx.save();
  ctx.translate(u.x, u.y);
  ctx.scale(sc, sc);
  ctx.font = Math.round(u.r * 2.7) + 'px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(u.card.emoji, 0, 2);
  ctx.restore();
  // 血条（阵营色）
  hpBar(u.x, u.y - u.r - 12, u.r * 2.2, u.hp / u.maxHp, u.team, 4);
}
function drawProj(p) {
  const t = p.tx;
  if (!t || t.dead) return;
  const d = dist2(p.x, p.y, t.x, t.y) || 1;
  const dx = (t.x - p.x) / d, dy = (t.y - p.y) / d;
  ctx.strokeStyle = 'rgba(255,217,77,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(p.x - dx * 10, p.y - dy * 10); ctx.lineTo(p.x, p.y); ctx.stroke();
  ctx.fillStyle = '#fff2b0';
  ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2); ctx.fill();
}
function drawParticles() {
  for (const p of state.parts) {
    ctx.globalAlpha = clamp(p.life / 0.5, 0, 1);
    ctx.fillStyle = p.col;
    if (p.streak) ctx.fillRect(p.x, p.y - 8, 1.5, 8);
    else { ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
}
function drawTexts() {
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const t of state.texts) {
    ctx.globalAlpha = clamp(t.life / 0.4, 0, 1);
    ctx.font = 'bold ' + t.size + 'px "Microsoft YaHei",sans-serif';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 3;
    ctx.strokeText(t.txt, t.x, t.y);
    ctx.fillStyle = t.color;
    ctx.fillText(t.txt, t.x, t.y);
  }
  ctx.globalAlpha = 1;
}

/* ---------------- 渲染：卡牌 ---------------- */
function drawCard(id, x, y, w, h, selected, team = 0) {
  const card = CARDS[id];
  const afford = state.elixir ? state.elixir[team] >= card.cost : true;
  rr(x, y, w, h, 10);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#42556e'); g.addColorStop(1, '#2c3c50');
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = selected ? '#ffd94d' : '#5c6f86';
  ctx.lineWidth = selected ? 3 : 1.5; ctx.stroke();
  if (!afford) ctx.globalAlpha = 0.45;
  ctx.font = '30px "Segoe UI Emoji",sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(card.emoji, x + w / 2, y + 34);
  ctx.font = '12px "Microsoft YaHei",sans-serif';
  ctx.fillStyle = '#dbe6f5';
  ctx.fillText(card.name, x + w / 2, y + h - 14);
  ctx.globalAlpha = 1;
  // 费用
  ctx.beginPath(); ctx.arc(x + 12, y + 12, 11, 0, Math.PI * 2);
  ctx.fillStyle = '#8a2be2'; ctx.fill();
  ctx.strokeStyle = '#c26af0'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 12px Consolas,monospace';
  ctx.fillText(card.cost, x + 12, y + 13);
  // 等级徽章
  const lv = lvOf(id);
  const bw = 30, bh = 12, bx = x + w - bw - 4, by = y + 4;
  rr(bx, by, bw, bh, 6);
  ctx.fillStyle = lv >= MAX_LV ? '#ffd94d' : '#3d6fe0'; ctx.fill();
  ctx.fillStyle = lv >= MAX_LV ? '#241a08' : '#fff';
  ctx.font = 'bold 9px Consolas,monospace';
  ctx.fillText('Lv' + lv, bx + bw / 2, by + bh / 2 + 0.5);
}
function drawMini(id, x, y, w, h) {
  const card = CARDS[id];
  rr(x, y, w, h, 8);
  ctx.fillStyle = '#2c3c50'; ctx.fill();
  ctx.strokeStyle = '#5c6f86'; ctx.lineWidth = 1; ctx.stroke();
  ctx.font = '18px "Segoe UI Emoji",sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(card.emoji, x + w / 2, y + 16);
  ctx.fillStyle = '#c26af0';
  ctx.font = 'bold 10px Consolas,monospace';
  ctx.fillText(card.cost, x + w / 2, y + h - 8);
}

/* ---------------- 渲染：手牌 / HUD ---------------- */
function drawHand(team, x0, y, cw, ch, gap, rects) {
  const hand = state.hand[team];
  for (let i = 0; i < 4; i++) {
    const x = x0 + i * (cw + gap);
    drawCard(hand[i], x, y, cw, ch, select && select.team === team && select.id === hand[i], team);
    rects.push({ id: hand[i], team, x, y, w: cw, h: ch });
  }
  const nx = x0 + cw * 4 + gap * 3 + 6;
  if (state.queue[team].length) drawMini(state.queue[team][0], nx, y + (ch - 52) / 2, 40, 52);
}
function elixirBar(team, x, y, w, h) {
  rr(x, y, w, h, 9);
  ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  for (let i = 1; i < 10; i++) ctx.fillRect(x + (w / 10) * i - 1, y, 2, h);
  const frac = state.elixir[team] / ELIXIR_MAX;
  if (frac > 0) {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#c26af0'); g.addColorStop(1, '#8a2be2');
    rr(x + 2, y + 2, Math.max(6, (w - 4) * frac), h - 4, 7);
    ctx.fillStyle = g; ctx.fill();
  }
  ctx.font = 'bold 13px "Microsoft YaHei",sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.fillText('💧 ' + Math.floor(state.elixir[team]) + ' / ' + ELIXIR_MAX, x + w / 2, y + h / 2 + 1);
}
function drawHUD() {
  if (state.mode === 'pvp') drawHUDPvP();
  else drawHUDAI();
}
function drawHUDAI() {
  const b = F.bottom;
  ctx.fillStyle = '#1d2a3a';
  ctx.fillRect(0, b, W, H - b);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(0, b, W, 1.5);
  // 皇冠与计时
  ctx.font = 'bold 15px "Microsoft YaHei",sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#7fa8ff';
  ctx.fillText('👑 ' + state.crowns[0], 16, b + 16);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ff8a80';
  ctx.fillText(state.crowns[1] + ' 👑', W - 16, b + 16);
  ctx.textAlign = 'center';
  ctx.font = 'bold 26px Consolas,monospace';
  ctx.fillStyle = state.time < 30 ? '#ff6b5e' : '#e8eef7';
  const m = Math.floor(Math.max(0, state.time) / 60);
  const s = Math.floor(Math.max(0, state.time) % 60);
  ctx.fillText(m + ':' + (s < 10 ? '0' : '') + s, W / 2, b + 16);
  // 圣水条
  elixirBar(0, 30, b + 30, W - 60, 18);
  // 手牌
  ui.hand = [];
  drawHand(0, 12, b + 56, 84, 84, 8, ui.hand);
}
function drawHUDPvP() {
  // 顶部 HUD：玩家2（红方，team1）
  ctx.fillStyle = '#1d2a3a';
  ctx.fillRect(0, 0, W, F.top);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(0, F.top - 1.5, W, 1.5);
  ui.hand2 = [];
  drawHand(1, 12, 4, 84, 80, 8, ui.hand2);
  // 顶部信息行：皇冠 + 计时
  ctx.font = 'bold 14px "Microsoft YaHei",sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ff8a80';
  ctx.fillText('👑 ' + state.crowns[1], 16, 100);
  ctx.textAlign = 'center';
  ctx.font = 'bold 22px Consolas,monospace';
  ctx.fillStyle = state.time < 30 ? '#ff6b5e' : '#e8eef7';
  const m = Math.floor(Math.max(0, state.time) / 60);
  const s = Math.floor(Math.max(0, state.time) % 60);
  ctx.fillText(m + ':' + (s < 10 ? '0' : '') + s, W / 2, 100);
  elixirBar(1, 30, 114, W - 60, 16);
  // 底部 HUD：玩家1（蓝方，team0）
  const b = F.bottom;
  ctx.fillStyle = '#1d2a3a';
  ctx.fillRect(0, b, W, H - b);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(0, b, W, 1.5);
  ctx.font = 'bold 14px "Microsoft YaHei",sans-serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#7fa8ff';
  ctx.fillText('👑 ' + state.crowns[0], 16, b + 12);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#8fa3c0';
  ctx.font = '12px "Microsoft YaHei",sans-serif';
  ctx.fillText(state.arena.name, W - 16, b + 12);
  elixirBar(0, 30, b + 22, W - 60, 18);
  ui.hand = [];
  drawHand(0, 12, b + 48, 84, 80, 8, ui.hand);
}
function drawDrags() {
  for (const d of drags.values()) {
    if (d.y >= F.top && d.y <= F.bottom) {
      const card = CARDS[d.id];
      const ok = canDeploy(d.id, d.x, d.y, d.team);
      ctx.beginPath();
      ctx.arc(d.x, d.y, card.type === 'spell' ? card.radius : card.r + 10, 0, Math.PI * 2);
      ctx.fillStyle = ok ? 'rgba(90,200,120,0.25)' : 'rgba(255,60,50,0.25)';
      ctx.fill();
      ctx.strokeStyle = ok ? '#5ec878' : '#ff5a4e';
      ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.save();
    ctx.globalAlpha = 0.85;
    drawCard(d.id, d.x - 42, d.y - 42, 84, 84, false, d.team);
    ctx.restore();
  }
}

/* ---------------- 渲染：菜单 / 牌库 / 结算 ---------------- */
function drawMenu() {
  ui.menu = [];
  ctx.fillStyle = '#14203a';
  ctx.fillRect(0, 0, W, H);
  // 星空
  for (let i = 0; i < 46; i++) {
    const sx = (i * 97 + 13) % W, sy = (i * 53 + 29) % 300;
    ctx.globalAlpha = 0.25 + 0.35 * Math.abs(Math.sin(clock * 1.5 + i));
    ctx.fillStyle = '#cfe0ff';
    ctx.beginPath(); ctx.arc(sx, sy, 1.2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // 标题
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const tg = ctx.createLinearGradient(0, 44, 0, 100);
  tg.addColorStop(0, '#ffe9a8'); tg.addColorStop(0.5, '#ffd94d'); tg.addColorStop(1, '#e8a33c');
  ctx.font = 'bold 46px "Microsoft YaHei",sans-serif';
  ctx.fillStyle = tg;
  ctx.fillText('皇冠对决', W / 2, 68);
  ctx.font = 'bold 13px Consolas,monospace';
  ctx.fillStyle = '#8fa3c0';
  ctx.fillText('C R O W N   D U E L', W / 2, 104);
  // 竞技场横幅
  const arena = arenaOf(), next = nextArena();
  const ax = 50, ay = 122, aw = W - 100, ah = 96;
  rr(ax, ay, aw, ah, 14);
  ctx.fillStyle = '#1c2a3e'; ctx.fill();
  ctx.strokeStyle = '#40556e'; ctx.lineWidth = 2; ctx.stroke();
  ctx.font = 'bold 22px "Microsoft YaHei",sans-serif';
  ctx.fillStyle = '#ffd94d';
  ctx.fillText('🏟 ' + arena.name, W / 2, ay + 26);
  ctx.font = 'bold 15px "Microsoft YaHei",sans-serif';
  ctx.fillStyle = '#e8eef7';
  ctx.fillText('🏆 ' + save.trophies, ax + 34, ay + 54);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ffd94d';
  ctx.fillText('🪙 ' + save.gold, ax + aw - 34, ay + 54);
  ctx.textAlign = 'left';
  // 晋级进度条
  if (next) {
    const pct = clamp((save.trophies - arena.min) / (next.min - arena.min), 0, 1);
    rr(ax + 16, ay + 64, aw - 32, 10, 5);
    ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fill();
    if (pct > 0) {
      rr(ax + 16, ay + 64, Math.max(10, (aw - 32) * pct), 10, 5);
      ctx.fillStyle = '#3d6fe0'; ctx.fill();
    }
    ctx.font = '11px "Microsoft YaHei",sans-serif';
    ctx.fillStyle = '#8fa3c0';
    ctx.fillText('距「' + next.name + '」还需 ' + (next.min - save.trophies) + ' 🏆', ax + 16, ay + 86);
  } else {
    ctx.font = '12px "Microsoft YaHei",sans-serif';
    ctx.fillStyle = '#ffd94d';
    ctx.fillText('👑 已登顶最高竞技场!', ax + 16, ay + 82);
  }
  // 主按钮
  const btns = [
    { id: 'ai', label: '⚔ 单人挑战', y: 238 },
    { id: 'pvp', label: '👥 双人对战', y: 298 },
    { id: 'deck', label: '🃏 卡牌升级', y: 358 },
  ];
  for (const b of btns) {
    const bw = 260, bh = 50, bx = W / 2 - bw / 2;
    rr(bx, b.y, bw, bh, 14);
    ctx.fillStyle = '#2c3c50'; ctx.fill();
    ctx.strokeStyle = '#4a5b70'; ctx.lineWidth = 2; ctx.stroke();
    ctx.font = 'bold 20px "Microsoft YaHei",sans-serif';
    ctx.fillStyle = '#e8eef7';
    ctx.fillText(b.label, W / 2, b.y + bh / 2 + 1);
    ui.menu.push({ id: b.id, x: bx, y: b.y, w: bw, h: bh });
  }
  // 难度选择（影响单人 AI）
  const dy = 428;
  const diffs = [['简单', 0], ['困难', 1]];
  for (let i = 0; i < 2; i++) {
    const x = W / 2 - 112 + i * 124, w = 100, h = 38;
    rr(x, dy, w, h, 19);
    const sel = state.difficulty === diffs[i][1];
    ctx.fillStyle = sel ? '#3d6fe0' : '#2a3a4e'; ctx.fill();
    ctx.strokeStyle = sel ? '#7fa8ff' : '#4a5b70'; ctx.lineWidth = 2; ctx.stroke();
    ctx.font = 'bold 15px "Microsoft YaHei",sans-serif';
    ctx.fillStyle = sel ? '#fff' : '#8fa3c0';
    ctx.fillText(diffs[i][0] + (i === 0 ? ' +50🏆' : ' +70🏆'), x + w / 2, dy + h / 2 + 1);
    ui.menu.push({ id: 'diff' + diffs[i][1], x, y: dy, w, h });
  }
  // 说明
  ctx.textAlign = 'center';
  ctx.font = '12px "Microsoft YaHei",sans-serif';
  ctx.fillStyle = '#6f829c';
  ctx.fillText('拖拽卡牌到己方半场部署 · 3 分钟内率先摧毁敌方国王塔者获胜', W / 2, 512);
  ctx.fillText('单人模式：胜利赢得奖杯与金币 · 奖杯解锁更高竞技场', W / 2, 532);
  ctx.fillText('双人模式：上方红方 vs 下方蓝方 · 支持多点触控', W / 2, 552);
  ctx.font = '11px "Microsoft YaHei",sans-serif';
  ctx.fillStyle = '#54687e';
  ctx.fillText('原创 HTML5 Canvas 演示 · 灵感来自皇室战争品类 · v2.0', W / 2, H - 24);
}
function drawDeck() {
  ui.deck = [];
  ctx.fillStyle = '#14203a';
  ctx.fillRect(0, 0, W, H);
  // 头部
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 22px "Microsoft YaHei",sans-serif';
  ctx.fillStyle = '#ffd94d';
  ctx.fillText('🃏 卡牌升级', 20, 32);
  ctx.textAlign = 'right';
  ctx.font = 'bold 16px "Microsoft YaHei",sans-serif';
  ctx.fillStyle = '#ffd94d';
  ctx.fillText('🪙 ' + save.gold, W - 20, 32);
  // 返回按钮
  const bx = 20, by = 44, bw = 64, bh = 30;
  rr(bx, by, bw, bh, 15);
  ctx.fillStyle = '#2a3a4e'; ctx.fill();
  ctx.strokeStyle = '#4a5b70'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.textAlign = 'center';
  ctx.font = '13px "Microsoft YaHei",sans-serif';
  ctx.fillStyle = '#e8eef7';
  ctx.fillText('← 返回', bx + bw / 2, by + bh / 2 + 1);
  ui.deck.push({ id: 'back', x: bx, y: by, w: bw, h: bh });
  // 卡牌列表（2 列 × 6 行）
  const cw = 172, ch = 100, gx = 16, gy = 8, y0 = 84;
  for (let i = 0; i < DECK.length; i++) {
    const id = DECK[i];
    const card = CARDS[id];
    const lv = lvOf(id);
    const m = mult(lv);
    const cx = 30 + (i % 2) * (cw + gx);
    const cy = y0 + Math.floor(i / 2) * (ch + gy);
    rr(cx, cy, cw, ch, 12);
    ctx.fillStyle = '#1c2a3e'; ctx.fill();
    ctx.strokeStyle = '#40556e'; ctx.lineWidth = 1.5; ctx.stroke();
    // 图标与名称
    ctx.textAlign = 'left';
    ctx.font = '20px "Segoe UI Emoji",sans-serif';
    ctx.fillText(card.emoji, cx + 10, cy + 18);
    ctx.font = 'bold 13px "Microsoft YaHei",sans-serif';
    ctx.fillStyle = '#e8eef7';
    ctx.fillText(card.name, cx + 10, cy + 38);
    ctx.textAlign = 'right';
    ctx.font = 'bold 11px Consolas,monospace';
    ctx.fillStyle = lv >= MAX_LV ? '#ffd94d' : '#7fa8ff';
    ctx.fillText('Lv.' + lv, cx + cw - 10, cy + 18);
    // 属性
    ctx.textAlign = 'left';
    ctx.font = '10px "Microsoft YaHei",sans-serif';
    ctx.fillStyle = '#8fa3c0';
    if (card.id === 'heal') {
      ctx.fillText('治疗 ' + Math.round(card.dmg * m), cx + 10, cy + 54);
    } else if (card.type === 'spell') {
      ctx.fillText('范围伤害 ' + Math.round(card.dmg * m), cx + 10, cy + 54);
    } else {
      ctx.fillText('生命 ' + Math.round(card.hp * m) + ' · 伤害 ' + Math.round(card.dmg * m), cx + 10, cy + 54);
    }
    // 升级按钮
    const ubx = cx + 10, uby = cy + 62, ubw = cw - 20, ubh = 28;
    rr(ubx, uby, ubw, ubh, 10);
    const maxed = lv >= MAX_LV;
    const afford = save.gold >= upgradeCost(lv);
    ctx.fillStyle = maxed ? '#3a3a20' : afford ? '#3d6fe0' : '#2a3a4e';
    ctx.fill();
    ctx.strokeStyle = maxed ? '#8a7a20' : afford ? '#7fa8ff' : '#4a5b70';
    ctx.lineWidth = 1.5; ctx.stroke();
    ctx.textAlign = 'center';
    ctx.font = 'bold 12px "Microsoft YaHei",sans-serif';
    ctx.fillStyle = maxed ? '#ffd94d' : afford ? '#fff' : '#6f829c';
    ctx.fillText(maxed ? '★ 已满级' : '升级 🪙' + upgradeCost(lv), cx + cw / 2, uby + ubh / 2 + 1);
    ui.deck.push({ id: 'up:' + id, x: ubx, y: uby, w: ubw, h: ubh });
  }
}
function drawOver() {
  ui.over = [];
  ctx.fillStyle = 'rgba(8,12,22,0.78)';
  ctx.fillRect(0, 0, W, H);
  const px = 62, py = 216, pw = W - 124, ph = 300;
  rr(px, py, pw, ph, 16);
  ctx.fillStyle = '#1c2a3e'; ctx.fill();
  ctx.strokeStyle = '#40556e'; ctx.lineWidth = 2; ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let title, tcol, emoji;
  if (state.win === 0) { title = state.mode === 'pvp' ? '玩家1 获胜!' : '胜利!'; tcol = '#ffd94d'; emoji = '🏆'; }
  else if (state.win === 1) { title = state.mode === 'pvp' ? '玩家2 获胜!' : '战败'; tcol = '#ff6b5e'; emoji = '💀'; }
  else { title = '平局'; tcol = '#9fb3c8'; emoji = '🤝'; }
  ctx.font = '40px "Segoe UI Emoji",sans-serif';
  ctx.fillText(emoji, W / 2, py + 52);
  ctx.font = 'bold 34px "Microsoft YaHei",sans-serif';
  ctx.fillStyle = tcol;
  ctx.fillText(title, W / 2, py + 104);
  ctx.font = '13px "Microsoft YaHei",sans-serif';
  ctx.fillStyle = '#8fa3c0';
  ctx.fillText(state.reason, W / 2, py + 134);
  ctx.fillText('我方 👑 ×' + state.crowns[0] + '   ·   敌方 👑 ×' + state.crowns[1], W / 2, py + 158);
  if (state.reward) {
    ctx.font = 'bold 16px "Microsoft YaHei",sans-serif';
    ctx.fillStyle = state.reward.t >= 0 ? '#ffd94d' : '#ff8a80';
    ctx.fillText((state.reward.t >= 0 ? '+' : '') + state.reward.t + ' 🏆   +' + state.reward.g + ' 🪙', W / 2, py + 184);
  }
  const bs = [['replay', '再来一局', py + 208], ['menu', '返回主菜单', py + 256]];
  for (const b of bs) {
    const id = b[0], label = b[1], by = b[2], bw = 200, bh = 42, bx2 = W / 2 - bw / 2;
    rr(bx2, by, bw, bh, 21);
    ctx.fillStyle = id === 'replay' ? '#3d6fe0' : '#2a3a4e'; ctx.fill();
    ctx.strokeStyle = '#5c6f86'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.font = 'bold 16px "Microsoft YaHei",sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText(label, W / 2, by + bh / 2 + 1);
    ui.over.push({ id, x: bx2, y: by, w: bw, h: bh });
  }
}

/* ---------------- 渲染主循环 ---------------- */
function render() {
  ctx.clearRect(0, 0, W, H);
  if (state.screen === 'menu') { drawMenu(); return; }
  if (state.screen === 'deck') { drawDeck(); return; }
  ctx.save();
  if (state.shake > 0) ctx.translate(rand(-state.shake, state.shake), rand(-state.shake, state.shake));
  drawArena();
  for (const tw of state.towers) if (!tw.dead) drawTower(tw);
  const sorted = state.units.slice().sort((a, b) => a.y - b.y);
  for (const u of sorted) drawUnit(u);
  for (const p of state.projs) drawProj(p);
  drawParticles();
  for (const tw of state.towers) if (tw.dead) drawTower(tw);   // 塔的残骸
  ctx.restore();
  drawHUD();
  drawDrags();
  drawTexts();
  if (state.screen === 'over') drawOver();
}

let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.05) dt = 0.05;
  clock += dt;
  if (state.screen === 'playing') update(dt);
  else if (state.screen === 'over') updateFx(dt);
  render();
}
requestAnimationFrame(loop);

/* ---------------- 输入（支持多点触控） ---------------- */
canvas.addEventListener('pointerdown', (e) => {
  AudioSys.init();
  e.preventDefault();
  const p = toCanvas(e);
  if (state.screen === 'menu') {
    for (const b of ui.menu) {
      if (!inRect(p, b)) continue;
      if (b.id === 'ai') newGame('ai', state.difficulty);
      else if (b.id === 'pvp') newGame('pvp', state.difficulty);
      else if (b.id === 'deck') state.screen = 'deck';
      else if (b.id === 'diff0') state.difficulty = 0;
      else if (b.id === 'diff1') state.difficulty = 1;
      return;
    }
    return;
  }
  if (state.screen === 'deck') {
    for (const b of ui.deck) {
      if (!inRect(p, b)) continue;
      if (b.id === 'back') state.screen = 'menu';
      else if (b.id.startsWith('up:')) upgradeCard(b.id.slice(3));
      return;
    }
    return;
  }
  if (state.screen === 'over') {
    for (const b of ui.over) {
      if (!inRect(p, b)) continue;
      if (b.id === 'replay') newGame(state.mode, state.difficulty);
      else if (b.id === 'menu') state.screen = 'menu';
      return;
    }
    return;
  }
  // 对战中：先判手牌
  const grab = (c) => {
    for (const v of drags.values()) if (v.id === c.id && v.team === c.team) return;  // 同一张卡已被按住
    drags.set(e.pointerId, { id: c.id, team: c.team, x: p.x, y: p.y, sx: p.x, sy: p.y, moved: false });
    select = { id: c.id, team: c.team };
  };
  if (state.mode === 'pvp') {
    for (const c of ui.hand2) if (inRect(p, c)) { grab(c); return; }
  }
  for (const c of ui.hand) if (inRect(p, c)) { grab(c); return; }
  // 点击战场：部署已选卡牌
  if (select) {
    if (p.y >= F.top && p.y <= F.bottom && canDeploy(select.id, p.x, p.y, select.team)) {
      playCard(select.id, p.x, p.y, select.team);
    }
    if (state.elixir[select.team] < CARDS[select.id].cost || p.y < F.top || p.y > F.bottom) select = null;
  }
});
window.addEventListener('pointermove', (e) => {
  const d = drags.get(e.pointerId);
  if (!d) return;
  const p = toCanvas(e);
  d.x = p.x; d.y = p.y;
  if (Math.hypot(p.x - d.sx, p.y - d.sy) > 10) d.moved = true;
});
window.addEventListener('pointerup', (e) => {
  const d = drags.get(e.pointerId);
  if (!d) return;
  const p = toCanvas(e);
  if (d.moved && p.y >= F.top && p.y <= F.bottom && canDeploy(d.id, p.x, p.y, d.team)) {
    playCard(d.id, p.x, p.y, d.team);
  }
  drags.delete(e.pointerId);   // 未移动的点击保留 select，走点选部署流程
});
window.addEventListener('pointercancel', (e) => { drags.delete(e.pointerId); });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

/* ---------------- 静音按钮 ---------------- */
const muteBtn = document.getElementById('muteBtn');
muteBtn.addEventListener('click', () => {
  muteBtn.textContent = AudioSys.toggle() ? '🔇' : '🔊';
});
