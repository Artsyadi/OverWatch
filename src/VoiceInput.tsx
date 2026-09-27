import { useEffect, useRef, useState } from 'react';
import { Mic, Square, LoaderCircle } from 'lucide-react';

export default function VoiceInput({ onTranscript }: { onTranscript: (text: string) => void }) {
    const [phase, setPhase] = useState<'idle' | 'permission' | 'recording' | 'transcribing'>('idle');
    const [message, setMessage] = useState('');
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    const [deviceId, setDeviceId] = useState('');
    async function refreshDevices() {
        const inputs = (await navigator.mediaDevices.enumerateDevices()).filter(item => item.kind === 'audioinput');
        if (mounted.current) setDevices(inputs);
    }
    const recorder = useRef<MediaRecorder | null>(null);
    const stream = useRef<MediaStream | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const request = useRef<AbortController | null>(null);
    const mounted = useRef(true);
    useEffect(() => { mounted.current = true; return () => {
        mounted.current = false;
        clearTimeout(timer.current);
        request.current?.abort();
        if (recorder.current) { recorder.current.onstop = null; recorder.current.ondataavailable = null; if (recorder.current.state !== 'inactive') recorder.current.stop(); }
        stream.current?.getTracks().forEach(track => track.stop());
    }; }, []);
    async function convert(chunks: Blob[]) {
        stream.current?.getTracks().forEach(track => track.stop());
        stream.current = null;
        clearTimeout(timer.current);
        if (!mounted.current) return;
        const recorded = new Blob(chunks, { type: recorder.current?.mimeType || chunks[0]?.type });
        setPhase('transcribing');
        setMessage('Transcribing on this Mac… First use downloads the speech model.');
        let context: AudioContext | undefined;
        const controller = new AbortController(); request.current = controller;
        const timeout = setTimeout(() => controller.abort(), 180000);
        try {
            context = new AudioContext();
            const decoded = await context.decodeAudioData(await recorded.arrayBuffer());
            const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
            const source = offline.createBufferSource(); source.buffer = decoded; source.connect(offline.destination); source.start();
            const pcm = (await offline.startRendering()).getChannelData(0);
            const response = await fetch('/api/transcribe', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: new Blob([new Float32Array(pcm).buffer]), signal: controller.signal });
            if (!response.ok) {
                const data = await response.json().catch(() => null);
                throw new Error(data?.error ?? 'Transcription could not finish. Please try again.');
            }
            const data: {text: string} = await response.json();
            if (mounted.current) {
                if (!data.text.trim()) throw new Error('No speech recognized. Speak clearly and try again.');
                onTranscript(data.text.trim()); setMessage('');
            }
        } catch (error) {
            if (mounted.current) setMessage(controller.signal.aborted ? 'Transcription timed out. Please retry once the model has downloaded.' : error instanceof Error ? error.message : 'Could not transcribe audio. Please try again.');
        } finally {
            clearTimeout(timeout); await context?.close().catch(() => {});
            if (mounted.current) setPhase('idle');
        }
    }
    async function toggle() {
        if (phase === 'recording') { recorder.current?.stop(); return; }
        if (phase !== 'idle') return;
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { setMessage('Microphone recording is unavailable here. Open localhost:3000 in Chrome or Safari.'); return; }
        setPhase('permission'); setMessage('Allow microphone access to record. Audio is transcribed locally on this Mac.');
        try {
            const media = await navigator.mediaDevices.getUserMedia({ audio: { ...(deviceId ? { deviceId: { exact: deviceId } } : {}), channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: true } });
            if (!mounted.current) { media.getTracks().forEach(track => track.stop()); return; }
            stream.current = media;
            void refreshDevices().catch(() => {});
            const active = new MediaRecorder(media); recorder.current = active;
            const chunks: Blob[] = [];
            active.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
            active.onstop = () => { void convert(chunks); };
            active.onerror = () => {
                active.onstop = null; clearTimeout(timer.current);
                media.getTracks().forEach(track => track.stop());
                if (mounted.current) { setPhase('idle'); setMessage('Recording failed. Check your microphone and retry.'); }
            };
            active.start(); setPhase('recording'); setMessage('Recording in English… Click stop to transcribe. Maximum 30 seconds.');
            timer.current = setTimeout(() => { if (active.state === 'recording') active.stop(); }, 30000);
        } catch (error) {
            stream.current?.getTracks().forEach(track => track.stop());
                if (mounted.current) { setPhase('idle'); setMessage(error instanceof DOMException && error.name === 'NotAllowedError' ? 'Microphone access denied. Allow it in browser and macOS settings, then retry.' : 'Could not access your microphone. Check the input device and retry.'); }
        }
    }
    const busy = phase === 'permission' || phase === 'transcribing';
    return <><button type="button" className={`voice-input ${phase === 'recording' ? 'listening' : ''}`} disabled={busy} aria-label={phase === 'recording' ? 'Stop and transcribe' : busy ? 'Transcribing or preparing microphone' : 'Start voice input'} aria-pressed={phase === 'recording'} title={phase === 'recording' ? 'Stop and transcribe' : 'Record a voice message'} onClick={() => void toggle()}>{phase === 'recording' ? <Square size={14}/> : busy ? <LoaderCircle size={16}/> : <Mic size={16}/>}</button>{message && <div className="voice-feedback">
        {devices.length > 0 && <label className="voice-device">Microphone<select aria-label="Recording microphone" value={deviceId} disabled={phase !== 'idle'} onChange={event => setDeviceId(event.target.value)}><option value="">System default</option>{devices.filter(device => device.deviceId !== 'default' && device.deviceId !== 'communications').map((device, index) => <option key={device.deviceId || index} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>)}</select></label>}
        <small className="voice-status" role="status">{message}</small>
        </div>}</>;
}
