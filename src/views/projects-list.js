import { getState, subscribe, updateState } from '../lib/state.js';
import { Router } from '../lib/router.js';
import { NavBar, ListItem, ListGroup, createElement, Button } from '../components/ui.js';
import { generateId } from '../lib/utils.js';
import { readImportPackage } from '../lib/zip-manager.js';
import { parseProjectXml } from '../lib/xml-parser.js';
import { saveMedia } from '../lib/storage.js';

export class ProjectsListView {
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

  createNewProject() {
    const newId = generateId();
    updateState(state => {
      const newState = { ...state };
      newState.projects = { ...newState.projects };
      newState.projects[newId] = {
        id: newId,
        name: "New Project",
        description: "Created just now",
        exerciseSetIds: [],
        createdAt: new Date().toISOString()
      };
      return newState;
    });
    Router.navigate(`/project/${newId}`);
  }

  async importProject() {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.zip';
      input.onchange = async (e) => {
          const file = e.target.files[0];
          if (!file) return;

          try {
              const { xml, mediaFiles } = await readImportPackage(file);
              const importedState = parseProjectXml(xml);

              const newProjectId = Object.keys(importedState.projects)[0];
              const mediaMap = new Map(); // filename -> savedPath

              if (mediaFiles && mediaFiles.length > 0) {
                  for (const { filename, blob } of mediaFiles) {
                      // Save to storage
                      // Use 'imported' assetId for now
                      const { path } = await saveMedia(newProjectId, 'imported', filename, blob);
                      mediaMap.set(filename, path);
                  }
              }

              // Patch media paths in steps
              Object.values(importedState.exerciseSteps).forEach(step => {
                  if (step.media && step.media.filename) {
                      const savedPath = mediaMap.get(step.media.filename);
                      if (savedPath) {
                          step.media.path = savedPath;
                      }
                  }
              });

              updateState(state => {
                  const newState = { ...state };
                  newState.projects = { ...newState.projects, ...importedState.projects };
                  newState.exerciseSets = { ...newState.exerciseSets, ...importedState.exerciseSets };
                  newState.exerciseSteps = { ...newState.exerciseSteps, ...importedState.exerciseSteps };
                  newState.beepCodes = { ...newState.beepCodes, ...importedState.beepCodes };
                  return newState;
              });

          } catch (err) {
              console.error("Import failed", err);
              alert("Import failed: " + err.message);
          }
      };
      input.click();
  }

  render() {
    this.container = createElement('div', 'view');
    this.refresh();
    return this.container;
  }

  refresh() {
    this.container.innerHTML = '';

    // Header
    const header = NavBar({
      title: 'Projects',
      rightAction: {
        label: '+',
        ariaLabel: 'Create New Project',
        onClick: () => this.createNewProject()
      }
    });

    // Content
    const content = createElement('div', 'view-content');

    const projects = Object.values(this.state.projects || {});

    if (projects.length === 0) {
      content.appendChild(createElement('div', 'empty-state', {},
        "No projects yet. Tap '+' to create one.",
        createElement('br'), createElement('br'),
        Button({ label: "Create Sample", onClick: () => this.createSample(), type: 'secondary' })
      ));
    } else {
      const listItems = projects.map(p => {
        let subtitle = p.description;
        if (p.createdAt) {
            try {
                const dateStr = new Date(p.createdAt).toLocaleDateString();
                subtitle = subtitle ? `${subtitle} • ${dateStr}` : dateStr;
            } catch (e) {
                // Ignore date error
            }
        }

        return ListItem({
          title: p.name,
          subtitle: subtitle,
          actionButton: {
            label: '▶',
            ariaLabel: `Play ${p.name}`,
            onClick: () => Router.navigate(`/player/${p.id}`)
          },
          onClick: () => Router.navigate(`/project/${p.id}`)
        });
      });
      content.appendChild(ListGroup(listItems));
    }

    content.appendChild(createElement('br'));
    content.appendChild(Button({
        label: "Import Project (ZIP)",
        onClick: () => this.importProject(),
        type: 'secondary'
    }));

    // Add Beep Library Link
    const settingsGroup = ListGroup([
        ListItem({ title: "Beep Library", onClick: () => Router.navigate('/beeps') }),
        ListItem({ title: "Settings", onClick: () => Router.navigate('/settings') }),
        ListItem({ title: "Dashboard", onClick: () => Router.navigate('/dashboard') })
    ]);
    content.appendChild(createElement('div', 'form-label', {style: 'margin-top: 20px'}, "App"));
    content.appendChild(settingsGroup);

    this.container.appendChild(header);
    this.container.appendChild(content);
  }

  createSample() {
      // Basic sample project logic for empty state
      this.createNewProject();
  }
}
