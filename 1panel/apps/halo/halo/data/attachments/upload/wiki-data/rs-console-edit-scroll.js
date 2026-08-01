/* =======================================================
   RS Console Edit Scroll — 前台浏览位置 → 后台编辑器定位 (V1.0)
   读取 rs-loader 快速编辑按钮写入的 sessionStorage 上下文
   ======================================================= */
(function () {
  "use strict";

  if (location.pathname.indexOf("/console/posts/editor") < 0) return;

  var RS_EDIT_SCROLL_VER = "1.4.0";
  if (window.RSEditScroll && window.RSEditScroll.__ver === RS_EDIT_SCROLL_VER) return;

  var STORAGE_KEY = "rs-edit-scroll-context";
  var RETURN_KEY = "rs-return-scroll-context";
  var ENTRY_FROZEN_KEY = "rs-edit-entry-frozen";
  var cfg = (window.RSConfig && window.RSConfig.editScroll) || {};
  var RETRY_MS = Array.isArray(cfg.retryMs)
    ? cfg.retryMs
    : [0, 200, 500, 1000, 1800, 3000, 5000, 8000, 12000];
  var MAX_AGE_MS = typeof cfg.maxAgeMs === "number" ? cfg.maxAgeMs : 600000;
  var lastReturnCache = null;
  var lastReturnCacheAt = 0;

  function getEditorTopPadding() {
    return typeof cfg.editorTopPadding === "number" ? cfg.editorTopPadding : 12;
  }

  window.RSEditScroll = { __ver: RS_EDIT_SCROLL_VER, tryApply: null };

  function editorPostName() {
    var m = location.search.match(/[?&]name=([^&]+)/i);
    return m ? decodeURIComponent(m[1]) : "";
  }

  function readContext() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || !data.ctx) return null;
      var postId = editorPostName();
      if (data.postId && postId && data.postId !== postId) return null;
      if (Date.now() - (data.ctx.ts || 0) > MAX_AGE_MS) return null;
      return data.ctx;
    } catch (e0) {
      return null;
    }
  }

  function clearContext() {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (e1) {
      /* ignore */
    }
  }

  function readStored(key) {
    try {
      var raw = sessionStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e2) {
      return null;
    }
  }

  function writeReturnContext(payload) {
    try {
      sessionStorage.setItem(RETURN_KEY, JSON.stringify(payload));
    } catch (e3) {
      /* ignore */
    }
  }

  function preserveReturnContext() {
    clearContext();
  }

  function readEntryFrozen(postId) {
    var data = readStored(ENTRY_FROZEN_KEY);
    if (!data || !data.ctx) return null;
    if (postId && data.postId && data.postId !== postId) return null;
    if (Date.now() - (data.ctx.ts || data.ts || 0) > MAX_AGE_MS) return null;
    return data;
  }

  function readEntryContext() {
    var postId = editorPostName();
    var data = readStored(STORAGE_KEY);
    if (!data || !data.ctx) data = readEntryFrozen(postId);
    if (!data || !data.ctx) return null;
    if (data.postId && postId && data.postId !== postId) return null;
    if (Date.now() - (data.ctx.ts || data.ts || 0) > MAX_AGE_MS) return null;
    return data.ctx;
  }

  function saveReturnContext(postName, slug) {
    var postId = postName || editorPostName();
    var ctx = null;
    if (lastReturnCache && Date.now() - lastReturnCacheAt < 120000) {
      ctx = JSON.parse(JSON.stringify(lastReturnCache));
    }
    if (!ctx) ctx = captureEditorReturnContext();
    if (!ctx) return;
    var frozen = readEntryFrozen(postId);
    if (frozen && frozen.ctx && frozen.ctx.path) ctx.path = frozen.ctx.path;
    writeReturnContext({
      postId: postId,
      slug: slug || "",
      ctx: ctx,
      ts: Date.now(),
    });
    if (cfg.debug) console.log("[rs-edit-scroll] saved return context", ctx);
  }

  function refreshReturnContextCache() {
    var ctx = captureEditorReturnContext();
    if (!ctx) return null;
    lastReturnCache = ctx;
    lastReturnCacheAt = Date.now();
    return ctx;
  }

  function findNearestPmHeading(pm, anchorY) {
    var heads = pm.querySelectorAll("h1,h2,h3,h4,h5,h6");
    var best = null;
    var bestTop = -Infinity;
    var i;
    for (i = 0; i < heads.length; i++) {
      var top = heads[i].getBoundingClientRect().top;
      if (top <= anchorY + 4 && top > bestTop) {
        bestTop = top;
        best = heads[i];
      }
    }
    return best;
  }

  function getSelectionAnchorEl(pm) {
    var sel = window.getSelection();
    if (sel && sel.rangeCount) {
      var node = sel.anchorNode;
      if (node) {
        var el = node.nodeType === 1 ? node : node.parentElement;
        while (el && el !== pm && el !== document.body) {
          if (pm.contains(el)) return el;
          el = el.parentElement;
        }
      }
    }
    var active = document.activeElement;
    if (active && pm.contains(active)) return active;
    return null;
  }

  function getEditorScrollRatio(pm) {
    var container = findScrollContainer(pm);
    if (!container) return 0;
    var max = container.scrollHeight - container.clientHeight;
    if (max <= 8) return 0;
    return container.scrollTop / max;
  }

  function readHtmlBlockOpenCtx(blockRoot) {
    if (!blockRoot) return null;
    if (blockRoot.__rsHtmlOpenCtx) return blockRoot.__rsHtmlOpenCtx;
    var ratio = parseFloat(blockRoot.dataset.rsHtmlPreviewScrollRatio || "");
    var needles = [];
    try {
      needles = JSON.parse(blockRoot.dataset.rsHtmlPreviewNeedles || "[]");
    } catch (e0) {
      needles = [];
    }
    if (!isNaN(ratio) || needles.length) {
      return { ratio: isNaN(ratio) ? 0 : ratio, needles: needles, docY: 0 };
    }
    if (window.RSHtmlBlockCompact && window.RSHtmlBlockCompact.previewContext) {
      return window.RSHtmlBlockCompact.previewContext(blockRoot);
    }
    return null;
  }

  function findFocusedHtmlBlockRoot(pm) {
    var active = document.activeElement;
    if (active && active.closest) {
      var inRoot = active.closest(".rs-html-block-root");
      if (inRoot && pm.contains(inRoot)) return inRoot;
    }
    var roots = findHtmlBlockRoots(pm);
    var ri;
    for (ri = 0; ri < roots.length; ri++) {
      var iframe = roots[ri].querySelector("[data-rs-html-iframe]");
      try {
        if (
          iframe &&
          iframe.contentDocument &&
          iframe.contentDocument.activeElement &&
          iframe.contentDocument.activeElement !== iframe.contentDocument.body
        ) {
          return roots[ri];
        }
      } catch (e1) {
        /* ignore */
      }
    }
    return null;
  }

  function captureEditorReturnContext() {
    var pm = document.querySelector(".ProseMirror");
    if (!pm) return null;
    var pad = getEditorTopPadding();
    var anchorY = pad + 16;
    var vw = window.innerWidth || 1200;
    var x = Math.max(0, Math.min(vw - 1, vw * 0.5));
    var el = getSelectionAnchorEl(pm);
    if (!el) {
      el = document.elementFromPoint(x, anchorY);
      while (el && el !== pm && el !== document.body && !pm.contains(el)) {
        el = el.parentElement;
      }
    }
    if (!el || !pm.contains(el)) el = pm;

    var headingId = "";
    var headingText = "";
    var cur = el;
    while (cur && cur !== pm) {
      var tag = cur.tagName ? cur.tagName.toUpperCase() : "";
      if (/^H[1-6]$/.test(tag)) {
        headingText = (cur.textContent || "").replace(/\s+/g, " ").trim();
        if (cur.id) headingId = cur.id;
        break;
      }
      cur = cur.parentElement;
    }
    if (!headingText) {
      var nearest = findNearestPmHeading(pm, anchorY);
      if (nearest) {
        headingText = (nearest.textContent || "").replace(/\s+/g, " ").trim();
        if (nearest.id) headingId = nearest.id;
      }
    }

    var needles = collectNeedlesFromEl(el, pm);
    var blockSig = "";
    var htmlEditedIdx = -1;
    var blockRatio = 0;
    var blockRoots = findHtmlBlockRoots(pm);
    var blockRoot = (el.closest && el.closest(".rs-html-block-root")) || findFocusedHtmlBlockRoot(pm);
    if (blockRoot) {
      htmlEditedIdx = blockRoots.indexOf(blockRoot);
      var openCtx = readHtmlBlockOpenCtx(blockRoot);
      if (openCtx) {
        if (typeof openCtx.ratio === "number" && openCtx.ratio > 0) blockRatio = openCtx.ratio;
        if (openCtx.needles && openCtx.needles.length) {
          needles = openCtx.needles.concat(needles);
        }
      }
      var iframe = blockRoot.querySelector("[data-rs-html-iframe]");
      try {
        if (iframe && iframe.contentDocument && iframe.contentDocument.body) {
          var idoc = iframe.contentDocument;
          var ix = Math.max(0, Math.min(iframe.clientWidth - 1, iframe.clientWidth * 0.5));
          var iy = Math.max(0, Math.min(iframe.clientHeight - 1, pad + 16));
          var marker = idoc.elementFromPoint(ix, iy);
          if (marker && marker.id) blockSig = marker.id;
          if (!blockSig && marker) {
            var m = String(marker.className || "").match(/wd-smart-card|wws-wb-card|nav-quote-box/);
            if (m) blockSig = m[0];
          }
        }
      } catch (e4) {
        /* ignore */
      }
    }

    return {
      needles: needles,
      headingId: headingId,
      headingText: headingText,
      htmlEditedIdx: htmlEditedIdx,
      blockSig: blockSig,
      blockRatio: blockRatio,
      ratio: getEditorScrollRatio(pm),
      path: location.pathname,
      ts: Date.now(),
      source: "editor",
    };
  }

  function bindReturnContextTracking() {
    if (window.__rsEditScrollTrackBound) return;
    window.__rsEditScrollTrackBound = true;
    var debounceTimer = null;
    function scheduleRefresh() {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(refreshReturnContextCache, 80);
    }
    document.addEventListener("selectionchange", scheduleRefresh, true);
    document.addEventListener("mouseup", scheduleRefresh, true);
    document.addEventListener("keyup", scheduleRefresh, true);
    window.addEventListener("scroll", scheduleRefresh, true);
    setInterval(refreshReturnContextCache, 2000);
    scheduleRefresh();
  }

  function pushNeedle(list, seen, n) {
    if (!n || seen[n]) return;
    seen[n] = true;
    list.push(n);
  }

  function collectNeedlesFromEl(el, root) {
    var out = [];
    var seen = {};
    var cur = el;
    while (cur && cur !== root && cur !== document.body) {
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
      if (cur === el) {
        var direct = (cur.textContent || "").replace(/\s+/g, " ").trim();
        if (direct.length >= 4 && direct.length <= 80) pushNeedle(out, seen, direct);
      }
      cur = cur.parentElement;
    }
    return out;
  }

  function cssEscape(id) {
    if (window.CSS && CSS.escape) return CSS.escape(id);
    return String(id).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  function findScrollContainer(el) {
    var cur = el;
    while (cur && cur !== document.body) {
      var st = window.getComputedStyle(cur);
      if (
        (st.overflowY === "auto" || st.overflowY === "scroll") &&
        cur.scrollHeight > cur.clientHeight + 8
      ) {
        return cur;
      }
      cur = cur.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }

  function scrollElIntoEditorView(el) {
    if (!el) return;
    var pad = getEditorTopPadding();
    var container = findScrollContainer(el);
    if (container && container !== document.documentElement && container !== document.body) {
      var cRect = container.getBoundingClientRect();
      var rect = el.getBoundingClientRect();
      container.scrollTop = Math.max(0, rect.top - cRect.top + container.scrollTop - pad);
      return;
    }
    var rect = el.getBoundingClientRect();
    window.scrollTo({ top: Math.max(0, rect.top + window.pageYOffset - pad), behavior: "auto" });
  }

  function findTextHost(root, needle) {
    if (!needle || needle.length < 3) return null;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
      if (node.textContent && node.textContent.indexOf(needle) >= 0) {
        return node.parentElement;
      }
    }
    return null;
  }

  function findHtmlBlockRoots(pm) {
    if (window.RSHtmlBlockCompact && window.RSHtmlBlockCompact.getBlockRoots) {
      return window.RSHtmlBlockCompact.getBlockRoots();
    }
    return Array.prototype.slice.call(pm.querySelectorAll(".rs-html-block-root"));
  }

  function findPmTarget(ctx, pm) {
    if (!pm) return null;

    if (ctx.headingId) {
      var hid = cssEscape(ctx.headingId);
      var heading = pm.querySelector("#" + hid + ', [id="' + ctx.headingId + '"]');
      if (heading) return heading;
    }

    if (ctx.headingText) {
      var heads = pm.querySelectorAll("h1,h2,h3,h4,h5,h6");
      var target = ctx.headingText;
      var hi;
      var partial = null;
      for (hi = 0; hi < heads.length; hi++) {
        var ht = (heads[hi].textContent || "").replace(/\s+/g, " ").trim();
        if (ht === target) return heads[hi];
        if (!partial && ht && target && ht.indexOf(target) >= 0) partial = heads[hi];
        if (!partial && ht && target && target.indexOf(ht) >= 0) partial = heads[hi];
      }
      if (partial) return partial;
    }

    var blockRoots = findHtmlBlockRoots(pm);

    if (ctx.blockSig && blockRoots.length) {
      var si;
      for (si = 0; si < blockRoots.length; si++) {
        var root = blockRoots[si];
        var iframe = root.querySelector("[data-rs-html-iframe]");
        try {
          if (iframe && iframe.contentDocument && iframe.contentDocument.body) {
            if (iframe.contentDocument.body.innerHTML.indexOf(ctx.blockSig) >= 0) return root;
          }
        } catch (e3) {
          /* ignore */
        }
        if ((root.innerText || "").indexOf(ctx.blockSig) >= 0) return root;
      }
    }

    if (ctx.htmlEditedIdx >= 0 && blockRoots.length) {
      if (blockRoots[ctx.htmlEditedIdx]) return blockRoots[ctx.htmlEditedIdx];
      if (blockRoots[ctx.htmlEditedIdx - 1]) return blockRoots[ctx.htmlEditedIdx - 1];
    }

    var needles = ctx.needles || [];
    var ni;
    for (ni = 0; ni < needles.length; ni++) {
      var needle = needles[ni];
      if (!needle || needle.length < 4) continue;
      if (needle.charAt(0) === ".") needle = needle.slice(1);
      if (needle.indexOf('id="') === 0) {
        var idVal = needle.slice(4, -1);
        var byId = pm.querySelector("#" + cssEscape(idVal));
        if (byId) return byId;
        continue;
      }
      var host = findTextHost(pm, needle);
      if (host) return host;
    }

    return null;
  }

  function scrollByRatio(ctx, pm) {
    if (!pm) return false;
    var container = findScrollContainer(pm);
    var max = container.scrollHeight - container.clientHeight;
    if (max > 8) {
      container.scrollTop = (ctx.ratio || 0) * max;
      return true;
    }
    var docMax = document.documentElement.scrollHeight - window.innerHeight;
    if (docMax > 8) {
      window.scrollTo({ top: (ctx.ratio || 0) * docMax, behavior: "auto" });
      return true;
    }
    return false;
  }

  function stashHtmlBlockContext(target, ctx) {
    var blockRoot = target.closest ? target.closest(".rs-html-block-root") : null;
    if (!blockRoot || !ctx) return;
    blockRoot.__rsHtmlOpenCtx = {
      ratio: ctx.blockRatio != null ? ctx.blockRatio : ctx.ratio || 0,
      needles: ctx.needles || [],
      docY: 0,
    };
  }

  function applyScroll(ctx) {
    var pm = document.querySelector(".ProseMirror");
    if (!pm) return false;
    if ((pm.textContent || "").replace(/\s+/g, "").length < 8) return false;

    var target = findPmTarget(ctx, pm);
    if (target) {
      scrollElIntoEditorView(target);
      stashHtmlBlockContext(target, ctx);
      return true;
    }
    return scrollByRatio(ctx, pm);
  }

  var applied = false;

  function tryApply() {
    if (applied) return;
    var ctx = readEntryContext();
    if (!ctx) return;
    if (!applyScroll(ctx)) return;
    applied = true;
    preserveReturnContext();
    if (cfg.debug) console.log("[rs-edit-scroll] applied", ctx);
  }

  window.RSEditScroll.tryApply = tryApply;
  window.RSEditScroll.saveReturnContext = saveReturnContext;
  window.RSEditScroll.refreshReturnContextCache = refreshReturnContextCache;

  bindReturnContextTracking();

  RETRY_MS.forEach(function (ms) {
    setTimeout(tryApply, ms);
  });

  console.log("[rs-edit-scroll] v" + RS_EDIT_SCROLL_VER + " 已就绪：进入编辑用前台位置，发布回跳用编辑器最后位置");
})();
