import { describe, expect, it } from 'vitest';
import { readAudio, cleanTranscript } from '../server/transcription';
const samples = (value: number, count = 16000) => Buffer.from(new Float32Array(count).fill(value).buffer);
describe('microphone audio validation', () => {
    it('keeps 16 kHz float samples intact', () => expect(readAudio(samples(0.1))[0]).toBeCloseTo(0.1));
    it('rejects silence instead of hallucinating speech', () => expect(() => readAudio(samples(0))).toThrow('recording is silent'));
    it('rejects corrupt and non-finite audio', () => {
        expect(() => readAudio(Buffer.alloc(25601))).toThrow();
        expect(() => readAudio(samples(NaN))).toThrow('Invalid audio');
        expect(() => readAudio(samples(2))).toThrow('Invalid audio');
    });
    it('bounds recording duration', () => {
        expect(() => readAudio(samples(0.1, 100))).toThrow('Record between');
        expect(() => readAudio(samples(0.1, 16000 * 32))).toThrow('Record between');
    });
});

it('discards repetitive noise hallucinations but keeps instructions', () => {
    expect(cleanTranscript("It's like this. ".repeat(10))).toBe('');
    expect(cleanTranscript('The aisle is clear. Please resume the task.')).toBe('The aisle is clear. Please resume the task.');
});

it('amplifies quiet microphone audio instead of rejecting it as silence', () => {
    const quiet = Buffer.from(Float32Array.from({length:16000}, (_, i) => Math.sin(i / 10) * 0.001).buffer);
    const audio = readAudio(quiet);
    expect(Math.max(...audio)).toBeGreaterThan(0.02);
});
