# Pool Care — Open Questions

Captured from the July 2026 project audit (competitor comparison vs. Pool Math by Trouble Free Pool and the Orenda Calculator). These are questions to explore, not decisions.

## 1. Should the app stay deliberately "simple," and lean into that as its identity?

Context from the audit:
- Pool Math assumes a drop-based test kit (Taylor/TF-100, ~$75+, 5–10 min per test) and only acts when you open the app. Orenda is a pro-leaning LSI calculator with no reminders or history. Neither pushes anything to the user.
- This app is the only one of the three built around "tell me what to do today": push reminders (RSS/email), weather-triggered advice, season open/close checklists, strip-based testing.

To explore:
- Is "clean pool, minimal cost, minimal time" the explicit product thesis? If so, does that argue *against* adding deeper chemistry (CSI/LSI, salt, borates) rather than for it?
- CSI/salt/borate dosing is public arithmetic (TFP formulas, LSI formula) — feasible in roughly a weekend if ever wanted. Does it matter for a strip-and-jug vinyl/fiberglass pool, or only for plaster/saltwater pools?

## 2. How to cover the known weakness of strips without losing simplicity?

Context:
- Strips read CYA and TA poorly. The failure mode of a strips-only routine is slow drift — especially CYA creeping up from stabilized chlorine until free chlorine stops sanitizing.
- The app already has a quantitative "Numbers" (lab) test mode that could absorb occasional high-accuracy readings.

To explore:
- Add a scheduled task like "quarterly: get a free pool-store lab test, enter results in Numbers mode"? (Uses existing features; zero added daily burden.)
- Add a drift rule to the dosing engine: if CYA trends upward across tests, advise switching chlorine type or a partial drain?
- Would these two changes close enough of the accuracy gap that deeper chemistry is unnecessary?
