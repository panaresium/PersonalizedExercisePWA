# Personalized Exercise Project XML Specification

This document describes the XML format used to import projects into the Personalized Exercise app. This specification is intended to be used by AI agents (like Gemini, ChatGPT) to generate valid project files from user requirements.

## File Structure

A project export is typically a ZIP file containing:
1. `project.xml` (The file described here)
2. `media/` (A folder containing any referenced images/GIFs)

If no media is used, the XML file alone is sufficient.

## XML Schema

### Root Element
The root element is `<ProjectExport>` with a version attribute.

```xml
<ProjectExport version="1.0">
  <Project id="...">
    ...
  </Project>
</ProjectExport>
```

### Project Element
The `<Project>` element requires a unique `id` (string).

**Children:**
- `<Name>` (String): The title of the workout project.
- `<Description>` (String): A short description of the workout.
- `<BeepLibrary>`: Container for reusable audio patterns.
- `<ExerciseSets>`: Container for the workout sets.

### BeepLibrary Element
Contains definitions for beep patterns referenced by steps.

**Children:**
- `<BeepCode>`
  - Attributes:
    - `id` (String): Unique identifier (e.g., "beep_start").
    - `label` (String): Human-readable name (e.g., "Start Beep").
  - Children:
    - `<Pattern>` (String): The sound pattern definition.

#### Pattern Syntax
The pattern string is a space-separated list of tokens:
- `S`: Short beep (0.12s, 880Hz)
- `L`: Long beep (0.5s, 880Hz)
- `P(ms)`: Pause for `ms` milliseconds.

**Examples:**
- `S S S`: Three short beeps.
- `L`: One long beep.
- `S P(200) S P(200) L`: Short, pause 200ms, Short, pause 200ms, Long.

### ExerciseSets Element
Contains a list of `<ExerciseSet>` elements.

#### ExerciseSet Element
Represents a block of exercises (e.g., a Warm-up, Main Set, or Cool-down).

**Attributes:**
- `id` (String): Unique identifier.
- `order` (Integer): 0-based index of the set in the project.
- `mode` (String): execution logic. Must be one of:
  - `STEP_SEQUENCE`: Steps run sequentially with specific durations.
  - `TIME_RANGE_TOTAL`: The set runs for a total time, looping steps if needed.
  - `REPS_WITH_TIMING`: Used for repetition-based sets.
- `rounds` (Integer): How many times to repeat this entire set (default: 1).
- `restBetweenRoundsSec` (Integer): Seconds of rest between rounds (default: 0).

**Children:**
- `<Title>` (String): Name of the set.
- `<Steps>`: Container for steps.

### Steps Element
Contains a list of `<Step>` elements.

#### Step Element
Represents a single activity (exercise, rest, etc.).

**Attributes:**
- `id` (String): Unique identifier.
- `order` (Integer): 0-based index within the set.

**Children:**
- `<Name>` (String): Name of the exercise.
- `<DurationSec>` (Integer): Duration in seconds (Optional).
- `<Instructions>` (String): Text description or tips (Optional).
- `<Beep>` (Optional): Triggers for sounds.
  - Attributes map event types to `BeepCode` IDs.
  - Supported attributes:
    - `onStart`: Plays when step begins.
    - `onEnd`: Plays when step finishes.
    - `interval`: Plays repeatedly at the step's interval.
    - `countdown`: Plays during the last few seconds.
- `<Media>` (Optional): Reference to visual assets.
  - Attributes:
    - `type`: "GIF" (default).
    - `path`: Relative path in the zip (e.g., `media/exercise.gif`).
    - `frameDurationSec`: Seconds per frame for animated GIFs (default: 0.1).
    - `loop`: "true" or "false" (default: true).

---

## Example XML

```xml
<ProjectExport version="1.0">
  <Project id="proj_001">
    <Name>HIIT Cardio Blast</Name>
    <Description>High intensity interval training with 30s work / 10s rest.</Description>

    <BeepLibrary>
      <BeepCode id="beep_start" label="Go">
        <Pattern>L</Pattern>
      </BeepCode>
      <BeepCode id="beep_rest" label="Stop">
        <Pattern>S S</Pattern>
      </BeepCode>
      <BeepCode id="beep_countdown" label="3-2-1">
        <Pattern>S P(800) S P(800) S</Pattern>
      </BeepCode>
    </BeepLibrary>

    <ExerciseSets>
      <!-- Set 1: Warm Up -->
      <ExerciseSet id="set_01" order="0" mode="STEP_SEQUENCE" rounds="1" restBetweenRoundsSec="0">
        <Title>Warm Up</Title>
        <Steps>
          <Step id="step_01_01" order="0">
            <Name>Jumping Jacks</Name>
            <DurationSec>60</DurationSec>
            <Instructions>Keep a steady pace.</Instructions>
            <Beep onStart="beep_start" onEnd="beep_rest" />
          </Step>
        </Steps>
      </ExerciseSet>

      <!-- Set 2: Main Circuit -->
      <ExerciseSet id="set_02" order="1" mode="STEP_SEQUENCE" rounds="3" restBetweenRoundsSec="30">
        <Title>Core Circuit</Title>
        <Steps>
          <Step id="step_02_01" order="0">
            <Name>Plank</Name>
            <DurationSec>30</DurationSec>
            <Beep onStart="beep_start" />
          </Step>
          <Step id="step_02_02" order="1">
            <Name>Rest</Name>
            <DurationSec>10</DurationSec>
            <Beep onStart="beep_rest" />
          </Step>
          <Step id="step_02_03" order="2">
            <Name>Crunches</Name>
            <DurationSec>30</DurationSec>
            <Beep onStart="beep_start" />
          </Step>
          <Step id="step_02_04" order="3">
            <Name>Rest</Name>
            <DurationSec>10</DurationSec>
            <Beep onStart="beep_rest" />
          </Step>
        </Steps>
      </ExerciseSet>
    </ExerciseSets>
  </Project>
</ProjectExport>
```

---

## AI Prompt Template

Use the following text to prompt an AI to generate a project for you.

> **Role:** You are an expert fitness coach and XML engineer.
> **Task:** Create a personalized workout plan and export it as an XML file compatible with the "Personalized Exercise" app.
> **Context:** I need a workout based on the following requirements:
> [INSERT YOUR WORKOUT GOALS HERE, e.g., "A 20-minute leg workout for beginners with no equipment"]
>
> **Output Requirement:**
> Please output **only** the raw XML content inside a code block. Follow the strict schema below:
>
> 1.  **Beep Patterns:** Create simple 'S' (short) and 'L' (long) patterns for Start and Rest.
> 2.  **Structure:** Organize the workout into logical `ExerciseSet`s (Warmup, Main, Cooldown).
> 3.  **Mode:** Use `STEP_SEQUENCE` for standard timed intervals.
> 4.  **Schema Compliance:** Ensure strict adherence to the following XML structure:
>    - Root: `<ProjectExport version="1.0">`
>    - Beeps must be defined in `<BeepLibrary>` and referenced by ID in `<Step>` attributes (e.g., `onStart="beep_id"`).
>    - Valid Step modes: `STEP_SEQUENCE`, `TIME_RANGE_TOTAL`, `REPS_WITH_TIMING`.
>    - Pattern tokens: `S`, `L`, `P(ms)`.
