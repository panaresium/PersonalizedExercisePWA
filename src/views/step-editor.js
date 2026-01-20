import { getState, updateState, subscribe } from '../lib/state.js';
import { Router } from '../lib/router.js';
import { NavBar, Button, createElement } from '../components/ui.js';
import { BeepPicker } from '../components/beep-picker.js';
import { saveMedia } from '../lib/storage.js';

export class StepEditorView {
  constructor(params) {
    this.projectId = params.projectId;
    this.setId = params.setId;
    this.stepId = params.stepId;
    this.state = getState();
    this.step = this.state.exerciseSteps[this.stepId];
    this.unsubscribe = null;

    // Initialize Picker
    this.beepPicker = new BeepPicker({
        parent: this,
        onChange: (field, value) => this.updateBeep(field, value),
        onNewBeep: (newId) => {}
    });
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

  updateMedia(updates) {
      const currentMedia = this.step.media || {};
      const newMedia = { ...currentMedia, ...updates };
      // Default type if missing
      if (!newMedia.type) newMedia.type = 'GIF';
      this.updateStep({ media: newMedia });
  }

  async handleMediaUpload(e) {
      const file = e.target.files[0];
      if (!file) return;

      try {
          const { path } = await saveMedia(this.projectId, this.stepId, file.name, file);

          this.updateMedia({
              path: path,
              filename: file.name,
              source: 'FILE',
              // Preserve existing URL if any
              url: this.step.media?.url || null
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

    // Render Modal if open
    const modal = this.beepPicker.renderModal();
    if (modal) {
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
        placeholder: "Step Name",
        'aria-label': "Step Name"
    });

    const instructionsInput = createElement('textarea', 'form-textarea', {
        value: this.step.instructions || '',
        onChange: (e) => this.updateStep({ instructions: e.target.value }),
        placeholder: "Instructions",
        'aria-label': "Instructions"
    });

    const durationInput = createElement('input', 'form-input', {
        id: 'input-duration',
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
        createElement('label', 'form-label', { for: 'input-duration' }, "Duration (Seconds)"),
        durationInput
    ));

    // Beeps Section
    const beepHeader = createElement('div', '', { style: 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; margin-top: 24px;' },
        createElement('div', 'form-label', { style: 'margin-bottom: 0;' }, "Beep Configuration"),
        createElement('button', 'nav-action', { style: 'font-size: 14px;', onClick: () => Router.navigate('/beeps') }, "Manage Beeps")
    );
    content.appendChild(beepHeader);

    // Use BeepPicker to generate cards
    const beepConfig = this.step.beep || {};
    const cards = this.beepPicker.renderCards({
        onStart: beepConfig.onStart,
        onEnd: beepConfig.onEnd,
        interval: beepConfig.interval,
        intervalSec: beepConfig.intervalSec,
        countdown: beepConfig.countdown,
        countdownFromSec: beepConfig.countdownFromSec
    }, ['onStart', 'onEnd', 'interval', 'countdown']);
    cards.forEach(card => content.appendChild(card));


    // Media
    content.appendChild(createElement('div', 'form-label', { style: 'margin-top: 24px;' }, "Media"));

    const mediaObj = this.step.media || {};
    const activeSource = mediaObj.source || 'FILE'; // Default to FILE

    // Source Selector
    const sourceSelector = createElement('div', 'segmented-control', { style: 'display: flex; background: var(--color-surface); padding: 4px; border-radius: 8px; margin-bottom: 16px;' });

    const btnFile = createElement('button', '', {
        style: `flex: 1; padding: 8px; border: none; background: ${activeSource === 'FILE' ? 'var(--color-primary)' : 'transparent'}; color: ${activeSource === 'FILE' ? '#fff' : 'var(--color-text)'}; border-radius: 6px; cursor: pointer; font-weight: 500;`,
        onClick: () => this.updateMedia({ source: 'FILE' })
    }, "Upload File");

    const btnUrl = createElement('button', '', {
        style: `flex: 1; padding: 8px; border: none; background: ${activeSource === 'URL' ? 'var(--color-primary)' : 'transparent'}; color: ${activeSource === 'URL' ? '#fff' : 'var(--color-text)'}; border-radius: 6px; cursor: pointer; font-weight: 500;`,
        onClick: () => this.updateMedia({ source: 'URL' })
    }, "Image/Video URL");

    sourceSelector.append(btnFile, btnUrl);
    content.appendChild(sourceSelector);

    if (activeSource === 'FILE') {
        if (mediaObj.path) {
            content.appendChild(createElement('div', 'media-preview', { style: 'padding: 10px; text-align: center; background: var(--color-surface); border-radius: 12px; margin-bottom: 20px;' },
                createElement('div', '', { style: 'margin-bottom: 10px; font-size: 14px; color: var(--color-text-secondary);' }, `File: ${mediaObj.filename}`),
                Button({ label: "Remove File", onClick: () => this.updateMedia({ path: null, filename: null }), type: 'destructive' })
            ));
        } else {
            const fileInput = createElement('input', 'form-input', {
                type: 'file',
                accept: 'image/gif, image/png, image/jpeg',
                onChange: (e) => this.handleMediaUpload(e),
                'aria-label': "Upload Media"
            });
            content.appendChild(createElement('div', 'form-group', {}, fileInput));
        }
    } else {
        // URL Input
        const urlInput = createElement('input', 'form-input', {
            type: 'text',
            value: mediaObj.url || '',
            onChange: (e) => this.updateMedia({ url: e.target.value, source: 'URL' }),
            placeholder: "https://example.com/image.jpg or YouTube URL",
            'aria-label': "Media URL"
        });
        content.appendChild(createElement('div', 'form-group', {}, urlInput));

        if (mediaObj.url) {
             content.appendChild(createElement('div', '', { style: 'margin-top: 8px; font-size: 12px; color: var(--color-text-secondary);' }, "Preview will be shown in the player."));
        }
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
