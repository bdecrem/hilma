# Blind review, 2026-11-07

Twelve dossiers, labelled A–L at random: the six experimental dossiers and six matched MRD originals
(2023 edition): Portugal↔Spain, Norway↔Sweden, Philippines↔India, Costa Rica↔Colombia, Qatar↔Jordan,
China↔Russia (the MRD's data has no law answers for the UAE or Saudi Arabia, so Jordan stands in).
Both sides were reduced to the same fields: answer, implementation, citation text. The reviewer was a
separate Claude agent with web research and no access to the key (kept outside the repo until the
review was done; now in `key.json`). It checked the same 8 indicators against the law in all twelve.
Report: `blind/REVIEW.md`.

Result: the six experimental dossiers (A, E, F, J, K, L) ranked 1–6, 48/48 checks correct; the MRD
originals 31 correct, 11 partly correct or wrong of 48. Limits: the format differs (ours are longer and
quote articles, which also gives them away), our citations mention 2024–2026 law, and the reviewer is
the same model family as the coder.
