/* =======================================================
   RS Console — 后台发布成功后跳转前台文章页
   ======================================================= */
(function () {
  if (location.pathname.indexOf("/console") !== 0) return;

  var PATH_PREFIX = "/archives/";
  var pending = false;

  function getCookie(name) {
    var m = document.cookie.match(
      new RegExp("(?:^|; )" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "=([^;]*)")
    );
    return m ? decodeURIComponent(m[1]) : "";
  }

  function apiHeaders() {
    var headers = { Accept: "application/json" };
    var xsrf = getCookie("XSRF-TOKEN");
    if (xsrf) headers["X-XSRF-TOKEN"] = xsrf;
    return headers;
  }

  function redirectToPublicPost(postName) {
    if (pending) return;
    pending = true;
    fetch("/apis/uc.api.content.halo.run/v1alpha1/posts/" + encodeURIComponent(postName), {
      credentials: "include",
      headers: apiHeaders(),
    })
      .then(function (r) {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then(function (post) {
        var slug = post.spec && post.spec.slug;
        if (!slug) throw new Error("no slug");
        window.location.replace(PATH_PREFIX + slug);
      })
      .catch(function () {
        pending = false;
      });
  }

  function maybePublishRedirect(input, init, res) {
    if (!res || !res.ok) return;
    var method = (init && init.method) || "GET";
    if (method.toUpperCase() !== "PUT") return;
    var url = typeof input === "string" ? input : input && input.url;
    if (!url) return;
    var m = url.match(/\/apis\/uc\.api\.content\.halo\.run\/v1alpha1\/posts\/([^/?#]+)\/publish\b/);
    if (m) redirectToPublicPost(decodeURIComponent(m[1]));
  }

  function hookFetch() {
    if (!window.fetch || window.fetch.__rsPublishHook) return;
    var nativeFetch = window.fetch;
    window.fetch = function (input, init) {
      return nativeFetch.apply(this, arguments).then(function (res) {
        try {
          maybePublishRedirect(input, init, res);
        } catch (e) {
          /* ignore */
        }
        return res;
      });
    };
    window.fetch.__rsPublishHook = true;
  }

  function hookXhr() {
    if (XMLHttpRequest.prototype.__rsPublishHook) return;
    var origOpen = XMLHttpRequest.prototype.open;
    var origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
      this.__rsMethod = method;
      this.__rsUrl = url;
      return origOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function () {
      var xhr = this;
      xhr.addEventListener("load", function () {
        try {
          if (xhr.status < 200 || xhr.status >= 300) return;
          maybePublishRedirect(xhr.__rsUrl, { method: xhr.__rsMethod }, { ok: true });
        } catch (e2) {
          /* ignore */
        }
      });
      return origSend.apply(this, arguments);
    };
    XMLHttpRequest.prototype.__rsPublishHook = true;
  }

  hookFetch();
  hookXhr();
})();
