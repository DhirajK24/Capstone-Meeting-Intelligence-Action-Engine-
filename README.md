<div align="center" style="border-bottom: none">
    <h1>
        <img src="docs/MIA%20Meeting%20Intelligence%20Dashboard.png" style="border-radius: 12px; max-width: 100%; box-shadow: 0 8px 30px rgba(0,0,0,0.12);" alt="MIA Banner" />
        <br>
        MIA - Meeting Intelligence & Action Engine
    </h1>
    <p>
        <b>Transform raw meeting conversations into structured intelligence, verified decisions, and personalized action items. Powered by 100% local, private AI.</b>
    </p>

   [![Tauri v2](https://img.shields.io/badge/Tauri-v2-24C8DB?logo=tauri&logoColor=white)](https://tauri.app/)
   [![Next.js 14](https://img.shields.io/badge/Next.js-14-black?logo=next.js&logoColor=white)](https://nextjs.org/)
   [![Rust](https://img.shields.io/badge/Rust-1.77+-orange?logo=rust&logoColor=white)](https://www.rust-lang.org/)
   [![Whisper](https://img.shields.io/badge/Whisper-Offline%20STT-brightgreen)](https://github.com/ggerganov/whisper.cpp)
   [![Pyannote](https://img.shields.io/badge/Pyannote-Neural%20Diarization-blueviolet)](https://github.com/pyannote/pyannote-audio)
   [![Local LLM](https://img.shields.io/badge/Local%20LLM-Ollama%20%7C%20Llama%203-blue)](https://ollama.ai/)
   [![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
</div>

---

## 🚀 Introduction

In today's fast-paced workplaces, valuable decisions and action items often get lost in hours of recorded conversations. Cloud-based meeting bots capture this data by routing sensitive audio through third-party servers, posing critical data privacy and security vulnerabilities for companies and individuals.

**MIA (Meeting Intelligence & Action Engine)** is an enterprise-grade desktop application that runs **entirely on your local machine**. It records multi-source meeting audio, transcribes dialogue in real-time, clusters and fingerprints individual speakers, extracts decisions and action items using local LLMs, and dispatches personalized emails to each participant—all without your audio ever leaving your device.

---

## ✨ Key Features

### 🎙️ Dual-Stream Audio Capture
- **Simultaneous Capture**: Simultaneously records your system output (meeting participants on Zoom, Teams, Google Meet) and your microphone input.
- **Studio-Grade DSP**: Built-in EBU R128 loudness normalization and neural background noise suppression (`nnnoiseless`) to ensure crystal-clear transcription.

### ⚡ Offline Real-Time Speech-to-Text
- **Zero-Cloud Transcription**: Powered by local `whisper.cpp` bindings and NVIDIA Parakeet ONNX models.
- **Hardware Acceleration**: Automatic GPU acceleration via Apple Metal (macOS), CUDA (NVIDIA on Windows/Linux), and Vulkan.

### 👥 Neural Speaker Diarization & Speaker Directory
- **Local Clustering**: Uses Pyannote ONNX neural embeddings (512-dimensional vectors) executed through `ort` (ONNX Runtime) to isolate and fingerprint unique speakers without cloud APIs.
- **Speaker Directory**: Maintain a global directory of team members, roles, and emails.
- **Inline Reassignment**: Reassign names directly within the transcript with audio snippet playback and synced profile colors.

### 🧠 Context-Aware AI Summarization
- **100% Offline Intelligence**: Connect seamlessly to your local **Ollama** instance to run models like Llama 3, Mistral, and Qwen.
- **Configurable Templates**: Built-in structured templates for Standard Meetings, Project Syncs, 1-on-1s, Client Calls, and Standups.
- **Cloud Fallbacks**: Optional support for Claude, OpenAI, Groq, and OpenRouter for teams that choose cloud models.

### 📧 Intelligent Action Item & Context Email Dispatcher
- **Personalized Task Delivery**: Dispatches individualized emails where each employee receives **only the specific action items assigned to them**, while maintaining full meeting context.
- **Complete Context Included**: Automatically structures and renders the **Executive Summary**, **Key Decisions**, and **Discussion Highlights** into responsive HTML cards.
- **Free Native SMTP & Resend**: Zero cost setup using your native Gmail (Google App Password), Outlook, custom SMTP server, or Resend API.
- **Live Preview & Approval**: Interactive modal to review, approve, reassign tasks, and inspect the exact email before hitting send.

### 📝 Notion-Style Meeting Notes Workspace
- **BlockNote Editor**: Rich-text workspace supporting blocks, headers, interactive task tables, and real-time Markdown export.
- **One-Click Clipboard**: Instant export of summaries, action item tables, and raw transcript segments.

---

## 🛠️ Architecture & Pipeline

MIA processes meeting data through a modular, local-first pipeline:

```
[System Audio + Mic]
         │
         ▼
[Audio Normalization & DSP (EBU R128)]
         │
         ├───► [Local STT Engine (Whisper / Parakeet)] ───► Real-Time Transcript
         │
         └───► [Neural Diarization (Pyannote ONNX)] ─────► Speaker Clusters
                                                                   │
                                                                   ▼
                                                       [Speaker Directory Link]
                                                                   │
                                                                   ▼
[Meeting Document (BlockNote Editor)] ◄─── [Local LLM Summarization (Ollama)]
         │
         ├───► 🎯 Personalized Action Items
         ├───► 📝 Executive Summary
         ├───► 💡 Key Decisions
         └───► 🔍 Discussion Highlights
         │
         ▼
[Email Dispatcher (lettre SMTP / Resend)] ───► Team Inboxes
```

---

## 🧠 Technology Stack

### App Framework & UI
- **Tauri v2**: High-performance, memory-efficient desktop shell combining Rust with modern web frontends.
- **Next.js 14 & React 18**: Dynamic, responsive UI powered by React Server Components and Client State.
- **Tailwind CSS & Radix UI (shadcn/ui)**: Clean, polished styling with accessible component primitives.
- **BlockNote**: Notion-style rich-text editing experience built on Prosemirror.

### High-Performance Rust Backend
- **`whisper-rs`**: Zero-overhead Rust bindings for whisper.cpp.
- **`ort` (ONNX Runtime)**: Native C++ execution of neural networks for Pyannote diarization and Parakeet STT.
- **`cpal`**: Cross-platform low-latency native audio loopback and microphone capture.
- **`lettre`**: Async SMTP transport supporting TLS authentication for direct email delivery.
- **`sqlx` & SQLite**: Embedded, resilient local database storage for meetings, settings, and speaker directories.
- **`ebur128` & `nnnoiseless`**: Real-time ITU-R BS.1770 loudness normalization and noise suppression.
- **`ffmpeg` / `symphonia`**: Accelerated media extraction, audio slicing, and waveform processing.

---

## 💻 Installation & Quickstart

### Prerequisites
Make sure you have the following installed:
* **Node.js** (v18+)
* **pnpm** (`npm install -g pnpm`)
* **Rust** (v1.77+ with Cargo)
* **C++ Build Tools** (Visual Studio Build Tools on Windows, Xcode Command Line Tools on macOS)
* **Ollama** *(Optional for local AI summaries)*: [Download Ollama](https://ollama.ai/) and run `ollama run llama3`.

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/DhirajK24/MIA-Meeting-Intelligence-Action-Engine.git MIA
cd MIA/frontend
pnpm install
```

### 2. Run the Development Server
Launch the application with live frontend hot-reloading and Rust background services:
```bash
pnpm tauri:dev
```
*(Note: Initial compilation of the Rust engine and native AI bindings may take a few minutes.)*

### 3. Build a Production Release
To generate a standalone portable installer (`.exe` for Windows):
```bash
pnpm tauri build --bundles nsis
```
The resulting executable will be created in `frontend/src-tauri/target/release/bundle/nsis/`.

---

## ⚡ Hardware Acceleration

MIA automatically configures hardware acceleration depending on your operating system:
* **Windows**: NVIDIA CUDA or Vulkan
* **macOS**: Apple Metal & CoreML (Apple Silicon M1/M2/M3/M4 optimized)
* **Linux**: CUDA or ROCm (HIP)

*For maximum transcription speed on Windows with an NVIDIA GPU, ensure the CUDA Toolkit is installed and compile with `--features cuda`:*
```bash
cargo build --release --features cuda
```

---

## 🔒 Privacy & Local Security Guarantee

MIA is built from the ground up on the principle of **absolute data sovereignty**:
* **Audio Stays Local**: Audio streams are processed in memory and written strictly to temporary local files.
* **Database Encrypted On-Disk**: Meeting records, transcripts, summaries, and directory entries reside solely in your local application directory.
* **No Hidden Trackers**: Zero telemetry, zero analytics tracking, and zero remote logging.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
