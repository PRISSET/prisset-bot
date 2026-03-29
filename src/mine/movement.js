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

  if (hDist <= 5) return;

  if (!bot.pathfinder) {
    log('[MINE] No pathfinder, walking manually');
    return;
  }

  log(`[MINE] Far from zone (${hDist.toFixed(1)} blocks), using pathfinder to (${tx}, ${ty}, ${tz})`);

  try {
    const goal = new GoalNear(tx + 0.5, ty, tz + 0.5, 2);
    bot.pathfinder.goto(goal);

    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        bot.pathfinder.stop();
        resolve();
      }, 30000);

      const onGoalReached = () => {
        clearTimeout(timeout);
        bot.removeListener('path_stop', onStop);
        resolve();
      };

      const onStop = () => {
        clearTimeout(timeout);
        bot.removeListener('goal_reached', onGoalReached);
        resolve();
      };

      bot.once('goal_reached', onGoalReached);
      bot.once('path_stop', onStop);
    });

    bot.clearControlStates();
    log('[MINE] Pathfinder arrived near zone');
  } catch (e) {
    log(`[MINE] Pathfinder failed: ${e.message}, will walk manually`);
    bot.clearControlStates();
  }
}

export async function stepToNext(bot, nx, nz, floorY) {
  const target = new Vec3(nx + 0.5, floorY + 1, nz + 0.5);
  let stuckCount = 0;
  let lastPos = null;
  let maxIter = 60;

  while (mineState.active && bot.entity && maxIter-- > 0) {
    await waitWhileEating();
    if (!mineState.active || !bot.entity) return;

    const pos = bot.entity.position;
    const hDist = Math.sqrt(Math.pow(nx + 0.5 - pos.x, 2) + Math.pow(nz + 0.5 - pos.z, 2));

    if (hDist < 0.8) return;

    const feetY = Math.floor(pos.y);
    const fX = Math.floor(pos.x);
    const fZ = Math.floor(pos.z);
    const dx = Math.sign(nx - fX);
    const dz = Math.sign(nz - fZ);
    const stepX = dx !== 0 ? dx : 0;
    const stepZ = dz !== 0 ? dz : 0;
    const aheadX = fX + stepX;
    const aheadZ = fZ + stepZ;

    let cleared = false;
    for (const y of [feetY, feetY + 1]) {
      const bp = new Vec3(aheadX, y, aheadZ);
      const block = bot.blockAt(bp);
      if (block && !SKIP_BLOCKS.has(block.name) && block.boundingBox !== 'empty' && !DANGEROUS_BLOCKS.has(block.name)) {
        const eyePos = pos.offset(0, bot.entity.eyeHeight, 0);
        if (eyePos.distanceTo(bp.offset(0.5, 0.5, 0.5)) <= MAX_REACH) {
          await digSimple(bot, block, bp);
          cleared = true;
        }
      }
    }

    if (cleared) {
      await sleep(50);
      continue;
    }

    if (lastPos && pos.distanceTo(lastPos) < 0.1) {
      stuckCount++;
    } else {
      stuckCount = 0;
    }
    lastPos = pos.clone();

    if (stuckCount >= 8) {
      bot.setControlState('jump', true);
      await sleep(300);
      bot.clearControlStates();
      stuckCount = 0;
      continue;
    }

    await sprintToward(bot, target);
    await waitWhileEating();
    await sleep(50);
  }
}

export async function sprintToward(bot, target) {
  const lookAt = new Vec3(target.x, bot.entity.position.y + 1, target.z);
  await bot.lookAt(lookAt, false);

  const startDist = Math.sqrt(
    Math.pow(target.x - bot.entity.position.x, 2) +
    Math.pow(target.z - bot.entity.position.z, 2)
  );

  const useSprint = startDist >= 2.0;
  const maxTicks = useSprint ? 10 : 4;

  bot.setControlState('forward', true);
  if (useSprint) {
    bot.setControlState('sprint', true);
  }

  if (needsJump(bot)) {
    bot.setControlState('jump', true);
  }

  for (let i = 0; i < maxTicks; i++) {
    await sleep(50);
    if (!bot.entity || !mineState.active) break;

    if (state.isEating) {
      bot.clearControlStates();
      break;
    }

    const hDist = Math.sqrt(
      Math.pow(target.x - bot.entity.position.x, 2) +
      Math.pow(target.z - bot.entity.position.z, 2)
    );
    if (hDist < 0.6) break;

    if (needsJump(bot)) {
      bot.setControlState('jump', true);
    } else {
      bot.setControlState('jump', false);
    }
  }

  bot.clearControlStates();
}

export function needsJump(bot) {
  const pos = bot.entity.position;
  const yaw = bot.entity.yaw;
  const dx = -Math.sin(yaw);
  const dz = -Math.cos(yaw);
  const feetX = Math.floor(pos.x + dx);
  const feetZ = Math.floor(pos.z + dz);
  const feetY = Math.floor(pos.y);

  const ahead = bot.blockAt(new Vec3(feetX, feetY, feetZ));
  if (!ahead || SKIP_BLOCKS.has(ahead.name) || ahead.boundingBox === 'empty') return false;

  const aboveAhead = bot.blockAt(new Vec3(feetX, feetY + 1, feetZ));
  if (aboveAhead && !SKIP_BLOCKS.has(aboveAhead.name) && aboveAhead.boundingBox !== 'empty') return false;

  const aboveMe = bot.blockAt(new Vec3(Math.floor(pos.x), feetY + 2, Math.floor(pos.z)));
  if (aboveMe && !SKIP_BLOCKS.has(aboveMe.name) && aboveMe.boundingBox !== 'empty') return false;

  return true;
}

export async function descendToFloor(bot, floorY) {
  const maxAttempts = 60;
  let attempts = 0;

  while (mineState.active && bot.entity && attempts < maxAttempts) {
    await waitWhileEating();
    if (!mineState.active || !bot.entity) return;

    const botY = Math.floor(bot.entity.position.y);
    if (botY <= floorY + 1) return;

    const myX = Math.floor(bot.entity.position.x);
    const myZ = Math.floor(bot.entity.position.z);
    let dugSomething = false;

    for (let y = botY - 1; y >= floorY + 1; y--) {
      if (!mineState.active || !bot.entity) return;
      const bp = new Vec3(myX, y, myZ);
      const block = bot.blockAt(bp);
      if (!block || SKIP_BLOCKS.has(block.name) || block.boundingBox === 'empty') continue;
      if (DANGEROUS_BLOCKS.has(block.name)) {
        log(`[DESCEND] Danger below: ${block.name}, stopping`);
        return;
      }
      log(`[DESCEND] Digging ${block.name} @ (${myX},${y},${myZ})`);
      await digSimple(bot, block, bp);
      dugSomething = true;
      await sleep(50);
      break;
    }

    await sleep(dugSomething ? 80 : 150);
    attempts++;
  }
}
