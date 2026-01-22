import { collectDom } from './js/dom.js';
import { mountWidget } from './js/widget.js';
import { mountTimer } from './js/timer_ui.js';
import { mountNav } from './js/nav.js';
import { mountPet } from './js/pet.js';

const els = collectDom();      // ← 现在 DOM 都来自这里

mountWidget();
mountTimer(els);
mountNav(els);
mountPet(els);  
// 2026/1/22 edited by JS:
// 修改内容：
//   - 引入 Credits 前端状态管理。
//   - Token/Credits 改为动态加载，避免其加载失败导致整个 UI 入口失效。
// =============================================================
// 作用补充：
//   - 即便 credits/token 报错，timer/nav/pet 仍可用；控制台给 warning 便于排查。

(async () => {
  try {
    const [{ refreshCredits }, { mountToken }] = await Promise.all([
      import('./js/creditsStore.js'),
      import('./js/token_ui.js'),
    ]);

    mountToken(els);
    refreshCredits();
  } catch (e) {
    console.warn('[Token] credits/token not loaded; core UI still works.', e);
  }
})();


