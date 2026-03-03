# Porters-Portal

## Skills

### /lesson-plan
**Trigger:** "plan a lesson", "create a lesson plan", "build lesson blocks", "convert resource to lesson", "generate ISLE lesson"
**Usage:** `/lesson-plan [topic]` or `/lesson-plan [file path to PDF/document]`
**Description:** Generates ISLE-pedagogy-based physics lesson plans as importable JSON lesson blocks. Two modes: generate from a topic, or convert an existing resource (PDF) into ISLE-structured blocks. Outputs JSON ready for the lesson editor's JSON import.
**Audience:** High school physics / AP Physics 1

### /3d-activity
**Trigger:** "create a 3D simulation", "build a Babylon.js activity", "make a 3D interactive scene", "generate a physics sim", "create a forensic science simulation"
**Usage:** `/3d-activity [topic] [optional file paths for context]`
**Description:** Generates standalone HTML files with interactive 3D Babylon.js simulations for physics and forensic science. Supports reference materials (PDFs, images, documents) for context. Asks which class (AP Physics, Honors Physics, Forensic Science) and whether graded or exploratory. Integrates with Proctor Bridge. Optimized for Chromebook GPUs.
**Output:** `/home/kp/Desktop/Simulations/<class>/`
