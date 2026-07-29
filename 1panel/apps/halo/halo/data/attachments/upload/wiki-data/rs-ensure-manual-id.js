/* =======================================================
   RS EnsureManualId — 前台缺 ID 时注入（快速编辑）；正文请用 ensure-halo-manual-id.py 入库
   ======================================================= */
(function () {
  var PATH_PREFIX = "/archives/";
  if (location.pathname.indexOf(PATH_PREFIX) !== 0) return;

  function slugFromPath() {
    var slug = decodeURIComponent(
      location.pathname.slice(PATH_PREFIX.length).replace(/\/$/, "")
    );
    return slug && slug.indexOf("..") < 0 ? slug : "";
  }

  function manualBlock(postName) {
    return (
      '<div class="html-edited"><div id="halo-manual-id" style="display:none;">' +
      postName +
      "</div></div>"
    );
  }

  function inject(postName) {
    if (document.getElementById("halo-manual-id")) return;
    var root =
      document.querySelector(".markdown-body") ||
      document.querySelector(".post-content") ||
      document.querySelector("article.post");
    if (!root) return;
    var wrap = document.createElement("div");
    wrap.innerHTML = manualBlock(postName);
    var node = wrap.firstElementChild;
    if (node) root.insertBefore(node, root.firstChild);
  }

  var slug = slugFromPath();
  if (!slug) return;

  fetch(
    "/apis/api.content.halo.run/v1alpha1/posts?fieldSelector=" +
      encodeURIComponent("spec.slug=" + slug) +
      "&size=1",
    { credentials: "same-origin" }
  )
    .then(function (r) {
      return r.json();
    })
    .then(function (data) {
      var items = data.items || [];
      if (!items.length) return;
      var name = items[0].metadata && items[0].metadata.name;
      if (name) inject(name);
    })
    .catch(function () {
      /* ignore */
    });
})();
