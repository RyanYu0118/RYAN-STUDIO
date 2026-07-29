# RYAN-STUDIO

Ryan 的工作室仓库：含简单静态页与本地 **1Panel / Halo** 部署备份。

## 静态页

根目录 `index.html` 为早期测试页，可按需替换或挂 GitHub Pages。

## Wiki 文章源（Markdown）

| 路径 | 说明 |
|------|------|
| `wiki/**/*.md` | 玩家 / 开发者 Wiki 正文（Git 为源，Halo 为发布端） |
| `wiki/_halo/` | Halo 粘贴用 HTML/CSS/JS 片段 |
| `tools/mcwws-halo-preview/` | 编译、导出 JSON、推 Halo（API / 本地 MySQL） |

在 `wiki/` 目录下配置 `cp .halo.env.example .halo.env` 后可用 `推送到Halo.ps1`；无 PAT 时可用 `publish-via-mysql.py`（需本机 `halo-mysql` 容器）。

## Halo / Wiki 站点资源

| 路径 | 说明 |
|------|------|
| `1panel/apps/halo/halo/docker-compose.yml` | Halo 2.x + MySQL 8.4 编排 |
| `1panel/apps/halo/halo/mysql/conf/` | MySQL 配置 |
| `1panel/apps/halo/halo/data/attachments/upload/wiki-data/` | Wiki 脚本与样式（rs-loader、fronts.css、字体等） |

### 本地启动

```bash
cd 1panel/apps/halo/halo
cp .env.example .env   # 填入真实密码与库名
docker compose up -d
```

站点默认：`http://localhost:8090`（以 `.env` 中 `HALO_EXTERNAL_URL` 为准）。

### 未纳入版本库

见根目录 `.gitignore`：MySQL 数据卷、`.env` 密码、Halo 数据库/索引/密钥、备份包、日志/插件/主题、上传缩略图等。
