const state = {
  bot: null,
  guardActive: false,
  farmActive: false,
  navigationDone: false,
  spawnHandled: false,
  reconnecting: false,
  lastEnemyName: null,
  reconnectAttempt: 0,
  currentMode: 'farm',
  isEating: false,
  isManagingInventory: false,
  lastHealth: 20,
  lastAttackTime: 0,
  lastInventoryManageTime: 0,
  lastChestFoodSearchTime: 0,
  lastHungryTgTime: 0,
  guardScanTimer: null,
  farmLoopTimer: null,
  autoEatTimer: null,
  statusLogCounter: 0,
};

export default state;
