import state from './state.js';
import { log, sendTelegram, isAtSpawn } from './utils.js';
import * as settings from '../settings.js';

let onEnemyDetected = null;

export function setEnemyHandler(handler) {
  onEnemyDetected = handler;
}

export function startGuardScan() {
  stopGuardScan();
  const cfg = settings.get();
  state.guardScanTimer = setInterval(() => {
    if (!state.bot || !state.guardActive) return;
    scanNearbyPlayers(cfg);
  }, 2000);
  log('Охрана: проверка игроков каждые 2с');
}

export function stopGuardScan() {
  if (state.guardScanTimer) {
    clearInterval(state.guardScanTimer);
    state.guardScanTimer = null;
  }
}

function scanNearbyPlayers(cfg) {
  if (!state.bot || !state.bot.entity) return;
  if (isAtSpawn(state.bot)) return;

  for (const name of Object.keys(state.bot.players)) {
    if (name === cfg.botNick) continue;
    if (settings.shouldIgnore(name)) continue;

    const playerData = state.bot.players[name];
    if (!playerData || !playerData.entity) continue;

    const dist = state.bot.entity.position.distanceTo(playerData.entity.position);
    if (dist > 200) continue;

    log(`[ОХРАНА] Враг "${name}" на расстоянии ${Math.floor(dist)} блоков!`);
    if (onEnemyDetected) onEnemyDetected(name, playerData.entity.position);
    return;
  }
}

export function checkPlayerDamage(onShutdown) {
  if (!state.bot || !state.bot.entity || !state.guardActive) return;
  if (isAtSpawn(state.bot)) return;

  const cfg = settings.get();
  const hp = state.bot.health;
  if (hp >= state.lastHealth) {
    state.lastHealth = hp;
    return;
  }

  const dmg = state.lastHealth - hp;
  state.lastHealth = hp;

  for (const name of Object.keys(state.bot.players)) {
    if (name === cfg.botNick) continue;
    if (settings.shouldIgnore(name)) continue;
    const pd = state.bot.players[name];
    if (!pd || !pd.entity) continue;
    const dist = state.bot.entity.position.distanceTo(pd.entity.position);
    if (dist <= 8) {
      log(`[УРОН] Получен урон ${dmg.toFixed(1)} HP! Враг "${name}" рядом (${dist.toFixed(0)} бл). ЗАВЕРШЕНИЕ!`);

      let botPos = 'unknown';
      if (state.bot.entity) {
        const pos = state.bot.entity.position;
        botPos = `X: ${Math.floor(pos.x)}, Y: ${Math.floor(pos.y)}, Z: ${Math.floor(pos.z)}`;
      }
      const enemyPos = `X: ${Math.floor(pd.entity.position.x)}, Y: ${Math.floor(pd.entity.position.y)}, Z: ${Math.floor(pd.entity.position.z)}`;

      sendTelegram(`[PRISSET BOT] Бот получил урон от игрока!\nАтакующий: ${name}\nУрон: ${dmg.toFixed(1)} HP\nКоординаты бота: ${botPos}\nКоординаты врага: ${enemyPos}\nБот выключен!`);

      if (state.bot) state.bot.quit('Player damage detected');
      onShutdown();
      state.bot = null;
      state.reconnecting = false;
      log('Бот полностью остановлен. /start для перезапуска.');
      return;
    }
  }
}
