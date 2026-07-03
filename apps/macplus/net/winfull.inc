/*
 * winfull.inc — full-screen windows with a close box + zoom (maximize) box,
 * shared by every Plus app. Include after the Toolbox headers and (like
 * applog.inc) it compiles straight into the app — no separate .c.
 *
 * Classic-Mac note: a window's title bar carries a CLOSE box (left) and, with
 * the zoomNoGrow window kind, a ZOOM box (right) — the System 6 equivalent of
 * "full screen + maximize + close". We open filling the screen (the "standard"
 * state) and let the zoom box toggle down to a compact state and back.
 *
 * Usage in an app:
 *   WindowPtr w = WFNew("\pTitle");           // fills the screen; close + zoom
 *   ... inside your FindWindow(part) switch:
 *       case inGoAway:  if (TrackGoAway(win, ev->where)) <quit-or-close>; break;
 *       case inZoomIn:
 *       case inZoomOut: if (WFZoom(win, part, ev->where)) <relayout+redraw>; break;
 */
#ifndef WINFULL_INC
#define WINFULL_INC

#ifndef zoomNoGrow
#define zoomNoGrow 12          /* close box + zoom box, no grow (resize) handle */
#endif

/* Some interface sets don't expose WStateData; define it if missing. It hangs
 * off a document window's dataHandle and holds the two zoom targets. */
#ifndef __WINFULL_HAVE_WSTATE
typedef struct WFStateData { Rect userState; Rect stdState; } WFStateData;
typedef WFStateData **WFStateHandle;
#endif

/* Full-screen content rect (global coords): sits under the 20px menu bar and the
 * ~19px title bar. Left edge is the screen edge (byte-aligned) so apps that blit
 * straight to screen memory (Atkinson) land on a byte boundary; width is the
 * whole screen for a truly maximal window. */
static void WFFullRect(Rect *r)
{
    Rect s = qd.screenBits.bounds;
    SetRect(r, s.left, s.top + 40, s.right, s.bottom - 2);
}

/* The compact "user" state to zoom down to (and back up from): centred. */
static void WFUserRect(Rect *r)
{
    Rect s = qd.screenBits.bounds;
    short w = 400, h = 248;
    short l = s.left + (s.right - s.left - w) / 2;
    short t = s.top + 46;
    SetRect(r, l, t, l + w, t + h);
}

/* Create a window that fills the screen and has a close box + working zoom box. */
static WindowPtr WFNew(ConstStr255Param title)
{
    Rect full, user;
    WindowPtr w;
    WFFullRect(&full);
    /* goAwayFlag = true -> close box; zoomNoGrow -> zoom box. */
    w = NewWindow(0L, &full, title, true, zoomNoGrow, (WindowPtr)-1L, true, 0);
    if (w) {
        WFStateHandle h = (WFStateHandle)((WindowPeek)w)->dataHandle;
        if (h) {
            WFUserRect(&user);
            (**h).stdState  = full;   /* zoom-out target = full screen  */
            (**h).userState = user;   /* zoom-in  target = compact      */
        }
    }
    return w;
}

/* Handle a click in the zoom box. Returns true if the window changed size, so
 * the caller can re-lay-out its content to the new portRect and redraw. */
static Boolean WFZoom(WindowPtr w, short part, Point where)
{
    if (!TrackBox(w, where, part)) return false;
    SetPort(w);
    { Rect r = w->portRect; EraseRect(&r); }
    ZoomWindow(w, part, true);
    return true;
}
#endif /* WINFULL_INC */
