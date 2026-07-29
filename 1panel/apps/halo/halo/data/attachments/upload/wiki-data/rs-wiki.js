/* =======================================================
   3. RSWiki - 侧边栏与地图模块 (V110.1 交互核心修复版)
   ======================================================= */
(function() {
    console.log("📖 RS Wiki 模块加载中...");
    
    var cfg = window.RSConfig;
    var mapUrl = cfg.urls.map;

    // =======================================================
    // 0. 🎨 样式补丁 (核心修复 + 动画)
    // =======================================================
    var style = document.createElement('style');
    style.innerHTML = `
        /* --- 🚑 1. 基础交互修复 (找回丢失的点击权) --- */
        #my-custom-sidebar { pointer-events: none !important; } /* 容器本身不挡鼠标 */
        .wiki-sidebar-inner { pointer-events: none !important; }
        .wiki-sidebar-card { pointer-events: auto !important; } /* 🔥 卡片强制可点击！ */

        /* --- 2. 全屏模式样式 --- */
        #sidebar-comment-card.is-fullscreen-mode {
            position: fixed !important;
            top: 50% !important;
            left: 50% !important;
            transform: translate(-50%, -50%) !important;
            width: 60vw !important;
            height: 80vh !important;
            z-index: 2147483647 !important;
            background: rgba(20, 20, 20, 0) !important;
            backdrop-filter: blur(20px);
            border: 1px solid rgba(255,255,255,0.2);
            border-radius: 12px !important;
            box-shadow: 0 30px 60px rgba(0,0,0,0.8) !important;
            padding: 0 !important;
            display: flex !important;
            flex-direction: column !important;
            overflow: hidden !important;
        }
        #sidebar-comment-card.is-fullscreen-mode #comment-card-header { flex-shrink: 0 !important; }
        #sidebar-comment-card.is-fullscreen-mode > div:last-child {
            flex-grow: 1 !important; height: 0 !important; overflow-y: auto !important; padding: 10px 25px 25px 25px !important; 
        }
        #sidebar-comment-card.is-fullscreen-mode textarea { min-height: 200px !important; }

        /* --- 3. 侧边栏评论区微缩适配 --- */
        #sidebar-comment-card:not(.is-fullscreen-mode) #sidebar-comment-placeholder {
            zoom: 0.85; -moz-transform: scale(0.85); -moz-transform-origin: top left; width: 100%;
        }
        #sidebar-comment-card:not(.is-fullscreen-mode) textarea {
            min-height: 50px !important; height: 50px !important; font-size: 12px !important; line-height: 1.4 !important;
        }

        /* --- 🔥 4. 地图折叠动画 🔥 --- */
        #sidebar-map-card {
            transition: height 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            overflow: hidden;
        }
        #sidebar-map-card.is-collapsed { height: 50px !important; }
        
        #btn-map-toggle {
            display: inline-block; transition: transform 0.3s ease; cursor: pointer; padding: 5px;
        }
        #sidebar-map-card.is-collapsed #btn-map-toggle { transform: rotate(-90deg); }

        /* --- ✨ 5. 遮罩淡入动画 ✨ --- */
        #fullscreen-mask {
            opacity: 0;
            transition: opacity 0.3s ease;
            pointer-events: none !important; /* 默认完全穿透 */
        }
        #fullscreen-mask.active {
            opacity: 1;
            pointer-events: auto !important; /* 激活时才挡住 */
        }

        /* --- 🚀 6. 地图全屏弹窗动画 --- */
        #wiki-map-modal {
            position: fixed; top: 50%; left: 50%; width: 85vw; height: 85vh; 
            z-index: 2147483647;
            background: rgba(20, 20, 20, 0.95);
            backdrop-filter: blur(20px);
            border: 1px solid rgba(255,255,255,0.2);
            border-radius: 12px;
            box-shadow: 0 50px 100px rgba(0,0,0,0.8);
            display: flex; flex-direction: column; overflow: hidden;
            
            /* 初始状态 */
            opacity: 0;
            visibility: hidden;
            transform: translate(-50%, -45%) scale(0.96); 
            transition: opacity 0.3s ease, transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), visibility 0.3s;
        }
        #wiki-map-modal.active {
            opacity: 1;
            visibility: visible;
            transform: translate(-50%, -50%) scale(1);
        }
    `;
    document.head.appendChild(style);

    // =======================================================
    // A. 资源注入
    // =======================================================
    var wikiCfg = (cfg && cfg.wiki) || {};
    var enableBannerVideo = wikiCfg.enableBannerVideo !== false;
    var banner = document.getElementById('banner');
    if (enableBannerVideo && banner && !banner.querySelector('.custom-wiki-video')) {
        var v = document.createElement('video');
        v.src = cfg.urls.video;
        v.className = 'custom-wiki-video';
        v.autoplay = true; v.loop = true; v.muted = true; v.playsInline = true;
        v.style.cssText = `position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0;`;
        banner.appendChild(v);
        var m = banner.querySelector('.mask'); if(m) m.style.zIndex='1';
        var t = banner.querySelector('.banner-text'); if(t) t.style.zIndex='2';
    }

    var links = document.querySelectorAll("link[rel*='icon']");
    if (links.length) links.forEach(l => l.href = cfg.urls.icon);
    var h1 = document.querySelector('.post-content h1, #board h1, h1.title, .index-header h1');
    if (h1 && !h1.querySelector('.custom-wiki-icon')) {
       var old = h1.querySelector('i'); if(old) old.style.display='none';
       var img = document.createElement("img");
       img.className = "custom-wiki-icon"; img.src = cfg.urls.icon;
       img.style.cssText = "width:40px; height:40px; vertical-align:middle; margin-right:10px; display:inline-block;";
       h1.insertBefore(img, h1.firstChild);
    }

    // =======================================================
    // B. 侧边栏构建
    // =======================================================
    if (window.innerWidth > 992) {
        if (document.getElementById('my-custom-sidebar')) return;

        var commonHeaderStyle = "padding:6px 12px; border-bottom:2px solid rgb(43, 184, 220); display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); flex-shrink:0; height:50px; transition: all 0.3s ease;"; 
        var commonTitleStyle  = "margin:0; font-size:0.9rem; border:none; font-weight:bold; line-height:1.2;";
        var cardWrapperStyle  = "padding:0 !important; display:flex; flex-direction:column; overflow:hidden;";

        var sidebarDiv = document.createElement('div');
        sidebarDiv.id = 'my-custom-sidebar';
        sidebarDiv.innerHTML = `
          <div class="wiki-sidebar-inner">
            <div class="wiki-sidebar-card" style="${cardWrapperStyle}">
              <div style="${commonHeaderStyle}">
                 <h3 style="${commonTitleStyle}">🌟 服务器状态</h3>
              </div>
              <div style="padding: 6px 12px;">
                  <p style="margin:1px 0; line-height:1.4; font-size:13px;">🟢 运行中 | TPS: 19.98</p>
                  <p style="margin:1px 0; line-height:1.4; font-size:13px;">👥 在线: 124/500</p>
                  <div style="width:100%; height:5px; background:#eee; border-radius:3px; margin-top:6px;">
                     <div style="width:25%; height:100%; background:#4caf50; border-radius:3px;"></div>
                  </div>
              </div>
            </div>
            
            <div class="wiki-sidebar-card" id="sidebar-map-card" style="${cardWrapperStyle} height:260px;">
              <div class="map-card-header" style="${commonHeaderStyle}">
                 <h3 style="${commonTitleStyle}">🗺️ 在线地图</h3>
                 <div style="display:flex; align-items:center; gap:12px;">
                     <span id="btn-map-toggle" style="font-size:12px; color:#2a73a7;" title="折叠/展开（地图离线时自动折叠）">▼</span>
                     <span id="btn-map-fullscreen-trigger" style="font-size:16px; color:#2a73a7; cursor:pointer; transition:0.2s;" title="全屏查看">⛶</span>
                 </div>
              </div>
              <div class="map-card-body" style="flex-grow:1; width:100%; height:100%; position:relative; overflow:hidden;">
                 <iframe id="map-iframe-mini" src="" style="width:200%; height:200%; border:none; transform: scale(0.5); transform-origin: 0 0;" allow="fullscreen" referrerpolicy="no-referrer"></iframe>
              </div>
            </div>

            <div class="wiki-sidebar-card mini-comments" id="sidebar-comment-card" style="${cardWrapperStyle}">
                <div id="comment-card-header" style="${commonHeaderStyle}">
                    <h3 id="comment-card-title" style="${commonTitleStyle}">💬 评论区</h3>
                    <span id="comment-expand-btn" style="font-size:16px; color:#2a73a7; cursor:pointer; font-weight:normal;" title="全屏阅读">⛶</span>
                </div>
                <div style="flex-grow:1; display:flex; flex-direction:column; padding:0;">
                    <div id="sidebar-comment-placeholder" style="padding:10px;"><p style="font-size:12px; color:#ccc; padding:10px;">评论加载中...</p></div>
                </div>
            </div>
          </div>
          
          <div id="fullscreen-mask" style="position:fixed; top:0; left:0; width:100vw; height:100vh; background:transparent; z-index:9998; backdrop-filter:blur(6px);"></div>
          
          <div id="wiki-map-modal">
              <div style="display:flex; justify-content:space-between; align-items:center; padding: 6px 15px; height: 42px; flex-shrink:0; background:rgba(255,255,255,0.02);">
                  <h3 style="margin:0; font-size:1rem; color:inherit; border:none; line-height:1;">🗺️ 在线地图</h3>
                  <div style="display:flex; gap:15px; align-items:center;">
                      <a href="${mapUrl}" target="_blank" style="font-size:12px; color:#2a73a7; text-decoration:none;">🔗 跳转</a>
                      <span id="btn-close-map" style="font-size:22px; cursor:pointer; color:#2a73a7; line-height:1;">×</span>
                  </div>
              </div>
              <div style="flex-grow:1; width:100%; height:100%; background:rgba(0,0,0,0.2); overflow:hidden;">
                  <iframe id="map-iframe-large" style="width:100%; height:100%; border:none;" src="" allow="fullscreen" referrerpolicy="no-referrer"></iframe>
              </div>
          </div>
        `;
        document.body.appendChild(sidebarDiv);

        var threshold = cfg.sidebar.startTop - cfg.sidebar.fixedTop;
        function updateSidebar() {
            var sb = document.getElementById('my-custom-sidebar');
            if (!sb) return;
            if (window.scrollY >= threshold) {
                sb.classList.add('is-fixed-now'); sb.style.top = cfg.sidebar.fixedTop + 'px';
            } else {
                sb.classList.remove('is-fixed-now'); sb.style.top = cfg.sidebar.startTop + 'px';
            }
        }
        window.addEventListener('scroll', updateSidebar);
        updateSidebar();

        var attempts = 0;
        var timer = setInterval(function() {
            attempts++;
            var originalComments = document.getElementById('comments');
            var targetPlace = document.getElementById('sidebar-comment-placeholder');
            if (originalComments && targetPlace) {
                targetPlace.innerHTML = ''; targetPlace.appendChild(originalComments); clearInterval(timer);
            }
            if (attempts >= 30) clearInterval(timer);
        }, 500);

        initInteractions(mapUrl, commonHeaderStyle);
    }

    // =======================================================
    // C. 交互逻辑 (集成网络探针 & 动画)
    // =======================================================
    function initInteractions(url, defaultHeaderStyle) {
        var commentBtn = document.getElementById('comment-expand-btn');
        var commentCard = document.getElementById('sidebar-comment-card');
        var commentHeader = document.getElementById('comment-card-header'); 
        var commentTitle = document.getElementById('comment-card-title');   

        var mapCard = document.getElementById('sidebar-map-card');
        var mapToggleBtn = document.getElementById('btn-map-toggle');
        var mapTrigger = document.getElementById('btn-map-fullscreen-trigger');
        var mapModal = document.getElementById('wiki-map-modal');
        var mapCloseBtn = document.getElementById('btn-close-map');
        var mapMini = document.getElementById('map-iframe-mini');
        var mapLarge = document.getElementById('map-iframe-large');
        var mask = document.getElementById('fullscreen-mask');

        // 🔥 1. 地图状态管理 (网络探针) 🔥
        var mapTimer = null;

        async function probeMapConnection(targetUrl) {
            try {
                await fetch(targetUrl, { mode: 'no-cors', cache: 'no-store' });
                return true; 
            } catch (e) {
                return false; 
            }
        }

        function checkAndHandleMapStatus() {
            if (!mapMini.src || mapMini.src === "about:blank") return;
            probeMapConnection(mapMini.src).then(isOnline => {
                if (isOnline) {
                    console.log("🗺️ 服务在线");
                    if (mapTimer) clearTimeout(mapTimer);
                    if (mapCard.classList.contains('is-collapsed')) {
                        mapCard.classList.remove('is-collapsed');
                    }
                } else {
                    console.warn("🗺️ 服务不可达，折叠");
                    if (mapTimer) clearTimeout(mapTimer);
                    mapCard.classList.add('is-collapsed');
                }
            });
        }

        if(mapMini) {
            mapMini.onload = function() {
                checkAndHandleMapStatus();
            };
        }

        if(mapToggleBtn && mapCard) {
            mapToggleBtn.onclick = function() {
                mapCard.classList.toggle('is-collapsed');
            };
        }

        function updateResources() {
            var hidden = document.hidden;
            var full = mapModal.classList.contains('active');
            
            if (hidden) {
                mapMini.src = ""; mapLarge.src = "";
            } else {
                if (full) {
                    if (mapLarge.src !== url) mapLarge.src = url;
                    if (mapMini.src !== "") mapMini.src = "";
                } else {
                    if (mapMini.src !== url) {
                        mapMini.src = url;
                        if (mapTimer) clearTimeout(mapTimer);
                        mapTimer = setTimeout(() => {
                            mapCard.classList.add('is-collapsed');
                        }, 10000);
                        checkAndHandleMapStatus();
                    }
                    if (mapLarge.src !== "") mapLarge.src = "";
                }
            }
        }
        updateResources();
        document.addEventListener("visibilitychange", updateResources);

        // 💬 评论全屏切换
        if(commentBtn) commentBtn.onclick = () => {
            commentCard.classList.toggle('is-fullscreen-mode');
            var isFull = commentCard.classList.contains('is-fullscreen-mode');
            
            if (isFull) {
                commentBtn.innerText = "×"; 
                commentBtn.style.fontSize = "22px"; 
                mask.classList.add('active'); // 动画触发
                document.body.style.overflow = "hidden";
                
                commentHeader.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding: 0 15px; height: 42px; flex-shrink:0; background:rgba(255,255,255,0.02); border-bottom:none;";
                commentTitle.style.fontSize = "1rem";
                commentTitle.style.lineHeight = "1";
                commentTitle.style.marginTop = "20px";
                commentCard.style.padding = ""; 
            } else {
                commentBtn.innerText = "⛶"; 
                commentBtn.style.fontSize = "16px"; 
                mask.classList.remove('active'); 
                document.body.style.overflow = "auto";
                
                commentHeader.style.cssText = defaultHeaderStyle;
                commentTitle.style.fontSize = "0.9rem";
                commentTitle.style.lineHeight = "1.2";
                commentTitle.style.marginTop = "0"; 
                commentCard.style.setProperty('padding', '0', 'important');
            }
        };

        // 🗺️ 地图全屏触发
        if(mapTrigger) mapTrigger.onclick = () => {
            mapModal.classList.add('active'); 
            mask.classList.add('active');     
            document.body.style.overflow = "hidden";
            setTimeout(updateResources, 100);
        };

        // 关闭逻辑
        var closeAll = () => {
            if (mapModal.classList.contains('active')) {
                mapModal.classList.remove('active'); 
                if (!commentCard.classList.contains('is-fullscreen-mode')) {
                    mask.classList.remove('active');
                    document.body.style.overflow = "auto";
                }
                setTimeout(updateResources, 300);
            } 
            else if (commentCard.classList.contains('is-fullscreen-mode')) {
                commentBtn.click();
            }
        };

        if(mapCloseBtn) mapCloseBtn.onclick = closeAll;
        if(mask) mask.onclick = closeAll;
        document.addEventListener('keydown', (e) => { if(e.key==="Escape") closeAll(); });
    }
})();