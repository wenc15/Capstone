// js/pet.js
export function mountPet(els) {
  const { feedBtn, playBtn, petSpeechBubble } = els;

  feedBtn?.addEventListener('click', () => {
    if (!petSpeechBubble) return;
    petSpeechBubble.textContent = 'Yum!';
    petSpeechBubble.style.display = 'block';
    setTimeout(() => (petSpeechBubble.style.display = 'none'), 1200);
  });

  playBtn?.addEventListener('click', () => {
    if (!petSpeechBubble) return;
    petSpeechBubble.textContent = 'Let’s play!';
    petSpeechBubble.style.display = 'block';
    setTimeout(() => (petSpeechBubble.style.display = 'none'), 1200);
  });
}
