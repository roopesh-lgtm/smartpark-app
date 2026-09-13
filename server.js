const express = require('express');
const path = require('path');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname)));

let state = {
  slots: [0, 1, 0, 1],

  // Security
  forced: 0,
  em: false,

  // Gates
  entry: 0,
  exit: 0,

  // Analytics
  recommended: 1,
  occupancy: 50,
  vehiclesEntered: 0,
  vehiclesExited: 0,

  // Device connection
  lastSeen: null,
  deviceOnline: false,

  // Event history
  events: [
    {
      a: '🟢 SYSTEM ONLINE',
      b: 'SmartPark backend is running',
      time: new Date().toLocaleTimeString()
    }
  ]
};

const clients = new Set();

function now() {
  return new Date().toLocaleTimeString();
}

function trimEvents() {
  state.events = state.events.slice(0, 30);
}

function broadcast() {
  const data = `data: ${JSON.stringify(state)}\n\n`;

  for (const response of clients) {
    try {
      response.write(data);
    } catch {
      clients.delete(response);
    }
  }
}

function touchDevice() {
  state.lastSeen = new Date().toISOString();
  state.deviceOnline = true;
}

// ==================================================
// HEALTH
// ==================================================

app.get('/health', (req, res) => {
  res.status(200).json({
    ok: true,
    service: 'smartpark-backend'
  });
});

// ==================================================
// CURRENT STATE
// ==================================================

app.get('/api/state', (req, res) => {
  res.json(state);
});

// ==================================================
// EVENTS
// ==================================================

app.get('/api/events', (req, res) => {
  res.json(state.events);
});

// ==================================================
// LIVE STREAM
// ==================================================

app.get('/api/stream', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  res.flushHeaders();

  clients.add(res);

  res.write(`data: ${JSON.stringify(state)}\n\n`);

  req.on('close', () => {
    clients.delete(res);
  });
});

// ==================================================
// DEMO: SIMULATE PARKING
// ==================================================

app.post('/api/demo/slot', (req, res) => {
  const index = state.slots.findIndex(v => !v);

  if (index < 0) {
    state.events.unshift({
      a: '🅿️ PARKING FULL',
      b: 'No available slots',
      time: now()
    });
  } else {
    state.slots[index] = 1;

    state.occupancy =
      Math.round(
        (state.slots.filter(v => v === 1).length / 4) * 100
      );

    const nextFree = state.slots.findIndex(v => !v);
    state.recommended = nextFree < 0 ? 0 : nextFree + 1;

    state.events.unshift({
      a: `🅿️ SLOT ${String(index + 1).padStart(2, '0')} OCCUPIED`,
      b: 'Vehicle detected',
      time: now()
    });
  }

  trimEvents();
  broadcast();

  res.json(state);
});

// ==================================================
// DEMO: FORCED ENTRY
// ==================================================

app.post('/api/demo/forced', (req, res) => {
  state.forced++;

  state.events.unshift({
    a: '🚨 FORCED ENTRY',
    b: 'Unauthorized gate crossing detected',
    time: now()
  });

  trimEvents();
  broadcast();

  res.json(state);
});

// ==================================================
// DEMO: EMERGENCY
// ==================================================

app.post('/api/demo/emergency', (req, res) => {
  state.em = !state.em;

  state.entry = state.em ? 1 : 0;
  state.exit = state.em ? 1 : 0;

  state.events.unshift({
    a: state.em
      ? '⚠️ EMERGENCY MODE'
      : '🟢 EMERGENCY CLEARED',

    b: state.em
      ? 'Both gates opened'
      : 'Normal operation restored',

    time: now()
  });

  trimEvents();
  broadcast();

  res.json(state);
});

// ==================================================
// ESP32: LIVE DEVICE STATE
// ==================================================

app.post('/api/device/state', (req, res) => {
  const body = req.body || {};

  // Parking slots
  if (
    Array.isArray(body.slots) &&
    body.slots.length === 4
  ) {
    state.slots = body.slots.map(v => v ? 1 : 0);
  }

  // Emergency
  if (typeof body.em === 'boolean') {
    state.em = body.em;
  }

  // Entry gate
  if (
    typeof body.entry === 'boolean' ||
    body.entry === 0 ||
    body.entry === 1
  ) {
    state.entry = body.entry ? 1 : 0;
  }

  // Exit gate
  if (
    typeof body.exit === 'boolean' ||
    body.exit === 0 ||
    body.exit === 1
  ) {
    state.exit = body.exit ? 1 : 0;
  }

  // Recommended slot
  if (
    typeof body.recommended === 'number'
  ) {
    state.recommended = body.recommended;
  }

  // Occupancy percentage
  if (
    typeof body.occupancy === 'number'
  ) {
    state.occupancy = body.occupancy;
  }

  // Vehicle analytics
  if (
    typeof body.vehiclesEntered === 'number'
  ) {
    state.vehiclesEntered = body.vehiclesEntered;
  }

  if (
    typeof body.vehiclesExited === 'number'
  ) {
    state.vehiclesExited = body.vehiclesExited;
  }

  // Device heartbeat
  touchDevice();

  broadcast();

  res.json({
    ok: true,
    state
  });
});

// ==================================================
// ESP32: SECURITY / EMERGENCY EVENTS
// ==================================================

app.post('/api/device/event', (req, res) => {
  const type = String(
    req.body?.type || ''
  ).toLowerCase();

  touchDevice();

  // ------------------------------
  // FORCED ENTRY
  // ------------------------------

  if (type === 'forced_entry') {

    state.forced++;

    state.events.unshift({
      a: '🚨 FORCED ENTRY',
      b: 'Unauthorized gate crossing detected',
      time: now()
    });
  }

  // ------------------------------
  // EMERGENCY ON
  // ------------------------------

  else if (type === 'emergency_on') {

    state.em = true;
    state.entry = 1;
    state.exit = 1;

    state.events.unshift({
      a: '⚠️ EMERGENCY MODE',
      b: 'Both gates opened',
      time: now()
    });
  }

  // ------------------------------
  // EMERGENCY OFF
  // ------------------------------

  else if (type === 'emergency_off') {

    state.em = false;

    state.events.unshift({
      a: '🟢 EMERGENCY CLEARED',
      b: 'Normal operation restored',
      time: now()
    });
  }

  // ------------------------------
  // UNKNOWN EVENT
  // ------------------------------

  else {

    return res.status(400).json({
      ok: false,
      error: 'Unknown event type'
    });
  }

  trimEvents();
  broadcast();

  res.json({
    ok: true,
    state
  });
});

// ==================================================
// DEVICE OFFLINE DETECTION
// ==================================================

setInterval(() => {

  if (
    state.deviceOnline &&
    state.lastSeen &&
    Date.now() -
      new Date(state.lastSeen).getTime() >
      25000
  ) {

    state.deviceOnline = false;

    state.events.unshift({
      a: '🔴 DEVICE OFFLINE',
      b: 'No ESP32 heartbeat received',
      time: now()
    });

    trimEvents();
    broadcast();
  }

}, 5000);

// ==================================================
// RENDER SERVER
// ==================================================

const port = Number(process.env.PORT) || 3000;
const host = '0.0.0.0';

app.listen(
  port,
  host,
  () => {
    console.log(
      `SmartPark server listening on ${host}:${port}`
    );
  }
);
