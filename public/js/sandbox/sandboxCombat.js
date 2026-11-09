// ⚔️ public/js/sandbox/sandboxCombat.js - 戰術 AI 與傷害算式

function getAttackablesFor(ownerId) {
  const list = [];
  sandboxState.monsters.forEach(m => list.push({ type: 'MONSTER', id: m.id, x: m.x, y: m.y, hp: m.hp, ref: m }));

  Object.values(sandboxState.players).forEach(p => {
    if (p.id !== ownerId && !p.isDead && p.isOnline && !p.isDummy) {
      list.push({ type: 'COMMANDER', id: p.id, x: p.x, y: p.y, hp: p.hp, ref: p });
    }
  });

  Object.values(sandboxState.players).forEach(p => {
    if (p.id !== ownerId && !p.isDead) {
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
  if (target.type === 'COMMANDER' || target.type === 'CORE') {
    const ownerId = target.type === 'COMMANDER' ? target.ref.id : target.ref.ownerId;
    const owner = sandboxState.players[ownerId];
    if (owner && owner.isInvincible) return;
  }

  target.ref.hp -= damage;
  target.ref.lastHitTick = sandboxState.tickCount;

  // 🎯 累加 5 大維度行為數據 (純採樣測試)
  const attackerP = sandboxState.players[attackerOwnerId];
  if (attackerP && attackerP.stats) {
    if (target.type === 'MONSTER') {
      attackerP.stats.pve += damage;
    } else if (target.type === 'TOWER' || target.type === 'CORE' || target.type === 'COMMANDER') {
      attackerP.stats.aggro += damage;
    }
  }

  const isMonster = target.type === 'MONSTER';
  const floatColor = isMonster ? '#a855f7' : '#ff0055';
  const roundedDmg = Math.ceil(damage);
  if (roundedDmg > 0) {
    sandboxState.events.push({
      type: 'FLOAT_TEXT', x: target.x, y: target.y - 12, text: `-${roundedDmg}`, color: floatColor
    });
  }

  if (target.type === 'COMMANDER' && target.ref.hp <= 0 && !target.ref.isDead) {
    target.ref.isDead = true;
    target.ref.respawnTimerSec = CONFIG.COMMANDER.RESPAWN_SEC;
    sandboxState.events.push({ type: 'EXPLOSION', x: target.x, y: target.y, color: '#ff0055', count: 20 });
  } else if (target.type === 'CORE' && target.ref.hp <= 0) {
    const owner = sandboxState.players[target.ref.ownerId];
    if (owner) {
      owner.isDead = true;
      owner.core = null;
      owner.army = [];

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

function runSandboxCombatLogic(dt) {
  const pid = getPlayerId();
  const p = sandboxState.players[pid];
  const bounds = sandboxState.mapBounds;

  // 1. 紫晶怪物 AI
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
        m.attackCooldownSec = 0.8;
      }
    }
  });

  // 2. 防禦塔 AI
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

  // 3. 部隊 AI (包含 GUARD / FREE / HOLD)
  Object.values(sandboxState.players).forEach(player => {
    if (player.isDead) return;

    player.army.sort((a, b) => (a.type === 'HEAVY' ? 0 : 1) - (b.type === 'HEAVY' ? 0 : 1));
    const attackables = getAttackablesFor(player.id);
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
      const ringAngleOffset = (sandboxState.globalTimer * 60 + sandboxState.tickCount) * dt * 0.6 * dir;

      ringUnits.forEach((s, slotIdx) => {
        if (!s.attackCooldownSec) s.attackCooldownSec = 0;
        if (s.attackCooldownSec > 0) s.attackCooldownSec -= dt;

        const angle = ringAngleOffset + (slotIdx * (Math.PI * 2 / countInThisRing));
        const orbitX = player.x + Math.cos(angle) * ringRadius;
        const orbitY = player.y + Math.sin(angle) * ringRadius;
        const distToOrbit = Math.hypot(orbitX - s.x, orbitY - s.y);

        if (s.returning) {
          if (distToOrbit < 15) {
            s.returning = false;
          }
        }

        if (distToOrbit > 250) {
          s.targetId = null;
          s.returning = true;
        }

        let target = null;
        if (!s.returning) {
          const inRange = attackables.filter(c => Math.hypot(c.x - s.x, c.y - s.y) <= 150);
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
            if (s.attackCooldownSec <= 0) {
              applyDamage(target, s.atk * 1.6, player.id);
              s.attackCooldownSec = 0.8;
            }
          }

          if (target.ref.hp <= 0) {
            s.targetId = null;
            if (distToOrbit > 15) {
              s.returning = true;
            }
          }
        } else {
          s.targetId = null;
          if (distToOrbit > 0.5) {
            const catchUpFactor = 1.1 + Math.min(0.25, (distToOrbit / 300) * 0.25);
            const maxSpeed = s.speed * catchUpFactor;
            const step = Math.min(distToOrbit, maxSpeed * dt);
            s.x += ((orbitX - s.x) / distToOrbit) * step;
            s.y += ((orbitY - s.y) / distToOrbit) * step;
          }
        }
      });
      ringRadius += 22;
    });

    player.army.filter(s => s.state === 'FREE').forEach(s => {
      if (!s.attackCooldownSec) s.attackCooldownSec = 0;
      if (s.attackCooldownSec > 0) s.attackCooldownSec -= dt;

      let closestTarget = null;
      let minDistance = Infinity;

      attackables.forEach(c => {
        const d = Math.hypot(c.x - s.x, c.y - s.y);
        if (d < minDistance) {
          minDistance = d;
          closestTarget = c;
        }
      });

      let activeTarget = null;
      if (s.targetId) {
        const currentTarget = attackables.find(c => c.id === s.targetId);
        if (currentTarget) {
          const currentDist = Math.hypot(currentTarget.x - s.x, currentTarget.y - s.y);
          if (closestTarget && closestTarget.id !== s.targetId && (currentDist - minDistance >= 40)) {
            activeTarget = closestTarget;
            s.targetId = closestTarget.id;
          } else {
            activeTarget = currentTarget;
            minDistance = currentDist;
          }
        } else {
          activeTarget = closestTarget;
          s.targetId = closestTarget ? closestTarget.id : null;
        }
      } else {
        activeTarget = closestTarget;
        s.targetId = closestTarget ? closestTarget.id : null;
      }

      if (activeTarget) {
        if (minDistance > 20) {
          s.x += ((activeTarget.x - s.x) / minDistance) * s.speed * dt;
          s.y += ((activeTarget.y - s.y) / minDistance) * s.speed * dt;
        } else {
          if (s.attackCooldownSec <= 0) {
            applyDamage(activeTarget, s.atk * 1.6, player.id);
            s.attackCooldownSec = 0.8;
          }
        }
      }
    });

    player.army.filter(s => s.state === 'HOLD').forEach(s => {
      if (!s.attackCooldownSec) s.attackCooldownSec = 0;
      if (s.attackCooldownSec > 0) s.attackCooldownSec -= dt;

      const anchorX = s.anchorX || s.x;
      const anchorY = s.anchorY || s.y;

      let target = null;
      let minDist = Infinity;
      attackables.forEach(c => {
        const dFromAnchor = Math.hypot(c.x - anchorX, c.y - anchorY);
        const dFromSoldier = Math.hypot(c.x - s.x, c.y - s.y);
        if (dFromAnchor <= 180 && dFromSoldier < minDist) {
          minDist = dFromSoldier;
          target = c;
        }
      });

      if (target) {
        s.targetId = target.id;
        if (player.stats) player.stats.tactics += 0.02;

        if (minDist > 20) {
          s.x += ((target.x - s.x) / minDist) * s.speed * dt;
          s.y += ((target.y - s.y) / minDist) * s.speed * dt;
        } else {
          if (s.attackCooldownSec <= 0) {
            applyDamage(target, s.atk * 1.6, player.id);
            s.attackCooldownSec = 0.8;
          }
        }
      } else {
        s.targetId = null;
        const dx = anchorX - s.x;
        const dy = anchorY - s.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0.5) {
          const moveSpeed = Math.min(dist * 6.0, s.speed);
          const step = Math.min(dist, moveSpeed * dt);
          s.x += (dx / dist) * step;
          s.y += (dy / dist) * step;
        }
      }
    });
  });

  // 4. 物理碰撞與清理
  const enemyAI = sandboxState.players['enemy_ai'];
  const allPushables = [...sandboxState.neutralSoldiers, ...sandboxState.monsters];
  if (p && !p.isDead) allPushables.push(...p.army);
  if (enemyAI && enemyAI.army) allPushables.push(...enemyAI.army);

  allPushables.forEach(s => {
    s.x = Math.max(bounds.minX + 10, Math.min(bounds.maxX - 10, s.x));
    s.y = Math.max(bounds.minY + 10, Math.min(bounds.maxY - 10, s.y));
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
}