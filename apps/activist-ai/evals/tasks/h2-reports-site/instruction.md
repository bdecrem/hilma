reports/ has 80 field reports; each names its country near the top (the format varies). scheme.md is our coding scheme. Please:
1. Code every report: codes.csv with columns doc (like N07), code, quote (the sentence that shows it, copied exactly).
2. counts.csv with columns country, reports (how many reports from that country), early_warning, migration (how many of its reports have each code).
3. index.html: a page with a table whose id is counts, one row per country, columns Country, Reports, Early warning, Migration, built from counts.csv. It must open with no internet connection.
