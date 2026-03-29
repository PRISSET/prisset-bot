import mineState from './mineState.js';
import { log } from '../utils.js';

export function buildSnake() {
  const { zone } = mineState;
  const path = [];
  let forward = true;
  for (let z = zone.minZ; z <= zone.maxZ; z++) {
    if (forward) {
      for (let x = zone.minX; x <= zone.maxX; x++) path.push({ x, z });
    } else {
      for (let x = zone.maxX; x >= zone.minX; x--) path.push({ x, z });
    }
    forward = !forward;
  }
  return path;
}

export function reorderSnake(snake, bot) {
  const pos = bot.entity.position;
  const { zone } = mineState;
  const botX = Math.round(pos.x - 0.5);
  const botZ = Math.round(pos.z - 0.5);

  const clampedZ = Math.max(zone.minZ, Math.min(zone.maxZ, botZ));
  const clampedX = Math.max(zone.minX, Math.min(zone.maxX, botX));

  const zValues = [];
  for (let z = clampedZ; z <= zone.maxZ; z++) zValues.push(z);
  for (let z = clampedZ - 1; z >= zone.minZ; z--) zValues.push(z);

  const path = [];
  for (let ri = 0; ri < zValues.length; ri++) {
    const z = zValues[ri];
    const row = [];
    for (let x = zone.minX; x <= zone.maxX; x++) row.push({ x, z });

    if (ri === 0) {
      const startLeft = Math.abs(clampedX - zone.minX) <= Math.abs(clampedX - zone.maxX);
      if (!startLeft) row.reverse();

      const startIdx = row.findIndex(p => p.x === clampedX);
      if (startIdx > 0) {
        const reordered = [...row.slice(startIdx), ...row.slice(0, startIdx)];
        path.push(...reordered);
      } else {
        path.push(...row);
      }
    } else {
      const prevLast = path[path.length - 1];
      const distToFirst = Math.abs(row[0].x - prevLast.x);
      const distToLast = Math.abs(row[row.length - 1].x - prevLast.x);
      if (distToLast < distToFirst) row.reverse();
      path.push(...row);
    }
  }

  log(`[MINE] Reorder snake: start (${path[0].x},${path[0].z}), bot@(${botX},${botZ}), ${path.length} positions`);
  return path;
}
