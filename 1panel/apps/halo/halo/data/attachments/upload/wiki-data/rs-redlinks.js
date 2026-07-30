/* =======================================================
   RS Redlinks — MediaWiki 风格红链：点击先发布再跳转文章页
   ======================================================= */
(function () {
  var cfg = (window.RSConfig && window.RSConfig.redlinks) || {};
  if (cfg.enabled === false) return;

  var SLUG_INDEX = cfg.slugIndex || "/upload/wiki-data/wiki-slugs.json";
  var PATH_PREFIX = cfg.pathPrefix || "/archives/";
  var WIKI_CATEGORY = cfg.defaultCategory || "category-f8bm8yzr";
  var MINIGAME_CATEGORY = cfg.minecraftCategory || "category-1g9f80go";
  var POST_OWNER = cfg.postOwner || "ryanyu";
  var SLUG_PREFIX = cfg.slugPrefix || "mcwws_";

  var slugSet = null;
  var slugSetLoadedAt = 0;
  var CACHE_MS = cfg.cacheMs || 15 * 60 * 1000;
  var REDLINK_TARGET_ANN = "rs.wiki/redlink-target-slug";
  var SESSION_MAP_KEY = "rsWikiRedlinkMap";
  var redlinkTargetMap = null;
  var redlinkTargetLoadPromise = null;

  function syncSessionRedlinkMap(map) {
    try {
      sessionStorage.setItem(SESSION_MAP_KEY, JSON.stringify(map || {}));
    } catch (e) {
      /* ignore */
    }
  }

  function registerRedlinkTarget(linkTarget, postSlug) {
    if (!linkTarget || !postSlug) return;
    if (!redlinkTargetMap) redlinkTargetMap = {};
    redlinkTargetMap[linkTarget] = postSlug;
    try {
      var o = {};
      Object.keys(redlinkTargetMap).forEach(function (k) {
        o[k] = redlinkTargetMap[k];
      });
      sessionStorage.setItem(SESSION_MAP_KEY, JSON.stringify(o));
    } catch (e2) {
      /* ignore */
    }
  }

  function loadRedlinkTargetMap(force) {
    if (force) {
      redlinkTargetLoadPromise = null;
      redlinkTargetMap = null;
    }
    if (redlinkTargetLoadPromise) return redlinkTargetLoadPromise;
    redlinkTargetLoadPromise = fetchAllPublishedRedlinkTargets()
      .then(function (map) {
        redlinkTargetMap = map;
        syncSessionRedlinkMap(map);
        return map;
      })
      .catch(function (err) {
        console.warn("[rs-redlinks] 红链目标映射加载失败", err);
        redlinkTargetMap = redlinkTargetMap || {};
        return redlinkTargetMap;
      });
    return redlinkTargetLoadPromise;
  }

  function fetchAllPublishedRedlinkTargets() {
    var map = {};
    var page = 1;
    function nextPage() {
      return fetch(
        "/apis/api.content.halo.run/v1alpha1/posts?page=" + page + "&size=100",
        { credentials: "same-origin" }
      )
        .then(function (r) {
          return r.json();
        })
        .then(function (data) {
          (data.items || []).forEach(function (post) {
            if (!isPostPublished(post)) return;
            var ann = post.metadata && post.metadata.annotations;
            var target = ann && ann[REDLINK_TARGET_ANN];
            var ps = post.spec && post.spec.slug;
            if (target && ps) map[target] = ps;
          });
          if (data.hasNext) {
            page += 1;
            return nextPage();
          }
          return map;
        });
    }
    return nextPage();
  }

  function removeStaleRedlinkTarget(linkTarget) {
    if (redlinkTargetMap && redlinkTargetMap[linkTarget]) {
      delete redlinkTargetMap[linkTarget];
      syncSessionRedlinkMap(redlinkTargetMap);
    }
  }

  function checkLinkTarget(linkTarget) {
    return slugPublishedViaApi(linkTarget).then(function (direct) {
      if (direct) return { linkTarget: linkTarget, ready: true, postSlug: linkTarget };
      return loadRedlinkTargetMap().then(function (map) {
        var postSlug = map[linkTarget];
        if (!postSlug) {
          removeStaleRedlinkTarget(linkTarget);
          return { linkTarget: linkTarget, ready: false, postSlug: null };
        }
        return slugPublishedViaApi(postSlug).then(function (ok) {
          if (!ok) {
            removeStaleRedlinkTarget(linkTarget);
            return { linkTarget: linkTarget, ready: false, postSlug: null };
          }
          return { linkTarget: linkTarget, ready: true, postSlug: postSlug };
        });
      });
    });
  }

  function applyPublishedLink(anchor, linkTarget, postSlug) {
    anchor.setAttribute("data-rs-wiki-slug", linkTarget);
    if (postSlug) anchor.setAttribute("data-rs-wiki-post-slug", postSlug);
    anchor.setAttribute("href", PATH_PREFIX + (postSlug || linkTarget));
    anchor.classList.remove("rs-wiki-redlink");
    anchor.classList.remove("rs-wiki-redlink--pending");
    anchor.removeAttribute("title");
  }

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
    if (labels["content.halo.run/deleted"] === "true") return false;
    if (labels["content.halo.run/published"] === "true") return true;
    var spec = post.spec || {};
    if (spec.deleted === true) return false;
    var status = post.status || {};
    return spec.publish === true && status.phase === "PUBLISHED";
  }

  /** mcwws_ + 红链目标路径（player/rules → mcwws_player_rules）；无英文路径时再退化为标题拉丁字符 */
  function slugFromRedlink(linkSlug, title) {
    var base = "";
    if (linkSlug) {
      base = String(linkSlug)
        .replace(/\\/g, "/")
        .replace(/^\/+|\/+$/g, "")
        .replace(/\//g, "_")
        .replace(/[^\w_]+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "")
        .toLowerCase();
    }
    if (base && base !== "index") {
      return SLUG_PREFIX + base;
    }
    var s = String(title || "")
      .trim()
      .replace(
        /[\s\u00a0·•，,。！？!?：:；;\/\\|（）()\[\]【】《》「」『』"'""''\-]+/g,
        "_"
      )
      .replace(/[^\w]+/g, "")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .toLowerCase();
    if (!s) s = "untitled";
    var out = SLUG_PREFIX + s;
    if (out.length > 180) out = out.slice(0, 180).replace(/_+$/, "");
    return out;
  }

  function slugFromTitle(title) {
    return slugFromRedlink("", title);
  }

  function ensureUniquePublishSlug(candidate, postName, attempt) {
    attempt = attempt || 0;
    return fetchPostBySlug(candidate).then(function (post) {
      if (!post) return candidate;
      if (attempt >= 8) {
        return candidate + "_" + String(postName).replace(/-/g, "").slice(0, 8);
      }
      var suffix = attempt === 0 ? String(postName).replace(/-/g, "").slice(0, 6) : String(attempt + 2);
      return ensureUniquePublishSlug(candidate + "_" + suffix, postName, attempt + 1);
    });
  }

  /** 红链新建 slug：默认标题 → mcwws_*；slugFromPostName 时用 UUID；否则可用链接 slug */
  function resolvePublishSlug(linkSlug, postName, title) {
    if (cfg.slugFromTitle !== false) {
      return {
        publishSlug: slugFromRedlink(linkSlug, title),
        linkTarget: linkSlug || "",
        usedPostId: false,
        fromTitle: true,
      };
    }
    if (cfg.slugFromPostName === true) {
      return { publishSlug: postName, linkTarget: linkSlug || "", usedPostId: true };
    }
    if (linkSlug) {
      return { publishSlug: linkSlug, linkTarget: linkSlug, usedPostId: false };
    }
    return { publishSlug: postName, linkTarget: "", usedPostId: true };
  }

  function resolvePublishSlugUnique(linkSlug, postName, title) {
    var resolved = resolvePublishSlug(linkSlug, postName, title);
    return ensureUniquePublishSlug(resolved.publishSlug, postName).then(function (publishSlug) {
      resolved.publishSlug = publishSlug;
      return resolved;
    });
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
      a.classList.add("rs-wiki-redlink");
      a.setAttribute("title", "尚未发布 · 点击将先发布并打开该页");
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
    var line = "待完善。";
    var html =
      '<div class="html-edited"><div id="halo-manual-id" style="display:none;">' +
      postName +
      "</div></div><p>" +
      line +
      "</p>";
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

  function createAndPublishRedlink(linkSlug, title, postName, sourcePost, resolved) {
    postName = postName || crypto.randomUUID();
    resolved = resolved || resolvePublishSlug(linkSlug, postName, title);
    var publishSlug = resolved.publishSlug;
    var draftContent = buildRedlinkDraftContent(postName, title);
    var contentJson = JSON.stringify({
      raw: draftContent.raw,
      content: draftContent.content,
      rawType: draftContent.rawType,
    });
    var now = new Date().toISOString().replace(/\.\d{3}Z$/, ".000000000Z");
    var inherited = inheritMetaFromSource(sourcePost);
    var headers = apiHeaders();

    var annotations = {
      "content.halo.run/preferred-editor": "default",
      "content.halo.run/permalink-pattern": "/archives/{slug}",
      "content.halo.run/content-json": contentJson,
    };
    if (resolved.linkTarget) {
      annotations["rs.wiki/redlink-target-slug"] = resolved.linkTarget;
    }

    var body = {
      apiVersion: "content.halo.run/v1alpha1",
      kind: "Post",
      metadata: {
        name: postName,
        annotations: annotations,
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
        slug: publishSlug,
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
            return fetchPostBySlug(publishSlug).then(function (existing) {
              if (existing && existing.metadata && existing.metadata.name) {
                var en = existing.metadata.name;
                if (isPostPublished(existing)) {
                  return { ok: true, name: en, slug: publishSlug, existed: true, published: true };
                }
                return publishPostAndWait(en, headers)
                  .then(function () {
                    return repairPostOnce(en, headers);
                  })
                  .then(function () {
                    return waitUntilPublished(publishSlug).then(function () {
                      return { ok: true, name: en, slug: publishSlug, existed: true, published: true };
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
              return waitUntilPublished(publishSlug);
            })
            .then(function (pubOk) {
              if (!pubOk) {
                return slugPublishedViaApi(publishSlug).then(function (ok) {
                  if (!ok) {
                    throw new Error("发布未完成，请稍后在控制台检查 slug: " + publishSlug);
                  }
                });
              }
            })
            .then(function () {
              return {
                ok: true,
                name: name,
                slug: publishSlug,
                linkTarget: resolved.linkTarget,
                usedPostId: resolved.usedPostId,
                published: true,
              };
            });
        });
      })
      .catch(function (err) {
        return { ok: false, error: String(err) };
      });
  }

  function navigateToPublishedArticle(slug) {
    window.location.href = PATH_PREFIX + slug;
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

    checkLinkTarget(slug).then(function (st) {
      if (st.ready && st.postSlug) {
        window.location.href = PATH_PREFIX + st.postSlug;
        return;
      }
      startRedlinkCreate(a, slug);
    });
  }

  function startRedlinkCreate(a, slug) {
    var title = linkTitle(a);
    var sourceSlug = parseArchivesSlug(location.pathname);
    var postName = crypto.randomUUID();

    resolvePublishSlugUnique(slug, postName, title).then(function (resolved) {
      var publishSlug = resolved.publishSlug;
      if (
        !window.confirm(
          "条目「" +
            title +
            "」尚未发布。\n\n将继承当前页的分类、标签与封面，" +
            "新建文章并以别名 `" +
            publishSlug +
            "` 作为地址（链接目标 `" +
            slug +
            "` 写入注解），发布后在当前页打开？"
        )
      ) {
        return;
      }
      a.classList.add("rs-wiki-redlink--pending");

      fetchPostBySlug(sourceSlug || "")
        .then(function (sourcePost) {
          return createAndPublishRedlink(slug, title, postName, sourcePost, resolved);
        })
        .then(function (result) {
          a.classList.remove("rs-wiki-redlink--pending");
          if (result.needLogin) {
            var ret = encodeURIComponent(location.pathname + location.search);
            window.location.href = "/login?redirect_uri=" + ret;
            return;
          }
          if (!result.ok) {
            alert("发布失败：" + (result.error || "未知错误"));
            return;
          }
          var linkTarget = result.linkTarget || slug;
          registerRedlinkTarget(linkTarget, result.slug);
          applyPublishedLink(a, linkTarget, result.slug);
          navigateToPublishedArticle(result.slug);
        })
        .catch(function (err) {
          a.classList.remove("rs-wiki-redlink--pending");
          alert("发布失败：" + err);
        });
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
    loadSlugSet(false)
      .then(function (set) {
        return loadRedlinkTargetMap().then(function () {
          return set;
        });
      })
      .then(function (set) {
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
          return checkLinkTarget(slug);
        })
      ).then(function (results) {
        results.forEach(function (r) {
          root.querySelectorAll('a[data-rs-wiki-slug="' + r.linkTarget + '"]').forEach(function (a) {
            if (r.ready && r.postSlug) {
              applyPublishedLink(a, r.linkTarget, r.postSlug);
              if (slugSet) slugSet.add(r.linkTarget);
            } else {
              a.setAttribute("href", PATH_PREFIX + r.linkTarget);
              a.classList.add("rs-wiki-redlink");
              a.removeAttribute("data-rs-wiki-post-slug");
              a.setAttribute("title", "尚未发布 · 点击将先发布并打开该页");
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
