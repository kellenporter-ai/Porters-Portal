
// Kenney Asset Pack — Centralized path manifest
// All paths are relative to /public/ and served from the root URL.
// License: CC0 1.0 Universal — https://kenney.nl

// ========================================
// SOUND PATHS
// ========================================

const S = '/assets/kenney/sounds';

/** Interface click/UI feedback sounds */
export const INTERFACE_SOUNDS = {
  click1: `${S}/interface/click_001.ogg`,
  click2: `${S}/interface/click_002.ogg`,
  click3: `${S}/interface/click_003.ogg`,
  confirm1: `${S}/interface/confirmation_001.ogg`,
  confirm2: `${S}/interface/confirmation_002.ogg`,
  close1: `${S}/interface/close_001.ogg`,
  close2: `${S}/interface/close_002.ogg`,
  error1: `${S}/interface/error_001.ogg`,
  error2: `${S}/interface/error_002.ogg`,
  drop1: `${S}/interface/drop_001.ogg`,
  drop2: `${S}/interface/drop_002.ogg`,
  back1: `${S}/interface/back_001.ogg`,
  toggle1: `${S}/interface/toggle_001.ogg`,
  toggle2: `${S}/interface/toggle_002.ogg`,
  maximize1: `${S}/interface/maximize_001.ogg`,
  minimize1: `${S}/interface/minimize_001.ogg`,
  open1: `${S}/interface/open_001.ogg`,
  scroll1: `${S}/interface/scroll_001.ogg`,
  pluck1: `${S}/interface/pluck_001.ogg`,
  pluck2: `${S}/interface/pluck_002.ogg`,
} as const;

/** RPG-themed sounds (books, doors, coins, leather, metal) */
export const RPG_SOUNDS = {
  bookOpen: `${S}/rpg/bookOpen.ogg`,
  bookClose: `${S}/rpg/bookClose.ogg`,
  doorOpen: `${S}/rpg/doorOpen_1.ogg`,
  doorClose: `${S}/rpg/doorClose_1.ogg`,
  coins1: `${S}/rpg/handleCoins.ogg`,
  coins2: `${S}/rpg/handleCoins2.ogg`,
  leather1: `${S}/rpg/handleSmallLeather.ogg`,
  leather2: `${S}/rpg/handleSmallLeather2.ogg`,
  metalClick: `${S}/rpg/metalClick.ogg`,
  metalLatch: `${S}/rpg/metalLatch.ogg`,
  drawKnife: `${S}/rpg/drawKnife1.ogg`,
  dropLeather: `${S}/rpg/dropLeather.ogg`,
  chop: `${S}/rpg/chop.ogg`,
  cloth: `${S}/rpg/cloth1.ogg`,
  creak: `${S}/rpg/creak1.ogg`,
  lockOpen: `${S}/rpg/lockOpen.ogg`,
} as const;

/** Victory/event jingles */
export const JINGLES = {
  levelUp1: `${S}/jingles/jingles_NES00.ogg`,
  levelUp2: `${S}/jingles/jingles_NES01.ogg`,
  victory1: `${S}/jingles/jingles_NES02.ogg`,
  victory2: `${S}/jingles/jingles_NES03.ogg`,
  achievement: `${S}/jingles/jingles_NES04.ogg`,
  bossDefeat1: `${S}/jingles/jingles_HIT00.ogg`,
  bossDefeat2: `${S}/jingles/jingles_HIT01.ogg`,
  bossDefeat3: `${S}/jingles/jingles_HIT02.ogg`,
  questComplete1: `${S}/jingles/jingles_PIZZI00.ogg`,
  questComplete2: `${S}/jingles/jingles_PIZZI01.ogg`,
  reward1: `${S}/jingles/jingles_STEEL00.ogg`,
  reward2: `${S}/jingles/jingles_STEEL01.ogg`,
  fanfare1: `${S}/jingles/jingles_SAX00.ogg`,
  fanfare2: `${S}/jingles/jingles_SAX01.ogg`,
} as const;

/** UI-specific audio (clicks, hovers, switches) */
export const UI_SOUNDS = {
  click1: `${S}/ui/click1.ogg`,
  click2: `${S}/ui/click2.ogg`,
  click3: `${S}/ui/click3.ogg`,
  mouseClick: `${S}/ui/mouseclick1.ogg`,
  mouseRelease: `${S}/ui/mouserelease1.ogg`,
  rollover1: `${S}/ui/rollover1.ogg`,
  rollover2: `${S}/ui/rollover2.ogg`,
  switch1: `${S}/ui/switch10.ogg`,
  switch2: `${S}/ui/switch11.ogg`,
} as const;

/** Impact/hit sounds for combat */
export const IMPACT_SOUNDS = {
  bellHeavy1: `${S}/impact/impactBell_heavy_000.ogg`,
  bellHeavy2: `${S}/impact/impactBell_heavy_001.ogg`,
  glass: `${S}/impact/impactGlass_heavy_000.ogg`,
  metalHeavy: `${S}/impact/impactMetal_heavy_000.ogg`,
  metalLight: `${S}/impact/impactMetal_light_000.ogg`,
  mining: `${S}/impact/impactMining_000.ogg`,
  punch: `${S}/impact/impactPunch_heavy_000.ogg`,
  soft: `${S}/impact/impactSoft_heavy_000.ogg`,
} as const;

/** Digital/sci-fi sounds */
export const DIGITAL_SOUNDS = {
  highUp: `${S}/digital/highUp.ogg`,
  highDown: `${S}/digital/highDown.ogg`,
  lowDown: `${S}/digital/lowDown.ogg`,
  powerUp1: `${S}/digital/powerUp1.ogg`,
  powerUp2: `${S}/digital/powerUp2.ogg`,
  powerUp3: `${S}/digital/powerUp3.ogg`,
  twoTone1: `${S}/digital/twoTone1.ogg`,
  twoTone2: `${S}/digital/twoTone2.ogg`,
  threeTone1: `${S}/digital/threeTone1.ogg`,
  threeTone2: `${S}/digital/threeTone2.ogg`,
} as const;

/** Casino sounds for fortune wheel and loot */
export const CASINO_SOUNDS = {
  chipLay1: `${S}/casino/chip-lay-1.ogg`,
  chipLay2: `${S}/casino/chip-lay-2.ogg`,
  chipsCollide1: `${S}/casino/chips-collide-1.ogg`,
  chipsCollide2: `${S}/casino/chips-collide-2.ogg`,
  chipsHandle1: `${S}/casino/chips-handle-1.ogg`,
  chipsHandle2: `${S}/casino/chips-handle-2.ogg`,
  chipsStack: `${S}/casino/chips-stack-1.ogg`,
  dieThrow1: `${S}/casino/die-throw-1.ogg`,
  dieThrow2: `${S}/casino/die-throw-2.ogg`,
  cardPlace1: `${S}/casino/card-place-1.ogg`,
  cardPlace2: `${S}/casino/card-place-2.ogg`,
  cardSlide: `${S}/casino/card-slide-1.ogg`,
} as const;

// ========================================
// IMAGE PATHS
// ========================================

const IMG = '/assets/kenney/images';

/** Medal images — 9 designs x 3 styles (flat, flatshadow, shaded) */
export const MEDALS = {
  /** Get medal path by style and number (1-9) */
  get: (style: 'flat' | 'flatshadow' | 'shaded', num: number) =>
    `${IMG}/medals/${style}_medal${Math.min(9, Math.max(1, num))}.png`,
  /** All flat medals */
  flat: Array.from({ length: 9 }, (_, i) => `${IMG}/medals/flat_medal${i + 1}.png`),
  /** All shaded medals */
  shaded: Array.from({ length: 9 }, (_, i) => `${IMG}/medals/shaded_medal${i + 1}.png`),
  /** All flatshadow medals */
  flatshadow: Array.from({ length: 9 }, (_, i) => `${IMG}/medals/flatshadow_medal${i + 1}.png`),
} as const;

/** Game icons (white, 1x) — used for inventory, abilities, skill tree */
export const GAME_ICONS = {
  basePath: `${IMG}/icons`,
  /** Get icon by filename (without .png extension) */
  get: (name: string) => `${IMG}/icons/${name}.png`,
} as const;

/** RPG UI elements — XP bars, buttons, panels, cursors, arrows */
export const RPG_UI = {
  basePath: `${IMG}/rpg-ui`,
  get: (name: string) => `${IMG}/rpg-ui/${name}.png`,
} as const;

/** Fantasy UI borders — panels, dividers, borders */
export const BORDERS = {
  basePath: `${IMG}/borders`,
  get: (name: string) => `${IMG}/borders/${name}.png`,
} as const;

// ========================================
// 3D MODEL PATHS
// ========================================

const MDL = '/assets/models';

/**
 * KayKit Dungeon Remastered GLB models (CC0).
 *
 * Categories: walls, floors, stairs, props (barrels, chests, tables, etc.),
 * banners, bottles, candles, columns, furniture, and more.
 * All served from /assets/models/dungeon/.
 */
export const DUNGEON_MODELS = {
  basePath: `${MDL}/dungeon`,

  // --- Structural ---
  wall: `${MDL}/dungeon/wall.glb`,
  wallArched: `${MDL}/dungeon/wall_arched.glb`,
  wallBroken: `${MDL}/dungeon/wall_broken.glb`,
  wallCorner: `${MDL}/dungeon/wall_corner.glb`,
  wallCornerSmall: `${MDL}/dungeon/wall_corner_small.glb`,
  wallCracked: `${MDL}/dungeon/wall_cracked.glb`,
  wallCrossing: `${MDL}/dungeon/wall_crossing.glb`,
  wallDoorway: `${MDL}/dungeon/wall_doorway.glb`,
  wallDoorwaySides: `${MDL}/dungeon/wall_doorway_sides.glb`,
  wallDoorwayTsplit: `${MDL}/dungeon/wall_doorway_Tsplit.glb`,
  wallGated: `${MDL}/dungeon/wall_gated.glb`,
  wallHalf: `${MDL}/dungeon/wall_half.glb`,
  wallPillar: `${MDL}/dungeon/wall_pillar.glb`,
  wallShelves: `${MDL}/dungeon/wall_shelves.glb`,
  wallSloped: `${MDL}/dungeon/wall_sloped.glb`,
  wallTsplit: `${MDL}/dungeon/wall_Tsplit.glb`,
  wallWindowClosed: `${MDL}/dungeon/wall_window_closed.glb`,
  wallWindowOpen: `${MDL}/dungeon/wall_window_open.glb`,

  // --- Floors ---
  floorTileLarge: `${MDL}/dungeon/floor_tile_large.glb`,
  floorTileSmall: `${MDL}/dungeon/floor_tile_small.glb`,
  floorTileDecorated: `${MDL}/dungeon/floor_tile_small_decorated.glb`,
  floorDirtLarge: `${MDL}/dungeon/floor_dirt_large.glb`,
  floorDirtSmallA: `${MDL}/dungeon/floor_dirt_small_A.glb`,
  floorWoodLarge: `${MDL}/dungeon/floor_wood_large.glb`,
  floorWoodSmall: `${MDL}/dungeon/floor_wood_small.glb`,
  ceilingTile: `${MDL}/dungeon/ceiling_tile.glb`,

  // --- Stairs ---
  stairs: `${MDL}/dungeon/stairs.glb`,
  stairsLong: `${MDL}/dungeon/stairs_long.glb`,
  stairsNarrow: `${MDL}/dungeon/stairs_narrow.glb`,
  stairsWide: `${MDL}/dungeon/stairs_wide.glb`,
  stairsWood: `${MDL}/dungeon/stairs_wood.glb`,

  // --- Props ---
  barrelLarge: `${MDL}/dungeon/barrel_large.glb`,
  barrelSmall: `${MDL}/dungeon/barrel_small.glb`,
  chest: `${MDL}/dungeon/chest.glb`,
  chestGold: `${MDL}/dungeon/chest_gold.glb`,
  column: `${MDL}/dungeon/column.glb`,
  pillar: `${MDL}/dungeon/pillar.glb`,
  pillarDecorated: `${MDL}/dungeon/pillar_decorated.glb`,
  torchLit: `${MDL}/dungeon/torch_lit.glb`,
  torchMounted: `${MDL}/dungeon/torch_mounted.glb`,
  candleLit: `${MDL}/dungeon/candle_lit.glb`,
  coin: `${MDL}/dungeon/coin.glb`,
  coinStackLarge: `${MDL}/dungeon/coin_stack_large.glb`,
  key: `${MDL}/dungeon/key.glb`,
  swordShield: `${MDL}/dungeon/sword_shield.glb`,

  // --- Furniture ---
  bed: `${MDL}/dungeon/bed_frame.glb`,
  chair: `${MDL}/dungeon/chair.glb`,
  stool: `${MDL}/dungeon/stool.glb`,
  tableLong: `${MDL}/dungeon/table_long.glb`,
  tableMedium: `${MDL}/dungeon/table_medium.glb`,
  tableSmall: `${MDL}/dungeon/table_small.glb`,
  shelfLarge: `${MDL}/dungeon/shelf_large.glb`,
  shelfSmall: `${MDL}/dungeon/shelf_small.glb`,

  // --- Barriers ---
  barrier: `${MDL}/dungeon/barrier.glb`,
  barrierCorner: `${MDL}/dungeon/barrier_corner.glb`,
  barrierColumn: `${MDL}/dungeon/barrier_column.glb`,

  /** Dynamic lookup — any model by filename (without extension) */
  get: (name: string) => `${MDL}/dungeon/${name}.glb`,
} as const;
