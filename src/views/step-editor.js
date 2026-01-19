import { getState, updateState, subscribe } from '../lib/state.js';
import { Router } from '../lib/router.js';
import { NavBar, Button, createElement, Modal } from '../components/ui.js';
import { saveMedia } from '../lib/storage.js';
import { initAudio, schedulePattern, getAudioTime } from '../lib/audio.js';

export class StepEditorView {
  constructor(params) {
    this.projectId = params.projectId;
    this.setId = params.setId;
    this.stepId = params.stepId;
    this.state = getState();
    this.step = this.state.exerciseSteps[this.stepId];
    this.unsubscribe = null;

    // Local UI state
    this.isModalOpen = false;
    this.newBeepData = { label: '', pattern: '' };
    this.targetBeepField = null; // 'onStart', 'onEnd', etc.
  }

  onMount() {
    this.unsubscribe = subscribe((newState) => {
      this.state = newState;
      this.step = this.state.exerciseSteps[this.stepId];
      this.refresh();
    });
  }

  onUnmount() {
    if (this.unsubscribe) this.unsubscribe();
  }

  updateStep(updates) {
    updateState(state => {
      const newState = { ...state };
      newState.exerciseSteps[this.stepId] = { ...newState.exerciseSteps[this.stepId], ...updates };
      return newState;
    });
  }

  updateBeep(field, value) {
      updateState(state => {
          const newState = { ...state };
          const step = newState.exerciseSteps[this.stepId];
          step.beep = { ...(step.beep || {}), [field]: value };
          if (value === '' || value === null) delete step.beep[field];
          return newState;
      });
  }

  async handleMediaUpload(e) {
      const file = e.target.files[0];
      if (!file) return;

      try {
          const { path } = await saveMedia(this.projectId, this.stepId, file.name, file);

          this.updateStep({
              media: {
                  type: 'GIF', // Default, logic could be enhanced to detect sequence vs single
                  path: path,
                  filename: file.name,
                  frameDurationSec: 0.1,
                  loop: true
              }
          });
      } catch (err) {
          console.error("Media upload failed", err);
          alert("Media upload failed");
      }
  }

  deleteStep() {
      if (!confirm("Delete this step?")) return;
      updateState(state => {
          const newState = { ...state };
          const set = newState.exerciseSets[this.setId];
          set.stepIds = set.stepIds.filter(id => id !== this.stepId);
          delete newState.exerciseSteps[this.stepId];
          return newState;
      });
      Router.navigate(`/project/${this.projectId}/set/${this.setId}`);
  }

  async handlePreview(beepId) {
      if (!beepId) return;
      const beep = this.state.beepCodes[beepId];
      if (!beep) return;

      try {
          await initAudio();
          schedulePattern(beep.pattern, getAudioTime() + 0.1);
      } catch (e) {
          console.error(e);
      }
  }

  openCreateModal(field) {
      this.targetBeepField = field;
      this.newBeepData = { label: '', pattern: '' };
      this.isModalOpen = true;
      this.refresh();
  }

  closeModal() {
      this.isModalOpen = false;
      this.refresh();
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

          // Auto-assign to the field that requested it
          if (this.targetBeepField) {
             newState.exerciseSteps = { ...state.exerciseSteps };
             const step = newState.exerciseSteps[this.stepId];
             if (step) {
                 const updatedStep = { ...step };
                 updatedStep.beep = { ...(step.beep || {}), [this.targetBeepField]: newId };
                 newState.exerciseSteps[this.stepId] = updatedStep;
             }
          }

          return newState;
      });

      this.closeModal();
  }

  render() {
    this.container = createElement('div', 'view');
    this.refresh();
    return this.container;
  }

  refresh() {
    this.container.innerHTML = '';

    // Modal Render
    if (this.isModalOpen) {
        const modal = Modal({
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
        this.container.appendChild(modal);
    }


    if (!this.step) {
        this.container.textContent = "Step not found";
        return;
    }

    // Header
    const header = NavBar({
      title: 'Edit Step',
      leftAction: { label: 'Back', onClick: () => Router.navigate(`/project/${this.projectId}/set/${this.setId}`) }
    });

    const content = createElement('div', 'view-content');

    // Details
    const nameInput = createElement('input', 'form-input', {
        value: this.step.name,
        onChange: (e) => this.updateStep({ name: e.target.value }),
        placeholder: "Step Name"
    });

    const instructionsInput = createElement('textarea', 'form-textarea', {
        value: this.step.instructions || '',
        onChange: (e) => this.updateStep({ instructions: e.target.value }),
        placeholder: "Instructions"
    });

    const durationInput = createElement('input', 'form-input', {
        type: 'number',
        value: this.step.durationSec,
        onChange: (e) => this.updateStep({ durationSec: parseInt(e.target.value) || 0 }),
        placeholder: "Duration (Seconds)"
    });

    content.appendChild(createElement('div', 'form-group', {},
        createElement('label', 'form-label', {}, "Step Info"),
        nameInput, instructionsInput
    ));

    content.appendChild(createElement('div', 'form-group', {},
        createElement('label', 'form-label', {}, "Duration (Seconds)"),
        durationInput
    ));

    // Beeps Section
    const beepHeader = createElement('div', '', { style: 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; margin-top: 24px;' },
        createElement('div', 'form-label', { style: 'margin-bottom: 0;' }, "Beep Configuration"),
        createElement('button', 'nav-action', { style: 'font-size: 14px;', onClick: () => Router.navigate('/beeps') }, "Manage Beeps")
    );
    content.appendChild(beepHeader);

    const beeps = this.state.beepCodes || {};
    const beepOptions = [
        createElement('option', '', {value: ''}, "None"),
        ...Object.values(beeps).map(b => createElement('option', '', {value: b.id}, `${b.label} (${b.pattern})`))
    ];

    const createBeepCard = (title, description, controls, field) => {
        const card = createElement('div', '', { style: 'background: var(--color-surface); padding: 16px; border-radius: 16px; margin-bottom: 12px; box-shadow: var(--shadow-soft);' });

        const cardHeader = createElement('div', '', { style: 'display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;' },
             createElement('div', '', { style: 'font-weight: 600; font-size: 15px;' }, title),
             createElement('button', 'nav-action', { style: 'font-size: 13px; padding: 0;', onClick: () => this.openCreateModal(field) }, "+ New Beep")
        );

        card.appendChild(cardHeader);
        card.appendChild(createElement('div', '', { style: 'font-size: 13px; color: var(--color-text-secondary); margin-bottom: 12px;' }, description));
        controls.forEach(c => card.appendChild(c));
        return card;
    };

    const createBeepSelect = (field) => {
        const wrapper = createElement('div', '', { style: 'display: flex; gap: 8px; align-items: center;' });

        const select = createElement('select', 'form-select', {
            value: this.step.beep?.[field] || '',
            onChange: (e) => this.updateBeep(field, e.target.value),
            style: 'flex: 1; margin-bottom: 0;'
        }, ...beepOptions.map(opt => opt.cloneNode(true)));

        const previewBtn = createElement('button', 'btn btn-secondary', {
             style: 'width: 44px; padding: 0; margin: 0; display: flex; align-items: center; justify-content: center;',
             onClick: () => this.handlePreview(this.step.beep?.[field])
        }, "▶");

        wrapper.appendChild(select);
        wrapper.appendChild(previewBtn);
        return wrapper;
    };

    // 1. On Start
    content.appendChild(createBeepCard(
        "On Start",
        "Plays when the step begins.",
        [createBeepSelect("onStart")],
        "onStart"
    ));

    // 2. On End
    content.appendChild(createBeepCard(
        "On End",
        "Plays when the step finishes.",
        [createBeepSelect("onEnd")],
        "onEnd"
    ));

    // 3. Interval Beep
    const intervalSelectWrapper = createBeepSelect("interval");
    const intervalSecInput = createElement('input', 'form-input', {
        type: 'number',
        placeholder: 'Seconds (e.g. 10)',
        value: this.step.beep?.intervalSec || '',
        onChange: (e) => this.updateBeep('intervalSec', parseInt(e.target.value) || null),
        style: 'margin-top: 8px;'
    });

    content.appendChild(createBeepCard(
        "Interval",
        "Plays repeatedly every N seconds.",
        [intervalSelectWrapper, intervalSecInput],
        "interval"
    ));

    // 4. Countdown
    const countdownSelectWrapper = createBeepSelect("countdown");
    const countdownSecInput = createElement('input', 'form-input', {
        type: 'number',
        placeholder: 'Start from (e.g. 3)',
        value: this.step.beep?.countdownFromSec || '',
        onChange: (e) => this.updateBeep('countdownFromSec', parseInt(e.target.value) || null),
        style: 'margin-top: 8px;'
    });

    content.appendChild(createBeepCard(
        "Countdown",
        "Plays during the final N seconds.",
        [countdownSelectWrapper, countdownSecInput],
        "countdown"
    ));


    // Media
    content.appendChild(createElement('div', 'form-label', { style: 'margin-top: 24px;' }, "Media"));

    if (this.step.media && this.step.media.path) {
        content.appendChild(createElement('div', 'media-preview', { style: 'padding: 10px; text-align: center; background: var(--color-surface); border-radius: 12px; margin-bottom: 20px;' },
            createElement('div', '', { style: 'margin-bottom: 10px; font-size: 14px; color: var(--color-text-secondary);' }, `File: ${this.step.media.filename}`),
            Button({ label: "Remove Media", onClick: () => this.updateStep({ media: null }), type: 'destructive' })
        ));
    } else {
        const fileInput = createElement('input', 'form-input', {
            type: 'file',
            accept: 'image/gif, image/png, image/jpeg',
            onChange: (e) => this.handleMediaUpload(e)
        });
        content.appendChild(createElement('div', 'form-group', {}, fileInput));
    }


    content.appendChild(createElement('br'));
    content.appendChild(Button({
        label: "Delete Step",
        onClick: () => this.deleteStep(),
        type: 'destructive'
    }));

    this.container.appendChild(header);
    this.container.appendChild(content);
  }
}
