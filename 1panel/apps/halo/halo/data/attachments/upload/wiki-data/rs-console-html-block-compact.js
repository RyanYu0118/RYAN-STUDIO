/* =======================================================
   RS Console — HTML 编辑块默认预览高度（hybrid-edit-block）
   退出分屏，仅显示渲染效果；点击「编辑」/「分屏」仍可用原生控件
   ======================================================= */
(function () {
  "use strict";

  if (location.pathname.indexOf("/console/posts/editor") < 0) return;

  var RS_HTML_BLOCK_VER = "1.0";
  if (window.RSHtmlBlockCompact && window.RSHtmlBlockCompact.__ver === RS_HTML_BLOCK_VER) {
    return;
  }
  window.RSHtmlBlockCompact = window.RSHtmlBlockCompact || {};
  window.RSHtmlBlockCompact.__ver = RS_HTML_BLOCK_VER;

  var cfg = (window.RSConfig && window.RSConfig.htmlBlockCompact) || {};
  if (cfg.enabled === false) return;

  var BLOCK_TYPES = cfg.types || ["html_edited"];
  var EDIT_MAX_HEIGHT = typeof cfg.editMaxHeight === "string" ? cfg.editMaxHeight : "min(42vh, 420px)";
  var scanTimer = null;
  var styleInjected = false;

  function blockSelector() {
    return BLOCK_TYPES.map(function (t) {
      return '[data-type="' + t + '"]';
    }).join(",");
  }

  function injectStyles() {
    if (styleInjected) return;
    styleInjected = true;
    var sel = blockSelector();
    var css =
      sel + " > div:last-child{min-height:0!important;height:auto!important}" +
      sel + " .html-edited," + sel + " .markdown-edited{min-height:0!important}" +
      sel + " .cm-editor{max-height:" + EDIT_MAX_HEIGHT + "!important;height:auto!important;flex:none!important}" +
      sel + " .cm-editor .cm-scroller{overflow:auto!important;max-height:inherit!important}";
    var tag = document.createElement("style");
    tag.id = "rs-html-block-compact-style";
    tag.textContent = css;
    document.head.appendChild(tag);
  }

  function findBlocks(root) {
    root = root || document;
    return root.querySelectorAll(blockSelector());
  }

  function buttonText(btn) {
    return (btn && (btn.textContent || btn.innerText) || "").replace(/\s+/g, " ").trim();
  }

  function isSplitMode(wrapper) {
    var buttons = wrapper.querySelectorAll("button");
    for (var i = 0; i < buttons.length; i++) {
      if (buttonText(buttons[i]) === "退出分屏") return true;
    }
    return false;
  }

  function clickExitSplit(wrapper) {
    var buttons = wrapper.querySelectorAll("button");
    for (var i = 0; i < buttons.length; i++) {
      if (buttonText(buttons[i]) === "退出分屏") {
        buttons[i].click();
        return true;
      }
    }
    return false;
  }

  function compactBlock(wrapper) {
    if (!wrapper || wrapper.dataset.rsHtmlCompact === "off") return;
    if (wrapper.classList.contains("ProseMirror-selectednode")) return;
    if (isSplitMode(wrapper)) clickExitSplit(wrapper);
    wrapper.dataset.rsHtmlCompact = "1";
  }

  function compactAll() {
    findBlocks().forEach(compactBlock);
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
        var btn = e.target && e.target.closest ? e.target.closest("button") : null;
        if (!btn) return;
        var wrap = btn.closest(blockSelector());
        if (!wrap) return;
        var t = buttonText(btn);
        if (t === "分屏") wrap.dataset.rsHtmlCompact = "off";
        if (t === "退出分屏") wrap.dataset.rsHtmlCompact = "1";
      },
      true
    );
    pm.__rsHtmlBlockBtnHook = true;
  }

  function watchSelection(pm) {
    if (pm.__rsHtmlBlockSelHook) return;
    var lastSelected = null;
    var selMo = new MutationObserver(function () {
      var selected = pm.querySelector(blockSelector() + ".ProseMirror-selectednode");
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

  var tries = [0, 120, 400, 900, 1800, 3500];
  tries.forEach(function (ms) {
    setTimeout(boot, ms);
  });

  console.log("[rs-html-block-compact] v" + RS_HTML_BLOCK_VER + " 已就绪：HTML 编辑块默认预览高度");
})();
