const { CONFIG } = require('./config');
const { isSameAlliance } = require('./allianceManager');

function calculatePlayerScore(gameState, player) {
  if (!player || (player.isDead && (!player.core || player.core.hp <= 0))) {
    return { total: 0, armyScore: 0, towerScore: 0 };
  }

  let score = 0;
  if (player.core && player.core.hp > 0) {
    score += CONFIG.SCORE_WEIGHTS.CORE;
  }

  let towerScore = 0;
  gameState.towers.forEach(t => {
    if (t.ownerId === player.id) {
      const cfg = t.type === 'ADVANCED' ? CONFIG.TOWER.ADVANCED : CONFIG.TOWER.BASIC;
      towerScore += Math.floor(cfg.COST * CONFIG.SCORE_WEIGHTS.TOWER_MULTIPLIER);
    }
  });

  let armyScore = 0;
  (player.army || []).forEach(s => {
    const cfg = s.type === 'HEAVY' ? CONFIG.SOLDIER.HEAVY : CONFIG.SOLDIER.BASIC;
    armyScore += Math.floor(cfg.COST * CONFIG.SCORE_WEIGHTS.ARMY_MULTIPLIER);
  });

  score += towerScore + armyScore;
  score += Math.floor((player.gold || 0) * CONFIG.SCORE_WEIGHTS.GOLD_MULTIPLIER);
  score += Math.floor((player.survivalTime || 0) * CONFIG.SCORE_WEIGHTS.SURVIVAL_SEC_PTS);

  return { total: score, armyScore, towerScore };
}

function convertArmyToNeutral(gameState, player) {
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

function getSafePlayerSpawnPos(gameState) {
  const bounds = gameState.mapBounds;
  const activeCores = Object.values(gameState.players)
    .map(p => p.core)
    .filter(c => c && c.hp > 0);

  for (let attempt = 0; attempt < 50; attempt++) {
    const rx = bounds.minX + 200 + Math.random() * (bounds.width - 400);
    const ry = bounds.minY + 200 + Math.random() * (bounds.height - 400);

    let tooClose = false;
    for (const c of activeCores) {
      if (Math.hypot(c.x - rx, c.y - ry) < 700) {
        tooClose = true;
        break;
      }
    }

    if (!tooClose) return { x: rx, y: ry };
  }

  return {
    x: bounds.minX + 300 + Math.random() * (bounds.width - 600),
    y: bounds.minY + 300 + Math.random() * (bounds.height - 600)
  };
}

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

function getAttackableablesFor(gameState, ownerId) {
  const list = [];
  gameState.monsters.forEach(m => list.push({ type: 'MONSTER', id: m.id, x: m.x, y: m.y, hp: m.hp, ref: m }));

  Object.values(gameState.players).forEach(p => {
    if (p.id !== ownerId && !isSameAlliance(gameState, ownerId, p.id) && !p.isDead && p.isOnline) {
      list.push({ type: 'COMMANDER', id: p.id, x: p.x, y: p.y, hp: p.hp, ref: p });
    }
  });

  Object.values(gameState.players).forEach(p => {
    if (p.id !== ownerId && !isSameAlliance(gameState, ownerId, p.id) && !p.isDead) {
      p.army.forEach(s => list.push({ type: 'SOLDIER', id: s.id, x: s.x, y: s.y, hp: s.hp, ref: s }));
    }
  });

  gameState.towers.forEach(t => {
    if (t.ownerId !== ownerId && !isSameAlliance(gameState, ownerId, t.ownerId)) {
      list.push({ type: 'TOWER', id: t.id, x: t.x, y: t.y, hp: t.hp, ref: t });
    }
  });

  Object.values(gameState.players).forEach(p => {
    if (p.id !== ownerId && !isSameAlliance(gameState, ownerId, p.id) && p.core && p.core.hp > 0) {
      list.push({ type: 'CORE', id: p.core.id, x: p.core.x, y: p.core.y, hp: p.core.hp, ref: p.core });
    }
  });

  return list;
}

function applyDamage(gameState, target, damage, attackerOwnerId) {
  target.ref.hp -= damage;
  target.ref.lastHitTick = gameState.tickCount;
  target.ref.lastFullHpTick = null;

  const attackerP = gameState.players[attackerOwnerId];

  if (target.type === 'COMMANDER') {
    if (target.ref.hp <= 0) {
      target.ref.isDead = true;
      target.ref.respawnTimerSec = CONFIG.COMMANDER.RESPAWN_SEC;

      const targetScoreObj = calculatePlayerScore(gameState, target.ref);
      convertArmyToNeutral(gameState, target.ref);

      if (!target.ref.core || target.ref.core.hp <= 0) {
        target.ref.survivalTime = 0;
        target.ref.score = 0;
      }

      if (attackerP) {
        const pureBonusScore = Math.max(0, targetScoreObj.total - targetScoreObj.armyScore - targetScoreObj.towerScore);
        const dynamicBounty = Math.min(
          CONFIG.DYNAMIC_BOUNTIES.COMMANDER_MAX,
          Math.max(
            CONFIG.DYNAMIC_BOUNTIES.COMMANDER_BASE,
            Math.floor(CONFIG.DYNAMIC_BOUNTIES.COMMANDER_BASE + pureBonusScore * CONFIG.DYNAMIC_BOUNTIES.COMMANDER_RATIO)
          )
        );

        attackerP.gold += dynamicBounty;
        gameState.events.push({
          type: 'FLOAT_TEXT',
          x: target.x, y: target.y - 20,
          text: `擊殺指揮官 +${dynamicBounty}G`,
          color: '#ffb700',
          forPlayerId: attackerP.id
        });
      }
      gameState.events.push({ type: 'EXPLOSION', x: target.x, y: target.y, color: '#ff0055', count: 20 });
    }
  } else if (target.type === 'CORE') {
    if (target.ref.hp <= 0) {
      const owner = gameState.players[target.ref.ownerId];
      if (owner) {
        const ownerScoreObj = calculatePlayerScore(gameState, owner);

        owner.isDead = true;
        owner.core = null;
        owner.survivalTime = 0;
        owner.score = 0;
        convertArmyToNeutral(gameState, owner);

        if (attackerP) {
          const dynamicBounty = Math.min(
            CONFIG.DYNAMIC_BOUNTIES.CORE_MAX,
            Math.max(
              CONFIG.DYNAMIC_BOUNTIES.CORE_BASE,
              Math.floor(CONFIG.DYNAMIC_BOUNTIES.CORE_BASE + ownerScoreObj.total * CONFIG.DYNAMIC_BOUNTIES.CORE_RATIO)
            )
          );

          attackerP.gold += dynamicBounty;
          gameState.events.push({
            type: 'FLOAT_TEXT',
            x: target.x, y: target.y - 20,
            text: `爆破基地核心 +${dynamicBounty}G`,
            color: '#ffb700',
            forPlayerId: attackerP.id
          });
        }

        gameState.monsters.forEach(m => {
          if (m.targetPlayerId === owner.id) {
            gameState.events.push({ type: 'EXPLOSION', x: m.x, y: m.y, color: '#a855f7', count: 8 });
          }
        });
        gameState.monsters = gameState.monsters.filter(m => m.targetPlayerId !== owner.id);
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

function updateGameTick(gameState, counters, io) {
  gameState.tickCount++;
  const tickCount = gameState.tickCount;
  const dt = CONFIG.DT;

  if (tickCount % CONFIG.TICK_RATE === 0) gameState.globalTimer++;

  gameState.lasers = [];
  gameState.events = [];

  const bounds = gameState.mapBounds;
  const outOfCombatTicks = CONFIG.COMMANDER.OUT_OF_COMBAT_SEC * CONFIG.TICK_RATE;

  Object.values(gameState.players).forEach(p => {
    if (p.isOnline && !p.isDead) {
      p.x += p.dirX * CONFIG.COMMANDER.SPEED * dt;
      p.y += p.dirY * CONFIG.COMMANDER.SPEED * dt;
      p.x = Math.max(bounds.minX + 15, Math.min(bounds.maxX - 15, p.x));
      p.y = Math.max(bounds.minY + 15, Math.min(bounds.maxY - 15, p.y));

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

      // 🟢 僅在玩家在線時計算生存時間（離線時經驗時長凍結）
      if (p.core && p.core.hp > 0) {
        p.survivalTime += dt;
      }
    }

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

      if (p.isOnline && !p.isDead) {
        p.spawnTimerSec += dt;
        p.raidTimerSec += dt;

        if (p.spawnTimerSec >= CONFIG.CORE.SPAWN_INTERVAL_SEC) {
          p.spawnTimerSec = 0;
          const pos = getDonutSpawnPos(p.core, bounds, gameState);
          const diffMultiplier = 1 + Math.floor(p.survivalTime / 30) * 0.3;

          gameState.monsters.push({
            id: `mon_${counters.monsterIdCounter++}`,
            targetPlayerId: p.id,
            x: pos.x, y: pos.y,
            hp: Math.floor(CONFIG.MONSTER.BASE_HP * diffMultiplier),
            maxHp: Math.floor(CONFIG.MONSTER.BASE_HP * diffMultiplier),
            atk: Math.floor(CONFIG.MONSTER.BASE_ATK * diffMultiplier),
            speed: CONFIG.MONSTER.SPEED,
            isRaid: false
          });
        }

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
              id: `mon_${counters.monsterIdCounter++}`,
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
    }
  });

  // 🟢 20 秒檢查更新一次積分 (20 * 60 ticks)
  if (tickCount % (CONFIG.TICK_RATE * 20) === 0 || tickCount === 1) {
    Object.values(gameState.players).forEach(p => {
      p.score = calculatePlayerScore(gameState, p).total;
    });

    Object.values(gameState.alliances).forEach(ally => {
      let totalAllyScore = 0;
      ally.memberIds.forEach(memId => {
        const mem = gameState.players[memId];
        if (mem) {
          totalAllyScore += (mem.score || 0);
        }
      });
      ally.score = totalAllyScore;
    });
  }

  gameState.monsters.forEach((m) => {
    let targetCore = null;
    const assignedPlayer = gameState.players[m.targetPlayerId];

    if (assignedPlayer && assignedPlayer.core && assignedPlayer.core.hp > 0) {
      targetCore = assignedPlayer.core;
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
      applyDamage(gameState, activeTarget, m.atk * dt, null);
    }
  });

  gameState.towers.forEach(t => {
    if (t.cooldownSec > 0) t.cooldownSec -= dt;

    const candidates = getAttackableablesFor(gameState, t.ownerId).filter(c => Math.hypot(c.x - t.x, c.y - t.y) <= t.range);
    let target = null;
    if (candidates.length > 0) {
      if (t.targetId) target = candidates.find(c => c.id === t.targetId);
      if (!target) { target = candidates[0]; t.targetId = target.id; }
    } else {
      t.targetId = null;
    }

    if (t.cooldownSec <= 0 && target) {
      applyDamage(gameState, target, t.atk, t.ownerId);
      t.cooldownSec = t.maxCooldownSec;
      gameState.lasers.push({ x1: t.x, y1: t.y, x2: target.x, y2: target.y, color: t.laserColor || '#00f0ff' });
    }
  });

  Object.values(gameState.players).forEach(player => {
    if (player.isDead) return;

    player.army.sort((a, b) => (a.type === 'HEAVY' ? 0 : 1) - (b.type === 'HEAVY' ? 0 : 1));
    const attackables = getAttackableablesFor(gameState, player.id);
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
            applyDamage(gameState, target, s.atk * 2.0 * dt, player.id);
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
          applyDamage(gameState, target, s.atk * 2.0 * dt, player.id);
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
          applyDamage(gameState, target, s.atk * 2.0 * dt, player.id);
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
}

module.exports = {
  calculatePlayerScore,
  convertArmyToNeutral,
  getSafePlayerSpawnPos,
  getDonutSpawnPos,
  getAttackableablesFor,
  applyDamage,
  updateGameTick
};