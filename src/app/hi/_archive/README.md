# Archived /hi homepages

`homepage-classic-2026-09-09.tsx` is the React homepage that served bartin16.xyz until
2026-09-09: the 👋 emoji, "Hey, I'm Bart", the Baloo 2 / Source Sans pairing, and the
dodo.foo / Mac Plus / Jambot / decremental paragraph. It was replaced by the "Small
wonders" design (`src/app/hi/home.ts`, served by `src/app/hi/route.ts`).

A folder starting with `_` is private in the App Router, so nothing in here is routed.
To restore it: move the file back to `src/app/hi/page.tsx` and delete `src/app/hi/route.ts`.
