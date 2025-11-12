// stats.js
import { loadSessions } from './storage.js';

export function aggregateLast7Days(list){
  const MS_DAY = 24*60*60*1000;
  const end = new Date(); end.setHours(23,59,59,999);
  const days = [];
  for (let i=6; i>=0; i--){
    const d = new Date(end.getTime() - i*MS_DAY);
    const key = d.toISOString().slice(0,10);
    days.push({ key, label: `${d.getMonth()+1}/${d.getDate()}`, total:0 });
  }
  const map = new Map(days.map(d=>[d.key,d]));
  list.forEach(item=>{
    const dayKey = new Date(item.ts).toISOString().slice(0,10);
    if (map.has(dayKey)) map.get(dayKey).total += Number(item.minutes)||0;
  });
  return days;
}

// 需要外部传入 DOM refs 与 Chart 构造器（避免隐式全局）
export function renderStats({ els, chartRef }){
  const { statCount, statTotal, statLastNote, chartCanvas } = els;
  const list = loadSessions();

  if (statCount) statCount.textContent = String(list.length);

  const last7 = aggregateLast7Days(list);
  const sum7 = last7.reduce((a,b)=> a + b.total, 0);
  if (statTotal) statTotal.textContent = `${sum7} min`;
  if (statLastNote) statLastNote.textContent = list.length ? (list[list.length-1].note || '—') : '—';

  if (chartCanvas && window.Chart){
    const labels = last7.map(d=> d.label);
    const data   = last7.map(d=> d.total);
    if (chartRef.current){
      chartRef.current.data.labels = labels;
      chartRef.current.data.datasets[0].data = data;
      chartRef.current.update();
    } else {
      chartRef.current = new Chart(chartCanvas, {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Minutes', data }] },
        options: { responsive: true, plugins:{ legend:{ display:false } }, scales:{ y:{ beginAtZero:true, ticks:{ precision:0 } } } }
      });
    }
  }
}
