import { getState, updateState, subscribe } from '../lib/state.js';
import { Router } from '../lib/router.js';
import { NavBar, ListGroup, ListItem, Button, createElement } from '../components/ui.js';
import { saveMedia } from '../lib/storage.js';

export class StepEditorView {
  constructor(params) {
    this.projectId = params.projectId;
    this.setId = params.setId;
    this.stepId = params.stepId;
    this.state = getState();
    this.step = this.state.exerciseSteps[this.stepId];
    this.unsubscribe = null;
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
          if (!value) delete step.beep[field];
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

  render() {
    this.container = createElement('div', 'view');
    this.refresh();
    return this.container;
  }

  refresh() {
    this.container.innerHTML = '';
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

    // Beeps
    const beepHeader = createElement('div', '', { style: 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;' },
        createElement('div', 'form-label', { style: 'margin-bottom: 0;' }, "Beeps"),
        createElement('button', 'nav-action', { style: 'font-size: 14px;', onClick: () => Router.navigate('/beeps') }, "Manage Beeps")
    );
    content.appendChild(beepHeader);

    const beeps = this.state.beepCodes || {};
    const beepOptions = [
        createElement('option', '', {value: ''}, "None"),
        ...Object.values(beeps).map(b => createElement('option', '', {value: b.id}, b.label))
    ];

    const createBeepSelect = (label, field) => {
        const select = createElement('select', 'form-select', {
            value: this.step.beep?.[field] || '',
            onChange: (e) => this.updateBeep(field, e.target.value)
        }, ...beepOptions.map(opt => opt.cloneNode(true)));

        return createElement('div', 'form-group', {},
            createElement('label', 'form-label', {}, label),
            select
        );
    };

    content.appendChild(createBeepSelect("On Start", "onStart"));
    content.appendChild(createBeepSelect("On End", "onEnd"));

    // Media
    content.appendChild(createElement('div', 'form-label', {}, "Media"));

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
