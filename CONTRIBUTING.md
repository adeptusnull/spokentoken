# Contributing to Spoken Token

Spoken Token accepts contributions through fork-based pull requests. Public
access to the repository does not grant push access to the upstream project.

## Proposing a change

1. Fork the repository.
2. Create a focused branch in your fork.
3. Make the smallest change needed.
4. Run the project checks.
5. Open a pull request against `adeptusnull/spokentoken`.

```sh
npm run check
npm test
python3 -m py_compile local_server.py
docker compose config
```

The protected `main` branch accepts changes only through pull requests whose
required checks pass. Pull requests may be closed if they introduce unrelated
changes, generated files, obfuscated code, unnecessary browser permissions,
remote telemetry, credential handling, or unreviewed executable dependencies.

## Security reports

Do not disclose a vulnerability in a public issue. Follow
[SECURITY.md](SECURITY.md) and use a private GitHub security advisory.

## Privacy expectations

Changes must preserve the project's local-first design:

- webpage text stays on the user's computer;
- browser access is granted only after an explicit user action;
- speech endpoints remain restricted to loopback addresses;
- no analytics, advertising, telemetry, or remote logging;
- no API keys or accounts are required.
