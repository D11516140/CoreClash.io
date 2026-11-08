// 🧪 public/js/sandboxManager.js - 純前端單機沙盒戰鬥引擎

(function () {
  let isSandboxActive = false;
  let sandboxInterval = null;

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

  function getAttackablesFor(ownerId) {
    const list = [];
    sandboxState.monsters.forEach(m => list.push({ type: 'MONSTER', id: m.id, x: m.x, y: m.y, hp: m.hp, ref: m }));

    Object.values(sandboxState.players).forEach(p => {
      if (p.id !== ownerId && !p.isDead && p.isOnline) {
        list.push({ type: 'COMMANDER', id: p.id, x: p.x, y: p.y, hp: p.hp, ref: p });
      }
      if (p.id !== ownerId) {
        p.army.forEach(s => list.push({ type: 'SOLDIER', id: s.id, x: s.x, y: s.y, hp: s.hp, ref: s }));
      }
    });

    sandboxState.towers.forEach(t => {
      if (t.ownerId !== ownerId) {
        list.push({ type: 'TOWER', id: t.id, x: t.x, y: t.y, hp: t.hp, ref: t });
      }
    });

    Object.values(sandboxState.players).forEach(p => {
      if (p.id !== ownerId && p.core && p.core.hp > 0) {
        list.push({ type: 'CORE', id: p.core.id, x: p.core.x, y: p.core.y, hp: p.core.hp, ref: p.core });
      }
    });

    return list;
  }

  function getDonutSpawnPos(core, bounds) {
    const safeCoreRadius = CONFIG.CORE.SAFE_ZONE_RADIUS;
    const safeTowerRadius = 250;

    for (let attempt = 0; attempt < 50; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = safeCoreRadius + Math.random() * 320;
      const sx = core.x + Math.cos(angle) * dist;
      const sy = core.y + Math.sin(angle) * dist;

      if (sx < bounds.minX - 500 || sx > bounds.maxX + 500 || sy < bounds.minY - 500 || sy > bounds.maxY + 500) continue;

      let nearTower = false;
      for (const t of sandboxState.towers) {
        if (Math.hypot(t.x - sx, t.y - sy) < safeTowerRadius) {
          nearTower = true;
          break;
        }
      }
      if (nearTower) continue;

      return { x: sx, y: sy };
    }

    const angle = Math.random() * Math.PI * 2;
    return { x: core.x + Math.cos(angle) * 650, y: core.y + Math.sin(angle) * 650 };
  }

  function applyDamage(target, damage, attackerOwnerId) {
    target.ref.hp -= damage;
    target.ref.lastHitTick = sandboxState.tickCount;

    const isMonster = target.type === 'MONSTER';
    const floatColor = isMonster ? '#a855f7' : '#ff0055';
    const roundedDmg = Math.ceil(damage);
    if (roundedDmg > 0) {
      sandboxState.events.push({
        type: 'FLOAT_TEXT', x: target.x, y: target.y - 12, text: `-${roundedDmg}`, color: floatColor
      });
    }

    const pid = getPlayerId();
    const attackerP = sandboxState.players[attackerOwnerId];

    if (target.type === 'COMMANDER' && target.ref.hp <= 0 && !target.ref.isDead) {
      target.ref.isDead = true;
      target.ref.respawnTimerSec = CONFIG.COMMANDER.RESPAWN_SEC;
      sandboxState.events.push({ type: 'EXPLOSION', x: target.x, y: target.y, color: '#ff0055', count: 20 });
    } else if (target.type === 'CORE' && target.ref.hp <= 0) {
      const owner = sandboxState.players[target.ref.ownerId];
      if (owner) {
        owner.isDead = true;
        owner.core = null;

        sandboxState.towers.forEach(t => {
          if (t.ownerId === owner.id) {
            sandboxState.events.push({ type: 'EXPLOSION', x: t.x, y: t.y, color: '#ff0055', count: 12 });
          }
        });
        sandboxState.towers = sandboxState.towers.filter(t => t.ownerId !== owner.id);

        sandboxState.monsters.forEach(m => {
          sandboxState.events.push({ type: 'EXPLOSION', x: m.x, y: m.y, color: '#a855f7', count: 8 });
        });
        sandboxState.monsters = [];
      }
      sandboxState.events.push({ type: 'EXPLOSION', x: target.x, y: target.y, color: '#ff0055', count: 30 });
    } else if (target.type === 'SOLDIER' && target.ref.hp <= 0 && attackerP) {
      const bounty = target.ref.type === 'HEAVY' ? CONFIG.BOUNTIES.SOLDIER_HEAVY : CONFIG.BOUNTIES.SOLDIER_BASIC;
      attackerP.gold += bounty;
      sandboxState.events.push({ type: 'FLOAT_TEXT', x: target.x, y: target.y - 15, text: `+${bounty}G`, color: '#ffb700' });
    } else if (target.type === 'TOWER' && target.ref.hp <= 0 && attackerP) {
      const bounty = target.ref.type === 'ADVANCED' ? CONFIG.BOUNTIES.TOWER_ADVANCED : CONFIG.BOUNTIES.TOWER_BASIC;
      attackerP.gold += bounty;
      sandboxState.events.push({ type: 'FLOAT_TEXT', x: target.x, y: target.y - 15, text: `拆塔 +${bounty}G`, color: '#ffb700' });
    }
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
          speedRatio: 1.0,
          score: 0,
          level: 1,
          exp: 0,
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
          isOnline: true
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

  function sandboxAddGold(amount = 10000) {
    if (!isSandboxActive) return;
    const pid = getPlayerId();
    const p = sandboxState.players[pid];
    if (p) {
      p.gold += amount;
      sandboxState.events.push({ type: 'FLOAT_TEXT', x: p.x, y: p.y - 20, text: `+${amount}G`, color: '#ffb700' });
    }
  }

  function sandboxAddLevel(num = 1) {
    if (!isSandboxActive) return;
    const pid = getPlayerId();
    const p = sandboxState.players[pid];
    if (p) {
      p.level = (p.level || 1) + num;
      sandboxState.events.push({ type: 'FLOAT_TEXT', x: p.x, y: p.y - 20, text: `LEVEL UP! Lv.${p.level}`, color: '#00ff66' });
    }
  }

  function sandboxMaxLevel() {
    if (!isSandboxActive) return;
    const pid = getPlayerId();
    const p = sandboxState.players[pid];
    if (p) {
      p.level = 99;
      sandboxState.events.push({ type: 'FLOAT_TEXT', x: p.x, y: p.y - 20, text: 'MAX LEVEL 99!', color: '#ffb700' });
    }
  }

  function sandboxSpawnMonster(isRaid = false) {
    if (!isSandboxActive) return;
    const pid = getPlayerId();
    const p = sandboxState.players[pid];
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
    const pid = getPlayerId();
    const p = sandboxState.players[pid];
    if (!p) return;

    const isHeavy = type === 'HEAVY';
    const cfg = isHeavy ? CONFIG.SOLDIER.HEAVY : CONFIG.SOLDIER.BASIC;
    const enemyAI = sandboxState.players['enemy_ai'];

    enemyAI.army.push({
      id: `soldier_enemy_${counters.soldierIdCounter++}`,
      ownerId: 'enemy_ai',
      type: type,
      x: p.x + 180 + (Math.random() * 40 - 20),
      y: p.y + (Math.random() * 40 - 20),
      hp: cfg.HP, maxHp: cfg.HP,
      atk: cfg.ATK, speed: cfg.SPEED,
      radius: cfg.RADIUS, state: 'FREE',
      attackCooldownSec: 0
    });

    sandboxState.events.push({ type: 'FLOAT_TEXT', x: p.x + 180, y: p.y - 15, text: `⚠️ 敵方${isHeavy ? '重裝' : '步'}兵`, color: '#ff0055' });
  }

  function sandboxHealAllUnits() {
    if (!isSandboxActive) return;
    const pid = getPlayerId();
    const p = sandboxState.players[pid];
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

  function sandboxResetExp() {
    if (!isSandboxActive) return;
    const pid = getPlayerId();
    const p = sandboxState.players[pid];
    if (p) {
      p.level = 1;
      p.exp = 0;
      sandboxState.events.push({ type: 'FLOAT_TEXT', x: p.x, y: p.y - 20, text: '✨ 等級經驗已重置', color: '#00f0ff' });
    }
  }

  function sandboxResetGold() {
    if (!isSandboxActive) return;
    const pid = getPlayerId();
    const p = sandboxState.players[pid];
    if (p) {
      p.gold = 250;
      sandboxState.events.push({ type: 'FLOAT_TEXT', x: p.x, y: p.y - 20, text: '🪙 金幣重置為 250G', color: '#ffb700' });
    }
  }

  function handleSandboxAction(action, data) {
    if (!isSandboxActive) return;
    const pid = getPlayerId();
    const p = sandboxState.players[pid];
    if (!p) return;

    if (action === 'placeCore') {
      const cx = Math.floor(data.x / 40) * 40 + 20;
      const cy = Math.floor(data.y / 40) * 40 + 20;
      p.core = { id: `core_${pid}`, ownerId: pid, x: cx, y: cy, hp: CONFIG.CORE.MAX_HP, maxHp: CONFIG.CORE.MAX_HP, lastHitTick: 0 };
      p.spawnTimerSec = 0;
      p.raidTimerSec = 0;
      p.survivalTime = 0;

      p.isDead = false;
      p.hp = p.maxHp;
      p.x = cx;
      p.y = cy;

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
    } else if (action === 'buySoldier') {
      const isHeavy = data === 'HEAVY';
      const cfg = isHeavy ? CONFIG.SOLDIER.HEAVY : CONFIG.SOLDIER.BASIC;
      if (p.gold >= cfg.COST) {
        p.gold -= cfg.COST;
        p.army.push({
          id: `soldier_${counters.soldierIdCounter++}`,
          ownerId: pid,
          type: data,
          x: p.x + (Math.random() * 20 - 10),
          y: p.y + (Math.random() * 20 - 10),
          hp: cfg.HP, maxHp: cfg.HP,
          atk: cfg.ATK, speed: cfg.SPEED,
          radius: cfg.RADIUS, state: p.armyState || 'GUARD',
          attackCooldownSec: 0
        });
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
      p.army.forEach(s => s.state = p.armyState);
    }
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

    sandboxState.monsters.forEach((m) => {
      let targetCore = (p && p.core && p.core.hp > 0) ? p.core : null;
      if (!targetCore) return;

      if (m.attackCooldownSec > 0) m.attackCooldownSec -= dt;

      let blocker = null;
      let minBlockerDist = 90;
      const mRadius = m.radius || 8;

      sandboxState.towers.forEach(t => {
        const d = Math.hypot(t.x - m.x, t.y - m.y);
        if (d < (mRadius + 14 + 5) && d < minBlockerDist) {
          minBlockerDist = d;
          blocker = { type: 'TOWER', id: t.id, ref: t, x: t.x, y: t.y };
        }
      });

      if (p && !p.isDead) {
        const d = Math.hypot(p.x - m.x, p.y - m.y);
        if (d < (mRadius + 12 + 5) && d < minBlockerDist) {
          minBlockerDist = d;
          blocker = { type: 'COMMANDER', id: p.id, ref: p, x: p.x, y: p.y };
        }
        p.army.forEach(s => {
          const sd = Math.hypot(s.x - m.x, s.y - m.y);
          if (sd < (mRadius + (s.radius || 5) + 5) && sd < minBlockerDist) {
            minBlockerDist = sd;
            blocker = { type: 'SOLDIER', id: s.id, ref: s, x: s.x, y: s.y };
          }
        });
      }

      const activeTarget = blocker || { type: 'CORE', id: targetCore.id, ref: targetCore, x: targetCore.x, y: targetCore.y };
      const distToTarget = Math.hypot(activeTarget.x - m.x, activeTarget.y - m.y);

      if (distToTarget > 22) {
        m.x += ((activeTarget.x - m.x) / distToTarget) * m.speed * dt;
        m.y += ((activeTarget.y - m.y) / distToTarget) * m.speed * dt;
      } else {
        if (m.attackCooldownSec <= 0) {
          applyDamage(activeTarget, m.atk, null);
          m.attackCooldownSec = CONFIG.MONSTER.COOLDOWN_SEC;
        }
      }
    });

    sandboxState.towers.forEach(t => {
      if (t.cooldownSec > 0) t.cooldownSec -= dt;

      const candidates = getAttackablesFor(t.ownerId).filter(c => Math.hypot(c.x - t.x, c.y - t.y) <= t.range);
      let target = (candidates.length > 0) ? candidates[0] : null;

      if (t.cooldownSec <= 0 && target) {
        applyDamage(target, t.atk, t.ownerId);
        t.cooldownSec = t.maxCooldownSec;
        sandboxState.lasers.push({ x1: t.x, y1: t.y, x2: target.x, y2: target.y, color: t.laserColor || '#00f0ff' });
      }
    });

    if (p && !p.isDead) {
      const attackables = getAttackablesFor(pid);

      p.army.forEach(s => {
        if (!s.attackCooldownSec) s.attackCooldownSec = 0;
        if (s.attackCooldownSec > 0) s.attackCooldownSec -= dt;

        let target = null;
        const inRange = attackables.filter(c => Math.hypot(c.x - s.x, c.y - s.y) <= 180);
        if (inRange.length > 0) target = inRange[0];

        if (target) {
          const dToTarget = Math.hypot(target.x - s.x, target.y - s.y);
          if (dToTarget > 20) {
            s.x += ((target.x - s.x) / dToTarget) * s.speed * dt;
            s.y += ((target.y - s.y) / dToTarget) * s.speed * dt;
          } else {
            if (s.attackCooldownSec <= 0) {
              applyDamage(target, s.atk * 1.6, pid);
              s.attackCooldownSec = 0.8;
            }
          }
        }
      });
    }

    const enemyAI = sandboxState.players['enemy_ai'];
    if (enemyAI && enemyAI.army) {
      const enemyAttackables = getAttackablesFor('enemy_ai');
      enemyAI.army.forEach(s => {
        if (!s.attackCooldownSec) s.attackCooldownSec = 0;
        if (s.attackCooldownSec > 0) s.attackCooldownSec -= dt;

        let target = (enemyAttackables.length > 0) ? enemyAttackables[0] : null;
        if (target) {
          const dToTarget = Math.hypot(target.x - s.x, target.y - s.y);
          if (dToTarget > 20) {
            s.x += ((target.x - s.x) / dToTarget) * s.speed * dt;
            s.y += ((target.y - s.y) / dToTarget) * s.speed * dt;
          } else {
            if (s.attackCooldownSec <= 0) {
              applyDamage(target, s.atk * 1.6, 'enemy_ai');
              s.attackCooldownSec = 0.8;
            }
          }
        }
      });
    }

    const allPushables = [...sandboxState.neutralSoldiers, ...sandboxState.monsters];
    if (p && !p.isDead) allPushables.push(...p.army);
    if (enemyAI && enemyAI.army) allPushables.push(...enemyAI.army);

    allPushables.forEach(s => {
      s.x = Math.max(bounds.minX + 10, Math.min(bounds.maxX - 10, s.x));
      s.y = Math.max(bounds.minY + 10, Math.min(bounds.maxX - 10, s.y));
    });

    for (let i = 0; i < allPushables.length; i++) {
      for (let j = i + 1; j < allPushables.length; j++) {
        const s1 = allPushables[i];
        const s2 = allPushables[j];
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

    sandboxState.monsters = sandboxState.monsters.filter(m => {
      if (m.hp <= 0) {
        if (p && !p.isDead) {
          p.gold += CONFIG.MONSTER.BOUNTY;
          sandboxState.events.push({ type: 'FLOAT_TEXT', x: m.x, y: m.y - 15, text: `+${CONFIG.MONSTER.BOUNTY}G`, color: '#ffb700' });
        }
        sandboxState.events.push({ type: 'EXPLOSION', x: m.x, y: m.y, color: '#a855f7' });
        return false;
      }
      return true;
    });

    if (p) p.army = p.army.filter(s => s.hp > 0);
    if (enemyAI) enemyAI.army = enemyAI.army.filter(s => s.hp > 0);
    sandboxState.towers = sandboxState.towers.filter(t => t.hp > 0);

    window.lastGameState = sandboxState;
    if (typeof updateHUD === 'function') updateHUD(sandboxState);
  }

  window.startSandboxMode = startSandboxMode;
  window.exitSandboxMode = exitSandboxMode;
  window.handleSandboxAction = handleSandboxAction;
  window.sandboxAddGold = sandboxAddGold;
  window.sandboxAddLevel = sandboxAddLevel;
  window.sandboxMaxLevel = sandboxMaxLevel;
  window.sandboxSpawnMonster = sandboxSpawnMonster;
  window.sandboxBuildEnemyTower = sandboxBuildEnemyTower;
  window.sandboxSpawnEnemySoldier = sandboxSpawnEnemySoldier;
  window.sandboxHealAllUnits = sandboxHealAllUnits;
  window.sandboxClearEnemies = sandboxClearEnemies;
  window.sandboxClearTowers = sandboxClearTowers;
  window.sandboxResetExp = sandboxResetExp;
  window.sandboxResetGold = sandboxResetGold;
})();