# .NET Tech Lead — Interview Prep Tracker

A self-contained, printable study tracker for a .NET Tech Lead interview.

- **17 parts / 38 areas / 477 topics**, each tagged by priority (P0/P1/P2).
- **331 topics** have two explanations. Choose **Opus 4.8** for the original deep dive or **Astra Medium** for a topic-specific follow-up question, a walkthrough, a worked example and engineering implications. Use the separate **ENG / UKR** switch to read Astra in English or Ukrainian. The viewer remembers model and language independently. The other 146 topics show a placeholder.
- Interactive checkboxes, search, filters, and progress bars. Print-friendly.

## Use

Open **`index.html`** in a browser, tick items as you study (progress auto-saves), and click **Explain** on any item for the deep dive. Press **Ctrl+P** for a paper checklist.

## Files

| File | Purpose |
|------|---------|
| `index.html` | the tracker (entry point) |
| `tracker-data.js` | the topic data (shared) |
| `explanations.html` | the deep-dive viewer |
| `explanations-data.js` | the deep-dive content |
| `astra-explanations.js` | alternative explanations keyed by the same topic IDs |
| `astra-uk-explanations.js` | Ukrainian translations of the Astra explanations |

The language switch checks the selected topic and model for a translation. To enable Ukrainian for an Opus topic, supply its translated article HTML in `window.OPUS_UK_EXPLANATIONS[topicId]` alongside the English Opus data. Use the same topic ID and trusted static HTML format as `window.EXPLANATIONS`.

## Note on progress

Checkmarks are stored in the browser (`localStorage`), so they are **per-device** — the content is identical everywhere, but each device tracks its own progress.
