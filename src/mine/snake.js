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
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < snake.length; i++) {
    const dx = snake[i].x + 0.5 - pos.x;
    const dz = snake[i].z + 0.5 - pos.z;
    const d = dx * dx + dz * dz;
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  if (bestIdx === 0) return snake;
  log(`[MINE] Reorder snake: starting from index ${bestIdx} (${snake[bestIdx].x},${snake[bestIdx].z}) instead of (${snake[0].x},${snake[0].z})`);
  return [...snake.slice(bestIdx), ...snake.slice(0, bestIdx)];
}
