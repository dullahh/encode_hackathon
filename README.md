# CareRelay

**Source-grounded clinical handovers that move safely with the patient.**

CareRelay turns fragmented care-event data into a concise, traceable clinician handover. Every generated claim links back to its source event, uncertainty is surfaced rather than guessed, and confirmed handovers can be shared through an expiring, revocable, read-only QR code.

> **Hackathon prototype:** CareRelay uses fixed synthetic patient data only. It does not provide diagnosis, triage, or treatment recommendations.

## The problem

Critical patient context is often scattered across systems, organisations, and care settings. Clinicians can lose time reconstructing what happened, while incomplete or ambiguous handovers increase the risk of duplicated work and missed information.

CareRelay demonstrates a safer way to centralise and transfer that context without pretending AI knows more than the underlying record.

## What it demonstrates

- Structured handovers generated from fragmented care events
- Claim-level traceability through `sourceEventIds`
- Explicit `unresolved` items when the evidence is incomplete
- Mandatory carer confirmation before sharing
- Temporary, expiring, and revocable QR handovers
- Mobile-friendly, read-only access for the receiving clinician
- Persistence across refreshes without exposing raw access tokens
- A fixed synthetic patient journey for safe demonstration

## Demo journey

1. Review the synthetic patient’s distributed care history.
2. Generate a structured, source-grounded handover.
3. Inspect unresolved information and supporting events.
4. Confirm the handover as the responsible carer.
5. Create a temporary QR share.
6. Open the read-only handover on another device.
7. Revoke access when the transfer is complete.

## Safety by design

CareRelay is designed around evidence boundaries:

- Generated statements must reference recorded source events.
- Unsupported facts must not be presented as established truth.
- Ambiguity is displayed explicitly under `unresolved`.
- Sharing requires deliberate human confirmation.
- Only a cryptographic token hash is persisted—not the raw share token.
- No real patient data is included in this repository.

The frozen prototype contract is documented in
[`docs/p0-contract.md`](docs/p0-contract.md), with canonical TypeScript
interfaces in [`src/types/care.ts`](src/types/care.ts).

## Physical QR checkpoint

The complete sharing flow was tested across two physical devices on the same
network. A phone scanned an expiring QR code and successfully opened the
mobile-friendly handover for the fixed synthetic Maya case.

## Run locally

```bash
npm install
npm run dev
