# Personalized Exercise PWA

An offline-first, local-only web application for creating and executing personalized workout routines. Built with vanilla JavaScript, this PWA offers precise timing, text-to-speech guidance, custom audio cues, and rich media support without requiring a backend server.

## Features

### Workout Management
*   **Projects & Sets**: Organize exercises into projects (workouts) containing multiple sets (e.g., Warm-up, Main Circuit, Cooldown).
*   **Step Sequencing**: Define individual steps with specific durations, instructions, and rest periods.
*   **Flexible Structure**: Supports simple sequential steps, time-based loops, and repetition-based sets.

### Advanced Player
*   **Precise Timing**: Uses `requestAnimationFrame` for accurate countdowns and interval tracking.
*   **Audio Cues**:
    *   **TTS (Text-to-Speech)**: Announces exercise names and instructions.
    *   **Custom Beeps**: Assign unique beep patterns to start, stop, interval, and countdown events.
*   **Visual Guidance**: Displays exercise names, next steps, and optional media (GIFs/Images) during the workout.
*   **Background Play**: Designed to continue running audio cues even when the screen is locked (on supported devices/browsers).

### Beep Library
*   **Custom Patterns**: Create your own audio patterns using a simple code (e.g., `S` for Short, `L` for Long, `P(ms)` for Pause).
*   **Reusability**: Define beep codes once and reuse them across different projects and steps.

### Data & Portability
*   **Import/Export**: Share workouts easily via ZIP files.
    *   **Export**: Bundles project XMLs and referenced media into a single ZIP.
    *   **Import**: Drag and drop ZIP files to import multiple projects and their assets simultaneously.
*   **Offline Storage**:
    *   **IndexedDB**: Stores structured data (projects, settings).
    *   **OPFS (Origin Private File System)**: efficiently stores large media files locally.
*   **Privacy Focused**: All data lives on your device. No cloud sync or tracking.

## Running Locally

Since this is a client-side PWA using ES Modules, it must be served via a web server (opening `index.html` directly from the file system will not work due to CORS policies).

### Option 1: Python
If you have Python installed:
```bash
python3 -m http.server
# Open http://localhost:8000
```

### Option 2: Node.js
If you have Node.js installed:
```bash
npx serve .
# Open the URL provided in the terminal
```

### Option 3: VS Code
Use the "Live Server" extension to right-click `index.html` and "Open with Live Server".

## Browser Support
*   Requires a modern browser with support for **ES Modules**, **Web Audio API**, and **SpeechSynthesis**.
*   **OPFS** support is recommended for optimal media performance (Chrome, Edge, Firefox, Safari).

## Tech Stack
*   **Core**: HTML5, CSS3, Vanilla JavaScript (ES6+)
*   **State Management**: Custom centralized store with subscription-based reactivity.
*   **Routing**: Hash-based client-side router.
*   **Storage**: IndexedDB (via `idb` library) & OPFS.
*   **Build**: None required (native ES modules).
