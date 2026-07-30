# PLAUD Walk Notes

A small native macOS app that pulls original PLAUD transcripts and appends them to one Markdown file per day.

## Behavior

- Press **Sync** after a walk.
- The app checks the last seven days and imports only recordings it has not processed before.
- Recordings ten minutes apart or less are separated by a blank line.
- Recordings more than ten minutes apart are separated by a local timestamp formatted as a Markdown heading, with an extra blank line above it.
- Output lives in `~/Documents/PLAUD Walk Notes/YYYY-MM-DD.md`.
- Each file begins with the first NotePin recording's full local timestamp as a Markdown heading.
- The app requests PLAUD's original `transaction` transcript. It never requests summaries or polished transcripts.
- Files are append-only. A private processed-ID ledger in Application Support prevents deleted or edited text from being restored.

## Dependency

The app uses PLAUD's official CLI:

```sh
npm install -g @plaud-ai/cli
```

The first Sync opens PLAUD's browser authorization if needed.
