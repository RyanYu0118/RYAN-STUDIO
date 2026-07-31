/* =======================================================
   RS Archive Scroll — 发布后 / 返回前台时恢复浏览位置 (V1.0)
   读取 rs-return-scroll-context（由快速编辑或发布流程写入）
   ======================================================= */
(function () {
  "use strict";

  var PATH_PREFIX = "/archives/";
  if (location.pathname.indexOf(PATH_PREFIX) !== 0) return;

  var RS_ARCHIVE_SCROLL_VER = "1.0.0";
  if (window.RSArchiveScroll && window.RSArchiveScroll.__ver === RS_ARCHIVE_SCROLL_VER) return;

  var RETURN_KEY = "rs-return-scroll-context";
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
      if (!raw) return null;
      var data = JSON.parse(raw);
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
    var nav = document.getElementById("navbar");
    return (nav ? nav.getBoundingClientRect().height : 80) + 8;
  }

  function scrollToY(y, behavior) {
    window.scrollTo({ top: Math.max(0, y), behavior: behavior || "auto" });
  }

  function scrollElementWithOffset(el, blockRatio) {
    if (!el) return false;
    var offset = getScrollOffset();
    var rect = el.getBoundingClientRect();
    var top = rect.top + window.pageYOffset - offset;
    if (blockRatio != null && blockRatio > 0) {
      top += Math.max(0, el.offsetHeight * blockRatio - window.innerHeight * 0.38);
    }
    scrollToY(top, "auto");
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
    var vh = window.innerHeight || 800;
    var max = Math.max(0, body.scrollHeight - vh * 0.5);
    if (max <= 8) return false;
    var bodyTop = body.getBoundingClientRect().top + window.pageYOffset;
    scrollToY(bodyTop + (ctx.ratio || 0) * max - getScrollOffset() * 0.5, "auto");
    return true;
  }

  function applyArchiveScroll(data) {
    var ctx = data && data.ctx;
    var body = getArticleBody();
    if (!body || !ctx) return false;
    if ((body.textContent || "").replace(/\s+/g, "").length < 8) return false;

    if (ctx.headingId && window.RSAnchorScroll && window.RSAnchorScroll.scrollToId) {
      if (window.RSAnchorScroll.scrollToId(ctx.headingId, "auto")) return true;
    }

    var target = findArchiveTarget(ctx, body);
    if (target) {
      var blockRatio = null;
      if (target.classList && target.classList.contains("html-edited") && ctx.blockRatio != null) {
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
