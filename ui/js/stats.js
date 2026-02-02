// js/stats.js
/* 11.27 edited by Claire (Qinquan) Wang:
 * - 修改了stats记录问题，但是仍在和后端沟通确认最终方案。
 */
import { loadSessions } from './storage.js';

const API_BASE = 'http://localhost:5024';

/**
 * 核心修改：标准化后端数据，并标记是否有效
 */
function normalizeSessionsFromBackend(raw) {
  if (!raw) return [];

  const arr = Array.isArray(raw)
    ? raw
    : Array.isArray(raw.sessions)
    ? raw.sessions
    : [];

  return arr.map((s) => {
    // 1. 处理时间戳
    const ts =
      s.ts ??
      s.timestamp ??
      s.startTime ??
      s.startTs ??
      Date.now();

    // 2. 处理时长 (转换为分钟)
    const minutesRaw =
      s.minutes ??
      s.durationMinutes ??
      (typeof s.durationSeconds === 'number'
        ? s.durationSeconds / 60
        : 0);

    const minutes = Number(minutesRaw) || 0;

    // 3. 处理 Note
    const note = s.note ?? s.appName ?? s.label ?? '';

    // === ★★★ 核心修复：判断这条记录是否有效 ★★★ ===
    let isValid = true;

    // 判据 A: 如果分钟数是 0，肯定是无效的
    if (minutes <= 0) isValid = false;

    // 判据 B: 检查显式的失败标记 (根据常见的后端字段名猜测)
    // 如果后端记录了 failReason 且不为空，说明是失败的
    if (s.failReason && s.failReason.length > 0) isValid = false;
    
    // 如果后端有 isFailed 字段
    if (s.isFailed === true) isValid = false;
    
    // 如果后端有 status 字段，且状态不是 Completed
    if (s.status && s.status !== 'Completed' && s.status !== 'Success') {
        // 假如后端把 'Stopped' 也记录下来了，这里可以过滤掉
        if (s.status === 'Stopped' || s.status === 'Failed' || s.status === 'Aborted') {
            isValid = false;
        }
    }

    // 判据 C: (可选) 如果实际时长远小于计划时长 (假设后端返回了 plannedSeconds)
    // if (s.plannedSeconds && s.durationSeconds && s.durationSeconds < s.plannedSeconds) {
    //    isValid = false;
    // }

    return {
      ts,
      minutes,
      note,
      isValid, // 把这个标记带出去
    };
  });
}

async function loadSessionsFromBackend() {
  try {
    const res = await fetch(`${API_BASE}/api/focus/history`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      throw new Error(`Backend stats failed: ${res.status}`);
    }

    const json = await res.json();
    return normalizeSessionsFromBackend(json);
  } catch (err) {
    console.error('[Stats] Failed to load sessions from backend:', err);
    try {
      return loadSessions();
    } catch (e2) {
      return [];
    }
  }
}

function makeLocalDateKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function aggregateLast7Days(list) {
  const MS_DAY = 24 * 60 * 60 * 1000;
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(end.getTime() - i * MS_DAY);
    const key = makeLocalDateKey(d);
    days.push({
      key,
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      total: 0,
    });
  }

  const map = new Map(days.map((d) => [d.key, d]));

  list.forEach((item) => {
    const dayKey = makeLocalDateKey(item.ts);
    if (map.has(dayKey)) {
      map.get(dayKey).total += Number(item.minutes) || 0;
    }
  });

  return days;
}

export async function renderStats({ els, chartRef }) {
  const { statCount, statTotal, statLastNote, chartCanvas } = els;

  // 1. 获取数据
  let list = await loadSessionsFromBackend();

  // === ★★★ 核心修复：执行过滤 ★★★ ===
  // 只有 isValid 为 true 的记录才会被算进统计
  list = list.filter(item => item.isValid === true);

  // 2. 更新总次数
  if (statCount) {
    statCount.textContent = String(list.length);
  }

  // 3. 计算最近7天总时长
  const last7 = aggregateLast7Days(list);
  const sum7 = last7.reduce((a, b) => a + b.total, 0);

  if (statTotal) {
    statTotal.textContent = `${sum7} min`;
  }

  if (statLastNote) {
    const last = list.length ? list[list.length - 1] : null;
    statLastNote.textContent = last ? last.note || '—' : '—';
  }

  // 4. 绘制图表
  if (chartCanvas && window.Chart) {
    const labels = last7.map((d) => d.label);
    const data = last7.map((d) => d.total);

    if (chartRef.current) {
      chartRef.current.data.labels = labels;
      chartRef.current.data.datasets[0].data = data;
      chartRef.current.update();
    } else {
      chartRef.current = new Chart(chartCanvas, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'Minutes',
              data,
            },
          ],
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { precision: 0 },
            },
          },
        },
      });
    }
  }
}