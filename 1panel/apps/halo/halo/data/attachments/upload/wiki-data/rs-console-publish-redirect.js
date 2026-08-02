/* =======================================================
   RS Console — 后台发布成功后跳转前台文章页（非文章管理列表）
   ======================================================= */
(function () {
  "use strict";

  if (location.pathname.indexOf("/console") !== 0) return;

  var RS_PUBLISH_REDIRECT_VER = "1.4";
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
  var navGuardTimer = null;

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

  function archivesPathFromSlug(slug) {
    return PATH_PREFIX + encodeURIComponent(String(slug)).replace(/%2F/g, "/");
  }

  function armPublishContext(postName) {
    if (!postName) return;
    if (window.RSEditScroll && window.RSEditScroll.refreshReturnContextCache) {
      window.RSEditScroll.refreshReturnContextCache();
    }
    if (window.RSEditScroll && window.RSEditScroll.saveReturnContext) {
      window.RSEditScroll.saveReturnContext(postName, null);
    }
  }

  function goToArchivesSlug(slug) {
    if (!slug || redirecting) return;
    redirecting = true;
    publishArmedUntil = 0;
    if (navGuardTimer) {
      clearInterval(navGuardTimer);
      navGuardTimer = null;
    }
    if (window.RSEditScroll && window.RSEditScroll.saveReturnContext) {
      window.RSEditScroll.saveReturnContext(lastPublishedPostName, slug);
    }
    window.location.replace(archivesPathFromSlug(slug));
  }

  function slugFromPostJson(data) {
    return data && data.spec && data.spec.slug;
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
          cb(slugFromPostJson(post) || null);
        })
        .catch(function () {
          tryNext(i + 1);
        });
    }
    tryNext(0);
  }

  function finishPublishRedirect(postName, slugHint) {
    if (!postName || redirecting) return;
    lastPublishedPostName = postName;
    publishArmedUntil = Date.now() + 15000;
    startNavGuard();

    function notifySlugIndex(slug) {
      if (slug && window.RSWikiSlugIndex && window.RSWikiSlugIndex.onPublish) {
        window.RSWikiSlugIndex.onPublish(slug);
      }
    }

    if (slugHint) {
      notifySlugIndex(slugHint);
      goToArchivesSlug(slugHint);
      return;
    }
    fetchPostSlug(postName, function (slug) {
      notifySlugIndex(slug);
      if (slug) goToArchivesSlug(slug);
      else redirecting = false;
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

  function shouldBlockConsoleNav(url) {
    if (!publishArmedUntil || Date.now() > publishArmedUntil) return false;
    if (!lastPublishedPostName) return false;
    var s = String(url || "");
    if (!s || s.indexOf("/archives/") >= 0) return false;
    return s.indexOf("/console/posts") >= 0 && s.indexOf("/console/posts/editor") < 0;
  }

  function onPathMaybeLeaveEditor() {
    if (!publishArmedUntil || Date.now() > publishArmedUntil || redirecting) return;
    if (!lastPublishedPostName) return;
    var p = location.pathname;
    if (p.indexOf("/console/posts/editor") >= 0) return;
    if (p === "/console/posts" || p.indexOf("/console/posts/") === 0) {
      finishPublishRedirect(lastPublishedPostName, null);
    }
  }

  function startNavGuard() {
    if (navGuardTimer) return;
    navGuardTimer = setInterval(onPathMaybeLeaveEditor, 120);
  }

  function hookHistory() {
    if (history.__rsPublishHook) return;
    ["pushState", "replaceState"].forEach(function (method) {
      var orig = history[method];
      history[method] = function (_state, _title, url) {
        if (shouldBlockConsoleNav(url)) {
          finishPublishRedirect(lastPublishedPostName, null);
          return;
        }
        var ret = orig.apply(this, arguments);
        setTimeout(onPathMaybeLeaveEditor, 0);
        return ret;
      };
    });
    window.addEventListener("popstate", function () {
      setTimeout(onPathMaybeLeaveEditor, 0);
    });
    history.__rsPublishHook = true;
  }

  function handlePublishResponse(postName, responseBody) {
    if (!postName) return;
    var slug = null;
    if (responseBody) {
      try {
        var data = typeof responseBody === "string" ? JSON.parse(responseBody) : responseBody;
        slug = slugFromPostJson(data);
      } catch (e) {
        /* ignore */
      }
    }
    finishPublishRedirect(postName, slug);
  }

  function hookFetch() {
    if (!window.fetch || window.fetch.__rsPublishHook) return;
    var nativeFetch = window.fetch;
    window.fetch = function (input, init) {
      var url = typeof input === "string" ? input : input && input.url;
      var method = (init && init.method) || "GET";
      var postName = extractPublishPostName(url, method);
      if (postName) armPublishContext(postName);
      return nativeFetch.apply(this, arguments).then(function (res) {
        if (postName && res && res.ok) {
          res.clone()
            .text()
            .then(function (text) {
              handlePublishResponse(postName, text);
            })
            .catch(function () {
              handlePublishResponse(postName, null);
            });
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
      var postName = extractPublishPostName(xhr.__rsUrl, xhr.__rsMethod);
      if (postName) armPublishContext(postName);
      xhr.addEventListener("load", function () {
        if (!postName || xhr.status < 200 || xhr.status >= 300) return;
        handlePublishResponse(postName, xhr.responseText || null);
      });
      return origSend.apply(this, arguments);
    };
    XMLHttpRequest.prototype.__rsPublishHook = true;
  }

  hookHistory();
  hookFetch();
  hookXhr();
  startNavGuard();

  if (onEditorPage()) {
    var bootName = editorPostNameFromUrl();
    if (bootName) lastPublishedPostName = bootName;
  }

  console.log("[rs-publish-redirect] v" + RS_PUBLISH_REDIRECT_VER + " 已就绪：发布后跳转 /archives/{slug} 并恢复浏览位置");
})();
