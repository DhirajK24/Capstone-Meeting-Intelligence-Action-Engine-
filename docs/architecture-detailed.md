# MIA — Detailed Architecture

This diagram describes the current desktop implementation, inspected on 18 October 2026. It shows logical component relationships rather than exact function call order. Solid arrows show application data/control flow; dashed arrows show optional remote connections or model dependencies.

```mermaid
flowchart TB
    MIC["Microphone"]
    SYS["Meeting application audio<br/>OS system-audio capture"]
    IMPORT["Imported audio file"]

    subgraph DEVICE["USER DEVICE — MIA DESKTOP APPLICATION"]
        subgraph PRESENTATION["1 · PRESENTATION — Next.js / React / Tailwind"]
            UI["Meeting dashboard and recording controls<br/>Live transcript · notes editor · speaker management<br/>Model, device and provider settings"]
            SERVICES["Frontend services and hooks<br/>Recording · transcripts · configuration"]
            UI <--> SERVICES
        end
        IPC["2 · TAURI v2 BRIDGE<br/>invoke commands / results<br/>listen to transcript, progress and error events"]
        SERVICES <--> IPC

        subgraph AUDIO["3 · NATIVE AUDIO PIPELINE — Rust"]
            CONTROL["Recording manager<br/>Start / stop · recording state<br/>Device selection and permissions"]
            CAPTURE["Native capture streams<br/>Microphone + system audio"]
            DSP["Audio preparation<br/>Resampling · microphone normalization<br/>Mixing and buffering"]
            VAD["Voice activity detection<br/>Speech segmentation"]
            QUEUE["Transcription worker queue<br/>Engine selection and processing"]
            DECODE["File import / retranscription<br/>Decode and prepare audio"]
            SAVE["Incremental recording saver<br/>Audio checkpoints and finalization"]
            CONTROL --> CAPTURE --> DSP --> VAD --> QUEUE
            DSP --> SAVE
            DECODE --> QUEUE
        end

        subgraph INFERENCE["4 · LOCAL SPEECH INFERENCE"]
            SELECT{"Selected STT engine"}
            WHISPER["Whisper engine<br/>whisper-rs / whisper.cpp"]
            PARAKEET["Parakeet engine<br/>ONNX Runtime"]
            SEGMENTS["Transcript segments<br/>Text + audio timestamps"]
            QUEUE --> SELECT
            SELECT --> WHISPER --> SEGMENTS
            SELECT --> PARAKEET --> SEGMENTS
        end

        subgraph SPEAKERS["5 · SPEAKER ANALYSIS — Recorded audio + transcript timing"]
            ALIGN["Load audio windows<br/>using transcript timestamps"]
            EMBED["Pyannote ONNX model<br/>Speaker embeddings"]
            CLUSTER["Cluster embeddings<br/>Assign speakers to transcript segments"]
            EDIT["Speaker commands<br/>Rename · merge · play sample"]
            ALIGN --> EMBED --> CLUSTER
        end

        subgraph SUMMARY["6 · MEETING INTELLIGENCE"]
            PREP["Load transcript and summary settings<br/>Choose report template and language"]
            CHUNKS["Summary processor<br/>Chunk long transcripts<br/>Generate and consolidate report"]
            ROUTER{"LLM provider routing"}
            BUILTIN["Built-in local AI<br/>Model manager + inference sidecar"]
            OLLAMA["Local Ollama service<br/>Configured local model"]
            REPORT["Meeting report<br/>Summary · key points · decisions<br/>Action items captured in report"]
            PREP --> CHUNKS
            CHUNKS <-->|Inference requests / responses| ROUTER
            ROUTER <--> BUILTIN
            ROUTER <--> OLLAMA
            CHUNKS --> REPORT
        end

        subgraph STORAGE["7 · LOCAL PERSISTENCE"]
            REPO["Database manager + repositories<br/>sqlx"]
            DB[("SQLite<br/>Meetings · transcripts · transcript chunks<br/>Summaries · speakers · settings")]
            FILES[("Meeting folders<br/>Recorded audio files")]
            MODELS[("Local model files<br/>Whisper · Parakeet · speaker embeddings<br/>Built-in summary models")]
            REPO <--> DB
        end
        IPC --> CONTROL
        IPC --> DECODE
        IPC --> ALIGN
        IPC --> EDIT
        IPC --> PREP
        IPC <--> REPO
        SEGMENTS -->|Live transcript events| IPC
        SEGMENTS -->|Persist transcript| REPO
        SAVE --> FILES
        FILES --> ALIGN
        DB -->|Transcript timing| ALIGN
        CLUSTER -->|Speaker assignments| REPO
        EDIT <--> REPO
        DB -->|Meeting transcript| PREP
        REPORT -->|Save report| REPO
        REPORT -->|Completion event| IPC
        MODELS -.-> WHISPER
        MODELS -.-> PARAKEET
        MODELS -.-> EMBED
        MODELS -.-> BUILTIN
    end

    MIC --> CAPTURE
    SYS --> CAPTURE
    IMPORT --> DECODE
    REMOTE["OPTIONAL EXTERNAL AI<br/>OpenAI · Claude · Groq · OpenRouter<br/>Custom OpenAI-compatible endpoint"]
    DOWNLOAD["MODEL DOWNLOAD SOURCES<br/>Initial setup / selected model downloads"]
    ROUTER <-.->|HTTPS: transcript content / generated response| REMOTE
    DOWNLOAD -.->|Model assets| MODELS

    classDef interface fill:#183449,stroke:#65b8e8,color:#fff;
    classDef processing fill:#153b36,stroke:#64c7b1,color:#fff;
    classDef persistence fill:#313047,stroke:#b2a0db,color:#fff;
    classDef external fill:#473621,stroke:#dbb06a,color:#fff;
    class UI,SERVICES,IPC interface;
    class CONTROL,CAPTURE,DSP,VAD,QUEUE,DECODE,SAVE,SELECT,WHISPER,PARAKEET,SEGMENTS,ALIGN,EMBED,CLUSTER,EDIT,PREP,CHUNKS,ROUTER,BUILTIN,OLLAMA,REPORT processing;
    class REPO,DB,FILES,MODELS persistence;
    class MIC,SYS,IMPORT,REMOTE,DOWNLOAD external;
```

## Implementation notes

- Speaker analysis requires saved audio and transcript timestamps. It is a separate operation from live transcription.
- Action items are generated as report content; this diagram does not imply an implemented task dispatch or email delivery service.
- Local inference requires downloaded models. Optional remote LLM providers receive transcript content. Ollama is local only when configured with a local endpoint.
- Hardware acceleration depends on the model, build features, and available hardware.
- Error, progress and status events also pass through the Tauri bridge; most individual event arrows are omitted for readability.
- The archived FastAPI backend is not part of this runtime. The proposed Custom Context Engine, browser extension, PostgreSQL, Redis/Celery, Jira/Trello and email automation are not shown as implemented features.

## Code map

| Layer | Implementation |
|---|---|
| UI and frontend service wrappers | `frontend/src/components/`, `frontend/src/hooks/`, `frontend/src/services/` |
| Tauri command registration | `frontend/src-tauri/src/lib.rs` |
| Capture, preprocessing and recording | `frontend/src-tauri/src/audio/` |
| Transcription dispatch and workers | `frontend/src-tauri/src/audio/transcription/` |
| Speech models | `frontend/src-tauri/src/whisper_engine/`, `frontend/src-tauri/src/parakeet_engine/` |
| Speaker embeddings and clustering | `frontend/src-tauri/src/diarization/` |
| Summary processing and provider routing | `frontend/src-tauri/src/summary/processor.rs`, `frontend/src-tauri/src/summary/llm_client.rs` |
| Built-in inference and model lifecycle | `frontend/src-tauri/src/summary/summary_engine/` |
| Database and repositories | `frontend/src-tauri/src/database/` |

Editable diagram source: [architecture-detailed.mmd](architecture-detailed.mmd).
