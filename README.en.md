# Personal Digital Workspace

[中文](README.md)

> A Vue 3 + Express + SQLite personal bookmark workspace for importing, organizing, searching, and opening browser bookmarks.

Personal Digital Workspace is a lightweight personal URL workspace. It is not an admin system or a public navigation site. It imports browser bookmarks, preserves the original folder structure, and provides common links, global search, and multi-select opening for daily use.

<img width="2966" height="1522" alt="image" src="https://github.com/user-attachments/assets/e6f963ff-00d9-461b-9526-0466a62b8137" />

## Preview

The repository includes a static preview page with public sample content:

[simple.html](simple.html)

It shows the final UI style: dark sidebar, light compact cards, common links, multi-select opening, and common-link ordering.

## Features

- Import Chrome / Edge / Brave bookmark HTML files
- Support Chrome bookmarks JSON structure
- Preserve bookmark folder hierarchy and original order
- Multi-level sidebar menu
- Default homepage view for common links
- Add / remove common links
- Move common links up or down
- Global search across all websites
- Select multiple websites and open them in batch
- Open a single website in the current page
- Favicon fallback to avoid empty icons
- Local SQLite storage

## Tech Stack

- Frontend: Vue 3, Vite, TypeScript, Pinia, Vue Router, TailwindCSS
- Backend: Node.js, Express, TypeScript, SQLite
- Deploy: Docker, docker-compose, PM2, Nginx

## Project Structure

```text
.
├── backend/                  # Express API, SQLite schema, bookmark parser
├── frontend/                 # Vue single-page app
├── examples/                 # Public sample bookmark file
├── simple.html               # Static preview page
├── Dockerfile
├── docker-compose.yml
├── ecosystem.config.cjs
├── nginx.conf
├── .env.example
└── README.md
```

Local runtime data is stored in `data/` by default. It is ignored by Git.

## Quick Start

Install dependencies:

```bash
npm install
```

Build frontend and backend:

```bash
npm run build
```

Start the server:

```bash
npm run start
```

Open:

```text
http://localhost:4000
```

## Development

```bash
npm run dev
```

The final app entry is:

```text
http://localhost:4000
```

The frontend calls backend APIs through `/api`.

## Bookmark Import Flow

1. Export bookmarks from Chrome, Edge, or Brave.
2. Open the workspace page.
3. Click `导入书签` in the lower-left sidebar.
4. Select `bookmarks.html` or `bookmarks.json`.
5. Click the import button once to import the full file.

Import rules:

- The full file is imported at once.
- Folder hierarchy is preserved.
- Bookmark order is preserved.
- Website data is rebuilt from the imported file.
- Common links are preserved by URL hash.
- No smart classification is applied.
- No private bookmark file is committed to the repository.

## Data Model

The SQLite database keeps only the minimum tables:

- `categories`: bookmark folders and hierarchy
- `websites`: imported website entries
- `favorites`: common links and ordering

Removed from the final version:

- user accounts
- login and logout
- admin panel
- website CRUD panel
- smart classification
- import history
- snapshots
- operation history
- tag relationship tables

## Environment Variables

Copy the example file:

```bash
cp .env.example .env
```

Available variables:

```bash
NODE_ENV=production
PORT=4000
DATABASE_PATH=./data/workspace.sqlite
FRONTEND_ORIGIN=https://workspace.example.com
```

## Changing Ports

The default service port is `4000`.

For normal local or PM2 usage, edit `.env`:

```bash
PORT=4000
```

If using PM2, also edit [ecosystem.config.cjs](ecosystem.config.cjs):

```js
PORT: 4000
```

If using Docker, edit [docker-compose.yml](docker-compose.yml):

```yaml
environment:
  PORT: 4000
```

If Nginx proxies to a different internal port, edit [nginx.conf](nginx.conf):

```nginx
proxy_pass http://workspace:4000;
```

## Scripts

```bash
npm run dev       # run in development mode
npm run build     # build backend and frontend
npm run start     # start the built server
npm run seed      # import examples/sample-bookmarks.html sample data
```

Refresh favicons:

```bash
npm --workspace backend run favicons
```

## Docker

Build and run:

```bash
docker compose up -d --build
```

`docker-compose.yml` includes Nginx and proxies requests to the workspace service.

## PM2

Build first:

```bash
npm run build
```

Start:

```bash
pm2 start ecosystem.config.cjs
```

## Privacy

The repository ignores private or local files by default:

- `.env`
- `data/*.sqlite`
- `bookmarks*.html`
- `bookmarks*.json`
- `local-notes/`
- `docs/`
- logs
- build output
- `node_modules`
- system cache files

[examples/sample-bookmarks.html](examples/sample-bookmarks.html) contains fake sample data only. It does not include real personal bookmarks.
