use anyhow::{anyhow, Context, Result};
use ndarray::Array1;
use ort::session::Session;
use rubato::{
    Resampler, SincFixedIn, SincInterpolationParameters, SincInterpolationType, WindowFunction,
};
use std::path::{Path, PathBuf};
use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::DecoderOptions;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
use tracing::{info, warn};

use super::clustering::{cluster_embeddings, compute_centroid, nearest_centroid, cosine_similarity};

/// Default cosine similarity threshold for auto-detecting speaker count.
const DEFAULT_SIMILARITY_THRESHOLD: f32 = 0.20;

/// Duration (seconds) of the representative audio sample picked per speaker.
const SPEAKER_SAMPLE_DURATION_SECS: f64 = 5.0;

/// Target sample rate expected by most speaker embedding models.
const EMBEDDING_SAMPLE_RATE: u32 = 16000;

/// Information about one identified speaker.
#[derive(Debug, Clone)]
pub struct SpeakerInfo {
    pub internal_label: String,
    pub sample_start_time: f64,
    pub sample_end_time: f64,
    pub segment_count: usize,
}

/// The result of a diarization run.
#[derive(Debug)]
pub struct DiarizationResult {
    pub speakers: Vec<SpeakerInfo>,
    /// (transcript_id, speaker_label) pairs for updating the database.
    pub assignments: Vec<(String, String)>,
}

/// A transcript segment with audio timing, used as input to diarization.
#[derive(Debug, Clone)]
pub struct SegmentInfo {
    pub transcript_id: String,
    pub audio_start_time: f64,
    pub audio_end_time: f64,
}

/// ONNX-based speaker diarization engine.
///
/// Uses a speaker embedding model to extract fixed-length vectors from audio
/// segments, then clusters them with Agglomerative Hierarchical Clustering.
pub struct DiarizationEngine {
    session: Session,
}

impl DiarizationEngine {
    /// Create a new engine by loading an ONNX speaker embedding model.
    pub fn new(model_path: &Path) -> Result<Self> {
        info!("Loading speaker embedding model from {:?}", model_path);
        let session = Session::builder()?
            .with_intra_threads(4)?
            .commit_from_file(model_path)
            .context("Failed to load ONNX speaker embedding model")?;

        info!("Speaker embedding model loaded dynamically.");
        Ok(Self {
            session,
        })
    }

    /// Extract a normalized embedding vector from raw mono audio samples at 16 kHz.
    fn extract_embedding(&mut self, audio_16k: &[f32]) -> Result<Array1<f32>> {
        if audio_16k.is_empty() {
            return Err(anyhow!("Empty audio segment, cannot extract embedding"));
        }

        let num_samples = audio_16k.len();

        let output_name = self.session.outputs[0].name.clone();

        // Pyannote exported model expects 2D: [batch, samples]
        let input_array_2d = ndarray::Array2::from_shape_vec((1, num_samples), audio_16k.to_vec())
            .context("Failed to create 2D input tensor")?;
        let input_value_2d = ort::value::TensorRef::from_array_view(input_array_2d.view())?;

        let outputs = self.session.run(ort::inputs![input_value_2d])?;

        let embedding_tensor = outputs
            .get(output_name.as_str())
            .ok_or_else(|| anyhow!("No output from embedding model"))?;

        let embedding_view = embedding_tensor
            .try_extract_tensor::<f32>()
            .context("Failed to extract embedding tensor")?;

        let flat: Vec<f32> = embedding_view.1.to_vec();

        // L2-normalize the embedding
        let norm: f32 = flat.iter().map(|x| x * x).sum::<f32>().sqrt();
        let normalized: Vec<f32> = if norm > 1e-8 {
            flat.iter().map(|x| x / norm).collect()
        } else {
            flat
        };

        Ok(Array1::from_vec(normalized))
    }

    /// Run the full diarization pipeline on a meeting.
    ///
    /// # Arguments
    /// * `wav_path` — Path to the meeting's WAV recording file.
    /// * `segments` — Transcript segments with audio timing from the database.
    /// * `num_speakers` — Force a specific speaker count, or `None` for auto-detect.
    pub fn diarize(
        &mut self,
        wav_path: &Path,
        segments: Vec<SegmentInfo>,
        num_speakers: Option<u8>,
    ) -> Result<DiarizationResult> {
        if segments.is_empty() {
            return Ok(DiarizationResult {
                speakers: vec![],
                assignments: vec![],
            });
        }

        info!(
            "Starting diarization: {} segments, wav={:?}, num_speakers={:?}",
            segments.len(),
            wav_path,
            num_speakers
        );

        // 1. Load the full audio file (supports WAV, MP4, M4A, MP3, etc.)
        let (all_samples, source_sample_rate) = load_audio_mono(wav_path)?;
        let audio_duration = all_samples.len() as f32 / source_sample_rate as f32;
        info!(
            "Loaded audio: {} samples at {} Hz ({:.1}s)",
            all_samples.len(),
            source_sample_rate,
            audio_duration
        );

        // 2. Extract embeddings for each valid segment
        let mut valid_embeddings = Vec::new();
        let mut valid_indices = Vec::new();
        let mut skipped_short = 0usize;
        let mut skipped_oob = 0usize;
        let mut failed_extraction = 0usize;

        for (idx, seg) in segments.iter().enumerate() {
            let start_sample = (seg.audio_start_time * source_sample_rate as f64) as usize;
            let end_sample = (seg.audio_end_time * source_sample_rate as f64) as usize;

            if start_sample >= all_samples.len() || end_sample > all_samples.len() {
                warn!("Segment {} out of bounds (start={}, end={}, total={}), skipping",
                    seg.transcript_id, start_sample, end_sample, all_samples.len());
                skipped_oob += 1;
                continue;
            }

            let segment_audio = &all_samples[start_sample..end_sample];
            if segment_audio.len() < 400 {
                skipped_short += 1;
                continue;
            }

            let audio_16k = if source_sample_rate == EMBEDDING_SAMPLE_RATE {
                segment_audio.to_vec()
            } else {
                resample_audio(segment_audio, source_sample_rate, EMBEDDING_SAMPLE_RATE)?
            };

            match self.extract_embedding(&audio_16k) {
                Ok(emb) => {
                    valid_embeddings.push(emb);
                    valid_indices.push(idx);
                }
                Err(e) => {
                    failed_extraction += 1;
                    tracing::error!("Failed to extract embedding for segment {}: {:?}", idx, e);
                }
            }
        }

        info!(
            "Embedding extraction: {}/{} succeeded, {} failed, {} skipped (too short), {} skipped (out of bounds)",
            valid_embeddings.len(), segments.len(), failed_extraction, skipped_short, skipped_oob
        );

        if valid_embeddings.is_empty() {
            return Err(anyhow!(
                "All {} segments failed embedding extraction (0 valid). \
                 {} failed, {} too short, {} out of bounds. \
                 Check that the ONNX model file is valid and the audio file is readable.",
                segments.len(), failed_extraction, skipped_short, skipped_oob
            ));
        }

        // 3. Two-pass Clustering setup
        let mut primary_embs = Vec::new();
        let mut primary_indices = Vec::new();
        let mut short_embs = Vec::new();
        let mut short_indices = Vec::new();

        for (i, &seg_idx) in valid_indices.iter().enumerate() {
            let seg = &segments[seg_idx];
            let duration = seg.audio_end_time - seg.audio_start_time;
            if duration >= 1.5 {
                primary_embs.push(valid_embeddings[i].clone());
                primary_indices.push(seg_idx);
            } else {
                short_embs.push(valid_embeddings[i].clone());
                short_indices.push(seg_idx);
            }
        }

        // Fallback if no long segments exist
        if primary_embs.is_empty() {
            primary_embs = valid_embeddings.clone();
            primary_indices = valid_indices.clone();
            short_embs.clear();
            short_indices.clear();
        }

        info!("Clustering {} primary segments (>= 1.5s) and assigning {} short segments.", primary_embs.len(), short_embs.len());

        // PASS 1: Cluster primary embeddings
        let primary_cluster_ids = cluster_embeddings(&primary_embs, num_speakers, DEFAULT_SIMILARITY_THRESHOLD);
        let num_clusters = primary_cluster_ids.iter().cloned().max().map(|m| m + 1).unwrap_or(0);

        // Compute Centroids
        let mut centroids = Vec::with_capacity(num_clusters);
        for cluster_id in 0..num_clusters {
            let cluster_embs: Vec<Array1<f32>> = primary_cluster_ids.iter().enumerate()
                .filter(|(_, &cid)| cid == cluster_id)
                .map(|(i, _)| primary_embs[i].clone())
                .collect();
            centroids.push(compute_centroid(&cluster_embs));
        }

        // Build assignments
        let mut assignments: Vec<(String, String)> = Vec::with_capacity(valid_indices.len());
        let mut speaker_segments: std::collections::HashMap<usize, Vec<usize>> = std::collections::HashMap::new();

        for (i, &seg_idx) in primary_indices.iter().enumerate() {
            let cluster = primary_cluster_ids[i];
            assignments.push((segments[seg_idx].transcript_id.clone(), format!("Speaker {}", cluster + 1)));
            speaker_segments.entry(cluster).or_default().push(seg_idx);
        }

        // PASS 2: Assign short segments to nearest centroid
        if num_clusters > 0 {
            for (i, &seg_idx) in short_indices.iter().enumerate() {
                let nearest = nearest_centroid(&short_embs[i], &centroids);
                assignments.push((segments[seg_idx].transcript_id.clone(), format!("Speaker {}", nearest + 1)));
                speaker_segments.entry(nearest).or_default().push(seg_idx);
            }
        }

        // 4. Find Best 5-second sample
        let mut speakers: Vec<SpeakerInfo> = Vec::with_capacity(num_clusters);
        for cluster in 0..num_clusters {
            let seg_indices = speaker_segments.get(&cluster).cloned().unwrap_or_default();
            let segment_count = seg_indices.len();
            if segment_count == 0 { continue; }

            let centroid = &centroids[cluster];
            let mut candidates: Vec<_> = seg_indices.iter().map(|&idx| {
                let seg = &segments[idx];
                let duration = seg.audio_end_time - seg.audio_start_time;
                // Find embedding from valid_embeddings
                let emb_idx = valid_indices.iter().position(|&x| x == idx).unwrap();
                let sim = cosine_similarity(&valid_embeddings[emb_idx], centroid);
                (idx, duration, sim)
            }).filter(|&(_, d, _)| d >= 2.5).collect();

            candidates.sort_by(|a, b| b.2.partial_cmp(&a.2).unwrap_or(std::cmp::Ordering::Equal));

            let (sample_start, sample_end) = if let Some(&(best_idx, _duration, _)) = candidates.first() {
                let best_seg = &segments[best_idx];
                // Clamp strictly to segment boundaries — never bleed into adjacent speakers
                (best_seg.audio_start_time, best_seg.audio_end_time)
            } else {
                let fallback_idx = seg_indices[seg_indices.len() / 2];
                let seg = &segments[fallback_idx];
                (seg.audio_start_time, seg.audio_end_time)
            };

            speakers.push(SpeakerInfo {
                internal_label: format!("Speaker {}", cluster + 1),
                sample_start_time: sample_start,
                sample_end_time: sample_end,
                segment_count,
            });
        }

        Ok(DiarizationResult { speakers, assignments })
    }
}

/// Load an audio file as mono f32 samples and return (samples, sample_rate).
/// Supports WAV, MP4, M4A, MP3, FLAC, OGG, and WebM via Symphonia.
fn load_audio_mono(path: &Path) -> Result<(Vec<f32>, u32)> {
    info!("Loading audio from {:?}", path);
    let file = std::fs::File::open(path).context("Failed to open audio file")?;
    let mss = MediaSourceStream::new(Box::new(file), Default::default());

    let mut hint = Hint::new();
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        hint.with_extension(ext);
    }

    let probed = symphonia::default::get_probe()
        .format(
            &hint,
            mss,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .context("Failed to probe WAV format")?;

    let mut format = probed.format;
    let track = format
        .default_track()
        .ok_or_else(|| anyhow!("No audio track found"))?;
    let sample_rate = track.codec_params.sample_rate.unwrap_or(48000);
    let channels = track
        .codec_params
        .channels
        .map(|c| c.count())
        .unwrap_or(1);
    let track_id = track.id;

    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .context("Failed to create decoder")?;

    let mut all_samples: Vec<f32> = Vec::new();

    loop {
        let packet = match format.next_packet() {
            Ok(p) => p,
            Err(symphonia::core::errors::Error::IoError(ref e))
                if e.kind() == std::io::ErrorKind::UnexpectedEof =>
            {
                break;
            }
            Err(_) => break,
        };

        if packet.track_id() != track_id {
            continue;
        }

        let decoded = match decoder.decode(&packet) {
            Ok(d) => d,
            Err(_) => continue,
        };

        let spec = *decoded.spec();
        let num_frames = decoded.frames();
        let mut sample_buf = SampleBuffer::<f32>::new(num_frames as u64, spec);
        sample_buf.copy_interleaved_ref(decoded);

        let samples = sample_buf.samples();
        if channels == 1 {
            all_samples.extend_from_slice(samples);
        } else {
            // Mix down to mono
            for frame in samples.chunks(channels) {
                let mono = frame.iter().sum::<f32>() / channels as f32;
                all_samples.push(mono);
            }
        }
    }

    Ok((all_samples, sample_rate))
}

/// Resample audio from `from_rate` to `to_rate` using sinc interpolation.
fn resample_audio(samples: &[f32], from_rate: u32, to_rate: u32) -> Result<Vec<f32>> {
    if from_rate == to_rate {
        return Ok(samples.to_vec());
    }

    let params = SincInterpolationParameters {
        sinc_len: 256,
        f_cutoff: 0.95,
        interpolation: SincInterpolationType::Linear,
        oversampling_factor: 256,
        window: WindowFunction::BlackmanHarris2,
    };

    let chunk_size = samples.len().min(1024);
    let mut resampler = SincFixedIn::<f32>::new(
        to_rate as f64 / from_rate as f64,
        2.0,
        params,
        chunk_size,
        1, // mono
    )
    .map_err(|e| anyhow!("Failed to create resampler: {}", e))?;

    let mut output = Vec::new();
    let mut pos = 0;

    while pos < samples.len() {
        let end = (pos + chunk_size).min(samples.len());
        let mut chunk = samples[pos..end].to_vec();

        // Pad last chunk to chunk_size if needed
        if chunk.len() < chunk_size {
            chunk.resize(chunk_size, 0.0);
        }

        let result = resampler
            .process(&[chunk], None)
            .map_err(|e| anyhow!("Resampling failed: {}", e))?;

        if let Some(channel) = result.first() {
            output.extend_from_slice(channel);
        }

        pos = end;
    }

    Ok(output)
}

/// Get the default path for the speaker embedding model.
pub fn default_model_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir
        .join("models")
        .join("pyannote_model.onnx")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_print_model_inputs() {
        let env = ort::init_from_builder(ort::Environment::builder().with_name("test").build().unwrap().into_arc());
        let session = ort::Session::builder().unwrap().commit_from_file(r"C:\Users\dhira\AppData\Roaming\com.meetily.ai\models\speaker_embedding.onnx").unwrap();
        println!("Inputs: {:#?}", session.inputs);
        panic!("FORCE PANIC TO SEE STDOUT");
    }
}
