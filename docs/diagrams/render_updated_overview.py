from pathlib import Path
# Reuse drawing utilities without regenerating earlier diagrams.
source = (Path(__file__).parent / 'render_architecture.py').read_text(encoding='utf-8-sig')
exec(source.split('\nx=Diagram(')[0])

d=Diagram(3000,2140,'MIA / UPDATED OVERVIEW ARCHITECTURE','Meeting Intelligence & Action Engine • Current source includes speaker contacts and reviewed task-email delivery')
d.group((50,180,2380,1950),'LOCAL DEVICE — TAURI DESKTOP APPLICATION')
d.group((2440,180,2950,1950),'EXTERNAL SERVICES')
d.box('ui',(100,250,2330,390),'Desktop interface — Next.js / React / Tailwind', ['Meetings and recording controls  •  Live transcript and notes  •  Speaker directory  •  Task review and email settings'],'ui')
d.box('bridge',(100,450,2330,570),'Tauri v2 command and event bridge',['Frontend invoke / listen  ↔  Rust commands, data access, results and progress events'],'ui')
d.arrow('ui','bridge')
# Deliberately aligned processing row.
d.box('audio',(100,710,730,865),'1  Audio capture and preparation',['Microphone + meeting system audio','Mix, resample, normalize and segment'])
d.box('stt',(900,710,1530,865),'2  Local speech recognition',['Whisper / whisper.cpp OR Parakeet','Timestamped transcript + live UI updates'])
d.box('summary',(1700,710,2330,865),'3  Summary and action items',['Transcript + selected report template','Key points, decisions and assigned tasks'])
d.arrow('audio','stt',side='horizontal');d.arrow('stt','summary',side='horizontal')
d.text((752,762),'Audio',22,'#94a3b8');d.text((1550,762),'Transcript',22,'#94a3b8')
d.arrow('bridge','audio',via=[(1215,635),(415,635)])
# Secondary analysis and inference choices.
d.box('speaker',(100,1000,730,1155),'Speaker diarization',['Saved audio + transcript timestamps','ONNX embeddings and speaker clustering'])
d.box('directory',(900,1000,1530,1155),'Speaker directory and contacts',['Names, emails, roles and sample paths','Meeting-speaker naming and email details'])
d.box('local',(1700,1000,2330,1155),'Local LLM options',['Built-in model sidecar OR local Ollama','Summary inference requests / responses'])
d.arrow('summary','local')
d.box('cloud',(2480,710,2910,900),'Optional cloud LLM',['OpenAI / Claude / Groq','OpenRouter / custom API','Transcript sent if selected'],'ext')
d.arrow('summary','cloud',side='horizontal',dash=True)
# Review is deliberately in presentation: not automatic sending.
d.box('review',(900,1300,1530,1500),'4  Task review in the interface',['Edit tasks and owner assignments','Select tasks and recipients; preview email','Choose shared or personalized delivery'],'ui')
d.box('email',(1700,1300,2330,1500),'5  Rust email service',['Compose meeting/task HTML email','Send only after the user clicks Send','Return success or error to the interface'])
d.arrow('directory','review');d.arrow('review','email',side='horizontal')
d.arrow('summary','review',via=[(2370,900),(2370,1215),(1215,1215)])
d.text((1770,1225),'Generated report → review',22,'#94a3b8')
d.box('delivery',(2480,1300,2910,1500),'Email delivery',['SMTP server (lettre)','OR Resend HTTPS API','Selected recipients'],'ext')
d.arrow('email','delivery',side='horizontal')
# Local persistence separated from external providers.
d.box('files',(100,1650,730,1850),'Local files and models',['Recorded audio in meeting folders','Speech and speaker model assets','Built-in summary model files'],'data')
d.box('db',(900,1650,2330,1850),'SQLite — database manager and repositories',['Meetings, transcripts, summaries and meeting speakers','Speaker directory / contact emails  •  App and email-provider settings','Read/write through Rust services and Tauri commands'],'data')

# A custom connection avoids routing through the speaker box.
def path(points):
 d.d.line(points,fill='#7f9bb4',width=4)
 p,q=points[-2:];angle=math.atan2(q[1]-p[1],q[0]-p[0]);d.d.polygon([q,(q[0]-17*math.cos(angle-.45),q[1]-17*math.sin(angle-.45)),(q[0]-17*math.cos(angle+.45),q[1]-17*math.sin(angle+.45))],fill='#7f9bb4')
path([(415,865),(415,920),(70,920),(70,1600),(250,1600),(250,1650)])
path([(415,1650),(415,1155)])
d.text((435,1525),'Saved audio',22,'#94a3b8')
path([(730,1077),(815,1077),(815,1580),(1100,1580),(1100,1650)])
d.text((835,1535),'Speaker assignments',22,'#94a3b8')
path([(1615,1650),(1615,1580),(2015,1580),(2015,1500)])
d.text((1720,1535),'Provider settings',22,'#94a3b8')
d.text((100,1888),'Storage serves transcription, speaker management, summaries and task-email configuration. Live events return through Tauri.',24,'#94a3b8')
d.text((70,2000),'NEW IN THIS OVERVIEW   Speaker contact directory  •  Review and assignment of tasks  •  Shared / personalized email delivery',27,'#f1f5f9',True)
d.text((70,2055),'Solid arrows: application flow and data dependencies. Dashed arrow: optional cloud AI. Network delivery occurs only for selected external services.',23,'#94a3b8')
d.save('mia-architecture-overview-updated.png')
print('Created updated overview: 3000 x 2140 PNG')

