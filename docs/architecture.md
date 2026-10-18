# MIA — Updated Overview Architecture

Mermaid overview of the current desktop application.

Architecture reflects the currently inspected source, including the new speaker directory and task-email workflow. This is a source-based diagram, not a runtime or delivery test.

```mermaid
flowchart TB
    subgraph DEVICE["Local device — Tauri desktop app"]
        UI["Next.js / React interface"]
        IPC["Tauri commands and events"]
        AUDIO["Audio capture and preparation"]
        STT["Local transcription: Whisper / Parakeet"]
        DIAR["Speaker diarization: ONNX embeddings and clustering"]
        DIRECTORY["Speaker directory: names, emails, roles, sample paths"]
        SUMMARY["Summary and action-item generation"]
        LOCAL["Built-in local model / local Ollama"]
        REVIEW["Task review UI: edit, assign, select recipients, preview"]
        EMAIL["Rust email service: shared or personalized HTML emails"]
        DB[("SQLite: meetings, transcripts, summaries, speakers, contacts, settings")]
        FILES[("Local recordings and model assets")]
        UI <--> IPC
        IPC --> AUDIO
        AUDIO --> STT
        AUDIO --> FILES
        STT --> DB
        STT -->|Live events| IPC
        FILES --> DIAR
        DB -->|Transcript timestamps| DIAR
        DIAR -->|Speaker assignments| DB
        IPC <--> DIRECTORY
        DIRECTORY <--> DB
        DB -->|Meeting transcript| SUMMARY
        SUMMARY <--> LOCAL
        SUMMARY --> DB
        SUMMARY --> REVIEW
        DIRECTORY -->|Recipient contacts| REVIEW
        REVIEW -->|User clicks Send, via Tauri| EMAIL
        DB -->|Provider settings| EMAIL
        EMAIL -->|Success or error| IPC
    end
    INPUT["Microphone / meeting system audio"] --> AUDIO
    SUMMARY <-.->|Transcript / generated response| CLOUD["Optional cloud AI provider"]
    EMAIL --> DELIVERY["SMTP server OR Resend API → selected recipients"]
```

- Speaker analysis uses saved audio and transcript timing. The contact directory is not depicted as automatic voice-to-person recognition.
- Tasks are parsed from the generated report in the interface. Users can edit assignments, select tasks and recipients, preview content, and choose shared or individual task emails.
- SMTP uses the Rust `lettre` client; Resend uses HTTPS. Email content leaves the device when sent. Optional remote LLM generation also sends transcript content to the selected provider.
- FastAPI remains archived. A Custom Context Engine, Redis/Celery, PostgreSQL, and Jira/Trello integration are not shown as implemented.

Source references: `frontend/src-tauri/src/lib.rs`, `frontend/src-tauri/src/email/`, `frontend/src/components/MeetingDetails/SendTasksModal.tsx`, `frontend/src-tauri/src/database/repositories/speaker_directory.rs`, and `frontend/src-tauri/migrations/20261019000000_add_speaker_directory_and_email.sql`.



