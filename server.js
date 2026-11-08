const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const { CONFIG } = require('./server/config');
const allianceMgr = require('./server/allianceManager');
const combatMgr = require('./server/combatManager');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const gameState = {
  players: {},
  alliances: {},
  towers: [],
  monsters: [],
  lasers: [],
  events: [],
  neutralSoldiers: [],
  globalTimer: 0,
  tickCount: 0,
  maxPlayerCount: 1,
  mapBounds: { minX: 0, maxX: 1600, minY: 0, maxY: 1200, width: 1600, height: 1200, buffer: 600 }
};

const counters = {
  monsterIdCounter: 0,
  towerIdCounter: 0,
  soldierIdCounter: 0,
  allianceIdCounter: 0
};

function updateMapBounds() {
  const currentCount = Object.keys(gameState.players).length;
  if (currentCount > (gameState.maxPlayerCount || 1)) {
    gameState.maxPlayerCount = currentCount;
  }

  const playerCount = Math.max(1, gameState.maxPlayerCount || 1);
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

io.on('connection', (socket) => {
  // 🟢 加入遊戲與暱稱處理 (引進 pendingName 延遲生效)
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

    const cleanName = (nickname && nickname.trim()) ? nickname.trim().substring(0, 12) : `指揮官_${pid.substring(0, 4)}`;

    if (!gameState.players[pid]) {
      const safePos = combatMgr.getSafePlayerSpawnPos(gameState);
      gameState.players[pid] = {
        id: pid,
        name: cleanName,
        pendingName: cleanName, // 預備暱稱暫存
        socketId: socket.id,
        x: safePos.x,
        y: safePos.y,
        dirX: 0, dirY: 0,
        hp: CONFIG.COMMANDER.MAX_HP, maxHp: CONFIG.COMMANDER.MAX_HP,
        gold: 250,
        core: null,
        army: [],
        armyState: 'GUARD',
        allianceId: null,
        pendingInvite: null,
        pendingPoach: null,
        isDead: false,
        respawnTimerSec: 0,
        lastHitTick: 0,
        lastFullHpTick: 0,
        isOnline: true,
        survivalTime: 0,
        spawnTimerSec: 0,
        raidTimerSec: 0,
        speedRatio: 1.0
      };
    } else {
      const player = gameState.players[pid];
      player.socketId = socket.id;
      player.pendingName = cleanName; // 只將新名字放入預備區
      player.isOnline = true;

      // 若玩家處於未建基地或陣亡狀態，代表當前未在活著的戰局中，直接改名
      if (!player.core || player.isDead) {
        player.name = cleanName;
      }
    }

    updateMapBounds();
  });

  socket.on('createAlliance', (name) => allianceMgr.createAlliance(gameState, socket, name, counters));
  socket.on('setRecruitmentMode', (mode) => allianceMgr.setRecruitmentMode(gameState, socket, mode));
  socket.on('applyToAlliance', (id) => allianceMgr.applyToAlliance(gameState, socket, id));
  socket.on('transferLeadership', (id) => allianceMgr.transferLeadership(gameState, socket, id));
  socket.on('kickMember', (id) => allianceMgr.kickMember(gameState, socket, id));
  socket.on('inviteToAlliance', (id) => allianceMgr.inviteToAlliance(gameState, socket, id));
  socket.on('respondAllianceInvite', (accept) => allianceMgr.respondAllianceInvite(gameState, socket, accept));
  socket.on('poachPlayer', (id) => allianceMgr.poachPlayer(gameState, socket, id));
  socket.on('respondPoachInvite', (accept) => allianceMgr.respondPoachInvite(gameState, socket, accept));
  socket.on('respondAllianceApplication', (data) => allianceMgr.respondAllianceApplication(gameState, socket, data));
  socket.on('leaveAlliance', () => allianceMgr.leaveAlliance(gameState, socket));

  socket.on('repairTower', (towerId) => {
    const player = gameState.players[socket.playerId];
    if (!player || player.isDead) return;

    const t = gameState.towers.find(item => item.id === towerId);
    if (!t || t.hp >= t.maxHp) return;

    const isOwner = t.ownerId === player.id;
    const isAlly = allianceMgr.isSameAlliance(gameState, player.id, t.ownerId);
    if (!isOwner && !isAlly) return;

    const missingHpRatio = (t.maxHp - t.hp) / t.maxHp;
    const cfg = t.type === 'ADVANCED' ? CONFIG.TOWER.ADVANCED : CONFIG.TOWER.BASIC;
    const cost = Math.max(10, Math.ceil(cfg.REPAIR_MAX_COST * missingHpRatio));

    if (player.gold < cost) return;

    player.gold -= cost;
    const healedAmt = Math.ceil(t.maxHp - t.hp);
    t.hp = t.maxHp;
    t.lastFullHpTick = null;

    gameState.events.push({ type: 'EXPLOSION', x: t.x, y: t.y, color: '#00ff66', count: 12 });
    gameState.events.push({
      type: 'FLOAT_TEXT',
      x: t.x, y: t.y - 15,
      text: isOwner ? `+${healedAmt}` : `🔧 協助修復 +${healedAmt}`,
      color: '#00ff66',
      forPlayerId: player.id
    });
  });

  socket.on('playerInput', (keys) => {
    const player = gameState.players[socket.playerId];
    if (!player || player.isDead) return;
    let dx = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
    let dy = (keys.s ? 1 : 0) - (keys.w ? 1 : 0);
    const len = Math.hypot(dx, dy);
    if (len > 0) { player.dirX = dx / len; player.dirY = dy / len; }
    else { player.dirX = 0; player.dirY = 0; }
  });

  socket.on('teleportCore', () => {
    const player = gameState.players[socket.playerId];
    if (player && player.core && !player.isDead) {
      player.x = player.core.x;
      player.y = player.core.y;
      gameState.events.push({ type: 'EXPLOSION', x: player.x, y: player.y, color: '#00f0ff' });
    }
  });

  // 🟢 放置核心 (新戰局展開 -> 套用預備暱稱)
  socket.on('placeCore', (pos) => {
    const player = gameState.players[socket.playerId];
    if (player && !player.core && !player.isDead) {
      const bounds = gameState.mapBounds;
      const rawX = (pos && typeof pos.x === 'number') ? pos.x : player.x;
      const rawY = (pos && typeof pos.y === 'number') ? pos.y : player.y;
      const cx = Math.floor(rawX / 40) * 40 + 20;
      const cy = Math.floor(rawY / 40) * 40 + 20;

      if (cx < bounds.minX + 20 || cx > bounds.maxX - 20 || cy < bounds.minY + 20 || cy > bounds.maxY - 20) return;

      // ⚡ 新回合/放置基地時，同步最新預備暱稱
      if (player.pendingName) {
        player.name = player.pendingName;
      }

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
      id: `tower_${counters.towerIdCounter++}`,
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

  socket.on('sellTower', (towerId) => {
    const player = gameState.players[socket.playerId];
    if (!player || player.isDead) return;

    const idx = gameState.towers.findIndex(t => t.id === towerId && t.ownerId === player.id);
    if (idx !== -1) {
      const t = gameState.towers[idx];
      const cfg = t.type === 'ADVANCED' ? CONFIG.TOWER.ADVANCED : CONFIG.TOWER.BASIC;
      const maxHp = t.maxHp || cfg.HP;
      const hpRatio = Math.max(0, Math.min(1.0, t.hp / maxHp));
      const refund = Math.floor(cfg.REFUND * hpRatio);
      const hpPct = Math.round(hpRatio * 100);

      player.gold += refund;
      gameState.events.push({ type: 'EXPLOSION', x: t.x, y: t.y, color: '#00f0ff', count: 8 });
      gameState.events.push({
        type: 'FLOAT_TEXT',
        x: t.x, y: t.y - 15,
        text: `+${refund}G (殘值${hpPct}%)`,
        color: '#ffb700',
        forPlayerId: player.id
      });
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
      id: `soldier_${counters.soldierIdCounter++}`,
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

    const maxHp = s.maxHp || (s.type === 'HEAVY' ? CONFIG.SOLDIER.HEAVY.HP : CONFIG.SOLDIER.BASIC.HP);
    const missingHpRatio = (maxHp - s.hp) / maxHp;
    const cfg = s.type === 'HEAVY' ? CONFIG.SOLDIER.HEAVY : CONFIG.SOLDIER.BASIC;
    const cost = Math.max(5, Math.ceil(cfg.HEAL_MAX_COST * missingHpRatio));

    if (player.gold < cost) return;

    player.gold -= cost;
    const healedAmt = Math.ceil(maxHp - s.hp);
    s.hp = maxHp;
    s.maxHp = maxHp;
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
      const maxHp = s.maxHp || cfg.HP;
      const hpRatio = Math.max(0, Math.min(1.0, s.hp / maxHp));
      const refund = Math.floor(cfg.REFUND * hpRatio);
      const hpPct = Math.round(hpRatio * 100);

      player.gold += refund;
      gameState.events.push({ type: 'EXPLOSION', x: s.x, y: s.y, color: '#00f0ff', count: 6 });
      gameState.events.push({
        type: 'FLOAT_TEXT',
        x: s.x, y: s.y - 15,
        text: `+${refund}G (殘值${hpPct}%)`,
        color: '#ffb700',
        forPlayerId: player.id
      });
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

  // 🟢 重新開始遊戲 (同步預備暱稱)
  socket.on('restartGame', () => {
    const player = gameState.players[socket.playerId];
    if (player) {
      const safePos = combatMgr.getSafePlayerSpawnPos(gameState);
      allianceMgr.removePlayerFromAlliance(gameState, player);

      if (player.pendingName) {
        player.name = player.pendingName;
      }

      player.gold = 250;
      player.core = null;
      player.army = [];
      player.armyState = 'GUARD';
      player.isDead = false;
      player.hp = CONFIG.COMMANDER.MAX_HP;
      player.respawnTimerSec = 0;
      player.lastHitTick = 0;
      player.lastFullHpTick = 0;
      player.x = safePos.x;
      player.y = safePos.y;
      player.survivalTime = 0;
      player.spawnTimerSec = 0;
      player.raidTimerSec = 0;
      player.speedRatio = 1.0;
    }
  });

  // 🟢 回到大廳 (同步預備暱稱)
  socket.on('returnToLobby', () => {
    const player = gameState.players[socket.playerId];
    if (player) {
      const safePos = combatMgr.getSafePlayerSpawnPos(gameState);
      allianceMgr.removePlayerFromAlliance(gameState, player);
      combatMgr.convertArmyToNeutral(gameState, player);

      if (player.pendingName) {
        player.name = player.pendingName;
      }

      player.gold = 250;
      player.core = null;
      player.army = [];
      player.armyState = 'GUARD';
      player.isDead = false;
      player.hp = CONFIG.COMMANDER.MAX_HP;
      player.x = safePos.x;
      player.y = safePos.y;
      player.survivalTime = 0;
      player.spawnTimerSec = 0;
      player.raidTimerSec = 0;
      player.speedRatio = 1.0;
    }
  });

  socket.on('disconnect', () => {
    const pid = socket.playerId;
    if (pid && gameState.players[pid]) {
      const player = gameState.players[pid];
      player.isOnline = false;
      player.socketId = null;
      player.dirX = 0; player.dirY = 0;
      allianceMgr.removePlayerFromAlliance(gameState, player);
      combatMgr.convertArmyToNeutral(gameState, player);
    }
    updateMapBounds();
  });
});

setInterval(() => {
  combatMgr.updateGameTick(gameState, counters, io);
}, 1000 / CONFIG.TICK_RATE);

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`CoreClash.io 伺服器已模組化啟動於 http://localhost:${PORT} (${CONFIG.TICK_RATE} FPS)`);
});