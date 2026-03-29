import state from './state.js';
import { log, sleep, sendTelegram, FOOD_VALUES, CHEST_FOOD_SEARCH_COOLDOWN, ru } from './utils.js';
import { findNearbyChests, openChest } from './inventory.js';

export function startAutoEat() {
  stopAutoEat();
  state.autoEatTimer = setInterval(() => {
    if (!state.bot || !state.bot.entity) return;
    tryAutoEat().catch(e => log(`[ЕДА] Ошибка: ${e.message}`));
  }, 3000);
}

export function stopAutoEat() {
  if (state.autoEatTimer) {
    clearInterval(state.autoEatTimer);
    state.autoEatTimer = null;
  }
}

async function moveToOffhand(bot, item) {
  const offhand = bot.inventory.slots[45];
  if (offhand && offhand.name === item.name) return true;

  try {
    if (offhand) {
      await bot.clickWindow(45, 0, 0);
      await sleep(100);
      const emptySlot = bot.inventory.firstEmptyInventorySlot();
      if (emptySlot !== null) {
        await bot.clickWindow(emptySlot, 0, 0);
        await sleep(100);
      } else {
        await bot.clickWindow(45, 0, 0);
        await sleep(100);
        return false;
      }
    }
    await bot.clickWindow(item.slot, 0, 0);
    await sleep(100);
    await bot.clickWindow(45, 0, 0);
    await sleep(100);

    const cursor = bot.inventory.slots[bot.inventory.inventoryEnd];
    if (cursor) {
      const empty = bot.inventory.firstEmptyInventorySlot();
      if (empty !== null) {
        await bot.clickWindow(empty, 0, 0);
        await sleep(100);
      }
    }

    log(`[ЕДА] ${ru(item.name)} -> левая рука`);
    return true;
  } catch (e) {
    log(`[ЕДА] Ошибка перекладывания в offhand: ${e.message}`);
    return false;
  }
}

export async function tryAutoEat() {
  if (!state.bot || !state.bot.entity) return;
  if (state.bot.food >= 14) return;
  if (state.isEating) return;
  if (state.isManagingInventory) return;

  const bot = state.bot;
  const offhand = bot.inventory.slots[45];

  if (offhand && FOOD_VALUES[offhand.name]) {
    state.isEating = true;
    try {
      bot.clearControlStates();
      log(`[ЕДА] Ем ${ru(offhand.name)} из левой руки (голод: ${bot.food})`);
      bot.activateItem(true);
      await sleep(1800);
      bot.deactivateItem();
      log(`[ЕДА] Готово. Голод: ${bot.food}`);
    } catch (e) {
      log(`[ЕДА] Прервано: ${e.message}`);
    }
    state.isEating = false;
    return;
  }

  state.isEating = true;

  let foodItem = findBestFood();
  if (!foodItem) {
    const now = Date.now();
    if (now - state.lastChestFoodSearchTime < CHEST_FOOD_SEARCH_COOLDOWN) {
      log(`[ЕДА] Нет еды! Голод: ${bot.food}`);
      state.isEating = false;
      return;
    }
    state.lastChestFoodSearchTime = now;
    log(`[ЕДА] Нет еды в инвентаре, ищу в сундуках...`);
    const found = await takeFoodFromChest();
    if (found) {
      foodItem = findBestFood();
    }
    if (!foodItem) {
      log(`[ЕДА] Нет еды! Голод: ${bot.food}`);
      const now2 = Date.now();
      if (now2 - state.lastHungryTgTime > 5 * 60 * 1000) {
        state.lastHungryTgTime = now2;
        sendTelegram(`[PRISSET BOT] я хочу ЖРАТЬ ДАЙТЕ ПОЖРАТЬ МНЕ\nГолод: ${bot.food}/20`);
      }
      if (bot && bot.food <= 6) {
        log(`[ЕДА] Критический голод (${bot.food}), нет еды. Отключаемся!`);
        sendTelegram(`[PRISSET BOT] Критический голод (${bot.food}/20), еды нет. Бот отключился.`);
        if (state.bot) state.bot.quit('No food, starving');
        state.bot = null;
        log('Бот остановлен. /start для перезапуска.');
      }
      state.isEating = false;
      return;
    }
  }

  try {
    const moved = await moveToOffhand(bot, foodItem);
    if (!moved) {
      log(`[ЕДА] Не удалось положить еду в offhand`);
      state.isEating = false;
      return;
    }

    await sleep(100);
    bot.clearControlStates();
    log(`[ЕДА] Ем ${ru(foodItem.name)} из левой руки (голод: ${bot.food})`);
    bot.activateItem(true);
    await sleep(1800);
    bot.deactivateItem();
    log(`[ЕДА] Готово. Голод: ${bot.food}`);
  } catch (e) {
    log(`[ЕДА] Прервано: ${e.message}`);
  }

  state.isEating = false;
}

export function findBestFood() {
  if (!state.bot || !state.bot.inventory) return null;

  let best = null;
  let bestVal = -1;

  for (const item of state.bot.inventory.items()) {
    const val = FOOD_VALUES[item.name];
    if (val && val > bestVal) {
      bestVal = val;
      best = item;
    }
  }

  return best;
}

async function takeFoodFromChest() {
  if (!state.bot || !state.bot.entity || state.isManagingInventory) return false;

  const chests = findNearbyChests();
  if (chests.length === 0) {
    log('[СУНДУК] Нет сундуков рядом');
    return false;
  }

  state.isManagingInventory = true;

  for (const chest of chests) {
    try {
      const dist = state.bot.entity.position.distanceTo(chest.position);
      log(`[СУНДУК] Открываю ${chest.name} на ${dist.toFixed(1)} бл.`);

      const emptySlot = state.bot.inventory.firstEmptyHotbarSlot();
      if (emptySlot !== null) {
        state.bot.setQuickBarSlot(emptySlot - state.bot.inventory.hotbarStart);
      }
      await sleep(100);

      const chestCenter = chest.position.offset(0.5, 0.5, 0.5);
      await state.bot.lookAt(chestCenter);
      await sleep(300);

      const window = await openChest(chest);
      if (!window) continue;

      await sleep(500);

      const invStart = window.inventoryStart || 27;
      const allSlots = [];
      for (let i = 0; i < invStart; i++) {
        const item = window.slots[i];
        if (item) allSlots.push({ slot: i, name: item.name, count: item.count });
      }

      if (allSlots.length > 0) {
        const names = allSlots.map(i => `${i.name}x${i.count}`).join(', ');
        log(`[СУНДУК] Содержимое (${allSlots.length}): ${names}`);
      } else {
        log(`[СУНДУК] Пустой (invStart=${invStart}, totalSlots=${window.slots.length})`);
        state.bot.closeWindow(window);
        await sleep(300);
        continue;
      }

      let tookFood = false;
      for (const entry of allSlots) {
        if (FOOD_VALUES[entry.name]) {
          log(`[СУНДУК] Беру ${ru(entry.name)} x${entry.count} (слот ${entry.slot})`);
          try {
            await state.bot.clickWindow(entry.slot, 0, 1);
            await sleep(200);
            tookFood = true;
          } catch (e) {
            log(`[СУНДУК] Ошибка взятия: ${e.message}`);
          }
        }
      }

      state.bot.closeWindow(window);
      await sleep(300);

      if (tookFood) {
        state.isManagingInventory = false;
        return true;
      }
    } catch (e) {
      log(`[СУНДУК] Ошибка открытия: ${e.message}`);
    }
  }

  state.isManagingInventory = false;
  return false;
}
