import { getState, subscribe, updateState } from '../lib/state.js';
import { Router } from '../lib/router.js';
import { NavBar, ListItem, ListGroup, createElement, Button } from '../components/ui.js';
import { generateId } from '../lib/utils.js';
import { readImportPackage, createExportPackage } from '../lib/zip-manager.js';
import { parseProjectXml, serializeProjectToXml } from '../lib/xml-parser.js';
import { saveMedia, getMediaBlob } from '../lib/storage.js';
import { ImportPreviewModal, ImportResultModal, ErrorDetailModal } from '../components/import-modals.js';

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
      input.onchange = (e) => this.handleImportFiles(e.target.files);
      input.click();
  }

  async handleImportFiles(files) {
      if (!files || files.length === 0) return;

      try {
          const fileList = Array.from(files);
          const rawData = { xmls: [], mediaFiles: [] };

          for (const file of fileList) {
              if (file.name.toLowerCase().endsWith('.xml')) {
                  rawData.xmls.push({ path: file.name, content: await file.text() });
              } else if (file.name.toLowerCase().endsWith('.zip')) {
                  try {
                      const packageData = await readImportPackage(file);
                      rawData.xmls.push(...packageData.xmls);
                      rawData.mediaFiles.push(...packageData.mediaFiles);
                  } catch (e) {
                      console.error("ZIP read error", e);
                      // Append error to a list? For now just log and continue if possible
                      throw new Error(`Failed to read ZIP ${file.name}: ${e.message}`);
                  }
              }
          }

          if (rawData.xmls.length === 0) {
              throw new Error("No valid project XML files found.");
          }

          const analysis = await this.analyzeImport(rawData);

          this.container.appendChild(ImportPreviewModal({
              projects: analysis.projects.map(p => ({
                  originalName: p.originalName,
                  finalName: p.finalName,
                  mediaFound: p.mediaFound,
                  mediaMissing: p.mediaMissing
              })),
              warnings: analysis.warnings,
              onCancel: () => this.refresh(),
              onConfirm: () => this.executeImport(analysis)
          }));

      } catch (err) {
          console.error("Import preparation failed", err);
          this.container.appendChild(ErrorDetailModal({ error: err, onClose: () => this.refresh() }));
      }
  }

  async analyzeImport(rawData) {
      const projectsToImport = [];
      const warnings = [];

      const existingProjectNames = new Set(Object.values(this.state.projects).map(p => p.name));
      const mediaFiles = rawData.mediaFiles; // [{ path, blob }]

      for (const xmlFile of rawData.xmls) {
          try {
              const fragment = parseProjectXml(xmlFile.content);
              // fragment contains keys: projects, exerciseSets, exerciseSteps, beepCodes
              // parseProjectXml generates new IDs.

              // Find the project object (there should be one per XML usually)
              const projectKeys = Object.keys(fragment.projects);
              if (projectKeys.length === 0) continue;

              const project = fragment.projects[projectKeys[0]];
              const originalName = project.name;

              // 1. Resolve Name Conflict
              let finalName = originalName;
              let suffix = 1;
              while (existingProjectNames.has(finalName)) {
                  finalName = `${originalName} (${suffix})`;
                  suffix++;
              }
              // Mark name as taken for subsequent iterations in this batch
              existingProjectNames.add(finalName);
              project.name = finalName;

              // 2. Map Media
              let mediaFoundCount = 0;
              let mediaMissingCount = 0;
              const mediaToSave = []; // { blob, storageFilename, originalPathInZip, linkedSteps: [step] }

              const steps = Object.values(fragment.exerciseSteps);
              for (const step of steps) {
                  if (step.media && step.media.filename) { // Check filename populated by parseProjectXml
                      const targetFilename = step.media.filename;
                      const xmlPathDir = xmlFile.path.includes('/') ? xmlFile.path.substring(0, xmlFile.path.lastIndexOf('/')) : '';

                      // Heuristic Search
                      let bestMatch = null;
                      const candidates = mediaFiles.filter(m => m.path.endsWith(targetFilename));

                      if (candidates.length === 0) {
                          mediaMissingCount++;
                      } else if (candidates.length === 1) {
                          bestMatch = candidates[0];
                      } else {
                          // Multiple candidates. Prefer same directory.
                          const sameDirMatch = candidates.find(m => {
                               const mDir = m.path.includes('/') ? m.path.substring(0, m.path.lastIndexOf('/')) : '';
                               return mDir === xmlPathDir;
                          });

                          if (sameDirMatch) {
                              bestMatch = sameDirMatch;
                          } else {
                              // Ambiguous. Pick the first one? Or strict?
                              bestMatch = candidates[0];
                          }
                      }

                      if (bestMatch) {
                          mediaFoundCount++;

                          // Check if we already have this filename in `mediaToSave` for this project.
                          const existingSave = mediaToSave.find(m => m.storageFilename === targetFilename);
                          if (existingSave) {
                              if (existingSave.blob !== bestMatch.blob) {
                                  // Conflict: same filename, different content in same project.
                                  // Rename the new one.
                                  const ext = targetFilename.split('.').pop();
                                  const name = targetFilename.substring(0, targetFilename.lastIndexOf('.'));
                                  const newFilename = `${name}_${generateId().substring(0,4)}.${ext}`;

                                  mediaToSave.push({
                                      blob: bestMatch.blob,
                                      storageFilename: newFilename,
                                      originalPath: bestMatch.path,
                                      linkedSteps: [step]
                                  });

                              } else {
                                  // Same blob, same filename. Reuse.
                                  existingSave.linkedSteps.push(step);
                              }
                          } else {
                              mediaToSave.push({
                                  blob: bestMatch.blob,
                                  storageFilename: targetFilename,
                                  originalPath: bestMatch.path,
                                  linkedSteps: [step]
                              });
                          }
                      }
                  }
              }

              projectsToImport.push({
                  originalName,
                  finalName,
                  fragment,
                  mediaToSave,
                  mediaFound: mediaFoundCount,
                  mediaMissing: mediaMissingCount
              });

          } catch (e) {
              warnings.push(`Failed to parse XML ${xmlFile.path}: ${e.message}`);
          }
      }

      return { projects: projectsToImport, warnings };
  }

  async executeImport(analysis) {
      const results = [];
      const mergedState = {
          projects: {},
          exerciseSets: {},
          exerciseSteps: {},
          beepCodes: {}
      };

      // Existing Beep Handling (Deduplication)
      const existingBeepMap = new Map();
      Object.values(this.state.beepCodes || {}).forEach(b => existingBeepMap.set(b.label, b.id));
      const batchBeepMap = new Map();

      for (const item of analysis.projects) {
          try {
              const { fragment, mediaToSave } = item;
              const projectId = fragment.projects[Object.keys(fragment.projects)[0]].id;

              // 1. Save Media
              for (const media of mediaToSave) {
                  try {
                       const { path } = await saveMedia(projectId, 'imported', media.storageFilename, media.blob);

                       // Update linked steps with the actual saved path
                       media.linkedSteps.forEach(step => {
                           step.media.path = path;
                           step.media.filename = media.storageFilename;
                       });

                  } catch (e) {
                      results.push({ type: 'error', message: `Failed to save media ${media.storageFilename}: ${e.message}` });
                  }
              }

              // 2. Deduplicate Beeps for this project
              const idRemap = new Map();
              for (const beepId of Object.keys(fragment.beepCodes)) {
                  const beep = fragment.beepCodes[beepId];
                  const label = beep.label;
                  const existingId = existingBeepMap.get(label) || batchBeepMap.get(label);

                  if (existingId) {
                      idRemap.set(beepId, existingId);
                      delete fragment.beepCodes[beepId];
                  } else {
                      batchBeepMap.set(label, beepId);
                  }
              }

              if (idRemap.size > 0) {
                  Object.values(fragment.exerciseSteps).forEach(step => {
                      if (step.beep) {
                          Object.keys(step.beep).forEach(key => {
                              const val = step.beep[key];
                              if (idRemap.has(val)) {
                                  step.beep[key] = idRemap.get(val);
                              }
                          });
                      }
                  });
              }

              // 3. Merge Data
              Object.assign(mergedState.projects, fragment.projects);
              Object.assign(mergedState.exerciseSets, fragment.exerciseSets);
              Object.assign(mergedState.exerciseSteps, fragment.exerciseSteps);
              Object.assign(mergedState.beepCodes, fragment.beepCodes);

              results.push({ type: 'success', message: `Imported project "${item.finalName}"` });

          } catch (e) {
              results.push({ type: 'error', message: `Failed to import project ${item.finalName}: ${e.message}` });
          }
      }

      analysis.warnings.forEach(w => results.push({ type: 'warning', message: w }));

      // Update Global State
      try {
          updateState(state => {
              const newState = { ...state };
              newState.projects = { ...newState.projects, ...mergedState.projects };
              newState.exerciseSets = { ...newState.exerciseSets, ...mergedState.exerciseSets };
              newState.exerciseSteps = { ...newState.exerciseSteps, ...mergedState.exerciseSteps };
              newState.beepCodes = { ...newState.beepCodes, ...mergedState.beepCodes };
              return newState;
          });
      } catch (e) {
          results.push({ type: 'error', message: `Failed to update app state: ${e.message}` });
      }

      this.refresh();
      this.container.appendChild(ImportResultModal({ results, onClose: () => this.refresh() }));
  }

  async exportAllProjects() {
      const projects = Object.values(this.state.projects || {});
      if (projects.length === 0) return;

      const exportItems = [];

      for (const project of projects) {
          // Generate XML with media paths prefixed by folder
          const mediaFolder = `media/${project.name}_${project.id}`;

          const xmlString = serializeProjectToXml(project.id, this.state, mediaFolder);

          const mediaFiles = [];

          // Gather media files for this project
          const setIds = project.exerciseSetIds || [];
          for (const setId of setIds) {
              const set = this.state.exerciseSets[setId];
              if (!set) continue;
              for (const stepId of set.stepIds || []) {
                  const step = this.state.exerciseSteps[stepId];
                  if (step && step.media && step.media.path) {
                       // Only export if source is FILE or implicit local file
                       const isUrl = step.media.source === 'URL' || (step.media.url && step.media.url.startsWith('http'));
                       if (!isUrl) {
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
