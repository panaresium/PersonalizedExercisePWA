import { getState, updateState, subscribe } from '../lib/state.js';
import { Router } from '../lib/router.js';
import { NavBar, ListGroup, ListItem, Button, Modal, createElement } from '../components/ui.js';
import { generateId } from '../lib/utils.js';
import { createExportPackage } from '../lib/zip-manager.js';
import { serializeProjectToXml } from '../lib/xml-parser.js';
import { loadMedia } from '../lib/storage.js';

export class ProjectEditorView {
  constructor(params) {
    this.projectId = params.id;
    this.state = getState();
    this.project = this.state.projects[this.projectId];
    this.unsubscribe = null;
    this.showDeleteModal = false;
  }

  onMount() {
    this.unsubscribe = subscribe((newState) => {
      this.state = newState;
      this.project = this.state.projects[this.projectId];
      this.refresh();
    });
  }

  onUnmount() {
    if (this.unsubscribe) this.unsubscribe();
  }

  updateProject(updates) {
    updateState(state => {
      const newState = { ...state };
      newState.projects[this.projectId] = { ...newState.projects[this.projectId], ...updates };
      return newState;
    });
  }

  addSet() {
    const newSetId = generateId();
    updateState(state => {
      const newState = { ...state };
      // Create Set
      newState.exerciseSets[newSetId] = {
        id: newSetId,
        title: "New Set",
        mode: "STEP_SEQUENCE",
        rounds: 1,
        restBetweenRoundsSec: 30,
        stepIds: []
      };
      // Add to Project
      const project = newState.projects[this.projectId];
      project.exerciseSetIds = [...(project.exerciseSetIds || []), newSetId];
      return newState;
    });
  }

  deleteProject() {
      this.showDeleteModal = true;
      this.refresh();
  }

  confirmDelete() {
      updateState(state => {
          const newState = { ...state };
          delete newState.projects[this.projectId];
          // Should cleanup sets/steps/media too
          return newState;
      });
      Router.navigate('/');
  }

  duplicateProject() {
      const newProjectId = generateId();
      updateState(state => {
          const newState = { ...state };

          // Deep clone project
          const originalProject = newState.projects[this.projectId];
          if (!originalProject) return newState; // Should not happen

          const newProject = JSON.parse(JSON.stringify(originalProject));
          newProject.id = newProjectId;
          newProject.name = `Copy of ${newProject.name}`;
          newProject.createdAt = new Date().toISOString();
          newProject.exerciseSetIds = [];

          newState.projects[newProjectId] = newProject;

          // Clone sets and steps
          (originalProject.exerciseSetIds || []).forEach(setId => {
              const originalSet = newState.exerciseSets[setId];
              if (!originalSet) return;

              const newSetId = generateId();
              const newSet = JSON.parse(JSON.stringify(originalSet));
              newSet.id = newSetId;
              newSet.stepIds = [];

              newState.exerciseSets[newSetId] = newSet;
              newProject.exerciseSetIds.push(newSetId);

              // Clone steps
              (originalSet.stepIds || []).forEach(stepId => {
                  const originalStep = newState.exerciseSteps[stepId];
                  if (!originalStep) return;

                  const newStepId = generateId();
                  const newStep = JSON.parse(JSON.stringify(originalStep));
                  newStep.id = newStepId;

                  newState.exerciseSteps[newStepId] = newStep;
                  newSet.stepIds.push(newStepId);
              });
          });

          return newState;
      });
      Router.navigate(`/project/${newProjectId}`);
  }

  async exportProject() {
      try {
          // Serialize XML
          const xml = serializeProjectToXml(this.projectId, this.state);

          // Collect Media
          // Iterate all steps to find media
          // This is expensive, but necessary
          const mediaFiles = [];
          const project = this.state.projects[this.projectId];
          for (const setId of project.exerciseSetIds) {
              const set = this.state.exerciseSets[setId];
              if (!set) continue;
              for (const stepId of set.stepIds) {
                  const step = this.state.exerciseSteps[stepId];
                  if (step && step.media && step.media.path) {
                       const blob = await loadMedia(step.media.path);
                       if (blob) {
                           // Determine filename for ZIP
                           const filename = step.media.filename || `step_${step.id}.gif`;
                           mediaFiles.push({ filename, blob });
                       }
                  }
              }
          }

          const zipBlob = await createExportPackage(xml, mediaFiles);

          // Download
          const url = URL.createObjectURL(zipBlob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${this.project.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.zip`;
          a.click();
          URL.revokeObjectURL(url);
      } catch (e) {
          console.error("Export failed", e);
          alert("Export failed: " + e.message);
      }
  }

  render() {
    this.container = createElement('div', 'view');
    this.refresh();
    return this.container;
  }

  refresh() {
    this.container.innerHTML = '';
    if (!this.project) {
        this.container.textContent = "Project not found";
        return;
    }

    // Header
    const header = NavBar({
      title: 'Edit Project',
      leftAction: { label: 'Projects', onClick: () => Router.navigate('/') },
      rightAction: { label: 'Play', onClick: () => Router.navigate(`/player/${this.projectId}`) }
    });

    const content = createElement('div', 'view-content');

    // Metadata Form
    const nameInput = createElement('input', 'form-input', {
        value: this.project.name,
        onChange: (e) => this.updateProject({ name: e.target.value }),
        placeholder: "Project Name"
    });

    const descInput = createElement('textarea', 'form-textarea', {
        value: this.project.description || '',
        onChange: (e) => this.updateProject({ description: e.target.value }),
        placeholder: "Description"
    });

    content.appendChild(createElement('div', 'form-group', {},
        createElement('label', 'form-label', {}, "Project Details"),
        nameInput,
        descInput
    ));

    // Sets List
    content.appendChild(createElement('div', 'form-label', {}, "Exercise Sets"));

    const sets = (this.project.exerciseSetIds || []).map(setId => this.state.exerciseSets[setId]).filter(Boolean);

    if (sets.length === 0) {
        content.appendChild(createElement('div', 'empty-state', {}, "No exercise sets."));
    } else {
        const listItems = sets.map((set, index) => ListItem({
            title: `${index + 1}. ${set.title}`,
            subtitle: `${set.mode} • ${set.rounds} round(s)`,
            onClick: () => Router.navigate(`/project/${this.projectId}/set/${set.id}`)
        }));
        content.appendChild(ListGroup(listItems));
    }

    content.appendChild(Button({
        label: "Add Exercise Set",
        onClick: () => this.addSet(),
        type: 'secondary'
    }));

    content.appendChild(createElement('br'));

    content.appendChild(Button({
        label: "Duplicate Project",
        onClick: () => this.duplicateProject(),
        type: 'secondary'
    }));

    content.appendChild(Button({
        label: "Export Project (ZIP)",
        onClick: () => this.exportProject(),
        type: 'secondary'
    }));

    // Danger Zone
    content.appendChild(createElement('br'));
    content.appendChild(Button({
        label: "Delete Project",
        onClick: () => this.deleteProject(),
        type: 'destructive'
    }));

    this.container.appendChild(header);
    this.container.appendChild(content);

    if (this.showDeleteModal) {
        const modal = Modal({
            title: "Delete Project",
            children: [
                createElement('p', '', {}, "Are you sure you want to delete this project? This action cannot be undone.")
            ],
            onCancel: () => {
                this.showDeleteModal = false;
                this.refresh();
            },
            onConfirm: () => this.confirmDelete(),
            confirmLabel: "Delete",
            cancelLabel: "Cancel"
        });
        // Style the confirm button as destructive
        const confirmBtn = modal.querySelector('.btn-primary');
        if (confirmBtn) {
            confirmBtn.className = confirmBtn.className.replace('btn-primary', 'btn-destructive');
        }
        this.container.appendChild(modal);
    }
  }
}
