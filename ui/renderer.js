import { collectDom } from './js/dom.js';
import { mountWidget } from './js/widget.js';
import { mountTimer } from './js/timer_ui.js';
import { mountNav } from './js/nav.js';

const els = collectDom();      // ← 现在 DOM 都来自这里

mountWidget();
mountTimer(els);
mountNav(els);
