stations.dat is two years of daily readings from six weather stations in a fixed-width format; FORMAT.md describes it and our rules for gaps. baseline.csv has each station's normal temperature per calendar month. Please:
1. Read the file and convert every value to degrees Celsius.
2. Fill short gaps as FORMAT.md says.
3. monthly.csv with columns station, month (like 2024-07), mean_c (two or more decimals; leave it empty when the month has too few days).
4. anomalies.csv with columns station, month: every month whose mean is more than 2.0 degrees above that station's normal for the month.
