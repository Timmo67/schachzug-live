import { useEffect, useRef, useState } from 'react';
import { useVideoCall } from './useVideoCall';
import { QUALITY_LABEL, allowanceText } from './videoLogic';
import './video.css';

type Props = { gameId: string; polite: boolean; opponentName: string };

function Video({ stream, muted, label, testId }: { stream: MediaStream | null; muted: boolean; label: string; testId: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream;
  }, [stream]);
  return <video ref={ref} autoPlay playsInline muted={muted} aria-label={label} data-testid={testId} />;
}

const ERROR_TEXT: Record<string, string> = {
  media: 'Kamera oder Mikrofon konnte nicht gestartet werden. Bitte erlaube den Zugriff in deinem Browser.',
  network: 'Die Videoverbindung konnte nicht aufgebaut werden. Bitte später erneut versuchen.',
};

/** Video next to the board. Own camera starts only on request; the opponent's video shows when they send. */
export function VideoPanel({ gameId, polite, opponentName }: Props) {
  const call = useVideoCall(gameId, true, polite);
  const [showDevices, setShowDevices] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageVisible, setStageVisible] = useState(true);
  const hasRemoteVideo = !!call.remote?.getVideoTracks().length;
  const sending = !!call.local;
  const cams = call.devices.filter((d) => d.kind === 'videoinput');
  const mics = call.devices.filter((d) => d.kind === 'audioinput');
  const blocked = call.status ? !call.status.allowed : false;

  // Picture-in-picture: when the video panel is scrolled away (phones: it sits below the board),
  // the opponent stays visible in a small floating window. Tapping it scrolls back to the panel.
  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setStageVisible(e.intersectionRatio >= 0.6), { threshold: 0.6 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section className="videobox" aria-label="Videochat" data-testid="video">
      <div className="stage" ref={stageRef}>
        {hasRemoteVideo
          ? <Video stream={call.remote} muted={false} label={`Video von ${opponentName}`} testId="remote-video" />
          : <div className="placeholder">{sending ? `Warte auf ${opponentName} …` : `Videochat mit ${opponentName}`}</div>}
        {sending && (
          <div className={`self${call.camOn ? '' : ' off'}`}>
            <Video stream={call.local} muted label="Dein Video" testId="local-video" />
          </div>
        )}
        {call.state === 'connected' && <span className={`quality q-${call.quality}`} data-testid="quality">{QUALITY_LABEL[call.quality]}</span>}
      </div>

      <div className="row">
        {!sending ? (
          <button type="button" className="primary" disabled={blocked || call.state === 'starting'} onClick={() => void call.start()}>
            {hasRemoteVideo ? 'Kamera einschalten' : 'Video starten'}
          </button>
        ) : (
          <>
            <button type="button" aria-pressed={!call.camOn} onClick={() => call.toggle('video')}>{call.camOn ? 'Kamera aus' : 'Kamera an'}</button>
            <button type="button" aria-pressed={!call.micOn} onClick={() => call.toggle('audio')}>{call.micOn ? 'Mikro aus' : 'Mikro an'}</button>
            <button type="button" onClick={() => setShowDevices(!showDevices)}>Geräte</button>
            <button type="button" className="danger" onClick={call.hangUp}>Beenden</button>
          </>
        )}
      </div>

      {showDevices && sending && (
        <div className="devices">
          {cams.length > 1 && (
            <label>Kamera
              <select onChange={(e) => void call.switchDevice('videoinput', e.target.value)}
                defaultValue={call.local?.getVideoTracks()[0]?.getSettings().deviceId}>
                {cams.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Kamera ${i + 1}`}</option>)}
              </select>
            </label>
          )}
          {mics.length > 1 && (
            <label>Mikrofon
              <select onChange={(e) => void call.switchDevice('audioinput', e.target.value)}
                defaultValue={call.local?.getAudioTracks()[0]?.getSettings().deviceId}>
                {mics.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Mikrofon ${i + 1}`}</option>)}
              </select>
            </label>
          )}
          {cams.length <= 1 && mics.length <= 1 && <p className="note">Nur eine Kamera und ein Mikrofon gefunden.</p>}
        </div>
      )}

      {call.error && call.error !== 'quota' && <p className="error" role="status">{ERROR_TEXT[call.error]}</p>}
      <p className={blocked || call.error === 'quota' ? 'error' : 'note'} data-testid="video-allowance">{allowanceText(call.status)}</p>
      <p className="note">Video läuft direkt zwischen euch und wird nicht gespeichert. Seid ihr im selben Raum, gibt es ein Pfeifen – dann Kopfhörer nutzen oder ein Mikro ausschalten.</p>
      {hasRemoteVideo && !stageVisible && (
        <button type="button" className="pip" aria-label={`Video von ${opponentName} – zum Videochat`}
          onClick={() => stageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
          <Video stream={call.remote} muted label={`Video von ${opponentName} (klein)`} testId="pip-video" />
        </button>
      )}
    </section>
  );
}
