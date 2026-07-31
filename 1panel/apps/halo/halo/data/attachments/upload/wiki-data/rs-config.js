/* =======================================================
   1. RSConfig - 全局配置模块 (Ryan Studio)
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
    anchorScroll: {
        extraGap: 8,
        loadRetryMs: [0, 120, 400, 800, 1500, 3000, 5000]
    },

    // 📖 Wiki 页（rs-loader 根据 urlIncludes 加载 rs-wiki.js）
    wiki: {
        // 顶栏全屏背景视频（/upload/1000b.mp4）；false = 用文章/主题自带封面图
        enableBannerVideo: false,
        urlIncludes: ["wwswiki", "mcwws"]
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
        /** 红链新建 spec.slug：mcwws_ + 链接目标英文路径（player/rules → mcwws_player_rules） */
        slugPrefix: "mcwws_",
        slugFromTitle: true,
        slugFromPostName: false,
        defaultCategory: "category-f8bm8yzr",
        minecraftCategory: "category-1g9f80go",
        postOwner: "ryanyu"
    },

    // ✏️ 后台编辑器 Wiki 内链（见 rs-console-wikilink.js）
    wikilink: {
        enabled: true,
        slugIndex: "/upload/wiki-data/wiki-slugs.json",
        pathPrefix: "/archives/",
        // 悬浮 UI：false = 仅用 Ctrl+K / 工具栏链环
        showCornerButton: false,
        showSelectionBubble: false
    },

    // 📦 hybrid-edit-block：HTML 编辑块全屏编辑（见 rs-console-html-block-compact.js）
    htmlBlockCompact: {
        enabled: true,
        labelRe: null,
        types: ["html_edited"],
        // 后台预览注入与前台相同的字体/工具类（fronts.css）
        previewStyles: ["/upload/wiki-data/fronts.css"],
        previewDocClass: "my-wiki-page markdown-body",
        previewSandbox: "allow-scripts allow-same-origin",
        // 打开编辑器时从 draft/content-json 自动修复被截断的 HTML 块
        autoRepairFromServer: true,
        repairMinDiff: 64,
        showRepairButton: true,
        repairSnippets: {
            "wd-smart-card": "/upload/wiki-data/snippets/wander-card-block.snippet.html"
        }
    }
};