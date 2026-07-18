# Security

## Credential-free design

Spoken Token does not require API keys, passwords, access tokens, accounts, or
cloud credentials. Do not add real credentials to this repository.

The project ignores common environment files and private-key artifacts as a
defense in depth. If a future integration needs authentication, use documented
local environment variables and provide only a redacted `.env.example`.

## Security boundaries

- Page access is granted through `activeTab` after an explicit user action.
- The extension has no browsing-history, cookie, identity, clipboard,
  microphone, or camera permission.
- Network host permissions are limited to HTTP loopback addresses.
- Endpoint validation rejects non-loopback hosts.
- The bundled speech server binds to `127.0.0.1`.
- Submitted text is never written to logs or persistent storage.
- Request bodies and speech chunks have explicit size limits.

## Reporting a vulnerability

Please use GitHub's private security-advisory feature for sensitive reports.
For non-sensitive hardening suggestions, open a normal issue.

Include the affected version, reproduction steps, expected behavior, and impact.
Do not include private webpage content or credentials in a report.
