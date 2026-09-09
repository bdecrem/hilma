/* Longest prefix of s that fits in w pixels, ellipsised when it has to cut.
   Fills out[] (cap bytes) and returns the byte count to draw. The caller must
   have the chat font set, since this measures with TextWidth. A title cut short
   by `cap` rather than by `w` still gets the ellipsis, so a clipped name never
   reads as a complete one. */
static short FitWidth(const char *s, short w, char *out, short cap)
{
	short full = slen(s), n = full, i;
	if (n > cap - 2) n = cap - 2;            /* room for the ellipsis + NUL */
	if (n < 0) n = 0;
	for (i = 0; i < n; i++) out[i] = s[i];
	out[n] = 0;
	if (w <= 0) { out[0] = 0; return 0; }
	if (n == full && TextWidth(out, 0, n) <= w) return n;      /* whole title fits */
	while (n > 0) {                          /* shrink until prefix + ellipsis fits */
		out[n] = (char)0xC9;                 /* MacRoman ellipsis */
		out[n + 1] = 0;
		if (TextWidth(out, 0, n + 1) <= w) return (short)(n + 1);
		n--;
	}
	out[0] = (char)0xC9; out[1] = 0;         /* last resort: just the ellipsis */
	if (TextWidth(out, 0, 1) <= w) return 1;
	out[0] = 0;
	return 0;
}
