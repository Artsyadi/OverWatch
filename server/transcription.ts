import { pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';
// Narrow the generic pipeline factory to the only task used here.
const createASR = pipeline as unknown as (task: 'automatic-speech-recognition', model: string, options: { dtype: 'q8' }) => Promise<AutomaticSpeechRecognitionPipeline>;
let transcriber: Promise<AutomaticSpeechRecognitionPipeline> | undefined;
export async function transcribe(audio: Float32Array) {
    transcriber ??= createASR('automatic-speech-recognition', 'Xenova/whisper-tiny', { dtype: 'q8' }).catch(error => {
        transcriber = undefined;
        throw error;
    });
    const recognize = await transcriber;
    const result = await recognize(audio, { language: 'en', task: 'transcribe', max_new_tokens: 128 });
    return cleanTranscript((Array.isArray(result) ? result[0].text : result.text).trim());
}
export function readAudio(buffer: Buffer): Float32Array {
    if (buffer.length % 4 !== 0 || buffer.length < 16000 * 4 * 0.4 || buffer.length > 16000 * 4 * 31) throw new Error('Record between 0.4 and 30 seconds.');
    const audio = Float32Array.from({ length: buffer.length / 4 }, (_, i) => buffer.readFloatLE(i * 4));
    if (audio.some(value => !Number.isFinite(value) || Math.abs(value) > 1)) throw new Error('Invalid audio samples.');
    const energy = audio.reduce((sum, value) => sum + value * value, 0) / audio.length;
    const rms = Math.sqrt(energy);
    // Preserve quiet speech. The previous fixed threshold rejected usable low-gain microphones.
    if (rms < 0.00002) throw new Error('The recording is silent. Select a different microphone and check macOS Sound → Input.');
    if (rms < 0.02) {
        const peak = audio.reduce((maximum, value) => Math.max(maximum, Math.abs(value)), 0);
        const gain = Math.min(40, 0.06 / rms, 0.95 / peak);
        for (let i = 0; i < audio.length; i++) audio[i] *= gain;
    }
    return audio;
}

// Tiny speech models can loop on room noise; leave the draft untouched in that case.
export function cleanTranscript(text: string): string {
    const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
    return words.length > 16 && new Set(words).size / words.length < 0.25 ? '' : text.trim();
}
