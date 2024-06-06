**getListViewsIds**
**Prerequisite**
- set .env file as in the example

**Input**
- ./input/users.csv - list of username for which to run
- ./input/excludedListViews.csv - list of listview to exclude from results (for instance public one)

**Output**
- ./output/listviews.csv - file contains a list of all listviews: username,sobject name, listview id
- ./output/results.csv - results for each users (ammount of extracted list views ids / error message)
