import state from './state.js';
import { log, sleep } from './utils.js';

export async function navigateToAnarchy() {
  if (state.navigationDone) return;
  try {
    log('Отправляем /anarchy...');
    state.bot.chat('/anarchy');
    log('Ждём GUI выбора сервера...');
  } catch (e) {
    log(`Ошибка навигации: ${e.message}`);
  }
}

export function handleWindow(window, onDone) {
  const title = window.title ? JSON.stringify(window.title) : '';
  log(`Окно: ${title} (${window.slots.length} слотов)`);
  logWindowSlots(window);

  let slot = findSlotWithCount(window, 2);
  if (slot === null) slot = findSlotByName(window, ['2']);

  if (slot !== null) {
    log(`Сервер "2" в слоте ${slot}, кликаем...`);
    setTimeout(() => {
      state.bot.clickWindow(slot, 0, 0);
      log('Кликнули! Ждём телепорт...');
      setTimeout(() => onDone(), 3000);
    }, 500);
  } else {
    log('Не нашли слот, пробуем слот 12...');
    setTimeout(() => {
      state.bot.clickWindow(12, 0, 0);
      log('Кликнули слот 12! Ждём телепорт...');
      setTimeout(() => onDone(), 3000);
    }, 500);
  }
}

export function findSlotWithCount(window, count) {
  for (let i = 0; i < window.slots.length; i++) {
    const item = window.slots[i];
    if (!item) continue;
    if (item.count === count) return i;
  }
  return null;
}

export function findSlotByName(window, keywords) {
  for (let i = 0; i < window.slots.length; i++) {
    const item = window.slots[i];
    if (!item) continue;
    const name = (item.customName || item.displayName || item.name || '').toLowerCase();
    const lore = item.customLore ? item.customLore.join(' ').toLowerCase() : '';
    const combined = name + ' ' + lore;
    for (const kw of keywords) {
      if (combined.includes(kw.toLowerCase())) return i;
    }
  }
  return null;
}

function logWindowSlots(window) {
  for (let i = 0; i < window.slots.length; i++) {
    const item = window.slots[i];
    if (!item) continue;
    const name = item.customName || item.displayName || item.name || 'unknown';
    log(`  Slot ${i}: ${name} (${item.type}/${item.count})`);
  }
}
