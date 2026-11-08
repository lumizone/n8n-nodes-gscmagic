# Changelog

All notable changes to this project will be documented in this file.

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
