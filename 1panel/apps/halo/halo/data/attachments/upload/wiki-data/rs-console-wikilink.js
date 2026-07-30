/* =======================================================
   RS Console WikiLink — MediaWiki 风格 [[路径|文字]] 编辑器助手
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
  var acBox = null;
  var acIndex = 0;
  var acOpen = false;
  var acPrefix = "";

  function normalizeTarget(raw) {
    var path = String(raw || "")
      .trim()
      .replace(/\\/g, "/");
    if (path.startsWith(PATH_PREFIX)) path = path.slice(PATH_PREFIX.length);
    if (path.startsWith("/archives/")) path = path.slice("/archives/".length);
    while (path.startsWith("../") || path.startsWith("./")) {
      path = path.replace(/^\.\.?\//, "");
    }
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
    return slug ? PATH_PREFIX + slug : PATH_PREFIX;
  }

  function looksLikeHtml(text) {
    return /<\/?[a-z][\s\S]*>/i.test(text);
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

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
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
      var data = JSON.parse(body);
      return JSON.stringify(transformDeep(data));
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
            nextInit = Object.assign({}, init, {
              body: maybeTransformSaveBody(init.body),
            });
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

  function insertText(editor, text) {
    if (!editor) return false;
    if (editor.type === "textarea") {
      var ta = editor.el;
      var start = ta.selectionStart;
      var end = ta.selectionEnd;
      var val = ta.value;
      ta.value = val.slice(0, start) + text + val.slice(end);
      ta.selectionStart = ta.selectionEnd = start + text.length;
      ta.dispatchEvent(new Event("input", { bubbles: true }));
      ta.focus();
      return true;
    }
    editor.el.focus();
    try {
      document.execCommand("insertText", false, text);
      return true;
    } catch (e1) {
      /* ignore */
    }
    try {
      document.execCommand("insertHTML", false, text);
      return true;
    } catch (e2) {
      return false;
    }
  }

  function insertWikiLink(target, label) {
    var editor = findEditor();
    if (!editor) {
      alert("未找到编辑器，请先点击正文编辑区。");
      return;
    }
    target = normalizeTarget(target);
    if (!target) return;
    label = (label || "").trim();
    var snippet;
    if (editor.type === "textarea") {
      snippet = bracketToMarkdown(target, label);
    } else if (editor.type === "prosemirror" && !looksLikeHtml(editor.el.innerHTML)) {
      snippet = bracketToMarkdown(target, label);
    } else {
      snippet = bracketToHtml(target, label);
    }
    insertText(editor, snippet);
  }

  function injectStyles() {
    if (document.getElementById("rs-wikilink-style")) return;
    var style = document.createElement("style");
    style.id = "rs-wikilink-style";
    style.textContent =
      "#rs-wikilink-btn{position:fixed;right:24px;bottom:24px;z-index:10050;" +
      "padding:8px 14px;border-radius:8px;border:1px solid rgba(128,128,128,.35);" +
      "background:rgba(255,255,255,.92);backdrop-filter:blur(8px);cursor:pointer;" +
      "font:600 13px/1.2 system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.12)}" +
      "#rs-wikilink-btn:hover{background:#fff}" +
      "#rs-wikilink-modal{position:fixed;inset:0;z-index:10060;background:rgba(0,0,0,.45);" +
      "display:flex;align-items:center;justify-content:center;padding:16px}" +
      "#rs-wikilink-modal .panel{min-width:min(420px,92vw);background:#fff;color:#111;" +
      "border-radius:12px;padding:18px 18px 14px;box-shadow:0 12px 40px rgba(0,0,0,.25)}" +
      "#rs-wikilink-modal h3{margin:0 0 12px;font:600 16px/1.3 system-ui,sans-serif}" +
      "#rs-wikilink-modal label{display:block;margin:10px 0 4px;font:500 12px system-ui,sans-serif;opacity:.75}" +
      "#rs-wikilink-modal input{width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #ccc;border-radius:6px;font:14px system-ui,sans-serif}" +
      "#rs-wikilink-modal .hint{margin:8px 0 0;font:12px/1.45 system-ui,sans-serif;opacity:.65}" +
      "#rs-wikilink-modal .actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}" +
      "#rs-wikilink-modal button{padding:7px 14px;border-radius:6px;border:1px solid #ccc;background:#f5f5f5;cursor:pointer;font:500 13px system-ui,sans-serif}" +
      "#rs-wikilink-modal button.primary{background:#c62828;border-color:#b71c1c;color:#fff}" +
      "#rs-wikilink-ac{position:fixed;z-index:10055;max-height:220px;overflow:auto;background:#fff;" +
      "border:1px solid #ccc;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.15);min-width:220px;display:none}" +
      "#rs-wikilink-ac .item{padding:7px 10px;cursor:pointer;font:13px/1.35 ui-monospace,monospace}" +
      "#rs-wikilink-ac .item.active,#rs-wikilink-ac .item:hover{background:#fce4ec}";
    document.head.appendChild(style);
  }

  function showDialog() {
    var existing = document.getElementById("rs-wikilink-modal");
    if (existing) existing.remove();

    var wrap = document.createElement("div");
    wrap.id = "rs-wikilink-modal";
    wrap.innerHTML =
      '<div class="panel" role="dialog" aria-label="插入 Wiki 链接">' +
      "<h3>插入 Wiki 链接</h3>" +
      '<label for="rs-wl-target">页面路径（英文，如 player/rules）</label>' +
      '<input id="rs-wl-target" type="text" placeholder="player/rules" autocomplete="off">' +
      '<label for="rs-wl-label">显示文字（可选）</label>' +
      '<input id="rs-wl-label" type="text" placeholder="玩家规则" autocomplete="off">' +
      '<p class="hint">也可在正文直接输入 MediaWiki 语法：<code>[[player/rules|玩家规则]]</code>，保存时自动转换。未发布页在前台显示为红链。</p>' +
      '<div class="actions">' +
      '<button type="button" data-act="cancel">取消</button>' +
      '<button type="button" class="primary" data-act="ok">插入</button>' +
      "</div></div>";
    document.body.appendChild(wrap);

    var targetInput = wrap.querySelector("#rs-wl-target");
    var labelInput = wrap.querySelector("#rs-wl-label");
    targetInput.focus();

    wrap.addEventListener("click", function (e) {
      if (e.target === wrap) wrap.remove();
    });
    wrap.querySelector('[data-act="cancel"]').addEventListener("click", function () {
      wrap.remove();
    });
    wrap.querySelector('[data-act="ok"]').addEventListener("click", function () {
      insertWikiLink(targetInput.value, labelInput.value);
      wrap.remove();
    });
    wrap.querySelector(".panel").addEventListener("keydown", function (e) {
      if (e.key === "Escape") wrap.remove();
      if (e.key === "Enter") {
        e.preventDefault();
        insertWikiLink(targetInput.value, labelInput.value);
        wrap.remove();
      }
    });
  }

  function ensureAcBox() {
    if (acBox) return acBox;
    acBox = document.createElement("div");
    acBox.id = "rs-wikilink-ac";
    document.body.appendChild(acBox);
    acBox.addEventListener("mousedown", function (e) {
      var item = e.target.closest(".item");
      if (!item) return;
      e.preventDefault();
      completeAutocomplete(item.getAttribute("data-path"));
    });
    return acBox;
  }

  function filteredPaths(prefix) {
    prefix = (prefix || "").toLowerCase();
    return suggestPaths
      .filter(function (p) {
        return !prefix || p.toLowerCase().indexOf(prefix) >= 0;
      })
      .slice(0, 12);
  }

  function positionAcBox(editorEl) {
    var rect = editorEl.getBoundingClientRect();
    ensureAcBox().style.left = Math.min(rect.left + 12, window.innerWidth - 240) + "px";
    acBox.style.top = Math.min(rect.top + 48, window.innerHeight - 240) + "px";
  }

  function renderAutocomplete(prefix) {
    var list = filteredPaths(prefix);
    acIndex = 0;
    if (!list.length) {
      hideAutocomplete();
      return;
    }
    ensureAcBox();
    acBox.innerHTML = list
      .map(function (p, i) {
        return (
          '<div class="item' +
          (i === 0 ? " active" : "") +
          '" data-path="' +
          escapeHtml(p) +
          '">' +
          escapeHtml(p) +
          "</div>"
        );
      })
      .join("");
    acBox.style.display = "block";
    acOpen = true;
    acPrefix = prefix;
  }

  function hideAutocomplete() {
    acOpen = false;
    acPrefix = "";
    if (acBox) acBox.style.display = "none";
  }

  function completeAutocomplete(path) {
    var editor = findEditor();
    hideAutocomplete();
    if (!editor || editor.type !== "textarea") {
      insertWikiLink(path, "");
      return;
    }
    var ta = editor.el;
    var val = ta.value;
    var pos = ta.selectionStart;
    var before = val.slice(0, pos);
    var open = before.lastIndexOf("[[");
    if (open < 0) return;
    var after = val.slice(pos);
    var insert = path + "]]";
    ta.value = val.slice(0, open + 2) + insert + after;
    var cursor = open + 2 + insert.length;
    ta.selectionStart = ta.selectionEnd = cursor;
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    ta.focus();
  }

  function onEditorKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "k") {
      e.preventDefault();
      showDialog();
      return;
    }
    if (!acOpen) {
      if (e.key === "[" && findEditor() && findEditor().type === "textarea") {
        setTimeout(function () {
          var ed = findEditor();
          if (!ed || ed.type !== "textarea") return;
          var ta = ed.el;
          var pos = ta.selectionStart;
          var chunk = ta.value.slice(Math.max(0, pos - 2), pos);
          if (chunk === "[[") {
            acPrefix = "";
            positionAcBox(ta);
            renderAutocomplete("");
          }
        }, 0);
      }
      return;
    }
    if (e.key === "Escape") {
      hideAutocomplete();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      var items = acBox ? acBox.querySelectorAll(".item") : [];
      if (!items.length) return;
      items[acIndex].classList.remove("active");
      acIndex = e.key === "ArrowDown" ? (acIndex + 1) % items.length : (acIndex - 1 + items.length) % items.length;
      items[acIndex].classList.add("active");
      return;
    }
    if (e.key === "Enter" && acOpen) {
      e.preventDefault();
      var active = acBox && acBox.querySelector(".item.active");
      if (active) completeAutocomplete(active.getAttribute("data-path"));
      return;
    }
  }

  function onEditorInput() {
    var editor = findEditor();
    if (!editor || editor.type !== "textarea") return;
    var ta = editor.el;
    var pos = ta.selectionStart;
    var before = ta.value.slice(0, pos);
    var open = before.lastIndexOf("[[");
    if (open < 0) {
      hideAutocomplete();
      return;
    }
    var partial = before.slice(open + 2);
    if (partial.indexOf("]]") >= 0 || partial.indexOf("|") >= 0) {
      hideAutocomplete();
      return;
    }
    positionAcBox(ta);
    renderAutocomplete(partial);
  }

  function loadSuggestPaths() {
    return fetch(SLUG_INDEX, { credentials: "same-origin", cache: "no-cache" })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        var set = {};
        ["gitSlugs", "slugs", "redlinkTargets"].forEach(function (key) {
          (data[key] || []).forEach(function (p) {
            var n = normalizeTarget(p);
            if (n) set[n] = true;
          });
        });
        suggestPaths = Object.keys(set).sort();
      })
      .catch(function () {
        suggestPaths = [];
      });
  }

  function initToolbar() {
    if (document.getElementById("rs-wikilink-btn")) return;
    var btn = document.createElement("button");
    btn.id = "rs-wikilink-btn";
    btn.type = "button";
    btn.title = "插入 Wiki 链接 (Ctrl+Shift+K)";
    btn.textContent = "[[Wiki 链接]]";
    btn.addEventListener("click", showDialog);
    document.body.appendChild(btn);
  }

  function bindEditorListeners() {
    document.addEventListener("keydown", onEditorKeyDown, true);
    document.addEventListener("input", onEditorInput, true);
  }

  function init() {
    injectStyles();
    hookSave();
    initToolbar();
    bindEditorListeners();
    loadSuggestPaths();
    console.log("[rs-wikilink] MediaWiki 链接助手已启用（[[path|label]] / Ctrl+Shift+K）");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
