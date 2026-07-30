<p align="center">
  <img src="resources/icon.png" width="96px" alt="Linear">
  <h1 align="center">Linear for Linux</h1>
  <p align="center">Unofficial Linux desktop app for <a href="https://linear.app">linear.app</a></p>
</p>

<p align="center">
  <img alt="Latest release" src="https://img.shields.io/github/v/release/rayleigh420/linear-linux?color=%23f5304c">
  <img alt="License" src="https://img.shields.io/github/license/rayleigh420/linear-linux">
</p>

---

## Install

### Option 1 — APT repository (recommended)

One-time setup:

```bash
curl -fsSL https://rayleigh420.github.io/linear-linux/gpg.key \
  | sudo gpg --dearmor -o /etc/apt/keyrings/linear-linux.gpg

echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/linear-linux.gpg] \
https://rayleigh420.github.io/linear-linux ./" \
  | sudo tee /etc/apt/sources.list.d/linear-linux.list

sudo apt update
sudo apt install linear-linux
```

After that, updates arrive automatically via `sudo apt upgrade`.

### Option 2 — Download .deb directly

Download the latest `.deb` from [Releases](https://github.com/rayleigh420/linear-linux/releases/latest) and install:

```bash
sudo apt install ./linear-linux-*-amd64.deb
```

### Option 3 — Nix / NixOS

```bash
nix run github:rayleigh420/linear-linux
```

Or add to your flake inputs and use `packages.x86_64-linux.linear-linux`.

---

## Features

- Multi-tab support (Ctrl+T, Ctrl+W, Ctrl+Tab)
- System tray with hide-on-close (like Slack/Discord)
- Auto-update via `electron-updater` (APT and .deb installs)
- Nix-managed installs show a `nix flake update` reminder instead

---

## Uninstall

```bash
sudo apt remove linear-linux
```

---

## Issues

Report bugs at [Issues](https://github.com/rayleigh420/linear-linux/issues).
