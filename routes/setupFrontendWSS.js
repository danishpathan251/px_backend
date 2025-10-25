const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const UPSTOX_WSS_LIVE = 'wss://api.upstox.com/v3/feed/market-data-feed';
const UPSTOX_WSS_DEMO = 'wss://api.upstox.com/demo/feed/market-data-feed';

const clients = new Map();

function setupFrontendWSS(server) {
  const wss = new WebSocket.Server({ server });
  console.log('✅ WebSocket bridge ready for frontend connections');

  wss.on('connection', (ws) => {
    console.log('➡️ Frontend client connected');
    ws.isAlive = true;

    ws.on('pong', () => ws.isAlive = true);

    ws.on('message', async (message) => {
      let parsed;
      try {
        parsed = JSON.parse(message.toString());
      } catch {
        ws.send(JSON.stringify({ error: 'invalid_json', raw: message.toString() }));
        return;
      }

      switch (parsed.action) {
        case 'init': return handleInit(ws, parsed);
        case 'update_subs': return handleUpdateSubs(ws, parsed);
        case 'send_to_upstox': return handleSendToUpstox(ws, parsed);
        default:
          ws.send(JSON.stringify({ error: 'unknown_action', received: parsed }));
      }
    });

    ws.on('close', () => cleanupOldConnection(ws));
    ws.on('error', (err) => console.error('Frontend WS error:', err.message));

    ws.send(JSON.stringify({
      info: 'send_init',
      message: 'Send {"action":"init","token":"<token>","instruments":["NSE_INDEX|Nifty Bank"]}'
    }));
  });

  // Ping dead connections
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => clearInterval(interval));
}

/* -------------------- HANDLERS -------------------- */

function handleInit(ws, { token, instruments, demo = false }) {
  if (!token || !Array.isArray(instruments) || instruments.length === 0) {
    ws.send(JSON.stringify({ error: 'missing_token_or_instruments' }));
    return;
  }

  cleanupOldConnection(ws);

  console.log('🔑 Initializing Upstox connection...');

  // Pick WS URL based on demo flag
  const UPSTOX_WSS = demo ? UPSTOX_WSS_DEMO : UPSTOX_WSS_LIVE;

  const upstoxWs = new WebSocket(UPSTOX_WSS, {
    headers: { Authorization: `Bearer ${token}`, Accept: '*/*' }
  });

  upstoxWs.on('open', () => {
    console.log('🔌 Connected to Upstox feed');
    const subMsg = buildSubMsg(instruments);
    upstoxWs.send(JSON.stringify(subMsg));
    ws.send(JSON.stringify({ info: 'upstox_connected', sub: subMsg }));
  });

  upstoxWs.on('message', (data) => {
    try {
      const payload = JSON.parse(data.toString());
      ws.send(JSON.stringify({ from: 'upstox', payload }));
    } catch {
      ws.send(JSON.stringify({ from: 'upstox', payload: data.toString() }));
    }
  });

  upstoxWs.on('close', (code, reason) => {
    console.log('🔒 Upstox WS closed:', code, reason?.toString());
    ws.send(JSON.stringify({ info: 'upstox_closed', code }));
  });

  upstoxWs.on('error', (err) => {
    console.error('⚠️ Upstox WS error:', err.message);
    if (err?.statusCode === 302) {
      ws.send(JSON.stringify({ error: 'upstox_redirect', message: 'Token invalid/expired or wrong URL' }));
    } else {
      ws.send(JSON.stringify({ error: 'upstox_error', message: err.message }));
    }
  });

  clients.set(ws, { upstoxWs, instruments });
  ws.send(JSON.stringify({ info: 'initialized', instruments }));
}

function handleUpdateSubs(ws, { instruments }) {
  const entry = clients.get(ws);
  if (!entry || !entry.upstoxWs || entry.upstoxWs.readyState !== WebSocket.OPEN) {
    ws.send(JSON.stringify({ error: 'not_connected_to_upstox' }));
    return;
  }

  const subMsg = buildSubMsg(instruments);
  entry.upstoxWs.send(JSON.stringify(subMsg));
  entry.instruments = instruments;

  ws.send(JSON.stringify({ info: 'updated_subscription', subMsg }));
}

function handleSendToUpstox(ws, { payload }) {
  const entry = clients.get(ws);
  if (!entry || !entry.upstoxWs || entry.upstoxWs.readyState !== WebSocket.OPEN) {
    ws.send(JSON.stringify({ error: 'not_connected_to_upstox' }));
    return;
  }

  entry.upstoxWs.send(JSON.stringify(payload));
  ws.send(JSON.stringify({ info: 'sent_to_upstox', payload }));
}

function cleanupOldConnection(ws) {
  const entry = clients.get(ws);
  if (entry?.upstoxWs) {
    try { entry.upstoxWs.close(); } catch {}
  }
  clients.delete(ws);
}

function buildSubMsg(instruments) {
  return {
    guid: uuidv4().replace(/-/g, '').slice(0, 20),
    method: 'sub',
    data: { mode: 'full', instrumentKeys: instruments }
  };
}

module.exports = { setupFrontendWSS };
