# CareRelay P0

CareRelay is a synthetic-data-only clinician handover prototype. It never provides diagnosis, triage, or treatment recommendations.

## P0 contract freeze

The canonical P0 patient, care events, JSON schema, database schema, routes, and TypeScript interfaces are frozen in `docs/p0-contract.md` and `src/types/care.ts`. Generated handovers must only make claims linked to `sourceEventIds`; uncertain facts belong in `unresolved`; sharing requires an explicit carer confirmation.

## Local run

```bash
npm install
npm run dev
```

Use `npm run lint` and `npm run typecheck` for verification.
