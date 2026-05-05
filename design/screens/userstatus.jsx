// User Status — UserBar avatar + popover variations
// Anchored to the user item in the bottom-left of the friends sidebar.
// Three directions: identity card, status-first dial, identity + activity.

// ── Shared backdrop: the friends page chrome with the UserBar visible ────
function UserBarBackdrop({ children, label, popoverWidth = 320 }) {
  return (
    <Artboard w={1200} h={780} style={{display:'flex'}}>
      <ServerRail active="home"/>

      {/* Sidebar — exactly matches the friends layout */}
      <div style={{width:260, borderRight:'1px solid var(--border)',
        display:'flex', flexDirection:'column', background:'var(--background)',
        position:'relative'}}>
        <div style={{padding:'14px 12px 10px'}}>
          <div style={{
            display:'flex', alignItems:'center', gap:8, padding:'0 10px', height:34,
            background:'var(--input)', borderRadius:'var(--radius-sm)',
            border:'1px solid var(--border)',
            color:'var(--muted-foreground)', fontSize:12,
          }}>
            {Icons.search}
            <span>Find or start a conversation</span>
            <span style={{marginLeft:'auto', fontFamily:'JetBrains Mono, monospace', fontSize:10,
              padding:'2px 5px', background:'var(--muted)', borderRadius:4}}>⌘K</span>
          </div>
        </div>

        <div style={{padding:'4px 8px', opacity:0.55}}>
          <div style={{display:'flex', alignItems:'center', gap:10, padding:'7px 10px',
            borderRadius:'var(--radius-sm)',
            background:'color-mix(in oklab, var(--chat) 16%, transparent)',
            color:'var(--chat)', fontSize:13, fontWeight:500}}>
            {Icons.users}<span style={{flex:1}}>Friends</span>
            <span style={{fontSize:10, padding:'1px 6px', borderRadius:10,
              background:'var(--chat)', color:'var(--primary-foreground)'}}>2</span>
          </div>
          <div style={{display:'flex', alignItems:'center', gap:10, padding:'7px 10px',
            color:'var(--muted-foreground)', fontSize:13}}>
            {Icons.sparkle}<span>Discover</span>
          </div>
          <div style={{display:'flex', alignItems:'center', gap:10, padding:'7px 10px',
            color:'var(--muted-foreground)', fontSize:13}}>
            {Icons.pin}<span>Pinned</span>
          </div>
        </div>

        <div style={{padding:'14px 18px 6px', fontFamily:'JetBrains Mono, monospace',
          fontSize:10, letterSpacing:'0.12em', color:'var(--muted-foreground)',
          textTransform:'uppercase', opacity:0.6}}>Direct Messages</div>
        <div style={{padding:'0 8px', flex:1, opacity:0.4}}>
          {[
            ['Bob','oklch(0.75 0.06 70)'],
            ['Maia','oklch(0.72 0.07 330)'],
            ['Jules & Kai','oklch(0.74 0.06 200)'],
            ['Tane','oklch(0.72 0.07 25)'],
          ].map(([n,c]) => (
            <div key={n} style={{display:'flex', alignItems:'center', gap:10, padding:'7px 8px'}}>
              <Avatar name={n} color={c} size={30} square/>
              <div style={{fontSize:13, color:'var(--foreground)'}}>{n}</div>
            </div>
          ))}
        </div>

        {/* UserBar with anchor — the avatar */}
        <div style={{position:'relative'}}>
          <div style={{
            height:54, background:'var(--card)',
            borderTop:'1px solid var(--border)',
            padding:'0 10px', display:'flex', alignItems:'center', gap:8,
            // highlighted to show "popover open" state
            boxShadow:'inset 0 0 0 1px color-mix(in oklab, var(--chat) 30%, transparent)',
          }}>
            <div data-anchor style={{position:'relative', cursor:'pointer'}}>
              <Avatar name="Alice" color="var(--chat)" size={30} dot="online"/>
            </div>
            <div style={{flex:1, minWidth:0}}>
              <div style={{fontSize:12.5, fontWeight:600, lineHeight:1.1}}>Alice Koa</div>
              <div style={{fontSize:10.5, color:'var(--muted-foreground)',
                fontFamily:'JetBrains Mono, monospace', letterSpacing:'0.04em'}}>
                <span style={{color:'var(--success)'}}>●</span> online · kauai.pinai
              </div>
            </div>
            <IconBtn>{Icons.mic}</IconBtn>
            <IconBtn>{Icons.headset}</IconBtn>
            <IconBtn>{Icons.settings}</IconBtn>
          </div>

          {/* the popover lives above the bar, bottom-left anchored */}
          {children}
        </div>
      </div>

      {/* Main content dimmed for context */}
      <div style={{flex:1, display:'flex', flexDirection:'column', opacity:0.35,
        filter:'saturate(0.6)'}}>
        <div style={{height:60, borderBottom:'1px solid var(--border)', padding:'0 24px',
          display:'flex', alignItems:'center', gap:16}}>
          <span style={{color:'var(--muted-foreground)'}}>{Icons.users}</span>
          <Serif style={{fontSize:20, fontWeight:450}}>Friends</Serif>
        </div>
        <div style={{padding:'20px 32px'}}>
          <div style={{height:120, borderRadius:'var(--radius)',
            background:'color-mix(in oklab, var(--card) 60%, transparent)',
            border:'1px solid var(--border)'}}/>
        </div>
      </div>

      {label && (
        <div style={{position:'absolute', right:24, bottom:18,
          fontFamily:'JetBrains Mono, monospace', fontSize:10, letterSpacing:'0.12em',
          color:'var(--muted-foreground)', textTransform:'uppercase'}}>
          {label}
        </div>
      )}
    </Artboard>
  );
}

// Caret pointing down — popover sits above the UserBar
const UpCaret = ({ left = 22 }) => (
  <div style={{
    position:'absolute', bottom:-7, left, width:14, height:14,
    background:'var(--popover)', transform:'rotate(45deg)',
    borderRight:'1px solid var(--border-strong)',
    borderBottom:'1px solid var(--border-strong)',
  }}/>
);

// Status descriptor table — used by all three
const STATUSES = [
  { id:'online',  label:'Online',         color:'var(--success)',          desc:'Available · friends can ping you.' },
  { id:'idle',    label:'Idle',           color:'oklch(0.78 0.10 80)',     desc:'Away from keyboard.' },
  { id:'dnd',     label:'Do not disturb', color:'var(--destructive)',      desc:'Notifications muted.' },
  { id:'invis',   label:'Invisible',      color:'var(--muted-foreground)', desc:'Appear offline; still receive.' },
  { id:'offline', label:'Offline',        color:'var(--border-strong)',    desc:'Disconnected from voice & DMs.' },
];

const Dot = ({ color, size = 9, ring = false }) => (
  <span style={{
    width:size, height:size, borderRadius:'50%', background:color, flexShrink:0,
    boxShadow: ring ? `0 0 0 3px color-mix(in oklab, ${color} 30%, transparent)` : 'none',
  }}/>
);

// ─────────────────────────────────────────────────────────────────────────
// A · Identity card — editorial, status as vertical menu with descriptions
// ─────────────────────────────────────────────────────────────────────────
function UserStatusPopoverIdentity() {
  const current = 'online';
  return (
    <UserBarBackdrop label="A · Identity card · 320w">
      <div style={{
        position:'absolute', bottom:'calc(100% + 12px)', left:8, width:320,
        background:'var(--popover)', border:'1px solid var(--border-strong)',
        borderRadius:'var(--radius-lg)',
        boxShadow:'0 24px 60px -16px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.02)',
        zIndex:10, overflow:'hidden',
      }}>
        <UpCaret left={22}/>

        {/* identity hero */}
        <div style={{padding:'18px 18px 14px',
          background:'color-mix(in oklab, var(--chat) 10%, transparent)',
          borderBottom:'1px solid var(--border)'}}>
          <div style={{display:'flex', gap:14, alignItems:'flex-start'}}>
            <div style={{position:'relative'}}>
              <Avatar name="Alice" color="var(--chat)" size={56}/>
              <div style={{position:'absolute', right:-2, bottom:-2, width:16, height:16,
                borderRadius:'50%', border:'3px solid var(--popover)',
                background:'var(--success)'}}/>
            </div>
            <div style={{flex:1, minWidth:0, paddingTop:2}}>
              <Serif style={{fontSize:18, fontWeight:500, display:'block', lineHeight:1.15}}>
                Alice Koa
              </Serif>
              <Mono style={{fontSize:10.5, color:'var(--muted-foreground)', display:'block',
                marginTop:3}}>
                alice@kauai.pinai
              </Mono>
            </div>
          </div>

          {/* bio / profile description (visible to other users) */}
          <div style={{marginTop:11}}>
            <Mono style={{fontSize:9.5, letterSpacing:'0.14em', color:'var(--muted-foreground)',
              textTransform:'uppercase', display:'block', marginBottom:5}}>
              Bio · visible to friends
            </Mono>
            <div style={{padding:'9px 11px', borderRadius:'var(--radius-sm)',
              background:'color-mix(in oklab, var(--card) 55%, transparent)',
              border:'1px solid var(--border)',
              fontSize:12.5, lineHeight:1.5, fontStyle:'italic',
              fontFamily:'var(--serif, Fraunces), serif', color:'var(--foreground)'}}>
              Designer at Kauai Studio — interaction, lanterns, low-light interfaces.
              Tea drinker. Looking after a fern.
            </div>
          </div>
        </div>

        {/* presence selector */}
        <div style={{padding:'8px 6px'}}>
          <Mono style={{fontSize:9.5, letterSpacing:'0.14em', color:'var(--muted-foreground)',
            textTransform:'uppercase', display:'block', padding:'6px 10px 4px'}}>
            Set presence
          </Mono>
          {STATUSES.map(s => {
            const active = s.id === current;
            return (
              <div key={s.id} style={{
                display:'flex', alignItems:'center', gap:10, padding:'8px 10px',
                borderRadius:'var(--radius-sm)', cursor:'pointer',
                background: active ? 'var(--accent)' : 'transparent',
              }}>
                <Dot color={s.color} ring={active}/>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{fontSize:12.5, color:'var(--foreground)',
                    fontWeight: active ? 500 : 400,
                    fontFamily: active ? 'var(--serif, Fraunces), serif' : 'inherit'}}>
                    {s.label}
                  </div>
                  <div style={{fontSize:10.5, color:'var(--muted-foreground)', marginTop:1}}>
                    {s.desc}
                  </div>
                </div>
                {active && <span style={{color:'var(--chat)'}}>{Icons.check}</span>}
              </div>
            );
          })}
        </div>

        {/* footer quick actions */}
        <div style={{padding:'6px 6px 8px', borderTop:'1px solid var(--border)',
          display:'flex', gap:2}}>
          {[
            ['Edit profile', Icons.users],
            ['Copy handle', Icons.at],
            ['Settings', Icons.settings],
          ].map(([l, i]) => (
            <button key={l} style={{
              flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:5,
              padding:'9px 6px', borderRadius:'var(--radius-sm)', border:'none',
              background:'transparent', color:'var(--muted-foreground)', cursor:'pointer',
              fontFamily:'inherit', fontSize:10.5,
            }}>
              <span style={{display:'flex'}}>{i}</span>
              {l}
            </button>
          ))}
        </div>
      </div>
    </UserBarBackdrop>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// B · Status-first dial — chunky swatch row + custom status w/ timer
// ─────────────────────────────────────────────────────────────────────────
function UserStatusPopoverDial() {
  const current = 'online';
  return (
    <UserBarBackdrop label="B · Status-first dial · 300w">
      <div style={{
        position:'absolute', bottom:'calc(100% + 12px)', left:8, width:300,
        background:'var(--popover)', border:'1px solid var(--border-strong)',
        borderRadius:'var(--radius-lg)',
        boxShadow:'0 24px 60px -16px rgba(0,0,0,0.55)',
        zIndex:10, overflow:'hidden',
      }}>
        <UpCaret left={22}/>

        {/* compact identity strip + bio */}
        <div style={{padding:'14px 14px 12px', borderBottom:'1px solid var(--border)'}}>
          <div style={{display:'flex', alignItems:'center', gap:11}}>
            <Avatar name="Alice" color="var(--chat)" size={40} dot="online"/>
            <div style={{flex:1, minWidth:0}}>
              <Serif style={{fontSize:15, fontWeight:500, display:'block', lineHeight:1.15}}>
                Alice Koa
              </Serif>
              <Mono style={{fontSize:10.5, color:'var(--muted-foreground)'}}>
                alice@kauai.pinai
              </Mono>
            </div>
            <button style={{width:28, height:28, borderRadius:'var(--radius-sm)',
              border:'1px solid var(--border-strong)', background:'transparent',
              color:'var(--muted-foreground)', cursor:'pointer', display:'flex',
              alignItems:'center', justifyContent:'center'}}>{Icons.more}</button>
          </div>
          <div style={{marginTop:10, fontSize:12, lineHeight:1.5, fontStyle:'italic',
            fontFamily:'var(--serif, Fraunces), serif', color:'var(--foreground)'}}>
            Designer at Kauai Studio — interaction &amp; low-light interfaces. Tea drinker.
          </div>
        </div>

        {/* presence dial — tappable colored chips */}
        <div style={{padding:'12px 12px 6px'}}>
          <Mono style={{fontSize:9.5, letterSpacing:'0.14em', color:'var(--muted-foreground)',
            textTransform:'uppercase', display:'block', marginBottom:8}}>
            Presence
          </Mono>
          <div style={{display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:6}}>
            {STATUSES.map(s => {
              const active = s.id === current;
              return (
                <div key={s.id} style={{
                  position:'relative',
                  display:'flex', flexDirection:'column', alignItems:'center', gap:5,
                  padding:'10px 4px 7px', borderRadius:'var(--radius-sm)', cursor:'pointer',
                  background: active
                    ? `color-mix(in oklab, ${s.color} 18%, var(--card))`
                    : 'var(--card)',
                  border: active
                    ? `1px solid ${s.color}`
                    : '1px solid var(--border)',
                }}>
                  <span style={{
                    width:14, height:14, borderRadius:'50%', background: s.color,
                    boxShadow: active ? `0 0 0 3px color-mix(in oklab, ${s.color} 25%, transparent)` : 'none',
                  }}/>
                  <span style={{fontSize:9.5, color: active ? 'var(--foreground)' : 'var(--muted-foreground)',
                    fontWeight: active ? 600 : 400, letterSpacing:'0.02em', textAlign:'center', lineHeight:1.1}}>
                    {s.label.split(' ')[0]}
                  </span>
                </div>
              );
            })}
          </div>
          <div style={{fontSize:11, color:'var(--muted-foreground)', marginTop:8,
            fontStyle:'italic', fontFamily:'var(--serif, Fraunces), serif',
            textAlign:'center'}}>
            {STATUSES.find(s => s.id === current).desc}
          </div>
        </div>

        {/* footer quick actions */}
        <div style={{padding:'8px 8px', borderTop:'1px solid var(--border)',
          background:'color-mix(in oklab, var(--card) 60%, transparent)',
          display:'flex', gap:2}}>
          {[
            ['Edit profile', Icons.users],
            ['Copy handle', Icons.at],
            ['Settings', Icons.settings],
          ].map(([l, i]) => (
            <button key={l} style={{
              flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6,
              padding:'7px 6px', borderRadius:'var(--radius-sm)', border:'none',
              background:'transparent', color:'var(--muted-foreground)', cursor:'pointer',
              fontFamily:'inherit', fontSize:11,
            }}>
              <span style={{display:'flex'}}>{i}</span>
              {l}
            </button>
          ))}
        </div>
      </div>
    </UserBarBackdrop>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// C · Identity + activity — two-column, presence + what-I'm-doing-now
// ─────────────────────────────────────────────────────────────────────────
function UserStatusPopoverActivity() {
  const current = 'online';
  return (
    <UserBarBackdrop label="C · Identity + activity · 460w">
      <div style={{
        position:'absolute', bottom:'calc(100% + 12px)', left:8, width:460,
        background:'var(--popover)', border:'1px solid var(--border-strong)',
        borderRadius:'var(--radius-lg)',
        boxShadow:'0 24px 60px -16px rgba(0,0,0,0.55)',
        zIndex:10, overflow:'hidden',
      }}>
        <UpCaret left={22}/>

        {/* hero band */}
        <div style={{padding:'16px 18px 14px',
          background:'color-mix(in oklab, var(--chat) 10%, transparent)',
          borderBottom:'1px solid var(--border)',
          display:'flex', alignItems:'flex-start', gap:14}}>
          <div style={{position:'relative'}}>
            <Avatar name="Alice" color="var(--chat)" size={52}/>
            <div style={{position:'absolute', right:-2, bottom:-2, width:15, height:15,
              borderRadius:'50%', border:'3px solid var(--popover)',
              background:'var(--success)'}}/>
          </div>
          <div style={{flex:1, minWidth:0}}>
            <div style={{display:'flex', alignItems:'baseline', gap:8}}>
              <Serif style={{fontSize:17, fontWeight:500}}>Alice Koa</Serif>
              <Mono style={{fontSize:10, padding:'1px 6px', borderRadius:4,
                background:'color-mix(in oklab, var(--success) 22%, transparent)',
                color:'var(--success)', letterSpacing:'0.08em', textTransform:'uppercase'}}>
                online
              </Mono>
            </div>
            <Mono style={{fontSize:10.5, color:'var(--muted-foreground)', display:'block',
              marginTop:2}}>
              alice@kauai.pinai · she/her
            </Mono>
            <div style={{marginTop:8, fontSize:12, fontStyle:'italic',
              fontFamily:'var(--serif, Fraunces), serif', color:'var(--foreground)',
              lineHeight:1.5}}>
              Designer at Kauai Studio — interaction &amp; low-light interfaces. Tea drinker.
              Looking after a fern.
            </div>
          </div>
        </div>

        {/* split body */}
        <div style={{display:'flex'}}>
          {/* LEFT — presence */}
          <div style={{flex:1, padding:'10px 6px 8px',
            borderRight:'1px solid var(--border)'}}>
            <Mono style={{fontSize:9.5, letterSpacing:'0.14em', color:'var(--muted-foreground)',
              textTransform:'uppercase', display:'block', padding:'4px 10px 6px'}}>
              Presence
            </Mono>
            {STATUSES.map(s => {
              const active = s.id === current;
              return (
                <div key={s.id} style={{
                  display:'flex', alignItems:'center', gap:10, padding:'7px 10px',
                  borderRadius:'var(--radius-sm)', cursor:'pointer',
                  background: active ? 'var(--accent)' : 'transparent',
                }}>
                  <Dot color={s.color} ring={active}/>
                  <span style={{flex:1, fontSize:12.5, color:'var(--foreground)',
                    fontWeight: active ? 500 : 400,
                    fontFamily: active ? 'var(--serif, Fraunces), serif' : 'inherit'}}>
                    {s.label}
                  </span>
                  {active && <span style={{color:'var(--chat)', fontSize:14}}>{Icons.check}</span>}
                </div>
              );
            })}

            {/* mute submenu */}
            <div style={{borderTop:'1px solid var(--border)', marginTop:6, paddingTop:6}}>
              <div style={{display:'flex', alignItems:'center', gap:10, padding:'7px 10px',
                borderRadius:'var(--radius-sm)', cursor:'pointer',
                color:'var(--muted-foreground)', fontSize:12.5}}>
                <span>{Icons.bell}</span>
                <span style={{flex:1}}>Mute notifications</span>
                <span style={{fontSize:14}}>{Icons.chevR}</span>
              </div>
              <div style={{display:'flex', alignItems:'center', gap:10, padding:'7px 10px',
                borderRadius:'var(--radius-sm)', cursor:'pointer',
                color:'var(--muted-foreground)', fontSize:12.5}}>
                <span>{Icons.moon}</span>
                <span style={{flex:1}}>Quiet hours</span>
                <Mono style={{fontSize:10}}>22–7</Mono>
              </div>
            </div>
          </div>

          {/* RIGHT — live activity */}
          <div style={{flex:1.1, padding:'10px 12px 8px'}}>
            <Mono style={{fontSize:9.5, letterSpacing:'0.14em', color:'var(--muted-foreground)',
              textTransform:'uppercase', display:'block', padding:'4px 0 8px'}}>
              Now
            </Mono>

            {/* live voice card */}
            <div style={{
              padding:'10px 11px', borderRadius:'var(--radius-sm)',
              background:'color-mix(in oklab, var(--voice) 12%, transparent)',
              border:'1px solid color-mix(in oklab, var(--voice) 30%, var(--border))',
              marginBottom:8,
            }}>
              <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:6}}>
                <span style={{color:'var(--voice)', display:'flex'}}>{Icons.headset}</span>
                <Mono style={{fontSize:10, letterSpacing:'0.1em', color:'var(--voice)',
                  textTransform:'uppercase', fontWeight:600}}>In voice · live</Mono>
                <Mono style={{fontSize:10, color:'var(--muted-foreground)', marginLeft:'auto'}}>22m</Mono>
              </div>
              <Serif style={{fontSize:13.5, fontWeight:500, display:'block'}}>Design Lab</Serif>
              <div style={{display:'flex', alignItems:'center', gap:5, marginTop:4,
                fontSize:11, color:'var(--muted-foreground)'}}>
                <span style={{display:'inline-flex', gap:1.5, alignItems:'flex-end', height:8}}>
                  {[0.4, 0.7, 0.5, 0.9, 0.6].map((h,i) => (
                    <span key={i} style={{
                      width:2, height:`${h*100}%`, background:'var(--voice)', borderRadius:1,
                      animation:`pn-bounce 1.${3+i}s ease-in-out infinite`,
                      animationDelay:`${i * 0.08}s`,
                    }}/>
                  ))}
                </span>
                <span>with Maia, Kai · 3 listening</span>
              </div>
              <div style={{display:'flex', gap:6, marginTop:8}}>
                <button style={{padding:'4px 9px', fontSize:11, borderRadius:5, border:'none',
                  background:'transparent', color:'var(--voice)',
                  border:'1px solid var(--voice)', cursor:'pointer', fontFamily:'inherit',
                  display:'flex', alignItems:'center', gap:4}}>
                  {Icons.micOff} Mute
                </button>
                <button style={{padding:'4px 9px', fontSize:11, borderRadius:5,
                  border:'1px solid var(--border-strong)', background:'transparent',
                  color:'var(--muted-foreground)', cursor:'pointer', fontFamily:'inherit'}}>
                  Leave
                </button>
              </div>
            </div>

            {/* viewing channel */}
            <div style={{padding:'8px 10px', borderRadius:'var(--radius-sm)',
              border:'1px solid var(--border)'}}>
              <Mono style={{fontSize:9.5, letterSpacing:'0.1em', color:'var(--muted-foreground)',
                textTransform:'uppercase', display:'block', marginBottom:3}}>Viewing</Mono>
              <div style={{display:'flex', alignItems:'center', gap:6}}>
                <span style={{color:'var(--chat)'}}>{Icons.hash}</span>
                <Serif style={{fontSize:13, fontWeight:500}}>design-lab</Serif>
                <Mono style={{fontSize:10, color:'var(--muted-foreground)', marginLeft:'auto'}}>kauai</Mono>
              </div>
            </div>

            {/* footer hint */}
            <Mono style={{fontSize:10, color:'var(--muted-foreground)', display:'block',
              marginTop:10, textAlign:'center', letterSpacing:'0.06em'}}>
              Friends see your activity · <span style={{color:'var(--chat)'}}>edit</span>
            </Mono>
          </div>
        </div>

        {/* footer */}
        <div style={{padding:'9px 14px', borderTop:'1px solid var(--border)',
          background:'color-mix(in oklab, var(--card) 60%, transparent)',
          display:'flex', alignItems:'center', gap:10}}>
          <button style={{padding:'5px 10px', fontSize:11, borderRadius:5, border:'none',
            background:'transparent', color:'var(--muted-foreground)', cursor:'pointer',
            fontFamily:'inherit', display:'flex', alignItems:'center', gap:5}}>
            {Icons.users} Profile
          </button>
          <button style={{padding:'5px 10px', fontSize:11, borderRadius:5, border:'none',
            background:'transparent', color:'var(--muted-foreground)', cursor:'pointer',
            fontFamily:'inherit', display:'flex', alignItems:'center', gap:5}}>
            {Icons.settings} Settings
          </button>
          <div style={{flex:1}}/>
          <button style={{padding:'5px 11px', fontSize:11, borderRadius:5,
            border:'1px solid var(--destructive)', background:'transparent',
            color:'var(--destructive)', cursor:'pointer', fontFamily:'inherit'}}>
            Sign out
          </button>
        </div>
      </div>
    </UserBarBackdrop>
  );
}

Object.assign(window, {
  UserStatusPopoverIdentity,
  UserStatusPopoverDial,
  UserStatusPopoverActivity,
});
