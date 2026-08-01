/* =======================================================
   1. RSConfig - 全局配置模块 (RYAN STUDIO)
   ======================================================= */
window.RSConfig = {
    // 🔧 基础资源路径
    urls: {
        quotes: "/upload/wiki-data/quotes.json",
        video: "/upload/1000b.mp4",
        icon: "/upload/Icon.png",
        map: "http://localhost:8100/#world:0:79:0:296:0:0:0:0:perspective"
    },

    // 📏 侧边栏滚动定位参数
    sidebar: {
        startTop: 680,
        fixedTop: 80
    },

    // 📍 锚点 / 目录跳转（配合 theme-fluid tocbot，统一顶栏偏移）
    // 偏移量 = 顶栏高度（默认 80）+ extraGap（默认 8）→ 约 88px
    anchorScroll: {
        navFallback: 80,
        extraGap: 8,
        loadRetryMs: [0, 120, 400, 800, 1500, 3000, 5000]
    },

    // 🎯 前台快速编辑 → 后台编辑器滚动定位（偏移与 anchorScroll 一致）
    editScroll: {
        retryMs: [0, 200, 500, 1000, 1800, 3000, 5000, 8000, 12000],
        archiveRetryMs: [0, 120, 400, 800, 1500, 3000, 5000, 8000, 12000],
        maxAgeMs: 600000,
        /** 后台编辑页：目标行距编辑器可视区顶部的间距（不用前台顶栏偏移） */
        editorTopPadding: 12
    },

    // 📖 Wiki 侧边栏（rs-loader：文章含 sidebarTags 任一标签时加载 rs-wiki.js）
    wiki: {
        // 顶栏全屏背景视频（/upload/1000b.mp4）；false = 用文章/主题自带封面图
        enableBannerVideo: false,
        /** Halo 标签 metadata.name；displayName = Minecraft服务器 */
        sidebarTags: ["tag-sqmsuywx"]
    },

    // 🔴 MediaWiki 风格红链（见 rs-redlinks.js）
    redlinks: {
        enabled: true,
        slugIndex: "/upload/wiki-data/wiki-slugs.json",
        pathPrefix: "/archives/",
        cacheMs: 900000,
        createOnClick: true,
        /** true = 普通点击也不弹确认；Shift+点击 始终跳过确认 */
        skipConfirm: false,
        publishFirst: true,
        /** 红链新建 spec.slug = 文章标题（trim；/ → _） */
        slugPrefix: "",
        slugFromTitle: true,
        slugFromPostName: false,
        defaultCategory: "category-f8bm8yzr",
        minecraftCategory: "category-1g9f80go",
        /** 无来源页可继承时，红链新建默认标签（Minecraft服务器） */
        defaultTags: ["tag-sqmsuywx"],
        postOwner: "ryanyu"
    },

    // ✏️ 后台编辑器 Wiki 内链（见 rs-console-wikilink.js）
    wikilink: {
        enabled: false,
        slugIndex: "/upload/wiki-data/wiki-slugs.json",
        pathPrefix: "/archives/",
        // 悬浮 UI：false = 仅用 Ctrl+Shift+K / 工具栏书本图标（插件版）；Ctrl+K 留给 Halo 原生链接
        showCornerButton: false,
        showSelectionBubble: false
    },

    // 📦 hybrid-edit-block：HTML 编辑块（RS_WikiLink 插件 v1.1.4+ 内置；enabled:false 仅关闭注入脚本）
    htmlBlockCompact: {
        enabled: false,
        labelRe: null,
        types: ["html_edited"],
        // 后台预览注入与前台相同的字体/工具类（fronts.css）
        previewStyles: ["/upload/wiki-data/fronts.css"],
        previewDocClass: "my-wiki-page markdown-body",
        previewSandbox: "allow-scripts allow-same-origin",
        // 预览 iframe 内右键默认弹出块菜单；实体需自定义右键时加 data-rs-contextmenu="custom"
        // 打开编辑器时从 draft/content-json 自动修复被截断的 HTML 块
        autoRepairFromServer: true,
        repairMinDiff: 64,
        showRepairButton: true,
        repairSnippets: {
            "wd-smart-card": "/upload/wiki-data/snippets/wander-card-block.snippet.html"
        }
    }
};