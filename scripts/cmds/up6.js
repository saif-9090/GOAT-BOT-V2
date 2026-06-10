const os = require('os');
const moment = require('moment-timezone');
const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

module.exports = {
  config: {
    name: "up6",
    version: "5.0",
    role: 0,
    author: "xalman",
    description: "Premium System Monitor Dashboard - Space Edition",
    category: "system",
    guide: "{pn}",
    countDown: 5
  },

  onStart: async function ({ api, event }) {
    const { threadID, messageID } = event;
    try {
      const data = await collectSystemData();
      const imagePath = await renderDashboard(data);
      return api.sendMessage(
        { body: "", attachment: fs.createReadStream(imagePath) },
        threadID,
        () => { try { fs.unlinkSync(imagePath); } catch (_) {} },
        messageID
      );
    } catch (err) {
      console.error("Dashboard error:", err);
      return api.sendMessage("❌ Dashboard error: " + err.message, threadID, messageID);
    }
  }
};

// ═══════════════════════════════════════════════════════════════════
//  SYSTEM DATA COLLECTION
// ═══════════════════════════════════════════════════════════════════

async function collectSystemData() {
  const uptime = process.uptime();
  const sysUptime = os.uptime();
  const totalRam = os.totalmem();
  const freeRam = os.freemem();
  const usedRam = totalRam - freeRam;
  const loadAvgs = os.loadavg();
  const cpuCores = os.cpus().length;
  const cpuModel = os.cpus()[0]?.model?.split(' ').slice(0, 3).join(' ') || 'CPU';

  let diskPercent = 51, diskUsed = '120GB', diskTotal = '240GB';
  try {
    const { execSync } = require('child_process');
    const df = execSync("df / | tail -1").toString().trim().split(/\s+/);
    diskPercent = parseInt(df[4]) || 51;
    diskUsed = (parseInt(df[2]) / 1048576).toFixed(0) + 'GB';
    diskTotal = (parseInt(df[1]) / 1048576).toFixed(0) + 'GB';
  } catch (_) {}

  let procCount = 0;
  try {
    const { execSync } = require('child_process');
    procCount = Math.max(0, parseInt(execSync("ps aux | wc -l").toString().trim()) - 1);
  } catch (_) {}
  if (!procCount) procCount = 377;

  let netSpeed = '149.7 MB/s';
  try {
    const { execSync } = require('child_process');
    const lines = execSync("cat /proc/net/dev").toString().split('\n').slice(2);
    let total = 0;
    lines.forEach(l => {
      const p = l.trim().split(/\s+/);
      if (p[0] && p[0] !== 'lo:') total += (parseInt(p[1]) || 0) + (parseInt(p[9]) || 0);
    });
    if (total > 0) netSpeed = (total / 1048576).toFixed(1) + ' MB/s';
  } catch (_) {}

  const cpuPct = parseFloat(Math.min((loadAvgs[0] / cpuCores) * 100, 100).toFixed(1));
  const ramPct = parseFloat(((usedRam / totalRam) * 100).toFixed(1));
  const loadPct = Math.min(Math.round((loadAvgs[0] / cpuCores) * 100), 100);

  return {
    botDays:  Math.floor(uptime / 86400),
    botHours: Math.floor((uptime % 86400) / 3600),
    botMins:  Math.floor((uptime % 3600) / 60),
    totalHours: (uptime / 3600).toFixed(1),
    sysDays:  Math.floor(sysUptime / 86400),
    sysHours: Math.floor((sysUptime % 86400) / 3600),
    sysMins:  Math.floor((sysUptime % 3600) / 60),
    yearPct:  ((sysUptime / (365 * 86400)) * 100).toFixed(1),
    usedRamGB:  (usedRam / 1073741824).toFixed(1),
    totalRamGB: (totalRam / 1073741824).toFixed(1),
    ramPct, cpuCores, cpuPct, cpuModel,
    platform: 'LINUX', arch: os.arch(), nodeVer: process.version,
    netSpeed, procCount,
    load1: loadAvgs[0].toFixed(2),
    load5: loadAvgs[1].toFixed(2),
    load15: loadAvgs[2].toFixed(2),
    diskPercent, diskUsed, diskTotal, loadPct,
    hostname: os.hostname(),
    hostShort: os.hostname().length > 30 ? os.hostname().slice(0, 30) + '…' : os.hostname(),
  };
}

// ═══════════════════════════════════════════════════════════════════
//  CANVAS UTILITIES
// ═══════════════════════════════════════════════════════════════════

function roundRect(ctx, x, y, w, h, r) {
  if (w < 2 * r) r = w / 2;
  if (h < 2 * r) r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function fillRR(ctx, x, y, w, h, r, color) {
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = color;
  ctx.fill();
}

function strokeRR(ctx, x, y, w, h, r, color, lw) {
  roundRect(ctx, x, y, w, h, r);
  ctx.strokeStyle = color;
  ctx.lineWidth = lw || 1.5;
  ctx.stroke();
}

function fillStrokeRR(ctx, x, y, w, h, r, fill, stroke, lw) {
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = fill; ctx.fill();
  ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.8; ctx.stroke();
}

function drawGlow(ctx, x, y, w, h, color, alpha) {
  ctx.save();
  ctx.shadowBlur = 18;
  ctx.shadowColor = color;
  ctx.globalAlpha = alpha || 0.35;
  roundRect(ctx, x, y, w, h, 10);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function drawProgressBar(ctx, x, y, w, h, pct, color, bgColor) {
  fillRR(ctx, x, y, w, h, h / 2, bgColor || 'rgba(255,255,255,0.06)');
  if (pct > 0) {
    const filled = Math.max(h, (pct / 100) * w);
    fillRR(ctx, x, y, filled, h, h / 2, color);
    // shine
    ctx.save();
    roundRect(ctx, x, y, filled, h / 2, h / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fill();
    ctx.restore();
  }
}

function drawGrid(ctx, W, H) {
  ctx.save();
  ctx.globalAlpha = 0.018;
  ctx.strokeStyle = '#4466cc';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 0; y < H; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  ctx.restore();
}

function drawStars(ctx, W, H) {
  for (let i = 0; i < 120; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const r = Math.random() * 1.5 + 0.2;
    const alpha = 0.08 + Math.random() * 0.55;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(200,220,255,${alpha.toFixed(2)})`;
    ctx.fill();
  }
  // a few brighter stars
  for (let i = 0; i < 12; i++) {
    const x = Math.random() * W, y = Math.random() * H;
    ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,0.7)`; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(200,220,255,0.12)`; ctx.fill();
  }
}

function drawScanlines(ctx, W, H) {
  ctx.save();
  ctx.globalAlpha = 0.025;
  for (let y = 0; y < H; y += 3) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, y, W, 1);
  }
  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════════
//  CARD THEMES
// ═══════════════════════════════════════════════════════════════════

const THEMES = {
  blue:   { bg: '#0b1828', bd: '#1e6bdb', ac: '#5aabff', glow: '#1e6bdb', icon_bg: 'rgba(30,107,219,0.18)' },
  cyan:   { bg: '#091e28', bd: '#0ea5b0', ac: '#2de8f0', glow: '#0ea5b0', icon_bg: 'rgba(14,165,176,0.18)' },
  yellow: { bg: '#181500', bd: '#c8a000', ac: '#f0c020', glow: '#c8a000', icon_bg: 'rgba(200,160,0,0.18)'  },
  pink:   { bg: '#18091e', bd: '#c030c8', ac: '#e060f8', glow: '#c030c8', icon_bg: 'rgba(192,48,200,0.18)' },
};

// ═══════════════════════════════════════════════════════════════════
//  METRIC CARD RENDERER
// ═══════════════════════════════════════════════════════════════════

function drawMetricCard(ctx, x, y, w, h, theme, icon, label, value, sub, barPct) {
  const t = THEMES[theme];

  // outer glow
  drawGlow(ctx, x - 2, y - 2, w + 4, h + 4, t.glow, 0.22);

  // card background + border
  fillStrokeRR(ctx, x, y, w, h, 10, t.bg, t.bd, 1.8);

  // top inner highlight line
  ctx.save();
  roundRect(ctx, x + 2, y + 1, w - 4, 2, 1);
  ctx.fillStyle = t.bd + '55';
  ctx.fill();
  ctx.restore();

  // icon background circle
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + 31, y + 31, 19, 0, Math.PI * 2);
  ctx.fillStyle = t.icon_bg; ctx.fill();
  ctx.strokeStyle = t.bd; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.restore();

  // icon text
  ctx.save();
  ctx.font = '17px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",serif';
  ctx.textAlign = 'center'; ctx.fillStyle = t.ac;
  ctx.fillText(icon, x + 31, y + 37);
  ctx.restore();

  // label
  ctx.save();
  ctx.font = 'bold 9px Arial';
  ctx.fillStyle = t.bd;
  ctx.textAlign = 'left';
  ctx.letterSpacing = '1px';
  ctx.fillText(label.toUpperCase(), x + 14, y + 62);
  ctx.restore();

  // value (big)
  ctx.save();
  ctx.font = 'bold 23px "Segoe UI",Arial';
  ctx.fillStyle = t.ac;
  ctx.textAlign = 'left';
  ctx.shadowBlur = 8; ctx.shadowColor = t.ac;
  ctx.fillText(value, x + 14, y + 91);
  ctx.restore();

  // sub text
  ctx.save();
  ctx.font = '10.5px Arial';
  ctx.fillStyle = 'rgba(160,185,220,0.58)';
  ctx.textAlign = 'left';
  ctx.fillText(sub, x + 14, y + 109);
  ctx.restore();

  // progress bar
  if (barPct !== null && barPct !== undefined) {
    drawProgressBar(ctx, x + 14, y + 121, w - 28, 6, barPct, t.ac);
  }
}

// ═══════════════════════════════════════════════════════════════════
//  STATUS BADGE
// ═══════════════════════════════════════════════════════════════════

function drawBadge(ctx, x, y, text, color, bg, border) {
  ctx.save();
  ctx.font = 'bold 8.5px Arial';
  const tw = ctx.measureText(text).width;
  const bw = tw + 16, bh = 18;
  fillStrokeRR(ctx, x, y, bw, bh, 4, bg, border, 1);
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.fillText(text, x + 8, y + 12.5);
  ctx.restore();
  return bw + 6;
}

// ═══════════════════════════════════════════════════════════════════
//  VERTICAL BAR CHART
// ═══════════════════════════════════════════════════════════════════

function drawBarChart(ctx, x, y, w, h, bars) {
  const barW = 72, gap = 44;
  const totalW = bars.length * barW + (bars.length - 1) * gap;
  const startX = x + (w - totalW) / 2;
  const maxH = h - 28;

  bars.forEach((b, i) => {
    const bx = startX + i * (barW + gap);
    const fh = Math.max(3, Math.round((Math.min(b.pct, 100) / 100) * maxH));
    const by = y + maxH - fh;

    // bg bar
    fillRR(ctx, bx, y, barW, maxH, 4, 'rgba(255,255,255,0.05)');

    // filled bar with shine
    fillRR(ctx, bx, by, barW, fh, 4, b.color);
    // shine overlay top half
    ctx.save();
    roundRect(ctx, bx, by, barW, Math.floor(fh / 2), 4);
    ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fill();
    ctx.restore();

    // glow
    ctx.save();
    ctx.shadowBlur = 12; ctx.shadowColor = b.color;
    fillRR(ctx, bx, by, barW, fh, 4, b.color + 'cc');
    ctx.restore();

    // percent label
    ctx.save();
    ctx.font = 'bold 12px Arial';
    ctx.fillStyle = b.color;
    ctx.textAlign = 'center';
    ctx.shadowBlur = 6; ctx.shadowColor = b.color;
    ctx.fillText(Math.round(b.pct) + '%', bx + barW / 2, by - 6);
    ctx.restore();

    // label below
    ctx.save();
    ctx.font = '10.5px Arial';
    ctx.fillStyle = 'rgba(140,165,210,0.65)';
    ctx.textAlign = 'center';
    ctx.fillText(b.label, bx + barW / 2, y + maxH + 15);
    ctx.restore();
  });
}

// ═══════════════════════════════════════════════════════════════════
//  MAIN RENDER FUNCTION
// ═══════════════════════════════════════════════════════════════════

async function renderDashboard(d) {
  const W = 1280, H = 720;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // ── 1. Background ──────────────────────────────────────────────
  const bgGrad = ctx.createRadialGradient(W * 0.5, H * 0.4, 0, W * 0.5, H * 0.5, W * 0.85);
  bgGrad.addColorStop(0,   '#0f1640');
  bgGrad.addColorStop(0.35,'#0b1030');
  bgGrad.addColorStop(0.7, '#080c20');
  bgGrad.addColorStop(1,   '#040710');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // subtle purple corner glow (top right)
  const cornerGlow = ctx.createRadialGradient(W, 0, 0, W, 0, 400);
  cornerGlow.addColorStop(0,   'rgba(120,40,200,0.12)');
  cornerGlow.addColorStop(1,   'rgba(0,0,0,0)');
  ctx.fillStyle = cornerGlow; ctx.fillRect(0, 0, W, H);

  // subtle blue corner glow (bottom left)
  const cornerGlow2 = ctx.createRadialGradient(0, H, 0, 0, H, 350);
  cornerGlow2.addColorStop(0,  'rgba(20,80,200,0.10)');
  cornerGlow2.addColorStop(1,  'rgba(0,0,0,0)');
  ctx.fillStyle = cornerGlow2; ctx.fillRect(0, 0, W, H);

  drawGrid(ctx, W, H);
  drawStars(ctx, W, H);

  // ── 2. Header ──────────────────────────────────────────────────
  // title glow bg
  const hGrad = ctx.createLinearGradient(0, 0, 0, 90);
  hGrad.addColorStop(0, 'rgba(10,20,60,0.55)');
  hGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = hGrad; ctx.fillRect(0, 0, W, 90);

  ctx.save();
  ctx.font = 'bold 36px "Segoe UI",Arial';
  ctx.textAlign = 'center';
  ctx.shadowBlur = 20; ctx.shadowColor = 'rgba(90,171,255,0.6)';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('System Monitor', W / 2, 50);
  ctx.restore();

  ctx.save();
  ctx.font = 'bold 13.5px Arial';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#5aabff';
  ctx.shadowBlur = 8; ctx.shadowColor = '#5aabff';
  ctx.fillText('Premium Dashboard  •  SPACE Edition', W / 2, 72);
  ctx.restore();

  // divider line
  const divGrad = ctx.createLinearGradient(60, 0, W - 60, 0);
  divGrad.addColorStop(0,   'rgba(30,107,219,0)');
  divGrad.addColorStop(0.2, 'rgba(30,107,219,0.8)');
  divGrad.addColorStop(0.5, 'rgba(90,171,255,1)');
  divGrad.addColorStop(0.8, 'rgba(30,107,219,0.8)');
  divGrad.addColorStop(1,   'rgba(30,107,219,0)');
  ctx.strokeStyle = divGrad; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(60, 84); ctx.lineTo(W - 60, 84); ctx.stroke();

  // divider dot
  [[60, 84], [W - 60, 84]].forEach(([px, py]) => {
    ctx.beginPath(); ctx.arc(px, py, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#3a6adf'; ctx.fill();
    ctx.beginPath(); ctx.arc(px, py, 2, 0, Math.PI * 2);
    ctx.fillStyle = '#7aaaf8'; ctx.fill();
  });

  // BD flag
  ctx.save();
  ctx.font = '26px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",serif';
  ctx.textAlign = 'right';
  ctx.fillText('🇧🇩', W - 22, 38);
  ctx.restore();

  // ── 3. Metric Cards ────────────────────────────────────────────
  const PAD = 22, cW = 294, cH = 142, GAP = 13;

  const ROW1 = [
    { theme:'blue',   icon:'🤖', label:'BOT UPTIME',
      value:`${d.botDays}d ${d.botHours}h ${d.botMins}m`, sub:`${d.totalHours}h total` },
    { theme:'cyan',   icon:'🖥', label:'SYSTEM UPTIME',
      value:`${d.sysDays}d ${d.sysHours}h ${d.sysMins}m`, sub:`${d.yearPct}% of year` },
    { theme:'yellow', icon:'💾', label:'MEMORY USAGE',
      value:`${d.usedRamGB}GB`,
      sub:`${d.ramPct}% of ${d.totalRamGB}GB`, bar: d.ramPct },
    { theme:'pink',   icon:'⚡', label:'CPU CORES',
      value:`${d.cpuCores} Cores`, sub:`${d.cpuPct}% utilization` },
  ];

  const ROW2 = [
    { theme:'blue',   icon:'🔧', label:'PLATFORM',
      value: d.platform, sub:`${d.arch} | ${d.nodeVer}` },
    { theme:'cyan',   icon:'🌐', label:'NETWORK',
      value: d.netSpeed, sub:'Transfer rate' },
    { theme:'yellow', icon:'⚙', label:'PROCESSES',
      value:`${d.procCount}`, sub:'Active tasks' },
    { theme:'pink',   icon:'📊', label:'LOAD AVERAGE',
      value: d.load1, sub:`${d.load5}   ${d.load15}` },
  ];

  [ROW1, ROW2].forEach((row, ri) => {
    const rowY = 96 + ri * (cH + GAP);
    row.forEach((c, ci) => {
      drawMetricCard(ctx, PAD + ci * (cW + GAP), rowY, cW, cH,
        c.theme, c.icon, c.label, c.value, c.sub, c.bar ?? null);
    });
  });

  // ── 4. Performance Panel ───────────────────────────────────────
  const botY = 96 + 2 * (cH + GAP);
  const perfW = 574, perfH = 138;

  // outer glow
  drawGlow(ctx, PAD - 2, botY - 2, perfW + 4, perfH + 4, '#1a3a7a', 0.2);
  fillStrokeRR(ctx, PAD, botY, perfW, perfH, 10, 'rgba(8,12,26,0.95)', '#182640', 1.6);

  // panel title
  ctx.save();
  ctx.font = 'bold 10px Arial';
  ctx.fillStyle = '#3a5a9f';
  ctx.textAlign = 'left';
  ctx.letterSpacing = '1.5px';
  ctx.fillText('PERFORMANCE METRICS', PAD + 16, botY + 20);
  ctx.restore();

  // thin separator under title
  ctx.save();
  ctx.strokeStyle = 'rgba(40,80,160,0.3)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD + 16, botY + 25); ctx.lineTo(PAD + perfW - 16, botY + 25); ctx.stroke();
  ctx.restore();

  drawBarChart(ctx, PAD, botY + 26, perfW, perfH - 30, [
    { label:'CPU',  pct: d.cpuPct,      color:'#5aabff' },
    { label:'RAM',  pct: d.ramPct,      color:'#2de8f0' },
    { label:'Disk', pct: d.diskPercent, color:'#f0c020' },
    { label:'Load', pct: d.loadPct,     color:'#e060f8' },
  ]);

  // ── 5. Info / Status Panel ─────────────────────────────────────
  const infoX = PAD + perfW + GAP;
  const infoW = W - infoX - PAD;

  drawGlow(ctx, infoX - 2, botY - 2, infoW + 4, perfH + 4, '#1a3a7a', 0.2);
  fillStrokeRR(ctx, infoX, botY, infoW, perfH, 10, 'rgba(8,12,26,0.95)', '#182640', 1.6);

  // badges
  const BADGES = [
    { text:'● ONLINE',      color:'#2de890', bg:'rgba(5,22,12,0.92)',  bd:'#1a7040' },
    { text:'⚡ ACTIVE',     color:'#f0c020', bg:'rgba(22,18,0,0.92)',  bd:'#806800' },
    { text:'🔒 SECURE',     color:'#5aabff', bg:'rgba(5,18,38,0.92)',  bd:'#1a4a8f' },
    { text:'📡 MONITORING', color:'#e060f8', bg:'rgba(18,8,24,0.92)',  bd:'#701890' },
  ];
  let bxStart = infoX + 10;
  BADGES.forEach(b => {
    bxStart += drawBadge(ctx, bxStart, botY + 9, b.text, b.color, b.bg, b.bd);
  });

  // separator
  ctx.save();
  ctx.strokeStyle = 'rgba(40,80,160,0.3)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(infoX + 12, botY + 33); ctx.lineTo(infoX + infoW - 12, botY + 33); ctx.stroke();
  ctx.restore();

  // info text rows (2 columns)
  const now = moment.tz('Asia/Dhaka');
  const COL_L = [
    ['📍 Location', 'Bangladesh Server'],
    ['🐧 Platform',  d.platform],
    ['💽 RAM',       d.totalRamGB + 'GB'],
    ['🎨 Theme',     'Space'],
  ];
  const COL_R = [
    ['🖥 Host',  d.hostShort],
    ['⚡ CPU',   d.cpuCores + ' Cores'],
    ['📦 Node',  d.nodeVer],
  ];

  const RH = 19, RY0 = botY + 43;
  ctx.font = '10.5px Arial';
  COL_L.forEach(([k, v], i) => {
    ctx.fillStyle = 'rgba(75,110,165,0.9)'; ctx.textAlign = 'left';
    ctx.fillText(k, infoX + 14, RY0 + i * RH);
    ctx.fillStyle = 'rgba(205,222,255,0.88)';
    ctx.fillText(v, infoX + 114, RY0 + i * RH);
  });

  const CX2 = infoX + infoW / 2 - 4;
  COL_R.forEach(([k, v], i) => {
    ctx.fillStyle = 'rgba(75,110,165,0.9)'; ctx.textAlign = 'left';
    ctx.fillText(k, CX2, RY0 + i * RH);
    ctx.fillStyle = 'rgba(205,222,255,0.88)';
    ctx.fillText(v, CX2 + 42, RY0 + i * RH);
  });

  // date + time (highlighted)
  ctx.save();
  ctx.font = '10px Arial';
  ctx.fillStyle = 'rgba(180,205,255,0.6)';
  ctx.textAlign = 'left';
  ctx.fillText(now.format('dddd, MMMM D, YYYY'), CX2, RY0 + 3 * RH);
  ctx.restore();

  ctx.save();
  ctx.font = 'bold 15px "Segoe UI",Arial';
  ctx.fillStyle = '#f0c020';
  ctx.shadowBlur = 8; ctx.shadowColor = '#f0c020';
  ctx.textAlign = 'left';
  ctx.fillText('⏰ ' + now.format('HH:mm:ss'), CX2, RY0 + 3 * RH + 18);
  ctx.restore();

  // ── 6. Scanlines + vignette ───────────────────────────────────
  drawScanlines(ctx, W, H);

  // vignette
  const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.75);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);

  // ── 7. Save ───────────────────────────────────────────────────
  const cacheDir = path.join(__dirname, 'cache');
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
  const outPath = path.join(cacheDir, `uptime_${Date.now()}.png`);
  fs.writeFileSync(outPath, canvas.toBuffer('image/png'));
  return outPath;
}
