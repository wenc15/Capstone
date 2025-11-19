// js/stats.js
/* 11.18–11.19 edited by Claire (Qinquan) Wang
 *
 * Changes:
 *  - Backend integration: Stats view primarily uses sessions persisted
 *    by the .NET backend instead of purely local mock data.
 *  - loadSessionsFromBackend() calls a REST API endpoint and normalizes
 *    its response into the same shape as loadSessions()
 *    ({ ts, minutes, note }).
 *  - renderStats() is async and first attempts to pull data from
 *    the backend; if that fails, it gracefully falls back to loadSessions()
 *    so the UI still works during backend issues.
 *  - aggregateLast7Days() now uses LOCAL dates (browser timezone),
 *    so “last 7 days” is based on Toronto time instead of pure UTC.
 *  - The Chart.js logic is reused; only the data source changed.
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

  // If backend wraps result in { sessions: [...] }
  const arr = Array.isArray(raw)
    ? raw
    : Array.isArray(raw.sessions)
    ? raw.sessions
    : [];

  return arr.map((s) => {
    // Try to be tolerant with field names
    const ts =
      s.ts ??
      s.timestamp ??
      s.startTime ??
      s.startTs ??
      Date.now();

    const minutesRaw =
      s.minutes ??
      s.durationMinutes ??
      (typeof s.durationSeconds === 'number'
        ? s.durationSeconds / 60
        : 0);

    const minutes = Number(minutesRaw) || 0;

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
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      throw new Error(`Backend stats failed: ${res.status}`);
    }

    const json = await res.json();
    return normalizeSessionsFromBackend(json);
  } catch (err) {
    console.error(
      '[Stats] Failed to load sessions from backend, falling back to local storage:',
      err
    );
    try {
      // Fallback to the original local implementation
      return loadSessions();
    } catch (e2) {
      console.error('[Stats] loadSessions() also failed:', e2);
      return [];
    }
  }
}

/**
 * Build a YYYY-MM-DD string using LOCAL time (browser timezone).
 * This ensures “day boundaries” follow local time (e.g., Toronto),
 * not UTC.
 */
function makeLocalDateKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Aggregate total minutes for the last 7 LOCAL days, including today.
 * Returns an array of:
 *   [{ key: 'YYYY-MM-DD', label: 'M/D', total: number }, ...]
 */
export function aggregateLast7Days(list) {
  const MS_DAY = 24 * 60 * 60 * 1000;

  // Use local time as end-of-day (based on system timezone, e.g. Toronto)
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

/**
 * Render the Stats view:
 *  - Loads history (backend → fallback to local).
 *  - Updates summary numbers.
 *  - Updates the last-7-days bar chart via Chart.js.
 *
 * NOTE: This is async. Callers (nav.js, timer_ui.js) can invoke it
 * without awaiting; it will refresh the UI when the data arrives.
 */
export async function renderStats({ els, chartRef }) {
  const { statCount, statTotal, statLastNote, chartCanvas } = els;

  // Load sessions (backend or fallback)
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
    // Last session's note (may be whitelist apps string)
    const last = list.length ? list[list.length - 1] : null;
    statLastNote.textContent = last ? last.note || '—' : '—';
  }

  // ==== Chart (last 7 days) ====
  if (chartCanvas && window.Chart) {
    const labels = last7.map((d) => d.label);
    const data = last7.map((d) => d.total);

    // Defensive: log if lengths mismatch, to avoid weird bar chart bugs
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
