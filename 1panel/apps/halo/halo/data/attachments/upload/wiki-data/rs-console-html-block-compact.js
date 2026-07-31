/* =======================================================
   RS Console — HTML 编辑块默认预览高度（hybrid-edit-block）
   默认退出分屏仅显示渲染预览；点「编辑」/「分屏」可正常写代码
   ======================================================= */
(function () {
  "use strict";

  if (location.pathname.indexOf("/console/posts/editor") < 0) return;

  var RS_HTML_BLOCK_VER = "1.2";
  if (window.RSHtmlBlockCompact && window.RSHtmlBlockCompact.__ver === RS_HTML_BLOCK_VER) {
    return;
  }
  window.RSHtmlBlockCompact = window.RSHtmlBlockCompact || {};
  window.RSHtmlBlockCompact.__ver = RS_HTML_BLOCK_VER;

  var cfg = (window.RSConfig && window.RSConfig.htmlBlockCompact) || {};
  if (cfg.enabled === false) return;

  var BLOCK_LABEL_RE = cfg.labelRe || /HTML\s*编辑块/;
  var EDIT_MAX_HEIGHT = typeof cfg.editMaxHeight === "string" ? cfg.editMaxHeight : "min(55vh, 560px)";
  var scanTimer = null;
  var styleInjected = false;

  function injectStyles() {
    if (styleInjected) return;
    styleInjected = true;
    var css =
      ".ProseMirror .rs-html-block-root > div:last-child{min-height:0!important;height:auto!important}" +
      ".ProseMirror .rs-html-block-root .html-edited,.ProseMirror .rs-html-block-root .markdown-edited{min-height:0!important}" +
      ".ProseMirror .rs-html-block-root .cm-editor{max-height:" +
      EDIT_MAX_HEIGHT +
      "!important;height:auto!important;flex:none!important}" +
      ".ProseMirror .rs-html-block-root .cm-editor .cm-scroller{overflow:auto!important;max-height:inherit!important}";
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

  function findBlockFromTarget(pm, target) {
    if (!target || !pm) return null;
    var blocks = findBlockRoots(pm);
    for (var i = 0; i < blocks.length; i++) {
      if (blocks[i].contains(target)) return blocks[i];
    }
    return null;
  }

  function clickByLabels(root, labels) {
    var nodes = root.querySelectorAll("button, [role='button']");
    for (var i = 0; i < nodes.length; i++) {
      var t = normText(nodes[i]);
      if (labels.indexOf(t) < 0) continue;
      nodes[i].click();
      return t;
    }
    return null;
  }

  function isSplitMode(root) {
    var nodes = root.querySelectorAll("button, [role='button']");
    for (var i = 0; i < nodes.length; i++) {
      if (normText(nodes[i]) === "退出分屏") return true;
    }
    return false;
  }

  function isCodeEditing(root) {
    var nodes = root.querySelectorAll("button, [role='button']");
    for (var i = 0; i < nodes.length; i++) {
      if (normText(nodes[i]) === "预览") return true;
    }
    return !!root.querySelector(".cm-editor");
  }

  function allowEditing(root) {
    if (!root) return;
    root.classList.add("rs-html-block-root");
    root.dataset.rsHtmlCompact = "off";
  }

  function allowPreview(root) {
    if (!root) return;
    root.dataset.rsHtmlCompact = "1";
  }

  function shouldSkipCompact(root) {
    if (!root) return true;
    if (root.dataset.rsHtmlCompact === "off") return true;
    if (isCodeEditing(root)) return true;
    if (root.querySelector(".cm-editor.cm-focused")) return true;
    return false;
  }

  function compactBlock(root) {
    if (shouldSkipCompact(root)) return;
    root.classList.add("rs-html-block-root");
    if (isSplitMode(root)) clickByLabels(root, ["退出分屏"]);
    root.dataset.rsHtmlCompact = "1";
  }

  function compactAll() {
    findBlockRoots().forEach(compactBlock);
  }

  function scheduleScan() {
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = setTimeout(compactAll, 120);
  }

  function hookBlockButtons(pm) {
    if (pm.__rsHtmlBlockBtnHook) return;
    pm.addEventListener(
      "click",
      function (e) {
        var btn = e.target && e.target.closest ? e.target.closest("button, [role='button']") : null;
        if (!btn) return;
        var root = findBlockFromTarget(pm, btn);
        if (!root) return;
        var t = normText(btn);
        if (t === "编辑" || t === "分屏") allowEditing(root);
        if (t === "预览" || t === "退出分屏") allowPreview(root);
      },
      true
    );
    pm.addEventListener(
      "dblclick",
      function (e) {
        var root = findBlockFromTarget(pm, e.target);
        if (!root) return;
        if (root.querySelector(".html-edited, .markdown-edited") && root.contains(e.target)) {
          allowEditing(root);
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
      if (lastSelected && lastSelected !== selected && lastSelected.dataset.rsHtmlCompact !== "off") {
        setTimeout(function () {
          if (isCodeEditing(lastSelected)) clickByLabels(lastSelected, ["预览"]);
          else if (isSplitMode(lastSelected)) clickByLabels(lastSelected, ["退出分屏"]);
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

  console.log(
    "[rs-html-block-compact] v" +
      RS_HTML_BLOCK_VER +
      " 已就绪：默认预览高度；点「编辑」或「分屏」写代码"
  );
})();
