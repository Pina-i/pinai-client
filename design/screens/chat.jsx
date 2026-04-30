// Screen 3: DM / Chat
function ChatScreen() {
  return (
    <Artboard w={1200} h={780} style={{display:'flex'}}>
      <ServerRail active="home"/>

      {/* Sidebar (condensed) */}
      <div style={{width:240, borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column'}}>
        <div style={{padding:'14px 12px 10px'}}>
          <div style={{
            display:'flex', alignItems:'center', gap:8, padding:'0 10px', height:34,
            background:'var(--input)', borderRadius:'var(--radius-sm)', border:'1px solid var(--border)',
            color:'var(--muted-foreground)', fontSize:12,
          }}>
            {Icons.search}<span>Search conversations</span>
          </div>
        </div>
        <div style={{padding:'0 8px'}}>
          <NavItem icon={Icons.users} label="Friends"/>
        </div>
        <SectionHead>Direct Messages</SectionHead>
        <div style={{padding:'0 8px', flex:1}}>
          <DMItem name="Bob" color="oklch(0.75 0.06 70)" preview="thinking about the meeting" time="2m" dot="online"/>
          <div style={{borderRadius:'var(--radius-sm)', background:'color-mix(in oklab, var(--chat) 14%, transparent)'}}>
            <DMItem name="Maia" color="oklch(0.72 0.07 330)" preview="you: sounds good" time="now" dot="voice"/>
          </div>
          <DMItem name="Jules & Kai" color="oklch(0.74 0.06 200)" preview="Kai: pushed a fix" time="3h"/>
          <DMItem name="Tane" color="oklch(0.72 0.07 25)" preview="photos from the trip" time="yd"/>
        </div>
        <UserBar/>
      </div>

      {/* Main: chat */}
      <div style={{flex:1, display:'flex', flexDirection:'column', minWidth:0}}>
        {/* thread header */}
        <div style={{height:60, borderBottom:'1px solid var(--border)', padding:'0 22px',
          display:'flex', alignItems:'center', gap:14}}>
          <Avatar name="Maia" color="oklch(0.72 0.07 330)" size={34} dot="online"/>
          <div>
            <Serif style={{fontSize:17, fontWeight:450}}>Maia</Serif>
            <div style={{fontSize:11, color:'var(--muted-foreground)',
              fontFamily:'JetBrains Mono, monospace', letterSpacing:'0.04em'}}>
              <span style={{color:'var(--success)'}}>●</span> online · maia@studio.pinai
            </div>
          </div>
          <div style={{flex:1}}/>
          <IconBtn>{Icons.pin}</IconBtn>
          <IconBtn>{Icons.bell}</IconBtn>
          <IconBtn>{Icons.headset}</IconBtn>
          <div style={{width:1, height:18, background:'var(--border)', margin:'0 4px'}}/>
          <IconBtn>{Icons.more}</IconBtn>
        </div>

        {/* messages */}
        <div style={{flex:1, overflow:'auto', padding:'28px 28px 16px', display:'flex', flexDirection:'column', gap:2}}>
          <DateDivider>Tuesday, April 22</DateDivider>

          <Msg first name="Maia" color="oklch(0.72 0.07 330)" time="10:42">
            <p style={{margin:0}}>Hey — are we still good for the review at four?</p>
          </Msg>
          <Msg name="Maia" color="oklch(0.72 0.07 330)">
            <p style={{margin:0}}>I've put the new voice explorations into the shared room.</p>
          </Msg>

          <Msg first self name="Alice" color="var(--chat)" time="10:44">
            <p style={{margin:0}}>Yes! Pulling them up now.</p>
          </Msg>
          <Msg self name="Alice" color="var(--chat)">
            <Reactions items={[['🌿',3],['✦',1]]}/>
            <p style={{margin:0}}>
              The warm amber for voice is really singing against the sage.{' '}
              <code style={{fontFamily:'JetBrains Mono, monospace', fontSize:12,
                padding:'1px 6px', borderRadius:5, background:'var(--muted)',
                border:'1px solid var(--border)'}}>--voice: oklch(0.80 0.09 48)</code>
            </p>
          </Msg>

          <DateDivider>Today</DateDivider>

          <Msg first name="Maia" color="oklch(0.72 0.07 330)" time="14:02">
            <Attachment/>
            <p style={{margin:'10px 0 0'}}>
              Pushed the final token set. Everything routes through <Mono style={{color:'var(--chat)'}}>--chat</Mono> / <Mono style={{color:'var(--voice)'}}>--voice</Mono> now — the old sage is still the default chat accent, just tuned a hair cooler.
            </p>
          </Msg>

          <TypingRow name="Maia" color="oklch(0.72 0.07 330)"/>
        </div>

        {/* composer */}
        <div style={{padding:'0 22px 20px'}}>
          <div style={{
            border:'1px solid var(--border-strong)', borderRadius:'var(--radius-lg)',
            background:'var(--card)', padding:'10px 10px 8px',
          }}>
            <div style={{display:'flex', alignItems:'flex-start', gap:10}}>
              <IconBtn>{Icons.plusCircle}</IconBtn>
              <div style={{flex:1, minHeight:28, padding:'4px 2px', color:'var(--foreground)', fontSize:13.5}}>
                Message Maia
                <span style={{display:'inline-block', width:1.5, height:14, background:'var(--chat)',
                  verticalAlign:'middle', marginLeft:2, animation:'pn-blink 1s steps(2) infinite'}}/>
              </div>
              <IconBtn>{Icons.smile}</IconBtn>
              <IconBtn>{Icons.at}</IconBtn>
              <button style={{
                width:32, height:28, border:'none', borderRadius:'var(--radius-sm)',
                background:'var(--chat)', color:'var(--primary-foreground)', cursor:'pointer',
                display:'flex', alignItems:'center', justifyContent:'center',
              }}>{Icons.send}</button>
            </div>
          </div>
          <div style={{display:'flex', gap:14, padding:'6px 4px 0',
            fontFamily:'JetBrains Mono, monospace', fontSize:10, letterSpacing:'0.08em',
            color:'var(--muted-foreground)', textTransform:'uppercase'}}>
            <span>⏎ send</span>
            <span>⇧⏎ new line</span>
            <span>/ commands</span>
            <span style={{marginLeft:'auto'}}>E2E encrypted</span>
          </div>
        </div>
      </div>
    </Artboard>
  );
}

function Msg({ first, self, name, color, time, children }) {
  return (
    <div style={{display:'flex', gap:14, padding: first ? '14px 0 2px' : '0 0 2px 54px', alignItems:'flex-start'}}>
      {first && <Avatar name={name} color={color} size={40}/>}
      <div style={{flex:1, minWidth:0}}>
        {first && (
          <div style={{display:'flex', alignItems:'baseline', gap:8, marginBottom:3}}>
            <Serif style={{fontSize:14.5, fontWeight:500, color: self ? 'var(--chat)' : 'var(--foreground)'}}>{name}</Serif>
            <Mono style={{fontSize:10.5, color:'var(--muted-foreground)'}}>{time}</Mono>
          </div>
        )}
        <div style={{fontSize:13.5, lineHeight:1.55, color:'var(--foreground)', textWrap:'pretty'}}>
          {children}
        </div>
      </div>
    </div>
  );
}

function DateDivider({ children }) {
  return (
    <div style={{display:'flex', alignItems:'center', gap:12, margin:'18px 0 6px',
      fontFamily:'JetBrains Mono, monospace', fontSize:10, letterSpacing:'0.12em',
      color:'var(--muted-foreground)', textTransform:'uppercase'}}>
      <div style={{flex:1, height:1, background:'var(--border)'}}/>
      <span>{children}</span>
      <div style={{flex:1, height:1, background:'var(--border)'}}/>
    </div>
  );
}

function Reactions({ items }) {
  return (
    <div style={{display:'flex', gap:6, margin:'6px 0 2px'}}>
      {items.map(([e,n]) => (
        <span key={e} style={{
          display:'inline-flex', alignItems:'center', gap:5, padding:'2px 8px',
          fontSize:11.5, borderRadius:20, background:'var(--muted)',
          border:'1px solid var(--border)', color:'var(--muted-foreground)',
        }}>{e} <span style={{color:'var(--foreground)', fontFamily:'JetBrains Mono, monospace'}}>{n}</span></span>
      ))}
    </div>
  );
}

function Attachment() {
  return (
    <div style={{
      marginTop:6, borderRadius:'var(--radius)', border:'1px solid var(--border)',
      overflow:'hidden', maxWidth:420,
    }}>
      <div style={{
        height:160,
        background: `
          repeating-linear-gradient(135deg,
            oklch(0.28 0.02 60) 0 14px,
            oklch(0.24 0.02 60) 14px 28px)`,
        display:'flex', alignItems:'center', justifyContent:'center',
        color:'var(--muted-foreground)', fontFamily:'JetBrains Mono, monospace', fontSize:11,
      }}>[ token-export · 1920×1080 ]</div>
      <div style={{padding:'10px 12px', background:'var(--muted)', borderTop:'1px solid var(--border)',
        display:'flex', alignItems:'center', gap:10}}>
        <div style={{flex:1, minWidth:0}}>
          <div style={{fontSize:12.5, fontWeight:500}}>pinai-tokens.oklch.css</div>
          <div style={{fontSize:11, color:'var(--muted-foreground)',
            fontFamily:'JetBrains Mono, monospace'}}>4.2 KB · shadcn compatible</div>
        </div>
        <button style={{fontSize:11, padding:'5px 10px', borderRadius:6,
          border:'1px solid var(--border-strong)', background:'transparent',
          color:'var(--foreground)', cursor:'pointer', fontFamily:'inherit'}}>Download</button>
      </div>
    </div>
  );
}

function TypingRow({ name, color }) {
  return (
    <div style={{display:'flex', gap:10, alignItems:'center', padding:'10px 0 4px 54px',
      fontSize:12, color:'var(--muted-foreground)', fontStyle:'italic', fontFamily:'var(--serif, Fraunces), serif'}}>
      <div style={{display:'flex', gap:3}}>
        {[0,1,2].map(i => (
          <span key={i} style={{
            width:5, height:5, borderRadius:'50%', background: color,
            animation:`pn-bounce 1.1s ${i*0.15}s ease-in-out infinite`,
          }}/>
        ))}
      </div>
      {name} is writing…
    </div>
  );
}

window.ChatScreen = ChatScreen;
