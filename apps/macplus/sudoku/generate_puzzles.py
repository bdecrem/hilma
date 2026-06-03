#!/usr/bin/env python3
"""Generate Sudoku puzzles with guaranteed UNIQUE solutions, graded by
difficulty, and emit a C header (puzzles.h) for the Mac Plus app.

Difficulty model (a credible, conservative proxy):
  - singles_only: can the puzzle be solved using only naked + hidden singles?
  - guesses: how many times an MRV depth-first solver must branch.
  - clues: number of givens.
  EASY   = singles_only and clues >= 32
  HARD   = guesses >= 3 or clues <= 26
  MEDIUM = everything else
Every emitted puzzle is verified to have EXACTLY ONE solution.
"""
import random, sys

random.seed(68000)  # reproducible

ROWS = range(9)
def peers_table():
    peers = [[set() for _ in range(9)] for _ in range(9)]
    for r in range(9):
        for c in range(9):
            s = set()
            for k in range(9):
                s.add((r, k)); s.add((k, c))
            br, bc = (r//3)*3, (c//3)*3
            for dr in range(3):
                for dc in range(3):
                    s.add((br+dr, bc+dc))
            s.discard((r, c))
            peers[r][c] = s
    return peers
PEERS = peers_table()

def candidates(grid, r, c):
    used = set()
    for (pr, pc) in PEERS[r][c]:
        if grid[pr][pc]:
            used.add(grid[pr][pc])
    return [v for v in range(1, 10) if v not in used]

def find_empty_mrv(grid):
    best = None; best_n = 10; best_cand = None
    for r in range(9):
        for c in range(9):
            if grid[r][c] == 0:
                cand = candidates(grid, r, c)
                n = len(cand)
                if n == 0:
                    return (r, c, [])  # dead end
                if n < best_n:
                    best_n = n; best = (r, c); best_cand = cand
                    if n == 1:
                        return (r, c, cand)
    if best is None:
        return None
    return (best[0], best[1], best_cand)

def count_solutions(grid, limit=2):
    """Count solutions up to `limit` (for uniqueness testing)."""
    g = [row[:] for row in grid]
    cnt = 0
    def rec():
        nonlocal cnt
        spot = find_empty_mrv(g)
        if spot is None:
            cnt += 1
            return cnt >= limit
        r, c, cand = spot
        if not cand:
            return False
        for v in cand:
            g[r][c] = v
            if rec():
                g[r][c] = 0
                return True
            g[r][c] = 0
        return False
    rec()
    return cnt

def full_solution():
    grid = [[0]*9 for _ in range(9)]
    def fill():
        spot = find_empty_mrv(grid)
        if spot is None:
            return True
        r, c, cand = spot
        random.shuffle(cand)
        for v in cand:
            grid[r][c] = v
            if fill():
                return True
            grid[r][c] = 0
        return False
    fill()
    return grid

# ---- difficulty grading ----
def singles_only_solvable(puzzle):
    g = [row[:] for row in puzzle]
    progress = True
    while progress:
        progress = False
        # naked singles
        for r in range(9):
            for c in range(9):
                if g[r][c] == 0:
                    cand = candidates(g, r, c)
                    if len(cand) == 1:
                        g[r][c] = cand[0]; progress = True
        # hidden singles (within each unit)
        def units():
            for r in range(9):
                yield [(r, c) for c in range(9)]
            for c in range(9):
                yield [(r, c) for r in range(9)]
            for br in (0,3,6):
                for bc in (0,3,6):
                    yield [(br+dr, bc+dc) for dr in range(3) for dc in range(3)]
        for unit in units():
            for v in range(1, 10):
                spots = [(r, c) for (r, c) in unit if g[r][c] == 0 and v in candidates(g, r, c)]
                if len(spots) == 1:
                    r, c = spots[0]
                    if g[r][c] == 0:
                        g[r][c] = v; progress = True
    return all(g[r][c] != 0 for r in range(9) for c in range(9))

def count_guesses(puzzle):
    g = [row[:] for row in puzzle]
    guesses = 0
    def rec():
        nonlocal guesses
        spot = find_empty_mrv(g)
        if spot is None:
            return True
        r, c, cand = spot
        if not cand:
            return False
        if len(cand) > 1:
            guesses += 1
        for v in cand:
            g[r][c] = v
            if rec():
                return True
            g[r][c] = 0
        return False
    rec()
    return guesses

def grade(puzzle):
    clues = sum(1 for r in range(9) for c in range(9) if puzzle[r][c])
    so = singles_only_solvable(puzzle)
    g = count_guesses(puzzle)
    if so and clues >= 32:
        return "easy"
    if g >= 3 or clues <= 26:
        return "hard"
    return "medium"

def make_puzzle(target_clues):
    sol = full_solution()
    puzzle = [row[:] for row in sol]
    cells = [(r, c) for r in range(9) for c in range(9)]
    random.shuffle(cells)
    clues = 81
    for (r, c) in cells:
        if clues <= target_clues:
            break
        saved = puzzle[r][c]
        puzzle[r][c] = 0
        if count_solutions(puzzle, limit=2) != 1:
            puzzle[r][c] = saved  # removing broke uniqueness; keep it
        else:
            clues -= 1
    return puzzle, sol

def to_str(grid):
    return "".join(str(grid[r][c]) if grid[r][c] else "." for r in range(9) for c in range(9))

# ---- generate buckets ----
WANT = {"easy": 8, "medium": 14, "hard": 14}
buckets = {"easy": [], "medium": [], "hard": []}
solutions = {}
attempts = 0
targets = {"easy": 36, "medium": 30, "hard": 25}

while not all(len(buckets[d]) >= WANT[d] for d in WANT) and attempts < 4000:
    attempts += 1
    # bias target toward whatever bucket still needs filling
    need = [d for d in WANT if len(buckets[d]) < WANT[d]]
    tdiff = random.choice(need)
    puzzle, sol = make_puzzle(targets[tdiff])
    # verify uniqueness (must be exactly 1)
    if count_solutions(puzzle, limit=2) != 1:
        continue
    d = grade(puzzle)
    if len(buckets[d]) < WANT[d]:
        ps = to_str(puzzle)
        if ps not in solutions:
            buckets[d].append(ps)
            solutions[ps] = to_str(sol)

print(f"attempts={attempts}", file=sys.stderr)
for d in ("easy", "medium", "hard"):
    print(f"{d}: {len(buckets[d])}", file=sys.stderr)

# ---- final verification pass: every puzzle uniquely solvable, solution consistent ----
def str_to_grid(s):
    return [[0 if ch == '.' else int(ch) for ch in s[i*9:(i+1)*9]] for i in range(9)]
def valid_full(g):
    for unit_get in (lambda i: [g[i][c] for c in range(9)],
                     lambda i: [g[r][i] for r in range(9)],
                     lambda i: [g[(i//3)*3+dr][(i%3)*3+dc] for dr in range(3) for dc in range(3)]):
        for i in range(9):
            u = unit_get(i)
            if sorted(u) != list(range(1, 10)):
                return False
    return True
ok = True
for d in buckets:
    for ps in buckets[d]:
        g = str_to_grid(ps)
        n = count_solutions(g, limit=2)
        sol = str_to_grid(solutions[ps])
        if n != 1 or not valid_full(sol):
            ok = False
            print(f"BAD PUZZLE in {d}: {ps} solutions={n}", file=sys.stderr)
print("VERIFY:", "ALL OK" if ok else "FAILURES", file=sys.stderr)
if not ok:
    sys.exit(1)

# ---- emit puzzles.h ----
def emit_array(name, lst):
    out = [f"static const char *{name}[] = {{"]
    for ps in lst:
        out.append(f'    "{ps}",')
    out.append("};")
    out.append(f"#define {name.upper()}_COUNT {len(lst)}")
    return "\n".join(out)

with open("puzzles.h", "w") as f:
    f.write("/* Auto-generated by generate_puzzles.py. Each string is 81 chars,\n")
    f.write("   row-major; '1'-'9' = given clue, '.' = blank. All puzzles have a\n")
    f.write("   unique solution (verified). */\n#ifndef PUZZLES_H\n#define PUZZLES_H\n\n")
    f.write(emit_array("gEasy", buckets["easy"]) + "\n\n")
    f.write(emit_array("gMedium", buckets["medium"]) + "\n\n")
    f.write(emit_array("gHard", buckets["hard"]) + "\n\n")
    f.write("#endif\n")
print("wrote puzzles.h", file=sys.stderr)
