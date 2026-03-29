import { Vec3 } from 'vec3';
import mineState from './mineState.js';
import { SKIP_BLOCKS, DANGEROUS_BLOCKS, MAX_REACH, MAX_DIG_RETRIES, DIG_DELAY, rnd } from './constants.js';
import { isInZone, isBlockBroken, canSafelyDig, waitWhileEating } from './checks.js';
import { log, sleep } from '../utils.js';

export const DIG_TOO_FAR = 'too_far';

function isAir(bot, bp) {
  const b = bot.blockAt(bp);
  return !b || SKIP_BLOCKS.has(b.name) || b.boundingBox === 'empty';
}

export async function digTarget(bot, bp) {
  if (!mineState.active || !bot.entity) return;

  const block = bot.blockAt(bp);
  if (!block) return;
  if (SKIP_BLOCKS.has(block.name) || block.boundingBox === 'empty') return;
  if (!canSafelyDig(bot, bp)) return;

  const eyePos = bot.entity.position.offset(0, bot.entity.eyeHeight, 0);
  const dist = eyePos.distanceTo(bp.offset(0.5, 0.5, 0.5));

  if (dist > MAX_REACH) return DIG_TOO_FAR;

  for (let attempt = 0; attempt < MAX_DIG_RETRIES; attempt++) {
    if (!mineState.active || !bot.entity) return;
    await waitWhileEating();
    if (!mineState.active) return;

    const current = bot.blockAt(bp);
    if (!current || SKIP_BLOCKS.has(current.name) || current.boundingBox === 'empty') {
      if (isInZone(bp)) mineState.mined++;
      break;
    }

    const useGlance = attempt > 0;

    const t0 = Date.now();
    const ok = await safeDig(bot, current, useGlance);

    if (!ok) {
      await sleep(rnd(50, 120));
      continue;
    }

    const confirmed = await waitForServerConfirm(bot, bp, 120);
    const totalDt = Date.now() - t0;

    if (confirmed) {
      if (isInZone(bp)) mineState.mined++;
      break;
    }

    log(`[DIG] Not broken attempt ${attempt + 1} ${current.name} @ (${bp.x},${bp.y},${bp.z}) ${totalDt}ms`);
    await sleep(rnd(30, 70));
  }

  if (mineState.mined > 0 && mineState.mined % 50 === 0) {
    const pct = ((mineState.mined / mineState.total) * 100).toFixed(1);
    log(`[MINE] Progress: ${mineState.mined}/${mineState.total} (${pct}%) [layer Y=${mineState.currentLayer}]`);
  }
}

const FACE_OFFSETS = [
  [0.5, 1.0, 0.5],
  [0.5, 0.0, 0.5],
  [0.5, 0.5, 0.0],
  [0.5, 0.5, 1.0],
  [0.0, 0.5, 0.5],
  [1.0, 0.5, 0.5],
];

export async function safeDig(bot, block, glance) {
  if (!mineState.active || !bot.entity) return false;

  const bp = block.position;
  const eyePos = bot.entity.position.offset(0, bot.entity.eyeHeight, 0);
  const dist = eyePos.distanceTo(bp.offset(0.5, 0.5, 0.5));

  if (dist > MAX_REACH) return false;

  if (glance) {
    const adj = findAdjacentBlock(bot, block);
    if (adj) {
      await bot.lookAt(adj.position.offset(0.5, 0.5, 0.5), false);
      await sleep(40);
    }
  }

  await bot.lookAt(bp.offset(0.5, 0.5, 0.5), false);
  await sleep(40);

  try {
    await bot.dig(block, 'raycast');
    return true;
  } catch (err) {
    if (err.message === 'Digging aborted') return false;
    if (err.message !== 'Block not in view') throw err;
  }

  for (const [fx, fy, fz] of FACE_OFFSETS) {
    if (!mineState.active || !bot.entity) return false;
    const facePoint = bp.offset(fx, fy, fz);
    const freshEye = bot.entity.position.offset(0, bot.entity.eyeHeight, 0);
    if (freshEye.distanceTo(facePoint) > MAX_REACH) continue;

    await bot.lookAt(facePoint, false);
    await sleep(40);

    try {
      const freshBlock = bot.blockAt(bp);
      if (!freshBlock || SKIP_BLOCKS.has(freshBlock.name) || freshBlock.boundingBox === 'empty') return true;
      await bot.dig(freshBlock, 'raycast');
      return true;
    } catch (err2) {
      if (err2.message === 'Digging aborted') return false;
      if (err2.message !== 'Block not in view') throw err2;
    }
  }

  return false;
}

export async function digSimple(bot, block, bp) {
  if (!mineState.active || !bot.entity) return false;
  if (!block || SKIP_BLOCKS.has(block.name) || block.boundingBox === 'empty') return true;
  if (DANGEROUS_BLOCKS.has(block.name)) return false;

  const eyePos = bot.entity.position.offset(0, bot.entity.eyeHeight, 0);
  if (eyePos.distanceTo(bp.offset(0.5, 0.5, 0.5)) > MAX_REACH) return false;

  await bot.lookAt(bp.offset(0.5, 0.5, 0.5), false);
  await sleep(40);

  try {
    await bot.dig(block, 'raycast');
    return isAir(bot, bp);
  } catch {
    for (const [fx, fy, fz] of FACE_OFFSETS) {
      if (!mineState.active || !bot.entity) return false;
      const freshEye = bot.entity.position.offset(0, bot.entity.eyeHeight, 0);
      const facePoint = bp.offset(fx, fy, fz);
      if (freshEye.distanceTo(facePoint) > MAX_REACH) continue;
      await bot.lookAt(facePoint, false);
      await sleep(40);
      try {
        const fresh = bot.blockAt(bp);
        if (!fresh || SKIP_BLOCKS.has(fresh.name) || fresh.boundingBox === 'empty') {
          if (isInZone(bp)) mineState.mined++;
          return true;
        }
        await bot.dig(fresh, 'raycast');
        const broken = isAir(bot, bp);
        if (broken && isInZone(bp)) mineState.mined++;
        return broken;
      } catch {
        continue;
      }
    }
    return false;
  }
}

async function waitForServerConfirm(bot, bp, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!bot.entity || !mineState.active) return false;
    if (isAir(bot, bp)) return true;
    await sleep(25);
  }
  return isAir(bot, bp);
}

function findAdjacentBlock(bot, block) {
  const pos = block.position;
  const offsets = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
  for (const [dx, dy, dz] of offsets) {
    const adj = bot.blockAt(pos.offset(dx, dy, dz));
    if (adj && !SKIP_BLOCKS.has(adj.name) && adj.boundingBox !== 'empty') {
      const eyePos = bot.entity.position.offset(0, bot.entity.eyeHeight, 0);
      if (eyePos.distanceTo(adj.position.offset(0.5, 0.5, 0.5)) <= MAX_REACH) {
        return adj;
      }
    }
  }
  return null;
}
