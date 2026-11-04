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

// 🏆 排行榜頁籤切換狀態 (PLAYER | ALLIANCE)
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

// 🤝 聯盟 / 組隊系統 UI 操控
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

// ⚙️ 聯盟設定 Modal 邏輯
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

// 👑 轉讓盟主
function transferLeadershipUI(targetId, targetName) {
  showCustomConfirm(
    '👑 轉讓盟主確認',
    `確定要將盟主大權無條件移交給【${targetName}】嗎？`,
    () => { socket.emit('transferLeadership', targetId); }
  );
}

// 🚫 踢除成員
function kickMemberUI(targetId, targetName) {
  showCustomConfirm(
    '🚫 踢除成員確認',
    `確定要將成員【${targetName}】踢出聯盟嗎？`,
    () => { socket.emit('kickMember', targetId); }
  );
}

// 📜 全體成員 Modal 控制
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

// 🎛️ 底部控制列更新
function updateUI() {
  const me = lastGameState ? lastGameState.players[myPlayerId] : null;

  const btnBack = document.getElementById('btn-back');
  const btnCore = document.getElementById('btn-core');
  const btn1 = document.getElementById('btn-menu1');
  const btn2 = document.getElementById('btn-menu2');
  const btnF = document.getElementById('btn-f');

  const lblE = document.getElementById('label-e');
  const lbl1 = document.getElementById('label-1');
  const lbl2 = document.getElementById('label-2');

  if (!me) return;

  [btnCore, btn1, btn2, btnF, btnBack].forEach(b => {
    if (b) {
      b.classList.remove('active', 'sub-active');
      if (document.activeElement === b) b.blur();
    }
  });

  if (me.isDead && me.core) {
    btnBack.style.display = 'none';
    btnCore.style.display = 'none';
    btn1.style.display = 'none';
    btn2.style.display = 'none';
    btnF.style.display = 'none';
    return;
  }

  if (!me.core) {
    btnBack.style.display = 'none';
    btnCore.style.display = 'flex';
    btn1.style.display = 'none';
    btn2.style.display = 'none';
    btnF.style.display = 'none';
    lblE.innerText = '建基地';
    btnCore.classList.toggle('sub-active', buildMode === 'CORE');
    return;
  }

  if (activeMenu === 'TOWER_MENU' || buildMode === 'TOWER_BASIC' || buildMode === 'TOWER_ADVANCED') {
    btnBack.style.display = 'flex';
    btnCore.style.display = 'none';
    btn1.style.display = 'flex';
    btn2.style.display = 'flex';
    btnF.style.display = 'none';

    lbl1.innerText = buildMode === 'TOWER_BASIC' ? '初階塔(100G) [預覽]' : '初階塔(100G)';
    lbl2.innerText = buildMode === 'TOWER_ADVANCED' ? '中級重砲(200G) [預覽]' : '中級重砲(200G)';

    btn1.classList.toggle('sub-active', buildMode === 'TOWER_BASIC');
    btn2.classList.toggle('sub-active', buildMode === 'TOWER_ADVANCED');
    return;
  }

  if (activeMenu === 'ARMY_MENU') {
    btnBack.style.display = 'flex';
    btnCore.style.display = 'none';
    btn1.style.display = 'flex';
    btn2.style.display = 'flex';
    btnF.style.display = 'none';

    lbl1.innerText = '初級兵(50G)';
    lbl2.innerText = '中級裝甲(120G)';
    return;
  }

  btnBack.style.display = 'none';
  btnCore.style.display = 'flex';
  btn1.style.display = 'flex';
  btn2.style.display = 'flex';
  btnF.style.display = 'flex';

  lblE.innerText = '傳送回基地';
  lbl1.innerText = '防禦塔選單';
  lbl2.innerText = '軍隊徵召選單';
}

// 📊 每幀 HUD 與數據更新 (Top 4 + 自己/5名動態釘選)
function updateHUD(state) {
  const me = state.players[myPlayerId];
  const lbList = document.getElementById('leaderboard-list');
  const onlineCount = document.getElementById('ui-player-count');
  const playersArr = Object.values(state.players);

  if (onlineCount) onlineCount.innerText = `${playersArr.filter(p => p.isOnline).length} 在線`;

  if (lbList) {
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

      lbList.innerHTML = displayList.map((p) => {
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
        lbList.innerHTML = `<div style="font-size: 11px; color: #9ca3af; text-align: center; padding: 12px 0;">尚無成立聯盟</div>`;
      } else {
        lbList.innerHTML = displayList.map((a) => {
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
  }

  // 2. 聯盟面板與邀請提示
  const createBox = document.getElementById('alliance-create-box');
  const inviteBox = document.getElementById('alliance-invite-box');
  const noticeText = document.getElementById('invite-notice-text');
  const infoBox = document.getElementById('alliance-info-box');
  const displayName = document.getElementById('alliance-display-name');
  const memberCountEl = document.getElementById('alliance-member-count');
  const topMembersEl = document.getElementById('alliance-top-members');
  const settingBtn = document.getElementById('alliance-setting-btn');
  const leaveBtn = document.getElementById('alliance-leave-btn');
  const reqContainer = document.getElementById('alliance-requests-container');
  const reqTitle = document.getElementById('req-count-title');
  const reqOldestName = document.getElementById('req-oldest-name');

  if (me) {
    if (me.allianceId && state.alliances[me.allianceId]) {
      const ally = state.alliances[me.allianceId];
      const isLeader = (ally.leaderId === me.id);

      if (createBox) createBox.style.display = 'none';
      if (inviteBox) inviteBox.style.display = 'none';
      if (infoBox) infoBox.style.display = 'flex';

      if (displayName) {
        displayName.innerText = `${isLeader ? '👑 盟主' : '🛡️ 成員'} [${ally.name}]`;
        displayName.style.color = ally.color;
      }

      if (settingBtn) settingBtn.style.display = isLeader ? 'block' : 'none';

      if (leaveBtn) {
        if (isLeader && ally.memberIds.length > 1) {
          leaveBtn.classList.add('disabled');
          leaveBtn.title = '身為盟主需先轉讓職位才可退出！';
        } else {
          leaveBtn.classList.remove('disabled');
          leaveBtn.title = isLeader ? '解散聯盟' : '退出聯盟';
        }
      }

      if (memberCountEl) memberCountEl.innerText = `成員 (${ally.memberIds.length}人)`;
      if (topMembersEl) {
        const sortedMembers = ally.memberIds.map(id => state.players[id]).filter(Boolean).sort((a, b) => (b.score || 0) - (a.score || 0));
        const top3 = sortedMembers.slice(0, 3);
        topMembersEl.innerHTML = top3.map(m => `
          <div style="display: flex; justify-content: space-between; margin-top: 2px;" class="${!m.isOnline ? 'offline' : ''}">
            <span style="color: ${!m.isOnline ? '#9ca3af' : 'var(--text)'};">${m.id === ally.leaderId ? '👑' : '🛡️'} ${m.name} ${!m.isOnline ? '(離線)' : ''}</span>
            <span style="color: ${!m.isOnline ? '#9ca3af' : 'var(--primary)'};">${m.score || 0} Pts</span>
          </div>
        `).join('');
      }

      if (isLeader && ally.pendingRequests && ally.pendingRequests.length > 0) {
        if (reqContainer) reqContainer.style.display = 'flex';
        if (reqTitle) reqTitle.innerText = `📥 申請清單 (${ally.pendingRequests.length})`;
        if (reqOldestName) reqOldestName.innerText = ally.pendingRequests[0].applicantName;
      } else {
        if (reqContainer) reqContainer.style.display = 'none';
      }
    } else if (me.pendingInvite || me.pendingPoach) {
      if (createBox) createBox.style.display = 'none';
      if (infoBox) infoBox.style.display = 'none';
      if (inviteBox) inviteBox.style.display = 'flex';

      if (noticeText) {
        if (me.pendingInvite) {
          noticeText.innerText = me.pendingInvite.isLeader
            ? `👑 [${me.pendingInvite.allianceName}] 盟主特邀`
            : `📩 [${me.pendingInvite.allianceName}] 邀請組隊`;
        } else if (me.pendingPoach) {
          noticeText.innerText = `🎯 [${me.pendingPoach.allianceName}] 發起挖腳`;
        }
      }
    } else {
      if (createBox) createBox.style.display = 'block';
      if (inviteBox) inviteBox.style.display = 'none';
      if (infoBox) infoBox.style.display = 'none';
    }
  }

  updateUI();

  const membersModal = document.getElementById('members-modal');
  if (membersModal && membersModal.style.display === 'flex') {
    openMembersModal();
  }

  if (me) {
    document.getElementById('ui-gold').innerText = me.gold;
    if (me.core) {
      document.getElementById('ui-core-hp-text').innerText = `${Math.ceil(me.core.hp)} / 1000`;
      document.getElementById('ui-core-hp-bar').style.width = `${(me.core.hp / 1000) * 100}%`;
    } else {
      document.getElementById('ui-core-hp-text').innerText = '未放置 (按E)';
      document.getElementById('ui-core-hp-bar').style.width = '0%';
    }
    document.getElementById('ui-army-count').innerText = me.army.length;

    const modeEl = document.getElementById('ui-army-mode');
    if (modeEl) {
      if (me.armyState === 'FREE') { modeEl.innerText = '⚔️ 自由 (FREE)'; modeEl.style.color = '#ffb700'; }
      else if (me.armyState === 'HOLD') { modeEl.innerText = '📌 駐守 (HOLD)'; modeEl.style.color = '#00f0ff'; }
      else { modeEl.innerText = '🛡️ 護衛 (GUARD)'; modeEl.style.color = '#00ff66'; }
    }

    if (me.isDead && !me.core) {
      document.getElementById('game-over-modal').style.display = 'flex';
    }
  }
}