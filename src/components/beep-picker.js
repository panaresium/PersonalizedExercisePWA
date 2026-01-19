import { createElement, Button, Modal } from './ui.js';
import { getState, updateState } from '../lib/state.js';
import { initAudio, schedulePattern, getAudioTime } from '../lib/audio.js';

export class BeepPicker {
  constructor(options) {
    this.parent = options.parent; // The view instance (needs refresh method)
    this.initialBeepIds = options.initialBeepIds || {}; // { onStart: 'id', ... }
    this.onChange = options.onChange; // (field, value) => void
    this.onNewBeep = options.onNewBeep; // optional: (newId) => void, if parent needs to know

    // Local state for the modal
    this.isModalOpen = false;
    this.targetBeepField = null;
    this.newBeepData = { label: '', pattern: '' };
  }

  getBeeps() {
      return getState().beepCodes || {};
  }

  handlePreview(beepId) {
      if (!beepId) return;
      const beep = this.getBeeps()[beepId];
      if (!beep) return;

      initAudio().then(() => {
           schedulePattern(beep.pattern, getAudioTime() + 0.1);
      }).catch(console.error);
  }

  openCreateModal(field) {
      this.targetBeepField = field;
      this.newBeepData = { label: '', pattern: '' };
      this.isModalOpen = true;
      if (this.parent && this.parent.refresh) this.parent.refresh();
  }

  closeModal() {
      this.isModalOpen = false;
      if (this.parent && this.parent.refresh) this.parent.refresh();
  }

  saveNewBeep() {
      if (!this.newBeepData.label || !this.newBeepData.pattern) {
          alert("Label and Pattern are required");
          return;
      }

      const newId = Date.now().toString();
      const newBeep = {
          id: newId,
          label: this.newBeepData.label,
          pattern: this.newBeepData.pattern
      };

      updateState(state => {
          const newState = { ...state };
          newState.beepCodes = { ...state.beepCodes, [newId]: newBeep };
          return newState;
      });

      // Auto-assign
      if (this.targetBeepField && this.onChange) {
          this.onChange(this.targetBeepField, newId);
      }

      if (this.onNewBeep) this.onNewBeep(newId);

      this.closeModal();
  }

  renderModal() {
      if (!this.isModalOpen) return null;

      return Modal({
            title: "Create New Beep",
            onCancel: () => this.closeModal(),
            onConfirm: () => this.saveNewBeep(),
            confirmLabel: "Create & Assign",
            children: [
                createElement('div', 'form-group', {},
                    createElement('label', 'form-label', {}, "Name"),
                    createElement('input', 'form-input', {
                        placeholder: "e.g. Three Short",
                        value: this.newBeepData.label,
                        onInput: (e) => this.newBeepData.label = e.target.value
                    })
                ),
                createElement('div', 'form-group', {},
                    createElement('label', 'form-label', {}, "Pattern (S=Short, L=Long, P(ms)=Pause)"),
                    createElement('input', 'form-input', {
                        placeholder: "e.g. S S L",
                        value: this.newBeepData.pattern,
                        onInput: (e) => this.newBeepData.pattern = e.target.value
                    })
                ),
                createElement('div', '', { style: 'font-size: 13px; color: var(--color-text-secondary); margin-top: -16px; margin-bottom: 20px;' },
                   "Example: 'S P(200) S' plays Short, 200ms pause, Short."
                ),
                Button({
                    label: "Preview Pattern",
                    type: 'secondary',
                    onClick: async () => {
                        try {
                           await initAudio();
                           schedulePattern(this.newBeepData.pattern, getAudioTime() + 0.1);
                        } catch(e) { console.error(e); }
                    }
                })
            ]
        });
  }

  createBeepSelect(field, currentVal, beepOptions) {
        const wrapper = createElement('div', '', { style: 'display: flex; gap: 8px; align-items: center;' });

        const select = createElement('select', 'form-select', {
            value: currentVal || '',
            onChange: (e) => this.onChange(field, e.target.value),
            style: 'flex: 1; margin-bottom: 0;'
        }, ...beepOptions.map(opt => opt.cloneNode(true)));

        const previewBtn = createElement('button', 'btn btn-secondary', {
             style: 'width: 44px; padding: 0; margin: 0; display: flex; align-items: center; justify-content: center;',
             onClick: () => this.handlePreview(currentVal),
             'aria-label': 'Preview beep pattern'
        }, "▶");

        wrapper.appendChild(select);
        wrapper.appendChild(previewBtn);
        return wrapper;
  }

  createCard(title, description, controls, field) {
        const card = createElement('div', '', { style: 'background: var(--color-surface); padding: 16px; border-radius: 16px; margin-bottom: 12px; box-shadow: var(--shadow-soft);' });

        const cardHeader = createElement('div', '', { style: 'display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;' },
             createElement('div', '', { style: 'font-weight: 600; font-size: 15px;' }, title),
             createElement('button', 'nav-action', { style: 'font-size: 13px; padding: 0;', onClick: () => this.openCreateModal(field) }, "+ New Beep")
        );

        card.appendChild(cardHeader);
        card.appendChild(createElement('div', '', { style: 'font-size: 13px; color: var(--color-text-secondary); margin-bottom: 12px;' }, description));
        controls.forEach(c => card.appendChild(c));
        return card;
  }

  // Helper to render standard beep config cards
  // config = { onStart: val, onEnd: val, interval: val, intervalSec: val, countdown: val, countdownFromSec: val }
  renderCards(config) {
      const beeps = this.getBeeps();
      const beepOptions = [
        createElement('option', '', {value: ''}, "None"),
        ...Object.values(beeps).map(b => createElement('option', '', {value: b.id}, `${b.label} (${b.pattern})`))
      ];

      const cards = [];

      // 1. On Start
      cards.push(this.createCard(
          "On Start",
          "Plays when starting.",
          [this.createBeepSelect("onStart", config.onStart, beepOptions)],
          "onStart"
      ));

      // 2. On End
      cards.push(this.createCard(
          "On End",
          "Plays when finishing.",
          [this.createBeepSelect("onEnd", config.onEnd, beepOptions)],
          "onEnd"
      ));

      // 3. Interval (only if requested, we can make this optional)
      // For sets, maybe we don't need Interval/Countdown? User said "All settings... features you think necessary"
      // Let's include them but make them optional/contextual?
      // For now, I'll return them all, parent can choose what to append.
      // Actually, better to just render what is standard.

      const intervalSelectWrapper = this.createBeepSelect("interval", config.interval, beepOptions);
      const intervalSecInput = createElement('input', 'form-input', {
            type: 'number',
            placeholder: 'Seconds (e.g. 10)',
            value: config.intervalSec || '',
            onChange: (e) => this.onChange('intervalSec', parseInt(e.target.value) || null),
            style: 'margin-top: 8px;'
      });
      cards.push(this.createCard("Interval", "Plays repeatedly every N seconds.", [intervalSelectWrapper, intervalSecInput], "interval"));

      const countdownSelectWrapper = this.createBeepSelect("countdown", config.countdown, beepOptions);
      const countdownSecInput = createElement('input', 'form-input', {
            type: 'number',
            placeholder: 'Start from (e.g. 3)',
            value: config.countdownFromSec || '',
            onChange: (e) => this.onChange('countdownFromSec', parseInt(e.target.value) || null),
            style: 'margin-top: 8px;'
      });
      cards.push(this.createCard("Countdown", "Plays during the final N seconds.", [countdownSelectWrapper, countdownSecInput], "countdown"));

      return cards;
  }
}
