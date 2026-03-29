import { Vec3 } from 'vec3';
import mineState from './mineState.js';
import { DANGEROUS_BLOCKS, SKIP_BLOCKS, PICKAXE_TIERS } from './constants.js';
import { sleep } from '../utils.js';
import state from '../state.js';

export function isInZone(bp) {
  const { zone } = mineState;
  return bp.x >= zone.minX && bp.x <= zone.maxX
    && bp.y >= zone.minY && bp.y <= zone.maxY
    && bp.z >= zone.minZ && bp.z <= zone.maxZ;
}

export function isBlockBroken(bot, bp) {
  const block = bot.blockAt(bp);
  return !block || SKIP_BLOCKS.has(block.name) || block.boundingBox === 'empty';
}

export function needsDig(bot, bp) {
  const block = bot.blockAt(bp);
  if (!block) return false;
  if (SKIP_BLOCKS.has(block.name)) return false;
  if (block.boundingBox === 'empty') return false;
  return true;
}

export function isDangerous(bot) {
  const pos = bot.entity.position;
  const feetPos = new Vec3(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z));
  const belowPos = new Vec3(Math.floor(pos.x), Math.floor(pos.y) - 1, Math.floor(pos.z));
  const feetBlock = bot.blockAt(feetPos);
  const belowBlock = bot.blockAt(belowPos);
  return (feetBlock && DANGEROUS_BLOCKS.has(feetBlock.name))
    || (belowBlock && DANGEROUS_BLOCKS.has(belowBlock.name));
}

export function canSafelyDig(bot, pos) {
  const sideAndBelow = [[1,0,0],[-1,0,0],[0,-1,0],[0,0,1],[0,0,-1]];
  for (const [dx, dy, dz] of sideAndBelow) {
    const adj = bot.blockAt(pos.offset(dx, dy, dz));
    if (adj && DANGEROUS_BLOCKS.has(adj.name)) return false;
  }
  return true;
}

export async function ensurePick(bot) {
  const held = bot.heldItem;
  if (held && held.name.includes('pickaxe')) return true;
  const pick = findPick(bot);
  if (!pick) return false;
  try {
    await bot.equip(pick, 'hand');
    await sleep(100);
  } catch {
    return false;
  }
  const after = bot.heldItem;
  return !!(after && after.name.includes('pickaxe'));
}

function findPick(bot) {
  for (const tier of PICKAXE_TIERS) {
    const pick = bot.inventory.items().find(i => i.name === tier);
    if (pick) return pick;
  }
  return null;
}

export async function waitWhileEating() {
  while (state.isEating) {
    await sleep(200);
    if (!mineState.active) return;
  }
}
