const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// ==========================================
// 🎯 全域遊戲數值配置表 (以真實時間: 秒/像素/HP 為單位)
// ==========================================
const CONFIG = {
  TICK_RATE: 60,
  get DT() { return 1 / this.TICK_RATE; },

  COMMANDER: {
    MAX_HP: 400,
    SPEED: 300,              // px/sec (相當於每幀 5px)
    REGEN_HP: 8,             // 脫戰每秒 +8 HP
    OUT_OF_COMBAT_SEC: 5.0,  // 脫戰時間 (秒)
    RESPAWN_SEC: 10.0        // 倒地復活時間 (秒)
  },

  CORE: {
    MAX_HP: 1000,
    REGEN_HP: 15,            // 脫戰每秒 +15 HP
    OUT_OF_COMBAT_SEC: 5.0,
    SPAWN_INTERVAL_SEC: 6.0, // 每 6 秒生成常規刷錢小怪
    RAID_INTERVAL_SEC: 60.0, // 每 60 秒發起一次大軍突襲
    SAFE_ZONE_RADIUS: 480    // 核心安全排斥區
  },

  TOWER: {
    BASIC: { HP: 500, RANGE: 160, ATK: 30, COOLDOWN_SEC: 0.5, COST: 100, REFUND: 70, REPAIR_MAX_COST: 40, COLOR: '#00f0ff' },
    ADVANCED: { HP: 500, RANGE: 260, ATK: 85, COOLDOWN_SEC: 1.25, COST: 200, REFUND: 140, REPAIR_MAX_COST: 80, COLOR: '#ff0055' }
  },

  SOLDIER: {
    BASIC: { HP: 100, ATK: 15, SPEED: 228, RADIUS: 5, COST: 50, REFUND: 35, HEAL_MAX_COST: 15 },
    HEAVY: { HP: 280, ATK: 35, SPEED: 150, RADIUS: 8, COST: 120, REFUND: 84, HEAL_MAX_COST: 40 }
  },

  MONSTER: {
    BASE_HP: 40,
    BASE_ATK: 8,
    SPEED: 108,              // px/sec
    BOUNTY: 25
  },

  BOUNTIES: {
    SOLDIER_BASIC: 15,
    SOLDIER_HEAVY: 35,
    TOWER_BASIC: 50,
    TOWER_ADVANCED: 100,
    COMMANDER: 150,
    CORE: 300
  }
};

const ALLIANCE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

const gameState = {
  players: {},
  alliances: {},             // 🤝 聯盟清單: { allianceId: { id, name, leaderId, memberIds: [], color } }
  towers: [],
  monsters: [],
  lasers: [],
  events: [],
  neutralSoldiers: [],
  globalTimer: 0,
  tickCount: 0,
  mapBounds: { minX: 0, maxX: 1600, minY: 0, maxY: 1200, width: 1600, height: 1200, buffer: 600 }
};

let monsterIdCounter = 0;
let towerIdCounter = 0;
let soldierIdCounter = 0;
let allianceIdCounter = 0;

function updateMapBounds() {
  const playerCount = Math.max(1, Object.keys(gameState.players).length);
  const extraW = (playerCount - 1) * 400;
  const extraH = (playerCount - 1) * 300;

  const minX = -extraW / 2;
  const maxX = 1600 + extraW / 2;
  const minY = -extraH / 2;
  const maxY = 1200 + extraH / 2;

  gameState.mapBounds.minX = minX;
  gameState.mapBounds.maxX = maxX;
  gameState.mapBounds.minY = minY;
  gameState.mapBounds.maxY = maxY;
  gameState.mapBounds.width = maxX - minX;
  gameState.mapBounds.height = maxY - minY;
}

function convertArmyToNeutral(player) {
  if (!player || !player.army || player.army.length === 0) return;
  player.army.forEach(s => {
    s.ownerId = null;
    s.state = 'NEUTRAL';
    s.targetId = null;
    s.returning = false;
    gameState.neutralSoldiers.push(s);
  });
  player.army = [];
}

// 🤝 輔助判斷：兩名玩家是否屬於同一聯盟
function isSameAlliance(p1Id, p2Id) {
  if (!p1Id || !p2Id || p1Id === p2Id) return false;
  const p1 = gameState.players[p1Id];
  const p2 = gameState.players[p2Id];
  if (!p1 || !p2 || !p1.allianceId || !p2.allianceId) return false;
  return p1.allianceId === p2.allianceId;
}

// 🤝 輔助處理：玩家離開聯盟邏輯
function removePlayerFromAlliance(player) {
  if (!player || !player.allianceId) return;
  const alliance = gameState.alliances[player.allianceId];
  if (alliance) {
    alliance.memberIds = alliance.memberIds.filter(id => id !== player.id);
    // 若盟主離開，自動移交盟主權限或解散
    if (alliance.leaderId === player.id) {
      if (alliance.memberIds.length > 0) {
        alliance.leaderId = alliance.memberIds[0];
      } else {
        delete gameState.alliances[alliance.id];
      }
    }
  }
  player.allianceId = null;
}

// 🍩 全域無邊界約束甜甜圈生成演算法 (Unbounded Donut Spawn)
function getDonutSpawnPos(core, bounds, state) {
  const safeCoreRadius = CONFIG.CORE.SAFE_ZONE_RADIUS;
  const safeTowerRadius = 250;

  const outerMinX = bounds.minX - 500;
  const outerMaxX = bounds.maxX + 500;
  const outerMinY = bounds.minY - 500;
  const outerMaxY = bounds.maxY + 500;

  for (let attempt = 0; attempt < 50; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = safeCoreRadius + Math.random() * 320;
    const sx = core.x + Math.cos(angle) * dist;
    const sy = core.y + Math.sin(angle) * dist;

    if (sx < outerMinX || sx > outerMaxX || sy < outerMinY || sy > outerMaxY) continue;

    let inCoreSafeZone = false;
    for (const p of Object.values(state.players)) {
      if (p.core && p.core.hp > 0) {
        if (Math.hypot(p.core.x - sx, p.core.y - sy) < safeCoreRadius) {
          inCoreSafeZone = true;
          break;
        }
      }
    }
    if (inCoreSafeZone) continue;

    let nearTower = false;
    for (const t of state.towers) {
      if (Math.hypot(t.x - sx, t.y - sy) < safeTowerRadius) {
        nearTower = true;
        break;
      }
    }
    if (nearTower) continue;

    return { x: sx, y: sy };
  }

  const angle = Math.random() * Math.PI * 2;
  return {
    x: core.x + Math.cos(angle) * 650,
    y: core.y + Math.sin(angle) * 650
  };
}

io.on('connection', (socket) => {
  socket.on('joinGame', (payload) => {
    let pid, nickname;
    if (payload && typeof payload === 'object') {
      pid = payload.persistentId || socket.id;
      nickname = payload.nickname || `指揮官_${pid.substring(0, 4)}`;
    } else {
      pid = payload || socket.id;
      nickname = `指揮官_${pid.substring(0, 4)}`;
    }
    socket.playerId = pid;

    if (!gameState.players[pid]) {
      const bounds = gameState.mapBounds;
      gameState.players[pid] = {
        id: pid,
        name: nickname,
        socketId: socket.id,
        x: bounds.minX + 400 + Math.random() * (bounds.width - 800),
        y: bounds.minY + 300 + Math.random() * (bounds.height - 600),
        dirX: 0, dirY: 0,
        hp: CONFIG.COMMANDER.MAX_HP, maxHp: CONFIG.COMMANDER.MAX_HP,
        gold: 250,
        core: null,
        army: [],
        armyState: 'GUARD',
        allianceId: null,      // 🤝 聯盟 ID
        isDead: false,
        respawnTimerSec: 0,
        lastHitTick: 0,
        lastFullHpTick: 0,
        isOnline: true,
        survivalTime: 0,
        spawnTimerSec: 0,
        raidTimerSec: 0
      };
    } else {
      const player = gameState.players[pid];
      player.socketId = socket.id;
      player.name = nickname;
      player.isOnline = true;
    }

    updateMapBounds();
  });

  // ==========================================
  // 🤝 聯盟 / 組隊系統 Socket 事件處理
  // ==========================================

  // 1. 創建聯盟
  socket.on('createAlliance', (allianceName) => {
    const player = gameState.players[socket.playerId];
    if (!player || player.allianceId || player.isDead) return;

    const name = (allianceName && allianceName.trim()) ? allianceName.trim().substring(0, 12) : `${player.name}的聯盟`;
    const allianceId = `ally_${allianceIdCounter++}`;
    const color = ALLIANCE_COLORS[Math.floor(Math.random() * ALLIANCE_COLORS.length)];

    gameState.alliances[allianceId] = {
      id: allianceId,
      name: name,
      leaderId: player.id,
      memberIds: [player.id],
      color: color
    };

    player.allianceId = allianceId;

    gameState.events.push({
      type: 'FLOAT_TEXT',
      x: player.x, y: player.y - 30,
      text: `🛡️ 創立聯盟 [${name}]`,
      color: color,
      forPlayerId: player.id
    });
  });

  // 2. 發送組隊邀請
  socket.on('inviteToAlliance', (targetPlayerId) => {
    const sender = gameState.players[socket.playerId];
    const target = gameState.players[targetPlayerId];

    if (!sender || !target || !target.isOnline || target.isDead || target.allianceId) return;
    if (!sender.allianceId) return; // 必須先有聯盟才能邀請

    const alliance = gameState.alliances[sender.allianceId];
    if (!alliance) return;

    // 向目標玩家的 Socket 發送邀請請求彈窗
    if (target.socketId) {
      io.to(target.socketId).emit('allianceInviteReceived', {
        allianceId: alliance.id,
        allianceName: alliance.name,
        inviterId: sender.id,
        inviterName: sender.name
      });
    }

    gameState.events.push({
      type: 'FLOAT_TEXT',
      x: sender.x, y: sender.y - 30,
      text: `已向 ${target.name} 發送邀請`,
      color: '#00f0ff',
      forPlayerId: sender.id
    });
  });

  // 3. 回覆組隊邀請 (接受 / 拒絕)
  socket.on('respondAllianceInvite', (data) => {
    const player = gameState.players[socket.playerId];
    if (!player || player.allianceId || !data) return;

    const { allianceId, accept } = data;
    const alliance = gameState.alliances[allianceId];

    if (accept && alliance) {
      alliance.memberIds.push(player.id);
      player.allianceId = alliance.id;

      // 廣播給聯盟成員 notification
      alliance.memberIds.forEach(mId => {
        const m = gameState.players[mId];
        if (m && m.socketId) {
          io.to(m.socketId).emit('allianceNotification', `${player.name} 加入了聯盟！`);
        }
      });
    }
  });

  // 4. 退出 / 離開聯盟
  socket.on('leaveAlliance', () => {
    const player = gameState.players[socket.playerId];
    if (!player || !player.allianceId) return;

    const oldAlliance = gameState.alliances[player.allianceId];
    const oldName = oldAlliance ? oldAlliance.name : '';

    removePlayerFromAlliance(player);

    gameState.events.push({
      type: 'FLOAT_TEXT',
      x: player.x, y: player.y - 30,
      text: `已退出聯盟 [${oldName}]`,
      color: '#ffb700',
      forPlayerId: player.id
    });
  });

  socket.on('playerInput', (keys) => {
    const player = gameState.players[socket.playerId];
    if (!player || player.isDead) return;

    let dx = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
    let dy = (keys.s ? 1 : 0) - (keys.w ? 1 : 0);
    const len = Math.hypot(dx, dy);

    if (len > 0) {
      player.dirX = dx / len;
      player.dirY = dy / len;
    } else {
      player.dirX = 0;
      player.dirY = 0;
    }
  });

  socket.on('teleportCore', () => {
    const player = gameState.players[socket.playerId];
    if (player && player.core && !player.isDead) {
      player.x = player.core.x;
      player.y = player.core.y;
      gameState.events.push({ type: 'EXPLOSION', x: player.x, y: player.y, color: '#00f0ff' });
    }
  });

  socket.on('placeCore', (pos) => {
    const player = gameState.players[socket.playerId];
    if (player && !player.core && !player.isDead) {
      const bounds = gameState.mapBounds;
      const rawX = (pos && typeof pos.x === 'number') ? pos.x : player.x;
      const rawY = (pos && typeof pos.y === 'number') ? pos.y : player.y;
      const cx = Math.floor(rawX / 40) * 40 + 20;
      const cy = Math.floor(rawY / 40) * 40 + 20;

      if (cx < bounds.minX + 20 || cx > bounds.maxX - 20 || cy < bounds.minY + 20 || cy > bounds.maxY - 20) return;

      player.core = {
        id: `core_${player.id}`,
        ownerId: player.id,
        x: cx, y: cy,
        hp: CONFIG.CORE.MAX_HP, maxHp: CONFIG.CORE.MAX_HP,
        lastHitTick: 0,
        lastFullHpTick: 0
      };
      player.survivalTime = 0;
      player.spawnTimerSec = 0;
      player.raidTimerSec = 0;
    }
  });

  socket.on('buyTower', (data) => {
    const player = gameState.players[socket.playerId];
    if (!player || !player.core || player.isDead) return;

    const bounds = gameState.mapBounds;
    const towerType = data ? data.type : 'BASIC';
    const cfg = towerType === 'ADVANCED' ? CONFIG.TOWER.ADVANCED : CONFIG.TOWER.BASIC;
    if (player.gold < cfg.COST) return;

    const rawX = (data && typeof data.x === 'number') ? data.x : player.x;
    const rawY = (data && typeof data.y === 'number') ? data.y : player.y;
    const tx = Math.floor(rawX / 40) * 40 + 20;
    const ty = Math.floor(rawY / 40) * 40 + 20;

    if (tx < bounds.minX + 20 || tx > bounds.maxX - 20 || ty < bounds.minY + 20 || ty > bounds.maxY - 20) return;

    const distToCore = Math.hypot(tx - player.core.x, ty - player.core.y);
    if (distToCore > 350) return;

    const isOccupied = gameState.towers.some(t => t.x === tx && t.y === ty) ||
                       Object.values(gameState.players).some(p => p.core && Math.hypot(p.core.x - tx, p.core.y - ty) < 30);
    if (isOccupied) return;

    player.gold -= cfg.COST;

    gameState.towers.push({
      id: `tower_${towerIdCounter++}`,
      ownerId: player.id,
      type: towerType,
      x: tx, y: ty,
      hp: cfg.HP, maxHp: cfg.HP,
      range: cfg.RANGE,
      atk: cfg.ATK,
      cooldownSec: 0,
      maxCooldownSec: cfg.COOLDOWN_SEC,
      laserColor: cfg.COLOR,
      targetId: null,
      lastHitTick: 0,
      lastFullHpTick: 0
    });
  });

  socket.on('repairTower', (towerId) => {
    const player = gameState.players[socket.playerId];
    if (!player || player.isDead) return;

    const t = gameState.towers.find(item => item.id === towerId && item.ownerId === player.id);
    if (!t || t.hp >= t.maxHp) return;

    const missingHpRatio = (t.maxHp - t.hp) / t.maxHp;
    const cfg = t.type === 'ADVANCED' ? CONFIG.TOWER.ADVANCED : CONFIG.TOWER.BASIC;
    const cost = Math.max(10, Math.ceil(cfg.REPAIR_MAX_COST * missingHpRatio));

    if (player.gold < cost) return;

    player.gold -= cost;
    const healedAmt = Math.ceil(t.maxHp - t.hp);
    t.hp = t.maxHp;
    t.lastFullHpTick = null;

    gameState.events.push({ type: 'EXPLOSION', x: t.x, y: t.y, color: '#00ff66', count: 12 });
    gameState.events.push({ type: 'FLOAT_TEXT', x: t.x, y: t.y - 15, text: `+${healedAmt}`, color: '#00ff66', forPlayerId: player.id });
  });

  socket.on('sellTower', (towerId) => {
    const player = gameState.players[socket.playerId];
    if (!player || player.isDead) return;

    const idx = gameState.towers.findIndex(t => t.id === towerId && t.ownerId === player.id);
    if (idx !== -1) {
      const t = gameState.towers[idx];
      const cfg = t.type === 'ADVANCED' ? CONFIG.TOWER.ADVANCED : CONFIG.TOWER.BASIC;
      player.gold += cfg.REFUND;
      gameState.events.push({ type: 'EXPLOSION', x: t.x, y: t.y, color: '#00f0ff', count: 8 });
      gameState.events.push({ type: 'FLOAT_TEXT', x: t.x, y: t.y - 15, text: `+${cfg.REFUND}G`, color: '#ffb700', forPlayerId: player.id });
      gameState.towers.splice(idx, 1);
    }
  });

  socket.on('buySoldier', (unitType) => {
    const player = gameState.players[socket.playerId];
    if (!player || !player.core || player.isDead) return;

    const type = unitType || 'BASIC';
    const cfg = type === 'HEAVY' ? CONFIG.SOLDIER.HEAVY : CONFIG.SOLDIER.BASIC;
    if (player.gold < cfg.COST) return;

    player.gold -= cfg.COST;

    const spawnX = player.x + (Math.random() * 20 - 10);
    const spawnY = player.y + (Math.random() * 20 - 10);

    player.army.push({
      id: `soldier_${soldierIdCounter++}`,
      ownerId: player.id,
      type: type,
      x: spawnX, y: spawnY,
      anchorX: spawnX, anchorY: spawnY,
      targetId: null, returning: false,
      hp: cfg.HP, maxHp: cfg.HP,
      atk: cfg.ATK, speed: cfg.SPEED,
      radius: cfg.RADIUS,
      state: player.armyState || 'GUARD',
      lastHitTick: 0,
      lastFullHpTick: 0
    });
  });

  socket.on('healSoldier', (soldierId) => {
    const player = gameState.players[socket.playerId];
    if (!player || player.isDead) return;

    const s = player.army.find(item => item.id === soldierId);
    if (!s || s.hp >= s.maxHp) return;

    const missingHpRatio = (s.maxHp - s.hp) / s.maxHp;
    const cfg = s.type === 'HEAVY' ? CONFIG.SOLDIER.HEAVY : CONFIG.SOLDIER.BASIC;
    const cost = Math.max(5, Math.ceil(cfg.HEAL_MAX_COST * missingHpRatio));

    if (player.gold < cost) return;

    player.gold -= cost;
    const healedAmt = Math.ceil(s.maxHp - s.hp);
    s.hp = s.maxHp;
    s.lastFullHpTick = null;

    gameState.events.push({ type: 'EXPLOSION', x: s.x, y: s.y, color: '#00ff66', count: 10 });
    gameState.events.push({ type: 'FLOAT_TEXT', x: s.x, y: s.y - 15, text: `+${healedAmt}`, color: '#00ff66', forPlayerId: player.id });
  });

  socket.on('sellSoldier', (soldierId) => {
    const player = gameState.players[socket.playerId];
    if (!player || player.isDead) return;

    const idx = player.army.findIndex(s => s.id === soldierId);
    if (idx !== -1) {
      const s = player.army[idx];
      const cfg = s.type === 'HEAVY' ? CONFIG.SOLDIER.HEAVY : CONFIG.SOLDIER.BASIC;
      player.gold += cfg.REFUND;
      gameState.events.push({ type: 'EXPLOSION', x: s.x, y: s.y, color: '#00f0ff', count: 6 });
      gameState.events.push({ type: 'FLOAT_TEXT', x: s.x, y: s.y - 15, text: `+${cfg.REFUND}G`, color: '#ffb700', forPlayerId: player.id });
      player.army.splice(idx, 1);
    }
  });

  socket.on('abandonSoldier', (soldierId) => {
    const player = gameState.players[socket.playerId];
    if (!player || player.isDead) return;

    const idx = player.army.findIndex(s => s.id === soldierId);
    if (idx !== -1) {
      const s = player.army[idx];
      player.army.splice(idx, 1);
      s.ownerId = null;
      s.state = 'NEUTRAL';
      s.targetId = null;
      s.returning = false;
      gameState.neutralSoldiers.push(s);
      gameState.events.push({ type: 'FLOAT_TEXT', x: s.x, y: s.y - 15, text: '已野放', color: '#9ca3af', forPlayerId: player.id });
    }
  });

  socket.on('toggleArmyState', () => {
    const player = gameState.players[socket.playerId];
    if (player && !player.isDead) {
      if (player.armyState === 'GUARD') player.armyState = 'HOLD';
      else if (player.armyState === 'HOLD') player.armyState = 'FREE';
      else player.armyState = 'GUARD';

      player.army.forEach(s => {
        s.state = player.armyState;
        s.targetId = null;
        if (s.state === 'HOLD') {
          s.anchorX = s.x; s.anchorY = s.y;
        } else if (s.state === 'GUARD') {
          s.returning = true;
        }
      });
    }
  });

  socket.on('restartGame', () => {
    const player = gameState.players[socket.playerId];
    if (player) {
      const bounds = gameState.mapBounds;
      removePlayerFromAlliance(player);
      player.gold = 250;
      player.core = null;
      player.army = [];
      player.armyState = 'GUARD';
      player.isDead = false;
      player.hp = CONFIG.COMMANDER.MAX_HP;
      player.respawnTimerSec = 0;
      player.lastHitTick = 0;
      player.lastFullHpTick = 0;
      player.x = bounds.minX + 400 + Math.random() * (bounds.width - 800);
      player.y = bounds.minY + 300 + Math.random() * (bounds.height - 600);
      player.survivalTime = 0;
      player.spawnTimerSec = 0;
      player.raidTimerSec = 0;
    }
  });

  socket.on('disconnect', () => {
    const pid = socket.playerId;
    if (pid && gameState.players[pid]) {
      const player = gameState.players[pid];
      player.isOnline = false;
      player.socketId = null;
      player.dirX = 0; player.dirY = 0;
      removePlayerFromAlliance(player);
      convertArmyToNeutral(player);
    }
    updateMapBounds();
  });
});

let tickCount = 0;
setInterval(() => {
  tickCount++;
  gameState.tickCount = tickCount;
  const dt = CONFIG.DT;

  if (tickCount % CONFIG.TICK_RATE === 0) gameState.globalTimer++;

  gameState.lasers = [];
  gameState.events = [];

  const bounds = gameState.mapBounds;
  const outOfCombatTicks = CONFIG.COMMANDER.OUT_OF_COMBAT_SEC * CONFIG.TICK_RATE;

  // 1. 指揮官與基地狀態更新
  Object.values(gameState.players).forEach(p => {
    if (p.isOnline && !p.isDead) {
      p.x += p.dirX * CONFIG.COMMANDER.SPEED * dt;
      p.y += p.dirY * CONFIG.COMMANDER.SPEED * dt;
      p.x = Math.max(bounds.minX + 15, Math.min(bounds.maxX - 15, p.x));
      p.y = Math.max(bounds.minY + 15, Math.min(bounds.maxY - 15, p.y));

      // 脫戰回血
      if (tickCount % CONFIG.TICK_RATE === 0 && tickCount - p.lastHitTick > outOfCombatTicks && p.hp < p.maxHp) {
        const healAmt = Math.min(CONFIG.COMMANDER.REGEN_HP, p.maxHp - p.hp);
        p.hp += healAmt;
        if (p.hp >= p.maxHp) {
          p.hp = p.maxHp;
          if (!p.lastFullHpTick) p.lastFullHpTick = tickCount;
        }

        const displayHeal = Math.ceil(healAmt);
        gameState.events.push({ type: 'FLOAT_TEXT', x: p.x, y: p.y - 20, text: `+${displayHeal}`, color: '#00ff66' });
      }
    }

    // 陣亡復活
    if (p.isDead && p.core && p.core.hp > 0) {
      p.respawnTimerSec -= dt;
      if (p.respawnTimerSec <= 0) {
        p.isDead = false;
        p.hp = p.maxHp;
        p.lastFullHpTick = tickCount;
        p.x = p.core.x;
        p.y = p.core.y;
        gameState.events.push({ type: 'EXPLOSION', x: p.x, y: p.y, color: '#00ff66', count: 16 });
        gameState.events.push({ type: 'FLOAT_TEXT', x: p.x, y: p.y - 20, text: '指揮官復活！', color: '#00ff66' });
      }
    }

    // 基地核心邏輯
    if (p.core && p.core.hp > 0) {
      if (tickCount % CONFIG.TICK_RATE === 0 && tickCount - p.core.lastHitTick > outOfCombatTicks && p.core.hp < p.core.maxHp) {
        const healAmt = Math.min(CONFIG.CORE.REGEN_HP, p.core.maxHp - p.core.hp);
        p.core.hp += healAmt;
        if (p.core.hp >= p.core.maxHp) {
          p.core.hp = p.core.maxHp;
          if (!p.core.lastFullHpTick) p.core.lastFullHpTick = tickCount;
        }

        const displayHeal = Math.ceil(healAmt);
        gameState.events.push({ type: 'FLOAT_TEXT', x: p.core.x, y: p.core.y - 25, text: `+${displayHeal}`, color: '#00ff66' });
      }

      p.survivalTime += dt;
      p.spawnTimerSec += dt;
      p.raidTimerSec += dt;

      // (A) 常規單隻刷錢小怪生成
      if (p.spawnTimerSec >= CONFIG.CORE.SPAWN_INTERVAL_SEC) {
        p.spawnTimerSec = 0;
        const pos = getDonutSpawnPos(p.core, bounds, gameState);
        const diffMultiplier = 1 + Math.floor(p.survivalTime / 30) * 0.3;

        gameState.monsters.push({
          id: `mon_${monsterIdCounter++}`,
          targetPlayerId: p.id,
          x: pos.x, y: pos.y,
          hp: Math.floor(CONFIG.MONSTER.BASE_HP * diffMultiplier),
          maxHp: Math.floor(CONFIG.MONSTER.BASE_HP * diffMultiplier),
          atk: Math.floor(CONFIG.MONSTER.BASE_ATK * diffMultiplier),
          speed: CONFIG.MONSTER.SPEED,
          isRaid: false
        });
      }

      // (B) 🚨 每 60 秒大軍突襲模式
      if (p.raidTimerSec >= CONFIG.CORE.RAID_INTERVAL_SEC) {
        p.raidTimerSec = 0;
        const raidCount = 6 + Math.min(6, Math.floor(p.survivalTime / 60) * 2);

        gameState.events.push({
          type: 'FLOAT_TEXT',
          x: p.core.x, y: p.core.y - 45,
          text: '🚨 紫晶大軍發起突襲！',
          color: '#ff0055',
          forPlayerId: p.id
        });

        for (let i = 0; i < raidCount; i++) {
          const pos = getDonutSpawnPos(p.core, bounds, gameState);
          const diffMultiplier = 1 + Math.floor(p.survivalTime / 30) * 0.3;

          gameState.monsters.push({
            id: `mon_${monsterIdCounter++}`,
            targetPlayerId: p.id,
            x: pos.x, y: pos.y,
            hp: Math.floor(CONFIG.MONSTER.BASE_HP * diffMultiplier * 1.2),
            maxHp: Math.floor(CONFIG.MONSTER.BASE_HP * diffMultiplier * 1.2),
            atk: Math.floor(CONFIG.MONSTER.BASE_ATK * diffMultiplier),
            speed: CONFIG.MONSTER.SPEED * 1.15,
            isRaid: true
          });
        }
      }
    }
  });

  // 🤝 關鍵升級：排除同盟關係的目標，防止防禦塔與士兵背叛盟友
  function getAttackableablesFor(ownerId) {
    const list = [];
    // 野怪全場敵對
    gameState.monsters.forEach(m => list.push({ type: 'MONSTER', id: m.id, x: m.x, y: m.y, hp: m.hp, ref: m }));

    // 敵方指揮官 (排除自己與同盟)
    Object.values(gameState.players).forEach(p => {
      if (p.id !== ownerId && !isSameAlliance(ownerId, p.id) && !p.isDead && p.isOnline) {
        list.push({ type: 'COMMANDER', id: p.id, x: p.x, y: p.y, hp: p.hp, ref: p });
      }
    });

    // 敵方士兵 (排除自己與同盟)
    Object.values(gameState.players).forEach(p => {
      if (p.id !== ownerId && !isSameAlliance(ownerId, p.id) && !p.isDead) {
        p.army.forEach(s => list.push({ type: 'SOLDIER', id: s.id, x: s.x, y: s.y, hp: s.hp, ref: s }));
      }
    });

    // 敵方防禦塔 (排除自己與同盟)
    gameState.towers.forEach(t => {
      if (t.ownerId !== ownerId && !isSameAlliance(ownerId, t.ownerId)) {
        list.push({ type: 'TOWER', id: t.id, x: t.x, y: t.y, hp: t.hp, ref: t });
      }
    });

    // 敵方基地核心 (排除自己與同盟)
    Object.values(gameState.players).forEach(p => {
      if (p.id !== ownerId && !isSameAlliance(ownerId, p.id) && p.core && p.core.hp > 0) {
        list.push({ type: 'CORE', id: p.core.id, x: p.core.x, y: p.core.y, hp: p.core.hp, ref: p.core });
      }
    });

    return list;
  }

  function applyDamage(target, damage, attackerOwnerId) {
    target.ref.hp -= damage;
    target.ref.lastHitTick = tickCount;
    target.ref.lastFullHpTick = null;

    const attackerP = gameState.players[attackerOwnerId];

    if (target.type === 'COMMANDER') {
      if (target.ref.hp <= 0) {
        target.ref.isDead = true;
        target.ref.respawnTimerSec = CONFIG.COMMANDER.RESPAWN_SEC;
        convertArmyToNeutral(target.ref);
        if (attackerP) {
          attackerP.gold += CONFIG.BOUNTIES.COMMANDER;
          gameState.events.push({ type: 'FLOAT_TEXT', x: target.x, y: target.y - 20, text: `擊殺指揮官 +${CONFIG.BOUNTIES.COMMANDER}G`, color: '#ffb700', forPlayerId: attackerP.id });
        }
        gameState.events.push({ type: 'EXPLOSION', x: target.x, y: target.y, color: '#ff0055', count: 20 });
      }
    } else if (target.type === 'CORE') {
      if (target.ref.hp <= 0) {
        const owner = gameState.players[target.ref.ownerId];
        if (owner) {
          owner.isDead = true;
          owner.core = null;
          convertArmyToNeutral(owner);
        }
        if (attackerP) {
          attackerP.gold += CONFIG.BOUNTIES.CORE;
          gameState.events.push({ type: 'FLOAT_TEXT', x: target.x, y: target.y - 20, text: `爆破基地核心 +${CONFIG.BOUNTIES.CORE}G`, color: '#ffb700', forPlayerId: attackerP.id });
        }
        gameState.events.push({ type: 'EXPLOSION', x: target.x, y: target.y, color: '#ff0055', count: 30 });
      }
    } else if (target.type === 'SOLDIER') {
      if (target.ref.hp <= 0 && attackerP) {
        const bounty = target.ref.type === 'HEAVY' ? CONFIG.BOUNTIES.SOLDIER_HEAVY : CONFIG.BOUNTIES.SOLDIER_BASIC;
        attackerP.gold += bounty;
        gameState.events.push({ type: 'FLOAT_TEXT', x: target.x, y: target.y - 15, text: `+${bounty}G`, color: '#ffb700', forPlayerId: attackerP.id });
      }
    } else if (target.type === 'TOWER') {
      if (target.ref.hp <= 0 && attackerP) {
        const bounty = target.ref.type === 'ADVANCED' ? CONFIG.BOUNTIES.TOWER_ADVANCED : CONFIG.BOUNTIES.TOWER_BASIC;
        attackerP.gold += bounty;
        gameState.events.push({ type: 'FLOAT_TEXT', x: target.x, y: target.y - 15, text: `拆塔 +${bounty}G`, color: '#ffb700', forPlayerId: attackerP.id });
      }
    }
  }

  // 2. ⚔️ 野怪 AI 與「阻擋即攻擊」仇恨機制
  gameState.monsters.forEach((m) => {
    let targetCore = null;
    const assignedPlayer = gameState.players[m.targetPlayerId];

    if (assignedPlayer && assignedPlayer.core && assignedPlayer.core.hp > 0) {
      targetCore = assignedPlayer.core;
    } else {
      const activeCores = Object.values(gameState.players).map(p => p.core).filter(c => c && c.hp > 0);
      let minDist = Infinity;
      activeCores.forEach(c => {
        const d = Math.hypot(c.x - m.x, c.y - m.y);
        if (d < minDist) { minDist = d; targetCore = c; }
      });
    }

    if (!targetCore) return;

    let blocker = null;
    let minBlockerDist = 90;

    gameState.towers.forEach(t => {
      const d = Math.hypot(t.x - m.x, t.y - m.y);
      if (d < minBlockerDist) {
        minBlockerDist = d;
        blocker = { type: 'TOWER', id: t.id, ref: t, x: t.x, y: t.y };
      }
    });

    Object.values(gameState.players).forEach(p => {
      if (p.isOnline && !p.isDead) {
        const d = Math.hypot(p.x - m.x, p.y - m.y);
        if (d < minBlockerDist) {
          minBlockerDist = d;
          blocker = { type: 'COMMANDER', id: p.id, ref: p, x: p.x, y: p.y };
        }
      }
      p.army.forEach(s => {
        const d = Math.hypot(s.x - m.x, s.y - m.y);
        if (d < minBlockerDist) {
          minBlockerDist = d;
          blocker = { type: 'SOLDIER', id: s.id, ref: s, x: s.x, y: s.y };
        }
      });
    });

    const activeTarget = blocker || { type: 'CORE', id: targetCore.id, ref: targetCore, x: targetCore.x, y: targetCore.y };
    const distToTarget = Math.hypot(activeTarget.x - m.x, activeTarget.y - m.y);

    if (distToTarget > 22) {
      m.x += ((activeTarget.x - m.x) / distToTarget) * m.speed * dt;
      m.y += ((activeTarget.y - m.y) / distToTarget) * m.speed * dt;
    } else {
      applyDamage(activeTarget, m.atk * dt, null);
    }
  });

  // 3. 防禦塔 AI
  gameState.towers.forEach(t => {
    if (t.cooldownSec > 0) t.cooldownSec -= dt;

    const candidates = getAttackableablesFor(t.ownerId).filter(c => Math.hypot(c.x - t.x, c.y - t.y) <= t.range);
    let target = null;
    if (candidates.length > 0) {
      if (t.targetId) target = candidates.find(c => c.id === t.targetId);
      if (!target) { target = candidates[0]; t.targetId = target.id; }
    } else {
      t.targetId = null;
    }

    if (t.cooldownSec <= 0 && target) {
      applyDamage(target, t.atk, t.ownerId);
      t.cooldownSec = t.maxCooldownSec;
      gameState.lasers.push({ x1: t.x, y1: t.y, x2: target.x, y2: target.y, color: t.laserColor || '#00f0ff' });
    }
  });

  // 4. 戰鬥兵 AI
  Object.values(gameState.players).forEach(player => {
    if (player.isDead) return;

    player.army.sort((a, b) => (a.type === 'HEAVY' ? 0 : 1) - (b.type === 'HEAVY' ? 0 : 1));
    const attackables = getAttackableablesFor(player.id);
    const guardArmy = player.army.filter(s => s.state === 'GUARD' || !s.state);

    const rings = [];
    let currentRingUnits = [];
    let currentCapacity = 6;
    guardArmy.forEach(s => {
      currentRingUnits.push(s);
      if (currentRingUnits.length >= currentCapacity) {
        rings.push(currentRingUnits);
        currentRingUnits = [];
        currentCapacity = Math.floor(currentCapacity * 1.8);
      }
    });
    if (currentRingUnits.length > 0) rings.push(currentRingUnits);

    let ringRadius = 32;
    rings.forEach((ringUnits, ringIdx) => {
      const countInThisRing = ringUnits.length;
      const dir = (ringIdx % 2 === 0) ? 1 : -1;
      const ringAngleOffset = (tickCount * dt) * 0.6 * dir;

      ringUnits.forEach((s, slotIdx) => {
        const angle = ringAngleOffset + (slotIdx * (Math.PI * 2 / countInThisRing));
        const orbitX = player.x + Math.cos(angle) * ringRadius;
        const orbitY = player.y + Math.sin(angle) * ringRadius;
        const distToOrbit = Math.hypot(orbitX - s.x, orbitY - s.y);

        if (s.returning) {
          if (distToOrbit < 15 || Math.hypot(player.x - s.x, player.y - s.y) < ringRadius + 15) {
            s.returning = false;
          }
        }

        let target = null;
        if (!s.returning) {
          const inRange = attackables.filter(c => Math.hypot(c.x - s.x, c.y - s.y) <= 180);
          if (inRange.length > 0) {
            target = inRange.find(c => c.id === s.targetId) || inRange[0];
            s.targetId = target.id;
          } else {
            s.targetId = null;
          }
        }

        if (target && !s.returning) {
          const dToTarget = Math.hypot(target.x - s.x, target.y - s.y);
          if (dToTarget > 20) {
            s.x += ((target.x - s.x) / dToTarget) * s.speed * dt;
            s.y += ((target.y - s.y) / dToTarget) * s.speed * dt;
          } else {
            applyDamage(target, s.atk * 2.0 * dt, player.id);
          }

          if (target.ref.hp <= 0) {
            s.targetId = null;
            if (Math.hypot(player.x - s.x, player.y - s.y) > ringRadius + 15) {
              s.returning = true;
            }
          }
        } else {
          s.targetId = null;
          if (distToOrbit > 2) {
            const moveSpeed = Math.min(distToOrbit * 5.0, s.speed + 60);
            s.x += ((orbitX - s.x) / distToOrbit) * moveSpeed * dt;
            s.y += ((orbitY - s.y) / distToOrbit) * moveSpeed * dt;
          }
        }
      });
      ringRadius += 22;
    });

    player.army.filter(s => s.state === 'FREE').forEach(s => {
      let target = null;
      let minDist = Infinity;
      attackables.forEach(c => {
        const d = Math.hypot(c.x - s.x, c.y - s.y);
        if (d < minDist) { minDist = d; target = c; }
      });

      if (target) {
        if (minDist > 20) {
          s.x += ((target.x - s.x) / minDist) * s.speed * dt;
          s.y += ((target.y - s.y) / minDist) * s.speed * dt;
        } else {
          applyDamage(target, s.atk * 2.0 * dt, player.id);
        }
      }
    });

    player.army.filter(s => s.state === 'HOLD').forEach(s => {
      const anchorX = s.anchorX || s.x;
      const anchorY = s.anchorY || s.y;

      let target = null;
      let minDist = Infinity;
      attackables.forEach(c => {
        const dFromAnchor = Math.hypot(c.x - anchorX, c.y - anchorY);
        const dFromSoldier = Math.hypot(c.x - s.x, c.y - s.y);
        if (dFromAnchor < 180 && dFromSoldier < minDist) {
          minDist = dFromSoldier;
          target = c;
        }
      });

      if (target) {
        if (minDist > 20) {
          s.x += ((target.x - s.x) / minDist) * s.speed * dt;
          s.y += ((target.y - s.y) / minDist) * s.speed * dt;
        } else {
          applyDamage(target, s.atk * 2.0 * dt, player.id);
        }
      } else {
        const dx = anchorX - s.x;
        const dy = anchorY - s.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 2) {
          const moveSpeed = Math.min(dist * 6.0, s.speed);
          s.x += (dx / dist) * moveSpeed * dt;
          s.y += (dy / dist) * moveSpeed * dt;
        }
      }
    });
  });

  // 5. 中立單位招募檢測
  for (let i = gameState.neutralSoldiers.length - 1; i >= 0; i--) {
    const ns = gameState.neutralSoldiers[i];
    let capturer = null;

    for (const p of Object.values(gameState.players)) {
      if (p.isDead || !p.isOnline) continue;

      if (Math.hypot(p.x - ns.x, p.y - ns.y) <= 12 + (ns.radius || 5)) {
        capturer = p;
        break;
      }

      for (const s of p.army) {
        if (Math.hypot(s.x - ns.x, s.y - ns.y) <= (s.radius || 5) + (ns.radius || 5)) {
          capturer = p;
          break;
        }
      }
      if (capturer) break;
    }

    if (capturer) {
      ns.ownerId = capturer.id;
      ns.state = capturer.armyState || 'GUARD';
      ns.returning = true;
      capturer.army.push(ns);
      gameState.neutralSoldiers.splice(i, 1);
      gameState.events.push({ type: 'FLOAT_TEXT', x: ns.x, y: ns.y - 12, text: '+1 招募單位', color: '#00ff66', forPlayerId: capturer.id });
    }
  }

  // 6. 物理碰撞限制
  const allSoldiers = [...gameState.neutralSoldiers];
  Object.values(gameState.players).forEach(p => { if (!p.isDead) allSoldiers.push(...p.army); });
  allSoldiers.forEach(s => {
    s.x = Math.max(bounds.minX + 10, Math.min(bounds.maxX - 10, s.x));
    s.y = Math.max(bounds.minY + 10, Math.min(bounds.maxY - 10, s.y));
  });

  for (let i = 0; i < allSoldiers.length; i++) {
    for (let j = i + 1; j < allSoldiers.length; j++) {
      const s1 = allSoldiers[i];
      const s2 = allSoldiers[j];
      const r1 = s1.radius || 5;
      const r2 = s2.radius || 5;
      const dx = s2.x - s1.x;
      const dy = s2.y - s1.y;
      const dist = Math.hypot(dx, dy);
      const minDist = r1 + r2 + 2;

      if (dist < minDist && dist > 0) {
        const overlap = (minDist - dist) / 2;
        const nx = dx / dist;
        const ny = dy / dist;
        s1.x -= nx * overlap; s1.y -= ny * overlap;
        s2.x += nx * overlap; s2.y += ny * overlap;
      }
    }
  }

  // 7. 清理死亡單位與野怪
  gameState.monsters = gameState.monsters.filter(m => {
    if (m.hp <= 0) {
      const killerP = gameState.players[m.targetPlayerId];
      if (killerP && !killerP.isDead) {
        killerP.gold += CONFIG.MONSTER.BOUNTY;
        gameState.events.push({ type: 'FLOAT_TEXT', x: m.x, y: m.y - 15, text: `+${CONFIG.MONSTER.BOUNTY}G`, color: '#ffb700', forPlayerId: killerP.id });
      }
      gameState.events.push({ type: 'EXPLOSION', x: m.x, y: m.y, color: '#a855f7' });
      return false;
    }
    return true;
  });

  gameState.towers = gameState.towers.filter(t => t.hp > 0);

  Object.values(gameState.players).forEach(p => {
    p.army = p.army.filter(s => s.hp > 0);
  });

  io.emit('gameState', gameState);
}, 1000 / CONFIG.TICK_RATE);

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`CoreClash.io 伺服器啟動於 http://localhost:${PORT} (${CONFIG.TICK_RATE} FPS / DT System)`);
});