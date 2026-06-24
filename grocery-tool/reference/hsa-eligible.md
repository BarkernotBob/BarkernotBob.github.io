# HSA-eligible item reference (for reimbursement flagging)

An **HSA** (Health Savings Account) lets you spend pre-tax money on qualified
medical expenses. Some things you buy at the grocery store or pharmacy qualify,
and you can **reimburse yourself** from your HSA for them — but only if you keep
the receipt. This tool flags eligible items so you have a running list and the
receipt photo on file.

> **Important plain-language disclaimer:** This is a *best-effort* flag to help
> you remember to look into reimbursement. It is **not tax advice**. Rules change
> and depend on your specific HSA plan. Claude marks items it believes are
> commonly eligible; you (or your HSA administrator) make the final call. When
> Claude is unsure, it flags the item as "confirm_hsa" in Needs Attention rather
> than guessing.

## Generally ELIGIBLE (flag `hsaEligible: true`)

Since 2020 (CARES Act), **over-the-counter medicines no longer need a
prescription** to be HSA-eligible, and **menstrual products** are now eligible.

- **OTC medicines:** pain relievers (acetaminophen, ibuprofen, aspirin), cold &
  flu, allergy (antihistamines), cough drops, antacids, anti-diarrheal,
  laxatives, sleep aids, motion sickness
- **First aid:** bandages, gauze, antiseptic, antibiotic ointment, hydrogen
  peroxide, rubbing alcohol, cotton swabs for wound care, thermometers,
  hot/cold packs, braces & supports, kinesiology tape
- **Skin/medical:** sunscreen (SPF 15+), acne treatment, eczema/anti-itch cream,
  lip balm with SPF, medicated chapstick, wart remover, eye drops, contact lens
  solution, reading glasses
- **Diagnostics & devices:** blood pressure monitors, glucose monitors & test
  strips, pulse oximeters, COVID/flu test kits, pregnancy & ovulation tests,
  nebulizers, CPAP supplies
- **Family/baby health:** menstrual products (pads, tampons, cups, liners),
  breast pumps & supplies, baby thermometers, pediatric electrolyte solutions
  (e.g. Pedialyte)
- **Other commonly eligible:** denture cream/adhesive, hearing aid batteries,
  smoking-cessation aids (nicotine gum/patches), condoms, family-planning items,
  prescription items, orthopedic shoe inserts

## Generally NOT eligible (flag `hsaEligible: false`)

- Regular groceries and food (even "healthy" food), unless prescribed for a
  specific medical condition with a Letter of Medical Necessity
- Vitamins & dietary supplements taken for general health (a few are eligible
  only **with** a Letter of Medical Necessity — flag `confirm_hsa` if unsure;
  prenatal vitamins and glucosamine/chondroitin are common exceptions that ARE
  eligible)
- Cosmetics, general toiletries (shampoo, regular toothpaste, deodorant,
  non-medicated lotion, makeup)
- Household & cleaning supplies, paper goods
- Toothbrushes (manual), regular sunglasses, gym memberships

## How Claude decides
1. If the item clearly matches an **eligible** category above → `hsaEligible: true`.
2. If it clearly matches a **not-eligible** category → `hsaEligible: false`.
3. If it's a gray area (supplements, "is this medicated?", ambiguous abbreviation)
   → set `hsaEligible: false` **and** add a `confirm_hsa` entry to
   `needs_attention.json` so you can confirm.

The app has an **HSA report** that totals everything flagged eligible over any
time period and links to each receipt photo for your records.
