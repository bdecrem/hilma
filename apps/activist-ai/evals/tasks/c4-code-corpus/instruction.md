docs/ holds forty field reports (some .txt, some .md; the text is wrapped across lines). Code all of them against the six codes in scheme.md. We only code what happened, not what the report says did not happen.

1. codes.csv with columns doc, code, quote: one row per report and code that applies, with a quote copied exactly from the report (line breaks inside a quote may be written as spaces).
2. code_counts.csv with columns code, documents: for each of the six codes, how many reports have it (zero if none). These counts must agree with codes.csv.

Every quote will be checked against the report's text, so do not paraphrase.
