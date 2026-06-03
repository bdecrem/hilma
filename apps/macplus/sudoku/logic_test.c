/*
 * Host-side test for the Sudoku logic. Compiles with the system clang and
 * exercises the SAME conflict / solved algorithms used in sudoku.c against
 * every embedded puzzle:
 *   1. each puzzle is uniquely solvable
 *   2. on the unique solution, conflict-detection reports zero conflicts and
 *      IsSolved() is true
 *   3. injecting a duplicate into the solution is detected as a conflict
 *   4. IsSolved() is false on the puzzle's blank board
 */
#include <stdio.h>
#include <string.h>
#include "puzzles.h"

static int board[9][9];
static int conflict[9][9];

/* --- verbatim port of sudoku.c RecomputeConflicts() --- */
static void RecomputeConflicts(void)
{
    int r, c, k, br, bc, dr, dc, v;
    for (r = 0; r < 9; r++) for (c = 0; c < 9; c++) conflict[r][c] = 0;
    for (r = 0; r < 9; r++) for (c = 0; c < 9; c++) {
        v = board[r][c];
        if (v == 0) continue;
        for (k = 0; k < 9; k++) {
            if (k != c && board[r][k] == v) conflict[r][c] = 1;
            if (k != r && board[k][c] == v) conflict[r][c] = 1;
        }
        br = (r / 3) * 3; bc = (c / 3) * 3;
        for (dr = 0; dr < 3; dr++) for (dc = 0; dc < 3; dc++)
            if ((br + dr != r || bc + dc != c) && board[br + dr][bc + dc] == v)
                conflict[r][c] = 1;
    }
}
/* --- verbatim port of sudoku.c IsSolved() --- */
static int IsSolved(void)
{
    int r, c;
    for (r = 0; r < 9; r++) for (c = 0; c < 9; c++) {
        if (board[r][c] == 0) return 0;
        if (conflict[r][c])   return 0;
    }
    return 1;
}

/* --- independent solver for uniqueness + obtaining the solution --- */
static int sol[9][9];
static int ok_at(int g[9][9], int r, int c, int v) {
    int k, br, bc, dr, dc;
    for (k = 0; k < 9; k++) if (g[r][k] == v || g[k][c] == v) return 0;
    br = (r/3)*3; bc = (c/3)*3;
    for (dr = 0; dr < 3; dr++) for (dc = 0; dc < 3; dc++)
        if (g[br+dr][bc+dc] == v) return 0;
    return 1;
}
static int count_sol(int g[9][9], int limit, int capture) {
    int r, c, v, found = 0;
    for (r = 0; r < 9; r++) for (c = 0; c < 9; c++) if (g[r][c] == 0) {
        for (v = 1; v <= 9; v++) if (ok_at(g, r, c, v)) {
            g[r][c] = v;
            found += count_sol(g, limit - found, capture);
            g[r][c] = 0;
            if (found >= limit) return found;
        }
        return found; /* this empty cell had its options exhausted */
    }
    /* no empties: a full solution */
    if (capture) memcpy(sol, g, sizeof sol);
    return 1;
}

static void load(const char *s) {
    int i;
    for (i = 0; i < 81; i++) board[i/9][i%9] = (s[i]=='.') ? 0 : s[i]-'0';
}

static int run_group(const char *name, const char **arr, int n) {
    int p, r, c, fails = 0;
    for (p = 0; p < n; p++) {
        int g[9][9];
        load(arr[p]);
        /* board must NOT be solved at start */
        RecomputeConflicts();
        if (IsSolved()) { printf("  [%s #%d] FAIL: blank board reported solved\n", name, p+1); fails++; }
        /* uniqueness + capture solution */
        memcpy(g, board, sizeof g);
        int ns = count_sol(g, 2, 0);
        memcpy(g, board, sizeof g);
        count_sol(g, 1, 1);
        if (ns != 1) { printf("  [%s #%d] FAIL: %d solutions (want 1)\n", name, p+1, ns); fails++; }
        /* solution: zero conflicts, IsSolved true */
        memcpy(board, sol, sizeof board);
        RecomputeConflicts();
        for (r = 0; r < 9; r++) for (c = 0; c < 9; c++)
            if (conflict[r][c]) { printf("  [%s #%d] FAIL: conflict on solution at %d,%d\n", name, p+1, r, c); fails++; }
        if (!IsSolved()) { printf("  [%s #%d] FAIL: solution not reported solved\n", name, p+1); fails++; }
        /* inject duplicate -> must be detected */
        {
            int v = board[0][0];
            int nv = (v % 9) + 1;
            /* find a same-row cell and force a dup */
            board[0][1] = board[0][0];
            RecomputeConflicts();
            if (!conflict[0][0] || !conflict[0][1]) { printf("  [%s #%d] FAIL: injected row dup not detected\n", name, p+1); fails++; }
            if (IsSolved()) { printf("  [%s #%d] FAIL: solved despite injected dup\n", name, p+1); fails++; }
            (void)nv;
        }
    }
    printf("  %-7s %d puzzles: %s\n", name, n, fails ? "FAILURES" : "all OK");
    return fails;
}

int main(void) {
    int fails = 0;
    printf("Sudoku logic test\n");
    fails += run_group("Easy",   gEasy,   GEASY_COUNT);
    fails += run_group("Medium", gMedium, GMEDIUM_COUNT);
    fails += run_group("Hard",   gHard,   GHARD_COUNT);
    printf("RESULT: %s (%d failures)\n", fails ? "FAIL" : "PASS", fails);
    return fails ? 1 : 0;
}
