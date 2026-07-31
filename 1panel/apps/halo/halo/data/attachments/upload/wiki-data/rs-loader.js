/* =======================================================
   4. RSLoader - 核心调度器 (V109.0 集成锚点偏移 + 快速编辑)
   ======================================================= */
(function() {
    console.log("🚀 RS Loader: 初始化中...");

    if (location.pathname.indexOf("/console") === 0) {
        function loadConsoleScript(url, cb) {
            var s = document.createElement("script");
            s.src = url;
            s.async = false;
            s.onload = function () { if (cb) cb(); };
            s.onerror = function () { console.error("❌ 控制台脚本加载失败:", url); if (cb) cb(); };
            document.head.appendChild(s);
        }
        function isEditorPath() {
            return location.pathname.indexOf("/console/posts/editor") >= 0;
        }
        function bootConsoleWiki() {
            function afterWiki() {
                if (window.RSWikiLink && window.RSWikiLink.init) window.RSWikiLink.init();
                if (window.RSHtmlBlockCompact && window.RSHtmlBlockCompact.init) {
                    window.RSHtmlBlockCompact.init();
                }
                if (window.RSEditScroll && window.RSEditScroll.tryApply) {
                    [600, 1500, 3500].forEach(function (ms) {
                        setTimeout(window.RSEditScroll.tryApply, ms);
                    });
                }
            }
            var WIKI_VER = "2.6";
            var HTML_VER = "3.4.2";
            var EDIT_SCROLL_VER = "1.1.1";
            var PUBLISH_VER = "1.3";
            var ARCHIVE_SCROLL_VER = "1.0.1";
            var scriptsLoaded = window.__rsConsoleScriptsLoaded;
            var wikiVer = window.RSWikiLink && window.RSWikiLink.__ver;
            var htmlVer = window.RSHtmlBlockCompact && window.RSHtmlBlockCompact.__ver;
            var editScrollVer = window.RSEditScroll && window.RSEditScroll.__ver;
            var publishVer = window.RSPublishRedirect && window.RSPublishRedirect.__ver;
            if (
                scriptsLoaded &&
                wikiVer === WIKI_VER &&
                htmlVer === HTML_VER &&
                editScrollVer === EDIT_SCROLL_VER &&
                publishVer === PUBLISH_VER
            ) {
                afterWiki();
                return;
            }
            window.__rsConsoleScriptsLoaded = true;
            loadConsoleScript("/upload/wiki-data/rs-config.js?v=3", function () {
                loadConsoleScript("/upload/wiki-data/rs-console-publish-redirect.js?v=1.3");
                loadConsoleScript("/upload/wiki-data/rs-console-edit-scroll.js?v=1.1.1");
                loadConsoleScript("/upload/wiki-data/rs-console-html-block-compact.js?v=3.4.2");
                loadConsoleScript("/upload/wiki-data/rs-console-wikilink.js?v=" + WIKI_VER, afterWiki);
            });
        }
        bootConsoleWiki();
        var lastRoute = location.pathname + location.search;
        setInterval(function () {
            var now = location.pathname + location.search;
            if (now === lastRoute) return;
            lastRoute = now;
            if (isEditorPath()) bootConsoleWiki();
        }, 800);
        return;
    }

    const SCRIPTS = {
        config: "/upload/wiki-data/rs-config.js",
        anchor: "/upload/wiki-data/rs-anchor-scroll.js?v=1.0",
        home:   "/upload/wiki-data/rs-home.js",
        wiki:   "/upload/wiki-data/rs-wiki.js",
        redlinks: "/upload/wiki-data/rs-redlinks.js?v=3.5"
    };

    function loadScript(url, callback) {
        var script = document.createElement('script');
        script.type = 'text/javascript';
        script.src = url;
        script.onload = callback;
        script.onerror = function() { console.error("❌ 加载失败:", url); };
        document.body.appendChild(script);
    }

    // ✨ 快速编辑按钮：记录前台浏览位置，供后台编辑器定位 & 发布后回跳
    var EDIT_CTX_KEY = "rs-edit-scroll-context";
    var RETURN_CTX_KEY = "rs-return-scroll-context";

    function pushEditNeedle(list, seen, n) {
        if (!n || seen[n]) return;
        seen[n] = true;
        list.push(n);
    }

    function collectEditNeedles(el) {
        var out = [];
        var seen = {};
        var cur = el;
        while (cur && cur !== document.body) {
            if (cur.id) {
                pushEditNeedle(out, seen, 'id="' + cur.id + '"');
                pushEditNeedle(out, seen, cur.id);
            }
            var cls = cur.className;
            if (typeof cls === "string" && cls.trim()) {
                cls.trim().split(/\s+/).forEach(function (c) {
                    if (!c || c.length < 3) return;
                    if (c === "html-edited" || c === "markdown-body") return;
                    pushEditNeedle(out, seen, c);
                    pushEditNeedle(out, seen, "." + c);
                });
            }
            if (cur === el) {
                var direct = (cur.textContent || "").replace(/\s+/g, " ").trim();
                if (direct.length >= 4 && direct.length <= 80) pushEditNeedle(out, seen, direct);
            }
            cur = cur.parentElement;
        }
        return out;
    }

    function captureEditContext() {
        var body =
            document.querySelector(".markdown-body") ||
            document.querySelector(".post-content") ||
            document.querySelector("article.post");
        if (!body) return null;

        var vh = window.innerHeight || 800;
        var vw = window.innerWidth || 1200;
        var anchorY = vh * 0.42;
        var x = Math.max(0, Math.min(vw - 1, vw * 0.5));
        var el = document.elementFromPoint(x, anchorY);
        while (el && el !== document.body && el !== body && !body.contains(el)) {
            el = el.parentElement;
        }
        if (!el || !body.contains(el)) el = body;

        var needles = collectEditNeedles(el);
        var headingId = "";
        var cur = el;
        while (cur && cur !== body) {
            var tag = cur.tagName ? cur.tagName.toUpperCase() : "";
            if (/^H[1-6]$/.test(tag) && cur.id) {
                headingId = cur.id;
                break;
            }
            cur = cur.parentElement;
        }
        if (!headingId) {
            var headings = body.querySelectorAll("h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]");
            var bestTop = -Infinity;
            var hi;
            for (hi = 0; hi < headings.length; hi++) {
                var top = headings[hi].getBoundingClientRect().top;
                if (top <= anchorY && top > bestTop) {
                    bestTop = top;
                    headingId = headings[hi].id;
                }
            }
        }

        var htmlEditedIdx = -1;
        var htmlBlocks = body.querySelectorAll(".html-edited");
        var bi;
        for (bi = 0; bi < htmlBlocks.length; bi++) {
            if (htmlBlocks[bi].contains(el)) {
                htmlEditedIdx = bi;
                break;
            }
        }

        var blockSig = "";
        if (el.closest) {
            var marker = el.closest(
                ".wd-smart-card, .wws-wb-card, .nav-quote-box, [id='wanderCard'], [id]"
            );
            if (marker) {
                if (marker.id) blockSig = marker.id;
                else if (marker.className) {
                    var m = String(marker.className).match(/wd-smart-card|wws-wb-card|nav-quote-box/);
                    if (m) blockSig = m[0];
                }
            }
        }

        var blockRatio = 0;
        if (htmlEditedIdx >= 0 && htmlBlocks[htmlEditedIdx]) {
            var blockEl = htmlBlocks[htmlEditedIdx];
            var bRect = blockEl.getBoundingClientRect();
            blockRatio = (anchorY - bRect.top) / Math.max(1, bRect.height);
            blockRatio = Math.min(1, Math.max(0, blockRatio));
        }

        var bodyTop = body.getBoundingClientRect().top + window.pageYOffset;
        var articleRatio = (window.pageYOffset + anchorY - bodyTop) / Math.max(1, body.scrollHeight);
        articleRatio = Math.min(1, Math.max(0, articleRatio));

        return {
            scrollY: window.pageYOffset,
            ratio: articleRatio,
            blockRatio: blockRatio,
            needles: needles,
            headingId: headingId,
            htmlEditedIdx: htmlEditedIdx,
            blockSig: blockSig,
            path: location.pathname,
            ts: Date.now(),
        };
    }

    function saveEditContext(postId) {
        var ctx = captureEditContext();
        if (!ctx) return;
        try {
            var payload = JSON.stringify({ postId: postId, ctx: ctx });
            sessionStorage.setItem(EDIT_CTX_KEY, payload);
            sessionStorage.setItem(RETURN_CTX_KEY, payload);
        } catch (e0) {
            /* ignore */
        }
    }

    function initQuickEdit() {
        const manualIdDiv = document.getElementById('halo-manual-id');
        if (!manualIdDiv || window.innerWidth <= 768) return; 

        const postId = manualIdDiv.innerText.trim();
        if (!postId) return;

        // 1. 注入样式
        const style = document.createElement('style');
        style.innerHTML = `
            #halo-quick-edit-btn {
                position: fixed; bottom: 70px; left: 24px; z-index: 999;
                display: flex; flex-direction: row; align-items: center; justify-content: center; gap: 7px;
                height: 40px; padding: 0 14px; background: transparent; 
                backdrop-filter: blur(12px) saturate(180%); -webkit-backdrop-filter: blur(12px) saturate(180%);
                border: 1px solid rgba(128, 128, 128, 0.2); border-left: 4px solid #FF0000; border-radius: 0 6px 6px 0;
                box-shadow: 0 4px 15px rgba(0, 0, 0, 0.08); text-decoration: none !important;
                transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1); opacity: 0; transform: translateX(-20px);
                color: inherit !important; font-weight: normal !important;
            }
            #halo-quick-edit-btn.show { opacity: 1; transform: translateX(0); }
            #halo-quick-edit-btn svg { width: 20px; height: 20px; fill: currentColor; display: block; transform: translateY(-1px); }
            .edit-cn { font-family: 'ZiHun-59-ChuangCuHei', sans-serif !important; font-size: 18px; line-height: 1; }
            .edit-divider { width: 1px; height: 14px; background: currentColor; opacity: 0.25; }
            .edit-en { font-family: 'Rajdhani-Medium', sans-serif !important; font-size: 18px; line-height: 1; margin-top: 0.15em; letter-spacing: 0.5px; }
            #halo-quick-edit-btn:hover { background: rgba(128, 128, 128, 0.1); padding-left: 18px; }
            html[data-user-color-scheme="dark"] #halo-quick-edit-btn,
            @media (prefers-color-scheme: dark) {
                html:not([data-user-color-scheme="light"]) #halo-quick-edit-btn { border-left-color: #FFFFFF; }
            }
        `;
        document.head.appendChild(style);

        // 2. 创建 DOM
        const btn = document.createElement('a');
        btn.id = 'halo-quick-edit-btn';
        btn.href = '/console/posts/editor?name=' + postId;
        btn.innerHTML = `
            <svg viewBox="0 0 1024 1024"><path d="M836 476h-160v-160c0-30.9-25.1-56-56-56h-560c-30.9 0-56 25.1-56 56v560c0 30.9 25.1 56 56 56h560c30.9 0 56-25.1 56-56v-160h160c30.9 0 56-25.1 56-56v-184c0-30.9-25.1-56-56-56zM620 872h-560v-560h560v560zM836 676h-160v-144h160v144zM240 460h360v48h-360v-48zM240 580h360v48h-360v-48zM240 700h200v48h-200v-48z"></path></svg>
            <span class="edit-cn">编辑</span>
            <div class="edit-divider"></div>
            <span class="edit-en">EDIT</span>
        `;
        document.body.appendChild(btn);
        btn.addEventListener("mousedown", function () {
            saveEditContext(postId);
        });
        btn.addEventListener("click", function () {
            saveEditContext(postId);
        });
        setTimeout(() => btn.classList.add('show'), 100);
    }

    loadScript(SCRIPTS.config, function() {
        var path = location.pathname;
        var isHomePage = path === '/' || path === '/index.html' || /^\/page\/\d+/.test(path);
        var wikiPatterns = (window.RSConfig.wiki && window.RSConfig.wiki.urlIncludes) || ['wwswiki'];
        var isWikiPage = wikiPatterns.some(function (p) { return p && path.indexOf(p) > -1; });

        // 全站：统一目录 / 锚点跳转偏移（必须在 config 之后）
        loadScript(SCRIPTS.anchor);

        // 全站：Wiki 红链（/archives/ 内链）
        if (!window.RSConfig.redlinks || window.RSConfig.redlinks.enabled !== false) {
            loadScript(SCRIPTS.redlinks);
        }

        if (path.indexOf("/archives/") === 0) {
            loadScript("/upload/wiki-data/rs-ensure-manual-id.js?v=1.0", function () {
                initQuickEdit();
            });
            loadScript("/upload/wiki-data/rs-archive-scroll.js?v=1.0.1");
        } else {
            initQuickEdit();
        }

        if (isHomePage) {
            document.body.classList.add('layout-home-minimal'); 
            loadScript(SCRIPTS.home);
        } 
        else if (isWikiPage) {
            document.body.classList.add('my-wiki-page'); 
            loadScript(SCRIPTS.wiki);
        }
    });
})();