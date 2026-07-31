/* =======================================================
   RS Console — HTML 编辑块全屏编辑 v2.1（hybrid-edit-block）
   默认预览；全屏编辑按钮 / 原生「编辑」→ 全屏 CodeMirror；禁用分屏
   ======================================================= */
(function () {
  "use strict";

  if (location.pathname.indexOf("/console/posts/editor") < 0) return;

  var RS_HTML_BLOCK_VER = "2.1";
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
  var pmRoot = null;

  function injectStyles() {
    if (styleInjected) return;
    styleInjected = true;
    var css =
      ".ProseMirror .rs-html-block-root > div:last-child{min-height:0!important;height:auto!important}" +
      ".ProseMirror .rs-html-block-root .html-edited,.ProseMirror .rs-html-block-root .markdown-edited{min-height:0!important}" +
      ".ProseMirror .rs-html-block-root .rs-html-hide-split{display:none!important}" +
      ".ProseMirror .rs-html-block-root.rs-html-fs-source > div:last-child{visibility:hidden!important;height:0!important;min-height:0!important;overflow:hidden!important;margin:0!important;padding:0!important}" +
      ".ProseMirror .rs-html-block-root [data-rs-html-fs-btn]{margin-left:6px;border:1px solid #409eff;background:#409eff;color:#fff;border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer;line-height:1.4}" +
      ".ProseMirror .rs-html-block-root [data-rs-html-fs-btn]:hover{filter:brightness(1.05)}" +
      "#rs-html-fs-overlay{position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:#fff;color:#303133}" +
      "#rs-html-fs-overlay.rs-html-fs-hidden{display:none!important}" +
      "html[data-user-color-scheme='dark'] #rs-html-fs-overlay{background:#1a1a1a;color:#e5e5e5}" +
      "@media (prefers-color-scheme:dark){html:not([data-user-color-scheme='light']) #rs-html-fs-overlay{background:#1a1a1a;color:#e5e5e5}}" +
      "#rs-html-fs-overlay .rs-html-fs-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 16px;border-bottom:1px solid #e4e7ed;flex-shrink:0;background:#f5f7fa}" +
      "html[data-user-color-scheme='dark'] #rs-html-fs-overlay .rs-html-fs-toolbar{background:#252525;border-bottom-color:#333}" +
      "#rs-html-fs-overlay .rs-html-fs-title{font-size:14px;font-weight:600}" +
      "#rs-html-fs-overlay .rs-html-fs-actions{display:flex;gap:8px}" +
      "#rs-html-fs-overlay .rs-html-fs-actions button{border:1px solid #dcdfe6;background:#fff;border-radius:6px;padding:6px 14px;font-size:13px;cursor:pointer;color:inherit}" +
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
      closeFullscreen();
    });
    overlay.querySelector("[data-rs-html-fs-cancel]").addEventListener("click", function () {
      closeFullscreen();
    });
    document.addEventListener("keydown", function (e) {
      if (!fsState || overlay.classList.contains("rs-html-fs-hidden")) return;
      if (e.key === "Escape") {
        e.preventDefault();
        closeFullscreen();
      }
    });
  }

  function normText(el) {
    return (el && (el.textContent || el.innerText) || "").replace(/\s+/g, " ").trim();
  }

  function blockHeaderMatches(el) {
    if (!el || !el.children || !el.children.length) return false;
    var header = el.children[0];
    return BLOCK_LABEL_RE.test(normText(header));
  }

  function isHtmlBlockRoot(el) {
    if (!el || el.nodeType !== 1) return false;
    var tag = el.tagName ? el.tagName.toLowerCase() : "";
    var ce = el.getAttribute("contenteditable");
    if (ce !== "false" && tag !== "node-view-wrapper") return false;
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
      if (!el || seen.has(el) || !pm.contains(el)) return;
      var cur = el;
      while (cur && cur !== pm) {
        if (isHtmlBlockRoot(cur)) {
          if (!seen.has(cur)) {
            seen.add(cur);
            out.push(cur);
          }
          return;
        }
        cur = cur.parentElement;
      }
    }

    pm.querySelectorAll(".cm-editor, .html-edited, [contenteditable='false'], node-view-wrapper").forEach(add);
    return out;
  }

  function findBlockFromTarget(target) {
    var pm = getPm();
    if (!target || !pm) return null;
    var node = target.nodeType === 1 ? target : target.parentElement;
    while (node && node !== pm) {
      if (isHtmlBlockRoot(node)) return node;
      node = node.parentElement;
    }
    return null;
  }

  function iterClickables(root) {
    return root.querySelectorAll("button, [role='button'], .btn, a, span, div");
  }

  function clickByLabels(root, labels) {
    var nodes = iterClickables(root);
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var t = normText(node);
      if (labels.indexOf(t) < 0) continue;
      var clickEl = node.closest("button") || node.closest("[role='button']") || node;
      if (clickEl && clickEl.click) {
        clickEl.click();
        return t;
      }
    }
    return null;
  }

  function isSplitMode(root) {
    var nodes = iterClickables(root);
    for (var i = 0; i < nodes.length; i++) {
      if (normText(nodes[i]) === "退出分屏") return true;
    }
    return false;
  }

  function isEditMode(root) {
    var nodes = iterClickables(root);
    for (var i = 0; i < nodes.length; i++) {
      if (normText(nodes[i]) === "预览") return true;
    }
    return false;
  }

  function hideSplitUI(root) {
    root.classList.add("rs-html-block-root");
    iterClickables(root).forEach(function (el) {
      var t = normText(el);
      if (t === "分屏" || t === "退出分屏") {
        var btn = el.closest("button") || el.closest("[role='button']") || el;
        btn.classList.add("rs-html-hide-split");
      }
    });
  }

  function injectFullscreenButton(root) {
    if (root.querySelector("[data-rs-html-fs-btn]")) return;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.rsHtmlFsBtn = "1";
    btn.textContent = "全屏编辑";
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      openFullscreen(root);
    });

    var header = root.children[0];
    if (header && header.children.length) {
      header.children[header.children.length - 1].appendChild(btn);
      return;
    }

    var nodes = iterClickables(root);
    for (var i = 0; i < nodes.length; i++) {
      if (normText(nodes[i]) !== "编辑") continue;
      var anchor = nodes[i].closest("button") || nodes[i].parentElement;
      if (anchor && anchor.parentElement) {
        anchor.parentElement.insertBefore(btn, anchor.nextSibling);
        return;
      }
    }
  }

  function prepareBlock(root) {
    if (!root || (fsState && fsState.root === root)) return;
    hideSplitUI(root);
    injectFullscreenButton(root);
    if (isSplitMode(root)) clickByLabels(root, ["退出分屏"]);
    else if (isEditMode(root) && !fsState) clickByLabels(root, ["预览"]);
  }

  function prepareAllBlocks() {
    findBlockRoots().forEach(prepareBlock);
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
    if (n > 60) return;
    setTimeout(function () {
      waitForEditorSlot(root, cb, n + 1);
    }, 50);
  }

  function focusEditor() {
    var content = overlayBody && overlayBody.querySelector(".cm-editor .cm-content");
    if (content && content.focus) content.focus();
  }

  function mountSlot(root, slot) {
    if (fsState && fsState.active) return;
    ensureOverlay();
    var placeholder = document.createComment("rs-html-fs-anchor");
    var parent = slot.parentElement;
    if (!parent) return;
    parent.insertBefore(placeholder, slot);
    overlayBody.innerHTML = "";
    overlayBody.appendChild(slot);
    root.classList.add("rs-html-block-root", "rs-html-fs-source");
    overlay.classList.remove("rs-html-fs-hidden");
    fsState = { active: true, root: root, slot: slot, placeholder: placeholder, parent: parent };
    setTimeout(focusEditor, 40);
  }

  function openFullscreen(root) {
    if (!root || (fsState && fsState.active)) return;
    ensureOverlay();
    hideSplitUI(root);
    root.classList.add("rs-html-block-root");

    var existing = getEditorSlot(root);
    if (existing) {
      mountSlot(root, existing);
      return;
    }

    fsOpening = true;
    clickByLabels(root, ["编辑"]);
    fsOpening = false;
    waitForEditorSlot(root, function (slot) {
      mountSlot(root, slot);
    });
  }

  function closeFullscreen() {
    if (!fsState || !fsState.active) return;
    var st = fsState;
    fsState = null;

    if (st.slot && st.parent && st.placeholder && st.slot.parentElement === overlayBody) {
      st.parent.insertBefore(st.slot, st.placeholder);
      st.placeholder.remove();
    }

    st.root.classList.remove("rs-html-fs-source");
    overlay.classList.add("rs-html-fs-hidden");
    if (overlayBody) overlayBody.innerHTML = "";

    if (isEditMode(st.root) || getEditorSlot(st.root)) {
      clickByLabels(st.root, ["预览"]);
    }
    prepareBlock(st.root);
  }

  function onCmDetected(root) {
    if (!root || !isHtmlBlockRoot(root)) return;
    if (fsState && fsState.active) return;
    if (fsOpening) return;

    if (isSplitMode(root)) {
      prepareBlock(root);
      return;
    }

    if (isEditMode(root) && getEditorSlot(root)) {
      openFullscreen(root);
    }
  }

  function scheduleScan() {
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = setTimeout(function () {
      prepareAllBlocks();
      findBlockRoots().forEach(function (root) {
        if (getEditorSlot(root) && isEditMode(root) && !(fsState && fsState.active)) {
          onCmDetected(root);
        }
      });
    }, 100);
  }

  function hookDocument() {
    if (document.__rsHtmlBlockDocHook) return;
    document.addEventListener(
      "click",
      function (e) {
        if (fsOpening) return;
        var root = findBlockFromTarget(e.target);
        if (!root) return;
        var btn = e.target && e.target.closest ? e.target.closest("button, [role='button']") : null;
        if (!btn || !root.contains(btn)) return;
        var t = normText(btn);
        if (t === "分屏" || t === "退出分屏") {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      },
      true
    );
    document.__rsHtmlBlockDocHook = true;
  }

  function watchCm(pm) {
    if (pm.__rsHtmlBlockCmMo) return;
    var mo = new MutationObserver(function (mutations) {
      var touched = false;
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        if (m.type === "childList") {
          m.addedNodes.forEach(function (node) {
            if (node.nodeType !== 1) return;
            if (node.classList && node.classList.contains("cm-editor")) touched = true;
            if (node.querySelector && node.querySelector(".cm-editor")) touched = true;
          });
        }
      }
      if (touched) scheduleScan();
      else scheduleScan();
    });
    mo.observe(pm, { childList: true, subtree: true });
    pm.__rsHtmlBlockCmMo = true;
  }

  function boot() {
    var pm = getPm();
    if (!pm) return false;
    pmRoot = pm;
    injectStyles();
    ensureOverlay();
    hookDocument();
    watchCm(pm);
    prepareAllBlocks();
    return true;
  }

  window.RSHtmlBlockCompact.init = boot;

  [0, 100, 300, 700, 1500, 3000, 6000, 10000, 15000].forEach(function (ms) {
    setTimeout(boot, ms);
  });

  console.log(
    "[rs-html-block-compact] v" +
      RS_HTML_BLOCK_VER +
      " 已就绪：默认预览 +「全屏编辑」按钮，原生编辑亦会全屏"
  );
})();
