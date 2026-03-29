import https from 'https';
import * as settings from '../settings.js';

export const RECONNECT_DELAYS = [2 * 60 * 1000, 10 * 60 * 1000, 30 * 60 * 1000];

export const HOSTILE_MOBS = new Set([
  'zombie', 'skeleton', 'spider', 'cave_spider', 'creeper',
  'enderman', 'witch', 'slime', 'magma_cube', 'phantom',
  'drowned', 'husk', 'stray', 'zombie_villager', 'pillager',
  'vindicator', 'evoker', 'ravager', 'hoglin', 'piglin_brute',
  'warden', 'blaze', 'ghast', 'wither_skeleton',
  'zombified_piglin', 'piglin', 'silverfish', 'endermite',
  'guardian', 'elder_guardian', 'shulker', 'vex',
  'zombie_pigman'
]);

export const SWORD_TIERS = ['netherite_sword', 'diamond_sword'];
export const ATTACK_RANGE = 4;
export const ATTACK_COOLDOWN_MS = 600;
export const CHEST_SEARCH_RANGE = 4;
export const INVENTORY_MANAGE_COOLDOWN = 30000;
export const CHEST_FOOD_SEARCH_COOLDOWN = 60000;

export const TRASH_ITEMS = new Set([
  'rotten_flesh', 'golden_sword', 'wooden_sword', 'stone_sword',
  'iron_sword', 'poisonous_potato', 'spider_eye'
]);

export const STORE_IN_CHEST = new Set([
  'gold_ingot', 'gold_nugget'
]);

export const PROTECTED_ITEMS = new Set([
  'netherite_sword', 'diamond_sword'
]);

export const FOOD_VALUES = {
  'golden_carrot': 6, 'cooked_beef': 8, 'cooked_porkchop': 8,
  'cooked_mutton': 6, 'cooked_salmon': 6, 'cooked_chicken': 6,
  'cooked_rabbit': 5, 'cooked_cod': 5, 'bread': 5, 'baked_potato': 5,
  'beetroot_soup': 6, 'mushroom_stew': 6, 'rabbit_stew': 10,
  'apple': 4, 'melon_slice': 2, 'sweet_berries': 2,
  'dried_kelp': 1, 'carrot': 3, 'potato': 1
};

const MOB_NAMES_RU = {
  'zombie': 'зомби', 'skeleton': 'скелет',
  'spider': 'паук', 'cave_spider': 'пещерный паук',
  'creeper': 'крипер', 'enderman': 'эндермен',
  'witch': 'ведьма', 'slime': 'слайм',
  'magma_cube': 'магма-куб', 'phantom': 'фантом',
  'drowned': 'утопленник', 'husk': 'кадавр',
  'stray': 'стрей', 'zombie_villager': 'зомби-житель',
  'pillager': 'разбойник', 'vindicator': 'поборник',
  'evoker': 'вызыватель', 'ravager': 'разоритель',
  'hoglin': 'хоглин', 'piglin_brute': 'пиглин-грубиян',
  'warden': 'страж', 'blaze': 'блейз',
  'ghast': 'гаст', 'wither_skeleton': 'скелет-иссушитель',
  'zombified_piglin': 'зомби-пиглин',
  'zombie_pigman': 'зомби-свиночеловек',
  'piglin': 'пиглин',
  'silverfish': 'чердачок',
  'endermite': 'эндермит',
  'guardian': 'страж океана',
  'elder_guardian': 'древний страж',
  'shulker': 'шалкер', 'vex': 'векс'
};

const ITEM_NAMES_RU = {
  'netherite_sword': 'незеритовый меч',
  'diamond_sword': 'алмазный меч',
  'iron_sword': 'железный меч',
  'stone_sword': 'каменный меч',
  'golden_sword': 'золотой меч',
  'wooden_sword': 'деревянный меч',
  'golden_carrot': 'золотая морковка',
  'cooked_beef': 'стейк', 'cooked_porkchop': 'жареная свинина',
  'cooked_mutton': 'жареная баранина',
  'cooked_salmon': 'жареный лосось',
  'cooked_chicken': 'жареная курица',
  'cooked_rabbit': 'жареный кролик',
  'cooked_cod': 'жареная треска',
  'bread': 'хлеб', 'baked_potato': 'печёный картофель',
  'apple': 'яблоко', 'melon_slice': 'долька арбуза',
  'sweet_berries': 'сладкие ягоды',
  'dried_kelp': 'сушёная морская капуста',
  'carrot': 'морковка', 'potato': 'картофель',
  'netherite_pickaxe': 'незеритовая кирка',
  'diamond_pickaxe': 'алмазная кирка',
  'iron_pickaxe': 'железная кирка',
  'stone_pickaxe': 'каменная кирка',
  'wooden_pickaxe': 'деревянная кирка',
  'golden_pickaxe': 'золотая кирка'
};

export function ru(name) {
  return ITEM_NAMES_RU[name] || MOB_NAMES_RU[name] || name;
}

export function log(msg) {
  console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function sendTelegram(text) {
  const cfg = settings.get();
  const token = cfg.tgBotToken;
  const chatId = cfg.tgChatId;
  if (!token || !chatId) return;

  const data = `chat_id=${encodeURIComponent(chatId)}&text=${encodeURIComponent(text)}`;
  const req = https.request({
    hostname: 'api.telegram.org',
    path: `/bot${token}/sendMessage`,
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(data) }
  });
  req.on('error', (e) => log(`TG error: ${e.message}`));
  req.write(data);
  req.end();
}

export function isAtSpawn(bot) {
  if (!bot || !bot.entity) return true;
  const pos = bot.entity.position;
  return Math.abs(pos.x) < 100 && Math.abs(pos.z) < 100;
}

export function randomDelay(min, max) {
  return min + Math.random() * (max - min);
}
