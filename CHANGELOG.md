# Changelog

All notable changes to this project will be documented in this file.

## 0.1.2 - 2026-11-08

### Fixed

- n8n verification lint findings: category (`Marketing & Content`), themed icon (light and dark), `httpRequest` in the credential test (with a `fetch` fallback because n8n's credential-test context only offers the legacy helper), n8n error classes (`NodeApiError`) instead of custom errors, removed `overrides`.

### Changed

- `npm run lint:scan` (part of `npm run verify`) runs the n8n scanner's exact ESLint gate on the source and the packed tarball.

## 0.1.1 - 2026-11-08

### Changed

- First release published from GitHub Actions with npm provenance (staged publishing).
- README links to the npm package and the source repository.

### Fixed

- The weekly traffic-drops example escapes page URLs before putting them into the e-mail HTML.

## 0.1.0 - 2026-11-08

### Added

- GSC Magic API credential (access token and endpoint) with a credential test that lists the available tools.
- GSC Magic node with the operations List Sites, Search Analytics, Traffic Drops, Quick Wins, Content Decay, Index Health, Inspect URL and Call Any Tool. All are read-only.
- Site picker backed by Search Console, with manual entry.
- Include Chart option that returns the PNG chart as binary data.
- Split Into Items option for list-like results.
- Friendly error for rejected tokens, pass-through of server errors and plan limits, Continue On Fail support.
- Usable as an AI tool in n8n agents.
- Example workflows and unit tests.
