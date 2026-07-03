/*
 * pxbits.inc — Daily Pixel canvas/offscreen bit logic, shared VERBATIM
 * between pixel.c and the host test logic_test.c. Pure byte arrays, no
 * QuickDraw: the 64x64 packed canvas (bit7 = leftmost, 1 = black) and its
 * 4x-expanded 256x256 offscreen bitmap (32 bytes/row) that CopyBits blits.
 */

#define PXB_W  64
#define PXB_H  64
#define PXB_RB 8
#define PXB_SCALE 4
#define PXB_ORB (PXB_W * PXB_SCALE / 8)   /* offscreen rowBytes = 32 */

static unsigned char gCanvas[PXB_H][PXB_RB];
static unsigned char gOffBits[PXB_H * PXB_SCALE][PXB_ORB];
static unsigned long gExp[256];   /* 8 source bits -> 32 dest bits (each x4) */

static void BuildExpandTable(void)
{
    short b, k;
    for (b = 0; b < 256; b++) {
        unsigned long v = 0;
        for (k = 0; k < 8; k++)
            if (b & (1 << (7 - k)))
                v |= (unsigned long)0xF << (28 - 4 * k);
        gExp[b] = v;
    }
}

/* rebuild the whole offscreen bitmap from gCanvas */
static void RebuildOffscreen(void)
{
    short y, j, r;
    for (y = 0; y < PXB_H; y++) {
        unsigned char row0[PXB_ORB];
        for (j = 0; j < PXB_RB; j++) {
            unsigned long e = gExp[gCanvas[y][j]];
            row0[j * 4]     = (unsigned char)(e >> 24);
            row0[j * 4 + 1] = (unsigned char)(e >> 16);
            row0[j * 4 + 2] = (unsigned char)(e >> 8);
            row0[j * 4 + 3] = (unsigned char)e;
        }
        for (r = 0; r < PXB_SCALE; r++) {
            unsigned char *dst = gOffBits[y * PXB_SCALE + r];
            for (j = 0; j < PXB_ORB; j++) dst[j] = row0[j];
        }
    }
}

/* set one cell in gCanvas + the offscreen bits (no screen painting here) */
static void SetCellBits(short x, short y, short v)
{
    unsigned char mask = (unsigned char)(1 << (7 - (x & 7)));
    short r;
    if (v) gCanvas[y][x >> 3] |= mask; else gCanvas[y][x >> 3] &= (unsigned char)~mask;
    for (r = 0; r < PXB_SCALE; r++) {
        unsigned char *dst = &gOffBits[y * PXB_SCALE + r][(x * PXB_SCALE) >> 3];
        unsigned char m = (unsigned char)((x & 1) ? 0x0F : 0xF0);
        if (v) *dst |= m; else *dst &= (unsigned char)~m;
    }
}

static short GetCell(short x, short y)
{
    return (gCanvas[y][x >> 3] >> (7 - (x & 7))) & 1;
}

/* offscreen probe (for tests + sanity): is screen pixel (sx,sy) black? */
static short PxbOffPixel(short sx, short sy)
{
    return (gOffBits[sy][sx >> 3] >> (7 - (sx & 7))) & 1;
}
