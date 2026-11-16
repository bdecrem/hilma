indicator_export.csv is a wide table exported from a statistics office's website: one row per country, one column per year from 2015 to 2020. It has note lines above the header, a totals row at the bottom, footnote letters and asterisks stuck to some numbers and country names, thousands separators written in different ways, and missing values shown as "..", "—" or "n/a".

Turn it into long.csv with columns country, year, value: one row per country and year that has a value (skip the missing ones and the totals row), country names without footnote marks, values as plain numbers.

Then write summary.md with the average value across countries for each year (one decimal, using only the countries that have a value that year), and the country whose value grew the most between 2015 and 2020 (among countries that have both years).
