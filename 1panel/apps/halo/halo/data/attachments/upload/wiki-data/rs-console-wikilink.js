/* =======================================================
   RS Console WikiLink — MediaWiki 风格：选中文字 → 添加链接 / 红链
   ======================================================= */
(function () {
  "use strict";

  window.RSWikiLink = window.RSWikiLink || {};
  var RS_WIKILINK_VER = "3.2";
  if (window.RSWikiLink.__ver === RS_WIKILINK_VER) {
    return;
  }
  if (window.RSWikiLink.__ver) {
    window.RSWikiLink.__nativeHooked = false;
    window.RSWikiLink.__selMemBound = false;
    window.RSWikiLink.__editorReady = false;
  }
  window.RSWikiLink.__ver = RS_WIKILINK_VER;

  var cfg = (window.RSConfig && window.RSConfig.wikilink) || {};
  var PATH_PREFIX = cfg.pathPrefix || "/archives/";
  var SLUG_INDEX = cfg.slugIndex || "/upload/wiki-data/wiki-slugs.json";
  var BRACKET_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

  var suggestPaths = [];
  var publishedSlugs = {};
  var pageIndex = [];
  var bubble = null;
  var popover = null;
  var popoverBackdrop = null;
  var selectionCtx = null;
  var lastGoodCtx = null;
  var selHideTimer = null;
  var nativeHooked = false; // legacy; use window.RSWikiLink.__nativeHooked
  var editorPoll = null;
  var provisionalLinkActive = false;
  var outsideWikiHandler = null;
  var PENDING_HREF = "#rs-wikilink-pending";

  function wikiDebug() {
    if (!cfg.debug) return;
    console.log.apply(console, ["[rs-wikilink]"].concat(Array.prototype.slice.call(arguments)));
  }

  function isWikiLinkEnabled() {
    return !(window.RSConfig && window.RSConfig.wikilink && window.RSConfig.wikilink.enabled === false);
  }

  function onEditorPath() {
    return location.pathname.indexOf("/console/posts/editor") >= 0;
  }

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

  function isRedlinkSlugAlias(postSlug, linkTarget) {
    var slug = normalizeTarget(postSlug);
    var target = normalizeTarget(linkTarget);
    if (!target || target === slug) return true;
    var prefixes = ["rs_", "mcwws_"];
    for (var i = 0; i < prefixes.length; i++) {
      var prefix = prefixes[i];
      if (slug === prefix + target) return true;
      var underscored = target.replace(/\//g, "_").toLowerCase();
      if (slug === prefix + underscored) return true;
    }
    return false;
  }

  function isPostPublished(post) {
    if (!post) return false;
    var labels = (post.metadata && post.metadata.labels) || {};
    if (labels["content.halo.run/deleted"] === "true") return false;
    if (labels["content.halo.run/published"] === "true") return true;
    var spec = post.spec || {};
    if (spec.deleted === true) return false;
    var status = post.status || {};
    return spec.publish === true && status.phase === "PUBLISHED";
  }

  function findPageByQuery(query) {
    query = normalizeTarget(query);
    if (!query) return null;
    for (var i = 0; i < pageIndex.length; i++) {
      var p = pageIndex[i];
      if (p.slug === query || p.title === query) return p;
      var label = p.label ? normalizeTarget(p.label) : "";
      if (label === query) return p;
      if (isRedlinkSlugAlias(p.slug, query)) return p;
    }
    if (isPublishedSlug(query)) return { slug: query, title: defaultLabel(query), published: true };
    var prefixes = ["rs_", "mcwws_"];
    for (var pi = 0; pi < prefixes.length; pi++) {
      var prefix = prefixes[pi];
      var underscored = query.replace(/\//g, "_").toLowerCase();
      for (var j = 0; j < pageIndex.length; j++) {
        var pp = pageIndex[j];
        if (pp.slug === prefix + query || pp.slug === prefix + underscored) return pp;
      }
    }
    return null;
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
    var slug = normalizeTarget(target);
    var red = slug && !isPublishedSlug(slug);
    var extra = red
      ? ' class="rs-wiki-redlink" data-rs-wiki-slug="' + escapeHtml(slug) + '" title="尚未发布 · 前台将显示为红链"'
      : slug
        ? ' data-rs-wiki-slug="' + escapeHtml(slug) + '"'
        : "";
    return "<a href=\"" + href + "\"" + extra + ">" + escapeHtml(text) + "</a>";
  }

  function isExternalUrl(raw) {
    var s = String(raw || "").trim();
    return /^(https?:\/\/|mailto:|tel:|\/\/)/i.test(s) || /^www\./i.test(s);
  }

  function normalizeExternalUrl(raw) {
    var s = String(raw || "").trim();
    if (/^www\./i.test(s)) return "https://" + s;
    return s;
  }

  function externalToMarkdown(href, label) {
    var text = (label || "").trim() || href;
    return "[" + text + "](" + href + ")";
  }

  function externalToHtml(href, label) {
    var text = (label || "").trim() || href;
    return '<a href="' + escapeHtml(href) + '">' + escapeHtml(text) + "</a>";
  }

  function replaceWithExternalLink(href, label, ctx) {
    href = normalizeExternalUrl(href);
    if (!href) return false;
    label = (label || ctx.text || "").trim() || href;
    if (applyHrefToProvisionalOrSelection(href, label, ctx)) return true;
    var editor = ctx.editor || findEditor();
    if (!editor) return false;

    if (editor.type === "textarea" && ctx.range && ctx.range.start !== ctx.range.end) {
      var ta = editor.el;
      var snippet = externalToMarkdown(href, label);
      var val = ta.value;
      ta.value = val.slice(0, ctx.range.start) + snippet + val.slice(ctx.range.end);
      ta.selectionStart = ta.selectionEnd = ctx.range.start + snippet.length;
      ta.dispatchEvent(new Event("input", { bubbles: true }));
      ta.focus();
      return true;
    }
    if (editor.type === "prosemirror" && ctx.text) {
      editor.el.focus();
      restoreEditorSelection(ctx);
      try {
        if (document.queryCommandSupported("createLink")) {
          document.execCommand("createLink", false, href);
          return true;
        }
      } catch (e1) {
        /* ignore */
      }
      try {
        if (document.queryCommandSupported("insertHTML")) {
          document.execCommand("insertHTML", false, externalToHtml(href, label));
          return true;
        }
      } catch (e0) {
        /* ignore */
      }
    }
    var snippet2 = editor.type === "textarea" ? externalToMarkdown(href, label) : externalToHtml(href, label);
    editor.el.focus();
    try {
      document.execCommand("insertHTML", false, snippet2);
      return true;
    } catch (e2) {
      return false;
    }
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

  function findMainProseMirror() {
    var pms = document.querySelectorAll(".ProseMirror");
    var best = null;
    var bestArea = 0;
    for (var i = 0; i < pms.length; i++) {
      var pm = pms[i];
      if (!pm.isContentEditable) continue;
      var r = pm.getBoundingClientRect();
      if (r.width < 20 || r.height < 20) continue;
      var area = r.width * r.height;
      if (area > bestArea) {
        bestArea = area;
        best = pm;
      }
    }
    return best;
  }

  function findTipTapEditor(pmEl) {
    pmEl = pmEl || findMainProseMirror();
    if (!pmEl) return null;
    var node = pmEl;
    for (var depth = 0; depth < 16 && node; depth++) {
      var vue = node.__vueParentComponent;
      if (vue) {
        var ed =
          (vue.props && vue.props.editor) ||
          (vue.vnode && vue.vnode.props && vue.vnode.props.editor) ||
          (vue.setupState && vue.setupState.editor);
        if (ed && ed.state) return ed;
      }
      node = node.parentElement;
    }
    return null;
  }

  function findEditor() {
    var ta = document.querySelector("textarea:not([readonly])");
    if (ta && ta.offsetParent !== null) return { type: "textarea", el: ta };
    var pm = findMainProseMirror();
    if (pm) {
      var tt = findTipTapEditor(pm);
      return { type: "prosemirror", el: pm, tiptap: tt };
    }
    var cm = document.querySelector(".cm-content[contenteditable='true']");
    if (cm) return { type: "codemirror", el: cm };
    return null;
  }

  function captureSelectionFromTipTap() {
    var pm = findMainProseMirror();
    var tt = findTipTapEditor(pm);
    if (!tt || !tt.state || tt.state.selection.empty) return null;
    var sel = tt.state.selection;
    var text = tt.state.doc.textBetween(sel.from, sel.to, " ").replace(/\s+/g, " ").trim();
    if (!text) return null;
    var rect = null;
    try {
      var c = tt.view.coordsAtPos(sel.from);
      rect = { top: c.top, left: c.left, bottom: c.bottom, right: c.right, width: 0, height: c.bottom - c.top };
    } catch (e0) {
      if (pm) rect = pm.getBoundingClientRect();
    }
    return {
      editor: { type: "prosemirror", el: pm, tiptap: tt },
      text: text,
      tiptapSelection: { from: sel.from, to: sel.to },
      range: null,
      rect: rect,
    };
  }

  function rememberSelection(ctx) {
    ctx = ctx || captureSelection();
    if (ctx.text) {
      ctx._ts = Date.now();
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
    var ttCtx = captureSelectionFromTipTap();
    if (ttCtx && ttCtx.text) return ttCtx;

    var editor = findEditor();
    if (editor && editor.type === "textarea") {
      var ta = editor.el;
      var start = ta.selectionStart;
      var end = ta.selectionEnd;
      var text = ta.value.slice(start, end).replace(/\s+/g, " ").trim();
      return { editor: editor, text: text, range: { start: start, end: end }, rect: null };
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

  function restoreEditorSelection(ctx) {
    if (!ctx) return false;
    if (ctx.tiptapSelection && ctx.editor && ctx.editor.tiptap) {
      try {
        var tt = ctx.editor.tiptap;
        tt.chain().focus().setTextSelection(ctx.tiptapSelection).run();
        return true;
      } catch (e0) {
        /* ignore */
      }
    }
    return restoreDomSelection(ctx);
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

  function triggerEditorInput(el) {
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function getBubbleMenuRect() {
    var menu = document.querySelector(".bubble-menu");
    return menu ? menu.getBoundingClientRect() : null;
  }

  function selectionHasLink(ctx) {
    var tt = (ctx && ctx.editor && ctx.editor.tiptap) || findTipTapEditor();
    if (tt) {
      try {
        if (tt.isActive && tt.isActive("link")) return true;
      } catch (e0) {
        /* ignore */
      }
    }
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) return false;
    var node = sel.anchorNode;
    if (!node) return false;
    var el = node.nodeType === 3 ? node.parentElement : node;
    while (el) {
      if (el.tagName === "A") return true;
      if (el.classList && el.classList.contains("ProseMirror")) break;
      el = el.parentElement;
    }
    return false;
  }

  function findPendingLinkAnchor(editor) {
    if (!editor || !editor.el) return null;
    return editor.el.querySelector('a[href="' + PENDING_HREF + '"]');
  }

  function ensureProvisionalLink(ctx) {
    if (provisionalLinkActive || selectionHasLink()) return;
    var editor = (ctx && ctx.editor) || findEditor();
    if (!editor || editor.type !== "prosemirror") return;
    editor.el.focus();
    restoreEditorSelection(ctx || getSelectionForLink());
    if (editor.tiptap) {
      try {
        editor.tiptap.chain().focus().setLink({ href: PENDING_HREF }).run();
        provisionalLinkActive = true;
        return;
      } catch (e1) {
        /* fallback execCommand */
      }
    }
    try {
      if (document.queryCommandSupported("createLink")) {
        document.execCommand("createLink", false, PENDING_HREF);
        provisionalLinkActive = true;
        triggerEditorInput(editor.el);
      }
    } catch (e0) {
      /* ignore */
    }
  }

  function clearProvisionalLink() {
    if (!provisionalLinkActive) return;
    var editor = findEditor();
    if (!editor || editor.type !== "prosemirror") {
      provisionalLinkActive = false;
      return;
    }
    var pending = findPendingLinkAnchor(editor);
    if (pending) {
      try {
        var range = document.createRange();
        range.selectNodeContents(pending);
        var sel = window.getSelection();
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(range);
        }
        if (document.queryCommandSupported("unlink")) {
          document.execCommand("unlink");
        } else {
          pending.replaceWith.apply(pending, Array.prototype.slice.call(pending.childNodes));
        }
        triggerEditorInput(editor.el);
      } catch (e1) {
        /* ignore */
      }
    }
    provisionalLinkActive = false;
  }

  function findLinkAnchorInSelection() {
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    var node = sel.anchorNode;
    if (!node) return null;
    var el = node.nodeType === 3 ? node.parentElement : node;
    while (el) {
      if (el.tagName === "A") return el;
      if (el.classList && el.classList.contains("ProseMirror")) break;
      el = el.parentElement;
    }
    return null;
  }

  function applyHrefToProvisionalOrSelection(href, label, ctx) {
    var editor = (ctx && ctx.editor) || findEditor();
    if (!editor || editor.type !== "prosemirror") return false;
    var pending = findPendingLinkAnchor(editor);
    if (pending) {
      pending.href = href;
      if (label) pending.textContent = label;
      provisionalLinkActive = false;
      triggerEditorInput(editor.el);
      decorateArchiveAnchor(pending);
      return true;
    }
    var existing = findLinkAnchorInSelection();
    if (existing) {
      existing.href = href;
      if (label) existing.textContent = label;
      triggerEditorInput(editor.el);
      decorateArchiveAnchor(existing);
      return true;
    }
    return false;
  }

  function replaceWithLink(target, label, ctx) {
    if (isExternalUrl(target)) return replaceWithExternalLink(normalizeExternalUrl(target), label, ctx);
    target = normalizeTarget(target);
    if (!target) return false;
    label = (label || ctx.text || "").trim() || defaultLabel(target);
    var editor = ctx.editor || findEditor();
    if (!editor) return false;
    var href = archivesHref(target);

    if (applyHrefToProvisionalOrSelection(href, label, ctx)) return true;

    if (editor.type === "textarea" && ctx.range && ctx.range.start !== ctx.range.end) {
      var ta = editor.el;
      var snippet = bracketToMarkdown(target, label);
      var val = ta.value;
      ta.value = val.slice(0, ctx.range.start) + snippet + val.slice(ctx.range.end);
      ta.selectionStart = ta.selectionEnd = ctx.range.start + snippet.length;
      ta.dispatchEvent(new Event("input", { bubbles: true }));
      ta.focus();
      return true;
    }
    if (editor.type === "prosemirror" && ctx.text) {
      editor.el.focus();
      restoreEditorSelection(ctx);
      try {
        if (document.queryCommandSupported("insertHTML")) {
          document.execCommand("insertHTML", false, bracketToHtml(target, label));
          scheduleMarkEditorArchiveLinks();
          return true;
        }
      } catch (e0) {
        /* ignore */
      }
      try {
        if (document.queryCommandSupported("createLink")) {
          document.execCommand("createLink", false, href);
          scheduleMarkEditorArchiveLinks();
          return true;
        }
      } catch (e1) {
        /* ignore */
      }
    }
    var snippet2 = editor.type === "textarea" ? bracketToMarkdown(target, label) : bracketToHtml(target, label);
    editor.el.focus();
    try {
      document.execCommand("insertHTML", false, snippet2);
      scheduleMarkEditorArchiveLinks();
      return true;
    } catch (e2) {
      return false;
    }
  }

  function isPublishedSlug(slug) {
    slug = normalizeTarget(slug);
    return !!(slug && publishedSlugs[slug]);
  }

  function decorateArchiveAnchor(a) {
    if (!a || !a.getAttribute) return;
    var href = a.getAttribute("href") || "";
    if (href === PENDING_HREF) {
      a.classList.add("rs-wiki-redlink");
      return;
    }
    if (isExternalUrl(href) || (href.indexOf(PATH_PREFIX) < 0 && href.indexOf("/archives/") < 0)) {
      a.classList.remove("rs-wiki-redlink");
      a.removeAttribute("data-rs-wiki-slug");
      return;
    }
    var slug = normalizeTarget(href);
    if (!slug) return;
    a.setAttribute("data-rs-wiki-slug", slug);
    if (isPublishedSlug(slug)) {
      a.classList.remove("rs-wiki-redlink");
      a.removeAttribute("title");
    } else {
      a.classList.add("rs-wiki-redlink");
      a.setAttribute("title", "尚未发布 · 前台将显示为红链");
    }
  }

  function markEditorArchiveLinks() {
    var editor = findEditor();
    if (!editor || editor.type !== "prosemirror") return;
    editor.el.querySelectorAll("a[href]").forEach(decorateArchiveAnchor);
  }

  var editorMarkTimer = null;
  function scheduleMarkEditorArchiveLinks() {
    clearTimeout(editorMarkTimer);
    editorMarkTimer = setTimeout(markEditorArchiveLinks, 60);
  }

  function hookEditorRedlinkMarks() {
    if (window.RSWikiLink.__editorMarkHooked) return;
    var obs = new MutationObserver(function () {
      scheduleMarkEditorArchiveLinks();
    });
    function attach() {
      var editor = findEditor();
      if (!editor || editor.type !== "prosemirror") return false;
      if (window.RSWikiLink.__editorMarkObserved === editor.el) return true;
      window.RSWikiLink.__editorMarkObserved = editor.el;
      obs.observe(editor.el, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["href", "class"],
      });
      scheduleMarkEditorArchiveLinks();
      return true;
    }
    if (!attach()) {
      var poll = setInterval(function () {
        if (attach()) clearInterval(poll);
      }, 800);
    }
    document.addEventListener("input", scheduleMarkEditorArchiveLinks, true);
    window.RSWikiLink.__editorMarkHooked = true;
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
    return findPageByQuery(query);
  }

  function injectStyles() {
    var old = document.getElementById("rs-wikilink-style");
    if (old) old.remove();
    var style = document.createElement("style");
    style.id = "rs-wikilink-style";
    style.textContent =
      "#rs-wikilink-bubble{position:fixed;z-index:10054;display:none;transform:translate(-50%,-100%);margin-top:-8px}" +
      "#rs-wikilink-bubble button{width:36px;height:36px;border-radius:8px;border:1px solid rgba(0,0,0,.12);background:#fff;box-shadow:0 4px 14px rgba(0,0,0,.15);cursor:pointer;font-size:16px}" +
      "#rs-wikilink-pop{position:fixed;z-index:10060;width:min(360px,calc(100vw - 24px));background:#fff;color:#111;border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,.22);border:1px solid rgba(0,0,0,.08);overflow:hidden;pointer-events:auto}" +
      "#rs-wikilink-pop .head{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #eee}" +
      "#rs-wikilink-pop .head .title{flex:1;font:600 14px system-ui,sans-serif;text-align:center}" +
      "#rs-wikilink-pop .head button{border:none;background:transparent;cursor:pointer;font:500 13px system-ui,sans-serif;color:#1976d2;padding:4px 6px}" +
      "#rs-wikilink-pop .head button.close{color:#666;font-size:18px}" +
      "#rs-wikilink-pop .search{padding:10px 12px;border-bottom:1px solid #f0f0f0}" +
      "#rs-wikilink-pop .search input{width:100%;box-sizing:border-box;border:1px solid #ddd;border-radius:8px;padding:9px 10px;font:14px system-ui,sans-serif}" +
      "#rs-wikilink-pop .results{max-height:240px;overflow:auto;padding:6px 0}" +
      "#rs-wikilink-pop .row{display:flex;align-items:center;gap:10px;padding:8px 12px;cursor:pointer}" +
      "#rs-wikilink-pop .row:hover,#rs-wikilink-pop .row.active{background:#f5f5f5}" +
      "#rs-wikilink-pop .row .icon{width:28px;height:28px;border-radius:6px;background:#eee;display:flex;align-items:center;justify-content:center;font:600 14px sans-serif;color:#666;flex-shrink:0}" +
      "#rs-wikilink-pop .row.red .icon{background:#ffebee;color:#c62828}" +
      "#rs-wikilink-pop .row.red .label{color:#c62828;font-weight:600}" +
      "#rs-wikilink-pop .row .meta{font:11px/1.3 ui-monospace,monospace;color:#888;margin-top:2px}" +
      "#rs-wikilink-pop.rs-wikilink-docked{position:relative!important;width:100%!important;max-width:none;margin-top:8px;box-shadow:none;border-radius:0;border:0;border-top:1px solid #eee;z-index:auto}" +
      "#rs-wikilink-pop.rs-wikilink-docked .results{max-height:160px}" +
      "#rs-wikilink-pop .hint{padding:8px 12px 10px;font:12px/1.45 system-ui,sans-serif;color:#666;border-top:1px solid #f0f0f0}" +
      "#rs-wikilink-backdrop{position:fixed;inset:0;z-index:10059;background:transparent;pointer-events:none}" +
      "#rs-wikilink-btn{position:fixed;right:24px;bottom:24px;z-index:10050;padding:8px 14px;border-radius:8px;border:1px solid rgba(128,128,128,.35);background:rgba(255,255,255,.92);cursor:pointer;font:600 13px system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.12)}" +
      ".ProseMirror a.rs-wiki-redlink{color:#c62828!important;border-bottom:1px dashed currentColor;text-decoration:none!important}" +
      ".ProseMirror a.rs-wiki-redlink:hover{color:#b71c1c!important}";
    document.head.appendChild(style);
  }

  function hideBubble() {
    if (bubble) bubble.style.display = "none";
  }

  function detachOutsideWikiHandler() {
    if (!outsideWikiHandler) return;
    document.removeEventListener("mousedown", outsideWikiHandler, true);
    outsideWikiHandler = null;
  }

  function hidePopover(clearPending) {
    detachOutsideWikiHandler();
    if (popoverBackdrop) {
      popoverBackdrop.remove();
      popoverBackdrop = null;
    }
    if (popover) {
      popover.remove();
      popover = null;
    }
    if (clearPending !== false) {
      clearProvisionalLink();
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
      openLinkPopover(getSelectionForLink());
    });
    document.body.appendChild(bubble);
    return bubble;
  }

  function showBubbleForSelection(ctx) {
    if (cfg.showSelectionBubble === false) {
      hideBubble();
      return;
    }
    if (!ctx || !ctx.text) {
      hideBubble();
      return;
    }
    selectionCtx = ctx;
    var b = ensureBubble();
    var rect = ctx.rect || (ctx.editor && ctx.editor.el ? ctx.editor.el.getBoundingClientRect() : null);
    if (!rect) return;
    positionNearRect(b, rect);
    b.style.display = "block";
  }

  function renderPopoverResults(query, listEl, pickFn) {
    var q = (query || "").trim();
    var exact = exactPage(q);
    var results = searchPages(q);
    var html = "";
    if (q && isExternalUrl(q)) {
      html +=
        '<div class="row active" data-target="' + escapeHtml(normalizeExternalUrl(q)) + '" data-label="' +
        escapeHtml(q) + '" data-external="1">' +
        '<div class="icon">↗</div><div><div class="label">外部链接</div><div class="meta">' +
        escapeHtml(normalizeExternalUrl(q)) + "</div></div></div>";
    }
    if (q && !exact && !isExternalUrl(q)) {
      html +=
        '<div class="row red active" data-target="' + escapeHtml(q) + '" data-label="' + escapeHtml(q) + '">' +
        '<div class="icon">?</div><div><div class="label">' + escapeHtml(q) +
        '</div><div class="meta">此页面尚未创建 · 将插入红链</div></div></div>';
    }
    results.forEach(function (p, i) {
      if (q && p.title === q && !exact) return;
      html +=
        '<div class="row' + (!html && i === 0 ? " active" : "") + (p.published ? "" : " red") +
        '" data-target="' + escapeHtml(p.slug) + '" data-label="' + escapeHtml(p.title) + '">' +
        '<div class="icon">' + (p.published ? "✓" : "?") + '</div><div><div class="label">' +
        escapeHtml(p.title) + '</div><div class="meta">' + escapeHtml(p.slug) +
        (p.published ? "" : " · 草稿") + "</div></div></div>";
    });
    if (!html) html = '<div class="hint" style="border:0">输入页面名称，或从列表中选择</div>';
    listEl.innerHTML = html;
    listEl.querySelectorAll(".row").forEach(function (row) {
      row.addEventListener("click", function () {
        listEl.querySelectorAll(".row").forEach(function (r) { r.classList.remove("active"); });
        row.classList.add("active");
        pickFn(row.getAttribute("data-target"), row.getAttribute("data-label"));
      });
    });
  }

  function isNativeLinkInputEl(input) {
    if (!input || input.tagName !== "INPUT") return false;
    var ph = (input.getAttribute("placeholder") || "").toLowerCase();
    return /链接|link|url|address|地址/.test(ph);
  }

  function findVisibleNativeLinkPopper() {
    var poppers = document.querySelectorAll(".v-popper--theme-dropdown, [data-popper-placement], .v-popper__popper");
    for (var i = 0; i < poppers.length; i++) {
      var popper = poppers[i];
      if (popper.classList && popper.classList.contains("v-popper__popper--hidden")) continue;
      if (popper.closest && popper.closest("#rs-wikilink-pop")) continue;
      var inputs = popper.querySelectorAll("input");
      for (var j = 0; j < inputs.length; j++) {
        if (isNativeLinkInputEl(inputs[j]) && !inputs[j].closest("#rs-wikilink-pop")) return popper;
      }
    }
    return null;
  }

  function dockWikiPopoverInNative(popoverEl) {
    var popper = findVisibleNativeLinkPopper();
    if (!popper) return false;
    var inner = popper.querySelector(".v-popper__inner") || popper;
    if (!inner) return false;
    popoverEl.classList.add("rs-wikilink-docked");
    popoverEl.style.position = "relative";
    popoverEl.style.top = "";
    popoverEl.style.left = "";
    popoverEl.style.width = "100%";
    popoverEl.style.maxWidth = "none";
    popoverEl.style.marginTop = "8px";
    popoverEl.style.zIndex = "auto";
    popoverEl.style.boxShadow = "none";
    inner.appendChild(popoverEl);
    wikiDebug("Wiki 面板已嵌入 Halo 原生链接下拉");
    return true;
  }

  function positionWikiPopoverAsideNative(popoverEl, fallbackRect) {
    var bubbleRect = getBubbleMenuRect();
    var nativePopper =
      findVisibleNativeLinkPopper() ||
      (function () {
        var menus = document.querySelectorAll(".bubble-menu input");
        for (var i = 0; i < menus.length; i++) {
          if (isNativeLinkInputEl(menus[i])) {
            return menus[i].closest(".bubble-menu");
          }
        }
        return null;
      })();
    var anchorRect = (nativePopper && nativePopper.getBoundingClientRect()) || bubbleRect;
    if (anchorRect && anchorRect.width > 0) {
      var left = anchorRect.right + 12;
      if (left + 380 > window.innerWidth - 12) {
        left = Math.max(12, anchorRect.left - 380 - 12);
      }
      popoverEl.style.top = Math.min(Math.max(anchorRect.top, 8), window.innerHeight - 320) + "px";
      popoverEl.style.left = left + "px";
      return;
    }
    var rect = fallbackRect || bubbleRect || { top: 80, left: 80, bottom: 120, right: 120 };
    popoverEl.style.top = Math.min(rect.bottom + 8, window.innerHeight - 320) + "px";
    popoverEl.style.left = Math.min(Math.max(rect.left + 200, 12), window.innerWidth - 380) + "px";
  }

  function openLinkPopover(ctx, anchorRect, options) {
    options = options || {};
    var alongsideNative = !!options.alongsideNative;
    hidePopover(false);
    ctx = getSelectionForLink();
    selectionCtx = ctx;
    var initial = ctx.text || "";

    if (!alongsideNative) {
      popoverBackdrop = document.createElement("div");
      popoverBackdrop.id = "rs-wikilink-backdrop";
      document.body.appendChild(popoverBackdrop);
    }

    popover = document.createElement("div");
    popover.id = "rs-wikilink-pop";
    popover.innerHTML =
      '<div class="head"><button type="button" class="close" aria-label="关闭">×</button>' +
      '<div class="title">添加链接</div><button type="button" class="done">完成</button></div>' +
      '<div class="search"><input type="text" placeholder="Wiki 页面名，或 https:// 外部地址…" autocomplete="off"></div>' +
      '<div class="results"></div>' +
      '<div class="hint">Halo 原生气泡（普通链接 / 取消 / 打开）保持可用；此处填写 Wiki 目标后点完成。</div>';
    document.body.appendChild(popover);
    console.log("[rs-wikilink] Wiki 面板已打开，选中:", initial || "(无)");

    popover.addEventListener("mousedown", function (e) {
      e.stopPropagation();
    });

    outsideWikiHandler = function (e) {
      if (!popover) return;
      if (popover.contains(e.target)) return;
      if (!e.target.closest) return hidePopover(true);
      if (
        e.target.closest(".bubble-menu") ||
        e.target.closest(".v-popper--theme-dropdown") ||
        e.target.closest("[data-popper-placement]") ||
        e.target.closest(".v-popper__inner") ||
        e.target.closest(".v-popper__popper") ||
        e.target.closest("[role='tooltip']")
      ) {
        return;
      }
      hidePopover(true);
    };
    document.addEventListener("mousedown", outsideWikiHandler, true);

    var input = popover.querySelector("input");
    var results = popover.querySelector(".results");
    var picked = { target: initial, label: initial };
    input.value = initial;
    loadIndex().then(function () {
      renderPopoverResults(initial, results, function (target, label) {
        picked.target = target;
        picked.label = label;
        input.value = target;
      });
    });
    input.addEventListener("input", function () {
      renderPopoverResults(input.value, results, function (target, label) {
        picked.target = target;
        picked.label = label;
      });
    });

    function finish() {
      var raw = input.value.trim() || picked.target;
      if (!raw) return;
      var label = (ctx.text || picked.label || raw).trim();
      if (isExternalUrl(raw)) {
        replaceWithExternalLink(normalizeExternalUrl(raw), label, ctx);
      } else {
        replaceWithLink(normalizeTarget(raw), label, ctx);
      }
      hidePopover(false);
    }
    popover.querySelector(".done").addEventListener("click", finish);
    popover.querySelector(".close").addEventListener("click", function () { hidePopover(true); });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); finish(); }
      if (e.key === "Escape") hidePopover(true);
    });

    var rect = anchorRect || getBubbleMenuRect() || ctx.rect;
    if (!rect && ctx.editor && ctx.editor.el) rect = ctx.editor.el.getBoundingClientRect();
    rect = rect || { top: window.innerHeight / 2, left: window.innerWidth / 2, width: 0, height: 0, bottom: window.innerHeight / 2 };
    if (alongsideNative) {
      if (!options.dockInNative || !dockWikiPopoverInNative(popover)) {
        positionWikiPopoverAsideNative(popover, rect);
        wikiDebug("Wiki 面板浮动于原生链接旁");
      }
    } else {
      popover.style.top = Math.min(rect.bottom + 8, window.innerHeight - 320) + "px";
      popover.style.left = Math.min(Math.max(rect.left, 12), window.innerWidth - 380) + "px";
      input.focus();
      input.select();
    }
  }

  function getSelectionTextForWiki() {
    var ctx = getSelectionForLink();
    var text = (ctx.text || "").trim();
    if (!text && lastGoodCtx) text = (lastGoodCtx.text || "").trim();
    return { ctx: ctx, text: text };
  }

  function linkControlLabel(btn) {
    return (
      btn.getAttribute("aria-label") ||
      btn.getAttribute("title") ||
      btn.getAttribute("data-tooltip") ||
      btn.getAttribute("data-tip") ||
      btn.textContent ||
      ""
    )
      .trim()
      .toLowerCase();
  }

  function buttonHasUnlinkIcon(btn) {
    var svg = btn && btn.querySelector("svg");
    if (!svg) return false;
    var inner = (svg.innerHTML || "") + (svg.outerHTML || "");
    return inner.indexOf("10.232") >= 0 || inner.indexOf("8 17a1") >= 0;
  }

  function isSecondaryLinkAction(btn) {
    var label = linkControlLabel(btn);
    return /cancel link|取消链接|open link|打开链接|nofollow|在新窗口|new window|delete|删除/.test(label);
  }

  function buttonHasLinkIcon(btn) {
    if (buttonHasUnlinkIcon(btn)) return false;
    var svg = btn && btn.querySelector("svg");
    if (!svg) return false;
    var inner = (svg.innerHTML || "") + (svg.outerHTML || "");
    if (inner.indexOf("10.232") >= 0) return false;
    return (
      inner.indexOf("2.828-2.829") >= 0 ||
      inner.indexOf("link-line") >= 0 ||
      inner.indexOf("12.586") >= 0 ||
      inner.indexOf("15.586") >= 0 ||
      inner.indexOf("8.464") >= 0 ||
      inner.indexOf("4.464") >= 0
    );
  }

  /** Halo 链环按钮：仅图标、size-8（LinkBubbleButton），非 Hyperlink Card 的「普通链接」文字下拉 */
  function isIconOnlyLinkBubbleButton(btn) {
    if (!btn || btn.tagName !== "BUTTON") return false;
    return /\bsize-8\b/.test(btn.className || "");
  }

  /** plugin-editor-hyperlink-card：「普通链接 / 行内卡片 / 链接卡片…」展示形式选择器 */
  function isHyperlinkCardTypeDropdown(el) {
    if (!onEditorPath() || !el || !el.closest) return false;
    var btn = el.closest(".bubble-menu button");
    if (!btn || isIconOnlyLinkBubbleButton(btn)) return false;
    var label = (btn.textContent || "").replace(/\s+/g, " ").trim();
    return /普通链接|行内卡片|链接卡片/.test(label);
  }

  function isInBubbleMenu(el) {
    return !!(el && el.closest && el.closest(".bubble-menu"));
  }

  function openWikiImmediate(ctx) {
    if (window.RSWikiLink.__wikiArmTimer) {
      clearTimeout(window.RSWikiLink.__wikiArmTimer);
      window.RSWikiLink.__wikiArmTimer = null;
    }
    ensureProvisionalLink(ctx || getSelectionForLink());
    openLinkPopover(ctx || getSelectionForLink(), getBubbleMenuRect());
  }

  /** 不拦截 Halo 原生事件，仅并行打开 Wiki 弹层（重试等待 v-popper 渲染） */
  function openWikiAlongsideNative(ctx) {
    ctx = ctx || getSelectionForLink();
    var text = (ctx.text || (lastGoodCtx && lastGoodCtx.text) || "").trim();
    if (!text) {
      wikiDebug("跳过 Wiki 面板：无选中文字");
      return false;
    }
    window.RSWikiLink.__lastAddLinkClick = Date.now();
    function tryOpen(attempt) {
      if (popover) return;
      var popper = findVisibleNativeLinkPopper();
      if (!popper && attempt < 8) {
        setTimeout(function () {
          tryOpen(attempt + 1);
        }, 60);
        return;
      }
      openLinkPopover(ctx, getBubbleMenuRect(), { alongsideNative: true, dockInNative: !!popper });
    }
    setTimeout(function () {
      tryOpen(0);
    }, 40);
    return true;
  }

  function isBubbleMenuLinkIntent(el) {
    if (!onEditorPath() || !el || !el.closest) return false;
    if (isHyperlinkCardTypeDropdown(el)) return false;
    var menu = el.closest(".bubble-menu");
    if (!menu) return false;
    var btn = el.closest("button");
    if (!btn || !menu.contains(btn)) return false;
    if (isSecondaryLinkAction(btn) || buttonHasUnlinkIcon(btn)) return false;
    var label = (btn.textContent || "").replace(/\s+/g, " ").trim();
    if (/普通链接|行内卡片|链接卡片|取消链接|打开链接/.test(label)) return false;
    if (buttonHasLinkIcon(btn)) return true;
    if (btn.closest(".inline-flex") && menu.contains(btn.closest(".inline-flex"))) {
      if (isIconOnlyLinkBubbleButton(btn)) return true;
      if (btn.querySelector("svg") && (!label || label.length <= 2)) return true;
    }
    return false;
  }

  function isLinkBubbleInsertButton(el) {
    return isBubbleMenuLinkIntent(el);
  }

  function bindEditorShortcuts() {
    if (!isWikiLinkEnabled()) return;
    document.querySelectorAll(".ProseMirror").forEach(function (el) {
      if (!el.isContentEditable || el.__rsWikiShortcuts) return;
      el.__rsWikiShortcuts = true;
      el.addEventListener("keydown", function (e) {
        if (!isWikiLinkEnabled()) return;
        if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "k") return;
        rememberSelection(captureSelection());
        var sel = getSelectionTextForWiki();
        if (!sel.text) return;
        e.preventDefault();
        e.stopPropagation();
        console.log("[rs-wikilink] Ctrl+K → Wiki 面板");
        openWikiImmediate(sel.ctx);
      });
    });
  }

  function handleWikiShortcutKeydown(e) {
    if (!isWikiLinkEnabled()) return;
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "k") return;
    if (!onEditorPath()) return;
    rememberSelection(captureSelection());
    var sel = getSelectionTextForWiki();
    if (!sel.text) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    console.log("[rs-wikilink] Ctrl+K（全局拦截）→ Wiki 面板");
    openWikiImmediate(sel.ctx);
  }

  function scanNativeLinkPanels() {
    if (popover) return;
    if (!findVisibleNativeLinkPopper()) return;
    var sel = getSelectionTextForWiki();
    if (!sel.text) return;
    console.log("[rs-wikilink] 检测到原生链接面板 → 嵌入 Wiki");
    openLinkPopover(getSelectionForLink(), getBubbleMenuRect(), { alongsideNative: true, dockInNative: true });
  }

  function isNativeLinkInput(input) {
    if (!input || input.tagName !== "INPUT") return false;
    if (!onEditorPath()) return false;
    if (input.closest("#rs-wikilink-pop")) return false;
    var ph = (input.getAttribute("placeholder") || "").toLowerCase();
    var aria = (input.getAttribute("aria-label") || "").toLowerCase();
    var hay = ph + " " + aria;
    if (/链接地址|link address|输入链接|enter the link|链接|link url|url/i.test(hay)) return true;
    var panel = input.closest(".bubble-menu") || input.closest("[class*='w-96']") || input.closest(".relative");
    if (panel && /在新窗口|nofollow|open in new window|取消链接|打开链接|普通链接/i.test(panel.textContent || "")) {
      return true;
    }
    return false;
  }

  function prefillNativeLinkInput(input) {
    if (!isNativeLinkInput(input) || input.closest("#rs-wikilink-pop")) return;
    if (input.value) return;
    var title = (getSelectionForLink().text || (lastGoodCtx && lastGoodCtx.text) || "").trim();
    if (!title) return;
    try {
      var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
      if (setter && setter.set) setter.set.call(input, title);
      else input.value = title;
    } catch (e0) {
      input.value = title;
    }
  }

  function hookNativeLinkToolbar() {
    if (window.RSWikiLink.__nativeHooked) return;
    window.RSWikiLink.__nativeHooked = true;

    window.addEventListener("keydown", handleWikiShortcutKeydown, true);

    document.addEventListener("mousedown", function (e) {
      if (e.target.closest && e.target.closest(".bubble-menu")) {
        rememberSelection(captureSelection());
        if (isBubbleMenuLinkIntent(e.target) && getSelectionTextForWiki().text) {
          window.RSWikiLink.__lastAddLinkClick = Date.now();
          wikiDebug("链环 mousedown，已保留选区");
        }
        return;
      }
      if (findEditor() && findEditor().el && findEditor().el.contains(e.target)) {
        rememberSelection(captureSelection());
      } else {
        rememberSelection();
      }
    }, true);

    document.addEventListener("click", function (e) {
      if (!isLinkBubbleInsertButton(e.target)) return;
      rememberSelection(captureSelection());
      if (!getSelectionTextForWiki().text) {
        console.warn("[rs-wikilink] 请先选中正文中的文字（需在编辑器正文区，非 HTML 块预览 iframe 内）");
        return;
      }
      wikiDebug("链环 click → 并行打开 Wiki");
      openWikiAlongsideNative(getSelectionForLink());
    }, true);

    var obs = new MutationObserver(function () {
      scanNativeLinkPanels();
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  function onSelectionUpdated() {
    if (!onEditorPath()) return;
    clearTimeout(selHideTimer);
    selHideTimer = setTimeout(function () {
      rememberSelection();
      if (popover) return;
      var ctx = getSelectionForLink();
      if (ctx.text) showBubbleForSelection(ctx);
      else hideBubble();
    }, 120);
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
      .catch(function () { suggestPaths = []; });

    var postsP = (function loadPosts(page, api) {
      page = page || 1;
      api = api || "uc";
      var base =
        api === "uc"
          ? "/apis/uc.api.content.halo.run/v1alpha1/posts"
          : "/apis/api.content.halo.run/v1alpha1/posts";
      return fetch(base + "?page=" + page + "&size=100", { credentials: "same-origin" })
        .then(function (r) {
          if (!r.ok) {
            if (api === "uc") return loadPosts(1, "public");
            return null;
          }
          return r.json();
        })
        .then(function (data) {
          if (!data) return;
          (data.items || []).forEach(function (post) {
            var slug = post.spec && post.spec.slug;
            var title = (post.spec && post.spec.title) || slug;
            if (!slug) return;
            var pub = isPostPublished(post);
            pageIndex.push({ slug: slug, title: title, published: pub });
            if (pub) publishedSlugs[slug] = true;
            var lt = post.metadata && post.metadata.annotations && post.metadata.annotations["rs.wiki/redlink-target-slug"];
            if (lt) {
              publishedSlugs[normalizeTarget(lt)] = pub;
              if (!isRedlinkSlugAlias(slug, lt)) {
                pageIndex.push({ slug: normalizeTarget(lt), title: title, published: pub, label: lt });
              }
            }
          });
          if (data.hasNext && page < 10) return loadPosts(page + 1, api);
        });
    })();
    return Promise.all([slugP, postsP]);
  }

  function removeFloatingUi() {
    if (cfg.showCornerButton === false) {
      var btn = document.getElementById("rs-wikilink-btn");
      if (btn) btn.remove();
    }
    if (cfg.showSelectionBubble === false) {
      hideBubble();
      if (bubble) {
        bubble.remove();
        bubble = null;
      }
    }
  }

  function initToolbar() {
    if (cfg.showCornerButton === false) {
      var old = document.getElementById("rs-wikilink-btn");
      if (old) old.remove();
      return;
    }
    if (document.getElementById("rs-wikilink-btn")) return;
    var btn = document.createElement("button");
    btn.id = "rs-wikilink-btn";
    btn.type = "button";
    btn.title = "添加链接 (Ctrl+K)";
    btn.textContent = "🔗 添加链接";
    btn.addEventListener("click", function () { openLinkPopover(getSelectionForLink()); });
    document.body.appendChild(btn);
  }

  function bindSelectionMemory() {
    if (window.RSWikiLink.__selMemBound) return;
    window.RSWikiLink.__selMemBound = true;
    document.addEventListener("mouseup", function () {
      rememberSelection(captureSelection());
    }, true);
    document.addEventListener("keyup", function () {
      rememberSelection(captureSelection());
    }, true);
    document.addEventListener("selectionchange", function () {
      rememberSelection();
    });
  }

  function bindEditorListeners() {
    document.addEventListener("mouseup", onSelectionUpdated, true);
    document.addEventListener("keyup", onSelectionUpdated, true);
  }

  function boot() {
    if (!onEditorPath()) return;
    if (!isWikiLinkEnabled()) return;
    bindSelectionMemory();
    hookNativeLinkToolbar();
    bindEditorShortcuts();
    if (window.RSWikiLink.__editorReady) return;
    if (!findEditor()) return;
    window.RSWikiLink.__editorReady = true;
    injectStyles();
    hookSave();
    hookEditorRedlinkMarks();
    initToolbar();
    if (cfg.showSelectionBubble !== false) bindEditorListeners();
    loadIndex().then(function () {
      markEditorArchiveLinks();
      console.log("[rs-wikilink] v" + RS_WIKILINK_VER + " 已就绪：TipTap 选区 + Ctrl+K/链环 → Wiki 面板");
    });
  }

  window.RSWikiLink.openNow = function () {
    rememberSelection(captureSelection());
    var sel = getSelectionTextForWiki();
    if (!sel.text) {
      console.warn("[rs-wikilink] openNow: 无选区。TipTap=", !!findTipTapEditor(), "lastGoodCtx=", !!(lastGoodCtx && lastGoodCtx.text));
      return false;
    }
    openWikiImmediate(sel.ctx);
    return true;
  };

  window.RSWikiLink.init = function () {
    removeFloatingUi();
    if (!isWikiLinkEnabled()) {
      if (editorPoll) {
        clearInterval(editorPoll);
        editorPoll = null;
      }
      return;
    }
    boot();
    if (editorPoll) return;
    editorPoll = setInterval(function () {
      if (!isWikiLinkEnabled()) return;
      if (onEditorPath() && findEditor()) {
        bindEditorShortcuts();
        if (!window.RSWikiLink.__editorReady) boot();
      }
    }, 1000);
  };
  window.RSWikiLink.__booted = true;

  window.RSWikiLink.init();
})();
