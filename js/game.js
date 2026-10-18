"use strict";
/* ============================================================
   皇冠对决 Crown Duel  v1.0
   HTML5 Canvas 塔防卡牌对战（单机 · 玩家 vs AI）
   灵感来自《部落冲突：皇室战争》的对战玩法，代码与美术均为原创实现。
   ============================================================ */

/* ---------------- 常量与工具 ---------------- */
const W = 420, H = 740;                    // 逻辑分辨率
const FIELD_B = 565;                       // 战场区域下边界（其下为 HUD）
const RIVER_TOP = 252, RIVER_BOT = 302;    // 河道范围
const BRIDGE_X = W / 2;                    // 桥的位置（过河时单位会向桥靠拢）
const MATCH_TIME = 180;                    // 对局时长（秒）
const ELIXIR_MAX = 10, ELIXIR_START = 5, ELIXIR_RATE = 1 / 2.8;

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

/* ---------------- 卡牌数据 ---------------- */
const CARDS = {
  swordsman:  { id: 'swordsman',  name: '剑士',     emoji: '⚔️',  cost: 3, type: 'unit', hp: 680,  dmg: 95,  atk: 1.0, range: 22,  speed: 72, targets: 'any', r: 14 },
  archer:     { id: 'archer',     name: '弓手',     emoji: '🏹',            cost: 3, type: 'unit', hp: 270,  dmg: 70,  atk: 1.0, range: 115, speed: 72, targets: 'any', r: 12 },
  rascals:    { id: 'rascals',    name: '盗贼团伙', emoji: '🥷',            cost: 3, type: 'unit', count: 3, hp: 215, dmg: 66, atk: 1.1, range: 20, speed: 88, targets: 'any', r: 11 },
  ogre:       { id: 'ogre',       name: '食人魔',   emoji: '👹',            cost: 5, type: 'unit', hp: 1950, dmg: 150, atk: 1.5, range: 26, speed: 45, targets: 'buildings', r: 20 },
  pyromancer: { id: 'pyromancer', name: '火法师',   emoji: '🧙',            cost: 5, type: 'unit', hp: 500,  dmg: 125, atk: 1.4, range: 105, speed: 60, targets: 'any', r: 13, splash: 58 },
  guard:      { id: 'guard',      name: '王冠守卫', emoji: '\u{1F6E1}️', cost: 5, type: 'unit', hp: 1500, dmg: 165, atk: 1.6, range: 24, speed: 50, targets: 'any', r: 16 },
  fireball:   { id: 'fireball',   name: '火球术',   emoji: '💥',            cost: 4, type: 'spell', dmg: 310, radius: 72, towerFactor: 0.55 },
  arrows:     { id: 'arrows',     name: '箭雨',     emoji: '\u{1F329}️', cost: 3, type: 'spell', dmg: 105, radius: 95, towerFactor: 0.4 },
};
const DECK = ['swordsman', 'archer', 'rascals', 'ogre', 'pyromancer', 'guard', 'fireball', 'arrows'];

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
  win() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, f, 0.18, 'triangle', 0.6, i * 0.13)); },
  lose() { [392, 330, 262, 196].forEach((f, i) => this.tone(f, f * 0.94, 0.22, 'sine', 0.6, i * 0.15)); },
  toggle() { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : 0.16; return this.muted; },
};

/* ---------------- 全局状态 ---------------- */
let uid = 1;
let state = { screen: 'menu', difficulty: 0 };
const ui = { menu: [], over: [], hand: [] };   // 命中区域（每帧重建）
let drag = null;        // { id, x, y, sx, sy, moved }
let selectId = null;    // 点选待部署的卡
let clock = 0;          // 全局动画时钟

/* ---------------- 实体 ---------------- */
function makeTower(team, kind, x, y) {
  const king = kind === 'king';
  return {
    isTower: true, id: uid++, team, kind, x, y, r: king ? 30 : 26,
    hp: king ? 3000 : 2000, maxHp: king ? 3000 : 2000,
    dmg: king ? 68 : 52, atk: 0.9, range: king ? 115 : 128,
    cooldown: 0, awake: !king, dead: false,
  };
}
function spawnUnit(card, team, x, y) {
  return {
    isUnit: true, id: uid++, card, team, x, y,
    hp: card.hp, maxHp: card.hp, r: card.r, speed: card.speed,
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
function newGame(difficulty) {
  state = {
    difficulty, screen: 'playing', over: false,
    time: MATCH_TIME, elapsed: 0, doubleSaid: false,
    elixirP: ELIXIR_START, elixirA: ELIXIR_START,
    units: [], projs: [], parts: [], texts: [],
    towers: [
      makeTower(1, 'king', 210, 42), makeTower(1, 'guard', 105, 92), makeTower(1, 'guard', 315, 92),
      makeTower(0, 'guard', 105, 473), makeTower(0, 'guard', 315, 473), makeTower(0, 'king', 210, 523),
    ],
    crowns: [0, 0], shake: 0, win: null, reason: '',
    ai: { t: 1.2 },
  };
  state.queue = shuffle(DECK); state.hand = drawN(state.queue, 4);
  state.aiQueue = shuffle(DECK); state.aiHand = drawN(state.aiQueue, 4);
  drag = null; selectId = null;
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
    for (const e of state.units) if (!e.dead && e.team !== u.team && dist2(e.x, e.y, t.x, t.y) < u.card.splash + e.r) damageUnit(e, u.card.dmg);
    for (const tw of state.towers) if (!tw.dead && tw.team !== u.team && dist2(tw.x, tw.y, t.x, t.y) < u.card.splash + tw.r) damageTower(tw, u.card.dmg);
  } else {
    spawnHit(t.x, t.y);
    AudioSys.hit();
    if (t.isTower) damageTower(t, u.card.dmg);
    else damageUnit(t, u.card.dmg);
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
    if (u.y > RIVER_TOP - 12 && u.y < RIVER_BOT + 12) u.x += (BRIDGE_X - u.x) * Math.min(1, dt * 2.2);
    u.x = clamp(u.x, 16, W - 16);
    u.y = clamp(u.y, 18, FIELD_B - 14);
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
        const crossed = tw.team === 0 ? u.y > RIVER_BOT : u.y < RIVER_TOP;
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
function castSpell(card, x, y, team) {
  if (card.id === 'fireball') {
    AudioSys.boom();
    state.shake = Math.max(state.shake, 9);
    for (let i = 0; i < 26; i++) state.parts.push({ x, y, vx: rand(-170, 170), vy: rand(-190, 90), g: 300, life: rand(0.4, 0.85), r: rand(3, 7), col: pick(['#ffdd55', '#ff9933', '#ff5533', '#ffe9a8']) });
    for (const u of state.units) if (!u.dead && u.team !== team && dist2(u.x, u.y, x, y) < card.radius + u.r) damageUnit(u, card.dmg);
    for (const tw of state.towers) if (!tw.dead && tw.team !== team && dist2(tw.x, tw.y, x, y) < card.radius + tw.r) damageTower(tw, Math.round(card.dmg * card.towerFactor));
  } else {
    AudioSys.arrowRain();
    for (let w = 0; w < 3; w++) for (let i = 0; i < 9; i++) state.parts.push({ x: x + rand(-card.radius, card.radius), y: y - rand(0, card.radius), vx: rand(-24, 24), vy: rand(260, 400), g: 520, life: 0.5, r: 2, col: '#cfe6ff', streak: true });
    for (const u of state.units) if (!u.dead && u.team !== team && dist2(u.x, u.y, x, y) < card.radius + u.r) damageUnit(u, card.dmg);
    for (const tw of state.towers) if (!tw.dead && tw.team !== team && dist2(tw.x, tw.y, x, y) < card.radius + tw.r) damageTower(tw, Math.round(card.dmg * card.towerFactor));
  }
}

/* ---------------- 出牌 ---------------- */
function canDeploy(id, x, y, team) {
  const card = CARDS[id];
  const elixir = team === 0 ? state.elixirP : state.elixirA;
  if (elixir < card.cost) return false;
  if (x < 18 || x > W - 18) return false;
  if (card.type === 'spell') { if (y < 26 || y > FIELD_B - 14) return false; }
  else if (team === 0) { if (y < RIVER_BOT - 12 || y > FIELD_B - 22) return false; }
  else { if (y > RIVER_TOP + 12 || y < 30) return false; }
  for (const tw of state.towers) if (!tw.dead && tw.team === team && dist2(tw.x, tw.y, x, y) < tw.r + 16) return false;
  return true;
}
function playCard(id, x, y, team) {
  const card = CARDS[id];
  if (team === 0) {
    state.elixirP -= card.cost;
    state.hand.splice(state.hand.indexOf(id), 1);
    state.hand.push(drawN(state.queue, 1)[0]);
  } else {
    state.elixirA -= card.cost;
    state.aiHand.splice(state.aiHand.indexOf(id), 1);
    state.aiHand.push(drawN(state.aiQueue, 1)[0]);
  }
  if (card.type === 'spell') {
    castSpell(card, x, y, team);
  } else {
    const n = card.count || 1;
    for (let k = 0; k < n; k++) {
      state.units.push(spawnUnit(card, team, x + (k - (n - 1) / 2) * 30, y + (k - (n - 1) / 2) * 12));
    }
    spawnRing(x, y, team);
  }
  AudioSys.deploy();
}

/* ---------------- 主更新 ---------------- */
function update(dt) {
  state.elapsed += dt;
  state.time -= dt;
  const mult = state.elapsed > 120 ? 2 : 1;
  if (!state.doubleSaid && mult === 2) {
    state.doubleSaid = true;
    addText(W / 2, RIVER_BOT + 60, '⚡ 双倍圣水时间! ⚡', '#ffd94d', 20);
    AudioSys.tone(660, 880, 0.25, 'triangle', 0.5);
  }
  state.elixirP = clamp(state.elixirP + ELIXIR_RATE * mult * dt, 0, ELIXIR_MAX);
  state.elixirA = clamp(state.elixirA + ELIXIR_RATE * mult * dt, 0, ELIXIR_MAX);
  updateTowers(dt);
  updateUnits(dt);
  updateProjs(dt);
  updateFx(dt);
  aiUpdate(dt);
  if (state.time <= 0) endGame(null, '时间结束');
}

/* ---------------- AI ---------------- */
function aiUpdate(dt) {
  const ai = state.ai;
  ai.t -= dt;
  if (ai.t > 0) return;
  const easy = state.difficulty === 0;
  ai.t = easy ? rand(0.8, 1.3) : rand(0.3, 0.55);
  const el = state.elixirA;
  const hand = state.aiHand;
  const can = hand.filter(id => CARDS[id].cost <= el);
  if (!can.length) return;

  const crossed = state.units.filter(u => !u.dead && u.team === 0 && u.y < RIVER_TOP);
  const centroid = (us) => {
    let cx = 0, cy = 0;
    for (const u of us) { cx += u.x; cy += u.y; }
    return { x: clamp(cx / us.length, 40, W - 40), y: clamp(cy / us.length, 40, 230) };
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
  // 4) 防守：敌方单位过河
  if (crossed.length) {
    const threat = crossed.reduce((s, u) => s + u.card.cost, 0);
    if (threat >= (easy ? 4 : 3)) {
      const c = centroid(crossed);
      const lane = c.x < 210 ? 105 : 315;
      const opts = ['swordsman', 'rascals', 'archer', 'pyromancer', 'guard'].filter(id => can.includes(id));
      if (opts.length) {
        playCard(pick(opts), lane + rand(-28, 28), rand(128, 170), 1);
        return;
      }
    }
  }
  // 5) 进攻：攒够圣水组织推进
  if (el >= (easy ? 5.5 : 4.5)) {
    const lane = Math.random() < 0.5 ? 105 : 315;
    const opts = ['ogre', 'guard', 'pyromancer', 'archer', 'swordsman', 'rascals'].filter(id => can.includes(id));
    if (opts.length) {
      playCard(pick(opts), lane + rand(-25, 25), rand(85, 145), 1);
      return;
    }
  }
}

/* ---------------- 渲染：战场 ---------------- */
function drawArena() {
  // 草地棋盘格
  const cell = 55;
  for (let gy = 0; gy < FIELD_B; gy += cell) {
    for (let gx = 0; gx < W; gx += cell) {
      ctx.fillStyle = ((gx / cell + gy / cell) & 1) ? '#4d9d49' : '#449044';
      ctx.fillRect(gx, gy, cell, cell);
    }
  }
  // 中线
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(210, 12); ctx.lineTo(210, FIELD_B - 12); ctx.stroke();
  // 河道
  const rg = ctx.createLinearGradient(0, RIVER_TOP, 0, RIVER_BOT);
  rg.addColorStop(0, '#2f7fb8'); rg.addColorStop(0.5, '#3f9fd8'); rg.addColorStop(1, '#2f7fb8');
  ctx.fillStyle = rg;
  ctx.fillRect(0, RIVER_TOP, W, RIVER_BOT - RIVER_TOP);
  // 水波
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    const yy = RIVER_TOP + 12 + i * 11;
    ctx.beginPath();
    for (let xx = 0; xx <= W; xx += 14) {
      const yy2 = yy + Math.sin(xx * 0.06 + state.elapsed * 2 + i) * 2.5;
      if (xx === 0) ctx.moveTo(xx, yy2); else ctx.lineTo(xx, yy2);
    }
    ctx.stroke();
  }
  // 桥
  const bw = 110, bx = BRIDGE_X - bw / 2, by = RIVER_TOP - 6, bh = RIVER_BOT - RIVER_TOP + 12;
  ctx.fillStyle = '#a9743f'; ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = '#8a5c30';
  for (let i = 0; i < bh; i += 12) ctx.fillRect(bx, by + i, bw, 2);
  ctx.fillStyle = '#c98d52';
  ctx.fillRect(bx - 4, by, 4, bh); ctx.fillRect(bx + bw, by, 4, bh);
  // 石墙边界
  ctx.strokeStyle = '#8a7352'; ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, W - 6, FIELD_B - 6);
  ctx.strokeStyle = '#cbb48f'; ctx.lineWidth = 2;
  ctx.strokeRect(6, 6, W - 12, FIELD_B - 12);
}
function hpBar(x, y, w, ratio, h = 5) {
  const f = clamp(ratio, 0, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(x - w / 2, y, w, h);
  ctx.fillStyle = f > 0.5 ? '#5fe06a' : f > 0.25 ? '#ffd94d' : '#ff5a4e';
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
    ctx.fillText('👑', tw.x, Math.max(22, tw.y - tw.r - 24));
  }
  // 血条
  hpBar(tw.x, tw.y - tw.r - 10, tw.r * 2, tw.hp / tw.maxHp);
}
function drawUnit(u) {
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
  hpBar(u.x, u.y - u.r - 12, u.r * 2.2, u.hp / u.maxHp, 4);
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

/* ---------------- 渲染：HUD ---------------- */
function drawCard(id, x, y, w, h, selected) {
  const card = CARDS[id];
  const afford = !state.elixirP ? true : state.elixirP >= card.cost;
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
function drawHand() {
  const cw = 84, ch = 84, gap = 8, y = FIELD_B + 56;
  const total = cw * 4 + gap * 3;
  const x0 = (W - total) / 2 - 18;
  ui.hand = [];
  for (let i = 0; i < 4; i++) {
    const x = x0 + i * (cw + gap);
    drawCard(state.hand[i], x, y, cw, ch, state.hand[i] === selectId);
    ui.hand.push({ id: state.hand[i], x, y, w: cw, h: ch });
  }
  // 下一张预览
  const nx = x0 + total + 6, nw = 40;
  if (state.queue.length) drawMini(state.queue[0], nx, y + (ch - 52) / 2, nw, 52);
}
function drawHUD() {
  ctx.fillStyle = '#1d2a3a';
  ctx.fillRect(0, FIELD_B, W, H - FIELD_B);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(0, FIELD_B, W, 1.5);
  // 皇冠与计时
  ctx.font = 'bold 15px "Microsoft YaHei",sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#7fa8ff';
  ctx.fillText('👑 ' + state.crowns[0], 16, FIELD_B + 16);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ff8a80';
  ctx.fillText(state.crowns[1] + ' 👑', W - 16, FIELD_B + 16);
  ctx.textAlign = 'center';
  ctx.font = 'bold 26px Consolas,monospace';
  ctx.fillStyle = state.time < 30 ? '#ff6b5e' : '#e8eef7';
  const m = Math.floor(Math.max(0, state.time) / 60);
  const s = Math.floor(Math.max(0, state.time) % 60);
  ctx.fillText(m + ':' + (s < 10 ? '0' : '') + s, W / 2, FIELD_B + 16);
  // 圣水条
  const bx = 30, by = FIELD_B + 30, bw = W - 60, bh = 18;
  rr(bx, by, bw, bh, 9);
  ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  for (let i = 1; i < 10; i++) ctx.fillRect(bx + (bw / 10) * i - 1, by, 2, bh);
  const frac = state.elixirP / ELIXIR_MAX;
  if (frac > 0) {
    const g = ctx.createLinearGradient(0, by, 0, by + bh);
    g.addColorStop(0, '#c26af0'); g.addColorStop(1, '#8a2be2');
    rr(bx + 2, by + 2, Math.max(6, (bw - 4) * frac), bh - 4, 7);
    ctx.fillStyle = g; ctx.fill();
  }
  ctx.font = 'bold 13px "Microsoft YaHei",sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.fillText('💧 ' + Math.floor(state.elixirP) + ' / ' + ELIXIR_MAX, W / 2, by + bh / 2 + 1);
  // 手牌
  drawHand();
}
function drawDrag() {
  if (!drag) return;
  if (drag.y < FIELD_B) {
    const card = CARDS[drag.id];
    const ok = canDeploy(drag.id, drag.x, drag.y, 0);
    ctx.beginPath();
    ctx.arc(drag.x, drag.y, card.type === 'spell' ? card.radius : card.r + 10, 0, Math.PI * 2);
    ctx.fillStyle = ok ? 'rgba(90,200,120,0.25)' : 'rgba(255,60,50,0.25)';
    ctx.fill();
    ctx.strokeStyle = ok ? '#5ec878' : '#ff5a4e';
    ctx.lineWidth = 2; ctx.stroke();
  }
  ctx.save();
  ctx.globalAlpha = 0.85;
  drawCard(drag.id, drag.x - 42, drag.y - 42, 84, 84, false);
  ctx.restore();
}

/* ---------------- 渲染：菜单 / 结算 ---------------- */
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
  const tg = ctx.createLinearGradient(0, 78, 0, 140);
  tg.addColorStop(0, '#ffe9a8'); tg.addColorStop(0.5, '#ffd94d'); tg.addColorStop(1, '#e8a33c');
  ctx.font = 'bold 56px "Microsoft YaHei",sans-serif';
  ctx.fillStyle = tg;
  ctx.fillText('皇冠对决', W / 2, 108);
  ctx.font = 'bold 15px Consolas,monospace';
  ctx.fillStyle = '#8fa3c0';
  ctx.fillText('C R O W N   D U E L', W / 2, 152);
  // 卡牌一览
  for (let i = 0; i < DECK.length; i++) {
    const cx = 46 + (i % 4) * 94, cy = 190 + Math.floor(i / 4) * 84;
    drawCard(DECK[i], cx - 36, cy - 36, 72, 72, false);
  }
  // 难度选择
  const dy = 372;
  const diffs = [['简单', 0], ['困难', 1]];
  for (let i = 0; i < 2; i++) {
    const x = W / 2 - 112 + i * 124, w = 100, h = 40;
    rr(x, dy, w, h, 20);
    const sel = state.difficulty === diffs[i][1];
    ctx.fillStyle = sel ? '#3d6fe0' : '#2a3a4e'; ctx.fill();
    ctx.strokeStyle = sel ? '#7fa8ff' : '#4a5b70'; ctx.lineWidth = 2; ctx.stroke();
    ctx.font = 'bold 16px "Microsoft YaHei",sans-serif';
    ctx.fillStyle = sel ? '#fff' : '#8fa3c0';
    ctx.fillText(diffs[i][0], x + w / 2, dy + h / 2 + 1);
    ui.menu.push({ id: 'diff' + diffs[i][1], x, y: dy, w, h });
  }
  // 开始按钮
  const sx = W / 2 - 100, sy = 436, sw = 200, sh = 58;
  const sg = ctx.createLinearGradient(0, sy, 0, sy + sh);
  sg.addColorStop(0, '#ffd94d'); sg.addColorStop(1, '#f0a832');
  rr(sx, sy, sw, sh, 14);
  ctx.fillStyle = sg; ctx.fill();
  ctx.strokeStyle = '#c8861e'; ctx.lineWidth = 2; ctx.stroke();
  ctx.font = 'bold 24px "Microsoft YaHei",sans-serif';
  ctx.fillStyle = '#241a08';
  ctx.fillText('🏰 开始对战', sx + sw / 2, sy + sh / 2 + 1);
  ui.menu.push({ id: 'start', x: sx, y: sy, w: sw, h: sh });
  // 说明
  ctx.font = '12px "Microsoft YaHei",sans-serif';
  ctx.fillStyle = '#6f829c';
  ctx.fillText('拖拽卡牌到己方半场部署 · 3 分钟内率先摧毁敌方国王塔者获胜', W / 2, 532);
  ctx.fillText('最后 60 秒双倍圣水 · 支持鼠标 / 触屏', W / 2, 552);
  ctx.font = '11px "Microsoft YaHei",sans-serif';
  ctx.fillStyle = '#54687e';
  ctx.fillText('原创 HTML5 Canvas 演示 · 灵感来自皇室战争品类 · v1.0', W / 2, H - 24);
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
  if (state.win === 0) { title = '胜利!'; tcol = '#ffd94d'; emoji = '🏆'; }
  else if (state.win === 1) { title = '战败'; tcol = '#ff6b5e'; emoji = '💀'; }
  else { title = '平局'; tcol = '#9fb3c8'; emoji = '🤝'; }
  ctx.font = '40px "Segoe UI Emoji",sans-serif';
  ctx.fillText(emoji, W / 2, py + 52);
  ctx.font = 'bold 38px "Microsoft YaHei",sans-serif';
  ctx.fillStyle = tcol;
  ctx.fillText(title, W / 2, py + 106);
  ctx.font = '13px "Microsoft YaHei",sans-serif';
  ctx.fillStyle = '#8fa3c0';
  ctx.fillText(state.reason, W / 2, py + 136);
  ctx.fillText('我方 👑 ×' + state.crowns[0] + '   ·   敌方 👑 ×' + state.crowns[1], W / 2, py + 162);
  const bs = [['replay', '再来一局', py + 196], ['menu', '返回主菜单', py + 248]];
  for (const b of bs) {
    const id = b[0], label = b[1], by = b[2], bw = 200, bh = 44, bx = W / 2 - bw / 2;
    rr(bx, by, bw, bh, 22);
    ctx.fillStyle = id === 'replay' ? '#3d6fe0' : '#2a3a4e'; ctx.fill();
    ctx.strokeStyle = '#5c6f86'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.font = 'bold 17px "Microsoft YaHei",sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText(label, W / 2, by + bh / 2 + 1);
    ui.over.push({ id, x: bx, y: by, w: bw, h: bh });
  }
}

/* ---------------- 渲染主循环 ---------------- */
function render() {
  ctx.clearRect(0, 0, W, H);
  if (state.screen === 'menu') { drawMenu(); return; }
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
  drawDrag();
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

/* ---------------- 输入 ---------------- */
canvas.addEventListener('pointerdown', (e) => {
  AudioSys.init();
  e.preventDefault();
  const p = toCanvas(e);
  if (state.screen === 'menu') {
    for (const b of ui.menu) {
      if (!inRect(p, b)) continue;
      if (b.id === 'start') newGame(state.difficulty);
      else if (b.id === 'diff0') state.difficulty = 0;
      else if (b.id === 'diff1') state.difficulty = 1;
      return;
    }
    return;
  }
  if (state.screen === 'over') {
    for (const b of ui.over) {
      if (!inRect(p, b)) continue;
      if (b.id === 'replay') newGame(state.difficulty);
      else if (b.id === 'menu') state.screen = 'menu';
      return;
    }
    return;
  }
  // 对战中
  if (drag) return;
  for (const c of ui.hand) {
    if (inRect(p, c)) {
      drag = { id: c.id, x: p.x, y: p.y, sx: p.x, sy: p.y, moved: false };
      selectId = c.id;
      return;
    }
  }
  // 点击战场：部署已选卡牌
  if (selectId) {
    if (p.y < FIELD_B && canDeploy(selectId, p.x, p.y, 0)) playCard(selectId, p.x, p.y, 0);
    if (state.elixirP < CARDS[selectId].cost || p.y >= FIELD_B) selectId = null;
  }
});
window.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const p = toCanvas(e);
  drag.x = p.x; drag.y = p.y;
  if (Math.hypot(p.x - drag.sx, p.y - drag.sy) > 10) drag.moved = true;
});
window.addEventListener('pointerup', (e) => {
  if (!drag) return;
  const p = toCanvas(e);
  if (drag.moved && p.y < FIELD_B && canDeploy(drag.id, p.x, p.y, 0)) {
    playCard(drag.id, p.x, p.y, 0);
  }
  drag = null;   // 未移动的点击保留 selectId，走点选部署流程
});
window.addEventListener('pointercancel', () => { drag = null; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

/* ---------------- 静音按钮 ---------------- */
const muteBtn = document.getElementById('muteBtn');
muteBtn.addEventListener('click', () => {
  muteBtn.textContent = AudioSys.toggle() ? '🔇' : '🔊';
});
