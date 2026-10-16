# Pack flag tiles

Each tile is a 4× render (112×75 px, 3:2 crop) of the official flag vector published on
Wikimedia Commons. All of these flags are in the public domain. Nothing here is drawn by hand.

Rebuild any tile with `cd scripts && node render-flags.js [key]`. The key → source file map
lives in `scripts/render-flags.js` (`FLAG_SOURCES`); the pack → key map lives in
`poul-v1.5.html` (`PACK_FLAG`).

US packs carry their state flag (plus DC and Puerto Rico). Packs abroad carry the national
flag; London carries England's cross and Edinburgh carries Scotland's saltire.
