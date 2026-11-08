// 💬 賽博風格自訂確認框 Modal
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

function closeCustomConfirm() {
  const modal = document.getElementById('custom-confirm-modal');
  if (modal) modal.style.display = 'none';
}

let currentLeaderboardTab = 'PLAYER';

function switchLbTab(tab) {
  currentLeaderboardTab = tab;
  const btnPlayer = document.getElementById('lb-tab-player');
  const btnAlliance = document.getElementById('lb-tab-alliance');

  if (btnPlayer) btnPlayer.classList.toggle('active', tab === 'PLAYER');
  if (btnAlliance) btnAlliance.classList.toggle('active', tab === 'ALLIANCE');

  if (typeof lastGameState !== 'undefined' && lastGameState) {
    updateHUD(lastGameState);
  }
}

function createAllianceFromUI() {
  const input = document.getElementById('alliance-name-input');
  const name = input ? input.value : '';
  if (name.trim()) {
    socket.emit('createAlliance', name.trim());
    input.value = '';
  }
}

function leaveAllianceFromUI() {
  const me = lastGameState ? lastGameState.players[myPlayerId] : null;
  if (!me || !me.allianceId) return;

  const ally = lastGameState.alliances[me.allianceId];
  if (ally && ally.leaderId === me.id) {
    if (ally.memberIds.length > 1) {
      showCustomConfirm(
        '⚠️ 身為盟主無法退出',
        '聯盟尚有其他成員！請先點擊「👥 查看全體成員」將盟主職位轉讓給隊友後再退出。',
        null,
        false
      );
      return;
    } else {
      showCustomConfirm(
        '⚠️ 解散聯盟確認',
        '聯盟目前僅剩你一人，退出將直接【解散聯盟】，是否確定？',
        () => { socket.emit('leaveAlliance'); }
      );
      return;
    }
  }

  showCustomConfirm(
    '🛡️ 退出聯盟確認',
    '確定要退出當前聯盟嗎？',
    () => { socket.emit('leaveAlliance'); }
  );
}

function respondInviteFromUI(accept) {
  const me = lastGameState ? lastGameState.players[myPlayerId] : null;
  if (!me) return;

  if (me.pendingInvite) {
    socket.emit('respondAllianceInvite', accept);
  } else if (me.pendingPoach) {
    socket.emit('respondPoachInvite', accept);
  }
}

function respondAllianceApp(accept) {
  const me = lastGameState ? lastGameState.players[myPlayerId] : null;
  if (!me || !me.allianceId) return;

  const ally = lastGameState.alliances[me.allianceId];
  if (ally && ally.pendingRequests && ally.pendingRequests.length > 0) {
    const oldestReq = ally.pendingRequests[0];
    socket.emit('respondAllianceApplication', {
      applicantId: oldestReq.applicantId,
      accept: accept
    });
  }
}

function inspectPlayer(targetId) {
  if (lastGameState && lastGameState.players[targetId]) {
    pinnedTooltip = { type: 'COMMANDER', id: targetId };
  }
}

function openSettingsModal() {
  const me = lastGameState ? lastGameState.players[myPlayerId] : null;
  if (!me || !me.allianceId || !lastGameState.alliances[me.allianceId]) return;

  const ally = lastGameState.alliances[me.allianceId];
  const currMode = ally.recruitmentMode || 'REVIEW';

  document.getElementById('opt-free')?.classList.toggle('active', currMode === 'FREE');
  document.getElementById('opt-review')?.classList.toggle('active', currMode === 'REVIEW');
  document.getElementById('opt-closed')?.classList.toggle('active', currMode === 'CLOSED');

  const modal = document.getElementById('settings-modal');
  if (modal) modal.style.display = 'flex';
}

function closeSettingsModal() {
  const modal = document.getElementById('settings-modal');
  if (modal) modal.style.display = 'none';
}

function setRecruitmentModeUI(mode) {
  socket.emit('setRecruitmentMode', mode);
  closeSettingsModal();
}

function transferLeadershipUI(targetId, targetName) {
  showCustomConfirm(
    '👑 轉讓盟主確認',
    `確定要將盟主大權無條件移交給【${targetName}】嗎？`,
    () => { socket.emit('transferLeadership', targetId); }
  );
}

function kickMemberUI(targetId, targetName) {
  showCustomConfirm(
    '🚫 踢除成員確認',
    `確定要將成員【${targetName}】踢出聯盟嗎？`,
    () => { socket.emit('kickMember', targetId); }
  );
}

function openMembersModal() {
  const me = lastGameState ? lastGameState.players[myPlayerId] : null;
  if (!me || !me.allianceId || !lastGameState.alliances[me.allianceId]) return;

  const ally = lastGameState.alliances[me.allianceId];
  const isMeLeader = (ally.leaderId === me.id);

  const titleEl = document.getElementById('modal-alliance-title');
  const listEl = document.getElementById('modal-members-list');

  if (titleEl) titleEl.innerText = `🛡️ [${ally.name}] 成員列表 (${ally.memberIds.length} 人)`;

  if (listEl) {
    const members = ally.memberIds.map(id => lastGameState.players[id]).filter(Boolean);
    members.sort((a, b) => (b.score || 0) - (a.score || 0));

    listEl.innerHTML = members.map(m => {
      const isLeader = (m.id === ally.leaderId);
      const isMe = (m.id === myPlayerId);

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
            <span style="font-size: 11px; color: #9ca3af; margin-left: 6px;">
              ${statusText}
            </span>
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

function closeMembersModal() {
  const modal = document.getElementById('members-modal');
  if (modal) modal.style.display = 'none';
}

// 🟢 DOM 節點快取存取器
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
  const me = lastGameState ? lastGameState.players[myPlayerId] : null;
  if (!me) return;
  if (!uiElements.btnCore) initUIElementsCache();

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
    uiElements.btnCore.classList.toggle('sub-active', buildMode === 'CORE');
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

    uiElements.btn1.classList.toggle('sub-active', buildMode === 'TOWER_BASIC');
    uiElements.btn2.classList.toggle('sub-active', buildMode === 'TOWER_ADVANCED');
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

function updateHUD(state) {
  const me = state.players[myPlayerId];
  if (!uiElements.uiGold) initUIElementsCache();
  const playersArr = Object.values(state.players);

  // 1. 排行榜 HTML Diffing
  if (uiElements.lbList) {
    let newLbHTML = '';

    if (currentLeaderboardTab === 'PLAYER') {
      const sorted = [...playersArr].sort((a, b) => (b.score || 0) - (a.score || 0));
      const myRankIdx = sorted.findIndex(p => p.id === myPlayerId);

      let displayList = [];
      if (myRankIdx >= 4) {
        displayList = sorted.slice(0, 4);
        displayList.push({ ...sorted[myRankIdx], actualRank: myRankIdx + 1 });
      } else {
        displayList = sorted.slice(0, 5).map((p, i) => ({ ...p, actualRank: i + 1 }));
      }

      newLbHTML = displayList.map((p) => {
        const isMe = (p.id === myPlayerId);
        const ally = p.allianceId ? state.alliances[p.allianceId] : null;
        const allyTag = ally ? `<span style="color: ${ally.color}; font-size: 10px; margin-left: 4px;">[${ally.name}]</span>` : '';
        const offlineTag = !p.isOnline ? `<span style="color: #9ca3af; font-size: 10px; margin-left: 4px;">(離線)</span>` : '';

        return `
          <div class="lb-row ${isMe ? 'me' : ''} ${!p.isOnline ? 'offline' : ''}">
            <span class="lb-name" onclick="inspectPlayer('${p.id}')">${p.actualRank}. ${p.name || p.id.substring(0, 4)}${allyTag}${offlineTag}</span>
            <span style="font-weight: bold; color: ${!p.isOnline ? '#9ca3af' : 'var(--primary)'};">${p.score || 0} Pts</span>
          </div>
        `;
      }).join('');
    } else {
      const sortedAllies = Object.values(state.alliances).sort((a, b) => (b.score || 0) - (a.score || 0));
      const myAllyId = me ? me.allianceId : null;
      const myAllyRankIdx = myAllyId ? sortedAllies.findIndex(a => a.id === myAllyId) : -1;

      let displayList = [];
      if (myAllyRankIdx >= 4) {
        displayList = sortedAllies.slice(0, 4);
        displayList.push({ ...sortedAllies[myAllyRankIdx], actualRank: myAllyRankIdx + 1 });
      } else {
        displayList = sortedAllies.slice(0, 5).map((a, i) => ({ ...a, actualRank: i + 1 }));
      }

      if (displayList.length === 0) {
        newLbHTML = `<div style="font-size: 11px; color: #9ca3af; text-align: center; padding: 12px 0;">尚無成立聯盟</div>`;
      } else {
        newLbHTML = displayList.map((a) => {
          const isMyAlly = (myAllyId && a.id === myAllyId);
          const hasOnlineMembers = a.memberIds.some(memId => state.players[memId] && state.players[memId].isOnline);
          const offlineTag = !hasOnlineMembers ? `<span style="color: #9ca3af; font-size: 10px; margin-left: 4px;">(全員離線)</span>` : '';

          return `
            <div class="lb-row ${isMyAlly ? 'me' : ''} ${!hasOnlineMembers ? 'offline' : ''}">
              <span style="color: ${!hasOnlineMembers ? '#9ca3af' : a.color}; font-weight: bold;">
                ${a.actualRank}. [${a.name}] <span style="font-size: 10px; color: #9ca3af;">(${a.memberIds.length}人)</span>${offlineTag}
              </span>
              <span style="font-weight: bold; color: ${!hasOnlineMembers ? '#9ca3af' : 'var(--warning)'};">${a.score || 0} Pts</span>
            </div>
          `;
        }).join('');
      }
    }

    if (newLbHTML !== lastLbHTMLCache) {
      lastLbHTMLCache = newLbHTML;
      uiElements.lbList.innerHTML = newLbHTML;
      if (uiElements.onlineCount) uiElements.onlineCount.innerText = `${playersArr.filter(p => p.isOnline).length} 在線`;
    }
  }

  // 🟢 2. HUD 數據與 4 段移速變色 (80%+ 綠 / 51-80% 黃 / 21-50% 紅 / <=20% 暗紅)[cite: 4]
  if (me) {
    const totalWeight = me.army.reduce((acc, s) => acc + (s.type === 'HEAVY' ? 2 : 1), 0);
    const coreHp = me.core ? Math.ceil(me.core.hp) : -1;
    const speedRatio = me.speedRatio !== undefined ? me.speedRatio : 1.0;

    const currentDataKey = `${me.gold}_${coreHp}_${totalWeight}_${speedRatio}_${me.armyState}_${me.isDead}`;

    if (currentDataKey !== lastHudDataCache) {
      lastHudDataCache = currentDataKey;

      if (uiElements.uiGold) uiElements.uiGold.innerText = me.gold;

      if (me.core) {
        if (uiElements.uiCoreHpText) uiElements.uiCoreHpText.innerText = `${coreHp} / 1000`;
        if (uiElements.uiCoreHpBar) uiElements.uiCoreHpBar.style.width = `${(coreHp / 1000) * 100}%`;
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
        else uiElements.uiMoveSpeed.style.color = '#800000'; // 暗紅
      }

      if (uiElements.uiArmyMode) {
        if (me.armyState === 'FREE') { uiElements.uiArmyMode.innerText = '⚔️ 自由 (FREE)'; uiElements.uiArmyMode.style.color = '#ffb700'; }
        else if (me.armyState === 'HOLD') { uiElements.uiArmyMode.innerText = '📌 駐守 (HOLD)'; uiElements.uiArmyMode.style.color = '#00f0ff'; }
        else { uiElements.uiArmyMode.innerText = '🛡️ 護衛 (GUARD)'; uiElements.uiArmyMode.style.color = '#00ff66'; }
      }

      if (me.isDead && !me.core) {
        document.getElementById('game-over-modal').style.display = 'flex';
      }
    }
  }

  updateUI();
}