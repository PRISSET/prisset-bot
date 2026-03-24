import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, 'config.json');

const DEFAULTS = {
  botNick: 'PrissetBot',
  serverHost: 'hub.holyworld.me',
  serverPort: 25565,
  version: '1.20.1',
  teammates: [],
  ignored: ['classic', 'lite120', 'lite'],
  tgBotToken: '',
  tgChatId: '',
  antiAfkIntervalSec: 45
};

let config = null;

export function load() {
  if (existsSync(CONFIG_PATH)) {
    try {
      const raw = readFileSync(CONFIG_PATH, 'utf-8');
      config = { ...DEFAULTS, ...JSON.parse(raw) };
    } catch {
      config = { ...DEFAULTS };
    }
  } else {
    config = { ...DEFAULTS };
    save();
  }
  return config;
}

export function save() {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

export function get() {
  if (!config) load();
  return config;
}

export function addTeammate(name) {
  const lower = name.trim().toLowerCase();
  if (!lower || config.teammates.includes(lower)) return false;
  config.teammates.push(lower);
  save();
  return true;
}

export function removeTeammate(name) {
  const lower = name.trim().toLowerCase();
  const idx = config.teammates.indexOf(lower);
  if (idx === -1) return false;
  config.teammates.splice(idx, 1);
  save();
  return true;
}

export function setField(key, value) {
  config[key] = value;
  save();
}

export function shouldIgnore(name) {
  const lower = name.toLowerCase();
  return config.teammates.includes(lower) || config.ignored.includes(lower);
}
