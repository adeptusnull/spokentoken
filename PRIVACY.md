# Spoken Token privacy

Spoken Token is designed to keep reading activity on the computer where it is
installed.

## Data flow

After you click the extension, Spoken Token extracts readable text, the page
title, and the page hostname from the active tab. It sends short text chunks to
the configured speech endpoint on your computer and plays the returned audio.

The included macOS server and optional Kokoro container both listen only on
`127.0.0.1`. They are not reachable from other devices on the network.

## Data not collected

Spoken Token does not request, collect, or transmit:

- browsing history;
- cookies or authentication state;
- passwords or form values;
- clipboard contents;
- identity or location;
- camera or microphone data;
- analytics or telemetry;
- advertising identifiers;
- cloud API keys or access tokens.

## Local storage

The extension stores only local preferences such as voice, reading speed,
speech endpoint, and chunk length. Temporary playback state is stored in the
browser session and is cleared when that session ends.

## Network boundary

The extension manifest grants network access only to
`http://localhost/*` and `http://127.0.0.1/*`. Its settings validation also
rejects any endpoint whose hostname is not `localhost`, `127.0.0.1`, or the IPv6
loopback address `::1`.

Spoken Token has no code path for sending page text to a remote host.
