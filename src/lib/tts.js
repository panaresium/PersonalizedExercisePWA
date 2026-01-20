export const speak = (text) => {
  if (!window.speechSynthesis || !text) return Promise.resolve();

  // Cancel any ongoing speech
  window.speechSynthesis.cancel();

  return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      // utterance.rate = 1.0;
      // utterance.pitch = 1.0;
      utterance.onend = () => resolve();
      utterance.onerror = (e) => {
          console.warn("TTS Error", e);
          resolve();
      };
      window.speechSynthesis.speak(utterance);
  });
};
