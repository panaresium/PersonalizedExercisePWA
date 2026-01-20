import { getState, updateState, subscribe } from '../lib/state.js';
import { Router } from '../lib/router.js';
import { NavBar, ListGroup, ListItem, Button, createElement, Modal } from '../components/ui.js';
import { generateId } from '../lib/utils.js';
import { BeepPicker, NO_CHANGE_VALUE as NO_CHANGE } from '../components/beep-picker.js';

export class SetEditorView {
  constructor(params) {
    this.projectId = params.projectId;
    this.setId = params.setId;
    this.state = getState();
    this.set = this.state.exerciseSets[this.setId];
    this.unsubscribe = null;

    // Set Beep Picker
    this.beepPicker = new BeepPicker({
        parent: this,
        onChange: (field, value) => this.updateSetBeep(field, value)
    });

    // Bulk Apply Picker (State separate from set beeps)
    this.isBulkModalOpen = false;
    this.bulkBeepConfig = { onStart: NO_CHANGE, onEnd: NO_CHANGE };
    this.bulkBeepPicker = new BeepPicker({
        parent: this,
        onChange: (field, value) => { this.bulkBeepConfig[field] = value; this.refresh(); }
    });
  }

  onMount() {
    this.unsubscribe = subscribe((newState) => {
      this.state = newState;
      this.set = this.state.exerciseSets[this.setId];
      this.refresh();
    });
  }

  onUnmount() {
    if (this.unsubscribe) this.unsubscribe();
  }

  updateSet(updates) {
    updateState(state => {
      const newState = { ...state };
      newState.exerciseSets[this.setId] = { ...newState.exerciseSets[this.setId], ...updates };
      return newState;
    });
  }

  updateSetBeep(field, value) {
      updateState(state => {
          const newState = { ...state };
          const set = newState.exerciseSets[this.setId];
          set.beep = { ...(set.beep || {}), [field]: value };
          if (value === '' || value === null) delete set.beep[field];
          return newState;
      });
  }

  addStep() {
    const newStepId = generateId();
    updateState(state => {
      const newState = { ...state };
      // Create Step
      newState.exerciseSteps[newStepId] = {
        id: newStepId,
        name: "New Step",
        instructions: "",
        durationSec: 30,
        beep: {}
      };
      // Add to Set
      const set = newState.exerciseSets[this.setId];
      set.stepIds = [...(set.stepIds || []), newStepId];
      return newState;
    });
  }

  deleteSet() {
      if (!confirm("Delete this set?")) return;
      updateState(state => {
          const newState = { ...state };
          // Remove set from project
          const project = newState.projects[this.projectId];
          project.exerciseSetIds = project.exerciseSetIds.filter(id => id !== this.setId);
          delete newState.exerciseSets[this.setId];
          return newState;
      });
      Router.navigate(`/project/${this.projectId}`);
  }

  openBulkModal() {
      this.bulkBeepConfig = { onStart: NO_CHANGE, onEnd: NO_CHANGE };
      this.isBulkModalOpen = true;
      this.refresh();
  }

  closeBulkModal() {
      this.isBulkModalOpen = false;
      this.refresh();
  }

  applyBulkBeeps() {
      if (!confirm("This will update beep settings for all steps in this set. Continue?")) return;

      updateState(state => {
          const newState = { ...state };
          const set = newState.exerciseSets[this.setId];

          (set.stepIds || []).forEach(stepId => {
              if (newState.exerciseSteps[stepId]) {
                  const step = newState.exerciseSteps[stepId];
                  const newBeep = { ...(step.beep || {}) };


                  // On Start
                  if (this.bulkBeepConfig.onStart !== NO_CHANGE) {
                       if (this.bulkBeepConfig.onStart) {
                           newBeep.onStart = this.bulkBeepConfig.onStart;
                       } else {
                           delete newBeep.onStart;
                       }
                  }

                  // On End
                  if (this.bulkBeepConfig.onEnd !== NO_CHANGE) {
                       if (this.bulkBeepConfig.onEnd) {
                           newBeep.onEnd = this.bulkBeepConfig.onEnd;
                       } else {
                           delete newBeep.onEnd;
                       }
                  }

                  newState.exerciseSteps[stepId] = { ...step, beep: newBeep };
              }
          });
          return newState;
      });

      this.closeBulkModal();
  }

  render() {
    this.container = createElement('div', 'view');
    this.refresh();
    return this.container;
  }

  refresh() {
    this.container.innerHTML = '';

    // Render Modals
    const pickerModal = this.beepPicker.renderModal();
    if (pickerModal) this.container.appendChild(pickerModal);

    const bulkPickerModal = this.bulkBeepPicker.renderModal(); // In case creation happens inside bulk modal
    if (bulkPickerModal) this.container.appendChild(bulkPickerModal);

    if (this.isBulkModalOpen) {
         // Custom Modal for Bulk Selection
         // We use the BeepPicker's renderCards logic but scoped to local state
         const cards = this.bulkBeepPicker.renderCards({
             onStart: this.bulkBeepConfig.onStart,
             onEnd: this.bulkBeepConfig.onEnd
         }, ['onStart', 'onEnd'], { showNoChange: true });


         const modal = Modal({
             title: "Apply Beeps to All Steps",
             onCancel: () => this.closeBulkModal(),
             onConfirm: () => this.applyBulkBeeps(),
             confirmLabel: "Apply to All",
             children: [
                 createElement('div', '', {style: 'margin-bottom: 20px; color: var(--color-text-secondary); font-size: 14px;'},
                    "Select beep patterns to apply to every step in this set. 'Keep Existing' will preserve current settings."),
                 ...cards
             ]
         });
         this.container.appendChild(modal);
    }

    if (!this.set) {
        this.container.textContent = "Set not found";
        return;
    }

    // Header
    const header = NavBar({
      title: 'Edit Set',
      leftAction: { label: 'Back', onClick: () => Router.navigate(`/project/${this.projectId}`) }
    });

    const content = createElement('div', 'view-content');

    // Title & Mode
    const titleInput = createElement('input', 'form-input', {
        value: this.set.title,
        onChange: (e) => this.updateSet({ title: e.target.value }),
        placeholder: "Set Title",
        'aria-label': "Set Title"
    });

    const modeSelect = createElement('select', 'form-select', {
        value: this.set.mode,
        onChange: (e) => this.updateSet({ mode: e.target.value }),
        'aria-label': "Set Mode"
    },
        createElement('option', '', {value: 'STEP_SEQUENCE'}, "Step Sequence (Timed Steps)"),
        createElement('option', '', {value: 'TIME_RANGE_TOTAL'}, "Time Range Total"),
        createElement('option', '', {value: 'REPS_WITH_TIMING'}, "Reps with Timing")
    );

    content.appendChild(createElement('div', 'form-group', {},
        createElement('label', 'form-label', {}, "Set Details"),
        titleInput,
        modeSelect
    ));

    // Rounds & Rest
    const roundsInput = createElement('input', 'form-input', {
        id: 'input-rounds',
        type: 'number',
        value: this.set.rounds,
        onChange: (e) => this.updateSet({ rounds: parseInt(e.target.value) || 1 })
    });

    const restInput = createElement('input', 'form-input', {
        id: 'input-rest',
        type: 'number',
        value: this.set.restBetweenRoundsSec,
        onChange: (e) => this.updateSet({ restBetweenRoundsSec: parseInt(e.target.value) || 0 })
    });

    content.appendChild(createElement('div', 'form-group', {},
        createElement('label', 'form-label', { for: 'input-rounds' }, "Rounds"),
        roundsInput
    ));

    content.appendChild(createElement('div', 'form-group', {},
        createElement('label', 'form-label', { for: 'input-rest' }, "Rest Between Rounds (Seconds)"),
        restInput
    ));

    // Set Beeps
    content.appendChild(createElement('div', 'form-label', { style: 'margin-top: 24px;' }, "Set Beeps (Start/End of Set)"));
    const setBeepConfig = this.set.beep || {};
    const setBeepCards = this.beepPicker.renderCards({
        onStart: setBeepConfig.onStart,
        onEnd: setBeepConfig.onEnd
    }, ['onStart', 'onEnd']);
    setBeepCards.forEach(c => content.appendChild(c));


    // Steps List
    const stepsHeader = createElement('div', '', { style: 'display: flex; justify-content: space-between; align-items: center; margin-top: 32px; margin-bottom: 8px;' },
        createElement('div', 'form-label', { style: 'margin-bottom: 0;' }, "Steps"),
        createElement('button', 'nav-action', { style: 'font-size: 14px;', onClick: () => this.openBulkModal() }, "Apply Beeps to All")
    );
    content.appendChild(stepsHeader);

    const steps = (this.set.stepIds || []).map(stepId => this.state.exerciseSteps[stepId]).filter(Boolean);

    if (steps.length === 0) {
        content.appendChild(createElement('div', 'empty-state', {}, "No steps."));
    } else {
        const listItems = steps.map((step, index) => ListItem({
            title: `${index + 1}. ${step.name}`,
            subtitle: `${step.durationSec}s`,
            onClick: () => Router.navigate(`/project/${this.projectId}/set/${this.setId}/step/${step.id}`)
        }));
        content.appendChild(ListGroup(listItems));
    }

    content.appendChild(Button({
        label: "Add Step",
        onClick: () => this.addStep(),
        type: 'secondary'
    }));

     content.appendChild(createElement('br'));
    content.appendChild(Button({
        label: "Delete Set",
        onClick: () => this.deleteSet(),
        type: 'destructive'
    }));

    this.container.appendChild(header);
    this.container.appendChild(content);
  }
}
