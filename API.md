# Lupin Data

Lupin Data is now a GitHub-native data repository rather than a required always-running API.

## Public data

The main public data endpoint is the repository's raw JSON:

`data/flights.json`

The Lupin Airlines Pages site reads it directly.

## Data service pattern

Shared data belongs in `data/`. Validation and automation belong in `.github/workflows/`.

For a new project, add a clearly named JSON data file and a validation workflow rather than creating a project-specific server.

## Current limitations

GitHub Pages is static. It cannot receive arbitrary POST requests from visitors.

Therefore the current Lupin Airlines website keeps account/session and booking state in browser storage. GitHub-hosted public flight data remains shared across visitors.

Future GitHub Actions can process controlled repository changes without requiring an external server.

## Security

Never put GitHub tokens, passwords, or other secrets in public website code or JSON data.
