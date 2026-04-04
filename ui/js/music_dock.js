// 2026/03/25 edited by Zhecheng Xu
// Changes:
//  - Add queue panel open/close behavior and click-outside dismissal.

export function mountMusicDock(els) {
  if (!els) return;

  const {
    musicDock,
    musicQueueBtn,
    musicQueuePanel,
  } = els;

  if (!musicDock || !musicQueueBtn || !musicQueuePanel) return;

  let isQueueOpen = false;

  function applyQueueState() {
    musicQueuePanel.hidden = !isQueueOpen;
    musicQueueBtn.setAttribute('aria-expanded', String(isQueueOpen));
  }

  function openQueue() {
    isQueueOpen = true;
    applyQueueState();
  }

  function closeQueue() {
    isQueueOpen = false;
    applyQueueState();
  }

  function toggleQueue() {
    if (isQueueOpen) closeQueue();
    else openQueue();
  }

  musicQueueBtn.addEventListener('click', toggleQueue);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isQueueOpen) closeQueue();
  });

  document.addEventListener('click', (e) => {
    if (!isQueueOpen) return;
    const target = e.target;
    if (!(target instanceof Node)) return;
    if (musicQueuePanel.contains(target)) return;
    if (musicQueueBtn.contains(target)) return;
    closeQueue();
  });

  applyQueueState();
}
