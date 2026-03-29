import { Vec3 } from 'vec3';
import mineState from './mineState.js';
import state from '../state.js';
import { log, sleep, sendTelegram } from '../utils.js';
import { buildSnake, reorderSnake } from './snake.js';
import { SKIP_BLOCKS } from './constants.js';
import { isDangerous, ensurePick, needsDig, waitWhileEating } from './checks.js';
import { digTarget } from './dig.js';
import { goToZone, stepToNext, descendToFloor } from './movement.js';

export async function runLoop() {
  log('[MINE] Loop started');

  while (mineState.active && mineState.currentLayer >= mineState.zone.minY) {
    const topY = mineState.currentLayer;
    const bottomY = Math.max(mineState.currentLayer - 1, mineState.zone.minY);
    const floorY = bottomY - 1;
    log(`[MINE] === Layer topY=${topY}, bottomY=${bottomY}, floorY=${floorY} ===`);
    await digLayer(topY, bottomY, floorY);
    if (!mineState.active) break;
    mineState.currentLayer -= 2;
  }

  if (mineState.active) {
    log(`[MINE] Zone done! (${mineState.mined} blocks)`);
    sendTelegram(`[PRISSET BOT] Zone done! ${mineState.mined} blocks`);
  }
  mineState.active = false;
  log('[MINE] Loop stopped');
}

async function digLayer(topY, bottomY, floorY) {
  const bot = state.bot;
  if (!bot || !bot.entity) return;

  const snake = reorderSnake(buildSnake(), bot);

  log(`[MINE] Snake: ${snake.length} positions, digging Y=${topY}..${bottomY}, walking on Y=${floorY}`);

  if (isLayerEmpty(bot, snake, topY, bottomY)) {
    log(`[MINE] Layer Y=${topY}..${bottomY} is empty, skipping`);
    return;
  }

  const firstPos = snake[0];
  await goToZone(bot, firstPos.x, firstPos.z, floorY + 1);
  if (!mineState.active || !bot.entity) return;

  const botY = Math.floor(bot.entity.position.y);
  if (botY > floorY + 2) {
    log(`[MINE] Bot at Y=${botY}, need to descend to Y=${floorY}`);
    await descendToFloor(bot, floorY);
  }

  for (let i = 0; i < snake.length; i++) {
    if (!mineState.active) return;
    if (!state.bot || !state.bot.entity) { await sleep(500); i--; continue; }

    await waitWhileEating();
    if (!mineState.active) return;
    if (state.isManagingInventory) { await sleep(300); i--; continue; }

    const b = state.bot;

    if (isDangerous(b)) {
      b.clearControlStates();
      b.setControlState('back', true);
      b.setControlState('jump', true);
      await sleep(500);
      b.clearControlStates();
      log('[MINE] Danger! stepping back');
      i--;
      continue;
    }

    if (!await ensurePick(b)) {
      log('[MINE] No pickaxe! Stopping.');
      sendTelegram('[PRISSET BOT] No pickaxe! Mining stopped.');
      mineState.active = false;
      return;
    }

    const p = snake[i];

    if (i % 10 === 0) {
      const pos = b.entity.position;
      const pct = mineState.total > 0 ? ((mineState.mined / mineState.total) * 100).toFixed(1) : '0';
      log(`[MINE] Pos ${i}/${snake.length} (${p.x},${p.z}) | mined=${mineState.mined}/${mineState.total} (${pct}%) | bot@(${pos.x.toFixed(1)},${pos.y.toFixed(1)},${pos.z.toFixed(1)})`);
    }

    const topBlock = new Vec3(p.x, topY, p.z);
    const bottomBlock = new Vec3(p.x, bottomY, p.z);

    const topNeeds = needsDig(b, topBlock);
    const bottomNeeds = topY !== bottomY && needsDig(b, bottomBlock);

    if (i % 10 === 0 || topNeeds) {
      const tb = b.blockAt(topBlock);
      const bb = topY !== bottomY ? b.blockAt(bottomBlock) : null;
      log(`[LAYER] (${p.x},${p.z}) top=${tb ? tb.name : 'null'}(${topNeeds ? 'DIG' : 'skip'}) bot=${bb ? bb.name : 'null'}(${bottomNeeds ? 'DIG' : 'skip'})`);
    }

    if (topNeeds) {
      await digTarget(b, topBlock);
    }
    if (!mineState.active) return;
    if (bottomNeeds) {
      await digTarget(b, bottomBlock);
    }
    if (!mineState.active) return;

    if (!topNeeds && !bottomNeeds) {
      await sleep(200);
    }

    const next = snake[i + 1];
    if (next) {
      await stepToNext(b, next.x, next.z, floorY);
    }
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
