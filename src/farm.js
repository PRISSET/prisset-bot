import state from './state.js';
import {
  log, ru, isAtSpawn,
  HOSTILE_MOBS, SWORD_TIERS, ATTACK_RANGE, ATTACK_COOLDOWN_MS, FOOD_VALUES
} from './utils.js';
import { manageInventory } from './inventory.js';

export function startFarmLoop() {
  stopFarmLoop();
  state.statusLogCounter = 0;
  state.farmLoopTimer = setInterval(() => {
    if (!state.bot || !state.farmActive || !state.bot.entity) return;
    state.statusLogCounter++;
    if (state.statusLogCounter % 60 === 0) {
      logInventoryStatus();
      manageInventory().catch(e => log(`[ИНВЕНТАРЬ] Ошибка: ${e.message}`));
    }
    farmTick();
  }, 500);
  log('Фарм: поиск мобов каждые 0.5с');
  logInventoryStatus();
}

export function stopFarmLoop() {
  if (state.farmLoopTimer) {
    clearInterval(state.farmLoopTimer);
    state.farmLoopTimer = null;
  }
}

async function farmTick() {
  if (isAtSpawn(state.bot)) return;
  if (state.isEating) return;
  if (state.isManagingInventory) return;

  const now = Date.now();
  if (now - state.lastAttackTime < ATTACK_COOLDOWN_MS) return;

  await ensureSwordEquipped();

  const mob = findNearestHostile();
  if (!mob) return;

  const dist = state.bot.entity.position.distanceTo(mob.position);
  if (dist > ATTACK_RANGE) return;

  const allMobs = countNearbyHostiles();
  log(`[ФАРМ] Атакуем ${ru(mob.name)} (дист: ${dist.toFixed(1)}, мобов рядом: ${allMobs})`);

  try {
    await state.bot.lookAt(mob.position.offset(0, mob.height * 0.85, 0));
    state.bot.attack(mob);
    state.lastAttackTime = now;
  } catch (e) {
    log(`[ФАРМ] Ошибка атаки: ${e.message}`);
  }
}

export async function ensureSwordEquipped() {
  if (!state.bot || !state.bot.inventory) return;
  const held = state.bot.heldItem;
  if (held && SWORD_TIERS.includes(held.name)) return;

  const sword = findBestSword();
  if (!sword) return;

  try {
    await state.bot.equip(sword, 'hand');
    log(`[ЭКИП] ${ru(sword.name)}`);
  } catch {}
}

export function findBestSword() {
  if (!state.bot || !state.bot.inventory) return null;
  for (const tier of SWORD_TIERS) {
    const sword = state.bot.inventory.items().find(item => item.name === tier);
    if (sword) return sword;
  }
  return null;
}

export function equipBestSword() {
  const sword = findBestSword();
  if (!sword) return;
  state.bot.equip(sword, 'hand').then(() => {
    log(`[ЭКИП] ${ru(sword.name)}`);
  }).catch(() => {});
}

function findNearestHostile() {
  if (!state.bot || !state.bot.entity) return null;

  let nearest = null;
  let nearestDist = 32;

  for (const entity of Object.values(state.bot.entities)) {
    if (!entity || entity === state.bot.entity) continue;
    if (!entity.name || !HOSTILE_MOBS.has(entity.name)) continue;
    if (!entity.position) continue;

    const dist = state.bot.entity.position.distanceTo(entity.position);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = entity;
    }
  }

  return nearest;
}

export function countNearbyHostiles() {
  let count = 0;
  for (const entity of Object.values(state.bot.entities)) {
    if (!entity || entity === state.bot.entity) continue;
    if (!entity.name || !HOSTILE_MOBS.has(entity.name)) continue;
    if (!entity.position) continue;
    if (state.bot.entity.position.distanceTo(entity.position) <= 32) count++;
  }
  return count;
}

export function logInventoryStatus() {
  if (!state.bot || !state.bot.inventory) return;

  const mainHand = state.bot.heldItem;
  const offHand = state.bot.inventory.slots[45];
  const mainStr = mainHand ? `${ru(mainHand.name)} x${mainHand.count}` : 'пусто';
  const offStr = offHand ? `${ru(offHand.name)} x${offHand.count}` : 'пусто';

  const foods = state.bot.inventory.items().filter(i => FOOD_VALUES[i.name]);
  const foodStr = foods.length
    ? foods.map(f => `${ru(f.name)} x${f.count}`).join(', ')
    : 'нет';

  const swords = state.bot.inventory.items().filter(i => i.name.includes('sword'));
  const swordStr = swords.length
    ? swords.map(s => ru(s.name)).join(', ')
    : 'нет';

  const mobs = countNearbyHostiles();

  log(`[СТАТУС] ХП: ${Math.floor(state.bot.health)} | Голод: ${state.bot.food} | Рука: ${mainStr} | Левая: ${offStr}`);
  log(`[СТАТУС] Мечи: ${swordStr} | Еда: ${foodStr} | Мобов рядом: ${mobs}`);

  const allItems = state.bot.inventory.slots
    .filter(s => s !== null && s !== undefined)
    .map(s => `${s.name}(${s.slot})`)
    .join(', ');
  log(`[ИНВЕНТАРЬ] ${allItems || 'пусто'}`);

  if (mobs === 0) {
    const nearby = {};
    for (const entity of Object.values(state.bot.entities)) {
      if (!entity || entity === state.bot.entity || !entity.name || !entity.position) continue;
      if (state.bot.entity.position.distanceTo(entity.position) > 32) continue;
      nearby[entity.name] = (nearby[entity.name] || 0) + 1;
    }
    const names = Object.entries(nearby).map(([n, c]) => `${n}:${c}`).join(', ');
    if (names) log(`[СТАТУС] Все энтити рядом: ${names}`);
  }
}
