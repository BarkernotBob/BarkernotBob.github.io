---
title: Direction - Word Study Series
publish: false
---

# Biblical Word Study series — loose direction

Internal planning doc, not published to the site. Enough to hand to the next agent; details get decided per module.

## What exists

- **Word Study Fallacies** — live interactive (`quartz/static/Word-Study-Fallacies.html`, stub page in this folder). Strong's builder experiment on Luke 7:1, entry anatomy, compound-word quiz, source-hierarchy ladder in the takeaways.

## Planned modules (a suite of interconnected interactives)

1. **Context & self-bias** — fill-in-the-blank exercise. The point: context doesn't narrow you to the right option, it makes several options *feel* right, so the word list becomes a mirror for what you already wanted the verse to say. Let the reader "prove" two opposite readings of the same blank.
2. **Verb tenses** — target the "aorist = once-for-all action" style of claim. Show the same tense doing contradictory jobs in familiar verses; tense-form sometimes doesn't match the actual usage in question. Moral: tense contributes to meaning, it isn't a code to crack.
3. **How to use a dictionary** — walk through a real lexicon entry (BDAG-style) the way the Fallacies page walks through Strong's anatomy. Then show what no dictionary captures: idioms, collocations, register, metaphor — complicated relationships between words. Bridge in from the "into the ears of the people" idiom in the Fallacies page.

Recurring motif across modules: the hierarchy of Greek usage sources (NT → LXX → other Koine → church fathers → classical), especially for rare words and specialized terms (e.g. LXX offering vocabulary in Leviticus).

## Build conventions (match Word Study Fallacies)

- Each module = standalone HTML app in `quartz/static/` + a stub `.md` in this folder using the `data-static-redirect` pattern.
- Same parchment visual language (copy the CSS variables from the existing page) so the series reads as one thing.
- Cross-link modules at the end of each page; possibly a small hub page later.
- Verify with headless-browser screenshots before pushing; PR into `v5`.
- Tone: honor the reader's instinct, never scold; every reveal comes from something the reader just did themselves.
