# BLOCKRUN - multiplayer obby inside X

Zero dependencies. Node 18+. `npm start` -> http://localhost:3000

## Deploy (Railway - recommended, supports websockets)
1. Create a GitHub repo, upload all files from this folder (server.js, package.json, public/).
2. railway.app -> New Project -> Deploy from GitHub repo -> pick the repo.
3. Settings -> Networking -> Generate Domain (or add your own domain).
4. Variables -> add `PUBLIC_URL=https://your-domain` (no trailing slash).
5. Open the domain - menu + servers should load.

Render.com also works (Web Service, start command `node server.js`), but the free plan sleeps - bad for a viral post.
Vercel does NOT support websockets - multiplayer won't work there.

## Post on X
1. Check the card: open https://your-domain in a browser, make sure the game runs over https.
2. Post a tweet with the link https://your-domain (link last, or alone on its own line).
3. X renders it as a playable Player Card on web. On mobile apps it may open as a link/preview.

If the card shows only an image: X may need the domain approved for Player Cards -
apply via the X Developer Portal (Player Card / "card approval" request). Repost after approval.

## Files
- server.js - http + websocket server, 4 rooms x 24 players, /api/servers
- public/index.html - meta tags (Player Card), menu, HUD
- public/game.js - WebGL2 engine, obby (12 stages), physics, netcode
- public/og.png - preview image (replace with a nicer gameplay shot if you want)
