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
      input.onchange = async (e) => {
          const file = e.target.files[0];
          if (!file) return;

          try {
              let xmls = [];
              let mediaFiles = [];
              let isXmlImport = false;

              if (file.name.toLowerCase().endsWith('.xml')) {
                  xmls = [await file.text()];
                  isXmlImport = true;
              } else {
                  const packageData = await readImportPackage(file);
                  xmls = packageData.xmls;
                  mediaFiles = packageData.mediaFiles;
              }

              const mergedState = {
                  projects: {},
                  exerciseSets: {},
                  exerciseSteps: {},
                  beepCodes: {}
              };

              // Process each XML
              for (const xml of xmls) {
                  const importedState = parseProjectXml(xml);
                  Object.assign(mergedState.projects, importedState.projects);
                  Object.assign(mergedState.exerciseSets, importedState.exerciseSets);
                  Object.assign(mergedState.exerciseSteps, importedState.exerciseSteps);
                  Object.assign(mergedState.beepCodes, importedState.beepCodes);
              }

              // Process Media if present (ZIP import)
              // We need a way to map the paths in the ZIP to the paths in the parsed state
              // The `parseProjectXml` extracts path from XML.
              // In the new ZIP structure, XML says: path="media/ProjectName/img.png"
              // ZIP contains: "media/ProjectName/img.png"
              // `readImportPackage` returns mediaFiles with filename="media/ProjectName/img.png"
              // So the mapping key is the filename/path relative to ZIP root.

              const mediaMap = new Map(); // zipRelativePath -> savedLocalStoragePath

              if (!isXmlImport && mediaFiles && mediaFiles.length > 0) {
                  // We treat 'filename' from readImportPackage as the full relative path
                  await Promise.all(mediaFiles.map(async ({ filename, blob }) => {
                      // Use folder structure to derive asset ID if possible to prevent collisions
                      // Expected format: "media/ProjectName_ID/file.png"
                      const parts = filename.split('/');
                      let assetId = 'shared';
                      let finalFilename = parts.pop();

                      if (parts.length > 1) {
                          // parts[0] is 'media', parts[1] is 'ProjectName_ID'
                          assetId = parts[1];
                      }

                      const { path } = await saveMedia('imported', assetId, finalFilename, blob);
                      mediaMap.set(filename, path);
                  }));
              }

              // Patch media paths in steps
              Object.values(mergedState.exerciseSteps).forEach(step => {
                  if (isXmlImport) {
                      // If XML import, remove local media references
                      if (step.media) {
                          if (step.media.source === 'FILE' || step.media.path || step.media.filename) {
                              delete step.media;
                          }
                      }
                  } else {
                      // ZIP import: patch paths
                      // The step.media.path from parseProjectXml comes from the XML attribute.
                      // e.g., "media/Project/file.png"
                      if (step.media && step.media.path) {
                           // Try to match exact path
                           let savedPath = mediaMap.get(step.media.path);

                           // Fallback: If legacy XML used "media/file.png" but we have just "file.png" or vice versa
                           if (!savedPath && step.media.filename) {
                               // Try matching by filename in the list of imported media
                               // This is a bit loose but helps with backward compatibility or structure mismatches
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
                               // Media missing in ZIP
                               console.warn("Missing media for step", step.id, step.media);
                           }
                      }
                  }
              });

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
