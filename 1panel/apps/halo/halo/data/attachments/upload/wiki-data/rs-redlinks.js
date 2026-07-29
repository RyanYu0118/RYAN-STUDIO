/* =======================================================
   RS Redlinks — MediaWiki 风格「红链」+ 登录用户一键建草稿
   ======================================================= */
(function () {
  var cfg = (window.RSConfig && window.RSConfig.redlinks) || {};
  if (cfg.enabled === false) return;

  var SLUG_INDEX = cfg.slugIndex || "/upload/wiki-data/wiki-slugs.json";
  var PATH_PREFIX = cfg.pathPrefix || "/archives/";
  var WIKI_CATEGORY = cfg.defaultCategory || "category-f8bm8yzr";
  var MINIGAME_CATEGORY = cfg.minecraftCategory || "category-1g9f80go";

  var slugSet = null;
  var slugSetLoadedAt = 0;
  var CACHE_MS = cfg.cacheMs || 15 * 60 * 1000;

  function getCookie(name) {
    var m = document.cookie.match(new RegExp("(?:^|; )" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : "";
  }

  function parseArchivesSlug(href) {
    if (!href) return null;
    var url;
    try {
      url = new URL(href, location.origin);
    } catch (e) {
      return null;
    }
    if (url.origin !== location.origin) return null;
    var path = url.pathname;
    if (!path.startsWith(PATH_PREFIX)) return null;
    var slug = decodeURIComponent(path.slice(PATH_PREFIX.length).replace(/\/$/, ""));
    if (!slug || slug.indexOf("..") >= 0) return null;
    return slug;
  }

  function contentRoot() {
    return (
      document.querySelector(".markdown-body") ||
      document.querySelector(".post-content") ||
      document.querySelector("article.post") ||
      document.querySelector("#content") ||
      document.body
    );
  }

  function injectStyles() {
    if (document.getElementById("rs-redlinks-style")) return;
    var style = document.createElement("style");
    style.id = "rs-redlinks-style";
    style.textContent =
      "a.rs-wiki-redlink{color:#c62828!important;border-bottom:1px dashed currentColor;text-decoration:none!important}" +
      "a.rs-wiki-redlink:hover{color:#b71c1c!important}" +
      "html[data-user-color-scheme='dark'] a.rs-wiki-redlink," +
      "@media (prefers-color-scheme:dark){html:not([data-user-color-scheme='light']) a.rs-wiki-redlink{color:#ff8a80!important}}" +
      "a.rs-wiki-redlink.rs-wiki-redlink--pending{opacity:0.6;pointer-events:none}";
    document.head.appendChild(style);
  }

  function loadSlugSet(force) {
    var now = Date.now();
    if (!force && slugSet && now - slugSetLoadedAt < CACHE_MS) {
      return Promise.resolve(slugSet);
    }
    return fetch(SLUG_INDEX, { credentials: "same-origin", cache: "no-cache" })
      .then(function (r) {
        if (!r.ok) throw new Error("slug index " + r.status);
        return r.json();
      })
      .then(function (data) {
        slugSet = new Set(data.slugs || []);
        slugSetLoadedAt = now;
        return slugSet;
      })
      .catch(function (err) {
        console.warn("[rs-redlinks] slug 索引加载失败，将用 API 逐条检测", err);
        slugSet = slugSet || new Set();
        slugSetLoadedAt = now;
        return slugSet;
      });
  }

  function slugExistsViaApi(slug) {
    var q =
      "/apis/api.content.halo.run/v1alpha1/posts?fieldSelector=" +
      encodeURIComponent("spec.slug=" + slug) +
      "&size=1";
    return fetch(q, { credentials: "same-origin" })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        return (data.total || 0) > 0;
      })
      .catch(function () {
        return true;
      });
  }

  function markLinks(root, set) {
    var links = root.querySelectorAll('a[href*="' + PATH_PREFIX + '"]');
    links.forEach(function (a) {
      if (a.classList.contains("rs-wiki-redlink")) return;
      if (a.closest(".rs-wiki-redlink-skip")) return;
      var slug = parseArchivesSlug(a.getAttribute("href"));
      if (!slug) return;
      var exists = set.has(slug);
      if (exists) return;
      a.classList.add("rs-wiki-redlink");
      a.setAttribute("data-rs-wiki-slug", slug);
      a.setAttribute("title", "条目尚未创建 · 点击可新建草稿（需登录）");
      a.setAttribute("href", PATH_PREFIX + slug);
    });
  }

  function mdToSimpleHtml(title, slug) {
    var t = title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return (
      "<h1>" +
      t +
      "</h1>\n<p>（由 Wiki 红链创建，待完善。）</p>\n<p><code>slug</code>: " +
      slug +
      "</p>"
    );
  }

  function createDraftViaApi(slug, title) {
    var postName = crypto.randomUUID();
    var raw = "# " + title + "\n\n（由 Wiki 红链创建，待完善。）\n";
    var content = mdToSimpleHtml(title, slug);
    var contentJson = JSON.stringify({
      raw: raw,
      content: content,
      rawType: "markdown",
    });
    var now = new Date().toISOString().replace(/\.\d{3}Z$/, ".000000000Z");
    var categories = [WIKI_CATEGORY];
    if (slug.indexOf("player/") === 0 || slug.indexOf("wwswiki") === 0) {
      categories.push(MINIGAME_CATEGORY);
    }
    var body = {
      apiVersion: "content.halo.run/v1alpha1",
      kind: "Post",
      metadata: {
        name: postName,
        annotations: {
          "content.halo.run/preferred-editor": "markdown",
          "content.halo.run/permalink-pattern": "/archives/{slug}",
          "content.halo.run/content-json": contentJson,
        },
        labels: {
          "content.halo.run/published": "false",
          "content.halo.run/deleted": "false",
          "content.halo.run/visible": "PUBLIC",
        },
      },
      spec: {
        allowComment: true,
        categories: categories,
        deleted: false,
        excerpt: { autoGenerate: true, raw: "" },
        htmlMetas: [],
        owner: "",
        pinned: false,
        priority: 0,
        publish: false,
        publishTime: now,
        slug: slug,
        tags: [],
        template: "",
        title: title,
        visible: "PUBLIC",
      },
    };
    var headers = { "Content-Type": "application/json", Accept: "application/json" };
    var xsrf = getCookie("XSRF-TOKEN");
    if (xsrf) headers["X-XSRF-TOKEN"] = xsrf;

    return fetch("/apis/uc.api.content.halo.run/v1alpha1/posts", {
      method: "POST",
      credentials: "include",
      headers: headers,
      body: JSON.stringify(body),
    }).then(function (res) {
      if (res.status === 401 || res.status === 403) {
        return { ok: false, needLogin: true };
      }
      if (!res.ok) {
        return res.text().then(function (t) {
          return { ok: false, error: t || res.status };
        });
      }
      return res.json().then(function (post) {
        var name = (post.metadata && post.metadata.name) || postName;
        var draft = {
          raw: raw,
          content: content,
          rawType: "markdown",
        };
        return fetch("/apis/uc.api.content.halo.run/v1alpha1/posts/" + name + "/draft", {
          method: "PUT",
          credentials: "include",
          headers: headers,
          body: JSON.stringify(draft),
        }).then(function () {
          return { ok: true, name: name, slug: slug };
        });
      });
    });
  }

  function onRedlinkClick(e) {
    var a = e.currentTarget;
    var slug = a.getAttribute("data-rs-wiki-slug");
    if (!slug) return;
    e.preventDefault();
    if (cfg.createOnClick === false) {
      window.location.href = PATH_PREFIX + slug;
      return;
    }
    var title = (a.textContent || slug).trim() || slug;
    if (!window.confirm("条目「" + title + "」尚未创建。\n\n是否为 slug `" + slug + "` 新建草稿并打开编辑器？")) {
      return;
    }
    a.classList.add("rs-wiki-redlink--pending");
    createDraftViaApi(slug, title)
      .then(function (result) {
        a.classList.remove("rs-wiki-redlink--pending");
        if (result.needLogin) {
          var ret = encodeURIComponent(location.pathname + location.search);
          window.location.href = "/login?redirect_uri=" + ret;
          return;
        }
        if (!result.ok) {
          alert("创建失败：" + (result.error || "未知错误") + "\n\n请改用控制台手动新建，slug 已复制到剪贴板。");
          copySlug(slug);
          return;
        }
        if (slugSet) slugSet.add(slug);
        a.classList.remove("rs-wiki-redlink");
        a.removeAttribute("data-rs-wiki-slug");
        window.open("/console/posts/editor?name=" + result.name, "_blank");
      })
      .catch(function (err) {
        a.classList.remove("rs-wiki-redlink--pending");
        alert("创建失败：" + err);
      });
  }

  function copySlug(slug) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(slug).catch(function () {});
    }
  }

  function bindRedlinks(root) {
    root.querySelectorAll("a.rs-wiki-redlink").forEach(function (a) {
      a.addEventListener("click", onRedlinkClick);
    });
  }

  function run() {
    injectStyles();
    var root = contentRoot();
    loadSlugSet(false).then(function (set) {
      markLinks(root, set);
      var unknown = [];
      root.querySelectorAll("a.rs-wiki-redlink").forEach(function (a) {
        unknown.push(a.getAttribute("data-rs-wiki-slug"));
      });
      if (unknown.length === 0) {
        bindRedlinks(root);
        return;
      }
      Promise.all(
        unknown.map(function (slug) {
          return slugExistsViaApi(slug).then(function (exists) {
            return { slug: slug, exists: exists };
          });
        })
      ).then(function (results) {
        results.forEach(function (r) {
          if (r.exists && slugSet) slugSet.add(r.slug);
          if (!r.exists) return;
          root.querySelectorAll('a.rs-wiki-redlink[data-rs-wiki-slug="' + r.slug + '"]').forEach(function (a) {
            a.classList.remove("rs-wiki-redlink");
            a.removeAttribute("data-rs-wiki-slug");
            a.removeAttribute("title");
          });
        });
        bindRedlinks(root);
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
