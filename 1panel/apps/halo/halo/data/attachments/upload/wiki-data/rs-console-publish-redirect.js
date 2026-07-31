/* =======================================================
   RS Console — 后台发布成功后跳转前台文章页（非文章管理列表）
   ======================================================= */
(function () {
  "use strict";

  if (location.pathname.indexOf("/console") !== 0) return;

  var RS_PUBLISH_REDIRECT_VER = "1.1";
  if (window.RSPublishRedirect && window.RSPublishRedirect.__ver === RS_PUBLISH_REDIRECT_VER) {
    return;
  }
  window.RSPublishRedirect = window.RSPublishRedirect || {};
  window.RSPublishRedirect.__ver = RS_PUBLISH_REDIRECT_VER;

  var PATH_PREFIX = "/archives/";
  var PUBLISH_URL_RE =
    /\/apis\/(?:uc\.api\.content|api\.console)\.halo\.run\/v1alpha1\/posts\/([^/?#]+)\/publish\b/;
  var redirecting = false;
  var publishArmedUntil = 0;
  var lastPublishedPostName = null;

  function onEditorPage() {
    return location.pathname.indexOf("/console/posts/editor") >= 0;
  }

  function editorPostNameFromUrl() {
    try {
      return new URLSearchParams(location.search).get("name") || "";
    } catch (e) {
      return "";
    }
  }

  function getCookie(name) {
    var m = document.cookie.match(
      new RegExp("(?:^|; )" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "=([^;]*")
    );
    return m ? decodeURIComponent(m[1]) : "";
  }

  function apiHeaders() {
    var headers = { Accept: "application/json" };
    var xsrf = getCookie("XSRF-TOKEN");
    if (xsrf) headers["X-XSRF-TOKEN"] = xsrf;
    return headers;
  }

  function goToArchivesSlug(slug) {
    if (!slug || redirecting) return;
    redirecting = true;
    publishArmedUntil = 0;
    window.location.replace(PATH_PREFIX + encodeURIComponent(slug).replace(/%2F/g, "/"));
  }

  function fetchPostSlug(postName, cb) {
    var apis = [
      "/apis/uc.api.content.halo.run/v1alpha1/posts/" + encodeURIComponent(postName),
      "/apis/api.console.halo.run/v1alpha1/posts/" + encodeURIComponent(postName),
    ];
    function tryNext(i) {
      if (i >= apis.length) {
        cb(null);
        return;
      }
      fetch(apis[i], { credentials: "include", headers: apiHeaders() })
        .then(function (r) {
          if (!r.ok) throw new Error(String(r.status));
          return r.json();
        })
        .then(function (post) {
          var slug = post && post.spec && post.spec.slug;
          cb(slug || null);
        })
        .catch(function () {
          tryNext(i + 1);
        });
    }
    tryNext(0);
  }

  function redirectToPublicPost(postName) {
    if (!postName || redirecting) return;
    lastPublishedPostName = postName;
    publishArmedUntil = Date.now() + 12000;
    fetchPostSlug(postName, function (slug) {
      if (slug) {
        goToArchivesSlug(slug);
        return;
      }
      redirecting = false;
    });
  }

  function extractPublishPostName(url, method) {
    if (!url) return null;
    var m = String(url).match(PUBLISH_URL_RE);
    if (!m) return null;
    var verb = (method || "GET").toUpperCase();
    if (verb !== "PUT" && verb !== "POST") return null;
    return decodeURIComponent(m[1]);
  }

  function maybePublishRedirect(url, method, ok) {
    if (!ok) return;
    var postName = extractPublishPostName(url, method);
    if (postName) redirectToPublicPost(postName);
  }

  function shouldBlockConsoleNav(url) {
    if (!publishArmedUntil || Date.now() > publishArmedUntil) return false;
    if (!lastPublishedPostName) return false;
    var s = String(url || "");
    if (!s) return false;
    if (s.indexOf("/archives/") >= 0) return false;
    return s.indexOf("/console/posts") >= 0 && s.indexOf("/console/posts/editor") < 0;
  }

  function hookHistory() {
    if (history.__rsPublishHook) return;
    ["pushState", "replaceState"].forEach(function (method) {
      var orig = history[method];
      history[method] = function (_state, _title, url) {
        if (shouldBlockConsoleNav(url)) {
          redirectToPublicPost(lastPublishedPostName);
          return;
        }
        return orig.apply(this, arguments);
      };
    });
    history.__rsPublishHook = true;
  }

  function hookLocationAssign() {
    if (window.__rsPublishLocationHook) return;
    var origAssign = window.location.assign.bind(window.location);
    var origReplace = window.location.replace.bind(window.location);
    window.location.assign = function (url) {
      if (shouldBlockConsoleNav(url)) {
        redirectToPublicPost(lastPublishedPostName);
        return;
      }
      return origAssign(url);
    };
    window.location.replace = function (url) {
      if (shouldBlockConsoleNav(url) && String(url).indexOf("/archives/") < 0) {
        redirectToPublicPost(lastPublishedPostName);
        return;
      }
      return origReplace(url);
    };
    window.__rsPublishLocationHook = true;
  }

  function hookFetch() {
    if (!window.fetch || window.fetch.__rsPublishHook) return;
    var nativeFetch = window.fetch;
    window.fetch = function (input, init) {
      var url = typeof input === "string" ? input : input && input.url;
      var method = (init && init.method) || "GET";
      return nativeFetch.apply(this, arguments).then(function (res) {
        try {
          maybePublishRedirect(url, method, res && res.ok);
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
          maybePublishRedirect(xhr.__rsUrl, xhr.__rsMethod, xhr.status >= 200 && xhr.status < 300);
        } catch (e2) {
          /* ignore */
        }
      });
      return origSend.apply(this, arguments);
    };
    XMLHttpRequest.prototype.__rsPublishHook = true;
  }

  hookHistory();
  hookLocationAssign();
  hookFetch();
  hookXhr();

  if (onEditorPage()) {
    var bootName = editorPostNameFromUrl();
    if (bootName) lastPublishedPostName = bootName;
  }

  console.log("[rs-publish-redirect] v" + RS_PUBLISH_REDIRECT_VER + " 已就绪：发布后跳转 /archives/{slug}");
})();
