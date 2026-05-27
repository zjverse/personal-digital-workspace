# Personal Digital Workspace

> Vue 3 + Express + SQLite personal bookmark workspace for importing, organizing, searching, and opening browser bookmarks.

一个轻量的个人网址工作台，用来导入浏览器书签，并按原始目录结构展示、搜索和快速打开常用网址。

## Preview

仓库内置一个不包含个人隐私数据的静态预览页：

[simple.html](simple.html)

它展示了最终页面形态：左侧深色菜单、右侧浅色紧凑卡片、常用网址、多选打开和常用排序。

## Features

- 导入 Chrome / Edge / Brave 书签 HTML 文件
- 兼容 Chrome bookmarks JSON 结构
- 严格保留书签文件中的目录层级和排列顺序
- 左侧多级目录菜单
- 首页默认展示“常用网址”
- 星标加入 / 移出常用网址
- 常用网址上移 / 下移排序
- 全局搜索全部网址
- 多选网址并批量打开
- 单个网址点击后在当前页面跳转
- favicon 兜底显示，避免空图标
- SQLite 本地存储

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

Start production server:

```bash
npm run start
```

Open:

```text
http://localhost:4000
```

## Development

Run frontend and backend together:

```bash
npm run dev
```

Default development ports:

- Backend API: `http://localhost:4000`
- Frontend Vite dev server: `http://localhost:5173`

The frontend calls backend APIs through `/api`.

## Bookmark Import Flow

1. Export bookmarks from Chrome, Edge, or Brave.
2. Open the workspace page.
3. Click `导入书签` in the lower-left sidebar.
4. Select `bookmarks.html` or `bookmarks.json`.
5. Click the import button once.

Import rules:

- The full file is imported at once.
- Directory hierarchy is preserved.
- Bookmark order is preserved.
- Existing website data is rebuilt from the imported file.
- “常用网址” is preserved by matching URL hash.
- No smart classification is applied.
- No private bookmark file is committed to the repository.

## Data Model

The SQLite database intentionally keeps only the minimum tables:

- `categories`: bookmark folders and hierarchy
- `websites`: imported website entries
- `favorites`: common website list and order

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

Default production port is `4000`.

To change it for normal local or PM2 usage:

1. Edit `.env`:

```bash
PORT=4000
```

2. If using PM2, also edit [ecosystem.config.cjs](ecosystem.config.cjs):

```js
PORT: 4000
```

3. If using Docker, edit [docker-compose.yml](docker-compose.yml):

```yaml
environment:
  PORT: 4000
```

4. If Nginx proxies to a different internal port, edit [nginx.conf](nginx.conf):

```nginx
proxy_pass http://workspace:4000;
```

For Vite development server changes, edit [frontend/vite.config.ts](frontend/vite.config.ts) or pass a Vite port option.

## Scripts

```bash
npm run dev       # run frontend and backend in development mode
npm run build     # build backend and frontend
npm run start     # start built backend and serve frontend/dist
npm run seed      # import examples/sample-bookmarks.html into SQLite
```

Optional favicon refresh:

```bash
npm --workspace backend run favicons
```

## Docker

Build and run:

```bash
docker compose up -d --build
```

Nginx is included in `docker-compose.yml` and proxies traffic to the workspace service.

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

The repository ignores private/local files by default:

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

The public example file [examples/sample-bookmarks.html](examples/sample-bookmarks.html) is fake sample data only.
