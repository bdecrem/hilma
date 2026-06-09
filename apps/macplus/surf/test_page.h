/*
 * test_page.h - a complete, realistic SRF frame for the offline SURF_TEST
 * build (Mini vMac has no serial). Exercises every block style, continuation
 * joining, links, gaps, and enough length to need the scrollbar.
 */

static const char gTestPage[] =
"SRFSTS fetching test.example...\r\n"
"SRFPAG\r\n"
"T The Macintosh Plus Reads the Web Again\r\n"
"P This is the embedded test page. It exercises every style the renderer knows: a title, headings, paragraphs, quotes,\r\n"
"+ bullets, and links - including continuation lines like this one, which must join seamlessly into a single wrapped\r\n"
"+ paragraph with no visible seam.\r\n"
"B\r\n"
"H How this works\r\n"
"P The Mac mini fetches a page, strips it to rough text, and Claude re-emits it as clean reader-mode blocks. Only those\r\n"
"+ blocks cross the 9600-baud serial link, so a typical article loads in six to eight seconds and renders as it arrives.\r\n"
"Q The page is not the bytes. The page is the words. -- someone, probably\r\n"
"H Things to verify by hand\r\n"
"- the title is big and bold, headings slightly smaller\r\n"
"- this bullet list indents and wraps correctly when a bullet item runs long enough to need more than one screen line\r\n"
"- the quote above is indented and italic\r\n"
"- links below are underlined; clicking one inverts it briefly\r\n"
"- the scrollbar tracks the document and the arrow keys scroll\r\n"
"B\r\n"
"H Some links\r\n"
"L 1 NPR text-only news\r\n"
"L 2 Hacker News front page\r\n"
"L 3 Wikipedia: Macintosh Plus, a fine machine that deserves the web\r\n"
"B\r\n"
"H Filler so the scrollbar has work to do\r\n"
"P Lorem ipsum is boring, so instead: the Macintosh Plus shipped in January 1986 with one megabyte of RAM, a SCSI port,\r\n"
"+ and an 800K floppy drive. It cost 2599 dollars. It had no fan, no hard disk, and no idea that forty years later it\r\n"
"+ would be browsing the live web through a Claude model running on a machine ten thousand times faster than itself.\r\n"
"P The screen you are reading this on is 512 by 342 pixels, one bit deep. Every glyph is Geneva, drawn by QuickDraw the\r\n"
"+ same way it drew MacPaint. The text you are reading travelled as plain ASCII lines, each tagged with a single style\r\n"
"+ letter, assembled into blocks, word-wrapped against the real font metrics, and laid out into a scrolling document.\r\n"
"P If you can read this paragraph at the bottom after scrolling, layout, the scrollbar, the keyboard, and the wire\r\n"
"+ format are all working together. That is the whole renderer, verified offline.\r\n"
"SRFEND\r\n";
