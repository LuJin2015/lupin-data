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
