import mineflayer from 'mineflayer';
import { createInterface } from 'readline';
import https from 'https';
import * as settings from './settings.js';

const cfg = settings.load();
let bot = null;
let guardActive = false;
let farmActive = false;
let guardScanTimer = null;
let farmLoopTimer = null;
let autoEatTimer = null;
let lastAttackTime = 0;
let navigationDone = false;
let spawnHandled = false;
let reconnecting = false;
let lastEnemyName = null;
let reconnectAttempt = 0;

const RECONNECT_DELAYS = [2 * 60 * 1000, 10 * 60 * 1000, 30 * 60 * 1000];

const HOSTILE_MOBS = new Set([
  'zombie', 'skeleton', 'spider', 'cave_spider', 'creeper',
  'enderman', 'witch', 'slime', 'magma_cube', 'phantom',
  'drowned', 'husk', 'stray', 'zombie_villager', 'pillager',
  'vindicator', 'evoker', 'ravager', 'hoglin', 'piglin_brute',
  'warden', 'blaze', 'ghast', 'wither_skeleton',
  'zombified_piglin', 'piglin', 'silverfish', 'endermite',
  'guardian', 'elder_guardian', 'shulker', 'vex',
  'zombie_pigman'
]);

const SWORD_TIERS = ['netherite_sword', 'diamond_sword', 'iron_sword', 'stone_sword', 'golden_sword', 'wooden_sword'];
const ATTACK_RANGE = 4;
const ATTACK_COOLDOWN_MS = 600;

const MOB_NAMES_RU = {
  'zombie': '\u0437\u043e\u043c\u0431\u0438', 'skeleton': '\u0441\u043a\u0435\u043b\u0435\u0442',
  'spider': '\u043f\u0430\u0443\u043a', 'cave_spider': '\u043f\u0435\u0449\u0435\u0440\u043d\u044b\u0439 \u043f\u0430\u0443\u043a',
  'creeper': '\u043a\u0440\u0438\u043f\u0435\u0440', 'enderman': '\u044d\u043d\u0434\u0435\u0440\u043c\u0435\u043d',
  'witch': '\u0432\u0435\u0434\u044c\u043c\u0430', 'slime': '\u0441\u043b\u0430\u0439\u043c',
  'magma_cube': '\u043c\u0430\u0433\u043c\u0430-\u043a\u0443\u0431', 'phantom': '\u0444\u0430\u043d\u0442\u043e\u043c',
  'drowned': '\u0443\u0442\u043e\u043f\u043b\u0435\u043d\u043d\u0438\u043a', 'husk': '\u043a\u0430\u0434\u0430\u0432\u0440',
  'stray': '\u0441\u0442\u0440\u0435\u0439', 'zombie_villager': '\u0437\u043e\u043c\u0431\u0438-\u0436\u0438\u0442\u0435\u043b\u044c',
  'pillager': '\u0440\u0430\u0437\u0431\u043e\u0439\u043d\u0438\u043a', 'vindicator': '\u043f\u043e\u0431\u043e\u0440\u043d\u0438\u043a',
  'evoker': '\u0432\u044b\u0437\u044b\u0432\u0430\u0442\u0435\u043b\u044c', 'ravager': '\u0440\u0430\u0437\u043e\u0440\u0438\u0442\u0435\u043b\u044c',
  'hoglin': '\u0445\u043e\u0433\u043b\u0438\u043d', 'piglin_brute': '\u043f\u0438\u0433\u043b\u0438\u043d-\u0433\u0440\u0443\u0431\u0438\u044f\u043d',
  'warden': '\u0441\u0442\u0440\u0430\u0436', 'blaze': '\u0431\u043b\u0435\u0439\u0437',
  'ghast': '\u0433\u0430\u0441\u0442', 'wither_skeleton': '\u0441\u043a\u0435\u043b\u0435\u0442-\u0438\u0441\u0441\u0443\u0448\u0438\u0442\u0435\u043b\u044c',
  'zombified_piglin': '\u0437\u043e\u043c\u0431\u0438-\u043f\u0438\u0433\u043b\u0438\u043d',
  'zombie_pigman': '\u0437\u043e\u043c\u0431\u0438-\u0441\u0432\u0438\u043d\u043e\u0447\u0435\u043b\u043e\u0432\u0435\u043a',
  'piglin': '\u043f\u0438\u0433\u043b\u0438\u043d',
  'silverfish': '\u0447\u0435\u0440\u0434\u0430\u0447\u043e\u043a',
  'endermite': '\u044d\u043d\u0434\u0435\u0440\u043c\u0438\u0442',
  'guardian': '\u0441\u0442\u0440\u0430\u0436 \u043e\u043a\u0435\u0430\u043d\u0430',
  'elder_guardian': '\u0434\u0440\u0435\u0432\u043d\u0438\u0439 \u0441\u0442\u0440\u0430\u0436',
  'shulker': '\u0448\u0430\u043b\u043a\u0435\u0440', 'vex': '\u0432\u0435\u043a\u0441'
};

const ITEM_NAMES_RU = {
  'netherite_sword': '\u043d\u0435\u0437\u0435\u0440\u0438\u0442\u043e\u0432\u044b\u0439 \u043c\u0435\u0447',
  'diamond_sword': '\u0430\u043b\u043c\u0430\u0437\u043d\u044b\u0439 \u043c\u0435\u0447',
  'iron_sword': '\u0436\u0435\u043b\u0435\u0437\u043d\u044b\u0439 \u043c\u0435\u0447',
  'stone_sword': '\u043a\u0430\u043c\u0435\u043d\u043d\u044b\u0439 \u043c\u0435\u0447',
  'golden_sword': '\u0437\u043e\u043b\u043e\u0442\u043e\u0439 \u043c\u0435\u0447',
  'wooden_sword': '\u0434\u0435\u0440\u0435\u0432\u044f\u043d\u043d\u044b\u0439 \u043c\u0435\u0447',
  'golden_carrot': '\u0437\u043e\u043b\u043e\u0442\u0430\u044f \u043c\u043e\u0440\u043a\u043e\u0432\u043a\u0430',
  'cooked_beef': '\u0441\u0442\u0435\u0439\u043a', 'cooked_porkchop': '\u0436\u0430\u0440\u0435\u043d\u0430\u044f \u0441\u0432\u0438\u043d\u0438\u043d\u0430',
  'cooked_mutton': '\u0436\u0430\u0440\u0435\u043d\u0430\u044f \u0431\u0430\u0440\u0430\u043d\u0438\u043d\u0430',
  'cooked_salmon': '\u0436\u0430\u0440\u0435\u043d\u044b\u0439 \u043b\u043e\u0441\u043e\u0441\u044c',
  'cooked_chicken': '\u0436\u0430\u0440\u0435\u043d\u0430\u044f \u043a\u0443\u0440\u0438\u0446\u0430',
  'cooked_rabbit': '\u0436\u0430\u0440\u0435\u043d\u044b\u0439 \u043a\u0440\u043e\u043b\u0438\u043a',
  'cooked_cod': '\u0436\u0430\u0440\u0435\u043d\u0430\u044f \u0442\u0440\u0435\u0441\u043a\u0430',
  'bread': '\u0445\u043b\u0435\u0431', 'baked_potato': '\u043f\u0435\u0447\u0451\u043d\u044b\u0439 \u043a\u0430\u0440\u0442\u043e\u0444\u0435\u043b\u044c',
  'apple': '\u044f\u0431\u043b\u043e\u043a\u043e', 'melon_slice': '\u0434\u043e\u043b\u044c\u043a\u0430 \u0430\u0440\u0431\u0443\u0437\u0430',
  'sweet_berries': '\u0441\u043b\u0430\u0434\u043a\u0438\u0435 \u044f\u0433\u043e\u0434\u044b',
  'dried_kelp': '\u0441\u0443\u0448\u0451\u043d\u0430\u044f \u043c\u043e\u0440\u0441\u043a\u0430\u044f \u043a\u0430\u043f\u0443\u0441\u0442\u0430',
  'carrot': '\u043c\u043e\u0440\u043a\u043e\u0432\u043a\u0430', 'potato': '\u043a\u0430\u0440\u0442\u043e\u0444\u0435\u043b\u044c'
};

function ru(name) { return ITEM_NAMES_RU[name] || MOB_NAMES_RU[name] || name; }

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
  reconnectAttempt = 0;
  lastHealth = 20;

  log(`\u041f\u043e\u0434\u043a\u043b\u044e\u0447\u0435\u043d\u0438\u0435 \u043a\u0430\u043a "${cfg.botNick}" \u043a ${cfg.serverHost}:${cfg.serverPort}...`);

  bot = mineflayer.createBot({
    host: cfg.serverHost,
    port: cfg.serverPort,
    username: cfg.botNick,
    version: cfg.version,
    auth: 'offline',
    hideErrors: false
  });

  bot.on('login', () => {
    log('\u0412\u043e\u0448\u043b\u0438 \u043d\u0430 \u0441\u0435\u0440\u0432\u0435\u0440!');
    if (!navigationDone && !spawnHandled) {
      log('\u0416\u0434\u0451\u043c 8 \u0441\u0435\u043a \u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0443, \u043f\u043e\u0442\u043e\u043c /anarchy...');
      spawnHandled = true;
      setTimeout(() => navigateToAnarchy(), 8000);
    }
  });

  bot.on('spawn', () => {
    log('\u0421\u043f\u0430\u0432\u043d');
  });

  bot.on('windowOpen', (window) => {
    handleWindow(window);
  });

  bot.on('health', () => {
    tryAutoEat();
    checkPlayerDamage();
  });

  bot.on('end', (reason) => {
    log(`\u041e\u0442\u043a\u043b\u044e\u0447\u0435\u043d\u043e: ${reason}`);
    cleanup();
    bot = null;
  });

  bot.on('kicked', (reason) => {
    log(`\u041a\u0438\u043a\u043d\u0443\u0442: ${reason}`);
    cleanup();
  });

  bot.on('error', (err) => {
    log(`\u041e\u0448\u0438\u0431\u043a\u0430: ${err.message}`);
  });

  bot.on('message', (msg) => {
    const text = msg.toString();
    if (text.trim()) log(`[CHAT] ${text}`);
  });
}

function cleanup() {
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
    log('\u041e\u0442\u043f\u0440\u0430\u0432\u043b\u044f\u0435\u043c /anarchy...');
    bot.chat('/anarchy');
    log('\u0416\u0434\u0451\u043c GUI \u0432\u044b\u0431\u043e\u0440\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0430...');
  } catch (e) {
    log(`\u041e\u0448\u0438\u0431\u043a\u0430 \u043d\u0430\u0432\u0438\u0433\u0430\u0446\u0438\u0438: ${e.message}`);
  }
}

function handleWindow(window) {
  const title = window.title ? JSON.stringify(window.title) : '';
  log(`\u041e\u043a\u043d\u043e: ${title} (${window.slots.length} \u0441\u043b\u043e\u0442\u043e\u0432)`);
  logWindowSlots(window);

  let slot = findSlotWithCount(window, 2);
  if (slot === null) slot = findSlotByName(window, ['2']);

  if (slot !== null) {
    log(`\u0421\u0435\u0440\u0432\u0435\u0440 "2" \u0432 \u0441\u043b\u043e\u0442\u0435 ${slot}, \u043a\u043b\u0438\u043a\u0430\u0435\u043c...`);
    setTimeout(() => {
      bot.clickWindow(slot, 0, 0);
      log('\u041a\u043b\u0438\u043a\u043d\u0443\u043b\u0438! \u0416\u0434\u0451\u043c \u0442\u0435\u043b\u0435\u043f\u043e\u0440\u0442...');
      setTimeout(() => onNavigationDone(), 3000);
    }, 500);
  } else {
    log('\u041d\u0435 \u043d\u0430\u0448\u043b\u0438 \u0441\u043b\u043e\u0442, \u043f\u0440\u043e\u0431\u0443\u0435\u043c \u0441\u043b\u043e\u0442 12...');
    setTimeout(() => {
      bot.clickWindow(12, 0, 0);
      log('\u041a\u043b\u0438\u043a\u043d\u0443\u043b\u0438 \u0441\u043b\u043e\u0442 12! \u0416\u0434\u0451\u043c \u0442\u0435\u043b\u0435\u043f\u043e\u0440\u0442...');
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
  log('\u0424\u0410\u0420\u041c \u0410\u041a\u0422\u0418\u0412\u0415\u041d. \u041e\u0445\u043e\u0442\u0430 \u043d\u0430 \u043c\u043e\u0431\u043e\u0432 + \u043e\u0445\u0440\u0430\u043d\u0430...');

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
  log('\u041e\u0445\u0440\u0430\u043d\u0430: \u043f\u0440\u043e\u0432\u0435\u0440\u043a\u0430 \u0438\u0433\u0440\u043e\u043a\u043e\u0432 \u043a\u0430\u0436\u0434\u044b\u0435 2\u0441');
}

function stopGuardScan() {
  if (guardScanTimer) {
    clearInterval(guardScanTimer);
    guardScanTimer = null;
  }
}

function isAtSpawn() {
  if (!bot || !bot.entity) return true;
  const pos = bot.entity.position;
  return Math.abs(pos.x) < 100 && Math.abs(pos.z) < 100;
}

function scanNearbyPlayers() {
  if (!bot || !bot.entity) return;
  if (isAtSpawn()) return;

  for (const name of Object.keys(bot.players)) {
    if (name === cfg.botNick) continue;
    if (settings.shouldIgnore(name)) continue;

    const playerData = bot.players[name];
    if (!playerData || !playerData.entity) continue;

    const dist = bot.entity.position.distanceTo(playerData.entity.position);
    if (dist > 200) continue;

    log(`[\u041e\u0425\u0420\u0410\u041d\u0410] \u0412\u0440\u0430\u0433 "${name}" \u043d\u0430 \u0440\u0430\u0441\u0441\u0442\u043e\u044f\u043d\u0438\u0438 ${Math.floor(dist)} \u0431\u043b\u043e\u043a\u043e\u0432!`);
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

  const attempt = reconnectAttempt + 1;
  const tgText = `[PRISSET BOT] \u0412\u0430\u0441 \u0440\u0435\u0439\u0434\u044f\u0442!\n\u0420\u0435\u0439\u0434\u0435\u0440: ${username}\n\u041a\u043e\u043e\u0440\u0434\u0438\u043d\u0430\u0442\u044b \u0440\u0435\u0439\u0434\u0435\u0440\u0430: ${enemyPos}\n\u041a\u043e\u043e\u0440\u0434\u0438\u043d\u0430\u0442\u044b \u0431\u043e\u0442\u0430: ${botPos}\n\u0411\u043e\u0442: ${selfName}\n\u041f\u043e\u043f\u044b\u0442\u043a\u0430: ${attempt}/3`;
  sendTelegram(tgText);

  log(`\u0412\u0420\u0410\u0413: ${username} \u043d\u0430 ${enemyPos}. \u041e\u0442\u043a\u043b\u044e\u0447\u0430\u0435\u043c\u0441\u044f... (\u043f\u043e\u043f\u044b\u0442\u043a\u0430 ${attempt}/3)`);
  lastEnemyName = username;

  if (bot) {
    bot.quit('Raid detected');
  }

  if (reconnectAttempt >= RECONNECT_DELAYS.length) {
    log('\u0412\u0441\u0435 \u043f\u043e\u043f\u044b\u0442\u043a\u0438 \u0438\u0441\u0447\u0435\u0440\u043f\u0430\u043d\u044b. \u0417\u0410\u0412\u0415\u0420\u0428\u0415\u041d\u0418\u0415.');
    sendTelegram(`[PRISSET BOT] \u0412\u0441\u0435 3 \u043f\u043e\u043f\u044b\u0442\u043a\u0438 \u0440\u0435\u043a\u043e\u043d\u043d\u0435\u043a\u0442\u0430 \u0438\u0441\u0447\u0435\u0440\u043f\u0430\u043d\u044b. \u0412\u0440\u0430\u0433 \u043d\u0435 \u0443\u0445\u043e\u0434\u0438\u0442. \u0411\u043e\u0442 \u0432\u044b\u043a\u043b\u044e\u0447\u0435\u043d.`);
    bot = null;
    reconnecting = false;
    log('\u0411\u043e\u0442 \u043e\u0441\u0442\u0430\u043d\u043e\u0432\u043b\u0435\u043d. /start \u0434\u043b\u044f \u043f\u0435\u0440\u0435\u0437\u0430\u043f\u0443\u0441\u043a\u0430.');
    return;
  }

  const delay = RECONNECT_DELAYS[reconnectAttempt];
  const delayMin = Math.floor(delay / 60000);
  log(`\u0416\u0434\u0451\u043c ${delayMin} \u043c\u0438\u043d\u0443\u0442 \u043f\u0435\u0440\u0435\u0434 \u0440\u0435\u043a\u043e\u043d\u043d\u0435\u043a\u0442\u043e\u043c...`);
  reconnecting = true;
  reconnectAttempt++;
  await sleep(delay);

  if (!reconnecting) return;

  log(`\u0420\u0435\u043a\u043e\u043d\u043d\u0435\u043a\u0442 \u0434\u043b\u044f \u043f\u0440\u043e\u0432\u0435\u0440\u043a\u0438 (\u043f\u043e\u043f\u044b\u0442\u043a\u0430 ${reconnectAttempt}/3)...`);
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

  let checkDone = false;

  bot.on('login', () => {
    log('[\u041f\u0420\u041e\u0412\u0415\u0420\u041a\u0410] \u0412\u043e\u0448\u043b\u0438, \u043e\u0442\u043f\u0440\u0430\u0432\u043b\u044f\u0435\u043c /anarchy...');
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
      log('[\u041f\u0420\u041e\u0412\u0415\u0420\u041a\u0410] \u041d\u0435\u043e\u0436\u0438\u0434\u0430\u043d\u043d\u043e\u0435 \u043e\u0442\u043a\u043b\u044e\u0447\u0435\u043d\u0438\u0435');
      bot = null;
      reconnecting = false;
    }
  });

  bot.on('error', (err) => {
    log(`[\u041f\u0420\u041e\u0412\u0415\u0420\u041a\u0410] \u041e\u0448\u0438\u0431\u043a\u0430: ${err.message}`);
  });

  function recheckEnemies() {
    if (!bot || checkDone) return;
    checkDone = true;

    let enemyName = null;
    let enemyEntity = null;
    for (const name of Object.keys(bot.players)) {
      if (name === cfg.botNick) continue;
      if (settings.shouldIgnore(name)) continue;
      const pd = bot.players[name];
      if (!pd || !pd.entity) continue;
      const dist = bot.entity ? bot.entity.position.distanceTo(pd.entity.position) : 999;
      if (dist <= 200) {
        enemyName = name;
        enemyEntity = pd.entity;
        log(`[\u041f\u0420\u041e\u0412\u0415\u0420\u041a\u0410] \u0412\u0440\u0430\u0433 "${name}" \u0432\u0441\u0451 \u0435\u0449\u0451 \u0442\u0443\u0442, \u0434\u0438\u0441\u0442\u0430\u043d\u0446\u0438\u044f ${Math.floor(dist)}`);
        break;
      }
    }

    if (enemyName) {
      if (bot) bot.quit('Enemy still here');
      bot = null;

      if (lastEnemyName && enemyName.toLowerCase() === lastEnemyName.toLowerCase()) {
        log(`[\u041f\u0420\u041e\u0412\u0415\u0420\u041a\u0410] \u0422\u043e\u0442 \u0436\u0435 \u0440\u0435\u0439\u0434\u0435\u0440 "${enemyName}" \u043d\u0435 \u0443\u0448\u0451\u043b. \u0417\u0410\u0412\u0415\u0420\u0428\u0415\u041d\u0418\u0415!`);
        sendTelegram(`[PRISSET BOT] \u0420\u0435\u0439\u0434\u0435\u0440 "${enemyName}" \u043d\u0435 \u0443\u0445\u043e\u0434\u0438\u0442. \u0411\u043e\u0442 \u0432\u044b\u043a\u043b\u044e\u0447\u0435\u043d.`);
        reconnecting = false;
        log('\u0411\u043e\u0442 \u043e\u0441\u0442\u0430\u043d\u043e\u0432\u043b\u0435\u043d. /start \u0434\u043b\u044f \u043f\u0435\u0440\u0435\u0437\u0430\u043f\u0443\u0441\u043a\u0430.');
      } else {
        log(`[\u041f\u0420\u041e\u0412\u0415\u0420\u041a\u0410] \u041d\u043e\u0432\u044b\u0439 \u0432\u0440\u0430\u0433 "${enemyName}". \u042d\u0441\u043a\u0430\u043b\u0430\u0446\u0438\u044f...`);
        handleEnemyDetected(enemyName, enemyEntity.position);
      }
    } else {
      log('[\u041f\u0420\u041e\u0412\u0415\u0420\u041a\u0410] \u0427\u0438\u0441\u0442\u043e! \u0412\u043e\u0437\u043e\u0431\u043d\u043e\u0432\u043b\u044f\u0435\u043c \u0444\u0430\u0440\u043c...');
      sendTelegram(`[PRISSET BOT] \u0411\u0430\u0437\u0430 \u0447\u0438\u0441\u0442\u0430. \u0424\u0430\u0440\u043c \u0432\u043e\u0437\u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d.`);
      reconnecting = false;
      reconnectAttempt = 0;
      lastEnemyName = null;
      lastHealth = 20;

      navigationDone = true;
      guardActive = true;
      farmActive = true;

      startGuardScan();
      startFarmLoop();
      startAutoEat();
      equipBestSword();

      bot.on('health', () => {
        tryAutoEat();
        checkPlayerDamage();
      });
      bot.on('end', (reason) => {
        log(`\u041e\u0442\u043a\u043b\u044e\u0447\u0435\u043d\u043e: ${reason}`);
        cleanup();
        bot = null;
      });
      bot.on('kicked', (reason) => {
        log(`\u041a\u0438\u043a\u043d\u0443\u0442: ${reason}`);
        cleanup();
      });
      bot.on('error', (err) => log(`Error: ${err.message}`));
      bot.on('message', (msg) => {
        const text = msg.toString();
        if (text.trim()) log(`[CHAT] ${text}`);
      });

      log('\u0424\u0410\u0420\u041c \u0410\u041a\u0422\u0418\u0412\u0415\u041d.');
    }
  }
}

// =====================
// FARMING (mob hunting)
// =====================

let statusLogCounter = 0;

function startFarmLoop() {
  stopFarmLoop();
  statusLogCounter = 0;
  farmLoopTimer = setInterval(() => {
    if (!bot || !farmActive || !bot.entity) return;
    statusLogCounter++;
    if (statusLogCounter % 60 === 0) logInventoryStatus();
    farmTick();
  }, 500);
  log('\u0424\u0430\u0440\u043c: \u043f\u043e\u0438\u0441\u043a \u043c\u043e\u0431\u043e\u0432 \u043a\u0430\u0436\u0434\u044b\u0435 0.5\u0441');
  logInventoryStatus();
}

function stopFarmLoop() {
  if (farmLoopTimer) {
    clearInterval(farmLoopTimer);
    farmLoopTimer = null;
  }
}

async function farmTick() {
  if (isAtSpawn()) return;
  if (isEating) return;

  const now = Date.now();
  if (now - lastAttackTime < ATTACK_COOLDOWN_MS) return;

  await ensureSwordEquipped();

  const mob = findNearestHostile();
  if (!mob) return;

  const dist = bot.entity.position.distanceTo(mob.position);
  if (dist > ATTACK_RANGE) return;

  const allMobs = countNearbyHostiles();
  log(`[\u0424\u0410\u0420\u041c] \u0410\u0442\u0430\u043a\u0443\u0435\u043c ${ru(mob.name)} (\u0434\u0438\u0441\u0442: ${dist.toFixed(1)}, \u043c\u043e\u0431\u043e\u0432 \u0440\u044f\u0434\u043e\u043c: ${allMobs})`);

  try {
    await bot.lookAt(mob.position.offset(0, mob.height * 0.85, 0));
    bot.attack(mob);
    lastAttackTime = now;
  } catch (e) {
    log(`[\u0424\u0410\u0420\u041c] \u041e\u0448\u0438\u0431\u043a\u0430 \u0430\u0442\u0430\u043a\u0438: ${e.message}`);
  }
}

async function ensureSwordEquipped() {
  if (!bot || !bot.inventory) return;
  const held = bot.heldItem;
  if (held && held.name.includes('sword')) return;

  const sword = findBestSword();
  if (!sword) return;

  try {
    await bot.equip(sword, 'hand');
    log(`[\u042d\u041a\u0418\u041f] ${ru(sword.name)}`);
  } catch {}
}

function findBestSword() {
  for (const tier of SWORD_TIERS) {
    const sword = bot.inventory.items().find(item => item.name === tier);
    if (sword) return sword;
  }
  const anySword = bot.inventory.items().find(item => item.name.includes('sword'));
  return anySword || null;
}

function logInventoryStatus() {
  if (!bot || !bot.inventory) return;

  const mainHand = bot.heldItem;
  const offHand = bot.inventory.slots[45];
  const mainStr = mainHand ? `${ru(mainHand.name)} x${mainHand.count}` : '\u043f\u0443\u0441\u0442\u043e';
  const offStr = offHand ? `${ru(offHand.name)} x${offHand.count}` : '\u043f\u0443\u0441\u0442\u043e';

  const foods = bot.inventory.items().filter(i => FOOD_VALUES[i.name]);
  const foodStr = foods.length
    ? foods.map(f => `${ru(f.name)} x${f.count}`).join(', ')
    : '\u043d\u0435\u0442';

  const swords = bot.inventory.items().filter(i => i.name.includes('sword'));
  const swordStr = swords.length
    ? swords.map(s => ru(s.name)).join(', ')
    : '\u043d\u0435\u0442';

  const mobs = countNearbyHostiles();

  log(`[\u0421\u0422\u0410\u0422\u0423\u0421] \u0425\u041f: ${Math.floor(bot.health)} | \u0413\u043e\u043b\u043e\u0434: ${bot.food} | \u0420\u0443\u043a\u0430: ${mainStr} | \u041b\u0435\u0432\u0430\u044f: ${offStr}`);
  log(`[\u0421\u0422\u0410\u0422\u0423\u0421] \u041c\u0435\u0447\u0438: ${swordStr} | \u0415\u0434\u0430: ${foodStr} | \u041c\u043e\u0431\u043e\u0432 \u0440\u044f\u0434\u043e\u043c: ${mobs}`);

  const allItems = bot.inventory.slots
    .filter(s => s !== null && s !== undefined)
    .map(s => `${s.name}(${s.slot})`)
    .join(', ');
  log(`[\u0418\u041d\u0412\u0415\u041d\u0422\u0410\u0420\u042c] ${allItems || '\u043f\u0443\u0441\u0442\u043e'}`);

  if (mobs === 0) {
    const nearby = {};
    for (const entity of Object.values(bot.entities)) {
      if (!entity || entity === bot.entity || !entity.name || !entity.position) continue;
      if (bot.entity.position.distanceTo(entity.position) > 32) continue;
      nearby[entity.name] = (nearby[entity.name] || 0) + 1;
    }
    const names = Object.entries(nearby).map(([n, c]) => `${n}:${c}`).join(', ');
    if (names) log(`[\u0421\u0422\u0410\u0422\u0423\u0421] \u0412\u0441\u0435 \u044d\u043d\u0442\u0438\u0442\u0438 \u0440\u044f\u0434\u043e\u043c: ${names}`);
  }
}

function countNearbyHostiles() {
  let count = 0;
  for (const entity of Object.values(bot.entities)) {
    if (!entity || entity === bot.entity) continue;
    if (!entity.name || !HOSTILE_MOBS.has(entity.name)) continue;
    if (!entity.position) continue;
    if (bot.entity.position.distanceTo(entity.position) <= 32) count++;
  }
  return count;
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

let isEating = false;
let lastHealth = 20;

function checkPlayerDamage() {
  if (!bot || !bot.entity || !guardActive) return;
  if (isAtSpawn()) return;

  const hp = bot.health;
  if (hp >= lastHealth) {
    lastHealth = hp;
    return;
  }

  const dmg = lastHealth - hp;
  lastHealth = hp;

  for (const name of Object.keys(bot.players)) {
    if (name === cfg.botNick) continue;
    if (settings.shouldIgnore(name)) continue;
    const pd = bot.players[name];
    if (!pd || !pd.entity) continue;
    const dist = bot.entity.position.distanceTo(pd.entity.position);
    if (dist <= 8) {
      log(`[\u0423\u0420\u041e\u041d] \u041f\u043e\u043b\u0443\u0447\u0435\u043d \u0443\u0440\u043e\u043d ${dmg.toFixed(1)} HP! \u0412\u0440\u0430\u0433 "${name}" \u0440\u044f\u0434\u043e\u043c (${dist.toFixed(0)} \u0431\u043b). \u0417\u0410\u0412\u0415\u0420\u0428\u0415\u041d\u0418\u0415!`);

      let botPos = 'unknown';
      if (bot.entity) {
        const pos = bot.entity.position;
        botPos = `X: ${Math.floor(pos.x)}, Y: ${Math.floor(pos.y)}, Z: ${Math.floor(pos.z)}`;
      }
      const enemyPos = `X: ${Math.floor(pd.entity.position.x)}, Y: ${Math.floor(pd.entity.position.y)}, Z: ${Math.floor(pd.entity.position.z)}`;

      sendTelegram(`[PRISSET BOT] \u0411\u043e\u0442 \u043f\u043e\u043b\u0443\u0447\u0438\u043b \u0443\u0440\u043e\u043d \u043e\u0442 \u0438\u0433\u0440\u043e\u043a\u0430!\n\u0410\u0442\u0430\u043a\u0443\u044e\u0449\u0438\u0439: ${name}\n\u0423\u0440\u043e\u043d: ${dmg.toFixed(1)} HP\n\u041a\u043e\u043e\u0440\u0434\u0438\u043d\u0430\u0442\u044b \u0431\u043e\u0442\u0430: ${botPos}\n\u041a\u043e\u043e\u0440\u0434\u0438\u043d\u0430\u0442\u044b \u0432\u0440\u0430\u0433\u0430: ${enemyPos}\n\u0411\u043e\u0442 \u0432\u044b\u043a\u043b\u044e\u0447\u0435\u043d!`);

      if (bot) bot.quit('Player damage detected');
      cleanup();
      bot = null;
      reconnecting = false;
      log('\u0411\u043e\u0442 \u043f\u043e\u043b\u043d\u043e\u0441\u0442\u044c\u044e \u043e\u0441\u0442\u0430\u043d\u043e\u0432\u043b\u0435\u043d. /start \u0434\u043b\u044f \u043f\u0435\u0440\u0435\u0437\u0430\u043f\u0443\u0441\u043a\u0430.');
      return;
    }
  }
}

async function tryAutoEat() {
  if (!bot || !bot.entity) return;
  if (bot.food >= 14) return;
  if (isEating) return;

  const foodItem = findBestFood();
  if (!foodItem) {
    log(`[\u0415\u0414\u0410] \u041d\u0435\u0442 \u0435\u0434\u044b \u0432 \u0438\u043d\u0432\u0435\u043d\u0442\u0430\u0440\u0435! \u0413\u043e\u043b\u043e\u0434: ${bot.food}`);
    return;
  }

  isEating = true;

  try {
    log(`[\u0415\u0414\u0410] \u0415\u043c ${ru(foodItem.name)} x${foodItem.count} (\u0433\u043e\u043b\u043e\u0434: ${bot.food})...`);
    await bot.equip(foodItem, 'hand');
    await bot.consume();
    log(`[\u0415\u0414\u0410] \u0413\u043e\u0442\u043e\u0432\u043e. \u0413\u043e\u043b\u043e\u0434: ${bot.food}`);
  } catch (e) {
    log(`[\u0415\u0414\u0410] \u041f\u0440\u0435\u0440\u0432\u0430\u043d\u043e: ${e.message}`);
  }

  isEating = false;
  await ensureSwordEquipped();
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
  const sword = findBestSword();
  if (!sword) return;
  bot.equip(sword, 'hand').then(() => {
    log(`[\u042d\u041a\u0418\u041f] ${ru(sword.name)}`);
  }).catch(() => {});
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
        log('\u0421\u0442\u0430\u0442\u0443\u0441: \u0416\u0414\u0401\u041c \u0420\u0415\u041a\u041e\u041d\u041d\u0415\u041a\u0422 (\u0432\u0440\u0430\u0433 \u043e\u0431\u043d\u0430\u0440\u0443\u0436\u0435\u043d)');
      } else if (!bot) {
        log('\u0421\u0442\u0430\u0442\u0443\u0441: \u041e\u0424\u0424\u041b\u0410\u0419\u041d');
      } else {
        const mode = farmActive ? '\u0424\u0410\u0420\u041c' : guardActive ? '\u041e\u0425\u0420\u0410\u041d\u0410' : '\u041f\u041e\u0414\u041a\u041b\u042e\u0427\u0415\u041d\u0418\u0415';
        log(`\u0421\u0442\u0430\u0442\u0443\u0441: ${mode}`);
        if (bot.entity) {
          const pos = bot.entity.position;
          log(`\u041f\u043e\u0437\u0438\u0446\u0438\u044f: X:${Math.floor(pos.x)} Y:${Math.floor(pos.y)} Z:${Math.floor(pos.z)}`);
        }
        log(`\u0425\u041f: ${bot.health || '?'} | \u0413\u043e\u043b\u043e\u0434: ${bot.food || '?'}`);
        if (bot.inventory) {
          const mainHand = bot.heldItem;
          const offHand = bot.inventory.slots[45];
          log(`\u0420\u0443\u043a\u0430: ${mainHand ? ru(mainHand.name) : '\u043f\u0443\u0441\u0442\u043e'} | \u041b\u0435\u0432\u0430\u044f: ${offHand ? ru(offHand.name) : '\u043f\u0443\u0441\u0442\u043e'}`);
        }
        const players = Object.keys(bot.players).filter(n => n !== cfg.botNick);
        log(`\u0418\u0433\u0440\u043e\u043a\u0438 \u0440\u044f\u0434\u043e\u043c: ${players.length ? players.join(', ') : '\u043d\u0435\u0442'}`);
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
