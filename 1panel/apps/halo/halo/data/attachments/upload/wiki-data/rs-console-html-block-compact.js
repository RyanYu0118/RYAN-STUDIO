/* =======================================================
   RS Console — HTML 编辑块全屏编辑（hybrid-edit-block）
   默认仅渲染预览；点「编辑」→ 全屏代码；禁用分屏
   ======================================================= */
(function () {
  "use strict";

  if (location.pathname.indexOf("/console/posts/editor") < 0) return;

  var RS_HTML_BLOCK_VER = "2.0";
  if (window.RSHtmlBlockCompact && window.RSHtmlBlockCompact.__ver === RS_HTML_BLOCK_VER) {
    return;
  }
  window.RSHtmlBlockCompact = window.RSHtmlBlockCompact || {};
  window.RSHtmlBlockCompact.__ver = RS_HTML_BLOCK_VER;

  var cfg = (window.RSConfig && window.RSConfig.htmlBlockCompact) || {};
  if (cfg.enabled === false) return;

  var BLOCK_LABEL_RE = cfg.labelRe || /HTML\s*编辑块/;
  var scanTimer = null;
  var styleInjected = false;
  var overlay = null;
  var overlayBody = null;
  var fsOpening = false;
  var fsState = null;

  function injectStyles() {
    if (styleInjected) return;
    styleInjected = true;
    var css =
      ".ProseMirror .rs-html-block-root > div:last-child{min-height:0!important;height:auto!important}" +
      ".ProseMirror .rs-html-block-root .html-edited,.ProseMirror .rs-html-block-root .markdown-edited{min-height:0!important}" +
      ".ProseMirror .rs-html-block-root .rs-html-hide-split{display:none!important}" +
      ".ProseMirror .rs-html-block-root.rs-html-fs-source > div:last-child{visibility:hidden!important;height:0!important;min-height:0!important;overflow:hidden!important;margin:0!important;padding:0!important}" +
      "#rs-html-fs-overlay{position:fixed;inset:0;z-index:100000;display:flex;flex-direction:column;background:#fff;color:#303133}" +
      "#rs-html-fs-overlay.rs-html-fs-hidden{display:none!important}" +
      "html[data-user-color-scheme='dark'] #rs-html-fs-overlay{background:#1a1a1a;color:#e5e5e5}" +
      "@media (prefers-color-scheme:dark){html:not([data-user-color-scheme='light']) #rs-html-fs-overlay{background:#1a1a1a;color:#e5e5e5}}" +
      "#rs-html-fs-overlay .rs-html-fs-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 16px;border-bottom:1px solid #e4e7ed;flex-shrink:0;background:#f5f7fa}" +
      "html[data-user-color-scheme='dark'] #rs-html-fs-overlay .rs-html-fs-toolbar{background:#252525;border-bottom-color:#333}" +
      "#rs-html-fs-overlay .rs-html-fs-title{font-size:14px;font-weight:600}" +
      "#rs-html-fs-overlay .rs-html-fs-actions{display:flex;gap:8px}" +
      "#rs-html-fs-overlay .rs-html-fs-actions button{border:1px solid #dcdfe6;background:#fff;border-radius:6px;padding:6px 14px;font-size:13px;cursor:pointer}" +
      "#rs-html-fs-overlay .rs-html-fs-actions button.primary{background:#409eff;border-color:#409eff;color:#fff}" +
      "#rs-html-fs-overlay .rs-html-fs-body{flex:1;min-height:0;overflow:hidden;padding:0}" +
      "#rs-html-fs-overlay .rs-html-fs-body .cm-editor{height:100%!important;max-height:none!important;min-height:0!important;display:flex!important;flex-direction:column!important}" +
      "#rs-html-fs-overlay .rs-html-fs-body .cm-editor .cm-scroller{flex:1 1 auto!important;min-height:0!important;overflow:auto!important;max-height:none!important}";
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
      '<div class="rs-html-fs-body"></div>';
    document.body.appendChild(overlay);
    overlayBody = overlay.querySelector(".rs-html-fs-body");
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
        closeFullscreen(true);
      }
    });
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

  function isEditMode(root) {
    var nodes = root.querySelectorAll("button, [role='button']");
    for (var i = 0; i < nodes.length; i++) {
      if (normText(nodes[i]) === "预览") return true;
    }
    return false;
  }

  function hideSplitUI(root) {
    root.classList.add("rs-html-block-root");
    root.querySelectorAll("button, [role='button']").forEach(function (btn) {
      var t = normText(btn);
      if (t === "分屏" || t === "退出分屏") btn.classList.add("rs-html-hide-split");
    });
  }

  function compactToPreview(root) {
    if (!root || fsState && fsState.root === root) return;
    hideSplitUI(root);
    if (isSplitMode(root)) clickByLabels(root, ["退出分屏"]);
    if (isEditMode(root)) clickByLabels(root, ["预览"]);
  }

  function getEditorSlot(root) {
    var cm = root.querySelector(".cm-editor");
    return cm ? cm.parentElement : null;
  }

  function waitForEditorSlot(root, cb, n) {
    n = n || 0;
    var slot = getEditorSlot(root);
    if (slot) {
      cb(slot);
      return;
    }
    if (n > 50) return;
    setTimeout(function () {
      waitForEditorSlot(root, cb, n + 1);
    }, 60);
  }

  function focusEditor() {
    var content = overlayBody && overlayBody.querySelector(".cm-editor .cm-content");
    if (content && content.focus) content.focus();
  }

  function openFullscreen(root) {
    if (!root || (fsState && fsState.active)) return;
    ensureOverlay();
    hideSplitUI(root);
    root.classList.add("rs-html-block-root");

    function mountSlot(slot) {
      var placeholder = document.createComment("rs-html-fs-anchor");
      var parent = slot.parentElement;
      if (!parent) return;
      parent.insertBefore(placeholder, slot);
      overlayBody.innerHTML = "";
      overlayBody.appendChild(slot);
      root.classList.add("rs-html-fs-source");
      overlay.classList.remove("rs-html-fs-hidden");
      fsState = { active: true, root: root, slot: slot, placeholder: placeholder, parent: parent };
      setTimeout(focusEditor, 30);
    }

    var existing = getEditorSlot(root);
    if (existing) {
      mountSlot(existing);
      return;
    }

    fsOpening = true;
    clickByLabels(root, ["编辑"]);
    fsOpening = false;
    waitForEditorSlot(root, mountSlot);
  }

  function closeFullscreen(save) {
    if (!fsState || !fsState.active) return;
    var st = fsState;
    fsState = null;

    if (st.slot && st.parent && st.placeholder) {
      st.parent.insertBefore(st.slot, st.placeholder);
      st.placeholder.remove();
    }

    st.root.classList.remove("rs-html-fs-source");
    overlay.classList.add("rs-html-fs-hidden");
    overlayBody.innerHTML = "";

    if (isEditMode(st.root) || getEditorSlot(st.root)) {
      clickByLabels(st.root, ["预览"]);
    }
    compactToPreview(st.root);
  }

  function prepareAllBlocks() {
    findBlockRoots().forEach(compactToPreview);
  }

  function scheduleScan() {
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = setTimeout(prepareAllBlocks, 120);
  }

  function hookBlockButtons(pm) {
    if (pm.__rsHtmlBlockBtnHook) return;
    pm.addEventListener(
      "click",
      function (e) {
        if (fsOpening) return;
        var btn = e.target && e.target.closest ? e.target.closest("button, [role='button']") : null;
        if (!btn) return;
        var root = findBlockFromTarget(pm, btn);
        if (!root) return;
        var t = normText(btn);
        if (t === "分屏" || t === "退出分屏") {
          e.preventDefault();
          e.stopImmediatePropagation();
          return;
        }
        if (t === "编辑") {
          e.preventDefault();
          e.stopImmediatePropagation();
          openFullscreen(root);
          return;
        }
        if (t === "预览") {
          if (fsState && fsState.root === root) {
            e.preventDefault();
            e.stopImmediatePropagation();
            closeFullscreen(true);
          }
        }
      },
      true
    );
    pm.addEventListener(
      "dblclick",
      function (e) {
        if (fsOpening) return;
        var root = findBlockFromTarget(pm, e.target);
        if (!root) return;
        if (!root.querySelector(".html-edited, .markdown-edited")) return;
        if (!root.contains(e.target)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        openFullscreen(root);
      },
      true
    );
    pm.__rsHtmlBlockBtnHook = true;
  }

  function boot() {
    var pm = document.querySelector(".ProseMirror");
    if (!pm) return false;
    injectStyles();
    ensureOverlay();
    hookBlockButtons(pm);
    prepareAllBlocks();
    if (!pm.__rsHtmlBlockMo) {
      var mo = new MutationObserver(scheduleScan);
      mo.observe(pm, { childList: true, subtree: true });
      pm.__rsHtmlBlockMo = true;
    }
    return true;
  }

  window.RSHtmlBlockCompact.init = boot;

  [0, 120, 400, 900, 1800, 3500, 6000].forEach(function (ms) {
    setTimeout(boot, ms);
  });

  console.log(
    "[rs-html-block-compact] v" + RS_HTML_BLOCK_VER + " 已就绪：默认预览，编辑全屏，已禁用分屏"
  );
})();
