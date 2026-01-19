const DB_NAME = "exercise_app";
const DB_VERSION = 1;
const KV_STORE = "kv";
const MEDIA_STORE = "media";
const APP_STATE_KEY = "app_state";
const SAVE_DELAY_MS = 800;

const storageStatus = document.getElementById("storage-status");
const createSampleButton = document.getElementById("create-sample");
const exportSampleButton = document.getElementById("export-sample");
const startAudioButton = document.getElementById("start-audio");
const projectList = document.getElementById("project-list");
const beepList = document.getElementById("beep-list");

let dbPromise;
let saveTimer;
let appState;
let audioContext;
let audioEnabled = false;

const createDefaultState = () => ({
  schemaVersion: 1,
  settings: {
    volume: 0.8,
    vibrationEnabled: true,
    keepAwake: false,
  },
  beepCodes: {},
  projects: {},
  exerciseSets: {},
  exerciseSteps: {},
  mediaAssets: {},
  logs: {},
});

const ensureAudioContext = async () => {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }
  audioEnabled = true;
};

const scheduleBeep = (startTime, durationMs, volume) => {
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.type = "sine";
  osc.frequency.value = 880;
  gain.gain.value = volume;
  osc.connect(gain).connect(audioContext.destination);
  osc.start(startTime);
  osc.stop(startTime + durationMs / 1000);
};

const parseBeepPattern = (pattern) => {
  const tokens = pattern.split(" ").filter(Boolean);
  return tokens.map((token) => {
    if (token === "S") {
      return { type: "beep", durationMs: 120 };
    }
    if (token === "L") {
      return { type: "beep", durationMs: 500 };
    }
    const pauseMatch = token.match(/^P\((\d+)\)$/);
    if (pauseMatch) {
      return { type: "pause", durationMs: Number(pauseMatch[1]) };
    }
    return { type: "pause", durationMs: 0 };
  });
};

const playBeepPattern = async (pattern) => {
  if (!audioEnabled) {
    return;
  }
  const timeline = parseBeepPattern(pattern);
  const start = audioContext.currentTime + 0.05;
  let cursor = start;
  timeline.forEach((entry) => {
    if (entry.type === "beep") {
      scheduleBeep(cursor, entry.durationMs, appState.settings.volume);
    }
    cursor += entry.durationMs / 1000;
  });
};

const openDatabase = () => {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(KV_STORE)) {
        db.createObjectStore(KV_STORE);
      }
      if (!db.objectStoreNames.contains(MEDIA_STORE)) {
        db.createObjectStore(MEDIA_STORE);
      }
    };

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });

  return dbPromise;
};

const readFromStore = async (storeName, key) => {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const request = store.get(key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
};

const writeToStore = async (storeName, key, value) => {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const request = store.put(value, key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
};

const loadAppState = async () => {
  const storedState = await readFromStore(KV_STORE, APP_STATE_KEY);
  if (storedState) {
    return storedState;
  }
  const defaultState = createDefaultState();
  await writeToStore(KV_STORE, APP_STATE_KEY, defaultState);
  return defaultState;
};

const scheduleSave = () => {
  if (saveTimer) {
    clearTimeout(saveTimer);
  }
  saveTimer = setTimeout(async () => {
    await writeToStore(KV_STORE, APP_STATE_KEY, appState);
  }, SAVE_DELAY_MS);
};

const updateState = (updater) => {
  appState = updater({ ...appState });
  scheduleSave();
  renderProjects();
  renderBeeps();
};

const getOpfsRoot = async () => {
  if (!navigator.storage || !navigator.storage.getDirectory) {
    return null;
  }
  return navigator.storage.getDirectory();
};

const writeMediaToOpfs = async (relativePath, blob) => {
  const root = await getOpfsRoot();
  if (!root) {
    return false;
  }

  const segments = relativePath.split("/").filter(Boolean);
  let current = root;
  for (let i = 0; i < segments.length - 1; i += 1) {
    current = await current.getDirectoryHandle(segments[i], { create: true });
  }
  const fileHandle = await current.getFileHandle(segments[segments.length - 1], {
    create: true,
  });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
  return true;
};

const readMediaFromOpfs = async (relativePath) => {
  const root = await getOpfsRoot();
  if (!root) {
    return null;
  }

  const segments = relativePath.split("/").filter(Boolean);
  let current = root;
  for (let i = 0; i < segments.length - 1; i += 1) {
    current = await current.getDirectoryHandle(segments[i]);
  }
  const fileHandle = await current.getFileHandle(segments[segments.length - 1]);
  const file = await fileHandle.getFile();
  return file;
};

const storeMedia = async (relativePath, blob) => {
  const storedInOpfs = await writeMediaToOpfs(relativePath, blob);
  if (!storedInOpfs) {
    await writeToStore(MEDIA_STORE, relativePath, blob);
  }
  return { path: relativePath, storedInOpfs };
};

const readMedia = async (relativePath, storedInOpfs) => {
  if (storedInOpfs) {
    return readMediaFromOpfs(relativePath);
  }
  return readFromStore(MEDIA_STORE, relativePath);
};

const createBeepCode = (id, label, pattern) => ({
  id,
  label,
  pattern,
});

const createSampleProject = () => {
  const projectId = crypto.randomUUID();
  const setId = crypto.randomUUID();
  const stepId = crypto.randomUUID();

  updateState((state) => {
    const nextState = { ...state };
    nextState.beepCodes = {
      ...nextState.beepCodes,
      shortDouble: createBeepCode("shortDouble", "2 Short", "S P(120) S"),
      longShort: createBeepCode("longShort", "Long + Short", "L P(120) S"),
    };
    nextState.projects = {
      ...nextState.projects,
      [projectId]: {
        id: projectId,
        name: "Sample Mobility",
        description: "Quick mobility warm-up",
        suggestedInfo: "Try adding 1 round if RPE stays below 6.",
        exerciseSetIds: [setId],
      },
    };
    nextState.exerciseSets = {
      ...nextState.exerciseSets,
      [setId]: {
        id: setId,
        title: "Mobility Flow",
        mode: "STEP_SEQUENCE",
        rounds: 2,
        restBetweenRoundsSec: 30,
        stepIds: [stepId],
      },
    };
    nextState.exerciseSteps = {
      ...nextState.exerciseSteps,
      [stepId]: {
        id: stepId,
        name: "Cat/Cow",
        instructions: "Slowly move through cat and cow positions.",
        durationSec: 45,
        beep: {
          onStart: "shortDouble",
          onEnd: "shortDouble",
          interval: "shortDouble",
          intervalSec: 15,
          countdown: "longShort",
          countdownFromSec: 10,
        },
      },
    };
    return nextState;
  });
};

const renderBeeps = () => {
  beepList.innerHTML = "";
  const beepCodes = Object.values(appState.beepCodes);
  if (beepCodes.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "No beep codes yet.";
    beepList.append(empty);
    return;
  }

  beepCodes.forEach((code) => {
    const item = document.createElement("li");
    const title = document.createElement("strong");
    title.textContent = `${code.label} (${code.pattern})`;
    const actions = document.createElement("div");
    actions.className = "beep-actions";
    const previewButton = document.createElement("button");
    previewButton.textContent = "Preview";
    previewButton.addEventListener("click", () => {
      playBeepPattern(code.pattern);
    });
    actions.append(previewButton);
    item.append(title, actions);
    beepList.append(item);
  });
};

const renderProjects = () => {
  projectList.innerHTML = "";
  const projects = Object.values(appState.projects);
  if (projects.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "No projects yet.";
    projectList.append(empty);
    exportSampleButton.disabled = true;
    return;
  }

  projects.forEach((project) => {
    const item = document.createElement("li");
    item.innerHTML = `<strong>${project.name}</strong><br />${project.description}`;
    projectList.append(item);
  });
  exportSampleButton.disabled = false;
};

const serializeProjectToXml = (project) => {
  const doc = document.implementation.createDocument("", "ProjectExport");
  const root = doc.documentElement;
  root.setAttribute("version", "1.0");

  const projectEl = doc.createElement("Project");
  projectEl.setAttribute("id", project.id);

  const nameEl = doc.createElement("Name");
  nameEl.textContent = project.name;
  projectEl.append(nameEl);

  const descriptionEl = doc.createElement("Description");
  descriptionEl.textContent = project.description || "";
  projectEl.append(descriptionEl);

  const beepLibraryEl = doc.createElement("BeepLibrary");
  Object.values(appState.beepCodes).forEach((beepCode) => {
    const beepCodeEl = doc.createElement("BeepCode");
    beepCodeEl.setAttribute("id", beepCode.id);
    beepCodeEl.setAttribute("label", beepCode.label);
    const patternEl = doc.createElement("Pattern");
    patternEl.textContent = beepCode.pattern;
    beepCodeEl.append(patternEl);
    beepLibraryEl.append(beepCodeEl);
  });
  projectEl.append(beepLibraryEl);

  const setsEl = doc.createElement("ExerciseSets");
  project.exerciseSetIds.forEach((setId, index) => {
    const set = appState.exerciseSets[setId];
    if (!set) {
      return;
    }
    const setEl = doc.createElement("ExerciseSet");
    setEl.setAttribute("id", set.id);
    setEl.setAttribute("order", String(index));
    setEl.setAttribute("mode", set.mode);
    setEl.setAttribute("rounds", String(set.rounds || 1));
    setEl.setAttribute("restBetweenRoundsSec", String(set.restBetweenRoundsSec || 0));

    const titleEl = doc.createElement("Title");
    titleEl.textContent = set.title;
    setEl.append(titleEl);

    const stepsEl = doc.createElement("Steps");
    set.stepIds.forEach((stepId, stepIndex) => {
      const step = appState.exerciseSteps[stepId];
      if (!step) {
        return;
      }
      const stepEl = doc.createElement("Step");
      stepEl.setAttribute("id", step.id);
      stepEl.setAttribute("order", String(stepIndex));

      const stepName = doc.createElement("Name");
      stepName.textContent = step.name;
      stepEl.append(stepName);

      if (step.durationSec) {
        const durationEl = doc.createElement("DurationSec");
        durationEl.textContent = String(step.durationSec);
        stepEl.append(durationEl);
      }

      if (step.instructions) {
        const instructionsEl = doc.createElement("Instructions");
        instructionsEl.textContent = step.instructions;
        stepEl.append(instructionsEl);
      }

      if (step.beep) {
        const beepEl = doc.createElement("Beep");
        if (step.beep.onStart) {
          beepEl.setAttribute("onStart", step.beep.onStart);
        }
        if (step.beep.onEnd) {
          beepEl.setAttribute("onEnd", step.beep.onEnd);
        }
        if (step.beep.interval) {
          beepEl.setAttribute("interval", step.beep.interval);
        }
        if (step.beep.intervalSec) {
          beepEl.setAttribute("intervalSec", String(step.beep.intervalSec));
        }
        if (step.beep.countdown) {
          beepEl.setAttribute("countdown", step.beep.countdown);
        }
        if (step.beep.countdownFromSec) {
          beepEl.setAttribute(
            "countdownFromSec",
            String(step.beep.countdownFromSec)
          );
        }
        stepEl.append(beepEl);
      }

      stepsEl.append(stepEl);
    });

    setEl.append(stepsEl);
    setsEl.append(setEl);
  });
  projectEl.append(setsEl);
  root.append(projectEl);
  return new XMLSerializer().serializeToString(doc);
};

const exportSampleProject = () => {
  const project = Object.values(appState.projects)[0];
  if (!project) {
    return;
  }
  const xml = serializeProjectToXml(project);
  const blob = new Blob([xml], { type: "application/xml" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${project.name.replaceAll(" ", "_")}.xml`;
  link.click();
  URL.revokeObjectURL(url);
};

const registerServiceWorker = async () => {
  if (!("serviceWorker" in navigator)) {
    return;
  }
  await navigator.serviceWorker.register("./service-worker.js");
};

const init = async () => {
  appState = await loadAppState();
  storageStatus.textContent = "Local storage ready.";
  renderProjects();
  renderBeeps();
  await registerServiceWorker();
};

createSampleButton.addEventListener("click", createSampleProject);
exportSampleButton.addEventListener("click", exportSampleProject);
startAudioButton.addEventListener("click", () => {
  ensureAudioContext().then(() => {
    startAudioButton.disabled = true;
    startAudioButton.textContent = "Audio enabled";
  });
});

init().catch((error) => {
  storageStatus.textContent = `Storage error: ${error.message}`;
});

export { readMedia, storeMedia };
