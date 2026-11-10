// 🛠️ public/js/sandbox/sandboxDevTools.js - 開發者面板按鈕指令與動作處理

// ⚡ 沙盒動態經驗發放與升等運算系統 (等級上限 Lv.30)
function sandboxAddExp(amount = 25) {
  if (!isSandboxActive) return;
  const pid = typeof getPlayerId === 'function' ? getPlayerId() : window.myPlayerId;
  const p = sandboxState && sandboxState.players ? sandboxState.players[pid] : null;
  if (!p) return;

  p.level = p.level || 1;
  p.stats = p.stats || { aggro: 0, dev: 0, coop: 0, pve: 0, tactics: 0 };
  
  if (p.level >= 30) {
    p.level = 30;
    p.maxExp = 3000;
    p.exp = p.maxExp;
    return;
  }

  p.exp = (p.exp || 0) + amount;
  p.maxExp = p.level * 100;

  while (p.exp >= p.maxExp && p.level < 30) {
    p.exp -= p.maxExp;
    p.level += 1;
    p.maxExp = p.level * 100;
    sandboxState.events.push({ type: 'FLOAT_TEXT', x: p.x, y: p.y - 30, text: `⬆️ Lv.${p.level}!`, color: '#00f0ff' });
  }

  if (p.level >= 30) {
    p.level = 30;
    p.exp = p.maxExp;
    sandboxState.events.push({ type: 'FLOAT_TEXT', x: p.x, y: p.y - 30, text: '👑 已達最高等級 Lv.30', color: '#ffb700' });
  }
}
window.sandboxAddExp = sandboxAddExp;

function sandboxAddGold(amount = 10000) {
  if (!isSandboxActive) return;
  const pid = typeof getPlayerId === 'function' ? getPlayerId() : window.myPlayerId;
  const p = sandboxState && sandboxState.players ? sandboxState.players[pid] : null;
  if (p) {
    p.gold += amount;
    sandboxState.events.push({ type: 'FLOAT_TEXT', x: p.x, y: p.y - 20, text: `+${amount}G`, color: '#ffb700' });
  }
}

function sandboxAddLevel(num = 1) {
  if (!isSandboxActive) return;
  const pid = typeof getPlayerId === 'function' ? getPlayerId() : window.myPlayerId;
  const p = sandboxState && sandboxState.players ? sandboxState.players[pid] : null;
  if (p) {
    if (p.level >= 30) {
      p.level = 30;
      p.maxExp = 3000;
      p.exp = p.maxExp;
      sandboxState.events.push({ type: 'FLOAT_TEXT', x: p.x, y: p.y - 20, text: '👑 已達最高等級 Lv.30', color: '#ffb700' });
      return;
    }
    p.level = Math.min(30, (p.level || 1) + num);
    p.maxExp = p.level * 100;
    if (p.level >= 30) p.exp = p.maxExp;
    sandboxState.events.push({ type: 'FLOAT_TEXT', x: p.x, y: p.y - 20, text: `LEVEL UP! Lv.${p.level}`, color: '#00ff66' });
  }
}

function sandboxMaxLevel() {
  if (!isSandboxActive) return;
  const pid = typeof getPlayerId === 'function' ? getPlayerId() : window.myPlayerId;
  const p = sandboxState && sandboxState.players ? sandboxState.players[pid] : null;
  if (p) {
    p.level = 30;
    p.maxExp = 3000;
    p.exp = 3000;
    sandboxState.events.push({ type: 'FLOAT_TEXT', x: p.x, y: p.y - 20, text: '👑 等級已封頂 (Lv.30)!', color: '#ffb700' });
  }
}

function sandboxToggleGodMode() {
  if (!isSandboxActive) return;
  const pid = typeof getPlayerId === 'function' ? getPlayerId() : window.myPlayerId;
  const p = sandboxState && sandboxState.players ? sandboxState.players[pid] : null;
  if (p) {
    p.isInvincible = !p.isInvincible;
    const statusText = p.isInvincible ? '🛡️ 無敵模式已開啟 (鎖血)' : '❌ 無敵模式已關閉';
    sandboxState.events.push({ type: 'FLOAT_TEXT', x: p.x, y: p.y - 20, text: statusText, color: p.isInvincible ? '#00ff66' : '#ff0055' });
  }
}

function sandboxSpawnMonster(isRaid = false) {
  if (!isSandboxActive) return;
  const pid = typeof getPlayerId === 'function' ? getPlayerId() : window.myPlayerId;
  const p = sandboxState && sandboxState.players ? sandboxState.players[pid] : null;
  if (!p) return;

  const pos = p.core ? getDonutSpawnPos(p.core, sandboxState.mapBounds) : { x: p.x + 200, y: p.y + 200 };
  const diffMultiplier = 1 + Math.floor((p.survivalTime || 0) / 30) * 0.3;

  sandboxState.monsters.push({
    id: `mon_${counters.monsterIdCounter++}`,
    targetPlayerId: pid,
    x: pos.x, y: pos.y,
    hp: Math.floor(CONFIG.MONSTER.BASE_HP * diffMultiplier * (isRaid ? 1.2 : 1.0)),
    maxHp: Math.floor(CONFIG.MONSTER.BASE_HP * diffMultiplier * (isRaid ? 1.2 : 1.0)),
    atk: CONFIG.MONSTER.BASE_ATK,
    speed: CONFIG.MONSTER.SPEED * (isRaid ? 1.15 : 1.0),
    radius: isRaid ? CONFIG.MONSTER.RAID_RADIUS : CONFIG.MONSTER.RADIUS,
    attackCooldownSec: 0,
    isRaid: isRaid
  });

  sandboxState.events.push({ type: 'EXPLOSION', x: pos.x, y: pos.y, color: isRaid ? '#ec4899' : '#a855f7', count: 12 });
}

function sandboxBuildEnemyTower(type = 'BASIC') {
  if (!isSandboxActive) return;
  window.buildMode = (type === 'ADVANCED') ? 'ENEMY_TOWER_ADVANCED' : 'ENEMY_TOWER_BASIC';
}

function sandboxSpawnEnemySoldier(type = 'BASIC') {
  if (!isSandboxActive) return;
  window.buildMode = (type === 'HEAVY') ? 'ENEMY_SOLDIER_HEAVY' : 'ENEMY_SOLDIER_BASIC';
}

function sandboxHealAllUnits() {
  if (!isSandboxActive) return;
  const pid = typeof getPlayerId === 'function' ? getPlayerId() : window.myPlayerId;
  const p = sandboxState && sandboxState.players ? sandboxState.players[pid] : null;
  if (p) {
    p.hp = p.maxHp;
    p.isDead = false;
    if (p.core) p.core.hp = p.core.maxHp;
    p.army.forEach(s => s.hp = s.maxHp);
    sandboxState.events.push({ type: 'FLOAT_TEXT', x: p.x, y: p.y - 20, text: '💚 全單位血量全滿！', color: '#00ff66' });
  }
}

function sandboxClearEnemies() {
  if (!isSandboxActive) return;
  sandboxState.monsters = [];
  const enemyAI = sandboxState.players['enemy_ai'];
  if (enemyAI) enemyAI.army = [];
}

function sandboxClearTowers() {
  if (!isSandboxActive) return;
  sandboxState.towers = [];
}

function sandboxClearAllSoldiers() {
  if (!isSandboxActive) return;
  Object.values(sandboxState.players).forEach(p => { p.army = []; });
  sandboxState.neutralSoldiers = [];
  const pid = typeof getPlayerId === 'function' ? getPlayerId() : window.myPlayerId;
  const p = sandboxState && sandboxState.players ? sandboxState.players[pid] : null;
  if (p) {
    sandboxState.events.push({ type: 'FLOAT_TEXT', x: p.x, y: p.y - 20, text: '💥 全場部隊已重置清空！', color: '#ff0055' });
  }
}

function sandboxResetCore() {
  if (!isSandboxActive) return;
  const pid = typeof getPlayerId === 'function' ? getPlayerId() : window.myPlayerId;
  const p = sandboxState && sandboxState.players ? sandboxState.players[pid] : null;
  if (p && p.core) {
    sandboxState.events.push({ type: 'EXPLOSION', x: p.core.x, y: p.core.y, color: '#ff0055', count: 24 });
    p.core = null;
    p.army = [];
    sandboxState.towers = sandboxState.towers.filter(t => t.ownerId !== pid);
    sandboxState.monsters = [];
    sandboxState.events.push({ type: 'FLOAT_TEXT', x: p.x, y: p.y - 20, text: '💥 基地、塔與部隊已重置！', color: '#ff0055' });
  }
}

function sandboxResetExp() {
  if (!isSandboxActive) return;
  const pid = typeof getPlayerId === 'function' ? getPlayerId() : window.myPlayerId;
  const p = sandboxState && sandboxState.players ? sandboxState.players[pid] : null;
  if (p) {
    p.level = 1;
    p.exp = 0;
    p.maxExp = 100;
    p.stats = { aggro: 0, dev: 0, coop: 0, pve: 0, tactics: 0 };
    p.classRole = null;
    sandboxState.events.push({ type: 'FLOAT_TEXT', x: p.x, y: p.y - 20, text: '✨ 等級與行為數據已重置', color: '#00f0ff' });
  }
}

function sandboxResetGold() {
  if (!isSandboxActive) return;
  const pid = typeof getPlayerId === 'function' ? getPlayerId() : window.myPlayerId;
  const p = sandboxState && sandboxState.players ? sandboxState.players[pid] : null;
  if (p) {
    p.gold = 250;
    sandboxState.events.push({ type: 'FLOAT_TEXT', x: p.x, y: p.y - 20, text: '🪙 金幣重置為 250G', color: '#ffb700' });
  }
}

function handleSandboxAction(action, data) {
  if (!isSandboxActive) return;
  const pid = typeof getPlayerId === 'function' ? getPlayerId() : window.myPlayerId;
  const p = sandboxState && sandboxState.players ? sandboxState.players[pid] : null;
  if (!p) return;

  p.stats = p.stats || { aggro: 0, dev: 0, coop: 0, pve: 0, tactics: 0 };

  if (action === 'placeCore') {
    const cx = Math.floor(data.x / 40) * 40 + 20;
    const cy = Math.floor(data.y / 40) * 40 + 20;
    p.core = { id: `core_${pid}`, ownerId: pid, x: cx, y: cy, hp: CONFIG.CORE.MAX_HP, maxHp: CONFIG.CORE.MAX_HP, lastHitTick: 0 };
    p.spawnTimerSec = 0;
    p.raidTimerSec = 0;
    p.survivalTime = 0;
    p.isDead = false;
    p.hp = p.maxHp;

    sandboxState.events.push({ type: 'EXPLOSION', x: cx, y: cy, color: '#00f0ff', count: 16 });
  } else if (action === 'buyTower') {
    const tx = Math.floor(data.x / 40) * 40 + 20;
    const ty = Math.floor(data.y / 40) * 40 + 20;
    const isAdv = data.type === 'ADVANCED';
    const cfg = isAdv ? CONFIG.TOWER.ADVANCED : CONFIG.TOWER.BASIC;
    if (p.gold >= cfg.COST) {
      p.gold -= cfg.COST;
      sandboxState.towers.push({
        id: `tower_${counters.towerIdCounter++}`,
        ownerId: pid,
        type: data.type,
        x: tx, y: ty,
        hp: cfg.HP, maxHp: cfg.HP,
        range: cfg.RANGE, atk: cfg.ATK,
        cooldownSec: 0, maxCooldownSec: cfg.COOLDOWN_SEC,
        laserColor: isAdv ? '#ff0055' : '#00f0ff'
      });
      
      // 📊 增加建設傾向與經驗
      p.stats.dev = (p.stats.dev || 0) + 1;
      sandboxAddExp(15);
      
      sandboxState.events.push({ type: 'FLOAT_TEXT', x: tx, y: ty - 15, text: `-${cfg.COST}G`, color: '#ffb700' });
    }
  } else if (action === 'placeEnemyTower') {
    const tx = Math.floor(data.x / 40) * 40 + 20;
    const ty = Math.floor(data.y / 40) * 40 + 20;
    const isOverlap = sandboxState.towers.some(t => Math.abs(t.x - tx) < 30 && Math.abs(t.y - ty) < 30);
    if (!isOverlap) {
      const isAdv = data.type === 'ADVANCED';
      const cfg = isAdv ? CONFIG.TOWER.ADVANCED : CONFIG.TOWER.BASIC;
      sandboxState.towers.push({
        id: `tower_enemy_${counters.towerIdCounter++}`,
        ownerId: 'enemy_ai',
        type: data.type,
        x: tx, y: ty,
        hp: cfg.HP, maxHp: cfg.HP,
        range: cfg.RANGE, atk: cfg.ATK,
        cooldownSec: 0, maxCooldownSec: cfg.COOLDOWN_SEC,
        laserColor: '#ff0055'
      });
      sandboxState.events.push({ type: 'FLOAT_TEXT', x: tx, y: ty - 15, text: '⚠️ 敵方防禦塔放置', color: '#ff0055' });
    }
  } else if (action === 'placeEnemySoldier') {
    const isHeavy = data.type === 'HEAVY';
    const cfg = isHeavy ? CONFIG.SOLDIER.HEAVY : CONFIG.SOLDIER.BASIC;
    const enemyAI = sandboxState.players['enemy_ai'];

    if (enemyAI) {
      enemyAI.army.push({
        id: `soldier_enemy_${counters.soldierIdCounter++}`,
        ownerId: 'enemy_ai',
        type: data.type,
        x: data.x,
        y: data.y,
        anchorX: data.x,
        anchorY: data.y,
        targetId: null,
        returning: false,
        hp: cfg.HP, maxHp: cfg.HP,
        atk: cfg.ATK, speed: cfg.SPEED,
        radius: cfg.RADIUS,
        state: 'HOLD',
        attackCooldownSec: 0
      });
    }

    sandboxState.events.push({ type: 'FLOAT_TEXT', x: data.x, y: data.y - 15, text: `⚠️ 敵方${isHeavy ? '重裝' : '步'}兵(駐守)`, color: '#ff0055' });
  } else if (action === 'buySoldier') {
    const isHeavy = data === 'HEAVY';
    const cfg = isHeavy ? CONFIG.SOLDIER.HEAVY : CONFIG.SOLDIER.BASIC;
    if (p.gold >= cfg.COST) {
      p.gold -= cfg.COST;
      const spawnX = p.x + (Math.random() * 20 - 10);
      const spawnY = p.y + (Math.random() * 20 - 10);

      p.army.push({
        id: `soldier_${counters.soldierIdCounter++}`,
        ownerId: pid,
        type: data,
        x: spawnX, y: spawnY,
        anchorX: spawnX, anchorY: spawnY,
        targetId: null, returning: false,
        hp: cfg.HP, maxHp: cfg.HP,
        atk: cfg.ATK, speed: cfg.SPEED,
        radius: cfg.RADIUS,
        state: p.armyState || 'GUARD',
        attackCooldownSec: 0
      });

      // 📊 增加戰術指揮傾向與經驗
      p.stats.tactics = (p.stats.tactics || 0) + 1;
      sandboxAddExp(10);
    }
  } else if (action === 'teleportCore') {
    if (p.core) {
      p.x = p.core.x;
      p.y = p.core.y;
      sandboxState.events.push({ type: 'EXPLOSION', x: p.x, y: p.y, color: '#00f0ff' });
    }
  } else if (action === 'toggleArmyState') {
    if (p.armyState === 'GUARD') p.armyState = 'HOLD';
    else if (p.armyState === 'HOLD') p.armyState = 'FREE';
    else p.armyState = 'GUARD';

    p.army.forEach(s => {
      s.state = p.armyState;
      s.targetId = null;
      if (s.state === 'HOLD') {
        s.anchorX = s.x; s.anchorY = s.y;
      } else if (s.state === 'GUARD') {
        s.returning = true;
      }
    });
  }
}

// 🟢 掛載全域 Window 導出
window.handleSandboxAction = handleSandboxAction;
window.sandboxAddGold = sandboxAddGold;
window.sandboxAddLevel = sandboxAddLevel;
window.sandboxMaxLevel = sandboxMaxLevel;
window.sandboxToggleGodMode = sandboxToggleGodMode;
window.sandboxSpawnMonster = sandboxSpawnMonster;
window.sandboxBuildEnemyTower = sandboxBuildEnemyTower;
window.sandboxSpawnEnemySoldier = sandboxSpawnEnemySoldier;
window.sandboxHealAllUnits = sandboxHealAllUnits;
window.sandboxClearEnemies = sandboxClearEnemies;
window.sandboxClearTowers = sandboxClearTowers;
window.sandboxClearAllSoldiers = sandboxClearAllSoldiers;
window.sandboxResetCore = sandboxResetCore;
window.sandboxResetExp = sandboxResetExp;
window.sandboxResetGold = sandboxResetGold;