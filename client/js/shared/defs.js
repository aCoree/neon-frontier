// Spieldefinitionen: Waffen, Items, Modi, Skins, XP. Wird von Server und Client geteilt.

export const AMMO = {
  light:   { name: 'Leichte Muni', max: 240, color: '#ffd24a' },
  shells:  { name: 'Schrot',       max: 40,  color: '#ff6b4a' },
  sniper:  { name: 'Präzisions-Muni', max: 30, color: '#9be15d' },
  rockets: { name: 'Raketen',      max: 10,  color: '#ff8a3d' },
  energy:  { name: 'Energiezellen', max: 240, color: '#4de1ff' },
};

// kind: hitscan | proj | beam | melee
export const WEAPONS = {
  blade: { name: 'Plasma-Klinge', cls: 'melee', kind: 'melee', ammo: null, mag: 0, dmg: 52, rate: 1.9, auto: true, range: 3.0, hs: 1, reload: 0, spread: 0, color: 0x66ffee, snd: 'blade', desc: 'Nahkampf. Schnell, tödlich, leise.' },
  viper: { name: 'Viper', cls: 'pistol', kind: 'hitscan', ammo: 'light', mag: 12, dmg: 20, rate: 6.5, auto: false, spread: 0.010, adsSpread: 0.4, range: 130, reload: 1.2, hs: 1.9, recoil: 1.5, zoom: 58, color: 0xffe08a, snd: 'pistol', desc: 'Zuverlässige Pistole.' },
  magnum: { name: 'Hand Cannon', cls: 'pistol', kind: 'hitscan', ammo: 'light', mag: 6, dmg: 54, rate: 2.2, auto: false, spread: 0.008, adsSpread: 0.35, range: 150, reload: 1.9, hs: 2.0, recoil: 4.5, zoom: 55, color: 0xffb36b, snd: 'magnum', desc: 'Wuchtiger Revolver. Zwei Treffer am Kopf.' },
  striker: { name: 'AR-7 Striker', cls: 'rifle', kind: 'hitscan', ammo: 'light', mag: 30, dmg: 18, rate: 9, auto: true, spread: 0.016, adsSpread: 0.45, range: 160, reload: 1.9, hs: 1.6, recoil: 1.1, zoom: 52, color: 0xffd24a, snd: 'rifle', desc: 'Vollautomatisches Sturmgewehr.' },
  hornet: { name: 'Hornet SMG', cls: 'smg', kind: 'hitscan', ammo: 'light', mag: 36, dmg: 11, rate: 16, auto: true, spread: 0.030, adsSpread: 0.55, range: 90, reload: 1.5, hs: 1.5, recoil: 0.65, zoom: 56, color: 0xfff08a, snd: 'smg', desc: 'Extrem hohe Feuerrate, kurze Reichweite.' },
  breaker: { name: 'Breaker', cls: 'shotgun', kind: 'hitscan', ammo: 'shells', mag: 6, dmg: 11, pellets: 9, rate: 1.15, auto: false, spread: 0.055, adsSpread: 0.7, range: 45, reload: 2.4, hs: 1.4, recoil: 6, zoom: 58, color: 0xff9a5a, snd: 'shotgun', desc: 'Pump-Shotgun. Verheerend im Nahkampf.' },
  marksman: { name: 'Marksman DMR', cls: 'dmr', kind: 'hitscan', ammo: 'sniper', mag: 12, dmg: 36, rate: 3.2, auto: false, spread: 0.005, adsSpread: 0.25, range: 220, reload: 2.1, hs: 1.9, recoil: 2.2, zoom: 38, color: 0xb8ff7a, snd: 'dmr', desc: 'Halbautomatisches Präzisionsgewehr.' },
  longshot: { name: 'Longshot', cls: 'sniper', kind: 'hitscan', ammo: 'sniper', mag: 5, dmg: 98, rate: 0.85, auto: false, spread: 0.012, adsSpread: 0.02, range: 400, reload: 2.7, hs: 2.3, recoil: 6, zoom: 16, scope: true, color: 0xc9ff9a, snd: 'sniper', desc: 'Scharfschützengewehr. Ein kritischer Treffer genügt.' },
  stormcaller: { name: 'Stormcaller', cls: 'launcher', kind: 'proj', ammo: 'rockets', mag: 1, dmg: 112, rate: 1.0, auto: false, spread: 0.004, adsSpread: 0.5, range: 300, reload: 2.9, hs: 1, recoil: 7, zoom: 56, proj: { type: 'rocket', speed: 36, grav: 0, splash: 5.6, life: 6 }, color: 0xff7a2a, snd: 'rocket', desc: 'Raketenwerfer. Flächenschaden.' },
  pulse: { name: 'Pulse Rifle', cls: 'plasma', kind: 'proj', ammo: 'energy', mag: 40, dmg: 16, rate: 7.5, auto: true, spread: 0.014, adsSpread: 0.5, range: 200, reload: 2.0, hs: 1.5, recoil: 0.8, zoom: 54, proj: { type: 'plasma', speed: 70, grav: 0, splash: 1.8, life: 3 }, color: 0x39d9ff, snd: 'plasma', desc: 'Energiegeschosse mit kleinem Splash.' },
  lancer: { name: 'Lancer Laser', cls: 'laser', kind: 'beam', ammo: 'energy', mag: 100, dmg: 4.2, rate: 20, auto: true, spread: 0.003, adsSpread: 0.3, range: 100, reload: 2.2, hs: 1.5, recoil: 0.15, zoom: 54, color: 0xff3da8, snd: 'laser', desc: 'Kontinuierlicher Laserstrahl.' },
};
export const WEAPON_IDS = Object.keys(WEAPONS);
export const WEAPON_INDEX = Object.fromEntries(WEAPON_IDS.map((k, i) => [k, i]));
export const START_LOADOUT = ['viper', 'blade'];
export const START_AMMO = { light: 72, shells: 0, sniper: 0, rockets: 0, energy: 0 };

export const THROWABLES = {
  grenade: { name: 'Splittergranate', fuse: 2.4, splash: 5.2, dmg: 96, speed: 19, bounce: 0.45 },
  smoke: { name: 'Rauchbombe', fuse: 1.3, splash: 0, dmg: 0, speed: 18, bounce: 0.35, smokeTime: 14, smokeRadius: 6.5 },
};

export const CONSUMABLES = {
  medkit: { name: 'Medkit', max: 4, key: 'Z', heal: 55, color: '#ff4d6d' },
  shieldpot: { name: 'Schildtrank', max: 4, key: 'X', shield: 50, color: '#4db8ff' },
  grenade: { name: 'Granate', max: 5, key: 'G', color: '#ffb347' },
  smoke: { name: 'Rauchbombe', max: 4, key: 'H', color: '#c9d2dc' },
};

export const POWERUPS = {
  speed: { name: 'Geschwindigkeitsschub', dur: 9, color: '#ffe14d' },
  jump: { name: 'Sprungverstärker', dur: 12, color: '#7dff6b' },
  barrier: { name: 'Schutzschild', dur: 8, color: '#5ad7ff', absorb: 90 },
};

export const GADGETS = {
  grapple: { name: 'Enterhaken', cd: 1.6, color: '#ffa94d', desc: 'F: Haken auf Zielpunkt schießen und hinziehen.' },
  jetpack: { name: 'Jetpack', cd: 0, color: '#ff6b3d', desc: 'Leertaste halten in der Luft. Treibstoff lädt am Boden.' },
  teleporter: { name: 'Teleporter', cd: 7, color: '#b36bff', desc: 'F: Anker setzen. F erneut: zurückteleportieren.' },
  drone: { name: 'Kampfdrohne', cd: 35, color: '#4dffb8', desc: 'F: Drohne beschwören, die Gegner beschießt (20 s).' },
  scanner: { name: 'Scanner', cd: 18, color: '#4de1ff', desc: 'F: Gegner im Umkreis 5 s sichtbar machen.' },
};

export const MODES = {
  ffa:   { name: 'Free for All',     teams: 0, size: 0, max: 12, score: 25, desc: 'Jeder gegen jeden. Wer zuerst das Limit erreicht, gewinnt.' },
  tdm:   { name: 'Team Deathmatch',  teams: 2, size: 0, max: 12, score: 40, desc: 'Zwei Teams, beliebig viele Spieler.' },
  duel:  { name: '1 gegen 1',        teams: 2, size: 1, max: 2,  score: 15, desc: 'Das klassische Duell.' },
  v2:    { name: '2 gegen 2',        teams: 2, size: 2, max: 4,  score: 25, desc: 'Zwei Teams mit je zwei Spielern.' },
  v3:    { name: '3 gegen 3',        teams: 2, size: 3, max: 6,  score: 30, desc: 'Zwei Teams mit je drei Spielern.' },
  v222:  { name: '2 gegen 2 gegen 2', teams: 3, size: 2, max: 6, score: 25, desc: 'Drei Teams, ein Sieger.' },
};
export const TEAMS = [
  { name: 'Azur', color: '#2aa8ff', hex: 0x2aa8ff },
  { name: 'Magma', color: '#ff5a3c', hex: 0xff5a3c },
  { name: 'Viridis', color: '#4dff8a', hex: 0x4dff8a },
];
export const DIFFS = {
  easy:   { name: 'Einfach', react: 0.85, aim: 0.075, fire: 0.55, speed: 0.78, acc: 0.35, dmg: 0.7, view: 55 },
  normal: { name: 'Normal',  react: 0.5,  aim: 0.04,  fire: 0.75, speed: 0.92, acc: 0.6,  dmg: 0.9, view: 75 },
  hard:   { name: 'Schwer',  react: 0.22, aim: 0.016, fire: 1.0,  speed: 1.0,  acc: 0.88, dmg: 1.0, view: 100 },
};

// Seltenheit: bestimmt Rahmen, Glanz und Aussehen im Shop. Je seltener, desto aufwendiger das Modell (Umhang, Flügel, Aura …).
export const RARITY = {
  common:    { name: 'Gewöhnlich', color: '#9db0c8', rank: 0 },
  rare:      { name: 'Selten',     color: '#4aa8ff', rank: 1 },
  epic:      { name: 'Episch',     color: '#b45cff', rank: 2 },
  legendary: { name: 'Legendär',   color: '#ffb52e', rank: 3 },
  mythic:    { name: 'Mythisch',   color: '#ff4fd8', rank: 4 },
};
// extras: Zusatzmodelle (siehe render/skinfx.js) · hue: Farben wechseln laufend · pulse: Leuchtteile pulsieren
export const SKINS = [
  { id: 'vanguard', name: 'Vanguard', level: 1,  rarity: 'common',    armor: '#3b7ddd', suit: '#1b2436', accent: '#7ee8ff', visor: '#6cf3ff', head: 'helmet', metal: 0.55, blurb: 'Der Standard-Kämpfer der Neon-Grenze.' },
  { id: 'ember',    name: 'Ember',    level: 2,  rarity: 'common',    armor: '#c8402e', suit: '#2b1a17', accent: '#ffb347', visor: '#ff9a3c', head: 'crest',  metal: 0.5, extras: ['pulse'], blurb: 'Glühende Rüstung mit Feuerkamm.' },
  { id: 'verdant',  name: 'Verdant',  level: 4,  rarity: 'rare',      armor: '#4a8c3a', suit: '#1f2a1c', accent: '#c4ff5c', visor: '#b6ff5c', head: 'hood',   metal: 0.25, extras: ['pulse', 'leaves'], blurb: 'Waldläufer in lebendiger Tarnung.' },
  { id: 'phantom',  name: 'Phantom',  level: 6,  rarity: 'rare',      armor: '#262636', suit: '#0f0f18', accent: '#b45cff', visor: '#c06bff', head: 'helmet', scarf: true, metal: 0.8, extras: ['aura'], blurb: 'Lautlos wie ein Schatten, mit Schal und Aura.' },
  { id: 'solaris',  name: 'Solaris',  level: 8,  rarity: 'epic',      armor: '#e8b923', suit: '#3a2f10', accent: '#fff2a8', visor: '#fff2a8', head: 'halo',   metal: 0.95, extras: ['rays', 'pulse'], blurb: 'Goldene Rüstung mit Heiligenschein und Strahlenkranz.' },
  { id: 'frost',    name: 'Frost',    level: 10, rarity: 'epic',      armor: '#dff1ff', suit: '#5a7fa6', accent: '#6ffcff', visor: '#7ffcff', head: 'antenna', metal: 0.4, extras: ['crystals', 'aura'], blurb: 'Eiskristalle wachsen aus den Schultern.' },
  { id: 'rogue',    name: 'Rogue-Bot', level: 13, rarity: 'epic',     armor: '#8b96a3', suit: '#2a2f36', accent: '#ff3d52', visor: '#ff2a44', head: 'robot',  metal: 0.9, extras: ['vents', 'spikes', 'pulse'], blurb: 'Ausgemusterter Kampfroboter mit Glühkern.' },
  { id: 'samurai',  name: 'Neon Samurai', level: 16, rarity: 'legendary', armor: '#14141c', suit: '#2a0f22', accent: '#ff3d9a', visor: '#ff5cb0', head: 'horns', metal: 0.7, extras: ['cape', 'katana', 'pulse'], blurb: 'Schwarze Rüstung, Umhang und Katana.' },
  { id: 'void',     name: 'Void Walker', level: 20, rarity: 'legendary', armor: '#150d24', suit: '#06030d', accent: '#8f4dff', visor: '#d9a8ff', head: 'horns', metal: 0.9, extras: ['wings', 'orbit', 'aura', 'pulse'], blurb: 'Wandelt zwischen den Welten – Splitterflügel und kreisende Fragmente.' },
  { id: 'aurora',   name: 'Aurora',   level: 25, rarity: 'mythic',    armor: '#e9f7ff', suit: '#27406b', accent: '#5cffd8', visor: '#ffffff', head: 'halo',  metal: 0.85, extras: ['ribbons', 'halo2', 'orbit', 'hue'], blurb: 'Polarlicht in Rüstungsform – die Farben wandern.' },
  { id: 'inferno',  name: 'Inferno-Lord', level: 30, rarity: 'mythic', armor: '#1c0c08', suit: '#2a0e05', accent: '#ff7a1a', visor: '#ffd166', head: 'horns', metal: 0.75, extras: ['crown', 'cape', 'spikes', 'aura', 'pulse'], blurb: 'Lavarüstung, Flammenkrone und brennender Umhang.' },
  { id: 'prism',    name: 'Prisma',   level: 40, rarity: 'mythic',    armor: '#f4f1ff', suit: '#2a2748', accent: '#ff5cf0', visor: '#ffffff', head: 'halo',  metal: 1.0, extras: ['wings', 'orbit', 'rays', 'aura', 'hue'], blurb: 'Das seltenste Set: Regenbogen-Flügel, Prismen und Strahlenkranz.' },
];
export const WSKINS = [
  { id: 'default', name: 'Standard',  level: 1,  rarity: 'common',    tint: null,     glow: null },
  { id: 'carbon',  name: 'Carbon',    level: 3,  rarity: 'rare',      tint: 0x1b1b22, glow: 0x66ffcc, metal: 0.55, rough: 0.35 },
  { id: 'gold',    name: 'Gold',      level: 6,  rarity: 'epic',      tint: 0xd9a520, glow: 0xffe27a, metal: 1.0, rough: 0.22 },
  { id: 'neon',    name: 'Neon Grid', level: 9,  rarity: 'epic',      tint: 0x1a1030, glow: 0xff3df0, metal: 0.7, rough: 0.3, fx: ['strip'] },
  { id: 'toxic',   name: 'Toxic',     level: 11, rarity: 'epic',      tint: 0x16240f, glow: 0x9dff3a, metal: 0.6, rough: 0.4, fx: ['strip'] },
  { id: 'magma',   name: 'Magma',     level: 12, rarity: 'legendary', tint: 0x3a1208, glow: 0xff6a1a, metal: 0.5, rough: 0.5, fx: ['strip', 'core'] },
  { id: 'frost',   name: 'Frostbite', level: 15, rarity: 'legendary', tint: 0xcfe8ff, glow: 0x7fe7ff, metal: 0.85, rough: 0.15, fx: ['strip', 'core'] },
  { id: 'void',    name: 'Void',      level: 18, rarity: 'legendary', tint: 0x0d0618, glow: 0xa05cff, metal: 0.95, rough: 0.2, fx: ['strip', 'core', 'ring'] },
  { id: 'dragon',  name: 'Drachenzahn', level: 22, rarity: 'mythic',  tint: 0x5a0d12, glow: 0xffc94a, metal: 1.0, rough: 0.2, fx: ['strip', 'core', 'ring', 'shimmer'] },
  { id: 'prism',   name: 'Prisma',    level: 30, rarity: 'mythic',    tint: 0xf1edff, glow: 0xff5cf0, metal: 1.0, rough: 0.1, fx: ['strip', 'core', 'ring', 'shimmer', 'hue'] },
];

export const ACHIEVEMENTS = [
  { id: 'firstblood', name: 'First Blood', desc: 'Erster Abschuss.', xp: 100 },
  { id: 'kills10', name: 'Zehnerpack', desc: '10 Abschüsse in einem Match.', xp: 200 },
  { id: 'headshots', name: 'Kopfjäger', desc: '25 Kopftreffer insgesamt.', xp: 250 },
  { id: 'streak5', name: 'Unaufhaltsam', desc: '5 Abschüsse ohne zu sterben.', xp: 250 },
  { id: 'sniper100', name: 'Fernschuss', desc: 'Abschuss aus über 80 m.', xp: 200 },
  { id: 'boom', name: 'Big Bang', desc: 'Abschuss mit Rakete oder Granate.', xp: 150 },
  { id: 'winner', name: 'Sieger', desc: 'Ein Match gewinnen.', xp: 300 },
  { id: 'botslayer', name: 'Bot-Schreck', desc: '50 Bots besiegen.', xp: 300 },
  { id: 'shards5', name: 'Entdecker', desc: '5 Daten-Kerne finden.', xp: 250 },
  { id: 'chests10', name: 'Schatzsucher', desc: '10 Kisten öffnen.', xp: 250 },
  { id: 'duck', name: 'Goldene Ente', desc: 'Die geheime Ente finden.', xp: 500 },
  { id: 'moon', name: 'Moonwalker', desc: 'Den Schwerkraft-Knopf drücken.', xp: 300 },
  { id: 'vault', name: 'Tresorknacker', desc: 'Den Industrie-Tresor öffnen.', xp: 300 },
  { id: 'level10', name: 'Veteran', desc: 'Level 10 erreichen.', xp: 400 },
];

export const xpForLevel = (lvl) => 300 + 120 * lvl;

export const PLAYER = {
  radius: 0.4, height: 1.8, crouchHeight: 1.2, eye: 1.6, hp: 100, shield: 100,
  walk: 5.2, sprint: 8.4, crouch: 2.6, jump: 7.6, gravity: 24, stepUp: 0.55,
  dashSpeed: 17, dashTime: 0.22, dashCd: 1.8,
};

export const NET = { tick: 25, snapEvery: 2, sendRate: 20 };

// Item-Tabelle für Pickups
export function itemLabel(kind, item) {
  if (kind === 'weapon') return WEAPONS[item]?.name || item;
  if (kind === 'ammo') return AMMO[item]?.name || item;
  if (kind === 'cons') return CONSUMABLES[item]?.name || item;
  if (kind === 'power') return POWERUPS[item]?.name || item;
  if (kind === 'gadget') return GADGETS[item]?.name || item;
  if (kind === 'shard') return 'Daten-Kern';
  return item;
}

// Status-Flags für Spieler-Snapshots
export const FL = { CROUCH: 1, SPRINT: 2, AIR: 4, DASH: 8, RELOAD: 16, AIM: 32, DEAD: 64, SHOOT: 128, GRAPPLE: 256, JET: 512, MELEE: 1024, THROW: 2048, SPD: 4096, JMP: 8192, BAR: 16384, INVULN: 32768, DRONE: 65536 };

export const LOOT = {
  t1: [['weapon', 'striker'], ['weapon', 'hornet'], ['weapon', 'breaker'], ['weapon', 'magnum'], ['cons', 'medkit'], ['cons', 'shieldpot'], ['cons', 'grenade'], ['ammo', 'light'], ['ammo', 'shells']],
  t2: [['weapon', 'marksman'], ['weapon', 'pulse'], ['weapon', 'breaker'], ['weapon', 'striker'], ['power', 'speed'], ['power', 'jump'], ['gadget', 'grapple'], ['gadget', 'scanner'], ['cons', 'shieldpot'], ['cons', 'medkit']],
  t3: [['weapon', 'stormcaller'], ['weapon', 'lancer'], ['weapon', 'longshot'], ['power', 'barrier'], ['gadget', 'jetpack'], ['gadget', 'drone'], ['gadget', 'teleporter'], ['weapon', 'pulse']],
};
export const AMMO_GIVE = { light: 60, shells: 12, sniper: 10, rockets: 4, energy: 80 };

// ---- Shop-Katalog (Cosmetics): Server prüft Besitz & Preis, der Client zeigt nur an ----
export const CATALOG = [
  ...SKINS.map(s => ({ id: 'skin:' + s.id, type: 'skin', ref: s.id, name: s.name, level: s.level, price: s.level <= 1 ? 0 : s.level * 90 })),
  ...WSKINS.map(s => ({ id: 'wskin:' + s.id, type: 'wskin', ref: s.id, name: s.name, level: s.level, price: s.level <= 1 ? 0 : s.level * 70 })),
];
export const CATALOG_BY_ID = Object.fromEntries(CATALOG.map(i => [i.id, i]));
export const DEFAULT_ITEMS = ['skin:vanguard', 'wskin:default'];
export const DAILY_REWARDS = [{ coins: 50 }, { xp: 100 }, { coins: 75 }, { coins: 100 }, { xp: 200 }, { coins: 150 }, { coins: 300, item: true }];

// ---- Seasons: Monats-Saisons, Punkte kommen ausschließlich vom Server (aus der Match-Belohnung) ----
export const SEASON_TIERS = [
  { points: 100, coins: 50 }, { points: 250, coins: 75 }, { points: 500, coins: 100 }, { points: 900, coins: 150 },
  { points: 1400, coins: 200 }, { points: 2000, coins: 300 }, { points: 2800, coins: 400 }, { points: 3800, coins: 600 },
];
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
// Saison = Kalendermonat (UTC). id z. B. 202611.
export function seasonOf(date = new Date()) {
  const y = date.getUTCFullYear(), mo = date.getUTCMonth();
  return { id: y * 100 + mo + 1, name: `Saison ${MONTHS[mo]} ${y}`, startsAt: Date.UTC(y, mo, 1), endsAt: Date.UTC(y, mo + 1, 1) };
}

// ---- Emotes: der Server prüft ID und Abklingzeit, der Client zeigt nur die Sprechblase ----
export const EMOTES = [
  { id: 'gg', icon: 'GG', label: 'Gutes Spiel' }, { id: 'wave', icon: '👋', label: 'Winken' }, { id: 'thanks', icon: '🙏', label: 'Danke' }, { id: 'laugh', icon: '😂', label: 'Lachen' },
  { id: 'fire', icon: '🔥', label: 'Heiß' }, { id: 'help', icon: '🆘', label: 'Hilfe!' }, { id: 'gl', icon: '🍀', label: 'Viel Glück' }, { id: 'cry', icon: '😢', label: 'Autsch' },
];
export const EMOTE_COOLDOWN = 2.5;   // Sekunden
