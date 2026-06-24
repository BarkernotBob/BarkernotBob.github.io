# Perishable shelf-life reference (for use-by estimation)

When Claude processes a receipt, it decides whether each item is **perishable**
(goes bad) and, if so, estimates a **use-by date** = purchase date + the number
of days below. The reminder then fires on that date asking you to check freshness.

These are **conservative fridge/pantry estimates for typical home storage**. They
are guidelines, not guarantees — the reminder always says "check freshness,"
never "throw it out automatically." When unsure, Claude rounds **down** (errs
toward reminding you sooner).

If an item shows a printed "best by / sell by / use by" date on the receipt,
prefer that date over the table.

## Produce (fridge unless noted)
| Item | Days |
|---|---|
| Bananas (counter) | 5 |
| Berries (strawberry, blueberry, raspberry) | 4 |
| Grapes | 7 |
| Apples (fridge) | 30 |
| Citrus (orange, lemon, lime) | 21 |
| Avocado (ripe) | 4 |
| Tomatoes (counter) | 6 |
| Leafy greens / lettuce / spinach | 5 |
| Herbs (fresh, cilantro/parsley/basil) | 5 |
| Broccoli / cauliflower | 7 |
| Carrots | 21 |
| Bell peppers | 10 |
| Cucumber / zucchini | 7 |
| Onions / potatoes (pantry, dark) | 30 |
| Mushrooms | 5 |
| Cut/pre-washed produce, salad kits | 4 |

## Dairy & eggs
| Item | Days |
|---|---|
| Milk | 10 |
| Half & half / cream | 10 |
| Yogurt | 14 |
| Cottage cheese / sour cream | 10 |
| Soft cheese (fresh mozzarella, ricotta) | 7 |
| Hard cheese (cheddar, parmesan block) | 30 |
| Shredded cheese (opened) | 14 |
| Butter (fridge) | 60 |
| Eggs | 28 |

## Meat, poultry, seafood
| Item | Days |
|---|---|
| Fresh fish / shellfish | 2 |
| Ground meat (beef, turkey, pork) | 2 |
| Fresh chicken / poultry | 2 |
| Fresh beef / pork cuts (steak, chops, roast) | 4 |
| Bacon / sausage (opened) | 7 |
| Deli sliced meat | 4 |
| Hot dogs (opened) | 7 |
| Tofu (opened) | 5 |

## Bakery & bread
| Item | Days |
|---|---|
| Fresh bread / rolls (counter) | 5 |
| Bagels / tortillas | 7 |
| Bakery cake / pastries | 4 |
| Muffins | 5 |

## Prepared / deli / other
| Item | Days |
|---|---|
| Rotisserie chicken / hot deli | 4 |
| Prepared salads (potato, pasta, deli) | 4 |
| Hummus / fresh dips (opened) | 7 |
| Fresh pasta (refrigerated) | 5 |
| Fresh juice (refrigerated, opened) | 7 |
| Leftovers (if ever logged) | 4 |

## Not perishable (no use-by reminder)
Canned goods, dry pasta/rice/grains, flour/sugar, oils, jarred sauces, snacks,
crackers, cereal, coffee/tea, frozen foods, household/cleaning supplies,
paper goods, toiletries, most pharmacy items. Mark these `perishable: false`
and `useByDate: null`.

> **Frozen note:** if an item is clearly frozen (e.g. "FRZ", "frozen"), treat it
> as non-perishable for reminder purposes (months in the freezer), even if the
> fresh version would be perishable.
