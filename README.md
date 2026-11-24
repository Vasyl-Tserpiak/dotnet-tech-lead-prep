# .NET Tech Lead — Interview Prep Tracker

A self-contained, printable study tracker for a .NET Tech Lead interview.

- **17 parts / 38 areas / 477 topics**, each tagged by priority (P0/P1/P2).
- **319 topics** have two explanations. Choose **Opus 4.8** for the original deep dive or **Astra Medium** for a concise example and its engineering implications. The viewer remembers your selection in this browser. The other 158 topics show a placeholder.
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

## Note on progress

Checkmarks are stored in the browser (`localStorage`), so they are **per-device** — the content is identical everywhere, but each device tracks its own progress.
