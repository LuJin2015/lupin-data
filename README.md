# Lupin Data

Private backend/data service for Lupin Airlines.

## Fresh account system

The previous user/account dataset is retired and is **not migrated**. New users can register and create new bookings.

No Google Apps Script or Google Sheets is used.

The existing admin password remains the configured admin password, but it must be supplied through the deployment environment as `LUPIN_ADMIN_PASSWORD`; never commit it.

## Privacy banner

The public site should display:

> Privacy update: previous Lupin Airlines account data has been retired. New accounts and bookings are supported, and information needed to operate your account is stored securely.

No old account records are imported.

## API

- GET /health
- GET /flights
- POST /auth/register
- POST /auth/login
- POST /auth/logout
- GET /me
- GET /me/bookings
- POST /bookings
- POST /bookings/:id/cancel
- GET /admin/flights
- GET /admin/bookings


## Reusable data platform

Lupin Airlines is the first consumer of this backend, but `lupin-data` is intentionally broader than Airlines.

Reusable business/data logic lives under `services/`, shared storage helpers live under `core/`, and project data lives under `data/`.

For example, the flight service provides `getFlights()`, `getFlight()`, `addFlight()`, `updateFlight()`, and `removeFlight()`. Other projects can receive similarly isolated services later.

The public website does **not** import this private repository directly. It calls the running API over HTTPS. This keeps private code, credentials, and project data on the server side.

See [API.md](API.md) for the service architecture.
