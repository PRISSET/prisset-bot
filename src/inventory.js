import state from './state.js';
import {
  log, sleep, ru,
  CHEST_SEARCH_RANGE, INVENTORY_MANAGE_COOLDOWN,
  TRASH_ITEMS, STORE_IN_CHEST, PROTECTED_ITEMS, FOOD_VALUES
} from './utils.js';

export function openChest(block) {
  return new Promise(async (resolve, reject) => {
    let resolved = false;
    let windowId = null;

    function done(err, win) {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      state.bot._client.removeListener('open_window', onOpenRaw);
      state.bot._client.removeListener('window_items', onItems);
      state.bot._client.removeListener('set_slot', onSetSlot);
      if (err) reject(err);
      else resolve(win);
    }

    const timeout = setTimeout(() => {
      if (windowId !== null && state.bot.currentWindow) {
        done(null, state.bot.currentWindow);
        return;
      }
      log(`[СУНДУК] Таймаут открытия ${block.name} на ${block.position}`);
      done(new Error('timeout 8s'));
    }, 8000);

    function onOpenRaw(packet) {
      if (resolved) return;
      windowId = packet.windowId;
    }

    function onItems(packet) {
      if (resolved) return;
      if (packet.windowId === 0) return;
      setTimeout(() => {
        if (state.bot.currentWindow) done(null, state.bot.currentWindow);
      }, 300);
    }

    let setSlotCount = 0;
    let setSlotTimer = null;

    function onSetSlot(packet) {
      if (resolved) return;
      if (packet.windowId === 0 || packet.windowId === -1) return;
      setSlotCount++;
      if (setSlotTimer) clearTimeout(setSlotTimer);
      setSlotTimer = setTimeout(() => {
        if (resolved) return;
        if (state.bot.currentWindow) done(null, state.bot.currentWindow);
      }, 500);
    }

    state.bot._client.on('open_window', onOpenRaw);
    state.bot._client.on('window_items', onItems);
    state.bot._client.on('set_slot', onSetSlot);

    try {
      const pos = block.position;
      await state.bot.lookAt(pos.offset(0.5, 0.5, 0.5), true);
      state.bot._client.write('block_place', {
        location: pos,
        direction: 1,
        hand: 0,
        cursorX: 0.5,
        cursorY: 0.5,
        cursorZ: 0.5,
        insideBlock: false,
        sequence: 0
      });
      state.bot.swingArm();
    } catch (e) {
      done(e);
    }
  });
}

export function findNearbyChests() {
  if (!state.bot || !state.bot.entity) return [];
  const chests = [];
  const pos = state.bot.entity.position;

  for (let dx = -CHEST_SEARCH_RANGE; dx <= CHEST_SEARCH_RANGE; dx++) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dz = -CHEST_SEARCH_RANGE; dz <= CHEST_SEARCH_RANGE; dz++) {
        const block = state.bot.blockAt(pos.offset(dx, dy, dz));
        if (!block) continue;
        if (block.name === 'chest' || block.name === 'trapped_chest' || block.name === 'barrel') {
          chests.push(block);
        }
      }
    }
  }

  chests.sort((a, b) => {
    const da = pos.distanceTo(a.position);
    const db = pos.distanceTo(b.position);
    return da - db;
  });

  return chests;
}

export async function manageInventory() {
  if (!state.bot || !state.bot.entity || state.isManagingInventory) return;
  if (state.isEating) return;

  const now = Date.now();
  if (now - state.lastInventoryManageTime < INVENTORY_MANAGE_COOLDOWN) return;
  state.lastInventoryManageTime = now;

  const trashItems = state.bot.inventory.items().filter(i => TRASH_ITEMS.has(i.name));
  const storeItems = state.bot.inventory.items().filter(i => STORE_IN_CHEST.has(i.name));

  if (trashItems.length === 0 && storeItems.length === 0) return;

  state.isManagingInventory = true;

  for (const item of trashItems) {
    if (PROTECTED_ITEMS.has(item.name)) continue;
    try {
      log(`[ИНВЕНТАРЬ] Выбрасываю ${ru(item.name)} x${item.count}`);
      await state.bot.tossStack(item);
      await sleep(300);
    } catch (e) {
      log(`[ИНВЕНТАРЬ] Ошибка выброса: ${e.message}`);
    }
  }

  const needFood = !state.bot.inventory.items().some(i => FOOD_VALUES[i.name]);
  const needChest = storeItems.length > 0 || needFood;

  if (needChest) {
    const chests = findNearbyChests();
    if (chests.length > 0) {
      for (const chest of chests) {
        try {
          const chestCenter = chest.position.offset(0.5, 0.5, 0.5);

          const emptySlot = state.bot.inventory.firstEmptyHotbarSlot();
          if (emptySlot !== null) {
            state.bot.setQuickBarSlot(emptySlot - state.bot.inventory.hotbarStart);
          }
          await sleep(100);

          await state.bot.lookAt(chestCenter);
          await sleep(300);

          const window = await openChest(chest);
          if (!window) continue;

          await sleep(500);

          const invStart = window.inventoryStart || 27;

          if (storeItems.length > 0) {
            for (let i = invStart; i < window.inventoryEnd; i++) {
              const item = window.slots[i];
              if (!item) continue;
              if (!STORE_IN_CHEST.has(item.name)) continue;
              if (PROTECTED_ITEMS.has(item.name)) continue;
              log(`[СУНДУК] Кладу ${ru(item.name)} x${item.count} (слот ${i})`);
              try {
                await state.bot.clickWindow(i, 0, 1);
                await sleep(200);
              } catch (e) {
                log(`[СУНДУК] Ошибка складирования: ${e.message}`);
              }
            }
          }

          if (needFood) {
            for (let i = 0; i < invStart; i++) {
              const item = window.slots[i];
              if (!item) continue;
              if (FOOD_VALUES[item.name]) {
                log(`[СУНДУК] Беру ${ru(item.name)} x${item.count} (слот ${i})`);
                try {
                  await state.bot.clickWindow(i, 0, 1);
                  await sleep(200);
                } catch (e) {
                  log(`[СУНДУК] Ошибка взятия: ${e.message}`);
                }
              }
            }
          }

          state.bot.closeWindow(window);
          await sleep(300);
          break;
        } catch (e) {
          log(`[СУНДУК] Ошибка открытия: ${e.message}`);
        }
      }
    }
  }

  state.isManagingInventory = false;
}
