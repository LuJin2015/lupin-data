# Lupin Data API

`lupin-data` is a reusable backend/data service. Lupin Airlines is currently its first client.

## Design

Projects call the API instead of reading another project's private repository directly.

- `/flights` — public flight catalogue
- `/auth/*` — account/session services
- `/bookings/*` — Airlines booking service
- `/admin/*` — protected management endpoints

Future projects can add their own service under `services/` without turning the whole repository into an Airlines-specific codebase.

## Data service pattern

Each service exposes reusable functions. For example:

```js
const {flights}=require('./services');

flights.getFlights();
flights.getFlight('LP 001');
flights.addFlight({
  flight:'LP 008',
  destination:'Somewhere New',
  gate:'N',
  departure:'18:00',
  price:'S$808'
});
```

The HTTP API exposes approved operations from those services to authorized clients.

## Security boundary

Client websites must never import private server files directly or receive database credentials. They communicate with the running API over HTTPS.

Keep project-specific data isolated and add authentication/authorization before exposing a new service.
