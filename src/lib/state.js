import { getAppState, saveAppState } from './storage.js';

const DEFAULT_STATE = {
  schemaVersion: 1,
  settings: {
    volume: 0.8,
    vibrationEnabled: true,
    keepAwake: false,
    theme: 'system', // 'system', 'light', 'dark'
    ttsEnabled: true,
    ttsReadInstructions: false,
    delayTtsBeep: 0.5,
    delayNameInstructions: 0.5,
    delayBeepStart: 0.5,
    autoPopupMediaDelay: 0,
  },
  beepCodes: {},
  projects: {},
  exerciseSets: {},
  exerciseSteps: {},
  mediaAssets: {},
  logs: {},
};

let currentState = null;
let saveTimer = null;
const SAVE_DELAY = 1000;
let listeners = [];

export const initState = async () => {
  const saved = await getAppState();
  currentState = saved || DEFAULT_STATE;
  // Ensure deep structure exists if loading partial state
  currentState = {
      ...DEFAULT_STATE,
      ...currentState,
      settings: {
          ...DEFAULT_STATE.settings,
          ...(currentState.settings || {})
      }
  };
  return currentState;
};

export const getState = () => currentState;

export const subscribe = (listener) => {
    listeners.push(listener);
    return () => {
        listeners = listeners.filter(l => l !== listener);
    }
}

const notifyListeners = () => {
    listeners.forEach(l => l(currentState));
}

export const updateState = (updater) => {
  const newState = updater(currentState); // Assume updater returns the new state or mutates
  // If updater returns something, use it. If it mutates in place (not recommended but possible), rely on that.
  if (newState) {
      currentState = newState;
  }

  notifyListeners();
  scheduleSave();
  return currentState;
}

const scheduleSave = () => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveAppState(currentState);
  }, SAVE_DELAY);
};
