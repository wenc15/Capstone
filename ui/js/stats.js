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
    : Array.isArray(raw.items)
    ? raw.items
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
      s.Minutes ??
      s.durationMinutes ??
      s.totalMinutes ??
      ((Number(s.durationSeconds) || 0) > 0
        ? Number(s.durationSeconds) / 60
        : 0);

    const minutes = Number(minutesRaw) || 0;

    // 3. 处理 Note
    const note = s.note ?? s.appName ?? s.label ?? '';

    const outcome = String(s.outcome ?? s.Outcome ?? s.status ?? '').toLowerCase();

    // === ★★★ 核心修复：判断这条记录是否有效 ★★★ ===
    let isValid = true;

    // 判据 A: 如果分钟数是 0，肯定是无效的
    if (minutes <= 0) isValid = false;

    // 判据 B: 检查显式的失败标记 (根据常见的后端字段名猜测)
    // 如果后端记录了 failReason 且不为空，说明是失败的
    if (s.failReason && s.failReason.length > 0) isValid = false;

    // 如果后端有 isFailed 字段
    if (s.isFailed === true) isValid = false;

    // 如果后端有 status/outcome 字段，过滤失败/中断
    if (outcome === 'failed' || outcome === 'aborted' || outcome === 'stopped') {
      isValid = false;
    }

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

function filterLast7Days(list) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 6);

  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const startMs = start.getTime();
  const endMs = end.getTime();

  return (list || []).filter((item) => {
    const tsMs = new Date(item?.ts ?? 0).getTime();
    return Number.isFinite(tsMs) && tsMs >= startMs && tsMs <= endMs;
  });
}

function formatMinutesDetailed(totalMinutes) {
  const safe = Math.max(0, Math.round(Number(totalMinutes) || 0));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  if (h <= 0) return `${m} min`;
  if (m <= 0) return `${h}h`;
  return `${h}h ${m}m`;
}

const TIME_PREF_PERIODS = [
  { key: 'morning', label: 'Morning', range: '05:00-11:59', color: '#8ec8f5' },
  { key: 'noon', label: 'Noon', range: '12:00-17:59', color: '#9fd8b0' },
  { key: 'evening', label: 'Evening', range: '18:00-04:59', color: '#f5bf8b' },
];

function renderTimePrefLegend(container, items) {
  if (!container) return;
  container.innerHTML = '';

  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'stats-period-legend-item';

    const dot = document.createElement('span');
    dot.className = 'stats-period-legend-dot';
    dot.style.background = item.color || '#cfd5d2';

    const textWrap = document.createElement('span');
    textWrap.className = 'stats-period-legend-text';

    const main = document.createElement('span');
    main.className = 'stats-period-legend-main';

    const name = document.createElement('span');
    name.className = 'stats-period-legend-name';
    name.textContent = `${item.label} `;

    const mins = document.createElement('span');
    mins.className = 'stats-period-legend-mins';
    mins.textContent = formatMinutesDetailed(item.minutes);

    main.appendChild(name);
    main.appendChild(mins);

    const range = document.createElement('span');
    range.className = 'stats-period-legend-range';
    range.textContent = item.range || '';

    textWrap.appendChild(main);
    textWrap.appendChild(range);

    row.appendChild(dot);
    row.appendChild(textWrap);
    container.appendChild(row);
  }
}

function buildTimePreferenceModel(list) {
  const buckets = { morning: 0, noon: 0, evening: 0 };

  for (const item of list || []) {
    const minutes = Number(item?.minutes) || 0;
    if (minutes <= 0) continue;
    const hour = new Date(item.ts).getHours();
    if (hour >= 5 && hour <= 11) buckets.morning += minutes;
    else if (hour >= 12 && hour <= 17) buckets.noon += minutes;
    else buckets.evening += minutes;
  }

  const items = TIME_PREF_PERIODS.map((period, idx) => ({
    ...period,
    index: idx,
    minutes: Number(buckets[period.key]) || 0,
  })).sort((a, b) => {
    if (b.minutes !== a.minutes) return b.minutes - a.minutes;
    return a.index - b.index;
  });

  const total = items.reduce((sum, item) => sum + item.minutes, 0);
  const hasData = total > 0;

  return {
    items,
    total,
    hasData,
    labels: hasData ? items.map((item) => item.label) : ['No Data'],
    values: hasData ? items.map((item) => item.minutes) : [1],
    colors: hasData ? items.map((item) => item.color) : ['rgba(206, 215, 209, 0.82)'],
  };
}

const timePrefArcPercentLabelPlugin = {
  id: 'timePrefArcPercentLabel',
  afterDatasetsDraw(chart) {
    const dataset = chart.data?.datasets?.[0];
    if (!dataset || dataset.$showPercent !== true) return;
    const opacity = Number(chart.$timePrefLabelOpacity ?? 0);
    if (opacity <= 0) return;

    const meta = chart.getDatasetMeta(0);
    const arcs = meta?.data || [];
    if (!arcs.length) return;

    const coreMask = Array.isArray(dataset.$coreMask) ? dataset.$coreMask : [];
    const coreMinutes = Array.isArray(dataset.$coreMinutes) ? dataset.$coreMinutes : [];
    const total = Math.max(0, Number(chart.$timePrefTotal) || coreMinutes.reduce((sum, n) => sum + (Number(n) || 0), 0));
    if (total <= 0) return;

    const ctx = chart.ctx;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
    ctx.font = '600 11px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < arcs.length; i += 1) {
      const arc = arcs[i];
      const value = Number(coreMinutes[i]) || 0;
      if (!arc || coreMask[i] !== true || value <= 0) continue;

      const percent = Math.round((value / total) * 100);
      if (percent <= 0) continue;

      const angle = (arc.startAngle + arc.endAngle) / 2;
      const radius = arc.innerRadius + ((arc.outerRadius - arc.innerRadius) * 0.68);
      const x = arc.x + Math.cos(angle) * radius;
      const y = arc.y + Math.sin(angle) * radius;

      ctx.shadowColor = 'rgba(35, 47, 40, 0.22)';
      ctx.shadowBlur = 3;
      ctx.shadowOffsetY = 1;
      ctx.fillStyle = '#435148';
      ctx.fillText(`${percent}%`, x, y);
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
    }

    ctx.restore();
  },
};

const TIME_PREF_RADIUS = '96%';
const TIME_PREF_CUTOUT = '32%';

function buildTimePrefVisualDataset(model, gapRatio = 0.01) {
  if (!model?.hasData || !(model.total > 0)) {
    return {
      data: [1],
      colors: ['rgba(0,0,0,0)'],
      coreMask: [false],
      coreMinutes: [0],
      coreLabels: [''],
    };
  }

  const data = [];
  const colors = [];
  const coreMask = [];
  const coreMinutes = [];
  const coreLabels = [];
  for (let i = 0; i < model.items.length; i += 1) {
    const item = model.items[i];
    const minutes = Number(item.minutes) || 0;
    if (minutes <= 0) continue;
    const sideGap = Math.min(model.total * gapRatio, minutes * 0.45);
    const middle = Math.max(0, minutes - sideGap - sideGap);
    data.push(sideGap, middle, sideGap);
    colors.push('rgba(0,0,0,0)', item.color, 'rgba(0,0,0,0)');
    coreMask.push(false, true, false);
    coreMinutes.push(0, minutes, 0);
    coreLabels.push('', item.label, '');
  }

  if (!data.length) {
    return {
      data: [1],
      colors: ['rgba(0,0,0,0)'],
      coreMask: [false],
      coreMinutes: [0],
      coreLabels: [''],
    };
  }

  return { data, colors, coreMask, coreMinutes, coreLabels };
}

function startTimePrefLabelFadeIn(chart) {
  if (!chart || chart.$timePrefFadeStarted) return;
  chart.$timePrefFadeStarted = true;

  const durationMs = 140;
  const startTs = typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

  const step = (nowTs) => {
    const elapsed = Math.max(0, nowTs - startTs);
    const t = Math.min(1, elapsed / durationMs);
    const eased = 1 - ((1 - t) * (1 - t) * (1 - t));
    chart.$timePrefLabelOpacity = eased;
    chart.draw();

    if (t < 1) {
      chart.$timePrefLabelFadeRAF = requestAnimationFrame(step);
    } else {
      chart.$timePrefLabelFadeRAF = null;
      chart.$timePrefLabelOpacity = 1;
      chart.$timePrefEnableLabelAnim = false;
      chart.draw();
    }
  };

  chart.$timePrefLabelFadeRAF = requestAnimationFrame(step);
}

function ensureTimePrefTooltipPositioner() {
  const Tooltip = window.Chart?.Tooltip;
  if (!Tooltip?.positioners) return;
  if (Tooltip.positioners.timePrefAnchor) return;

  Tooltip.positioners.timePrefAnchor = (items) => {
    if (!items || !items.length) return { x: 0, y: 0 };
    const el = items[0]?.element;
    if (!el) return { x: 0, y: 0 };

    const x = Number(el.x);
    const y = Number(el.y);
    const start = Number(el.startAngle);
    const end = Number(el.endAngle);
    const outer = Number(el.outerRadius);
    if (![x, y, start, end, outer].every(Number.isFinite)) {
      return { x: 0, y: 0 };
    }

    const angle = (start + end) / 2;
    const radius = outer + 16;
    return {
      x: Math.round(x + (Math.cos(angle) * radius)),
      y: Math.round(y + (Math.sin(angle) * radius)),
    };
  };
}

export async function renderStats({ els, chartRef, animateOnEnter = false }) {
  const { statCount, statCompletedCount, statTotal, statAvgSession, statBestDay, chartCanvas, timePrefCanvas, timePrefLegend } = els;

  // 1. 获取数据
  let list = await loadSessionsFromBackend();

  const recentListAll = filterLast7Days(list);
  const recentList = recentListAll.filter((item) => item.isValid === true);

  // 2. 更新总次数
  if (statCount) {
    statCount.textContent = String(recentListAll.length);
  }

  if (statCompletedCount) {
    statCompletedCount.textContent = String(recentList.length);
  }

  // 3. 计算最近7天总时长
  const last7 = aggregateLast7Days(recentList);
  const sum7 = last7.reduce((a, b) => a + b.total, 0);

  if (statTotal) {
    statTotal.textContent = `${sum7} min`;
  }

  if (statAvgSession) {
    const totalMinutes = recentList.reduce((sum, item) => sum + (Number(item.minutes) || 0), 0);
    const avgMinutes = recentList.length > 0 ? (totalMinutes / recentList.length) : 0;
    statAvgSession.textContent = formatMinutesDetailed(avgMinutes);
  }

  if (statBestDay) {
    const bestDayMinutes = last7.reduce((maxVal, day) => Math.max(maxVal, Number(day.total) || 0), 0);
    statBestDay.textContent = formatMinutesDetailed(bestDayMinutes);
  }

  // 4. 绘制图表
  if (chartCanvas && window.Chart) {
    const labels = last7.map((d) => d.label);
    const data = last7.map((d) => d.total);

    if (chartRef.current) {
      chartRef.current.data.labels = labels;
      chartRef.current.data.datasets[0].data = data;
      if (animateOnEnter) {
        chartRef.current.reset();
      }
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

  if (timePrefCanvas && window.Chart) {
    ensureTimePrefTooltipPositioner();
    const model = buildTimePreferenceModel(recentList);
    const visual = buildTimePrefVisualDataset(model, 0.01);
    renderTimePrefLegend(timePrefLegend, model.items);

    if (animateOnEnter && chartRef.periodCurrent) {
      chartRef.periodCurrent.destroy();
      chartRef.periodCurrent = null;
    }

    if (chartRef.periodCurrent) {
      if (!Array.isArray(chartRef.periodCurrent.data.datasets) || chartRef.periodCurrent.data.datasets.length < 1) {
        chartRef.periodCurrent.destroy();
        chartRef.periodCurrent = null;
      }
    }

    if (chartRef.periodCurrent) {
      const nextSourceValues = model.values.map((n) => Number(n) || 0);
      const shouldAnimate = !!(model.hasData && animateOnEnter);
      chartRef.periodCurrent.data.labels = visual.coreLabels;
      chartRef.periodCurrent.data.datasets[0].data = visual.data;
      chartRef.periodCurrent.data.datasets[0].backgroundColor = visual.colors;
      chartRef.periodCurrent.data.datasets[0].spacing = 0;
      chartRef.periodCurrent.data.datasets[0].radius = TIME_PREF_RADIUS;
      chartRef.periodCurrent.data.datasets[0].cutout = TIME_PREF_CUTOUT;
      chartRef.periodCurrent.data.datasets[0].$showPercent = model.hasData;
      chartRef.periodCurrent.data.datasets[0].$coreMask = visual.coreMask;
      chartRef.periodCurrent.data.datasets[0].$coreMinutes = visual.coreMinutes;
      chartRef.periodCurrent.data.datasets[0].$coreLabels = visual.coreLabels;
      chartRef.periodCurrent.data.datasets[0].$sourceValues = nextSourceValues;
      chartRef.periodCurrent.$timePrefTotal = model.total;
      chartRef.periodCurrent.options.cutout = TIME_PREF_CUTOUT;
      chartRef.periodCurrent.options.interaction = { mode: 'point', intersect: true };
      chartRef.periodCurrent.options.animation = {
        duration: 820,
        easing: 'easeOutCubic',
        animateRotate: true,
        animateScale: false,
      };
      chartRef.periodCurrent.options.plugins.tooltip.mode = 'point';
      chartRef.periodCurrent.options.plugins.tooltip.intersect = true;
      chartRef.periodCurrent.options.plugins.tooltip.displayColors = false;
      chartRef.periodCurrent.options.plugins.tooltip.position = 'timePrefAnchor';
      chartRef.periodCurrent.options.plugins.tooltip.xAlign = 'center';
      chartRef.periodCurrent.options.plugins.tooltip.yAlign = 'bottom';
      chartRef.periodCurrent.options.plugins.tooltip.caretSize = 0;
      chartRef.periodCurrent.options.plugins.tooltip.caretPadding = 6;
      chartRef.periodCurrent.options.plugins.tooltip.animation = { duration: 0 };
      chartRef.periodCurrent.options.plugins.tooltip.enabled = model.hasData;
      chartRef.periodCurrent.options.plugins.tooltip.external = undefined;
      chartRef.periodCurrent.options.plugins.tooltip.filter = (item) => {
        const ds = item?.dataset || chartRef.periodCurrent.data.datasets?.[item?.datasetIndex ?? 0];
        return Array.isArray(ds?.$coreMask) ? ds.$coreMask[item.dataIndex] === true : true;
      };
      chartRef.periodCurrent.options.plugins.tooltip.callbacks = {
        title(items) {
          const first = Array.isArray(items) && items.length ? items[0] : null;
          if (!first) return '';
          const ds = first.dataset || {};
          const labels = Array.isArray(ds.$coreLabels) ? ds.$coreLabels : [];
          return labels[first.dataIndex] || '';
        },
        label(context) {
          const idx = context.dataIndex;
          const ds = context.dataset || {};
          const minutesList = Array.isArray(ds.$coreMinutes) ? ds.$coreMinutes : [];
          const labels = Array.isArray(ds.$coreLabels) ? ds.$coreLabels : [];
          const mins = Number(minutesList[idx] || 0);
          const total = Math.max(0, Number(context.chart?.$timePrefTotal) || 0);
          const percent = total > 0 ? Math.round((mins / total) * 100) : 0;
          const plainLabel = labels[idx] || 'Unknown';
          return `${plainLabel}: ${formatMinutesDetailed(mins)} (${percent}%)`;
        },
      };
      chartRef.periodCurrent.options.animation = shouldAnimate
        ? {
          duration: 820,
          easing: 'easeOutCubic',
          animateRotate: true,
          animateScale: false,
          onProgress(context) {
            const chart = context?.chart;
            if (!chart?.$timePrefEnableLabelAnim) return;
            // Keep labels fully hidden during arc sweep to avoid mid-animation flicker.
            chart.$timePrefLabelOpacity = 0;
          },
          onComplete(context) {
            const chart = context?.chart;
            if (!chart?.$timePrefEnableLabelAnim) return;
            startTimePrefLabelFadeIn(chart);
          },
        }
        : {
          duration: 0,
          animateRotate: false,
          animateScale: false,
        };
      chartRef.periodCurrent.options.transitions = {
        active: { animation: { duration: 0 } },
      };
      if (chartRef.periodCurrent.$timePrefLabelFadeRAF) {
        cancelAnimationFrame(chartRef.periodCurrent.$timePrefLabelFadeRAF);
        chartRef.periodCurrent.$timePrefLabelFadeRAF = null;
      }
      chartRef.periodCurrent.$timePrefLabelOpacity = shouldAnimate ? 0 : (model.hasData ? 1 : 0);
      chartRef.periodCurrent.$timePrefFadeStarted = !shouldAnimate;
      chartRef.periodCurrent.$timePrefEnableLabelAnim = shouldAnimate;
      chartRef.periodCurrent.update(shouldAnimate ? undefined : 'none');
    } else {
      const shouldAnimate = !!(model.hasData && animateOnEnter);
      const initialVisualData = shouldAnimate ? visual.data.map(() => 0) : visual.data;
      const initialCoreMinutes = shouldAnimate ? visual.coreMinutes.map(() => 0) : visual.coreMinutes;
      chartRef.periodCurrent = new Chart(timePrefCanvas, {
        type: 'doughnut',
        plugins: [timePrefArcPercentLabelPlugin],
        data: {
          labels: visual.coreLabels,
          datasets: [
            {
              data: initialVisualData,
              backgroundColor: visual.colors,
              borderWidth: 0,
              borderColor: 'transparent',
              spacing: 0,
              radius: TIME_PREF_RADIUS,
              cutout: TIME_PREF_CUTOUT,
              $showPercent: shouldAnimate ? false : model.hasData,
              $coreMask: visual.coreMask,
              $coreMinutes: initialCoreMinutes,
              $coreLabels: visual.coreLabels,
              $sourceValues: model.values.map((n) => Number(n) || 0),
              hoverBorderColor: 'transparent',
              hoverBorderWidth: 0,
              hoverOffset: 0,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          aspectRatio: 1.28,
          interaction: {
            mode: 'point',
            intersect: true,
          },
          animation: shouldAnimate
            ? {
              duration: 820,
              easing: 'easeOutCubic',
              animateRotate: true,
              animateScale: false,
              onProgress(context) {
                const chart = context?.chart;
                if (!chart?.$timePrefEnableLabelAnim) return;
                // Keep labels fully hidden during arc sweep to avoid mid-animation flicker.
                chart.$timePrefLabelOpacity = 0;
              },
              onComplete(context) {
                const chart = context?.chart;
                if (!chart?.$timePrefEnableLabelAnim) return;
                startTimePrefLabelFadeIn(chart);
              },
            }
            : {
              duration: 0,
              animateRotate: false,
              animateScale: false,
            },
          cutout: TIME_PREF_CUTOUT,
          plugins: {
            legend: {
              display: false,
            },
            tooltip: {
              enabled: model.hasData,
              mode: 'point',
              intersect: true,
              displayColors: false,
              position: 'timePrefAnchor',
              xAlign: 'center',
              yAlign: 'bottom',
              caretSize: 0,
              caretPadding: 6,
              filter(item) {
                const ds = item?.dataset || item?.chart?.data?.datasets?.[item?.datasetIndex ?? 0];
                return Array.isArray(ds?.$coreMask) ? ds.$coreMask[item.dataIndex] === true : true;
              },
              animation: {
                duration: 0,
              },
              callbacks: {
                title(items) {
                  const first = Array.isArray(items) && items.length ? items[0] : null;
                  if (!first) return '';
                  const ds = first.dataset || {};
                  const labels = Array.isArray(ds.$coreLabels) ? ds.$coreLabels : [];
                  return labels[first.dataIndex] || '';
                },
                label(context) {
                  const idx = context.dataIndex;
                  const ds = context.dataset || {};
                  const minutesList = Array.isArray(ds.$coreMinutes) ? ds.$coreMinutes : [];
                  const labelList = Array.isArray(ds.$coreLabels) ? ds.$coreLabels : [];
                  const mins = Number(minutesList[idx] || 0);
                  const total = Math.max(0, Number(context.chart?.$timePrefTotal) || 0);
                  const percent = total > 0 ? Math.round((mins / total) * 100) : 0;
                  const plainLabel = labelList[idx] || context.chart?.data?.labels?.[idx] || 'Unknown';
                  return `${plainLabel}: ${formatMinutesDetailed(mins)} (${percent}%)`;
                },
              },
            },
          },
          layout: {
            padding: {
              left: 18,
              right: 12,
              top: 6,
              bottom: 6,
            },
          },
        },
      });
      chartRef.periodCurrent.$timePrefLabelOpacity = shouldAnimate ? 0 : (model.hasData ? 1 : 0);
      chartRef.periodCurrent.$timePrefTotal = model.total;
      chartRef.periodCurrent.$timePrefFadeStarted = !shouldAnimate;
      chartRef.periodCurrent.$timePrefLabelFadeRAF = null;
      chartRef.periodCurrent.$timePrefEnableLabelAnim = false;

      // Keep single animation pass on first mount; avoid double fade flicker.
      if (shouldAnimate) {
        requestAnimationFrame(() => {
          if (!chartRef.periodCurrent) return;
          const ds = chartRef.periodCurrent.data?.datasets?.[0];
          if (!ds) return;
          ds.data = visual.data;
          ds.$coreMinutes = visual.coreMinutes;
          ds.$showPercent = true;
          chartRef.periodCurrent.$timePrefEnableLabelAnim = true;
          chartRef.periodCurrent.$timePrefLabelOpacity = 0;
          chartRef.periodCurrent.$timePrefFadeStarted = false;
          chartRef.periodCurrent.update();
        });
      }
    }
  }
}
