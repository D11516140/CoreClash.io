const { ALLIANCE_COLORS } = require('./config');

function isSameAlliance(gameState, p1Id, p2Id) {
  if (!p1Id || !p2Id || p1Id === p2Id) return false;
  const p1 = gameState.players[p1Id];
  const p2 = gameState.players[p2Id];
  if (!p1 || !p2 || !p1.allianceId || !p2.allianceId) return false;
  return p1.allianceId === p2.allianceId;
}

function clearPlayerApplications(gameState, applicantId) {
  if (!applicantId) return;
  Object.values(gameState.alliances).forEach(alliance => {
    if (alliance.pendingRequests) {
      alliance.pendingRequests = alliance.pendingRequests.filter(req => req.applicantId !== applicantId);
    }
  });
}

function passLeadershipToNextEligible(gameState, alliance) {
  if (!alliance) return;

  let nextLeaderId = alliance.memberIds.find(id => {
    const p = gameState.players[id];
    return p && p.isOnline && !p.isDead;
  });

  if (!nextLeaderId) {
    nextLeaderId = alliance.memberIds.find(id => {
      const p = gameState.players[id];
      return p && p.isOnline;
    });
  }

  if (nextLeaderId) {
    alliance.leaderId = nextLeaderId;
  } else if (alliance.memberIds.length > 0) {
    alliance.leaderId = alliance.memberIds[0];
  } else {
    delete gameState.alliances[alliance.id];
  }
}

function removePlayerFromAlliance(gameState, player) {
  if (!player || !player.allianceId) return;
  const alliance = gameState.alliances[player.allianceId];
  if (alliance) {
    alliance.memberIds = alliance.memberIds.filter(id => id !== player.id);
    if (alliance.pendingRequests) {
      alliance.pendingRequests = alliance.pendingRequests.filter(req => req.applicantId !== player.id);
    }
    if (alliance.leaderId === player.id) {
      passLeadershipToNextEligible(gameState, alliance);
    }
  }
  player.allianceId = null;
}

function createAlliance(gameState, socket, allianceName, counters) {
  const player = gameState.players[socket.playerId];
  if (!player || player.allianceId || player.isDead) return;

  const name = (allianceName && allianceName.trim()) ? allianceName.trim().substring(0, 12) : `${player.name}的聯盟`;
  const allianceId = `ally_${counters.allianceIdCounter++}`;
  const color = ALLIANCE_COLORS[Math.floor(Math.random() * ALLIANCE_COLORS.length)];

  gameState.alliances[allianceId] = {
    id: allianceId,
    name: name,
    leaderId: player.id,
    memberIds: [player.id],
    pendingRequests: [],
    recruitmentMode: 'REVIEW',
    color: color,
    score: player.score || 0
  };

  player.allianceId = allianceId;
  player.pendingInvite = null;
  player.pendingPoach = null;
  clearPlayerApplications(gameState, player.id);

  gameState.events.push({
    type: 'FLOAT_TEXT',
    x: player.x, y: player.y - 30,
    text: `🛡️ 創立聯盟 [${name}]`,
    color: color,
    forPlayerId: player.id
  });
}

function setRecruitmentMode(gameState, socket, mode) {
  const leader = gameState.players[socket.playerId];
  if (!leader || !leader.allianceId) return;

  const alliance = gameState.alliances[leader.allianceId];
  if (!alliance || alliance.leaderId !== leader.id) return;

  if (['FREE', 'REVIEW', 'CLOSED'].includes(mode)) {
    alliance.recruitmentMode = mode;
    const modeNames = { FREE: '自由加入', REVIEW: '審核加入', CLOSED: '封閉/僅特邀' };
    gameState.events.push({
      type: 'FLOAT_TEXT',
      x: leader.x, y: leader.y - 30,
      text: `⚙️ 招募模式改為：${modeNames[mode]}`,
      color: '#00f0ff',
      forPlayerId: leader.id
    });
  }
}

function applyToAlliance(gameState, socket, targetAllianceId) {
  const applicant = gameState.players[socket.playerId];
  if (!applicant || applicant.allianceId || applicant.isDead) return;

  const alliance = gameState.alliances[targetAllianceId];
  if (!alliance) return;

  const mode = alliance.recruitmentMode || 'REVIEW';
  if (mode === 'CLOSED') {
    gameState.events.push({ type: 'FLOAT_TEXT', x: applicant.x, y: applicant.y - 30, text: `❌ 該聯盟目前暫不接受申請`, color: '#ff0055', forPlayerId: applicant.id });
    return;
  }

  if (mode === 'FREE') {
    alliance.memberIds.push(applicant.id);
    applicant.allianceId = alliance.id;
    clearPlayerApplications(gameState, applicant.id);
    gameState.events.push({ type: 'FLOAT_TEXT', x: applicant.x, y: applicant.y - 30, text: `🎉 正式加入 [${alliance.name}]！`, color: '#00ff66', forPlayerId: applicant.id });
  } else {
    const alreadyApplied = alliance.pendingRequests.some(r => r.applicantId === applicant.id);
    if (!alreadyApplied) {
      alliance.pendingRequests.push({ applicantId: applicant.id, applicantName: applicant.name });
    }
    gameState.events.push({ type: 'FLOAT_TEXT', x: applicant.x, y: applicant.y - 30, text: `已向 [${alliance.name}] 提交申請`, color: '#00f0ff', forPlayerId: applicant.id });
  }
}

function transferLeadership(gameState, socket, targetPlayerId) {
  const leader = gameState.players[socket.playerId];
  const target = gameState.players[targetPlayerId];

  if (!leader || !leader.allianceId || !target) return;
  const alliance = gameState.alliances[leader.allianceId];
  if (!alliance || alliance.leaderId !== leader.id) return;
  if (target.allianceId !== alliance.id || target.id === leader.id) return;

  if (!target.isOnline || target.isDead) {
    gameState.events.push({
      type: 'FLOAT_TEXT',
      x: leader.x, y: leader.y - 30,
      text: `⚠️ 無法轉讓給離線或陣亡的玩家`,
      color: '#ff0055',
      forPlayerId: leader.id
    });
    return;
  }

  alliance.leaderId = target.id;
  gameState.events.push({
    type: 'FLOAT_TEXT',
    x: target.x, y: target.y - 30,
    text: `👑 已升格為聯盟盟主！`,
    color: '#ffd700',
    forPlayerId: target.id
  });
  gameState.events.push({
    type: 'FLOAT_TEXT',
    x: leader.x, y: leader.y - 30,
    text: `已將盟主職位轉讓給 ${target.name}`,
    color: '#00f0ff',
    forPlayerId: leader.id
  });
}

function kickMember(gameState, socket, targetPlayerId) {
  const leader = gameState.players[socket.playerId];
  const target = gameState.players[targetPlayerId];

  if (!leader || !leader.allianceId || !target) return;
  const alliance = gameState.alliances[leader.allianceId];
  if (!alliance || alliance.leaderId !== leader.id) return;
  if (target.allianceId !== alliance.id || target.id === leader.id) return;

  removePlayerFromAlliance(gameState, target);
  gameState.events.push({
    type: 'FLOAT_TEXT',
    x: target.x, y: target.y - 30,
    text: `🚫 你已被盟主踢出聯盟！`,
    color: '#ff0055',
    forPlayerId: target.id
  });
}

function inviteToAlliance(gameState, socket, targetPlayerId) {
  const sender = gameState.players[socket.playerId];
  const target = gameState.players[targetPlayerId];

  if (!sender || !target || !target.isOnline || target.isDead || target.allianceId) return;
  if (!sender.allianceId) return;

  const alliance = gameState.alliances[sender.allianceId];
  if (!alliance) return;

  const isLeader = (alliance.leaderId === sender.id);
  target.pendingInvite = {
    allianceId: alliance.id,
    allianceName: alliance.name,
    inviterId: sender.id,
    inviterName: sender.name,
    isLeader: isLeader
  };

  gameState.events.push({
    type: 'FLOAT_TEXT',
    x: sender.x, y: sender.y - 30,
    text: `已向 ${target.name} 發送邀請`,
    color: '#00f0ff',
    forPlayerId: sender.id
  });
}

function respondAllianceInvite(gameState, socket, accept) {
  const player = gameState.players[socket.playerId];
  if (!player || player.allianceId || !player.pendingInvite) return;

  const invite = player.pendingInvite;
  const alliance = gameState.alliances[invite.allianceId];
  player.pendingInvite = null;

  if (accept && alliance) {
    const inviter = gameState.players[invite.inviterId];
    const isLeaderInvite = inviter && (alliance.leaderId === inviter.id);

    if (isLeaderInvite) {
      alliance.memberIds.push(player.id);
      player.allianceId = alliance.id;
      clearPlayerApplications(gameState, player.id);
      gameState.events.push({ type: 'FLOAT_TEXT', x: player.x, y: player.y - 30, text: `正式加入聯盟 [${alliance.name}]`, color: '#00ff66', forPlayerId: player.id });
    } else {
      const alreadyApplied = alliance.pendingRequests.some(r => r.applicantId === player.id);
      if (!alreadyApplied) {
        alliance.pendingRequests.push({ applicantId: player.id, applicantName: player.name });
      }
      gameState.events.push({ type: 'FLOAT_TEXT', x: player.x, y: player.y - 30, text: `已同意邀請，等待盟主審核...`, color: '#ffb700', forPlayerId: player.id });
    }
  }
}

function poachPlayer(gameState, socket, targetPlayerId) {
  const leader = gameState.players[socket.playerId];
  const target = gameState.players[targetPlayerId];

  if (!leader || !leader.allianceId || !target || !target.isOnline || target.isDead) return;

  const leaderAlliance = gameState.alliances[leader.allianceId];
  if (!leaderAlliance || leaderAlliance.leaderId !== leader.id) return;

  if (target.allianceId === leader.allianceId) return;
  const targetAlliance = target.allianceId ? gameState.alliances[target.allianceId] : null;
  if (targetAlliance && targetAlliance.leaderId === target.id) return;

  target.pendingPoach = {
    allianceId: leaderAlliance.id,
    allianceName: leaderAlliance.name,
    leaderName: leader.name
  };

  gameState.events.push({
    type: 'FLOAT_TEXT',
    x: leader.x, y: leader.y - 30,
    text: `已向 ${target.name} 發起挖腳！`,
    color: '#ec4899',
    forPlayerId: leader.id
  });
}

function respondPoachInvite(gameState, socket, accept) {
  const player = gameState.players[socket.playerId];
  if (!player || !player.pendingPoach) return;

  const poach = player.pendingPoach;
  const newAlliance = gameState.alliances[poach.allianceId];
  player.pendingPoach = null;

  if (accept && newAlliance) {
    removePlayerFromAlliance(gameState, player);
    newAlliance.memberIds.push(player.id);
    player.allianceId = newAlliance.id;
    clearPlayerApplications(gameState, player.id);

    gameState.events.push({
      type: 'FLOAT_TEXT',
      x: player.x, y: player.y - 30,
      text: `⚔️ 跳槽加入 [${newAlliance.name}]！`,
      color: '#ec4899',
      forPlayerId: player.id
    });
  }
}

function respondAllianceApplication(gameState, socket, data) {
  const leader = gameState.players[socket.playerId];
  if (!leader || !leader.allianceId || !data) return;

  const alliance = gameState.alliances[leader.allianceId];
  if (!alliance || alliance.leaderId !== leader.id) return;

  const { applicantId, accept } = data;
  alliance.pendingRequests = alliance.pendingRequests.filter(r => r.applicantId !== applicantId);

  const applicant = gameState.players[applicantId];

  if (accept && applicant && !applicant.allianceId) {
    alliance.memberIds.push(applicant.id);
    applicant.allianceId = alliance.id;
    clearPlayerApplications(gameState, applicant.id);

    gameState.events.push({
      type: 'FLOAT_TEXT',
      x: applicant.x, y: applicant.y - 30,
      text: `🎉 審核通過，加入聯盟 [${alliance.name}]！`,
      color: '#00ff66',
      forPlayerId: applicant.id
    });
  } else if (!accept && applicant) {
    gameState.events.push({
      type: 'FLOAT_TEXT',
      x: applicant.x, y: applicant.y - 30,
      text: `❌ 聯盟申請已被拒絕`,
      color: '#ff0055',
      forPlayerId: applicant.id
    });
  }
}

function leaveAlliance(gameState, socket) {
  const player = gameState.players[socket.playerId];
  if (!player || !player.allianceId) return;

  const alliance = gameState.alliances[player.allianceId];
  if (!alliance) return;

  if (alliance.leaderId === player.id && alliance.memberIds.length > 1) {
    return;
  }

  const oldName = alliance.name;
  removePlayerFromAlliance(gameState, player);

  gameState.events.push({
    type: 'FLOAT_TEXT',
    x: player.x, y: player.y - 30,
    text: `已離開/解散聯盟 [${oldName}]`,
    color: '#ffb700',
    forPlayerId: player.id
  });
}

module.exports = {
  isSameAlliance,
  clearPlayerApplications,
  passLeadershipToNextEligible,
  removePlayerFromAlliance,
  createAlliance,
  setRecruitmentMode,
  applyToAlliance,
  transferLeadership,
  kickMember,
  inviteToAlliance,
  respondAllianceInvite,
  poachPlayer,
  respondPoachInvite,
  respondAllianceApplication,
  leaveAlliance
};