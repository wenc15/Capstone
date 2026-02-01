# 📝 Capstone Project — 接下来两周任务计划（基于当前进度）

📅 周期：2026/02/01 – 2026/02/15

---

## 📌 当前进度回顾（Context）

已完成 / 已部分完成：
- ✅ 抽卡界面已完成（但卡池卡面未设计）
- ✅ Chrome Extension 与本体已适配
- ⚠️ Extension 中 **尚未显示 Token**
- ⚠️ Mini Game 尚未实现
- ❌ 抽卡（Gacha）后端逻辑尚未开始(需确认)
- ⚠️ Pet 系统 UI 已有雏形，但不可交互
- ❌ 音乐系统尚未实现

---

## 🎯 两周核心目标（Goal）

在现有基础上补齐 **P1 Gamification 的“功能闭环”**，确保 Demo 可完整跑通：

> Token → Gacha → Inventory  
> Pet Click → 交互反馈  
> ＋ 至少 1 个 Mini Game  
> ＋ Focus 期间可播音乐  
> ＋ Extension 显示 Token

---

## 🟦 Backend — 两周计划

### 1️⃣ 抽卡（Food Gacha）后端逻辑（需确认是否已完成）

**目标：让现有抽卡界面具备真实逻辑**

- 定义 Food Pool（静态配置即可）
  - foodId
  - rarity
  - expValue
- 抽卡逻辑：
  - 校验 Token 是否足够
  - 扣除 Token
  - 随机抽取 Food
  - 写入 Inventory（本地持久化）

**API：**
- `POST /api/gacha/food/draw`
- `GET /api/inventory`

📌 验收标准：  
抽卡不再使用 mock 数据，Token 与 Inventory 状态真实变化。

---

### 2️⃣ Pet 数据 & Feed 行为支持

**目标：支撑前端 Pet 交互**

Pet 最小状态模型：
- growthStage
- currentExp
- expToNextStage

Feed 行为：
- 校验 Inventory 中是否存在 Food
- 消耗 1 个 Food
- 增加经验值
- 判断是否升级（Stage +1）

**API：**
- `POST /api/pet/feed`
- `GET /api/pet/status`

📌 本轮不做：
- 宠物形态切换
- 多宠物系统
- 复杂成长曲线

---

### 3️⃣ Token 接口补齐（供 Extension 使用）

- 提供统一 Token 查询接口：
  - `GET /api/tokens`
- Token 变更来源：
  - Focus Session Success
  - Gacha 消耗
  - Mini Game 奖励 / 消耗

---

## 🟦 Frontend — 两周计划

### 1️⃣ 抽卡界面与交互补完（已有 UI）

**目标：让“抽卡”真正可用**

- Draw 按钮调用后端 Gacha API
- 抽取成功后：
  - Token 数量即时更新
  - 抽到的 Food 自动进入 Inventory
- 卡面设计：
  - 本轮允许使用占位图
  - 仅区分 rarity（颜色 / 文案）

📌 不追求视觉精致，优先功能完整。

---

### 2️⃣ Inventory & Pet 交互系统完成（已完成）

- Inventory 页面：
  - 显示 Food 列表与数量
  - 提供 Feed 按钮
- Feed 行为：
  - 调用 `/api/pet/feed`
  - 成功后：
    - Food 数量 -1
    - Pet 经验条更新
    - Growth Stage 文案更新

📌 UI 反馈要求：
- 数值变化可见
- 进度条更新即可

---

### 3️⃣ Mini Game（至少 1 个）（需讨论）