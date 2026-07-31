/* =======================================================
   RS Console — HTML 编辑块全屏编辑 v3.0
   PM 直写 + 从已发布 Snapshot / 备份片段修复截断块
   ======================================================= */
(function () {
  "use strict";

  if (location.pathname.indexOf("/console/posts/editor") < 0) return;

  var RS_HTML_BLOCK_VER = "3.0";
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
  var prepareBlocksTimer = null;
  var iframeRefreshTimer = null;
  var serverBlocksCache = null;
  var serverRepairDone = false;
  var repairScheduled = false;

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
      iframe.setAttribute("sandbox", cfg.previewSandbox || "allow-scripts allow-same-origin");
      wrap.appendChild(iframe);
      shell.appendChild(wrap);
    }

    var iframe = wrap.querySelector("iframe");
    if (!iframe) return;
    var sig = fnv1a(source);
    if (!force && iframe.dataset.rsHtmlSig === sig) {
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

  function readSourceFromPm(root) {
    var view = getPmView();
    if (!view) return null;
    var idx = blockIndex(root);
    if (idx < 0) return null;
    var hit = findHtmlEditedAt(view, idx);
    return hit ? hit.node.textContent : null;
  }

  function writeSourceToPm(root, text, cb) {
    var view = getPmView();
    if (!view) {
      if (cb) cb(false);
      return;
    }
    var idx = blockIndex(root);
    if (idx < 0) {
      if (cb) cb(false);
      return;
    }
    var hit = findHtmlEditedAt(view, idx);
    if (!hit) {
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
      return new URLSearchParams(location.search).get("name") || "";
    } catch (e0) {
      return "";
    }
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

  function trySnippetRepair(root, pmText, cb) {
    var url = snippetUrlForBlock(pmText);
    if (!url || !pmText) {
      if (cb) cb(false);
      return;
    }
    if (pmText.length >= 1800) {
      if (cb) cb(false);
      return;
    }
    fetch(url + (url.indexOf("?") >= 0 ? "" : "?v=1"), { credentials: "include" })
      .then(function (r) {
        if (!r.ok) throw new Error("http " + r.status);
        return r.text();
      })
      .then(function (text) {
        text = (text || "").trim();
        if (text && needsRepair(pmText, text)) {
          writeSourceToPm(root, text, cb);
        } else if (cb) cb(false);
      })
      .catch(function () {
        if (cb) cb(false);
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
        url: "/apis/api.console.halo.run/v1alpha1/posts/" + enc,
        tag: "console-post",
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
    if (!serverText) return false;
    pmText = pmText || "";
    var minDiff = repairMinDiff();
    if (serverText.length <= pmText.length + minDiff) return false;
    if (!pmText.length) return true;
    if (serverText.indexOf(pmText) === 0) return true;
    if (pmText.length < serverText.length * 0.85) return true;
    return false;
  }

  function repairBlockFromServer(root, serverText, cb) {
    var pmText = readSourceFromPm(root) || "";
    if (!needsRepair(pmText, serverText)) {
      trySnippetRepair(root, pmText, cb);
      return;
    }
    writeSourceToPm(root, serverText, cb);
  }

  function repairAllFromServer(cb) {
    if (cfg.autoRepairFromServer === false) {
      if (cb) cb(0);
      return;
    }
    if (!getPmView()) {
      if (cb) cb(0);
      return;
    }
    fetchServerHtmlBlocks(function (blocks, err) {
      var roots = findBlockRoots();
      assignBlockIndices(roots);
      if (!roots.length) {
        repairScheduled = false;
        if (cb) cb(0);
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
              if (cb) cb(onlyRepaired);
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
            if (pending === 0) finishRepair(repaired, cb);
          });
          return;
        }
        repairBlockFromServer(root, serverText, function (ok) {
          if (ok) repaired++;
          pending--;
          if (pending === 0) finishRepair(repaired, cb);
        });
      });
    });
  }

  function finishRepair(repaired, cb) {
    if (repaired > 0) {
      console.log("[rs-html-block-compact] 已自动修复 " + repaired + " 个截断 HTML 块");
    } else {
      console.log("[rs-html-block-compact] 未发现可修复的截断块（draft 与 PM 可能均已损坏）");
    }
    if (cb) cb(repaired);
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
          writeSourceToPm(root, serverText, function (ok) {
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
    writeSourceToPm(root, text, cb);
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
    if (!serverRepairDone && cfg.autoRepairFromServer !== false && getPmView() && !repairScheduled) {
      repairScheduled = true;
      repairAllFromServer(function (n) {
        if (findBlockRoots().length) serverRepairDone = true;
        repairScheduled = false;
        if (n > 0) prepareAllBlocks();
      });
    }
    return true;
  }

  window.RSHtmlBlockCompact.init = boot;

  [0, 50, 150, 350, 700, 1200, 2500, 5000].forEach(function (ms) {
    setTimeout(boot, ms);
  });

  console.log(
    "[rs-html-block-compact] v" +
      RS_HTML_BLOCK_VER +
      " 已就绪：Snapshot/备份修复截断 + iframe 预览，全屏即时打开"
  );

  window.RSHtmlBlockCompact.repairNow = function () {
    serverBlocksCache = null;
    serverRepairDone = false;
    repairScheduled = false;
    repairAllFromServer(function (n) {
      if (findBlockRoots().length) serverRepairDone = true;
      repairScheduled = false;
      if (n > 0) prepareAllBlocks();
    });
  };
})();
