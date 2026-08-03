# Dynasty Discord Bot

A Discord bot for running an **EA College Football dynasty league**. It tracks team assignments, weekly matchups, advance deadlines, and helps players schedule games across timezones.

## Features

- **Team assignments** — link Discord users to dynasty teams
- **Weekly schedule** — add and view matchups by week (including Week 0)
- **Week advance** — notify players of their matchups via DM and post to a schedule channel
- **Deadlines** — 48h for user-vs-user games, 24h for user-vs-CPU
- **Availability & scheduling** — share free windows, find overlaps, propose/accept kickoff times
- **Admin gating** — commissioner-only commands via Discord user IDs or role name

## Stack

- Node.js + TypeScript
- [discord.js](https://discord.js.org/) v14
- SQLite ([better-sqlite3](https://github.com/WiseLibs/better-sqlite3))
- Designed for local use or deploy on [Railway](https://railway.app)

## Setup

### 1. Prerequisites

- Node.js 20+
- A Discord application/bot ([Discord Developer Portal](https://discord.com/developers/applications))
- Bot invited to your server with permission to use slash commands and send messages

### 2. Install

```bash
npm install
cp .env.example .env
```

### 3. Configure `.env`

| Variable | Description |
|----------|-------------|
| `DISCORD_TOKEN` | Bot token from the Discord Developer Portal |
| `CLIENT_ID` | Application (client) ID |
| `GUILD_ID` | Your Discord server ID |
| `SCHEDULE_CHANNEL_ID` | Channel ID for weekly schedule posts |
| `ADMIN_USER_IDS` | Comma-separated Discord user IDs with admin access |
| `COMMISSIONER_ROLE_NAME` | Role name that also grants admin access (default: `Commissioner`) |

### 4. Register slash commands

```bash
npm run deploy-commands
```

Run this again whenever you add or change slash command definitions.

### 5. Run

```bash
# Development (auto-reload)
npm run dev

# Production
npm run build
npm start
```

Data is stored in `data/dynasty.db` (created automatically).

## Commands

### Everyone

| Command | Description |
|---------|-------------|
| `/team list` | Show teams assigned to Discord users |
| `/schedule week [week]` | Show matchups for a week (defaults to current) |
| `/week current` | Show the current dynasty week |
| `/week next` | Show the next week-advance deadline |
| `/availability timezone set` | Set your timezone |
| `/availability timezone show` | Show your saved timezone |
| `/availability add` | Add a free window for the current week |
| `/availability list` | List your free windows |
| `/availability clear` | Clear your free windows for the week |
| `/availability compare user:@Opponent` | Find overlapping free time |
| `/availability propose user:@Opponent` | Propose a kickoff time |
| `/availability accept` / `decline` | Respond to a proposal (or use Accept/Decline buttons) |
| `/availability locked` | Show the locked game time for your matchup |

### Commissioners / admins

| Command | Description |
|---------|-------------|
| `/team assign` | Link a Discord user to a team |
| `/team unassign` | Remove a user from a team |
| `/schedule add` | Add a matchup for a week |
| `/week start-season` | Kick off Week 0 — notify players and post schedule without advancing |
| `/week advance` | Advance to the next week, DM players, and post to the schedule channel |
| `/week set` | Manually set the current week (supports Week 0) |

## Typical season flow

1. Assign players: `/team assign user:@Player name:Georgia`
2. Add Week 0 matchups: `/schedule add week:0 home:... away:...`
3. Start the season: `/week start-season`
4. Players set timezones and coordinate with `/availability ...`
5. After Week 0: `/week advance` → Week 1, and so on
6. Check progress anytime with `/week current`, `/week next`, or `/schedule week`

## Deadlines

When a week starts (`/week start-season` or `/week advance`):

- **User vs user** → 48 hours to play
- **User vs CPU** → 24 hours to play

Deadlines appear in DMs and on the schedule channel embed. Players can check remaining time with `/week next`.

## Deploying on Railway

1. Push this repo to GitHub and create a Railway project from it.
2. Set the same environment variables as in `.env`.
3. Attach a **volume** at `/app/data` so SQLite persists across deploys.
4. Build command: `npm run build` · Start command: `npm start`
5. After deploy (and after any command changes), register slash commands:

```bash
npm run deploy-commands
```

Railway auto-deploys on push to `main` when the GitHub repo is connected. Use the service **Console** tab for one-off DB checks if needed.

## Project structure

```
src/
  commands/     Slash command handlers
  services/     Database, notifications, availability
  handlers/     Button interactions (proposal accept/decline)
  utils/        Formatting, deadlines, timezones, admin checks
  constants/    Timezone choices
  deploy-commands.ts
  index.ts
data/
  dynasty.db    SQLite database (gitignored)
```

## License

Private — for league use.
