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

const SWORD_TIERS = ['netherite_sword', 'diamond_sword'];
const ATTACK_RANGE = 4;
const ATTACK_COOLDOWN_MS = 600;
const CHEST_SEARCH_RANGE = 4;

const TRASH_ITEMS = new Set([
  'rotten_flesh', 'golden_sword', 'wooden_sword', 'stone_sword',
  'iron_sword', 'poisonous_potato', 'spider_eye'
]);

const STORE_IN_CHEST = new Set([
  'gold_ingot', 'gold_nugget'
]);

const PROTECTED_ITEMS = new Set([
  'netherite_sword', 'diamond_sword'
]);

let isManagingInventory = false;
let lastInventoryManageTime = 0;
const INVENTORY_MANAGE_COOLDOWN = 30000;
let lastChestFoodSearchTime = 0;
const CHEST_FOOD_SEARCH_COOLDOWN = 60000;

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
  let connectFailed = false;

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
    if (!checkDone && !connectFailed) {
      log('[\u041f\u0420\u041e\u0412\u0415\u0420\u041a\u0410] \u041d\u0435\u043e\u0436\u0438\u0434\u0430\u043d\u043d\u043e\u0435 \u043e\u0442\u043a\u043b\u044e\u0447\u0435\u043d\u0438\u0435');
      retryReconnect();
    }
  });

  bot.on('error', (err) => {
    log(`[\u041f\u0420\u041e\u0412\u0415\u0420\u041a\u0410] \u041e\u0448\u0438\u0431\u043a\u0430: ${err.message}`);
    if (err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET') {
      connectFailed = true;
      bot = null;
      retryReconnect();
    }
  });

  function retryReconnect() {
    if (!reconnecting) return;
    bot = null;
    log('[\u041f\u0420\u041e\u0412\u0415\u0420\u041a\u0410] \u041f\u043e\u0432\u0442\u043e\u0440 \u0447\u0435\u0440\u0435\u0437 30\u0441...');
    setTimeout(() => {
      if (!reconnecting) return;
      log('[\u041f\u0420\u041e\u0412\u0415\u0420\u041a\u0410] \u041f\u043e\u0432\u0442\u043e\u0440\u043d\u044b\u0439 \u0440\u0435\u043a\u043e\u043d\u043d\u0435\u043a\u0442...');
      startReconnectCheck();
    }, 30000);
  }

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
    if (statusLogCounter % 60 === 0) {
      logInventoryStatus();
      manageInventory().catch(e => log(`[\u0418\u041d\u0412\u0415\u041d\u0422\u0410\u0420\u042c] \u041e\u0448\u0438\u0431\u043a\u0430: ${e.message}`));
    }
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
  if (isManagingInventory) return;

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
  if (held && SWORD_TIERS.includes(held.name)) return;

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
  return null;
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
    tryAutoEat().catch(e => log(`[\u0415\u0414\u0410] \u041e\u0448\u0438\u0431\u043a\u0430: ${e.message}`));
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
let lastHungryTgTime = 0;

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
  if (isManagingInventory) return;

  const offhand = bot.inventory.slots[45];
  if (offhand && FOOD_VALUES[offhand.name]) {
    isEating = true;
    try {
      log(`[\u0415\u0414\u0410] \u0415\u043c ${ru(offhand.name)} \u0438\u0437 \u043b\u0435\u0432\u043e\u0439 \u0440\u0443\u043a\u0438 (\u0433\u043e\u043b\u043e\u0434: ${bot.food})...`);
      bot.activateItem(true);
      await sleep(1800);
      bot.deactivateItem();
      log(`[\u0415\u0414\u0410] \u0413\u043e\u0442\u043e\u0432\u043e. \u0413\u043e\u043b\u043e\u0434: ${bot.food}`);
    } catch (e) {
      log(`[\u0415\u0414\u0410] \u041f\u0440\u0435\u0440\u0432\u0430\u043d\u043e: ${e.message}`);
    }
    isEating = false;
    return;
  }

  let foodItem = findBestFood();
  if (!foodItem) {
    const now = Date.now();
    if (now - lastChestFoodSearchTime < CHEST_FOOD_SEARCH_COOLDOWN) {
      log(`[\u0415\u0414\u0410] \u041d\u0435\u0442 \u0435\u0434\u044b! \u0413\u043e\u043b\u043e\u0434: ${bot.food}`);
      return;
    }
    lastChestFoodSearchTime = now;
    log(`[\u0415\u0414\u0410] \u041d\u0435\u0442 \u0435\u0434\u044b \u0432 \u0438\u043d\u0432\u0435\u043d\u0442\u0430\u0440\u0435, \u0438\u0449\u0443 \u0432 \u0441\u0443\u043d\u0434\u0443\u043a\u0430\u0445...`);
    const found = await takeFoodFromChest();
    if (found) {
      foodItem = findBestFood();
    }
    if (!foodItem) {
      log(`[\u0415\u0414\u0410] \u041d\u0435\u0442 \u0435\u0434\u044b! \u0413\u043e\u043b\u043e\u0434: ${bot.food}`);
      const now = Date.now();
      if (now - lastHungryTgTime > 5 * 60 * 1000) {
        lastHungryTgTime = now;
        sendTelegram(`[PRISSET BOT] \u044f \u0445\u043e\u0447\u0443 \u0416\u0420\u0410\u0422\u042c \u0414\u0410\u0419\u0422\u0415 \u041f\u041e\u0416\u0420\u0410\u0422\u042c \u041c\u041d\u0415\n\u0413\u043e\u043b\u043e\u0434: ${bot.food}/20`);
      }
      if (bot && bot.food <= 6) {
        log(`[\u0415\u0414\u0410] \u041a\u0440\u0438\u0442\u0438\u0447\u0435\u0441\u043a\u0438\u0439 \u0433\u043e\u043b\u043e\u0434 (${bot.food}), \u043d\u0435\u0442 \u0435\u0434\u044b. \u041e\u0442\u043a\u043b\u044e\u0447\u0430\u0435\u043c\u0441\u044f!`);
        sendTelegram(`[PRISSET BOT] \u041a\u0440\u0438\u0442\u0438\u0447\u0435\u0441\u043a\u0438\u0439 \u0433\u043e\u043b\u043e\u0434 (${bot.food}/20), \u0435\u0434\u044b \u043d\u0435\u0442. \u0411\u043e\u0442 \u043e\u0442\u043a\u043b\u044e\u0447\u0438\u043b\u0441\u044f.`);
        if (bot) bot.quit('No food, starving');
        cleanup();
        bot = null;
        log('\u0411\u043e\u0442 \u043e\u0441\u0442\u0430\u043d\u043e\u0432\u043b\u0435\u043d. /start \u0434\u043b\u044f \u043f\u0435\u0440\u0435\u0437\u0430\u043f\u0443\u0441\u043a\u0430.');
      }
      return;
    }
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
// INVENTORY MANAGEMENT (chests, trash, storage)
// =====================

function openChest(block) {
  return new Promise(async (resolve, reject) => {
    let resolved = false;
    let windowId = null;

    function done(err, win) {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      bot._client.removeListener('open_window', onOpenRaw);
      bot._client.removeListener('window_items', onItems);
      bot._client.removeListener('set_slot', onSetSlot);
      if (err) reject(err);
      else resolve(win);
    }

    const timeout = setTimeout(() => {
      if (windowId !== null && bot.currentWindow) {
        done(null, bot.currentWindow);
        return;
      }
      log(`[\u0421\u0423\u041d\u0414\u0423\u041a] \u0422\u0430\u0439\u043c\u0430\u0443\u0442 \u043e\u0442\u043a\u0440\u044b\u0442\u0438\u044f ${block.name} \u043d\u0430 ${block.position}`);
      done(new Error('timeout 8s'));
    }, 8000);

    function onOpenRaw(packet) {
      if (resolved) return;
      windowId = packet.windowId;
    }

    function onItems(packet) {
      if (resolved) return;
      if (packet.windowId === 0) return;
      setTimeout(() => {
        if (bot.currentWindow) done(null, bot.currentWindow);
      }, 300);
    }

    let setSlotCount = 0;
    let setSlotTimer = null;

    function onSetSlot(packet) {
      if (resolved) return;
      if (packet.windowId === 0 || packet.windowId === -1) return;
      setSlotCount++;
      if (setSlotTimer) clearTimeout(setSlotTimer);
      setSlotTimer = setTimeout(() => {
        if (resolved) return;
        if (bot.currentWindow) done(null, bot.currentWindow);
      }, 500);
    }

    bot._client.on('open_window', onOpenRaw);
    bot._client.on('window_items', onItems);
    bot._client.on('set_slot', onSetSlot);

    try {
      const pos = block.position;
      await bot.lookAt(pos.offset(0.5, 0.5, 0.5), true);
      bot._client.write('block_place', {
        location: pos,
        direction: 1,
        hand: 0,
        cursorX: 0.5,
        cursorY: 0.5,
        cursorZ: 0.5,
        insideBlock: false,
        sequence: 0
      });
      bot.swingArm();
    } catch (e) {
      done(e);
    }
  });
}

function findNearbyChests() {
  if (!bot || !bot.entity) return [];
  const chests = [];
  const pos = bot.entity.position;

  for (let dx = -CHEST_SEARCH_RANGE; dx <= CHEST_SEARCH_RANGE; dx++) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dz = -CHEST_SEARCH_RANGE; dz <= CHEST_SEARCH_RANGE; dz++) {
        const block = bot.blockAt(pos.offset(dx, dy, dz));
        if (!block) continue;
        if (block.name === 'chest' || block.name === 'trapped_chest' || block.name === 'barrel') {
          chests.push(block);
        }
      }
    }
  }

  chests.sort((a, b) => {
    const da = pos.distanceTo(a.position);
    const db = pos.distanceTo(b.position);
    return da - db;
  });

  return chests;
}

async function takeFoodFromChest() {
  if (!bot || !bot.entity || isManagingInventory) return false;

  const chests = findNearbyChests();
  if (chests.length === 0) {
    log('[\u0421\u0423\u041d\u0414\u0423\u041a] \u041d\u0435\u0442 \u0441\u0443\u043d\u0434\u0443\u043a\u043e\u0432 \u0440\u044f\u0434\u043e\u043c');
    return false;
  }

  isManagingInventory = true;

  for (const chest of chests) {
    try {
      const chestCenter = chest.position.offset(0.5, 0.5, 0.5);
      const dist = bot.entity.position.distanceTo(chest.position);
      log(`[\u0421\u0423\u041d\u0414\u0423\u041a] \u041e\u0442\u043a\u0440\u044b\u0432\u0430\u044e ${chest.name} \u043d\u0430 ${dist.toFixed(1)} \u0431\u043b.`);

      const emptySlot = bot.inventory.firstEmptyHotbarSlot();
      if (emptySlot !== null) {
        bot.setQuickBarSlot(emptySlot - bot.inventory.hotbarStart);
      }
      await sleep(100);

      await bot.lookAt(chestCenter);
      await sleep(300);

      const window = await openChest(chest);
      if (!window) continue;

      await sleep(500);

      const containerSlots = window.slots.filter((s, idx) => s && idx < window.inventoryStart);
      if (containerSlots.length > 0) {
        const names = containerSlots.map(i => `${i.name}x${i.count}`).join(', ');
        log(`[\u0421\u0423\u041d\u0414\u0423\u041a] \u0421\u043e\u0434\u0435\u0440\u0436\u0438\u043c\u043e\u0435: ${names}`);
      } else {
        log('[\u0421\u0423\u041d\u0414\u0423\u041a] \u041f\u0443\u0441\u0442\u043e\u0439');
        bot.closeWindow(window);
        await sleep(300);
        continue;
      }

      let tookFood = false;
      for (const item of containerSlots) {
        if (FOOD_VALUES[item.name]) {
          log(`[\u0421\u0423\u041d\u0414\u0423\u041a] \u0411\u0435\u0440\u0443 ${ru(item.name)} x${item.count} \u0438\u0437 \u0441\u043b\u043e\u0442\u0430 ${item.slot}`);
          try {
            await bot.clickWindow(item.slot, 0, 0);
            await sleep(200);
            tookFood = true;
          } catch (e) {
            log(`[\u0421\u0423\u041d\u0414\u0423\u041a] \u041e\u0448\u0438\u0431\u043a\u0430 \u0432\u0437\u044f\u0442\u0438\u044f: ${e.message}`);
          }
        }
      }

      bot.closeWindow(window);
      await sleep(300);

      if (tookFood) {
        isManagingInventory = false;
        return true;
      }
    } catch (e) {
      log(`[\u0421\u0423\u041d\u0414\u0423\u041a] \u041e\u0448\u0438\u0431\u043a\u0430 \u043e\u0442\u043a\u0440\u044b\u0442\u0438\u044f: ${e.message}`);
    }
  }

  isManagingInventory = false;
  return false;
}

async function manageInventory() {
  if (!bot || !bot.entity || isManagingInventory) return;
  if (isEating) return;

  const now = Date.now();
  if (now - lastInventoryManageTime < INVENTORY_MANAGE_COOLDOWN) return;
  lastInventoryManageTime = now;

  const trashItems = bot.inventory.items().filter(i => TRASH_ITEMS.has(i.name));
  const storeItems = bot.inventory.items().filter(i => STORE_IN_CHEST.has(i.name));

  if (trashItems.length === 0 && storeItems.length === 0) return;

  isManagingInventory = true;

  for (const item of trashItems) {
    if (PROTECTED_ITEMS.has(item.name)) continue;
    try {
      log(`[\u0418\u041d\u0412\u0415\u041d\u0422\u0410\u0420\u042c] \u0412\u044b\u0431\u0440\u0430\u0441\u044b\u0432\u0430\u044e ${ru(item.name)} x${item.count}`);
      await bot.tossStack(item);
      await sleep(300);
    } catch (e) {
      log(`[\u0418\u041d\u0412\u0415\u041d\u0422\u0410\u0420\u042c] \u041e\u0448\u0438\u0431\u043a\u0430 \u0432\u044b\u0431\u0440\u043e\u0441\u0430: ${e.message}`);
    }
  }

  if (storeItems.length > 0) {
    const chests = findNearbyChests();
    if (chests.length > 0) {
      for (const chest of chests) {
        try {
          const chestCenter = chest.position.offset(0.5, 0.5, 0.5);

          const emptySlot = bot.inventory.firstEmptyHotbarSlot();
          if (emptySlot !== null) {
            bot.setQuickBarSlot(emptySlot - bot.inventory.hotbarStart);
          }
          await sleep(100);

          await bot.lookAt(chestCenter);
          await sleep(300);

          const window = await openChest(chest);
          if (!window) continue;

          await sleep(500);

          const currentStore = bot.inventory.items().filter(i => STORE_IN_CHEST.has(i.name));
          for (const item of currentStore) {
            if (PROTECTED_ITEMS.has(item.name)) continue;
            log(`[\u0421\u0423\u041d\u0414\u0423\u041a] \u041a\u043b\u0430\u0434\u0443 ${ru(item.name)} x${item.count}`);
            try {
              await bot.clickWindow(item.slot, 0, 0);
              await sleep(200);
            } catch (e) {
              log(`[\u0421\u0423\u041d\u0414\u0423\u041a] \u041e\u0448\u0438\u0431\u043a\u0430 \u0441\u043a\u043b\u0430\u0434\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u044f: ${e.message}`);
            }
          }

          bot.closeWindow(window);
          await sleep(300);
          break;
        } catch (e) {
          log(`[\u0421\u0423\u041d\u0414\u0423\u041a] \u041e\u0448\u0438\u0431\u043a\u0430 \u043e\u0442\u043a\u0440\u044b\u0442\u0438\u044f: ${e.message}`);
        }
      }
    } else {
      log('[\u0421\u0423\u041d\u0414\u0423\u041a] \u041d\u0435\u0442 \u0441\u0443\u043d\u0434\u0443\u043a\u043e\u0432 \u0434\u043b\u044f \u0441\u043a\u043b\u0430\u0434\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u044f \u0437\u043e\u043b\u043e\u0442\u0430');
    }
  }

  isManagingInventory = false;
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
