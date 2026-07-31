/* =======================================================
   RS Console — HTML 编辑块全屏编辑 v2.2
   默认仅渲染预览；点「全屏编辑」→ 独立全屏 textarea；禁用分屏
   ======================================================= */
(function () {
  "use strict";

  if (location.pathname.indexOf("/console/posts/editor") < 0) return;

  var RS_HTML_BLOCK_VER = "2.2";
  if (window.RSHtmlBlockCompact && window.RSHtmlBlockCompact.__ver === RS_HTML_BLOCK_VER) {
    return;
  }
  window.RSHtmlBlockCompact = window.RSHtmlBlockCompact || {};
  window.RSHtmlBlockCompact.__ver = RS_HTML_BLOCK_VER;

  var cfg = (window.RSConfig && window.RSConfig.htmlBlockCompact) || {};
  if (cfg.enabled === false) return;

  var BLOCK_LABEL_RE = cfg.labelRe || /HTML\s*编辑块/;
  var fsState = null;
  var pmHooked = false;

  function injectStyles() {
    if (document.getElementById("rs-html-block-fs-style")) return;
    var css =
      ".ProseMirror .rs-html-block-root > div:last-child{min-height:0!important;height:auto!important}" +
      ".ProseMirror .rs-html-block-root .html-edited,.ProseMirror .rs-html-block-root .markdown-edited{min-height:0!important}" +
      ".ProseMirror .rs-html-block-root .rs-html-hide-native{display:none!important}" +
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

  var overlay = null;
  var overlayTextarea = null;

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
    pm.querySelectorAll(".html-edited, .cm-editor, [contenteditable='false'], node-view-wrapper").forEach(add);
    return out;
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

  function ensurePreviewOnly(root) {
    if (!root || root.dataset.rsHtmlPrepared === "1" || (fsState && fsState.root === root)) return;
    root.classList.add("rs-html-block-root");
    hideNativeActions(root);
    injectFullscreenButton(root);
    if (isSplitMode(root)) clickHeaderButton(root, "退出分屏");
    if (isInlineEditMode(root)) clickHeaderButton(root, "预览");
    root.dataset.rsHtmlPrepared = "1";
  }

  function readCmText(root) {
    var lines = root.querySelectorAll(".cm-editor .cm-line");
    if (!lines.length) return "";
    var parts = [];
    for (var i = 0; i < lines.length; i++) parts.push(lines[i].textContent || "");
    return parts.join("\n");
  }

  function waitFor(fn, cb, n) {
    n = n || 0;
    if (fn()) {
      cb();
      return;
    }
    if (n > 80) {
      cb();
      return;
    }
    setTimeout(function () {
      waitFor(fn, cb, n + 1);
    }, 50);
  }

  function withInlineEditor(root, work, done) {
    root.dataset.rsHtmlPrepared = "0";
    if (!isInlineEditMode(root)) clickHeaderButton(root, "编辑");
    waitFor(
      function () {
        return isInlineEditMode(root) && root.querySelector(".cm-editor .cm-line");
      },
      function () {
        try {
          work(readCmText(root));
        } finally {
          if (typeof done === "function") done();
        }
      }
    );
  }

  function setInlineEditorText(root, text) {
    waitFor(
      function () {
        return root.querySelector(".cm-editor .cm-content");
      },
      function () {
        var content = root.querySelector(".cm-editor .cm-content");
        if (!content) return;
        content.focus();
        try {
          document.execCommand("selectAll", false, null);
          document.execCommand("insertText", false, text);
        } catch (e1) {
          /* fallback below */
        }
        if (readCmText(root) !== text) {
          try {
            var sel = window.getSelection();
            var range = document.createRange();
            range.selectNodeContents(content);
            sel.removeAllRanges();
            sel.addRange(range);
            document.execCommand("insertText", false, text);
          } catch (e2) {
            /* ignore */
          }
        }
      }
    );
  }

  function openFullscreen(root) {
    if (fsState) return;
    ensureOverlay();
    root.dataset.rsHtmlPrepared = "0";
    withInlineEditor(
      root,
      function (source) {
        fsState = { root: root, initial: source };
        overlayTextarea.value = source;
        overlay.classList.remove("rs-html-fs-hidden");
        overlayTextarea.focus();
        overlayTextarea.setSelectionRange(0, 0);
      },
      function () {
        clickHeaderButton(root, "预览");
        root.dataset.rsHtmlPrepared = "1";
      }
    );
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

    root.dataset.rsHtmlPrepared = "0";
    if (!isInlineEditMode(root)) clickHeaderButton(root, "编辑");
    waitFor(
      function () {
        return isInlineEditMode(root) && root.querySelector(".cm-editor .cm-content");
      },
      function () {
        setInlineEditorText(root, next);
        waitFor(
          function () {
            return readCmText(root) === next || readCmText(root).length > 0;
          },
          function () {
            clickHeaderButton(root, "预览");
            ensurePreviewOnly(root);
          }
        );
      }
    );
  }

  function prepareAllBlocks() {
    findBlockRoots().forEach(ensurePreviewOnly);
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
            (n.matches && (n.matches(".html-edited") || n.matches("[contenteditable='false']") || n.matches("node-view-wrapper"))) ||
            (n.querySelector && (n.querySelector(".html-edited") || n.querySelector("[contenteditable='false']")))
          ) {
            hit = true;
            break;
          }
        }
        if (hit) break;
      }
      if (!hit) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(prepareAllBlocks, 300);
    });
    mo.observe(pm, { childList: true, subtree: true });
    pm.__rsHtmlBlockNewMo = true;
  }

  function boot() {
    var pm = getPm();
    if (!pm) return false;
    injectStyles();
    ensureOverlay();
    if (!pmHooked) {
      hookDocument();
      watchNewBlocks(pm);
      pmHooked = true;
    }
    prepareAllBlocks();
    return true;
  }

  window.RSHtmlBlockCompact.init = boot;

  [0, 200, 600, 1200, 2500, 5000, 9000].forEach(function (ms) {
    setTimeout(boot, ms);
  });

  console.log("[rs-html-block-compact] v" + RS_HTML_BLOCK_VER + " 已就绪：全屏 textarea 编辑，原生分屏已隐藏");
})();
