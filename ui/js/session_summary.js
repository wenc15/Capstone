// 2026/03/25 edited by Zhecheng Xu
// Changes:
// - Upgrade Session Summary fields to Focus Time / Distractions / Completed.
// - Add Long-term Data panel with weekly chart, history list, and breakdown.
// - Refine weekly precision and panel title icon presentation.

import { loadSessions } from './storage.js';

const API_BASE = 'http://localhost:5024';
const SUMMARY_KEY = 'growin.session.summary.v2';

let weeklyChart = null;
let boundEls = null;

function getUiTone() {
  try {
    return document.documentElement.getAttribute('data-ui-tone') === 'sky' ? 'sky' : 'default';
  } catch {
    return 'default';
  }
}

function chartPalette() {
  if (getUiTone() === 'sky') {
    return {
      border: '#7098c8',
      fill: 'rgba(112,152,200,0.22)',
      tick: '#607b9a',
      grid: 'rgba(168, 190, 217, 0.45)',
    };
  }
  return {
    border: '#8ba98f',
    fill: 'rgba(139,169,143,0.20)',
    tick: '#6d7f73',
    grid: 'rgba(194, 209, 199, 0.55)',
  };
}

function readJson(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

function loadSummaryState() {
  const st = readJson(SUMMARY_KEY, null) || {};
  return {
    focusMinutes: Number.isFinite(st.focusMinutes) ? Math.max(0, Math.round(st.focusMinutes)) : 0,
    // For the home card we show the last distraction app name, not a running counter.
    distractionApp: typeof st.distractionApp === 'string' ? st.distractionApp : '',
    completed: Number.isFinite(st.completed) ? Math.max(0, Math.round(st.completed)) : 0,
  };
}

function formatDurationHM(totalMinutes) {
  const mins = Math.max(0, Math.round(Number(totalMinutes) || 0));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

function formatHoursHM(totalHours) {
  const mins = Math.max(0, Math.round((Number(totalHours) || 0) * 60));
  return formatDurationHM(mins);
}

function saveSummaryState(st) {
  writeJson(SUMMARY_KEY, st);
}

function renderSummary(st) {
  if (!boundEls) return;
  if (boundEls.sumFocusTime) boundEls.sumFocusTime.textContent = formatDurationHM(st.focusMinutes);
  if (boundEls.sumDistractions) boundEls.sumDistractions.textContent = st.distractionApp || '—';
  if (boundEls.sumCompleted) boundEls.sumCompleted.textContent = String(st.completed);
}

function prettifyProcessName(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const token = s.split(',')[0].trim().replace(/^"|"$/g, '');
  const noExe = token.toLowerCase().endsWith('.exe') ? token.slice(0, -4) : token;
  // Basic title-case for single-token process names: chrome -> Chrome
  if (/^[a-z0-9._-]+$/.test(noExe) && noExe === noExe.toLowerCase()) {
    return noExe.charAt(0).toUpperCase() + noExe.slice(1);
  }
  return noExe;
}

function normalizeOutcome(raw) {
  const v = String(raw || '').toLowerCase();
  if (v === 'success' || v === 'completed' || v === 'complete') return 'success';
  if (v === 'failed' || v === 'fail') return 'failed';
  if (v === 'aborted' || v === 'stopped' || v === 'stop') return 'aborted';
  return 'success';
}

async function loadLongTermSessions() {
  try {
    const res = await fetch(`${API_BASE}/api/focus/history`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`History request failed: ${res.status}`);
    const json = await res.json();
    const arr = Array.isArray(json)
      ? json
      : (Array.isArray(json?.items) ? json.items : (Array.isArray(json?.sessions) ? json.sessions : []));

    return arr.map((x) => {
      const ts = Number(x.ts ?? x.timestamp ?? x.startTime ?? Date.now());
      const minutes = Number(x.minutes ?? x.Minutes ?? x.durationMinutes ?? x.totalMinutes
        ?? (((Number(x.durationSeconds) || 0) > 0) ? Number(x.durationSeconds) / 60 : 0));
      return {
        ts: Number.isFinite(ts) ? ts : Date.now(),
        minutes: Number.isFinite(minutes) ? Math.max(0, Math.round(minutes)) : 0,
        outcome: normalizeOutcome(x.outcome ?? x.Outcome ?? x.status),
      };
    });
  } catch {
    const local = loadSessions();
    return local.map((x) => ({
      ts: Number(x.ts || Date.now()),
      minutes: Number.isFinite(Number(x.minutes)) ? Math.max(0, Math.round(Number(x.minutes))) : 0,
      outcome: Number(x.minutes || 0) > 0 ? 'success' : 'aborted',
    }));
  }
}

function weekStart(ts) {
  const d = new Date(ts);
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - diff);
  return d.getTime();
}

function makeWeeklySeries(list, weeks = 7) {
  const now = Date.now();
  const currentWeek = weekStart(now);
  const labels = [];
  const points = [];
  const starts = [];
  for (let i = weeks - 1; i >= 0; i -= 1) {
    starts.push(currentWeek - (i * 7 * 24 * 60 * 60 * 1000));
  }

  for (let i = 0; i < starts.length; i += 1) {
    if (i === starts.length - 1) labels.push('This week');
    else labels.push(`${starts.length - 1 - i}w ago`);
    points.push(0);
  }

  list.forEach((x) => {
    if (x.outcome !== 'success') return;
    const ws = weekStart(x.ts);
    const idx = starts.findIndex((s) => s === ws);
    if (idx >= 0) points[idx] += x.minutes / 60;
  });

  return { labels, points: points.map((n) => Math.round(n * 100) / 100) };
}

function calcLongestStreakDays(list) {
  const successDays = new Set(
    list
      .filter((x) => x.outcome === 'success' && x.minutes > 0)
      .map((x) => {
        const d = new Date(x.ts);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
      }),
  );
  const days = Array.from(successDays).sort((a, b) => a - b);
  let best = 0;
  let cur = 0;
  let prev = null;
  for (const day of days) {
    if (prev == null || day === prev + 86400000) cur += 1;
    else cur = 1;
    if (cur > best) best = cur;
    prev = day;
  }
  return best;
}

function renderHistory(list) {
  if (!boundEls?.ltdHistoryList) return;
  const recent = [...list].sort((a, b) => b.ts - a.ts).slice(0, 30);
  if (!recent.length) {
    boundEls.ltdHistoryList.innerHTML = '<div class="ltd-history-empty">No session history yet.</div>';
    return;
  }
  boundEls.ltdHistoryList.innerHTML = recent.map((x) => {
    const d = new Date(x.ts);
    const date = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const outcome = x.outcome === 'success' ? 'Success' : (x.outcome === 'failed' ? 'Failed' : 'Aborted');
    return `<div class="ltd-history-row"><span>${date}</span><span>${x.minutes} min</span><span>${outcome}</span></div>`;
  }).join('');
}

function renderWeeklyChart(series) {
  if (!boundEls?.ltdWeeklyChart || !window.Chart) return;
  const palette = chartPalette();
  if (weeklyChart) {
    weeklyChart.data.labels = series.labels;
    weeklyChart.data.datasets[0].data = series.points;
    weeklyChart.data.datasets[0].borderColor = palette.border;
    weeklyChart.data.datasets[0].backgroundColor = palette.fill;
    if (weeklyChart.options?.scales?.x?.ticks) weeklyChart.options.scales.x.ticks.color = palette.tick;
    if (weeklyChart.options?.scales?.y?.ticks) weeklyChart.options.scales.y.ticks.color = palette.tick;
    if (weeklyChart.options?.scales?.x?.grid) weeklyChart.options.scales.x.grid.color = palette.grid;
    if (weeklyChart.options?.scales?.y?.grid) weeklyChart.options.scales.y.grid.color = palette.grid;
    weeklyChart.update();
    return;
  }

  weeklyChart = new Chart(boundEls.ltdWeeklyChart, {
    type: 'line',
    data: {
      labels: series.labels,
      datasets: [{
        label: 'Focus Time',
        data: series.points,
        borderColor: palette.border,
        backgroundColor: palette.fill,
        fill: true,
        tension: 0.35,
        pointRadius: 4,
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${formatHoursHM(ctx?.parsed?.y || 0)}`,
          },
        },
      },
      scales: {
        x: {
          ticks: { color: palette.tick },
          grid: { color: palette.grid },
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: palette.tick,
            callback: (v) => formatHoursHM(v),
          },
          grid: { color: palette.grid },
        },
      },
    },
  });
}

async function refreshLongTermData() {
  if (!boundEls) return;
  const list = await loadLongTermSessions();

  const success = list.filter((x) => x.outcome === 'success');
  const failed = list.filter((x) => x.outcome === 'failed');
  const aborted = list.filter((x) => x.outcome === 'aborted');
  const totalMinutes = success.reduce((sum, x) => sum + x.minutes, 0);

  if (boundEls.ltdTotalFocus) boundEls.ltdTotalFocus.textContent = formatDurationHM(totalMinutes);
  if (boundEls.ltdSessionCount) boundEls.ltdSessionCount.textContent = String(success.length + failed.length + aborted.length);
  if (boundEls.ltdLongestStreak) boundEls.ltdLongestStreak.textContent = `${calcLongestStreakDays(list)} days`;

  if (boundEls.ltdSuccessful) boundEls.ltdSuccessful.textContent = String(success.length);
  if (boundEls.ltdFailed) boundEls.ltdFailed.textContent = String(failed.length);
  if (boundEls.ltdAborted) boundEls.ltdAborted.textContent = String(aborted.length);

  renderWeeklyChart(makeWeeklySeries(list, 7));
  renderHistory(list);
}

function openLongTerm() {
  if (!boundEls?.ltdOverlay) return;
  boundEls.ltdOverlay.classList.remove('mg-hidden');
  boundEls.ltdOverlay.setAttribute('aria-hidden', 'false');
  refreshLongTermData();
}

function closeLongTerm() {
  if (!boundEls?.ltdOverlay) return;
  boundEls.ltdOverlay.classList.add('mg-hidden');
  boundEls.ltdOverlay.setAttribute('aria-hidden', 'true');
}

function activateTab(which) {
  if (!boundEls) return;
  const isWeekly = which === 'weekly';
  boundEls.ltdTabWeekly?.classList.toggle('is-active', isWeekly);
  boundEls.ltdTabHistory?.classList.toggle('is-active', !isWeekly);
  boundEls.ltdWeeklyPanel?.classList.toggle('mg-hidden', !isWeekly);
  boundEls.ltdHistoryPanel?.classList.toggle('mg-hidden', isWeekly);
}

export function mountSessionSummary(els) {
  boundEls = els;
  renderSummary(loadSummaryState());

  els?.sumSeeMoreBtn?.addEventListener('click', openLongTerm);
  els?.ltdCloseBtn?.addEventListener('click', closeLongTerm);
  els?.ltdOverlay?.addEventListener('click', (ev) => {
    if (ev.target === els.ltdOverlay) closeLongTerm();
  });
  els?.ltdTabWeekly?.addEventListener('click', () => activateTab('weekly'));
  els?.ltdTabHistory?.addEventListener('click', () => activateTab('history'));
}

export function updateSessionSummary({ minutes, distractedApp }) {
  const st = loadSummaryState();
  const m = Number.isFinite(minutes) ? Math.max(0, Math.round(minutes)) : 0;
  st.focusMinutes = m;
  if (distractedApp && String(distractedApp).trim()) st.distractionApp = prettifyProcessName(distractedApp);
  else st.distractionApp = '';
  if (m > 0 && !(distractedApp && String(distractedApp).trim())) st.completed += 1;
  saveSummaryState(st);
  renderSummary(st);
}
