"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { AudioSettings, buildGraph, renderWav } from "./audio-engine";
import { loadAudio, saveAudio } from "./local-db";
import { getCurrentUser, signIn, signOut, signUp, supabase, supabaseConfigured } from "../lib/supabase";
import type { User } from "@supabase/supabase-js";

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
  const [feedMode,setFeedMode]=useState<"all"|"new"|"popular">("all");
  const [saved, setSaved] = useState(false);
  const audioCtx = useRef<AudioContext | null>(null);
  const sourceNode = useRef<MediaElementAudioSourceNode | null>(null);
  const graphInput = useRef<GainNode | null>(null);
  const graphUpdate = useRef<((next:Partial<AudioSettings>)=>void) | null>(null);
  const [rendering, setRendering] = useState(false);
  const [trimStart,setTrimStart]=useState(0), [trimEnd,setTrimEnd]=useState(0), [fadeIn,setFadeIn]=useState(0), [fadeOut,setFadeOut]=useState(0), [loopCount,setLoopCount]=useState(1);
  const [projectName,setProjectName]=useState("My Edit"), [autoSaved,setAutoSaved]=useState(false);
  const [distortion,setDistortion]=useState(0);
  const [limiter,setLimiter]=useState(70);
  const [reverse,setReverse]=useState(false);
  const [exportFormat,setExportFormat]=useState("wav");
  const [accountOpen,setAccountOpen]=useState(false);
  const [accountMode,setAccountMode]=useState<"login"|"register">("login");
  const [accountEmail,setAccountEmail]=useState("");
  const [accountPassword,setAccountPassword]=useState("");
  const [accountMessage,setAccountMessage]=useState("");
  const [user,setUser]=useState<User|null>(null);
  const [authBusy,setAuthBusy]=useState(false);
  const [publishOpen,setPublishOpen]=useState(false);
  const [publishTitle,setPublishTitle]=useState("");
  const [publishTag,setPublishTag]=useState("#edit");
  const [allowDownload,setAllowDownload]=useState(true);
  const [rightsConfirmed,setRightsConfirmed]=useState(false);
  const [published,setPublished]=useState<any[]>([]);
  const [commentOpen,setCommentOpen]=useState<number|null>(null);
  const [comments,setComments]=useState<Record<number,string[]>>({});
  const [commentText,setCommentText]=useState("");
  const [playingPost,setPlayingPost]=useState<number|null>(null);
  const [postProgress,setPostProgress]=useState<Record<number,{current:number;duration:number}>>({});
  const [playedPosts,setPlayedPosts]=useState<Record<number,boolean>>({});
  const [reports,setReports]=useState<Record<string,boolean>>({});
  const settings: AudioSettings={speed,volume,bass,treble,reverb,echo,pitch,width,trimStart,trimEnd:trimEnd||duration,fadeIn,fadeOut,loopCount,distortion,limiter,reverse};

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  useEffect(()=>{if(!supabase)return;let active=true;(async()=>{const u=await getCurrentUser();if(active)setUser(u)})();const {data}=supabase.auth.onAuthStateChange((_event,session)=>{if(active)setUser(session?.user??null)});return()=>{active=false;data.subscription.unsubscribe()}},[]);


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
      const graph = buildGraph(audioCtx.current, sourceNode.current, settings);
      graphInput.current = graph.input;
      graphUpdate.current = graph.update;
    }
    if (audioCtx.current.state === "suspended") await audioCtx.current.resume();
  };

  useEffect(() => {
    graphUpdate.current?.({volume,bass,treble,reverb,echo,width,distortion,limiter});
  }, [volume,bass,treble,reverb,echo,width,distortion,limiter]);

  useEffect(()=>{try{const p=JSON.parse(localStorage.getItem("edit-music-project")||"{}"); if(p.projectName)setProjectName(p.projectName); if(typeof p.speed==="number")setSpeed(p.speed); if(typeof p.volume==="number")setVolume(p.volume); if(typeof p.bass==="number")setBass(p.bass); if(typeof p.treble==="number")setTreble(p.treble); if(typeof p.reverb==="number")setReverb(p.reverb); if(typeof p.echo==="number")setEcho(p.echo); if(typeof p.pitch==="number")setPitch(p.pitch); if(typeof p.width==="number")setWidth(p.width); if(typeof p.fadeIn==="number")setFadeIn(p.fadeIn); if(typeof p.fadeOut==="number")setFadeOut(p.fadeOut); if(typeof p.loopCount==="number")setLoopCount(p.loopCount); if(typeof p.distortion==="number")setDistortion(p.distortion); if(typeof p.limiter==="number")setLimiter(p.limiter); if(typeof p.reverse==="boolean")setReverse(p.reverse);}catch{}},[]);
  useEffect(()=>{localStorage.setItem("edit-music-project",JSON.stringify({projectName,speed,volume,bass,treble,reverb,echo,pitch,width,fadeIn,fadeOut,loopCount,distortion,limiter,reverse}));setAutoSaved(true);const t=setTimeout(()=>setAutoSaved(false),700);return()=>clearTimeout(t)},[projectName,speed,volume,bass,treble,reverb,echo,pitch,width,fadeIn,fadeOut,loopCount,distortion,limiter,reverse]);
  useEffect(()=>{let cancelled=false;(async()=>{try{const raw=JSON.parse(localStorage.getItem("edit-music-posts")||"[]");if(!Array.isArray(raw))return;const restored=await Promise.all(raw.map(async(post:any)=>{if(!post.audioId)return post;const blob=await loadAudio(post.audioId);return blob?{...post,localUrl:URL.createObjectURL(blob)}:post;}));if(!cancelled)setPublished(restored)}catch(e){console.error(e)}})();return()=>{cancelled=true}},[]);
  useEffect(()=>{try{const p=JSON.parse(localStorage.getItem("edit-music-likes")||"[]");if(Array.isArray(p))setLiked(p)}catch{}},[]);
  useEffect(()=>{localStorage.setItem("edit-music-likes",JSON.stringify(liked))},[liked]);
  useEffect(()=>{try{const p=JSON.parse(localStorage.getItem("edit-music-comments")||"{}");if(p&&typeof p==="object")setComments(p)}catch{}},[]);
  useEffect(()=>{localStorage.setItem("edit-music-comments",JSON.stringify(comments))},[comments]);
  useEffect(()=>{localStorage.setItem("edit-music-posts",JSON.stringify(published.map(({localUrl,...rest})=>rest)))},[published]);
  const allPosts=[...published,...demos];
  const visibleDemos = useMemo(() => {
    const filtered=allPosts.filter(d => `${d.title} ${d.user} ${d.tag}`.toLowerCase().includes(query.toLowerCase()));
    if(feedMode==="new") return filtered;
    if(feedMode==="popular") return [...filtered].sort((a,b)=>b.likes-a.likes);
    return filtered;
  }, [query,published,feedMode]);

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

  const publishEdit=async()=>{if(!publishTitle.trim()||!file||!rightsConfirmed){alert("Potwierdź, że masz prawa do publikowanego materiału.");return;}const audioId=crypto.randomUUID();try{await saveAudio(audioId,file);const post={id:crypto.randomUUID(),title:publishTitle.trim(),user:"@RedzikFN",tag:publishTag.startsWith("#")?publishTag:"#"+publishTag,likes:0,plays:0,allowDownload,audioId,localUrl:url};setPublished(x=>[post,...x]);setPublishTitle("");setRightsConfirmed(false);setPublishOpen(false);setTab("edittok");}catch(e){console.error(e);alert("Nie udało się zapisać audio w pamięci przeglądarki.");}};

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

  const sharePost = async (post:{title:string,user:string}) => {
    const text = `🎧 ${post.title} by ${post.user} • EDIT MUSIC`;
    try {
      if (navigator.share) await navigator.share({title:post.title,text});
      else await navigator.clipboard.writeText(text);
    } catch {}
  };

  const togglePostPlay = async (index:number, post:{localUrl?:string;plays?:number|string;id?:string}) => {
    if (!post.localUrl) return;
    const player=document.getElementById("edittok-audio-"+index) as HTMLAudioElement|null;
    if (!player) return;
    if (playingPost===index) { player.pause(); setPlayingPost(null); }
    else {
      document.querySelectorAll<HTMLAudioElement>(".edittok-audio").forEach(x=>x.pause());
      await player.play();
      setPlayingPost(index);
      if(!playedPosts[index]){setPlayedPosts(x=>({...x,[index]:true}));if(typeof post.plays==="number")setPublished(x=>x.map((item:any)=>item.id===post.id?{...item,plays:item.plays+1}:item));}
    }
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
        <button className="account-btn" onClick={()=>{setAccountOpen(true);setAccountMessage("")}}>👤 Konto</button><label className="upload-btn">＋ Upload<input type="file" accept="audio/*" onChange={chooseFile} hidden /></label>
      </header>

      {publishOpen && <div className="modal-backdrop" onClick={()=>setPublishOpen(false)}><div className="account-modal publish-modal" onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setPublishOpen(false)}>×</button><span className="pill">EDITTOK</span><h2>Publish edit</h2><input value={publishTitle} onChange={e=>setPublishTitle(e.target.value)} placeholder="Nazwa editu"/><input value={publishTag} onChange={e=>setPublishTag(e.target.value)} placeholder="#tag"/><label className="check"><input type="checkbox" checked={rightsConfirmed} onChange={e=>setRightsConfirmed(e.target.checked)}/> Mam prawo publikować ten materiał</label><label className="check"><input type="checkbox" checked={allowDownload} onChange={e=>setAllowDownload(e.target.checked)}/> Zezwól innym na pobieranie</label><button className="primary full" disabled={!rightsConfirmed} onClick={publishEdit}>🚀 Opublikuj</button><p className="muted">Publikacja w tej wersji jest lokalna. Prawdziwy upload do chmury podłączymy po konfiguracji Supabase.</p></div></div>}{accountOpen && <div className="modal-backdrop" onClick={()=>setAccountOpen(false)}><div className="account-modal" onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setAccountOpen(false)}>×</button><span className="pill">EDIT MUSIC ACCOUNT</span><h2>{accountMode==="login"?"Zaloguj się":"Utwórz konto"}</h2><p className="muted">{user?`Zalogowano jako ${user.email??"użytkownik"}`:supabaseConfigured?"Konto online • Supabase Auth":"Tryb demo • ustaw zmienne Supabase, aby włączyć konta online."}</p>{!user?<><input placeholder="E-mail" type="email" value={accountEmail} onChange={e=>setAccountEmail(e.target.value)} autoComplete="email"/><input placeholder="Hasło" type="password" value={accountPassword} onChange={e=>setAccountPassword(e.target.value)} autoComplete={accountMode==="login"?"current-password":"new-password"}/><button className="primary full" disabled={authBusy||!accountEmail||!accountPassword} onClick={async()=>{setAuthBusy(true);setAccountMessage("");const result=accountMode==="login"?await signIn(accountEmail,accountPassword):await signUp(accountEmail,accountPassword);setAuthBusy(false);if(result.error)setAccountMessage(result.error.message);else{setAccountMessage(accountMode==="register"?"Konto utworzone. Jeśli wymagane, sprawdź e-mail.":"Zalogowano.");if(result.user)setUser(result.user)}}}>{authBusy?"Łączenie...":accountMode==="login"?"Zaloguj":"Zarejestruj"}</button></>:<button className="secondary full" onClick={async()=>{const r=await signOut();if(r.error)setAccountMessage(r.error.message);else{setUser(null);setAccountMessage("Wylogowano.")}}}>Wyloguj</button>}{accountMessage&&<div className="account-message">{accountMessage}</div>}<button className="switch-auth" onClick={()=>setAccountMode(accountMode==="login"?"register":"login")}>{accountMode==="login"?"Nie masz konta? Zarejestruj się":"Masz już konto? Zaloguj się"}</button></div></div>}

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
          <div className="control-row"><label>📝 Projekt <input value={projectName} onChange={e=>setProjectName(e.target.value)} placeholder="Nazwa projektu"/></label><span className="autosave">{autoSaved?"✓ Auto-saved":"Saved locally"}</span><label>🔊 Volume <input type="range" min="0" max="1" step=".01" value={volume} onChange={e=>setVolume(+e.target.value)}/><b>{Math.round(volume*100)}%</b></label><button className={saved?"secondary saved":"secondary"} onClick={()=>setSaved(!saved)}>{saved?"✓ Saved":"☆ Save project"}</button></div>
          <div className="presets"><div className="subhead"><b>PRESETS</b><span>One click starting points</span></div><div className="preset-grid">{presets.map(p=><button key={p.name} onClick={()=>applyPreset(p)}><span>{p.emoji}</span>{p.name}</button>)}</div></div>
          <div className="timeline-tools"><div><b>✂️ Trim</b><span>{fmt(trimStart)} → {fmt(trimEnd||duration)}</span></div><label>Start<input type="range" min="0" max={Math.max(duration,.01)} step=".01" value={trimStart} onChange={e=>setTrimStart(Math.min(+e.target.value,Math.max(0,(trimEnd||duration)-.05)))}/></label><label>Koniec<input type="range" min="0" max={Math.max(duration,.01)} step=".01" value={trimEnd||duration} onChange={e=>setTrimEnd(Math.max(trimStart+.05,+e.target.value))}/></label><div className="fade-grid"><label>Fade in<input type="range" min="0" max="10" step=".1" value={fadeIn} onChange={e=>setFadeIn(+e.target.value)}/><b>{fadeIn.toFixed(1)}s</b></label><label>Fade out<input type="range" min="0" max="10" step=".1" value={fadeOut} onChange={e=>setFadeOut(+e.target.value)}/><b>{fadeOut.toFixed(1)}s</b></label></div><label>🔁 Loop<select value={loopCount} onChange={e=>setLoopCount(+e.target.value)}><option value="1">1×</option><option value="2">2×</option><option value="3">3×</option><option value="4">4×</option><option value="8">8×</option></select></label></div><div className="controls-grid">
            {[
              ["Bass",bass,setBass,-50,50],["Treble",treble,setTreble,-50,50],["Reverb",reverb,setReverb,0,100],["Echo / Delay",echo,setEcho,0,100],["Pitch",pitch,setPitch,-12,12],["Stereo Width",width,setWidth,0,100],["Distortion",distortion,setDistortion,0,100],["Limiter",limiter,setLimiter,0,100]
            ].map(([name,value,setter,min,max])=><label className="control" key={name}><div><span>{name}</span><b>{String(value)}{name==="Pitch"?" st":""}</b></div><input type="range" min={String(min)} max={String(max)} value={String(value)} onChange={e=>(setter as (v:number)=>void)(+e.target.value)}/></label>)}
          </div>
          <div className="export-panel"><label>Format<select value={exportFormat} onChange={e=>setExportFormat(e.target.value)}><option value="wav">WAV • bezstratny</option><option value="mp3" disabled>MP3 • wkrótce</option><option value="flac" disabled>FLAC • wkrótce</option></select></label><label>Nazwa pliku<input value={projectName} onChange={e=>setProjectName(e.target.value)} /></label></div><div className="extra-tools"><button className={reverse?"tool active":"tool"} onClick={()=>setReverse(!reverse)}>↩️ {reverse?"Reverse ON":"Reverse"}</button><button className="tool" onClick={()=>{setBass(0);setTreble(0);setReverb(0);setEcho(0);setPitch(0);setWidth(0);setDistortion(0);setLimiter(70);setSpeed(1);}}>↺ Reset effects</button></div><div className="publish-row"><button className="secondary" disabled={!file} onClick={()=>setPublishOpen(true)}>🎵 Publish to EditTok</button><span>Opublikuj bieżący edit jako twórca.</span></div><div className="render-box"><div><b>Export {exportFormat.toUpperCase()}</b><span>Efekty są renderowane lokalnie na Twoim urządzeniu.</span></div><button className="primary" onClick={renderEdit} disabled={rendering}>{rendering ? "Rendering..." : "Render edit →"}</button></div>
        </div>}
      </section>}

      {tab === "edittok" && <section className="page">
        <div className="section-head"><div><span>EDITTOK</span><h2>Discover edits</h2></div><div className="search">⌕ <input placeholder="Szukaj editów..." value={query} onChange={e=>setQuery(e.target.value)} /></div></div>
        <div className="feed-tabs"><button className={feedMode==="all"?"active":""} onClick={()=>setFeedMode("all")}>✨ Dla Ciebie</button><button className={feedMode==="new"?"active":""} onClick={()=>setFeedMode("new")}>🆕 Nowe</button><button className={feedMode==="popular"?"active":""} onClick={()=>setFeedMode("popular")}>🔥 Popularne</button></div><div className="feed">{visibleDemos.map((d,i)=><article className="edit-card" key={d.title+"-"+i}><div className="cover"><div className="cover-orb">{["🌙","💜","🕶️","☁️"][i%4]}</div><span>♪</span></div><div className="edit-info">{d.localUrl&&<audio id={"edittok-audio-"+i} className="edittok-audio" src={d.localUrl} onLoadedMetadata={e=>setPostProgress(x=>({...x,[i]:{current:x[i]?.current||0,duration:e.currentTarget.duration}}))} onTimeUpdate={e=>setPostProgress(x=>({...x,[i]:{current:e.currentTarget.currentTime,duration:e.currentTarget.duration}}))} onEnded={()=>setPlayingPost(null)} preload="metadata" /> }<div className="tag">{d.tag}</div><h3>{d.title}</h3><p>{d.user}</p><div className="card-actions"><button onClick={()=>setLiked(x=>x.includes(i)?x.filter(n=>n!==i):[...x,i])}>{liked.includes(i)?"❤️":"♡"} {d.likes+(liked.includes(i)?1:0)}</button><button onClick={()=>togglePostPlay(i,d)}>{playingPost===i?"❚❚":"▶"} {d.plays}</button>{d.localUrl&&<div className="post-progress"><input type="range" min="0" max={postProgress[i]?.duration||1} step=".01" value={postProgress[i]?.current||0} onChange={e=>{const v=+e.target.value;const a=document.getElementById("edittok-audio-"+i) as HTMLAudioElement|null;if(a)a.currentTime=v;setPostProgress(x=>({...x,[i]:{current:v,duration:x[i]?.duration||1}}))}}/><span>{fmt(postProgress[i]?.current||0)} / {fmt(postProgress[i]?.duration||0)}</span></div>}<button onClick={()=>sharePost(d)}>↗ Share</button><button onClick={()=>setCommentOpen(commentOpen===i?null:i)}>💬 {comments[i]?.length||0}</button><button disabled={d.allowDownload===false} onClick={()=>{if(d.localUrl){const a=document.createElement("a");a.href=d.localUrl;a.download=d.title+".audio";a.click()}}}>⬇ {d.allowDownload===false?"Locked":"Download"}</button><button onClick={()=>{setReports(x=>({...x,[d.title]:!x[d.title]}));alert("Zgłoszenie zapisane lokalnie. Moderacja online będzie dostępna po podłączeniu backendu.")}}>⚑ {reports[d.title]?"Reported":"Report"}</button></div>{commentOpen===i&&<div className="comments"><div>{(comments[i]||[]).map((c,n)=><p key={n}>💬 {c}</p>)}</div><div className="comment-input"><input value={commentText} onChange={e=>setCommentText(e.target.value)} placeholder="Napisz komentarz..."/><button onClick={()=>{if(!commentText.trim())return;setComments(x=>({...x,[i]:[...(x[i]||[]),commentText.trim()]}));setCommentText("")}}>Wyślij</button></div></div>}</div></article>)}</div>
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
