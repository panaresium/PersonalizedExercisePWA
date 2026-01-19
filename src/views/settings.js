import { getState, updateState, subscribe } from '../lib/state.js';
import { Router } from '../lib/router.js';
import { NavBar, createElement } from '../components/ui.js';

export class SettingsView {
  constructor() {
    this.state = getState();
    this.unsubscribe = null;
  }

  onMount() {
    this.unsubscribe = subscribe((newState) => {
      this.state = newState;
      this.refresh();
    });
  }

  onUnmount() {
    if (this.unsubscribe) this.unsubscribe();
  }

  updateSetting(key, value) {
      updateState(state => {
          const newState = { ...state };
          newState.settings = { ...newState.settings, [key]: value };
          return newState;
      });
  }

  render() {
    this.container = createElement('div', 'view');
    this.refresh();
    return this.container;
  }

  refresh() {
    this.container.innerHTML = '';

    const header = NavBar({
      title: 'Settings',
      leftAction: { label: 'Back', onClick: () => Router.navigate('/') }
    });

    const content = createElement('div', 'view-content');

    // Volume
    content.appendChild(createElement('div', 'form-label', {}, "Audio"));

    const volumeContainer = createElement('div', 'list-group', { style: 'padding: 16px; background: var(--color-surface);' });
    const volumeLabel = createElement('div', '', { style: 'margin-bottom: 8px; display: flex; justify-content: space-between;' },
        "Master Volume",
        createElement('span', '', {}, `${Math.round(this.state.settings.volume * 100)}%`)
    );
    const volumeSlider = createElement('input', '', {
        type: 'range',
        min: 0,
        max: 1,
        step: 0.1,
        value: this.state.settings.volume,
        style: 'width: 100%;',
        onInput: (e) => this.updateSetting('volume', parseFloat(e.target.value))
    });
    volumeContainer.append(volumeLabel, volumeSlider);
    content.appendChild(volumeContainer);

    // Vibration
    const vibContainer = createElement('div', 'list-group', { style: 'padding: 16px; background: var(--color-surface); margin-top: 20px; display: flex; justify-content: space-between; align-items: center;' });
    const vibLabel = createElement('div', '', {}, "Vibration");
    const vibToggle = createElement('input', '', {
        type: 'checkbox',
        checked: this.state.settings.vibrationEnabled,
        onChange: (e) => this.updateSetting('vibrationEnabled', e.target.checked)
    });
    vibContainer.append(vibLabel, vibToggle);
    content.appendChild(vibContainer);

    // Keep Awake
    const awakeContainer = createElement('div', 'list-group', { style: 'padding: 16px; background: var(--color-surface); margin-top: 20px; display: flex; justify-content: space-between; align-items: center;' });
    const awakeLabel = createElement('div', '', {}, "Keep Screen Awake");
    const awakeToggle = createElement('input', '', {
        type: 'checkbox',
        checked: this.state.settings.keepAwake,
        onChange: (e) => this.updateSetting('keepAwake', e.target.checked)
    });
    awakeContainer.append(awakeLabel, awakeToggle);
    content.appendChild(awakeContainer);

    // Data Management
    content.appendChild(createElement('div', 'form-label', { style: 'margin-top: 30px;' }, "Data"));
    const resetBtn = createElement('button', 'btn btn-destructive', {
        onClick: () => {
            if (confirm("Are you sure? This will delete all local data.")) {
                // Clear IDB
                indexedDB.deleteDatabase('exercise_app');
                location.reload();
            }
        }
    }, "Reset All Data");
    content.appendChild(resetBtn);

    this.container.appendChild(header);
    this.container.appendChild(content);
  }
}
