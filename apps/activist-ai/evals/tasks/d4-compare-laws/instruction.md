I'm comparing six countries' immigration laws (laws/; one is in Spanish and one in German) on three rules: the maximum length of immigration detention (in days), how many months an asylum applicant must wait before working (0 if from the day they apply), and the deadline to appeal a refusal (in days; a week is 7 days).

Some laws were amended by a later article of the same law. Use the rule as it stands after the amendment.

Write comparison.csv with columns country, provision, value, article, amended_by, quote:
- provision is one of detention, work, appeal
- article is the number of the article that contains the rule
- amended_by is the number of the article that changed it, or empty if none did
- quote is the sentence that sets the value now in force (for an amended rule, the amending sentence), copied exactly in the law's language

Then write summary.md saying which country allows the longest detention and which gives the shortest time to appeal.
