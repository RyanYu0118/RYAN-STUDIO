/* =======================================================
   RS Archive Scroll — 发布后 / 返回前台时恢复浏览位置 (V1.0)
   读取 rs-return-scroll-context（由快速编辑或发布流程写入）
   ======================================================= */
(function () {
  "use strict";

  var PATH_PREFIX = "/archives/";
  if (location.pathname.indexOf(PATH_PREFIX) !== 0) return;

  var RS_ARCHIVE_SCROLL_VER = "1.1.2";

  function getViewportAnchorY() {
    var vh = window.innerHeight || 800;
    return vh * 0.42;
  }
  if (window.RSArchiveScroll && window.RSArchiveScroll.__ver === RS_ARCHIVE_SCROLL_VER) return;

  var RETURN_KEY = "rs-return-scroll-context";
  var ENTRY_FROZEN_KEY = "rs-edit-entry-frozen";
  var cfg = (window.RSConfig && window.RSConfig.editScroll) || {};
  var RETRY_MS = Array.isArray(cfg.archiveRetryMs)
    ? cfg.archiveRetryMs
    : [0, 120, 400, 800, 1500, 3000, 5000, 8000, 12000];
  var MAX_AGE_MS = typeof cfg.maxAgeMs === "number" ? cfg.maxAgeMs : 600000;

  window.RSArchiveScroll = { __ver: RS_ARCHIVE_SCROLL_VER, tryApply: null };

  function slugFromPath() {
    return decodeURIComponent(location.pathname.slice(PATH_PREFIX.length).replace(/\/$/, ""));
  }

  function readReturnContext() {
    try {
      var raw = sessionStorage.getItem(RETURN_KEY);
      var data = raw ? JSON.parse(raw) : null;
      if (!data || !data.ctx) {
        raw = sessionStorage.getItem(ENTRY_FROZEN_KEY);
        data = raw ? JSON.parse(raw) : null;
      }
      if (!data || !data.ctx) return null;
      if (Date.now() - (data.ctx.ts || data.ts || 0) > MAX_AGE_MS) return null;
      var slug = slugFromPath();
      if (data.slug && slug && data.slug !== slug) return null;
      if (data.ctx.path && data.ctx.path !== location.pathname) {
        if (!data.slug || slug !== data.slug) return null;
      }
      return data;
    } catch (e0) {
      return null;
    }
  }

  function clearReturnContext() {
    try {
      sessionStorage.removeItem(RETURN_KEY);
      sessionStorage.removeItem(ENTRY_FROZEN_KEY);
    } catch (e1) {
      /* ignore */
    }
  }

  function getArticleBody() {
    return (
      document.querySelector(".markdown-body") ||
      document.querySelector(".post-content") ||
      document.querySelector("article.post")
    );
  }

  function getScrollOffset() {
    if (window.RSAnchorScroll && window.RSAnchorScroll.getScrollOffset) {
      return window.RSAnchorScroll.getScrollOffset();
    }
    var anchorCfg = (window.RSConfig && window.RSConfig.anchorScroll) || {};
    var extraGap = typeof anchorCfg.extraGap === "number" ? anchorCfg.extraGap : 8;
    var navFallback = typeof anchorCfg.navFallback === "number" ? anchorCfg.navFallback : 80;
    var nav = document.getElementById("navbar");
    return (nav ? nav.getBoundingClientRect().height : navFallback) + extraGap;
  }

  function scrollToY(y, behavior) {
    window.scrollTo({ top: Math.max(0, y), behavior: behavior || "auto" });
  }

  function scrollElementWithOffset(el, blockRatio) {
    if (!el) return false;

    if (blockRatio != null && blockRatio > 0) {
      var rect = el.getBoundingClientRect();
      var visibleH = rect.height;
      if (visibleH > 8) {
        var blockTop = rect.top + window.pageYOffset;
        var pointY = blockTop + visibleH * blockRatio;
        scrollToY(pointY - getViewportAnchorY(), "auto");
        return true;
      }
    }

    if (window.RSAnchorScroll && window.RSAnchorScroll.scrollToElement) {
      return window.RSAnchorScroll.scrollToElement(el, "auto");
    }
    var rect2 = el.getBoundingClientRect();
    scrollToY(rect2.top + window.pageYOffset - getScrollOffset(), "auto");
    return true;
  }

  function findArchiveTarget(ctx, body) {
    if (!body || !ctx) return null;

    if (ctx.headingId) {
      var heading = document.getElementById(ctx.headingId);
      if (heading && body.contains(heading)) return heading;
    }

    if (ctx.blockSig) {
      var byId = document.getElementById(ctx.blockSig);
      if (byId && body.contains(byId)) return byId;
      if (ctx.blockSig.indexOf(".") !== 0) {
        var byClass = body.querySelector("." + ctx.blockSig.split(/\s+/)[0]);
        if (byClass) return byClass;
      }
    }

    if (ctx.htmlEditedIdx >= 0) {
      var blocks = body.querySelectorAll(".html-edited");
      if (blocks[ctx.htmlEditedIdx]) return blocks[ctx.htmlEditedIdx];
      if (blocks[ctx.htmlEditedIdx - 1]) return blocks[ctx.htmlEditedIdx - 1];
    }

    var needles = ctx.needles || [];
    var ni;
    for (ni = 0; ni < needles.length; ni++) {
      var needle = needles[ni];
      if (!needle || needle.length < 4) continue;
      if (needle.indexOf('id="') === 0) {
        var idVal = needle.slice(4, -1);
        var byNeedleId = document.getElementById(idVal);
        if (byNeedleId && body.contains(byNeedleId)) return byNeedleId;
        continue;
      }
      if (needle.charAt(0) === ".") needle = needle.slice(1);
      var walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
      var node;
      while ((node = walker.nextNode())) {
        if (node.textContent && node.textContent.indexOf(needle) >= 0) {
          return node.parentElement;
        }
      }
    }

    return null;
  }

  function scrollByArticleRatio(ctx, body) {
    if (!body) return false;
    var bodyTop = body.getBoundingClientRect().top + window.pageYOffset;
    var y = bodyTop + (ctx.ratio || 0) * body.scrollHeight - getViewportAnchorY();
    scrollToY(y, "auto");
    return true;
  }

  function applyArchiveScroll(data) {
    var ctx = data && data.ctx;
    var body = getArticleBody();
    if (!body || !ctx) return false;
    if ((body.textContent || "").replace(/\s+/g, "").length < 8) return false;

    if (ctx.source === "frontend" && typeof ctx.scrollY === "number" && ctx.scrollY >= 0) {
      scrollToY(ctx.scrollY, "auto");
      return true;
    }

    if (ctx.headingId && window.RSAnchorScroll && window.RSAnchorScroll.scrollToId) {
      if (window.RSAnchorScroll.scrollToId(ctx.headingId, "auto")) return true;
    }

    if (ctx.headingText) {
      var heads = body.querySelectorAll("h1,h2,h3,h4,h5,h6");
      var target = ctx.headingText;
      var hi;
      var partial = null;
      for (hi = 0; hi < heads.length; hi++) {
        var ht = (heads[hi].textContent || "").replace(/\s+/g, " ").trim();
        if (ht === target) {
          return scrollElementWithOffset(heads[hi], null);
        }
        if (!partial && ht && target && ht.indexOf(target) >= 0) partial = heads[hi];
      }
      if (partial) return scrollElementWithOffset(partial, null);
    }

    var target = findArchiveTarget(ctx, body);
    if (target) {
      var blockRatio = null;
      if (
        ctx.blockRatio > 0 &&
        target.classList &&
        target.classList.contains("html-edited") &&
        !ctx.blockSig
      ) {
        blockRatio = ctx.blockRatio;
      }
      return scrollElementWithOffset(target, blockRatio);
    }

    return scrollByArticleRatio(ctx, body);
  }

  var applied = false;

  function tryApply() {
    if (applied) return;
    var data = readReturnContext();
    if (!data) return;
    if (!applyArchiveScroll(data)) return;
    applied = true;
    clearReturnContext();
    if (cfg.debug) console.log("[rs-archive-scroll] applied", data.ctx);
  }

  window.RSArchiveScroll.tryApply = tryApply;

  RETRY_MS.forEach(function (ms) {
    setTimeout(tryApply, ms);
  });

  console.log("[rs-archive-scroll] v" + RS_ARCHIVE_SCROLL_VER + " 已就绪：发布后恢复浏览位置");
})();
