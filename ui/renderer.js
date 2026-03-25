// 2026/03/19 edited by Zhecheng Xu
// Changes:
//  - Mount Settings module for archive export/import UI.

// 2026/03/25 edited by Zhecheng Xu
// Changes:
//  - Initialize music module with dynamically discovered tracks from main process.

// 2026/01/28 edited by JS
// Changes:
//  - Mount Store UI module alongside existing views.
//
// 2026/03/14 edited by JS
// Changes:
//  - Mount Achievements UI module.
//  - Mount Backpack overlay module.

import { collectDom } from './js/dom.js';
import { mountWidget } from './js/widget.js';
import { mountTimer } from './js/timer_ui.js';
import { mountNav } from './js/nav.js';
import { mountPet } from './js/pet.js';
import { mountStore } from './js/store.js';
import { mountBackpack } from './js/backpack.js';
import { mountCollection } from './js/collection.js';
import { mountGacha } from './js/gacha.js';
import { mountAchievements } from './js/achievements.js';
import { mountMusic } from './js/music.js';
import { mountMusicDock } from './js/music_dock.js';
import { mountDiceBuild } from './js/minigame_dicebuild.js';
import { mountRelaxPrompt } from './js/relax_prompt.js';
import { mountMinigameDevtools } from './js/minigame_devtools.js';
import { mountSettings } from './js/settings.js';
import { mountWeather } from './js/weather.js';
import { mountSessionSummary } from './js/session_summary.js';
const els = collectDom();      // ← 现在 DOM 都来自这里

mountWidget();
mountWeather(els);
mountTimer(els);
mountNav(els);
mountPet(els);  
mountBackpack(els);
mountCollection(els);
mountStore(els);
mountGacha(els);
mountAchievements(els);
let resolvedMusicTracks = null;
try {
  const api = window.electronAPI;
  if (api?.listMusicTracks) {
    const res = await api.listMusicTracks();
    if (res?.ok && Array.isArray(res.tracks) && res.tracks.length) {
      resolvedMusicTracks = res.tracks;
    }
  }
} catch (e) {
  console.warn('[Music] Failed to list tracks from folder, fallback to defaults.', e);
}
mountMusic({ els, tracks: resolvedMusicTracks || undefined });
mountMusicDock(els);
mountDiceBuild(els);
mountRelaxPrompt(els);
mountMinigameDevtools(els);
mountSettings(els);
mountSessionSummary(els);
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


