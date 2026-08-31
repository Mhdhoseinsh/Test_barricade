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

  socket.on('createRoom', ({ maxPlayers, mode } = {}, ack) => {
    const code = genRoomCode();
    rooms.set(code, {
      maxPlayers: maxPlayers || 2,
      // حالت بازی (2p / 4p / hunter) همینجا، لحظه‌ی ساخته‌شدن اتاق توسط
      // میزبان، به‌عنوان تنها منبع معتبر ثبت می‌شود. قبلاً این مقدار فقط
      // از طریق پیام «start» به بازیکن جوین‌شونده می‌رسید که یعنی اگه اون
      // پیام دیر می‌رسید یا با تایمینگ بدی برخورد می‌کرد، کلاینتِ جوین‌شونده
      // تا قبل از دریافتش با مقدار پیش‌فرض («2p») می‌موند — همون باگی که
      // باعث می‌شد یک نفر توی روم گرگ‌ومیش رو ببینه و یکی دیگه ۲نفره.
      mode: mode || '2p',
      createdAt: Date.now(),
      players: {}
    });
    if (ack) ack({ ok: true, code });
  });

  socket.on('roomExists', ({ code } = {}, ack) => {
    const room = rooms.get(String(code || '').toUpperCase());
    if (ack) ack({ exists: !!room, mode: room ? room.mode : null });
  });

  socket.on('joinRoom', ({ code, maxPlayers } = {}, ack) => {
    code = String(code || '').toUpperCase();
    const room = rooms.get(code);
    if (!room) { if (ack) ack({ ok: false, error: 'not-found' }); return; }

    // اگه همین سوکت قبلاً یک جا توی همین روم گرفته (مثلاً دابل‌کلیک روی
    // دکمه‌ی اتصال)، همون اسلات قبلی رو برگردون؛ یک اسلات دوم مصرف نکن.
    if (socket.data.roomCode === code && socket.data.slot !== null && socket.data.slot !== undefined) {
      const mine = room.players[socket.data.slot];
      if (mine && mine.connected) { if (ack) ack({ ok: true, slot: socket.data.slot, mode: room.mode }); return; }
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

    // «mode» همیشه از خودِ روم (که موقع createRoom توسط میزبان ثبت شده)
    // برگردونده می‌شه، نه از چیزی که کلاینتِ جوین‌شونده فرستاده — دقیقاً
    // همون منطقی که «maxPlayers» از قبل داشت.
    if (ack) ack({ ok: true, slot, mode: room.mode });
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
    socket.to('room:' + code).emit('roomMessage', {
      from: slot,
      t: Date.now(),
      payload
    });
  });

  socket.on('leaveRoom', () => handleLeave(socket));
  socket.on('disconnect', () => handleLeave(socket));
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
