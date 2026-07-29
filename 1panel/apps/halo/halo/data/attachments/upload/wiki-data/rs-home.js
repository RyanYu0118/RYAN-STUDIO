/* =======================================================
   2. RSHome - 首页逻辑模块 (V104.1 光标换行修复版)
   ======================================================= */
(function() {
    console.log("🏠 RS Home 模块加载中...");
    
    var cfg = window.RSConfig; 

    // =======================================================
    // 0. 🎨 样式注入 (含 Banner修复 / 响应式字体 / 光标修复)
    // =======================================================
    var style = document.createElement('style');
    style.innerHTML = `
        /* 强制 Banner 占满首屏高度 */
        #banner {
            height: 100vh !important;
            min-height: 100vh !important;
            overflow: hidden !important;
            position: relative !important;
        }
        
        /* 确保视频绝对覆盖 */
        .custom-home-video {
            position: absolute !important;
            top: 50% !important;
            left: 50% !important;
            transform: translate(-50%, -50%) scale(1.1) !important;
            width: 100% !important;
            height: 100% !important;
            object-fit: cover !important;
            z-index: 0 !important;
            filter: blur(10px);
        }
        
        /* ✨ 响应式语料库样式 */
        #subtitle {
            font-family: 'Minecraft-AE', sans-serif !important;
            letter-spacing: 1px !important;
            text-shadow: 0 2px 4px rgba(0,0,0,0.5) !important;
            font-weight: normal !important;
            
            /* 📱 手机端默认大小：0.7em */
            font-size: 0.7em !important; 
            line-height: 1.4 !important;
            padding: 0 15px !important; 
            display: inline-block !important;
        }

        /* 💻 电脑端：宽度超过 768px 时切换至 1em */
        @media (min-width: 768px) {
            #subtitle {
                font-size: 1em !important;
                padding: 0 !important;
            }
        }
        
        /* 🔧 关键修复：光标紧贴文字，不换行 */
        .typed-cursor {
            font-family: inherit !important; /* 继承 Minecraft 字体 */
            font-size: inherit !important;   /* 继承字号 */
            line-height: inherit !important; /* 继承行高 */
            display: inline !important;      /* 强制行内显示，防止独占一行 */
            vertical-align: baseline !important;
            opacity: 1;
            margin-left: 2px !important;     /* 给光标一点点呼吸距离 */
        }
        
        /* 修复遮罩层级 */
        #banner .mask { z-index: 1 !important; }
        #banner .banner-text { z-index: 2 !important; }
    `;
    document.head.appendChild(style);
    
    // =======================================================
    // 1. 注入背景视频
    // =======================================================
    var banner = document.getElementById('banner');
    if (banner && !banner.querySelector('.custom-home-video')) {
        var v = document.createElement('video');
        v.src = cfg.urls.video;
        v.className = 'custom-home-video';
        v.autoplay = true; 
        v.loop = true; 
        v.muted = true; 
        v.playsInline = true;
        
        v.setAttribute('playsinline', ''); 
        v.setAttribute('webkit-playsinline', '');
        
        banner.appendChild(v);
        
        var m = banner.querySelector('.mask'); if(m) m.style.zIndex='1';
        var t = banner.querySelector('.banner-text'); if(t) t.style.zIndex='2';
    }

    // =======================================================
    // 2. 隐藏滚动箭头
    // =======================================================
    var arrow = document.querySelector('.scroll-down-bar'); 
    if(arrow) arrow.style.display='none';

    // =======================================================
    // 3. 异步加载语料库 & 打字机
    // =======================================================
    var sub = document.getElementById('subtitle');
    if (sub && typeof Typed !== 'undefined') {
        if (window.typedInstance) window.typedInstance.destroy();
        
        fetch(cfg.urls.quotes)
          .then(res => {
              if (!res.ok) throw new Error("JSON Fetch Failed");
              return res.json();
          })
          .then(data => {
              var typedStrings = data.map(item => "“" + item.text + "” —— " + item.from);
              window.typedInstance = new Typed('#subtitle', { 
                  strings: typedStrings, 
                  startDelay: 300, 
                  typeSpeed: 80, 
                  backSpeed: 50, 
                  loop: true, 
                  shuffle: true
              });
          })
          .catch(err => {
              console.warn("语料库加载失败:", err);
              sub.innerText = "Minecraft GREAT FOREVER.";
          });
    }
})();