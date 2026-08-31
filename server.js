// Route 9 — online multiplayer relay server
// Replaces Firebase Realtime Database (blocked on Iranian internet) with a
// small self-hosted Socket.io server. It still does not (and realistically
// cannot, without porting the whole rule engine here too) validate full
// game legality — that stays in the browser. What it DOES enforce now:
//   - every player's slot is protected by a private reconnect token, so a
//     disconnected slot can only ever be reclaimed by its real owner, never
//     by a stranger who just knows the room code (see joinRoom).
//   - every relayed message carries the TRUE sender slot (`from`), derived
//     from the socket, never from anything the client claims — the browser
//     side now trusts this over any self-declared "playerId" in a payload,
//     which closes the "forge a message as a different player" class of
//     bug (e.g. forcing a stranger's forfeit in 4-player mode).
//   - messages are numbered per room (`seq`) so a client that notices a gap
//     can ask for a fresh snapshot instead of silently drifting out of sync
//     forever.
//   - a light per-socket rate limit, so a compromised/broken client can't
//     flood the room.
//   - the server also caches the latest full board snapshot a client
//     reports (`checkpoint`) so a reconnecting player can be served state
//     directly by the server if the opponent isn't online to answer —
//     previously that case just hung until a manual retry.

const express = require('express');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

// ---- In-memory room store -------------------------------------------------
// rooms: Map<code, {
//   maxPlayers, mode, createdAt, lastActivity, seq,
//   players: { [slot]: { token, joinedAt, connected, leftAt } },
//   lastCheckpoint: { state, bySlot, t } | null
// }>
const rooms = new Map();

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function genRoomCode() {
  let code;
  do {
    code = '';
    for (let i = 0; i < 5; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  } while (rooms.has(code));
  return code;
}

function touch(room) {
  room.lastActivity = Date.now();
}

function presenceSnapshot(room) {
  const out = {};
  for (const slot in room.players) {
    const p = room.players[slot];
    out[slot] = { joinedAt: p.joinedAt, connected: p.connected };
  }
  return out;
}

function broadcastPresence(code) {
  const room = rooms.get(code);
  if (!room) return;
  io.to('room:' + code).emit('presence', presenceSnapshot(room));
}

function assignSocketToSlot(socket, code, slot) {
  socket.data.roomCode = code;
  socket.data.slot = slot;
  socket.join('room:' + code);
}

function handleLeave(socket) {
  const code = socket.data.roomCode;
  const slot = socket.data.slot;
  if (!code || slot === null || slot === undefined) return;
  const room = rooms.get(code);
  if (room && room.players[slot]) {
    room.players[slot].connected = false;
    room.players[slot].leftAt = Date.now();
    touch(room);
  }
  socket.leave('room:' + code);
  socket.data.roomCode = null;
  socket.data.slot = null;
  if (room) broadcastPresence(code);
}

// Simple per-socket token-bucket so a broken/compromised client can't flood
// a room. Generous enough for normal play (moves/walls/timer-sync) to never
// come close to it.
const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 5000;
function rateLimitOk(socket) {
  const now = Date.now();
  const times = (socket.data.msgTimes || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  if (times.length >= RATE_LIMIT_MAX) { socket.data.msgTimes = times; return false; }
  times.push(now);
  socket.data.msgTimes = times;
  return true;
}

io.on('connection', (socket) => {
  socket.data.roomCode = null;
  socket.data.slot = null;
  socket.data.msgTimes = [];

  socket.on('createRoom', ({ maxPlayers, mode } = {}, ack) => {
    const code = genRoomCode();
    rooms.set(code, {
      maxPlayers: maxPlayers || 2,
      // حالت بازی (2p / 4p / hunter) همینجا، لحظه‌ی ساخته‌شدن اتاق توسط
      // میزبان، به‌عنوان تنها منبع معتبر ثبت می‌شود.
      mode: mode || '2p',
      createdAt: Date.now(),
      lastActivity: Date.now(),
      seq: 0,
      players: {},
      lastCheckpoint: null
    });
    if (ack) ack({ ok: true, code });
  });

  socket.on('roomExists', ({ code } = {}, ack) => {
    const room = rooms.get(String(code || '').toUpperCase());
    if (ack) ack({ exists: !!room, mode: room ? room.mode : null });
  });

  socket.on('joinRoom', ({ code, maxPlayers, token } = {}, ack) => {
    code = String(code || '').toUpperCase();
    const room = rooms.get(code);
    if (!room) { if (ack) ack({ ok: false, error: 'not-found' }); return; }
    touch(room);

    // اگه همین سوکت قبلاً یک جا توی همین روم گرفته (مثلاً دابل‌کلیک روی
    // دکمه‌ی اتصال)، همون اسلات قبلی رو برگردون؛ یک اسلات دوم مصرف نکن.
    if (socket.data.roomCode === code && socket.data.slot !== null && socket.data.slot !== undefined) {
      const mine = room.players[socket.data.slot];
      if (mine && mine.connected) { if (ack) ack({ ok: true, slot: socket.data.slot, mode: room.mode, token: mine.token }); return; }
    }

    const limit = room.maxPlayers || maxPlayers || 2;

    // 1) اگه توکنِ اسلاتِ خودشو داره (یعنی داره reconnect می‌کنه، نه اولین
    //    بار وصل می‌شه)، دقیقاً همون اسلاتی که قبلاً داشت بهش برمی‌گرده —
    //    نه اولین جای خالی. این هم جلوی «جای اشتباه گرفتن توی مود ۴نفره
    //    وقتی دو نفر همزمان reconnect می‌کنن» رو می‌گیره و هم جلوی اینکه
    //    یه غریبه که فقط کد روم رو بلده، جای یه بازیکنِ قطع‌شده رو با یه
    //    joinRoom ساده بگیره (چون بدون توکنِ درست، اصلاً به اون اسلات
    //    نمی‌رسه — پایین‌تر می‌بینی).
    if (token) {
      for (let i = 0; i < limit; i++) {
        const existing = room.players[i];
        if (existing && existing.token === token) {
          existing.connected = true;
          existing.leftAt = null;
          assignSocketToSlot(socket, code, i);
          if (ack) ack({ ok: true, slot: i, mode: room.mode, token });
          broadcastPresence(code);
          return;
        }
      }
      // توکن با هیچ اسلاتی توی این روم جور درنیومد (قدیمی/متعلق به روم
      // دیگه) — می‌ریم سراغ روال عادیِ اسلاتِ تازه.
    }

    // 2) فقط اسلاتی که تا حالا اصلاً کسی نگرفته (نه صرفاً «الان قطعه»)
    //    برای جوین‌شدنِ بدون توکن آزاده. اسلاتِ یک بازیکنِ قطع‌شده، بدون
    //    توکنِ درستش، برای هیچ سوکت دیگه‌ای قابل تصرف نیست.
    let slot = -1;
    for (let i = 0; i < limit; i++) {
      if (!room.players[i]) { slot = i; break; }
    }
    if (slot === -1) { if (ack) ack({ ok: false, error: 'full' }); return; }

    const newToken = crypto.randomBytes(16).toString('hex');
    room.players[slot] = { token: newToken, joinedAt: Date.now(), connected: true, leftAt: null };
    assignSocketToSlot(socket, code, slot);
    if (ack) ack({ ok: true, slot, mode: room.mode, token: newToken });
    broadcastPresence(code);
  });

  socket.on('getPresence', (_data, ack) => {
    const code = socket.data.roomCode;
    const room = code ? rooms.get(code) : null;
    if (room) touch(room);
    if (ack) ack({ players: room ? presenceSnapshot(room) : {} });
  });

  socket.on('roomMessage', ({ payload } = {}) => {
    const code = socket.data.roomCode;
    const slot = socket.data.slot;
    if (!code || slot === null || slot === undefined || !rooms.has(code)) return;
    if (!rateLimitOk(socket)) return;
    const room = rooms.get(code);
    touch(room);
    room.seq = (room.seq || 0) + 1;

    // اگه این پیام یه درخواستِ «request-state» موقعِ reconnect باشه و در
    // حال حاضر هیچ بازیکنِ دیگه‌ای توی روم آنلاین نباشه که جوابش رو بده،
    // به‌جای اینکه پیام تو خلا relay بشه و درخواست‌کننده تا ۹ ثانیه معطل
    // بمونه، سرور خودش آخرین snapshotِ کش‌شده (اگه داشته باشه) رو مستقیم
    // پس می‌ده — دقیقاً همون سناریوی «هر دو بازیکن همزمان ری‌لود کردن».
    if (payload && payload.type === 'request-state') {
      const others = Object.keys(room.players).filter(s => Number(s) !== slot && room.players[s].connected);
      if (others.length === 0 && room.lastCheckpoint) {
        socket.emit('stateFallback', { state: room.lastCheckpoint.state });
        return;
      }
    }

    socket.to('room:' + code).emit('roomMessage', {
      from: slot,
      t: Date.now(),
      seq: room.seq,
      payload
    });
  });

  // Lightweight state checkpoint — sent by whichever device just applied a
  // move/wall/turn change, so the server always has a recent, self-
  // contained snapshot to fall back on (see 'request-state' above).
  socket.on('checkpoint', ({ state } = {}) => {
    const code = socket.data.roomCode;
    const slot = socket.data.slot;
    if (!code || slot === null || slot === undefined || !rooms.has(code) || !state) return;
    const room = rooms.get(code);
    touch(room);
    room.lastCheckpoint = { state, bySlot: slot, t: Date.now() };
  });

  socket.on('leaveRoom', () => handleLeave(socket));
  socket.on('disconnect', () => handleLeave(socket));
});

// Simple health check — also handy as an uptime-ping target so free hosts
// (e.g. Render) don't spin the service down after inactivity.
app.get('/', (req, res) => {
  res.send('Route9 game server is running. Active rooms: ' + rooms.size);
});

// Sweep rooms that have seen no activity (no join/message/checkpoint) for a
// while AND currently have nobody connected. Based on actual inactivity
// instead of just "how long ago was it created", so a long-running match
// (or a room sitting in the lobby while people keep chatting/reconnecting)
// never gets swept out from under a still-live game.
setInterval(() => {
  const cutoff = Date.now() - 3 * 60 * 60 * 1000; // 3h of pure inactivity
  for (const [code, room] of rooms.entries()) {
    const anyConnected = Object.values(room.players).some(p => p.connected);
    if (anyConnected) continue;
    if ((room.lastActivity || room.createdAt) < cutoff) rooms.delete(code);
  }
}, 30 * 60 * 1000);

// Best-effort keep-alive: on Render's free tier the service spins down
// after ~15 minutes with no *inbound* HTTP traffic, which wipes every
// in-memory room (there's no persistent disk/DB on the free plan to survive
// that). Pinging our own public URL counts as inbound traffic and can delay
// or prevent that spin-down. This only works if RENDER_EXTERNAL_URL (set
// automatically by Render) or SELF_URL is present, and it's a mitigation,
// not a guarantee — platforms can change this behavior at any time. For a
// reliable fix, point an external uptime pinger (UptimeRobot, cron-job.org,
// etc.) at this service's "/" endpoint every 5-10 minutes.
const SELF_URL = process.env.RENDER_EXTERNAL_URL || process.env.SELF_URL || null;
if (SELF_URL) {
  setInterval(() => {
    try {
      https.get(SELF_URL, (res) => { res.resume(); }).on('error', () => {});
    } catch (e) {}
  }, 4 * 60 * 1000);
}

server.listen(PORT, () => {
  console.log('Route9 game server listening on port ' + PORT);
});
