// 🚀 game.js - 前端主控制器 (Socket 通訊、輸入監聽與流程調度)

const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let lastGameState = null;

let myPlayerId = localStorage.getItem('corewar_player_id');
if (!myPlayerId) {
  myPlayerId = 'player_' + Math.random().toString(36).substring(2, 9);
  localStorage.setItem('corewar_player_id', myPlayerId);
}

const savedNickname = localStorage.getItem('corewar_player_name');
if (savedNickname) {
  const nickInput = document.getElementById('nickname-input');
  if (nickInput) nickInput.value = savedNickname;
}

function joinBattleFromLobby() {
  const nickInput = document.getElementById('nickname-input');
  let name = nickInput ? nickInput.value.trim() : '';
  if (!name) name = `指揮官_${myPlayerId.substring(0, 4)}`;

  localStorage.setItem('corewar_player_name', name);
  document.getElementById('lobby-modal').style.display = 'none';

  socket.emit('joinGame', { persistentId: myPlayerId, nickname: name });
}

document.getElementById('nickname-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinBattleFromLobby();
});

const keys = { w: false, a: false, s: false, d: false };
const mousePos = { x: 0, y: 0 };
const mouseScreenPos = { x: 0, y: 0 };
let camera = { x: 800, y: 600 };

let activeMenu = null;
let buildMode = null;
let showDetailedInfo = false;

let pinnedTooltip = null;
let activeTooltipButtons = [];

function clearPinnedTooltip() {
  pinnedTooltip = null;
  activeTooltipButtons = [];
}

const particles = [];
const floatingTexts = [];

function triggerMenuKey(key) {
  clearPinnedTooltip();
  const me = lastGameState ? lastGameState.players[myPlayerId] : null;
  if (!me || me.isDead) return;

  if (!me.core) {
    if (key === 'E') buildMode = (buildMode === 'CORE') ? null : 'CORE';
    updateUI();
    return;
  }

  // 防禦塔選單內的 1/2 切換與 Toggle 取消
  if (activeMenu === 'TOWER_MENU' || buildMode === 'TOWER_BASIC' || buildMode === 'TOWER_ADVANCED') {
    if (key === '1') { buildMode = (buildMode === 'TOWER_BASIC') ? null : 'TOWER_BASIC'; activeMenu = null; }
    else if (key === '2') { buildMode = (buildMode === 'TOWER_ADVANCED') ? null : 'TOWER_ADVANCED'; activeMenu = null; }
    updateUI();
    return;
  }

  // 軍隊選單內的 1/2 購買
  if (activeMenu === 'ARMY_MENU') {
    if (key === '1') sendAction('buySoldier', 'BASIC');
    else if (key === '2') sendAction('buySoldier', 'HEAVY');
    updateUI();
    return;
  }

  // 主選單的 E / 1 / 2 / F
  if (key === 'E') { sendAction('teleportCore'); buildMode = null; }
  else if (key === '1') { activeMenu = 'TOWER_MENU'; buildMode = null; }
  else if (key === '2') { activeMenu = 'ARMY_MENU'; buildMode = null; }
  else if (key === 'F') { sendAction('toggleArmyState'); }
  updateUI();
}

function exitSubMenu() {
  activeMenu = null;
  buildMode = null;
  clearPinnedTooltip();
  updateUI();
}

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  mouseScreenPos.x = (e.clientX - rect.left) * (canvas.width / rect.width);
  mouseScreenPos.y = (e.clientY - rect.top) * (canvas.height / rect.height);
  const wPos = screenToWorld(mouseScreenPos.x, mouseScreenPos.y);
  mousePos.x = wPos.x; mousePos.y = wPos.y;
});

canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); exitSubMenu(); });

canvas.addEventListener('mousedown', (e) => {
  if (e.button === 0) {
    const rect = canvas.getBoundingClientRect();
    const clickX = (e.clientX - rect.left) * (canvas.width / rect.width);
    const clickY = (e.clientY - rect.top) * (canvas.height / rect.height);

    for (const btn of activeTooltipButtons) {
      if (clickX >= btn.x && clickX <= btn.x + btn.w && clickY >= btn.y && clickY <= btn.y + btn.h) {
        btn.onClick();
        clearPinnedTooltip();
        return;
      }
    }

    const me = lastGameState ? lastGameState.players[myPlayerId] : null;
    if (!me || me.isDead) return;

    if (buildMode === 'CORE' && !me.core) {
      sendAction('placeCore', mousePos); buildMode = null; clearPinnedTooltip(); updateUI(); return;
    } else if (buildMode === 'TOWER_BASIC' && me.core) {
      if (me.gold >= 100) sendAction('buyTower', { x: mousePos.x, y: mousePos.y, type: 'BASIC' }); return;
    } else if (buildMode === 'TOWER_ADVANCED' && me.core) {
      if (me.gold >= 200) sendAction('buyTower', { x: mousePos.x, y: mousePos.y, type: 'ADVANCED' }); return;
    }

    let clickedObj = findEntityAtPos(mousePos.x, mousePos.y);
    if (clickedObj) pinnedTooltip = { type: clickedObj.type, id: clickedObj.id };
    else clearPinnedTooltip();
  }
});

function findEntityById(id, type) {
  if (!lastGameState) return null;
  if (type === 'TOWER') {
    const t = lastGameState.towers.find(item => item.id === id);
    if (t) return { type, id, obj: t, x: t.x, y: t.y };
  }
  if (type === 'SOLDIER') {
    for (const p of Object.values(lastGameState.players)) {
      const s = p.army.find(item => item.id === id);
      if (s) return { type, id, obj: s, ownerId: p.id, x: s.x, y: s.y };
    }
    if (lastGameState.neutralSoldiers) {
      const ns = lastGameState.neutralSoldiers.find(item => item.id === id);
      if (ns) return { type, id, obj: ns, x: ns.x, y: ns.y };
    }
  }
  if (type === 'CORE') {
    for (const p of Object.values(lastGameState.players)) {
      if (p.core && p.core.id === id && p.core.hp > 0) return { type, id, obj: p.core, x: p.core.x, y: p.core.y };
    }
  }
  if (type === 'COMMANDER') {
    const p = lastGameState.players[id];
    if (p && !p.isDead) return { type, id, obj: p, x: p.x, y: p.y };
  }
  if (type === 'MONSTER') {
    const m = lastGameState.monsters.find(item => item.id === id);
    if (m) return { type, id, obj: m, x: m.x, y: m.y };
  }
  return null;
}

function findEntityAtPos(wx, wy) {
  if (!lastGameState) return null;
  for (const t of lastGameState.towers) {
    if (Math.abs(wx - t.x) <= 13 && Math.abs(wy - t.y) <= 13) return { type: 'TOWER', id: t.id, obj: t, x: t.x, y: t.y };
  }
  for (const p of Object.values(lastGameState.players)) {
    if (!p.isDead && Math.hypot(wx - p.x, wy - p.y) <= 12) return { type: 'COMMANDER', id: p.id, obj: p, x: p.x, y: p.y };
    for (const s of p.army) {
      if (Math.hypot(wx - s.x, wy - s.y) <= (s.radius || 5) + 3) return { type: 'SOLDIER', id: s.id, obj: s, ownerId: p.id, x: s.x, y: s.y };
    }
  }
  if (lastGameState.neutralSoldiers) {
    for (const ns of lastGameState.neutralSoldiers) {
      if (Math.hypot(wx - ns.x, wy - ns.y) <= (ns.radius || 5) + 3) return { type: 'SOLDIER', id: ns.id, obj: ns, x: ns.x, y: ns.y };
    }
  }
  for (const p of Object.values(lastGameState.players)) {
    if (p.core && p.core.hp > 0 && Math.abs(wx - p.core.x) <= 18 && Math.abs(wy - p.core.y) <= 18) {
      return { type: 'CORE', id: p.core.id, obj: p.core, x: p.core.x, y: p.core.y };
    }
  }
  if (lastGameState.monsters) {
    for (const m of lastGameState.monsters) {
      if (Math.hypot(wx - m.x, wy - m.y) <= 12) return { type: 'MONSTER', id: m.id, obj: m, x: m.x, y: m.y };
    }
  }
  return null;
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Tab') { e.preventDefault(); showDetailedInfo = !showDetailedInfo; return; }
  if (e.code === 'KeyW') keys.w = true;
  if (e.code === 'KeyA') keys.a = true;
  if (e.code === 'KeyS') keys.s = true;
  if (e.code === 'KeyD') keys.d = true;
  if (e.code === 'KeyE') triggerMenuKey('E');
  if (e.code === 'Digit1') triggerMenuKey('1');
  if (e.code === 'Digit2') triggerMenuKey('2');
  if (e.code === 'KeyF') triggerMenuKey('F');
  if (e.code === 'Backquote' || e.code === 'Escape') exitSubMenu();
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'KeyW') keys.w = false;
  if (e.code === 'KeyA') keys.a = false;
  if (e.code === 'KeyS') keys.s = false;
  if (e.code === 'KeyD') keys.d = false;
});

setInterval(() => { if (socket.connected) socket.emit('playerInput', keys); }, 1000 / 60);

function sendAction(action, data) { if (socket.connected) socket.emit(action, data); }

function restartGame() {
  document.getElementById('game-over-modal').style.display = 'none';
  exitSubMenu();
  socket.emit('restartGame');
}

// 🟢 回到大廳控制
function returnToLobby() {
  document.getElementById('game-over-modal').style.display = 'none';
  document.getElementById('lobby-modal').style.display = 'flex';
  exitSubMenu();
  socket.emit('returnToLobby');
}

socket.on('gameState', (state) => {
  lastGameState = state;
  const me = state.players[myPlayerId];

  if (me && !me.isDead) { camera.x = me.x; camera.y = me.y; }
  else if (me && me.core) { camera.x = me.core.x; camera.y = me.core.y; }

  const wPos = screenToWorld(mouseScreenPos.x, mouseScreenPos.y);
  mousePos.x = wPos.x; mousePos.y = wPos.y;

  if (state.events) {
    state.events.forEach(ev => {
      if (ev.type === 'EXPLOSION') createExplosion(ev.x, ev.y, ev.color, ev.count || 12);
      if (ev.type === 'FLOAT_TEXT') {
        if (!ev.forPlayerId || ev.forPlayerId === myPlayerId) {
          addFloatingText(ev.x, ev.y, ev.text, ev.color);
        }
      }
    });
  }

  drawGameScene(state);
  updateHUD(state);
});