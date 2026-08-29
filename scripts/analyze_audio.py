import json
import sys

import librosa
import numpy as np


audio_path = sys.argv[1]
y, sample_rate = librosa.load(audio_path, sr=None, mono=False)
mono = np.mean(y, axis=0)
duration = len(mono) / sample_rate
hop_length = 512
rms = librosa.feature.rms(y=mono, frame_length=2048, hop_length=hop_length)[0]
onset = librosa.onset.onset_strength(y=mono, sr=sample_rate, hop_length=hop_length)
tempo, beats = librosa.beat.beat_track(
    onset_envelope=onset, sr=sample_rate, hop_length=hop_length, units="time"
)

segments = []
for start in np.arange(0, duration, 30):
    begin = int(start * sample_rate)
    end = int(min(duration, start + 30) * sample_rate)
    section = mono[begin:end]
    section_onset = librosa.onset.onset_strength(
        y=section, sr=sample_rate, hop_length=hop_length
    )
    section_tempo, _ = librosa.beat.beat_track(
        onset_envelope=section_onset, sr=sample_rate, hop_length=hop_length
    )
    segments.append({
        "start": round(float(start), 1),
        "end": round(float(min(duration, start + 30)), 1),
        "tempo": round(float(np.asarray(section_tempo).item()), 2),
        "rms_db": round(float(librosa.amplitude_to_db(
            [np.sqrt(np.mean(section * section))], ref=1.0
        )[0]), 2),
        "peak_db": round(float(librosa.amplitude_to_db(
            [np.max(np.abs(section))], ref=1.0
        )[0]), 2),
    })

peak = float(np.max(np.abs(y)))
beat_intervals = np.diff(beats)
report = {
    "duration": duration,
    "sample_rate": sample_rate,
    "tempo": float(np.asarray(tempo).item()),
    "beat_count": len(beats),
    "beat_interval_median": float(np.median(beat_intervals)),
    "beat_interval_std": float(np.std(beat_intervals)),
    "integrated_rms_db": float(librosa.amplitude_to_db(
        [np.sqrt(np.mean(mono * mono))], ref=1.0
    )[0]),
    "peak_dbfs": float(librosa.amplitude_to_db([peak], ref=1.0)[0]),
    "clipped_sample_fraction": float(np.mean(np.abs(y) >= 0.999)),
    "stereo_correlation": float(np.corrcoef(y[0], y[1])[0, 1]),
    "dynamic_range_rms_db": float(
        np.percentile(librosa.amplitude_to_db(rms, ref=1.0), 95)
        - np.percentile(librosa.amplitude_to_db(rms, ref=1.0), 10)
    ),
    "segments": segments,
}
print(json.dumps(report, indent=2))
