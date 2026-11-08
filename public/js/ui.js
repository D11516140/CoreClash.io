// 🖥️ public/js/ui.js - HUD 介面、全域玩家解析與聯盟系統全功能模組

window.activeMenu = window.activeMenu || null;
window.buildMode = window.buildMode || null;

// 💬 賽博風動態 Toast 提示
let toastTimer = null;
function showCyberToast(msg) {
  const toast = document.getElementById('cyber-toast');
  if (!toast) return;
  toast.innerText = msg;
  toast.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 2200);
}
window.showCyberToast = showCyberToast;

function getSocket() {
  return (typeof socket !== 'undefined' && socket) ? socket : window.socket;
}

// 🟢 玩家 ID 取得保險
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
window.getPlayerId = getPlayerId;

// 🟢 全域玩家解析器 (自動兼顧 PVP Socket ID 與沙盒離線 ID)
function getCurrentPlayer(state) {
  if (!state || !state.players) return null;
  if (window.isSandboxActive) {
    const pid = getPlayerId();
    return state.players[pid] || Object.values(state.players).find(p => p.id !== 'enemy_ai') || null;
  }
  const s = getSocket();
  if (s && s.id && state.players[s.id]) {
    return state.players[s.id];
  }
  const pid = getPlayerId();
  return state.players[pid] || Object.values(state.players).find(p => p.persistentId === pid || p.id === pid) || Object.values(state.players)[0] || null;
}
window.getCurrentPlayer = getCurrentPlayer;

// ⚔️ 進入 PVP 戰局邏輯
function joinBattleFromLobby() {
  const nickInput = document.getElementById('nickname-input');
  let name = nickInput ? nickInput.value.trim() : '';
  if (!name) name = `指揮官_${getPlayerId().substring(0, 4)}`;

  localStorage.setItem('corewar_player_name', name);
  
  const lobbyModal = document.getElementById('lobby-modal');
  if (lobbyModal) lobbyModal.style.display = 'none';

  const playerColor = localStorage.getItem('corewar_player_color') || '#ffb700';
  const s = getSocket();
  if (s && s.emit) {
    s.emit('joinGame', { persistentId: getPlayerId(), nickname: name, color: playerColor });
  }
}
window.joinBattleFromLobby = joinBattleFromLobby;

// 🎨 代表色選擇器
function selectPlayerColor(color, el) {
  localStorage.setItem('corewar_player_color', color);
  document.querySelectorAll('.color-dot').forEach(dot => dot.classList.remove('active'));
  if (el) el.classList.add('active');
  showCyberToast(`已切換指揮官代表色！`);
}
window.selectPlayerColor = selectPlayerColor;

window.addEventListener('DOMContentLoaded', () => {
  const savedColor = localStorage.getItem('corewar_player_color') || '#ffb700';
  document.querySelectorAll('.color-dot').forEach(dot => {
    if (dot.getAttribute('data-color') === savedColor) {
      dot.classList.add('active');
    } else {
      dot.classList.remove('active');
    }
  });

  const savedName = localStorage.getItem('corewar_player_name');
  if (savedName) {
    const nickInput = document.getElementById('nickname-input');
    if (nickInput) nickInput.value = savedName;
  }
});

function confirmLeaveGame() {
  showCustomConfirm(
    '🚪 離開遊戲確認',
    '確定要離開戰術指揮終端嗎？',
    () => {
      showCyberToast('正在關閉指揮連線...');
      setTimeout(() => {
        window.close();
        window.location.href = 'about:blank';
      }, 600);
    }
  );
}
window.confirmLeaveGame = confirmLeaveGame;

function showCustomConfirm(title, msg, onYes, showCancel = true) {
  const modal = document.getElementById('custom-confirm-modal');
  const titleEl = document.getElementById('confirm-title');
  const msgEl = document.getElementById('confirm-msg');
  const btnYes = document.getElementById('confirm-btn-yes');
  const btnNo = document.getElementById('confirm-btn-no');

  if (!modal || !titleEl || !msgEl || !btnYes || !btnNo) return;

  titleEl.innerText = title;
  msgEl.innerText = msg;
  btnNo.style.display = showCancel ? 'inline-block' : 'none';

  btnYes.onclick = () => {
    modal.style.display = 'none';
    if (onYes) onYes();
  };

  modal.style.display = 'flex';
}
window.showCustomConfirm = showCustomConfirm;

function closeCustomConfirm() {
  const modal = document.getElementById('custom-confirm-modal');
  if (modal) modal.style.display = 'none';
}
window.closeCustomConfirm = closeCustomConfirm;

let currentLeaderboardTab = 'PLAYER';

function switchLbTab(tab) {
  currentLeaderboardTab = tab;
  const btnPlayer = document.getElementById('lb-tab-player');
  const btnAlliance = document.getElementById('lb-tab-alliance');

  if (btnPlayer) btnPlayer.classList.toggle('active', tab === 'PLAYER');
  if (btnAlliance) btnAlliance.classList.toggle('active', tab === 'ALLIANCE');

  if (window.lastGameState) {
    updateHUD(window.lastGameState);
  }
}
window.switchLbTab = switchLbTab;

function createAllianceFromUI() {
  if (window.isSandboxActive) return;
  const input = document.getElementById('alliance-name-input');
  const name = input ? input.value.trim() : '';
  const s = getSocket();
  if (name && s) {
    s.emit('createAlliance', name);
    input.value = '';
  }
}
window.createAllianceFromUI = createAllianceFromUI;

function leaveAllianceFromUI() {
  if (window.isSandboxActive) return;
  const me = getCurrentPlayer(window.lastGameState);
  if (!me || !me.allianceId) return;

  const ally = window.lastGameState.alliances[me.allianceId];
  const s = getSocket();
  if (ally && ally.leaderId === me.id) {
    if (ally.memberIds.length > 1) {
      showCustomConfirm('⚠️ 身為盟主無法退出', '請先將盟主職位轉讓給隊友後再退出。', null, false);
      return;
    } else {
      showCustomConfirm('⚠️ 解散聯盟確認', '聯盟目前僅剩你一人，退出將直接解散聯盟，是否確定？', () => {
        if (s) s.emit('leaveAlliance');
      });
      return;
    }
  }

  showCustomConfirm('🛡️ 退出聯盟確認', '確定要退出當前聯盟嗎？', () => {
    if (s) s.emit('leaveAlliance');
  });
}
window.leaveAllianceFromUI = leaveAllianceFromUI;

function respondInviteFromUI(accept) {
  if (window.isSandboxActive) return;
  const me = getCurrentPlayer(window.lastGameState);
  const s = getSocket();
  if (!me || !s) return;

  if (me.pendingInvite) s.emit('respondAllianceInvite', accept);
  else if (me.pendingPoach) s.emit('respondPoachInvite', accept);
}
window.respondInviteFromUI = respondInviteFromUI;

function respondAllianceApp(accept) {
  if (window.isSandboxActive) return;
  const me = getCurrentPlayer(window.lastGameState);
  const s = getSocket();
  if (!me || !me.allianceId || !s) return;

  const ally = window.lastGameState.alliances[me.allianceId];
  if (ally && ally.pendingRequests && ally.pendingRequests.length > 0) {
    const oldestReq = ally.pendingRequests[0];
    s.emit('respondAllianceApplication', { applicantId: oldestReq.applicantId, accept: accept });
  }
}
window.respondAllianceApp = respondAllianceApp;

function inspectPlayer(targetId) {
  if (window.lastGameState && window.lastGameState.players[targetId]) {
    window.pinnedTooltip = { type: 'COMMANDER', id: targetId };
  }
}
window.inspectPlayer = inspectPlayer;

function openSettingsModal() {
  if (window.isSandboxActive) return;
  const me = getCurrentPlayer(window.lastGameState);
  if (!me || !me.allianceId || !window.lastGameState.alliances[me.allianceId]) return;

  const ally = window.lastGameState.alliances[me.allianceId];
  const currMode = ally.recruitmentMode || 'REVIEW';

  document.getElementById('opt-free')?.classList.toggle('active', currMode === 'FREE');
  document.getElementById('opt-review')?.classList.toggle('active', currMode === 'REVIEW');
  document.getElementById('opt-closed')?.classList.toggle('active', currMode === 'CLOSED');

  const modal = document.getElementById('settings-modal');
  if (modal) modal.style.display = 'flex';
}
window.openSettingsModal = openSettingsModal;

function closeSettingsModal() {
  const modal = document.getElementById('settings-modal');
  if (modal) modal.style.display = 'none';
}
window.closeSettingsModal = closeSettingsModal;

function setRecruitmentModeUI(mode) {
  const s = getSocket();
  if (s) s.emit('setRecruitmentMode', mode);
  closeSettingsModal();
}
window.setRecruitmentModeUI = setRecruitmentModeUI;

function transferLeadershipUI(targetId, targetName) {
  const s = getSocket();
  showCustomConfirm(
    '👑 轉讓盟主確認',
    `確定要將盟主大權無條件移交給【${targetName}】嗎？`,
    () => { if (s) s.emit('transferLeadership', targetId); }
  );
}
window.transferLeadershipUI = transferLeadershipUI;

function kickMemberUI(targetId, targetName) {
  const s = getSocket();
  showCustomConfirm(
    '🚫 踢除成員確認',
    `確定要將成員【${targetName}】踢出聯盟嗎？`,
    () => { if (s) s.emit('kickMember', targetId); }
  );
}
window.kickMemberUI = kickMemberUI;

function openMembersModal() {
  if (window.isSandboxActive) return;
  const me = getCurrentPlayer(window.lastGameState);
  if (!me || !me.allianceId || !window.lastGameState.alliances[me.allianceId]) return;

  const ally = window.lastGameState.alliances[me.allianceId];
  const isMeLeader = (ally.leaderId === me.id);

  const titleEl = document.getElementById('modal-alliance-title');
  const listEl = document.getElementById('modal-members-list');

  if (titleEl) titleEl.innerText = `🛡️ [${ally.name}] 成員列表 (${ally.memberIds.length} 人)`;

  if (listEl) {
    const members = ally.memberIds.map(id => window.lastGameState.players[id]).filter(Boolean);
    members.sort((a, b) => (b.score || 0) - (a.score || 0));

    listEl.innerHTML = members.map(m => {
      const isLeader = (m.id === ally.leaderId);
      const isMe = (m.id === me.id);

      let actionButtons = '';
      if (isMeLeader && !isMe) {
        actionButtons = `
          <div style="display: flex; gap: 6px;">
            <button class="icon-btn" title="轉讓盟主" onclick="transferLeadershipUI('${m.id}', '${m.name}')">👑</button>
            <button class="icon-btn btn-reject" title="踢出聯盟" onclick="kickMemberUI('${m.id}', '${m.name}')">🚫</button>
          </div>
        `;
      }

      const nameColor = !m.isOnline ? '#9ca3af' : (isMe ? 'var(--success)' : 'var(--primary)');
      const statusText = m.isOnline ? (m.isDead ? '💀 陣亡' : '🟢 在線') : '🔴 離線';

      return `
        <div class="member-row-item ${!m.isOnline ? 'offline' : ''}">
          <div>
            <span style="font-weight: bold; color: ${nameColor};">
              ${isLeader ? '👑 ' : '🛡️ '}${m.name || m.id.substring(0, 4)}
            </span>
            <span style="font-size: 11px; color: #9ca3af; margin-left: 6px;">${statusText}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 12px;">
            <span style="color: var(--primary); font-weight: bold;">${m.score || 0} Pts</span>
            ${actionButtons}
          </div>
        </div>
      `;
    }).join('');
  }

  const modal = document.getElementById('members-modal');
  if (modal) modal.style.display = 'flex';
}
window.openMembersModal = openMembersModal;

function closeMembersModal() {
  const modal = document.getElementById('members-modal');
  if (modal) modal.style.display = 'none';
}
window.closeMembersModal = closeMembersModal;

const uiElements = {
  btnBack: null, btnCore: null, btn1: null, btn2: null, btnF: null,
  lblE: null, lbl1: null, lbl2: null,
  lbList: null, onlineCount: null,
  uiGold: null, uiCoreHpText: null, uiCoreHpBar: null, uiArmyCount: null, uiMoveSpeed: null, uiArmyMode: null
};

function initUIElementsCache() {
  uiElements.btnBack = document.getElementById('btn-back');
  uiElements.btnCore = document.getElementById('btn-core');
  uiElements.btn1 = document.getElementById('btn-menu1');
  uiElements.btn2 = document.getElementById('btn-menu2');
  uiElements.btnF = document.getElementById('btn-f');
  uiElements.lblE = document.getElementById('label-e');
  uiElements.lbl1 = document.getElementById('label-1');
  uiElements.lbl2 = document.getElementById('label-2');
  uiElements.lbList = document.getElementById('leaderboard-list');
  uiElements.onlineCount = document.getElementById('ui-player-count');
  uiElements.uiGold = document.getElementById('ui-gold');
  uiElements.uiCoreHpText = document.getElementById('ui-core-hp-text');
  uiElements.uiCoreHpBar = document.getElementById('ui-core-hp-bar');
  uiElements.uiArmyCount = document.getElementById('ui-army-count');
  uiElements.uiMoveSpeed = document.getElementById('ui-move-speed');
  uiElements.uiArmyMode = document.getElementById('ui-army-mode');
}
window.addEventListener('DOMContentLoaded', initUIElementsCache);

let lastUIStateCache = '';
let lastLbHTMLCache = '';
let lastHudDataCache = '';

function updateUI() {
  const me = getCurrentPlayer(window.lastGameState);
  if (!me) return;
  if (!uiElements.btnCore) initUIElementsCache();

  const activeMenu = window.activeMenu;
  const buildMode = window.buildMode;

  const currentStateKey = `${me.isDead}_${!!me.core}_${activeMenu}_${buildMode}`;
  if (currentStateKey === lastUIStateCache) return;
  lastUIStateCache = currentStateKey;

  [uiElements.btnCore, uiElements.btn1, uiElements.btn2, uiElements.btnF, uiElements.btnBack].forEach(b => {
    if (b) {
      b.classList.remove('active', 'sub-active');
      if (document.activeElement === b) b.blur();
    }
  });

  if (me.isDead && me.core) {
    if (uiElements.btnBack) uiElements.btnBack.style.display = 'none';
    if (uiElements.btnCore) uiElements.btnCore.style.display = 'none';
    if (uiElements.btn1) uiElements.btn1.style.display = 'none';
    if (uiElements.btn2) uiElements.btn2.style.display = 'none';
    if (uiElements.btnF) uiElements.btnF.style.display = 'none';
    return;
  }

  if (!me.core) {
    if (uiElements.btnBack) uiElements.btnBack.style.display = 'none';
    if (uiElements.btnCore) uiElements.btnCore.style.display = 'flex';
    if (uiElements.btn1) uiElements.btn1.style.display = 'none';
    if (uiElements.btn2) uiElements.btn2.style.display = 'none';
    if (uiElements.btnF) uiElements.btnF.style.display = 'none';
    if (uiElements.lblE) uiElements.lblE.innerText = '建基地';
    if (uiElements.btnCore) uiElements.btnCore.classList.toggle('sub-active', buildMode === 'CORE');
    return;
  }

  if (activeMenu === 'TOWER_MENU' || buildMode === 'TOWER_BASIC' || buildMode === 'TOWER_ADVANCED') {
    if (uiElements.btnBack) uiElements.btnBack.style.display = 'flex';
    if (uiElements.btnCore) uiElements.btnCore.style.display = 'none';
    if (uiElements.btn1) uiElements.btn1.style.display = 'flex';
    if (uiElements.btn2) uiElements.btn2.style.display = 'flex';
    if (uiElements.btnF) uiElements.btnF.style.display = 'none';

    if (uiElements.lbl1) uiElements.lbl1.innerText = buildMode === 'TOWER_BASIC' ? '初階塔(100G) [預覽]' : '初階塔(100G)';
    if (uiElements.lbl2) uiElements.lbl2.innerText = buildMode === 'TOWER_ADVANCED' ? '中級重砲(200G) [預覽]' : '中級重砲(200G)';

    if (uiElements.btn1) uiElements.btn1.classList.toggle('sub-active', buildMode === 'TOWER_BASIC');
    if (uiElements.btn2) uiElements.btn2.classList.toggle('sub-active', buildMode === 'TOWER_ADVANCED');
    return;
  }

  if (activeMenu === 'ARMY_MENU') {
    if (uiElements.btnBack) uiElements.btnBack.style.display = 'flex';
    if (uiElements.btnCore) uiElements.btnCore.style.display = 'none';
    if (uiElements.btn1) uiElements.btn1.style.display = 'flex';
    if (uiElements.btn2) uiElements.btn2.style.display = 'flex';
    if (uiElements.btnF) uiElements.btnF.style.display = 'none';

    if (uiElements.lbl1) uiElements.lbl1.innerText = '初級兵(50G)';
    if (uiElements.lbl2) uiElements.lbl2.innerText = '中級裝甲(120G)';
    return;
  }

  if (uiElements.btnBack) uiElements.btnBack.style.display = 'none';
  if (uiElements.btnCore) uiElements.btnCore.style.display = 'flex';
  if (uiElements.btn1) uiElements.btn1.style.display = 'flex';
  if (uiElements.btn2) uiElements.btn2.style.display = 'flex';
  if (uiElements.btnF) uiElements.btnF.style.display = 'flex';

  if (uiElements.lblE) uiElements.lblE.innerText = '傳送回基地';
  if (uiElements.lbl1) uiElements.lbl1.innerText = '防禦塔選單';
  if (uiElements.lbl2) uiElements.lbl2.innerText = '軍隊徵召選單';
}
window.updateUI = updateUI;

function updateHUD(state) {
  if (!state) return;
  const me = getCurrentPlayer(state);
  if (!uiElements.uiGold) initUIElementsCache();

  if (uiElements.lbList) {
    let newLbHTML = '';

    if (currentLeaderboardTab === 'PLAYER') {
      const playersArr = Object.values(state.players || {}).filter(p => p.id !== 'enemy_ai');
      playersArr.sort((a, b) => (b.score || 0) - (a.score || 0));

      if (uiElements.onlineCount) {
        uiElements.onlineCount.innerText = window.isSandboxActive ? '🧪 沙盒模式' : `${playersArr.length} 在線`;
      }

      newLbHTML = playersArr.map((p, idx) => {
        const isMe = me && (p.id === me.id);
        const displayName = p.name || '無名指揮官';
        return `
          <div class="lb-row ${isMe ? 'me' : ''}">
            <span class="lb-name" onclick="inspectPlayer('${p.id}')">${idx + 1}. ${displayName}</span>
            <span style="font-weight: bold;">${p.score || 0} Pts</span>
          </div>
        `;
      }).join('');
    } else {
      if (window.isSandboxActive) {
        newLbHTML = `<div style="font-size: 11px; color: #9ca3af; text-align: center; padding: 12px 0;">🧪 沙盒單人模式下無聯盟功能</div>`;
      } else {
        const alliancesArr = Object.values(state.alliances || {});
        alliancesArr.sort((a, b) => (b.score || 0) - (a.score || 0));

        if (alliancesArr.length === 0) {
          newLbHTML = `<div style="font-size: 11px; color: #9ca3af; text-align: center; padding: 8px 0;">尚無聯盟</div>`;
        } else {
          newLbHTML = alliancesArr.map((ally, idx) => `
            <div class="lb-row">
              <span class="lb-name" style="color: ${ally.color || 'var(--primary)'};">🛡️ ${ally.name}</span>
              <span style="font-weight: bold;">${ally.score || 0} Pts</span>
            </div>
          `).join('');
        }
      }
    }

    if (newLbHTML !== lastLbHTMLCache) {
      lastLbHTMLCache = newLbHTML;
      uiElements.lbList.innerHTML = newLbHTML;
    }
  }

  if (me) {
    const totalWeight = (me.army || []).reduce((acc, s) => acc + (s.type === 'HEAVY' ? 2 : 1), 0);
    const coreHp = me.core ? Math.ceil(me.core.hp) : -1;
    const speedRatio = me.speedRatio !== undefined ? me.speedRatio : 1.0;

    const currentDataKey = `${me.gold}_${coreHp}_${totalWeight}_${speedRatio}_${me.armyState}_${me.isDead}`;

    if (currentDataKey !== lastHudDataCache) {
      lastHudDataCache = currentDataKey;

      if (uiElements.uiGold) uiElements.uiGold.innerText = me.gold || 0;

      if (me.core && me.core.hp > 0) {
        if (uiElements.uiCoreHpText) uiElements.uiCoreHpText.innerText = `${coreHp} / ${me.core.maxHp || 1000}`;
        if (uiElements.uiCoreHpBar) uiElements.uiCoreHpBar.style.width = `${(coreHp / (me.core.maxHp || 1000)) * 100}%`;
      } else {
        if (uiElements.uiCoreHpText) uiElements.uiCoreHpText.innerText = '未放置 (按E)';
        if (uiElements.uiCoreHpBar) uiElements.uiCoreHpBar.style.width = '0%';
      }

      if (uiElements.uiArmyCount) uiElements.uiArmyCount.innerText = `${totalWeight} / 70`;

      if (uiElements.uiMoveSpeed) {
        const pct = Math.round(speedRatio * 100);
        uiElements.uiMoveSpeed.innerText = `${pct}%`;
        if (pct > 80) uiElements.uiMoveSpeed.style.color = '#00ff66';
        else if (pct >= 51) uiElements.uiMoveSpeed.style.color = '#ffb700';
        else if (pct >= 21) uiElements.uiMoveSpeed.style.color = '#ff0055';
        else uiElements.uiMoveSpeed.style.color = '#800000';
      }

      if (uiElements.uiArmyMode) {
        if (me.armyState === 'FREE') { uiElements.uiArmyMode.innerText = '⚔️ 自由 (FREE)'; uiElements.uiArmyMode.style.color = '#ffb700'; }
        else if (me.armyState === 'HOLD') { uiElements.uiArmyMode.innerText = '📌 駐守 (HOLD)'; uiElements.uiArmyMode.style.color = '#00f0ff'; }
        else { uiElements.uiArmyMode.innerText = '🛡️ 護衛 (GUARD)'; uiElements.uiArmyMode.style.color = '#00ff66'; }
      }

      if (me.isDead && !me.core && !window.isSandboxActive) {
        document.getElementById('game-over-modal').style.display = 'flex';
      }
    }

    updateAllianceUI(state);
  }

  updateUI();
}
window.updateHUD = updateHUD;

function updateAllianceUI(state) {
  if (window.isSandboxActive) return;

  const me = getCurrentPlayer(state);
  if (!me) return;

  const createBox = document.getElementById('alliance-create-box');
  const infoBox = document.getElementById('alliance-info-box');
  const inviteBox = document.getElementById('alliance-invite-box');

  if (!me.allianceId || !state.alliances || !state.alliances[me.allianceId]) {
    if (createBox) createBox.style.display = 'block';
    if (infoBox) infoBox.style.display = 'none';
    if (inviteBox) inviteBox.style.display = me.pendingInvite ? 'flex' : 'none';
    return;
  }

  const ally = state.alliances[me.allianceId];
  if (createBox) createBox.style.display = 'none';
  if (inviteBox) inviteBox.style.display = 'none';
  if (infoBox) infoBox.style.display = 'flex';

  const dispName = document.getElementById('alliance-display-name');
  if (dispName) dispName.innerHTML = `🛡️ <span style="color:${ally.color || 'var(--primary)'}">${ally.name}</span>`;

  const settingBtn = document.getElementById('alliance-setting-btn');
  if (settingBtn) settingBtn.style.display = (ally.leaderId === me.id) ? 'inline-block' : 'none';

  const memberCount = document.getElementById('alliance-member-count');
  if (memberCount) memberCount.innerText = `成員 (${ally.memberIds.length}人)`;

  const topMembers = document.getElementById('alliance-top-members');
  if (topMembers) {
    const memberObjs = ally.memberIds
      .map(id => state.players[id])
      .filter(Boolean)
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, 3);

    topMembers.innerHTML = memberObjs.map(m => {
      const isLeader = (m.id === ally.leaderId);
      const isMe = (m.id === me.id);
      const nameColor = isMe ? 'var(--success)' : (isLeader ? 'var(--warning)' : '#fff');
      const roleIcon = isLeader ? '👑 ' : '🛡️ ';
      return `<div style="display: flex; justify-content: space-between; align-items: center; margin-top: 2px;">
        <span style="color:${nameColor}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 110px;">${roleIcon}${m.name || m.id.substring(0, 4)}</span>
        <span style="color: var(--primary); font-weight: bold; font-size: 10px;">${m.score || 0} Pts</span>
      </div>`;
    }).join('');
  }

  const reqContainer = document.getElementById('alliance-requests-container');
  if (ally.leaderId === me.id && ally.pendingRequests && ally.pendingRequests.length > 0) {
    if (reqContainer) reqContainer.style.display = 'flex';
    const reqTitle = document.getElementById('req-count-title');
    if (reqTitle) reqTitle.innerText = `📥 申請清單 (${ally.pendingRequests.length})`;
    
    const oldestReq = ally.pendingRequests[0];
    const reqApplicant = state.players[oldestReq.applicantId];
    const reqNameEl = document.getElementById('req-oldest-name');
    if (reqNameEl) reqNameEl.innerText = reqApplicant ? (reqApplicant.name || oldestReq.applicantId.substring(0, 4)) : '未知';
  } else {
    if (reqContainer) reqContainer.style.display = 'none';
  }
}