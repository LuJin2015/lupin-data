# Lupin Data

Shared GitHub cloud data platform for Lupin Airlines and future projects.

## Architecture

- GitHub Pages hosts project frontends.
- GitHub Actions performs controlled data mutations.
- JSON under `data/<project>/` is the cloud source of truth.
- Projects can share this repository while keeping their data namespaced.
- No Render, Google Apps Script, Google Sheets, or external database is required.

## Lupin Airlines

```
data/lupin-airlines/
├── flights.json
├── accounts.json
└── bookings.json
```

Add or edit flights in `data/lupin-airlines/flights.json`. The Airlines site loads that single catalogue.

Accounts contain a username, password hash, miles balance, and creation time. Bookings contain the booking record and status. GitHub Actions updates these files for register, book, and cancel operations.

## Cloud write workflow

`.github/workflows/lupin-airlines-cloud.yml` accepts a workflow dispatch with an operation and JSON payload. The runner updates the appropriate files and commits them back to `main`.

The workflow uses a concurrency group so simultaneous requests are processed one at a time.

## Validation

`.github/workflows/validate-data.yml` validates every JSON file recursively and checks the Lupin Airlines flight catalogue for required fields and duplicate flight codes.

## Shared-project model

Future projects should use:

```
data/<project-name>/
```

so several repositories can share this cloud repository without mixing their records.

## Privacy

Previous Lupin Airlines account data was retired and is not migrated. This repository is public, so the data stored here should be treated as public. Passwords are stored as hashes rather than plaintext.

## Authentication

The Lupin Airlines website uses GitHub authorization to let an authorized project collaborator trigger the cloud workflow. Each person using write operations needs GitHub access to this repository.

