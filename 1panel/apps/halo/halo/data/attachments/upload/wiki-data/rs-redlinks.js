/* =======================================================
   RS Redlinks — MediaWiki 风格红链：先发布再编辑
   ======================================================= */
(function () {
  var cfg = (window.RSConfig && window.RSConfig.redlinks) || {};
  if (cfg.enabled === false) return;

  var SLUG_INDEX = cfg.slugIndex || "/upload/wiki-data/wiki-slugs.json";
  var PATH_PREFIX = cfg.pathPrefix || "/archives/";
  var WIKI_CATEGORY = cfg.defaultCategory || "category-f8bm8yzr";
  var MINIGAME_CATEGORY = cfg.minecraftCategory || "category-1g9f80go";
  var POST_OWNER = cfg.postOwner || "ryanyu";

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
        slugSet = new Set(data.slugs || data.publishedSlugs || []);
        slugSetLoadedAt = now;
        return slugSet;
      })
      .catch(function (err) {
        console.warn("[rs-redlinks] slug 索引加载失败，将用 API 校验已发布", err);
        slugSet = slugSet || new Set();
        slugSetLoadedAt = now;
        return slugSet;
      });
  }

  function isPostPublished(post) {
    if (!post) return false;
    var labels = (post.metadata && post.metadata.labels) || {};
    if (labels["content.halo.run/published"] === "true") return true;
    var spec = post.spec || {};
    var status = post.status || {};
    return spec.publish === true && status.phase === "PUBLISHED";
  }

  function fetchPostBySlug(slug) {
    var q =
      "/apis/api.content.halo.run/v1alpha1/posts?fieldSelector=" +
      encodeURIComponent("spec.slug=" + slug) +
      "&size=1";
    return fetch(q, { credentials: "same-origin" })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        var items = data.items || [];
        return items.length ? items[0] : null;
      })
      .catch(function () {
        return null;
      });
  }

  function slugPublishedViaApi(slug) {
    return fetchPostBySlug(slug).then(isPostPublished);
  }

  function markLinks(root, set) {
    var links = root.querySelectorAll('a[href*="' + PATH_PREFIX + '"]');
    links.forEach(function (a) {
      if (a.closest(".rs-wiki-redlink-skip")) return;
      var slug = parseArchivesSlug(a.getAttribute("href"));
      if (!slug) return;
      a.setAttribute("data-rs-wiki-slug", slug);
      if (set.has(slug)) {
        a.classList.remove("rs-wiki-redlink");
        a.removeAttribute("title");
        return;
      }
      a.classList.add("rs-wiki-redlink");
      a.setAttribute("title", "尚未发布 · 点击将先发布再编辑");
      a.setAttribute("href", PATH_PREFIX + slug);
    });
  }

  function linkTitle(anchor) {
    var text = (anchor.textContent || "").replace(/\s+/g, " ").trim();
    if (text) return text;
    var slug = anchor.getAttribute("data-rs-wiki-slug") || "";
    var parts = slug.split("/");
    return parts[parts.length - 1] || slug;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function wait(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function apiHeaders() {
    var headers = { "Content-Type": "application/json", Accept: "application/json" };
    var xsrf = getCookie("XSRF-TOKEN");
    if (xsrf) headers["X-XSRF-TOKEN"] = xsrf;
    return headers;
  }

  function fetchUcPost(name, headers) {
    return fetch("/apis/uc.api.content.halo.run/v1alpha1/posts/" + encodeURIComponent(name), {
      credentials: "include",
      headers: headers,
    }).then(function (r) {
      if (!r.ok) throw new Error("get post " + r.status);
      return r.json();
    });
  }

  function inheritMetaFromSource(sourcePost) {
    var categories = [WIKI_CATEGORY];
    var tags = [];
    var cover = "";
    if (sourcePost && sourcePost.spec) {
      var spec = sourcePost.spec;
      if (spec.categories && spec.categories.length) {
        categories = spec.categories.slice();
      }
      if (spec.tags && spec.tags.length) {
        tags = spec.tags.slice();
      }
      if (spec.cover) {
        cover = spec.cover;
      }
    } else {
      if (location.pathname.indexOf("player/") >= 0 || location.pathname.indexOf("wwswiki") >= 0) {
        categories.push(MINIGAME_CATEGORY);
      }
    }
    return { categories: categories, tags: tags, cover: cover };
  }

  function buildRedlinkDraftContent(postName, title) {
    var manualBlock =
      '<div class="html-edited"><div id="halo-manual-id" style="display:none;">' +
      postName +
      "</div></div>";
    var bodyBlock =
      '<div class="html-edited"><h1>' +
      escapeHtml(title) +
      "</h1><p>（由 Wiki 红链创建，待完善。）</p></div>";
    var html = manualBlock + bodyBlock;
    return { raw: html, content: html, rawType: "html" };
  }

  function publishPostAndWait(name, headers) {
    return fetch(
      "/apis/uc.api.content.halo.run/v1alpha1/posts/" + encodeURIComponent(name) + "/publish",
      {
        method: "PUT",
        credentials: "include",
        headers: headers,
        body: "{}",
      }
    ).then(function (res) {
      if (res.ok) return res;
      return res.text().then(function (t) {
        throw new Error("发布失败 HTTP " + res.status + (t ? ": " + t.slice(0, 200) : ""));
      });
    });
  }

  function repairPostOnce(name, headers) {
    return fetchUcPost(name, headers).then(function (post) {
      var spec = post.spec || {};
      var status = post.status || {};
      var head = spec.headSnapshot || spec.baseSnapshot;
      if (!head) return post;
      if (status.inProgress !== true && spec.releaseSnapshot) return post;
      spec.releaseSnapshot = head;
      status.inProgress = false;
      post.spec = spec;
      post.status = status;
      return fetch("/apis/uc.api.content.halo.run/v1alpha1/posts/" + encodeURIComponent(name), {
        method: "PUT",
        credentials: "include",
        headers: headers,
        body: JSON.stringify(post),
      }).then(function () {
        return post;
      });
    });
  }

  function waitUntilPublished(slug, attempt) {
    attempt = attempt || 0;
    if (attempt > 20) return Promise.resolve(false);
    return slugPublishedViaApi(slug).then(function (ok) {
      if (ok) return true;
      return wait(250).then(function () {
        return waitUntilPublished(slug, attempt + 1);
      });
    });
  }

  function createAndPublishRedlink(slug, title, postName, sourcePost) {
    postName = postName || crypto.randomUUID();
    var draftContent = buildRedlinkDraftContent(postName, title);
    var contentJson = JSON.stringify({
      raw: draftContent.raw,
      content: draftContent.content,
      rawType: draftContent.rawType,
    });
    var now = new Date().toISOString().replace(/\.\d{3}Z$/, ".000000000Z");
    var inherited = inheritMetaFromSource(sourcePost);
    var headers = apiHeaders();

    var body = {
      apiVersion: "content.halo.run/v1alpha1",
      kind: "Post",
      metadata: {
        name: postName,
        annotations: {
          "content.halo.run/preferred-editor": "default",
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
        categories: inherited.categories,
        cover: inherited.cover,
        deleted: false,
        excerpt: { autoGenerate: true, raw: "" },
        htmlMetas: [],
        owner: POST_OWNER,
        pinned: false,
        priority: 0,
        publish: false,
        publishTime: "",
        slug: slug,
        tags: inherited.tags,
        template: "",
        title: title,
        visible: "PUBLIC",
      },
    };

    return fetch("/apis/uc.api.content.halo.run/v1alpha1/posts", {
      method: "POST",
      credentials: "include",
      headers: headers,
      body: JSON.stringify(body),
    })
      .then(function (res) {
        if (res.status === 401 || res.status === 403) {
          return { ok: false, needLogin: true };
        }
        if (!res.ok) {
          return res.text().then(function (t) {
            return fetchPostBySlug(slug).then(function (existing) {
              if (existing && existing.metadata && existing.metadata.name) {
                var en = existing.metadata.name;
                if (isPostPublished(existing)) {
                  return { ok: true, name: en, slug: slug, existed: true, published: true };
                }
                return publishPostAndWait(en, headers)
                  .then(function () {
                    return repairPostOnce(en, headers);
                  })
                  .then(function () {
                    return waitUntilPublished(slug).then(function () {
                      return { ok: true, name: en, slug: slug, existed: true, published: true };
                    });
                  })
                  .catch(function (err) {
                    return { ok: false, error: String(err) };
                  });
              }
              return { ok: false, error: t || String(res.status) };
            });
          });
        }
        return res.json().then(function (post) {
          var name = (post.metadata && post.metadata.name) || postName;
          return publishPostAndWait(name, headers)
            .then(function () {
              return repairPostOnce(name, headers);
            })
            .then(function () {
              return waitUntilPublished(slug);
            })
            .then(function (pubOk) {
              if (!pubOk) {
                return slugPublishedViaApi(slug).then(function (ok) {
                  if (!ok) {
                    throw new Error("发布未完成，请稍后在控制台检查 slug: " + slug);
                  }
                });
              }
            })
            .then(function () {
              return { ok: true, name: name, slug: slug, published: true };
            });
        });
      })
      .catch(function (err) {
        return { ok: false, error: String(err) };
      });
  }

  function openWaitWindow() {
    var w = null;
    try {
      w = window.open("", "_blank");
    } catch (e) {
      return null;
    }
    if (!w) return null;
    try {
      w.document.open();
      w.document.write(
        "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>Wiki 发布</title>" +
          "<style>body{font-family:system-ui,sans-serif;margin:0;min-height:100vh;display:flex;" +
          "align-items:center;justify-content:center;background:#111;color:#eee}" +
          ".box{text-align:center;padding:2rem;max-width:26rem;line-height:1.6}</style></head>" +
          "<body><div class=\"box\"><p style=\"font-size:1.1rem;margin:0 0 .5rem\">正在发布 Wiki 条目…</p>" +
          "<p style=\"opacity:.65;font-size:.9rem;margin:0\">继承当前页分类/标签/封面，完成后进入编辑器</p></div></body></html>"
      );
      w.document.close();
    } catch (e2) {
      /* ignore */
    }
    return w;
  }

  function showWaitError(win, message) {
    if (!win || win.closed) return;
    try {
      win.document.open();
      win.document.write(
        "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>发布失败</title></head>" +
          "<body style=\"font-family:system-ui;padding:2rem;max-width:32rem;line-height:1.6\">" +
          "<h1 style=\"font-size:1.1rem\">发布失败</h1><pre style=\"white-space:pre-wrap;opacity:.85\">" +
          String(message).replace(/</g, "&lt;") +
          "</pre></body></html>"
      );
      win.document.close();
    } catch (e) {
      win.close();
    }
  }

  function openEditorWindow(editorWin, postName) {
    var url = "/console/posts/editor?name=" + encodeURIComponent(postName);
    if (editorWin && !editorWin.closed) {
      try {
        editorWin.location.href = url;
        editorWin.focus();
        return;
      } catch (e) {
        /* fall through */
      }
    }
    var w = window.open(url, "_blank");
    if (!w) window.location.href = url;
  }

  function markLinkPublished(anchor, slug) {
    if (slugSet) slugSet.add(slug);
    anchor.classList.remove("rs-wiki-redlink");
    anchor.classList.remove("rs-wiki-redlink--pending");
    anchor.removeAttribute("title");
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
    var title = linkTitle(a);
    var sourceSlug = parseArchivesSlug(location.pathname);
    if (
      !window.confirm(
        "条目「" +
          title +
          "」尚未发布。\n\n将继承当前页的分类、标签与封面，" +
          "先发布 slug `" +
          slug +
          "`，再打开编辑器继续修改？"
      )
    ) {
      return;
    }
    var postName = crypto.randomUUID();
    var waitWin = openWaitWindow();
    a.classList.add("rs-wiki-redlink--pending");

    fetchPostBySlug(sourceSlug || "")
      .then(function (sourcePost) {
        return createAndPublishRedlink(slug, title, postName, sourcePost);
      })
      .then(function (result) {
        a.classList.remove("rs-wiki-redlink--pending");
        if (result.needLogin) {
          if (waitWin && !waitWin.closed) waitWin.close();
          var ret = encodeURIComponent(location.pathname + location.search);
          window.location.href = "/login?redirect_uri=" + ret;
          return;
        }
        if (!result.ok) {
          showWaitError(waitWin, result.error || "未知错误");
          alert("发布失败：" + (result.error || "未知错误"));
          return;
        }
        markLinkPublished(a, slug);
        openEditorWindow(waitWin, result.name);
      })
      .catch(function (err) {
        a.classList.remove("rs-wiki-redlink--pending");
        showWaitError(waitWin, String(err));
        alert("发布失败：" + err);
      });
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
      var slugs = [];
      root.querySelectorAll("[data-rs-wiki-slug]").forEach(function (a) {
        var s = a.getAttribute("data-rs-wiki-slug");
        if (s && slugs.indexOf(s) === -1) slugs.push(s);
      });
      if (slugs.length === 0) {
        bindRedlinks(root);
        return;
      }
      Promise.all(
        slugs.map(function (slug) {
          return slugPublishedViaApi(slug).then(function (published) {
            return { slug: slug, published: published };
          });
        })
      ).then(function (results) {
        results.forEach(function (r) {
          root.querySelectorAll('a[data-rs-wiki-slug="' + r.slug + '"]').forEach(function (a) {
            if (r.published) {
              if (slugSet) slugSet.add(r.slug);
              a.classList.remove("rs-wiki-redlink");
              a.removeAttribute("title");
            } else {
              a.classList.add("rs-wiki-redlink");
              a.setAttribute("title", "尚未发布 · 点击将先发布再编辑");
            }
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
