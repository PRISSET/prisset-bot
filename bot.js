import mineflayer from 'mineflayer';
import { createInterface } from 'readline';
import pathfinderPkg from 'mineflayer-pathfinder';
import minecraftData from 'minecraft-data';
import * as settings from './settings.js';
import state from './src/state.js';
import { log, ru, sleep, sendTelegram } from './src/utils.js';
import { navigateToAnarchy, handleWindow } from './src/navigation.js';
import { startGuardScan, stopGuardScan, checkPlayerDamage, setEnemyHandler } from './src/guard.js';
import { handleEnemyDetected, setCleanBaseHandler } from './src/reconnect.js';
import { startAutoEat, stopAutoEat, tryAutoEat } from './src/food.js';
import { startFarmLoop, stopFarmLoop, equipBestSword, logInventoryStatus, countNearbyHostiles } from './src/farm.js';
import { getMiner } from './src/mine/index.js';

const { pathfinder: pathfinderPlugin, Movements } = pathfinderPkg;
const cfg = settings.load();
const miner = getMiner();
const MAX_CONNECT_ATTEMPTS = 5;
const CONNECT_RETRY_DELAY = 15000;
let connectAttempt = 0;

setEnemyHandler((name, pos) => {
  handleEnemyDetected(name, pos, cleanup);
});

setCleanBaseHandler(() => {
  setupPathfinder();
  startGuardScan();
  startAutoEat();
  resumeMode();
  bindBotEvents();
});

function cleanup() {
  stopGuardScan();
  stopFarmLoop();
  stopAutoEat();
  state.guardActive = false;
  state.farmActive = false;
  miner.stop();
}

function setupPathfinder() {
  if (!state.bot) return;
  try {
    const mcData = minecraftData(state.bot.version);
    const movements = new Movements(state.bot, mcData);
    movements.allow1by1towers = false;
    movements.scafoldingBlocks = [];
    state.bot.pathfinder.setMovements(movements);
    log('[PATH] Pathfinder ready');
  } catch (e) {
    log(`Pathfinder setup error: ${e.message}`);
  }
}

function resumeMode() {
  if (state.currentMode === 'mine' && miner.getCoords()) {
    const c = miner.getCoords();
    miner.start(c.x1, c.y1, c.z1, c.x2, c.y2, c.z2);
  } else {
    startFarmMode();
  }
}

function startFarmMode() {
  miner.stop();
  state.currentMode = 'farm';
  state.farmActive = true;
  state.guardActive = true;
  startFarmLoop();
  equipBestSword();
  log('ФАРМ АКТИВЕН. Охота на мобов + охрана...');
}

function onNavigationDone() {
  state.navigationDone = true;
  state.guardActive = true;

  setupPathfinder();
  startGuardScan();
  startAutoEat();
  resumeMode();
}

function bindBotEvents() {
  state.bot.on('health', () => {
    tryAutoEat().catch(e => log(`[ЕДА] Ошибка: ${e.message}`));
    checkPlayerDamage(cleanup);
  });

  state.bot.on('end', (reason) => {
    log(`Отключено: ${reason}`);
    cleanup();
    state.bot = null;
    if (!state.reconnecting) {
      retryConnect();
    }
  });

  state.bot.on('kicked', (reason) => {
    log(`Кикнут: ${reason}`);
    cleanup();
  });

  state.bot.on('error', (err) => {
    log(`Ошибка: ${err.message}`);
    if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED') {
      cleanup();
      state.bot = null;
      if (!state.reconnecting) {
        retryConnect();
      }
    }
  });

  state.bot.on('message', (msg) => {
    const text = msg.toString();
    if (text.trim()) log(`[CHAT] ${text}`);
  });
}

function retryConnect() {
  connectAttempt++;
  if (connectAttempt > MAX_CONNECT_ATTEMPTS) {
    log(`Не удалось подключиться за ${MAX_CONNECT_ATTEMPTS} попыток. /start для повтора.`);
    connectAttempt = 0;
    return;
  }
  log(`Реконнект через 15с... (попытка ${connectAttempt}/${MAX_CONNECT_ATTEMPTS})`);
  setTimeout(() => {
    if (!state.bot && !state.reconnecting) {
      startBot();
    }
  }, CONNECT_RETRY_DELAY);
}

function startBot() {
  state.navigationDone = false;
  state.guardActive = false;
  state.farmActive = false;
  state.spawnHandled = false;
  state.reconnecting = false;
  state.reconnectAttempt = 0;
  state.lastHealth = 20;

  log(`Подключение как "${cfg.botNick}" к ${cfg.serverHost}:${cfg.serverPort}...`);

  state.bot = mineflayer.createBot({
    host: cfg.serverHost,
    port: cfg.serverPort,
    username: cfg.botNick,
    version: cfg.version,
    auth: 'offline',
    hideErrors: false
  });

  state.bot.loadPlugin(pathfinderPlugin);

  state.bot.on('login', () => {
    log('Вошли на сервер!');
    connectAttempt = 0;
    if (!state.navigationDone && !state.spawnHandled) {
      log('Ждём 8 сек загрузку, потом /anarchy...');
      state.spawnHandled = true;
      setTimeout(() => navigateToAnarchy(), 8000);
    }
  });

  state.bot.on('spawn', () => {
    log('Спавн');
  });

  state.bot.on('windowOpen', (window) => {
    handleWindow(window, onNavigationDone);
  });

  bindBotEvents();
}

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
    /farm               - Switch to farm mode
    /mine x1 y1 z1 x2 y2 z2 - Mine area between coordinates
    /mine stop          - Stop mining
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

    case '/farm':
      if (!state.bot || !state.navigationDone) { log('Бот не подключен или не готов'); break; }
      startFarmMode();
      break;

    case '/mine': {
      if (!state.bot || !state.navigationDone) { log('Бот не подключен или не готов'); break; }
      const mineArgs = parts.slice(1);
      if (mineArgs[0] === 'stop') {
        miner.stop();
        state.currentMode = 'farm';
        log('[MINE] Копание остановлено');
        break;
      }
      if (mineArgs.length < 6) {
        log('Usage: /mine x1 y1 z1 x2 y2 z2');
        log('       /mine stop');
        break;
      }
      const coords = mineArgs.slice(0, 6).map(Number);
      if (coords.some(isNaN)) {
        log('Ошибка: координаты должны быть числами');
        break;
      }
      stopFarmLoop();
      state.farmActive = false;
      state.currentMode = 'mine';
      miner.start(coords[0], coords[1], coords[2], coords[3], coords[4], coords[5]);
      break;
    }

    case '/start':
      if (state.bot) { log('Already connected! Use /stop first'); break; }
      state.reconnecting = false;
      connectAttempt = 0;
      startBot();
      break;

    case '/stop':
      state.reconnecting = false;
      if (!state.bot) { log('Not connected'); break; }
      state.bot.quit('Manual stop');
      break;

    case '/status':
      if (state.reconnecting) {
        log('Статус: ЖДЁМ РЕКОННЕКТ (враг обнаружен)');
      } else if (!state.bot) {
        log('Статус: ОФФЛАЙН');
      } else {
        const mode = miner.isActive() ? 'КОПАНИЕ' : state.farmActive ? 'ФАРМ' : state.guardActive ? 'ОХРАНА' : 'ПОДКЛЮЧЕНИЕ';
        log(`Статус: ${mode}`);
        if (state.bot.entity) {
          const pos = state.bot.entity.position;
          log(`Позиция: X:${Math.floor(pos.x)} Y:${Math.floor(pos.y)} Z:${Math.floor(pos.z)}`);
        }
        log(`ХП: ${state.bot.health || '?'} | Голод: ${state.bot.food || '?'}`);
        if (state.bot.inventory) {
          const mainHand = state.bot.heldItem;
          const offHand = state.bot.inventory.slots[45];
          log(`Рука: ${mainHand ? ru(mainHand.name) : 'пусто'} | Левая: ${offHand ? ru(offHand.name) : 'пусто'}`);
        }
        if (miner.isActive()) {
          const info = miner.getInfo();
          const pct = info.total > 0 ? ((info.mined / info.total) * 100).toFixed(1) : '0';
          log(`Копание: ${info.mined}/${info.total} (${pct}%)`);
        }
        const players = Object.keys(state.bot.players).filter(n => n !== cfg.botNick);
        log(`Игроки рядом: ${players.length ? players.join(', ') : 'нет'}`);
      }
      break;

    case '/help':
      printHelp();
      break;

    case '/quit':
      state.reconnecting = false;
      if (state.bot) state.bot.quit('Shutdown');
      log('Bye!');
      process.exit(0);
      break;

    default:
      if (line.trim() && state.bot) {
        state.bot.chat(line.trim());
      } else if (line.trim()) {
        log('Not connected. Type /start');
      }
      break;
  }
}

console.log('');
console.log('  PRISSET BOT v4.0.0 (Modular Edition)');
console.log('  Type /help for commands');
console.log('  Type /settings to configure');
console.log('  Type /start to connect');
console.log('');

rl.on('line', (line) => {
  handleCommand(line);
});

rl.on('close', () => {
  if (state.bot) state.bot.quit('Shutdown');
  process.exit(0);
});
