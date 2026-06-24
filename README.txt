# 🤖 MC AFK Bot — Auth Plugin + Discord Control + Account Rotation

A Minecraft AFK bot for cracked servers with AuthMe/NLogin support. Automatically registers new accounts and logs in returning ones. Controlled via Discord. Switches accounts when kicked (great for hosting providers with auto-kick bugs).

---

## 📁 Project Structure

```
mc-afk-bot/
├── index.js                  # Main entry point
├── usernames.txt             # Your bot usernames (one per line)
├── registered_accounts.json  # Auto-created: tracks which accounts are registered
├── .env                      # Your config (copy from .env.example)
├── package.json
└── src/
    ├── mcBot.js              # Minecraft bot + auth handler + natural behavior
    ├── discordBot.js         # Discord commands
    ├── accountManager.js     # Account rotation
    └── logger.js             # Console logger
```

---

## 🚀 Setup

### 1. Install Node.js
Download from https://nodejs.org (v18+)

### 2. Install dependencies
```bash
cd mc-afk-bot
npm install
```

### 3. Set up your .env
```bash
cp .env.example .env
```
Edit `.env` with your details:
```env
MC_HOST=play.yourserver.com
MC_PORT=25565
MC_VERSION=1.20.1

LOGIN_PASSWORD=BotPass123!   # Used for both /register AND /login

DISCORD_TOKEN=your_token
DISCORD_CHANNEL_ID=your_channel_id
DISCORD_PREFIX=!

AUTO_SWITCH_MINUTES=50       # Switch accounts 50 min in (before host kicks)
RECONNECT_DELAY=5
```

### 4. Add bot usernames
Edit `usernames.txt`:
```
MyBot1
MyBot2
MyBot3
```

### 5. Run it
```bash
npm start
```

---

## 🔐 How Auth Works

The bot handles 3 scenarios automatically:

```
Bot joins server
      │
      ▼
Server says "please register"?
  YES → sends /register <password> <password>
      → marks account as registered
      → sends /login <password>
      │
      ▼
Server says "please login"?
  YES → sends /login <password>
      │
      ▼
Already knows account is registered (saved in registered_accounts.json)?
  YES → auto-sends /login on spawn without waiting for prompt
      │
      ▼
✅ Authenticated → starts natural behavior
```

**All accounts use the same password** (set in `.env` as `LOGIN_PASSWORD`).  
Registration state is saved in `registered_accounts.json` — once an account registers, the bot skips straight to `/login` next time.

### Supported Auth Plugins
- ✅ AuthMe Reloaded
- ✅ NLogin
- ✅ CMI Auth
- ✅ FastLogin
- ✅ Most other `/register` + `/login` style plugins

---

## 💬 Discord Commands

| Command | What it does |
|---|---|
| `!start` | Connect bot to Minecraft server |
| `!stop` | Disconnect and stop |
| `!switch` | Manually switch to next account |
| `!status` | Current account, stats, all account info |
| `!accounts` | List accounts with kick/session counts |
| `!say <msg>` | Send chat message in-game |
| `!move <dir>` | Move bot: `forward` `back` `left` `right` `jump` |
| `!chop` | Find & chop nearest tree |
| `!pos` | Show bot XYZ position |
| `!health` | Show health and food level |
| `!help` | Show all commands |

---

## 🧠 Natural Behavior

Bot randomly does these between every 8–25 seconds:

| Behavior | Weight |
|---|---|
| 🚶 Random walk (up to 8 blocks) | High |
| 👀 Look around (1–3 head turns) | High |
| 🦘 Jump (sometimes with forward) | Medium |
| 🤫 Sneak (1–3.5 seconds) | Medium |
| 💪 Swing arm | Medium |
| 🎒 Open inventory | Low |
| 😴 Stand idle | Low |

---

## ⚙️ Account Rotation Flow

```
[Account joins] → [Auto register if new] → [Auto login] → [Behaves naturally]
       ↓
[Hosting bug kicks after X mins]  OR  [Pre-emptive switch via AUTO_SWITCH_MINUTES]
       ↓
[Next account in usernames.txt joins immediately]
       ↓
[If already registered → /login only]
[If new account → /register then /login]
       ↓
[Cycle repeats]
```

---

## 🔧 Troubleshooting

**Bot not registering/logging in:**
- Watch the console — it prints every auth step
- Make sure `LOGIN_PASSWORD` in `.env` matches what you want for all accounts
- Delete `registered_accounts.json` to force re-registration of all accounts

**Wrong MC version:**
- Change `MC_VERSION` in `.env` to match your server (e.g. `1.19.4`, `1.18.2`)

**Discord bot not responding:**
- Enable **Message Content Intent** in Discord Developer Portal → Your App → Bot
- Check `DISCORD_CHANNEL_ID` is the right channel

**Bot gets stuck after joining:**
- Check console for the exact chat messages the server sends
- The auth trigger list covers most plugins but you can add custom ones in `src/mcBot.js`
