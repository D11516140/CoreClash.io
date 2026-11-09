// 🧪 public/js/sandbox/sandboxEngine.js - 核心引擎與生命週期管理

const CONFIG = {
  TICK_RATE: 60,
  DT: 1 / 60,
  COMMANDER: {
    MAX_HP: 400, SPEED: 300, REGEN_HP: 8, OUT_OF_COMBAT_SEC: 5.0, RESPAWN_SEC: 10.0,
    SLOWDOWN_TARGET_WEIGHT: 70, MIN_SPEED_RATIO: 0.4
  },
  CORE: {
    MAX_HP: 1000, REGEN_HP: 15, OUT_OF_COMBAT_SEC: 5.0, SPAWN_INTERVAL_SEC: 6.0, RAID_INTERVAL_SEC: 60.0, SAFE_ZONE_RADIUS: 480
  },
  TOWER: {
    BASIC: { HP: 500, RANGE: 160, ATK: 30, COOLDOWN_SEC: 0.5, COST: 100 },
    ADVANCED: { HP: 500, RANGE: 260, ATK: 85, COOLDOWN_SEC: 1.25, COST: 200 }
  },
  SOLDIER: {
    BASIC: { HP: 100, ATK: 15, SPEED: 228, RADIUS: 5, COST: 50, WEIGHT: 1 },
    HEAVY: { HP: 280, ATK: 35, SPEED: 150, RADIUS: 8, COST: 120, WEIGHT: 2 }
  },
  MONSTER: {
    BASE_HP: 40, BASE_ATK: 8, SPEED: 108, RADIUS: 8, RAID_RADIUS: 10, BOUNTY: 25, COOLDOWN_SEC: 0.8
  },
  BOUNTIES: { SOLDIER_BASIC: 15, SOLDIER_HEAVY: 35, TOWER_BASIC: 50, TOWER_ADVANCED: 100 }
};

let isSandboxActive = false;
let sandboxInterval = null;

let sandboxState = {
  players: {},
  alliances: {},
  towers: [],
  monsters: [],
  neutralSoldiers: [],
  lasers: [],
  events: [],
  globalTimer: 0,
  tickCount: 0,
  mapBounds: { minX: 0, maxX: 1600, minY: 0, maxY: 1200, width: 1600, height: 1200, buffer: 600 }
};

let counters = { towerIdCounter: 1, soldierIdCounter: 1, monsterIdCounter: 1 };

function getPlayerId() {
  if (!window.myPlayerId) {
    window.myPlayerId = localStorage.getItem('corewar_player_id');
    if (!window.myPlayerId) {
      window.myPlayerId = 'player_' + Math.random().toString(36).substring(2, 9);
      localStorage.setItem('corewar_player_id', window.myPlayerId);
    }
  }
  return window.myPlayerId;
}

function startSandboxMode() {
  isSandboxActive = true;
  window.isSandboxActive = true;

  const pid = getPlayerId();

  const lobbyModal = document.getElementById('lobby-modal');
  if (lobbyModal) lobbyModal.style.display = 'none';

  const allianceCard = document.querySelector('.alliance-card');
  if (allianceCard) allianceCard.style.display = 'none';

  const devCard = document.getElementById('sandbox-dev-card');
  if (devCard) devCard.style.display = 'flex';

  const savedName = localStorage.getItem('corewar_player_name') || '沙盒測試員';
  const savedColor = localStorage.getItem('corewar_player_color') || '#ffb700';

  sandboxState = {
    players: {
      [pid]: {
        id: pid,
        name: savedName,
        color: savedColor,
        x: 800, y: 600,
        dirX: 0, dirY: 0,
        radius: 12,
        hp: CONFIG.COMMANDER.MAX_HP, maxHp: CONFIG.COMMANDER.MAX_HP,
        gold: 250,
        core: null,
        army: [],
        armyState: 'GUARD',
        allianceId: null,
        isDead: false,
        isOnline: true,
        isInvincible: false,
        speedRatio: 1.0,
        score: 0,
        level: 1,
        exp: 0,
        maxExp: 100,
        classRole: null,
        stats: { aggro: 0, dev: 0, coop: 0, pve: 0, tactics: 0 },
        survivalTime: 0,
        spawnTimerSec: 0,
        raidTimerSec: 0,
        respawnTimerSec: 0,
        lastHitTick: 0
      },
      'enemy_ai': {
        id: 'enemy_ai',
        name: '敵方軍團',
        color: '#ff0055',
        x: 0, y: 0,
        radius: 12,
        army: [],
        isDead: false,
        isOnline: false,
        isDummy: true
      }
    },
    alliances: {},
    towers: [],
    monsters: [],
    neutralSoldiers: [],
    lasers: [],
    events: [],
    globalTimer: 0,
    tickCount: 0,
    mapBounds: { minX: 0, maxX: 1600, minY: 0, maxY: 1200, width: 1600, height: 1200, buffer: 600 }
  };

  if (sandboxInterval) clearInterval(sandboxInterval);
  sandboxInterval = setInterval(updateSandboxTick, 1000 / 60);
}

function exitSandboxMode() {
  isSandboxActive = false;
  window.isSandboxActive = false;
  if (sandboxInterval) clearInterval(sandboxInterval);

  sandboxState.monsters = [];
  sandboxState.towers = [];
  sandboxState.neutralSoldiers = [];
  sandboxState.lasers = [];
  sandboxState.events = [];
  window.buildMode = null;
  window.activeMenu = null;

  const devCard = document.getElementById('sandbox-dev-card');
  if (devCard) devCard.style.display = 'none';

  const allianceCard = document.querySelector('.alliance-card');
  if (allianceCard) allianceCard.style.display = 'flex';

  const lobbyModal = document.getElementById('lobby-modal');
  if (lobbyModal) lobbyModal.style.display = 'flex';

  if (typeof exitSubMenu === 'function') exitSubMenu();
}

function updateSandboxTick() {
  if (!isSandboxActive) return;
  sandboxState.tickCount++;
  const dt = CONFIG.DT;

  sandboxState.lasers = [];
  sandboxState.events = [];
  const bounds = sandboxState.mapBounds;

  const pid = getPlayerId();
  const p = sandboxState.players[pid];

  if (p && p.isOnline && !p.isDead) {
    let totalWeight = 0;
    (p.army || []).forEach(s => {
      totalWeight += (s.type === 'HEAVY' ? CONFIG.SOLDIER.HEAVY.WEIGHT : CONFIG.SOLDIER.BASIC.WEIGHT);
    });

    const maxSlowWeight = CONFIG.COMMANDER.SLOWDOWN_TARGET_WEIGHT;
    const minRatio = CONFIG.COMMANDER.MIN_SPEED_RATIO;
    const weightRatio = Math.min(1.0, totalWeight / maxSlowWeight);
    const speedRatio = Math.max(minRatio, 1.0 - weightRatio * (1.0 - minRatio));
    p.speedRatio = speedRatio;

    const currentSpeed = CONFIG.COMMANDER.SPEED * speedRatio;
    const keys = window.keys || { w: false, a: false, s: false, d: false };
    let dx = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
    let dy = (keys.s ? 1 : 0) - (keys.w ? 1 : 0);
    const len = Math.hypot(dx, dy);

    const oldX = p.x;
    const oldY = p.y;
    if (len > 0) {
      p.x += (dx / len) * currentSpeed * dt;
      p.y += (dy / len) * currentSpeed * dt;
    }
    p.x = Math.max(bounds.minX + 15, Math.min(bounds.maxX - 15, p.x));
    p.y = Math.max(bounds.minY + 15, Math.min(bounds.maxY - 15, p.y));

    const deltaX = p.x - oldX;
    const deltaY = p.y - oldY;

    if (deltaX !== 0 || deltaY !== 0) {
      p.army.forEach(s => {
        if ((s.state === 'GUARD' || !s.state) && !s.targetId) {
          if (Math.hypot(p.x - s.x, p.y - s.y) < 180) {
            s.x += deltaX;
            s.y += deltaY;
          }
        }
      });
    }

    if (p.core && p.core.hp > 0) {
      p.survivalTime += dt;
      p.spawnTimerSec += dt;
      p.raidTimerSec += dt;

      if (p.spawnTimerSec >= CONFIG.CORE.SPAWN_INTERVAL_SEC) {
        p.spawnTimerSec = 0;
        const pos = getDonutSpawnPos(p.core, bounds);
        const diffMultiplier = 1 + Math.floor(p.survivalTime / 30) * 0.3;

        sandboxState.monsters.push({
          id: `mon_${counters.monsterIdCounter++}`,
          targetPlayerId: p.id,
          x: pos.x, y: pos.y,
          hp: Math.floor(CONFIG.MONSTER.BASE_HP * diffMultiplier),
          maxHp: Math.floor(CONFIG.MONSTER.BASE_HP * diffMultiplier),
          atk: CONFIG.MONSTER.BASE_ATK,
          speed: CONFIG.MONSTER.SPEED,
          radius: CONFIG.MONSTER.RADIUS,
          attackCooldownSec: 0,
          isRaid: false
        });
      }

      if (p.raidTimerSec >= CONFIG.CORE.RAID_INTERVAL_SEC) {
        p.raidTimerSec = 0;
        const raidCount = 6 + Math.min(6, Math.floor(p.survivalTime / 60) * 2);

        sandboxState.events.push({
          type: 'FLOAT_TEXT', x: p.core.x, y: p.core.y - 45, text: '🚨 紫晶大軍發起突襲！', color: '#ff0055'
        });

        for (let i = 0; i < raidCount; i++) {
          const pos = getDonutSpawnPos(p.core, bounds);
          const diffMultiplier = 1 + Math.floor(p.survivalTime / 30) * 0.3;

          sandboxState.monsters.push({
            id: `mon_${counters.monsterIdCounter++}`,
            targetPlayerId: p.id,
            x: pos.x, y: pos.y,
            hp: Math.floor(CONFIG.MONSTER.BASE_HP * diffMultiplier * 1.2),
            maxHp: Math.floor(CONFIG.MONSTER.BASE_HP * diffMultiplier * 1.2),
            atk: CONFIG.MONSTER.BASE_ATK,
            speed: CONFIG.MONSTER.SPEED * 1.15,
            radius: CONFIG.MONSTER.RAID_RADIUS,
            attackCooldownSec: 0,
            isRaid: true
          });
        }
      }
    }
  }

  if (p && p.isDead) {
    if (!p.respawnTimerSec) p.respawnTimerSec = CONFIG.COMMANDER.RESPAWN_SEC;
    p.respawnTimerSec -= dt;
    if (p.respawnTimerSec <= 0) {
      p.isDead = false;
      p.hp = p.maxHp;
      if (p.core) { p.x = p.core.x; p.y = p.core.y; }
      sandboxState.events.push({ type: 'EXPLOSION', x: p.x, y: p.y, color: '#00ff66', count: 16 });
      sandboxState.events.push({ type: 'FLOAT_TEXT', x: p.x, y: p.y - 20, text: '指揮官復活！', color: '#00ff66' });
    }
  }

  if (typeof runSandboxCombatLogic === 'function') {
    runSandboxCombatLogic(dt);
  }

  window.lastGameState = sandboxState;
  if (typeof updateHUD === 'function') updateHUD(sandboxState);
}

window.startSandboxMode = startSandboxMode;
window.exitSandboxMode = exitSandboxMode;