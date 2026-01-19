import { getState, subscribe, updateState } from '../lib/state.js';
import { Router } from '../lib/router.js';
import { NavBar, ListItem, ListGroup, createElement, Button } from '../components/ui.js';
import { generateId } from '../lib/utils.js';

export class BeepListView {
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

  createBeep() {
    const newId = generateId();
    updateState(state => {
      const newState = { ...state };
      newState.beepCodes = { ...newState.beepCodes };
      newState.beepCodes[newId] = {
        id: newId,
        label: "New Beep",
        pattern: "S P(100) S"
      };
      return newState;
    });
    Router.navigate(`/beep/${newId}`);
  }

  render() {
    this.container = createElement('div', 'view');
    this.refresh();
    return this.container;
  }

  refresh() {
    this.container.innerHTML = '';

    const header = NavBar({
      title: 'Beep Library',
      leftAction: { label: 'Back', onClick: () => Router.navigate('/') },
      rightAction: { label: '+', onClick: () => this.createBeep() }
    });

    const content = createElement('div', 'view-content');

    const beeps = Object.values(this.state.beepCodes || {});

    if (beeps.length === 0) {
      content.appendChild(createElement('div', 'empty-state', {},
        "No custom beeps yet.",
        createElement('br'), createElement('br'),
        Button({ label: "Create Default Beeps", onClick: () => this.createDefaults(), type: 'secondary' })
      ));
    } else {
      const listItems = beeps.map(b => ListItem({
        title: b.label,
        subtitle: b.pattern,
        onClick: () => Router.navigate(`/beep/${b.id}`)
      }));
      content.appendChild(ListGroup(listItems));
    }

    this.container.appendChild(header);
    this.container.appendChild(content);
  }

  createDefaults() {
      updateState(state => {
          const newState = { ...state };
          const defs = [
              { label: "Short", pattern: "S" },
              { label: "Long", pattern: "L" },
              { label: "Double", pattern: "S P(100) S" },
              { label: "Countdown", pattern: "S P(500) S P(500) L" }
          ];
          defs.forEach(d => {
              const id = generateId();
              newState.beepCodes[id] = { id, ...d };
          });
          return newState;
      });
  }
}
