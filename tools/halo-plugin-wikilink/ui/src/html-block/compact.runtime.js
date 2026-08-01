/* =======================================================
   RS Console — HTML 编辑块全屏编辑 v3.4.3
   全屏编辑按预览点击/滚动位置定位源码；修复自动恢复重试
   ======================================================= */
(function () {
  "use strict";

  if (location.pathname.indexOf("/console/posts/editor") < 0) return;

  var RS_HTML_BLOCK_VER = "4.0.0";
  if (
    window.RSHtmlBlockCompact &&
    window.RSHtmlBlockCompact.__ver === RS_HTML_BLOCK_VER &&
    !window.__rsHtmlBlockPluginMode
  ) {
    return;
  }
  window.RSHtmlBlockCompact = window.RSHtmlBlockCompact || {};
  window.RSHtmlBlockCompact.__ver = RS_HTML_BLOCK_VER;

  var cfg = (window.RSConfig && window.RSConfig.htmlBlockCompact) || {};

  function isCompactActive() {
    if (window.__rsHtmlBlockPluginMode) return true;
    var live = (window.RSConfig && window.RSConfig.htmlBlockCompact) || cfg;
    return live.enabled !== false;
  }

  function liveCfg() {
    return (window.RSConfig && window.RSConfig.htmlBlockCompact) || cfg;
  }

  var BLOCK_LABEL_RE = cfg.labelRe || /HTML\s*编辑块/;
  var sourceCache = new WeakMap();
  var fullSourceCache = new WeakMap();
  var fsState = null;
  var pmHooked = false;
  var overlay = null;
  var overlayTextarea = null;
  var previewAssetsReady = false;
  var prepareBlocksTimer = null;
  var iframeRefreshTimer = null;
  var serverBlocksCache = null;
  var serverRepairDone = false;
  var repairScheduled = false;
  var repairAttemptCount = 0;
  var REPAIR_MAX_ATTEMPTS = 15;

  function isOurPreviewNode(n) {
    if (!n || n.nodeType !== 1) return false;
    if (n.matches && (n.matches("[data-rs-html-iframe-wrap]") || n.matches("[data-rs-html-iframe]"))) {
      return true;
    }
    if (n.closest && n.closest("[data-rs-html-iframe-wrap]")) return true;
    return false;
  }

  function debouncedPrepareAllBlocks() {
    if (prepareBlocksTimer) clearTimeout(prepareBlocksTimer);
    prepareBlocksTimer = setTimeout(function () {
      prepareBlocksTimer = null;
      prepareAllBlocks();
      scheduleRepairWhenReady();
    }, 200);
  }

  function previewSheets() {
    return cfg.previewStyles || ["/upload/wiki-data/fronts.css"];
  }

  function ensurePreviewAssets() {
    if (previewAssetsReady) return;
    previewAssetsReady = true;
    document.body.classList.add("my-wiki-page", "rs-console-wiki-preview");
  }

  function fnv1a(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
  }

  function absAssetUrl(href) {
    if (!href) return href;
    if (/^https?:\/\//i.test(href)) return href;
    return location.origin + (href.charAt(0) === "/" ? href : "/" + href);
  }

  function preparePreviewHtml(html) {
    if (!html) return "";
    return html
      .replace(/<\/script/gi, "<\\/script")
      .replace(/\bdemo\/upload\//g, "/upload/")
      .replace(/url\((['"]?)demo\/upload\//g, "url($1/upload/");
  }

  function buildIframeDoc(html) {
    html = preparePreviewHtml(html);
    var links = previewSheets()
      .map(function (href) {
        if (!href) return "";
        var url = absAssetUrl(href) + (href.indexOf("?") >= 0 ? "" : "?v=1");
        return '<link rel="stylesheet" href="' + url + '">';
      })
      .join("");
    var extra = cfg.previewDocClass || "my-wiki-page markdown-body";
    return (
      "<!DOCTYPE html><html><head><meta charset=\"utf-8\">" +
      '<base href="' +
      location.origin +
      '/">' +
      links +
      "<style>" +
      "@import url('" +
      absAssetUrl(previewSheets()[0] || "/upload/wiki-data/fronts.css") +
      "');" +
      "html,body{margin:0;padding:0;background:transparent;color:inherit;overflow:hidden!important;height:auto!important;}" +
      "body{font-size:16px;line-height:1.75;box-sizing:border-box;}" +
      "*,*::before,*::after{box-sizing:inherit;}" +
      "img,video,svg{max-width:100%;height:auto;}" +
      "table{max-width:100%;}" +
      ".wd-smart-card{min-height:160px;}" +
      ".wd-inner-mask{inset:0!important;border-radius:11px;}" +
      "</style></head><body class=\"" +
      extra +
      '">' +
      html +
      "</body></html>"
    );
  }

  function scheduleIframeResize(iframe) {
    if (!iframe || iframe.__rsHtmlResizeQueued) return;
    iframe.__rsHtmlResizeQueued = true;
    [0, 120, 400].forEach(function (ms) {
      setTimeout(function () {
        resizeIframe(iframe);
        if (ms === 400) iframe.__rsHtmlResizeQueued = false;
      }, ms);
    });
  }

  function writeIframeDoc(iframe, html) {
    var docHtml = buildIframeDoc(html);
    try {
      var doc = iframe.contentDocument;
      if (!doc) return false;
      doc.open();
      doc.write(docHtml);
      doc.close();
      return true;
    } catch (e0) {
      iframe.srcdoc = docHtml;
      return true;
    }
  }

  function resizeIframe(iframe) {
    if (!iframe || !iframe.contentDocument) return;
    try {
      var doc = iframe.contentDocument;
      if (!doc.body) return;
      var prev = parseInt(iframe.dataset.rsHtmlHeight || "0", 10) || 0;
      iframe.style.height = "0px";
      var h = Math.max(doc.body.scrollHeight || 0, doc.documentElement.scrollHeight || 0);
      h = Math.max(96, Math.min(h + 12, 12000));
      if (prev && Math.abs(h - prev) <= 2) {
        iframe.style.height = prev + "px";
        return;
      }
      iframe.dataset.rsHtmlHeight = String(h);
      iframe.style.height = h + "px";
    } catch (e1) {
      /* ignore */
    }
  }

  function getPreviewIframe(root) {
    return root ? root.querySelector("[data-rs-html-iframe]") : null;
  }

  function pushNeedle(list, seen, n) {
    if (!n || seen[n]) return;
    seen[n] = true;
    list.push(n);
  }

  function collectNeedles(el, doc) {
    var out = [];
    var seen = {};
    var cur = el;
    while (cur && cur !== doc.body && cur !== doc.documentElement) {
      if (cur.id) {
        pushNeedle(out, seen, 'id="' + cur.id + '"');
        pushNeedle(out, seen, cur.id);
      }
      var cls = cur.className;
      if (typeof cls === "string" && cls.trim()) {
        cls.trim().split(/\s+/).forEach(function (c) {
          if (!c || c.length < 3) return;
          pushNeedle(out, seen, c);
          pushNeedle(out, seen, "." + c);
        });
      }
      var tag = cur.tagName ? cur.tagName.toLowerCase() : "";
      if (tag === "style") pushNeedle(out, seen, "<style");
      if (tag === "script") pushNeedle(out, seen, "<script");
      if (cur === el) {
        var direct = (cur.textContent || "").replace(/\s+/g, " ").trim();
        if (direct.length >= 4 && direct.length <= 80) pushNeedle(out, seen, direct);
      }
      cur = cur.parentElement;
    }
    return out;
  }

  function resolveEditorContext(root) {
    var result = { ratio: 0, needles: [], docY: 0 };
    var iframe = getPreviewIframe(root);
    if (!iframe) return result;
    try {
      var doc = iframe.contentDocument;
      if (!doc || !doc.body) return result;
      var rect = iframe.getBoundingClientRect();
      if (rect.height <= 1 || rect.width <= 1) return result;
      var vh = window.innerHeight || document.documentElement.clientHeight || 800;
      var x = Math.max(0, Math.min(rect.width - 1, rect.width * 0.5));
      var anchors = [vh * 0.42, vh * 0.5, vh * 0.32, vh * 0.58];
      var bestEl = null;
      var bestDocY = 0;
      var ai;
      for (ai = 0; ai < anchors.length; ai++) {
        var docY = anchors[ai] - rect.top;
        if (docY < 0 || docY > rect.height) continue;
        var el = doc.elementFromPoint(x, docY);
        if (el && el !== doc.body && el !== doc.documentElement) {
          bestEl = el;
          bestDocY = docY;
          break;
        }
      }
      if (!bestEl) {
        for (var fy = 0.08; fy <= 0.92; fy += 0.08) {
          var docY2 = Math.max(0, Math.min(rect.height - 1, rect.height * fy));
          var el2 = doc.elementFromPoint(x, docY2);
          if (el2 && el2 !== doc.body && el2 !== doc.documentElement) {
            bestEl = el2;
            bestDocY = docY2;
            break;
          }
        }
      }
      result.docY = bestDocY;
      result.ratio = bestDocY / Math.max(1, rect.height);
      if (bestEl) result.needles = collectNeedles(bestEl, doc);
    } catch (e0) {
      /* ignore */
    }
    return result;
  }

  function captureBlockViewportRatio(root) {
    var ctx = resolveEditorContext(root);
    root.dataset.rsHtmlPreviewScrollRatio = String(ctx.ratio);
    if (ctx.needles.length) root.dataset.rsHtmlPreviewNeedles = JSON.stringify(ctx.needles);
    return ctx.ratio;
  }

  function capturePreviewScrollRatio(root) {
    captureBlockViewportRatio(root);
  }

  function attachPreviewInteraction(iframe, root) {
    try {
      var doc = iframe.contentDocument;
      if (!doc) return;
      if (doc.__rsHtmlPreviewHook) return;
      doc.__rsHtmlPreviewHook = true;
      doc.addEventListener(
        "mousedown",
        function (e) {
          var rect = iframe.getBoundingClientRect();
          var docY = Math.max(0, Math.min(rect.height - 1, e.clientY - rect.top));
          var docX = Math.max(0, Math.min(rect.width - 1, e.clientX - rect.left));
          var el = doc.elementFromPoint(docX, docY) || e.target;
          var needles = collectNeedles(el, doc);
          var ratio = docY / Math.max(1, rect.height);
          root.__rsHtmlOpenCtx = { ratio: ratio, needles: needles, docY: docY };
          root.dataset.rsHtmlPreviewScrollRatio = String(ratio);
          if (needles.length) root.dataset.rsHtmlPreviewNeedles = JSON.stringify(needles);
        },
        true
      );
    } catch (e1) {
      /* ignore */
    }
  }

  function hookPreviewScroll() {
    if (window.__rsHtmlBlockScrollHook) return;
    window.__rsHtmlBlockScrollHook = true;
    window.addEventListener(
      "scroll",
      function () {
        findBlockRoots().forEach(function (root) {
          captureBlockViewportRatio(root);
        });
      },
      { passive: true, capture: true }
    );
  }

  function readPreviewNeedles(root) {
    try {
      var raw = root.dataset.rsHtmlPreviewNeedles || "";
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e0) {
      return [];
    }
  }

  function scrollTextareaToLine(ta, line) {
    if (!ta) return;
    var lines = ta.value.split("\n");
    line = Math.max(0, Math.min(line, lines.length - 1));
    var pos = 0;
    for (var i = 0; i < line; i++) pos += lines[i].length + 1;
    var computed = window.getComputedStyle(ta);
    var fontSize = parseFloat(computed.fontSize) || 13;
    var lineHeight = parseFloat(computed.lineHeight);
    if (!lineHeight || lineHeight < fontSize) lineHeight = fontSize * 1.55;
    var padTop = parseFloat(computed.paddingTop) || 0;
    function applyScroll() {
      ta.focus({ preventScroll: true });
      ta.setSelectionRange(pos, pos);
      ta.scrollTop = Math.max(0, line * lineHeight - ta.clientHeight * 0.38 + padTop);
    }
    applyScroll();
    requestAnimationFrame(function () {
      applyScroll();
    });
  }

  function scrollTextareaToNeedles(ta, needles, expectedRatio) {
    if (!ta || !needles || !needles.length) return false;
    var lineCount = ta.value.split("\n").length;
    var expectedLine = Math.round((expectedRatio || 0) * Math.max(0, lineCount - 1));
    var bestIdx = -1;
    var bestLine = -1;
    var bestDist = Infinity;
    for (var i = 0; i < needles.length; i++) {
      var needle = needles[i];
      if (!needle || needle.length < 3) continue;
      var idx = ta.value.indexOf(needle);
      if (idx < 0) continue;
      var line = ta.value.slice(0, idx).split("\n").length - 1;
      var dist = Math.abs(line - expectedLine);
      if (bestIdx < 0 || dist < bestDist || (dist === bestDist && idx > bestIdx)) {
        bestIdx = idx;
        bestLine = line;
        bestDist = dist;
      }
    }
    if (bestIdx < 0) return false;
    if (expectedRatio > 0.08 && bestLine <= 2 && expectedLine > lineCount * 0.12) return false;
    scrollTextareaToLine(ta, bestLine);
    return true;
  }

  function scrollTextareaByRatio(ta, ratio) {
    if (!ta || !ta.value) return;
    ratio = Math.min(1, Math.max(0, ratio || 0));
    var lineCount = ta.value.split("\n").length;
    scrollTextareaToLine(ta, Math.round(ratio * Math.max(0, lineCount - 1)));
  }

  function focusTextareaAtPreviewContext(root, ta, ctx) {
    if (!ta || !root) return;
    ctx = ctx || resolveEditorContext(root);
    if (ctx.needles.length && scrollTextareaToNeedles(ta, ctx.needles, ctx.ratio)) return;
    scrollTextareaByRatio(ta, ctx.ratio);
  }

  function getBodyShell(root) {
    return (
      root.querySelector(".uno-ere7q9") ||
      root.querySelector(".uno-6ld507") ||
      root.querySelector(".uno-7ilgb3") ||
      (root.children.length > 1 ? root.children[root.children.length - 1] : null)
    );
  }

  function refreshIframePreview(root, force) {
    var shell = getBodyShell(root);
    if (!shell) return;
    var source = fullSourceCache.has(root) ? fullSourceCache.get(root) : null;
    if (source == null) source = getCachedSource(root);
    if (source == null) {
      source = readSourceFromPm(root);
      if (source != null) cacheSource(root, source);
    }
    if (source == null) source = "";

    shell.classList.add("rs-html-preview-shell");
    var wrap = shell.querySelector("[data-rs-html-iframe-wrap]");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "rs-html-iframe-wrap";
      wrap.setAttribute("data-rs-html-iframe-wrap", "1");
      var iframe = document.createElement("iframe");
      iframe.setAttribute("data-rs-html-iframe", "1");
      iframe.setAttribute("title", "HTML 块预览");
      iframe.setAttribute("sandbox", cfg.previewSandbox || "allow-scripts allow-same-origin");
      wrap.appendChild(iframe);
      shell.appendChild(wrap);
    }

    var iframe = wrap.querySelector("iframe");
    if (!iframe) return;
    var sig = fnv1a(source);
    if (!force && iframe.dataset.rsHtmlSig === sig) {
      attachPreviewInteraction(iframe, root);
      return;
    }
    iframe.dataset.rsHtmlSig = sig;
    iframe.dataset.rsHtmlHeight = "";
    writeIframeDoc(iframe, source);
    iframe.onload = function () {
      if (root.querySelector(".mcwws-web-public-home-root")) {
        try {
          var idoc = iframe.contentDocument;
          if (idoc && idoc.documentElement) {
            idoc.documentElement.classList.add("mcwws-web-public-home-page");
          }
        } catch (e2) {
          /* ignore */
        }
      }
      attachPreviewInteraction(iframe, root);
      scheduleIframeResize(iframe);
    };
    scheduleIframeResize(iframe);
  }

  function assignBlockIndices(roots) {
    for (var i = 0; i < roots.length; i++) {
      roots[i].dataset.rsHtmlBlockIdx = String(i);
    }
  }

  function injectStyles() {
    if (document.getElementById("rs-html-block-fs-style")) return;
    var css =
      ".ProseMirror .rs-html-block-root > div:last-child{min-height:0!important;height:auto!important;max-width:none!important;width:100%!important}" +
      ".ProseMirror .rs-html-block-root .rs-html-preview-shell{min-height:0!important;max-width:none!important;width:100%!important;padding:0!important}" +
      ".ProseMirror .rs-html-block-root .rs-html-preview-shell>.uno-zdzflf," +
      ".ProseMirror .rs-html-block-root .rs-html-preview-shell>.uno-xqe6dm," +
      ".ProseMirror .rs-html-block-root .rs-html-preview-shell>div:not(.rs-html-iframe-wrap){display:none!important;height:0!important;min-height:0!important;max-height:0!important;overflow:hidden!important;visibility:hidden!important;margin:0!important;padding:0!important;border:0!important}" +
      ".ProseMirror .rs-html-block-root .rs-html-iframe-wrap{width:100%;min-height:72px;background:transparent}" +
      ".ProseMirror .rs-html-block-root .rs-html-iframe-wrap iframe{width:100%;border:0;display:block;background:transparent;min-height:96px;max-height:12000px;overflow:hidden!important}" +
      ".ProseMirror .rs-html-block-root .rs-html-hide-native{display:none!important}" +
      ".ProseMirror .rs-html-block-root .cm-editor," +
      ".ProseMirror .rs-html-block-root div:has(> .cm-editor){display:none!important;height:0!important;min-height:0!important;max-height:0!important;overflow:hidden!important;visibility:hidden!important;margin:0!important;padding:0!important;border:0!important}" +
      ".ProseMirror .rs-html-block-root.rs-html-fs-sync .cm-editor," +
      ".ProseMirror .rs-html-block-root.rs-html-fs-sync div:has(> .cm-editor){display:flex!important;position:fixed!important;left:-99999px!important;top:0!important;width:900px!important;height:700px!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;max-height:none!important}" +
      ".ProseMirror .rs-html-block-root [data-rs-html-fs-btn]{margin-left:8px;border:1px solid #409eff;background:#409eff;color:#fff;border-radius:6px;padding:5px 12px;font-size:12px;cursor:pointer;line-height:1.4;font-weight:600}" +
      ".ProseMirror .rs-html-block-root [data-rs-html-fs-btn]:hover{filter:brightness(1.06)}" +
      ".ProseMirror .rs-html-block-root [data-rs-html-repair-btn]{margin-left:6px;border:1px solid #e6a23c;background:#fdf6ec;color:#e6a23c;border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer;line-height:1.4;font-weight:600}" +
      ".ProseMirror .rs-html-block-root [data-rs-html-repair-btn]:hover{filter:brightness(0.98)}" +
      "#rs-html-fs-overlay{position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:rgba(10,10,12,.72);backdrop-filter:blur(4px);color:#d4d4d4;opacity:0;visibility:hidden;pointer-events:none;transition:opacity .26s ease,visibility .26s ease,background .26s ease}" +
      "#rs-html-fs-overlay.rs-html-fs-open{opacity:1;visibility:visible;pointer-events:auto;background:rgba(10,10,12,.88)}" +
      "#rs-html-fs-overlay.rs-html-fs-hidden{display:flex!important;opacity:0!important;visibility:hidden!important;pointer-events:none!important}" +
      "#rs-html-fs-overlay .rs-html-fs-panel{display:flex;flex-direction:column;flex:1;min-height:0;background:#1e1e1e;box-shadow:0 18px 60px rgba(0,0,0,.45);transform:translateY(16px) scale(.985);opacity:0;transition:transform .32s cubic-bezier(.22,1,.36,1),opacity .28s ease}" +
      "#rs-html-fs-overlay.rs-html-fs-open .rs-html-fs-panel{transform:none;opacity:1}" +
      "@media (prefers-reduced-motion:reduce){#rs-html-fs-overlay,#rs-html-fs-overlay .rs-html-fs-panel{transition:none!important;transform:none!important}}" +
      "#rs-html-fs-overlay .rs-html-fs-toolbar{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #333;background:#252526;flex-shrink:0}" +
      "#rs-html-fs-overlay .rs-html-fs-title{font-size:14px;font-weight:600;color:#fff}" +
      "#rs-html-fs-overlay .rs-html-fs-actions{display:flex;gap:8px}" +
      "#rs-html-fs-overlay .rs-html-fs-actions button{border:1px solid #555;background:#333;color:#fff;border-radius:6px;padding:7px 16px;font-size:13px;cursor:pointer}" +
      "#rs-html-fs-overlay .rs-html-fs-actions button.primary{background:#409eff;border-color:#409eff}" +
      "#rs-html-fs-overlay .rs-html-fs-body{flex:1;min-height:0;padding:0}" +
      "#rs-html-fs-overlay .rs-html-fs-textarea{width:100%;height:100%;box-sizing:border-box;border:0;outline:none;resize:none;padding:16px 18px;font-family:Consolas,Monaco,'Courier New',monospace;font-size:13px;line-height:1.55;background:#1e1e1e;color:#d4d4d4;tab-size:2}";
    var tag = document.createElement("style");
    tag.id = "rs-html-block-fs-style";
    tag.textContent = css;
    document.head.appendChild(tag);
  }

  function isOverlayOpen() {
    return overlay && overlay.classList.contains("rs-html-fs-open");
  }

  function showFullscreenOverlay() {
    overlay.classList.remove("rs-html-fs-hidden");
    void overlay.offsetWidth;
    overlay.classList.add("rs-html-fs-open");
  }

  function hideFullscreenOverlay(cb) {
    if (!overlay || overlay.classList.contains("rs-html-fs-hidden")) {
      if (cb) cb();
      return;
    }
    if (overlay.__rsHtmlFsClosing) return;
    overlay.__rsHtmlFsClosing = true;
    overlay.classList.remove("rs-html-fs-open");
    var done = false;
    function finish() {
      if (done) return;
      done = true;
      overlay.removeEventListener("transitionend", onEnd);
      overlay.classList.add("rs-html-fs-hidden");
      overlay.__rsHtmlFsClosing = false;
      if (cb) cb();
    }
    function onEnd(e) {
      if (e.target !== overlay) return;
      finish();
    }
    overlay.addEventListener("transitionend", onEnd);
    setTimeout(finish, 320);
  }

  function ensureOverlay() {
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.id = "rs-html-fs-overlay";
    overlay.className = "rs-html-fs-hidden";
    overlay.innerHTML =
      '<div class="rs-html-fs-panel">' +
      '<div class="rs-html-fs-toolbar">' +
      '<span class="rs-html-fs-title">HTML 全屏编辑</span>' +
      '<div class="rs-html-fs-actions">' +
      '<button type="button" data-rs-html-fs-cancel>取消</button>' +
      '<button type="button" class="primary" data-rs-html-fs-done>完成</button>' +
      "</div></div>" +
      '<div class="rs-html-fs-body"><textarea class="rs-html-fs-textarea" spellcheck="false"></textarea></div>' +
      "</div>";
    document.body.appendChild(overlay);
    overlayTextarea = overlay.querySelector(".rs-html-fs-textarea");
    overlay.querySelector("[data-rs-html-fs-done]").addEventListener("click", function () {
      closeFullscreen(true);
    });
    overlay.querySelector("[data-rs-html-fs-cancel]").addEventListener("click", function () {
      closeFullscreen(false);
    });
    document.addEventListener("keydown", function (e) {
      if (!fsState || !isOverlayOpen()) return;
      if (e.key === "Escape") {
        e.preventDefault();
        closeFullscreen(false);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        closeFullscreen(true);
      }
    });
  }

  function normText(el) {
    return (el && (el.textContent || el.innerText) || "").replace(/\s+/g, " ").trim();
  }

  function blockHeaderMatches(el) {
    if (!el || !el.children || !el.children.length) return false;
    return BLOCK_LABEL_RE.test(normText(el.children[0]));
  }

  function isHtmlBlockRoot(el) {
    if (!el || el.nodeType !== 1) return false;
    var tag = el.tagName ? el.tagName.toLowerCase() : "";
    if (el.getAttribute("contenteditable") !== "false" && tag !== "node-view-wrapper") return false;
    return blockHeaderMatches(el);
  }

  function getPm() {
    return document.querySelector(".ProseMirror");
  }

  function getPmView() {
    var bound = window.__rsHtmlBlockEditor;
    if (bound && bound.view) return bound.view;
    var el = getPm();
    if (!el) return null;
    if (el.pmViewDesc && el.pmViewDesc.view) return el.pmViewDesc.view;
    if (el.__view) return el.__view;
    if (el.editorView) return el.editorView;
    var cur = el;
    while (cur) {
      if (cur.pmViewDesc && cur.pmViewDesc.view) return cur.pmViewDesc.view;
      if (cur.__view) return cur.__view;
      cur = cur.parentElement;
    }
    cur = el.firstElementChild;
    while (cur) {
      if (cur.pmViewDesc && cur.pmViewDesc.view) return cur.pmViewDesc.view;
      cur = cur.firstElementChild;
    }
    return null;
  }

  function findBlockRoots() {
    var pm = getPm();
    if (!pm) return [];
    var seen = new Set();
    var out = [];
    function add(el) {
      if (!el || seen.has(el)) return;
      var cur = el;
      while (cur && cur !== pm) {
        if (isHtmlBlockRoot(cur) && pm.contains(cur)) {
          if (!seen.has(cur)) {
            seen.add(cur);
            out.push(cur);
          }
          return;
        }
        cur = cur.parentElement;
      }
    }
    pm.querySelectorAll(
      "node-view-wrapper, [class*='uno-vw5xng'], .cm-editor, [contenteditable='false']"
    ).forEach(add);
    return out;
  }

  function blockIndex(root) {
    if (root && root.dataset.rsHtmlBlockIdx != null) {
      return parseInt(root.dataset.rsHtmlBlockIdx, 10);
    }
    var roots = findBlockRoots();
    return roots.indexOf(root);
  }

  function findHtmlEditedAt(view, idx) {
    var hit = null;
    var n = 0;
    view.state.doc.descendants(function (node, pos) {
      if (node.type.name !== "html_edited") return;
      if (n === idx) {
        hit = { pos: pos, node: node };
        return false;
      }
      n++;
    });
    return hit;
  }

  function hintTextForRoot(root) {
    var cm = readCmText(root);
    if (cm) return cm;
    if (sourceCache.has(root)) return sourceCache.get(root);
    return "";
  }

  function findHtmlEditedForRoot(view, root) {
    var idx = blockIndex(root);
    var hint = hintTextForRoot(root);
    var hintSig = blockSignature(hint);
    var byIdx = idx >= 0 ? findHtmlEditedAt(view, idx) : null;

    if (byIdx && hintSig) {
      var idxText = byIdx.node.textContent || "";
      if (blockSignature(idxText) === hintSig) return byIdx;
      if (hint.length >= 40) {
        if (idxText.indexOf(hint.slice(0, 60)) === 0 || hint.indexOf(idxText.slice(0, 60)) === 0) {
          return byIdx;
        }
      }
    }
    if (byIdx && !hint) return byIdx;

    var best = null;
    var bestScore = -1;
    view.state.doc.descendants(function (node, pos) {
      if (node.type.name !== "html_edited") return;
      var t = node.textContent || "";
      var ts = blockSignature(t);
      var score = 0;
      if (hintSig && ts === hintSig) score = 1000 + t.length;
      else if (hint.length >= 40 && t.indexOf(hint.slice(0, 80)) === 0) score = 900 + t.length;
      else if (hint.length >= 40 && hint.indexOf(t.slice(0, 80)) === 0) score = 800 + t.length;
      if (score > bestScore) {
        bestScore = score;
        best = { pos: pos, node: node };
      }
    });
    return best || byIdx;
  }

  function readSourceFromPm(root) {
    var view = getPmView();
    if (!view) return null;
    var hit = findHtmlEditedForRoot(view, root);
    return hit ? hit.node.textContent : null;
  }

  function writeSourceToPm(root, text, cb) {
    waitFor(
      function () {
        return !!getPmView();
      },
      function () {
        writeSourceToPmNow(root, text, cb);
      },
      0,
      40
    );
  }

  function writeSourceToPmNow(root, text, cb) {
    var view = getPmView();
    if (!view) {
      if (cb) cb(false);
      return;
    }
    var hit = findHtmlEditedForRoot(view, root);
    if (!hit) {
      console.warn("[rs-html-block-compact] 未找到 html_edited 节点，无法写入");
      if (cb) cb(false);
      return;
    }
    var from = hit.pos + 1;
    var to = hit.pos + hit.node.nodeSize - 1;
    try {
      var tr = view.state.tr.replaceWith(from, to, view.state.schema.text(text));
      view.dispatch(tr);
      cacheSource(root, text);
      root.dataset.rsHtmlPreviewSig = "";
      refreshIframePreview(root, true);
      if (cb) cb(true);
    } catch (e0) {
      console.error("[rs-html-block-compact] PM 写入失败", e0);
      if (cb) cb(false);
    }
  }

  function readBestSource(root) {
    var pmText = readSourceFromPm(root);
    if (pmText != null && pmText.length > 0) return pmText;
    if (root.querySelector(".cm-editor .cm-line")) {
      var cmText = readCmText(root);
      if (cmText) return cmText;
    }
    var cached = getCachedSource(root);
    return cached != null ? cached : "";
  }

  function cacheSource(root, text) {
    if (typeof text === "string") sourceCache.set(root, text);
  }

  function getCachedSource(root) {
    if (sourceCache.has(root)) return sourceCache.get(root);
    var pmText = readSourceFromPm(root);
    if (pmText != null) {
      cacheSource(root, pmText);
      return pmText;
    }
    return null;
  }

  function editorPostNameFromUrl() {
    try {
      var q = new URLSearchParams(location.search).get("name");
      if (q) return q;
    } catch (e0) {
      /* ignore */
    }
    var m = location.pathname.match(/\/console\/posts\/([0-9a-f-]{36})\/editor/i);
    if (m) return m[1];
    m = location.pathname.match(/\/posts\/([0-9a-f-]{36})/i);
    if (m) return m[1];
    var manual = document.querySelector("#halo-manual-id");
    if (manual && manual.textContent) return manual.textContent.trim();
    return "";
  }

  function getCookie(name) {
    var m = document.cookie.match(
      new RegExp("(?:^|; )" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "=([^;]*)")
    );
    return m ? decodeURIComponent(m[1]) : "";
  }

  function apiHeaders() {
    var headers = { Accept: "application/json" };
    var xsrf = getCookie("XSRF-TOKEN");
    if (xsrf) headers["X-XSRF-TOKEN"] = xsrf;
    return headers;
  }

  function repairMinDiff() {
    return typeof cfg.repairMinDiff === "number" ? cfg.repairMinDiff : 64;
  }

  function blockSignature(text) {
    if (!text) return "";
    if (text.indexOf("wd-smart-card") >= 0) return "wd-smart-card";
    if (text.indexOf("mcwws-web-public-home-root") >= 0) return "web-home";
    if (text.indexOf("nav-quote-box") >= 0) return "nav-quote-box";
    if (text.indexOf("halo-manual-id") >= 0) return "manual-id";
    return "generic-" + fnv1a(text.slice(0, 160));
  }

  function indexBlocksBySignature(blocks) {
    var map = {};
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      if (!b) continue;
      var sig = blockSignature(b);
      if (!map[sig] || b.length > map[sig].length) map[sig] = b;
    }
    return map;
  }

  function bestServerBlockFor(pmText, idx, blocks, bySig) {
    var pm = pmText || "";
    var sig = blockSignature(pm);
    if (sig && bySig[sig] && needsRepair(pm, bySig[sig])) return bySig[sig];
    if (blocks[idx] && needsRepair(pm, blocks[idx])) return blocks[idx];
    if (pm.length >= 32) {
      var head = pm.slice(0, Math.min(120, pm.length));
      for (var key in bySig) {
        if (bySig[key].indexOf(head) === 0 && needsRepair(pm, bySig[key])) return bySig[key];
      }
    }
    return null;
  }

  function snippetUrlForBlock(pmText) {
    var snippets = cfg.repairSnippets || {
      "wd-smart-card": "/upload/wiki-data/snippets/wander-card-block.snippet.html",
    };
    return snippets[blockSignature(pmText)] || null;
  }

  function isTruncatedBlock(text) {
    if (!text) return false;
    var sig = blockSignature(text);
    if (sig === "wd-smart-card") {
      var hasCardDom =
        text.indexOf('id="wanderCard"') >= 0 ||
        text.indexOf("id='wanderCard'") >= 0 ||
        text.indexOf("wander-smart-container") >= 0;
      var hasScript = text.indexOf("</script>") >= 0;
      if (!hasCardDom || !hasScript) return true;
      if (text.length < 5500) return true;
      return false;
    }
    if (sig === "nav-quote-box") {
      return text.length < 600;
    }
    if (text.indexOf("<script") >= 0 && text.indexOf("</script>") < 0) return true;
    if (text.indexOf("<style") >= 0 && text.indexOf("</style>") < 0) return true;
    return false;
  }

  function fetchSnippetText(pmText, cb) {
    var url = snippetUrlForBlock(pmText);
    if (!url) {
      cb(null);
      return;
    }
    fetch(absAssetUrl(url) + (url.indexOf("?") >= 0 ? "" : "?v=1"), { credentials: "include" })
      .then(function (r) {
        if (!r.ok) throw new Error("http " + r.status);
        return r.text();
      })
      .then(function (text) {
        cb((text || "").trim() || null);
      })
      .catch(function () {
        cb(null);
      });
  }

  function resolveFullSource(root, cb) {
    var local = readBestSource(root) || "";
    if (fullSourceCache.has(root)) {
      cb(fullSourceCache.get(root));
      return;
    }
    if (!isTruncatedBlock(local) && local.length >= 1800) {
      cb(local);
      return;
    }
    fetchServerHtmlBlocks(function (blocks) {
      var bySig = blocks ? indexBlocksBySignature(blocks) : {};
      var idx = blockIndex(root);
      var serverText = blocks ? bestServerBlockFor(local, idx, blocks, bySig) : null;
      if (serverText && needsRepair(local, serverText)) {
        fullSourceCache.set(root, serverText);
        cb(serverText);
        return;
      }
      fetchSnippetText(local, function (snippet) {
        if (snippet && needsRepair(local, snippet)) {
          fullSourceCache.set(root, snippet);
          cb(snippet);
        } else {
          cb(local);
        }
      });
    });
  }

  function findCm6View(root) {
    var editorEl = root.querySelector(".cm-editor");
    if (!editorEl) return null;
    if (editorEl.cmView) return editorEl.cmView;
    if (editorEl.editorView) return editorEl.editorView;
    var stack = [editorEl];
    while (stack.length) {
      var n = stack.pop();
      if (n && n.dispatch && n.state && n.dom) return n;
      if (!n || !n.children) continue;
      for (var i = 0; i < n.children.length; i++) stack.push(n.children[i]);
    }
    return null;
  }

  function syncWriteCm(root, text, cb) {
    root.classList.add("rs-html-fs-sync");
    if (!isInlineEditMode(root)) clickHeaderButton(root, "编辑");
    waitFor(
      function () {
        return findCm6View(root) || root.querySelector(".cm-editor .cm-line");
      },
      function () {
        var cmView = findCm6View(root);
        if (cmView && cmView.dispatch) {
          try {
            cmView.dispatch({
              changes: { from: 0, to: cmView.state.doc.length, insert: text },
            });
            setTimeout(function () {
              root.classList.remove("rs-html-fs-sync");
              cacheSource(root, text);
              fullSourceCache.set(root, text);
              if (cb) cb(true);
            }, 180);
            return;
          } catch (eCm) {
            console.warn("[rs-html-block-compact] CM 写入失败", eCm);
          }
        }
        root.classList.remove("rs-html-fs-sync");
        if (cb) cb(false);
      },
      0,
      50
    );
  }

  function writeSourceToBlock(root, text, cb) {
    writeSourceToPm(root, text, function (okPm) {
      if (okPm) {
        fullSourceCache.set(root, text);
        cacheSource(root, text);
        if (cb) cb(true);
        return;
      }
      syncWriteCm(root, text, function (okCm) {
        if (okCm) {
          writeSourceToPmNow(root, text, function (okPm2) {
            if (cb) cb(okPm2 || okCm);
          });
          return;
        }
        if (cb) cb(false);
      });
    });
  }

  function trySnippetRepair(root, pmText, cb) {
    var url = snippetUrlForBlock(pmText);
    if (!url || !pmText) {
      if (cb) cb(false);
      return;
    }
    if (!isTruncatedBlock(pmText) && pmText.length >= 1800) {
      if (cb) cb(false);
      return;
    }
    fetch(absAssetUrl(url) + (url.indexOf("?") >= 0 ? "" : "?v=1"), { credentials: "include" })
      .then(function (r) {
        if (!r.ok) throw new Error("http " + r.status);
        return r.text();
      })
      .then(function (text) {
        text = (text || "").trim();
        if (text && needsRepair(pmText, text)) {
          writeSourceToBlock(root, text, cb);
        } else if (cb) cb(false);
      })
      .catch(function (err) {
        console.warn("[rs-html-block-compact] 备份片段加载失败:", url, err);
        if (cb) cb(false);
      });
  }

  function maybeAutoRepairBlock(root, cb) {
    cb = cb || function () {};
    if (root.dataset.rsHtmlRepaired === "1") {
      cb(false);
      return;
    }
    if (root.dataset.rsHtmlRepairing === "1") {
      cb(false);
      return;
    }
    var text = readBestSource(root);
    if (!isTruncatedBlock(text)) {
      cb(false);
      return;
    }
    root.dataset.rsHtmlRepairing = "1";
    console.log(
      "[rs-html-block-compact] 检测到截断块 sig=" +
        blockSignature(text) +
        " len=" +
        text.length +
        "，尝试修复…"
    );

    function done(ok, source) {
      root.dataset.rsHtmlRepairing = "";
      if (ok) {
        root.dataset.rsHtmlRepaired = "1";
        console.log("[rs-html-block-compact] 截断块已修复 source=" + (source || "?"));
      }
      cb(ok);
    }

    trySnippetRepair(root, text, function (okSnippet) {
      if (okSnippet) {
        done(true, "snippet");
        return;
      }
      fetchServerHtmlBlocks(function (blocks) {
        if (!blocks || !blocks.length) {
          done(false);
          return;
        }
        var bySig = indexBlocksBySignature(blocks);
        var idx = blockIndex(root);
        var serverText = bestServerBlockFor(text, idx, blocks, bySig);
        if (serverText && needsRepair(text, serverText)) {
          writeSourceToBlock(root, serverText, function (okSrv) {
            done(okSrv, "server");
          });
        } else {
          done(false);
        }
      });
    });
  }

  function scheduleRepairWhenReady(force) {
    if (!force && serverRepairDone) return;
    if (cfg.autoRepairFromServer === false) return;
    if (repairScheduled) return;
    var roots = findBlockRoots();
    if (!roots.length) return;
    if (!getPmView()) return;
    repairScheduled = true;
    repairAttemptCount++;
    if (repairAttemptCount > 1) serverBlocksCache = null;
    console.log(
      "[rs-html-block-compact] 块已就绪，开始服务器修复 (" +
        repairAttemptCount +
        "/" +
        REPAIR_MAX_ATTEMPTS +
        ")…"
    );
    repairAllFromServer(function (n, blocks, err) {
      repairScheduled = false;
      if (n > 0) prepareAllBlocks();
      finalizeRepairAttempt(n, blocks, err);
    });
  }

  function parseHtmlEditedBlocks(raw) {
    if (!raw) return [];
    var blocks = [];
    var re = /<div\s+class=(?:"html-edited"|'html-edited')[^>]*>/gi;
    var m;
    while ((m = re.exec(raw)) !== null) {
      var start = m.index + m[0].length;
      var depth = 1;
      var i = start;
      while (i < raw.length && depth > 0) {
        var nextOpen = raw.indexOf("<div", i);
        var nextClose = raw.indexOf("</div>", i);
        if (nextClose === -1) break;
        if (nextOpen !== -1 && nextOpen < nextClose) {
          depth++;
          i = nextOpen + 4;
        } else {
          depth--;
          if (depth === 0) {
            blocks.push(raw.slice(start, nextClose));
            break;
          }
          i = nextClose + 6;
        }
      }
    }
    return blocks;
  }

  function mergeBlockLists(lists) {
    var maxLen = 0;
    for (var li = 0; li < lists.length; li++) {
      maxLen = Math.max(maxLen, lists[li].length);
    }
    var merged = [];
    for (var i = 0; i < maxLen; i++) {
      var best = "";
      for (var lj = 0; lj < lists.length; lj++) {
        var part = lists[lj][i];
        if (part && part.length > best.length) best = part;
      }
      merged.push(best);
    }
    return merged;
  }

  function rawFromPostJson(data) {
    if (!data) return null;
    if (typeof data.raw === "string" && data.raw) return data.raw;
    var ann = data.metadata && data.metadata.annotations;
    if (!ann) return null;
    var cj = ann["content.halo.run/content-json"];
    if (!cj) return null;
    try {
      var parsed = JSON.parse(cj);
      return parsed.raw || parsed.content || null;
    } catch (e1) {
      return null;
    }
  }

  function fetchJson(url) {
    return fetch(url, { credentials: "include", headers: apiHeaders() }).then(function (r) {
      if (!r.ok) throw new Error("http " + r.status);
      return r.json();
    });
  }

  function rawFromSnapshotJson(data) {
    if (!data || !data.spec) return null;
    return data.spec.rawPatch || data.spec.contentPatch || null;
  }

  function snapshotNameFromPost(post) {
    if (!post) return "";
    var spec = post.spec || {};
    var ann = (post.metadata && post.metadata.annotations) || {};
    return (
      spec.releaseSnapshot ||
      spec.headSnapshot ||
      spec.baseSnapshot ||
      ann["content.halo.run/last-released-snapshot"] ||
      ""
    );
  }

  function tryFetchRawFromUrls(urls, extractor, cb) {
    var i = 0;
    function next() {
      if (i >= urls.length) {
        cb(null);
        return;
      }
      fetchJson(urls[i])
        .then(function (data) {
          var raw = extractor(data);
          if (raw) cb(raw);
          else {
            i++;
            next();
          }
        })
        .catch(function () {
          i++;
          next();
        });
    }
    next();
  }

  function fetchSnapshotRawHtml(postName, cb) {
    fetchJson("/apis/uc.api.content.halo.run/v1alpha1/posts/" + encodeURIComponent(postName))
      .then(function (post) {
        var snapName = snapshotNameFromPost(post);
        if (!snapName) {
          cb(null);
          return;
        }
        var encSnap = encodeURIComponent(snapName);
        tryFetchRawFromUrls(
          [
            "/apis/content.halo.run/v1alpha1/snapshots/" + encSnap,
            "/apis/uc.api.content.halo.run/v1alpha1/snapshots/" + encSnap,
            "/apis/api.console.halo.run/v1alpha1/snapshots/" + encSnap,
          ],
          rawFromSnapshotJson,
          cb
        );
      })
      .catch(function () {
        cb(null);
      });
  }

  function fetchAllServerRawHtml(cb) {
    var postName = editorPostNameFromUrl();
    if (!postName) {
      cb([], [], "no-post-name");
      return;
    }
    var enc = encodeURIComponent(postName);
    var sources = [
      {
        url: "/apis/uc.api.content.halo.run/v1alpha1/posts/" + enc + "/draft",
        tag: "draft",
        extract: rawFromPostJson,
      },
      {
        url: "/apis/uc.api.content.halo.run/v1alpha1/posts/" + enc,
        tag: "post",
        extract: rawFromPostJson,
      },
      {
        url: "/apis/api.content.halo.run/v1alpha1/posts/" + enc,
        tag: "post-public",
        extract: rawFromPostJson,
      },
    ];
    var raws = [];
    var tags = [];
    var pending = sources.length + 1;

    function finish() {
      if (tags.length) {
        console.log(
          "[rs-html-block-compact] 内容来源: " +
            tags.join(", ") +
            " | raw长度: " +
            raws.map(function (r) {
              return r.length;
            }).join("/")
        );
      }
      cb(raws, tags, raws.length ? null : "fetch-failed");
    }

    fetchSnapshotRawHtml(postName, function (snapRaw) {
      if (snapRaw) {
        raws.push(snapRaw);
        tags.push("snapshot");
      }
      pending--;
      if (pending === 0) finish();
    });

    sources.forEach(function (src) {
      fetchJson(src.url)
        .then(function (data) {
          var raw = src.extract(data);
          if (raw) {
            raws.push(raw);
            tags.push(src.tag);
          }
        })
        .catch(function () {
          /* ignore */
        })
        .finally(function () {
          pending--;
          if (pending === 0) finish();
        });
    });
  }

  function fetchServerHtmlBlocks(cb) {
    if (serverBlocksCache) {
      cb(serverBlocksCache, null);
      return;
    }
    fetchAllServerRawHtml(function (raws, tags, err) {
      if (!raws.length) {
        cb(null, err);
        return;
      }
      var lists = raws.map(parseHtmlEditedBlocks);
      serverBlocksCache = mergeBlockLists(lists);
      cb(serverBlocksCache, null);
    });
  }

  function needsRepair(pmText, serverText) {
    if (!serverText) return isTruncatedBlock(pmText);
    pmText = pmText || "";
    if (isTruncatedBlock(pmText) && !isTruncatedBlock(serverText)) return true;
    var minDiff = repairMinDiff();
    if (serverText.length <= pmText.length + minDiff) return false;
    if (!pmText.length) return true;
    if (serverText.indexOf(pmText) === 0) return true;
    if (pmText.length < serverText.length * 0.85) return true;
    return false;
  }

  function countBlocksStillTruncated(blocks) {
    var roots = findBlockRoots();
    if (!roots.length) return 0;
    var bySig = blocks ? indexBlocksBySignature(blocks) : {};
    var pending = 0;
    roots.forEach(function (root, i) {
      var pmText = readSourceFromPm(root) || "";
      if (isTruncatedBlock(pmText)) {
        pending++;
        return;
      }
      if (!blocks || !blocks.length) return;
      var serverText = bestServerBlockFor(pmText, i, blocks, bySig);
      if (serverText && needsRepair(pmText, serverText)) pending++;
    });
    return pending;
  }

  function finalizeRepairAttempt(repaired, blocks, err) {
    var still = countBlocksStillTruncated(blocks);
    if (repaired > 0) {
      console.log(
        "[rs-html-block-compact] 已修复 " +
          repaired +
          " 个块" +
          (still > 0 ? "，仍有 " + still + " 个待检查" : "")
      );
    }
    if (still === 0) {
      serverRepairDone = true;
      if (repaired === 0 && repairAttemptCount === 1) {
        console.log("[rs-html-block-compact] 所有 HTML 块长度正常");
      }
      return;
    }
    if (repairAttemptCount >= REPAIR_MAX_ATTEMPTS) {
      serverRepairDone = true;
      console.warn(
        "[rs-html-block-compact] 已达最大修复次数 (" +
          REPAIR_MAX_ATTEMPTS +
          ")，仍有 " +
          still +
          " 个块可能截断；可点「从服务器恢复」或执行 RSHtmlBlockCompact.repairNow()"
      );
      if (err) console.warn("[rs-html-block-compact] 末次服务器读取:", err);
      return;
    }
    serverRepairDone = false;
    var delay = Math.min(600 + repairAttemptCount * 500, 6000);
    console.log(
      "[rs-html-block-compact] " +
        still +
        " 个块仍可能截断，" +
        delay +
        "ms 后重试 (" +
        repairAttemptCount +
        "/" +
        REPAIR_MAX_ATTEMPTS +
        ")…"
    );
    setTimeout(function () {
      scheduleRepairWhenReady(true);
    }, delay);
  }

  function repairBlockFromServer(root, serverText, cb) {
    var pmText = readSourceFromPm(root) || "";
    if (!needsRepair(pmText, serverText)) {
      trySnippetRepair(root, pmText, cb);
      return;
    }
    writeSourceToBlock(root, serverText, cb);
  }

  function repairAllFromServer(cb) {
    if (cfg.autoRepairFromServer === false) {
      if (cb) cb(0, null, null);
      return;
    }
    if (!getPmView()) {
      if (cb) cb(0, null, "no-pm-view");
      return;
    }
    fetchServerHtmlBlocks(function (blocks, err) {
      var roots = findBlockRoots();
      assignBlockIndices(roots);
      if (!roots.length) {
        repairScheduled = false;
        if (cb) cb(0, blocks, err);
        return;
      }
      if (!blocks || !blocks.length) {
        if (err) {
          console.warn("[rs-html-block-compact] 服务器块读取失败:", err);
        }
        var onlyPending = roots.length;
        var onlyRepaired = 0;
        roots.forEach(function (root) {
          var pmText = readSourceFromPm(root) || "";
          trySnippetRepair(root, pmText, function (ok) {
            if (ok) onlyRepaired++;
            onlyPending--;
            if (onlyPending === 0) {
              if (onlyRepaired > 0) {
                console.log(
                  "[rs-html-block-compact] 已从备份片段修复 " + onlyRepaired + " 个 HTML 块"
                );
              }
              if (cb) cb(onlyRepaired, serverBlocksCache, err);
            }
          });
        });
        return;
      }

      var bySig = indexBlocksBySignature(blocks);
      var sigKeys = [];
      for (var sk in bySig) sigKeys.push(sk + "=" + bySig[sk].length);
      console.log(
        "[rs-html-block-compact] 修复检查: PM块=" +
          roots.length +
          " 服务器块=" +
          blocks.length +
          " 特征=" +
          sigKeys.join(", ")
      );

      var repaired = 0;
      var pending = roots.length;
      roots.forEach(function (root, i) {
        var pmText = readSourceFromPm(root) || "";
        var serverText = bestServerBlockFor(pmText, i, blocks, bySig);
        console.log(
          "  #" +
            i +
            " sig=" +
            blockSignature(pmText) +
            " pm=" +
            pmText.length +
            (serverText ? " srv=" + serverText.length : " srv=—")
        );
        if (!serverText) {
          trySnippetRepair(root, pmText, function (ok) {
            if (ok) repaired++;
            pending--;
            if (pending === 0) finishRepair(repaired, cb, serverBlocksCache, err);
          });
          return;
        }
        repairBlockFromServer(root, serverText, function (ok) {
          if (ok) repaired++;
          pending--;
          if (pending === 0) finishRepair(repaired, cb, serverBlocksCache, err);
        });
      });
    });
  }

  function finishRepair(repaired, cb, blocks, err) {
    if (repaired > 0) {
      console.log("[rs-html-block-compact] 已自动修复 " + repaired + " 个截断 HTML 块");
    } else if (repairAttemptCount >= REPAIR_MAX_ATTEMPTS) {
      console.log("[rs-html-block-compact] 未发现可修复的截断块（draft 与 PM 可能均已损坏）");
    }
    if (cb) cb(repaired, blocks, err);
  }

  function injectRepairButton(root) {
    if (cfg.showRepairButton === false) return;
    if (root.querySelector("[data-rs-html-repair-btn]")) return;
    var header = getHeader(root);
    if (!header) return;
    var actions = header.children[header.children.length - 1];
    if (!actions) return;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.rsHtmlRepairBtn = "1";
    btn.textContent = "从服务器恢复";
    btn.title = "从已发布 Snapshot / 备份片段恢复完整 HTML（修复截断）";
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      serverBlocksCache = null;
      var idx = blockIndex(root);
      var pmText = readSourceFromPm(root) || "";
      if (!confirm("确定用服务器/备份中的完整内容覆盖当前块？未保存的本地修改将丢失。")) return;
      fetchServerHtmlBlocks(function (blocks) {
        var bySig = blocks ? indexBlocksBySignature(blocks) : {};
        var serverText = blocks ? bestServerBlockFor(pmText, idx, blocks, bySig) : null;
        if (serverText && needsRepair(pmText, serverText)) {
          writeSourceToBlock(root, serverText, function (ok) {
            if (ok) {
              ensurePreviewOnly(root);
              console.log("[rs-html-block-compact] 已手动恢复块 #" + idx + "（服务器）");
            } else {
              alert("恢复失败，请刷新后重试");
            }
          });
          return;
        }
        trySnippetRepair(root, pmText, function (ok2) {
          if (ok2) {
            ensurePreviewOnly(root);
            console.log("[rs-html-block-compact] 已手动恢复块 #" + idx + "（备份片段）");
          } else {
            alert("服务器与备份均无更长内容；请从 wiki/_halo/wander-card-block.snippet.html 手动粘贴");
          }
        });
      });
    });
    var fsBtn = actions.querySelector("[data-rs-html-fs-btn]");
    if (fsBtn) actions.insertBefore(btn, fsBtn);
    else actions.appendChild(btn);
  }

  function getHeader(root) {
    return root && root.children && root.children[0];
  }

  function headerButtons(root) {
    var header = getHeader(root);
    return header ? header.querySelectorAll("button") : [];
  }

  function clickHeaderButton(root, label) {
    var buttons = headerButtons(root);
    for (var i = 0; i < buttons.length; i++) {
      if (normText(buttons[i]) === label) {
        buttons[i].click();
        return true;
      }
    }
    return false;
  }

  function isSplitMode(root) {
    var buttons = headerButtons(root);
    for (var i = 0; i < buttons.length; i++) {
      if (normText(buttons[i]) === "退出分屏") return true;
    }
    return false;
  }

  function isInlineEditMode(root) {
    var buttons = headerButtons(root);
    for (var i = 0; i < buttons.length; i++) {
      if (normText(buttons[i]) === "预览") return true;
    }
    return false;
  }

  function hideNativeActions(root) {
    var buttons = headerButtons(root);
    for (var i = 0; i < buttons.length; i++) {
      var t = normText(buttons[i]);
      if (t === "分屏" || t === "退出分屏" || t === "编辑" || t === "预览") {
        buttons[i].classList.add("rs-html-hide-native");
      }
    }
  }

  function injectFullscreenButton(root) {
    if (root.querySelector("[data-rs-html-fs-btn]")) return;
    var header = getHeader(root);
    if (!header) return;
    var actions = header.children[header.children.length - 1];
    if (!actions) return;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.rsHtmlFsBtn = "1";
    btn.textContent = "全屏编辑";
    btn.addEventListener("mousedown", function () {
      root.__rsHtmlOpenCtx = resolveEditorContext(root);
    });
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      openFullscreen(root);
    });
    actions.appendChild(btn);
  }

  function readCmText(root) {
    var lines = root.querySelectorAll(".cm-editor .cm-line");
    if (!lines.length) return "";
    var parts = [];
    for (var i = 0; i < lines.length; i++) parts.push(lines[i].textContent || "");
    return parts.join("\n");
  }

  function waitFor(fn, cb, n, interval) {
    n = n || 0;
    interval = interval || 30;
    if (fn()) {
      cb();
      return;
    }
    if (n > 50) {
      cb();
      return;
    }
    setTimeout(function () {
      waitFor(fn, cb, n + 1, interval);
    }, interval);
  }

  function ensurePreviewOnly(root) {
    if (!root || (fsState && fsState.root === root)) return;
    root.classList.add("rs-html-block-root");
    hideNativeActions(root);
    injectRepairButton(root);
    injectFullscreenButton(root);

    var pmText = readBestSource(root);
    if (isTruncatedBlock(pmText) || (blockSignature(pmText) === "wd-smart-card" && pmText.length < 5500)) {
      if (root.dataset.rsHtmlResolveBusy === "1") return;
      root.dataset.rsHtmlResolveBusy = "1";
      resolveFullSource(root, function (full) {
        root.dataset.rsHtmlResolveBusy = "";
        if (full && full.length > (pmText || "").length + 64) {
          fullSourceCache.set(root, full);
          cacheSource(root, full);
          root.dataset.rsHtmlPreviewSig = "";
          refreshIframePreview(root, true);
          if (!root.dataset.rsHtmlPmWriteAttempted) {
            root.dataset.rsHtmlPmWriteAttempted = "1";
            writeSourceToBlock(root, full, function (ok) {
              if (ok) console.log("[rs-html-block-compact] PM/CM 已同步完整源码 len=" + full.length);
            });
          }
          return;
        }
        maybeAutoRepairBlock(root, function (ok) {
          if (ok) ensurePreviewOnly(root);
        });
      });
      return;
    }

    cacheSource(root, pmText);

    var sig = fnv1a(pmText);
    if (root.dataset.rsHtmlPreviewSig === sig && root.querySelector("[data-rs-html-iframe-wrap]")) {
      return;
    }
    root.dataset.rsHtmlPreviewSig = sig;
    refreshIframePreview(root, false);
  }

  function refreshAllIframePreviews(force) {
    findBlockRoots().forEach(function (root) {
      refreshIframePreview(root, !!force);
    });
  }

  function syncReadSource(root, cb) {
    var pmText = readSourceFromPm(root);
    if (pmText != null) {
      cacheSource(root, pmText);
      cb(pmText);
      return;
    }
    root.classList.add("rs-html-fs-sync");
    if (!isInlineEditMode(root)) clickHeaderButton(root, "编辑");
    waitFor(
      function () {
        return root.querySelector(".cm-editor .cm-line");
      },
      function () {
        var text = readCmText(root);
        cacheSource(root, text);
        root.classList.remove("rs-html-fs-sync");
        cb(text);
      }
    );
  }

  function setInlineEditorText(root, text, cb) {
    writeSourceToBlock(root, text, cb);
  }

  function openFullscreen(root) {
    if (fsState) return;
    ensureOverlay();
    var openCtx = root.__rsHtmlOpenCtx || resolveEditorContext(root);
    root.__rsHtmlOpenCtx = null;

    fsState = { root: root, initial: "", openCtx: openCtx };
    overlayTextarea.value = "";
    overlayTextarea.placeholder = "正在加载完整源码…";
    showFullscreenOverlay();

    resolveFullSource(root, function (full) {
      if (!fsState || fsState.root !== root) return;
      fsState.initial = full;
      overlayTextarea.value = full;
      overlayTextarea.placeholder = "";
      setTimeout(function () {
        if (fsState && fsState.root === root) {
          focusTextareaAtPreviewContext(root, overlayTextarea, fsState.openCtx);
        }
      }, 360);
      setTimeout(function () {
        if (fsState && fsState.root === root) {
          focusTextareaAtPreviewContext(root, overlayTextarea, fsState.openCtx);
        }
      }, 720);
    });
  }

  function closeFullscreen(save) {
    if (!fsState || overlay.__rsHtmlFsClosing) return;
    var root = fsState.root;
    var initial = fsState.initial;
    var next = save ? overlayTextarea.value : initial;

    hideFullscreenOverlay(function () {
      fsState = null;
      if (!save || next === initial) {
        ensurePreviewOnly(root);
        return;
      }

      cacheSource(root, next);
      fullSourceCache.set(root, next);
      setInlineEditorText(root, next, function () {
        ensurePreviewOnly(root);
      });
    });
  }

  function prepareAllBlocks() {
    var roots = findBlockRoots();
    assignBlockIndices(roots);
    roots.forEach(ensurePreviewOnly);
  }

  function hookDocument() {
    if (document.__rsHtmlBlockDocHook) return;
    document.addEventListener(
      "click",
      function (e) {
        var pm = getPm();
        if (!pm) return;
        var node = e.target;
        while (node && node !== pm) {
          if (isHtmlBlockRoot(node)) {
            var btn = e.target.closest ? e.target.closest("button") : null;
            if (btn && node.contains(btn)) {
              var t = normText(btn);
              if (t === "分屏" || t === "退出分屏") {
                e.preventDefault();
                e.stopImmediatePropagation();
              }
            }
            break;
          }
          node = node.parentElement;
        }
      },
      true
    );
    document.__rsHtmlBlockDocHook = true;
  }

  function watchNewBlocks(pm) {
    if (pm.__rsHtmlBlockNewMo) return;
    var timer = null;
    var mo = new MutationObserver(function (mutations) {
      var hit = false;
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        if (m.type !== "childList" || !m.addedNodes.length) continue;
        for (var j = 0; j < m.addedNodes.length; j++) {
          var n = m.addedNodes[j];
          if (n.nodeType !== 1) continue;
          if (isOurPreviewNode(n)) continue;
          if (
            (n.matches &&
              (n.matches(".html-edited") ||
                n.matches(".cm-editor") ||
                n.matches("[contenteditable='false']") ||
                n.matches("node-view-wrapper"))) ||
            (n.querySelector &&
              (n.querySelector(".html-edited") ||
                n.querySelector(".cm-editor") ||
                n.querySelector("[contenteditable='false']")))
          ) {
            hit = true;
            break;
          }
        }
        if (hit) break;
      }
      if (!hit) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        debouncedPrepareAllBlocks();
      }, 150);
    });
    mo.observe(pm, { childList: true, subtree: true });
    pm.__rsHtmlBlockNewMo = true;
  }

  function hookPmUpdates() {
    var view = getPmView();
    if (!view || view.__rsHtmlBlockPmHook) return;
    var orig = view.dispatch.bind(view);
    view.dispatch = function (tr) {
      var ret = orig(tr);
      if (tr.docChanged) {
        if (iframeRefreshTimer) clearTimeout(iframeRefreshTimer);
        iframeRefreshTimer = setTimeout(function () {
          findBlockRoots().forEach(function (root) {
            var pmText = readSourceFromPm(root);
            var cached = getCachedSource(root);
            if (pmText == null || pmText === cached) return;
            cacheSource(root, pmText);
            root.dataset.rsHtmlPreviewSig = "";
            refreshIframePreview(root, true);
          });
        }, 300);
      }
      return ret;
    };
    view.__rsHtmlBlockPmHook = true;
  }

  function boot() {
    if (!isCompactActive()) return false;
    var pm = getPm();
    if (!pm) return false;
    ensurePreviewAssets();
    injectStyles();
    ensureOverlay();
    hookPmUpdates();
    if (!pmHooked) {
      hookDocument();
      hookPreviewScroll();
      watchNewBlocks(pm);
      pmHooked = true;
    }
    prepareAllBlocks();
    scheduleRepairWhenReady();
    return true;
  }

  window.RSHtmlBlockCompact.init = boot;

  if (!window.__rsHtmlBlockPluginMode) {
    if (isCompactActive()) {
      [0, 50, 150, 350, 700, 1200, 2500, 5000, 8000, 12000, 20000].forEach(function (ms) {
        setTimeout(boot, ms);
      });
    }
  }

  console.log(
    "[rs-html-block-compact] v" +
      RS_HTML_BLOCK_VER +
      (window.__rsHtmlBlockPluginMode ? " 插件模式" : "") +
      " 已就绪：自动修复重试 + 预览定位源码"
  );

  window.RSHtmlBlockCompact.scheduleRepair = function () {
    serverBlocksCache = null;
    serverRepairDone = false;
    repairScheduled = false;
    scheduleRepairWhenReady(true);
  };

  window.RSHtmlBlockCompact.repairNow = function () {
    serverBlocksCache = null;
    serverRepairDone = false;
    repairScheduled = false;
    repairAttemptCount = 0;
    repairAllFromServer(function (n, blocks, err) {
      if (n > 0) prepareAllBlocks();
      finalizeRepairAttempt(n, blocks, err);
    });
  };

  window.RSHtmlBlockCompact.previewContext = function (idx) {
    var root =
      typeof idx === "number" || typeof idx === "string"
        ? document.querySelector('.rs-html-block-root[data-rs-html-block-idx="' + idx + '"]')
        : idx;
    return root ? resolveEditorContext(root) : null;
  };

  window.RSHtmlBlockCompact.getBlockRoots = findBlockRoots;
})();
