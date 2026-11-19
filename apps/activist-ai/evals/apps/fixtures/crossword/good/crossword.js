/* Crossword — AI-generated crossword puzzle on demand.
 *
 * The puzzle grid is built with a small greedy/backtracking fill: words are
 * placed so they intersect existing words, side-adjacency is respected, and
 * every empty cell is blacked out at the end. Clues are written by a local
 * "AI" clue writer (template-based, with an optional LLM endpoint hook) and
 * shown in Across / Down lists. The puzzle is playable with tap, pointer and
 * physical keyboard, and the game state is saved to localStorage.
 */

const SIZE_OPTIONS = [9, 11, 13, 15];
const MIN_WORDS = 8;
const WORD_MIN_LEN = 3;
const WORD_MAX_LEN = 15;

let state = {
  size: 11,
  difficulty: 'medium',
  theme: '',
  grid: [],        // size x size: null (empty/block), {letter} (filled)
  placed: [],      // placed words: {word, clue, row, col, dir, number}
  cells: [],       // size x size: {r, c, number, solution, letter, acrossIdx, downIdx, block}
  across: [],      // {number, word, clue, cells:[{r,c}]}
  down: [],
  current: null,   // {r, c}
  direction: 'across',
  timer: { running: false, seconds: 0, start: null },
  solved: false,
};

// ---------------------------------------------------------------------------
// Dictionary (seed words with hand-written clues where we have them)
// ---------------------------------------------------------------------------
const DICTIONARY = {
  general: [
    { word: 'OCEAN', clue: 'Body of salt water' },
    { word: 'PLANET', clue: 'Celestial body orbiting a star' },
    { word: 'MUSIC', clue: 'Art of sound in time' },
    { word: 'GARDEN', clue: 'Plot where plants are grown' },
    { word: 'PUZZLE', clue: 'Game testing one’s ingenuity' },
    { word: 'MUSEUM', clue: 'Building housing art and artifacts' },
    { word: 'RAINBOW', clue: 'Multicolored arc in the sky' },
    { word: 'TICKET', clue: 'Piece of paper admitting one to a show' },
    { word: 'SCHOOL', clue: 'Place of learning' },
    { word: 'SUMMER', clue: 'Warmest season of the year' },
    { word: 'CASTLE', clue: 'Large fortified building' },
    { word: 'SUNSET', clue: 'Evening sky show' },
    { word: 'POCKET', clue: 'Small bag sewn into clothing' },
    { word: 'COFFEE', clue: 'Brewed morning drink' },
    { word: 'SILVER', clue: 'Shiny metallic element' },
    { word: 'PLANET', clue: 'World orbiting a sun' },
    { word: 'MARKET', clue: 'Place where goods are bought and sold' },
    { word: 'JUNGLE', clue: 'Dense tropical forest' },
    { word: 'TUNNEL', clue: 'Passage through a hill' },
    { word: 'ORANGE', clue: 'Citrus fruit' },
  ],
  movies: [
    { word: 'CINEMA', clue: 'Place where films are shown' },
    { word: 'ACTOR', clue: 'Film performer' },
    { word: 'SCENE', clue: 'Part of a movie' },
    { word: 'DIRECTOR', clue: 'Person behind the camera' },
    { word: 'OSCAR', clue: 'Academy Award statuette' },
    { word: 'SCRIPT', clue: 'Movie screenplay' },
    { word: 'STUNT', clue: 'Dangerous film feat' },
    { word: 'PREMIERE', clue: 'First showing of a film' },
    { word: 'TRAILER', clue: 'Movie preview' },
    { word: 'SET', clue: 'Where a film is shot' },
  ],
  food: [
    { word: 'PIZZA', clue: 'Italian pie with toppings' },
    { word: 'SUSHI', clue: 'Japanese rice dish' },
    { word: 'BREAD', clue: 'Baked loaf' },
    { word: 'CHEESE', clue: 'Dairy product' },
    { word: 'SALAD', clue: 'Mixed bowl of greens' },
    { word: 'OLIVE', clue: 'Small bitter fruit' },
    { word: 'SUGAR', clue: 'Sweet crystalline substance' },
    { word: 'MINT', clue: 'Cooling herb' },
    { word: 'SPICY', clue: 'Full of flavor, hot' },
    { word: 'FEAST', clue: 'Large meal' },
  ],
  travel: [
    { word: 'AIRPORT', clue: 'Place where planes take off' },
    { word: 'PASSPORT', clue: 'Travel document' },
    { word: 'SUITCASE', clue: 'Traveler’s bag' },
    { word: 'TICKET', clue: 'Boarding document' },
    { word: 'HOTEL', clue: 'Place to stay overnight' },
    { word: 'MAP', clue: 'Guide to the terrain' },
    { word: 'ISLAND', clue: 'Land surrounded by water' },
    { word: 'BEACH', clue: 'Sandy shore' },
    { word: 'JETLAG', clue: 'Tired from time zones' },
    { word: 'VOYAGE', clue: 'Long journey' },
  ],
  technology: [
    { word: 'COMPUTER', clue: 'Electronic calculating machine' },
    { word: 'INTERNET', clue: 'Global network of networks' },
    { word: 'ROBOT', clue: 'Automated machine' },
    { word: 'DATA', clue: 'Information in raw form' },
    { word: 'CODE', clue: 'Instructions for a computer' },
    { word: 'LASER', clue: 'Focused beam of light' },
    { word: 'CHIP', clue: 'Silicon processor' },
    { word: 'WEB', clue: 'World Wide ___' },
    { word: 'AI', clue: 'Artificial intelligence' },
    { word: 'PIXEL', clue: 'Smallest unit of a digital image' },
  ],
  music: [
    { word: 'RHYTHM', clue: 'Pattern of beats' },
    { word: 'MELODY', clue: 'Tuneful sequence of notes' },
    { word: 'GUITAR', clue: 'Six-stringed instrument' },
    { word: 'PIANO', clue: 'Keyboard instrument' },
    { word: 'DRUMS', clue: 'Percussion instruments' },
    { word: 'SONG', clue: 'Short musical piece' },
    { word: 'ALBUM', clue: 'Collection of recordings' },
    { word: 'SCALE', clue: 'Series of notes in order' },
    { word: 'JAZZ', clue: 'Improvisational music style' },
    { word: 'OPERA', clue: 'Sung drama' },
  ],
  nature: [
    { word: 'FOREST', clue: 'Large area covered with trees' },
    { word: 'RIVER', clue: 'Flowing body of water' },
    { word: 'MOUNTAIN', clue: 'High landform' },
    { word: 'FLOWER', clue: 'Bloom of a plant' },
    { word: 'STONE', clue: 'Solid mineral material' },
    { word: 'VOLCANO', clue: 'Mountain that erupts' },
    { word: 'DESERT', clue: 'Dry, sandy region' },
    { word: 'LEAF', clue: 'Green part of a plant' },
    { word: 'MOON', clue: "Earth's natural satellite" },
    { word: 'CLOUD', clue: 'Mass of water droplets in the sky' },
  ],
  sports: [
    { word: 'SOCCER', clue: 'Game played with a round ball' },
    { word: 'TENNIS', clue: 'Court sport with rackets' },
    { word: 'TEAM', clue: 'Group of players' },
    { word: 'GOAL', clue: 'Score in soccer or hockey' },
    { word: 'RACE', clue: 'Contest of speed' },
    { word: 'BAT', clue: 'Baseball hitter\'s tool' },
    { word: 'NET', clue: 'Goal boundary in tennis' },
    { word: 'RUN', clue: 'Score in baseball' },
    { word: 'PLAY', clue: 'Sports move' },
    { word: 'CUP', clue: 'Trophy prize' },
  ],
};

const ALL_WORDS = Object.values(DICTIONARY).flat();

// ---------------------------------------------------------------------------
// Local "AI" clue writer. Falls back to template clues; optionally calls a
// local LLM endpoint (set LLM_ENDPOINT to use it).
// ---------------------------------------------------------------------------
const LLM_ENDPOINT = ''; // e.g. 'http://localhost:11434/api/generate'

function hashCode(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return h;
}

function templateClue(word, theme) {
  const len = word.length;
  const first = word[0];
  const last = word[word.length - 1];
  const t = theme ? ` (theme: ${theme})` : '';
  const templates = [
    `A ${len}-letter word${t}.`,
    `Starts with ${first} and ends with ${last}. ${len} letters.`,
    `A ${len}-letter entry${t}.`,
    `Think of a ${len}-letter word${t}.`,
  ];
  return templates[Math.abs(hashCode(word)) % templates.length];
}

// Clues Claude wrote for the current puzzle, keyed by answer.
let aiClues = {};

async function fetchAIWords(theme, size) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const res = await fetch(`/api/words?theme=${encodeURIComponent(theme)}&size=${size}`, { signal: controller.signal });
    if (!res.ok) return null;
    const data = await res.json();
    return data.words && data.words.length >= MIN_WORDS ? data : null;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function aiClue(word, theme) {
  if (aiClues[word]) return aiClues[word];
  const entry = DICTIONARY[theme] && DICTIONARY[theme].find((e) => e.word === word);
  if (entry && entry.clue) return entry.clue;
  const any = ALL_WORDS.find((e) => e.word === word);
  if (any && any.clue) return any.clue;

  if (LLM_ENDPOINT) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2500);
      const res = await fetch(LLM_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama3',
          prompt: `Write a short crossword clue (under 12 words) for the answer "${word}". Theme: ${theme || 'general'}. Answer only with the clue.`,
          stream: false,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json();
        const text = (data.response || data.clue || '').trim().replace(/^"|"$/g, '');
        if (text) return text;
      }
    } catch (e) {
      /* fall through to template */
    }
  }
  return templateClue(word, theme);
}

// ---------------------------------------------------------------------------
// Grid generation
// ---------------------------------------------------------------------------
function inBounds(size, r, c) {
  return r >= 0 && r < size && c >= 0 && c < size;
}

function canPlace(size, grid, word, row, col, dir) {
  let intersections = 0;
  for (let i = 0; i < word.length; i++) {
    const r = dir === 'across' ? row : row + i;
    const c = dir === 'across' ? col + i : col;
    if (!inBounds(size, r, c)) return null;
    const cell = grid[r][c];
    if (cell && cell !== word[i]) return null;
    // Two existing letters in a row means we'd be laying over a parallel word.
    if (cell && i > 0) {
      const pr = dir === 'across' ? r : r - 1;
      const pc = dir === 'across' ? c - 1 : c;
      if (grid[pr][pc]) return null;
    }
    if (cell === word[i]) intersections++;
    if (!cell) {
      // New letter: its perpendicular neighbors must be empty (no stray
      // parallel letters). Intersected cells are exempt.
      const perp = dir === 'across'
        ? [{ r: r - 1, c }, { r: r + 1, c }]
        : [{ r, c: c - 1 }, { r, c: c + 1 }];
      for (const p of perp) {
        if (inBounds(size, p.r, p.c) && grid[p.r][p.c]) return null;
      }
    }
  }
  // Word must be bounded (not extend an existing run).
  const before = dir === 'across' ? { r: row, c: col - 1 } : { r: row - 1, c: col };
  const after = dir === 'across' ? { r: row, c: col + word.length } : { r: row + word.length, c: col };
  for (const p of [before, after]) {
    if (inBounds(size, p.r, p.c) && grid[p.r][p.c]) return null;
  }
  return intersections;
}

function placeWord(grid, word, row, col, dir) {
  const g = grid.map((row) => row.slice());
  for (let i = 0; i < word.length; i++) {
    const r = dir === 'across' ? row : row + i;
    const c = dir === 'across' ? col + i : col;
    g[r][c] = word[i];
  }
  return g;
}

function generateCrossword(size, words, seedWord) {
  const attempts = 80;
  let best = null;
  for (let a = 0; a < attempts; a++) {
    const grid = Array.from({ length: size }, () => Array(size).fill(null));
    const placed = [];

    const pool = [...words].sort((a, b) => b.word.length - a.word.length);
    const seed = pool.find((w) => w.word === seedWord) || pool[0];

    // Place the seed word horizontally across the middle row.
    const seedRow = Math.floor(size / 2);
    const seedCol = Math.floor((size - seed.word.length) / 2);
    if (canPlace(size, grid, seed.word, seedRow, seedCol, 'across') !== null) {
      const g = placeWord(grid, seed.word, seedRow, seedCol, 'across');
      placed.push({ word: seed.word, row: seedRow, col: seedCol, dir: 'across' });
      // copy back
      for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) grid[r][c] = g[r][c];
    }

    const remaining = pool.filter((w) => w.word !== seed.word);
    shuffle(remaining);

    for (const w of remaining) {
      if (placed.length >= size * 2) break;
      const dirs = ['across', 'down'];
      shuffle(dirs);
      let placedIt = false;
      for (const dir of dirs) {
        // Find candidate start cells: any cell where the word fits and
        // intersects at least one existing letter.
        const candidates = [];
        for (let r = 0; r < size && !placedIt; r++) {
          for (let c = 0; c < size && !placedIt; c++) {
            const inter = canPlace(size, grid, w.word, r, c, dir);
            if (inter != null && inter >= 1) {
              candidates.push({ r, c, dir, inter });
            }
          }
        }
        if (candidates.length) {
          // Favor spots that cross more words, so the grid stays dense.
          const most = Math.max(...candidates.map((x) => x.inter));
          const top = candidates.filter((x) => x.inter === most);
          const pick = top[Math.floor(Math.random() * top.length)];
          const g = placeWord(grid, w.word, pick.r, pick.c, pick.dir);
          for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) grid[r][c] = g[r][c];
          placed.push({ word: w.word, row: pick.r, col: pick.c, dir: pick.dir });
          placedIt = true;
        }
      }
    }

    if (placed.length >= MIN_WORDS && (!best || placed.length > best.placed.length)) {
      best = { grid, placed };
    }
  }
  return best;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------------------------------------------------------------------------
// Build the playable model from a generated grid
// ---------------------------------------------------------------------------
function buildModel(size, grid, placed, theme) {
  const cells = Array.from({ length: size }, () => Array(size).fill(null));
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c]) {
        cells[r][c] = { r, c, number: 0, solution: grid[r][c], letter: '', acrossIdx: -1, downIdx: -1, block: false };
      } else {
        cells[r][c] = { r, c, number: 0, solution: null, letter: '', acrossIdx: -1, downIdx: -1, block: true };
      }
    }
  }

  const across = [];
  const down = [];
  let number = 1;

  // Number cells that begin a word; collect words.
  const starts = {};
  // Number in reading order (top to bottom, left to right), like a real crossword.
  [...placed]
    .sort((a, b) => a.row - b.row || a.col - b.col)
    .forEach((p) => {
      const key = `${p.row},${p.col}`;
      if (!starts[key]) starts[key] = number++;
    });
  placed.forEach((p) => {
    p.number = starts[`${p.row},${p.col}`];
    cells[p.row][p.col].number = p.number;
  });

  placed.forEach((p, idx) => {
    const cellsList = [];
    for (let i = 0; i < p.word.length; i++) {
      const r = p.dir === 'across' ? p.row : p.row + i;
      const c = p.dir === 'across' ? p.col + i : p.col;
      const cell = cells[r][c];
      cellsList.push({ r, c });
    }
    const entry = { number: p.number, word: p.word, clue: '', dir: p.dir, cells: cellsList };
    if (p.dir === 'across') across.push(entry);
    else down.push(entry);
  });

  // Sort clue lists by number.
  across.sort((a, b) => a.number - b.number);
  down.sort((a, b) => a.number - b.number);
  // Point each cell at its word's position in the sorted clue lists.
  across.forEach((w, i) => w.cells.forEach(({ r, c }) => { cells[r][c].acrossIdx = i; }));
  down.forEach((w, i) => w.cells.forEach(({ r, c }) => { cells[r][c].downIdx = i; }));

  // Generate clues with the AI writer.
  (async () => {
    for (const w of [...across, ...down]) {
      w.clue = await aiClue(w.word, state.theme);
    }
    renderClues();
  })();

  return { cells, across, down };
}

function cellKey(r, c) { return `${r},${c}`; }

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
let themeEl, statusEl, gridEl, keyboardEl, cluesList, acrossTab, downTab;

function renderGrid() {
  gridEl.innerHTML = '';
  const { size } = state;
  const fragment = document.createDocumentFragment();
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const cell = state.cells[r][c];
      const div = document.createElement('div');
      div.className = 'cell' + (cell.block ? ' block' : '');
      div.dataset.r = r;
      div.dataset.c = c;
      if (!cell.block) {
        if (cell.number) {
          const n = document.createElement('span');
          n.className = 'number';
          n.textContent = cell.number;
          div.appendChild(n);
        }
        const input = document.createElement('input');
        input.maxLength = 1;
        input.readOnly = true; // we drive input via keyboard/taps
        input.value = cell.letter || '';
        div.appendChild(input);
        div.addEventListener('click', () => selectCell(r, c));
      }
      fragment.appendChild(div);
    }
  }
  gridEl.appendChild(fragment);
  gridEl.style.gridTemplateColumns = `repeat(${size}, var(--cell))`;
  fitGrid();
  requestAnimationFrame(fitGrid);
  updateGridStyles();
}

// Shrink cells so the whole grid fits the screen width.
function fitGrid() {
  const size = state.size;
  if (!size) return;
  const wrap = gridEl.parentElement;
  const wide = window.innerWidth >= 900;
  const availW = wide ? wrap.clientWidth : Math.min(wrap.clientWidth || window.innerWidth, window.innerWidth - 32);
  const availH = wide ? window.innerHeight - 140 : Infinity;
  const avail = Math.min(availW, availH);
  const cell = Math.max(20, Math.min(wide ? 56 : 44, Math.floor((avail - 2 * (size + 1)) / size)));
  gridEl.style.setProperty('--cell', cell + 'px');
  gridEl.style.fontSize = Math.round(cell * 0.45) + 'px';
}
window.addEventListener('resize', fitGrid);

function updateGridStyles() {
  const { size } = state;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const cell = state.cells[r][c];
      const div = gridEl.querySelector(`[data-r="${r}"][data-c="${c}"]`);
      if (!div) continue;
      const cur = state.current && state.current.r === r && state.current.c === c;
      const active = currentWordCells().some((x) => x.r === r && x.c === c);
      div.classList.toggle('active', active);
      div.classList.toggle('current', cur);
      const input = div.querySelector('input');
      if (input) {
        input.value = cell.letter || '';
        const correct = cell.letter && cell.letter === cell.solution;
        const wrong = cell.letter && cell.letter !== cell.solution;
        input.classList.toggle('correct', correct);
        input.classList.toggle('wrong', wrong);
      }
    }
  }
}

function currentWordCells() {
  if (!state.current) return [];
  const { r, c } = state.current;
  const cell = state.cells[r][c];
  if (state.direction === 'across' && cell.acrossIdx >= 0) {
    return state.across[cell.acrossIdx].cells;
  }
  if (state.direction === 'down' && cell.downIdx >= 0) {
    return state.down[cell.downIdx].cells;
  }
  return [];
}

function currentWord() {
  const cells = currentWordCells();
  if (!cells.length) return null;
  if (state.direction === 'across') {
    const idx = state.cells[cells[0].r][cells[0].c].acrossIdx;
    return state.across[idx] || null;
  }
  const idx = state.cells[cells[0].r][cells[0].c].downIdx;
  return state.down[idx] || null;
}

function selectCell(r, c, keepDirection = false) {
  state.current = { r, c };
  const cell = state.cells[r][c];
  if (!keepDirection) {
    // Prefer across, fall back to down.
    state.direction = cell.acrossIdx >= 0 ? 'across' : cell.downIdx >= 0 ? 'down' : state.direction;
  } else {
    // Toggle if current direction isn't available at this cell.
    const word = currentWord();
    if (!word) state.direction = state.direction === 'across' ? 'down' : 'across';
  }
  acrossTab.classList.toggle('active', state.direction === 'across');
  downTab.classList.toggle('active', state.direction === 'down');
  highlightClue();
  updateGridStyles();
  focusInput();
}

function focusInput() {
  if (!state.current) return;
  const div = gridEl.querySelector(`[data-r="${state.current.r}"][data-c="${state.current.c}"]`);
  const input = div && div.querySelector('input');
  if (input) input.focus();
}

function highlightClue() {
  // Show the clue list that matches the current direction.
  document.getElementById('clues-across').style.display = state.direction === 'across' ? '' : 'none';
  document.getElementById('clues-down').style.display = state.direction === 'down' ? '' : 'none';
  document.querySelectorAll('.clue').forEach((el) => el.classList.remove('active'));
  const word = currentWord();
  if (!word) return;
  const sel = state.direction === 'across' ? `.clue[data-idx="${state.across.indexOf(word)}"][data-dir="across"]`
    : `.clue[data-idx="${state.down.indexOf(word)}"][data-dir="down"]`;
  const el = document.querySelector(sel);
  if (el) {
    el.classList.add('active');
    el.scrollIntoView({ block: 'nearest' });
  }
}

function renderClues() {
  const render = (list, containerId, dir) => {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    list.forEach((w, i) => {
      const div = document.createElement('div');
      div.className = 'clue';
      div.dataset.idx = i;
      div.dataset.dir = dir;
      const n = document.createElement('span');
      n.className = 'clue-number';
      n.textContent = w.number;
      const t = document.createElement('span');
      t.className = 'clue-text';
      t.textContent = w.clue || '…';
      div.appendChild(n);
      div.appendChild(t);
      div.addEventListener('click', () => {
        const first = w.cells[0];
        selectCell(first.r, first.c, true);
        state.direction = dir;
        acrossTab.classList.toggle('active', dir === 'across');
        downTab.classList.toggle('active', dir === 'down');
        highlightClue();
        updateGridStyles();
        focusInput();
      });
      container.appendChild(div);
    });
  };
  render(state.across, 'clues-across', 'across');
  render(state.down, 'clues-down', 'down');
}

function renderKeyboard() {
  keyboardEl.innerHTML = '';
  const row1 = 'QWERTYUIOP'.split('');
  const row2 = 'ASDFGHJKL'.split('');
  const row3 = ['ZXCVBNM'.split('')];
  const build = (letters, extra) => {
    const frag = document.createDocumentFragment();
    letters.forEach((ch) => {
      const b = document.createElement('button');
      b.className = 'key';
      b.textContent = ch;
      b.addEventListener('click', () => typeLetter(ch));
      frag.appendChild(b);
    });
    if (extra) {
      const b = document.createElement('button');
      b.className = 'key wide';
      b.textContent = '⌫';
      b.addEventListener('click', () => typeLetter(null));
      frag.appendChild(b);
    }
    return frag;
  };
  keyboardEl.appendChild(build(row1));
  keyboardEl.appendChild(build(row2));
  const row3frag = document.createDocumentFragment();
  const b = document.createElement('button');
  b.className = 'key wide';
  b.textContent = '⌫';
  b.addEventListener('click', () => typeLetter(null));
  row3frag.appendChild(b);
  'ZXCVBNM'.split('').forEach((ch) => {
    const k = document.createElement('button');
    k.className = 'key';
    k.textContent = ch;
    k.addEventListener('click', () => typeLetter(ch));
    row3frag.appendChild(k);
  });
  const done = document.createElement('button');
  done.className = 'key wide';
  done.textContent = 'done';
  done.addEventListener('click', () => checkPuzzle());
  row3frag.appendChild(done);
  keyboardEl.appendChild(row3frag);
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
function typeLetter(ch) {
  if (!state.current) return;
  const { r, c } = state.current;
  const cell = state.cells[r][c];
  if (cell.block) return;
  if (ch) {
    cell.letter = ch.toUpperCase();
    moveForward();
  } else {
    cell.letter = '';
    moveBack();
  }
  updateGridStyles();
  saveGame();
  checkCompleted();
}

function moveForward() {
  if (!state.current) return;
  const cells = currentWordCells();
  const i = cells.findIndex((x) => x.r === state.current.r && x.c === state.current.c);
  const next = cells[i + 1];
  if (next) selectCell(next.r, next.c, true);
}

function moveBack() {
  if (!state.current) return;
  const cells = currentWordCells();
  const i = cells.findIndex((x) => x.r === state.current.r && x.c === state.current.c);
  const prev = cells[i - 1];
  if (prev) selectCell(prev.r, prev.c, true);
}

function move(dr, dc) {
  if (!state.current) return;
  const r = state.current.r + dr;
  const c = state.current.c + dc;
  const { size } = state;
  if (r < 0 || r >= size || c < 0 || c >= size) return;
  const cell = state.cells[r][c];
  if (cell.block) return;
  selectCell(r, c, true);
}

document.addEventListener('keydown', (e) => {
  if (!state.current) return;
  if (e.key.length === 1 && /[a-z]/i.test(e.key)) {
    e.preventDefault();
    typeLetter(e.key);
    return;
  }
  if (e.key === 'Backspace') {
    e.preventDefault();
    typeLetter(null);
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    // move to next cell in word, or toggle direction at end
    const cells = currentWordCells();
    const i = cells.findIndex((x) => x.r === state.current.r && x.c === state.current.c);
    if (i >= 0 && i + 1 < cells.length) {
      selectCell(cells[i + 1].r, cells[i + 1].c, true);
    } else {
      toggleDirection();
    }
    return;
  }
  if (e.key === 'ArrowRight') { e.preventDefault(); move(0, 1); return; }
  if (e.key === 'ArrowLeft') { e.preventDefault(); move(0, -1); return; }
  if (e.key === 'ArrowDown') { e.preventDefault(); move(1, 0); return; }
  if (e.key === 'ArrowUp') { e.preventDefault(); move(-1, 0); return; }
  if (e.key === 'Tab') { e.preventDefault(); toggleDirection(); return; }
});

function toggleDirection() {
  state.direction = state.direction === 'across' ? 'down' : 'across';
  acrossTab.classList.toggle('active', state.direction === 'across');
  downTab.classList.toggle('active', state.direction === 'down');
  highlightClue();
  updateGridStyles();
}

// ---------------------------------------------------------------------------
// Check / reveal
// ---------------------------------------------------------------------------
function checkPuzzle() {
  let ok = true, filled = 0, wrong = 0;
  for (let r = 0; r < state.size; r++) {
    for (let c = 0; c < state.size; c++) {
      const cell = state.cells[r][c];
      if (cell.block) continue;
      if (cell.letter) {
        filled++;
        if (cell.letter === cell.solution) {
          // correct
        } else {
          wrong++;
          ok = false;
        }
      }
    }
  }
  statusEl.textContent = wrong ? `${wrong} letter${wrong !== 1 ? 's' : ''} not quite right` : 'All correct!';
  statusEl.className = 'status ' + (wrong ? 'bad' : 'ok');
  if (filled > 0 && wrong === 0) completePuzzle();
}

function revealWord() {
  const word = currentWord();
  if (!word) return;
  for (const { r, c } of word.cells) {
    state.cells[r][c].letter = state.cells[r][c].solution;
  }
  updateGridStyles();
  saveGame();
  checkCompleted();
  statusEl.textContent = `Word revealed: ${word.word}`;
  statusEl.className = 'status ok';
  setTimeout(() => { statusEl.textContent = ''; statusEl.className = 'status'; }, 1500);
}

function checkCompleted() {
  let filled = 0, wrong = 0;
  for (let r = 0; r < state.size; r++) {
    for (let c = 0; c < state.size; c++) {
      const cell = state.cells[r][c];
      if (cell.block) continue;
      if (cell.letter) {
        filled++;
        if (cell.letter !== cell.solution) wrong++;
      }
    }
  }
  const total = state.placed.reduce((s, w) => s + w.word.length, 0);
  if (filled === total && wrong === 0 && !state.solved) {
    completePuzzle();
  }
}

function completePuzzle() {
  state.solved = true;
  state.timer.running = false;
  statusEl.textContent = 'Puzzle complete! 🎉';
  statusEl.className = 'status ok';
  saveGame();
}

// ---------------------------------------------------------------------------
// Timer
// ---------------------------------------------------------------------------
function timerTick() {
  if (!state.timer.running) return;
  const now = Date.now();
  state.timer.seconds += (now - state.timer.start) / 1000;
  state.timer.start = now;
  const m = Math.floor(state.timer.seconds / 60);
  const s = Math.floor(state.timer.seconds % 60);
  document.getElementById('timer-display').textContent = `${m}:${s.toString().padStart(2, '0')}`;
  requestAnimationFrame(timerTick);
}

// ---------------------------------------------------------------------------
// New puzzle generation flow
// ---------------------------------------------------------------------------
async function newPuzzle() {
  const themeInput = document.getElementById('new-theme');
  const theme = themeInput.value.trim();
  const size = parseInt(document.getElementById('setting-size').value, 10);

  const btn = document.getElementById('new-generate');
  btn.textContent = 'Generating…';
  btn.disabled = true;

  state.theme = theme;
  state.size = size;
  state.solved = false;
  state.timer = { running: false, seconds: 0, start: null };
  document.getElementById('timer-display').textContent = '0:00';

  // Ask Claude for themed words + clues; fall back to the built-in list offline.
  btn.textContent = 'Claude is writing your puzzle…';
  const ai = await fetchAIWords(theme, size);
  let pool = [];
  let result = null;
  aiClues = {};
  if (ai) {
    ai.words.forEach((w) => { aiClues[w.word] = w.clue; });
    if (!theme && ai.theme) state.theme = ai.theme;
    pool = shuffle([...ai.words]);
    const longish = pool.filter((w) => w.word.length >= 6 && w.word.length <= size);
    result = generateCrossword(size, pool, (longish[0] || pool[0]).word);
  }
  if (!result) {
    if (theme && DICTIONARY[theme.toLowerCase()]) {
      pool = [...DICTIONARY[theme.toLowerCase()]];
    }
    const general = shuffle([...DICTIONARY.general]);
    pool = [...pool, ...general.filter((w) => !pool.find((p) => p.word === w.word))];
    shuffle(pool);
    result = generateCrossword(size, pool, pool[0].word);
  }

  closeSheet('sheet-new');

  if (!result) {
    statusEl.textContent = "Couldn't build a grid — try a different theme or size.";
    statusEl.className = 'status bad';
    btn.textContent = 'Generate puzzle';
    btn.disabled = false;
    return;
  }

  state.grid = result.grid;
  state.placed = result.placed;
  const model = buildModel(size, result.grid, state.placed, theme);
  state.cells = model.cells;
  state.across = model.across;
  state.down = model.down;

  document.getElementById('puzzle-theme').textContent = `Theme: ${state.theme || "surprise me"}`;
  btn.textContent = 'Generate puzzle';
  btn.disabled = false;
  renderGrid();
  renderKeyboard();

  // start timer after a tick so the UI paints
  setTimeout(() => {
    state.timer.running = true;
    state.timer.start = Date.now();
    timerTick();
  }, 0);

  showScreen('screen-puzzle');
}

// ---------------------------------------------------------------------------
// Sheets & navigation
// ---------------------------------------------------------------------------
function openSheet(id) {
  document.querySelectorAll('.sheet').forEach((s) => s.classList.remove('open'));
  document.getElementById(id).classList.add('open');
}
function closeSheet(id) {
  document.getElementById(id).classList.remove('open');
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.style.display = 'none');
  document.getElementById(id).style.display = '';
}

// localStorage persistence
function saveGame() {
  try {
    const data = {
      cells: state.cells.map((row) => row.map((cell) => (cell ? { letter: cell.letter } : null))),
      solved: state.solved,
      theme: state.theme,
      size: state.size,
      across: state.across.map((w) => w.word),
      down: state.down.map((w) => w.word),
    };
    localStorage.setItem('crossword_game', JSON.stringify(data));
  } catch (e) { /* ignore */ }
}

function loadGame() {
  try {
    const raw = localStorage.getItem('crossword_game');
    if (!raw) return false;
    const data = JSON.parse(raw);
    // restore letters only
    for (let r = 0; r < state.size; r++) {
      for (let c = 0; c < state.size; c++) {
        const saved = data.cells?.[r]?.[c];
        if (saved && state.cells[r][c]) state.cells[r][c].letter = saved.letter || '';
      }
    }
    state.solved = !!data.solved;
    state.theme = data.theme || '';
    state.size = data.size || state.size;
    return true;
  } catch (e) {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
function init() {
  themeEl = document.getElementById('puzzle-theme');
  statusEl = document.getElementById('status');
  gridEl = document.getElementById('grid-container');
  keyboardEl = document.getElementById('keyboard');
  acrossTab = document.getElementById('tab-across');
  downTab = document.getElementById('tab-down');

  // Menu
  document.getElementById('btn-menu').addEventListener('click', () => openSheet('sheet-menu'));
  document.getElementById('btn-close-menu').addEventListener('click', () => closeSheet('sheet-menu'));
  document.getElementById('m-new').addEventListener('click', () => { closeSheet('sheet-menu'); openSheet('sheet-new'); });
  document.getElementById('m-reveal').addEventListener('click', () => { closeSheet('sheet-menu'); revealWord(); });
  document.getElementById('m-check').addEventListener('click', () => { closeSheet('sheet-menu'); checkPuzzle(); });
  document.getElementById('m-timer').addEventListener('click', () => {
    state.timer.running = !state.timer.running;
    if (state.timer.running) state.timer.start = Date.now();
    document.getElementById('m-timer-sub').textContent = state.timer.running ? 'on' : 'off';
    closeSheet('sheet-menu');
  });
  document.getElementById('m-settings').addEventListener('click', () => { closeSheet('sheet-menu'); openSheet('sheet-settings'); });
  document.getElementById('m-about').addEventListener('click', () => { closeSheet('sheet-menu'); openSheet('sheet-about'); });

  // Settings
  document.getElementById('btn-close-settings').addEventListener('click', () => closeSheet('sheet-settings'));
  document.getElementById('settings-cancel').addEventListener('click', () => closeSheet('sheet-settings'));
  document.getElementById('settings-save').addEventListener('click', () => {
    state.difficulty = document.getElementById('setting-difficulty').value;
    state.theme = document.getElementById('setting-theme').value.trim();
    closeSheet('sheet-settings');
  });

  // About
  document.getElementById('btn-close-about').addEventListener('click', () => closeSheet('sheet-about'));

  // New puzzle
  document.getElementById('btn-close-new').addEventListener('click', () => closeSheet('sheet-new'));
  document.getElementById('new-cancel').addEventListener('click', () => closeSheet('sheet-new'));
  document.getElementById('new-generate').addEventListener('click', newPuzzle);

  // Action sheet
  document.getElementById('btn-close-action').addEventListener('click', () => closeSheet('sheet-action'));
  document.getElementById('action-cancel').addEventListener('click', () => closeSheet('sheet-action'));
  document.getElementById('action-ok').addEventListener('click', () => closeSheet('sheet-action'));

  // Puzzle header
  document.getElementById('btn-back-to-menu').addEventListener('click', () => {
    closeSheet('sheet-menu');
    showScreen('screen-puzzle');
  });
  document.getElementById('tab-across').addEventListener('click', () => {
    state.direction = 'across';
    acrossTab.classList.add('active'); downTab.classList.remove('active');
    highlightClue(); updateGridStyles(); focusInput();
  });
  document.getElementById('tab-down').addEventListener('click', () => {
    state.direction = 'down';
    downTab.classList.add('active'); acrossTab.classList.remove('active');
    highlightClue(); updateGridStyles(); focusInput();
  });
  document.getElementById('btn-reveal-word').addEventListener('click', revealWord);
  document.getElementById('btn-check').addEventListener('click', checkPuzzle);

  // Resume saved game or start fresh.
  const resumed = loadGame();
  if (resumed && state.cells.length) {
    renderGrid();
    renderKeyboard();
    document.getElementById('puzzle-theme').textContent = `Theme: ${state.theme || 'surprise me'}`;
    state.timer.running = true;
    state.timer.start = Date.now();
    timerTick();
    showScreen('screen-puzzle');
  } else {
    showScreen('screen-puzzle');
    openSheet('sheet-new');
  }
}

init();
