# Lupin Data

GitHub-native data repository for Lupin Airlines and future projects.

## Architecture

This repository is the data layer for a GitHub-only setup:

- **GitHub Pages** hosts the Lupin Airlines website.
- **GitHub Actions** validates repository data and can run automation.
- **JSON files in `data/`** are the source of truth for shared public data.
- The website reads public JSON directly from GitHub.

There is no required Render server, Google Apps Script, Google Sheets, or external database.

## Data

Current data files:

- `data/flights.json` — flight catalogue
- `data/accounts.json` — reserved for future GitHub automation
- `data/bookings.json` — reserved for future GitHub automation

The public website currently keeps visitor account/session and booking state in the browser, because GitHub Pages is static and cannot directly accept arbitrary database writes.

## Adding a flight

Edit only:

```
data/flights.json
```

Add another object to the list, for example:

```json
{
  "flight": "LP 008",
  "destination": "Somewhere New",
  "gate": "N",
  "departure": "18:00",
  "price": "S$808"
}
```

The Flights, Booking, and Flight Status pages load the list automatically.

## GitHub Actions

`.github/workflows/validate-data.yml` checks JSON and validates flight records whenever data changes.

The Airlines repository has its own GitHub Pages deployment workflow.

## Privacy

Previous Lupin Airlines account data was retired and is not migrated.

## Important

Do not store passwords, tokens, or other secrets in public JSON files. GitHub Actions secrets should be used for any future automation that needs credentials.
