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

    this.isPopupOpen = false;
    this.popupTriggeredForStep = false;
    this.popupEl = null;
    this.popupTimerEl = null;
    this.popupMediaContainer = null;
    this.popupPlayBtn = null;
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
      this.hideNextUpInfo();
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
          this.popupTriggeredForStep = false;
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
          if (this.popupTimerEl && this.isPopupOpen) this.popupTimerEl.textContent = newTime;
          this.lastDisplayedTime = newTime;
      }

      // Auto Popup Logic
      if (this.state.settings.autoPopupMediaDelay > 0 &&
          !this.popupTriggeredForStep &&
          this.elapsedInStep >= this.state.settings.autoPopupMediaDelay &&
          !this.isPopupOpen) {

          this.openPopup();
          this.popupTriggeredForStep = true;
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

      const sequenceIndex = this.currentIndex;
      const isCancelled = () => this.status !== 'RUNNING' || this.currentIndex !== sequenceIndex;

      // 1. Announce Name / Rest
      let text = "";
      const nextItem = this.playlist[this.currentIndex + 1];

      if (item.type === 'STEP') {
          text = item.step.name;
      } else if (item.type === 'REST') {
          const nextName = nextItem ? (nextItem.type === 'STEP' ? nextItem.step.name : 'End of workout') : 'End of workout';
          text = `Rest. Next up: ${nextName}`;
      }

      if (text) await speak(text);
      if (isCancelled()) return;

      // 2. Announce Instructions (if enabled)
      if (item.type === 'STEP' && this.state.settings.ttsReadInstructions && item.step.instructions) {
          const delay = this.state.settings.delayNameInstructions ?? 0.5;
          if (delay > 0) {
              await this.wait(delay);
              if (isCancelled()) return;
          }
          await speak(item.step.instructions);
      }
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
      this.hideNextUpInfo();
      if (this.currentIndex < this.playlist.length - 1) {
          this.currentIndex++;
          this.elapsedInStep = 0;
          this.popupTriggeredForStep = false;
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
           this.popupTriggeredForStep = false;
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

      // Clean up media background
      if (this.mediaSlot) this.mediaSlot.innerHTML = '';

      // Show Completion Form
      this.contentEl.innerHTML = '';

      // Use a card-like container for the form, but semi-transparent if we want to keep background?
      // Let's stick to standard opaque form for readability on completion.
      const container = createElement('div', 'completion-form', {
          style: 'text-align: center; padding: 20px; width: 100%; background: var(--color-surface); border-radius: var(--radius-card); margin-top: 40px;'
      });

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

  async showNextUpInfo() {
      const nextItem = this.playlist[this.currentIndex + 1];
      if (!nextItem) return;

      this.renderNextUpPopup(nextItem);

      // Load media if needed
      if (nextItem.type === 'STEP' && nextItem.step.media) {
           const media = nextItem.step.media;
           if ((!media.source || media.source === 'FILE') && media.path) {
                try {
                    const file = await loadMedia(media.path);
                    // Check if popup is still open
                    if (this.nextUpPopupEl) {
                        const container = this.nextUpPopupEl.querySelector('.next-up-media');
                        if (file) {
                             this.nextUpBlobUrl = URL.createObjectURL(file);
                             if (container) {
                                 container.innerHTML = '';
                                 const img = createElement('img', '', { src: this.nextUpBlobUrl, style: 'width: 100%; height: 100%; object-fit: contain;' });
                                 container.appendChild(img);
                             }
                        } else if (container) {
                            container.style.display = 'none';
                        }
                    }
                } catch(e) { console.error("Failed to load next media", e); }
           }
      }
  }

  hideNextUpInfo() {
      if (this.nextUpPopupEl) {
          this.nextUpPopupEl.remove();
          this.nextUpPopupEl = null;
      }
      if (this.nextUpBlobUrl) {
          URL.revokeObjectURL(this.nextUpBlobUrl);
          this.nextUpBlobUrl = null;
      }
  }

  renderNextUpPopup(item) {
      this.hideNextUpInfo(); // Clear existing

      const overlay = createElement('div', 'next-up-popup-overlay', {
          style: 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: #000; z-index: 100; display: flex; flex-direction: column; align-items: center; padding: 20px; overflow-y: auto;',
          onClick: (e) => {
              if (e.target === overlay) this.hideNextUpInfo();
          }
      });

      // Header
      const header = createElement('div', '', { style: 'width: 100%; display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;' });
      header.appendChild(createElement('h3', '', { style: 'margin: 0; color: rgba(255,255,255,0.7); text-transform: uppercase; font-size: 14px;' }, "Next Up"));
      header.appendChild(createElement('button', 'nav-action', {
          onClick: (e) => { e.stopPropagation(); this.hideNextUpInfo(); },
          style: 'color: white; font-size: 16px; font-weight: 600; background: none; border: none; cursor: pointer; padding: 8px;'
      }, "Close"));
      overlay.appendChild(header);

      // Content
      const content = createElement('div', '', { style: 'width: 100%; max-width: 400px; flex: 1; display: flex; flex-direction: column;' });

      // Title
      const titleText = item.type === 'STEP' ? item.step.name : 'Rest';
      content.appendChild(createElement('h2', '', { style: 'color: white; font-size: 24px; margin-bottom: 20px; text-align: center;' }, titleText));

      // Media
      const mediaContainer = createElement('div', 'next-up-media', {
          style: 'width: 100%; aspect-ratio: 16/9; background: #000; margin-bottom: 20px; border-radius: 12px; overflow: hidden; display: flex; align-items: center; justify-content: center;'
      });

      let hasMedia = false;
      if (item.type === 'STEP' && item.step.media) {
          const media = item.step.media;
           if (media.source === 'URL' && media.url) {
               const el = this.createUrlMediaElement(media.url);
               if (el) {
                   mediaContainer.appendChild(el);
                   hasMedia = true;
               }
           } else if ((!media.source || media.source === 'FILE') && media.path) {
               // Placeholder until loaded or if missing
               // We will update this in showNextUpInfo logic
               mediaContainer.textContent = "Loading...";
               hasMedia = true;
           }
      }

      if (!hasMedia) {
          mediaContainer.style.display = 'none';
      }

      content.appendChild(mediaContainer);

      // Instructions
      if (item.type === 'STEP' && item.step.instructions) {
          content.appendChild(createElement('p', '', { style: 'color: rgba(255,255,255,0.9); font-size: 16px; line-height: 1.5; white-space: pre-wrap;' }, item.step.instructions));
      } else if (item.type === 'REST') {
           content.appendChild(createElement('p', '', { style: 'color: rgba(255,255,255,0.9); font-size: 16px; text-align: center;' }, "Relax and prepare for the next exercise."));
      }

      overlay.appendChild(content);
      this.container.appendChild(overlay);
      this.nextUpPopupEl = overlay;
  }

  render() {
    this.container = createElement('div', 'view player-view');
    // Header
    const header = NavBar({
      title: 'Workout',
      leftAction: { label: 'Close', onClick: () => Router.navigate(`/project/${this.projectId}`) }
    });
    this.container.appendChild(header);

    // Stage Container (Fills remaining space)
    const stage = createElement('div', 'player-stage', {
        style: 'position: relative; flex: 1; display: flex; flex-direction: column; overflow: hidden; background-color: #000;'
    });

    // 1. Background Container (Media + Scrim)
    this.backgroundContainer = createElement('div', 'player-background', {
        style: 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 0; display: flex; align-items: center; justify-content: center;'
    });

    this.mediaSlot = createElement('div', 'media-slot', {
         style: 'width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;'
    });
    this.backgroundContainer.appendChild(this.mediaSlot);

    // Scrim
    const scrim = createElement('div', 'player-scrim', {
        style: 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.4); pointer-events: none; z-index: 1;'
    });
    this.backgroundContainer.appendChild(scrim);

    stage.appendChild(this.backgroundContainer);

    // Manual Popup Trigger Button (Icon overlay)
    // Placed directly on stage with high z-index to ensure it's clickable over view-content
    const popupTrigger = createElement('button', 'popup-trigger-btn', {
        style: 'position: absolute; top: 16px; right: 16px; z-index: 10; background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.3); color: white; border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; cursor: pointer; backdrop-filter: blur(4px); font-size: 20px;',
        onClick: () => this.openPopup(),
        'aria-label': 'Expand Media'
    }, '⛶');
    stage.appendChild(popupTrigger);

    // 2. Content Layer
    const content = createElement('div', 'view-content', {
        style: 'position: relative; z-index: 2; display: flex; flex-direction: column; align-items: center; justify-content: space-between; height: 100%; overflow-y: auto; color: white;'
    });
    this.contentEl = content;
    stage.appendChild(content);

    this.container.appendChild(stage);

    // 3. Popup Layer
    this.renderPopup();

    this.renderContent();
    return this.container;
  }

  renderPopup() {
      // Full screen overlay
      this.popupEl = createElement('div', 'media-popup-overlay', {
          style: 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: #000; z-index: 1000; display: none; flex-direction: column; justify-content: space-between;'
      });

      // Header Controls (Top Right)
      const header = createElement('div', 'popup-header', {
          style: 'position: absolute; top: 0; left: 0; width: 100%; padding: 20px; display: flex; justify-content: flex-end; gap: 10px; z-index: 1002; pointer-events: none;'
      });

      // Play/Pause (Left of Close)
      this.popupPlayBtn = createElement('button', '', {
          style: 'pointer-events: auto; background: rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.3); color: white; border-radius: 50%; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 20px;',
          onClick: (e) => { e.stopPropagation(); this.togglePlay(); }
      }, this.status === 'RUNNING' ? '⏸' : '▶');

      // Close (Top Right)
      const closeBtn = createElement('button', '', {
          style: 'pointer-events: auto; background: rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.3); color: white; border-radius: 50%; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 24px;',
          onClick: (e) => { e.stopPropagation(); this.closePopup(); }
      }, '✕');

      header.appendChild(this.popupPlayBtn);
      header.appendChild(closeBtn);
      this.popupEl.appendChild(header);

      // Media Container (Center)
      this.popupMediaContainer = createElement('div', 'popup-media-container', {
          style: 'flex: 1; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; position: relative; z-index: 1001;'
      });
      this.popupEl.appendChild(this.popupMediaContainer);

      // Bottom Info (Overlay)
      const bottomInfo = createElement('div', 'popup-bottom-info', {
          style: 'position: absolute; bottom: 0; left: 0; width: 100%; padding: 40px 20px; background: linear-gradient(to top, rgba(0,0,0,0.9), transparent); color: white; z-index: 1002; text-align: center; display: flex; flex-direction: column; align-items: center;'
      });

      this.popupTitleEl = createElement('h2', '', { style: 'margin: 0 0 10px 0; font-size: 24px; text-shadow: 0 2px 4px black;' }, '');
      this.popupTimerEl = createElement('div', '', { style: 'font-size: 60px; font-weight: bold; font-variant-numeric: tabular-nums; text-shadow: 0 2px 4px black;' }, '00:00');

      bottomInfo.appendChild(this.popupTitleEl);
      bottomInfo.appendChild(this.popupTimerEl);
      this.popupEl.appendChild(bottomInfo);

      this.container.appendChild(this.popupEl);
  }

  openPopup() {
      if (!this.popupEl) return;
      this.isPopupOpen = true;
      this.popupEl.style.display = 'flex';
      this.updatePopupContent();
  }

  closePopup() {
      if (!this.popupEl) return;
      this.isPopupOpen = false;
      this.popupEl.style.display = 'none';
  }

  updatePopupContent() {
      if (!this.isPopupOpen) return;
      const item = this.playlist[this.currentIndex];
      if (!item) return;

      // Update Title
      if (this.popupTitleEl) {
          this.popupTitleEl.textContent = item.type === 'REST' ? 'Rest' : item.step.name;
      }

      // Update Timer
      if (this.popupTimerEl && this.timerEl) {
          this.popupTimerEl.textContent = this.timerEl.textContent;
      }

      // Update Play Button
      if (this.popupPlayBtn) {
          this.popupPlayBtn.textContent = this.status === 'RUNNING' ? '⏸' : '▶';
      }

      // Update Media
      if (this.popupMediaContainer) {
          this.popupMediaContainer.innerHTML = '';
          const mediaObj = item.type === 'STEP' ? item.step.media : null;

          if (mediaObj) {
               if ((!mediaObj.source || mediaObj.source === 'FILE') && this.mediaBlobUrl) {
                  const img = createElement('img', '', { src: this.mediaBlobUrl, style: 'width: 100%; height: 100%; object-fit: contain;' });
                  this.popupMediaContainer.appendChild(img);
              } else if (mediaObj.source === 'URL' && mediaObj.url) {
                  const element = this.createUrlMediaElement(mediaObj.url);
                  // Ensure iframe doesn't block clicks if we want to support tap-to-show-controls?
                  // But we have fixed controls.
                  if (element) this.popupMediaContainer.appendChild(element);
              }
          } else {
               // Placeholder text or just black?
               const msg = createElement('div', '', { style: 'color: #666;' }, "No Media");
               this.popupMediaContainer.appendChild(msg);
          }
      }
  }

  updateBackgroundMedia(item) {
      if (!this.mediaSlot) return;
      this.mediaSlot.innerHTML = '';

      const mediaObj = item?.type === 'STEP' ? item.step.media : null;

      if (mediaObj) {
           if ((!mediaObj.source || mediaObj.source === 'FILE') && this.mediaBlobUrl) {
              const img = createElement('img', '', { src: this.mediaBlobUrl, style: 'width: 100%; height: 100%; object-fit: contain;' });
              this.mediaSlot.appendChild(img);
          } else if (mediaObj.source === 'URL' && mediaObj.url) {
              const element = this.createUrlMediaElement(mediaObj.url);
              if (element) this.mediaSlot.appendChild(element);
          }
      }
  }

  renderContent() {
      if (!this.contentEl) return;
      this.contentEl.innerHTML = '';

      const item = this.playlist[this.currentIndex];

      this.updateBackgroundMedia(item);
      this.updatePopupContent();

      if (!item) {
          this.contentEl.textContent = "Empty Playlist";
          return;
      }

      // 1. Info
      const infoDiv = createElement('div', 'player-info', { style: 'text-align: center; margin-top: 20px; width: 100%;' });
      const title = createElement('h2', 'player-title', { style: 'margin: 0; margin-bottom: 8px; color: white; text-shadow: 0 2px 4px rgba(0,0,0,0.8);' }, item.type === 'REST' ? 'Rest' : item.step.name);
      const sub = createElement('p', 'player-subtitle', { style: 'margin: 0; color: rgba(255,255,255,0.8); text-shadow: 0 1px 2px rgba(0,0,0,0.8);' },
        `Set ${item.roundIndex}/${item.totalRounds}`
      );
      infoDiv.append(title, sub);

      // 2. Timer
      const remaining = item.type === 'REST' ? item.duration : item.step.durationSec;
      const timerDiv = createElement('div', 'timer-display', {
          style: 'font-size: 80px; font-weight: bold; font-variant-numeric: tabular-nums; color: white; text-shadow: 0 2px 4px rgba(0,0,0,0.8); margin: auto;'
      }, formatTime(remaining));
      this.timerEl = timerDiv;

      // 3. Bottom Controls Container
      const bottomDiv = createElement('div', '', { style: 'width: 100%;' });

      // Next Up Preview
      const nextItem = this.playlist[this.currentIndex + 1];
      const nextUpDiv = createElement('div', 'next-up-preview', {
          style: 'width: 100%; background: rgba(255,255,255,0.1); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); padding: 12px; border-radius: 12px; margin-bottom: 20px; display: flex; align-items: center; justify-content: space-between; box-shadow: var(--shadow-soft); border: 1px solid rgba(255,255,255,0.2); cursor: pointer;',
          onClick: () => this.showNextUpInfo()
      });

      const nextUpCol = createElement('div', '', { style: 'display: flex; flex-direction: column; align-items: flex-start;' });
      nextUpCol.appendChild(createElement('span', '', { style: 'font-size: 11px; text-transform: uppercase; color: rgba(255,255,255,0.7); font-weight: bold;' }, "Next Up"));
      nextUpCol.appendChild(createElement('span', '', { style: 'font-weight: 600; font-size: 16px; color: white;' }, nextItem ? (nextItem.type === 'STEP' ? nextItem.step.name : 'Rest') : 'Finish'));

      nextUpDiv.appendChild(nextUpCol);
      nextUpDiv.appendChild(createElement('div', '', { style: 'font-size: 20px; color: rgba(255,255,255,0.7);' }, '›'));

      bottomDiv.appendChild(nextUpDiv);

      // Controls
      const controlsDiv = createElement('div', 'player-controls', { style: 'width: 100%; display: flex; gap: 10px; margin-bottom: 20px;' });
      this.controlsContainer = controlsDiv;
      bottomDiv.appendChild(controlsDiv);
      this.renderControls();

      // Instructions
      if (item.type === 'STEP' && item.step.instructions) {
          const instDiv = createElement('div', '', {
              style: 'padding: 10px; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.2); color: white; width: 100%; border-radius: 8px; margin-bottom: 10px; backdrop-filter: blur(4px);'
          }, item.step.instructions);
          bottomDiv.appendChild(instDiv);
      }

      this.contentEl.append(infoDiv, timerDiv, bottomDiv);
  }

  createUrlMediaElement(url) {
      // YouTube
      const ytMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
      if (ytMatch && ytMatch[1]) {
          const iframe = createElement('iframe', '', {
              src: `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&mute=1&controls=0&loop=1&playlist=${ytMatch[1]}`,
              frameborder: '0',
              allow: 'autoplay; encrypted-media',
              style: 'width: 100%; height: 100%; max-width: 100%; aspect-ratio: 16/9; border-radius: 0; pointer-events: none;'
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
               style: 'width: 100%; height: 100%; object-fit: contain;'
           });
           return video;
      }

      // Default to Image
      const img = createElement('img', '', {
          src: url,
          style: 'width: 100%; height: 100%; object-fit: contain;'
      });
      return img;
  }

  renderControls() {
      if (this.popupPlayBtn) {
          this.popupPlayBtn.textContent = this.status === 'RUNNING' ? '⏸' : '▶';
      }

      if (!this.controlsContainer) return;
      this.controlsContainer.innerHTML = '';

      if (this.status === 'COMPLETED') return;

      // We need to style buttons to look good on dark background.
      // Standard buttons might be too bright or have white background.
      // Let's rely on standard styles for now, but maybe add a class or override.
      // The user said "controls... float on top".

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
