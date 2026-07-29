/* =======================================================
   RSAnchorScroll - 统一锚点 / 目录跳转偏移 (V1.0)
   覆盖：tocbot 目录、文内锚点、地址栏 hash、布局延迟（Wiki 侧边栏/评论迁移）
   ======================================================= */
(function () {
    'use strict';

    var cfg = (window.RSConfig && window.RSConfig.anchorScroll) || {};
    var EXTRA_GAP = typeof cfg.extraGap === 'number' ? cfg.extraGap : 8;
    var RETRY_MS = Array.isArray(cfg.loadRetryMs)
        ? cfg.loadRetryMs
        : [0, 120, 400, 800, 1500, 3000, 5000];

    function getNavHeight() {
        var nav = document.getElementById('navbar');
        if (!nav) {
            return 80;
        }
        return nav.getBoundingClientRect().height;
    }

    function getScrollOffset() {
        return getNavHeight() + EXTRA_GAP;
    }

    function syncCssOffsetVar() {
        var offset = getScrollOffset();
        document.documentElement.style.setProperty('--rs-scroll-offset', offset + 'px');
    }

    function injectStyles() {
        if (document.getElementById('rs-anchor-scroll-style')) {
            return;
        }
        var style = document.createElement('style');
        style.id = 'rs-anchor-scroll-style';
        style.textContent = [
            ':root { --rs-scroll-offset: 88px; }',
            '.markdown-body :is(h1,h2,h3,h4,h5,h6)[id],',
            '.markdown-body .rs-scroll-target[id] {',
            '  scroll-margin-top: var(--rs-scroll-offset);',
            '}',
            '.markdown-body .nav-quote-box { scroll-margin-top: var(--rs-scroll-offset); }'
        ].join('\n');
        document.head.appendChild(style);
        syncCssOffsetVar();
    }

    /** 零高度 h2 锚点时，滚到可见的引用块容器 */
    function resolveScrollTarget(el) {
        if (!el) {
            return el;
        }
        var box = el.closest('.nav-quote-box');
        if (box) {
            var h = el.getBoundingClientRect().height;
            if (h < 4) {
                return box;
            }
        }
        return el;
    }

    function scrollToElement(el, behavior) {
        var target = resolveScrollTarget(el);
        if (!target) {
            return false;
        }
        syncCssOffsetVar();
        var y = target.getBoundingClientRect().top + window.pageYOffset - getScrollOffset();
        window.scrollTo({
            top: Math.max(0, y),
            behavior: behavior || 'smooth'
        });
        return true;
    }

    function scrollToId(id, behavior) {
        if (!id) {
            return false;
        }
        var el = document.getElementById(id);
        return scrollToElement(el, behavior);
    }

    function hashFromHref(href) {
        if (!href || href.charAt(0) !== '#') {
            return '';
        }
        try {
            return decodeURIComponent(href.slice(1));
        } catch (e) {
            return href.slice(1);
        }
    }

    function isInPageAnchorLink(anchor) {
        if (!anchor || !anchor.getAttribute) {
            return false;
        }
        var href = anchor.getAttribute('href');
        if (!href || href.charAt(0) !== '#') {
            return false;
        }
        var id = hashFromHref(href);
        return id && !!document.getElementById(id);
    }

    function handleAnchorClick(event) {
        var anchor = event.target.closest('a[href^="#"]');
        if (!anchor || !isInPageAnchorLink(anchor)) {
            return;
        }

        var id = hashFromHref(anchor.getAttribute('href'));
        if (!id) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') {
            event.stopImmediatePropagation();
        }

        scrollToId(id, 'smooth');
        if (history.replaceState) {
            history.replaceState(null, '', '#' + id);
        } else {
            location.hash = id;
        }
    }

    function bindGlobalClickCapture() {
        if (document.documentElement.dataset.rsAnchorScrollBound) {
            return;
        }
        document.documentElement.dataset.rsAnchorScrollBound = '1';
        document.addEventListener('click', handleAnchorClick, true);
    }

    function scrollHashFromUrl(behavior) {
        if (!location.hash || location.hash.length < 2) {
            return;
        }
        var id = hashFromHref(location.hash);
        scrollToId(id, behavior);
    }

    function scheduleHashRetries() {
        if (!location.hash || location.hash.length < 2) {
            return;
        }
        RETRY_MS.forEach(function (delay) {
            setTimeout(function () {
                scrollHashFromUrl('auto');
            }, delay);
        });
    }

    function watchLayoutChanges() {
        var nav = document.getElementById('navbar');
        if (nav && window.ResizeObserver) {
            var ro = new ResizeObserver(function () {
                syncCssOffsetVar();
            });
            ro.observe(nav);
        }
        window.addEventListener('resize', syncCssOffsetVar);
        window.addEventListener('hashchange', function () {
            scrollHashFromUrl('smooth');
        });
        window.addEventListener('load', scheduleHashRetries);
        document.addEventListener('DOMContentLoaded', scheduleHashRetries);
    }

    window.RSAnchorScroll = {
        getScrollOffset: getScrollOffset,
        scrollToId: scrollToId,
        scrollToElement: scrollToElement,
        syncCssOffsetVar: syncCssOffsetVar
    };

    injectStyles();
    bindGlobalClickCapture();
    watchLayoutChanges();
    scheduleHashRetries();

    console.log('📍 RSAnchorScroll: 已启用（偏移 = 顶栏高度 + ' + EXTRA_GAP + 'px）');
})();
