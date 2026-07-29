019bfe3f-c34b-74f9-bfad-227f7b91bf4f

/\* 默认 (亮色模式)：纯黑线 \*/ .nav-quote-box { border-left: 5px solid #FF0000; padding-left: 15px; /\* 文字和线的距离 \*/ margin: 10px 0; } /\* 深色模式适配 (Fluid主题 & 系统级)：自动变纯白线 \*/ html\[data-user-color-scheme="dark"\] .nav-quote-box, @media (prefers-color-scheme: dark) { .nav-quote-box { border-left-color: #FFFFFF !important; } }

导航栏  
NAVIGATION BAR

/\* ================================================== Wanderer World 定稿：全息冷青配色 + 技术底蕴 ================================================== \*/ .wander-smart-container { width: 100%; margin-top: 25px; box-sizing: border-box; padding: 10px; } /\* --- 1. 字体映射 (保持与 RS-Wiki 风格一致) --- \*/ .font-cn { font-family: 'ZiHun-59-ChuangCuHei', sans-serif !important; } .font-en { font-family: 'Rajdhani-Medium', sans-serif !important; } .font-num { font-family: 'DIN-1451-LT-Mittelschrift', sans-serif !important; } /\* --- 2. 卡片主体 --- \*/ .wd-smart-card { display: block; width: 100%; aspect-ratio: 2.35 / 1; border-radius: 12px; text-decoration: none !important; position: relative; overflow: hidden; background: #000; /\* 初始边框：低饱和度冷灰色 \*/ border: 1px solid rgba(255, 255, 255, 0.1); box-sizing: border-box; box-shadow: 0 15px 50px rgba(0, 0, 0, 0.6); transition: all 0.5s cubic-bezier(0.25, 0.8, 0.25, 1); cursor: pointer; -webkit-tap-highlight-color: transparent; --x: 50%; --y: 50%; } /\* --- 3. 全息流光层 (冷青色调) --- \*/ .wd-rainbow-border { position: absolute; inset: 0; z-index: 1; background: linear-gradient( 120deg, #091018, /\* 深墨蓝 \*/ #2b4c5d, /\* 青灰 \*/ #0077be, /\* 科技蓝 \*/ #00f2ff, /\* 全息青 \*/ #ffffff, /\* 荧光白 \*/ #00f2ff, /\* 全息青 \*/ #0077be, /\* 科技蓝 \*/ #2b4c5d, /\* 青灰 \*/ #091018 /\* 闭环 \*/ ); background-size: 200% 200%; animation: rainbow-flow 15s linear infinite; clip-path: circle(0% at var(--x) var(--y)); transition: clip-path 0.6s cubic-bezier(0.25, 1, 0.5, 1); pointer-events: none; } @keyframes rainbow-flow { 0% { background-position: 0% 50%; } 100% { background-position: 200% 50%; } } /\* --- 4. 遮罩与媒体层 --- \*/ .wd-inner-mask { position: absolute; inset: 1px; border-radius: 10px; background: #000; z-index: 2; overflow: hidden; } .wd-static-bg { position: absolute; inset: -10px; background-image: url('/upload/2025-05-10\_15.29.45.png'); background-size: cover; background-position: center; filter: blur(2px); opacity: 1; transition: filter 0.5s ease, opacity 0.5s ease; z-index: 3; } .wd-lazy-video { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; z-index: 4; transition: opacity 0.8s ease; } .wd-inner-mask::after { content: ""; position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.4) 35%, transparent 60%); z-index: 5; pointer-events: none; } /\* --- 5. 内容排版 --- \*/ .wd-content { position: relative; z-index: 6; height: 100%; padding: 30px; display: flex; flex-direction: column; justify-content: flex-end; text-align: left; } .wd-title { font-size: 42px; font-weight: 700; color: #FFFFFF; line-height: 1; text-transform: uppercase; letter-spacing: 1px; text-shadow: 0 4px 15px rgba(0,0,0,1); margin-bottom: 8px; } .wd-meta-bar { display: flex; align-items: center; gap: 12px; font-size: 15px; color: #d1d5db; text-shadow: 0 2px 4px rgba(0,0,0,0.8); } .wd-divider { width: 1px; height: 12px; background: rgba(255,255,255,0.3); display: inline-block; } /\* --- 6. 交互逻辑 --- \*/ .wd-smart-card:hover .wd-rainbow-border, .wd-smart-card.is-playing .wd-rainbow-border { clip-path: circle(150% at var(--x) var(--y)); animation-duration: 2s; } .wd-smart-card.is-playing .wd-static-bg { filter: blur(0px); opacity: 0; } .wd-smart-card.is-playing .wd-lazy-video { opacity: 1; } .wd-smart-card.is-playing { box-shadow: 0 25px 70px rgba(0, 0, 0, 0.8); transform: translateY(-3px); border-color: transparent; } @media (max-width: 768px) { .wd-smart-card { aspect-ratio: 16 / 9; } .wd-title { font-size: 28px; } .wd-content { padding: 20px; } .wd-meta-bar { font-size: 13px; gap: 8px; } }

[

进入流浪的世界

WORLD BUILDING 世界观与运行逻辑





](/archives/world-building)

(function() { const card = document.getElementById('wanderCard'); const video = card.querySelector('video'); const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent); function updateMousePosition(e) { const rect = card.getBoundingClientRect(); card.style.setProperty('--x', (e.clientX - rect.left) + 'px'); card.style.setProperty('--y', (e.clientY - rect.top) + 'px'); } if (isMobile) { const observer = new IntersectionObserver((entries) => { entries.forEach(entry => { if (entry.isIntersecting && entry.intersectionRatio >= 0.95) { card.style.setProperty('--x', '50%'); card.style.setProperty('--y', '50%'); video.play().then(() => card.classList.add('is-playing')).catch(()=>{}); } else { video.pause(); card.classList.remove('is-playing'); } }); }, { threshold: \[0.95\] }); observer.observe(card); } else { card.addEventListener('mouseenter', (e) => { updateMousePosition(e); video.play().then(() => card.classList.add('is-playing')).catch(()=>{}); }); card.addEventListener('mousemove', updateMousePosition); card.addEventListener('mouseleave', (e) => { updateMousePosition(e); video.pause(); card.classList.remove('is-playing'); }); } })();

### [世界观构建](/archives/wwswiki-worldbuilding)

![sdfdfsf](/upload/%E7%8C%AB.jpg)

### 规范

![dfdfd](/upload/%E8%90%9D%E5%8D%9C.jpg)

### 开发者指南

这是一个诞生于2017年9月15日的 [**Minecraft**](https://zh.minecraft.wiki/w/Minecraft)**（《我的世界》）**的Paper插件服务器。起初为单人存档，且不对外开放，游戏版本为[Java版1.12.2](https://zh.minecraft.wiki/w/Java%E7%89%881.12.2)。半年以后，该存档被服主开发为支持插件的Paper服务端。服主的游戏用户名称为“Ryan\_yu\_\_”_（“Ryan\_yu\_”为曾用用户名称，已失效）_。

“流浪世界服务器”中的“流浪”一词出自刘慈欣创作的中篇科幻小说《流浪地球》以及由郭帆执导的同名改编科幻电影《流浪地球》系列[\[1\]](https://wanderingworld.miraheze.org/wiki/%E9%A6%96%E9%A1%B5#cite_note-1)，寄托了服主的一个愿景：在广阔无垠的世界中创造一个属于我们自己的世界，一个基于友情、创造和探险的地方，一个共同见证彼此成长的舞台。我们的核心理念是使每个玩家都能在这里找到属于自己的位置，无论是构建出令人叹为观止的建筑，还是在未知的土地上进行探险、挖掘游戏的无限可能。

服务器安装Spigot插件来丰富游戏体验，与官方新版本的同步更新，从增强型游戏机制到全新的游戏内容，使得玩家体验到游戏原有的乐趣和自由度的同时眼前有所一亮。

> _“我们鼓励玩家提出自己的意见和建议，因为这正是我把这个服务器一直做下去的动力。” ——Ryan\_yu\_\__

本站将由服主和其他服务器成员以第三人称视角对该服务器进行详细地介绍，旨在帮助该服务器玩家了解该服务器世界的规则、构建与规划。

### **如果您是本服务器的新成员**

您不妨事先了解以下内容。

注：以下要求须同时满足。

-   包括但不限于：服主、经服主授权的朋友、同学、同事等熟人。
    
-   必须是拥有Minecraft国际版通用的正版账号玩家。
    
-   自觉遵守《玩家行为规范准则》的玩家。
    

以下内容可供参考。

-   服务器的开放与否取决于某一时刻是否有服务器成员有意愿进入服务器世界。
    
-   当服务器可正常运行时，服主方可开启服务器。
    
-   当服务器正常运行时，服务器一般不会关闭，直至所有玩家全部下线。
    

**首选**

    nj.s1.6net.plus:27866

**备选**

    sh.s2.6net.plus:27866

以下内容可供参考。

-   当服务器处于关闭状态时，服主须视情况定期（一般是每日）进行本地、异地**备份**。备份的格式为“<版本号>.7z”的压缩包形式，一式两份。一份保存在与服务器数据根文件夹（即该文件包含全部服务器数据）同级的硬盘目录下；一份保存在网盘（优先Onedrive根目录、百度网盘：备份\\服务器文件夹下）。
    
-   随着游戏版本的**更新**，服务器的升级是必不可少的一环。其中涉及到很多相关事宜。服务端方面，包含世界数据（如区块数据、实体数据、玩家数据、数据包数据等）、插件数据、服务器配置文件等。客户端方面，包含资源包数据、部分本地化模组数据等。在版本更新时，需要考虑到上述因素。
    
-   由于服务器成员较为简单，一般不会出现玩家蓄意的、带有破坏性质的行为。一旦发生，该玩家将被予以**警告**，并被强制要求还原其破坏的内容。情节严重者将被永远列入**黑名单**。
    

### **如果您是本服务器的老成员**

您可以直接由此浏览并点击下方标题进行跳转。

**全站总目录**

18