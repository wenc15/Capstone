// dicebuild/board.js
// Board topology and coordinate helpers for Dice & Build.

import { BOARD_COLS, BOARD_ROWS } from './constants.js';

export function idxOf(x, y) {
  return y * BOARD_COLS + x;
}

export function makeBoard() {
  const tiles = new Map();

  function put(x, y, kind) {
    tiles.set(idxOf(x, y), { x, y, kind });
  }

  const map = [
    'xx---xx',
    'x!*$**x',
    '?*   *?',
    '?#   #?',
    '?*   *?',
    'x**$**x',
    'xx---xx',
  ];

  const kindByChar = {
    '!': 'start',
    '$': 'coin',
    '#': 'gift',
    '*': 'path',
    '-': 'build_open',
    '?': 'build_locked',
  };

  for (let y = 0; y < BOARD_ROWS; y += 1) {
    const row = map[y] || '';
    for (let x = 0; x < BOARD_COLS; x += 1) {
      const ch = row[x] || 'x';
      const kind = kindByChar[ch];
      if (kind) put(x, y, kind);
    }
  }

  const loop = [
    idxOf(1, 1),
    idxOf(2, 1),
    idxOf(3, 1),
    idxOf(4, 1),
    idxOf(5, 1),
    idxOf(5, 2),
    idxOf(5, 3),
    idxOf(5, 4),
    idxOf(5, 5),
    idxOf(4, 5),
    idxOf(3, 5),
    idxOf(2, 5),
    idxOf(1, 5),
    idxOf(1, 4),
    idxOf(1, 3),
    idxOf(1, 2),
  ];

  return {
    cols: BOARD_COLS,
    rows: BOARD_ROWS,
    tiles,
    loop,
  };
}
