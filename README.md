# omp-antigravity-guard

An [Oh My Pi](https://github.com/can1357/oh-my-pi) plugin that prevents Google Antigravity synthetic `429` (Quota Exhausted) errors.

## Problem

Antigravity reverse proxies contain a heuristic rule that triggers a synthetic `429 Too Many Requests` (`You have exhausted your capacity on this model. Your quota will reset after...`) whenever the prompt contains the verbatim XML tag `<system-conventions>`.

## Solution

This plugin intercepts `before_agent_start` in Oh My Pi and replaces `<system-conventions>` with `<system-conventions id="<random-nonce>">`. The model receives the exact same instructions and structure, but the proxy's literal string match is bypassed.

## Installation

Run in your terminal:

```bash
omp plugin install github:vasyza/omp-antigravity-guard
```

Or using the full Git URL:

```bash
omp plugin install https://github.com/vasyza/omp-antigravity-guard.git
```

## Management

Check status:
```bash
omp plugin list
```

Update to latest version:
```bash
omp plugin upgrade omp-antigravity-guard
```

Uninstall:
```bash
omp plugin uninstall omp-antigravity-guard
```

## License

MIT
