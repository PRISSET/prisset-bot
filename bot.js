import mineflayer from 'mineflayer';
import pathfinderPkg from 'mineflayer-pathfinder';
import pvpPkg from 'mineflayer-pvp';
import mcDataLoader from 'minecraft-data';
import { createInterface } from 'readline';
import https from 'https';
import * as settings from './settings.js';

const { pathfinder, Movements } = pathfinderPkg;
const pvpPlugin = pvpPkg.plugin;

const cfg = settings.load();
let bot = null;
let guardActive = false;
let farmActive = false;
let antiAfkTimer = null;
let guardScanTimer = null;
let farmLoopTimer = null;
let autoEatTimer = null;
let navigationDone = false;
let spawnHandled = false;
let reconnecting = false;
let lastEnemyName = null;

const HOSTILE_MOBS = new Set([
  'zombie', 'skeleton', 'spider', 'cave_spider', 'creeper',
  'enderman', 'witch', 'slime', 'magma_cube', 'phantom',
  'drowned', 'husk', 'stray', 'zombie_villager', 'pillager',
  'vindicator', 'evoker', 'ravager', 'hoglin', 'piglin_brute',
  'warden', 'blaze', 'ghast', 'wither_skeleton'
]);

const SWORD_TIERS = ['netherite_sword', 'diamond_sword', 'iron_sword', 'stone_sword', 'golden_sword', 'wooden_sword'];
const FOOD_VALUES = {
  'golden_carrot': 6, 'cooked_beef': 8, 'cooked_porkchop': 8,
  'cooked_mutton': 6, 'cooked_salmon': 6, 'cooked_chicken': 6,
  'cooked_rabbit': 5, 'cooked_cod': 5, 'bread': 5, 'baked_potato': 5,
  'beetroot_soup': 6, 'mushroom_stew': 6, 'rabbit_stew': 10,
  'apple': 4, 'melon_slice': 2, 'sweet_berries': 2,
  'dried_kelp': 1, 'carrot': 3, 'potato': 1
};

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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// =====================
// BOT LIFECYCLE
// =====================

function startBot() {
  navigationDone = false;
  guardActive = false;
  farmActive = false;
  spawnHandled = false;
  reconnecting = false;

  log(`Connecting as "${cfg.botNick}" to ${cfg.serverHost}:${cfg.serverPort}...`);

  bot = mineflayer.createBot({
    host: cfg.serverHost,
    port: cfg.serverPort,
    username: cfg.botNick,
    version: cfg.version,
    auth: 'offline',
    hideErrors: false
  });

  bot.loadPlugin(pathfinder);
  bot.loadPlugin(pvpPlugin);

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

  bot.on('health', () => {
    tryAutoEat();
  });

  bot.on('end', (reason) => {
    log(`Disconnected: ${reason}`);
    cleanup();
    bot = null;
  });

  bot.on('kicked', (reason) => {
    log(`Kicked: ${reason}`);
    cleanup();
  });

  bot.on('error', (err) => {
    log(`Error: ${err.message}`);
  });

  bot.on('message', (msg) => {
    const text = msg.toString();
    if (text.trim()) log(`[CHAT] ${text}`);
  });
}

function cleanup() {
  stopAntiAfk();
  stopGuardScan();
  stopFarmLoop();
  stopAutoEat();
  guardActive = false;
  farmActive = false;
}

// =====================
// NAVIGATION (hub -> anarchy)
// =====================

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
  farmActive = true;
  log('Farm mode ACTIVE. Hunting mobs + guarding...');

  const mcData = mcDataLoader(bot.version);
  const defaultMove = new Movements(bot, mcData);
  defaultMove.canDig = false;
  defaultMove.allow1by1towers = false;
  bot.pathfinder.setMovements(defaultMove);

  startAntiAfk();
  startGuardScan();
  startFarmLoop();
  startAutoEat();

  equipBestSword();
}

// =====================
// GUARD (enemy detection)
// =====================

function startGuardScan() {
  stopGuardScan();
  guardScanTimer = setInterval(() => {
    if (!bot || !guardActive) return;
    scanNearbyPlayers();
  }, 2000);
  log('Guard scan: checking nearby players every 2s');
}

function stopGuardScan() {
  if (guardScanTimer) {
    clearInterval(guardScanTimer);
    guardScanTimer = null;
  }
}

function scanNearbyPlayers() {
  if (!bot || !bot.entity) return;

  for (const name of Object.keys(bot.players)) {
    if (name === cfg.botNick) continue;
    if (settings.shouldIgnore(name)) continue;

    const playerData = bot.players[name];
    if (!playerData || !playerData.entity) continue;

    const dist = bot.entity.position.distanceTo(playerData.entity.position);
    if (dist > 200) continue;

    log(`[GUARD] Enemy "${name}" at distance ${Math.floor(dist)}!`);
    handleEnemyDetected(name, playerData.entity.position);
    return;
  }
}

async function handleEnemyDetected(username, entityPos) {
  guardActive = false;
  farmActive = false;
  stopFarmLoop();

  const selfName = cfg.botNick;
  const enemyPos = `X: ${Math.floor(entityPos.x)}, Y: ${Math.floor(entityPos.y)}, Z: ${Math.floor(entityPos.z)}`;
  let botPos = 'unknown';
  if (bot && bot.entity) {
    const pos = bot.entity.position;
    botPos = `X: ${Math.floor(pos.x)}, Y: ${Math.floor(pos.y)}, Z: ${Math.floor(pos.z)}`;
  }

  const tgText = `[PRISSET BOT] \u0412\u0430\u0441 \u0440\u0435\u0439\u0434\u044f\u0442!\n\u0420\u0435\u0439\u0434\u0435\u0440: ${username}\n\u041a\u043e\u043e\u0440\u0434\u0438\u043d\u0430\u0442\u044b \u0440\u0435\u0439\u0434\u0435\u0440\u0430: ${enemyPos}\n\u041a\u043e\u043e\u0440\u0434\u0438\u043d\u0430\u0442\u044b \u0431\u043e\u0442\u0430: ${botPos}\n\u0411\u043e\u0442: ${selfName}`;
  sendTelegram(tgText);

  log(`ENEMY: ${username} at ${enemyPos}. Disconnecting...`);
  lastEnemyName = username;

  if (bot) {
    try { bot.pvp.stop(); } catch {}
    bot.quit('Raid detected');
  }

  log('Waiting 2 minutes before reconnect attempt...');
  reconnecting = true;
  await sleep(120000);

  if (!reconnecting) return;

  log('Reconnecting to check if enemy left...');
  startReconnectCheck();
}

function startReconnectCheck() {
  bot = mineflayer.createBot({
    host: cfg.serverHost,
    port: cfg.serverPort,
    username: cfg.botNick,
    version: cfg.version,
    auth: 'offline',
    hideErrors: false
  });

  bot.loadPlugin(pathfinder);
  bot.loadPlugin(pvpPlugin);

  let checkDone = false;

  bot.on('login', () => {
    log('[RECHECK] Logged in, sending /anarchy...');
    setTimeout(() => {
      if (bot) bot.chat('/anarchy');
    }, 8000);
  });

  bot.on('windowOpen', (window) => {
    let slot = findSlotWithCount(window, 2);
    if (slot === null) slot = findSlotByName(window, ['2']);
    if (slot === null) slot = 12;

    setTimeout(() => {
      if (bot) bot.clickWindow(slot, 0, 0);
      setTimeout(() => recheckEnemies(), 5000);
    }, 500);
  });

  bot.on('end', () => {
    if (!checkDone) {
      log('[RECHECK] Disconnected unexpectedly');
      bot = null;
      reconnecting = false;
    }
  });

  bot.on('error', (err) => {
    log(`[RECHECK] Error: ${err.message}`);
  });

  function recheckEnemies() {
    if (!bot || checkDone) return;
    checkDone = true;

    let enemyStillHere = false;
    for (const name of Object.keys(bot.players)) {
      if (name === cfg.botNick) continue;
      if (settings.shouldIgnore(name)) continue;
      const pd = bot.players[name];
      if (!pd || !pd.entity) continue;
      const dist = bot.entity ? bot.entity.position.distanceTo(pd.entity.position) : 999;
      if (dist <= 200) {
        enemyStillHere = true;
        log(`[RECHECK] Enemy "${name}" still here at distance ${Math.floor(dist)}`);
        break;
      }
    }

    if (enemyStillHere) {
      log('[RECHECK] Enemy still on base. Shutting down.');
      sendTelegram(`[PRISSET BOT] \u0412\u0440\u0430\u0433 \u0432\u0441\u0435 \u0435\u0449\u0435 \u043d\u0430 \u0431\u0430\u0437\u0435. \u0411\u043e\u0442 \u043e\u0444\u0444.`);
      if (bot) bot.quit('Enemy still here');
      bot = null;
      reconnecting = false;
      log('Bot stopped. Use /start to reconnect manually.');
    } else {
      log('[RECHECK] Clear! Resuming farm mode...');
      sendTelegram(`[PRISSET BOT] \u0411\u0430\u0437\u0430 \u0447\u0438\u0441\u0442\u0430. \u0424\u0430\u0440\u043c \u0432\u043e\u0437\u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d.`);
      reconnecting = false;
      lastEnemyName = null;

      navigationDone = true;
      guardActive = true;
      farmActive = true;

      const mcData = mcDataLoader(bot.version);
      const defaultMove = new Movements(bot, mcData);
      defaultMove.canDig = false;
      defaultMove.allow1by1towers = false;
      bot.pathfinder.setMovements(defaultMove);

      startAntiAfk();
      startGuardScan();
      startFarmLoop();
      startAutoEat();
      equipBestSword();

      bot.on('health', () => tryAutoEat());
      bot.on('end', (reason) => {
        log(`Disconnected: ${reason}`);
        cleanup();
        bot = null;
      });
      bot.on('kicked', (reason) => {
        log(`Kicked: ${reason}`);
        cleanup();
      });
      bot.on('error', (err) => log(`Error: ${err.message}`));
      bot.on('message', (msg) => {
        const text = msg.toString();
        if (text.trim()) log(`[CHAT] ${text}`);
      });

      log('Farm mode ACTIVE.');
    }
  }
}

// =====================
// FARMING (mob hunting)
// =====================

function startFarmLoop() {
  stopFarmLoop();
  farmLoopTimer = setInterval(() => {
    if (!bot || !farmActive || !bot.entity) return;
    farmTick();
  }, 1000);
  log('Farm loop: scanning for mobs every 1s');
}

function stopFarmLoop() {
  if (farmLoopTimer) {
    clearInterval(farmLoopTimer);
    farmLoopTimer = null;
  }
  if (bot) {
    try { bot.pvp.stop(); } catch {}
  }
}

function farmTick() {
  if (bot.pvp.target) return;

  const mob = findNearestHostile();
  if (!mob) return;

  const dist = bot.entity.position.distanceTo(mob.position);
  log(`[FARM] Attacking ${mob.name || mob.displayName} at distance ${Math.floor(dist)}`);

  bot.pvp.attack(mob);
}

function findNearestHostile() {
  if (!bot || !bot.entity) return null;

  let nearest = null;
  let nearestDist = 32;

  for (const entity of Object.values(bot.entities)) {
    if (!entity || entity === bot.entity) continue;
    if (!entity.name || !HOSTILE_MOBS.has(entity.name)) continue;
    if (!entity.position) continue;

    const dist = bot.entity.position.distanceTo(entity.position);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = entity;
    }
  }

  return nearest;
}

// =====================
// AUTO-EAT
// =====================

function startAutoEat() {
  stopAutoEat();
  autoEatTimer = setInterval(() => {
    if (!bot || !bot.entity) return;
    tryAutoEat();
  }, 3000);
}

function stopAutoEat() {
  if (autoEatTimer) {
    clearInterval(autoEatTimer);
    autoEatTimer = null;
  }
}

async function tryAutoEat() {
  if (!bot || !bot.entity) return;
  if (bot.food >= 20) return;
  if (bot.pvp && bot.pvp.target) return;

  const foodItem = findBestFood();
  if (!foodItem) return;

  try {
    await bot.equip(foodItem, 'hand');
    await bot.consume();
    log(`[EAT] Ate ${foodItem.name}, hunger: ${bot.food}`);
    equipBestSword();
  } catch (e) {
    // eating interrupted, not critical
  }
}

function findBestFood() {
  if (!bot || !bot.inventory) return null;

  let best = null;
  let bestVal = -1;

  for (const item of bot.inventory.items()) {
    const val = FOOD_VALUES[item.name];
    if (val && val > bestVal) {
      bestVal = val;
      best = item;
    }
  }

  return best;
}

// =====================
// SWORD EQUIP
// =====================

function equipBestSword() {
  if (!bot || !bot.inventory) return;

  for (const tier of SWORD_TIERS) {
    const sword = bot.inventory.items().find(item => item.name === tier);
    if (sword) {
      bot.equip(sword, 'hand').then(() => {
        log(`[EQUIP] ${tier}`);
      }).catch(() => {});
      return;
    }
  }
}

// =====================
// ANTI-AFK
// =====================

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

// =====================
// CONSOLE COMMANDS
// =====================

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
      reconnecting = false;
      startBot();
      break;

    case '/stop':
      reconnecting = false;
      if (!bot) { log('Not connected'); break; }
      bot.quit('Manual stop');
      break;

    case '/status':
      if (reconnecting) {
        log('Status: WAITING TO RECONNECT (enemy detected)');
      } else if (!bot) {
        log('Status: OFFLINE');
      } else {
        const mode = farmActive ? 'FARMING' : guardActive ? 'GUARD' : 'CONNECTING';
        log(`Status: ${mode}`);
        if (bot.entity) {
          const pos = bot.entity.position;
          log(`Position: X:${Math.floor(pos.x)} Y:${Math.floor(pos.y)} Z:${Math.floor(pos.z)}`);
        }
        log(`Health: ${bot.health || '?'} | Food: ${bot.food || '?'}`);
        if (bot.pvp && bot.pvp.target) {
          log(`Fighting: ${bot.pvp.target.name || bot.pvp.target.displayName}`);
        }
        const players = Object.keys(bot.players).filter(n => n !== cfg.botNick);
        log(`Players nearby: ${players.length ? players.join(', ') : 'none'}`);
      }
      break;

    case '/help':
      printHelp();
      break;

    case '/quit':
      reconnecting = false;
      if (bot) bot.quit('Shutdown');
      log('Bye!');
      process.exit(0);
      break;

    default:
      if (line.trim() && bot) {
        bot.chat(line.trim());
      } else if (line.trim()) {
        log('Not connected. Type /start');
      }
      break;
  }
}

// =====================
// MAIN
// =====================

console.log('');
console.log('  PRISSET BOT v2.0.0 (Farm Edition)');
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
