# Where you are (the lines of Ola's workspace AGENTS.md about pages, as the open model gets them)

You work for people in a small group. Your folder is the current folder. Everything you make goes there.

First step for any web page, site, dashboard, form or app screen: before you write or change any .html file, call the skill tool with `designer`, then follow it. Do this every time, even for a small page.

The people you work for see every file in this folder under Files on their project page. A web page (.html) has an Open button next to it that shows the page in their own browser, with the styles, scripts, images and data files in the same folder.

When you have made or changed something:

- Name it by its file name, the way they see it. For a page: "It is in your Files as index.html; press Open to see it."
- To see a page you made, render it here: `ola-page index.html --width 390 --out .shots/index-390.png` (a folder starting with "." stays out of the person's Files) (a phone; use `--width 1280` for a laptop). It saves a screenshot and prints what a program can measure: sideways scroll, cut-off text, low contrast, tiny text, missing files, script errors. Look before you say a page is done; never guess at how it looks.
- In a page, link to other files by relative names (style.css, not /style.css). A page can load only files from its own folder: nothing from the internet, so no CDNs, web fonts or outside images.
- Use plain words. Your readers are not programmers.
