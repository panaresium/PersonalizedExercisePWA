import { generateId } from './utils.js';

export const serializeProjectToXml = (projectId, state, mediaPrefix = 'media') => {
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
                     mediaEl.setAttribute("path", `${mediaPrefix}/${step.media.filename}`);
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
    // Sanitize input: Use Regex to extract the XML block
    const codeBlockMatch = xmlString.match(/```(?:xml)?\s*([\s\S]*?)\s*```/i);
    if (codeBlockMatch) {
        xmlString = codeBlockMatch[1];
    }

    // Find the first tag that looks like our root.
    const rootMatch = xmlString.match(/<(ProjectExport|Project)\b[\s\S]*<\/\1>/);
    if (rootMatch) {
        xmlString = rootMatch[0];
    }

    xmlString = xmlString.trim();

    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, "application/xml");

    // Check for parser errors
    const parserError = doc.querySelector("parsererror");
    if (parserError) {
        throw new Error(`XML Parse Error: ${parserError.textContent}`);
    }

    const oldIdMap = new Map();
    const getNewId = (oldId) => {
        if (!oldId || oldId.trim() === '') return generateId();
        if (!oldIdMap.has(oldId)) oldIdMap.set(oldId, generateId());
        return oldIdMap.get(oldId);
    }

    const projectEl = doc.querySelector("Project");

    if (projectEl) {
        return parseStandardProject(projectEl, getNewId, oldIdMap);
    }

    // Fallback: Check for Metadata/ExerciseLibrary at root (or under ProjectExport)
    const metadataEl = doc.querySelector("Metadata");
    const exerciseLibEl = doc.querySelector("ExerciseLibrary");

    if (metadataEl || exerciseLibEl) {
        return parseFlatProject(doc, getNewId, oldIdMap);
    }

    throw new Error("Invalid XML: Could not find <Project> element, nor a valid alternative structure (Metadata + ExerciseLibrary). Please check your XML format.");
};

const parseStandardProject = (projectEl, getNewId, oldIdMap) => {
    const newState = {
        projects: {},
        exerciseSets: {},
        exerciseSteps: {},
        beepCodes: {}
    };

    // Project
    const projectId = getNewId(projectEl.getAttribute("id"));

    // Resolve Name
    let name = projectEl.getAttribute("name");
    if (!name) {
        const directName = Array.from(projectEl.children).find(el => el.tagName === "Name");
        name = directName ? directName.textContent : (projectEl.querySelector("Name")?.textContent);
    }
    name = name || "Imported Project";

    // Resolve Description
    let description = projectEl.getAttribute("description");
    if (!description) {
        const directDesc = Array.from(projectEl.children).find(el => ["Description", "Summary"].includes(el.tagName));
        description = directDesc ? directDesc.textContent : (projectEl.querySelector("Description")?.textContent || projectEl.querySelector("Summary")?.textContent);
    }
    description = description || "";

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

                    // Parse Step
                    newState.exerciseSteps[stepId] = parseStep(stepEl, getNewId, oldIdMap, projectId);
                });
            }
        });
    }

    return newState;
};

const parseFlatProject = (doc, getNewId, oldIdMap) => {
    const newState = {
        projects: {},
        exerciseSets: {},
        exerciseSteps: {},
        beepCodes: {}
    };

    const projectId = getNewId("imported_project");

    // Extract Metadata
    let name = "Imported Project";
    let description = "";

    const metadataEl = doc.querySelector("Metadata");
    if (metadataEl) {
        const titleEl = metadataEl.querySelector("Title");
        if (titleEl) name = titleEl.textContent;

        const descEl = metadataEl.querySelector("Description");
        if (descEl) description = descEl.textContent;
    }

    newState.projects[projectId] = {
        id: projectId,
        name: name,
        description: description,
        exerciseSetIds: []
    };

    // Extract Beeps (Handle <Beep> alias for <BeepCode>, and Name child for label)
    const beepLibrary = doc.querySelector("BeepLibrary");
    if (beepLibrary) {
        // Look for both BeepCode and Beep tags
        const beepEls = [...beepLibrary.querySelectorAll("BeepCode"), ...beepLibrary.querySelectorAll("Beep")];
        beepEls.forEach(beepEl => {
            const oldBeepId = beepEl.getAttribute("id");
            // Label: attribute 'label' OR child <Name>
            let label = beepEl.getAttribute("label");
            if (!label) {
                const nameChild = beepEl.querySelector("Name");
                if (nameChild) label = nameChild.textContent;
            }
            const pattern = beepEl.querySelector("Pattern")?.textContent;

            const newBeepId = getNewId(oldBeepId);
            newState.beepCodes[newBeepId] = {
                id: newBeepId,
                label: label || oldBeepId,
                pattern
            };
        });
    }

    // Create a default Set
    const setId = getNewId("default_set");
    newState.projects[projectId].exerciseSetIds.push(setId);
    newState.exerciseSets[setId] = {
        id: setId,
        title: "Main Workout",
        mode: "STEP_SEQUENCE",
        rounds: 1,
        restBetweenRoundsSec: 0,
        stepIds: []
    };

    // Extract Exercises as Steps
    const exerciseLibrary = doc.querySelector("ExerciseLibrary");
    if (exerciseLibrary) {
        const exercises = exerciseLibrary.querySelectorAll("Exercise");
        exercises.forEach((exEl, index) => {
            const stepId = getNewId(exEl.getAttribute("id"));
            newState.exerciseSets[setId].stepIds.push(stepId);

            // Mapping Exercise -> Step
            // Name -> Name
            // Description -> Instructions
            // DurationSec -> DurationSec (if missing, default to 30)

            const name = exEl.querySelector("Name")?.textContent || "Untitled Exercise";

            // Description -> Instructions
            // Also check for Instructions tag just in case
            let instructions = exEl.querySelector("Instructions")?.textContent;
            if (!instructions) {
                instructions = exEl.querySelector("Description")?.textContent || "";
            }

            // Duration
            let durationSec = 30; // Default
            const durEl = exEl.querySelector("DurationSec") || exEl.querySelector("Duration") || exEl.querySelector("Time");
            if (durEl) {
                durationSec = parseInt(durEl.textContent);
            }

            // Beeps
            const beepRefEl = exEl.querySelector("Beep");
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

            // Media
            let mediaObj = undefined;
            const mediaEl = exEl.querySelector("Media");
            if (mediaEl) {
                 const path = mediaEl.getAttribute("path");
                 const url = mediaEl.getAttribute("url");
                 const source = mediaEl.getAttribute("source") || (path ? 'FILE' : (url ? 'URL' : null));

                 mediaObj = {
                     type: mediaEl.getAttribute("type") || 'GIF',
                     frameDurationSec: parseFloat(mediaEl.getAttribute("frameDurationSec") || 0.1),
                     loop: mediaEl.getAttribute("loop") !== "false",
                     source: source,
                     url: url || null
                 };

                 if (path) {
                    const filename = path.split('/').pop();
                    // Use projectId in path
                    const localPath = `opfs://${projectId}/imported/${filename}`;
                    mediaObj.path = localPath;
                    mediaObj.filename = filename;
                 }
            }

            newState.exerciseSteps[stepId] = {
                id: stepId,
                name,
                durationSec,
                instructions,
                beep: beepRefs,
                media: mediaObj
            };
        });
    }

    return newState;
}

// Helper to parse a single step (refactored from original)
const parseStep = (stepEl, getNewId, oldIdMap, projectId) => {
    const stepId = getNewId(stepEl.getAttribute("id"));

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

    let mediaObj = undefined;
    const mediaEl = stepEl.querySelector("Media");
    if (mediaEl) {
        const path = mediaEl.getAttribute("path");
        const url = mediaEl.getAttribute("url");
        const source = mediaEl.getAttribute("source") || (path ? 'FILE' : (url ? 'URL' : null));

        mediaObj = {
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
    }

    return {
        id: stepId,
        name: stepEl.querySelector("Name")?.textContent || "Untitled Step",
        durationSec: parseInt(stepEl.querySelector("DurationSec")?.textContent || 0),
        instructions: stepEl.querySelector("Instructions")?.textContent || "",
        beep: beepRefs,
        media: mediaObj
    };
};
