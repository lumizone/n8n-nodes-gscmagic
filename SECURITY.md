# Security Policy

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Email `contact@gscmagic.com` with:

- the affected version,
- reproduction steps,
- expected and observed behavior,
- the potential impact,
- any suggested remediation.

You should receive an acknowledgement within seven days.

## Supported versions

Only the latest published version receives security fixes.

## Security design

- The access token uses an n8n password credential and is sent only as a Bearer header.
- The token is redacted from error messages and never part of node output.
- Authenticated requests refuse redirects and do not forward credentials cross-origin.
- Remote endpoints require HTTPS; plain HTTP is accepted only for loopback hosts.
- The npm package has no runtime dependencies.
- The node does not read environment variables or the filesystem.
- Only read-only GSC Magic operations are exposed. Call Any Tool can call any tool the token may use, so use a read-only token.
