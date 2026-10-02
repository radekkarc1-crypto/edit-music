"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { AudioSettings, buildGraph, renderWav } from "./audio-engine";

type Tab = "home" | "studio" | "edittok" | "profile";
type Preset = { name: string; emoji: string; speed: number; bass: number; treble: number; reverb: number; echo: number; width: number };

const presets: Preset[] = [
  { name: "SLOWED + REVERB", emoji: "🌙", speed: .82, bass: 18, treble: -4, reverb: 48, echo: 22, width: 34 },
  { name: "SPEED UP", emoji: "⚡", speed: 1.28, bass: 4, treble: 5, reverb: 4, echo: 0, width: 12 },
  { name: "NIGHTCORE", emoji: "💿", speed: 1.2, bass: 0, treble: 12, reverb: 8, echo: 4, width: 18 },
  { name: "BASS BOOST", emoji: "🔊", speed: 1, bass: 28, treble: 2, reverb: 6, echo: 0, width: 8 },
  { name: "DREAMY", emoji: "☁️", speed: .94, bass: 8, treble: 5, reverb: 62, echo: 28, width: 52 },
  { name: "RADIO", emoji: "📻", speed: 1, bass: -12, treble: 14, reverb: 2, echo: 0, width: 0 },
  { name: "PHONK", emoji: "🕶️", speed: .96, bass: 24, treble: 10, reverb: 12, echo: 3, width: 18 },
  { name: "8D", emoji: "🌀", speed: 1, bass: 6, treble: 3, reverb: 25, echo: 8, width: 100 },
];

const demos = [
  { title: "MIDNIGHT DRIVE", user: "@RedzikFN", tag: "#night", likes: 128, plays: "2.4K" },
  { title: "SLOWED VIBES", user: "@editmaster", tag: "#slowed", likes: 94, plays: "1.8K" },
  { title: "PHONK RUN", user: "@KubaEdit", tag: "#phonk", likes: 241, plays: "5.1K" },
  { title: "DREAM LOOP", user: "@MajaWave", tag: "#dreamy", likes: 67, plays: "903" },
];

function fmt(sec: number) {
  if (!Number.isFinite(sec)) return "0:00";
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
}

export default function Home() {
  const [tab, setTab] = useState<Tab>("home");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [volume, setVolume] = useState(1);
  const [bass, setBass] = useState(0);
  const [treble, setTreble] = useState(0);
  const [reverb, setReverb] = useState(0);
  const [echo, setEcho] = useState(0);
  const [pitch, setPitch] = useState(0);
  const [width, setWidth] = useState(0);
  const [query, setQuery] = useState("");
  const [liked, setLiked] = useState<number[]>([]);
  const [saved, setSaved] = useState(false);
  const audioCtx = useRef<AudioContext | null>(null);
  const sourceNode = useRef<MediaElementAudioSourceNode | null>(null);
  const graphInput = useRef<GainNode | null>(null);
  const [rendering, setRendering] = useState(false);
  const settings: AudioSettings = { speed, volume, bass, treble, reverb, echo, pitch, width };

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    const rate = Math.max(.25, Math.min(3, speed * Math.pow(2, pitch / 12)));
    a.playbackRate = rate;
    if (graphInput.current) graphInput.current.gain.value = volume;
  }, [speed, pitch, volume]);

  const connectAudio = async () => {
    const a = audio.current;
    if (!a) return;
    if (!audioCtx.current) audioCtx.current = new AudioContext();
    if (!sourceNode.current) {
      sourceNode.current = audioCtx.current.createMediaElementSource(a);
      graphInput.current = buildGraph(audioCtx.current, sourceNode.current, settings).input;
    }
    if (audioCtx.current.state === "suspended") await audioCtx.current.resume();
  };

  useEffect(() => {
    if (!sourceNode.current || !audioCtx.current) return;
    graphInput.current?.gain.setTargetAtTime(volume, audioCtx.current.currentTime, .01);
  }, [volume]);

  const visibleDemos = useMemo(() => demos.filter(d => `${d.title} ${d.user} ${d.tag}`.toLowerCase().includes(query.toLowerCase())), [query]);

  const chooseFile = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    if (!picked) return;
    if (url) URL.revokeObjectURL(url);
    setFile(picked);
    setUrl(URL.createObjectURL(picked));
    setTab("studio");
    setCurrent(0);
    setPlaying(false);
  };

  const togglePlay = async () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) { await connectAudio(); await a.play(); setPlaying(true); } else { a.pause(); setPlaying(false); }
  };

  const applyPreset = (p: Preset) => {
    setSpeed(p.speed); setBass(p.bass); setTreble(p.treble); setReverb(p.reverb); setEcho(p.echo); setWidth(p.width);
  };

  const renderEdit = async () => {
    if (!file) return;
    try {
      setRendering(true);
      const blob = await renderWav(file, settings);
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${file.name.replace(/\.[^/.]+$/, "")}-EDIT-MUSIC.wav`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    } catch (err) {
      console.error(err);
      alert("Nie udało się wyrenderować pliku. Spróbuj ponownie.");
    } finally { setRendering(false); }
  };

  const downloadOriginal = () => {
    if (!url || !file) return;
    const link = document.createElement("a");
    link.href = url; link.download = file.name; link.click();
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setTab("home")}><span>♪</span> EDIT MUSIC</button>
        <nav>{(["home","studio","edittok","profile"] as Tab[]).map(t =>
          <button key={t} className={tab === t ? "nav active" : "nav"} onClick={() => setTab(t)}>
            {t === "home" ? "Home" : t === "studio" ? "Studio" : t === "edittok" ? "EditTok" : "Profil"}
          </button>)}</nav>
        <label className="upload-btn">＋ Upload<input type="file" accept="audio/*" onChange={chooseFile} hidden /></label>
      </header>

      {tab === "home" && <section className="page">
        <div className="hero">
          <div className="hero-copy">
            <span className="pill">THE MUSIC EDITOR + SOCIAL</span>
            <h1>YOUR SOUND.<br /><em>YOUR EDIT.</em></h1>
            <p>Edytuj muzykę, twórz własne brzmienie i publikuj edity w jednym miejscu.</p>
            <div className="hero-actions">
              <label className="primary">🎧 Start editing<input type="file" accept="audio/*" onChange={chooseFile} hidden /></label>
              <button className="secondary" onClick={() => setTab("edittok")}>Odkryj EditTok →</button>
            </div>
          </div>
          <div className="hero-card"><div className="vinyl">♪</div><div><b>EDIT MUSIC</b><small>MAKE IT YOURS</small></div><div className="wave-mini">▁▃▆▂▇▃▅▁▆▃▇</div></div>
        </div>
        <div className="section-head"><div><span>FEATURES</span><h2>Build your sound</h2></div></div>
        <div className="feature-grid">
          {[
            ["🎛️","Pro controls","Bass, treble, reverb, echo, pitch i stereo width."],
            ["⚡","Presets","Gotowe brzmienia do szybkiego startu."],
            ["🎵","EditTok","Publikuj i odkrywaj muzyczne edity."],
            ["⬇️","Downloads","Pobieraj własne pliki i treści udostępnione przez twórców."]
          ].map(([i,t,d]) => <article className="feature" key={t}><span>{i}</span><h3>{t}</h3><p>{d}</p></article>)}
        </div>
      </section>}

      {tab === "studio" && <section className="page studio-page">
        <div className="section-head"><div><span>STUDIO</span><h2>{file ? file.name : "Create your edit"}</h2></div><button className="secondary" onClick={downloadOriginal} disabled={!file}>⬇ Pobierz oryginał</button></div>
        {!file ? <label className="dropzone">🎧<strong>Wrzuć plik audio</strong><span>MP3, WAV, OGG, M4A i inne</span><input type="file" accept="audio/*" onChange={chooseFile} hidden /></label> :
        <div className="editor">
          <audio ref={audio} crossOrigin="anonymous" src={url} onLoadedMetadata={e => setDuration(e.currentTarget.duration)} onTimeUpdate={e => setCurrent(e.currentTarget.currentTime)} onEnded={() => setPlaying(false)} />
          <div className="player">
            <button className="play" onClick={togglePlay}>{playing ? "❚❚" : "▶"}</button>
            <div className="track"><div className="waveform">{Array.from({length:48},(_,i)=><i key={i} style={{height:`${16 + ((i*37)%55)}%`}} />)}</div><input type="range" min="0" max={duration || 1} step=".01" value={current} onChange={e => { const v=+e.target.value; setCurrent(v); if(audio.current) audio.current.currentTime=v; }} /><div className="times"><span>{fmt(current)}</span><span>{fmt(duration)}</span></div></div>
            <select value={speed} onChange={e => setSpeed(+e.target.value)}><option value=".75">0.75×</option><option value=".82">0.82×</option><option value="1">1×</option><option value="1.1">1.1×</option><option value="1.2">1.2×</option><option value="1.5">1.5×</option><option value="2">2×</option></select>
          </div>
          <div className="control-row"><label>🔊 Volume <input type="range" min="0" max="1" step=".01" value={volume} onChange={e=>setVolume(+e.target.value)}/><b>{Math.round(volume*100)}%</b></label><button className={saved?"secondary saved":"secondary"} onClick={()=>setSaved(!saved)}>{saved?"✓ Saved":"☆ Save project"}</button></div>
          <div className="presets"><div className="subhead"><b>PRESETS</b><span>One click starting points</span></div><div className="preset-grid">{presets.map(p=><button key={p.name} onClick={()=>applyPreset(p)}><span>{p.emoji}</span>{p.name}</button>)}</div></div>
          <div className="controls-grid">
            {[
              ["Bass",bass,setBass,-50,50],["Treble",treble,setTreble,-50,50],["Reverb",reverb,setReverb,0,100],["Echo / Delay",echo,setEcho,0,100],["Pitch",pitch,setPitch,-12,12],["Stereo Width",width,setWidth,0,100]
            ].map(([name,value,setter,min,max])=><label className="control" key={name}><div><span>{name}</span><b>{String(value)}{name==="Pitch"?" st":""}</b></div><input type="range" min={String(min)} max={String(max)} value={String(value)} onChange={e=>(setter as (v:number)=>void)(+e.target.value)}/></label>)}
          </div>
          <div className="render-box"><div><b>Export WAV</b><span>Efekty są renderowane do prawdziwego pliku WAV na Twoim urządzeniu.</span></div><button className="primary" onClick={renderEdit} disabled={rendering}>{rendering ? "Rendering..." : "Render edit →"}</button></div>
        </div>}
      </section>}

      {tab === "edittok" && <section className="page">
        <div className="section-head"><div><span>EDITTOK</span><h2>Discover edits</h2></div><div className="search">⌕ <input placeholder="Szukaj editów..." value={query} onChange={e=>setQuery(e.target.value)} /></div></div>
        <div className="feed">{visibleDemos.map((d,i)=><article className="edit-card" key={d.title}><div className="cover"><div className="cover-orb">{["🌙","💜","🕶️","☁️"][i]}</div><span>♪</span></div><div className="edit-info"><div className="tag">{d.tag}</div><h3>{d.title}</h3><p>{d.user}</p><div className="card-actions"><button onClick={()=>setLiked(x=>x.includes(i)?x.filter(n=>n!==i):[...x,i])}>{liked.includes(i)?"❤️":"♡"} {d.likes+(liked.includes(i)?1:0)}</button><button>▶ {d.plays}</button><button>↗ Share</button><button>⬇ Download</button></div></div></article>)}</div>
      </section>}

      {tab === "profile" && <section className="page profile-page">
        <div className="profile-hero"><div className="avatar">R</div><div><span>@RedzikFN</span><h2>RedzikFN</h2><p>Creator • Music edits • 🎧</p></div><button className="primary">Edit profile</button></div>
        <div className="stats"><div><b>3</b><span>Editów</span></div><div><b>12.4K</b><span>Odtworzeń</span></div><div><b>486</b><span>Polubień</span></div><div><b>∞</b><span>Pomysłów</span></div></div>
        <h2>Twoje edity</h2><div className="mini-grid">{demos.slice(0,3).map(d=><div className="mini-card" key={d.title}><div className="cover"><div className="cover-orb">♪</div></div><b>{d.title}</b><span>{d.tag}</span></div>)}</div>
      </section>}

      <footer>EDIT MUSIC <span>•</span> Create. Edit. Share.</footer>
    </main>
  );
}
