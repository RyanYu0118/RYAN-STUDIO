/* =======================================================
   RS Console — HTML 编辑块全屏编辑 v2.6
   iframe 预览：document.write + 脚本转义 + 高度/路径修复
   ======================================================= */
(function () {
  "use strict";

  if (location.pathname.indexOf("/console/posts/editor") < 0) return;

  var RS_HTML_BLOCK_VER = "2.6";
  if (window.RSHtmlBlockCompact && window.RSHtmlBlockCompact.__ver === RS_HTML_BLOCK_VER) {
    return;
  }
  window.RSHtmlBlockCompact = window.RSHtmlBlockCompact || {};
  window.RSHtmlBlockCompact.__ver = RS_HTML_BLOCK_VER;

  var cfg = (window.RSConfig && window.RSConfig.htmlBlockCompact) || {};
  if (cfg.enabled === false) return;

  var BLOCK_LABEL_RE = cfg.labelRe || /HTML\s*编辑块/;
  var sourceCache = new WeakMap();
  var fsState = null;
  var pmHooked = false;
  var overlay = null;
  var overlayTextarea = null;
  var previewAssetsReady = false;
  var iframeRefreshTimer = null;

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
        var url = href + (href.indexOf("?") >= 0 ? "" : "?v=1");
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
      "html,body{margin:0;padding:0;background:transparent;color:inherit;}" +
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

  function scheduleIframeResize(iframe, wrap) {
    if (!iframe) return;
    var delays = [0, 80, 250, 600, 1200];
    for (var i = 0; i < delays.length; i++) {
      (function (ms) {
        setTimeout(function () {
          resizeIframe(iframe);
        }, ms);
      })(delays[i]);
    }
    if (wrap && !wrap.__rsHtmlRo && typeof ResizeObserver !== "undefined") {
      wrap.__rsHtmlRo = new ResizeObserver(function () {
        resizeIframe(iframe);
      });
      wrap.__rsHtmlRo.observe(wrap);
    }
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
      var card = doc.querySelector(".wd-smart-card");
      var h = Math.max(
        doc.body ? doc.body.scrollHeight : 0,
        doc.documentElement ? doc.documentElement.scrollHeight : 0
      );
      if (card) {
        var rect = card.getBoundingClientRect();
        if (rect.height > 0) {
          h = Math.max(h, Math.ceil(rect.bottom + (doc.body.scrollTop || 0) + 16));
        }
      }
      iframe.style.height = Math.max(96, h + 20) + "px";
    } catch (e1) {
      /* ignore */
    }
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
    var source = getCachedSource(root);
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
      iframe.setAttribute("title", "HTML 块预览");
      iframe.setAttribute("sandbox", cfg.previewSandbox || "allow-scripts allow-same-origin");
      wrap.appendChild(iframe);
      shell.appendChild(wrap);
    }

    var iframe = wrap.querySelector("iframe");
    if (!iframe) return;
    var sig = fnv1a(source);
    if (!force && iframe.dataset.rsHtmlSig === sig) {
      scheduleIframeResize(iframe, wrap);
      return;
    }
    iframe.dataset.rsHtmlSig = sig;
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
      scheduleIframeResize(iframe, wrap);
    };
    scheduleIframeResize(iframe, wrap);
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
      ".ProseMirror .rs-html-block-root .rs-html-iframe-wrap iframe{width:100%;border:0;display:block;background:transparent;min-height:72px}" +
      ".ProseMirror .rs-html-block-root .rs-html-hide-native{display:none!important}" +
      ".ProseMirror .rs-html-block-root .cm-editor," +
      ".ProseMirror .rs-html-block-root div:has(> .cm-editor){display:none!important;height:0!important;min-height:0!important;max-height:0!important;overflow:hidden!important;visibility:hidden!important;margin:0!important;padding:0!important;border:0!important}" +
      ".ProseMirror .rs-html-block-root.rs-html-fs-sync .cm-editor," +
      ".ProseMirror .rs-html-block-root.rs-html-fs-sync div:has(> .cm-editor){display:flex!important;position:fixed!important;left:-99999px!important;top:0!important;width:900px!important;height:700px!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;max-height:none!important}" +
      ".ProseMirror .rs-html-block-root [data-rs-html-fs-btn]{margin-left:8px;border:1px solid #409eff;background:#409eff;color:#fff;border-radius:6px;padding:5px 12px;font-size:12px;cursor:pointer;line-height:1.4;font-weight:600}" +
      ".ProseMirror .rs-html-block-root [data-rs-html-fs-btn]:hover{filter:brightness(1.06)}" +
      "#rs-html-fs-overlay{position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:#1e1e1e;color:#d4d4d4}" +
      "#rs-html-fs-overlay.rs-html-fs-hidden{display:none!important}" +
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

  function ensureOverlay() {
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.id = "rs-html-fs-overlay";
    overlay.className = "rs-html-fs-hidden";
    overlay.innerHTML =
      '<div class="rs-html-fs-toolbar">' +
      '<span class="rs-html-fs-title">HTML 全屏编辑</span>' +
      '<div class="rs-html-fs-actions">' +
      '<button type="button" data-rs-html-fs-cancel>取消</button>' +
      '<button type="button" class="primary" data-rs-html-fs-done>完成</button>' +
      "</div></div>" +
      '<div class="rs-html-fs-body"><textarea class="rs-html-fs-textarea" spellcheck="false"></textarea></div>';
    document.body.appendChild(overlay);
    overlayTextarea = overlay.querySelector(".rs-html-fs-textarea");
    overlay.querySelector("[data-rs-html-fs-done]").addEventListener("click", function () {
      closeFullscreen(true);
    });
    overlay.querySelector("[data-rs-html-fs-cancel]").addEventListener("click", function () {
      closeFullscreen(false);
    });
    document.addEventListener("keydown", function (e) {
      if (!fsState || overlay.classList.contains("rs-html-fs-hidden")) return;
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
    var el = getPm();
    if (!el) return null;
    if (el.pmViewDesc && el.pmViewDesc.view) return el.pmViewDesc.view;
    var cur = el.firstElementChild;
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

  function readSourceFromPm(root) {
    var view = getPmView();
    if (!view) return null;
    var idx = blockIndex(root);
    if (idx < 0) return null;
    var n = 0;
    var text = null;
    view.state.doc.descendants(function (node) {
      if (node.type.name === "html_edited") {
        if (n === idx) {
          text = node.textContent;
          return false;
        }
        n++;
      }
    });
    return text;
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
    injectFullscreenButton(root);

    if (root.querySelector(".cm-editor .cm-line")) {
      cacheSource(root, readCmText(root));
    } else {
      var pmText = readSourceFromPm(root);
      if (pmText != null) cacheSource(root, pmText);
    }

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
    root.classList.add("rs-html-fs-sync");
    if (!isInlineEditMode(root)) clickHeaderButton(root, "编辑");
    waitFor(
      function () {
        return root.querySelector(".cm-editor .cm-content");
      },
      function () {
        var content = root.querySelector(".cm-editor .cm-content");
        if (content) {
          content.focus();
          try {
            document.execCommand("selectAll", false, null);
            document.execCommand("insertText", false, text);
          } catch (e1) {
            /* ignore */
          }
        }
        waitFor(
          function () {
            return readCmText(root).length > 0;
          },
          function () {
            cacheSource(root, readCmText(root));
            root.classList.remove("rs-html-fs-sync");
            refreshIframePreview(root, true);
            if (cb) cb();
          }
        );
      }
    );
  }

  function openFullscreen(root) {
    if (fsState) return;
    ensureOverlay();

    var cached = getCachedSource(root);
    fsState = { root: root, initial: cached != null ? cached : "" };

    overlayTextarea.value = cached != null ? cached : "";
    overlayTextarea.placeholder = cached != null ? "" : "正在加载源码…";
    overlay.classList.remove("rs-html-fs-hidden");
    overlayTextarea.focus();

    if (cached != null) return;

    syncReadSource(root, function (source) {
      if (!fsState || fsState.root !== root) return;
      fsState.initial = source;
      overlayTextarea.value = source;
      overlayTextarea.placeholder = "";
    });
  }

  function closeFullscreen(save) {
    if (!fsState) return;
    var root = fsState.root;
    var initial = fsState.initial;
    var next = save ? overlayTextarea.value : initial;
    fsState = null;
    overlay.classList.add("rs-html-fs-hidden");

    if (!save || next === initial) {
      ensurePreviewOnly(root);
      return;
    }

    cacheSource(root, next);
    setInlineEditorText(root, next, function () {
      ensurePreviewOnly(root);
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
      timer = setTimeout(prepareAllBlocks, 150);
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
            if (pmText != null) {
              cacheSource(root, pmText);
              refreshIframePreview(root, true);
            }
          });
        }, 200);
      }
      return ret;
    };
    view.__rsHtmlBlockPmHook = true;
  }

  function boot() {
    var pm = getPm();
    if (!pm) return false;
    ensurePreviewAssets();
    injectStyles();
    ensureOverlay();
    hookPmUpdates();
    if (!pmHooked) {
      hookDocument();
      watchNewBlocks(pm);
      pmHooked = true;
    }
    prepareAllBlocks();
    return true;
  }

  window.RSHtmlBlockCompact.init = boot;

  [0, 50, 150, 350, 700, 1200, 2500, 5000].forEach(function (ms) {
    setTimeout(boot, ms);
  });

  console.log(
    "[rs-html-block-compact] v" +
      RS_HTML_BLOCK_VER +
      " 已就绪：iframe 预览 v2.6（脚本/卡片高度已修复），全屏即时打开"
  );
})();
