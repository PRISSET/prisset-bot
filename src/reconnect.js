import mineflayer from 'mineflayer';
import pathfinderPkg from 'mineflayer-pathfinder';
import state from './state.js';
import { log, sleep, sendTelegram, RECONNECT_DELAYS } from './utils.js';
import { findSlotWithCount, findSlotByName } from './navigation.js';
import * as settings from '../settings.js';

const { pathfinder: pathfinderPlugin } = pathfinderPkg;

let onCleanBase = null;

export function setCleanBaseHandler(fn) {
  onCleanBase = fn;
}

export async function handleEnemyDetected(username, entityPos, cleanup) {
  const cfg = settings.get();
  state.guardActive = false;
  state.farmActive = false;
  cleanup();

  const selfName = cfg.botNick;
  const enemyPos = `X: ${Math.floor(entityPos.x)}, Y: ${Math.floor(entityPos.y)}, Z: ${Math.floor(entityPos.z)}`;
  let botPos = 'unknown';
  if (state.bot && state.bot.entity) {
    const pos = state.bot.entity.position;
    botPos = `X: ${Math.floor(pos.x)}, Y: ${Math.floor(pos.y)}, Z: ${Math.floor(pos.z)}`;
  }

  const attempt = state.reconnectAttempt + 1;
  const tgText = `[PRISSET BOT] Вас рейдят!\nРейдер: ${username}\nКоординаты рейдера: ${enemyPos}\nКоординаты бота: ${botPos}\nБот: ${selfName}\nПопытка: ${attempt}/3`;
  sendTelegram(tgText);

  log(`ВРАГ: ${username} на ${enemyPos}. Отключаемся... (попытка ${attempt}/3)`);
  state.lastEnemyName = username;

  if (state.bot) {
    state.bot.quit('Raid detected');
  }

  if (state.reconnectAttempt >= RECONNECT_DELAYS.length) {
    log('Все попытки исчерпаны. ЗАВЕРШЕНИЕ.');
    sendTelegram(`[PRISSET BOT] Все 3 попытки реконнекта исчерпаны. Враг не уходит. Бот выключен.`);
    state.bot = null;
    state.reconnecting = false;
    log('Бот остановлен. /start для перезапуска.');
    return;
  }

  const delay = RECONNECT_DELAYS[state.reconnectAttempt];
  const delayMin = Math.floor(delay / 60000);
  log(`Ждём ${delayMin} минут перед реконнектом...`);
  state.reconnecting = true;
  state.reconnectAttempt++;
  await sleep(delay);

  if (!state.reconnecting) return;

  log(`Реконнект для проверки (попытка ${state.reconnectAttempt}/3)...`);
  startReconnectCheck(cleanup);
}

function startReconnectCheck(cleanup) {
  const cfg = settings.get();

  state.bot = mineflayer.createBot({
    host: cfg.serverHost,
    port: cfg.serverPort,
    username: cfg.botNick,
    version: cfg.version,
    auth: 'offline',
    hideErrors: false
  });

  state.bot.loadPlugin(pathfinderPlugin);

  let checkDone = false;
  let connectFailed = false;

  state.bot.on('login', () => {
    log('[ПРОВЕРКА] Вошли, отправляем /anarchy...');
    setTimeout(() => {
      if (state.bot) state.bot.chat('/anarchy');
    }, 8000);
  });

  state.bot.on('windowOpen', (window) => {
    let slot = findSlotWithCount(window, 2);
    if (slot === null) slot = findSlotByName(window, ['2']);
    if (slot === null) slot = 12;

    setTimeout(() => {
      if (state.bot) state.bot.clickWindow(slot, 0, 0);
      setTimeout(() => recheckEnemies(), 5000);
    }, 500);
  });

  state.bot.on('end', () => {
    if (!checkDone && !connectFailed) {
      log('[ПРОВЕРКА] Неожиданное отключение');
      retryReconnect();
    }
  });

  state.bot.on('error', (err) => {
    log(`[ПРОВЕРКА] Ошибка: ${err.message}`);
    if (err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET') {
      connectFailed = true;
      state.bot = null;
      retryReconnect();
    }
  });

  function retryReconnect() {
    if (!state.reconnecting) return;
    state.bot = null;
    log('[ПРОВЕРКА] Повтор через 30с...');
    setTimeout(() => {
      if (!state.reconnecting) return;
      log('[ПРОВЕРКА] Повторный реконнект...');
      startReconnectCheck(cleanup);
    }, 30000);
  }

  function recheckEnemies() {
    if (!state.bot || checkDone) return;
    checkDone = true;

    let enemyName = null;
    let enemyEntity = null;
    for (const name of Object.keys(state.bot.players)) {
      if (name === cfg.botNick) continue;
      if (settings.shouldIgnore(name)) continue;
      const pd = state.bot.players[name];
      if (!pd || !pd.entity) continue;
      const dist = state.bot.entity ? state.bot.entity.position.distanceTo(pd.entity.position) : 999;
      if (dist <= 200) {
        enemyName = name;
        enemyEntity = pd.entity;
        log(`[ПРОВЕРКА] Враг "${name}" всё ещё тут, дистанция ${Math.floor(dist)}`);
        break;
      }
    }

    if (enemyName) {
      if (state.bot) state.bot.quit('Enemy still here');
      state.bot = null;

      if (state.lastEnemyName && enemyName.toLowerCase() === state.lastEnemyName.toLowerCase()) {
        log(`[ПРОВЕРКА] Тот же рейдер "${enemyName}" не ушёл. ЗАВЕРШЕНИЕ!`);
        sendTelegram(`[PRISSET BOT] Рейдер "${enemyName}" не уходит. Бот выключен.`);
        state.reconnecting = false;
        log('Бот остановлен. /start для перезапуска.');
      } else {
        log(`[ПРОВЕРКА] Новый враг "${enemyName}". Эскалация...`);
        handleEnemyDetected(enemyName, enemyEntity.position, cleanup);
      }
    } else {
      const modeLabel = state.currentMode === 'mine' ? 'Копание' : 'Фарм';
      log(`[ПРОВЕРКА] Чисто! Возобновляем ${modeLabel}...`);
      sendTelegram(`[PRISSET BOT] База чиста. ${modeLabel} возобновлен.`);
      state.reconnecting = false;
      state.reconnectAttempt = 0;
      state.lastEnemyName = null;
      state.lastHealth = 20;
      state.navigationDone = true;
      state.guardActive = true;

      if (state.bot) state.bot.removeAllListeners();
      if (onCleanBase) onCleanBase();
    }
  }
}
