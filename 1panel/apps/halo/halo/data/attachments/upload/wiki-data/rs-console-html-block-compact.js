/* =======================================================
   RS Console — HTML 编辑块默认预览高度（hybrid-edit-block）
   退出分屏 / 隐藏 CodeMirror，仅显示渲染预览
   ======================================================= */
(function () {
  "use strict";

  if (location.pathname.indexOf("/console/posts/editor") < 0) return;

  var RS_HTML_BLOCK_VER = "1.1";
  if (window.RSHtmlBlockCompact && window.RSHtmlBlockCompact.__ver === RS_HTML_BLOCK_VER) {
    return;
  }
  window.RSHtmlBlockCompact = window.RSHtmlBlockCompact || {};
  window.RSHtmlBlockCompact.__ver = RS_HTML_BLOCK_VER;

  var cfg = (window.RSConfig && window.RSConfig.htmlBlockCompact) || {};
  if (cfg.enabled === false) return;

  var BLOCK_LABEL_RE = cfg.labelRe || /HTML\s*编辑块/;
  var EDIT_MAX_HEIGHT = typeof cfg.editMaxHeight === "string" ? cfg.editMaxHeight : "min(42vh, 420px)";
  var scanTimer = null;
  var styleInjected = false;

  function injectStyles() {
    if (styleInjected) return;
    styleInjected = true;
    var css =
      ".ProseMirror .rs-html-block-root > div:last-child{min-height:0!important;height:auto!important}" +
      ".ProseMirror .rs-html-block-root .html-edited,.ProseMirror .rs-html-block-root .markdown-edited{min-height:0!important}" +
      ".ProseMirror .rs-html-block-root:not(.rs-html-block-editing) div:has(> .cm-editor){display:none!important;width:0!important;min-height:0!important;overflow:hidden!important}" +
      ".ProseMirror .rs-html-block-root:not(.rs-html-block-editing) .cm-editor{display:none!important}" +
      ".ProseMirror .rs-html-block-root.rs-html-block-editing .cm-editor{max-height:" +
      EDIT_MAX_HEIGHT +
      "!important;height:auto!important;flex:none!important;display:flex!important}" +
      ".ProseMirror .rs-html-block-root.rs-html-block-editing .cm-editor .cm-scroller{overflow:auto!important;max-height:inherit!important}";
    var tag = document.createElement("style");
    tag.id = "rs-html-block-compact-style";
    tag.textContent = css;
    document.head.appendChild(tag);
  }

  function normText(el) {
    return (el && (el.textContent || el.innerText) || "").replace(/\s+/g, " ").trim();
  }

  function isHtmlBlockRoot(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.getAttribute("contenteditable") !== "false") return false;
    return BLOCK_LABEL_RE.test(normText(el));
  }

  function findBlockRoots(root) {
    root = root || document;
    var pm = root.querySelector ? root.querySelector(".ProseMirror") : null;
    if (!pm && root.classList && root.classList.contains("ProseMirror")) pm = root;
    if (!pm) return [];

    var seen = new Set();
    var out = [];

    function add(el) {
      if (!el || seen.has(el) || !pm.contains(el)) return;
      var block = el;
      while (block && block !== pm) {
        if (isHtmlBlockRoot(block)) {
          if (!seen.has(block)) {
            seen.add(block);
            out.push(block);
          }
          return;
        }
        block = block.parentElement;
      }
    }

    pm.querySelectorAll(".cm-editor").forEach(function (cm) {
      add(cm.parentElement);
    });
    pm.querySelectorAll('[contenteditable="false"]').forEach(function (el) {
      if (BLOCK_LABEL_RE.test(normText(el))) add(el);
    });
    return out;
  }

  function clickByLabels(root, labels) {
    var nodes = root.querySelectorAll("button, [role='button'], span, div");
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var t = normText(node);
      if (labels.indexOf(t) < 0) continue;
      var clickEl = node.closest("button") || node;
      clickEl.click();
      return t;
    }
    return null;
  }

  function isSplitMode(root) {
    var nodes = root.querySelectorAll("button, [role='button'], span, div");
    for (var i = 0; i < nodes.length; i++) {
      if (normText(nodes[i]) === "退出分屏") return true;
    }
    return false;
  }

  function isEditMode(root) {
    var nodes = root.querySelectorAll("button, [role='button'], span, div");
    for (var i = 0; i < nodes.length; i++) {
      if (normText(nodes[i]) === "预览") return true;
    }
    return false;
  }

  function markEditing(root, editing) {
    if (!root) return;
    if (editing) root.classList.add("rs-html-block-editing");
    else root.classList.remove("rs-html-block-editing");
  }

  function compactBlock(root) {
    if (!root || root.dataset.rsHtmlCompact === "off") return;
    root.classList.add("rs-html-block-root");

    if (root.classList.contains("ProseMirror-selectednode")) {
      markEditing(root, true);
      return;
    }

    if (isSplitMode(root)) clickByLabels(root, ["退出分屏"]);
    if (isEditMode(root)) clickByLabels(root, ["预览"]);

    markEditing(root, false);
    root.dataset.rsHtmlCompact = "1";
  }

  function compactAll() {
    findBlockRoots().forEach(compactBlock);
  }

  function scheduleScan() {
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = setTimeout(compactAll, 80);
  }

  function hookBlockButtons(pm) {
    if (pm.__rsHtmlBlockBtnHook) return;
    pm.addEventListener(
      "click",
      function (e) {
        var clickEl = e.target && e.target.closest ? e.target.closest("button, [role='button'], span, div") : null;
        if (!clickEl) return;
        var root = clickEl.closest(".rs-html-block-root");
        if (!root) {
          var blocks = findBlockRoots(pm);
          for (var i = 0; i < blocks.length; i++) {
            if (blocks[i].contains(clickEl)) {
              root = blocks[i];
              break;
            }
          }
        }
        if (!root) return;
        root.classList.add("rs-html-block-root");
        var t = normText(clickEl);
        if (t === "分屏" || t === "编辑") {
          root.dataset.rsHtmlCompact = "off";
          markEditing(root, true);
        }
        if (t === "预览" || t === "退出分屏") {
          root.dataset.rsHtmlCompact = "1";
          markEditing(root, false);
          setTimeout(function () {
            compactBlock(root);
          }, 0);
        }
      },
      true
    );
    pm.__rsHtmlBlockBtnHook = true;
  }

  function watchSelection(pm) {
    if (pm.__rsHtmlBlockSelHook) return;
    var lastSelected = null;
    var selMo = new MutationObserver(function () {
      var selected = null;
      findBlockRoots(pm).forEach(function (root) {
        if (root.classList.contains("ProseMirror-selectednode")) selected = root;
      });
      if (selected) markEditing(selected, true);
      if (lastSelected && lastSelected !== selected && lastSelected.dataset.rsHtmlCompact !== "off") {
        setTimeout(function () {
          compactBlock(lastSelected);
        }, 0);
      }
      lastSelected = selected;
    });
    selMo.observe(pm, { subtree: true, attributes: true, attributeFilter: ["class"] });
    pm.__rsHtmlBlockSelHook = true;
  }

  function boot() {
    var pm = document.querySelector(".ProseMirror");
    if (!pm) return false;
    injectStyles();
    hookBlockButtons(pm);
    watchSelection(pm);
    compactAll();
    if (!pm.__rsHtmlBlockMo) {
      var mo = new MutationObserver(scheduleScan);
      mo.observe(pm, { childList: true, subtree: true });
      pm.__rsHtmlBlockMo = true;
    }
    return true;
  }

  window.RSHtmlBlockCompact.init = boot;

  var tries = [0, 120, 400, 900, 1800, 3500, 6000, 10000];
  tries.forEach(function (ms) {
    setTimeout(boot, ms);
  });

  console.log("[rs-html-block-compact] v" + RS_HTML_BLOCK_VER + " 已就绪：HTML 编辑块默认预览高度");
})();
