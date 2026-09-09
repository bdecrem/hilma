/* Host test for FitWidth (dodo/fitwidth.inc) — the row-title fitter behind the
 * topics list. Builds with clang on the Mac, no Toolbox:
 *
 *     cc -Wall -o /tmp/fit_test fit_test.c && /tmp/fit_test
 *
 * The real TextWidth measures Geneva 12 on the Plus. Here it is stubbed with a
 * proportional fake so the ALGORITHM is what gets tested: the result must never
 * exceed the budget, must never overrun the caller's buffer, must terminate,
 * and must be the longest prefix that still fits.
 */
#include <stdio.h>
#include <string.h>

static short slen(const char *s) { short n = 0; while (s[n]) n++; return n; }

/* Fake proportional metrics: narrow glyphs 4px, wide ones 9px, ellipsis 7px. */
static short GlyphW(unsigned char c)
{
	if (c == 0xC9) return 7;                      /* ellipsis */
	if (c == 'i' || c == 'l' || c == 'j' || c == '.' || c == ' ') return 4;
	if (c == 'm' || c == 'w' || c == 'M' || c == 'W') return 9;
	return 6;
}
static short TextWidth(const char *buf, short first, short count)
{
	short i, w = 0;
	for (i = 0; i < count; i++) w += GlyphW((unsigned char)buf[first + i]);
	return w;
}

#include "fitwidth.inc"

static int fails = 0;

static void check(const char *name, const char *in, short budget, short cap)
{
	char out[128];
	short n, i;
	memset(out, 0x7F, sizeof(out));            /* poison, so overruns show up */
	n = FitWidth(in, budget, out, cap);

	/* 1. never wider than the budget it was given */
	if (budget > 0 && TextWidth(out, 0, n) > budget) {
		printf("  FAIL %-22s drew %dpx into a %dpx slot\n", name, TextWidth(out, 0, n), budget);
		fails++;
	}
	/* 2. stays inside the caller's buffer, and is NUL-terminated */
	if (n > cap - 1 || out[n] != 0) {
		printf("  FAIL %-22s wrote %d bytes into a %d-byte buffer / no terminator\n", name, n, cap);
		fails++;
	}
	for (i = n + 1; i < cap; i++) { /* nothing scribbled past the terminator */ }
	if ((unsigned char)out[cap] != 0x7F && cap < (short)sizeof(out)) {
		printf("  FAIL %-22s scribbled past cap\n", name);
		fails++;
	}
	/* 3. if it cut, it says so with an ellipsis */
	if (n > 0 && n < slen(in) && (unsigned char)out[n - 1] != 0xC9) {
		printf("  FAIL %-22s truncated without an ellipsis\n", name);
		fails++;
	}
	/* 4. if it fits whole AND fits the buffer, it is the whole string untouched */
	if (slen(in) <= cap - 2 && TextWidth(in, 0, slen(in)) <= budget && n != slen(in)) {
		printf("  FAIL %-22s shortened a title that already fit\n", name);
		fails++;
	}
	printf("  ok   %-22s budget %3dpx -> %2d bytes, %2dpx  \"%.*s\"\n",
	       name, budget, n, TextWidth(out, 0, n), n, out);
}

int main(void)
{
	/* The title from the real bug: it ran out of its row on the Plus. */
	const char *why  = "Why Nations Fail - James Robinson Daron Acemoglu";
	const char *shrt = "Fresco";
	short budget;

	printf("FitWidth host test\n");
	check("short title",        shrt, 200, 72);
	check("the long one",       why,  200, 72);
	check("very tight",         why,   20, 72);
	check("one glyph of room",  why,    7, 72);
	check("no room at all",     why,    0, 72);
	check("negative room",      why,   -5, 72);
	check("empty string",       "",   200, 72);
	check("small buffer",       why,  200, 12);

	/* Monotonic: more room never yields a shorter string. */
	{
		char out[128]; short prev = -1, n;
		for (budget = 0; budget <= 400; budget++) {
			n = FitWidth(why, budget, out, 72);
			if (n < prev) { printf("  FAIL monotonic: budget %d gave %d after %d\n", budget, n, prev); fails++; break; }
			if (TextWidth(out, 0, n) > budget && budget > 0) { printf("  FAIL overflow at budget %d\n", budget); fails++; break; }
			prev = n;
		}
		if (prev >= 0) printf("  ok   monotonic sweep      0..400px, never shrinks, never overflows\n");
	}

	printf(fails ? "\n%d FAILURE(S)\n" : "\nall passed\n", fails);
	return fails ? 1 : 0;
}
