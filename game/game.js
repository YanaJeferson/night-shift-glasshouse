(() => {
  'use strict';

  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const W = 1280, H = 720;
  const keys = new Set();
  const TAU = Math.PI * 2;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const mix = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  let dpr = 1, scale = 1, ox = 0, oy = 0;
  let pointer = { x: 0, y: 0, inside: false };
  let last = performance.now(), elapsed = 0, frame = 0;
  let audio = null, muted = false;
  let toast = { text: 'KEEP IT QUIET. GET THE RELIC. GET OUT.', until: 5.2, kind: 'info' };
  let helpOpen = false;
  let state;

  const room = { x: 66, y: 150, w: 1148, h: 486 };
  const solid = [
    { x: 185, y: 253, w: 126, h: 75, kind: 'case', label: 'ARCHIVE 01' },
    { x: 335, y: 437, w: 145, h: 68, kind: 'case', label: 'SCULPTURE' },
    { x: 472, y: 237, w: 216, h: 82, kind: 'case', label: 'GLASS GALLERY' },
    { x: 670, y: 446, w: 166, h: 68, kind: 'case', label: 'PLINTHS' },
    { x: 814, y: 210, w: 174, h: 26, kind: 'wall', label: '' },
    { x: 834, y: 210, w: 25, h: 104, kind: 'wall', label: '' },
    { x: 989, y: 210, w: 25, h: 105, kind: 'wall', label: '' },
    { x: 1100, y: 420, w: 56, h: 100, kind: 'case', label: 'PLINTH' },
    { x: 565, y: 541, w: 18, h: 55, kind: 'pillar', label: '' },
    { x: 749, y: 343, w: 18, h: 52, kind: 'pillar', label: '' },
    { x: 299, y: 178, w: 21, h: 25, kind: 'pillar', label: '' },
  ];
  const patrols = [
    [{ x: 385, y: 355 }, { x: 385, y: 213 }, { x: 427, y: 213 }, { x: 427, y: 355 }],
    [{ x: 725, y: 390 }, { x: 620, y: 407 }, { x: 620, y: 538 }, { x: 862, y: 538 }, { x: 862, y: 407 }],
    [{ x: 1057, y: 344 }, { x: 1057, y: 507 }, { x: 913, y: 507 }, { x: 913, y: 344 }],
  ];

  function freshState() {
    return {
      player: { x: 133, y: 544, vx: 0, vy: 0, face: -0.35, crouch: false, carrying: false, step: 0 },
      guards: patrols.map((route, i) => ({
        x: route[0].x, y: route[0].y, route, target: 1, pace: i === 1 ? 45 : 37,
        face: i === 0 ? -Math.PI / 2 : 0.12, state: 'patrol', suspicious: 0,
        investigate: null, offset: i * 0.7, label: ['MORRIS', 'VALE', 'ROOK'][i]
      })),
      cameras: [
        { x: 724, y: 172, base: Math.PI / 2, sweep: 0.7, phase: 0.4, range: 236 },
        { x: 1065, y: 172, base: Math.PI / 2, sweep: 0.64, phase: 2.7, range: 205 },
        { x: 1137, y: 386, base: Math.PI, sweep: 0.62, phase: 4.2, range: 182 },
      ],
      decoys: [], alarm: 0, lootTaken: false, status: 'playing', time: 0,
      objective: 'STEAL THE ORCHID RELIC', caughtBy: '', hintFlash: 0,
    };
  }
  state = freshState();

  function resize() {
    const ww = window.innerWidth, wh = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    scale = Math.min(ww / W, wh / H);
    ox = (ww - W * scale) / 2; oy = (wh - H * scale) / 2;
    canvas.width = Math.round(W * dpr * scale); canvas.height = Math.round(H * dpr * scale);
    canvas.style.width = `${W * scale}px`; canvas.style.height = `${H * scale}px`;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);
  }
  window.addEventListener('resize', resize, { passive: true });
  resize();

  function screenPoint(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
  }
  canvas.addEventListener('pointermove', e => { pointer = { ...screenPoint(e), inside: true }; });
  canvas.addEventListener('pointerleave', () => { pointer.inside = false; });
  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const p = screenPoint(e);
    if (helpOpen) { helpOpen = false; return; }
    if (state.status !== 'playing') { reset(); return; }
    if (p.y > 18 && p.y < 70 && p.x > 1118) { muted = !muted; tone(muted ? 180 : 520, 0.07, 0.035); return; }
    if (p.x < 70 || p.x > 1215 || p.y < 150 || p.y > 632) return;
    if (state.decoys.filter(d => d.until > state.time).length >= 2) return;
    state.decoys.push({ x: p.x, y: p.y, born: state.time, until: state.time + 3.6 });
    state.guards.forEach(g => { if (dist(g, p) < 390) { g.investigate = { x: p.x, y: p.y }; g.state = 'investigate'; } });
    tone(720, 0.06, 0.045); setToast('DISTRACTION AWAY. MOVE NOW.', 'info', 1.5);
  });
  window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    keys.add(k);
    if (k === 'r') reset();
    if (k === '?' || (k === '/' && e.shiftKey)) helpOpen = !helpOpen;
    if (k === 'escape') helpOpen = false;
    if (k === 'e' && state.status === 'playing') interact();
  });
  window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());

  function tone(freq, duration = 0.08, volume = 0.04, type = 'sine') {
    if (muted) return;
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, audio.currentTime);
      g.gain.setValueAtTime(volume, audio.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duration);
      o.connect(g); g.connect(audio.destination); o.start(); o.stop(audio.currentTime + duration);
    } catch (_) { /* sound is optional */ }
  }
  function setToast(text, kind = 'info', seconds = 2.2) { toast = { text, kind, until: state.time + seconds }; }
  function reset() { state = freshState(); helpOpen = false; setToast('KEEP IT QUIET. GET THE RELIC. GET OUT.', 'info', 5.2); tone(420, 0.08, 0.025); }

  function circleRect(x, y, r, b) {
    const nx = clamp(x, b.x, b.x + b.w), ny = clamp(y, b.y, b.y + b.h);
    return (x - nx) ** 2 + (y - ny) ** 2 < r ** 2;
  }
  function blocked(a, b) {
    const n = Math.max(2, Math.ceil(dist(a, b) / 12));
    for (let i = 1; i < n; i++) {
      const t = i / n, x = mix(a.x, b.x, t), y = mix(a.y, b.y, t);
      if (solid.some(box => x >= box.x - 2 && x <= box.x + box.w + 2 && y >= box.y - 2 && y <= box.y + box.h + 2)) return true;
    }
    return false;
  }
  function inCone(origin, angle, range, halfAngle, target, radius = 0) {
    const dx = target.x - origin.x, dy = target.y - origin.y, d = Math.hypot(dx, dy);
    if (d > range + radius || d < 1) return false;
    const diff = Math.atan2(Math.sin(Math.atan2(dy, dx) - angle), Math.cos(Math.atan2(dy, dx) - angle));
    return Math.abs(diff) < halfAngle + Math.asin(Math.min(1, radius / d));
  }
  function moveActor(actor, vx, vy, dt, radius, speed) {
    const startX = actor.x, startY = actor.y;
    const mag = Math.hypot(vx, vy) || 1; vx = vx / mag * speed; vy = vy / mag * speed;
    const nx = clamp(actor.x + vx * dt, room.x + 17, room.x + room.w - 17);
    if (!solid.some(box => circleRect(nx, actor.y, radius, box))) actor.x = nx;
    const ny = clamp(actor.y + vy * dt, room.y + 29, room.y + room.h - 20);
    if (!solid.some(box => circleRect(actor.x, ny, radius, box))) actor.y = ny;
    return actor.x !== startX || actor.y !== startY;
  }

  function update(dt) {
    elapsed += dt; frame++;
    if (state.status !== 'playing' || helpOpen) return;
    state.time += dt;
    const p = state.player;
    const ix = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
    const iy = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0);
    p.crouch = keys.has('shift');
    const speed = p.crouch ? 66 : 112;
    const moving = Math.hypot(ix, iy) > 0;
    if (moving) {
      p.face = Math.atan2(iy, ix); p.step += dt * (p.crouch ? 5 : 9);
      moveActor(p, ix, iy, dt, 10, speed);
    }
    p.vx = moving ? ix : 0; p.vy = moving ? iy : 0;

    for (const d of state.decoys) {
      if (d.until < state.time) continue;
      d.phase = (state.time - d.born) * 3;
    }
    for (const g of state.guards) {
      let target = g.investigate;
      if (!target) {
        const q = g.route[g.target];
        const d = Math.hypot(q.x - g.x, q.y - g.y);
        if (d < 7) { g.target = (g.target + 1) % g.route.length; }
        else {
          const a = Math.atan2(q.y - g.y, q.x - g.x); g.face = a;
          if (!moveActor(g, Math.cos(a), Math.sin(a), dt, 8, g.pace)) g.target = (g.target + 1) % g.route.length;
          if (Math.random() < 0.002) g.face += (Math.random() - 0.5) * 0.1;
        }
      } else {
        const d = Math.hypot(target.x - g.x, target.y - g.y);
        if (d < 11) { g.investigate = null; g.state = 'patrol'; }
        else {
          const a = Math.atan2(target.y - g.y, target.x - g.x); g.face = a;
          if (!moveActor(g, Math.cos(a), Math.sin(a), dt, 8, 55)) { g.investigate = null; g.state = 'patrol'; }
        }
      }
      const reach = p.crouch ? 148 : 256;
      const sees = inCone(g, g.face, reach, p.crouch ? 0.42 : 0.61, p, 9) && !blocked(g, p);
      if (sees) {
        g.suspicious = clamp(g.suspicious + dt * (p.crouch ? 0.22 : 0.44), 0, 1);
        state.alarm = clamp(state.alarm + dt * (p.crouch ? 3.0 : 7.2), 0, 100);
        if (g.suspicious > 0.38) g.state = 'alert';
        if (g.suspicious > 0.82) { g.investigate = { x: p.x, y: p.y }; g.state = 'hunt'; }
      } else {
        g.suspicious = Math.max(0, g.suspicious - dt * 0.22);
        if (g.state === 'alert' && g.suspicious < 0.12) g.state = g.investigate ? 'investigate' : 'patrol';
        if (g.state === 'hunt' && g.suspicious < 0.12) { g.investigate = null; g.state = 'patrol'; }
      }
    }

    for (const c of state.cameras) {
      const angle = c.base + Math.sin(state.time * 0.62 + c.phase) * c.sweep;
      c.angle = angle;
      const sees = inCone(c, angle, c.range, 0.36, p, 7) && !blocked(c, p);
      if (sees) state.alarm = clamp(state.alarm + dt * (p.crouch ? 2.3 : 5.6), 0, 100);
    }
    if (state.alarm > 0) state.alarm = Math.max(0, state.alarm - dt * (state.alarm > 78 ? 0.5 : 1.7));
    if (state.alarm >= 100) { state.status = 'caught'; state.caughtBy = state.guards.find(g => g.state === 'hunt')?.label || 'THE SECURITY SYSTEM'; setToast('OPERATION BLOWN.', 'danger', 99); tone(110, 0.45, 0.08, 'sawtooth'); }

    if (state.lootTaken && dist(p, { x: 132, y: 545 }) < 44) {
      state.status = 'won'; setToast('CLEAN GETAWAY. THE ORCHID IS YOURS.', 'success', 99); tone(740, 0.16, 0.05); setTimeout(() => tone(980, 0.24, 0.035), 100);
    }
    if (state.alarm > 68 && state.time - state.hintFlash > 4) { state.hintFlash = state.time; setToast('EYES ON YOU. BREAK LINE OF SIGHT.', 'danger', 1.4); }
  }

  function interact() {
    if (!state || state.status !== 'playing') return;
    const p = state.player, relic = { x: 925, y: 372 };
    if (!state.lootTaken && dist(p, relic) < 49) {
      state.lootTaken = true; p.carrying = true; state.objective = 'RETURN TO THE EXTRACTION DOOR';
      state.alarm = Math.max(state.alarm, 12); setToast('ORCHID SECURED. EXTRACT AT THE SOUTH-WEST DOOR.', 'success', 3.2);
      tone(330, 0.08, 0.035); setTimeout(() => tone(500, 0.1, 0.03), 85); return;
    }
    if (!state.lootTaken) setToast('GET CLOSER TO THE RELIC. PRESS E TO LIFT.', 'info', 1.6);
    else if (dist(p, { x: 132, y: 545 }) >= 44) setToast('EXTRACTION IS THE GREEN DOOR BY THE ENTRANCE.', 'info', 1.6);
  }

  function rr(x, y, w, h, r, fill, stroke) {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }
  function line(x1, y1, x2, y2, color, width = 1, dash = []) {
    ctx.beginPath(); ctx.setLineDash(dash); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(); ctx.setLineDash([]);
  }
  function text(str, x, y, size, color, weight = 500, align = 'left', family = 'Inter, ui-sans-serif, system-ui, sans-serif') {
    ctx.font = `${weight} ${size}px ${family}`; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillStyle = color; ctx.fillText(str, x, y);
  }
  function glow(x, y, radius, color, alpha = 0.2) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, color.replace('ALPHA', String(alpha))); g.addColorStop(1, color.replace('ALPHA', '0'));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU); ctx.fill();
  }

  function drawBackdrop() {
    const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#0a1113'); bg.addColorStop(1, '#080d0f');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(92, 166, 150, .025)';
    for (let x = 22; x < W; x += 40) for (let y = 16; y < H; y += 40) { ctx.beginPath(); ctx.arc(x, y, 1, 0, TAU); ctx.fill(); }
    // Header
    rr(34, 20, 30, 30, 9, '#a9edc9');
    ctx.save(); ctx.translate(49, 35); ctx.rotate(Math.PI / 4); ctx.strokeStyle = '#12241c'; ctx.lineWidth = 2.2; ctx.strokeRect(-6, -6, 12, 12); ctx.restore();
    text('NIGHT', 76, 29, 10, '#9ba9a4', 800); text('SHIFT', 76, 42, 10, '#9ba9a4', 800);
    text('THE GLASSHOUSE JOB', 148, 30, 17, '#ecf0e7', 750);
    text('MUSEUM OF MODERN ART  /  00:43 AM', 149, 49, 9, '#70817a', 650, 'left', 'ui-monospace, SFMono-Regular, Menlo, monospace');
    rr(431, 23, 145, 26, 13, '#151f20', '#273535');
    ctx.fillStyle = '#a7edc5'; ctx.beginPath(); ctx.arc(447, 36, 3, 0, TAU); ctx.fill();
    text('OPERATION LIVE', 458, 36, 9, '#bdd3c7', 750, 'left', 'ui-monospace, SFMono-Regular, Menlo, monospace');
    rr(1130, 22, 116, 28, 14, '#141d1e', '#2a3736');
    ctx.fillStyle = '#e8c780'; ctx.beginPath(); ctx.arc(1147, 36, 4, 0, TAU); ctx.fill();
    text('SHIFT 04', 1158, 36, 9, '#b9c4bb', 750, 'left', 'ui-monospace, SFMono-Regular, Menlo, monospace');

    text('OBJECTIVE', 36, 83, 8, '#788a82', 800, 'left', 'ui-monospace, SFMono-Regular, Menlo, monospace');
    text(state.lootTaken ? 'GET TO EXTRACTION' : 'LIFT THE ORCHID RELIC', 36, 101, 12, state.lootTaken ? '#a7edc5' : '#e7e9df', 750);
    const obj = state.lootTaken ? 'The south-west service door is your way out.' : 'Find the display. Keep your profile out of the light.';
    text(obj, 242, 101, 10, '#87938c', 500);
    // Alarm HUD
    text('ALARM', 1010, 80, 8, '#84918a', 800, 'left', 'ui-monospace, SFMono-Regular, Menlo, monospace');
    const level = state.alarm / 100;
    const alarmColor = level > 0.68 ? '#ff6f5f' : level > 0.35 ? '#e4b65e' : '#70c7a5';
    rr(1010, 91, 190, 10, 5, '#1a2424');
    if (level > 0.001) rr(1010, 91, 190 * level, 10, 5, alarmColor);
    text(level > .7 ? 'CRITICAL' : level > .34 ? 'ELEVATED' : 'LOW', 1207, 96, 8, level > .68 ? '#ff8477' : '#93a198', 750, 'right', 'ui-monospace, SFMono-Regular, Menlo, monospace');
    // Sound toggle
    rr(1213, 73, 31, 28, 8, '#111a1b', '#253333');
    text(muted ? '×' : '♪', 1228, 87, 15, muted ? '#76847d' : '#b8c8bf', 700, 'center');
  }

  function drawMap() {
    // Frame and floor
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 9;
    rr(32, 119, 1216, 528, 18, '#111b1c', '#263433'); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.roundRect(room.x, room.y, room.w, room.h, 12); ctx.clip();
    const floor = ctx.createLinearGradient(room.x, room.y, room.x, room.y + room.h); floor.addColorStop(0, '#1e2927'); floor.addColorStop(.55, '#1a2423'); floor.addColorStop(1, '#17211f');
    ctx.fillStyle = floor; ctx.fillRect(room.x, room.y, room.w, room.h);
    // polished floor panels
    for (let x = room.x + 8; x < room.x + room.w; x += 76) {
      ctx.fillStyle = ((Math.floor(x / 76) % 2) ? 'rgba(154,191,170,.018)' : 'rgba(0,0,0,.025)'); ctx.fillRect(x, room.y, 38, room.h);
      line(x, room.y + 2, x, room.y + room.h - 2, 'rgba(193,216,195,.035)', 1);
    }
    for (let y = room.y + 20; y < room.y + room.h; y += 68) line(room.x + 2, y, room.x + room.w - 2, y, 'rgba(193,216,195,.025)', 1);
    // Broad pools of warm gallery lighting
    glow(313, 276, 180, 'rgba(211,181,112,ALPHA)', .08); glow(575, 376, 225, 'rgba(138,196,165,ALPHA)', .075); glow(927, 380, 210, 'rgba(211,181,112,ALPHA)', .07);
    ctx.restore();

    // Outer gallery wall and subtle window bays
    rr(room.x, room.y, room.w, room.h, 12, null, '#53615a');
    ctx.strokeStyle = 'rgba(215,223,197,.12)'; ctx.lineWidth = 3;
    for (const x of [220, 463, 714, 967]) { ctx.beginPath(); ctx.moveTo(x, 151); ctx.lineTo(x + 78, 151); ctx.stroke(); }
    // Zone titles
    text('WEST WING', 98, 174, 8, 'rgba(191,205,192,.38)', 800, 'left', 'ui-monospace, SFMono-Regular, Menlo, monospace');
    text('SCULPTURE HALL', 505, 174, 8, 'rgba(191,205,192,.38)', 800, 'left', 'ui-monospace, SFMono-Regular, Menlo, monospace');
    text('THE GLASSHOUSE', 847, 174, 8, 'rgba(191,205,192,.38)', 800, 'left', 'ui-monospace, SFMono-Regular, Menlo, monospace');

    // Emergency exit marker / extraction
    const exitGlow = state.lootTaken ? .24 : .09;
    glow(131, 547, 62, 'rgba(117,227,174,ALPHA)', exitGlow);
    rr(85, 524, 87, 47, 10, '#172923', state.lootTaken ? '#79d7aa' : '#42574e');
    rr(94, 531, 68, 32, 6, '#202f2b', '#3b574b');
    ctx.fillStyle = state.lootTaken ? '#92efb9' : '#667e71'; ctx.beginPath(); ctx.arc(111, 547, 4, 0, TAU); ctx.fill();
    text('EXIT', 128, 546, 9, state.lootTaken ? '#b0f4ca' : '#a6b2a9', 800, 'center', 'ui-monospace, SFMono-Regular, Menlo, monospace');
    text('SERVICE', 128, 585, 7, '#687a70', 700, 'center', 'ui-monospace, SFMono-Regular, Menlo, monospace');

    // Glass cases and walls
    for (const b of solid) drawObstacle(b);
    // Security desk
    rr(84, 217, 73, 51, 8, '#222d2a', '#58645a');
    rr(91, 224, 59, 23, 5, '#172120', '#3a4b45');
    for (let i = 0; i < 4; i++) { ctx.fillStyle = i === 2 ? '#dcae63' : '#5b9480'; ctx.fillRect(97 + i * 11, 231, 6, 3); }
    text('SECURITY', 120, 257, 7, '#819087', 700, 'center', 'ui-monospace, SFMono-Regular, Menlo, monospace');

    // Light pools from cameras and guard cones
    for (const c of state.cameras) drawCone(c, c.angle || c.base, 0.36, c.range, 'rgba(231,190,107,.105)');
    for (const g of state.guards) drawCone(g, g.face, g.state === 'alert' || g.state === 'hunt' ? .7 : .58,
      state.player.crouch ? 148 : 256, g.state === 'alert' || g.state === 'hunt' ? 'rgba(245,97,82,.17)' : 'rgba(227,174,94,.115)');

    // Mark a loose, dashed route between entry and target
    ctx.save(); ctx.globalAlpha = .28; ctx.strokeStyle = '#91cfaa'; ctx.lineWidth = 1.2; ctx.setLineDash([4, 7]);
    ctx.beginPath(); ctx.moveTo(164, 544); ctx.bezierCurveTo(281, 574, 322, 370, 485, 367); ctx.bezierCurveTo(650, 362, 741, 387, 880, 372); ctx.stroke(); ctx.setLineDash([]); ctx.restore();

    // Loot plinth / relic
    drawRelic();
    // Distractions
    for (const d of state.decoys) if (d.until > state.time) {
      const a = 1 - (state.time - d.born) / (d.until - d.born);
      for (let i = 0; i < 3; i++) {
        const r = ((state.time - d.born) * 34 + i * 21) % 68;
        ctx.beginPath(); ctx.arc(d.x, d.y, r, 0, TAU); ctx.strokeStyle = `rgba(154,224,195,${a * (1 - r / 75) * .54})`; ctx.lineWidth = 1.5; ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(d.x, d.y, 4, 0, TAU); ctx.fillStyle = `rgba(179,241,207,${a})`; ctx.fill();
    }
    // Camera units and guards
    for (const c of state.cameras) drawCamera(c);
    for (const g of state.guards) drawGuard(g);
    drawPlayer(state.player);
    drawMissionPins();
    // Map scale and objective marker
    rr(1063, 585, 121, 25, 7, 'rgba(14,21,20,.78)', '#36453f');
    text('FLOOR 01   /   EAST', 1123, 598, 8, '#85958b', 750, 'center', 'ui-monospace, SFMono-Regular, Menlo, monospace');
    // vignette to keep the floor cinematic
    const v = ctx.createRadialGradient(637, 384, 230, 637, 384, 710); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.24)');
    ctx.fillStyle = v; ctx.beginPath(); ctx.roundRect(room.x, room.y, room.w, room.h, 12); ctx.fill();
  }

  function drawCone(o, angle, half, range, color) {
    const start = angle - half, end = angle + half;
    ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.arc(o.x, o.y, range, start, end); ctx.closePath();
    ctx.fillStyle = color; ctx.fill();
    ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(o.x + Math.cos(start) * range, o.y + Math.sin(start) * range); ctx.moveTo(o.x, o.y); ctx.lineTo(o.x + Math.cos(end) * range, o.y + Math.sin(end) * range);
    ctx.strokeStyle = color.replace(/\.\d+\)/, '.4)'); ctx.lineWidth = 1; ctx.stroke();
  }

  function drawObstacle(b) {
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.24)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 5;
    if (b.kind === 'case') {
      rr(b.x, b.y, b.w, b.h, 9, '#273230', '#59655c');
      rr(b.x + 5, b.y + 5, b.w - 10, b.h - 10, 6, '#303c37', '#657269');
      ctx.restore();
      ctx.save(); ctx.globalAlpha = .7;
      const g = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h); g.addColorStop(0, 'rgba(215,229,201,.05)'); g.addColorStop(.45, 'rgba(182,216,191,.16)'); g.addColorStop(1, 'rgba(215,229,201,.02)');
      rr(b.x + 7, b.y + 7, b.w - 14, b.h - 14, 4, g, 'rgba(180,202,184,.2)');
      line(b.x + 13, b.y + 13, b.x + b.w - 17, b.y + 13, 'rgba(221,230,205,.23)', 1);
      if (b.label) text(b.label, b.x + b.w / 2, b.y + b.h / 2 + 6, 6.5, 'rgba(183,197,181,.5)', 700, 'center', 'ui-monospace, SFMono-Regular, Menlo, monospace');
      ctx.restore(); return;
    }
    if (b.kind === 'wall') {
      rr(b.x, b.y, b.w, b.h, 2, '#52605a', '#819085');
      line(b.x + 4, b.y + 4, b.x + b.w - 4, b.y + 4, 'rgba(234,240,213,.28)', 1); ctx.restore(); return;
    }
    rr(b.x, b.y, b.w, b.h, 5, '#52605a', '#77847b'); ctx.restore();
  }

  function drawRelic() {
    const x = 925, y = 372, pulse = (Math.sin(elapsed * 2.2) + 1) / 2;
    if (!state.lootTaken) {
      glow(x, y, 95 + pulse * 18, 'rgba(238,194,102,ALPHA)', .14 + pulse * .05);
      rr(x - 35, y + 20, 70, 20, 4, '#382d21', '#9b8157');
      rr(x - 31, y + 17, 62, 15, 4, '#4b3b28', '#c4a56a');
      // cut crystal shape
      ctx.save(); ctx.translate(x, y - 2); ctx.rotate(Math.PI / 4);
      ctx.shadowColor = 'rgba(255,218,139,.5)'; ctx.shadowBlur = 17;
      ctx.fillStyle = '#efd899'; ctx.beginPath(); ctx.moveTo(0, -17); ctx.lineTo(12, -3); ctx.lineTo(7, 13); ctx.lineTo(-7, 13); ctx.lineTo(-12, -3); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = '#b98254'; ctx.beginPath(); ctx.moveTo(0, -17); ctx.lineTo(0, 11); ctx.lineTo(-7, 13); ctx.lineTo(-12, -3); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,248,209,.8)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, -17); ctx.lineTo(0, 11); ctx.moveTo(-12, -3); ctx.lineTo(12, -3); ctx.stroke(); ctx.restore();
      rr(x - 48, y + 48, 96, 19, 9, '#28251d', '#776747'); text('ORCHID RELIC', x, y + 57.5, 7, '#e8d19b', 800, 'center', 'ui-monospace, SFMono-Regular, Menlo, monospace');
    } else {
      rr(x - 35, y + 20, 70, 20, 4, '#312e25', '#706d5c');
      line(x - 22, y - 1, x + 18, y + 6, 'rgba(216,209,174,.52)', 1.4); line(x - 20, y + 5, x + 22, y + 1, 'rgba(216,209,174,.45)', 1.4);
      ctx.beginPath(); ctx.arc(x, y - 8, 27, 0, TAU); ctx.strokeStyle = 'rgba(237,198,110,.23)'; ctx.lineWidth = 1; ctx.stroke();
      rr(x - 43, y + 48, 86, 18, 9, '#252e27', '#4d6553'); text('DISPLAY EMPTY', x, y + 57, 7, '#9bb29d', 800, 'center', 'ui-monospace, SFMono-Regular, Menlo, monospace');
    }
  }

  function drawCamera(c) {
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.angle || c.base);
    rr(-10, -7, 21, 14, 5, '#3b4944', '#829187');
    rr(-2, -4, 8, 8, 4, '#18211f', '#68746d');
    ctx.beginPath(); ctx.arc(2, 0, 2.3, 0, TAU); ctx.fillStyle = '#e7bb71'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(10, -3); ctx.lineTo(20, 0); ctx.lineTo(10, 3); ctx.closePath(); ctx.fillStyle = '#77867d'; ctx.fill();
    ctx.restore();
    text('CAM', c.x, c.y - 15, 6, 'rgba(183,196,187,.72)', 750, 'center', 'ui-monospace, SFMono-Regular, Menlo, monospace');
  }

  function drawGuard(g) {
    const alert = g.state === 'alert' || g.state === 'hunt';
    ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(g.face + Math.PI / 2);
    // ground shadow
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(0, 7, 11, 6, 0, 0, TAU); ctx.fill();
    // body / coat
    ctx.fillStyle = alert ? '#713f37' : '#4b5a54'; ctx.beginPath(); ctx.roundRect(-8, -8, 16, 20, 6); ctx.fill();
    ctx.fillStyle = alert ? '#ff7967' : '#9eb0a3'; ctx.beginPath(); ctx.arc(0, -9, 5.6, 0, TAU); ctx.fill();
    ctx.fillStyle = '#26322d'; ctx.beginPath(); ctx.arc(0, -10, 5.3, Math.PI, TAU); ctx.fill();
    ctx.fillStyle = alert ? '#f17e69' : '#d3c79a'; ctx.beginPath(); ctx.arc(0, 0, 2, 0, TAU); ctx.fill();
    ctx.restore();
    if (alert) { ctx.beginPath(); ctx.arc(g.x, g.y - 22, 4, 0, TAU); ctx.fillStyle = '#ff816c'; ctx.fill(); text('!', g.x, g.y - 21.5, 6, '#321d1a', 900, 'center'); }
    text(g.label, g.x, g.y + 22, 6.5, alert ? '#f1a095' : 'rgba(208,218,204,.66)', 800, 'center', 'ui-monospace, SFMono-Regular, Menlo, monospace');
    if (g.state === 'investigate') {
      ctx.beginPath(); ctx.arc(g.x, g.y - 21, 5, 0, TAU); ctx.fillStyle = '#d9bd78'; ctx.fill();
      text('?', g.x, g.y - 20, 7, '#332c1c', 900, 'center');
    }
  }

  function drawPlayer(p) {
    // subtle stealth/shadow ring
    const moving = Math.hypot(p.vx, p.vy) > 0;
    glow(p.x, p.y, 35, 'rgba(123,213,177,ALPHA)', p.crouch ? .12 : .07);
    ctx.fillStyle = 'rgba(0,0,0,.37)'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 8, 13, 7, 0, 0, TAU); ctx.fill();
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.face + Math.PI / 2);
    if (p.carrying) {
      ctx.fillStyle = '#eacb79'; ctx.beginPath(); ctx.roundRect(-5, -20, 10, 8, 3); ctx.fill();
      ctx.strokeStyle = 'rgba(237,202,121,.55)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, -16, 12, 0, TAU); ctx.stroke();
    }
    ctx.fillStyle = '#55a885'; ctx.beginPath(); ctx.roundRect(-8, -7, 16, 21, 6); ctx.fill();
    ctx.fillStyle = '#16201c'; ctx.beginPath(); ctx.arc(0, -10, 6.4, 0, TAU); ctx.fill();
    ctx.fillStyle = '#b1efcc'; ctx.beginPath(); ctx.arc(0, -10, 5.3, 0, TAU); ctx.fill();
    ctx.fillStyle = '#34463d'; ctx.beginPath(); ctx.arc(0, -12, 5.6, Math.PI, TAU); ctx.fill();
    ctx.fillStyle = '#d9e6d7'; ctx.beginPath(); ctx.arc(0, -5, 2, 0, TAU); ctx.fill();
    // small facing chevron
    ctx.fillStyle = '#9ce1b7'; ctx.beginPath(); ctx.moveTo(-3, -20); ctx.lineTo(0, -25); ctx.lineTo(3, -20); ctx.closePath(); ctx.fill();
    ctx.restore();
    if (moving && !p.crouch && frame % 22 < 3) {
      ctx.beginPath(); ctx.arc(p.x, p.y + 11, 2, 0, TAU); ctx.fillStyle = 'rgba(198,222,204,.4)'; ctx.fill();
    }
    if (p.crouch) {
      ctx.beginPath(); ctx.arc(p.x, p.y, 18, 0, TAU); ctx.strokeStyle = 'rgba(130,224,174,.5)'; ctx.lineWidth = 1; ctx.stroke();
      text('SNEAK', p.x, p.y + 24, 6, '#a3dfb9', 800, 'center', 'ui-monospace, SFMono-Regular, Menlo, monospace');
    }
  }

  function drawMissionPins() {
    if (!state.lootTaken) {
      const pulse = 0.5 + Math.sin(elapsed * 3) * .5;
      ctx.beginPath(); ctx.arc(925, 329, 10 + pulse * 3, 0, TAU); ctx.strokeStyle = `rgba(237,199,119,${.23 + pulse * .26})`; ctx.lineWidth = 1; ctx.stroke();
    }
    if (pointer.inside && pointer.x > room.x && pointer.x < room.x + room.w && pointer.y > room.y && pointer.y < room.y + room.h) {
      ctx.beginPath(); ctx.arc(pointer.x, pointer.y, 10, 0, TAU); ctx.strokeStyle = 'rgba(202,233,210,.33)'; ctx.lineWidth = 1; ctx.stroke();
      line(pointer.x - 14, pointer.y, pointer.x - 5, pointer.y, 'rgba(202,233,210,.4)'); line(pointer.x + 5, pointer.y, pointer.x + 14, pointer.y, 'rgba(202,233,210,.4)');
      line(pointer.x, pointer.y - 14, pointer.x, pointer.y - 5, 'rgba(202,233,210,.4)'); line(pointer.x, pointer.y + 5, pointer.x, pointer.y + 14, 'rgba(202,233,210,.4)');
    }
  }

  function drawFooter() {
    // Objective progress
    const steps = [state.lootTaken, state.status === 'won'];
    rr(33, 660, 1214, 43, 12, '#101819', '#253331');
    text('FIELD NOTES', 51, 681, 8, '#76877e', 850, 'left', 'ui-monospace, SFMono-Regular, Menlo, monospace');
    line(130, 671, 130, 692, '#2a3a35');
    // keycaps
    const caps = (x, label) => { rr(x, 668, 24, 22, 5, '#202b29', '#42504a'); text(label, x + 12, 679, 8, '#c8d3c8', 750, 'center', 'ui-monospace, SFMono-Regular, Menlo, monospace'); };
    caps(148, 'W'); caps(174, 'A'); caps(200, 'S'); caps(226, 'D');
    text('MOVE', 262, 679, 8, '#90a097', 700, 'left', 'ui-monospace, SFMono-Regular, Menlo, monospace');
    caps(311, '⇧'); text('SNEAK', 342, 679, 8, '#90a097', 700, 'left', 'ui-monospace, SFMono-Regular, Menlo, monospace');
    caps(401, 'E'); text('LIFT', 432, 679, 8, '#90a097', 700, 'left', 'ui-monospace, SFMono-Regular, Menlo, monospace');
    rr(476, 668, 24, 22, 5, '#202b29', '#42504a'); ctx.beginPath(); ctx.arc(488, 679, 3.1, 0, TAU); ctx.fillStyle = '#c8d3c8'; ctx.fill();
    text('DISTRACT', 508, 679, 8, '#90a097', 700, 'left', 'ui-monospace, SFMono-Regular, Menlo, monospace');
    // progress at right
    const statusText = state.lootTaken ? 'RELIC ACQUIRED' : 'RELIC NOT SECURED';
    const color = state.lootTaken ? '#92dfb0' : '#bcaa7a';
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(1017, 680, 3, 0, TAU); ctx.fill();
    text(statusText, 1029, 680, 8, color, 800, 'left', 'ui-monospace, SFMono-Regular, Menlo, monospace');
    line(1146, 670, 1146, 690, '#2a3a35'); text('R  RESTART', 1191, 680, 8, '#74847c', 750, 'center', 'ui-monospace, SFMono-Regular, Menlo, monospace');
  }

  function drawToast() {
    if (toast.until < state.time) return;
    const alpha = Math.min(1, (toast.until - state.time) * 2, 1);
    const color = toast.kind === 'danger' ? '#ff8d78' : toast.kind === 'success' ? '#9ae7b9' : '#ccd6ca';
    ctx.save(); ctx.globalAlpha = alpha;
    rr(424, 128, 432, 28, 14, 'rgba(14,22,21,.93)', 'rgba(112,135,121,.42)');
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(444, 142, 3, 0, TAU); ctx.fill();
    text(toast.text, 640, 142, 8, color, 800, 'center', 'ui-monospace, SFMono-Regular, Menlo, monospace');
    ctx.restore();
  }

  function drawOverlay() {
    if (helpOpen) {
      ctx.fillStyle = 'rgba(4,8,8,.72)'; ctx.fillRect(0, 0, W, H);
      rr(370, 199, 540, 326, 20, '#111a19', '#43554a');
      text('THE PLAN', 415, 243, 9, '#9be0b8', 850, 'left', 'ui-monospace, SFMono-Regular, Menlo, monospace');
      text('Steal the Orchid. Leave no trace.', 415, 278, 24, '#eff0e5', 750);
      text('WASD / ARROWS', 415, 332, 10, '#b8c9bd', 800, 'left', 'ui-monospace, SFMono-Regular, Menlo, monospace'); text('Move around the gallery.', 622, 332, 11, '#87978d', 500);
      text('HOLD SHIFT', 415, 370, 10, '#b8c9bd', 800, 'left', 'ui-monospace, SFMono-Regular, Menlo, monospace'); text('Move quietly. Shorter detection range.', 622, 370, 11, '#87978d', 500);
      text('CLICK FLOOR', 415, 408, 10, '#b8c9bd', 800, 'left', 'ui-monospace, SFMono-Regular, Menlo, monospace'); text('Throw a coin to pull nearby guards.', 622, 408, 11, '#87978d', 500);
      text('E', 415, 446, 10, '#b8c9bd', 800, 'left', 'ui-monospace, SFMono-Regular, Menlo, monospace'); text('Lift the Orchid when you are close.', 622, 446, 11, '#87978d', 500);
      text('Press ? or click to return to the job.', 640, 489, 9, '#7f9085', 650, 'center', 'ui-monospace, SFMono-Regular, Menlo, monospace');
      return;
    }
    if (state.status === 'playing') return;
    ctx.fillStyle = 'rgba(5,9,9,.63)'; ctx.fillRect(0, 0, W, H);
    const won = state.status === 'won';
    rr(390, 228, 500, 262, 20, '#111a19', won ? '#5c826c' : '#714b43');
    ctx.fillStyle = won ? '#9be4b7' : '#ff846e'; ctx.beginPath(); ctx.arc(640, 281, 18, 0, TAU); ctx.fill();
    text(won ? '✓' : '!', 640, 281, 18, '#142019', 900, 'center');
    text(won ? 'CLEAN GETAWAY' : 'OPERATION BLOWN', 640, 324, 23, '#f0f1e7', 800, 'center');
    text(won ? 'The Orchid is off the books.' : `${state.caughtBy} raised the alarm. The gallery is locked down.`, 640, 356, 11, '#99aaa0', 500, 'center');
    rr(534, 407, 212, 43, 12, won ? '#253d30' : '#382822', won ? '#648e72' : '#815446');
    text('PRESS R TO RUN IT BACK', 640, 428, 9, won ? '#a8eac0' : '#ffad96', 850, 'center', 'ui-monospace, SFMono-Regular, Menlo, monospace');
  }

  function draw() {
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);
    drawBackdrop(); drawMap(); drawFooter(); drawToast(); drawOverlay();
    // discreet help affordance
    text('?  PLAN', 1211, 13, 7, '#53635b', 750, 'right', 'ui-monospace, SFMono-Regular, Menlo, monospace');
  }
  function tick(now) {
    const dt = Math.min(.033, Math.max(0, (now - last) / 1000)); last = now;
    update(dt); draw(); requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
