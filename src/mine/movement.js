import { Vec3 } from 'vec3';
import pathfinderPkg from 'mineflayer-pathfinder';
import state from '../state.js';
import mineState from './mineState.js';
import { SKIP_BLOCKS, DANGEROUS_BLOCKS, MAX_REACH } from './constants.js';
import { waitWhileEating } from './checks.js';
import { digSimple } from './dig.js';
import { log, sleep } from '../utils.js';

const { goals: { GoalNear } } = pathfinderPkg;

export async function goToZone(bot, tx, tz, ty) {
  const pos = bot.entity.position;
  const hDist = Math.sqrt(Math.pow(tx + 0.5 - pos.x, 2) + Math.pow(tz + 0.5 - pos.z, 2));

  if (hDist <= 3) return;

  if (!bot.pathfinder || typeof bot.pathfinder.setGoal !== 'function') {
    log('[MINE] No pathfinder');
    return;
  }

  log(`[MINE] Far from zone (${hDist.toFixed(1)} blocks), pathfinder to (${tx}, ${ty}, ${tz})`);

  try {
    await pathfinderGo(bot, new GoalNear(tx, ty, tz, 2), 30000);
  } catch {}
  bot.clearControlStates();
}

function pathfinderGo(bot, goal, timeoutMs) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      done();
    }, timeoutMs);

    function done() {
      clearTimeout(timeout);
      bot.removeListener('goal_reached', onGoalReached);
      bot.removeListener('path_update', onPathUpdate);
      bot.removeListener('path_stop', onStop);
      try { bot.pathfinder.stop(); } catch {}
      resolve();
    }

    function onGoalReached() { done(); }
    function onStop() { done(); }
    function onPathUpdate(r) {
      if (r.status === 'noPath' || r.status === 'timeout') {
        done();
      }
    }

    bot.once('goal_reached', onGoalReached);
    bot.once('path_stop', onStop);
    bot.on('path_update', onPathUpdate);

    try {
      bot.pathfinder.setGoal(goal);
    } catch {
      done();
    }
  });
}

export async function stepToNext(bot, nx, nz, floorY) {
  if (!mineState.active || !bot.entity) return;
  if (state.isEating) { await waitWhileEating(); }
  if (!mineState.active || !bot.entity) return;

  const targetX = nx + 0.5;
  const targetZ = nz + 0.5;

  let pos = bot.entity.position;
  let hDist = Math.sqrt(Math.pow(targetX - pos.x, 2) + Math.pow(targetZ - pos.z, 2));
  if (hDist < 0.5) return;

  if (isPathClear(bot, nx, nz)) {
    const arrived = await walkTo(bot, targetX, targetZ);
    if (arrived) return;
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    if (!mineState.active || !bot.entity) return;

    pos = bot.entity.position;
    hDist = Math.sqrt(Math.pow(targetX - pos.x, 2) + Math.pow(targetZ - pos.z, 2));
    if (hDist < 0.5) return;

    await clearPathTo(bot, nx, nz);
    if (!mineState.active || !bot.entity) return;

    const arrived = await walkTo(bot, targetX, targetZ);
    if (arrived) return;

    pos = bot.entity.position;
    hDist = Math.sqrt(Math.pow(targetX - pos.x, 2) + Math.pow(targetZ - pos.z, 2));
    if (hDist < 1.0) return;
  }
}

function isPathClear(bot, nx, nz) {
  const pos = bot.entity.position;
  const myX = Math.floor(pos.x);
  const myZ = Math.floor(pos.z);
  const feetY = Math.floor(pos.y);

  const dx = nx - myX;
  const dz = nz - myZ;
  const sx = dx !== 0 ? Math.sign(dx) : 0;
  const sz = dz !== 0 ? Math.sign(dz) : 0;

  const checks = [];
  if (sx !== 0) {
    checks.push([myX + sx, feetY, myZ], [myX + sx, feetY + 1, myZ]);
  }
  if (sz !== 0) {
    checks.push([myX, feetY, myZ + sz], [myX, feetY + 1, myZ + sz]);
  }
  if (sx !== 0 && sz !== 0) {
    checks.push([myX + sx, feetY, myZ + sz], [myX + sx, feetY + 1, myZ + sz]);
  }

  for (const [bx, by, bz] of checks) {
    const block = bot.blockAt(new Vec3(bx, by, bz));
    if (block && !SKIP_BLOCKS.has(block.name) && block.boundingBox !== 'empty') return false;
  }
  return true;
}

async function clearPathTo(bot, nx, nz) {
  const pos = bot.entity.position;
  const myX = Math.floor(pos.x);
  const myZ = Math.floor(pos.z);
  const feetY = Math.floor(pos.y);

  const dx = nx - myX;
  const dz = nz - myZ;
  const sx = dx !== 0 ? Math.sign(dx) : 0;
  const sz = dz !== 0 ? Math.sign(dz) : 0;

  const blocksToCheck = [];

  if (sx !== 0) {
    blocksToCheck.push(new Vec3(myX + sx, feetY, myZ));
    blocksToCheck.push(new Vec3(myX + sx, feetY + 1, myZ));
  }
  if (sz !== 0) {
    blocksToCheck.push(new Vec3(myX, feetY, myZ + sz));
    blocksToCheck.push(new Vec3(myX, feetY + 1, myZ + sz));
  }
  if (sx !== 0 && sz !== 0) {
    blocksToCheck.push(new Vec3(myX + sx, feetY, myZ + sz));
    blocksToCheck.push(new Vec3(myX + sx, feetY + 1, myZ + sz));
  }

  for (const bp of blocksToCheck) {
    if (!mineState.active || !bot.entity) return;
    const block = bot.blockAt(bp);
    if (!block || SKIP_BLOCKS.has(block.name) || block.boundingBox === 'empty') continue;
    if (DANGEROUS_BLOCKS.has(block.name)) continue;

    const eyePos = bot.entity.position.offset(0, bot.entity.eyeHeight, 0);
    if (eyePos.distanceTo(bp.offset(0.5, 0.5, 0.5)) > MAX_REACH) continue;

    await digSimple(bot, block, bp);
    await sleep(50);
  }
}

async function walkTo(bot, tx, tz) {
  let pos = bot.entity.position;
  let hDist = Math.sqrt(Math.pow(tx - pos.x, 2) + Math.pow(tz - pos.z, 2));
  if (hDist < 0.5) return true;

  const lookY = pos.y + bot.entity.eyeHeight;
  await bot.lookAt(new Vec3(tx, lookY, tz), false);

  bot.setControlState('forward', true);
  if (hDist >= 2.0) bot.setControlState('sprint', true);

  const maxTicks = hDist < 1.5 ? 8 : 14;
  for (let tick = 0; tick < maxTicks; tick++) {
    await sleep(50);
    if (!mineState.active || !bot.entity) { bot.clearControlStates(); return false; }
    if (state.isEating) { bot.clearControlStates(); return false; }

    pos = bot.entity.position;
    hDist = Math.sqrt(Math.pow(tx - pos.x, 2) + Math.pow(tz - pos.z, 2));
    if (hDist < 0.4) { bot.clearControlStates(); return true; }
  }

  bot.clearControlStates();
  pos = bot.entity.position;
  hDist = Math.sqrt(Math.pow(tx - pos.x, 2) + Math.pow(tz - pos.z, 2));
  return hDist < 0.8;
}

export async function descendToFloor(bot, floorY) {
  let attempts = 0;
  const maxAttempts = 30;

  while (mineState.active && bot.entity && attempts < maxAttempts) {
    await waitWhileEating();
    if (!mineState.active || !bot.entity) return;

    const botY = Math.floor(bot.entity.position.y);
    if (botY <= floorY + 1) {
      log(`[DESCEND] Reached Y=${botY} (floor=${floorY})`);
      return;
    }

    const myX = Math.floor(bot.entity.position.x);
    const myZ = Math.floor(bot.entity.position.z);

    const stepped = await tryStepIntoOpenColumn(bot, myX, myZ, botY, floorY);
    if (stepped) {
      await waitForFall(bot, botY, 2000);
      attempts++;
      continue;
    }

    const dugSide = await digSideColumn(bot, myX, myZ, botY, floorY);
    if (dugSide) {
      await sleep(100);
      await waitForFall(bot, botY, 2000);
      attempts++;
      continue;
    }

    const feetBp = new Vec3(myX, botY - 1, myZ);
    const feetBlock = bot.blockAt(feetBp);
    const standingOnSolid = feetBlock && !SKIP_BLOCKS.has(feetBlock.name) && feetBlock.boundingBox !== 'empty';

    if (standingOnSolid && botY - 1 > floorY) {
      if (DANGEROUS_BLOCKS.has(feetBlock.name)) {
        log(`[DESCEND] Danger underfoot: ${feetBlock.name}`);
        return;
      }
      const ok = await digSimple(bot, feetBlock, feetBp);
      if (!ok) {
        await stepAside(bot);
      }
      await waitForFall(bot, botY, 1500);
    } else if (!standingOnSolid) {
      await waitForFall(bot, botY, 2000);
    } else {
      await sleep(150);
    }

    attempts++;
  }

  if (mineState.active && bot.entity) {
    log(`[DESCEND] Finished after ${attempts} attempts, Y=${Math.floor(bot.entity.position.y)}`);
  }
}

async function tryStepIntoOpenColumn(bot, myX, myZ, botY, floorY) {
  const offsets = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dx, dz] of offsets) {
    const nx = myX + dx;
    const nz = myZ + dz;

    let columnClear = true;
    for (let y = botY - 1; y > floorY; y--) {
      const block = bot.blockAt(new Vec3(nx, y, nz));
      if (block && !SKIP_BLOCKS.has(block.name) && block.boundingBox !== 'empty') {
        columnClear = false;
        break;
      }
    }
    if (!columnClear) continue;

    const headBlock = bot.blockAt(new Vec3(nx, botY, nz));
    const headClear = !headBlock || SKIP_BLOCKS.has(headBlock.name) || headBlock.boundingBox === 'empty';
    const feetBlock = bot.blockAt(new Vec3(nx, botY - 1, nz));
    const feetClear = !feetBlock || SKIP_BLOCKS.has(feetBlock.name) || feetBlock.boundingBox === 'empty';

    if (headClear && feetClear) {
      const target = new Vec3(nx + 0.5, botY, nz + 0.5);
      await bot.lookAt(target, false);
      bot.setControlState('forward', true);
      await sleep(300);
      bot.clearControlStates();
      return true;
    }
  }
  return false;
}

async function digSideColumn(bot, myX, myZ, botY, floorY) {
  const offsets = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dx, dz] of offsets) {
    const nx = myX + dx;
    const nz = myZ + dz;
    let dugSomething = false;

    for (let y = botY; y > floorY; y--) {
      if (!mineState.active || !bot.entity) return false;
      const bp = new Vec3(nx, y, nz);
      const block = bot.blockAt(bp);
      if (!block || SKIP_BLOCKS.has(block.name) || block.boundingBox === 'empty') continue;
      if (DANGEROUS_BLOCKS.has(block.name)) break;

      const eyePos = bot.entity.position.offset(0, bot.entity.eyeHeight, 0);
      if (eyePos.distanceTo(bp.offset(0.5, 0.5, 0.5)) > MAX_REACH) continue;

      await digSimple(bot, block, bp);
      dugSomething = true;
      await sleep(50);
    }

    if (dugSomething) {
      const target = new Vec3(nx + 0.5, botY, nz + 0.5);
      await bot.lookAt(target, false);
      bot.setControlState('forward', true);
      await sleep(300);
      bot.clearControlStates();
      return true;
    }
  }
  return false;
}

async function stepAside(bot) {
  const offsets = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const pos = bot.entity.position;
  const myX = Math.floor(pos.x);
  const myZ = Math.floor(pos.z);
  const feetY = Math.floor(pos.y);

  for (const [dx, dz] of offsets) {
    const block = bot.blockAt(new Vec3(myX + dx, feetY, myZ + dz));
    const clear = !block || SKIP_BLOCKS.has(block.name) || block.boundingBox === 'empty';
    const aboveBlock = bot.blockAt(new Vec3(myX + dx, feetY + 1, myZ + dz));
    const aboveClear = !aboveBlock || SKIP_BLOCKS.has(aboveBlock.name) || aboveBlock.boundingBox === 'empty';

    if (clear && aboveClear) {
      const target = new Vec3(myX + dx + 0.5, feetY, myZ + dz + 0.5);
      await bot.lookAt(target, false);
      bot.setControlState('forward', true);
      await sleep(250);
      bot.clearControlStates();
      return;
    }
  }
}

async function waitForFall(bot, startY, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!bot.entity || !mineState.active) return;
    if (Math.floor(bot.entity.position.y) < startY) return;
    await sleep(50);
  }
}
