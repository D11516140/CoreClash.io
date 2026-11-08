// 🎨 public/js/render.js - 畫面渲染與繪圖核心模組

// 🟢 補上全域特效陣列宣告 (解決 particles is not defined 報錯)
let particles = [];
let floatingTexts = [];
window.particles = particles;
window.floatingTexts = floatingTexts;

const auraCanvas = document.createElement('canvas');
const auraCtx = auraCanvas.getContext('2d');

function worldToScreen(wx, wy) {
  return {
    x: wx - camera.x + canvas.width / 2,
    y: wy - camera.y + canvas.height / 2
  };
}

function screenToWorld(sx, sy) {
  return {
    x: sx - canvas.width / 2 + camera.x,
    y: sy - canvas.height / 2 + camera.y
  };
}

function getHpBarAlpha(entity, currentTick) {
  if (entity.hp < entity.maxHp) return 1.0;
  if (!entity.lastFullHpTick) return 0.0;
  const diff = currentTick - entity.lastFullHpTick;
  if (diff < 120) return 1.0;
  if (diff <= 180) return (180 - diff) / 60;
  return 0.0;
}

// 🟢 單位受擊紅光閃爍 (Hit Flash: 10 幀內 55% 透明度紅外發光)
function drawHitFlash(pos, radius, currentTick, lastHitTick) {
  if (!lastHitTick) return;
  const diff = currentTick - lastHitTick;
  if (diff >= 0 && diff <= 10) {
    const alpha = (10 - diff) / 10 * 0.55;
    ctx.save();
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#ff0055';
    ctx.fillStyle = `rgba(255, 0, 85, ${alpha})`;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius + 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function createExplosion(x, y, color = '#ff0055', count = 12) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 4 + 1;
    particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1.0, decay: Math.random() * 0.05 + 0.02, color, size: Math.random() * 4 + 2 });
  }
}
window.createExplosion = createExplosion;

function addFloatingText(x, y, text, color = '#ffffff') {
  floatingTexts.push({ x, y, text, color, life: 1.0, vy: -1.2 });
}
window.addFloatingText = addFloatingText;

function drawTooltipScreen(ctx, sx, sy, title, titleColor, basicItems, advancedItems, actions = []) {
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  const items = showDetailedInfo ? [...basicItems, ...advancedItems] : basicItems;
  const footerText = showDetailedInfo ? '[Tab] 顯示更少資訊' : '[Tab] 顯示更多資訊';

  ctx.font = 'bold 13px Segoe UI, sans-serif';
  let maxW = ctx.measureText(title).width;

  ctx.font = '12px Segoe UI, sans-serif';
  const footerW = ctx.measureText(footerText).width;
  if (footerW > maxW) maxW = footerW;

  items.forEach(item => {
    const fullText = `${item.label}：${item.val}`;
    const w = ctx.measureText(fullText).width;
    if (w > maxW) maxW = w;
  });

  actions.forEach(act => {
    ctx.font = 'bold 11px Segoe UI, sans-serif';
    const actW = ctx.measureText(act.label).width;
    if (actW > maxW) maxW = actW;
  });

  const pad = 12;
  const boxW = Math.max(160, Math.ceil(maxW + pad * 2 + 12));
  const lineH = 20;
  const headerH = 22;
  const footerH = 20;
  const btnH = 24;
  const btnGap = 6;
  const actionH = actions.length > 0 ? actions.length * (btnH + btnGap) + 4 : 0;

  const boxH = pad + headerH + (items.length * lineH) + footerH + actionH + pad;

  let tx = sx + 15;
  let ty = sy + 15;
  if (tx + boxW > canvas.width) tx = sx - boxW - 10;
  if (ty + boxH > canvas.height) ty = sy - boxH - 10;
  if (tx < 10) tx = 10;
  if (ty < 10) ty = 10;

  ctx.fillStyle = 'rgba(11, 15, 25, 0.95)';
  ctx.strokeStyle = pinnedTooltip ? 'rgba(0, 240, 255, 0.9)' : 'rgba(0, 240, 255, 0.5)';
  ctx.lineWidth = pinnedTooltip ? 2 : 1.5;
  ctx.shadowBlur = 12; ctx.shadowColor = 'rgba(0, 240, 255, 0.3)';

  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(tx, ty, boxW, boxH, 8);
  else ctx.rect(tx, ty, boxW, boxH);
  ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0;

  let currY = ty + pad + 12;
  ctx.font = 'bold 13px Segoe UI, sans-serif';
  ctx.fillStyle = titleColor || '#00f0ff';
  ctx.fillText(title, tx + pad, currY);

  currY += 8;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(tx + pad, currY); ctx.lineTo(tx + boxW - pad, currY); ctx.stroke();

  ctx.font = '12px Segoe UI, sans-serif';
  items.forEach(item => {
    currY += lineH;
    ctx.fillStyle = '#9ca3af';
    ctx.fillText(`${item.label}：`, tx + pad, currY);
    const labelW = ctx.measureText(`${item.label}：`).width;
    ctx.fillStyle = item.color || '#e2e8f0';
    ctx.fillText(`${item.val}`, tx + pad + labelW, currY);
  });

  currY += 8;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.beginPath(); ctx.moveTo(tx + pad, currY); ctx.lineTo(tx + boxW - pad, currY); ctx.stroke();

  currY += 14;
  ctx.font = 'italic 11px Segoe UI, sans-serif';
  ctx.fillStyle = '#6b7280';
  ctx.fillText(footerText, tx + pad, currY);

  if (actions.length > 0) {
    currY += 10;
    const btnW = boxW - pad * 2;
    actions.forEach((act, idx) => {
      const bx = tx + pad;
      const by = currY + idx * (btnH + btnGap);
      const isHover = (mouseScreenPos.x >= bx && mouseScreenPos.x <= bx + btnW && mouseScreenPos.y >= by && mouseScreenPos.y <= by + btnH);
      ctx.fillStyle = isHover ? act.hoverColor || 'rgba(0, 240, 255, 0.3)' : 'rgba(255, 255, 255, 0.08)';
      ctx.strokeStyle = act.borderColor || 'rgba(0, 240, 255, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(bx, by, btnW, btnH, 4);
      else ctx.rect(bx, by, btnW, btnH);
      ctx.fill(); ctx.stroke();

      ctx.font = 'bold 11px Segoe UI, sans-serif';
      ctx.fillStyle = act.textColor || '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(act.label, bx + btnW / 2, by + 16);
      ctx.textAlign = 'left';

      activeTooltipButtons.push({ x: bx, y: by, w: btnW, h: btnH, onClick: act.onClick });
    });
  }
  ctx.restore();
}

function drawGameScene(state) {
  activeTooltipButtons = [];

  const bounds = state.mapBounds || { minX: 0, maxX: 1600, minY: 0, maxY: 1200, width: 1600, height: 1200, buffer: 600 };
  const currentTick = state.tickCount || 0;
  
  // 🟢 全域玩家解析 (自動相容 PVP 與沙盒模式)
  const me = typeof getCurrentPlayer === 'function' ? getCurrentPlayer(state) : (state.players[window.myPlayerId] || Object.values(state.players)[0]);
  const myId = me ? me.id : (typeof getPlayerId === 'function' ? getPlayerId() : window.myPlayerId);

  if (auraCanvas.width !== canvas.width || auraCanvas.height !== canvas.height) {
    auraCanvas.width = canvas.width;
    auraCanvas.height = canvas.height;
  }

  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(0, 240, 255, 0.03)';
  ctx.lineWidth = 1;
  const buf = bounds.buffer;

  for (let x = Math.floor((bounds.minX - buf) / 40) * 40; x <= bounds.maxX + buf; x += 40) {
    const p1 = worldToScreen(x, bounds.minY - buf);
    const p2 = worldToScreen(x, bounds.maxY + buf);
    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
  }
  for (let y = Math.floor((bounds.minY - buf) / 40) * 40; y <= bounds.maxY + buf; y += 40) {
    const p1 = worldToScreen(bounds.minX - buf, y);
    const p2 = worldToScreen(bounds.maxX + buf, y);
    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(0, 240, 255, 0.08)';
  for (let x = Math.floor(bounds.minX / 40) * 40; x <= bounds.maxX; x += 40) {
    const p1 = worldToScreen(x, bounds.minY); const p2 = worldToScreen(x, bounds.maxY);
    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
  }
  for (let y = Math.floor(bounds.minY / 40) * 40; y <= bounds.maxY; y += 40) {
    const p1 = worldToScreen(bounds.minX, y); const p2 = worldToScreen(bounds.maxX, y);
    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
  }

  const wallTopLeft = worldToScreen(bounds.minX, bounds.minY);
  const wallBottomRight = worldToScreen(bounds.maxX, bounds.maxY);
  const wallW = wallBottomRight.x - wallTopLeft.x;
  const wallH = wallBottomRight.y - wallTopLeft.y;

  ctx.fillStyle = 'rgba(7, 9, 14, 0.55)';
  ctx.fillRect(0, 0, canvas.width, wallTopLeft.y);
  ctx.fillRect(0, wallBottomRight.y, canvas.width, canvas.height - wallBottomRight.y);
  ctx.fillRect(0, wallTopLeft.y, wallTopLeft.x, wallH);
  ctx.fillRect(wallBottomRight.x, wallTopLeft.y, canvas.width - wallBottomRight.x, wallH);

  ctx.shadowBlur = 15; ctx.shadowColor = '#00f0ff';
  ctx.strokeStyle = '#00f0ff'; ctx.lineWidth = 3;
  ctx.strokeRect(wallTopLeft.x, wallTopLeft.y, wallW, wallH);
  ctx.shadowBlur = 0;

  const drawClampedGroundAura = (units, colorRgb, maxCapOpacity = 0.25) => {
    if (units.length === 0) return;
    auraCtx.clearRect(0, 0, auraCanvas.width, auraCanvas.height);
    units.forEach(u => {
      const pos = worldToScreen(u.x, u.y);
      if (pos.x < -u.r || pos.x > canvas.width + u.r || pos.y < -u.r || pos.y > canvas.height + u.r) return;
      const grad = auraCtx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, u.r);
      grad.addColorStop(0, `rgba(${colorRgb}, 0.55)`);
      grad.addColorStop(0.5, `rgba(${colorRgb}, 0.20)`);
      grad.addColorStop(1, `rgba(${colorRgb}, 0)`);
      auraCtx.fillStyle = grad;
      auraCtx.beginPath();
      auraCtx.arc(pos.x, pos.y, u.r, 0, Math.PI * 2);
      auraCtx.fill();
    });
    ctx.save();
    ctx.globalAlpha = maxCapOpacity;
    ctx.drawImage(auraCanvas, 0, 0);
    ctx.restore();
  };

  const selfGroundUnits = [];
  const enemyGroundUnits = [];

  Object.values(state.players).forEach(p => {
    const isSelf = p.id === myId || (me && me.allianceId && p.allianceId === me.allianceId);
    if (p.core && p.core.hp > 0) {
      (isSelf ? selfGroundUnits : enemyGroundUnits).push({ x: p.core.x, y: p.core.y, r: 85 });
    }
    if (p.isOnline && !p.isDead) {
      (isSelf ? selfGroundUnits : enemyGroundUnits).push({ x: p.x, y: p.y, r: 50 });
    }
    p.army.forEach(s => {
      (isSelf ? selfGroundUnits : enemyGroundUnits).push({ x: s.x, y: s.y, r: 32 });
    });
  });

  state.towers.forEach(t => {
    const isSelf = t.ownerId === myId || (me && me.allianceId && state.players[t.ownerId] && state.players[t.ownerId].allianceId === me.allianceId);
    (isSelf ? selfGroundUnits : enemyGroundUnits).push({ x: t.x, y: t.y, r: 60 });
  });

  drawClampedGroundAura(selfGroundUnits, '0, 180, 85', 0.25);
  drawClampedGroundAura(enemyGroundUnits, '190, 25, 55', 0.25);

  state.towers.forEach(t => {
    const pos = worldToScreen(t.x, t.y);
    const isAdv = t.type === 'ADVANCED';
    const typeColor = isAdv ? '#c026d3' : '#2563eb';

    drawHitFlash(pos, 15, currentTick, t.lastHitTick);

    ctx.shadowBlur = 10; ctx.shadowColor = typeColor;
    ctx.fillStyle = typeColor;
    ctx.fillRect(pos.x - 13, pos.y - 13, 26, 26);
    ctx.shadowBlur = 0;

    const hpAlpha = getHpBarAlpha(t, currentTick);
    if (hpAlpha > 0) {
      ctx.globalAlpha = hpAlpha;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(pos.x - 15, pos.y - 22, 30, 4);
      ctx.fillStyle = '#00ff66';
      ctx.fillRect(pos.x - 15, pos.y - 22, (t.hp / t.maxHp) * 30, 4);
      ctx.globalAlpha = 1.0;
    }
  });

  state.lasers.forEach(l => {
    const p1 = worldToScreen(l.x1, l.y1);
    const p2 = worldToScreen(l.x2, l.y2);
    ctx.shadowBlur = 12; ctx.shadowColor = l.color || '#00f0ff';
    ctx.strokeStyle = l.color || '#00f0ff';
    ctx.lineWidth = l.color === '#ff0055' ? 4 : 2;
    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    ctx.shadowBlur = 0;
  });

  Object.values(state.players).forEach(p => {
    if (p.core && p.core.hp > 0) {
      const pos = worldToScreen(p.core.x, p.core.y);
      drawHitFlash(pos, 20, currentTick, p.core.lastHitTick);

      ctx.shadowBlur = 16; ctx.shadowColor = '#00f0ff';
      ctx.fillStyle = '#00f0ff';
      ctx.fillRect(pos.x - 18, pos.y - 18, 36, 36);
      ctx.shadowBlur = 0;

      const hpAlpha = getHpBarAlpha(p.core, currentTick);
      if (hpAlpha > 0) {
        ctx.globalAlpha = hpAlpha;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(pos.x - 20, pos.y - 28, 40, 5);
        ctx.fillStyle = '#00ff66';
        ctx.fillRect(pos.x - 20, pos.y - 28, (p.core.hp / p.core.maxHp) * 40, 5);
        ctx.globalAlpha = 1.0;
      }
    }
  });

  state.monsters.forEach(m => {
    const pos = worldToScreen(m.x, m.y);
    const mColor = m.isRaid ? '#ff0055' : '#a855f7';
    const mRadius = m.isRaid ? 10 : 8;

    drawHitFlash(pos, mRadius, currentTick, m.lastHitTick);

    ctx.shadowBlur = m.isRaid ? 14 : 10; ctx.shadowColor = mColor;
    ctx.fillStyle = mColor;
    ctx.beginPath(); ctx.arc(pos.x, pos.y, mRadius, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;

    const hpAlpha = getHpBarAlpha(m, currentTick);
    if (hpAlpha > 0) {
      ctx.globalAlpha = hpAlpha;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(pos.x - 12, pos.y - 18, 24, 3);
      ctx.fillStyle = mColor;
      ctx.fillRect(pos.x - 12, pos.y - 18, (m.hp / m.maxHp) * 24, 3);
      ctx.globalAlpha = 1.0;
    }
  });

  Object.values(state.players).forEach(p => {
    p.army.forEach(s => {
      const pos = worldToScreen(s.x, s.y);
      const isHeavy = s.type === 'HEAVY';
      const typeColor = isHeavy ? '#4f46e5' : '#38bdf8';
      const radius = s.radius || 5;

      drawHitFlash(pos, radius, currentTick, s.lastHitTick);

      ctx.shadowBlur = isHeavy ? 8 : 0; ctx.shadowColor = typeColor;
      ctx.fillStyle = typeColor;
      ctx.beginPath(); ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;

      const hpAlpha = getHpBarAlpha(s, currentTick);
      if (hpAlpha > 0) {
        ctx.globalAlpha = hpAlpha;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(pos.x - 10, pos.y - 14, 20, 3);
        ctx.fillStyle = '#00ff66';
        ctx.fillRect(pos.x - 10, pos.y - 14, Math.max(0, (s.hp / s.maxHp) * 20), 3);
        ctx.globalAlpha = 1.0;
      }
    });
  });

  if (state.neutralSoldiers) {
    state.neutralSoldiers.forEach(ns => {
      const pos = worldToScreen(ns.x, ns.y);
      ctx.shadowBlur = 8; ctx.shadowColor = '#9ca3af';
      ctx.fillStyle = '#9ca3af';
      ctx.beginPath(); ctx.arc(pos.x, pos.y, ns.radius || 5, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    });
  }

  Object.values(state.players).forEach(p => {
    if (p.isDead || !p.isOnline) return;
    const pos = worldToScreen(p.x, p.y);

    drawHitFlash(pos, 12, currentTick, p.lastHitTick);

    ctx.shadowBlur = 15; ctx.shadowColor = '#ffd700';
    ctx.fillStyle = '#ffd700';
    ctx.beginPath(); ctx.arc(pos.x, pos.y, 12, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;

    const isAlly = me && me.allianceId && p.allianceId === me.allianceId && p.id !== myId;
    ctx.font = 'bold 11px Segoe UI, sans-serif';
    ctx.fillStyle = (p.id === myId) ? '#00f0ff' : (isAlly ? '#3b82f6' : '#e2e8f0');
    ctx.textAlign = 'center';
    ctx.fillText(`${p.name || p.id.substring(0, 6)}${isAlly ? ' [隊友]' : ''}`, pos.x, pos.y - 20);
    ctx.textAlign = 'left';

    const hpAlpha = getHpBarAlpha(p, currentTick);
    if (hpAlpha > 0) {
      ctx.globalAlpha = hpAlpha;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(pos.x - 16, pos.y - 32, 32, 4);
      ctx.fillStyle = '#00ff66';
      ctx.fillRect(pos.x - 16, pos.y - 32, Math.max(0, (p.hp / p.maxHp) * 32), 4);
      ctx.globalAlpha = 1.0;
    }
  });

  if (me && !me.isDead) {
    const gridX = Math.floor(mousePos.x / 40) * 40 + 20;
    const gridY = Math.floor(mousePos.y / 40) * 40 + 20;
    const gridScreen = worldToScreen(gridX, gridY);

    if (buildMode === 'CORE' && !me.core) {
      ctx.strokeStyle = 'rgba(0, 255, 102, 0.3)';
      ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.arc(gridScreen.x, gridScreen.y, 350, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = 'rgba(0, 255, 102, 0.4)';
      ctx.strokeStyle = '#00ff66';
      ctx.lineWidth = 2;
      ctx.fillRect(gridScreen.x - 18, gridScreen.y - 18, 36, 36);
      ctx.strokeRect(gridScreen.x - 18, gridScreen.y - 18, 36, 36);

      ctx.font = 'bold 14px Segoe UI'; ctx.fillStyle = '#00ff66'; ctx.textAlign = 'center';
      ctx.fillText('點擊地圖左鍵放置基地 | 右鍵 / [~] 取消', mouseScreenPos.x, mouseScreenPos.y - 30);
    }

    const isPlacingTower = (buildMode === 'TOWER_BASIC' || buildMode === 'TOWER_ADVANCED');
    if (isPlacingTower && me.core) {
      const coreScreen = worldToScreen(me.core.x, me.core.y);
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.2)';
      ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.arc(coreScreen.x, coreScreen.y, 350, 0, Math.PI * 2); ctx.stroke();

      state.towers.forEach(t => {
        if (t.ownerId === myId) {
          const tScreen = worldToScreen(t.x, t.y);
          const circleColor = t.type === 'ADVANCED' ? 'rgba(192, 38, 211, 0.25)' : 'rgba(37, 99, 235, 0.25)';
          ctx.strokeStyle = circleColor;
          ctx.setLineDash([4, 4]);
          ctx.beginPath(); ctx.arc(tScreen.x, tScreen.y, t.range, 0, Math.PI * 2); ctx.stroke();
        }
      });
      ctx.setLineDash([]);

      const isAdv = buildMode === 'TOWER_ADVANCED';
      const cost = isAdv ? 200 : 100;
      const range = isAdv ? 260 : 160;

      const distToCore = Math.hypot(gridX - me.core.x, gridY - me.core.y);
      const isTooFar = distToCore > 350;
      const isOutBounds = gridX < bounds.minX + 20 || gridX > bounds.maxX - 20 || gridY < bounds.minY + 20 || gridY > bounds.maxY - 20;
      const isOccupied = state.towers.some(t => t.x === gridX && t.y === gridY) ||
                         Object.values(state.players).some(p => p.core && Math.hypot(p.core.x - gridX, p.core.y - gridY) < 30);
      const canAfford = me.gold >= cost;

      const isValid = !isTooFar && !isOutBounds && !isOccupied && canAfford;
      const previewFill = isValid ? 'rgba(0, 255, 102, 0.25)' : 'rgba(255, 0, 85, 0.25)';
      const strokeColor = isValid ? '#00ff66' : '#ff0055';

      ctx.strokeStyle = strokeColor;
      ctx.fillStyle = previewFill;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(gridScreen.x, gridScreen.y, range, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

      ctx.fillRect(gridScreen.x - 13, gridScreen.y - 13, 26, 26);
      ctx.strokeRect(gridScreen.x - 13, gridScreen.y - 13, 26, 26);

      ctx.font = 'bold 13px Segoe UI'; ctx.fillStyle = strokeColor; ctx.textAlign = 'center';
      const towerName = isAdv ? '中級重砲塔' : '初階塔';

      let promptMsg = `左鍵放置${towerName} | 右鍵 / [~] 取消`;
      if (!canAfford) promptMsg = `💰 金幣不足 (需 ${cost}G)`;
      else if (isOutBounds) promptMsg = '🚫 超出地圖邊界';
      else if (isTooFar) promptMsg = '📡 超出基地核心領地範圍 (350px)';
      else if (isOccupied) promptMsg = '⚠️ 該位置已被其他建築/核心佔據';

      ctx.fillText(promptMsg, mouseScreenPos.x, mouseScreenPos.y - 25);
    }
  }

  if (buildMode === null) {
    let activeEntity = pinnedTooltip ? findEntityById(pinnedTooltip.id, pinnedTooltip.type) : findEntityAtPos(mousePos.x, mousePos.y);

    if (activeEntity) {
      let tooltipData = null;
      const entityScreen = worldToScreen(activeEntity.x, activeEntity.y);

      if (activeEntity.type === 'COMMANDER') {
        const targetP = state.players[activeEntity.id];
        if (targetP) {
          const isSelf = targetP.id === myId;
          const meAlliance = me ? state.alliances[me.allianceId] : null;
          const meIsLeader = meAlliance && (meAlliance.leaderId === me.id);

          const targetAlliance = targetP.allianceId ? state.alliances[targetP.allianceId] : null;
          const targetIsLeader = targetAlliance && (targetAlliance.leaderId === targetP.id);

          const totalWeight = targetP.army ? targetP.army.reduce((acc, s) => acc + (s.type === 'HEAVY' ? 2 : 1), 0) : 0;
          const speedPct = Math.round((targetP.speedRatio !== undefined ? targetP.speedRatio : 1.0) * 100);

          const actions = [];
          if (!isSelf && !targetP.isDead && me) {
            if (!me.allianceId) {
              if (targetP.allianceId && targetAlliance) {
                const mode = targetAlliance.recruitmentMode || 'REVIEW';
                if (mode === 'FREE') {
                  actions.push({
                    label: `⚡ 自由加入 [${targetAlliance.name}]`,
                    hoverColor: 'rgba(0, 255, 102, 0.3)',
                    borderColor: 'rgba(0, 255, 102, 0.6)',
                    textColor: '#00ff66',
                    onClick: () => sendAction('applyToAlliance', targetP.allianceId)
                  });
                } else if (mode !== 'CLOSED') {
                  actions.push({
                    label: `📩 申請加入 [${targetAlliance.name}]`,
                    hoverColor: 'rgba(0, 240, 255, 0.3)',
                    borderColor: 'rgba(0, 240, 255, 0.6)',
                    textColor: '#00f0ff',
                    onClick: () => sendAction('applyToAlliance', targetP.allianceId)
                  });
                }
              }
            } else if (me.allianceId && meIsLeader && !targetP.allianceId) {
              actions.push({
                label: '👑 特邀加入聯盟 (直接入盟)',
                hoverColor: 'rgba(0, 255, 102, 0.3)',
                borderColor: 'rgba(0, 255, 102, 0.6)',
                textColor: '#00ff66',
                onClick: () => sendAction('inviteToAlliance', targetP.id)
              });
            } else if (me.allianceId && meIsLeader && targetP.allianceId !== me.allianceId && !targetIsLeader) {
              actions.push({
                label: '🎯 挖腳加入聯盟 (對方同意後跳槽)',
                hoverColor: 'rgba(236, 72, 153, 0.3)',
                borderColor: 'rgba(236, 72, 153, 0.6)',
                textColor: '#ec4899',
                onClick: () => sendAction('poachPlayer', targetP.id)
              });
            }
          }

          tooltipData = {
            title: `指揮官 ${targetP.name || targetP.id.substring(0, 6)} (${isSelf ? '己方' : '敵方'})`,
            titleColor: '#ffd700',
            basic: [
              { label: '生命值', val: `${Math.ceil(targetP.hp)} / ${targetP.maxHp}`, color: '#00ff66' },
              { label: '狀態', val: targetP.isDead ? '陣亡中' : '作戰中', color: '#ffb700' },
              { label: '所屬聯盟', val: targetAlliance ? targetAlliance.name : '無所屬', color: targetAlliance ? targetAlliance.color : '#9ca3af' }
            ],
            advanced: [
              { label: '軍隊負重', val: `${totalWeight} / 70 (${speedPct}% 移速)`, color: '#00f0ff' },
              { label: '戰術模式', val: `${targetP.armyState}`, color: '#ff0055' }
            ],
            actions: actions
          };
        }
      }
      else if (activeEntity.type === 'TOWER') {
        const t = state.towers.find(item => item.id === activeEntity.id);
        if (t) {
          const isAdv = t.type === 'ADVANCED';
          const isSelf = t.ownerId === myId;
          const isAlly = me && me.allianceId && state.players[t.ownerId] && state.players[t.ownerId].allianceId === me.allianceId;

          const maxRefund = isAdv ? 140 : 70;
          const maxHp = t.maxHp || 500;
          const hpRatio = Math.max(0, Math.min(1.0, t.hp / maxHp));
          const refundG = Math.floor(maxRefund * hpRatio);
          const hpPct = Math.round(hpRatio * 100);

          const actions = [];
          if ((isSelf || isAlly) && t.hp < t.maxHp) {
            const missingRatio = (t.maxHp - t.hp) / t.maxHp;
            const maxCost = isAdv ? 80 : 40;
            const repairCost = Math.max(10, Math.ceil(maxCost * missingRatio));
            actions.push({
              label: `🔧 ${isSelf ? '修補防禦塔' : '協助修復隊友塔'} (+${Math.ceil(t.maxHp - t.hp)} HP, ${repairCost}G)`,
              hoverColor: 'rgba(0, 255, 102, 0.3)',
              borderColor: 'rgba(0, 255, 102, 0.6)',
              textColor: '#00ff66',
              onClick: () => sendAction('repairTower', t.id)
            });
          }

          if (isSelf) {
            actions.push({
              label: `💰 賣出 (+${refundG}G, 殘值${hpPct}%)`,
              hoverColor: 'rgba(255, 0, 85, 0.3)',
              borderColor: 'rgba(255, 0, 85, 0.6)',
              textColor: '#ff4d4d',
              onClick: () => sendAction('sellTower', t.id)
            });
          }

          tooltipData = {
            title: `${isAdv ? '中級重砲塔' : '初階防禦塔'} (${isSelf ? '己方' : (isAlly ? '隊友' : '敵方')})`,
            titleColor: isAdv ? '#c026d3' : '#2563eb',
            basic: [
              { label: '耐久度', val: `${Math.ceil(t.hp)} / ${t.maxHp}`, color: '#ffb700' },
              { label: '擁有者', val: state.players[t.ownerId] ? state.players[t.ownerId].name : '未知', color: '#9ca3af' }
            ],
            advanced: [
              { label: '攻擊力', val: `${t.atk}`, color: '#ff0055' },
              { label: '射程', val: `${t.range} px`, color: '#00f0ff' }
            ],
            actions: actions
          };
        }
      }
      else if (activeEntity.type === 'SOLDIER') {
        let foundSoldier = null;
        let ownerP = null;
        for (const p of Object.values(state.players)) {
          const s = p.army.find(item => item.id === activeEntity.id);
          if (s) { foundSoldier = s; ownerP = p; break; }
        }
        if (!foundSoldier && state.neutralSoldiers) {
          foundSoldier = state.neutralSoldiers.find(item => item.id === activeEntity.id);
        }

        if (foundSoldier) {
          const isHeavy = foundSoldier.type === 'HEAVY';
          const isSelf = ownerP && ownerP.id === myId;
          const isNeutral = !ownerP;

          const maxRefund = isHeavy ? 84 : 35;
          const maxHp = foundSoldier.maxHp || (isHeavy ? 280 : 100);
          const hpRatio = Math.max(0, Math.min(1.0, foundSoldier.hp / maxHp));
          const refundG = Math.floor(maxRefund * hpRatio);
          const hpPct = Math.round(hpRatio * 100);

          const actions = [];
          if (isSelf) {
            if (foundSoldier.hp < foundSoldier.maxHp) {
              const missingRatio = (foundSoldier.maxHp - foundSoldier.hp) / foundSoldier.maxHp;
              const maxCost = isHeavy ? 40 : 15;
              const healCost = Math.max(5, Math.ceil(maxCost * missingRatio));
              actions.push({
                label: `🩹 包紮治療 (+${Math.ceil(foundSoldier.maxHp - foundSoldier.hp)} HP, ${healCost}G)`,
                hoverColor: 'rgba(0, 255, 102, 0.3)',
                borderColor: 'rgba(0, 255, 102, 0.6)',
                textColor: '#00ff66',
                onClick: () => sendAction('healSoldier', foundSoldier.id)
              });
            }
            actions.push({
              label: `💰 賣出 (+${refundG}G, 殘值${hpPct}%)`,
              hoverColor: 'rgba(255, 0, 85, 0.3)',
              borderColor: 'rgba(255, 0, 85, 0.6)',
              textColor: '#ff4d4d',
              onClick: () => sendAction('sellSoldier', foundSoldier.id)
            });
            actions.push({
              label: '🕊️ 野放 (變為可招募)',
              hoverColor: 'rgba(255, 183, 0, 0.3)',
              borderColor: 'rgba(255, 183, 0, 0.6)',
              textColor: '#ffb700',
              onClick: () => sendAction('abandonSoldier', foundSoldier.id)
            });
          }

          tooltipData = {
            title: isNeutral ? '灰色中立單位 (靠近招募)' : `${isHeavy ? '中級裝甲兵' : '初級步兵'} (${isSelf ? '己方' : '敵方'})`,
            titleColor: isNeutral ? '#9ca3af' : (isHeavy ? '#4f46e5' : '#38bdf8'),
            basic: [
              { label: '單位血量', val: `${Math.ceil(foundSoldier.hp)} / ${foundSoldier.maxHp}`, color: '#ffb700' },
              { label: '單位負重', val: `${isHeavy ? 2 : 1} 點`, color: '#00f0ff' }
            ],
            advanced: [
              { label: '攻擊力', val: `${foundSoldier.atk}`, color: '#ff0055' },
              { label: '戰術模式', val: `${foundSoldier.state || 'GUARD'}`, color: '#00ff66' },
              { label: '移動速度', val: `${foundSoldier.speed} px/秒`, color: '#00f0ff' }
            ],
            actions: actions
          };
        }
      }
      else if (activeEntity.type === 'CORE') {
        const p = Object.values(state.players).find(item => item.core && item.core.id === activeEntity.id);
        if (p && p.core) {
          const isSelf = p.id === myId;
          tooltipData = {
            title: `基地核心 (${isSelf ? '己方' : '敵方'})`,
            titleColor: '#00f0ff',
            basic: [
              { label: '耐久度', val: `${Math.ceil(p.core.hp)} / ${p.core.maxHp}`, color: '#ffb700' },
              { label: '擁有者', val: p.name || p.id.substring(0, 6), color: '#9ca3af' }
            ],
            advanced: [
              { label: '領地範圍', val: '350 px', color: '#00f0ff' },
              { label: '自然修復', val: '5秒未受傷 +15 HP/秒', color: '#00ff66' }
            ],
            actions: []
          };
        }
      }
      else if (activeEntity.type === 'MONSTER') {
        const m = state.monsters.find(item => item.id === activeEntity.id);
        if (m) {
          tooltipData = {
            title: m.isRaid ? '🚨 紫晶突襲精英怪' : '紫晶入侵者 (敵方野怪)',
            titleColor: m.isRaid ? '#ff0055' : '#a855f7',
            basic: [
              { label: '血量', val: `${Math.ceil(m.hp)} / ${m.maxHp}`, color: '#ffb700' }
            ],
            advanced: [
              { label: '攻擊力', val: `${m.atk}`, color: '#ff0055' },
              { label: '移動速度', val: `${m.speed} px/秒`, color: '#00f0ff' },
              { label: '擊殺獎勵', val: '+25 金幣', color: '#ffb700' }
            ],
            actions: []
          };
        }
      }

      if (tooltipData) drawTooltipScreen(ctx, entityScreen.x, entityScreen.y, tooltipData.title, tooltipData.titleColor, tooltipData.basic, tooltipData.advanced, tooltipData.actions);
    }
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const pt = particles[i];
    pt.x += pt.vx; pt.y += pt.vy; pt.life -= pt.decay;
    if (pt.life <= 0) { particles.splice(i, 1); continue; }
    const pos = worldToScreen(pt.x, pt.y);
    ctx.fillStyle = pt.color; ctx.globalAlpha = pt.life;
    ctx.beginPath(); ctx.arc(pos.x, pos.y, pt.size, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1.0;
  }

  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const ft = floatingTexts[i];
    ft.y += ft.vy; ft.life -= 0.02;
    if (ft.life <= 0) { floatingTexts.splice(i, 1); continue; }
    const pos = worldToScreen(ft.x, ft.y);
    ctx.font = 'bold 14px Segoe UI'; ctx.fillStyle = ft.color; ctx.globalAlpha = ft.life;
    ctx.fillText(ft.text, pos.x, pos.y);
    ctx.globalAlpha = 1.0;
  }

  ctx.restore();

  if (me && me.isDead && me.core) {
    ctx.font = 'bold 24px Segoe UI'; ctx.fillStyle = '#ff0055'; ctx.textAlign = 'center';
    ctx.fillText(`💀 指揮官陣亡！倒地復活倒數: ${Math.ceil(me.respawnTimerSec)} 秒`, canvas.width / 2, canvas.height / 2 - 50);
    ctx.font = 'bold 15px Segoe UI'; ctx.fillStyle = '#ffb700';
    ctx.fillText('麾下部隊已全部野放轉為中立！', canvas.width / 2, canvas.height / 2 - 20);
  }
}