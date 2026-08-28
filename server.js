// Route 9 — online multiplayer relay server
// Replaces Firebase Realtime Database (blocked on Iranian internet) with a
// small self-hosted Socket.io server. It only relays messages between the
// players in a room — it does not know or enforce any game rules, exactly
// like the old Firebase setup didn't either. All game logic still lives
// entirely in the browser (index.html), untouched.

const express = require('express');
const http = require('http');
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

// ---- Rate limiting ---------------------------------------------------------
// Everything below is per-IP, sliding-window, in-memory. Goal: stop one
// person/script from spamming createRoom/joinRoom/messages and either
// exhausting server memory or hammering another player's game.
const RATE_LIMITS = {
  createRoom: { max: 8, windowMs: 60 * 1000 },     // 8 rooms/min per IP
  joinRoom: { max: 20, windowMs: 60 * 1000 },       // 20 join attempts/min per IP
  roomExists: { max: 30, windowMs: 60 * 1000 },     // 30 code checks/min per IP
  roomMessage: { max: 240, windowMs: 60 * 1000 },   // 240 game messages/min per IP (~4/sec)
};
const MAX_ROOMS_TOTAL = 5000;            // hard ceiling on rooms kept in memory
const MAX_SOCKETS_PER_IP = 12;           // stop one IP from opening endless connections

// hits: Map<ip, Map<eventName, number[]>> — timestamps of recent hits
const rateHits = new Map();
// connectionsPerIp: Map<ip, count>
const connectionsPerIp = new Map();

function getClientIp(socket) {
  // Respect a proxy's forwarded header when present (Render sits behind one),
  // otherwise fall back to the raw socket address.
  const fwd = socket.handshake.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return socket.handshake.address || 'unknown';
}

function isRateLimited(ip, eventName) {
  const limit = RATE_LIMITS[eventName];
  if (!limit) return false;
  const now = Date.now();
  let perIp = rateHits.get(ip);
  if (!perIp) { perIp = new Map(); rateHits.set(ip, perIp); }
  let hits = perIp.get(eventName);
  if (!hits) { hits = []; perIp.set(eventName, hits); }
  // Drop anything outside the window, then check/record.
  while (hits.length && hits[0] <= now - limit.windowMs) hits.shift();
  if (hits.length >= limit.max) return true;
  hits.push(now);
  return false
}

// Periodically drop rate-limit bookkeeping for IPs that have gone quiet, so
// this doesn't grow forever either.
setInterval(() => {
  const cutoff = Date.now() - 5 * 60 * 1000;
  for (const [ip, perIp] of rateHits.entries()) {
    let stillActive = false;
    for (const hits of perIp.values()) {
      while (hits.length && hits[0] <= cutoff) hits.shift();
      if (hits.length) stillActive = true;
    }
    if (!stillActive) rateHits.delete(ip);
  }
}, 5 * 60 * 1000);

// ---- In-memory room store -------------------------------------------------
// rooms: Map<code, { maxPlayers, createdAt, players: { [slot]: {joinedAt, connected, leftAt} } }>
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

function handleLeave(socket) {
  const code = socket.data.roomCode;
  const slot = socket.data.slot;
  if (!code || slot === null || slot === undefined) return;
  const room = rooms.get(code);
  if (room && room.players[slot]) {
    room.players[slot].connected = false;
    room.players[slot].leftAt = Date.now();
  }
  socket.leave('room:' + code);
  socket.data.roomCode = null;
  socket.data.slot = null;
  if (room) broadcastPresence(code);
}

io.on('connection', (socket) => {
  socket.data.roomCode = null;
  socket.data.slot = null;
  const ip = getClientIp(socket);
  socket.data.ip = ip;

  const currentForIp = (connectionsPerIp.get(ip) || 0) + 1;
  connectionsPerIp.set(ip, currentForIp);
  if (currentForIp > MAX_SOCKETS_PER_IP) {
    socket.emit('errorMsg', { code: 'too-many-connections' });
    socket.disconnect(true);
    return;
  }

  socket.on('createRoom', ({ maxPlayers } = {}, ack) => {
    if (isRateLimited(ip, 'createRoom')) { if (ack) ack({ ok: false, error: 'rate-limited' }); return; }
    if (rooms.size >= MAX_ROOMS_TOTAL) { if (ack) ack({ ok: false, error: 'server-full' }); return; }
    const code = genRoomCode();
    rooms.set(code, {
      maxPlayers: maxPlayers || 2,
      createdAt: Date.now(),
      players: {}
    });
    if (ack) ack({ ok: true, code });
  });

  socket.on('roomExists', ({ code } = {}, ack) => {
    if (isRateLimited(ip, 'roomExists')) { if (ack) ack({ exists: false, error: 'rate-limited' }); return; }
    const exists = rooms.has(String(code || '').toUpperCase());
    if (ack) ack({ exists });
  });

  socket.on('joinRoom', ({ code, maxPlayers } = {}, ack) => {
    if (isRateLimited(ip, 'joinRoom')) { if (ack) ack({ ok: false, error: 'rate-limited' }); return; }
    code = String(code || '').toUpperCase();
    const room = rooms.get(code);
    if (!room) { if (ack) ack({ ok: false, error: 'not-found' }); return; }

    // اگه همین سوکت قبلاً یک جا توی همین روم گرفته (مثلاً دابل‌کلیک روی
    // دکمه‌ی اتصال)، همون اسلات قبلی رو برگردون؛ یک اسلات دوم مصرف نکن.
    if (socket.data.roomCode === code && socket.data.slot !== null && socket.data.slot !== undefined) {
      const mine = room.players[socket.data.slot];
      if (mine && mine.connected) { if (ack) ack({ ok: true, slot: socket.data.slot }); return; }
    }

    // ظرفیت واقعی اتاق همونیه که موقع ساخته‌شدنش (توسط میزبان) ثبت شده؛
    // به عددی که یک کلاینت جوین‌شونده لحظه‌ای می‌فرسته اعتماد نمی‌کنیم،
    // چون اگه اشتباه باشه (مثلاً حالت بازی محلی‌اش درست ست نشده بود)
    // باعث می‌شد اتاق زودتر از موقع "پر" اعلام بشه.
    const limit = room.maxPlayers || maxPlayers || 2;
    let slot = -1;
    for (let i = 0; i < limit; i++) {
      const existing = room.players[i];
      if (!existing || existing.connected === false) { slot = i; break; }
    }
    if (slot === -1) { if (ack) ack({ ok: false, error: 'full' }); return; }

    room.players[slot] = { joinedAt: Date.now(), connected: true };
    socket.data.roomCode = code;
    socket.data.slot = slot;
    socket.join('room:' + code);

    if (ack) ack({ ok: true, slot });
    broadcastPresence(code);
  });

  socket.on('getPresence', (_data, ack) => {
    const code = socket.data.roomCode;
    const room = code ? rooms.get(code) : null;
    if (ack) ack({ players: room ? presenceSnapshot(room) : {} });
  });

  socket.on('roomMessage', ({ payload } = {}) => {
    const code = socket.data.roomCode;
    const slot = socket.data.slot;
    if (!code || slot === null || slot === undefined || !rooms.has(code)) return;
    if (isRateLimited(ip, 'roomMessage')) return;
    socket.to('room:' + code).emit('roomMessage', {
      from: slot,
      t: Date.now(),
      payload
    });
  });

  socket.on('leaveRoom', () => handleLeave(socket));
  socket.on('disconnect', () => {
    handleLeave(socket);
    const remaining = (connectionsPerIp.get(ip) || 1) - 1;
    if (remaining <= 0) connectionsPerIp.delete(ip);
    else connectionsPerIp.set(ip, remaining)
  });
});

// Simple health check — also handy as an uptime-ping target so free hosts
// (e.g. Render) don't spin the service down after inactivity.
app.get('/', (req, res) => {
  res.send('Route9 game server is running. Active rooms: ' + rooms.size);
});

// Sweep long-abandoned rooms so memory doesn't grow forever.
setInterval(() => {
  const cutoff = Date.now() - 6 * 60 * 60 * 1000; // 6 hours
  for (const [code, room] of rooms.entries()) {
    if (room.createdAt < cutoff) rooms.delete(code);
  }
}, 30 * 60 * 1000);

server.listen(PORT, () => {
  console.log('Route9 game server listening on port ' + PORT);
});
