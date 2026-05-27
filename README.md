# Personal Digital Workspace

[English](README.en.md)

> 一个基于 Vue 3 + Express + SQLite 的个人书签工作台，用来导入、整理、搜索和快速打开浏览器书签。

Personal Digital Workspace 是一个轻量的个人网址工作台。它不是后台管理系统，也不是公开导航站，而是把浏览器书签导入后，按照原始目录结构展示，并提供常用网址、全局搜索和多选打开等日常使用功能。

<img width="2966" height="1522" alt="image" src="https://github.com/user-attachments/assets/e6f963ff-00d9-461b-9526-0466a62b8137" />

## 页面预览

仓库内置一个不包含个人隐私数据的静态预览页：

[simple.html](simple.html)

它展示了最终页面形态：左侧深色菜单、右侧浅色紧凑卡片、常用网址、多选打开和常用排序。

## 功能

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

## 技术栈

- 前端：Vue 3、Vite、TypeScript、Pinia、Vue Router、TailwindCSS
- 后端：Node.js、Express、TypeScript、SQLite
- 部署：Docker、docker-compose、PM2、Nginx

## 项目结构

```text
.
├── backend/                  # Express API、SQLite 表结构、书签解析
├── frontend/                 # Vue 单页应用
├── examples/                 # 公开示例书签文件
├── simple.html               # 静态预览页
├── Dockerfile
├── docker-compose.yml
├── ecosystem.config.cjs
├── nginx.conf
├── .env.example
└── README.md
```

本地运行数据默认保存在 `data/` 目录中，该目录不会提交到 Git。

## 快速开始

安装依赖：

```bash
npm install
```

构建前端和后端：

```bash
npm run build
```

启动服务：

```bash
npm run start
```

打开：

```text
http://localhost:4000
```

## 开发运行

```bash
npm run dev
```

本项目最终访问入口统一为：

```text
http://localhost:4000
```

前端请求通过 `/api` 访问后端接口。

## 书签导入流程

1. 从 Chrome、Edge 或 Brave 导出书签文件。
2. 打开工作台页面。
3. 点击左下角的 `导入书签`。
4. 选择 `bookmarks.html` 或 `bookmarks.json`。
5. 点击导入按钮，一次性导入完整文件。

导入规则：

- 一次导入完整文件
- 保留目录层级
- 保留书签顺序
- 重新导入时根据导入文件重建网址数据
- “常用网址”会通过 URL hash 保留
- 不进行智能分类
- 不提交真实个人书签文件

## 数据模型

SQLite 数据库只保留最小表结构：

- `categories`：书签目录和层级
- `websites`：网址入口
- `favorites`：常用网址和排序

最终版本已移除：

- 用户账号
- 登录和退出
- 后台管理
- 网站 CRUD 后台
- 智能分类
- 导入历史
- 快照系统
- 操作历史
- 标签关系表

## 环境变量

复制环境变量示例：

```bash
cp .env.example .env
```

可配置项：

```bash
NODE_ENV=production
PORT=4000
DATABASE_PATH=./data/workspace.sqlite
FRONTEND_ORIGIN=https://workspace.example.com
```

## 修改端口

默认服务端口是 `4000`。

普通本地运行或 PM2 运行时，修改 `.env`：

```bash
PORT=4000
```

如果使用 PM2，同时修改 [ecosystem.config.cjs](ecosystem.config.cjs)：

```js
PORT: 4000
```

如果使用 Docker，修改 [docker-compose.yml](docker-compose.yml)：

```yaml
environment:
  PORT: 4000
```

如果 Nginx 代理到不同内部端口，修改 [nginx.conf](nginx.conf)：

```nginx
proxy_pass http://workspace:4000;
```

## 常用脚本

```bash
npm run dev       # 开发运行
npm run build     # 构建后端和前端
npm run start     # 启动构建后的服务
npm run seed      # 导入 examples/sample-bookmarks.html 示例数据
```

刷新 favicon：

```bash
npm --workspace backend run favicons
```

## Docker

构建并启动：

```bash
docker compose up -d --build
```

`docker-compose.yml` 中包含 Nginx，会把请求代理到 workspace 服务。

## PM2

先构建：

```bash
npm run build
```

启动：

```bash
pm2 start ecosystem.config.cjs
```

## 隐私说明

仓库默认忽略以下本地或隐私文件：

- `.env`
- `data/*.sqlite`
- `bookmarks*.html`
- `bookmarks*.json`
- `local-notes/`
- `docs/`
- 日志文件
- 构建产物
- `node_modules`
- 系统缓存文件

[examples/sample-bookmarks.html](examples/sample-bookmarks.html) 只包含公开示例数据，不包含真实个人书签。
