// 🚀 public/game.js - 前端主控制器 (Socket 通訊、沙盒分流與鏡頭跟隨)

const socket = io();
window.socket = socket;

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

window.lastGameState = null;
window.activeMenu = null;
window.buildMode = null;
window.pinnedTooltip = null;
window.activeTooltipButtons = [];

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
window.myPlayerId = getPlayerId();

const savedNickname = localStorage.getItem('corewar_player_name');
if (savedNickname) {
  const nickInput = document.getElementById('nickname-input');
  if (nickInput) nickInput.value = savedNickname;
}

document.getElementById('nickname-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    if (typeof joinBattleFromLobby === 'function') joinBattleFromLobby();
  }
});

const keys = { w: false, a: false, s: false, d: false };
window.keys = keys;

const mousePos = { x: 0, y: 0 };
const mouseScreenPos = { x: 0, y: 0 };
let rawClientX = 0;
let rawClientY = 0;
let camera = { x: 800, y: 600 };
window.camera = camera;

let showDetailedInfo = false;

function screenToWorld(sx, sy) {
  return {
    x: sx - canvas.width / 2 + camera.x,
    y: sy - canvas.height / 2 + camera.y
  };
}
window.screenToWorld = screenToWorld;

function clearPinnedTooltip() {
  window.pinnedTooltip = null;
  window.activeTooltipButtons = [];
}
window.clearPinnedTooltip = clearPinnedTooltip;

let cachedCanvasRect = canvas.getBoundingClientRect();
window.addEventListener('resize', () => { cachedCanvasRect = canvas.getBoundingClientRect(); });
window.addEventListener('scroll', () => { cachedCanvasRect = canvas.getBoundingClientRect(); });

function sendAction(action, data) {
  if (window.isSandboxActive && typeof window.handleSandboxAction === 'function') {
    window.handleSandboxAction(action, data);
    return;
  }
  if (socket.connected) socket.emit(action, data);
}
window.sendAction = sendAction;

function triggerMenuKey(key) {
  clearPinnedTooltip();
  const me = typeof window.getCurrentPlayer === 'function' ? window.getCurrentPlayer(window.lastGameState) : null;
  if (!me || me.isDead) return;

  if (!me.core) {
    if (key === 'E') window.buildMode = (window.buildMode === 'CORE') ? null : 'CORE';
    if (typeof updateUI === 'function') updateUI();
    return;
  }

  if (window.activeMenu === 'TOWER_MENU' || window.buildMode === 'TOWER_BASIC' || window.buildMode === 'TOWER_ADVANCED') {
    if (key === '1') {
      window.buildMode = (window.buildMode === 'TOWER_BASIC') ? null : 'TOWER_BASIC';
      window.activeMenu = (window.buildMode === null) ? 'TOWER_MENU' : null;
    } else if (key === '2') {
      window.buildMode = (window.buildMode === 'TOWER_ADVANCED') ? null : 'TOWER_ADVANCED';
      window.activeMenu = (window.buildMode === null) ? 'TOWER_MENU' : null;
    }
    if (typeof updateUI === 'function') updateUI();
    return;
  }

  if (window.activeMenu === 'ARMY_MENU') {
    if (key === '1') sendAction('buySoldier', 'BASIC');
    else if (key === '2') sendAction('buySoldier', 'HEAVY');
    if (typeof updateUI === 'function') updateUI();
    return;
  }

  if (key === 'E') { sendAction('teleportCore'); window.buildMode = null; }
  else if (key === '1') { window.activeMenu = 'TOWER_MENU'; window.buildMode = null; }
  else if (key === '2') { window.activeMenu = 'ARMY_MENU'; window.buildMode = null; }
  else if (key === 'F') { sendAction('toggleArmyState'); }

  if (typeof updateUI === 'function') updateUI();
}
window.triggerMenuKey = triggerMenuKey;

function exitSubMenu() {
  if (window.buildMode === 'TOWER_BASIC' || window.buildMode === 'TOWER_ADVANCED' || window.buildMode === 'ENEMY_TOWER_BASIC' || window.buildMode === 'ENEMY_TOWER_ADVANCED') {
    window.buildMode = null;
    window.activeMenu = window.isSandboxActive ? null : 'TOWER_MENU';
  } else {
    window.activeMenu = null;
    window.buildMode = null;
  }
  clearPinnedTooltip();
  if (typeof updateUI === 'function') updateUI();
}
window.exitSubMenu = exitSubMenu;

canvas.addEventListener('mousemove', (e) => {
  rawClientX = e.clientX;
  rawClientY = e.clientY;
});

canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); exitSubMenu(); });

canvas.addEventListener('mousedown', (e) => {
  if (e.button === 0) {
    const clickX = mouseScreenPos.x;
    const clickY = mouseScreenPos.y;

    for (const btn of window.activeTooltipButtons) {
      if (clickX >= btn.x && clickX <= btn.x + btn.w && clickY >= btn.y && clickY <= btn.y + btn.h) {
        btn.onClick();
        clearPinnedTooltip();
        return;
      }
    }

    if (window.buildMode === 'ENEMY_TOWER_BASIC') {
      sendAction('placeEnemyTower', { x: mousePos.x, y: mousePos.y, type: 'BASIC' });
      return;
    } else if (window.buildMode === 'ENEMY_TOWER_ADVANCED') {
      sendAction('placeEnemyTower', { x: mousePos.x, y: mousePos.y, type: 'ADVANCED' });
      return;
    }

    const me = typeof window.getCurrentPlayer === 'function' ? window.getCurrentPlayer(window.lastGameState) : null;
    if (!me || me.isDead) return;

    if (window.buildMode === 'CORE' && !me.core) {
      sendAction('placeCore', mousePos);
      window.buildMode = null;
      clearPinnedTooltip();
      if (typeof updateUI === 'function') updateUI();
      return;
    } else if (window.buildMode === 'TOWER_BASIC' && me.core) {
      if (me.gold >= 100) {
        sendAction('buyTower', { x: mousePos.x, y: mousePos.y, type: 'BASIC' });
        if (typeof updateUI === 'function') updateUI();
      }
      return;
    } else if (window.buildMode === 'TOWER_ADVANCED' && me.core) {
      if (me.gold >= 200) {
        sendAction('buyTower', { x: mousePos.x, y: mousePos.y, type: 'ADVANCED' });
        if (typeof updateUI === 'function') updateUI();
      }
      return;
    }

    let clickedObj = findEntityAtPos(mousePos.x, mousePos.y);
    if (clickedObj) window.pinnedTooltip = { type: clickedObj.type, id: clickedObj.id };
    else clearPinnedTooltip();
  }
});

function findEntityAtPos(wx, wy) {
  if (!window.lastGameState) return null;

  for (const p of Object.values(window.lastGameState.players)) {
    for (const s of p.army) {
      if (Math.hypot(wx - s.x, wy - s.y) <= (s.radius || 5) + 4) {
        return { type: 'SOLDIER', id: s.id, obj: s, ownerId: p.id, x: s.x, y: s.y };
      }
    }
  }

  for (const p of Object.values(window.lastGameState.players)) {
    if (!p.isDead && Math.hypot(wx - p.x, wy - p.y) <= 14) {
      return { type: 'COMMANDER', id: p.id, obj: p, x: p.x, y: p.y };
    }
  }

  if (window.lastGameState.monsters) {
    for (const m of window.lastGameState.monsters) {
      const mRadius = m.isRaid ? 10 : 8;
      if (Math.hypot(wx - m.x, wy - m.y) <= mRadius + 3) {
        return { type: 'MONSTER', id: m.id, obj: m, x: m.x, y: m.y };
      }
    }
  }

  for (const t of window.lastGameState.towers) {
    if (Math.abs(wx - t.x) <= 14 && Math.abs(wy - t.y) <= 14) {
      return { type: 'TOWER', id: t.id, obj: t, x: t.x, y: t.y };
    }
  }

  for (const p of Object.values(window.lastGameState.players)) {
    if (p.core && p.core.hp > 0 && Math.abs(wx - p.core.x) <= 18 && Math.abs(wy - p.core.y) <= 18) {
      return { type: 'CORE', id: p.core.id, obj: p.core, x: p.core.x, y: p.core.y };
    }
  }

  return null;
}

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;

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

window.addEventListener('blur', () => {
  keys.w = false; keys.a = false; keys.s = false; keys.d = false;
});

setInterval(() => {
  if (socket.connected && !window.isSandboxActive) socket.emit('playerInput', keys);
}, 1000 / 60);

function restartGame() {
  document.getElementById('game-over-modal').style.display = 'none';
  exitSubMenu();
  if (!window.isSandboxActive) socket.emit('restartGame');
}
window.restartGame = restartGame;

function returnToLobby() {
  document.getElementById('game-over-modal').style.display = 'none';
  document.getElementById('lobby-modal').style.display = 'flex';
  exitSubMenu();
  if (window.isSandboxActive && typeof window.exitSandboxMode === 'function') {
    window.exitSandboxMode();
  } else {
    socket.emit('returnToLobby');
  }
}
window.returnToLobby = returnToLobby;

socket.on('gameState', (state) => {
  if (window.isSandboxActive) return;
  window.lastGameState = state;

  if (state.events) {
    state.events.forEach(ev => {
      if (ev.type === 'EXPLOSION') createExplosion(ev.x, ev.y, ev.color, ev.count || 12);
      if (ev.type === 'FLOAT_TEXT') {
        const me = typeof window.getCurrentPlayer === 'function' ? window.getCurrentPlayer(state) : null;
        if (!ev.forPlayerId || (me && ev.forPlayerId === me.id)) {
          addFloatingText(ev.x, ev.y, ev.text, ev.color);
        }
      }
    });
  }

  if (typeof updateHUD === 'function') updateHUD(state);
});

// 🟢 鏡頭自動跟隨與繪圖迴圈
function renderLoop() {
  if (window.lastGameState) {
    const state = window.lastGameState;
    const me = typeof window.getCurrentPlayer === 'function' ? window.getCurrentPlayer(state) : null;

    if (me && !me.isDead) {
      camera.x = me.x;
      camera.y = me.y;
    } else if (me && me.core) {
      camera.x = me.core.x;
      camera.y = me.core.y;
    }

    mouseScreenPos.x = (rawClientX - cachedCanvasRect.left) * (canvas.width / cachedCanvasRect.width);
    mouseScreenPos.y = (rawClientY - cachedCanvasRect.top) * (canvas.height / cachedCanvasRect.height);

    const wPos = screenToWorld(mouseScreenPos.x, mouseScreenPos.y);
    mousePos.x = wPos.x;
    mousePos.y = wPos.y;

    if (typeof drawGameScene === 'function') drawGameScene(state);
  }
  requestAnimationFrame(renderLoop);
}

requestAnimationFrame(renderLoop);