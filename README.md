# .NET Tech Lead — Interview Prep Tracker

A self-contained, printable study tracker for a .NET Tech Lead interview.

- **17 parts / 38 areas / 477 topics**, each tagged by priority (P0/P1/P2).
- Every item has an **Explain** button that opens a deep-dive page (concept, C# code, trade-offs, failure modes, and an interview soundbite).
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

## Note on progress

Checkmarks are stored in the browser (`localStorage`), so they are **per-device** — the content is identical everywhere, but each device tracks its own progress.
