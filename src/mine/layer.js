import { Vec3 } from 'vec3';
import mineState from './mineState.js';
import state from '../state.js';
import { log, sleep, sendTelegram } from '../utils.js';
import { buildSnake, reorderSnake } from './snake.js';
import { SKIP_BLOCKS, DANGEROUS_BLOCKS, MAX_REACH } from './constants.js';
import { isDangerous, ensurePick, needsDig, waitWhileEating } from './checks.js';
import { digTarget, digSimple } from './dig.js';
import { goToZone, stepToNext } from './movement.js';

export async function runLoop() {
  log('[MINE] Loop started');

  while (mineState.active && mineState.currentLayer >= mineState.zone.minY) {
    const topY = mineState.currentLayer;
    const bottomY = Math.max(mineState.currentLayer - 1, mineState.zone.minY);
    log(`[MINE] === Layer topY=${topY}, bottomY=${bottomY} ===`);
    await digLayer(topY, bottomY);
    if (!mineState.active) break;
    mineState.currentLayer -= 2;

    if (mineState.active && mineState.currentLayer >= mineState.zone.minY) {
      const bot = state.bot;
      if (bot && bot.entity) {
        const nextTopY = mineState.currentLayer;
        const targetY = nextTopY;
        const botY = Math.floor(bot.entity.position.y);
        if (botY > targetY) {
          log(`[MINE] Descending from Y=${botY} to next layer Y=${targetY}`);
          await descendToLevel(bot, targetY);
        }
      }
    }
  }

  if (mineState.active) {
    log(`[MINE] Zone done! (${mineState.mined} blocks)`);
    sendTelegram(`[PRISSET BOT] Zone done! ${mineState.mined} blocks`);
  }
  mineState.active = false;
  log('[MINE] Loop stopped');
}

async function digLayer(topY, bottomY) {
  const bot = state.bot;
  if (!bot || !bot.entity) return;

  const snake = reorderSnake(buildSnake(), bot);
  const botY = Math.floor(bot.entity.position.y);

  log(`[MINE] Snake: ${snake.length} positions, digging Y=${topY}..${bottomY}, bot at Y=${botY}`);

  if (isLayerEmpty(bot, snake, topY, bottomY)) {
    log(`[MINE] Layer Y=${topY}..${bottomY} is empty, skipping`);
    return;
  }

  const firstPos = snake[0];
  await goToZone(bot, firstPos.x, firstPos.z, topY + 1);
  if (!mineState.active || !bot.entity) return;

  for (let i = 0; i < snake.length; i++) {
    if (!mineState.active) return;
    if (!state.bot || !state.bot.entity) { await sleep(500); i--; continue; }

    if (state.isEating) { await waitWhileEating(); }
    if (!mineState.active) return;
    if (state.isManagingInventory) { await sleep(300); i--; continue; }

    const b = state.bot;

    if (isDangerous(b)) {
      b.clearControlStates();
      b.setControlState('back', true);
      b.setControlState('jump', true);
      await sleep(500);
      b.clearControlStates();
      i--;
      continue;
    }

    const p = snake[i];
    const next = snake[i + 1];

    const pTopNeeds = needsDig(b, new Vec3(p.x, topY, p.z));
    const pBotNeeds = topY !== bottomY && needsDig(b, new Vec3(p.x, bottomY, p.z));
    const nTopNeeds = next && needsDig(b, new Vec3(next.x, topY, next.z));
    const nBotNeeds = next && topY !== bottomY && needsDig(b, new Vec3(next.x, bottomY, next.z));

    const anythingToDig = pTopNeeds || pBotNeeds || nTopNeeds || nBotNeeds;

    if (!anythingToDig && next) {
      if (i % 20 === 0) {
        const pos = b.entity.position;
        const pct = mineState.total > 0 ? ((mineState.mined / mineState.total) * 100).toFixed(1) : '0';
        log(`[MINE] Skip ${i}/${snake.length} (air) | mined=${mineState.mined}/${mineState.total} (${pct}%) | bot@(${pos.x.toFixed(1)},${pos.y.toFixed(1)},${pos.z.toFixed(1)})`);
      }
      continue;
    }

    if (!await ensurePick(b)) {
      log('[MINE] No pickaxe! Stopping.');
      sendTelegram('[PRISSET BOT] No pickaxe! Mining stopped.');
      mineState.active = false;
      return;
    }

    const currentBotY = Math.floor(b.entity.position.y);
    if (currentBotY > topY + 2) {
      log(`[MINE] Bot drifted up to Y=${currentBotY}, re-descending to topY=${topY}`);
      await descendToLevel(b, topY);
      if (!mineState.active || !b.entity) return;
    }

    const walkY = Math.floor(b.entity.position.y);
    await stepToNext(b, p.x, p.z, walkY - 1);
    if (!mineState.active || !b.entity) return;

    if (i % 10 === 0) {
      const pos = b.entity.position;
      const pct = mineState.total > 0 ? ((mineState.mined / mineState.total) * 100).toFixed(1) : '0';
      log(`[MINE] Pos ${i}/${snake.length} (${p.x},${p.z}) | mined=${mineState.mined}/${mineState.total} (${pct}%) | bot@(${pos.x.toFixed(1)},${pos.y.toFixed(1)},${pos.z.toFixed(1)})`);
    }

    if (nTopNeeds || nBotNeeds) {
      const bPos = b.entity.position;
      const nextDist = Math.sqrt(Math.pow(next.x + 0.5 - bPos.x, 2) + Math.pow(next.z + 0.5 - bPos.z, 2));
      if (nextDist <= 3.5) {
        if (nTopNeeds) await digTarget(b, new Vec3(next.x, topY, next.z));
        if (!mineState.active) return;
        if (nBotNeeds) await digTarget(b, new Vec3(next.x, bottomY, next.z));
        if (!mineState.active) return;
      }
    }

    if (pTopNeeds) await digTarget(b, new Vec3(p.x, topY, p.z));
    if (!mineState.active) return;
    if (pBotNeeds) await digTarget(b, new Vec3(p.x, bottomY, p.z));
    if (!mineState.active) return;
  }
}

async function descendToLevel(bot, targetY) {
  const maxAttempts = 20;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (!mineState.active || !bot.entity) return;
    await waitWhileEating();
    if (!mineState.active || !bot.entity) return;

    const botY = Math.floor(bot.entity.position.y);
    if (botY <= targetY) {
      log(`[DESCEND] Reached Y=${botY} (target=${targetY})`);
      return;
    }

    const myX = Math.floor(bot.entity.position.x);
    const myZ = Math.floor(bot.entity.position.z);
    const feetBp = new Vec3(myX, botY - 1, myZ);
    const feetBlock = bot.blockAt(feetBp);
    const standingOnSolid = feetBlock && !SKIP_BLOCKS.has(feetBlock.name) && feetBlock.boundingBox !== 'empty';

    if (standingOnSolid && botY - 1 >= targetY - 1) {
      if (DANGEROUS_BLOCKS.has(feetBlock.name)) {
        log(`[DESCEND] Danger underfoot: ${feetBlock.name}`);
        return;
      }
      log(`[DESCEND] Digging underfoot Y=${botY - 1} to descend`);
      await digSimple(bot, feetBlock, feetBp);
      await sleep(100);
    }

    const belowFeet = new Vec3(myX, botY - 2, myZ);
    const belowBlock = bot.blockAt(belowFeet);
    const belowSolid = belowBlock && !SKIP_BLOCKS.has(belowBlock.name) && belowBlock.boundingBox !== 'empty';
    if (belowSolid && botY - 2 >= targetY - 1) {
      if (!DANGEROUS_BLOCKS.has(belowBlock.name)) {
        const eyePos = bot.entity.position.offset(0, bot.entity.eyeHeight, 0);
        if (eyePos.distanceTo(belowFeet.offset(0.5, 0.5, 0.5)) <= MAX_REACH) {
          await digSimple(bot, belowBlock, belowFeet);
          await sleep(100);
        }
      }
    }

    const startY = botY;
    const fallStart = Date.now();
    while (Date.now() - fallStart < 2000) {
      if (!bot.entity || !mineState.active) return;
      if (Math.floor(bot.entity.position.y) < startY) break;
      await sleep(50);
    }
  }

  if (mineState.active && bot.entity) {
    log(`[DESCEND] Done, Y=${Math.floor(bot.entity.position.y)} (target=${targetY})`);
  }
}

function isLayerEmpty(bot, snake, topY, bottomY) {
  const step = Math.max(1, Math.floor(snake.length / 10));
  for (let i = 0; i < snake.length; i += step) {
    const p = snake[i];
    const top = bot.blockAt(new Vec3(p.x, topY, p.z));
    if (top && !SKIP_BLOCKS.has(top.name) && top.boundingBox !== 'empty') return false;
    if (topY !== bottomY) {
      const bottom = bot.blockAt(new Vec3(p.x, bottomY, p.z));
      if (bottom && !SKIP_BLOCKS.has(bottom.name) && bottom.boundingBox !== 'empty') return false;
    }
  }
  return true;
}
