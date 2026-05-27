# Personal Digital Workspace

一个极简个人网址工作台，用来展示、搜索、导入和快速打开浏览器书签。

当前版本是最终收敛后的轻量版本：重点是“网址展示与使用效率”，不是后台管理系统，也不是公开导航站。

## 当前功能

- 按 Chrome / Edge / Brave 导出的书签文件导入网址
- 支持 HTML 书签文件和 Chrome JSON 书签结构
- 严格保留书签目录层级和原始顺序
- 左侧多级目录菜单
- 默认展示“常用网址”
- 星标加入 / 移出常用网址
- 常用网址上移 / 下移排序
- 全局搜索全部网址
- 多选网址并批量打开
- 单个网址点击后在当前页面跳转
- favicon 自动兜底，失败时生成本地图标
- SQLite 本地存储
- Docker、PM2、Nginx 部署配置

## 不包含的功能

这些功能在项目讨论过程中被删除或暂不保留：

- 登录和退出
- 后台管理界面
- 网站增删改查界面
- 智能分类
- 导入记录前台展示
- 数据导出前台展示
- 公开网址导航站能力

项目现在只保留一个面向个人使用的展示页和一个导入入口。

## 技术栈

Frontend:

- Vue 3
- Vite
- TypeScript
- Pinia
- Vue Router
- TailwindCSS

Backend:

- Node.js
- Express
- TypeScript
- SQLite

## 项目结构

```text
.
├── backend/              # Express API、SQLite、书签解析
├── frontend/             # Vue 3 单页应用
├── docs/                 # 项目思路和维护文档
├── examples/             # 可公开的示例书签文件
├── data/                 # 本地数据库，默认不提交
├── Dockerfile
├── docker-compose.yml
├── ecosystem.config.cjs
├── nginx.conf
└── README.md
```

## 本地运行

安装依赖：

```bash
npm install
```

构建并启动：

```bash
npm run build
npm run start
```

访问：

```text
http://localhost:4000
```

开发模式：

```bash
npm run dev
```

## 书签导入

从 Chrome、Edge 或 Brave 导出书签文件，然后在页面左下角点击“导入书签”。

导入规则：

- 一次导入完整文件
- 按书签文件顺序导入
- 保留一级、二级、三级及更深目录
- 重新导入时保留常用网址
- 常用网址按 URL hash 匹配
- 真实书签文件不会提交到 GitHub

## 示例数据

仓库只包含公开示例：

```text
examples/sample-bookmarks.html
```

这个文件只用于演示导入格式，不包含个人真实网址。

## 隐私保护

以下内容默认被 `.gitignore` 排除：

- `.env`
- `data/*.sqlite`
- `bookmarks*.html`
- `bookmarks*.json`
- 日志文件
- 构建产物
- node_modules
- 系统缓存文件

上传 GitHub 前请确保真实书签文件和数据库没有被 `git status` 列为待提交文件。

## 部署

复制环境变量：

```bash
cp .env.example .env
```

Docker:

```bash
docker compose up -d --build
```

PM2:

```bash
npm run build
pm2 start ecosystem.config.cjs
```

## 项目文档

项目思路流程见：

[docs/project-thinking.md](docs/project-thinking.md)
