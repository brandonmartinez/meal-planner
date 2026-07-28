### 2026-07-28T13:05:00-04:00: Grocery group headings own repeated provenance labels (#218)
**By:** Virgil
**What:** In `GroceryListPage`, the active group heading owns the provenance value it names: day grouping suppresses each row's day chip, and meal grouping suppresses each row's meal-source label. Category and alphabetical grouping still show both row provenance labels. Full provenance must remain reachable via hover/title, and Pantry Staples must follow the same display contract.
**Why:** Day and meal grouping duplicate multi-source grocery items into each relevant bucket, so repeating the heading value on every row adds noise without adding information.
