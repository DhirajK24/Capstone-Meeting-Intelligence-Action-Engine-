from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import math
OUT=Path(__file__).parent
FONT='C:/Windows/Fonts/segoeui.ttf'
BOLD='C:/Windows/Fonts/segoeuib.ttf'
class Diagram:
 def __init__(self,w,h,title,subtitle):
  self.im=Image.new('RGB',(w,h),'#0b1220'); self.d=ImageDraw.Draw(self.im); self.nodes={}
  self.text((70,45),title,48,'#f1f5f9',True); self.text((72,112),subtitle,25,'#94a3b8')
 def text(self,xy,s,size=26,color='#e2e8f0',bold=False):
  self.d.text(xy,s,font=ImageFont.truetype(BOLD if bold else FONT,size),fill=color)
 def group(self,xy,title):
  self.d.rounded_rectangle(xy,24,fill='#101d2e',outline='#334155',width=2); self.text((xy[0]+24,xy[1]+18),title,27,'#94a3b8',True)
 def box(self,key,xy,title,lines=(),kind='core'):
  fill,stroke={'core':('#123c3a','#4db6a5'),'ui':('#18344e','#60a5da'),'data':('#302a49','#a798d1'),'ext':('#44331e','#d6ad62')}[kind]
  self.d.rounded_rectangle(xy,16,fill=fill,outline=stroke,width=3); self.nodes[key]=xy
  self.text((xy[0]+22,xy[1]+15),title,28,'#ffffff',True)
  for i,line in enumerate(lines): self.text((xy[0]+22,xy[1]+58+i*32),line,24)
 def arrow(self,a,b,label='',side='vertical',via=None,color='#7f9bb4',dash=False):
  aa=self.nodes[a];bb=self.nodes[b]
  if side=='horizontal':
   p=(aa[2],(aa[1]+aa[3])/2);q=(bb[0],(bb[1]+bb[3])/2)
  else:p=((aa[0]+aa[2])/2,aa[3]);q=((bb[0]+bb[2])/2,bb[1])
  if a=='audio' and b=='files': q=((bb[0]+bb[2])/2,bb[3])
  pts=[p]+(via or [])+[q]
  for x,y in zip(pts,pts[1:]):
   if dash:
    length=math.dist(x,y)
    for n in range(0,int(length),18):
     f=n/length;g=min(n+10,length)/length;self.d.line((x[0]+(y[0]-x[0])*f,x[1]+(y[1]-x[1])*f,x[0]+(y[0]-x[0])*g,x[1]+(y[1]-x[1])*g),fill=color,width=3)
   else:self.d.line([x,y],fill=color,width=4)
  angle=math.atan2(q[1]-pts[-2][1],q[0]-pts[-2][0]);self.d.polygon([q,(q[0]-17*math.cos(angle-.45),q[1]-17*math.sin(angle-.45)),(q[0]-17*math.cos(angle+.45),q[1]-17*math.sin(angle+.45))],fill=color)
  if label:
   x,y=pts[len(pts)//2];self.text((x+12,y-33),label,21,color)
 def save(self,name):self.im.save(OUT/name,dpi=(200,200))

x=Diagram(2400,1660,'MIA / SYSTEM ARCHITECTURE','Current desktop implementation • Local processing with optional remote summarization')
x.group((50,185,2350,1480),'USER DEVICE — TAURI DESKTOP APPLICATION')
x.box('ui',(650,245,1750,370),'Desktop interface', ['Next.js / React / Tailwind • Meetings, live transcript, notes and settings'],'ui')
x.box('ipc',(650,430,1750,550),'Tauri v2 command and event bridge',['Commands and results • Transcript, progress and error events'],'ui');x.arrow('ui','ipc')
x.box('in',(90,640,570,780),'Meeting audio',['Microphone + system audio'],'ext')
x.box('audio',(650,640,1130,780),'Rust audio engine',['Capture, mix, normalize, chunk'])
x.box('stt',(1280,640,1750,780),'Local transcription',['Whisper OR Parakeet'])
x.box('files',(1840,640,2290,780),'Local files',['Audio and model assets'],'data')
x.arrow('in','audio',side='horizontal');x.arrow('audio','stt',side='horizontal');x.arrow('ipc','audio',via=[(1200,590),(890,590)]);x.arrow('audio','files',via=[(890,815),(2065,815),(2065,800)])
x.box('diar',(1840,900,2290,1050),'Speaker diarization',['ONNX embeddings','Clustering and speaker labels']);x.arrow('files','diar')
x.box('db',(1280,900,1750,1050),'SQLite + data services',['Meetings, transcripts','Summaries and speakers'],'data');x.arrow('stt','db');x.arrow('diar','db',side='horizontal',via=[(2320,975),(2320,1090),(1240,1090),(1240,975)])
x.box('sum',(650,1180,1130,1330),'Summary orchestration',['Templates, report generation','Summary and action items']);x.arrow('db','sum',via=[(1515,1130),(890,1130)])
x.box('local',(1280,1180,1750,1330),'Local LLM options',['Built-in model sidecar','OR local Ollama']);x.arrow('sum','local',side='horizontal')
x.box('cloud',(90,1180,570,1330),'Optional cloud LLM',['OpenAI / Claude / Groq','OpenRouter / custom endpoint'],'ext');x.arrow('sum','cloud',side='horizontal',via=[(1170,1370),(60,1370),(60,1255)],dash=True)
x.text((95,1415),'UI reads saved results through Tauri. Transcription also streams live events to the interface.',25)
x.text((70,1520),'Solid connections: local processing and data flow     Dashed connection: optional remote AI',25,'#94a3b8')
x.text((70,1570),'Cloud summaries send transcript content to the selected provider. The archived FastAPI backend is excluded.',24,'#94a3b8');x.save('mia-architecture-overview.png')

y=Diagram(2700,2560,'MIA / DETAILED SYSTEM ARCHITECTURE','Component view • Capture → transcription → speaker analysis → meeting intelligence → local persistence')
y.group((50,185,2650,555),'01 / PRESENTATION AND APPLICATION CONTROL')
y.box('ui',(90,250,880,400),'Desktop UI — Next.js / React',['Dashboard, recording controls, live transcripts','Notes editor, speakers, model and device settings'],'ui')
y.box('services',(980,250,1710,400),'Frontend services and hooks',['Recording, transcript and configuration services','Tauri invoke / listen wrappers'],'ui')
y.box('ipc',(1810,250,2610,400),'Tauri v2 bridge',['Rust command dispatch and returned results','Transcript, progress, completion and error events'],'ui')
y.arrow('ui','services',side='horizontal');y.arrow('services','ipc',side='horizontal')
y.text((95,455),'The bridge controls recording, import, diarization, summary generation and database access.',26)
y.group((50,600,880,1950),'02 / AUDIO AND TRANSCRIPTION')
y.group((930,600,1760,1950),'03 / SPEAKER ANALYSIS')
y.group((1810,600,2650,1950),'04 / SUMMARY AND ACTION ITEMS')
# Each lane has explicit sequential data flow.
y.box('capture',(90,680,840,830),'Recording manager + native capture',['Permissions, selected devices, start / stop','Microphone and system audio streams'])
y.box('dsp',(90,900,840,1050),'Audio preparation',['Resample, normalize microphone, mix, buffer','Voice activity detection and speech segmentation'])
y.box('worker',(90,1120,840,1270),'Transcription worker queue',['Dispatch speech chunks to the selected engine','Imported audio uses decoding / preparation'])
y.box('engine',(90,1340,840,1490),'Local speech-to-text engines',['Whisper: whisper-rs / whisper.cpp','Parakeet: ONNX Runtime'])
y.box('segments',(90,1560,840,1710),'Timestamped transcript segments',['Persist text and audio timing in SQLite','Emit live transcript events to the desktop UI'])
y.box('saver',(90,1780,840,1900),'Parallel recording saver',['Incremental audio checkpoints → meeting folder'])
for a,b in [('capture','dsp'),('dsp','worker'),('worker','engine'),('engine','segments')]:y.arrow(a,b)
y.box('load',(970,680,1720,830),'Load saved meeting inputs',['Recorded audio + transcript timestamps','User triggers speaker analysis / re-analysis'])
y.box('windows',(970,900,1720,1050),'Audio-window extraction',['Select audio using segment start / end times','Prepare input for the embedding model'])
y.box('embed',(970,1120,1720,1270),'Speaker embedding inference',['Pyannote embedding model in ONNX Runtime','Generate a voice representation per audio window'])
y.box('cluster',(970,1340,1720,1490),'Speaker clustering',['Group similar embeddings into speaker identities','Assign speaker IDs to transcript segments'])
y.box('speakerdb',(970,1560,1720,1710),'Persist speaker assignments',['Speaker repository → SQLite','Updated transcript displayed in the interface'])
y.box('edit',(970,1780,1720,1900),'Speaker management commands',['Rename, merge and play representative samples'])
for a,b in [('load','windows'),('windows','embed'),('embed','cluster'),('cluster','speakerdb'),('speakerdb','edit')]:y.arrow(a,b)
y.box('prep',(1850,680,2610,830),'Prepare summary request',['Read meeting transcript and provider settings','Choose report template and output language'])
y.box('chunks',(1850,900,2610,1050),'Summary processor',['Chunk long transcripts and generate summaries','Consolidate output into the selected report format'])
y.box('route',(1850,1120,2610,1270),'LLM provider routing',['Inference requests and responses','Built-in local AI / Ollama / configured remote API'])
y.box('local',(1850,1340,2610,1490),'Local inference options',['Built-in model manager + inference sidecar','OR Ollama service configured on the local machine'])
y.box('remote',(1850,1560,2610,1710),'Optional remote inference',['OpenAI, Claude, Groq, OpenRouter','Custom OpenAI-compatible endpoint'],'ext')
y.box('report',(1850,1780,2610,1900),'Save and display meeting report',['Summary, key points, decisions and action items'])
y.arrow('prep','chunks');y.arrow('chunks','route');y.arrow('route','local');y.arrow('route','remote',via=[(2630,1300),(2630,1530),(2230,1530)],dash=True)
y.text((1880,1725),'Provider responses → summary processor → report',22,'#94a3b8')
y.group((50,2010,2650,2360),'05 / SHARED LOCAL PERSISTENCE AND MODEL ASSETS')
y.box('db',(90,2090,880,2300),'SQLite — sqlx manager + repositories',['Meetings, transcripts and transcript chunks','Summaries, speakers and settings','Used by commands, speaker analysis and summaries'],'data')
y.box('files',(980,2090,1710,2300),'Meeting folders',['Incrementally saved recordings','Input for diarization and retranscription','Audio playback and speaker samples'],'data')
y.box('models',(1810,2090,2610,2300),'Model assets and lifecycle',['Whisper, Parakeet, speaker embeddings','Built-in summary models','Download, select and load models as needed'],'data')
y.text((70,2400),'Local speech inference and storage • Cloud summaries transmit transcript content only when a remote provider is selected.',25,'#94a3b8')
y.text((70,2450),'Speaker analysis is separate from live transcription. Action items are report content; task/email dispatch is not shown as implemented.',24,'#94a3b8')
y.text((70,2495),'Logical component relationships; auxiliary updates and individual event paths omitted for readability.',23,'#94a3b8')
y.save('mia-architecture-detailed.png')
print('Created overview PNG (2400 × 1660) and detailed PNG (2700 × 2560).')

