import { initState } from './lib/state.js';
import { Router } from './lib/router.js';
import { ProjectsListView } from './views/projects-list.js';
import { ProjectEditorView } from './views/project-editor.js';
import { SetEditorView } from './views/set-editor.js';
import { StepEditorView } from './views/step-editor.js';
import { PlayerView } from './views/player.js';
import { DashboardView } from './views/dashboard.js';
import { SettingsView } from './views/settings.js';
import { BeepListView } from './views/beep-list.js';
import { BeepEditorView } from './views/beep-editor.js';

// Minimal App Entry Point
const init = async () => {
    await initState();

    const appContainer = document.getElementById('app');

    const router = new Router({
        '/': ProjectsListView,
        '/project/:id': ProjectEditorView,
        '/project/:projectId/set/:setId': SetEditorView,
        '/project/:projectId/set/:setId/step/:stepId': StepEditorView,
        '/player/:id': PlayerView,
        '/dashboard': DashboardView,
        '/settings': SettingsView,
        '/beeps': BeepListView,
        '/beep/:id': BeepEditorView,
        '*': ProjectsListView // Fallback
    }, appContainer);

    router.start();
};

init().catch(err => console.error("App init failed", err));
