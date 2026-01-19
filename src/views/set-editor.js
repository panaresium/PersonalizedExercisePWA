import { getState, updateState, subscribe } from '../lib/state.js';
import { Router } from '../lib/router.js';
import { NavBar, ListGroup, ListItem, Button, createElement } from '../components/ui.js';
import { generateId } from '../lib/utils.js';

export class SetEditorView {
  constructor(params) {
    this.projectId = params.projectId;
    this.setId = params.setId;
    this.state = getState();
    this.set = this.state.exerciseSets[this.setId];
    this.unsubscribe = null;
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

  render() {
    this.container = createElement('div', 'view');
    this.refresh();
    return this.container;
  }

  refresh() {
    this.container.innerHTML = '';
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
        onInput: (e) => this.updateSet({ title: e.target.value }),
        placeholder: "Set Title"
    });

    const modeSelect = createElement('select', 'form-select', {
        value: this.set.mode,
        onChange: (e) => this.updateSet({ mode: e.target.value })
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
        type: 'number',
        value: this.set.rounds,
        onInput: (e) => this.updateSet({ rounds: parseInt(e.target.value) || 1 })
    });

    const restInput = createElement('input', 'form-input', {
        type: 'number',
        value: this.set.restBetweenRoundsSec,
        onInput: (e) => this.updateSet({ restBetweenRoundsSec: parseInt(e.target.value) || 0 })
    });

    content.appendChild(createElement('div', 'form-group', {},
        createElement('label', 'form-label', {}, "Rounds"),
        roundsInput
    ));

    content.appendChild(createElement('div', 'form-group', {},
        createElement('label', 'form-label', {}, "Rest Between Rounds (Seconds)"),
        restInput
    ));


    // Steps List
    content.appendChild(createElement('div', 'form-label', {}, "Steps"));

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
