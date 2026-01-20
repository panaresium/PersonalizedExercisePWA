export const speak = (text) => {
  if (!window.speechSynthesis) return;

  // Cancel any ongoing speech
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  // utterance.rate = 1.0;
  // utterance.pitch = 1.0;
  window.speechSynthesis.speak(utterance);
};
