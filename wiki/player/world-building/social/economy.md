---
title: 经济系统 · 流通、市场与账本
slug: wwswiki_worldbuilding_economy
description: 流浪世界社会科学·第5章：价值从何而来，货币如何流动，市场与网页层如何衔接。
categories: [Wiki, 世界观, 社会科学]
tags: [社会科学, 经济]
---

# 5. 经济系统

> 在流浪世界里，**方块不会自己变成秩序**——秩序来自谁愿意把劳动交给共同体、谁愿意把稀缺交给市场、谁愿意把信任交给账本。

本文是「社会科学」编年中的**经济专章**（对应总纲 5.1–5.7），并说明这些设定在服务器里**实际由哪些机制承载**。游玩操作仍以 [经济与商店](/archives/player/economy) 为准；物价数字见 [物品价格一览](/archives/player/server-world/prices)。

[← 社会科学总纲](/archives/wwswiki_worldbuilding_social)

---

## 5.1 价值理论：劳动、稀缺与服务

流浪者共同体并不承认「凭空印钞即财富」。在正史叙事里，**价值有三根支柱**：

1. **劳动** — 采矿、农牧、交通线维护、建筑、Redstone/粘液工业产线，以及副本与公共工程中的协作时间。
2. **稀缺** — 下界合金、特定生物群系产物、活动限定物品、以及 DynamicShop 中库存被买空后抬价的那一类物资。
3. **服务** — 带路、代工、领地托管、创意建设、以及 MCWWS 线上层提供的「可验证交付」。

因此，经济司（管理者与自动化审计）关注的不是「谁最富」，而是**财富是否与可核查的流动相对应**。这也是 MCWWS_EconomyLedger 存在的设定理由：把 Essentials/Vault 上的每一次显著变动，尽量翻译成可归档的「事件句」。

---

## 5.2 货币、银行与个人账户

### 共同体货币（¥）

服务器使用 **Vault + Essentials** 作为统一货币层，符号为 **¥**（`currency-symbol`）。新成员入籍时通常带有**起步余额**（配置中的 starting-balance），表示共同体发放的「基本流通券」，而非无责任透支。

| 概念（设定） | 机制（插件） | 玩家常用操作 |
| --- | --- | --- |
| 随身零钱 | Essentials 余额 | `/bal`、`/pay` |
| 金库账户 | BankPlus | `/bank` 打开 GUI，存取与利息规则以服内为准 |
| 领地交易 | Residence 等 | 领地买卖、租约（若启用） |

**BankPlus** 在叙事上是「中央金库的分账簿」：把高风险携带的零钱转为可计息的存款，并保留交易日志（`Log-Transactions`）。**不要把银行余额当作权限凭证**——权限仍由 LuckPerms 与治理规则决定。

### 转账伦理

`/pay` 被视为**民事行为**：误转、诈骗与 RMT（现实货币交易）按 [玩家规则](/archives/player/rules) 处理。经济司可依据账本与聊天记录回溯，但**不保证自动回滚**——这与现实银行纠纷类似，强调事前确认。

---

## 5.3 动态市场与物价机制

流浪世界的主市场由 **DynamicShop** 驱动：**同一物品的价格会随库存与交易行为变化**，而不是一张死表。

机制要点（与 `dynamic-pricing` 配置一致）：

- **库存曲线**：卖的人越多、库存越高，收购价越接近下限（`curve-strength` 控制跌幅）。
- **出售税**：玩家卖出时到手约为标价的 **70%**（默认 `sell_tax_percent: 30`），象征流通损耗与摊位维护。
- **网页看板**：DynamicShop 自带 Web 服务（默认端口 **7713**），可在浏览器查看品类与近期成交，相当于「市场公示栏」。

**UltimateShop** 则提供**分类 GUI 商店**（矿物、农牧、红石、交通等分页），并包含 **MCWWS 定制条目**（如 `shops/mcwws.yml` 中通过占位符 `%mcwws.price_*%` 与 Skript/Web 定价联动）。叙事上：DynamicShop 是「公开市场」，UltimateShop 是「公会统筹的常备货柜」。

---

## 5.4 功能商店与网页经济（MCWWS 线上层）

除方块世界内的 GUI 商店外，共同体还有 **WebHost / Node 服务** 支撑的网页能力（与 Wiki、玩家账本队列同源）。这一层在设定里称为**「线上交易所」**：

- 网页端展示与 DynamicShop/UltimateShop **映射后的目录**（见 Skript `ultimateshop_mappings.yml` 等生成物）。
- 部分功能商品（权限时长、定制服务、活动包）可能**只在网页或 NPC 处发售**，以避免聊天栏误购。
- 成交后仍通过 Vault 扣款，Ledger 队列记录分类（如 `shop_sell`、`COMMAND_PAY`）。

若网页与游戏内价格不一致，以**游戏内成交瞬间**为准，网页负责展示与预约，而不是单方面改价。

---

## 5.5 产业链与社会分工

正史中的典型产业链：

```text
采集 / 农牧 → 加工（熔炉、粘液机器）→ 公开市场出货 → 零钱或入库
                     ↘ 大型工程合同（建设、铁路、Spawn 维护）↗
```

**Residence / GriefPrevention** 把「土地与机器」变成可继承的资产，使长期产线具备**地理意义**——这也是经济学上的「固定资本」。**Train_Carts** 等交通网则降低跨聚落贸易的「时间成本」，在叙事上等同于降关税。

WorldEdit 生存模式下的**估算与扣款**（MCWWS WorldEdit Survival + EconomyService）属于「工程承包」：破坏、材料与人工拆分报价，避免创世式建设吞噬市场通胀。

---

## 5.6 账本、审计与经济司

**MCWWS_EconomyLedger** 监听 Essentials 余额事件，把原因映射为分类（如管理员 `/eco`、玩家转账、出售物品），并写入与 Web 账本相同的 **ledger 队列**。设定上：

- **经济司** = 管理员 + 自动化审计，不替代玩家自治。
- **dedup-window** 防止重复记账；飞行口粮等已由 Skript 单独记账的条目会在 Ledger 中跳过，避免「一笔消费两条账」。

玩家若发现余额异常，应保留时间戳与 `/co i` 等证据；经济司优先查 Ledger 与 DynamicShop 交易 CSV。

---

## 5.7 日常节律：签到、消费与「小额循环」

**LiteSignIn** 提供每日签到奖励（材料为主），在叙事上是「共同体配给」，**不是**主要货币来源，以免签到刷钱破坏市场。

常见循环建议（非强制）：

1. 签到领取基础物资 → 补工具或燃料  
2. 下矿 / 农牧 → DynamicShop 或 UltimateShop 出货  
3. 零钱超上限前 → BankPlus 存款  
4. 大型采购前 → 网页看板比价  

---

## 设定 ↔ 机制对照（速查）

| 设定用语 | 插件 / 组件 |
| --- | --- |
| 共同体货币 ¥ | Vault、Essentials |
| 中央金库 | BankPlus |
| 公开市场 | DynamicShop（含动态定价 + Web） |
| 常备货柜 | UltimateShop（含 MCWWS 条目） |
| 工程报价 | MCWWS WorldEdit Survival |
| 审计账本 | MCWWS_EconomyLedger → ledger 队列 |
| 每日配给 | LiteSignIn |
| 领地资产 | Residence、GriefPrevention |

---

## 延伸阅读

- [社会科学 · 总纲](/archives/wwswiki_worldbuilding_social) — 第 5 节索引  
- [经济与商店（玩家向）](/archives/player/economy) — 命令与入口  
- [物品价格一览](/archives/player/server-world/prices) — 机制向物价（待补表）

*文档版本：Wiki 源稿 2026-07-29；若与服内插件配置冲突，以线上配置为准。*
