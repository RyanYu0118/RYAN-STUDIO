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
    }
};