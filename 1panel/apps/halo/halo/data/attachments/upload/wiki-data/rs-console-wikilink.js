/* =======================================================
   RS Console WikiLink — MediaWiki 风格：选中文字 → 添加链接 / 红链
   ======================================================= */
(function () {
  "use strict";

  if (location.pathname.indexOf("/console/posts/editor") < 0) return;

  var cfg = (window.RSConfig && window.RSConfig.wikilink) || {};
  if (cfg.enabled === false) return;

  var PATH_PREFIX = cfg.pathPrefix || "/archives/";
  var SLUG_INDEX = cfg.slugIndex || "/upload/wiki-data/wiki-slugs.json";
  var BRACKET_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

  var suggestPaths = [];
  var publishedSlugs = {};
  var pageIndex = [];
  var acBox = null;
  var acIndex = 0;
  var acOpen = false;
  var bubble = null;
  var popover = null;
  var selectionCtx = null;
  var lastGoodCtx = null;
  var selHideTimer = null;
  var nativeHooked = false;

  function normalizeTarget(raw) {
    var path = String(raw || "")
      .trim()
      .replace(/\\/g, "/");
    if (path.startsWith(PATH_PREFIX)) path = path.slice(PATH_PREFIX.length);
    if (path.startsWith("/archives/")) path = path.slice("/archives/".length);
    while (path.startsWith("../") || path.startsWith("./")) path = path.replace(/^\.\.?\//, "");
    if (path.endsWith(".md")) path = path.slice(0, -3);
    if (path.endsWith("/index")) path = path.slice(0, -"/index".length);
    return path.replace(/^\/+|\/+$/g, "");
  }

  function defaultLabel(target) {
    var parts = normalizeTarget(target).split("/");
    var last = parts[parts.length - 1] || target;
    return last.replace(/[-_]+/g, " ");
  }

  function archivesHref(target) {
    var slug = normalizeTarget(target);
    if (!slug) return PATH_PREFIX;
    return PATH_PREFIX + encodeURIComponent(slug).replace(/%2F/g, "/");
  }

  function decodeArchivesSlug(encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch (e) {
      return encoded;
    }
  }

  function looksLikeHtml(text) {
    return /<\/?[a-z][\s\S]*>/i.test(text);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function bracketToMarkdown(target, label) {
    var href = archivesHref(target);
    var text = (label || "").trim() || defaultLabel(target);
    return "[" + text + "](" + href + ")";
  }

  function bracketToHtml(target, label) {
    var href = archivesHref(target);
    var text = (label || "").trim() || defaultLabel(target);
    return '<a href="' + href + '">' + escapeHtml(text) + "</a>";
  }

  function expandWikiLinksInText(text, forceHtml) {
    if (!text || text.indexOf("[[") < 0) return text;
    var htmlMode = forceHtml === true || (forceHtml !== false && looksLikeHtml(text));
    return text.replace(BRACKET_RE, function (_m, target, label) {
      return htmlMode ? bracketToHtml(target, label) : bracketToMarkdown(target, label);
    });
  }

  function transformDeep(value) {
    if (typeof value === "string") return expandWikiLinksInText(value);
    if (Array.isArray(value)) return value.map(transformDeep);
    if (value && typeof value === "object") {
      var out = {};
      Object.keys(value).forEach(function (k) {
        out[k] = transformDeep(value[k]);
      });
      return out;
    }
    return value;
  }

  function maybeTransformSaveBody(body) {
    if (!body || typeof body !== "string" || body.indexOf("[[") < 0) return body;
    try {
      return JSON.stringify(transformDeep(JSON.parse(body)));
    } catch (e) {
      return expandWikiLinksInText(body);
    }
  }

  function hookSave() {
    if (!window.fetch || window.fetch.__rsWikiLinkHook) return;
    var nativeFetch = window.fetch;
    window.fetch = function (input, init) {
      var nextInit = init;
      if (init && init.body && typeof init.body === "string") {
        var url = typeof input === "string" ? input : input && input.url;
        if (url && /\/apis\/uc\.api\.content\.halo\.run\/v1alpha1\/posts\b/.test(url)) {
          var method = (init.method || "GET").toUpperCase();
          if (method === "PUT" || method === "POST") {
            nextInit = Object.assign({}, init, { body: maybeTransformSaveBody(init.body) });
          }
        }
      }
      return nativeFetch.call(this, input, nextInit);
    };
    window.fetch.__rsWikiLinkHook = true;
  }

  function findEditor() {
    var ta = document.querySelector("textarea:not([readonly])");
    if (ta && ta.offsetParent !== null) return { type: "textarea", el: ta };
    var pm = document.querySelector(".ProseMirror");
    if (pm && pm.isContentEditable) return { type: "prosemirror", el: pm };
    var cm = document.querySelector(".cm-content[contenteditable='true']");
    if (cm) return { type: "codemirror", el: cm };
    return null;
  }

  function rememberSelection(ctx) {
    ctx = ctx || captureSelection();
    if (ctx.text) {
      lastGoodCtx = ctx;
      selectionCtx = ctx;
    }
    return ctx;
  }

  function getSelectionForLink() {
    var ctx = captureSelection();
    if (ctx.text) return rememberSelection(ctx);
    if (lastGoodCtx && lastGoodCtx.text) return lastGoodCtx;
    return ctx;
  }

  function captureSelection() {
    var editor = findEditor();
    if (editor && editor.type === "textarea") {
      var ta = editor.el;
      var start = ta.selectionStart;
      var end = ta.selectionEnd;
      var text = ta.value.slice(start, end).replace(/\s+/g, " ").trim();
      return {
        editor: editor,
        text: text,
        range: { start: start, end: end },
        rect: null,
      };
    }
    var sel = window.getSelection();
    if (sel && sel.rangeCount && !sel.isCollapsed) {
      var t = sel.toString().replace(/\s+/g, " ").trim();
      if (!t) return { editor: editor, text: "", range: null, rect: null, selection: sel };
      var range = sel.getRangeAt(0);
      return {
        editor: editor,
        text: t,
        range: null,
        rect: range.getBoundingClientRect(),
        selection: sel,
        domRange: range.cloneRange(),
      };
    }
    return { editor: editor, text: "", range: null, rect: null };
  }

  function restoreDomSelection(ctx) {
    if (!ctx || !ctx.domRange) return false;
    try {
      var sel = ctx.selection || window.getSelection();
      if (!sel) return false;
      sel.removeAllRanges();
      sel.addRange(ctx.domRange);
      return true;
    } catch (e) {
      return false;
    }
  }

  function replaceWithLink(target, label, ctx) {
    target = normalizeTarget(target);
    if (!target) return false;
    label = (label || ctx.text || "").trim() || defaultLabel(target);
    var editor = ctx.editor || findEditor();
    if (!editor) return false;

    var href = archivesHref(target);
    if (editor.type === "textarea" && ctx.range && ctx.range.start !== ctx.range.end) {
      var ta = editor.el;
      var snippet = bracketToMarkdown(target, label);
      var val = ta.value;
      ta.value = val.slice(0, ctx.range.start) + snippet + val.slice(ctx.range.end);
      var pos = ctx.range.start + snippet.length;
      ta.selectionStart = ta.selectionEnd = pos;
      ta.dispatchEvent(new Event("input", { bubbles: true }));
      ta.focus();
      return true;
    }
    if (editor.type === "prosemirror" && ctx.text) {
      editor.el.focus();
      restoreDomSelection(ctx);
      var linkHtml = bracketToHtml(target, label);
      try {
        if (document.queryCommandSupported("insertHTML")) {
          document.execCommand("insertHTML", false, linkHtml);
          return true;
        }
      } catch (e0) {
        /* ignore */
      }
      try {
        if (document.queryCommandSupported("createLink")) {
          document.execCommand("createLink", false, href);
          return true;
        }
      } catch (e1) {
        /* ignore */
      }
    }
    var snippet = editor.type === "textarea" ? bracketToMarkdown(target, label) : bracketToHtml(target, label);
    if (editor.type === "textarea" && ctx.range) {
      var ta2 = editor.el;
      var val2 = ta2.value;
      ta2.value = val2.slice(0, ctx.range.start) + snippet + val2.slice(ctx.range.end);
      ta2.selectionStart = ta2.selectionEnd = ctx.range.start + snippet.length;
      ta2.dispatchEvent(new Event("input", { bubbles: true }));
      ta2.focus();
      return true;
    }
    editor.el.focus();
    try {
      document.execCommand("insertHTML", false, snippet);
      return true;
    } catch (e2) {
      return false;
    }
  }

  function isPublishedSlug(slug) {
    slug = normalizeTarget(slug);
    return !!(slug && publishedSlugs[slug]);
  }

  function searchPages(query) {
    query = (query || "").trim().toLowerCase();
    if (!query) return pageIndex.slice(0, 10);
    var out = [];
    pageIndex.forEach(function (p) {
      var hay = (p.title + " " + p.slug + " " + (p.label || "")).toLowerCase();
      if (hay.indexOf(query) >= 0) out.push(p);
    });
    suggestPaths.forEach(function (path) {
      if (path.toLowerCase().indexOf(query) < 0) return;
      if (out.some(function (x) { return x.slug === path; })) return;
      out.push({ slug: path, title: defaultLabel(path), published: isPublishedSlug(path) });
    });
    return out.slice(0, 12);
  }

  function exactPage(query) {
    query = normalizeTarget(query);
    if (!query) return null;
    for (var i = 0; i < pageIndex.length; i++) {
      var p = pageIndex[i];
      if (p.slug === query || p.title === query) return p;
    }
    if (isPublishedSlug(query)) return { slug: query, title: defaultLabel(query), published: true };
    return null;
  }

  function injectStyles() {
    if (document.getElementById("rs-wikilink-style")) return;
    var style = document.createElement("style");
    style.id = "rs-wikilink-style";
    style.textContent =
      "#rs-wikilink-bubble{position:fixed;z-index:10054;display:none;transform:translate(-50%,-100%);margin-top:-8px}" +
      "#rs-wikilink-bubble button{width:36px;height:36px;border-radius:8px;border:1px solid rgba(0,0,0,.12);" +
      "background:#fff;box-shadow:0 4px 14px rgba(0,0,0,.15);cursor:pointer;font-size:16px;line-height:1}" +
      "#rs-wikilink-bubble button:hover{background:#f5f5f5}" +
      "#rs-wikilink-pop{position:fixed;z-index:10060;width:min(360px,calc(100vw - 24px));background:#fff;color:#111;" +
      "border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,.22);border:1px solid rgba(0,0,0,.08);overflow:hidden}" +
      "#rs-wikilink-pop .head{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #eee}" +
      "#rs-wikilink-pop .head .title{flex:1;font:600 14px system-ui,sans-serif;text-align:center}" +
      "#rs-wikilink-pop .head button{border:none;background:transparent;cursor:pointer;font:500 13px system-ui,sans-serif;color:#1976d2;padding:4px 6px}" +
      "#rs-wikilink-pop .head button.close{color:#666;font-size:18px;line-height:1}" +
      "#rs-wikilink-pop .search{padding:10px 12px;border-bottom:1px solid #f0f0f0}" +
      "#rs-wikilink-pop .search input{width:100%;box-sizing:border-box;border:1px solid #ddd;border-radius:8px;padding:9px 10px;font:14px system-ui,sans-serif}" +
      "#rs-wikilink-pop .results{max-height:240px;overflow:auto;padding:6px 0}" +
      "#rs-wikilink-pop .row{display:flex;align-items:center;gap:10px;padding:8px 12px;cursor:pointer}" +
      "#rs-wikilink-pop .row:hover,#rs-wikilink-pop .row.active{background:#f5f5f5}" +
      "#rs-wikilink-pop .row .icon{width:28px;height:28px;border-radius:6px;background:#eee;display:flex;align-items:center;justify-content:center;font:600 14px sans-serif;color:#666;flex-shrink:0}" +
      "#rs-wikilink-pop .row.red .icon{background:#ffebee;color:#c62828}" +
      "#rs-wikilink-pop .row.red .label{color:#c62828;font-weight:600}" +
      "#rs-wikilink-pop .row .meta{font:11px/1.3 ui-monospace,monospace;color:#888;margin-top:2px}" +
      "#rs-wikilink-pop .hint{padding:8px 12px 10px;font:12px/1.45 system-ui,sans-serif;color:#666;border-top:1px solid #f0f0f0}" +
      "#rs-wikilink-btn{position:fixed;right:24px;bottom:24px;z-index:10050;padding:8px 14px;border-radius:8px;" +
      "border:1px solid rgba(128,128,128,.35);background:rgba(255,255,255,.92);backdrop-filter:blur(8px);cursor:pointer;" +
      "font:600 13px/1.2 system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.12)}" +
      "#rs-wikilink-ac{position:fixed;z-index:10055;max-height:220px;overflow:auto;background:#fff;" +
      "border:1px solid #ccc;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.15);min-width:220px;display:none}" +
      "#rs-wikilink-ac .item{padding:7px 10px;cursor:pointer;font:13px/1.35 ui-monospace,monospace}" +
      "#rs-wikilink-ac .item.active,#rs-wikilink-ac .item:hover{background:#fce4ec}";
    document.head.appendChild(style);
  }

  function hideBubble() {
    if (bubble) bubble.style.display = "none";
  }

  function hidePopover() {
    if (popover) {
      popover.remove();
      popover = null;
    }
  }

  function positionNearRect(el, rect) {
    if (!rect) return;
    var top = rect.top - 8;
    var left = rect.left + rect.width / 2;
    if (top < 12) top = rect.bottom + 12;
    el.style.top = Math.max(8, top) + "px";
    el.style.left = Math.min(Math.max(left, 80), window.innerWidth - 80) + "px";
  }

  function ensureBubble() {
    if (bubble) return bubble;
    bubble = document.createElement("div");
    bubble.id = "rs-wikilink-bubble";
    bubble.innerHTML = '<button type="button" title="添加链接 (Ctrl+K)">🔗</button>';
    bubble.querySelector("button").addEventListener("mousedown", function (e) {
      e.preventDefault();
      openLinkPopover(selectionCtx);
    });
    document.body.appendChild(bubble);
    return bubble;
  }

  function showBubbleForSelection(ctx) {
    if (!ctx || !ctx.text) {
      hideBubble();
      return;
    }
    selectionCtx = ctx;
    var b = ensureBubble();
    var rect = ctx.rect;
    if (!rect && ctx.editor && ctx.editor.type === "textarea" && ctx.range) {
      rect = ctx.editor.el.getBoundingClientRect();
    }
    if (!rect) return;
    positionNearRect(b, rect);
    b.style.display = "block";
  }

  function renderPopoverResults(query, listEl, pickFn) {
    var q = (query || "").trim();
    var exact = exactPage(q);
    var results = searchPages(q);
    var html = "";

    if (q && !exact) {
      html +=
        '<div class="row red active" data-target="' +
        escapeHtml(q) +
        '" data-label="' +
        escapeHtml(q) +
        '">' +
        '<div class="icon">?</div><div><div class="label">' +
        escapeHtml(q) +
        '</div><div class="meta">此页面尚未创建 · 将插入红链</div></div></div>';
    }

    results.forEach(function (p, i) {
      if (q && p.title === q && !exact) return;
      html +=
        '<div class="row' +
        (!html && i === 0 ? " active" : "") +
        (p.published ? "" : " red") +
        '" data-target="' +
        escapeHtml(p.slug) +
        '" data-label="' +
        escapeHtml(p.title) +
        '">' +
        '<div class="icon">' +
        (p.published ? "✓" : "?") +
        "</div><div><div class=\"label\">" +
        escapeHtml(p.title) +
        '</div><div class="meta">' +
        escapeHtml(p.slug) +
        (p.published ? "" : " · 红链") +
        "</div></div></div>";
    });

    if (!html) {
      html = '<div class="hint" style="border:0">输入页面名称，或从列表中选择</div>';
    }
    listEl.innerHTML = html;
    listEl.querySelectorAll(".row").forEach(function (row) {
      row.addEventListener("click", function () {
        listEl.querySelectorAll(".row").forEach(function (r) { r.classList.remove("active"); });
        row.classList.add("active");
        pickFn(row.getAttribute("data-target"), row.getAttribute("data-label"));
      });
    });
  }

  function openLinkPopover(ctx, anchorRect) {
    hidePopover();
    hideBubble();
    hideNativeLinkPopover();
    ctx = getSelectionForLink();
    selectionCtx = ctx;
    var initial = ctx.text || "";

    popover = document.createElement("div");
    popover.id = "rs-wikilink-pop";
    popover.innerHTML =
      '<div class="head">' +
      '<button type="button" class="close" aria-label="关闭">×</button>' +
      '<div class="title">添加链接</div>' +
      '<button type="button" class="done">完成</button>' +
      "</div>" +
      '<div class="search"><input type="text" placeholder="搜索或新建页面…" autocomplete="off"></div>' +
      '<div class="results"></div>' +
      '<div class="hint">页面名称默认取选中文字；未发布的链接在前台显示为<span style="color:#c62828">红链</span>，读者点击可创建条目。</div>';

    document.body.appendChild(popover);
    var input = popover.querySelector("input");
    var results = popover.querySelector(".results");
    var picked = { target: initial, label: initial };

    input.value = initial;
    renderPopoverResults(initial, results, function (target, label) {
      picked.target = target;
      picked.label = label;
      input.value = target;
    });

    input.addEventListener("input", function () {
      renderPopoverResults(input.value, results, function (target, label) {
        picked.target = target;
        picked.label = label;
      });
    });

    function finish() {
      var target = normalizeTarget(input.value.trim() || picked.target);
      var label = (ctx.text || picked.label || target).trim();
      if (!target) return;
      replaceWithLink(target, label, ctx);
      hidePopover();
    }

    popover.querySelector(".done").addEventListener("click", finish);
    popover.querySelector(".close").addEventListener("click", hidePopover);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        finish();
      }
      if (e.key === "Escape") hidePopover();
    });

    var rect = anchorRect || ctx.rect;
    if (!rect && ctx.editor && ctx.editor.type === "textarea") {
      rect = ctx.editor.el.getBoundingClientRect();
    }
    rect = rect || { top: window.innerHeight / 2, left: window.innerWidth / 2, width: 0, height: 0 };
    popover.style.top = Math.min(rect.bottom + 8, window.innerHeight - 320) + "px";
    popover.style.left = Math.min(Math.max(rect.left, 12), window.innerWidth - 380) + "px";
    input.focus();
    input.select();
  }

  function ensureAcBox() {
    if (acBox) return acBox;
    acBox = document.createElement("div");
    acBox.id = "rs-wikilink-ac";
    document.body.appendChild(acBox);
    return acBox;
  }

  function hideAutocomplete() {
    acOpen = false;
    if (acBox) acBox.style.display = "none";
  }

  function onSelectionUpdated() {
    clearTimeout(selHideTimer);
    selHideTimer = setTimeout(function () {
      rememberSelection();
      if (popover) return;
      var ctx = getSelectionForLink();
      if (ctx.text && ctx.text.length >= 1) showBubbleForSelection(ctx);
      else hideBubble();
    }, 120);
  }

  function isNativeLinkControl(el) {
    if (!el || !el.closest) return false;
    var btn = el.closest('button, [role="button"], .menu-item, [class*="toolbar"] button');
    if (!btn) return false;
    var text = (
      btn.getAttribute("aria-label") ||
      btn.getAttribute("title") ||
      btn.getAttribute("data-tooltip") ||
      btn.textContent ||
      ""
    ).toLowerCase();
    if (/链接|link|hyperlink|internal link|wiki/.test(text)) return true;
    if (btn.querySelector('[class*="link"], [data-icon="link"]')) return true;
    var pm = document.querySelector(".ProseMirror");
    if (!pm) return false;
    var inEditorUi = btn.closest('[class*="editor"], [class*="richtext"], [class*="toolbar"], [class*="bubble"], [class*="menu-bar"]');
    if (!inEditorUi) return false;
    var svg = btn.querySelector("svg");
    if (!svg) return false;
    var paths = svg.innerHTML || "";
    if (/link|chain|url/i.test(paths) || btn.className.toLowerCase().indexOf("link") >= 0) return true;
    return false;
  }

  function hideNativeLinkPopover() {
    document.querySelectorAll('input[placeholder*="链接"], input[placeholder*="Link"]').forEach(function (input) {
      var root =
        input.closest("[data-tippy-root]") ||
        input.closest("[class*='tippy']") ||
        input.closest("[class*='popover']") ||
        input.closest("[class*='bubble-menu']") ||
        input.closest("[class*='dropdown']") ||
        input.closest("[role='dialog']") ||
        input.parentElement;
      if (root && root !== document.body) {
        root.remove();
      }
    });
  }

  function prefillNativeLinkInput(input) {
    if (!input || input.dataset.rsWikiFilled === "1") return;
    var ctx = getSelectionForLink();
    if (!ctx.text) return;
    input.dataset.rsWikiFilled = "1";
    input.value = ctx.text;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function hookNativeLinkToolbar() {
    if (nativeHooked) return;
    nativeHooked = true;

    document.addEventListener(
      "mousedown",
      function (e) {
        rememberSelection();
        if (findEditor() && findEditor().el && findEditor().el.contains(e.target)) {
          rememberSelection(captureSelection());
        }
      },
      true
    );

    document.addEventListener(
      "click",
      function (e) {
        if (!isNativeLinkControl(e.target)) return;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        setTimeout(function () {
          hideNativeLinkPopover();
          openLinkPopover(getSelectionForLink());
        }, 0);
        return false;
      },
      true
    );

    document.addEventListener(
      "keydown",
      function (e) {
        if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "k") return;
        var t = e.target;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
          var ed = findEditor();
          if (ed && (ed.el === t || ed.el.contains(t))) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            openLinkPopover(getSelectionForLink());
          }
        }
      },
      true
    );

    var obs = new MutationObserver(function () {
      if (popover) return;
      document.querySelectorAll('input[placeholder*="链接"], input[placeholder*="Link"]').forEach(function (input) {
        if (input.closest("#rs-wikilink-pop")) return;
        var ctx = getSelectionForLink();
        if (ctx.text) {
          hideNativeLinkPopover();
          openLinkPopover(ctx);
          return;
        }
        prefillNativeLinkInput(input);
      });
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  function onEditorKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      var t = e.target;
      var ed = findEditor();
      if (ed && t && (ed.el === t || ed.el.contains(t) || t.closest(".ProseMirror"))) {
        e.preventDefault();
        e.stopPropagation();
        openLinkPopover(getSelectionForLink());
      }
    }
  }

  function loadIndex() {
    publishedSlugs = {};
    pageIndex = [];
    var slugP = fetch(SLUG_INDEX, { credentials: "same-origin", cache: "no-cache" })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        suggestPaths = [];
        var seen = {};
        ["gitSlugs", "slugs", "redlinkTargets"].forEach(function (key) {
          (data[key] || []).forEach(function (p) {
            var n = normalizeTarget(p);
            if (!n || seen[n]) return;
            seen[n] = true;
            suggestPaths.push(n);
            if (key === "slugs") publishedSlugs[n] = true;
          });
        });
        suggestPaths.sort();
      })
      .catch(function () {
        suggestPaths = [];
      });

    var postsP = (function loadPosts(page) {
      page = page || 1;
      return fetch("/apis/api.content.halo.run/v1alpha1/posts?page=" + page + "&size=100", {
        credentials: "same-origin",
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          (data.items || []).forEach(function (post) {
            var slug = post.spec && post.spec.slug;
            var title = (post.spec && post.spec.title) || slug;
            if (!slug) return;
            var labels = (post.metadata && post.metadata.labels) || {};
            var pub = labels["content.halo.run/published"] === "true";
            pageIndex.push({ slug: slug, title: title, published: pub });
            if (pub) publishedSlugs[slug] = true;
            var ann = post.metadata && post.metadata.annotations;
            var lt = ann && ann["rs.wiki/redlink-target-slug"];
            if (lt) {
              publishedSlugs[normalizeTarget(lt)] = pub;
              pageIndex.push({ slug: normalizeTarget(lt), title: title, published: pub, label: lt });
            }
          });
          if (data.hasNext && page < 10) return loadPosts(page + 1);
        });
    })();

    return Promise.all([slugP, postsP]).then(function () {
      pageIndex.sort(function (a, b) { return a.title.localeCompare(b.title, "zh"); });
    });
  }

  function initToolbar() {
    if (document.getElementById("rs-wikilink-btn")) return;
    var btn = document.createElement("button");
    btn.id = "rs-wikilink-btn";
    btn.type = "button";
    btn.title = "添加链接 (Ctrl+K)";
    btn.textContent = "🔗 添加链接";
    btn.addEventListener("click", function () {
      openLinkPopover(getSelectionForLink());
    });
    document.body.appendChild(btn);
  }

  function bindEditorListeners() {
    document.addEventListener("keydown", onEditorKeyDown, true);
    document.addEventListener("mouseup", onSelectionUpdated, true);
    document.addEventListener("keyup", onSelectionUpdated, true);
    document.addEventListener("mousedown", function (e) {
      if (popover && !popover.contains(e.target) && !(bubble && bubble.contains(e.target))) {
        /* keep popover until explicit close */
      }
      if (!popover && !(bubble && bubble.contains(e.target))) hideBubble();
    }, true);
  }

  function init() {
    injectStyles();
    hookSave();
    initToolbar();
    bindEditorListeners();
    hookNativeLinkToolbar();
    document.addEventListener("selectionchange", function () {
      rememberSelection();
    });
    loadIndex().then(function () {
      console.log("[rs-wikilink] 已接管工具栏「链接」按钮；选中文字 → 添加链接（Ctrl+K）");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
