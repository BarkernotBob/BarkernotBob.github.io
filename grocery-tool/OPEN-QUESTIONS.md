# Grocery Tracker — Open Questions

Captured from the July 2026 project audit (competitor comparison vs. GroceryTrack and NoWaste) and follow-up discussion on use-by dates and AI processing. These are questions to explore, not decisions.

## 1. AI-first use-by estimation from the receipt — instead of barcodes/OCR?

Context:
- Barcodes contain no date; apps like NoWaste scan a barcode to identify the product in a licensed database, then *suggest* a category-average shelf life (reviews say suggestions are often wrong). Those databases are paid/licensed and mostly lack shelf-life data anyway; scanning also adds one scan per item vs. one photo per receipt.
- Printed best-by dates are conservative and lot-specific; the actual job is a "use it soon" nudge that fires before spoilage, which doesn't need date precision.

To explore:
- Have the processing playbook stamp an estimated use-by on every perishable at parse time, from item type + `reference/perishables.md`. Is the existing reference table granular enough?
- Feedback loop: when Review logs "threw away (spoiled)" vs. "still good," adjust that item's shelf life in the canonical-grouping memory — personalized shelf lives from our own waste data (something no commercial database has). What's the minimal data shape for this?
- Keep a manual date override for the few items where the printed date genuinely matters (deli meat, medications)?

## 2. Where should AI sit in the receipt pipeline — and where can it be removed?

Context:
- Processing has two jobs: *reading* the photo (vision) and *interpreting* the text (canonical names, categories, grouping, HSA, uncertainty flags). OCR can only take over reading; interpretation still needs an LLM.
- Cost of vision parsing is already ~a cent or two per receipt, so OCR saves little money; the real levers are effort/automation and accuracy.
- The v2 structured-order import (extension/email adapters → staging JSON) is zero-AI and exact, because digital orders already carry labeled fields (full names, prices, UPCs). Trade-off: adapters are brittle — they break when a store redesigns its page, whereas AI parsing degrades but never "breaks."

To explore:
- Prioritize widening structured-import adapters (more stores) as the main AI-reduction lever?
- If paper-receipt volume stays high: on-device OCR at capture (Apple Vision / Live Text via an iOS Shortcut, no code) → feed text to a small model (Haiku) with the photo as fallback for mangled thermal-paper receipts. Worth the extra pipeline stage?
- Does HSA-eligibility judgment stay AI/Review-queue-driven in both lanes?
