# BLUE_XMD

<div align="center">
  <a href="https://git.io/typing-svg">
    <img src="https://readme-typing-svg.demolab.com?font=Jersey+20+Charted&size=88&pause=1000&color=1E90FF&center=true&width=1100&height=140&lines=BLUE_XMD;WhatsApp+Bot;Developed+by+LUNARIS" alt="BLUE_XMD title" />
  </a>
</div>

<div align="center">
  <img src="https://img.shields.io/badge/Project-BLUE_XMD-1E90FF?style=for-the-badge" alt="Project BLUE_XMD" />
  <img src="https://img.shields.io/github/stars/LUNARIS-CORP/BLUE_XMD?style=for-the-badge" alt="GitHub stars" />
  <img src="https://img.shields.io/github/forks/LUNARIS-CORP/BLUE_XMD?style=for-the-badge" alt="GitHub forks" />
  <img src="https://img.shields.io/github/watchers/LUNARIS-CORP/BLUE_XMD?style=for-the-badge" alt="GitHub watchers" />
</div>

<div align="center">
  <a href="https://t.me/LUNARISCORP">
    <img src="https://img.shields.io/badge/Telegram-Join%20Channel-0088CC?style=for-the-badge&logo=telegram" alt="Telegram" />
  </a>
  <a href="https://whatsapp.com/channel/0029VbD9z1YJf05TqVGLNo3c">
    <img src="https://img.shields.io/badge/WhatsApp-Join%20Channel-25D366?style=for-the-badge&logo=whatsapp" alt="WhatsApp" />
  </a>
</div>

A WhatsApp bot project built for group management, automation, moderation, and practical daily use.

BLUE_XMD is designed to be flexible, lightweight, and easy to customize. It uses the Baileys library to connect to WhatsApp and supports automated workflows through commands and bot logic.

<div align="center">
  <img src="assets/bot_image.jpg" alt="BLUE_XMD banner" width="520" />
</div>

## Developed by

This project is developed and maintained by LUNARIS.

## Features

- Group management tools
- Admin controls and moderation
- Tag and mention features
- Fun and entertainment commands
- Sticker and media utilities
- Automation for WhatsApp workflows

## Project structure

- `commands/` — command handlers
- `lib/` — reusable bot logic and helpers
- `data/` — configuration and persistent data
- `assets/` — local media files used by the bot
- `main.js` — bot entry point

## Requirements

- Node.js 18+
- npm
- Git
- A WhatsApp account for connection

## Installation

### Recommended environment

Use a desktop or VPS for the most stable setup:

```bash
git clone https://github.com/LUNARIS-CORP/BLUE_XMD.git
cd BLUE_XMD
npm install
node index.js
```

### Termux (Android)

On Android/Termux, `sqlite3` is the dependency that usually breaks the install. Remove it before installing the project dependencies:

```bash
pkg update && pkg upgrade -y
pkg install git nodejs-lts python build-essential clang make -y
cd ~/BLUE_XMD
npm uninstall sqlite3
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
node index.js
```

> Note: the best environment for this project is still a desktop Linux, Windows, or VPS. Termux can work for testing, but native dependencies like `sqlite3` are often unstable on Android.

## Run the bot

```bash
node index.js
```

Then scan the QR code displayed in the terminal using WhatsApp Linked Devices.

## Usage

Use commands in your WhatsApp groups or chats depending on the configured bot features.

## License

This project is licensed under the MIT License.

## Important note

This bot is an independent and unofficial WhatsApp project. It is intended for learning, experimentation, and personal development. Use it responsibly and in compliance with WhatsApp policies.
