// stats.js
/* 11.18 edited by Claire (Qinquan) Wang
 *
 * Changes:
 *  - Added backend integration so that the Stats view primarily uses
 *    sessions persisted by the .NET backend instead of purely local mock data.
 *  - Implemented loadSessionsFromBackend() which calls a REST API endpoint
 *    and normalizes its response into the same shape as loadSessions()
 *    ({ ts, minutes, note }).
 *  - renderStats() is now async and first attempts to pull data from
 *    the backend; if that fails, it gracefully falls back to loadSessions()
 *    so the UI still works during backend issues.
 *  - The existing aggregateLast7Days() and Chart.js logic are reused so
 *    that only the data source changes, not the visualization.
 */
import { loadSessions } from './storage.js';



/**
 * NOTE: adjust API_BASE and the endpoint path to match the real backend.
 * For now we assume there is a GET /api/focus/history that returns either:
 *   - an array of { ts, minutes, note }, or
 *   - { sessions: [ ... ] } with that shape.
 */
const API_BASE = 'http://localhost:5024'; // keep in sync with timer_ui.js

/**
 * Normalize backend response into a list of
 *   { ts: ISO-string | number, minutes: number, note?: string }
 * so that the rest of the Stats code can stay unchanged.
 */
function normalizeSessionsFromBackend(raw) {
  if (!raw) return [];

  // If backend wraps in { sessions: [...] }
  const arr = Array.isArray(raw) ? raw : Array.isArray(raw.sessions) ? raw.sessions : [];

  return arr.map((s) => {
    // Try to be tolerant with field names
    const ts = s.ts ?? s.timestamp ?? s.startTime ?? s.startTs ?? Date.now();
    const minutes =
      s.minutes ??
      s.durationMinutes ??
      (typeof s.durationSeconds === 'number' ? s.durationSeconds / 60 : 0);

    return {
      ts,
      minutes,
      note: s.note ?? s.appName ?? s.label ?? '',
    };
  });
}

/**
 * Try to load session history from backend; if it fails, fall back to local storage.
 */
async function loadSessionsFromBackend() {
  try {
    const res = await fetch(`${API_BASE}/api/focus/history`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!res.ok) {
      throw new Error(`Backend stats failed: ${res.status}`);
    }

    const json = await res.json();
    return normalizeSessionsFromBackend(json);
  } catch (err) {
    console.error('[Stats] Failed to load sessions from backend, falling back to local storage:', err);
    try {
      // Fallback to the original local implementation
      return loadSessions();
    } catch (e2) {
      console.error('[Stats] loadSessions() also failed:', e2);
      return [];
    }
  }
}

export function aggregateLast7Days(list) {
  const MS_DAY = 24 * 60 * 60 * 1000;
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(end.getTime() - i * MS_DAY);
    const key = d.toISOString().slice(0, 10);
    days.push({
      key,
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      total: 0,
    });
  }

  const map = new Map(days.map((d) => [d.key, d]));
  list.forEach((item) => {
    const dayKey = new Date(item.ts).toISOString().slice(0, 10);
    if (map.has(dayKey)) {
      map.get(dayKey).total += Number(item.minutes) || 0;
    }
  });

  return days;
}

// 需要外部传入 DOM refs 与 Chart 构造器（避免隐式全局）
export async function renderStats({ els, chartRef }) {
  const { statCount, statTotal, statLastNote, chartCanvas } = els;

  // [Changed] 以前是 const list = loadSessions();
  const list = await loadSessionsFromBackend();

  // ==== Summary numbers ====
  if (statCount) {
    statCount.textContent = String(list.length);
  }

  const last7 = aggregateLast7Days(list);
  const sum7 = last7.reduce((a, b) => a + b.total, 0);

  if (statTotal) {
    statTotal.textContent = `${sum7} min`;
  }

  if (statLastNote) {
    // 最后一条 session 的 note（可能是 whitelist app 名）
    const last = list.length ? list[list.length - 1] : null;
    statLastNote.textContent = last ? (last.note || '—') : '—';
  }

  // ==== Chart (last 7 days) ====
  if (chartCanvas && window.Chart) {
    const labels = last7.map((d) => d.label);
    const data = last7.map((d) => d.total);

    // 防御性处理：长度不一致时给个日志，避免柱状图 bug
    if (labels.length !== data.length) {
      console.warn('[Stats] labels/data length mismatch:', labels, data);
    }

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
          plugins: {
            legend: { display: false },
          },
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
