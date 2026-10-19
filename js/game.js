"use strict";
/* ============================================================
   皇冠对决 Crown Duel  v3.6
   HTML5 Canvas 塔防卡牌对战（单机 vs AI / 本地双人对战）
   灵感来自《部落冲突：皇室战争》的对战玩法，代码与美术均为原创实现。

   v3.6 更新：
   - 摧毁国王塔时其所有防御塔一并倒塌，胜方获得 3 皇冠
   - 双方塔攻击范围均小于到中分线的距离（不再隔河打人）
   - 11 档难度：简单→无双，AI 强度 / 圣水速率 / 胜利奖励逐档提升
   - 奖杯阶段宝箱：首次达到 300/700/1200/1800/2400/3000 奖杯自动开启
   - 卡牌按奖杯解锁：更高竞技场解锁更强卡牌（牌库与卡组界面显示🔒）
   - 建筑生命值全面上调，站场更久
   - 运动模型优化：单位按方向转身、接近攻击位自然减速、同队单位互相避让
   - 画面美化：场地草丛小花、河面波光、桥面光影、塔身光晕、画面暗角

   v3.1 更新：
   - 进度保存系统：对局每 3 秒自动保存，退出后可「继续上次对局」
   - 生涯战绩统计（总场次 / 胜 / 负 / 平 / 最高奖杯）
   - 存档导出 / 导入（JSON 文件，换浏览器换设备数据不丢）

   v3.0 更新：
   - 卡牌扩充至 62 张（新增 50 张：飞行单位 / 建筑 / 状态法术等）
   - 弓手攻击范围 115 → 95
   - 移除过河牵引，单位不再漂移
   - 角色语音：部署时念出台词（语音合成，可随音效一键静音）
   ============================================================ */

/* ---------------- 常量与工具 ---------------- */
const W = 420, H = 740;                    // 逻辑分辨率
const MATCH_TIME = 180;                    // 对局时长（秒）
const ELIXIR_MAX = 10, ELIXIR_START = 5, ELIXIR_RATE = 1 / 2.8;
// 11 档难度：影响 AI 等级 / 反应速度 / 圣水速率与胜利奖励
const DIFFS = ['简单', '普通', '标准', '较难', '困难', '极难', '专家', '宗师', '巅峰', '地狱', '无双'];
// 奖杯阶段宝箱：首次达到对应奖杯时自动开启一次
const CHESTS = [
  { at: 300, name: '青铜宝箱', gold: 300 },
  { at: 700, name: '白银宝箱', gold: 700 },
  { at: 1200, name: '黄金宝箱', gold: 1200 },
  { at: 1800, name: '传奇宝箱', gold: 1800 },
  { at: 2400, name: '宗师宝箱', gold: 2400 },
  { at: 3000, name: '巅峰宝箱', gold: 3000 },
];
const MAX_LV = 9;                          // 卡牌最高等级
const BRIDGE_X = W / 2;                    // 桥的位置
const BRIDGE_HALF = 55;                    // 桥的半宽（地面单位只能从桥上过河）
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

/* ---------------- 卡牌数据（62 张） ----------------
   基础数值，等级加成 = 1 + 0.1*(lv-1)
   行格式：[id, 名称, 表情, 费用, 类型, 血量, 伤害, 攻速, 射程, 移速, 目标, 半径, 扩展]
   扩展字段：count 数量 / splash 溅射 / fly 飞行 / slow 减速 / building 建筑 / 法术参数 */
const CARD_DEFS = [
  // —— 原有 12 张 ——
  ['swordsman',   '剑士',       '⚔️',  3, 'unit',     680,  95,  1.0, 22,  60,  'any', 14, null],
  ['knight',      '骑士',       '🐴',  3, 'unit',     1100, 120, 1.1, 22,  66,  'any', 14, null],
  ['archer',      '弓手',       '🏹',  3, 'unit',     270,  70,  1.0, 95,  60,  'any', 12, null],
  ['rascals',     '盗贼团伙',   '🥷',  3, 'unit',     215,  66,  1.1, 20,  74,  'any', 11, { count: 3 }],
  ['bomber',      '炮手',       '💣',  4, 'unit',     350,  140, 1.9, 95,  50,  'any', 13, { splash: 50 }],
  ['ogre',        '食人魔',     '👹',  4, 'unit',     1950, 150, 1.5, 26,  38,  'buildings', 20, null],
  ['giant',       '巨人',       '🗿',  5, 'unit',     2800, 110, 1.7, 28,  33,  'buildings', 21, null],
  ['pyromancer',  '火法师',     '🧙',  4, 'unit',     500,  125, 1.4, 105, 50,  'any', 13, { splash: 58 }],
  ['guard',       '王冠守卫',   '🛡️', 4, 'unit',     1500, 165, 1.6, 24,  42,  'any', 16, null],
  ['fireball',    '火球术',     '💥',  4, 'spell',    0,    310, 0,   0,   0,   'any', 0,  { radius: 72, towerFactor: 0.55 }],
  ['arrows',      '箭雨',       '🌧️', 3, 'spell',    0,    105, 0,   0,   0,   'any', 0,  { radius: 95, towerFactor: 0.4 }],
  ['heal',        '治疗术',     '💚',  3, 'spell',    0,    180, 0,   0,   0,   'any', 0,  { radius: 90 }],
  // —— 新增近战 / 地面单位 ——
  ['goblin',        '哥布林',       '👺',  2, 'unit', 80,   60,  1.1, 20,  105, 'any', 10, { count: 3 }],
  ['spearGoblin',   '掷矛哥布林',   '🎯',  2, 'unit', 90,   55,  1.3, 110, 105, 'any', 10, null],
  ['goblinThrower', '哥布林投手',   '🧪',  3, 'unit', 160,  90,  1.5, 100, 90,  'any', 11, null],
  ['barbarian',     '野蛮人',       '🪓',  4, 'unit', 900,  105, 1.4, 24,  60,  'any', 15, null],
  ['eliteBarbarian','精英野蛮人',   '🦾',  5, 'unit', 1350, 160, 1.3, 24,  66,  'any', 15, null],
  ['skeleton',      '骷髅兵',       '💀',  2, 'unit', 90,   55,  1.0, 20,  95,  'any', 9,  { count: 4 }],
  ['skeletonKing',  '骷髅王',       '🦴',  4, 'unit', 1700, 135, 1.5, 26,  55,  'any', 18, null],
  ['valkyrie',      '女武神',       '🌪️', 4, 'unit', 1100, 130, 1.5, 26,  60,  'any', 16, { splash: 45 }],
  ['darkPrince',    '黑暗王子',     '🖤',  4, 'unit', 1200, 150, 1.4, 26,  60,  'any', 16, { splash: 40 }],
  ['prince',        '王子',         '🤴',  4, 'unit', 1400, 220, 1.6, 26,  70,  'any', 15, null],
  ['shieldMaiden',  '盾女',         '⚜️',  3, 'unit', 850,  90,  1.2, 22,  55,  'any', 14, null],
  ['iceGolem',      '冰石人',       '⛄',  3, 'unit', 1000, 50,  2.0, 24,  45,  'any', 18, { slow: { t: 1.5, f: 0.5 } }],
  ['miniPekka',     '迷你皮卡',     '🔪',  4, 'unit', 1100, 260, 1.7, 24,  66,  'any', 15, null],
  ['werewolf',      '狼人',         '🐺',  4, 'unit', 1250, 170, 1.3, 24,  70,  'any', 16, null],
  ['goblinGang',    '哥布林大军',   '🪃',  4, 'unit', 95,   60,  1.2, 22,  100, 'any', 10, { count: 5 }],
  ['pekka',         '皮卡超人',     '🗡️', 6, 'unit', 2800, 320, 1.9, 26,  36,  'any', 21, null],
  // —— 远程 / 飞行单位 ——
  ['musketeer',    '火枪手',       '🔫',  4, 'unit', 420,  150, 1.5, 150, 55,  'any', 12, null],
  ['wizard',       '法师',         '🔮',  4, 'unit', 520,  135, 1.4, 105, 50,  'any', 13, { splash: 50 }],
  ['iceWizard',    '寒冰法师',     '🥶',  3, 'unit', 400,  75,  1.6, 100, 50,  'any', 12, { slow: { t: 1.2, f: 0.55 } }],
  ['knightArcher', '骑射手',       '🏇',  4, 'unit', 500,  85,  1.3, 110, 80,  'any', 13, null],
  ['babyDragon',   '飞龙宝宝',     '🐲',  4, 'unit', 800,  110, 1.5, 85,  65,  'any', 16, { fly: true, splash: 45 }],
  ['minions',      '亡灵',         '👻',  3, 'unit', 150,  60,  1.1, 22,  88,  'any', 10, { count: 3, fly: true }],
  ['minionHorde',  '亡灵大军',     '🌑',  4, 'unit', 150,  60,  1.1, 22,  88,  'any', 10, { count: 6, fly: true }],
  ['bats',         '蝙蝠',         '🦇',  2, 'unit', 65,   35,  1.0, 20,  105, 'any', 8,  { count: 5, fly: true }],
  ['lavaHound',    '熔岩猎犬',     '🐕',  7, 'unit', 3200, 65,  1.6, 24,  45,  'any', 22, { fly: true }],
  ['phoenix',      '凤凰',         '🐦‍🔥', 4, 'unit', 700, 120,  1.4, 85,  70,  'any', 15, { fly: true }],
  ['griffin',      '狮鹫',         '🦅',  4, 'unit', 1000, 140, 1.4, 90,  75,  'any', 17, { fly: true, splash: 40 }],
  // —— 攻城单位 ——
  ['hogRider',   '野猪骑士',   '🐗',  4, 'unit', 1250, 140, 1.5, 24,  95,  'buildings', 15, null],
  ['ramRider',   '攻城锤手',   '🔨',  4, 'unit', 1100, 120, 1.4, 24,  90,  'buildings', 15, null],
  ['royalGiant', '皇家巨人',   '🏰',  6, 'unit', 3200, 180, 1.8, 95,  30,  'buildings', 22, null],
  ['golem',      '石头人',     '🪨',  7, 'unit', 3800, 150, 2.0, 28,  26,  'buildings', 23, null],
  ['goblinGiant','哥布林巨人', '🎒',  5, 'unit', 2600, 110, 1.6, 26,  36,  'buildings', 21, null],
  ['balloon',    '气球兵',     '🎈',  4, 'unit', 900,  420, 2.2, 24,  55,  'buildings', 19, { fly: true, splash: 70 }],
  // —— 建筑 ——
  ['cannon',      '加农炮',       '🧨',  4, 'building', 1600, 85,  0.9,  150, 0, 'any', 18, { building: { kind: 'shooter' }, size: 1 }],
  ['mortar',      '迫击炮',       '🎇',  4, 'building', 1400, 170, 1.6,  220, 0, 'any', 18, { building: { kind: 'shooter' }, splash: 55, size: 1 }],
  ['tesla',       '特斯拉电磁塔', '⚡',  4, 'building', 1300, 75,  0.75, 140, 0, 'any', 16, { building: { kind: 'shooter' }, size: 1 }],
  ['xBow',        '弩炮',         '☄️', 5, 'building', 1900, 55,  0.35, 260, 0, 'any', 20, { building: { kind: 'shooter' }, size: 2 }],
  ['goblinHut',   '哥布林小屋',   '🛖',  4, 'building', 1800, 0,   0,    0,   0, 'any', 20, { building: { kind: 'spawner', interval: 4, max: 3, spawn: 'goblin' }, size: 2 }],
  ['tombstone',   '骷髅墓碑',     '🪦',  3, 'building', 1000, 0,   0,    0,   0, 'any', 16, { building: { kind: 'spawner', interval: 4.5, max: 3, spawn: 'skeleton' }, size: 1 }],
  ['elixirPump',  '圣水泵',       '🫗',  5, 'building', 1500, 0,   0,    0,   0, 'any', 18, { building: { kind: 'pump', interval: 11 }, size: 2 }],
  // —— 法术 ——
  ['freeze',       '冰冻术',   '🧊',  4, 'spell', 0, 0,   0, 0, 0, 'any', 0, { radius: 95, freeze: 2.2 }],
  ['poison',       '毒药',     '☠️', 4, 'spell', 0, 42,  0, 0, 0, 'any', 0, { radius: 95, zone: 'poison', duration: 6 }],
  ['rage',         '狂暴术',   '🔥',  3, 'spell', 0, 0,   0, 0, 0, 'any', 0, { radius: 110, zone: 'rage', duration: 5, boost: 1.4 }],
  ['log',          '滚木',     '🪵',  2, 'spell', 0, 180, 0, 0, 0, 'any', 0, { radius: 85, logRange: 170, width: 55 }],
  ['lightning',    '雷电术',   '🌩️', 4, 'spell', 0, 260, 0, 0, 0, 'any', 0, { radius: 130, strikes: 3, towerFactor: 0.35 }],
  ['rocket',       '火箭',     '🚀',  5, 'spell', 0, 700, 0, 0, 0, 'any', 0, { radius: 45, towerFactor: 0.4 }],
  ['earthquake',   '地震',     '🌋',  3, 'spell', 0, 250, 0, 0, 0, 'any', 0, { radius: 110, towerFactor: 2.2, buildingFactor: 1.5, unitFactor: 0.35 }],
  ['snowBall',     '雪球',     '❄️', 2, 'spell', 0, 90,  0, 0, 0, 'any', 0, { radius: 60, slow: { t: 1.0, f: 0.55 } }],
  ['meteorShower', '流星火雨', '💫',  6, 'spell', 0, 380, 0, 0, 0, 'any', 0, { radius: 110, towerFactor: 0.5 }],
  ['mirror',       '镜像术',   '🪞',  3, 'spell', 0, 0,   0, 0, 0, 'any', 0, { radius: 60 }],
];
/* 卡牌解锁：达到对应奖杯阶段解锁（未列出 = 0，新手训练场可用） */
const UNLOCK = {};
['eliteBarbarian', 'skeletonKing', 'valkyrie', 'darkPrince', 'prince', 'shieldMaiden', 'iceGolem', 'miniPekka', 'werewolf', 'goblinGang', 'wizard', 'iceWizard', 'minions', 'bats', 'lightning', 'freeze', 'poison', 'goblinHut'].forEach(id => UNLOCK[id] = 300);
['goblinThrower', 'knightArcher', 'minionHorde', 'phoenix', 'griffin', 'royalGiant', 'xBow', 'elixirPump', 'rage', 'earthquake'].forEach(id => UNLOCK[id] = 700);
['pekka', 'babyDragon', 'lavaHound', 'goblinGiant', 'balloon', 'rocket', 'meteorShower', 'mirror'].forEach(id => UNLOCK[id] = 1200);
['golem', 'giant', 'musketeer'].forEach(id => UNLOCK[id] = 1800);
function unlocked(id) { return save.trophies >= (UNLOCK[id] || 0); }
const CARDS = {};
const DECK = [];
for (const d of CARD_DEFS) {
  const [id, name, emoji, cost, type, hp, dmg, atk, range, speed, targets, r, ext] = d;
  CARDS[id] = { id, name, emoji, cost, type, hp, dmg, atk, range, speed, targets, r, ...(ext || {}) };
  DECK.push(id);
}

/* ---------------- 卡组系统（每场对局双方各携带 8 张） ---------------- */
const DECK_SIZE = 8;
const DEFAULT_DECK = ['swordsman', 'knight', 'archer', 'rascals', 'goblin', 'fireball', 'arrows', 'heal'];
function normalizeDeck(arr) {
  // 校验并补齐卡组：只保留存在的卡、去重，不足 8 张按默认卡组补足
  const out = [];
  if (Array.isArray(arr)) for (const id of arr) if (CARDS[id] && !out.includes(id)) out.push(id);
  for (const id of DEFAULT_DECK) if (out.length < DECK_SIZE && !out.includes(id)) out.push(id);
  for (const id of DECK) if (out.length < DECK_SIZE && !out.includes(id)) out.push(id);
  return out.slice(0, DECK_SIZE);
}
function randomAiDeck() {
  // AI 每局随机携带 8 张：5 单位 + 2 法术 + 1 建筑，保证有攻有守有解场
  const d = [];
  const take = (arr, n) => { let c = 0; for (const id of arr) { if (c >= n) break; if (!d.includes(id)) { d.push(id); c++; } } };
  // AI 只从已解锁的卡中随机（与玩家奖杯进度一致）
  take(shuffle(DECK.filter(id => unlocked(id) && CARDS[id].type === 'unit')), 5);
  take(shuffle(DECK.filter(id => unlocked(id) && CARDS[id].type === 'spell')), 2);
  take(shuffle(DECK.filter(id => unlocked(id) && CARDS[id].type === 'building')), 1);
  return d.slice(0, DECK_SIZE);
}

/* 角色台词（部署语音，不同角色不同音调语速） */
const VOICE = {
  swordsman: '为了王冠，冲啊！', knight: '骑士的荣耀，由我守护！', archer: '放箭！',
  rascals: '嘿嘿，一起上！', bomber: '炸弹来了，快躲开！', ogre: '食人魔来了！',
  giant: '巨人，前进！', pyromancer: '火焰净化一切！', guard: '王冠由我守护！',
  fireball: '火球降临！', arrows: '万箭齐发！', heal: '治愈之光！',
  goblin: '哥布林出击！', spearGoblin: '接矛！', goblinThrower: '吃我一瓶！',
  barbarian: '野蛮冲锋！', eliteBarbarian: '精英之力！', skeleton: '咔咔咔……',
  skeletonKing: '亡灵大军听令！', valkyrie: '旋风斩！', darkPrince: '黑暗降临！',
  prince: '王子冲锋！', shieldMaiden: '坚守阵地！', iceGolem: '冰冰凉。',
  miniPekka: '皮卡！', werewolf: '嗷呜——', goblinGang: '兄弟们上！', pekka: '皮卡！皮卡！',
  musketeer: '砰！', wizard: '魔法闪耀！', iceWizard: '冷静一下。', knightArcher: '箭在弦上！',
  babyDragon: '吼～', minions: '嘶嘶！', minionHorde: '大军压境！', bats: '吱吱吱！',
  lavaHound: '熔岩咆哮！', phoenix: '凤凰涅槃！', griffin: '狮鹫之翼！',
  hogRider: '野猪快跑！', ramRider: '攻城！', royalGiant: '皇家重炮！',
  golem: '轰隆——', goblinGiant: '大家伙来了！', balloon: '炸弹送达！',
  cannon: '轰！', mortar: '迫击炮就位！', tesla: '电流滋滋！', xBow: '弩炮连射！',
  goblinHut: '小屋建好了！', tombstone: '墓碑立起……', elixirPump: '圣水涓涓。',
  freeze: '冻结吧！', poison: '毒液蔓延……', rage: '狂暴起来！', log: '滚木来啦！',
  lightning: '天雷滚滚！', rocket: '火箭发射！', earthquake: '地动山摇！',
  snowBall: '雪球砸头！', meteorShower: '流星火雨！', mirror: '镜像复制！',
};

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

/* ---------------- 存档（奖杯 / 金币 / 卡牌等级 / 生涯战绩 / 对局进度） ---------------- */
const SAVE_KEY = 'crown-duel-save-v1';
const STATS_DEFAULT = { played: 0, wins: 0, losses: 0, draws: 0, best: 0 };
let save = loadSave();
function loadSave() {
  try {
    const d = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (d && d.v === 1) return {
      v: 1,
      trophies: d.trophies || 0,
      gold: d.gold || 0,
      levels: d.levels || {},
      stats: { ...STATS_DEFAULT, ...(d.stats || {}) },
      match: d.match || null,   // 未完成的对局快照，下次启动可继续
      deck: normalizeDeck(d.deck),   // 我方的 8 张卡组
      deck2: normalizeDeck(d.deck2), // 对方（双人模式玩家2）的 8 张卡组
      chests: Array.isArray(d.chests) ? d.chests.filter(n => typeof n === 'number') : [],   // 已开启的奖杯宝箱
    };
  } catch (e) { /* 首次游玩或存档损坏 */ }
  return { v: 1, trophies: 0, gold: 0, levels: {}, stats: { ...STATS_DEFAULT }, match: null, deck: normalizeDeck(null), deck2: normalizeDeck(null), chests: [] };
}
function saveGame() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* 忽略存储失败 */ }
}
/* 存档导入 / 导出（JSON 文件，用于换浏览器或换设备迁移数据） */
function parseSaveText(text) {
  try {
    const d = JSON.parse(text);
    if (d && d.v === 1) return d;
  } catch (e) { /* 非法内容 */ }
  return null;
}
function sanitizeLevels(lv) {
  const out = {};
  if (lv && typeof lv === 'object') {
    for (const k of Object.keys(lv)) {
      if (!DECK.includes(k)) continue;
      out[k] = clamp(Math.round(Number(lv[k]) || 1), 1, MAX_LV);
    }
  }
  return out;
}
function applyImportedSave(d) {
  if (!d) return false;
  save = {
    v: 1,
    trophies: clamp(Math.round(Number(d.trophies) || 0), 0, 999999),
    gold: clamp(Math.round(Number(d.gold) || 0), 0, 999999),
    levels: sanitizeLevels(d.levels),
    stats: { ...STATS_DEFAULT, ...(d.stats || {}) },
    match: null,   // 导入后不继承旧对局
    deck: normalizeDeck(d.deck),
    deck2: normalizeDeck(d.deck2),
    chests: Array.isArray(d.chests) ? d.chests.filter(n => typeof n === 'number') : [],
  };
  saveGame();
  return true;
}
function exportSave() {
  try {
    const blob = new Blob([JSON.stringify(save, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'crown-duel-save.json';
    a.click();
    URL.revokeObjectURL(a.href);
    AudioSys.upgrade();
  } catch (e) { /* 导出失败时静默 */ }
}
function importSave() {
  try {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,application/json';
    inp.onchange = () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        if (applyImportedSave(parseSaveText(String(rd.result)))) AudioSys.upgrade();
      };
      rd.readAsText(f);
    };
    inp.click();
  } catch (e) { /* 导入失败时静默 */ }
}
const lvOf = (id) => save.levels[id] || 1;
const mult = (lv) => 1 + (lv - 1) * 0.1;
const upgradeCost = (lv) => 60 * lv;
function upgradeCard(id) {
  if (!unlocked(id)) return false;   // 未解锁的卡不能升级
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
  // —— 环境音：不同竞技场不同氛围，音量保持很小 ——
  ambArena: -1, ambGain: null, ambNodes: [], ambTimer: null,
  startAmbient(a) {
    if (this.ambArena === a && this.ctx) return;
    this.stopAmbient();
    this.ambArena = a;
    if (!this.ctx) return;
    const c = this.ctx;
    const g = c.createGain();
    g.gain.value = 0.06;   // 环境音总音量：很轻
    g.connect(this.master);
    this.ambGain = g;
    const noise = (sec) => {
      const b = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * sec)), c.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const s = c.createBufferSource(); s.buffer = b; s.loop = true; s.start();
      this.ambNodes.push(s);
      return s;
    };
    const pass = (s, type, f, q = 0.5) => {
      const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      s.connect(fl); fl.connect(g);
      this.ambNodes.push(fl);
    };
    const tone = (f, v = 0.05, type = 'sine') => {
      const o = c.createOscillator(); o.type = type; o.frequency.value = f;
      const og = c.createGain(); og.gain.value = v;
      o.connect(og); og.connect(g); o.start();
      this.ambNodes.push(o, og);
    };
    const chirp = (f0, f1, f2, dur, vol, every) => {
      this.ambTimer = setInterval(() => {
        if (!this.ctx) return;
        const t0 = this.ctx.currentTime;
        const o = this.ctx.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(f0, t0);
        o.frequency.linearRampToValueAtTime(f1, t0 + dur * 0.4);
        o.frequency.linearRampToValueAtTime(f2, t0 + dur);
        const og = this.ctx.createGain();
        og.gain.setValueAtTime(0.0001, t0);
        og.gain.linearRampToValueAtTime(vol, t0 + 0.02);
        og.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(og); og.connect(g);
        o.start(t0); o.stop(t0 + dur + 0.05);
      }, every);
    };
    if (a === 0) {            // 新手训练场：草地微风 + 偶发鸟鸣
      pass(noise(2), 'lowpass', 700);
      chirp(2200, 2800, 2000, 0.2, 0.05, 4500 + Math.random() * 4000);
    } else if (a === 1) {     // 青铜荒漠：沙风 + 低沉地鸣
      pass(noise(2), 'bandpass', 650, 0.7);
      tone(55, 0.03);
    } else if (a === 2) {     // 白银石地：空洞风声
      pass(noise(2), 'lowpass', 350);
      tone(120, 0.015); tone(121.5, 0.015);
    } else if (a === 3) {     // 黄金圣殿：暖色和声 + 悠远钟声
      tone(220, 0.02, 'triangle'); tone(221.5, 0.02, 'triangle');
      chirp(880, 880, 880, 1.6, 0.04, 6000 + Math.random() * 5000);
    } else {                  // 传奇竞技场：暗黑低鸣
      pass(noise(2), 'lowpass', 240);
      tone(65, 0.04);
    }
  },
  stopAmbient() {
    if (this.ambTimer) { clearInterval(this.ambTimer); this.ambTimer = null; }
    for (const n of this.ambNodes) {
      try { if (n.stop) n.stop(); else n.disconnect(); } catch (e) { /* 已停止 */ }
      try { n.disconnect(); } catch (e) { /* 已断开 */ }
    }
    this.ambNodes = [];
    if (this.ambGain) { try { this.ambGain.disconnect(); } catch (e) { /* 已断开 */ } this.ambGain = null; }
    this.ambArena = -1;
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

/* 角色语音（语音合成念台词，静音时关闭） */
function sayVoice(id) {
  const line = VOICE[id];
  if (!line || AudioSys.muted) return;
  try {
    if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') return;
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff;
    if (speechSynthesis.speaking) speechSynthesis.cancel();   // 只保留最新一句，避免嘈杂
    const u = new SpeechSynthesisUtterance(line);
    u.lang = 'zh-CN';
    u.pitch = 0.7 + (h % 6) * 0.12;    // 每个角色不同音调
    u.rate = 0.95 + (h % 4) * 0.08;    // 不同语速
    u.volume = 0.9;
    speechSynthesis.speak(u);
  } catch (e) { /* 语音不可用时静默 */ }
}

/* ---------------- 全局状态 ---------------- */
let uid = 1;
let state = { screen: 'menu', difficulty: 0 };
const ui = { menu: [], deck: [], deckedit: [], over: [], hand: [], hand2: [] };   // 命中区域（每帧重建）
const drags = new Map();    // pointerId -> { id, team, x, y, sx, sy, moved }
let select = null;          // 点选待部署的卡 { id, team }
let kbCursor = null;        // 双人模式键盘光标（我方用 1-4/WASD/空格操作，敌方用鼠标）
let clock = 0;              // 全局动画时钟
let deckScroll = 0;         // 牌库滚动
let deckDrag = null;        // 牌库拖拽滚动状态 { y, s }
let deckSel = null;         // 卡组编辑中已选卡牌（进入编辑界面时从存档载入）
let deckEditTeam = 0;       // 正在编辑哪一方的卡组（0 我方 / 1 对方，仅双人模式有意义）
let deckEditScroll = 0;     // 卡组编辑滚动
let deckEditDrag = null;    // 卡组编辑拖拽滚动状态 { y, s }
let deckEditMsg = '';       // 卡组编辑提示
let deckEditMsgT = 0;       // 卡组编辑提示剩余时间

/* ---------------- 实体 ---------------- */
function makeTower(team, kind, x, y) {
  const king = kind === 'king';
  const cy = (F.top + F.bottom) / 2;
  // 塔攻击范围必须小于到中分线的距离（随战场高度自动收缩）
  const cap = Math.abs(y - cy) - 10;
  return {
    isTower: true, id: uid++, team, kind, x, y, r: king ? 30 : 26,
    hp: king ? 4200 : 2800, maxHp: king ? 4200 : 2800,
    dmg: king ? 68 : 52, atk: 0.7, range: king ? Math.min(165, cap) : Math.min(180, cap),
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
    freeze: 0, slowT: 0, slowF: 1,
  };
}
function makeBuilding(card, team, x, y, lv) {
  const m = mult(lv);
  const b = card.building;
  return {
    isBuilding: true, id: uid++, card, team, x, y, r: card.r, lv,
    hp: Math.round(card.hp * m), maxHp: Math.round(card.hp * m),
    dmg: Math.round(card.dmg * m), range: card.range, atk: card.atk,
    splash: card.splash || 0, kind: b.kind,
    cooldown: 0, timer: b.interval || 0, spawn: b.spawn, max: b.max || 0,
    dead: false,
  };
}
function makeProj(src, target) {
  return { x: src.x, y: src.y - src.r * 0.2, tx: target, team: src.team, dmg: src.dmg, speed: 380, splash: src.splash || 0, dead: false };
}

/* ---------------- 对局初始化 ---------------- */
function drawN(queue, n, deck) {
  const out = [];
  for (let i = 0; i < n; i++) {
    if (!queue.length) queue.push(...shuffle(deck));   // 牌堆循环只从本局卡组（8 张）中发牌
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
  // 卡组：我方用保存的卡组；AI 每局随机 8 张；双人模式双方各自用保存的卡组
  const deck0 = normalizeDeck(save.deck);
  const deck1 = mode === 'pvp' ? normalizeDeck(save.deck2) : randomAiDeck();
  // AI 等级随难度提高：简单 ×0.9 → 无双 ×1.5
  const aiLv = clamp(Math.round(deck0.reduce((s, id) => s + lvOf(id), 0) / deck0.length * (0.9 + difficulty * 0.06)), 1, MAX_LV);
  state = {
    mode, difficulty, screen: 'playing', over: false,
    time: MATCH_TIME, elapsed: 0, doubleSaid: false,
    elixir: [ELIXIR_START, ELIXIR_START],
    units: [], projs: [], parts: [], texts: [],
    buildings: [], zones: [], lastUnit: [null, null],
    towers: [
      makeTower(1, 'king', 210, F.top + 42), makeTower(1, 'guard', 105, F.top + 92), makeTower(1, 'guard', 315, F.top + 92),
      makeTower(0, 'guard', 105, F.bottom - 92), makeTower(0, 'guard', 315, F.bottom - 92), makeTower(0, 'king', 210, F.bottom - 42),
    ],
    crowns: [0, 0], shake: 0, win: null, reason: '', reward: null,
    arena: arenaOf(), aiLv,
    decks: [deck0.slice(), deck1.slice()],
    ai: { t: 1.2 },
    saveT: 3,   // 对局进度定期保存倒计时
  };
  state.queue = [shuffle(deck0), shuffle(deck1)];
  state.hand = [drawN(state.queue[0], 4, deck0), drawN(state.queue[1], 4, deck1)];
  drags.clear(); select = null; kbCursor = null;
  save.match = null;   // 新开对局清掉旧的未完成对局
  saveGame();
}

/* ---------------- 对局进度保存与恢复 ---------------- */
function serializeMatch() {
  if (state.screen !== 'playing') return null;
  return {
    mode: state.mode, difficulty: state.difficulty,
    time: state.time, elapsed: state.elapsed, doubleSaid: state.doubleSaid,
    elixir: state.elixir.slice(), crowns: state.crowns.slice(),
    hand: [state.hand[0].slice(), state.hand[1].slice()],
    queue: [state.queue[0].slice(), state.queue[1].slice()],
    decks: [state.decks[0].slice(), state.decks[1].slice()],
    aiLv: state.aiLv, aiT: state.ai.t,
    towers: state.towers.map(t => ({ id: t.id, team: t.team, kind: t.kind, x: t.x, y: t.y, hp: t.hp, awake: t.awake, cooldown: t.cooldown, dead: t.dead })),
    units: state.units.map(u => ({ id: u.id, card: u.card.id, team: u.team, x: u.x, y: u.y, lv: u.lv, hp: u.hp, cooldown: u.cooldown, freeze: u.freeze, slowT: u.slowT, slowF: u.slowF, target: u.target ? u.target.id : null })),
    buildings: state.buildings.map(b => ({ id: b.id, card: b.card.id, team: b.team, x: b.x, y: b.y, lv: b.lv, hp: b.hp, cooldown: b.cooldown, timer: b.timer })),
    zones: state.zones.map(z => ({ kind: z.kind, team: z.team, x: z.x, y: z.y, r: z.r, life: z.life, total: z.total, dps: z.dps, boost: z.boost, tick: z.tick })),
    projs: state.projs.map(p => ({ x: p.x, y: p.y, team: p.team, dmg: p.dmg, speed: p.speed, splash: p.splash, target: (p.tx && p.tx.id) || null })),
    lastUnit: state.lastUnit.map(l => (l ? { card: l.card.id, lv: l.lv } : null)),
  };
}
function restoreMatch(d) {
  if (!d || !d.mode) return false;
  const pvp = d.mode === 'pvp';
  F.top = pvp ? 132 : 0;
  F.bottom = pvp ? 612 : 565;
  const cy = (F.top + F.bottom) / 2;
  F.riverTop = cy - 25; F.riverBot = cy + 25;
  const towers = d.towers.map(t => {
    const tw = makeTower(t.team, t.kind, t.x, t.y);
    tw.id = t.id; tw.hp = t.hp; tw.awake = t.awake; tw.cooldown = t.cooldown; tw.dead = t.dead;
    return tw;
  });
  const units = d.units.filter(u => CARDS[u.card]).map(u => {
    const un = spawnUnit(CARDS[u.card], u.team, u.x, u.y, u.lv);
    un.id = u.id; un.hp = u.hp; un.cooldown = u.cooldown; un.freeze = u.freeze; un.slowT = u.slowT; un.slowF = u.slowF;
    un._targetId = u.target;
    return un;
  });
  const buildings = d.buildings.filter(b => CARDS[b.card]).map(b => {
    const bb = makeBuilding(CARDS[b.card], b.team, b.x, b.y, b.lv);
    bb.id = b.id; bb.hp = b.hp; bb.cooldown = b.cooldown; bb.timer = b.timer;
    return bb;
  });
  state = {
    mode: d.mode, difficulty: d.difficulty, screen: 'playing', over: false,
    time: d.time, elapsed: d.elapsed, doubleSaid: !!d.doubleSaid,
    elixir: d.elixir, units, towers, buildings,
    zones: d.zones.map(z => ({ ...z })),
    parts: [], texts: [],
    projs: d.projs.map(p => ({ x: p.x, y: p.y, tx: null, team: p.team, dmg: p.dmg, speed: p.speed, splash: p.splash, dead: false, _targetId: p.target })),
    crowns: d.crowns, shake: 0, win: null, reason: '', reward: null,
    arena: arenaOf(), aiLv: d.aiLv,
    queue: d.queue, hand: d.hand, lastUnit: d.lastUnit,
    decks: d.decks ? [normalizeDeck(d.decks[0]), normalizeDeck(d.decks[1])] : [DECK.slice(), DECK.slice()],
    ai: { t: d.aiT || 0 },
    saveT: 3,
  };
  // 重建实体引用（目标 / 箭矢），并保证新实体 id 不与恢复的冲突
  const byId = {};
  let maxId = 0;
  for (const t of state.towers) { byId[t.id] = t; if (t.id > maxId) maxId = t.id; }
  for (const u of state.units) { byId[u.id] = u; if (u.id > maxId) maxId = u.id; }
  for (const b of state.buildings) { byId[b.id] = b; if (b.id > maxId) maxId = b.id; }
  uid = maxId + 1;
  for (const u of state.units) { u.target = byId[u._targetId] || null; delete u._targetId; }
  for (const p of state.projs) { p.tx = byId[p._targetId] || null; delete p._targetId; }
  drags.clear(); select = null; kbCursor = null;
  return true;
}
function saveMatchNow() {
  if (state.screen === 'playing') save.match = serializeMatch();
  else save.match = null;
  saveGame();
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
    if (tw.kind === 'king') {
      // 国王塔被摧毁：同方守卫塔连带倒塌，获胜方拿到满 3 冠
      for (const g of state.towers) {
        if (g.team === tw.team && g.kind === 'guard' && !g.dead) {
          g.dead = true;
          state.crowns[winner]++;
          for (let i = 0; i < 20; i++) state.parts.push({ x: g.x, y: g.y, vx: rand(-180, 180), vy: rand(-200, 100), g: 420, life: rand(0.4, 0.9), r: rand(3, 6), col: pick(['#ffdd55', '#ff9933', '#8a7352', '#fff']) });
          addText(g.x, g.y - 24, '公主塔倒塌!', '#ff6b5e', 15);
        }
      }
      endGame(winner, '国王塔被摧毁');
    }
  }
}
function damageBuilding(b, dmg) {
  if (b.dead) return;
  b.hp -= dmg;
  addText(b.x, b.y - b.r - 12, String(Math.round(dmg)), '#ffd94d', 12);
  if (b.hp <= 0) {
    b.dead = true;
    spawnBoom(b.x, b.y);
    addText(b.x, b.y - 26, b.card.name + '被摧毁!', '#ff6b5e', 15);
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
  // 奖杯与金币、生涯战绩（仅单人模式结算）
  if (state.mode === 'ai') {
    let t = 0, g = 0;
    if (state.win === 0) { t = 50 + state.difficulty * 10; g = 60 + state.difficulty * 10; }
    else if (state.win === 1) { t = -25; g = 20; }
    else { t = 15; g = 30; }
    save.trophies = Math.max(0, save.trophies + t);
    save.gold += g;
    state.reward = { t, g };
    // 奖杯宝箱：首次达到对应奖杯阶段自动开启
    const chests = [];
    for (const c of CHESTS) if (save.trophies >= c.at && !save.chests.includes(c.at)) { save.chests.push(c.at); save.gold += c.gold; chests.push(c); }
    if (chests.length) state.reward.chests = chests;
    save.stats.played++;
    if (state.win === 0) save.stats.wins++;
    else if (state.win === 1) save.stats.losses++;
    else save.stats.draws++;
    save.stats.best = Math.max(save.stats.best, save.trophies);
  }
  save.match = null;   // 对局结束，清除进行中对局快照
  saveGame();
  if (state.win === 0) AudioSys.win(); else if (state.win === 1) AudioSys.lose();
}

/* ---------------- 单位 ---------------- */
function findTarget(u) {
  const towers = state.towers, buildings = state.buildings;
  // 只攻击建筑的单位：找最近的敌方塔或建筑
  if (u.card.targets === 'buildings') {
    let best = null, bd = Infinity;
    for (const t of towers) if (!t.dead && t.team !== u.team) {
      const d = dist2(u.x, u.y, t.x, t.y);
      if (d < bd) { bd = d; best = t; }
    }
    for (const b of buildings) if (!b.dead && b.team !== u.team) {
      const d = dist2(u.x, u.y, b.x, b.y);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }
  // 普通单位：优先攻击附近（横向 140 内）的敌方单位
  // 地面近战单位（射程 ≤ 30 且不会飞）打不到飞行单位
  let best = null, bd = 190;
  for (const e of state.units) {
    if (e.dead || e.team === u.team) continue;
    if (e.card.fly && !u.card.fly && u.card.range <= 30) continue;
    if (Math.abs(e.x - u.x) > 140) continue;
    const d = dist2(u.x, u.y, e.x, e.y);
    if (d < bd) { bd = d; best = e; }
  }
  if (best) return best;
  // 否则向最近的敌方塔/建筑推进
  bd = Infinity;
  for (const t of towers) if (!t.dead && t.team !== u.team) {
    const d = dist2(u.x, u.y, t.x, t.y);
    if (d < bd) { bd = d; best = t; }
  }
  for (const b of buildings) if (!b.dead && b.team !== u.team) {
    const d = dist2(u.x, u.y, b.x, b.y);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}
function doAttack(u, t) {
  if (u.card.splash) {
    spawnBoom(t.x, t.y);
    AudioSys.hit();
    for (const e of state.units) if (!e.dead && e.team !== u.team && dist2(e.x, e.y, t.x, t.y) < u.card.splash + e.r) damageUnit(e, u.dmg);
    for (const tw of state.towers) if (!tw.dead && tw.team !== u.team && dist2(tw.x, tw.y, t.x, t.y) < u.card.splash + tw.r) damageTower(tw, u.dmg);
    for (const b of state.buildings) if (!b.dead && b.team !== u.team && dist2(b.x, b.y, t.x, t.y) < u.card.splash + b.r) damageBuilding(b, u.dmg);
  } else {
    spawnHit(t.x, t.y);
    AudioSys.hit();
    if (t.isTower) damageTower(t, u.dmg);
    else if (t.isBuilding) damageBuilding(t, u.dmg);
    else damageUnit(t, u.dmg);
  }
  // 攻击附带减速（寒冰法师 / 冰石人 / 雪球）
  if (u.card.slow && t.isUnit) { t.slowT = u.card.slow.t; t.slowF = u.card.slow.f; }
}
function updateUnits(dt) {
  const units = state.units;
  for (let i = units.length - 1; i >= 0; i--) {
    const u = units[i];
    if (u.dead) { units.splice(i, 1); continue; }
    // 冰冻：完全停住
    if (u.freeze > 0) { u.freeze -= dt; continue; }
    const px = u.x;
    u.cooldown -= dt;
    u.lunge = Math.max(0, u.lunge - dt * 3.2);
    u.slowT = Math.max(0, u.slowT - dt);
    if (!u.target || u.target.dead) u.target = findTarget(u);
    const t = u.target;
    // 狂暴区域内加速
    const rz = state.zones.find(z => z.kind === 'rage' && z.team === u.team && dist2(u.x, u.y, z.x, z.y) < z.r);
    const spd = u.speed * (u.slowT > 0 ? u.slowF : 1) * (rz ? rz.boost : 1);
    if (!t) {
      // 无目标：向敌方推进；地面单位过河同样走桥
      if (u.card.fly) {
        u.y += spd * dt * (u.team === 0 ? -1 : 1);
      } else {
        const wp = riverWaypoint(u, { x: u.x, y: u.team === 0 ? F.top + 10 : F.bottom - 10 });
        if (wp) moveBy(u, wp.x, wp.y, spd, dt);
        else u.y += spd * dt * (u.team === 0 ? -1 : 1);
      }
    } else {
      const rr = u.r + (t.r || 0) + (u.card.range || 0);
      const d = dist2(u.x, u.y, t.x, t.y);
      if (d > rr) {
        const wp = u.card.fly ? null : riverWaypoint(u, t);
        // 接近攻击位时自然减速（绕桥途中全速，避免卡在桥头）
        const ease = wp ? 1 : (d < 26 ? 0.55 + 0.45 * (d / 26) : 1);
        moveBy(u, wp ? wp.x : t.x, wp ? wp.y : t.y, spd * ease, dt);
      } else if (u.cooldown <= 0) {
        u.cooldown = u.card.atk;
        u.lunge = 1;
        doAttack(u, t);
      }
    }
    u.x = clamp(u.x, 16, W - 16);
    u.y = clamp(u.y, F.top + 14, F.bottom - 14);
    // 兜底：地面单位不得站在桥外的河面上
    if (!u.card.fly && u.y > F.riverTop && u.y < F.riverBot && Math.abs(u.x - BRIDGE_X) > BRIDGE_HALF) {
      u.y = u.team === 0 ? F.riverBot : F.riverTop;
    }
    // 面向：按水平移动方向翻转绘制
    if (Math.abs(u.x - px) > 0.01) u.dir = u.x > px ? 1 : -1;
  }
  // 同队单位互相推开，避免完全重叠（河面边缘不推，防止被挤下河）
  for (let i = 0; i < units.length; i++) {
    const a = units[i];
    if (a.dead) continue;
    for (let j = i + 1; j < units.length; j++) {
      const b = units[j];
      if (b.dead || b.team !== a.team) continue;
      const dd = dist2(a.x, a.y, b.x, b.y);
      const min = (a.r + b.r) * 0.9;
      if (dd >= min) continue;
      if (dd < 0.01) { a.x += 0.5; b.x -= 0.5; continue; }   // 完全重叠时沿水平错开
      const nearRiver = u => !u.card.fly && u.y > F.riverTop - 16 && u.y < F.riverBot + 16 && Math.abs(u.x - BRIDGE_X) > BRIDGE_HALF;
      if (nearRiver(a) || nearRiver(b)) continue;
      const push = (min - dd) * Math.min(1, dt * 4) * 0.5;
      const nx = (a.x - b.x) / dd, ny = (a.y - b.y) / dd;
      a.x += nx * push; a.y += ny * push;
      b.x -= nx * push; b.y -= ny * push;
    }
  }
}

function moveBy(u, tx, ty, spd, dt) {
  const d = dist2(u.x, u.y, tx, ty);
  if (d < 0.001) return;
  const sp = Math.min(spd * dt, d);
  u.x += (tx - u.x) / d * sp;
  u.y += (ty - u.y) / d * sp;
}
function riverWaypoint(u, t) {
  // 地面单位过河必须走桥：先到桥头（己方一侧），再垂直过桥到对岸；飞行单位不受限
  if (u.card.fly) return null;
  const across = u.team === 0 ? (u.y > F.riverTop && t.y < F.riverTop) : (u.y < F.riverBot && t.y > F.riverBot);
  if (!across) return null;
  const bx = clamp(u.x, BRIDGE_X - BRIDGE_HALF, BRIDGE_X + BRIDGE_HALF);
  const own = u.team === 0 ? F.riverBot + 12 : F.riverTop - 12;
  const far = u.team === 0 ? F.riverTop - 12 : F.riverBot + 12;
  if (Math.abs(u.x - BRIDGE_X) > BRIDGE_HALF || (u.team === 0 ? u.y > own + 6 : u.y < own - 6)) {
    return { x: bx, y: own };   // 先绕行到桥头
  }
  if (u.team === 0 ? u.y > far : u.y < far) return { x: bx, y: far };   // 垂直过桥
  return null;   // 已过河，直接奔向目标
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
      else if (t.isBuilding) damageBuilding(t, p.dmg);
      else damageUnit(t, p.dmg);
      // 溅射（迫击炮）
      if (p.splash > 0) {
        for (const e of state.units) {
          if (e.dead || e.team === p.team || e === t) continue;
          if (dist2(e.x, e.y, t.x, t.y) < p.splash + e.r) damageUnit(e, p.dmg);
        }
      }
      p.dead = true;
    } else {
      p.x += (t.x - p.x) / d * step;
      p.y += (t.y - p.y) / d * step;
    }
  }
}

/* ---------------- 建筑 ---------------- */
function updateBuildings(dt) {
  for (const b of state.buildings) {
    if (b.dead) continue;
    if (b.kind === 'shooter') {
      b.cooldown -= dt;
      if (b.cooldown > 0) continue;
      let best = null, bd = b.range;
      for (const u of state.units) {
        if (u.dead || u.team === b.team) continue;
        const d = dist2(u.x, u.y, b.x, b.y);
        if (d < bd) { bd = d; best = u; }
      }
      if (best) { b.cooldown = b.atk; state.projs.push(makeProj(b, best)); AudioSys.arrow(); }
    } else {
      b.timer -= dt;
      if (b.timer <= 0) {
        if (b.kind === 'pump') {
          b.timer = b.card.building.interval;
          state.elixir[b.team] = Math.min(ELIXIR_MAX, state.elixir[b.team] + 1);
          addText(b.x, b.y - b.r - 12, '+1 💧', '#c26af0', 14);
        } else {
          b.timer = b.card.building.interval;
          const alive = state.units.filter(u => !u.dead && u.team === b.team && u.card.id === b.spawn && dist2(u.x, u.y, b.x, b.y) < 160).length;
          if (alive < b.max) {
            const sx = b.x + rand(-30, 30);
            state.units.push(spawnUnit(CARDS[b.spawn], b.team, sx, b.y, b.lv));
          }
        }
      }
    }
  }
  // 清理死亡建筑
  for (let i = state.buildings.length - 1; i >= 0; i--) {
    if (state.buildings[i].dead) state.buildings.splice(i, 1);
  }
}

/* ---------------- 区域法术 ---------------- */
function updateZones(dt) {
  for (let i = state.zones.length - 1; i >= 0; i--) {
    const z = state.zones[i];
    z.life -= dt;
    if (z.life <= 0) { state.zones.splice(i, 1); continue; }
    if (z.kind === 'poison') {
      z.tick -= dt;
      if (z.tick <= 0) {
        z.tick = 0.5;
        for (const u of state.units) {
          if (!u.dead && u.team !== z.team && dist2(u.x, u.y, z.x, z.y) < z.r + u.r) damageUnit(u, z.dps);
        }
      }
    }
  }
}

/* ---------------- 法术 ---------------- */
function castSpell(card, x, y, team, lv) {
  const m = mult(lv);
  const dmg = Math.round(card.dmg * m);
  const id = card.id;
  if (id === 'heal') {
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
  if (id === 'freeze') {
    AudioSys.tone(900, 300, 0.3, 'sine', 0.5);
    for (let i = 0; i < 18; i++) state.parts.push({ x: x + rand(-card.radius, card.radius), y: y + rand(-card.radius, card.radius), vx: 0, vy: 0, g: 0, life: rand(0.4, 0.8), r: rand(2, 4), col: pick(['#bfe8ff', '#7fd4ff', '#ffffff']) });
    for (const u of state.units) {
      if (u.dead || u.team === team) continue;
      if (dist2(u.x, u.y, x, y) < card.radius + u.r) u.freeze = card.freeze;
    }
    return;
  }
  if (id === 'poison' || id === 'rage') {
    AudioSys.tone(id === 'poison' ? 200 : 400, id === 'poison' ? 90 : 700, 0.4, 'sawtooth', 0.4);
    state.zones.push({
      kind: id, team, x, y, r: card.radius,
      life: card.duration, total: card.duration,
      dps: id === 'poison' ? Math.round(card.dmg * m) : 0,
      boost: card.boost || 1, tick: 0,
    });
    return;
  }
  if (id === 'log') {
    AudioSys.boom();
    for (let i = 0; i < 20; i++) state.parts.push({ x: x + rand(-card.logRange, card.logRange), y: y + rand(-card.width, card.width), vx: 0, vy: rand(-40, 40), g: 0, life: 0.4, r: rand(2, 4), col: '#a9743f' });
    for (const u of state.units) {
      if (u.dead || u.team === team) continue;
      if (Math.abs(u.x - x) <= card.logRange && Math.abs(u.y - y) <= card.width) damageUnit(u, dmg);
    }
    for (const b of state.buildings) {
      if (b.dead || b.team === team) continue;
      if (Math.abs(b.x - x) <= card.logRange && Math.abs(b.y - y) <= card.width) damageBuilding(b, dmg);
    }
    return;
  }
  if (id === 'lightning') {
    AudioSys.noise(0.3, 0.8, 600);
    AudioSys.tone(1200, 200, 0.25, 'sawtooth', 0.5);
    const targets = [];
    for (const u of state.units) if (!u.dead && u.team !== team && dist2(u.x, u.y, x, y) < card.radius + u.r) targets.push(u);
    for (const b of state.buildings) if (!b.dead && b.team !== team && dist2(b.x, b.y, x, y) < card.radius + b.r) targets.push(b);
    for (const tw of state.towers) if (!tw.dead && tw.team !== team && dist2(tw.x, tw.y, x, y) < card.radius + tw.r) targets.push(tw);
    targets.sort((a, b) => b.hp - a.hp);
    for (let i = 0; i < Math.min(card.strikes, targets.length); i++) {
      const t = targets[i];
      for (let k = 0; k < 8; k++) state.parts.push({ x: t.x + rand(-14, 14), y: t.y + rand(-20, 20), vx: rand(-60, 60), vy: rand(-120, -40), g: 0, life: 0.3, r: rand(2, 4), col: pick(['#fff9a8', '#ffe94d', '#ffffff']) });
      if (t.isTower) damageTower(t, Math.round(dmg * card.towerFactor));
      else if (t.isBuilding) damageBuilding(t, dmg);
      else damageUnit(t, dmg);
    }
    return;
  }
  if (id === 'earthquake') {
    AudioSys.towerDown();
    state.shake = Math.max(state.shake, 12);
    for (let i = 0; i < 24; i++) state.parts.push({ x: x + rand(-card.radius, card.radius), y: y + rand(-card.radius, card.radius), vx: rand(-50, 50), vy: rand(-160, -60), g: 300, life: rand(0.4, 0.8), r: rand(2, 5), col: pick(['#8a7352', '#a98951', '#6b5a3e']) });
    for (const u of state.units) if (!u.dead && u.team !== team && dist2(u.x, u.y, x, y) < card.radius + u.r) damageUnit(u, Math.round(dmg * card.unitFactor));
    for (const b of state.buildings) if (!b.dead && b.team !== team && dist2(b.x, b.y, x, y) < card.radius + b.r) damageBuilding(b, Math.round(dmg * card.buildingFactor));
    for (const tw of state.towers) if (!tw.dead && tw.team !== team && dist2(tw.x, tw.y, x, y) < card.radius + tw.r) damageTower(tw, Math.round(dmg * card.towerFactor));
    return;
  }
  if (id === 'snowBall') {
    AudioSys.tone(700, 300, 0.2, 'sine', 0.5);
    for (let i = 0; i < 10; i++) state.parts.push({ x: x + rand(-card.radius, card.radius), y: y + rand(-card.radius, card.radius), vx: rand(-30, 30), vy: rand(-40, 40), g: 0, life: 0.4, r: rand(2, 4), col: '#dff2ff' });
    for (const u of state.units) {
      if (u.dead || u.team === team) continue;
      if (dist2(u.x, u.y, x, y) < card.radius + u.r) {
        damageUnit(u, dmg);
        u.slowT = card.slow.t; u.slowF = card.slow.f;
      }
    }
    return;
  }
  if (id === 'mirror') {
    AudioSys.deploy();
    const last = state.lastUnit[team];
    if (last) {
      // 存档恢复后 lastUnit 里的 card 是 id 字符串，这里统一转回卡牌对象
      const lc = typeof last.card === 'string' ? CARDS[last.card] : last.card;
      if (lc) {
        const copy = spawnUnit(lc, team, x, y, last.lv);
        state.units.push(copy);
        spawnRing(x, y, team);
        addText(x, y - 30, '镜像复制!', '#9dffb0', 15);
      }
    }
    return;
  }
  // 爆炸类：fireball / rocket / meteorShower
  const big = id === 'meteorShower', small = id === 'rocket';
  AudioSys.boom();
  state.shake = Math.max(state.shake, big ? 13 : small ? 8 : 9);
  const n = big ? 34 : small ? 18 : 26;
  for (let i = 0; i < n; i++) state.parts.push({ x, y, vx: rand(-170, 170), vy: rand(-190, 90), g: 300, life: rand(0.4, 0.85), r: rand(3, 7), col: pick(['#ffdd55', '#ff9933', '#ff5533', '#ffe9a8']) });
  if (id === 'arrows') {
    AudioSys.arrowRain();
    for (let w = 0; w < 3; w++) for (let i = 0; i < 9; i++) state.parts.push({ x: x + rand(-card.radius, card.radius), y: y - rand(0, card.radius), vx: rand(-24, 24), vy: rand(260, 400), g: 520, life: 0.5, r: 2, col: '#cfe6ff', streak: true });
  }
  for (const u of state.units) if (!u.dead && u.team !== team && dist2(u.x, u.y, x, y) < card.radius + u.r) damageUnit(u, dmg);
  for (const b of state.buildings) if (!b.dead && b.team !== team && dist2(b.x, b.y, x, y) < card.radius + b.r) damageBuilding(b, dmg);
  for (const tw of state.towers) if (!tw.dead && tw.team !== team && dist2(tw.x, tw.y, x, y) < card.radius + tw.r) damageTower(tw, Math.round(dmg * card.towerFactor));
}

/* ---------------- 出牌 ---------------- */
// 部署网格：战场划分为小方格，卡牌只能从格子中心开始放置
const CELL = 20;
function snapCell(x, y) {
  return { x: (Math.floor(x / CELL) + 0.5) * CELL, y: (Math.floor(y / CELL) + 0.5) * CELL };
}
// 建筑占地格数（边长，1 = 1×1，2 = 2×2）；单位与法术占 1 格
function footprint(id) {
  const card = CARDS[id];
  return card.type === 'building' ? (card.size || 1) : 1;
}
// 占格校验：size×size 的每个格子都要在可部署范围内
function canPlaceAt(id, x, y, team) {
  const s = footprint(id);
  const off = (s - 1) * CELL / 2;
  for (let i = 0; i < s; i++) for (let j = 0; j < s; j++) {
    const cx = x - off + i * CELL, cy = y - off + j * CELL;
    if (cx < 18 || cx > W - 18 || !canDeploy(id, cx, cy, team)) return false;
  }
  return true;
}
function canDeploy(id, x, y, team) {
  const card = CARDS[id];
  if (state.elixir[team] < card.cost) return false;
  if (x < 18 || x > W - 18) return false;
  if (card.type === 'spell') { if (y < F.top + 26 || y > F.bottom - 14) return false; }
  else {
    const own = team === 0 ? (y >= F.riverBot - 12 && y <= F.bottom - 22) : (y <= F.riverTop + 12 && y >= F.top + 30);
    if (!own) {
      // 拆掉敌方一座塔后，可在该塔所在边路把卡部署到敌方半场（中路仍需先拆两侧塔，国王塔摧毁即结束）
      const far = team === 0 ? (y >= F.top + 30 && y <= F.riverTop + 12) : (y <= F.bottom - 22 && y >= F.riverBot - 12);
      const laneOpen = (l) => state.towers.some(tw => tw.dead && tw.team !== team && tw.kind === 'guard' && ((l === 'L' && tw.x < 140) || (l === 'R' && tw.x > 280)));
      const lane = x < 140 ? 'L' : x > 280 ? 'R' : 'M';
      if (!far || (lane === 'M' ? !(laneOpen('L') && laneOpen('R')) : !laneOpen(lane))) return false;
    }
  }
  for (const tw of state.towers) if (!tw.dead && tw.team === team && dist2(tw.x, tw.y, x, y) < tw.r + 16) return false;
  return true;
}
function playCard(id, x, y, team) {
  const card = CARDS[id];
  const lv = levelOf(team, id);
  state.elixir[team] -= card.cost;
  state.hand[team].splice(state.hand[team].indexOf(id), 1);
  state.hand[team].push(drawN(state.queue[team], 1, state.decks[team])[0]);
  if (card.type === 'spell') {
    castSpell(card, x, y, team, lv);
  } else if (card.type === 'building') {
    state.buildings.push(makeBuilding(card, team, x, y, lv));
    spawnRing(x, y, team);
  } else {
    const n = card.count || 1;
    for (let k = 0; k < n; k++) {
      state.units.push(spawnUnit(card, team, x + (k - (n - 1) / 2) * 30, y + (k - (n - 1) / 2) * 12, lv));
    }
    state.lastUnit[team] = { card, lv };
    spawnRing(x, y, team);
  }
  AudioSys.deploy();
  // 角色语音：AI 不说话，只有玩家自己的卡牌念台词
  if (state.mode !== 'ai' || team === 0) sayVoice(id);
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
  // AI 圣水速率随难度变化：简单 0.9× → 无双 1.15×（双人模式双方一致）
  const aiRate = state.mode === 'ai' ? 0.9 + state.difficulty * 0.025 : 1;
  state.elixir[1] = clamp(state.elixir[1] + ELIXIR_RATE * m2 * dt * aiRate, 0, ELIXIR_MAX);
  updateTowers(dt);
  updateUnits(dt);
  updateBuildings(dt);
  updateZones(dt);
  updateProjs(dt);
  updateFx(dt);
  // 定期保存对局进度（3 秒一次，退出后可继续）
  state.saveT -= dt;
  if (state.saveT <= 0) { state.saveT = 3; saveMatchNow(); }
  if (state.mode === 'ai') aiUpdate(dt);
  if (state.time <= 0) endGame(null, '时间结束');
}

/* ---------------- AI ---------------- */
const AI_PUSH_TANKS = ['royalGiant', 'golem', 'goblinGiant', 'giant', 'ogre', 'hogRider', 'ramRider', 'balloon', 'lavaHound', 'pekka'];
const AI_DEF_UNITS = ['knight', 'swordsman', 'rascals', 'barbarian', 'valkyrie', 'goblinGang', 'iceWizard', 'wizard', 'pyromancer', 'musketeer', 'bomber', 'shieldMaiden', 'iceGolem', 'miniPekka', 'prince', 'darkPrince', 'skeletonKing'];
const AI_SPELLS_CLUSTER = ['meteorShower', 'fireball', 'arrows', 'snowBall', 'log', 'freeze', 'poison'];
const AI_SPELLS_FINISH = ['fireball', 'rocket', 'meteorShower', 'lightning'];
function aiUpdate(dt) {
  const ai = state.ai;
  ai.t -= dt;
  if (ai.t > 0) return;
  const d = state.difficulty, tier = d / 10;   // 0=简单 … 1=无双
  ai.t = rand(0.95, 1.45) - tier * 0.85;       // 反应速度随难度加快
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

  // 1) 法术清场：己方半场聚集了敌方单位
  if (crossed.length >= Math.max(2, Math.ceil(3 - tier))) {
    const spell = AI_SPELLS_CLUSTER.find(s => can.includes(s));
    if (spell) {
      const c = centroid(crossed);
      playCard(spell, c.x, c.y, 1);
      return;
    }
  }
  // 2) 法术终结残血塔
  const weak = state.towers.filter(t => !t.dead && t.team === 0 && t.hp < 300 + Math.round(250 * tier));
  if (weak.length) {
    const spell = AI_SPELLS_FINISH.find(s => can.includes(s));
    if (spell) {
      const t = weak[0];
      playCard(spell, t.x, t.y, 1);
      return;
    }
  }
  // 3) 拍出兵营建筑（上限 2 座）
  const spawnerCard = hand.find(id => CARDS[id].type === 'building' && CARDS[id].building && CARDS[id].building.kind === 'spawner');
  if (spawnerCard && state.buildings.filter(b => b.team === 1).length < 2 && el >= 5) {
    const lane = Math.random() < 0.5 ? 105 : 315;
    playCard(spawnerCard, lane, F.top + 215, 1);
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
    if (threat >= Math.max(2.5, 4 - tier * 1.5)) {
      const c = centroid(crossed);
      const lane = c.x < 210 ? 105 : 315;
      const def = AI_DEF_UNITS.find(id => can.includes(id));
      if (def) {
        playCard(def, lane + rand(-28, 28), rand(F.top + 128, F.top + 170), 1);
        return;
      }
    }
  }
  // 6) 进攻：攒够圣水组织推进
  if (el >= 5.5 - tier * 1.2) {
    const lane = Math.random() < 0.5 ? 105 : 315;
    const tank = AI_PUSH_TANKS.find(id => can.includes(id));
    const id = tank || AI_DEF_UNITS.find(c => can.includes(c));
    if (id) {
      playCard(id, lane + rand(-25, 25), rand(F.top + 85, F.top + 145), 1);
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
  // 场地装饰：草丛与小花（伪随机固定分布，河面跳过）
  let seedN = 0;
  const srand = () => { const s = Math.sin(seedN++ * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  ctx.lineCap = 'round';
  for (let i = 0; i < 46; i++) {
    const x = 16 + srand() * (W - 32);
    const y = F.top + 16 + srand() * (F.bottom - F.top - 32);
    if (y > F.riverTop - 10 && y < F.riverBot + 10) continue;
    if (srand() < 0.5) {
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.10 + srand() * 0.10) + ')';
      ctx.lineWidth = 1.2;
      for (let b = -1; b <= 1; b++) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + b * 3.5, y - 4 - srand() * 3);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = 'rgba(255,214,120,' + (0.14 + srand() * 0.12) + ')';
      ctx.beginPath(); ctx.arc(x, y, 1.6 + srand() * 1.2, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.lineCap = 'butt';
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
  // 桥（纯装饰，不影响单位路径）
  const bw = 110, bx = BRIDGE_X - bw / 2, by = F.riverTop - 6, bh = F.riverBot - F.riverTop + 12;
  ctx.fillStyle = '#a9743f'; ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = '#8a5c30';
  for (let i = 0; i < bh; i += 12) ctx.fillRect(bx, by + i, bw, 2);
  ctx.fillStyle = '#c98d52';
  ctx.fillRect(bx - 4, by, 4, bh); ctx.fillRect(bx + bw, by, 4, bh);
  // 桥面光影与描边
  const bg2 = ctx.createLinearGradient(0, by, 0, by + bh);
  bg2.addColorStop(0, 'rgba(0,0,0,0.18)');
  bg2.addColorStop(0.5, 'rgba(255,255,255,0.10)');
  bg2.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = bg2;
  ctx.fillRect(bx, by, bw, bh);
  ctx.strokeStyle = 'rgba(255,230,180,0.5)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(bx + 1, by + 1, bw - 2, bh - 2);
  // 河面波光（闪烁光点）
  for (let i = 0; i < 14; i++) {
    const sx = srand() * W, sy = F.riverTop + 5 + srand() * (F.riverBot - F.riverTop - 10);
    if (Math.abs(sx - BRIDGE_X) < BRIDGE_HALF + 8) continue;
    const tw = 0.25 + 0.25 * Math.sin(state.elapsed * 3 + i * 2.1);
    ctx.fillStyle = 'rgba(255,255,255,' + Math.max(0.05, tw) + ')';
    ctx.beginPath(); ctx.arc(sx, sy, 1.4, 0, Math.PI * 2); ctx.fill();
  }
  // 石墙边界
  ctx.strokeStyle = '#8a7352'; ctx.lineWidth = 6;
  ctx.strokeRect(3, F.top + 3, W - 6, F.bottom - F.top - 6);
  ctx.strokeStyle = '#cbb48f'; ctx.lineWidth = 2;
  ctx.strokeRect(6, F.top + 6, W - 12, F.bottom - F.top - 12);
}
function drawZones() {
  for (const z of state.zones) {
    const a = clamp(z.life / z.total, 0, 1);
    ctx.beginPath();
    ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2);
    ctx.fillStyle = z.kind === 'poison' ? 'rgba(150,70,200,' + 0.22 * a + ')' : 'rgba(255,80,190,' + 0.18 * a + ')';
    ctx.fill();
    ctx.strokeStyle = z.kind === 'poison' ? 'rgba(190,120,240,' + 0.6 * a + ')' : 'rgba(255,140,220,' + 0.6 * a + ')';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}
function hpBar(x, y, w, ratio, team, h = 5) {
  const f = clamp(ratio, 0, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(x - w / 2, y, w, h);
  // 阵营着色：我方绿色、敌方红色
  ctx.fillStyle = team === 0 ? '#4ade62' : '#ff4d4f';
  ctx.fillRect(x - w / 2, y, w * f, h);
}
// 双人模式下，上方阵营（玩家2）的实体上下翻转绘制，坐对面看才是正的
function flipTeam1(team) { return state.mode === 'pvp' && team === 1; }
function drawTower(tw) {
  ctx.save();
  if (flipTeam1(tw.team)) { ctx.translate(tw.x, tw.y); ctx.rotate(Math.PI); ctx.translate(-tw.x, -tw.y); }
  if (tw.dead) {
    ctx.fillStyle = 'rgba(40,34,28,0.85)';
    ctx.beginPath(); ctx.arc(tw.x, tw.y, tw.r * 0.8, 0, Math.PI * 2); ctx.fill();
    ctx.font = '22px "Segoe UI Emoji",sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('💀', tw.x, tw.y);
    ctx.restore();
    return;
  }
  const stone = '#cbb48f', dark = '#8a7352';
  const col = tw.team === 0 ? '#3d6fe0' : '#d84a42';
  // 塔身阵营色光晕
  const glow = ctx.createRadialGradient(tw.x, tw.y, tw.r * 0.4, tw.x, tw.y, tw.r * 2.2);
  const gc = tw.team === 0 ? '61,111,224' : '216,74,66';
  glow.addColorStop(0, 'rgba(' + gc + ',0.18)');
  glow.addColorStop(1, 'rgba(' + gc + ',0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(tw.x, tw.y, tw.r * 2.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.ellipse(tw.x, tw.y + tw.r * 0.62, tw.r + 7, tw.r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
  rr(tw.x - tw.r, tw.y - tw.r * 0.45, tw.r * 2, tw.r * 1.75, 6);
  ctx.fillStyle = stone; ctx.fill();
  ctx.strokeStyle = dark; ctx.lineWidth = 2; ctx.stroke();
  const cw = tw.r * 0.62, ch = tw.r * 0.5;
  for (let i = -1; i <= 1; i++) {
    rr(tw.x + i * tw.r * 0.62 - cw / 2, tw.y - tw.r * 0.45 - ch, cw, ch, 3);
    ctx.fillStyle = stone; ctx.fill();
    ctx.strokeStyle = dark; ctx.stroke();
  }
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
  if (tw.kind === 'king') {
    ctx.font = '16px "Segoe UI Emoji",sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('👑', tw.x, Math.max(F.top + 22, tw.y - tw.r - 24));
  }
  hpBar(tw.x, tw.y - tw.r - 10, tw.r * 2, tw.hp / tw.maxHp, tw.team);
  ctx.restore();
}
function drawUnit(u) {
  ctx.save();
  if (flipTeam1(u.team)) { ctx.translate(u.x, u.y); ctx.rotate(Math.PI); ctx.translate(-u.x, -u.y); }
  // 阵营光圈 + 影子
  ctx.strokeStyle = u.team === 0 ? 'rgba(90,160,255,0.45)' : 'rgba(255,90,80,0.45)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(u.x, u.y + u.r * 0.8, u.r * 0.95, u.r * 0.4, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(u.x, u.y + u.r * 0.8, u.r * 0.9, u.r * 0.38, 0, 0, Math.PI * 2); ctx.fill();
  const sc = 1 + u.lunge * 0.14;
  ctx.save();
  ctx.translate(u.x, u.y);
  ctx.scale(sc * (u.dir < 0 ? -1 : 1), sc);   // 按移动方向水平翻转
  ctx.font = Math.round(u.r * 2.7) + 'px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(u.card.emoji, 0, 2);
  ctx.restore();
  // 冰冻标记
  if (u.freeze > 0) {
    ctx.font = Math.round(u.r * 1.2) + 'px "Segoe UI Emoji",sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🧊', u.x + u.r * 0.8, u.y - u.r * 0.9);
  }
  hpBar(u.x, u.y - u.r - 12, u.r * 2.2, u.hp / u.maxHp, u.team, 4);
  ctx.restore();
}
function drawBuilding(b) {
  ctx.save();
  if (flipTeam1(b.team)) { ctx.translate(b.x, b.y); ctx.rotate(Math.PI); ctx.translate(-b.x, -b.y); }
  ctx.strokeStyle = b.team === 0 ? 'rgba(90,160,255,0.45)' : 'rgba(255,90,80,0.45)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(b.x, b.y + b.r * 0.8, b.r * 0.95, b.r * 0.4, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(b.x, b.y + b.r * 0.8, b.r * 0.9, b.r * 0.38, 0, 0, Math.PI * 2); ctx.fill();
  ctx.font = Math.round(b.r * 2.2) + 'px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(b.card.emoji, b.x, b.y);
  hpBar(b.x, b.y - b.r - 10, b.r * 2, b.hp / b.maxHp, b.team);
  ctx.restore();
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
    ctx.save();
    if (flipTeam1(team)) { ctx.translate(x + cw / 2, y + ch / 2); ctx.rotate(Math.PI); ctx.translate(-(x + cw / 2), -(y + ch / 2)); }
    drawCard(hand[i], x, y, cw, ch, select && select.team === team && select.id === hand[i], team);
    ctx.restore();
    rects.push({ id: hand[i], team, x, y, w: cw, h: ch });
  }
  const nx = x0 + cw * 4 + gap * 3 + 6;
  if (state.queue[team].length) {
    ctx.save();
    if (flipTeam1(team)) { ctx.translate(nx + 20, y + (ch - 52) / 2 + 26); ctx.rotate(Math.PI); ctx.translate(-(nx + 20), -(y + (ch - 52) / 2 + 26)); }
    drawMini(state.queue[team][0], nx, y + (ch - 52) / 2, 40, 52);
    ctx.restore();
  }
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
  elixirBar(0, 30, b + 30, W - 60, 18);
  ui.hand = [];
  drawHand(0, 12, b + 56, 84, 84, 8, ui.hand);
}
function drawHUDPvP() {
  ctx.fillStyle = '#1d2a3a';
  ctx.fillRect(0, 0, W, F.top);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(0, F.top - 1.5, W, 1.5);
  ui.hand2 = [];
  drawHand(1, 12, 4, 84, 80, 8, ui.hand2);
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
  ctx.font = '11px "Microsoft YaHei",sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#8fa3c0';
  ctx.fillText('⌨️ 下方玩家：1-4 选卡 · WASD 移动 · 空格部署　|　🖱️ 上方玩家：鼠标操作', W / 2, 140);
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
function drawGrid() {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  for (let gx = 0; gx <= W; gx += CELL) { ctx.moveTo(gx, F.top); ctx.lineTo(gx, F.bottom); }
  for (let gy = Math.ceil(F.top / CELL) * CELL; gy <= F.bottom; gy += CELL) { ctx.moveTo(0, gy); ctx.lineTo(W, gy); }
  ctx.stroke();
  ctx.restore();
}
function drawDrags() {
  for (const d of drags.values()) {
    if (d.y >= F.top && d.y <= F.bottom) {
      const card = CARDS[d.id];
      const sc = snapCell(d.x, d.y);
      const s = footprint(d.id);
      const ok = canPlaceAt(d.id, sc.x, sc.y, d.team);
      const rad = card.type === 'spell' ? (card.radius || 40) : card.r + 10;
      ctx.beginPath();
      ctx.arc(sc.x, sc.y, rad, 0, Math.PI * 2);
      ctx.fillStyle = ok ? 'rgba(90,200,120,0.25)' : 'rgba(255,60,50,0.25)';
      ctx.fill();
      ctx.strokeStyle = ok ? '#5ec878' : '#ff5a4e';
      ctx.lineWidth = 2; ctx.stroke();
      // 占地格高亮（建筑按 size×size 显示，单位/法术 1 格）
      const off = (s - 1) * CELL / 2;
      for (let i = 0; i < s; i++) for (let j = 0; j < s; j++) {
        const gx = sc.x - off + i * CELL, gy = sc.y - off + j * CELL;
        ctx.fillStyle = ok ? 'rgba(90,200,120,0.3)' : 'rgba(255,60,50,0.3)';
        ctx.fillRect(gx - CELL / 2, gy - CELL / 2, CELL, CELL);
        ctx.strokeStyle = ok ? 'rgba(94,200,120,0.9)' : 'rgba(255,90,78,0.9)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(gx - CELL / 2, gy - CELL / 2, CELL, CELL);
      }
    }
    ctx.save();
    ctx.globalAlpha = 0.85;
    if (flipTeam1(d.team)) { ctx.translate(d.x, d.y); ctx.rotate(Math.PI); ctx.translate(-d.x, -d.y); }
    drawCard(d.id, d.x - 42, d.y - 42, 84, 84, false, d.team);
    ctx.restore();
  }
}
function drawKbCursor() {
  if (state.mode !== 'pvp' || state.screen !== 'playing' || !kbCursor) return;
  const sc = snapCell(kbCursor.x, kbCursor.y);
  const sel = select && select.team === 0 ? select : null;
  const ok = sel ? canPlaceAt(sel.id, sc.x, sc.y, 0) : true;
  ctx.save();
  ctx.strokeStyle = sel ? (ok ? 'rgba(94,200,120,0.95)' : 'rgba(255,90,78,0.95)') : 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(sc.x - CELL / 2, sc.y - CELL / 2, CELL, CELL);
  if (sel) {
    const s = footprint(sel.id);
    const off = (s - 1) * CELL / 2;
    for (let i = 0; i < s; i++) for (let j = 0; j < s; j++) {
      const gx = sc.x - off + i * CELL, gy = sc.y - off + j * CELL;
      ctx.fillStyle = ok ? 'rgba(90,200,120,0.3)' : 'rgba(255,60,50,0.3)';
      ctx.fillRect(gx - CELL / 2, gy - CELL / 2, CELL, CELL);
    }
    ctx.globalAlpha = 0.85;
    drawCard(sel.id, kbCursor.x - 42, kbCursor.y - 42, 84, 84, true, 0);
    ctx.globalAlpha = 1;
  } else {
    ctx.beginPath();
    ctx.moveTo(kbCursor.x - 9, kbCursor.y); ctx.lineTo(kbCursor.x + 9, kbCursor.y);
    ctx.moveTo(kbCursor.x, kbCursor.y - 9); ctx.lineTo(kbCursor.x, kbCursor.y + 9);
    ctx.stroke();
  }
  ctx.restore();
}

/* ---------------- 渲染：菜单 / 牌库 / 结算 ---------------- */
function drawMenu() {
  ui.menu = [];
  ctx.fillStyle = '#14203a';
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 46; i++) {
    const sx = (i * 97 + 13) % W, sy = (i * 53 + 29) % 300;
    ctx.globalAlpha = 0.25 + 0.35 * Math.abs(Math.sin(clock * 1.5 + i));
    ctx.fillStyle = '#cfe0ff';
    ctx.beginPath(); ctx.arc(sx, sy, 1.2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const tg = ctx.createLinearGradient(0, 44, 0, 100);
  tg.addColorStop(0, '#ffe9a8'); tg.addColorStop(0.5, '#ffd94d'); tg.addColorStop(1, '#e8a33c');
  ctx.font = 'bold 46px "Microsoft YaHei",sans-serif';
  ctx.fillStyle = tg;
  ctx.fillText('皇冠对决', W / 2, 68);
  ctx.font = 'bold 13px Consolas,monospace';
  ctx.fillStyle = '#8fa3c0';
  ctx.fillText('C R O W N   D U E L', W / 2, 104);
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
  const hasMatch = !!save.match;   // 有未完成对局时显示「继续上次对局」
  const btns = [];
  if (hasMatch) btns.push({ id: 'resume', label: '▶ 继续上次对局', y: 234, accent: true });
  btns.push({ id: 'ai', label: '⚔ 单人挑战', y: hasMatch ? 286 : 238 });
  btns.push({ id: 'pvp', label: '👥 双人对战', y: hasMatch ? 334 : 286 });
  btns.push({ id: 'deck', label: '🃏 卡牌升级', y: hasMatch ? 382 : 334 });
  btns.push({ id: 'deckedit', label: '🎴 选择卡组（8 张）', y: hasMatch ? 430 : 382 });
  ctx.textAlign = 'center';
  for (const b of btns) {
    const bw = 260, bh = b.accent ? 44 : 50, bx = W / 2 - bw / 2;
    rr(bx, b.y, bw, bh, 14);
    ctx.fillStyle = b.accent ? '#2e8b4a' : '#2c3c50'; ctx.fill();
    ctx.strokeStyle = b.accent ? '#5ec878' : '#4a5b70'; ctx.lineWidth = 2; ctx.stroke();
    ctx.font = 'bold 20px "Microsoft YaHei",sans-serif';
    ctx.fillStyle = b.accent ? '#d8ffe0' : '#e8eef7';
    ctx.fillText(b.label, W / 2, b.y + bh / 2 + 1);
    ui.menu.push({ id: b.id, x: bx, y: b.y, w: bw, h: bh });
  }
  const dy = hasMatch ? 478 : 428;
  // 难度循环选择：◀ 当前难度（显示该档胜利奖杯）▶
  const dl = { x: W / 2 - 132, w: 36 }, dc = { x: W / 2 - 92, w: 184 }, dr = { x: W / 2 + 96, w: 36 }, dh = 38;
  rr(dl.x, dy, dl.w, dh, 19);
  ctx.fillStyle = '#2a3a4e'; ctx.fill();
  ctx.strokeStyle = '#4a5b70'; ctx.lineWidth = 2; ctx.stroke();
  ctx.font = 'bold 18px "Microsoft YaHei",sans-serif';
  ctx.fillStyle = '#8fa3c0';
  ctx.fillText('◀', dl.x + dl.w / 2, dy + dh / 2 + 1);
  ui.menu.push({ id: 'diffl', x: dl.x, y: dy, w: dl.w, h: dh });
  rr(dc.x, dy, dc.w, dh, 19);
  ctx.fillStyle = '#3d6fe0'; ctx.fill();
  ctx.strokeStyle = '#7fa8ff'; ctx.lineWidth = 2; ctx.stroke();
  ctx.font = 'bold 14px "Microsoft YaHei",sans-serif';
  ctx.fillStyle = '#fff';
  ctx.fillText('⚔ ' + DIFFS[state.difficulty] + ' · +' + (50 + state.difficulty * 10) + '🏆', W / 2, dy + dh / 2 + 1);
  ui.menu.push({ id: 'diff', x: dc.x, y: dy, w: dc.w, h: dh });
  rr(dr.x, dy, dr.w, dh, 19);
  ctx.fillStyle = '#2a3a4e'; ctx.fill();
  ctx.strokeStyle = '#4a5b70'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#8fa3c0';
  ctx.fillText('▶', dr.x + dr.w / 2, dy + dh / 2 + 1);
  ui.menu.push({ id: 'diffr', x: dr.x, y: dy, w: dr.w, h: dh });
  // 宝箱里程碑一览（达到奖杯自动开启）
  ctx.font = '10px "Microsoft YaHei",sans-serif';
  ctx.fillStyle = '#6f829c';
  ctx.fillText('宝箱 🎁 ' + CHESTS.map(c => (save.trophies >= c.at && !save.chests.includes(c.at) ? '🔔' : save.chests.includes(c.at) ? '✅' : '🔒') + c.at).join(' '), W / 2, dy + dh + 14);
  // 生涯战绩
  const st = save.stats || {};
  ctx.textAlign = 'center';
  ctx.font = '12px "Microsoft YaHei",sans-serif';
  ctx.fillStyle = '#8fa3c0';
  ctx.fillText('📊 总场次 ' + (st.played || 0) + ' · 胜 ' + (st.wins || 0) + ' · 负 ' + (st.losses || 0) + ' · 平 ' + (st.draws || 0) + ' · 最高 🏆' + (st.best || save.trophies || 0), W / 2, hasMatch ? 546 : 498);
  // 当前出战卡组
  ctx.font = '12px "Segoe UI Emoji","Microsoft YaHei",sans-serif';
  ctx.fillStyle = '#a8bcd8';
  ctx.fillText('出战卡组 ' + save.deck.map(id => CARDS[id] ? CARDS[id].emoji : '❓').join(' '), W / 2, hasMatch ? 562 : 514);
  // 存档导入 / 导出
  const eb = [{ id: 'export', label: '📤 导出存档', x: 30 }, { id: 'import', label: '📥 导入存档', x: 220 }];
  for (const b of eb) {
    rr(b.x, 608, 170, 36, 10);
    ctx.fillStyle = '#2a3a4e'; ctx.fill();
    ctx.strokeStyle = '#4a5b70'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.font = '13px "Microsoft YaHei",sans-serif';
    ctx.fillStyle = '#e8eef7';
    ctx.fillText(b.label, b.x + 85, 626);
    ui.menu.push({ id: b.id, x: b.x, y: 608, w: 170, h: 36 });
  }
  ctx.font = '12px "Microsoft YaHei",sans-serif';
  ctx.fillStyle = '#6f829c';
  const hy = hasMatch ? 566 : 512;
  ctx.fillText('拖拽卡牌到己方半场部署 · 拆掉敌方塔可扩大部署范围', W / 2, hy);
  ctx.fillText('地面单位只能从桥过河 · 飞行单位可任意飞越', W / 2, hy + 20);
  ctx.font = '11px "Microsoft YaHei",sans-serif';
  ctx.fillStyle = '#54687e';
  ctx.fillText('原创 HTML5 Canvas 演示 · 灵感来自皇室战争品类 · v3.6', W / 2, H - 24);
}
function deckMaxScroll() {
  const ch = 100, gy = 8, y0 = 84;
  const rows = Math.ceil(DECK.length / 2);
  const contentH = rows * (ch + gy) + y0 + 8;
  return Math.max(0, contentH - 84 - (H - 84 - 8));
}
function drawDeck() {
  ui.deck = [];
  ctx.fillStyle = '#14203a';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 22px "Microsoft YaHei",sans-serif';
  ctx.fillStyle = '#ffd94d';
  ctx.fillText('🃏 卡牌升级', 20, 32);
  ctx.textAlign = 'right';
  ctx.font = 'bold 16px "Microsoft YaHei",sans-serif';
  ctx.fillStyle = '#ffd94d';
  ctx.fillText('🪙 ' + save.gold, W - 20, 32);
  const bx = 20, by = 44, bw = 64, bh = 30;
  rr(bx, by, bw, bh, 15);
  ctx.fillStyle = '#2a3a4e'; ctx.fill();
  ctx.strokeStyle = '#4a5b70'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.textAlign = 'center';
  ctx.font = '13px "Microsoft YaHei",sans-serif';
  ctx.fillStyle = '#e8eef7';
  ctx.fillText('← 返回', bx + bw / 2, by + bh / 2 + 1);
  ui.deck.push({ id: 'back', x: bx, y: by, w: bw, h: bh });
  // 滚动列表（2 列 × N 行）
  const cw = 172, ch = 100, gx = 16, gy = 8, y0 = 84;
  const maxScroll = deckMaxScroll();
  deckScroll = clamp(deckScroll, 0, maxScroll);
  for (let i = 0; i < DECK.length; i++) {
    const id = DECK[i];
    const card = CARDS[id];
    const lv = lvOf(id);
    const m = mult(lv);
    const cx = 30 + (i % 2) * (cw + gx);
    const cy = y0 + Math.floor(i / 2) * (ch + gy) - deckScroll;
    if (cy + ch < y0 || cy > H) continue;   // 视口外跳过
    const lock = !unlocked(id);
    if (lock) ctx.globalAlpha = 0.45;   // 未解锁卡牌整体变暗
    rr(cx, cy, cw, ch, 12);
    ctx.fillStyle = '#1c2a3e'; ctx.fill();
    ctx.strokeStyle = '#40556e'; ctx.lineWidth = 1.5; ctx.stroke();
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
    ctx.textAlign = 'left';
    ctx.font = '10px "Microsoft YaHei",sans-serif';
    ctx.fillStyle = '#8fa3c0';
    let desc;
    if (card.id === 'heal') desc = '治疗 ' + Math.round(card.dmg * m);
    else if (card.type === 'spell') desc = '法术威力 ' + Math.round(card.dmg * m);
    else if (card.type === 'building') desc = '生命 ' + Math.round(card.hp * m) + (card.dmg > 0 ? ' · 伤害 ' + Math.round(card.dmg * m) : ' · 建筑');
    else desc = '生命 ' + Math.round(card.hp * m) + ' · 伤害 ' + Math.round(card.dmg * m);
    ctx.fillText(desc, cx + 10, cy + 54);
    const ubx = cx + 10, uby = cy + 62, ubw = cw - 20, ubh = 28;
    rr(ubx, uby, ubw, ubh, 10);
    const maxed = lv >= MAX_LV;
    const afford = save.gold >= upgradeCost(lv);
    ctx.fillStyle = lock ? '#3a2f1e' : maxed ? '#3a3a20' : afford ? '#3d6fe0' : '#2a3a4e';
    ctx.fill();
    ctx.strokeStyle = lock ? '#8a6a30' : maxed ? '#8a7a20' : afford ? '#7fa8ff' : '#4a5b70';
    ctx.lineWidth = 1.5; ctx.stroke();
    ctx.textAlign = 'center';
    ctx.font = 'bold 12px "Microsoft YaHei",sans-serif';
    ctx.fillStyle = lock ? '#ffb74d' : maxed ? '#ffd94d' : afford ? '#fff' : '#6f829c';
    ctx.fillText(lock ? '🔒 ' + (UNLOCK[id] || 0) + '🏆 解锁' : maxed ? '★ 已满级' : '升级 🪙' + upgradeCost(lv), cx + cw / 2, uby + ubh / 2 + 1);
    ui.deck.push({ id: 'up:' + id, x: ubx, y: uby, w: ubw, h: ubh });
    if (lock) ctx.globalAlpha = 1;
  }
  // 滚动条
  if (maxScroll > 0) {
    const viewH = H - 84 - 8;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(W - 6, 84, 4, viewH);
    const thumbH = Math.max(30, viewH * (viewH / (viewH + maxScroll)));
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(W - 6, 84 + (deckScroll / maxScroll) * (viewH - thumbH), 4, thumbH);
  }
}
function deckToggle(id) {
  if (!unlocked(id)) {
    deckEditMsg = CARDS[id].name + ' 需 ' + (UNLOCK[id] || 0) + ' 🏆 解锁';
    deckEditMsgT = 1.4;
    AudioSys.tone(300, 200, 0.15, 'square', 0.3);
    return;
  }
  const i = deckSel.indexOf(id);
  if (i >= 0) {
    deckSel.splice(i, 1);
    AudioSys.deploy();
    return;
  }
  if (deckSel.length >= DECK_SIZE) {
    deckEditMsg = '卡组已满 8 张，先点掉一张再添加';
    deckEditMsgT = 1.4;
    AudioSys.tone(300, 200, 0.15, 'square', 0.3);
    return;
  }
  deckSel.push(id);
  AudioSys.deploy();
}
function deckEditMaxScroll() {
  const ch = 86, gy = 8, y0 = 84;
  const rows = Math.ceil(DECK.length / 2);
  const contentH = rows * (ch + gy) + y0 + 8;
  return Math.max(0, contentH - 84 - (H - 60 - 10 - 84));
}
function drawDeckEdit() {
  ui.deckedit = [];
  ctx.fillStyle = '#14203a';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 22px "Microsoft YaHei",sans-serif';
  ctx.fillStyle = '#ffd94d';
  ctx.fillText('🎴 选择卡组（' + (deckEditTeam === 0 ? '我方' : '对方') + ' · 出战 8 张）', 20, 32);
  const ok = deckSel.length === DECK_SIZE;
  ctx.textAlign = 'right';
  ctx.font = 'bold 16px "Microsoft YaHei",sans-serif';
  ctx.fillStyle = ok ? '#5ec878' : '#ffd94d';
  ctx.fillText('已选 ' + deckSel.length + ' / 8', W - 20, 32);
  const bx = 20, by = 44, bw = 64, bh = 30;
  rr(bx, by, bw, bh, 15);
  ctx.fillStyle = '#2a3a4e'; ctx.fill();
  ctx.strokeStyle = '#4a5b70'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.textAlign = 'center';
  ctx.font = '13px "Microsoft YaHei",sans-serif';
  ctx.fillStyle = '#e8eef7';
  ctx.fillText('← 返回', bx + bw / 2, by + bh / 2 + 1);
  ui.deckedit.push({ id: 'back', x: bx, y: by, w: bw, h: bh });
  // 我方 / 对方卡组切换（双人模式双方卡组独立）
  for (const t of [0, 1]) {
    const tx = W / 2 - 100 + t * 105, tw = 95, th = 30, ty = by;
    rr(tx, ty, tw, th, 15);
    ctx.fillStyle = deckEditTeam === t ? '#2e8b4a' : '#2a3a4e'; ctx.fill();
    ctx.strokeStyle = deckEditTeam === t ? '#5ec878' : '#4a5b70'; ctx.lineWidth = deckEditTeam === t ? 2 : 1.5; ctx.stroke();
    ctx.textAlign = 'center';
    ctx.font = '13px "Microsoft YaHei",sans-serif';
    ctx.fillStyle = deckEditTeam === t ? '#d8ffe0' : '#e8eef7';
    ctx.fillText((t === 0 ? '🟦 我方' : '🟥 对方'), tx + tw / 2, ty + th / 2 + 1);
    ui.deckedit.push({ id: 'tab' + t, x: tx, y: ty, w: tw, h: th });
  }
  // 保存按钮命中区先注册（绘制仍在网格之后），避免点到被按钮遮挡的卡牌
  ui.deckedit.push({ id: 'save', x: 30, y: H - 60, w: W - 60, h: 46 });
  // 滚动网格（2 列 × N 行），点卡片加入 / 移出卡组
  const cw = 172, ch = 86, gx = 16, gy = 8, y0 = 84;
  const maxScroll = deckEditMaxScroll();
  deckEditScroll = clamp(deckEditScroll, 0, maxScroll);
  const gridBottom = H - 60 - 14;   // 网格底边（给保存按钮留位）
  for (let i = 0; i < DECK.length; i++) {
    const id = DECK[i];
    const card = CARDS[id];
    const sel = deckSel.includes(id);
    const lock = !unlocked(id);
    if (lock) ctx.globalAlpha = 0.5;   // 未解锁卡牌整体变暗
    const cx = 30 + (i % 2) * (cw + gx);
    const cy = y0 + Math.floor(i / 2) * (ch + gy) - deckEditScroll;
    if (cy + ch < y0 || cy + ch > gridBottom) { ctx.globalAlpha = 1; continue; }   // 视口外或会压到保存按钮的格子跳过
    rr(cx, cy, cw, ch, 12);
    ctx.fillStyle = sel ? '#1e3a2e' : '#1c2a3e'; ctx.fill();
    ctx.strokeStyle = sel ? '#5ec878' : '#40556e'; ctx.lineWidth = sel ? 2.5 : 1.5; ctx.stroke();
    ctx.textAlign = 'left';
    ctx.font = '20px "Segoe UI Emoji",sans-serif';
    ctx.fillText(card.emoji, cx + 10, cy + 16);
    ctx.font = 'bold 13px "Microsoft YaHei",sans-serif';
    ctx.fillStyle = '#e8eef7';
    ctx.fillText(card.name, cx + 10, cy + 38);
    // 圣水花费
    ctx.beginPath();
    ctx.arc(cx + cw - 20, cy + 16, 11, 0, Math.PI * 2);
    ctx.fillStyle = '#2a3a4e'; ctx.fill();
    ctx.strokeStyle = '#7fa8ff'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.textAlign = 'center';
    ctx.font = 'bold 11px Consolas,monospace';
    ctx.fillStyle = '#ffd94d';
    ctx.fillText(card.cost, cx + cw - 20, cy + 17);
    // 类型说明
    ctx.textAlign = 'left';
    ctx.font = '10px "Microsoft YaHei",sans-serif';
    ctx.fillStyle = '#8fa3c0';
    let kind;
    if (card.type === 'unit') kind = card.fly ? '飞行单位' : card.targets === 'buildings' ? '地面单位 · 攻建筑' : '地面单位';
    else kind = card.type === 'building' ? '建筑' : '法术';
    ctx.fillText(kind, cx + 10, cy + 54);
    // 未解锁提示
    if (lock) {
      ctx.font = 'bold 10px "Microsoft YaHei",sans-serif';
      ctx.fillStyle = '#ffb74d';
      ctx.fillText('🔒 ' + (UNLOCK[id] || 0) + '🏆 解锁', cx + 10, cy + 68);
    }
    // 已选角标
    if (sel) {
      ctx.beginPath();
      ctx.arc(cx + cw - 20, cy + ch - 20, 12, 0, Math.PI * 2);
      ctx.fillStyle = '#5ec878'; ctx.fill();
      ctx.font = 'bold 12px sans-serif';
      ctx.fillStyle = '#06240f';
      ctx.fillText('✓', cx + cw - 20, cy + ch - 19);
    }
    if (lock) ctx.globalAlpha = 1;
    ui.deckedit.push({ id: 'sel:' + id, x: cx, y: cy, w: cw, h: ch });
  }
  // 滚动条
  if (maxScroll > 0) {
    const viewH = gridBottom - 84;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(W - 6, 84, 4, viewH);
    const thumbH = Math.max(30, viewH * (viewH / (viewH + maxScroll)));
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(W - 6, 84 + (deckEditScroll / maxScroll) * (viewH - thumbH), 4, thumbH);
  }
  // 底部保存按钮
  const sx = 30, sy = H - 60, sw = W - 60, sh = 46;
  rr(sx, sy, sw, sh, 14);
  ctx.fillStyle = ok ? '#2e8b4a' : '#2a3a4e'; ctx.fill();
  ctx.strokeStyle = ok ? '#5ec878' : '#4a5b70'; ctx.lineWidth = 2; ctx.stroke();
  ctx.textAlign = 'center';
  ctx.font = 'bold 18px "Microsoft YaHei",sans-serif';
  ctx.fillStyle = ok ? '#d8ffe0' : '#6f829c';
  ctx.fillText(ok ? '💾 保存' + (deckEditTeam === 0 ? '我方' : '对方') + '卡组' : '需选满 8 张（当前 ' + deckSel.length + '）', W / 2, sy + sh / 2 + 1);
  // 提示
  ctx.font = '11px "Microsoft YaHei",sans-serif';
  if (deckEditMsgT > 0) {
    ctx.fillStyle = '#ff9966';
    ctx.fillText(deckEditMsg, W / 2, sy - 26);
  } else {
    ctx.fillStyle = '#54687e';
    ctx.fillText('顶部切换 我方 / 对方卡组 · 双人模式双方卡组各自独立', W / 2, sy - 26);
  }
}
function drawOver() {
  ui.over = [];
  ctx.fillStyle = 'rgba(8,12,22,0.78)';
  ctx.fillRect(0, 0, W, H);
  const px = 62, py = 216, pw = W - 124, ph = 330;
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
    // 达到奖杯里程碑自动开启的宝箱
    if (state.reward.chests && state.reward.chests.length) {
      const names = state.reward.chests.map(c => '开启「' + c.name + '」+🪙' + c.gold);
      const lines = names.length <= 2 ? [names.join('　')] : [names.slice(0, 3).join('　'), names.slice(3).join('　')];
      ctx.font = 'bold 12px "Microsoft YaHei",sans-serif';
      ctx.fillStyle = '#ffb74d';
      lines.forEach((ln, i) => ctx.fillText('🎁 ' + ln, W / 2, py + 197 + i * 18));
    }
  }
  const bs = [['replay', '再来一局', py + 226], ['menu', '返回主菜单', py + 274]];
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
  if (state.screen === 'deckedit') { drawDeckEdit(); return; }
  ctx.save();
  if (state.shake > 0) ctx.translate(rand(-state.shake, state.shake), rand(-state.shake, state.shake));
  drawArena();
  drawZones();
  if ((drags.size > 0 || select || kbCursor) && state.screen === 'playing') drawGrid();   // 只在放置过程中显示淡色网格
  for (const tw of state.towers) if (!tw.dead) drawTower(tw);
  for (const b of state.buildings) drawBuilding(b);
  const sorted = state.units.slice().sort((a, b) => a.y - b.y);
  for (const u of sorted) drawUnit(u);
  for (const p of state.projs) drawProj(p);
  drawParticles();
  for (const tw of state.towers) if (tw.dead) drawTower(tw);
  ctx.restore();
  // 画面暗角（提升质感）
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.36, W / 2, H / 2, H * 0.78);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
  drawHUD();
  drawDrags();
  drawKbCursor();
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
  if (state.screen === 'playing') {
    update(dt);
    AudioSys.startAmbient(ARENAS.indexOf(state.arena));   // 对局中播放当前竞技场环境音
  } else if (state.screen === 'over') {
    AudioSys.stopAmbient();
    updateFx(dt);
  } else {
    AudioSys.stopAmbient();
  }
  if (deckEditMsgT > 0) deckEditMsgT -= dt;
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
      else if (b.id === 'deckedit') { deckSel = save.deck.slice(); deckEditTeam = 0; deckEditScroll = 0; deckEditMsg = ''; deckEditMsgT = 0; state.screen = 'deckedit'; }
      else if (b.id === 'diffl') state.difficulty = (state.difficulty + DIFFS.length - 1) % DIFFS.length;
      else if (b.id === 'diffr' || b.id === 'diff') state.difficulty = (state.difficulty + 1) % DIFFS.length;
      else if (b.id === 'resume') restoreMatch(save.match);
      else if (b.id === 'export') exportSave();
      else if (b.id === 'import') importSave();
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
    deckDrag = { y: p.y, s: deckScroll };   // 拖拽滚动
    return;
  }
  if (state.screen === 'deckedit') {
    for (const b of ui.deckedit) {
      if (!inRect(p, b)) continue;
      if (b.id === 'back') state.screen = 'menu';
      else if (b.id === 'tab0' || b.id === 'tab1') {
        const nt = b.id === 'tab0' ? 0 : 1;
        if (nt !== deckEditTeam) {
          deckEditTeam = nt;
          deckSel = (nt === 0 ? save.deck : save.deck2).slice();
          deckEditScroll = 0; deckEditMsg = ''; deckEditMsgT = 0;
        }
      }
      else if (b.id === 'save') {
        if (deckSel.length === DECK_SIZE) {
          if (deckEditTeam === 0) save.deck = deckSel.slice();
          else save.deck2 = deckSel.slice();
          saveGame();
          AudioSys.upgrade();
          state.screen = 'menu';
        } else {
          deckEditMsg = '需选满 8 张卡才能保存';
          deckEditMsgT = 1.4;
          AudioSys.tone(300, 200, 0.15, 'square', 0.3);
        }
      } else if (b.id.startsWith('sel:')) deckToggle(b.id.slice(4));
      return;
    }
    deckEditDrag = { y: p.y, s: deckEditScroll };   // 拖拽滚动
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
  // 点击战场：部署已选卡牌（吸附到格子中心，建筑按占格校验）
  if (select) {
    if (p.y >= F.top && p.y <= F.bottom) {
      const sc = snapCell(p.x, p.y);
      if (canPlaceAt(select.id, sc.x, sc.y, select.team)) playCard(select.id, sc.x, sc.y, select.team);
    }
    if (state.elixir[select.team] < CARDS[select.id].cost || p.y < F.top || p.y > F.bottom) select = null;
  }
});
window.addEventListener('pointermove', (e) => {
  const p = toCanvas(e);
  if (state.screen === 'deck' && deckDrag) {
    deckScroll = clamp(deckDrag.s + (deckDrag.y - p.y), 0, deckMaxScroll());
    return;
  }
  if (state.screen === 'deckedit' && deckEditDrag) {
    deckEditScroll = clamp(deckEditDrag.s + (deckEditDrag.y - p.y), 0, deckEditMaxScroll());
    return;
  }
  const d = drags.get(e.pointerId);
  if (!d) return;
  d.x = p.x; d.y = p.y;
  if (Math.hypot(p.x - d.sx, p.y - d.sy) > 10) d.moved = true;
});
window.addEventListener('pointerup', (e) => {
  if (state.screen === 'deck') { deckDrag = null; return; }
  if (state.screen === 'deckedit') { deckEditDrag = null; return; }
  const d = drags.get(e.pointerId);
  if (!d) return;
  const p = toCanvas(e);
  if (d.moved && p.y >= F.top && p.y <= F.bottom) {
    const sc = snapCell(p.x, p.y);   // 落点吸附到格子中心
    if (canPlaceAt(d.id, sc.x, sc.y, d.team)) playCard(d.id, sc.x, sc.y, d.team);
  }
  drags.delete(e.pointerId);   // 未移动的点击保留 select，走点选部署流程
});
window.addEventListener('pointercancel', (e) => { drags.delete(e.pointerId); });
/* 关闭 / 切走页面前保存对局进度 */
window.addEventListener('pagehide', saveMatchNow);
window.addEventListener('beforeunload', saveMatchNow);
canvas.addEventListener('wheel', (e) => {
  if (state.screen === 'deck') {
    e.preventDefault();
    deckScroll = clamp(deckScroll + e.deltaY, 0, deckMaxScroll());
  } else if (state.screen === 'deckedit') {
    e.preventDefault();
    deckEditScroll = clamp(deckEditScroll + e.deltaY, 0, deckEditMaxScroll());
  }
}, { passive: false });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
/* 双人模式键盘控制：下方玩家 1-4 选卡、WASD 移动光标、空格/回车部署 */
window.addEventListener('keydown', (e) => {
  if (state.screen !== 'playing' || state.mode !== 'pvp') return;
  const k = String(e.key).toLowerCase();
  if ((k === '1' || k === '2' || k === '3' || k === '4') && !e.repeat) {
    const id = state.hand[0][+k - 1];
    if (id) select = { id, team: 0 };
    return;
  }
  if (k === 'w' || k === 'a' || k === 's' || k === 'd') {
    if (!kbCursor) kbCursor = snapCell(W / 2, F.bottom - 130);
    if (k === 'a') kbCursor.x -= CELL;
    if (k === 'd') kbCursor.x += CELL;
    if (k === 'w') kbCursor.y -= CELL;
    if (k === 's') kbCursor.y += CELL;
    kbCursor.x = clamp(kbCursor.x, 18, W - 18);
    kbCursor.y = clamp(kbCursor.y, F.top + 10, F.bottom - 10);
    return;
  }
  if (k === ' ' || k === 'enter') {
    e.preventDefault();
    if (select && kbCursor && select.team === 0) {
      const sc = snapCell(kbCursor.x, kbCursor.y);
      if (canPlaceAt(select.id, sc.x, sc.y, 0)) playCard(select.id, sc.x, sc.y, 0);
    }
  }
});

/* ---------------- 静音按钮 ---------------- */
const muteBtn = document.getElementById('muteBtn');
muteBtn.addEventListener('click', () => {
  muteBtn.textContent = AudioSys.toggle() ? '🔇' : '🔊';
});
