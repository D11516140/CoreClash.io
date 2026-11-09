// 🧪 public/js/sandbox/sandboxClasses.js - 職業圖鑑、行為雷達與轉職評估模組

const CLASS_DEFINITIONS = {
  SIEGE_DEMON: {
    id: 'SIEGE_DEMON', name: '💥 戰術修羅', tag: '侵略 / 建設',
    desc: '用火砲與前線防禦塔步步進逼，將陣地直接推至敵方門口。',
    weights: { aggro: 0.45, dev: 0.35, coop: 0.05, pve: 0.05, tactics: 0.10 }
  },
  LONE_BEHEADER: {
    id: 'LONE_BEHEADER', name: '🗡️ 孤狼斬首者', tag: '侵略 / 戰術',
    desc: '獨來獨往的刺客，專挑敵方防線空隙直接拔除核心。',
    weights: { aggro: 0.50, dev: 0.05, coop: 0.0, pve: 0.15, tactics: 0.30 }
  },
  CYBER_ARCHITECT: {
    id: 'CYBER_ARCHITECT', name: '🏰 賽博神工', tag: '建設 / 戰術',
    desc: '極致的陣地大師，打造堅不可摧的交錯火網與防禦體系。',
    weights: { aggro: 0.10, dev: 0.55, coop: 0.10, pve: 0.05, tactics: 0.20 }
  },
  FIELD_MEDIC: {
    id: 'FIELD_MEDIC', name: '🚑 戰地軍醫', tag: '協同 / 建設',
    desc: '深耕聯盟後勤，可在盟友基地內建立前線醫療補給站。',
    weights: { aggro: 0.05, dev: 0.35, coop: 0.50, pve: 0.05, tactics: 0.05 }
  },
  WARLORD_COMMAND: {
    id: 'WARLORD_COMMAND', name: '🛡️ 鋼鐵盟主', tag: '協同 / 侵略',
    desc: '率領團隊與麾下大軍衝鋒陷陣，提供全隊精神凝聚。',
    weights: { aggro: 0.35, dev: 0.05, coop: 0.45, pve: 0.05, tactics: 0.10 }
  },
  VOID_CONQUEROR: {
    id: 'VOID_CONQUEROR', name: '👾 荒野狩獵者', tag: '資源 / 侵略',
    desc: '清掃紫晶怪與野外 Boss 的專家，掌控大地圖中立資源。',
    weights: { aggro: 0.25, dev: 0.05, coop: 0.05, pve: 0.55, tactics: 0.10 }
  },
  SCRAPPER: {
    id: 'SCRAPPER', name: '🗑️ 廢品商人', tag: '資源 / 戰術',
    desc: '靈活變現的資源套利者，擅長回收變賣與野外招募。',
    weights: { aggro: 0.05, dev: 0.15, coop: 0.05, pve: 0.45, tactics: 0.30 }
  },
  TACTICAL_MASTERMIND: {
    id: 'TACTICAL_MASTERMIND', name: '🎯 戰術指揮官', tag: '戰術 / 協同',
    desc: '極致微操，頻繁調整駐守與陣線控制戰局節奏。',
    weights: { aggro: 0.10, dev: 0.10, coop: 0.30, pve: 0.05, tactics: 0.45 }
  },
  WANDERER: {
    id: 'WANDERER', name: '👟 賽博游擊者', tag: '全能保底',
    desc: '平衡適應各類戰況，沒有極端強項但也絕無死角。',
    weights: { aggro: 0.20, dev: 0.20, coop: 0.20, pve: 0.20, tactics: 0.20 }
  }
};
window.CLASS_DEFINITIONS = CLASS_DEFINITIONS;

function getNormalizedStats(stats) {
  const s = stats || { aggro: 0, dev: 0, coop: 0, pve: 0, tactics: 0 };
  const total = (s.aggro + s.dev + s.coop + s.pve + s.tactics) || 1;
  return {
    aggro: Math.min(100, Math.round((s.aggro / total) * 100)),
    dev: Math.min(100, Math.round((s.dev / total) * 100)),
    coop: Math.min(100, Math.round((s.coop / total) * 100)),
    pve: Math.min(100, Math.round((s.pve / total) * 100)),
    tactics: Math.min(100, Math.round((s.tactics / total) * 100))
  };
}
window.getNormalizedStats = getNormalizedStats;

function evaluateClassTrends(stats) {
  const norm = getNormalizedStats(stats);
  const scores = [];

  for (const [key, classObj] of Object.entries(CLASS_DEFINITIONS)) {
    if (key === 'WANDERER') continue;
    const w = classObj.weights;
    const score = (norm.aggro * w.aggro) + (norm.dev * w.dev) +
                  (norm.coop * w.coop) + (norm.pve * w.pve) + (norm.tactics * w.tactics);
    scores.push({ id: key, name: classObj.name, score: score });
  }

  scores.sort((a, b) => b.score - a.score);
  return scores;
}
window.evaluateClassTrends = evaluateClassTrends;

function getSurprise3Cards(stats) {
  const ranked = evaluateClassTrends(stats);
  const pool = [ranked[0].id, ranked[1].id, ranked[2].id, ranked[3].id, 'WANDERER'];
  
  const shuffled = pool.sort(() => 0.5 - Math.random());
  const selected = Array.from(new Set(shuffled)).slice(0, 3);

  while (selected.length < 3) {
    selected.push('WANDERER');
  }

  return selected.map(id => CLASS_DEFINITIONS[id]);
}
window.getSurprise3Cards = getSurprise3Cards;

function drawRadarChart(ctx, cx, cy, radius, stats) {
  const axes = ['aggro', 'dev', 'coop', 'pve', 'tactics'];
  const labels = ['侵略', '建設', '協同', '資源', '戰術'];
  const numAxes = axes.length;
  const norm = typeof getNormalizedStats === 'function' ? getNormalizedStats(stats) : stats;

  ctx.save();

  ctx.strokeStyle = 'rgba(0, 240, 255, 0.2)';
  ctx.lineWidth = 1;
  for (let level = 1; level <= 3; level++) {
    const r = (radius / 3) * level;
    ctx.beginPath();
    for (let i = 0; i < numAxes; i++) {
      const angle = (Math.PI * 2 / numAxes) * i - Math.PI / 2;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }

  ctx.fillStyle = '#9ca3af';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < numAxes; i++) {
    const angle = (Math.PI * 2 / numAxes) * i - Math.PI / 2;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x, y);
    ctx.stroke();

    const labelX = cx + Math.cos(angle) * (radius + 14);
    const labelY = cy + Math.sin(angle) * (radius + 14);
    ctx.fillText(labels[i], labelX, labelY);
  }

  ctx.beginPath();
  for (let i = 0; i < numAxes; i++) {
    const angle = (Math.PI * 2 / numAxes) * i - Math.PI / 2;
    const val = (norm[axes[i]] || 0) / 100;
    const r = Math.max(8, radius * val);
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;

    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();

  ctx.fillStyle = 'rgba(0, 240, 255, 0.35)';
  ctx.fill();
  ctx.strokeStyle = '#00f0ff';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.restore();
}
window.drawRadarChart = drawRadarChart;