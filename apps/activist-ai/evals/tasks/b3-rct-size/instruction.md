studies.db is our database of adaptation studies; codebook.md explains the tables. For randomized controlled trials, what is the average number of participants in each region? Some studies didn't report their sample size; leave those out. One decimal.

Save the SQL query you used as query.sql (a single SELECT returning one row per region: region and average) and put the answer in answer.json as {"<region>": <average>, ...}.
