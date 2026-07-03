/*
 * logic_test.c — host-clang test for the Daily Pixel bit logic (pxbits.inc,
 * shared verbatim with pixel.c): the 8->32 bit expansion table, full
 * offscreen rebuild, and incremental SetCellBits patching.
 *
 *   clang -Wall -o /tmp/pxlogic logic_test.c && /tmp/pxlogic
 */
#include <stdio.h>
#include <string.h>

typedef short Boolean;   /* pxbits.inc is plain C — nothing Mac needed */

#include "pxbits.inc"

static int fails = 0;
#define OK(cond, name) do { printf("%s %s\n", (cond) ? "ok  " : "FAIL", name); if (!(cond)) fails++; } while (0)

/* reference: is canvas cell (x,y)'s 4x4 screen block uniformly v? */
static int BlockIs(short x, short y, short v)
{
    short r, c;
    for (r = 0; r < PXB_SCALE; r++)
        for (c = 0; c < PXB_SCALE; c++)
            if (PxbOffPixel(x * PXB_SCALE + c, y * PXB_SCALE + r) != v) return 0;
    return 1;
}

int main(void)
{
    int i, good;

    BuildExpandTable();

    /* 1. expansion table spot checks */
    OK(gExp[0x00] == 0x00000000UL, "exp 0x00");
    OK(gExp[0xFF] == 0xFFFFFFFFUL, "exp 0xFF");
    OK(gExp[0x80] == 0xF0000000UL, "exp 0x80 (leftmost bit -> leftmost nibble)");
    OK(gExp[0x01] == 0x0000000FUL, "exp 0x01 (rightmost bit -> rightmost nibble)");
    OK(gExp[0xA5] == 0xF0F00F0FUL, "exp 0xA5");

    /* 2. rebuild: a diagonal canvas expands to correct 4x4 blocks */
    memset(gCanvas, 0, sizeof(gCanvas));
    for (i = 0; i < PXB_W; i++) gCanvas[i][i >> 3] |= (unsigned char)(1 << (7 - (i & 7)));
    RebuildOffscreen();
    good = 1;
    for (i = 0; i < PXB_W; i++) {
        int x, y;
        for (x = 0; x < PXB_W; x++)
            for (y = 0; y < PXB_H; y++)
                if (BlockIs((short)x, (short)y, 1) != (x == y)) { good = 0; }
        break;   /* the double loop above already covers everything */
    }
    OK(good, "diagonal rebuild -> exact 4x4 blocks");

    /* 3. incremental SetCellBits matches a full rebuild */
    {
        unsigned char ref[PXB_H * PXB_SCALE][PXB_ORB];
        SetCellBits(3, 5, 1);
        SetCellBits(63, 0, 1);
        SetCellBits(0, 63, 1);
        SetCellBits(5, 5, 1);
        SetCellBits(5, 5, 0);      /* set then erase */
        SetCellBits(10, 10, 0);    /* erase an already-clear cell */
        memcpy(ref, gOffBits, sizeof(ref));
        RebuildOffscreen();
        OK(memcmp(ref, gOffBits, sizeof(ref)) == 0, "incremental == full rebuild");
        OK(GetCell(3, 5) == 1 && GetCell(5, 5) == 0 && GetCell(63, 0) == 1, "GetCell agrees");
        OK(BlockIs(63, 0, 1) && BlockIs(0, 63, 1), "corner cells land in corners");
    }

    /* 4. erase clears exactly its own block */
    SetCellBits(31, 31, 1);
    SetCellBits(32, 31, 1);
    SetCellBits(31, 31, 0);
    OK(BlockIs(31, 31, 0) && BlockIs(32, 31, 1), "erase is surgical (odd/even nibbles)");

    printf(fails ? "\n%d FAILURE(S)\n" : "\nall tests passed\n", fails);
    return fails ? 1 : 0;
}
