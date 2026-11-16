Build a small dashboard page, index.html, from members.csv (our union's membership list). It must work offline (no CDNs or outside files) and look right on a phone (390 px wide, no sideways scrolling).

Show:
- the number of members, in an element with data-stat="members"
- the percent of members whose status is active, one decimal, in an element with data-stat="active_percent"
- the total yearly dues of active members, in an element with data-stat="dues_active"
- a table with one row per region, each row with data-region="<region name>", showing that region's number of members
