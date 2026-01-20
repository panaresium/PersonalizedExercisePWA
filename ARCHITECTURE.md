# Application Architecture

This document provides a technical overview of the "Personalized Exercise" application. It covers the high-level system design, navigation flows, the core player execution engine, data persistence strategies, and the import/export workflows.

## 1. System Overview

The application is a **Progressive Web App (PWA)** built with **Vanilla JavaScript (ES Modules)**. It requires no build step (other than bundling dependencies if needed, though it currently uses CDNs) and runs directly in modern browsers.

*   **Core Stack:** HTML5, CSS3, JavaScript (ES6+).
*   **State Management:** Centralized in-memory store (`state.js`) with subscription-based reactivity.
*   **Storage:** Hybrid model using **IndexedDB** for structured data and **OPFS (Origin Private File System)** for media blobs.
*   **Audio:** Web Audio API for synthesized beeps and `window.speechSynthesis` for TTS.
*   **Architecture Pattern:** Component-based views managed by a lightweight hash-based Router.

## 2. Navigation & User Flow

The application uses a custom `Router` (`src/lib/router.js`) that listens to `hashchange` events. Views are instantiated as classes and rendered into the main `#app` container.

### Route Logic
*   **/**: Projects List (Home)
*   **/project/:id**: Project Editor (Drill down into Sets)
*   **/project/:pid/set/:sid**: Set Editor (Drill down into Steps)
*   **/player/:id**: Workout Player (Execution)

### Navigation Diagram

```mermaid
stateDiagram-v2
    [*] --> ProjectsList: /

    state "Configuration Flow" as Config {
        ProjectsList --> ProjectEditor: Select Project
        ProjectEditor --> SetEditor: Edit Set
        SetEditor --> StepEditor: Edit Step
        StepEditor --> SetEditor: Save/Cancel
        SetEditor --> ProjectEditor: Save/Cancel
        ProjectEditor --> ProjectsList: Save/Cancel
    }

    state "Global Views" as Global {
        [*] --> Dashboard: /dashboard
        [*] --> Settings: /settings
        [*] --> BeepLibrary: /beeps
        BeepLibrary --> BeepEditor: Edit Beep
    }

    state "Execution Flow" as Exec {
        ProjectEditor --> Player: Start Workout
        Player --> CompletionScreen: Finish
        CompletionScreen --> Dashboard: Save Log
    }

    Dashboard --> ProjectsList: Back to Home
```

## 3. Player Execution Engine

The core value of the app is the `PlayerView` (`src/views/player.js`). It transforms a hierarchical project structure (Sets -> Steps) into a linear playlist and executes it with precise timing.

### Logic Flow
The player uses a recursive-like sequence runner combined with `requestAnimationFrame` for the timer.

```mermaid
flowchart TD
    Start[Start Play] --> InitAudio[Init AudioContext & WakeLock]
    InitAudio --> Execute[Execute Sequence Item]

    subgraph Sequence [Step Execution Sequence]
        TTS[1. TTS Announcement] -->|Wait| DelayTTS["Delay (TTS -> Beep)"]
        DelayTTS --> StartBeeps[2. Start Beeps]
        StartBeeps -->|Wait| DelayBeep["Delay (Beep -> Timer)"]
        DelayBeep --> StartTimer[3. Start Timer Loop]
    end

    Execute --> Sequence

    subgraph TimerLoop [RAF Timer Loop]
        CheckDelta[Calc Time Delta] --> UpdateUI[Update Display]
        UpdateUI --> CheckInterval[Check Interval/Countdown Beeps]
        CheckInterval --> CheckEnd{Time <= 0?}
        CheckEnd -- No --> TimerLoop
    end

    StartTimer --> TimerLoop

    CheckEnd -- Yes --> EndBeeps[Play End Beeps]
    EndBeeps --> NextItem[Load Next Item]
    NextItem --> Execute

    NextItem -- No Items Left --> Complete[Complete Workout]
```

### Player State Machine

```mermaid
stateDiagram-v2
    [*] --> IDLE

    IDLE --> RUNNING: Play()

    state RUNNING {
        [*] --> ExecutingSequence
        ExecutingSequence --> TimerRunning: Timer Starts
        TimerRunning --> ExecutingSequence: Next Step
    }

    RUNNING --> PAUSED: Pause()
    PAUSED --> RUNNING: Resume()

    RUNNING --> COMPLETED: All Steps Finished
    COMPLETED --> [*]
```

## 4. Data Architecture

The application uses a "Load-All, Save-Debounced" strategy for the structured data, and an on-demand strategy for binary media.

*   **App State (`kv` store):** Holds Projects, Sets, Steps, Settings, and Logs.
*   **Media (`media` store/OPFS):** Holds user-uploaded images/GIFs.

### Data Persistence Flow

```mermaid
sequenceDiagram
    participant View
    participant State as State Manager (Memory)
    participant IDB as IndexedDB (KV)
    participant OPFS as File System

    Note over View, State: Initialization
    View->>State: initState()
    State->>IDB: get('app_state')
    IDB-->>State: JSON Object
    State-->>View: Current State

    Note over View, State: Updates
    View->>State: updateState(updater)
    State->>State: Apply Changes
    State-->>View: Notify Listeners (Re-render)

    State-)IDB: Debounced Save (1000ms)
    IDB-->>State: Success

    Note over View, OPFS: Media Handling
    View->>OPFS: saveMedia(blob)
    alt OPFS Available
        OPFS->>OPFS: Write to private directory
    else OPFS Unavailable
        OPFS->>IDB: Fallback: Store Blob in IDB
    end
```

## 5. Import/Export Workflow

Projects are portable via a custom `.zip` package format.

*   **Format:** ZIP Archive
*   **Content:**
    *   `project.xml`: Validated XML description of the project, sets, steps, and beeps.
    *   `media/`: Folder containing referenced assets.

### Import Logic

When importing a project, IDs must be remapped to avoid collisions with existing data.

```mermaid
flowchart LR
    Zip[Import .zip] --> Extract[Extract Contents]
    Extract --> ParseXML[Parse project.xml]
    Extract --> GetMedia[Get Media Files]

    subgraph Processing [ID Remapping]
        ParseXML --> MapIDs[Map Old IDs -> New IDs]
        MapIDs --> Rehydrate[Create New State Objects]
    end

    Rehydrate --> MergeState[Merge into App State]
    GetMedia --> SaveMedia[Save to OPFS/IDB]

    MergeState --> Finish[Ready]
    SaveMedia --> Finish
```
