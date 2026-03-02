🐾 1. Pet System Expansion
1.1 New Pet Shop Flow

支持 新宠物上架商店

当前宠物达到满级后：

可在商店购买新宠物

已满级宠物自动移入 Inventory

Inventory 用于展示：

已拥有宠物

满级宠物

可切换当前使用宠物（可选功能）

1.2 Pet State Logic

宠物等级系统（Level / EXP）

满级判定逻辑

宠物切换逻辑

与 Token 系统联动

🏆 2. Achievement System
2.1 Achievement Trigger Events

需要埋点/监听以下事件：

✅ Focus Session 完成（Success）

⏱ 累计专注时长达到阈值

🎲 抽卡次数累计

🍖 喂食次数累计

🔥 连续签到 / 连续专注天数

触发逻辑：

每次事件发生时更新 progress

达到条件 → 标记解锁

发放奖励

弹出前端提示

2.2 Frontend Achievement UI

成就列表页面

显示：

标题

描述

进度条

已解锁 / 未解锁状态

解锁时弹出提示动画

可按分类筛选（可选）

🎲 3. Gacha System Integration
卡面设计，卡池整合完善，联动成就

🎮 4. Minigame Completion
4.1 Core Requirements

至少完成 1 个完整 Mini Game

可重复游玩

有分数或结果反馈
