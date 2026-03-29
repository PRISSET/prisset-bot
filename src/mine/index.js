import mineState from './mineState.js';
import state from '../state.js';
import { log } from '../utils.js';
import { runLoop } from './layer.js';

function start(x1, y1, z1, x2, y2, z2) {
  stop();
  mineState.coords = { x1, y1, z1, x2, y2, z2 };
  mineState.zone = {
    minX: Math.min(x1, x2), maxX: Math.max(x1, x2),
    minY: Math.min(y1, y2), maxY: Math.max(y1, y2),
    minZ: Math.min(z1, z2), maxZ: Math.max(z1, z2),
  };
  mineState.total = (mineState.zone.maxX - mineState.zone.minX + 1)
    * (mineState.zone.maxY - mineState.zone.minY + 1)
    * (mineState.zone.maxZ - mineState.zone.minZ + 1);
  mineState.mined = 0;
  mineState.currentLayer = mineState.zone.maxY;
  mineState.active = true;
  log(`[MINE] Zona: (${mineState.zone.minX},${mineState.zone.minY},${mineState.zone.minZ}) -> (${mineState.zone.maxX},${mineState.zone.maxY},${mineState.zone.maxZ}), blokov: ${mineState.total}`);
  runLoop();
}

function stop() {
  mineState.active = false;
  const bot = state.bot;
  if (bot) {
    bot.clearControlStates();
  }
}

function isActive() { return mineState.active; }
function isDigging() { return mineState.active; }
function getCoords() { return mineState.coords; }
function getInfo() { return { zone: mineState.zone, mined: mineState.mined, total: mineState.total, active: mineState.active }; }

export function createMiner() {
  return { start, stop, isActive, isDigging, getCoords, getInfo };
}

let minerInstance = null;

export function getMiner() {
  if (!minerInstance) minerInstance = createMiner();
  return minerInstance;
}
