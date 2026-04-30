// Screen 4: Voice channel — warm amber signal
function VoiceScreen() {
  return (
    <Artboard w={1200} h={780} style={{display:'flex'}}>
      <ServerRail active="design"/>

      {/* Channel sidebar */}
      <div style={{width:240, borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column'}}>
        <div style={{padding:'16px 18px 14px', borderBottom:'1px solid var(--border)',
          display:'flex', alignItems:'center', justifyContent:'space-between'}}>
          <Serif style={{fontSize:16, fontWeight:500}}>Design Lab</Serif>
          <IconBtn>{Icons.chevR}</IconBtn>
        </div>

        <SectionHead>Text</SectionHead>
        <div style={{padding:'0 8px'}}>
          <ChannelRow icon={Icons.hash} label="welcome"/>
          <ChannelRow icon={Icons.hash} label="critique" unread={8}/>
          <ChannelRow icon={Icons.hash} label="tokens"/>
          <ChannelRow icon={Icons.hash} label="showcase"/>
        </div>

        <SectionHead>Voice</SectionHead>
        <div style={{padding:'0 8px'}}>
          <VoiceRoom label="The Commons" listeners={[['M','oklch(0.72 0.07 330)'],['K','oklch(0.74 0.06 200)']]}/>
          <VoiceRoom active label="Lantern — Room 3" listeners={[['A','var(--chat)'],['M','oklch(0.72 0.07 330)'],['J','oklch(0.70 0.05 260)'],['T','oklch(0.72 0.07 25)']]}/>
          <VoiceRoom label="Pair programming"/>
          <VoiceRoom label="Quiet hours" muted/>
        </div>

        <UserBar/>
      </div>

      {/* Voice stage */}
      <div style={{flex:1, display:'flex', flexDirection:'column', minWidth:0,
        background: `
          radial-gradient(700px 420px at 70% -10%, color-mix(in oklab, var(--voice) 14%, transparent), transparent 60%),
          radial-gradient(500px 400px at 10% 100%, color-mix(in oklab, var(--voice) 8%, transparent), transparent 60%),
          var(--background)`,
      }}>
        {/* Stage header */}
        <div style={{height:60, borderBottom:'1px solid var(--border)', padding:'0 24px',
          display:'flex', alignItems:'center', gap:14}}>
          <span style={{color:'var(--voice)'}}>{Icons.headset}</span>
          <Serif style={{fontSize:18, fontWeight:450}}>Lantern — Room 3</Serif>
          <span style={{fontSize:11, padding:'2px 8px', borderRadius:20,
            background:'color-mix(in oklab, var(--voice) 20%, transparent)',
            color:'var(--voice)', fontFamily:'JetBrains Mono, monospace', letterSpacing:'0.08em'}}>LIVE · 00:42:18</span>
          <div style={{flex:1}}/>
          <Mono style={{fontSize:11, color:'var(--muted-foreground)'}}>4 of 8 · 48 kHz opus</Mono>
          <IconBtn>{Icons.waveform}</IconBtn>
          <IconBtn>{Icons.more}</IconBtn>
        </div>

        <div style={{flex:1, padding:'28px 32px', display:'flex', flexDirection:'column', gap:22, overflow:'hidden'}}>
          {/* now-speaking banner */}
          <div style={{display:'flex', alignItems:'center', gap:14}}>
            <Mono style={{fontSize:10, letterSpacing:'0.12em', color:'var(--muted-foreground)', textTransform:'uppercase'}}>Now speaking —</Mono>
            <Serif as="span" style={{fontSize:20, fontWeight:400, fontStyle:'italic'}}>Maia</Serif>
            <Waveform/>
          </div>

          {/* participants grid */}
          <div style={{
            display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:16, flex:1, minHeight:0,
          }}>
            <Tile name="Alice" color="var(--chat)" you muted={false} role="Host"/>
            <Tile name="Maia" color="oklch(0.72 0.07 330)" speaking role="Speaker"/>
            <Tile name="Jules" color="oklch(0.70 0.05 260)" muted role="Listener"/>
            <Tile name="Tane" color="oklch(0.72 0.07 25)" video role="Speaker"/>
          </div>

          {/* raised hands rail */}
          <div style={{
            display:'flex', alignItems:'center', gap:14, padding:'10px 14px',
            border:'1px solid var(--border)', borderRadius:'var(--radius)',
            background:'color-mix(in oklab, var(--card) 70%, transparent)',
          }}>
            <Mono style={{fontSize:10, letterSpacing:'0.12em', color:'var(--muted-foreground)', textTransform:'uppercase'}}>Hands raised —</Mono>
            <div style={{display:'flex', gap:-6}}>
              {[['K','oklch(0.74 0.06 200)'],['R','oklch(0.72 0.07 110)'],['N','oklch(0.72 0.07 25)']].map(([n,c],i) => (
                <div key={i} style={{marginLeft: i?-8:0}}>
                  <Avatar name={n} color={c} size={26}/>
                </div>
              ))}
            </div>
            <span style={{fontSize:12.5, color:'var(--muted-foreground)', fontStyle:'italic',
              fontFamily:'var(--serif, Fraunces), serif'}}>Kai, Ren, Nia would like to speak.</span>
            <div style={{flex:1}}/>
            <button style={{padding:'5px 12px', fontSize:11.5, borderRadius:20,
              border:'1px solid var(--voice)', color:'var(--voice)', background:'transparent',
              cursor:'pointer', fontFamily:'inherit'}}>Invite Kai →</button>
          </div>
        </div>

        {/* control dock */}
        <div style={{padding:'14px 24px 22px'}}>
          <div style={{
            display:'flex', alignItems:'center', gap:10, padding:'10px 14px',
            background:'var(--card)', border:'1px solid var(--border-strong)',
            borderRadius:'var(--radius-lg)',
            boxShadow:'0 10px 30px -12px rgba(0,0,0,0.6)',
          }}>
            <DockBtn active tone="voice">{Icons.mic}</DockBtn>
            <DockBtn>{Icons.headset}</DockBtn>
            <DockBtn>{Icons.screen}</DockBtn>
            <DockBtn>{Icons.sparkle}</DockBtn>
            <div style={{width:1, height:24, background:'var(--border)', margin:'0 4px'}}/>

            {/* noise suppression toggle */}
            <div style={{display:'flex', alignItems:'center', gap:8, padding:'0 8px'}}>
              <Mono style={{fontSize:10.5, color:'var(--muted-foreground)', letterSpacing:'0.08em', textTransform:'uppercase'}}>Noise suppression</Mono>
              <div style={{width:30, height:16, borderRadius:10, background:'var(--voice)',
                position:'relative'}}>
                <div style={{position:'absolute', right:2, top:2, width:12, height:12, borderRadius:'50%', background:'var(--background)'}}/>
              </div>
            </div>
            <div style={{width:1, height:24, background:'var(--border)', margin:'0 4px'}}/>

            <div style={{display:'flex', alignItems:'center', gap:10, flex:1}}>
              <Mono style={{fontSize:10.5, color:'var(--muted-foreground)'}}>INPUT</Mono>
              <div style={{flex:1, height:6, borderRadius:3, background:'var(--muted)', position:'relative', overflow:'hidden'}}>
                <div style={{position:'absolute', left:0, top:0, bottom:0, width:'62%',
                  background:'linear-gradient(90deg, var(--voice), color-mix(in oklab, var(--voice) 60%, var(--destructive)))'}}/>
              </div>
              <Mono style={{fontSize:10.5, color:'var(--muted-foreground)'}}>-12dB</Mono>
            </div>

            <button style={{
              padding:'8px 16px', borderRadius:'var(--radius-sm)', border:'1px solid var(--destructive)',
              background:'color-mix(in oklab, var(--destructive) 20%, transparent)',
              color:'var(--destructive)', fontSize:12, fontWeight:500,
              cursor:'pointer', fontFamily:'inherit',
            }}>Leave room</button>
          </div>
        </div>
      </div>
    </Artboard>
  );
}

function ChannelRow({ icon, label, unread }) {
  return (
    <div style={{
      display:'flex', alignItems:'center', gap:10, padding:'6px 10px',
      borderRadius:'var(--radius-sm)', cursor:'pointer', marginBottom:1,
      color:'var(--muted-foreground)', fontSize:13,
    }}>
      <span style={{opacity:0.7}}>{icon}</span>
      <span style={{flex:1}}>{label}</span>
      {unread && <span style={{fontSize:10, padding:'1px 6px', borderRadius:10,
        background:'var(--muted)', color:'var(--foreground)', fontFamily:'JetBrains Mono, monospace'}}>{unread}</span>}
    </div>
  );
}

function VoiceRoom({ label, listeners = [], active, muted }) {
  return (
    <div style={{
      padding:'7px 10px', borderRadius:'var(--radius-sm)', marginBottom:1,
      background: active ? 'color-mix(in oklab, var(--voice) 18%, transparent)' : 'transparent',
      border: active ? '1px solid color-mix(in oklab, var(--voice) 40%, transparent)' : '1px solid transparent',
    }}>
      <div style={{display:'flex', alignItems:'center', gap:10}}>
        <span style={{color: active ? 'var(--voice)' : 'var(--muted-foreground)'}}>{Icons.headset}</span>
        <span style={{flex:1, fontSize:13, color: active ? 'var(--foreground)' : 'var(--muted-foreground)',
          fontWeight: active ? 500 : 400, opacity: muted ? 0.5 : 1}}>{label}</span>
        {listeners.length > 0 && (
          <Mono style={{fontSize:10.5, color:'var(--muted-foreground)'}}>{listeners.length}</Mono>
        )}
      </div>
      {listeners.length > 0 && (
        <div style={{display:'flex', gap:5, padding:'6px 0 0 24px'}}>
          {listeners.map(([n,c], i) => (
            <Avatar key={i} name={n} color={c} size={18}/>
          ))}
        </div>
      )}
    </div>
  );
}

function Tile({ name, color, speaking, muted, video, you, role }) {
  return (
    <div style={{
      position:'relative', borderRadius:'var(--radius-lg)',
      background: video ? `repeating-linear-gradient(135deg, oklch(0.28 0.02 60) 0 10px, oklch(0.24 0.02 60) 10px 20px)` : 'var(--card)',
      border: '1px solid var(--border)',
      overflow:'hidden',
      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
      aspectRatio:'16/12', minHeight:0,
    }}>
      {speaking && (
        <div style={{position:'absolute', inset:0, borderRadius:'inherit', pointerEvents:'none',
          boxShadow:'inset 0 0 0 2px var(--voice), 0 0 30px -4px var(--voice)',
          animation:'pn-glow 1.6s ease-in-out infinite'}}/>
      )}
      {!video && (
        <Avatar name={name} color={color} size={72}/>
      )}
      {/* nameplate */}
      <div style={{position:'absolute', left:10, bottom:10, right:10,
        display:'flex', alignItems:'center', gap:8}}>
        <Serif style={{fontSize:14.5, fontWeight:500, color:'var(--foreground)',
          background:'color-mix(in oklab, var(--background) 70%, transparent)',
          padding:'3px 10px', borderRadius:6, backdropFilter:'blur(6px)'}}>
          {name}{you && <span style={{color:'var(--muted-foreground)', fontStyle:'italic'}}> · you</span>}
        </Serif>
        <div style={{flex:1}}/>
        <Mono style={{fontSize:9.5, letterSpacing:'0.12em', color:'var(--muted-foreground)',
          background:'color-mix(in oklab, var(--background) 70%, transparent)',
          padding:'3px 7px', borderRadius:6, textTransform:'uppercase', backdropFilter:'blur(6px)'}}>{role}</Mono>
      </div>
      {/* status chip */}
      <div style={{position:'absolute', top:10, right:10}}>
        {muted ? (
          <div style={{width:26, height:26, borderRadius:'50%',
            background:'color-mix(in oklab, var(--destructive) 30%, var(--card))',
            color:'var(--destructive)', display:'flex', alignItems:'center', justifyContent:'center'}}>
            <span style={{transform:'scale(0.7)'}}>{Icons.micOff}</span>
          </div>
        ) : speaking ? (
          <Waveform small/>
        ) : null}
      </div>
    </div>
  );
}

function Waveform({ small }) {
  const bars = small ? 4 : 8;
  return (
    <div style={{display:'flex', alignItems:'center', gap:3, height: small ? 20 : 26,
      padding: small ? '0 6px' : 0, borderRadius:12,
      background: small ? 'color-mix(in oklab, var(--voice) 22%, transparent)' : 'transparent'}}>
      {Array.from({length: bars}).map((_, i) => (
        <span key={i} style={{
          width:2.5, height: small ? '50%' : '60%',
          borderRadius:2, background:'var(--voice)',
          animation:`pn-wave 0.9s ${i*0.08}s ease-in-out infinite alternate`,
          transformOrigin:'center',
        }}/>
      ))}
    </div>
  );
}

function DockBtn({ children, active, tone }) {
  const isVoice = tone === 'voice';
  return (
    <button style={{
      width:40, height:40, borderRadius:'var(--radius-sm)',
      background: active
        ? (isVoice ? 'color-mix(in oklab, var(--voice) 22%, transparent)' : 'var(--muted)')
        : 'transparent',
      color: active ? (isVoice ? 'var(--voice)' : 'var(--foreground)') : 'var(--muted-foreground)',
      border: active && isVoice ? '1px solid color-mix(in oklab, var(--voice) 50%, transparent)' : '1px solid transparent',
      cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
    }}>{children}</button>
  );
}

window.VoiceScreen = VoiceScreen;
