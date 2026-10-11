import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { classifyQuality, lossBetween, type Quality, type Signal, type VideoStatus } from './videoLogic';

export type CallState = 'idle' | 'starting' | 'waiting' | 'connecting' | 'connected' | 'error';

const HEARTBEAT_MS = 30_000;
const STATS_MS = 3_000;

/**
 * 1:1 WebRTC call between the two players of a game ("perfect negotiation" pattern).
 * Signalling: private Realtime Broadcast channel `video:<gameId>` (only players may join, see 0005_video.sql).
 * Media goes peer to peer (TURN relay only when needed) and is never recorded.
 */
export function useVideoCall(gameId: string, enabled: boolean, polite: boolean) {
  const [state, setState] = useState<CallState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<VideoStatus | null>(null);
  const [local, setLocal] = useState<MediaStream | null>(null);
  const [remote, setRemote] = useState<MediaStream | null>(null);
  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [quality, setQuality] = useState<Quality>('unknown');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const makingOffer = useRef(false);
  const ignoreOffer = useRef(false);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const iceServers = useRef<RTCIceServer[] | null>(null);

  const send = useCallback((msg: Signal) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'signal', payload: msg });
  }, []);

  const refreshStatus = useCallback(async (beat = false) => {
    if (!supabase) return null;
    const { data, error: e } = await supabase.rpc(beat ? 'video_heartbeat' : 'video_status', { p_game: gameId });
    if (e) return null;
    setStatus(data as VideoStatus);
    return data as VideoStatus;
  }, [gameId]);

  const loadIce = useCallback(async (): Promise<RTCIceServer[] | 'quota' | null> => {
    if (iceServers.current) return iceServers.current;
    if (!supabase) return null;
    const { data, error: e } = await supabase.functions.invoke('turn-credentials', { body: { gameId } });
    if (e) {
      const body = await (e as { context?: Response }).context?.json?.().catch(() => ({})) ?? {};
      return body.error === 'video_quota_exhausted' ? 'quota' : null;
    }
    iceServers.current = data.iceServers as RTCIceServer[];
    return iceServers.current;
  }, [gameId]);

  const closePc = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    setRemote(null);
    setQuality('unknown');
  }, []);

  const ensurePc = useCallback(async (): Promise<RTCPeerConnection | null> => {
    if (pcRef.current) return pcRef.current;
    const ice = await loadIce();
    if (ice === 'quota') { setError('quota'); await refreshStatus(); return null; }
    if (!ice) { setError('network'); setState('error'); return null; }
    if (pcRef.current) return pcRef.current;
    const pc = new RTCPeerConnection({ iceServers: ice });
    pcRef.current = pc;
    const remoteStream = new MediaStream();
    setRemote(remoteStream);
    pc.ontrack = ({ track }) => {
      remoteStream.addTrack(track);
      setRemote(new MediaStream(remoteStream.getTracks()));
    };
    pc.onicecandidate = ({ candidate }) => { if (candidate) send({ type: 'candidate', candidate: candidate.toJSON() }); };
    pc.onnegotiationneeded = async () => {
      try {
        makingOffer.current = true;
        await pc.setLocalDescription();
        if (pc.localDescription) send({ type: 'description', description: pc.localDescription.toJSON() });
      } catch { /* the next negotiation retries */ } finally {
        makingOffer.current = false;
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc !== pcRef.current) return;
      if (pc.connectionState === 'connected') setState('connected');
      else if (pc.connectionState === 'failed') pc.restartIce();
      else if (pc.connectionState === 'connecting') setState('connecting');
    };
    localRef.current?.getTracks().forEach((t) => pc.addTrack(t, localRef.current!));
    return pc;
  }, [loadIce, refreshStatus, send]);

  const handle = useCallback(async (msg: Signal) => {
    if (msg.type === 'bye') { closePc(); setState(localRef.current ? 'waiting' : 'idle'); return; }
    if (msg.type === 'hello') {
      // The other side (re)joined: start a fresh connection if we are sending video.
      if (localRef.current) { closePc(); await ensurePc(); }
      return;
    }
    const pc = await ensurePc();
    if (!pc) return;
    if (msg.type === 'description') {
      const offerCollision = msg.description.type === 'offer' && (makingOffer.current || pc.signalingState !== 'stable');
      ignoreOffer.current = !polite && offerCollision;
      if (ignoreOffer.current) return;
      await pc.setRemoteDescription(msg.description);
      if (msg.description.type === 'offer') {
        await pc.setLocalDescription();
        if (pc.localDescription) send({ type: 'description', description: pc.localDescription.toJSON() });
      }
      setState((cur) => (cur === 'idle' ? 'connecting' : cur));
    } else if (msg.type === 'candidate') {
      try { await pc.addIceCandidate(msg.candidate); } catch (e) { if (!ignoreOffer.current) throw e; }
    }
  }, [closePc, ensurePc, polite, send]);

  const handleRef = useRef(handle);
  handleRef.current = handle;

  // Join the signalling channel while the game page is open.
  useEffect(() => {
    if (!supabase || !enabled) return;
    const client = supabase;
    void refreshStatus();
    let cancelled = false;
    void client.realtime.setAuth().then(() => {
      if (cancelled) return;
      const ch = client.channel(`video:${gameId}`, { config: { private: true, broadcast: { self: false } } })
        .on('broadcast', { event: 'signal' }, ({ payload }) => {
          queue.current = queue.current.then(() => handleRef.current(payload as Signal)).catch(() => undefined);
        })
        .subscribe((s) => { if (s === 'SUBSCRIBED') send({ type: 'hello' }); });
      channelRef.current = ch;
    });
    return () => {
      cancelled = true;
      if (channelRef.current) { send({ type: 'bye' }); void client.removeChannel(channelRef.current); channelRef.current = null; }
      pcRef.current?.close();
      pcRef.current = null;
      localRef.current?.getTracks().forEach((t) => t.stop());
      localRef.current = null;
    };
  }, [gameId, enabled, refreshStatus, send]);

  const hangUp = useCallback(() => {
    send({ type: 'bye' });
    closePc();
    localRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    setLocal(null);
    setState('idle');
  }, [closePc, send]);

  // Count usage and enforce the free quota while connected; sample connection quality.
  useEffect(() => {
    if (state !== 'connected') return;
    let prev: { lost: number; received: number } | null = null;
    const beat = async () => {
      const s = await refreshStatus(true);
      if (s && !s.allowed) { setError('quota'); hangUp(); }
    };
    void beat();
    const hb = setInterval(beat, HEARTBEAT_MS);
    const st = setInterval(async () => {
      const pc = pcRef.current;
      if (!pc) return;
      let rtt: number | null = null;
      let cur = { lost: 0, received: 0 };
      (await pc.getStats()).forEach((r) => {
        if (r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded' && typeof r.currentRoundTripTime === 'number') rtt = r.currentRoundTripTime;
        if (r.type === 'inbound-rtp') cur = { lost: cur.lost + (r.packetsLost ?? 0), received: cur.received + (r.packetsReceived ?? 0) };
      });
      setQuality(classifyQuality(rtt, lossBetween(prev, cur)));
      prev = cur;
    }, STATS_MS);
    return () => { clearInterval(hb); clearInterval(st); };
  }, [state, refreshStatus, hangUp]);

  const start = useCallback(async (deviceIds?: { video?: string; audio?: string }) => {
    setError(null);
    const s = await refreshStatus();
    if (s && !s.allowed) { setError('quota'); return; }
    setState('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: deviceIds?.video ? { deviceId: { exact: deviceIds.video } } : { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: deviceIds?.audio ? { deviceId: { exact: deviceIds.audio } } : { echoCancellation: true, noiseSuppression: true },
      });
      localRef.current = stream;
      setLocal(stream);
      setCamOn(true);
      setMicOn(true);
      setDevices((await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind !== 'audiooutput'));
      const pc = pcRef.current;
      if (pc) stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      else await ensurePc();
      setState(pcRef.current?.connectionState === 'connected' ? 'connected' : 'waiting');
    } catch {
      setError('media');
      setState('error');
    }
  }, [ensurePc, refreshStatus]);

  const toggle = useCallback((kind: 'video' | 'audio') => {
    const tracks = kind === 'video' ? localRef.current?.getVideoTracks() : localRef.current?.getAudioTracks();
    const on = !(tracks?.[0]?.enabled ?? false);
    tracks?.forEach((t) => { t.enabled = on; });
    if (kind === 'video') setCamOn(on); else setMicOn(on);
  }, []);

  /** Switches camera or microphone without renegotiating. */
  const switchDevice = useCallback(async (kind: 'videoinput' | 'audioinput', deviceId: string) => {
    const stream = localRef.current;
    if (!stream) return;
    const media = await navigator.mediaDevices.getUserMedia(kind === 'videoinput'
      ? { video: { deviceId: { exact: deviceId } } } : { audio: { deviceId: { exact: deviceId } } });
    const track = media.getTracks()[0];
    const old = kind === 'videoinput' ? stream.getVideoTracks()[0] : stream.getAudioTracks()[0];
    track.enabled = old?.enabled ?? true;
    const sender = pcRef.current?.getSenders().find((s) => s.track === old);
    await sender?.replaceTrack(track);
    if (old) { stream.removeTrack(old); old.stop(); }
    stream.addTrack(track);
    setLocal(new MediaStream(stream.getTracks()));
  }, []);

  return { state, error, status, local, remote, camOn, micOn, quality, devices, start, hangUp, toggle, switchDevice };
}
