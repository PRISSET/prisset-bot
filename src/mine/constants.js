export const PICKAXE_TIERS = [
  'netherite_pickaxe', 'diamond_pickaxe', 'iron_pickaxe',
  'stone_pickaxe', 'wooden_pickaxe', 'golden_pickaxe'
];

export const DANGEROUS_BLOCKS = new Set([
  'lava', 'flowing_lava', 'water', 'flowing_water'
]);

export const SKIP_BLOCKS = new Set([
  'air', 'cave_air', 'void_air', 'bedrock', 'barrier',
  'command_block', 'end_portal_frame', 'end_portal', 'nether_portal',
  'lava', 'flowing_lava', 'water', 'flowing_water'
]);

export const MAX_REACH = 3.5;
export const MAX_DIG_RETRIES = 3;
export const DIG_DELAY = 70;

export function rnd(min, max) {
  return Math.floor(min + Math.random() * (max - min));
}
