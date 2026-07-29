# RYAN-STUDIO

本地 **1Panel / Halo** 部署与 Wiki 前端资源备份（从 `1panel_data` 工作区同步）。

## 目录说明

| 路径 | 说明 |
|------|------|
| `1panel/apps/halo/halo/docker-compose.yml` | Halo 2.x + MySQL 8.4 编排 |
| `1panel/apps/halo/halo/mysql/conf/` | MySQL 配置 |
| `1panel/apps/halo/halo/data/attachments/upload/wiki-data/` | Wiki 站点脚本与样式（rs-loader、fronts.css 等） |

## 本地启动

```bash
cd 1panel/apps/halo/halo
cp .env.example .env   # 填入真实密码与库名
docker compose up -d
```

站点默认：`http://localhost:8090`（以 `.env` 中 `HALO_EXTERNAL_URL` 为准）。

## 未纳入版本库的内容

见根目录 `.gitignore`：MySQL 数据卷、`.env` 密码、Halo 日志/插件/主题包、除 `wiki-data` 外的上传附件等。
