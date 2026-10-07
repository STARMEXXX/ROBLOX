// BLOCKRUN - zero-dependency multiplayer server (Node 18+)
// Serves the game + websocket rooms + server list API.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/$/, ''); // e.g. https://blockrun.gg
const ROOT = path.join(__dirname, 'public');
const MAX_PLAYERS = 24;
const TICK_MS = 66; // ~15Hz

const ROOMS = [
  { id: 'r1', name: 'Main Obby #1' },
  { id: 'r2', name: 'Main Obby #2' },
  { id: 'r3', name: 'Speedrunners' },
  { id: 'r4', name: 'Chill Room' },
].map(r => ({ ...r, players: new Map() }));

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
};

function originOf(req) {
  if (PUBLIC_URL) return PUBLIC_URL;
  const proto = (req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
  return `${proto}://${req.headers['x-forwarded-host'] || req.headers.host}`;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/servers') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*' });
    return res.end(JSON.stringify({
      online: ROOMS.reduce((a, r) => a + r.players.size, 0),
      servers: ROOMS.map(r => ({ id: r.id, name: r.name, players: r.players.size, max: MAX_PLAYERS })),
    }));
  }
  if (url.pathname === '/healthz') { res.writeHead(200); return res.end('ok'); }

  let p = url.pathname === '/' || url.pathname === '/embed' ? '/index.html' : url.pathname;
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    const ext = path.extname(file);
    const headers = {
      'content-type': MIME[ext] || 'application/octet-stream',
      // must be embeddable inside X/Twitter (player card iframe)
      'content-security-policy': "frame-ancestors *",
      'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
    };
    if (ext === '.html') data = Buffer.from(data.toString().replaceAll('{{ORIGIN}}', originOf(req)));
    res.writeHead(200, headers);
    res.end(data);
  });
});

// ---------- minimal RFC6455 websocket ----------
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
server.on('upgrade', (req, socket) => {
  const url = new URL(req.url, 'http://x');
  const key = req.headers['sec-websocket-key'];
  if (url.pathname !== '/ws' || !key) return socket.destroy();
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`);
  socket.setNoDelay(true);
  const room = ROOMS.find(r => r.id === url.searchParams.get('room')) || ROOMS[0];
  onConnection(socket, room);
});

function frame(str, op = 1) {
  const payload = Buffer.from(str);
  const len = payload.length;
  let head;
  if (len < 126) head = Buffer.from([0x80 | op, len]);
  else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(len, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([head, payload]);
}

function wsParser(socket, onText, onClose) {
  let buf = Buffer.alloc(0);
  socket.on('data', chunk => {
    buf = Buffer.concat([buf, chunk]);
    if (buf.length > 1 << 16) return socket.destroy();
    while (buf.length >= 2) {
      const op = buf[0] & 0x0f, masked = buf[1] & 0x80;
      let len = buf[1] & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      if (len > 8192) return socket.destroy();
      const need = off + (masked ? 4 : 0) + len;
      if (buf.length < need) return;
      let data = buf.subarray(off + (masked ? 4 : 0), need);
      if (masked) {
        const mask = buf.subarray(off, off + 4);
        data = Buffer.from(data);
        for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
      }
      buf = buf.subarray(need);
      if (op === 1) onText(data.toString());
      else if (op === 8) { try { socket.end(frame('', 8)); } catch {} return; }
      else if (op === 9) socket.write(frame(data, 10));
    }
  });
  socket.on('close', onClose);
  socket.on('error', () => socket.destroy());
}

// ---------- game logic ----------
let nextId = 1;
const clean = (s, n) => String(s || '').replace(/[<>\n\r\t]/g, '').trim().slice(0, n);
const send = (p, obj) => { if (!p.socket.destroyed) p.socket.write(frame(JSON.stringify(obj))); };
const broadcast = (room, obj, except) => {
  const f = frame(JSON.stringify(obj));
  for (const p of room.players.values()) if (p !== except && !p.socket.destroyed) p.socket.write(f);
};

function onConnection(socket, room) {
  if (room.players.size >= MAX_PLAYERS) { socket.write(frame(JSON.stringify({ t: 'full' }))); return socket.end(); }
  const p = { id: nextId++, socket, room, name: 'Guest', color: '#3b82f6', st: [0, 3, 0, 0, 0, 0], stage: 0, joined: false, lastChat: 0, alive: Date.now() };

  wsParser(socket, txt => {
    let m; try { m = JSON.parse(txt); } catch { return; }
    p.alive = Date.now();
    if (m.t === 'hi' && !p.joined) {
      p.joined = true;
      p.name = clean(m.name, 16) || 'Guest' + Math.floor(Math.random() * 9999);
      p.color = /^#[0-9a-f]{6}$/i.test(m.color) ? m.color : '#3b82f6';
      room.players.set(p.id, p);
      send(p, { t: 'welcome', id: p.id, room: room.name, players: [...room.players.values()].filter(o => o !== p).map(info) });
      broadcast(room, { t: 'join', p: info(p) }, p);
    } else if (m.t === 's' && p.joined && Array.isArray(m.s)) {
      p.st = m.s.slice(0, 6).map(Number);
      p.stage = p.st[5] | 0;
    } else if (m.t === 'chat' && p.joined) {
      const now = Date.now();
      if (now - p.lastChat < 900) return;
      p.lastChat = now;
      const text = clean(m.text, 120);
      if (text) broadcast(room, { t: 'chat', id: p.id, name: p.name, color: p.color, text });
    } else if (m.t === 'win' && p.joined) {
      broadcast(room, { t: 'sys', text: `${p.name} completed the obby in ${clean(m.time, 10)}!` });
    }
  }, () => {
    if (room.players.delete(p.id)) broadcast(room, { t: 'leave', id: p.id });
  });
}
const info = p => ({ id: p.id, name: p.name, color: p.color, stage: p.stage });

setInterval(() => {
  const now = Date.now();
  for (const room of ROOMS) {
    if (!room.players.size) continue;
    const ps = [];
    for (const p of room.players.values()) {
      if (now - p.alive > 20000) { p.socket.destroy(); continue; }
      ps.push([p.id, ...p.st.map(v => Math.round(v * 100) / 100)]);
    }
    broadcast(room, { t: 'w', ps });
  }
}, TICK_MS);

server.listen(PORT, () => console.log(`BLOCKRUN running on http://localhost:${PORT}`));
