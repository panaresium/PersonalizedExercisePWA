import { getState, subscribe } from '../lib/state.js';
import { Router } from '../lib/router.js';
import { NavBar, ListGroup, ListItem, createElement } from '../components/ui.js';
import { formatTime } from '../lib/utils.js';

export class DashboardView {
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

  render() {
    this.container = createElement('div', 'view');
    this.refresh();
    return this.container;
  }

  refresh() {
    this.container.innerHTML = '';

    const header = NavBar({
      title: 'Dashboard',
      leftAction: { label: 'Back', onClick: () => Router.navigate('/') }
    });

    const content = createElement('div', 'view-content');

    // Stats
    const logs = Object.values(this.state.logs || {});
    const totalSessions = logs.length;
    const totalTimeSec = logs.reduce((acc, log) => acc + (log.duration || 0), 0);

    const statsContainer = createElement('div', 'stats-container', { style: 'display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;' });

    const createStatCard = (label, value) => {
        const card = createElement('div', 'card', { style: 'background: var(--color-surface); padding: 16px; border-radius: 12px; text-align: center;' });
        card.appendChild(createElement('div', '', { style: 'font-size: 24px; font-weight: bold; color: var(--color-accent);' }, value));
        card.appendChild(createElement('div', '', { style: 'font-size: 13px; color: var(--color-text-secondary); text-transform: uppercase;' }, label));
        return card;
    };

    statsContainer.appendChild(createStatCard("Sessions", totalSessions));
    statsContainer.appendChild(createStatCard("Time Trained", formatTime(totalTimeSec)));

    content.appendChild(statsContainer);

    // Recent Activity
    content.appendChild(createElement('div', 'form-label', {}, "Recent Activity"));

    if (logs.length === 0) {
        content.appendChild(createElement('div', 'empty-state', {}, "No workout history yet."));
    } else {
        const recentLogs = logs.sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt)).slice(0, 10);
        const listItems = recentLogs.map(log => {
            const project = this.state.projects[log.projectId];
            const date = new Date(log.completedAt).toLocaleDateString();
            return ListItem({
                title: project ? project.name : "Unknown Project",
                subtitle: `${date} • ${formatTime(log.duration)}`,
                onClick: () => {} // maybe show details
            });
        });
        content.appendChild(ListGroup(listItems));
    }

    // Suggestions
    content.appendChild(createElement('div', 'form-label', {style: 'margin-top: 20px'}, "Suggestions"));
    content.appendChild(createElement('div', 'card', { style: 'background: var(--color-surface); padding: 16px; border-radius: 12px;' },
        "Consistency is key! Try to train at least 3 times a week."
    ));


    this.container.appendChild(header);
    this.container.appendChild(content);
  }
}
