import { generateId } from './utils.js';

export const serializeProjectToXml = (projectId, state) => {
    const project = state.projects[projectId];
    if (!project) return null;

    const doc = document.implementation.createDocument("", "ProjectExport");
    const root = doc.documentElement;
    root.setAttribute("version", "1.0");

    // Project
    const projectEl = doc.createElement("Project");
    projectEl.setAttribute("id", project.id);

    const nameEl = doc.createElement("Name");
    nameEl.textContent = project.name;
    projectEl.appendChild(nameEl);

    const descEl = doc.createElement("Description");
    descEl.textContent = project.description || "";
    projectEl.appendChild(descEl);

    // Beeps
    const beepLibraryEl = doc.createElement("BeepLibrary");
    Object.values(state.beepCodes || {}).forEach(beep => {
        const beepEl = doc.createElement("BeepCode");
        beepEl.setAttribute("id", beep.id);
        beepEl.setAttribute("label", beep.label);
        const patEl = doc.createElement("Pattern");
        patEl.textContent = beep.pattern;
        beepEl.appendChild(patEl);
        beepLibraryEl.appendChild(beepEl);
    });
    projectEl.appendChild(beepLibraryEl);

    // Exercise Sets
    const setsEl = doc.createElement("ExerciseSets");
    (project.exerciseSetIds || []).forEach((setId, index) => {
        const set = state.exerciseSets[setId];
        if (!set) return;

        const setEl = doc.createElement("ExerciseSet");
        setEl.setAttribute("id", set.id);
        setEl.setAttribute("order", index);
        setEl.setAttribute("mode", set.mode);
        setEl.setAttribute("rounds", set.rounds);
        setEl.setAttribute("restBetweenRoundsSec", set.restBetweenRoundsSec);

        const titleEl = doc.createElement("Title");
        titleEl.textContent = set.title;
        setEl.appendChild(titleEl);

        const stepsEl = doc.createElement("Steps");
        (set.stepIds || []).forEach((stepId, stepIndex) => {
            const step = state.exerciseSteps[stepId];
            if (!step) return;

            const stepEl = doc.createElement("Step");
            stepEl.setAttribute("id", step.id);
            stepEl.setAttribute("order", stepIndex);

            const sNameEl = doc.createElement("Name");
            sNameEl.textContent = step.name;
            stepEl.appendChild(sNameEl);

            if (step.durationSec) {
                const durEl = doc.createElement("DurationSec");
                durEl.textContent = step.durationSec;
                stepEl.appendChild(durEl);
            }

            const instrEl = doc.createElement("Instructions");
            instrEl.textContent = step.instructions || "";
            stepEl.appendChild(instrEl);

            // Beeps
            if (step.beep && Object.keys(step.beep).length > 0) {
                const beepRefEl = doc.createElement("Beep");
                Object.entries(step.beep).forEach(([k, v]) => {
                    if (v) beepRefEl.setAttribute(k, v);
                });
                stepEl.appendChild(beepRefEl);
            }

            // Media
            if (step.media) {
                const mediaEl = doc.createElement("Media");
                if (step.media.type) mediaEl.setAttribute("type", step.media.type);
                if (step.media.frameDurationSec) mediaEl.setAttribute("frameDurationSec", step.media.frameDurationSec);
                if (step.media.loop) mediaEl.setAttribute("loop", step.media.loop);
                if (step.media.url) mediaEl.setAttribute("url", step.media.url);
                if (step.media.source) mediaEl.setAttribute("source", step.media.source);

                if (step.media.filename) {
                     if (step.media.type === 'GIF') {
                         mediaEl.setAttribute("path", `media/${step.media.filename}`);
                     } else {
                         // Fallback / simple handling
                         mediaEl.setAttribute("path", `media/${step.media.filename}`);
                     }
                }
                stepEl.appendChild(mediaEl);
            }

            stepsEl.appendChild(stepEl);
        });
        setEl.appendChild(stepsEl);
        setsEl.appendChild(setEl);
    });
    projectEl.appendChild(setsEl);
    root.appendChild(projectEl);

    return new XMLSerializer().serializeToString(doc);
};

export const parseProjectXml = (xmlString) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, "application/xml");
    const projectEl = doc.querySelector("Project");

    if (!projectEl) throw new Error("Invalid XML: No Project element");

    const newState = {
        projects: {},
        exerciseSets: {},
        exerciseSteps: {},
        beepCodes: {}
    };

    const oldIdMap = new Map();

    const getNewId = (oldId) => {
        if (!oldIdMap.has(oldId)) oldIdMap.set(oldId, generateId());
        return oldIdMap.get(oldId);
    }

    // Project
    const projectId = getNewId(projectEl.getAttribute("id"));
    const name = projectEl.querySelector("Name")?.textContent || "Imported Project";
    const description = projectEl.querySelector("Description")?.textContent || "";

    newState.projects[projectId] = {
        id: projectId,
        name: name,
        description: description,
        exerciseSetIds: []
    };

    // Beeps
    const beepLibrary = projectEl.querySelector("BeepLibrary");
    if (beepLibrary) {
        beepLibrary.querySelectorAll("BeepCode").forEach(beepEl => {
            const oldBeepId = beepEl.getAttribute("id");
            const label = beepEl.getAttribute("label");
            const pattern = beepEl.querySelector("Pattern")?.textContent;

            const newBeepId = getNewId(oldBeepId);
            newState.beepCodes[newBeepId] = {
                id: newBeepId,
                label,
                pattern
            };
        });
    }

    // Sets
    const setsEl = projectEl.querySelector("ExerciseSets");
    if (setsEl) {
        setsEl.querySelectorAll("ExerciseSet").forEach(setEl => {
            const setId = getNewId(setEl.getAttribute("id"));
            newState.projects[projectId].exerciseSetIds.push(setId);

            newState.exerciseSets[setId] = {
                id: setId,
                title: setEl.querySelector("Title")?.textContent || "Untitled Set",
                mode: setEl.getAttribute("mode"),
                rounds: parseInt(setEl.getAttribute("rounds") || 1),
                restBetweenRoundsSec: parseInt(setEl.getAttribute("restBetweenRoundsSec") || 0),
                stepIds: []
            };

            const stepsEl = setEl.querySelector("Steps");
            if (stepsEl) {
                stepsEl.querySelectorAll("Step").forEach(stepEl => {
                    const stepId = getNewId(stepEl.getAttribute("id"));
                    newState.exerciseSets[setId].stepIds.push(stepId);

                    const beepRefEl = stepEl.querySelector("Beep");
                    const beepRefs = {};
                    if (beepRefEl) {
                        for (const attr of beepRefEl.attributes) {
                             const oldBeepId = attr.value;
                             if (["onStart", "onEnd", "interval", "countdown"].includes(attr.name)) {
                                 beepRefs[attr.name] = oldIdMap.get(oldBeepId) || oldBeepId;
                             } else {
                                 beepRefs[attr.name] = attr.value;
                             }
                        }
                    }

                    newState.exerciseSteps[stepId] = {
                        id: stepId,
                        name: stepEl.querySelector("Name")?.textContent || "Untitled Step",
                        durationSec: parseInt(stepEl.querySelector("DurationSec")?.textContent || 0),
                        instructions: stepEl.querySelector("Instructions")?.textContent || "",
                        beep: beepRefs
                    };

                    // Media
                    const mediaEl = stepEl.querySelector("Media");
                    if (mediaEl) {
                        const path = mediaEl.getAttribute("path");
                        const url = mediaEl.getAttribute("url");
                        const source = mediaEl.getAttribute("source") || (path ? 'FILE' : (url ? 'URL' : null));

                        let mediaObj = {
                             type: mediaEl.getAttribute("type") || 'GIF',
                             frameDurationSec: parseFloat(mediaEl.getAttribute("frameDurationSec") || 0.1),
                             loop: mediaEl.getAttribute("loop") !== "false",
                             source: source,
                             url: url || null
                        };

                        if (path) {
                            const filename = path.split('/').pop();
                            const localPath = `opfs://${projectId}/imported/${filename}`;
                            mediaObj.path = localPath;
                            mediaObj.filename = filename;
                        }

                        if (mediaObj.source) {
                            newState.exerciseSteps[stepId].media = mediaObj;
                        }
                    }
                });
            }
        });
    }

    return newState;
};
