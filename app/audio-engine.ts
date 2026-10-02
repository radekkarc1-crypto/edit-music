export type AudioSettings = {
  speed:number; volume:number; bass:number; treble:number; reverb:number; echo:number; pitch:number; width:number; trimStart:number; trimEnd:number; fadeIn:number; fadeOut:number; loopCount:number; distortion:number; limiter:number; reverse:boolean;
};

function makeDistortionCurve(amount:number) {
  const n=44100, curve=new Float32Array(n), k=Math.max(0,amount)*4;
  for(let i=0;i<n;i++){const x=i*2/n-1; curve[i]=k?((3+k)*x*20*Math.PI/180)/(Math.PI+k*Math.abs(x)):x;}
  return curve;
}

export function makeImpulse(ctx:BaseAudioContext, seconds:number, decay:number) {
  const length=Math.max(1,Math.floor(ctx.sampleRate*seconds));
  const buffer=ctx.createBuffer(2,length,ctx.sampleRate);
  for(let c=0;c<2;c++){const data=buffer.getChannelData(c);for(let i=0;i<length;i++) data[i]=(Math.random()*2-1)*Math.pow(1-i/length,decay);}
  return buffer;
}

export function buildGraph(ctx:AudioContext, source:MediaElementAudioSourceNode, s:AudioSettings) {
  const input=ctx.createGain(); input.gain.value=s.volume;
  const low=ctx.createBiquadFilter(); low.type="lowshelf"; low.frequency.value=180; low.gain.value=s.bass;
  const high=ctx.createBiquadFilter(); high.type="highshelf"; high.frequency.value=4200; high.gain.value=s.treble;
  const dry=ctx.createGain(); dry.gain.value=1;
  const wet=ctx.createGain(); wet.gain.value=s.reverb/100*.7;
  const convolver=ctx.createConvolver(); convolver.buffer=makeImpulse(ctx,2.4,2.8);
  const delay=ctx.createDelay(2); delay.delayTime.value=.12;
  const echoGain=ctx.createGain(); echoGain.gain.value=s.echo/100*.45;
  const comp=ctx.createDynamicsCompressor(); comp.threshold.value=-12; comp.knee.value=18; comp.ratio.value=3; comp.attack.value=.005; comp.release.value=.15;
  const merger=ctx.createChannelMerger(2);
  const splitter=ctx.createChannelSplitter(2);
  const left=ctx.createGain(), right=ctx.createGain();
  const side=Math.min(1,s.width/100);
  left.gain.value=1+side*.35; right.gain.value=1+side*.35;
  source.connect(input).connect(low).connect(high);
  high.connect(distortion).connect(dry);
  distortion.connect(convolver).connect(wet);
  distortion.connect(delay).connect(echoGain);
  dry.connect(comp); wet.connect(comp); echoGain.connect(comp);
  comp.connect(splitter);
  splitter.connect(left,0); splitter.connect(right,1);
  left.connect(merger,0,0); right.connect(merger,0,1);
  merger.connect(ctx.destination);
  const distortion=ctx.createWaveShaper(); distortion.curve=makeDistortionCurve(s.distortion); distortion.oversample="4x";
  const limiter=ctx.createDynamicsCompressor(); limiter.threshold.value=-2 + (1-s.limiter/100)*10; limiter.knee.value=0; limiter.ratio.value=20; limiter.attack.value=.001; limiter.release.value=.08;
  return {input, low, high, wet, echoGain, left, right, distortion, limiter};
}

export async function renderWav(file:File,s:AudioSettings) {
  const data=await file.arrayBuffer();
  const probe=new AudioContext();
  const decoded=await probe.decodeAudioData(data.slice(0));
  await probe.close();
  const start=Math.max(0,Math.min(decoded.duration,s.trimStart));
  const end=Math.max(start+.01,Math.min(decoded.duration,s.trimEnd||decoded.duration));
  const segment=end-start;
  const rate=Math.max(.25,Math.min(3,s.speed*Math.pow(2,s.pitch/12)));
  const repeats=Math.max(1,Math.floor(s.loopCount||1));
  const effectiveSegment=segment/rate;
  const total=effectiveSegment*repeats;
  const outLength=Math.ceil((total+Math.max(0,s.fadeOut)+2.6)*decoded.sampleRate);
  const offline=new OfflineAudioContext(2,outLength,decoded.sampleRate);
  const input=offline.createGain(); input.gain.value=s.volume;
  const low=offline.createBiquadFilter(); low.type="lowshelf"; low.frequency.value=180; low.gain.value=s.bass;
  const high=offline.createBiquadFilter(); high.type="highshelf"; high.frequency.value=4200; high.gain.value=s.treble;
  const comp=offline.createDynamicsCompressor(); comp.threshold.value=-12; comp.knee.value=18; comp.ratio.value=3; comp.attack.value=.005; comp.release.value=.15;
  const dry=offline.createGain(); dry.gain.value=1;
  const wet=offline.createGain(); wet.gain.value=s.reverb/100*.7;
  const convolver=offline.createConvolver(); convolver.buffer=makeImpulse(offline,2.4,2.8);
  const delay=offline.createDelay(2); delay.delayTime.value=.12;
  const echoGain=offline.createGain(); echoGain.gain.value=s.echo/100*.45;
  const mix=offline.createGain();
  const fade=offline.createGain();
  input.connect(low).connect(high);
  high.connect(distortion);
  distortion.connect(dry); distortion.connect(convolver).connect(wet); distortion.connect(delay).connect(echoGain);
  dry.connect(mix); wet.connect(mix); echoGain.connect(mix); mix.connect(comp).connect(fade).connect(offline.destination);
  for(let i=0;i<repeats;i++){const src=offline.createBufferSource();
    if(s.reverse){
      const rev=offline.createBuffer(decoded.numberOfChannels,decoded.length,decoded.sampleRate);
      for(let c=0;c<decoded.numberOfChannels;c++){const from=decoded.getChannelData(c),to=rev.getChannelData(c);for(let j=0;j<decoded.length;j++)to[j]=from[decoded.length-1-j];}
      src.buffer=rev;
    } else src.buffer=decoded;
    src.playbackRate.value=rate;src.connect(input);src.start(i*effectiveSegment,s.reverse?decoded.duration-end:start,segment);}
  const fi=Math.min(Math.max(0,s.fadeIn),total/2), fo=Math.min(Math.max(0,s.fadeOut),total/2);
  fade.gain.setValueAtTime(0,0); fade.gain.linearRampToValueAtTime(1,fi);
  fade.gain.setValueAtTime(1,Math.max(fi,total-fo)); fade.gain.linearRampToValueAtTime(0,total);
  return audioBufferToWav(await offline.startRendering());
}

function audioBufferToWav(buffer:AudioBuffer) {
  const channels=Math.min(2,buffer.numberOfChannels), length=buffer.length, bytes=44+length*channels*2;
  const out=new ArrayBuffer(bytes), view=new DataView(out);
  const write=(o:number,str:string)=>{for(let i=0;i<str.length;i++)view.setUint8(o+i,str.charCodeAt(i));};
  write(0,"RIFF"); view.setUint32(4,bytes-8,true); write(8,"WAVE"); write(12,"fmt ");
  view.setUint32(16,16,true); view.setUint16(20,1,true); view.setUint16(22,channels,true);
  view.setUint32(24,buffer.sampleRate,true); view.setUint32(28,buffer.sampleRate*channels*2,true);
  view.setUint16(32,channels*2,true); view.setUint16(34,16,true); write(36,"data"); view.setUint32(40,bytes-44,true);
  const data=Array.from({length:channels},(_,c)=>buffer.getChannelData(c)); let off=44;
  for(let i=0;i<length;i++) for(let c=0;c<channels;c++){const v=Math.max(-1,Math.min(1,data[c][i]));view.setInt16(off,v<0?v*32768:v*32767,true);off+=2;}
  return new Blob([out],{type:"audio/wav"});
}
