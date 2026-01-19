import { getState, updateState, subscribe } from '../lib/state.js';
import { Router } from '../lib/router.js';
import { NavBar, Button, createElement } from '../components/ui.js';
import { initAudio, schedulePattern, getAudioTime } from '../lib/audio.js';

export class BeepEditorView {
  constructor(params) {
    this.beepId = params.id;
    this.state = getState();
    this.beep = this.state.beepCodes[this.beepId];
    this.unsubscribe = null;
  }

  onMount() {
    this.unsubscribe = subscribe((newState) => {
      this.state = newState;
      this.beep = this.state.beepCodes[this.beepId];
      this.refresh();
    });
  }

  onUnmount() {
    if (this.unsubscribe) this.unsubscribe();
  }

  updateBeep(updates) {
    updateState(state => {
      const newState = { ...state };
      newState.beepCodes[this.beepId] = { ...newState.beepCodes[this.beepId], ...updates };
      return newState;
    });
  }

  async preview() {
      await initAudio();
      const pattern = this.beep.pattern;
      if (pattern) {
          schedulePattern(pattern, getAudioTime() + 0.1);
      }
  }

  deleteBeep() {
      if (!confirm("Delete this beep code?")) return;
      updateState(state => {
          const newState = { ...state };
          delete newState.beepCodes[this.beepId];
          return newState;
      });
      Router.navigate('/beeps');
  }

  render() {
    this.container = createElement('div', 'view');
    this.refresh();
    return this.container;
  }

  refresh() {
    this.container.innerHTML = '';
    if (!this.beep) {
        this.container.textContent = "Beep not found";
        return;
    }

    const header = NavBar({
      title: 'Edit Beep',
      leftAction: { label: 'Back', onClick: () => Router.navigate('/beeps') }
    });

    const content = createElement('div', 'view-content');

    // Label
    content.appendChild(createElement('div', 'form-group', {},
        createElement('label', 'form-label', {}, "Label"),
        createElement('input', 'form-input', {
            value: this.beep.label,
            onInput: (e) => this.updateBeep({ label: e.target.value })
        })
    ));

    // Pattern
    content.appendChild(createElement('div', 'form-group', {},
        createElement('label', 'form-label', {}, "Pattern"),
        createElement('input', 'form-input', {
            value: this.beep.pattern,
            onInput: (e) => this.updateBeep({ pattern: e.target.value }),
            placeholder: "e.g. S P(100) L"
        }),
        createElement('div', 'helper-text', { style: 'font-size: 13px; color: var(--color-text-secondary); margin-top: 6px; padding: 0 16px;' },
            "S = Short, L = Long, P(ms) = Pause. Example: S P(200) S"
        )
    ));

    // Preview
    content.appendChild(Button({
        label: "Preview Sound",
        onClick: () => this.preview(),
        type: 'primary'
    }));

    // Delete
    content.appendChild(createElement('br'));
    content.appendChild(Button({
        label: "Delete",
        onClick: () => this.deleteBeep(),
        type: 'destructive'
    }));

    this.container.appendChild(header);
    this.container.appendChild(content);
  }
}
