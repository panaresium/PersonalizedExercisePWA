import { getState, subscribe, updateState } from '../lib/state.js';
import { Router } from '../lib/router.js';
import { NavBar, ListItem, ListGroup, createElement, Button } from '../components/ui.js';
import { generateId } from '../lib/utils.js';
import { readImportPackage, createExportPackage } from '../lib/zip-manager.js';
import { parseProjectXml, serializeProjectToXml } from '../lib/xml-parser.js';
import { saveMedia, getMediaBlob } from '../lib/storage.js';

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
      input.accept = '.zip, .xml';
      input.multiple = true;
      input.onchange = async (e) => {
          if (!e.target.files || e.target.files.length === 0) return;

          try {
              const files = Array.from(e.target.files);
              const mergedState = {
                  projects: {},
                  exerciseSets: {},
                  exerciseSteps: {},
                  beepCodes: {}
              };

              for (const file of files) {
                  let xmls = [];
                  let mediaFiles = [];
                  let isXmlImport = false;

                  if (file.name.toLowerCase().endsWith('.xml')) {
                      xmls = [await file.text()];
                      isXmlImport = true;
                  } else if (file.name.toLowerCase().endsWith('.zip')) {
                      const packageData = await readImportPackage(file);
                      xmls = packageData.xmls;
                      mediaFiles = packageData.mediaFiles;
                  } else {
                      continue; // Skip unknown files
                  }

                  // Parse XMLs first
                  const fileParsedState = {
                      projects: {},
                      exerciseSets: {},
                      exerciseSteps: {},
                      beepCodes: {}
                  };

                  for (const xml of xmls) {
                      const fragment = parseProjectXml(xml);
                      Object.assign(fileParsedState.projects, fragment.projects);
                      Object.assign(fileParsedState.exerciseSets, fragment.exerciseSets);
                      Object.assign(fileParsedState.exerciseSteps, fragment.exerciseSteps);
                      Object.assign(fileParsedState.beepCodes, fragment.beepCodes);
                  }

                  // Handle Media (ZIP only)
                  const mediaMap = new Map(); // zipRelativePath -> savedLocalStoragePath
                  if (!isXmlImport && mediaFiles && mediaFiles.length > 0) {
                      await Promise.all(mediaFiles.map(async ({ filename, blob }) => {
                          const parts = filename.split('/');
                          let assetId = 'shared';
                          let finalFilename = parts.pop();

                          if (parts.length > 1) {
                              assetId = parts[1];
                          }

                          const { path } = await saveMedia('imported', assetId, finalFilename, blob);
                          mediaMap.set(filename, path);
                      }));
                  }

                  // Patch media paths in steps
                  Object.values(fileParsedState.exerciseSteps).forEach(step => {
                      if (isXmlImport) {
                          // XML Import: Keep media if it's external (URL), remove local path references if invalid
                          // But wait, if source="URL", we keep it.
                          // If source="FILE", we delete it because we don't have the file.
                          // However, some users might import XML referencing local files they plan to add later?
                          // Current logic: Delete if strictly local file ref to avoid broken state, keep if URL.
                          if (step.media) {
                               const isUrl = step.media.source === 'URL' || (step.media.url && step.media.url.startsWith('http'));
                               if (!isUrl) {
                                   if (step.media.source === 'FILE' || step.media.path || step.media.filename) {
                                       delete step.media;
                                   }
                               }
                          }
                      } else {
                          // ZIP Import: Patch paths
                          if (step.media && step.media.path) {
                               let savedPath = mediaMap.get(step.media.path);

                               if (!savedPath && step.media.filename) {
                                   for (const [zipPath, storagePath] of mediaMap.entries()) {
                                       if (zipPath.endsWith(step.media.filename)) {
                                           savedPath = storagePath;
                                           break;
                                       }
                                   }
                               }

                               if (savedPath) {
                                   step.media.path = savedPath;
                               } else if (step.media.source === 'FILE') {
                                   console.warn("Missing media for step", step.id, step.media);
                               }
                          }
                      }
                  });

                  // Merge into main accumulator
                  Object.assign(mergedState.projects, fileParsedState.projects);
                  Object.assign(mergedState.exerciseSets, fileParsedState.exerciseSets);
                  Object.assign(mergedState.exerciseSteps, fileParsedState.exerciseSteps);
                  Object.assign(mergedState.beepCodes, fileParsedState.beepCodes);
              }

              updateState(state => {
                  const newState = { ...state };
                  newState.projects = { ...newState.projects, ...mergedState.projects };
                  newState.exerciseSets = { ...newState.exerciseSets, ...mergedState.exerciseSets };
                  newState.exerciseSteps = { ...newState.exerciseSteps, ...mergedState.exerciseSteps };
                  newState.beepCodes = { ...newState.beepCodes, ...mergedState.beepCodes };
                  return newState;
              });

          } catch (err) {
              console.error("Import failed", err);
              alert("Import failed: " + err.message);
          }
      };
      input.click();
  }

  async exportAllProjects() {
      const projects = Object.values(this.state.projects || {});
      if (projects.length === 0) return;

      const exportItems = [];

      for (const project of projects) {
          // Generate XML with media paths prefixed by folder
          const mediaFolder = `media/${project.name}_${project.id}`;

          // We need to pass the mediaFolder to serializeProjectToXml so it generates correct paths
          // But serializeProjectToXml signature might need update or we patch the XML.
          // Let's assume we update serializeProjectToXml in next step.
          // For now, I will assume a new arg 'mediaPrefix'
          const xmlString = serializeProjectToXml(project.id, this.state, mediaFolder);

          const mediaFiles = [];

          // Gather media files for this project
          // We need to look at all steps in this project
          const setIds = project.exerciseSetIds || [];
          for (const setId of setIds) {
              const set = this.state.exerciseSets[setId];
              if (!set) continue;
              for (const stepId of set.stepIds || []) {
                  const step = this.state.exerciseSteps[stepId];
                  if (step && step.media && step.media.path && step.media.source === 'FILE') {
                      // Load blob
                      try {
                          const blob = await getMediaBlob(step.media.path);
                          if (blob) {
                              const filename = step.media.filename || step.media.path.split('/').pop();
                              // Path in ZIP
                              const zipPath = `${mediaFolder}/${filename}`;
                              mediaFiles.push({ path: zipPath, blob });
                          }
                      } catch (e) {
                          console.warn("Failed to load media for export", step.media.path);
                      }
                  }
              }
          }

          exportItems.push({
              filename: `${project.name}.xml`, // Root XML
              xmlString,
              mediaFiles
          });
      }

      const zipBlob = await createExportPackage(exportItems);

      // Download
      const a = document.createElement('a');
      a.href = URL.createObjectURL(zipBlob);
      a.download = `Projects_Export_${new Date().toISOString().slice(0,10)}.zip`;
      a.click();
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
        label: "Import Project (ZIP/XML)",
        onClick: () => this.importProject(),
        type: 'secondary'
    }));

    content.appendChild(createElement('span', null, { style: 'margin: 0 5px' })); // spacer

    content.appendChild(Button({
        label: "Export All (ZIP)",
        onClick: () => this.exportAllProjects(),
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
