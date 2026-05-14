// Notifications — Bell IconBtn + popover variations
// Anchored to the bell in the top-right topbar. Three directions exploring
// hierarchy, density and interaction.

// ── Shared backdrop: the page chrome with bell + theme toggle visible ─────
function NotifBackdrop({ children, label }) {
  return (
    <Artboard w={1200} h={760} style={{display:'flex', flexDirection:'column'}}>
      {/* Topbar — matches the screenshot context */}
      <div style={{height:60, borderBottom:'1px solid var(--border)', padding:'0 24px',
        display:'flex', alignItems:'center', gap:16, position:'relative', zIndex:2,
        background:'var(--background)'}}>
        <span style={{color:'var(--muted-foreground)'}}>{Icons.users}</span>
        <Serif style={{fontSize:20, fontWeight:450}}>Friends</Serif>
        <div style={{width:1, height:18, background:'var(--border)'}}/>
        <span style={{fontSize:12.5, color:'var(--muted-foreground)', fontStyle:'italic',
          fontFamily:'var(--serif, Fraunces), serif'}}>Manage the people you keep close.</span>

        <div style={{flex:1}}/>

        {/* theme toggle echo */}
        <div style={{display:'flex', alignItems:'center', gap:8,
          padding:'4px 6px', borderRadius:'var(--radius-sm)',
          background:'var(--muted)'}}>
          <span style={{color:'var(--muted-foreground)', fontSize:13}}>{Icons.moon}</span>
          <div style={{width:28, height:16, borderRadius:10, background:'var(--card)',
            border:'1px solid var(--border-strong)', position:'relative'}}>
            <div style={{position:'absolute', left:1, top:1, width:12, height:12, borderRadius:'50%',
              background:'var(--foreground)'}}/>
          </div>
          <span style={{color:'var(--muted-foreground)', fontSize:13}}>{Icons.sun}</span>
        </div>

        {/* anchor — the bell */}
        <div style={{position:'relative'}}>
          <button data-anchor style={{
            width:34, height:34, borderRadius:'var(--radius-sm)', border:'1px solid var(--border-strong)',
            background:'var(--card)', color:'var(--foreground)',
            display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer',
            position:'relative', fontFamily:'inherit',
          }}>
            <span style={{
              display:'flex',
              transformOrigin:'50% 18%',
              animation:'pn-ring 3.4s ease-in-out infinite',
            }}>{Icons.bell}</span>
            {/* unread dot + animated ping halo */}
            <span style={{position:'absolute', top:6, right:6, width:7, height:7, borderRadius:'50%',
              background:'var(--voice)', border:'2px solid var(--card)', zIndex:2}}/>
            <span style={{position:'absolute', top:6, right:6, width:7, height:7, borderRadius:'50%',
              background:'var(--voice)', opacity:0.7,
              animation:'pn-ping 1.8s cubic-bezier(0, 0, 0.2, 1) infinite',
              pointerEvents:'none',
            }}/>
          </button>
          {children}
        </div>
      </div>

      {/* friends rows underneath, dimmed (so the popover reads as overlay) */}
      <div style={{flex:1, padding:'4px 16px', opacity:0.35, filter:'saturate(0.6)'}}>
        {[
          ['Bob','bob@kauai.pinai','Working on the lantern prototype','online','oklch(0.75 0.06 70)'],
          ['Maia','maia@studio.pinai','In voice · Design Lab','voice','oklch(0.72 0.07 330)'],
          ['Kai','kai@lab.pinai','—','online','oklch(0.74 0.06 200)'],
          ['Jules','jules@studio.pinai','Idle — listening','idle','oklch(0.70 0.05 260)'],
          ['Pierre','pierre@mft.pinai','—','idle','oklch(0.74 0.06 30)'],
        ].map(([n,h,s,d,c]) => (
          <div key={n} style={{display:'flex', alignItems:'center', gap:14, padding:'12px 16px',
            borderBottom:'1px solid color-mix(in oklab, var(--border) 40%, transparent)'}}>
            <Avatar name={n} color={c} size={36} dot={d}/>
            <div style={{flex:1}}>
              <div style={{display:'flex', alignItems:'baseline', gap:8}}>
                <Serif style={{fontSize:15}}>{n}</Serif>
                <Mono style={{fontSize:11, color:'var(--muted-foreground)'}}>{h}</Mono>
              </div>
              <div style={{fontSize:12, color:'var(--muted-foreground)', marginTop:2}}>{s}</div>
            </div>
          </div>
        ))}
      </div>

      {/* corner caption */}
      {label && (
        <div style={{position:'absolute', left:24, bottom:18,
          fontFamily:'JetBrains Mono, monospace', fontSize:10, letterSpacing:'0.12em',
          color:'var(--muted-foreground)', textTransform:'uppercase'}}>
          {label}
        </div>
      )}
    </Artboard>
  );
}

const NotifCaret = () => (
  <div style={{
    position:'absolute', top:-7, right:14, width:14, height:14,
    background:'var(--popover)', transform:'rotate(45deg)',
    borderTop:'1px solid var(--border-strong)', borderLeft:'1px solid var(--border-strong)',
  }}/>
);

// Avatar with monogram coloured per source
function NAvatar({ name, color, size = 32 }) {
  return (
    <div style={{
      width:size, height:size, borderRadius:'50%', flexShrink:0,
      background: color || 'var(--muted)',
      display:'flex', alignItems:'center', justifyContent:'center',
      color:'oklch(0.18 0.008 60)', fontSize:size*0.42, fontWeight:600,
      fontFamily:'var(--serif, Fraunces), serif',
    }}>{name?.[0]}</div>
  );
}

// Tiny channel chip (chat / voice / system)
function Kind({ kind }) {
  const map = {
    friend:  ['friend',  'var(--chat)'],
    mention: ['mention', 'var(--chat)'],
    voice:   ['voice',   'var(--voice)'],
    system:  ['system',  'var(--muted-foreground)'],
    reply:   ['reply',   'var(--chat)'],
  };
  const [label, color] = map[kind] || [kind, 'var(--muted-foreground)'];
  return (
    <Mono style={{
      fontSize:9.5, letterSpacing:'0.1em', textTransform:'uppercase',
      color, padding:'1px 6px', borderRadius:4,
      background:`color-mix(in oklab, ${color} 14%, transparent)`,
    }}>{label}</Mono>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// A · Editorial inbox — calmer hierarchy, grouped, avatars, inline actions
// ─────────────────────────────────────────────────────────────────────────
function NotifPopoverEditorial() {
  return (
    <NotifBackdrop label="A · Editorial inbox · 380w">
      <div style={{
        position:'absolute', top:'calc(100% + 12px)', right:0, width:400,
        background:'var(--popover)', border:'1px solid var(--border-strong)',
        borderRadius:'var(--radius-lg)',
        boxShadow:'0 24px 60px -16px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.02)',
        zIndex:10, overflow:'hidden',
      }}>
        <NotifCaret/>

        {/* header */}
        <div style={{padding:'14px 16px 10px', borderBottom:'1px solid var(--border)'}}>
          <div style={{display:'flex', alignItems:'baseline', justifyContent:'space-between'}}>
            <div style={{display:'flex', alignItems:'baseline', gap:8}}>
              <Serif style={{fontSize:17, fontWeight:500}}>Notifications</Serif>
              <Mono style={{fontSize:10, color:'var(--muted-foreground)', letterSpacing:'0.08em',
                textTransform:'uppercase'}}>3 new</Mono>
            </div>
            <button style={{padding:'4px 8px', fontSize:11, borderRadius:5, border:'none',
              background:'transparent', color:'var(--muted-foreground)', cursor:'pointer',
              fontFamily:'inherit'}}>Mark all read</button>
          </div>

          {/* filter pills */}
          <div style={{display:'flex', gap:4, marginTop:10}}>
            {[['All', true], ['Unread', false], ['Mentions', false]].map(([l, a]) => (
              <span key={l} style={{
                padding:'4px 10px', borderRadius:999, fontSize:11,
                border: a ? '1px solid var(--border-strong)' : '1px solid transparent',
                background: a ? 'var(--accent)' : 'transparent',
                color: a ? 'var(--foreground)' : 'var(--muted-foreground)',
                fontWeight: a ? 500 : 400,
              }}>{l}</span>
            ))}
          </div>
        </div>

        {/* TODAY group */}
        <div style={{padding:'8px 8px 0'}}>
          <Mono style={{fontSize:9.5, letterSpacing:'0.14em', color:'var(--muted-foreground)',
            textTransform:'uppercase', padding:'6px 10px', display:'block'}}>Today</Mono>

          {/* friend request — primary state */}
          <div style={{
            position:'relative',
            display:'flex', gap:11, padding:'10px 10px',
            borderRadius:'var(--radius-sm)',
            background:'color-mix(in oklab, var(--chat) 8%, transparent)',
          }}>
            {/* unread dot */}
            <span style={{position:'absolute', left:2, top:18, width:5, height:5, borderRadius:'50%',
              background:'var(--chat)'}}/>
            <NAvatar name="Pierre" color="oklch(0.74 0.06 30)" size={36}/>
            <div style={{flex:1, minWidth:0}}>
              <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:2}}>
                <Kind kind="friend"/>
                <Mono style={{fontSize:10, color:'var(--muted-foreground)', marginLeft:'auto'}}>2m</Mono>
              </div>
              <div style={{fontSize:13, color:'var(--foreground)', lineHeight:1.4}}>
                <Serif style={{fontWeight:500}}>Pierre</Serif> sent you a friend request.
              </div>
              <Mono style={{fontSize:10.5, color:'var(--muted-foreground)', display:'block', marginTop:2}}>
                pierre@mft.pinai
              </Mono>
              <div style={{display:'flex', gap:6, marginTop:9}}>
                <button style={{padding:'5px 12px', fontSize:11.5, fontWeight:600,
                  borderRadius:5, border:'none', background:'var(--chat)',
                  color:'var(--primary-foreground)', cursor:'pointer', fontFamily:'inherit',
                  display:'flex', alignItems:'center', gap:5}}>
                  Accept
                </button>
                <button style={{padding:'5px 10px', fontSize:11.5, borderRadius:5,
                  border:'1px solid var(--border-strong)', background:'transparent',
                  color:'var(--muted-foreground)', cursor:'pointer', fontFamily:'inherit'}}>
                  Decline
                </button>
              </div>
            </div>
          </div>

          {/* mention */}
          <div style={{
            position:'relative',
            display:'flex', gap:11, padding:'10px 10px',
            borderRadius:'var(--radius-sm)',
          }}>
            <span style={{position:'absolute', left:2, top:18, width:5, height:5, borderRadius:'50%',
              background:'var(--chat)'}}/>
            <NAvatar name="Maia" color="oklch(0.72 0.07 330)" size={36}/>
            <div style={{flex:1, minWidth:0}}>
              <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:2}}>
                <Kind kind="mention"/>
                <Mono style={{fontSize:10, color:'var(--muted-foreground)'}}>#design-lab</Mono>
                <Mono style={{fontSize:10, color:'var(--muted-foreground)', marginLeft:'auto'}}>14m</Mono>
              </div>
              <div style={{fontSize:13, color:'var(--foreground)', lineHeight:1.45}}>
                <Serif style={{fontWeight:500}}>Maia</Serif> mentioned you:
                <span style={{color:'var(--muted-foreground)', fontStyle:'italic',
                  fontFamily:'var(--serif, Fraunces), serif'}}>
                  {' '}“@alice can you take a look at the lantern proto?”
                </span>
              </div>
            </div>
          </div>

          {/* voice */}
          <div style={{
            position:'relative',
            display:'flex', gap:11, padding:'10px 10px',
            borderRadius:'var(--radius-sm)',
            background:'color-mix(in oklab, var(--voice) 7%, transparent)',
          }}>
            <span style={{position:'absolute', left:2, top:18, width:5, height:5, borderRadius:'50%',
              background:'var(--voice)'}}/>
            <NAvatar name="Kai" color="oklch(0.74 0.06 200)" size={36}/>
            <div style={{flex:1, minWidth:0}}>
              <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:2}}>
                <Kind kind="voice"/>
                <Mono style={{fontSize:10, color:'var(--muted-foreground)', marginLeft:'auto'}}>just now</Mono>
              </div>
              <div style={{fontSize:13, color:'var(--foreground)', lineHeight:1.4}}>
                <Serif style={{fontWeight:500}}>Kai</Serif> added you to a voice room ·{' '}
                <Mono style={{fontSize:11.5, color:'var(--voice)'}}>Design Lab</Mono>
              </div>
              <div style={{display:'flex', gap:6, marginTop:9}}>
                <button style={{padding:'5px 12px', fontSize:11.5, fontWeight:600,
                  borderRadius:5, border:'none', background:'var(--voice)',
                  color:'var(--voice-foreground)', cursor:'pointer', fontFamily:'inherit'}}>
                  Open
                </button>
                <button style={{padding:'5px 10px', fontSize:11.5, borderRadius:5,
                  border:'1px solid var(--border-strong)', background:'transparent',
                  color:'var(--muted-foreground)', cursor:'pointer', fontFamily:'inherit'}}>
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* EARLIER group */}
        <div style={{padding:'4px 8px 6px'}}>
          <Mono style={{fontSize:9.5, letterSpacing:'0.14em', color:'var(--muted-foreground)',
            textTransform:'uppercase', padding:'8px 10px 4px', display:'block'}}>Earlier this week</Mono>

          <div style={{display:'flex', gap:11, padding:'8px 10px', borderRadius:'var(--radius-sm)',
            opacity:0.85}}>
            <NAvatar name="Jules" color="oklch(0.70 0.05 260)" size={32}/>
            <div style={{flex:1, minWidth:0}}>
              <div style={{fontSize:12.5, color:'var(--foreground)', lineHeight:1.4}}>
                <Serif style={{fontWeight:500}}>Jules</Serif> accepted your friend request.
              </div>
              <Mono style={{fontSize:10, color:'var(--muted-foreground)'}}>Tue · 14:02</Mono>
            </div>
          </div>

          <div style={{display:'flex', gap:11, padding:'8px 10px', borderRadius:'var(--radius-sm)',
            opacity:0.85}}>
            <span style={{width:32, height:32, borderRadius:'50%', background:'var(--muted)',
              display:'flex', alignItems:'center', justifyContent:'center',
              color:'var(--muted-foreground)'}}>{Icons.sparkle}</span>
            <div style={{flex:1, minWidth:0}}>
              <div style={{fontSize:12.5, color:'var(--foreground)', lineHeight:1.4}}>
                Server <Mono style={{color:'var(--foreground)'}}>kauai.pinai</Mono> updated to v0.9.
              </div>
              <Mono style={{fontSize:10, color:'var(--muted-foreground)'}}>Mon · 09:18</Mono>
            </div>
          </div>
        </div>

        {/* footer */}
        <div style={{padding:'10px 14px', borderTop:'1px solid var(--border)',
          background:'color-mix(in oklab, var(--card) 60%, transparent)',
          display:'flex', alignItems:'center', gap:10}}>
          <Mono style={{fontSize:10, color:'var(--muted-foreground)', flex:1, letterSpacing:'0.08em',
            textTransform:'uppercase'}}>↑↓ navigate · ↵ open</Mono>
          <button style={{padding:'5px 10px', fontSize:11, borderRadius:5,
            border:'1px solid var(--border-strong)', background:'transparent',
            color:'var(--foreground)', cursor:'pointer', fontFamily:'inherit'}}>
            All notifications
          </button>
        </div>
      </div>
    </NotifBackdrop>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// B · Categorized — left rail of categories with counts, right pane feed
// ─────────────────────────────────────────────────────────────────────────
function NotifPopoverCategorized() {
  const cats = [
    { id:'all', label:'All', count:7, icon: Icons.bell, active:false },
    { id:'mentions', label:'Mentions', count:3, icon: Icons.at, active:true, color:'var(--chat)' },
    { id:'friends', label:'Friends', count:2, icon: Icons.users, active:false, color:'var(--chat)' },
    { id:'voice', label:'Voice', count:1, icon: Icons.headset, active:false, color:'var(--voice)' },
    { id:'system', label:'System', count:1, icon: Icons.settings, active:false },
  ];
  return (
    <NotifBackdrop label="B · Categorized · 520w">
      <div style={{
        position:'absolute', top:'calc(100% + 12px)', right:0, width:520,
        background:'var(--popover)', border:'1px solid var(--border-strong)',
        borderRadius:'var(--radius-lg)',
        boxShadow:'0 24px 60px -16px rgba(0,0,0,0.55)',
        zIndex:10, overflow:'hidden',
        display:'flex', flexDirection:'column',
      }}>
        <NotifCaret/>

        {/* header */}
        <div style={{padding:'14px 16px 12px', borderBottom:'1px solid var(--border)',
          display:'flex', alignItems:'baseline', justifyContent:'space-between'}}>
          <div>
            <Serif style={{fontSize:17, fontWeight:500}}>Notifications</Serif>
            <span style={{display:'block', fontSize:11.5, color:'var(--muted-foreground)',
              fontStyle:'italic', fontFamily:'var(--serif, Fraunces), serif', marginTop:2}}>
              Showing mentions across all servers.
            </span>
          </div>
          <Mono style={{fontSize:10, color:'var(--muted-foreground)', letterSpacing:'0.08em',
            textTransform:'uppercase'}}>3 unread</Mono>
        </div>

        {/* split body */}
        <div style={{display:'flex', minHeight:340}}>
          {/* left rail */}
          <div style={{width:160, borderRight:'1px solid var(--border)',
            background:'color-mix(in oklab, var(--card) 50%, transparent)',
            padding:'8px 6px', display:'flex', flexDirection:'column', gap:1}}>
            {cats.map(c => (
              <div key={c.id} style={{
                display:'flex', alignItems:'center', gap:9, padding:'7px 9px',
                borderRadius:'var(--radius-sm)',
                background: c.active ? 'var(--accent)' : 'transparent',
                color: c.active ? 'var(--foreground)' : 'var(--muted-foreground)',
                fontSize:12.5, cursor:'pointer',
              }}>
                <span style={{color: c.color || (c.active ? 'var(--foreground)' : 'var(--muted-foreground)'),
                  display:'flex'}}>{c.icon}</span>
                <span style={{flex:1, fontFamily: c.active ? 'var(--serif, Fraunces), serif' : 'inherit',
                  fontWeight: c.active ? 500 : 400}}>{c.label}</span>
                {c.count > 0 && (
                  <Mono style={{fontSize:10, padding:'1px 6px', borderRadius:10,
                    background: c.active ? 'var(--card)' : 'var(--muted)',
                    color: c.active ? 'var(--foreground)' : 'var(--muted-foreground)'}}>
                    {c.count}
                  </Mono>
                )}
              </div>
            ))}

            <div style={{flex:1}}/>
            <div style={{padding:'8px 9px', borderTop:'1px solid var(--border)', marginTop:6}}>
              <Mono style={{fontSize:9.5, letterSpacing:'0.12em', color:'var(--muted-foreground)',
                textTransform:'uppercase', display:'block', marginBottom:4}}>Snoozed</Mono>
              <div style={{display:'flex', alignItems:'center', gap:6, fontSize:11,
                color:'var(--muted-foreground)'}}>
                <span>{Icons.moon}</span> until 6pm
              </div>
            </div>
          </div>

          {/* right feed */}
          <div style={{flex:1, padding:'8px 8px 6px', overflow:'hidden'}}>
            {/* mention 1 (highlighted) */}
            <div style={{
              padding:'10px 11px', borderRadius:'var(--radius-sm)',
              border:'1px solid color-mix(in oklab, var(--chat) 30%, var(--border))',
              background:'color-mix(in oklab, var(--chat) 10%, transparent)',
              marginBottom:6,
            }}>
              <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:6}}>
                <NAvatar name="Maia" color="oklch(0.72 0.07 330)" size={26}/>
                <Serif style={{fontSize:13, fontWeight:500}}>Maia</Serif>
                <Mono style={{fontSize:10, color:'var(--muted-foreground)'}}>#design-lab</Mono>
                <Mono style={{fontSize:10, color:'var(--muted-foreground)', marginLeft:'auto'}}>14m</Mono>
              </div>
              <div style={{fontSize:12.5, lineHeight:1.5, color:'var(--foreground)',
                paddingLeft:34, fontStyle:'italic', fontFamily:'var(--serif, Fraunces), serif'}}>
                “<Mono style={{color:'var(--chat)', fontStyle:'normal'}}>@alice</Mono> can you
                take a look at the lantern proto when you get a sec? Pulled the warm-light
                variants you sketched on Tuesday.”
              </div>
              <div style={{display:'flex', gap:6, marginTop:9, paddingLeft:34}}>
                <button style={{padding:'4px 10px', fontSize:11, borderRadius:5,
                  border:'none', background:'var(--chat)', color:'var(--primary-foreground)',
                  fontWeight:600, cursor:'pointer', fontFamily:'inherit',
                  display:'flex', alignItems:'center', gap:5}}>
                  {Icons.reply} Reply
                </button>
                <button style={{padding:'4px 10px', fontSize:11, borderRadius:5,
                  border:'1px solid var(--border-strong)', background:'transparent',
                  color:'var(--muted-foreground)', cursor:'pointer', fontFamily:'inherit'}}>
                  Open thread
                </button>
              </div>
            </div>

            {/* mention 2 */}
            <div style={{padding:'9px 11px', borderRadius:'var(--radius-sm)',
              borderBottom:'1px solid var(--border)'}}>
              <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:4}}>
                <NAvatar name="Bob" color="oklch(0.75 0.06 70)" size={24}/>
                <Serif style={{fontSize:12.5, fontWeight:500}}>Bob</Serif>
                <Mono style={{fontSize:10, color:'var(--muted-foreground)'}}>direct</Mono>
                <Mono style={{fontSize:10, color:'var(--muted-foreground)', marginLeft:'auto'}}>1h</Mono>
              </div>
              <div style={{fontSize:12, color:'var(--muted-foreground)', paddingLeft:32, lineHeight:1.5,
                fontFamily:'var(--serif, Fraunces), serif', fontStyle:'italic'}}>
                “@alice did you see the kauai server update? curious about the link previews.”
              </div>
            </div>

            {/* mention 3 */}
            <div style={{padding:'9px 11px', borderRadius:'var(--radius-sm)'}}>
              <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:4}}>
                <NAvatar name="Jules" color="oklch(0.70 0.05 260)" size={24}/>
                <Serif style={{fontSize:12.5, fontWeight:500}}>Jules</Serif>
                <Mono style={{fontSize:10, color:'var(--muted-foreground)'}}>#studio-music</Mono>
                <Mono style={{fontSize:10, color:'var(--muted-foreground)', marginLeft:'auto'}}>Yesterday</Mono>
              </div>
              <div style={{fontSize:12, color:'var(--muted-foreground)', paddingLeft:32, lineHeight:1.5,
                fontFamily:'var(--serif, Fraunces), serif', fontStyle:'italic'}}>
                “@alice ↑ tagging you on the listening session thread.”
              </div>
            </div>
          </div>
        </div>

        {/* footer */}
        <div style={{padding:'10px 14px', borderTop:'1px solid var(--border)',
          background:'color-mix(in oklab, var(--card) 60%, transparent)',
          display:'flex', alignItems:'center', gap:10}}>
          <button style={{padding:'5px 10px', fontSize:11, borderRadius:5,
            border:'none', background:'transparent', color:'var(--muted-foreground)',
            cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', gap:5}}>
            {Icons.moon} Snooze
          </button>
          <div style={{flex:1}}/>
          <Mono style={{fontSize:10, color:'var(--muted-foreground)', letterSpacing:'0.08em',
            textTransform:'uppercase'}}>j/k navigate</Mono>
          <button style={{padding:'5px 10px', fontSize:11, borderRadius:5,
            border:'1px solid var(--border-strong)', background:'transparent',
            color:'var(--foreground)', cursor:'pointer', fontFamily:'inherit'}}>
            Mark all read
          </button>
        </div>
      </div>
    </NotifBackdrop>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// C · Live activity stream — timeline with consolidations & inline reply
// ─────────────────────────────────────────────────────────────────────────
function NotifPopoverActivity() {
  return (
    <NotifBackdrop label="C · Activity stream · 420w">
      <div style={{
        position:'absolute', top:'calc(100% + 12px)', right:0, width:430,
        background:'var(--popover)', border:'1px solid var(--border-strong)',
        borderRadius:'var(--radius-lg)',
        boxShadow:'0 24px 60px -16px rgba(0,0,0,0.55)',
        zIndex:10, overflow:'hidden',
      }}>
        <NotifCaret/>

        {/* editorial header */}
        <div style={{padding:'16px 18px 12px', borderBottom:'1px solid var(--border)',
          background:'color-mix(in oklab, var(--card) 50%, transparent)'}}>
          <Mono style={{fontSize:9.5, letterSpacing:'0.14em', color:'var(--muted-foreground)',
            textTransform:'uppercase', display:'block', marginBottom:4}}>— activity</Mono>
          <Serif style={{fontSize:20, fontWeight:400, letterSpacing:'-0.01em', display:'block',
            lineHeight:1.15}}>
            Quietly, while you were away.
          </Serif>
          <div style={{display:'flex', alignItems:'center', gap:8, marginTop:9}}>
            <Mono style={{fontSize:10, color:'var(--muted-foreground)', letterSpacing:'0.08em'}}>
              SINCE 14:02 · 5 events
            </Mono>
            <div style={{flex:1}}/>
            <button style={{padding:'3px 8px', fontSize:10.5, borderRadius:4,
              border:'none', background:'transparent', color:'var(--muted-foreground)',
              cursor:'pointer', fontFamily:'inherit'}}>Mark caught up</button>
          </div>
        </div>

        {/* timeline */}
        <div style={{padding:'12px 18px 4px', position:'relative'}}>
          {/* spine */}
          <div style={{position:'absolute', left:30, top:18, bottom:18, width:1,
            background:'var(--border)'}}/>

          {/* event: friend request — primary */}
          <div style={{position:'relative', display:'flex', gap:14, paddingBottom:14}}>
            <div style={{
              width:24, height:24, borderRadius:'50%', flexShrink:0, marginTop:2,
              background:'var(--popover)', border:`2px solid var(--chat)`,
              display:'flex', alignItems:'center', justifyContent:'center',
              color:'var(--chat)', fontSize:11, position:'relative', zIndex:1,
            }}>{Icons.users}</div>
            <div style={{flex:1, minWidth:0}}>
              <div style={{display:'flex', alignItems:'baseline', gap:6}}>
                <Serif style={{fontSize:13.5, fontWeight:500}}>Pierre</Serif>
                <span style={{fontSize:12, color:'var(--muted-foreground)'}}>wants to be friends.</span>
                <Mono style={{fontSize:10, color:'var(--muted-foreground)', marginLeft:'auto'}}>2m</Mono>
              </div>
              <Mono style={{fontSize:10.5, color:'var(--muted-foreground)', display:'block', marginTop:1}}>
                pierre@mft.pinai · no mutuals
              </Mono>
              <div style={{display:'flex', gap:6, marginTop:8}}>
                <button style={{padding:'5px 11px', fontSize:11.5, fontWeight:600,
                  borderRadius:5, border:'none', background:'var(--chat)',
                  color:'var(--primary-foreground)', cursor:'pointer', fontFamily:'inherit'}}>
                  Accept
                </button>
                <button style={{padding:'5px 9px', fontSize:11.5, borderRadius:5,
                  border:'1px solid var(--border-strong)', background:'transparent',
                  color:'var(--muted-foreground)', cursor:'pointer', fontFamily:'inherit'}}>
                  Decline
                </button>
                <button style={{padding:'5px 9px', fontSize:11.5, borderRadius:5,
                  border:'none', background:'transparent',
                  color:'var(--muted-foreground)', cursor:'pointer', fontFamily:'inherit',
                  marginLeft:'auto'}}>View profile</button>
              </div>
            </div>
          </div>

          {/* event: voice — amber accent */}
          <div style={{position:'relative', display:'flex', gap:14, paddingBottom:14}}>
            <div style={{
              width:24, height:24, borderRadius:'50%', flexShrink:0, marginTop:2,
              background:'var(--popover)', border:`2px solid var(--voice)`,
              display:'flex', alignItems:'center', justifyContent:'center',
              color:'var(--voice)', fontSize:11, position:'relative', zIndex:1,
            }}>{Icons.headset}</div>
            <div style={{flex:1, minWidth:0}}>
              <div style={{display:'flex', alignItems:'baseline', gap:6}}>
                <Serif style={{fontSize:13.5, fontWeight:500}}>Kai</Serif>
                <span style={{fontSize:12, color:'var(--muted-foreground)'}}>added you to</span>
                <Mono style={{fontSize:11.5, color:'var(--voice)'}}>· Design Lab</Mono>
                <Mono style={{fontSize:10, color:'var(--muted-foreground)', marginLeft:'auto'}}>just now</Mono>
              </div>
              {/* mini live indicator */}
              <div style={{display:'flex', alignItems:'center', gap:5, marginTop:5,
                fontSize:11, color:'var(--voice)'}}>
                <span style={{display:'inline-flex', gap:1.5, alignItems:'flex-end', height:10}}>
                  {[0.4, 0.7, 0.5, 0.9, 0.6].map((h,i) => (
                    <span key={i} style={{
                      width:2, height:`${h*100}%`, background:'var(--voice)', borderRadius:1,
                      animation:`pn-bounce 1.${3+i}s ease-in-out infinite`,
                      animationDelay:`${i * 0.08}s`,
                    }}/>
                  ))}
                </span>
                <span>3 listeners · live</span>
              </div>
              <button style={{marginTop:8, padding:'5px 11px', fontSize:11.5, fontWeight:600,
                borderRadius:5, border:'none', background:'var(--voice)',
                color:'var(--voice-foreground)', cursor:'pointer', fontFamily:'inherit'}}>
                Open room
              </button>
            </div>
          </div>

          {/* event: mention with inline reply */}
          <div style={{position:'relative', display:'flex', gap:14, paddingBottom:14}}>
            <NAvatar name="Maia" color="oklch(0.72 0.07 330)" size={24}/>
            <div style={{flex:1, minWidth:0}}>
              <div style={{display:'flex', alignItems:'baseline', gap:6}}>
                <Serif style={{fontSize:13.5, fontWeight:500}}>Maia</Serif>
                <span style={{fontSize:12, color:'var(--muted-foreground)'}}>mentioned you in</span>
                <Mono style={{fontSize:11, color:'var(--foreground)'}}>#design-lab</Mono>
                <Mono style={{fontSize:10, color:'var(--muted-foreground)', marginLeft:'auto'}}>14m</Mono>
              </div>
              <div style={{marginTop:5, padding:'8px 10px', borderRadius:'var(--radius-sm)',
                background:'var(--muted)', borderLeft:'2px solid var(--chat)',
                fontSize:12, color:'var(--muted-foreground)', lineHeight:1.5,
                fontFamily:'var(--serif, Fraunces), serif', fontStyle:'italic'}}>
                “<Mono style={{color:'var(--chat)', fontStyle:'normal'}}>@alice</Mono>{' '}
                can you take a look at the lantern proto?”
              </div>
              {/* inline reply field */}
              <div style={{marginTop:7, display:'flex', alignItems:'center', gap:6,
                padding:'4px 4px 4px 10px', height:32,
                border:'1px solid var(--border)', borderRadius:'var(--radius-sm)',
                background:'var(--input)'}}>
                <input placeholder="Reply…" style={{
                  flex:1, background:'transparent', border:'none', outline:'none',
                  color:'var(--foreground)', fontSize:12, fontFamily:'inherit',
                }}/>
                <button style={{width:24, height:24, borderRadius:4, border:'none',
                  background:'var(--chat)', color:'var(--primary-foreground)',
                  cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center'}}>
                  {Icons.send}
                </button>
              </div>
            </div>
          </div>

          {/* event: consolidation */}
          <div style={{position:'relative', display:'flex', gap:14, paddingBottom:14}}>
            <div style={{
              width:24, height:24, borderRadius:'50%', flexShrink:0, marginTop:2,
              background:'var(--muted)', border:'1px solid var(--border)',
              display:'flex', alignItems:'center', justifyContent:'center',
              color:'var(--muted-foreground)', fontSize:11, position:'relative', zIndex:1,
            }}>{Icons.smile}</div>
            <div style={{flex:1, minWidth:0}}>
              <div style={{display:'flex', alignItems:'baseline', gap:6}}>
                <span style={{fontSize:12.5, color:'var(--foreground)'}}>
                  <Serif style={{fontWeight:500}}>Bob</Serif>,{' '}
                  <Serif style={{fontWeight:500}}>Jules</Serif> and{' '}
                  <Mono style={{fontSize:11, color:'var(--muted-foreground)'}}>+2</Mono>{' '}
                  reacted to your message.
                </span>
                <Mono style={{fontSize:10, color:'var(--muted-foreground)', marginLeft:'auto'}}>2h</Mono>
              </div>
              <div style={{display:'flex', gap:5, marginTop:5}}>
                <span style={{fontSize:14}}>🌿</span>
                <span style={{fontSize:14}}>✨</span>
                <span style={{fontSize:14}}>🌙</span>
              </div>
            </div>
          </div>

          {/* event: system, muted */}
          <div style={{position:'relative', display:'flex', gap:14, paddingBottom:14, opacity:0.7}}>
            <div style={{
              width:24, height:24, borderRadius:'50%', flexShrink:0, marginTop:2,
              background:'var(--muted)', border:'1px solid var(--border)',
              display:'flex', alignItems:'center', justifyContent:'center',
              color:'var(--muted-foreground)', fontSize:11, position:'relative', zIndex:1,
            }}>{Icons.sparkle}</div>
            <div style={{flex:1, minWidth:0}}>
              <div style={{display:'flex', alignItems:'baseline', gap:6}}>
                <span style={{fontSize:12, color:'var(--muted-foreground)'}}>
                  <Mono style={{color:'var(--foreground)'}}>kauai.pinai</Mono> updated to v0.9 — federated link previews.
                </span>
                <Mono style={{fontSize:10, color:'var(--muted-foreground)', marginLeft:'auto'}}>Mon</Mono>
              </div>
            </div>
          </div>
        </div>

        {/* footer */}
        <div style={{padding:'10px 14px', borderTop:'1px solid var(--border)',
          background:'color-mix(in oklab, var(--card) 60%, transparent)',
          display:'flex', alignItems:'center', gap:10}}>
          <Mono style={{fontSize:10, color:'var(--muted-foreground)', flex:1, letterSpacing:'0.08em',
            textTransform:'uppercase'}}>5 events · today</Mono>
          <button style={{padding:'5px 10px', fontSize:11, borderRadius:5,
            border:'1px solid var(--border-strong)', background:'transparent',
            color:'var(--foreground)', cursor:'pointer', fontFamily:'inherit'}}>
            Open inbox
          </button>
        </div>
      </div>
    </NotifBackdrop>
  );
}

Object.assign(window, {
  NotifPopoverEditorial,
  NotifPopoverCategorized,
  NotifPopoverActivity,
});
