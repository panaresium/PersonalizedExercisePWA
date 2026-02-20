import { getState, updateState, subscribe } from '../lib/state.js';
import { Router } from '../lib/router.js';
import { NavBar, createElement, Button, Modal } from '../components/ui.js';
import { initAudio, schedulePattern, getAudioTime } from '../lib/audio.js';

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
      // Apply theme immediately if changed
      if (key === 'theme') {
          this.applyTheme(value);
      }
  }

  applyTheme(theme) {
      document.body.classList.remove('theme-light', 'theme-dark');
      if (theme === 'light') document.body.classList.add('theme-light');
      if (theme === 'dark') document.body.classList.add('theme-dark');
  }

  async testAudio() {
      await initAudio();
      schedulePattern("S", getAudioTime() + 0.1);
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

    // Theme
    content.appendChild(createElement('div', 'form-label', {}, "Appearance"));
    const themeSelect = createElement('select', 'form-select', {
        value: this.state.settings.theme || 'system',
        onChange: (e) => this.updateSetting('theme', e.target.value),
        'aria-label': "Theme Selection"
    },
        createElement('option', '', {value: 'system'}, "System Default"),
        createElement('option', '', {value: 'light'}, "Light Mode"),
        createElement('option', '', {value: 'dark'}, "Dark Mode")
    );
    content.appendChild(createElement('div', 'form-group', {}, themeSelect));


    // Volume
    content.appendChild(createElement('div', 'form-label', { style: 'margin-top: 20px;' }, "Audio"));

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
        onInput: (e) => this.updateSetting('volume', parseFloat(e.target.value)),
        'aria-label': "Master Volume"
    });
    volumeContainer.append(volumeLabel, volumeSlider);
    content.appendChild(volumeContainer);

    content.appendChild(Button({
        label: "Test Audio (Beep)",
        onClick: () => this.testAudio(),
        type: 'secondary'
    }));

    // Timing
    content.appendChild(createElement('div', 'form-label', { style: 'margin-top: 20px;' }, "Sequence Timing"));
    const timingContainer = createElement('div', 'list-group', { style: 'padding: 16px; background: var(--color-surface);' });

    // TTS -> Beep Delay
    const delayTtsLabel = createElement('div', '', { style: 'margin-bottom: 8px; display: flex; justify-content: space-between;' },
        "Delay: TTS → Beep",
        createElement('span', '', {}, `${(this.state.settings.delayTtsBeep ?? 0.5).toFixed(1)}s`)
    );
    const delayTtsInput = createElement('input', '', {
        type: 'range',
        min: 0,
        max: 5,
        step: 0.1,
        value: this.state.settings.delayTtsBeep ?? 0.5,
        style: 'width: 100%;',
        onInput: (e) => this.updateSetting('delayTtsBeep', parseFloat(e.target.value)),
        'aria-label': "Delay between TTS and Beep"
    });

    // Name -> Instructions Delay
    const delayNameInstLabel = createElement('div', '', { style: 'margin-top: 16px; margin-bottom: 8px; display: flex; justify-content: space-between;' },
        "Delay: Name → Instructions",
        createElement('span', '', {}, `${(this.state.settings.delayNameInstructions ?? 0.5).toFixed(1)}s`)
    );
    const delayNameInstInput = createElement('input', '', {
        type: 'range',
        min: 0,
        max: 5,
        step: 0.1,
        value: this.state.settings.delayNameInstructions ?? 0.5,
        style: 'width: 100%;',
        onInput: (e) => this.updateSetting('delayNameInstructions', parseFloat(e.target.value)),
        'aria-label': "Delay between Step Name and Instructions"
    });

    // Beep -> Start Delay
    const delayBeepLabel = createElement('div', '', { style: 'margin-top: 16px; margin-bottom: 8px; display: flex; justify-content: space-between;' },
        "Delay: Beep → Timer",
        createElement('span', '', {}, `${(this.state.settings.delayBeepStart ?? 0.5).toFixed(1)}s`)
    );
    const delayBeepInput = createElement('input', '', {
        type: 'range',
        min: 0,
        max: 5,
        step: 0.1,
        value: this.state.settings.delayBeepStart ?? 0.5,
        style: 'width: 100%;',
        onInput: (e) => this.updateSetting('delayBeepStart', parseFloat(e.target.value)),
        'aria-label': "Delay between Beep and Timer Start"
    });

    // Auto-popup Media Delay
    const autoPopupLabel = createElement('div', '', { style: 'margin-top: 16px; margin-bottom: 8px; display: flex; justify-content: space-between;' },
        "Auto-popup Media Delay",
        createElement('span', '', {}, (this.state.settings.autoPopupMediaDelay > 0 ? `${this.state.settings.autoPopupMediaDelay}s` : "Disabled"))
    );
    const autoPopupInput = createElement('input', '', {
        type: 'range',
        min: 0,
        max: 10,
        step: 1,
        value: this.state.settings.autoPopupMediaDelay ?? 0,
        style: 'width: 100%;',
        onInput: (e) => this.updateSetting('autoPopupMediaDelay', parseFloat(e.target.value)),
        'aria-label': "Delay before auto-popping up media"
    });

    timingContainer.append(delayTtsLabel, delayTtsInput, delayNameInstLabel, delayNameInstInput, delayBeepLabel, delayBeepInput, autoPopupLabel, autoPopupInput);
    content.appendChild(timingContainer);

    // TTS
    content.appendChild(createElement('div', 'form-label', { style: 'margin-top: 20px;' }, "Text-to-Speech"));
    const ttsContainer = createElement('div', 'list-group', { style: 'padding: 16px; background: var(--color-surface);' });

    // Master Toggle
    const ttsRow = createElement('div', '', { style: 'display: flex; justify-content: space-between; align-items: center;' });
    const ttsLabel = createElement('label', '', { for: 'settings-tts' }, "Announcements Enabled");
    const ttsToggle = createElement('input', '', {
        id: 'settings-tts',
        type: 'checkbox',
        checked: this.state.settings.ttsEnabled !== false, // Default true
        onChange: (e) => this.updateSetting('ttsEnabled', e.target.checked),
        'aria-label': "Text-to-Speech Announcements"
    });
    ttsRow.append(ttsLabel, ttsToggle);

    // Read Instructions
    const readInstRow = createElement('div', '', { style: 'display: flex; justify-content: space-between; align-items: center; margin-top: 16px;' });
    const readInstLabel = createElement('label', '', { for: 'settings-read-inst' }, "Read Step Instructions");
    const readInstToggle = createElement('input', '', {
        id: 'settings-read-inst',
        type: 'checkbox',
        checked: this.state.settings.ttsReadInstructions === true,
        disabled: this.state.settings.ttsEnabled === false,
        onChange: (e) => this.updateSetting('ttsReadInstructions', e.target.checked),
        'aria-label': "Read Step Instructions"
    });
    if (this.state.settings.ttsEnabled === false) {
        readInstRow.style.opacity = '0.5';
    }
    readInstRow.append(readInstLabel, readInstToggle);

    ttsContainer.append(ttsRow, readInstRow);
    content.appendChild(ttsContainer);

    // Vibration
    const vibContainer = createElement('div', 'list-group', { style: 'padding: 16px; background: var(--color-surface); margin-top: 20px; display: flex; justify-content: space-between; align-items: center;' });
    const vibLabel = createElement('label', '', { for: 'settings-vib' }, "Vibration");
    const vibToggle = createElement('input', '', {
        id: 'settings-vib',
        type: 'checkbox',
        checked: this.state.settings.vibrationEnabled,
        onChange: (e) => this.updateSetting('vibrationEnabled', e.target.checked),
        'aria-label': "Vibration"
    });
    vibContainer.append(vibLabel, vibToggle);
    content.appendChild(vibContainer);

    // Keep Awake
    const awakeContainer = createElement('div', 'list-group', { style: 'padding: 16px; background: var(--color-surface); margin-top: 20px; display: flex; justify-content: space-between; align-items: center;' });
    const awakeLabel = createElement('label', '', { for: 'settings-awake' }, "Keep Screen Awake");
    const awakeToggle = createElement('input', '', {
        id: 'settings-awake',
        type: 'checkbox',
        checked: this.state.settings.keepAwake,
        onChange: (e) => this.updateSetting('keepAwake', e.target.checked),
        'aria-label': "Keep Screen Awake"
    });
    awakeContainer.append(awakeLabel, awakeToggle);
    content.appendChild(awakeContainer);

    // Data Management
    content.appendChild(createElement('div', 'form-label', { style: 'margin-top: 30px;' }, "Data"));
    const resetBtn = createElement('button', 'btn btn-destructive', {
        onClick: () => {
            const modal = Modal({
                title: "Reset All Data",
                children: [
                    createElement('p', '', {}, "Are you sure? This will delete all projects, settings, and logs. This action cannot be undone.")
                ],
                onCancel: () => modal.remove(),
                onConfirm: () => {
                     // Clear IDB
                     indexedDB.deleteDatabase('exercise_app');
                     location.reload();
                },
                confirmLabel: "Reset Everything",
                confirmType: "destructive"
            });
            this.container.appendChild(modal);
        }
    }, "Reset All Data");
    content.appendChild(resetBtn);

    this.container.appendChild(header);
    this.container.appendChild(content);
  }
}
