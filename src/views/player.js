import { getState, subscribe, updateState } from '../lib/state.js';
import { Router } from '../lib/router.js';
import { NavBar, Button, createElement } from '../components/ui.js';
import { initAudio, schedulePattern, getAudioTime } from '../lib/audio.js';
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
  }

  buildPlaylist() {
      const list = [];
      if (!this.project) return list;

      (this.project.exerciseSetIds || []).forEach(setId => {
          const set = this.state.exerciseSets[setId];
          if (!set) return;

          for (let r = 0; r < set.rounds; r++) {
              // Add steps
              (set.stepIds || []).forEach(stepId => {
                  const step = this.state.exerciseSteps[stepId];
                  if (step) {
                      list.push({
                          type: 'STEP',
                          step: step,
                          set: set,
                          roundIndex: r + 1,
                          totalRounds: set.rounds
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
      if (item && item.type === 'STEP' && item.step.media && item.step.media.path) {
          try {
              const file = await loadMedia(item.step.media.path);
              if (file) {
                  this.mediaBlobUrl = URL.createObjectURL(file);
              }
          } catch (e) {
              console.error("Failed to load media", e);
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
      this.lastTick = Date.now();

      this.timerInterval = requestAnimationFrame(this.tick.bind(this));
      this.renderControls(); // update button label

      // Schedule Start Beep if just starting step
      if (this.elapsedInStep === 0) {
          this.checkBeeps(0);
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
      const timerEl = this.container.querySelector('.timer-display');
      if (timerEl) timerEl.textContent = formatTime(Math.ceil(remaining));

      const prevRemaining = remaining + delta;
      if (Math.ceil(prevRemaining) !== Math.ceil(remaining)) {
          // Second changed
          const sec = Math.ceil(remaining);
          this.checkBeeps(sec, item);
      }

      if (remaining <= 0) {
          // Next step
          this.next();
      } else {
          this.timerInterval = requestAnimationFrame(this.tick.bind(this));
      }
  }

  checkBeeps(remainingSec, item) {
      if (!item || item.type !== 'STEP') return;

      const beepCfg = item.step.beep || {};
      const beeps = this.state.beepCodes;

      const duration = item.step.durationSec;

      // Start Beep
      if (Math.abs(remainingSec - duration) < 0.1 && beepCfg.onStart) {
          const pattern = beeps[beepCfg.onStart]?.pattern;
          if (pattern) schedulePattern(pattern, getAudioTime());
      }

      // End Beep (at 0)
      if (remainingSec === 0 && beepCfg.onEnd) {
           const pattern = beeps[beepCfg.onEnd]?.pattern;
           if (pattern) schedulePattern(pattern, getAudioTime());
      }

      // Countdown
      if (beepCfg.countdown && beepCfg.countdownFromSec) {
          if (remainingSec <= beepCfg.countdownFromSec && remainingSec > 0) {
               const pattern = beeps[beepCfg.countdown]?.pattern;
               if (pattern) schedulePattern(pattern, getAudioTime());
          }
      }
  }

  next() {
      if (this.currentIndex < this.playlist.length - 1) {
          this.currentIndex++;
          this.elapsedInStep = 0;
          this.loadMediaForCurrent();
          // Beep on start of next step
          const item = this.playlist[this.currentIndex];
          if (item.type === 'STEP') {
               const beepCfg = item.step.beep || {};
               if (beepCfg.onStart) {
                   const pattern = this.state.beepCodes[beepCfg.onStart]?.pattern;
                   if (pattern) schedulePattern(pattern, getAudioTime());
               }
          }
          if (this.status === 'RUNNING') {
              this.tick(); // Continue loop
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
      form.appendChild(createElement('label', 'form-label', {}, "RPE (1-10)"));
      const rpeInput = createElement('input', 'form-input', { type: 'number', min: 1, max: 10, placeholder: 'Exertion level' });
      form.appendChild(rpeInput);

      // Pain Score
      form.appendChild(createElement('label', 'form-label', { style: 'margin-top: 10px;' }, "Pain Score (0-10)"));
      const painInput = createElement('input', 'form-input', { type: 'number', min: 0, max: 10, placeholder: 'Pain level' });
      form.appendChild(painInput);

       // Pain Location
      form.appendChild(createElement('label', 'form-label', { style: 'margin-top: 10px;' }, "Pain Location (Optional)"));
      const painLocInput = createElement('input', 'form-input', { type: 'text', placeholder: 'Where did it hurt?' });
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
      const title = createElement('h2', '', {}, item.type === 'REST' ? 'Rest' : item.step.name);
      const sub = createElement('p', '', { style: 'color: var(--color-text-secondary);' },
        item.type === 'REST' ? `Next: ${this.playlist[this.currentIndex+1]?.step.name || 'End'}` :
        `Set ${item.roundIndex}/${item.totalRounds}`
      );
      infoDiv.append(title, sub);

      // 2. Media
      const mediaDiv = createElement('div', 'player-media', { style: 'flex: 1; display: flex; align-items: center; justify-content: center; width: 100%; max-height: 40vh; margin: 20px 0;' });
      if (this.mediaBlobUrl && item.type === 'STEP') {
          const img = createElement('img', '', { src: this.mediaBlobUrl, style: 'max-width: 100%; max-height: 100%; object-fit: contain;' });
          mediaDiv.appendChild(img);
      } else {
          mediaDiv.textContent = item.type === 'REST' ? 'Recover' : '(No Media)';
      }

      // 3. Timer
      const remaining = item.type === 'REST' ? item.duration : item.step.durationSec;
      const timerDiv = createElement('div', 'timer-display', { style: 'font-size: 80px; font-weight: bold; font-variant-numeric: tabular-nums;' }, formatTime(remaining));

      // 4. Controls
      const controlsDiv = createElement('div', 'player-controls', { style: 'width: 100%; display: flex; gap: 10px; margin-bottom: 20px;' });
      this.controlsContainer = controlsDiv;
      this.renderControls();

      // Instructions
      if (item.type === 'STEP' && item.step.instructions) {
          const instDiv = createElement('div', '', {style: 'padding: 10px; background: var(--color-surface); width: 100%; border-radius: 8px; margin-bottom: 10px;'}, item.step.instructions);
          this.contentEl.appendChild(instDiv);
      }

      this.contentEl.append(infoDiv, mediaDiv, timerDiv, controlsDiv);
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
