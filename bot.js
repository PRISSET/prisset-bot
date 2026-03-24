import mineflayer from 'mineflayer';
import { createInterface } from 'readline';
import https from 'https';
import * as settings from './settings.js';

const cfg = settings.load();
let bot = null;
let guardActive = false;
let antiAfkTimer = null;
let navigationDone = false;
let spawnHandled = false;

const log = (msg) => console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);

function sendTelegram(text) {
  const token = cfg.tgBotToken;
  const chatId = cfg.tgChatId;
  if (!token || !chatId) return;

  const data = `chat_id=${encodeURIComponent(chatId)}&text=${encodeURIComponent(text)}`;
  const req = https.request({
    hostname: 'api.telegram.org',
    path: `/bot${token}/sendMessage`,
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(data) }
  });
  req.on('error', (e) => log(`TG error: ${e.message}`));
  req.write(data);
  req.end();
}

function startBot() {
  navigationDone = false;
  guardActive = false;
  spawnHandled = false;

  log(`Connecting as "${cfg.botNick}" to ${cfg.serverHost}:${cfg.serverPort}...`);

  bot = mineflayer.createBot({
    host: cfg.serverHost,
    port: cfg.serverPort,
    username: cfg.botNick,
    version: cfg.version,
    auth: 'offline',
    hideErrors: false
  });

  bot.on('login', () => {
    log('Logged in to server!');
    if (!navigationDone && !spawnHandled) {
      log('Waiting 8s for server to load, then sending /anarchy...');
      spawnHandled = true;
      setTimeout(() => navigateToAnarchy(), 8000);
    }
  });

  bot.on('spawn', () => {
    log('Spawn event received');
  });

  bot.on('windowOpen', (window) => {
    handleWindow(window);
  });

  bot._client.on('open_window', (packet) => {
    log(`[RAW] open_window packet: windowId=${packet.windowId} type=${packet.inventoryType} title=${JSON.stringify(packet.windowTitle)}`);
  });

  bot.on('playerJoined', (player) => {
    if (!guardActive) return;
    checkPlayer(player.username);
  });

  bot.on('entitySpawned', (entity) => {
    if (!guardActive) return;
    if (entity.type !== 'player') return;
    if (entity.username) checkPlayer(entity.username);
  });

  bot.on('end', (reason) => {
    log(`Disconnected: ${reason}`);
    stopAntiAfk();
    guardActive = false;
    bot = null;
  });

  bot.on('kicked', (reason) => {
    log(`Kicked: ${reason}`);
    stopAntiAfk();
    guardActive = false;
  });

  bot.on('error', (err) => {
    log(`Error: ${err.message}`);
  });

  bot.on('message', (msg) => {
    const text = msg.toString();
    if (text.trim()) log(`[CHAT] ${text}`);
  });
}

async function navigateToAnarchy() {
  if (navigationDone) return;

  try {
    log('Sending /anarchy command...');
    bot.chat('/anarchy');
    log('Waiting for server selection GUI...');
  } catch (e) {
    log(`Navigation error: ${e.message}`);
  }
}

function handleWindow(window) {
  const title = window.title ? JSON.stringify(window.title) : '';
  log(`Window opened: ${title} (${window.slots.length} slots)`);

  logWindowSlots(window);

  let slot = findSlotWithCount(window, 2);
  if (slot === null) slot = findSlotByName(window, ['2']);

  if (slot !== null) {
    log(`Found server "2" at slot ${slot}, clicking...`);
    setTimeout(() => {
      bot.clickWindow(slot, 0, 0);
      log('Clicked! Waiting for teleport...');
      setTimeout(() => onNavigationDone(), 3000);
    }, 500);
  } else {
    log('Could not find slot automatically, trying slot 12...');
    setTimeout(() => {
      bot.clickWindow(12, 0, 0);
      log('Clicked slot 12! Waiting for teleport...');
      setTimeout(() => onNavigationDone(), 3000);
    }, 500);
  }
}

function findSlotWithCount(window, count) {
  for (let i = 0; i < window.slots.length; i++) {
    const item = window.slots[i];
    if (!item) continue;
    if (item.count === count) return i;
  }
  return null;
}

function findSlotByName(window, keywords) {
  for (let i = 0; i < window.slots.length; i++) {
    const item = window.slots[i];
    if (!item) continue;
    const name = (item.customName || item.displayName || item.name || '').toLowerCase();
    const lore = item.customLore ? item.customLore.join(' ').toLowerCase() : '';
    const combined = name + ' ' + lore;
    for (const kw of keywords) {
      if (combined.includes(kw.toLowerCase())) return i;
    }
  }
  return null;
}

function logWindowSlots(window) {
  for (let i = 0; i < window.slots.length; i++) {
    const item = window.slots[i];
    if (!item) continue;
    const name = item.customName || item.displayName || item.name || 'unknown';
    log(`  Slot ${i}: ${name} (${item.type}/${item.count})`);
  }
}

function onNavigationDone() {
  navigationDone = true;
  guardActive = true;
  log('Guard mode ACTIVE. Monitoring for enemies...');
  startAntiAfk();
}

function startAntiAfk() {
  stopAntiAfk();
  const intervalMs = (cfg.antiAfkIntervalSec || 45) * 1000;
  antiAfkTimer = setInterval(() => {
    if (!bot || !bot.entity) return;
    const yaw = bot.entity.yaw + (Math.random() - 0.5) * 0.5;
    bot.look(yaw, bot.entity.pitch, false);
    bot.setControlState('sneak', true);
    setTimeout(() => {
      if (bot) bot.setControlState('sneak', false);
    }, 200);
  }, intervalMs);
  log(`Anti-AFK: micro-movement every ${cfg.antiAfkIntervalSec}s`);
}

function stopAntiAfk() {
  if (antiAfkTimer) {
    clearInterval(antiAfkTimer);
    antiAfkTimer = null;
  }
}

function checkPlayer(username) {
  if (!username) return;
  if (username === cfg.botNick) return;
  if (settings.shouldIgnore(username)) return;

  log(`ENEMY DETECTED: ${username}! Waiting 2s for coordinates...`);

  setTimeout(() => {
    if (!bot) return;

    const selfName = cfg.botNick;
    let enemyPos = 'unknown';
    let botPos = 'unknown';

    const player = bot.players[username];
    if (player && player.entity) {
      const pos = player.entity.position;
      enemyPos = `X: ${Math.floor(pos.x)}, Y: ${Math.floor(pos.y)}, Z: ${Math.floor(pos.z)}`;
    }

    if (bot.entity) {
      const pos = bot.entity.position;
      botPos = `X: ${Math.floor(pos.x)}, Y: ${Math.floor(pos.y)}, Z: ${Math.floor(pos.z)}`;
    }

    if (enemyPos === 'unknown' && botPos !== 'unknown') {
      enemyPos = `\u043e\u043a\u043e\u043b\u043e ${botPos}`;
    }

    const tgText = `[PRISSET BOT] \u0412\u0430\u0441 \u0440\u0435\u0439\u0434\u044f\u0442!\n\u0420\u0435\u0439\u0434\u0435\u0440: ${username}\n\u041a\u043e\u043e\u0440\u0434\u0438\u043d\u0430\u0442\u044b \u0440\u0435\u0439\u0434\u0435\u0440\u0430: ${enemyPos}\n\u041a\u043e\u043e\u0440\u0434\u0438\u043d\u0430\u0442\u044b \u0431\u043e\u0442\u0430: ${botPos}\n\u0411\u043e\u0442: ${selfName}`;
    sendTelegram(tgText);

    log(`Disconnecting! Raider: ${username} at ${enemyPos}`);
    bot.quit('Raid detected');
  }, 2000);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// === Console commands ===

const rl = createInterface({ input: process.stdin, output: process.stdout });

function printHelp() {
  console.log(`
  Commands:
    /settings           - Show current settings
    /nick <name>        - Set bot nickname
    /add <name>         - Add teammate
    /remove <name>      - Remove teammate
    /list               - List teammates
    /token <token>      - Set Telegram bot token
    /chatid <id>        - Set Telegram chat ID
    /start              - Connect to server
    /stop               - Disconnect
    /status             - Show bot status
    /help               - Show this help
    /quit               - Exit program
  `);
}

function handleCommand(line) {
  const parts = line.trim().split(/\s+/);
  const cmd = parts[0]?.toLowerCase();
  const arg = parts.slice(1).join(' ');

  switch (cmd) {
    case '/settings':
      console.log('\n  Current settings:');
      console.log(`    Nick:       ${cfg.botNick}`);
      console.log(`    Server:     ${cfg.serverHost}:${cfg.serverPort}`);
      console.log(`    Version:    ${cfg.version}`);
      console.log(`    Teammates:  ${cfg.teammates.length ? cfg.teammates.join(', ') : '(none)'}`);
      console.log(`    Ignored:    ${cfg.ignored.join(', ')}`);
      console.log(`    TG Token:   ${cfg.tgBotToken ? cfg.tgBotToken.substring(0, 10) + '...' : '(not set)'}`);
      console.log(`    TG Chat:    ${cfg.tgChatId || '(not set)'}`);
      console.log(`    Anti-AFK:   every ${cfg.antiAfkIntervalSec}s`);
      console.log('');
      break;

    case '/nick':
      if (!arg) { log('Usage: /nick <name>'); break; }
      settings.setField('botNick', arg);
      log(`Nick set to: ${arg}`);
      break;

    case '/add':
      if (!arg) { log('Usage: /add <name>'); break; }
      if (settings.addTeammate(arg)) {
        log(`Added teammate: ${arg}`);
      } else {
        log(`Already in list: ${arg}`);
      }
      break;

    case '/remove':
      if (!arg) { log('Usage: /remove <name>'); break; }
      if (settings.removeTeammate(arg)) {
        log(`Removed teammate: ${arg}`);
      } else {
        log(`Not found: ${arg}`);
      }
      break;

    case '/list':
      if (cfg.teammates.length === 0) {
        log('No teammates');
      } else {
        log(`Teammates: ${cfg.teammates.join(', ')}`);
      }
      break;

    case '/token':
      if (!arg) { log('Usage: /token <bot_token>'); break; }
      settings.setField('tgBotToken', arg);
      log('Telegram bot token saved');
      break;

    case '/chatid':
      if (!arg) { log('Usage: /chatid <chat_id>'); break; }
      settings.setField('tgChatId', arg);
      log(`Telegram chat ID set to: ${arg}`);
      break;

    case '/start':
      if (bot) { log('Already connected! Use /stop first'); break; }
      startBot();
      break;

    case '/stop':
      if (!bot) { log('Not connected'); break; }
      bot.quit('Manual stop');
      break;

    case '/status':
      if (!bot) {
        log('Status: OFFLINE');
      } else {
        log(`Status: ${guardActive ? 'GUARD ACTIVE' : 'CONNECTING/NAVIGATING'}`);
        if (bot.entity) {
          const pos = bot.entity.position;
          log(`Position: X:${Math.floor(pos.x)} Y:${Math.floor(pos.y)} Z:${Math.floor(pos.z)}`);
        }
        const players = Object.keys(bot.players).filter(n => n !== cfg.botNick);
        log(`Players nearby: ${players.length ? players.join(', ') : 'none'}`);
      }
      break;

    case '/help':
      printHelp();
      break;

    case '/quit':
      if (bot) bot.quit('Shutdown');
      log('Bye!');
      process.exit(0);
      break;

    default:
      if (cmd) log(`Unknown command: ${cmd}. Type /help`);
      break;
  }
}

// === Main ===

console.log('');
console.log('  PRISSET BOT v1.0.0');
console.log('  Type /help for commands');
console.log('  Type /settings to configure');
console.log('  Type /start to connect');
console.log('');

rl.on('line', (line) => {
  handleCommand(line);
});

rl.on('close', () => {
  if (bot) bot.quit('Shutdown');
  process.exit(0);
});
