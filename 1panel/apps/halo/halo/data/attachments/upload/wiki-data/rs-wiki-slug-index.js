/* =======================================================
   RS Wiki Slug Index — 合并 wiki-slugs.json + Halo 实时 API
   发布后自动刷新，无需手跑 export-wiki-slugs.py
   ======================================================= */
(function () {
  "use strict";

  var VER = "1.0";
  if (window.RSWikiSlugIndex && window.RSWikiSlugIndex.__ver === VER) return;

  var cfg = (window.RSConfig && window.RSConfig.slugIndex) || {};
  var JSON_URL = cfg.jsonUrl || "/upload/wiki-data/wiki-slugs.json";
  var API_TTL = typeof cfg.apiTtlMs === "number" ? cfg.apiTtlMs : 120000;
  var REDLINK_ANN = "rs.wiki/redlink-target-slug";
  var SESSION_KEY = "rsWikiSlugIndexV1";

  var state = {
    slugs: {},
    redlinkTargets: {},
    gitSlugs: [],
    jsonLoadedAt: 0,
    apiLoadedAt: 0,
    loading: null,
  };

  function slugKey(raw) {
    if (!raw) return "";
    var s = String(raw).trim().replace(/\\/g, "/");
    if (s.indexOf("/archives/") === 0) s = s.slice("/archives/".length);
    while (s.indexOf("../") === 0 || s.indexOf("./") === 0) s = s.replace(/^\.\.?\//, "");
    s = s.replace(/^\/+|\/+$/g, "");
    try {
      s = decodeURIComponent(s);
    } catch (e) {
      /* keep */
    }
    return s.replace(/^\/+|\/+$/g, "");
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

  function markPublished(slug, title) {
    var k = slugKey(slug);
    if (!k) return;
    state.slugs[k] = title || k;
  }

  function markRedlinkTarget(target, postSlug) {
    var t = slugKey(target);
    var p = slugKey(postSlug);
    if (!t || !p) return;
    state.redlinkTargets[t] = p;
    markPublished(p);
  }

  function hydrateFromSession() {
    try {
      var raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      if (!data || !data.slugs) return;
      Object.keys(data.slugs).forEach(function (k) {
        markPublished(k, data.slugs[k]);
      });
      Object.keys(data.redlinkTargets || {}).forEach(function (k) {
        state.redlinkTargets[k] = data.redlinkTargets[k];
      });
      if (data.apiLoadedAt) state.apiLoadedAt = data.apiLoadedAt;
    } catch (e) {
      /* ignore */
    }
  }

  function persistSession() {
    try {
      sessionStorage.setItem(
        SESSION_KEY,
        JSON.stringify({
          slugs: state.slugs,
          redlinkTargets: state.redlinkTargets,
          apiLoadedAt: state.apiLoadedAt,
        })
      );
    } catch (e) {
      /* ignore */
    }
  }

  function loadJsonIndex() {
    var now = Date.now();
    if (state.jsonLoadedAt && now - state.jsonLoadedAt < API_TTL) {
      return Promise.resolve();
    }
    return fetch(JSON_URL, { credentials: "same-origin", cache: "no-cache" })
      .then(function (r) {
        if (!r.ok) throw new Error("slug json " + r.status);
        return r.json();
      })
      .then(function (data) {
        state.gitSlugs = data.gitSlugs || [];
        (data.slugs || []).forEach(function (s) {
          markPublished(s);
        });
        (data.redlinkTargets || []).forEach(function (t) {
          var k = slugKey(t);
          if (k && !state.redlinkTargets[k]) state.redlinkTargets[k] = k;
        });
        state.jsonLoadedAt = now;
      })
      .catch(function (err) {
        console.warn("[rs-wiki-slug-index] JSON 索引加载失败，将仅用 API", err);
        state.jsonLoadedAt = now;
      });
  }

  function fetchPublishedFromApi(page, map) {
    return fetch(
      "/apis/api.content.halo.run/v1alpha1/posts?page=" + page + "&size=100",
      { credentials: "same-origin" }
    )
      .then(function (r) {
        if (!r.ok) throw new Error("posts api " + r.status);
        return r.json();
      })
      .then(function (data) {
        (data.items || []).forEach(function (post) {
          if (!isPostPublished(post)) return;
          var spec = post.spec || {};
          var slug = spec.slug;
          if (slug) markPublished(slug, spec.title || slug);
          var ann = post.metadata && post.metadata.annotations;
          var target = ann && ann[REDLINK_ANN];
          if (target && slug) markRedlinkTarget(target, slug);
        });
        if (data.hasNext && page < 30) return fetchPublishedFromApi(page + 1, map);
      });
  }

  function loadApiIndex(force) {
    var now = Date.now();
    if (!force && state.apiLoadedAt && now - state.apiLoadedAt < API_TTL) {
      return Promise.resolve();
    }
    return fetchPublishedFromApi(1)
      .then(function () {
        state.apiLoadedAt = Date.now();
        persistSession();
      })
      .catch(function (err) {
        console.warn("[rs-wiki-slug-index] API 索引刷新失败", err);
      });
  }

  function requestFileRebuild() {
    var rebuild = cfg.rebuild;
    if (!rebuild || rebuild.enabled === false) return;
    var url = rebuild.url;
    if (!url) return;
    try {
      fetch(url, { method: "POST", credentials: "omit", keepalive: true }).catch(function () {});
    } catch (e) {
      /* ignore */
    }
  }

  function refresh(force) {
    if (state.loading && !force) return state.loading;
    state.loading = loadJsonIndex()
      .then(function () {
        return loadApiIndex(!!force);
      })
      .then(function () {
        window.dispatchEvent(
          new CustomEvent("rs-wiki-slug-index-ready", { detail: { force: !!force } })
        );
      })
      .finally(function () {
        state.loading = null;
      });
    return state.loading;
  }

  function isPublished(linkTarget) {
    var k = slugKey(linkTarget);
    if (!k) return false;
    if (state.slugs[k]) return true;
    var mapped = state.redlinkTargets[k];
    return !!(mapped && state.slugs[mapped]);
  }

  function resolvePostSlug(linkTarget) {
    var k = slugKey(linkTarget);
    if (!k) return null;
    if (state.slugs[k]) return k;
    var mapped = state.redlinkTargets[k];
    if (mapped && state.slugs[mapped]) return mapped;
    return null;
  }

  function onPublish(slug, title) {
    markPublished(slug, title || slug);
    persistSession();
    refresh(true);
    requestFileRebuild();
  }

  function toSlugSet() {
    var set = {};
    Object.keys(state.slugs).forEach(function (k) {
      set[k] = true;
    });
    return set;
  }

  hydrateFromSession();

  window.RSWikiSlugIndex = {
    __ver: VER,
    refresh: refresh,
    onPublish: onPublish,
    isPublished: isPublished,
    resolvePostSlug: resolvePostSlug,
    getSlugs: function () {
      return state.slugs;
    },
    getRedlinkTargets: function () {
      return state.redlinkTargets;
    },
    getGitSlugs: function () {
      return state.gitSlugs.slice();
    },
    toSlugSet: toSlugSet,
    slugKey: slugKey,
  };

  refresh(false);
})();
