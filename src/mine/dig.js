import { Vec3 } from 'vec3';
import mineState from './mineState.js';
import { SKIP_BLOCKS, DANGEROUS_BLOCKS, MAX_REACH, MAX_DIG_RETRIES, DIG_DELAY, rnd } from './constants.js';
import { isInZone, isBlockBroken, canSafelyDig, waitWhileEating } from './checks.js';
import { log, sleep } from '../utils.js';

export async function digTarget(bot, bp) {
  if (!mineState.active || !bot.entity) return;

  const block = bot.blockAt(bp);
  if (!block) {
    log(`[DIG] No block data @ (${bp.x},${bp.y},${bp.z}), chunk not loaded?`);
    return;
  }
  if (SKIP_BLOCKS.has(block.name) || block.boundingBox === 'empty') return;
  if (!canSafelyDig(bot, bp)) {
    log(`[DIG] Unsafe neighbors for (${bp.x},${bp.y},${bp.z}), skipping`);
    return;
  }

  const eyePos = bot.entity.position.offset(0, bot.entity.eyeHeight, 0);
  const dist = eyePos.distanceTo(bp.offset(0.5, 0.5, 0.5));

  if (dist > MAX_REACH) {
    log(`[DIG] Too far: ${block.name} @ (${bp.x},${bp.y},${bp.z}) dist=${dist.toFixed(1)} eye=(${eyePos.x.toFixed(1)},${eyePos.y.toFixed(1)},${eyePos.z.toFixed(1)}), skipping`);
    return;
  }

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
    const close = dist < 1.5;
    log(`[DIG] Attempt ${attempt + 1}/${MAX_DIG_RETRIES} ${current.name} @ (${bp.x},${bp.y},${bp.z}) dist=${dist.toFixed(1)}${useGlance ? ' (glance)' : ''}${close ? ' (close)' : ''}`);

    const t0 = Date.now();
    const ok = await safeDig(bot, current, useGlance);
    const dt = Date.now() - t0;

    if (!ok) {
      log(`[DIG] safeDig failed (${dt}ms)`);
      await sleep(rnd(100, 200));
      continue;
    }

    if (isBlockBroken(bot, bp)) {
      if (isInZone(bp)) mineState.mined++;
      log(`[DIG] OK ${current.name} in ${dt}ms`);
      break;
    }

    log(`[DIG] Block not broken after attempt ${attempt + 1} (${dt}ms)`);
    await sleep(rnd(50, 150));
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

const CLOSE_FACES = [
  [0.5, 1.0, 0.5],
  [0.5, 0.0, 0.5],
  [0.5, 0.5, 0.0],
  [0.5, 0.5, 1.0],
  [0.0, 0.5, 0.5],
  [1.0, 0.5, 0.5],
];

export async function safeDig(bot, block, glance) {
  bot.clearControlStates();

  await waitWhileEating();
  if (!mineState.active || !bot.entity) return false;

  const bp = block.position;
  const eyePos = bot.entity.position.offset(0, bot.entity.eyeHeight, 0);
  const dist = eyePos.distanceTo(bp.offset(0.5, 0.5, 0.5));

  if (dist > MAX_REACH) return false;

  if (dist < 3) {
    return await digClose(bot, block, bp);
  }

  const eyeY = bot.entity.position.y + bot.entity.eyeHeight;
  const offX = (Math.random() - 0.5) * 0.6;
  const offZ = (Math.random() - 0.5) * 0.6;
  await bot.lookAt(new Vec3(bp.x + 0.5 + offX, eyeY, bp.z + 0.5 + offZ), false);
  await sleep(50);

  if (glance) {
    const adj = findAdjacentBlock(bot, block);
    if (adj) {
      await bot.lookAt(adj.position.offset(0.5, 0.5, 0.5), false);
      await sleep(DIG_DELAY);
    }
  }

  await bot.lookAt(bp.offset(0.5, 0.5, 0.5), false);
  await sleep(DIG_DELAY);

  try {
    await bot.dig(block, 'raycast');
    await sleep(DIG_DELAY);
    return true;
  } catch (err) {
    if (err.message === 'Digging aborted') return false;
    if (err.message !== 'Block not in view') throw err;
  }

  for (const [fx, fy, fz] of FACE_OFFSETS) {
    if (!mineState.active || !bot.entity) return false;
    const facePoint = bp.offset(fx, fy, fz);
    if (eyePos.distanceTo(facePoint) > MAX_REACH) continue;

    await bot.lookAt(facePoint, false);
    await sleep(DIG_DELAY);

    try {
      const freshBlock = bot.blockAt(bp);
      if (!freshBlock || SKIP_BLOCKS.has(freshBlock.name) || freshBlock.boundingBox === 'empty') return true;
      await bot.dig(freshBlock, 'raycast');
      await sleep(DIG_DELAY);
      return true;
    } catch (err2) {
      if (err2.message === 'Digging aborted') return false;
      if (err2.message !== 'Block not in view') throw err2;
    }
  }

  log(`[DIG] Cannot see block @ (${bp.x},${bp.y},${bp.z}) from any face, skipping`);
  return false;
}

async function digClose(bot, block, bp) {
  const result = await tryDigFaces(bot, bp);
  if (result) return true;

  const pos = bot.entity.position;
  const dx = pos.x - (bp.x + 0.5);
  const dz = pos.z - (bp.z + 0.5);
  const len = Math.sqrt(dx * dx + dz * dz) || 1;
  const stepBack = new Vec3(pos.x + (dx / len) * 1.5, pos.y, pos.z + (dz / len) * 1.5);

  log(`[DIG] Too close to (${bp.x},${bp.y},${bp.z}), stepping back`);

  const lookAt = new Vec3(stepBack.x, pos.y + 1, stepBack.z);
  await bot.lookAt(lookAt, false);
  bot.setControlState('back', true);
  await sleep(250);
  bot.clearControlStates();
  await sleep(100);

  const fresh = bot.blockAt(bp);
  if (!fresh || SKIP_BLOCKS.has(fresh.name) || fresh.boundingBox === 'empty') return true;

  return await tryDigFaces(bot, bp);
}

async function tryDigFaces(bot, bp) {
  const eyePos = bot.entity.position.offset(0, bot.entity.eyeHeight, 0);
  for (const [fx, fy, fz] of CLOSE_FACES) {
    if (!mineState.active || !bot.entity) return false;
    const facePoint = bp.offset(fx, fy, fz);
    if (eyePos.distanceTo(facePoint) > MAX_REACH) continue;
    await bot.lookAt(facePoint, false);
    await sleep(DIG_DELAY);

    try {
      const fresh = bot.blockAt(bp);
      if (!fresh || SKIP_BLOCKS.has(fresh.name) || fresh.boundingBox === 'empty') return true;
      await bot.dig(fresh, 'raycast');
      await sleep(DIG_DELAY);
      return true;
    } catch (err) {
      if (err.message === 'Digging aborted') return false;
      if (err.message !== 'Block not in view') continue;
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
  await sleep(DIG_DELAY);

  try {
    await bot.dig(block, 'raycast');
  } catch {
    for (const [fx, fy, fz] of FACE_OFFSETS) {
      if (!mineState.active || !bot.entity) return false;
      const freshEye = bot.entity.position.offset(0, bot.entity.eyeHeight, 0);
      const facePoint = bp.offset(fx, fy, fz);
      if (freshEye.distanceTo(facePoint) > MAX_REACH) continue;
      await bot.lookAt(facePoint, false);
      await sleep(DIG_DELAY);
      try {
        const fresh = bot.blockAt(bp);
        if (!fresh || SKIP_BLOCKS.has(fresh.name) || fresh.boundingBox === 'empty') {
          if (isInZone(bp)) mineState.mined++;
          return true;
        }
        await bot.dig(fresh, 'raycast');
        await sleep(DIG_DELAY);
        const broken = isBlockBroken(bot, bp);
        if (broken && isInZone(bp)) mineState.mined++;
        return broken;
      } catch {
        continue;
      }
    }
    return false;
  }

  await sleep(DIG_DELAY);
  const broken = isBlockBroken(bot, bp);
  if (broken && isInZone(bp)) mineState.mined++;
  return broken;
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
