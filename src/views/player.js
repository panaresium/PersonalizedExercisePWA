import { getState, subscribe, updateState } from '../lib/state.js';
import { Router } from '../lib/router.js';
import { NavBar, Button, createElement } from '../components/ui.js';
import { initAudio, schedulePattern, getAudioTime, getPatternDuration } from '../lib/audio.js';
import { speak } from '../lib/tts.js';
import { confetti } from '../lib/confetti.js';
import { loadMedia, saveAppState } from '../lib/storage.js';
import { formatTime, generateId } from '../lib/utils.js';

export class PlayerView {
  constructor(params) {
    this.projectId = params.id;
    this.state = getState();
    this.project = this.state.projects[this.projectId];

    // Flatten steps for execution
    this.playlist = this.buildPlaylist();
    this.currentIndex = 0;

    this.status = 'IDLE'; // IDLE, RUNNING, PAUSED, COMPLETED
    this.startTime = 0;
    this.elapsedInStep = 0;
    this.timerInterval = null;

    this.wakeLock = null;
    this.mediaBlobUrl = null;
    this.sessionStart = null;
    this.lastDisplayedTime = null;
  }

  buildPlaylist() {
      const list = [];
      if (!this.project) return list;

      (this.project.exerciseSetIds || []).forEach(setId => {
          const set = this.state.exerciseSets[setId];
          if (!set) return;

          for (let r = 0; r < set.rounds; r++) {
              // Add steps
              (set.stepIds || []).forEach((stepId, index) => {
                  const step = this.state.exerciseSteps[stepId];
                  if (step) {
                      list.push({
                          type: 'STEP',
                          step: step,
                          set: set,
                          roundIndex: r + 1,
                          totalRounds: set.rounds,
                          isFirstStepInSet: (index === 0 && r === 0),
                          isLastStepInSet: (index === set.stepIds.length - 1 && r === set.rounds - 1)
                      });
                  }
              });

              // Add Rest between rounds (if not last round)
              if (set.restBetweenRoundsSec > 0 && r < set.rounds - 1) {
                  list.push({
                      type: 'REST',
                      duration: set.restBetweenRoundsSec,
                      set: set,
                      roundIndex: r + 1,
                      totalRounds: set.rounds
                  });
              }
          }
      });
      return list;
  }

  onMount() {
     // Preload media for first item?
     this.loadMediaForCurrent();
  }

  onUnmount() {
      this.stop();
      if (this.mediaBlobUrl) URL.revokeObjectURL(this.mediaBlobUrl);
      if (this.wakeLock) this.wakeLock.release().catch(() => {});
  }

  async requestWakeLock() {
      if ('wakeLock' in navigator) {
          try {
              this.wakeLock = await navigator.wakeLock.request('screen');
          } catch (err) {
              console.warn("Wake Lock failed", err);
          }
      }
  }

  async loadMediaForCurrent() {
      if (this.mediaBlobUrl) {
          URL.revokeObjectURL(this.mediaBlobUrl);
          this.mediaBlobUrl = null;
      }

      const item = this.playlist[this.currentIndex];
      if (item && item.type === 'STEP' && item.step.media) {
          const media = item.step.media;
          // Only load BLOB if source is FILE or missing (legacy) and path exists
          if ((!media.source || media.source === 'FILE') && media.path) {
              try {
                  const file = await loadMedia(media.path);
                  if (file) {
                      this.mediaBlobUrl = URL.createObjectURL(file);
                  }
              } catch (e) {
                  console.error("Failed to load media", e);
              }
          }
      }
      this.renderContent();
  }

  togglePlay() {
      if (this.status === 'RUNNING') {
          this.pause();
      } else {
          this.play();
      }
  }

  wait(sec) {
      return new Promise(resolve => setTimeout(resolve, sec * 1000));
  }

  async executeSequence() {
      if (this.status !== 'RUNNING') return;

      const sequenceIndex = this.currentIndex;
      const isCancelled = () => this.status !== 'RUNNING' || this.currentIndex !== sequenceIndex;

      const item = this.playlist[sequenceIndex];
      if (!item) {
          this.complete();
          return;
      }

      // 1. TTS Announcement
      if (this.state.settings.ttsEnabled) {
          await this.playStepAnnouncement(item);
          if (isCancelled()) return;

          // Delay TTS -> Beep
          const delayTts = this.state.settings.delayTtsBeep ?? 0.5;
          if (delayTts > 0) {
              await this.wait(delayTts);
              if (isCancelled()) return;
          }
      }

      // 2. Start Beeps
      const duration = this.playStartBeeps(item);
      if (duration > 0) {
          // Wait for beep to finish
          await this.wait(duration);
          if (isCancelled()) return;

          // Delay Beep -> Timer
          const delayBeep = this.state.settings.delayBeepStart ?? 0.5;
          if (delayBeep > 0) {
              await this.wait(delayBeep);
              if (isCancelled()) return;
          }
      }

      // 3. Start Timer
      this.lastTick = Date.now();
      this.timerInterval = requestAnimationFrame(this.tick.bind(this));
  }

  async play() {
      await initAudio();
      await this.requestWakeLock();

      if (this.status === 'COMPLETED') {
          this.currentIndex = 0;
          this.elapsedInStep = 0;
      }

      if (this.status === 'IDLE') {
          this.sessionStart = new Date().toISOString();
      }

      this.status = 'RUNNING';
      this.renderControls(); // update button label

      if (this.elapsedInStep === 0) {
          this.executeSequence();
      } else {
          this.lastTick = Date.now();
          this.timerInterval = requestAnimationFrame(this.tick.bind(this));
      }
  }

  pause() {
      this.status = 'PAUSED';
      if (this.timerInterval) cancelAnimationFrame(this.timerInterval);
      this.renderControls();
  }

  stop() {
      this.pause();
      this.status = 'IDLE';
  }

  tick() {
      if (this.status !== 'RUNNING') return;

      const now = Date.now();
      const delta = (now - this.lastTick) / 1000;
      this.lastTick = now;

      this.elapsedInStep += delta;

      const item = this.playlist[this.currentIndex];
      if (!item) {
          this.complete();
          return;
      }

      const duration = item.type === 'REST' ? item.duration : (item.step.durationSec || 0);
      const remaining = Math.max(0, duration - this.elapsedInStep);

      // Update Timer UI
      const newTime = formatTime(Math.ceil(remaining));
      if (newTime !== this.lastDisplayedTime) {
          if (this.timerEl) this.timerEl.textContent = newTime;
          this.lastDisplayedTime = newTime;
      }

      const prevRemaining = remaining + delta;
      if (Math.ceil(prevRemaining) !== Math.ceil(remaining)) {
          // Second changed
          const sec = Math.ceil(remaining);
          this.checkIntervalBeeps(sec, item);
      }

      if (remaining <= 0) {
          // End Beeps
          this.playEndBeeps(item);
          // Next step
          this.next();
      } else {
          this.timerInterval = requestAnimationFrame(this.tick.bind(this));
      }
  }

  async playStepAnnouncement(item) {
      if (this.state.settings.ttsEnabled === false) return;
      if (!item) return;

      const nextItem = this.playlist[this.currentIndex + 1];
      let text = "";

      if (item.type === 'STEP') {
          text = item.step.name;
      } else if (item.type === 'REST') {
          const nextName = nextItem ? (nextItem.type === 'STEP' ? nextItem.step.name : 'End of workout') : 'End of workout';
          text = `Rest. Next up: ${nextName}`;
      }

      if (text) await speak(text);
  }

  playStartBeeps(item) {
      if (!item) return 0;
      const beeps = this.state.beepCodes;
      let maxDuration = 0;
      const now = getAudioTime();

      // Set Start Beep
      if (item.type === 'STEP' && item.isFirstStepInSet && item.set.beep?.onStart) {
          const pattern = beeps[item.set.beep.onStart]?.pattern;
          if (pattern) {
              schedulePattern(pattern, now);
              maxDuration = Math.max(maxDuration, getPatternDuration(pattern));
          }
      }

      // Step Start Beep
      if (item.type === 'STEP' && item.step.beep?.onStart) {
          const pattern = beeps[item.step.beep.onStart]?.pattern;
          if (pattern) {
              schedulePattern(pattern, now);
              maxDuration = Math.max(maxDuration, getPatternDuration(pattern));
          }
      }
      return maxDuration;
  }

  playEndBeeps(item) {
      if (!item) return;
      const beeps = this.state.beepCodes;

      // Step End Beep
      if (item.type === 'STEP' && item.step.beep?.onEnd) {
           const pattern = beeps[item.step.beep.onEnd]?.pattern;
           if (pattern) schedulePattern(pattern, getAudioTime());
      }

      // Set End Beep
      if (item.type === 'STEP' && item.isLastStepInSet && item.set.beep?.onEnd) {
           const pattern = beeps[item.set.beep.onEnd]?.pattern;
           // Delay slightly so it doesn't overlap completely with step end beep?
           if (pattern) schedulePattern(pattern, getAudioTime() + 0.5);
      }
  }

  checkIntervalBeeps(remainingSec, item) {
      if (!item || item.type !== 'STEP') return;

      const beepCfg = item.step.beep || {};
      const beeps = this.state.beepCodes;

      // Countdown
      if (beepCfg.countdown && beepCfg.countdownFromSec) {
          if (remainingSec <= beepCfg.countdownFromSec && remainingSec > 0) {
               const pattern = beeps[beepCfg.countdown]?.pattern;
               if (pattern) schedulePattern(pattern, getAudioTime());
          }
      }

      // Interval (Repeat every N seconds)
      // If duration is 30, interval is 10. Beep at 20, 10.
      if (beepCfg.interval && beepCfg.intervalSec) {
           const elapsed = item.step.durationSec - remainingSec;
           // Avoid beeping at 0 (start)
           if (elapsed > 0 && Math.abs(elapsed % beepCfg.intervalSec) < 0.1) {
                const pattern = beeps[beepCfg.interval]?.pattern;
                if (pattern) schedulePattern(pattern, getAudioTime());
           }
      }
  }

  next() {
      if (this.currentIndex < this.playlist.length - 1) {
          this.currentIndex++;
          this.elapsedInStep = 0;
          this.loadMediaForCurrent();

          if (this.status === 'RUNNING') {
              if (this.timerInterval) cancelAnimationFrame(this.timerInterval);
              this.executeSequence();
          }
      } else {
          this.complete();
      }
  }

  prev() {
       if (this.elapsedInStep > 3) {
           this.elapsedInStep = 0;
       } else if (this.currentIndex > 0) {
           this.currentIndex--;
           this.elapsedInStep = 0;
           this.loadMediaForCurrent();
       }
       this.renderContent();
  }

  complete() {
      this.status = 'COMPLETED';
      cancelAnimationFrame(this.timerInterval);
      this.renderControls();
      confetti();

      const now = new Date().toISOString();
      const duration = (new Date(now) - new Date(this.sessionStart)) / 1000;

      // Show Completion Form
      this.contentEl.innerHTML = '';

      const container = createElement('div', 'completion-form', { style: 'text-align: center; padding: 20px; width: 100%;' });
      container.innerHTML = `
        <h2 style="margin-bottom: 20px;">Workout Complete!</h2>
        <p style="color: var(--color-text-secondary);">Great job!</p>
      `;

      const form = createElement('div', 'form-group', { style: 'margin-top: 20px; text-align: left;' });

      // RPE Input
      form.appendChild(createElement('label', 'form-label', { for: 'input-rpe' }, "RPE (1-10)"));
      const rpeInput = createElement('input', 'form-input', { id: 'input-rpe', type: 'number', min: 1, max: 10, placeholder: 'Exertion level' });
      form.appendChild(rpeInput);

      // Pain Score
      form.appendChild(createElement('label', 'form-label', { for: 'input-pain', style: 'margin-top: 10px;' }, "Pain Score (0-10)"));
      const painInput = createElement('input', 'form-input', { id: 'input-pain', type: 'number', min: 0, max: 10, placeholder: 'Pain level' });
      form.appendChild(painInput);

       // Pain Location
      form.appendChild(createElement('label', 'form-label', { for: 'input-pain-loc', style: 'margin-top: 10px;' }, "Pain Location (Optional)"));
      const painLocInput = createElement('input', 'form-input', { id: 'input-pain-loc', type: 'text', placeholder: 'Where did it hurt?' });
      form.appendChild(painLocInput);

      const saveBtn = Button({ label: "Save & Finish", onClick: () => {
          const log = {
              id: generateId(),
              projectId: this.projectId,
              startedAt: this.sessionStart,
              completedAt: now,
              duration: duration,
              rpe: parseInt(rpeInput.value) || null,
              painScore: parseInt(painInput.value) || null,
              painLocation: painLocInput.value || null
          };

          updateState(state => {
              const newState = { ...state };
              newState.logs = { ...(newState.logs || {}), [log.id]: log };
              return newState;
          });

          Router.navigate('/dashboard');
      }});
      saveBtn.style.marginTop = '20px';

      container.appendChild(form);
      container.appendChild(saveBtn);

      this.contentEl.appendChild(container);
  }

  render() {
    this.container = createElement('div', 'view player-view');
    // Header
    const header = NavBar({
      title: 'Workout',
      leftAction: { label: 'Close', onClick: () => Router.navigate(`/project/${this.projectId}`) }
    });
    this.container.appendChild(header);

    // Content container
    const content = createElement('div', 'view-content', { style: 'display: flex; flex-direction: column; align-items: center; justify-content: space-between;' });
    this.container.appendChild(content);
    this.contentEl = content;

    this.renderContent();
    return this.container;
  }

  renderContent() {
      if (!this.contentEl) return;
      this.contentEl.innerHTML = '';

      const item = this.playlist[this.currentIndex];
      if (!item) {
          this.contentEl.textContent = "Empty Playlist";
          return;
      }

      // 1. Info
      const infoDiv = createElement('div', 'player-info', { style: 'text-align: center; margin-top: 20px;' });
      const title = createElement('h2', 'player-title', { style: 'margin: 0; margin-bottom: 8px;' }, item.type === 'REST' ? 'Rest' : item.step.name);
      const sub = createElement('p', 'player-subtitle', { style: 'margin: 0; color: var(--color-text-secondary);' },
        `Set ${item.roundIndex}/${item.totalRounds}`
      );
      infoDiv.append(title, sub);

      // 2. Media
      const mediaDiv = createElement('div', 'player-media', { style: 'flex: 1; display: flex; align-items: center; justify-content: center; width: 100%; max-height: 40vh; margin: 20px 0; font-weight: bold; color: var(--color-text-secondary);' });

      const mediaObj = item.type === 'STEP' ? item.step.media : null;

      if (mediaObj) {
          if ((!mediaObj.source || mediaObj.source === 'FILE') && this.mediaBlobUrl) {
              const img = createElement('img', '', { src: this.mediaBlobUrl, style: 'max-width: 100%; max-height: 100%; object-fit: contain;' });
              mediaDiv.appendChild(img);
          } else if (mediaObj.source === 'URL' && mediaObj.url) {
              const element = this.createUrlMediaElement(mediaObj.url);
              if (element) {
                  mediaDiv.appendChild(element);
              } else {
                  mediaDiv.textContent = '(Invalid URL)';
              }
          } else {
               mediaDiv.textContent = item.type === 'REST' ? 'Recover' : '(No Media)';
          }
      } else {
          mediaDiv.textContent = item.type === 'REST' ? 'Recover' : '(No Media)';
      }

      // 3. Timer
      const remaining = item.type === 'REST' ? item.duration : item.step.durationSec;
      const timerDiv = createElement('div', 'timer-display', { style: 'font-size: 80px; font-weight: bold; font-variant-numeric: tabular-nums;' }, formatTime(remaining));
      this.timerEl = timerDiv;

      // Next Up Preview
      const nextItem = this.playlist[this.currentIndex + 1];
      const nextUpDiv = createElement('div', 'next-up-preview', {
          style: 'width: 100%; background: var(--color-surface); padding: 12px; border-radius: 12px; margin-bottom: 20px; display: flex; align-items: center; justify-content: space-between; box-shadow: var(--shadow-soft);'
      });

      const nextUpCol = createElement('div', '', { style: 'display: flex; flex-direction: column; align-items: flex-start;' });
      nextUpCol.appendChild(createElement('span', '', { style: 'font-size: 11px; text-transform: uppercase; color: var(--color-text-secondary); font-weight: bold;' }, "Next Up"));
      nextUpCol.appendChild(createElement('span', '', { style: 'font-weight: 600; font-size: 16px;' }, nextItem ? (nextItem.type === 'STEP' ? nextItem.step.name : 'Rest') : 'Finish'));

      nextUpDiv.appendChild(nextUpCol);
      nextUpDiv.appendChild(createElement('div', '', { style: 'font-size: 20px; color: var(--color-text-secondary);' }, '›'));

      // 4. Controls
      const controlsDiv = createElement('div', 'player-controls', { style: 'width: 100%; display: flex; gap: 10px; margin-bottom: 20px;' });
      this.controlsContainer = controlsDiv;
      this.renderControls();

      // Instructions
      if (item.type === 'STEP' && item.step.instructions) {
          const instDiv = createElement('div', '', {style: 'padding: 10px; background: var(--color-surface); width: 100%; border-radius: 8px; margin-bottom: 10px; box-shadow: var(--shadow-soft);'}, item.step.instructions);
          this.contentEl.appendChild(instDiv);
      }

      this.contentEl.append(infoDiv, mediaDiv, timerDiv, nextUpDiv, controlsDiv);
  }

  createUrlMediaElement(url) {
      // YouTube
      const ytMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
      if (ytMatch && ytMatch[1]) {
          const iframe = createElement('iframe', '', {
              src: `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&mute=1&controls=0&loop=1&playlist=${ytMatch[1]}`,
              frameborder: '0',
              allow: 'autoplay; encrypted-media',
              style: 'width: 100%; height: 100%; max-width: 100%; aspect-ratio: 16/9; border-radius: 8px;'
          });
          return iframe;
      }

      // Video Extensions
      if (url.match(/\.(mp4|webm|ogg|mov)$/i)) {
           const video = createElement('video', '', {
               src: url,
               autoplay: true,
               loop: true,
               muted: true,
               playsinline: true,
               style: 'max-width: 100%; max-height: 100%; object-fit: contain;'
           });
           return video;
      }

      // Default to Image
      const img = createElement('img', '', {
          src: url,
          style: 'max-width: 100%; max-height: 100%; object-fit: contain;'
      });
      return img;
  }

  renderControls() {
      if (!this.controlsContainer) return;
      this.controlsContainer.innerHTML = '';

      if (this.status === 'COMPLETED') return;

      const prevBtn = Button({ label: "Prev", onClick: () => this.prev(), type: 'secondary', className: 'flex-1' });
      prevBtn.style.flex = '1';

      const playLabel = this.status === 'RUNNING' ? "Pause" : "Start";
      const playBtn = Button({ label: playLabel, onClick: () => this.togglePlay(), type: 'primary', className: 'flex-2' });
      playBtn.style.flex = '2';

      const nextBtn = Button({ label: "Next", onClick: () => this.next(), type: 'secondary', className: 'flex-1' });
      nextBtn.style.flex = '1';

      this.controlsContainer.append(prevBtn, playBtn, nextBtn);
  }
}
