/**
 * Gravity Shift levels, authored for GameDNA. 30 x 16 tiles of 32 px.
 * Legend: # solid, . empty, P spawn, K key, E exit, ^ floor spikes, v ceiling spikes.
 */
export const TILE = 32;
export const COLS = 30;
export const ROWS = 16;

export interface LevelDef {
  id: string;
  name: string;
  hint: string;
  rows: string[];
  next: string | null;
  lab?: boolean;
}

const WALL = '#'.repeat(COLS);
const OPEN = `#${'.'.repeat(COLS - 2)}#`;
const open = (n: number): string[] => Array.from({ length: n }, () => OPEN);

export const LEVELS: LevelDef[] = [
  {
    id: 'level-1',
    name: 'I. First Steps',
    hint: 'Arrows or A/D to move. Space to jump. Collect the key, then reach the door.',
    next: 'level-2',
    rows: [
      WALL,
      ...open(6),
      '#....................K.......#',
      '#..................####......#',
      '#............................#',
      '#..............###...........#',
      '#............................#',
      '#..........###...............#',
      '#.P.......................E..#',
      '######^^^^####################',
      WALL,
    ],
  },
  {
    id: 'level-2',
    name: 'II. Ceiling Walk',
    hint: 'Shift or G reverses gravity while you stand on something. Jumps follow gravity.',
    next: 'level-3',
    rows: [
      WALL,
      '#........vv..K...vv..........#',
      ...open(11),
      '#.P........................E.#',
      '#####^^^^^^^^^^^^^^^^^########',
      WALL,
    ],
  },
  {
    id: 'level-3',
    name: 'III. Switchback',
    hint: 'Two keys this time. The door stays shut until you carry both.',
    next: null,
    rows: [
      WALL,
      '#..........K....vv...........#',
      ...open(7),
      '#.........######.............#',
      ...open(3),
      '#.P..........E...........K...#',
      '#######^^^^#########^^^^######',
      WALL,
    ],
  },
  // Lab rooms used by scenarios. They isolate one mechanic each.
  { id: 'lab-flat', name: 'Lab: flat floor', hint: '', next: null, lab: true, rows: [WALL, ...open(12), '#.P..........................#', WALL, WALL] },
  {
    id: 'lab-ledge',
    name: 'Lab: ledge',
    hint: '',
    next: null,
    lab: true,
    rows: [WALL, ...open(8), '#..P.........................#', '###########..................#', ...open(3), WALL, WALL],
  },
  { id: 'lab-spikes', name: 'Lab: spikes', hint: '', next: null, lab: true, rows: [WALL, ...open(12), '#.P..........................#', '#######^^^####################', WALL] },
  { id: 'lab-exit-locked', name: 'Lab: locked exit', hint: '', next: null, lab: true, rows: [WALL, ...open(12), '#.P...E..................K...#', WALL, WALL] },
  { id: 'lab-exit-open', name: 'Lab: open exit', hint: '', next: null, lab: true, rows: [WALL, ...open(12), '#.P..K..E....................#', WALL, WALL] },
];

export function getLevel(id: string): LevelDef {
  return LEVELS.find((l) => l.id === id) ?? (LEVELS[0] as LevelDef);
}

export interface ParsedLevel {
  def: LevelDef;
  solid: boolean[][];
  hazards: Array<{ col: number; row: number; ceiling: boolean }>;
  keys: Array<{ id: string; col: number; row: number }>;
  exits: Array<{ col: number; row: number }>;
  spawn: { col: number; row: number };
}

export function parseLevel(def: LevelDef): ParsedLevel {
  const solid: boolean[][] = [];
  const hazards: ParsedLevel['hazards'] = [];
  const keys: ParsedLevel['keys'] = [];
  const exits: ParsedLevel['exits'] = [];
  let spawn = { col: 1, row: 1 };
  def.rows.forEach((line, row) => {
    const r: boolean[] = [];
    for (let col = 0; col < COLS; col++) {
      const ch = line[col] ?? '#';
      r.push(ch === '#');
      if (ch === '^' || ch === 'v') hazards.push({ col, row, ceiling: ch === 'v' });
      if (ch === 'K') keys.push({ id: `${col},${row}`, col, row });
      if (ch === 'E') exits.push({ col, row });
      if (ch === 'P') spawn = { col, row };
    }
    solid.push(r);
  });
  return { def, solid, hazards, keys, exits, spawn };
}
