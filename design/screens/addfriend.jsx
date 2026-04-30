// Add Friend — Popover variations (anchored to the "+ Add Friend" button)
// Keeps the Friends list visible behind. Three directions.

// Shared: the Friends-page background context that stays visible.
function FriendsBackdrop({ children }) {
  return (
    <Artboard w={1200} h={760} style={{display:'flex', flexDirection:'column'}}>
      {/* echo of the page chrome */}
      <div style={{height:60, borderBottom:'1px solid var(--border)', padding:'0 24px',
        display:'flex', alignItems:'center', gap:16}}>
        <span style={{color:'var(--muted-foreground)'}}>{Icons.users}</span>
        <Serif style={{fontSize:20, fontWeight:450}}>Friends</Serif>
        <div style={{width:1, height:18, background:'var(--border)'}}/>
        <span style={{fontSize:12.5, color:'var(--muted-foreground)', fontStyle:'italic',
          fontFamily:'var(--serif, Fraunces), serif'}}>Manage the people you keep close.</span>
      </div>

      <div style={{padding:'22px 32px 14px', display:'flex', alignItems:'center', justifyContent:'space-between',
        position:'relative', zIndex:1}}>
        <div style={{display:'flex', gap:4, padding:3, background:'var(--muted)', borderRadius:'var(--radius-sm)'}}>
          {['All','Online','Pending','Blocked'].map((t,i) => (
            <span key={t} style={{
              padding:'7px 14px', borderRadius:'calc(var(--radius-sm) - 1px)', fontSize:12,
              background: i===0 ? 'var(--card)' : 'transparent',
              color: i===0 ? 'var(--foreground)' : 'var(--muted-foreground)',
              fontWeight: i===0 ? 500 : 400,
              boxShadow: i===0 ? '0 1px 2px rgba(0,0,0,0.25)' : 'none',
            }}>
              {t}{t==='Pending' && <span style={{marginLeft:6, color:'var(--voice)'}}>2</span>}
            </span>
          ))}
        </div>

        {/* anchor button (highlighted, popover open state) */}
        <div style={{position:'relative'}}>
          <button data-anchor style={{
            padding:'8px 16px', borderRadius:'var(--radius-sm)', border:'none',
            background:'var(--chat)', color:'var(--primary-foreground)', fontWeight:600, fontSize:12.5,
            fontFamily:'inherit', cursor:'pointer',
            boxShadow:'0 0 0 3px color-mix(in oklab, var(--chat) 22%, transparent)',
          }}>+ Add Friend</button>
          {children}
        </div>
      </div>

      {/* friends rows underneath, dimmed */}
      <div style={{flex:1, padding:'4px 16px', opacity:0.55, filter:'saturate(0.7)'}}>
        {[
          ['Bob','bob@kauai.pinai','Working on the lantern prototype','online','oklch(0.75 0.06 70)'],
          ['Maia','maia@studio.pinai','In voice · Design Lab','voice','oklch(0.72 0.07 330)'],
          ['Kai','kai@lab.pinai','—','online','oklch(0.74 0.06 200)'],
          ['Jules','jules@studio.pinai','Idle — listening','idle','oklch(0.70 0.05 260)'],
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
    </Artboard>
  );
}

// Caret stem common to all popovers
const Caret = ({ pos = 'right-top' }) => (
  <div style={{
    position:'absolute', top:-7, right:24, width:14, height:14,
    background:'var(--popover)', transform:'rotate(45deg)',
    borderTop:'1px solid var(--border-strong)', borderLeft:'1px solid var(--border-strong)',
  }}/>
);

// ── A · Compact popover — single field + send ──────────────────────────────
function AddFriendPopoverCompact() {
  return (
    <FriendsBackdrop>
      <div style={{
        position:'absolute', top:'calc(100% + 12px)', right:0, width:380,
        background:'var(--popover)', border:'1px solid var(--border-strong)',
        borderRadius:'var(--radius-lg)',
        boxShadow:'0 24px 60px -16px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.02)',
        padding:'16px 16px 14px', zIndex:10,
      }}>
        <Caret/>
        <div style={{display:'flex', alignItems:'baseline', justifyContent:'space-between', marginBottom:10}}>
          <Serif style={{fontSize:16, fontWeight:500}}>Add a friend</Serif>
          <Mono style={{fontSize:10, color:'var(--muted-foreground)', letterSpacing:'0.08em',
            textTransform:'uppercase'}}>by address</Mono>
        </div>

        <div style={{
          display:'flex', alignItems:'center', gap:10, padding:'0 12px', height:40,
          background:'var(--input)', border:'1px solid var(--chat)', borderRadius:'var(--radius)',
          boxShadow:'0 0 0 3px color-mix(in oklab, var(--chat) 16%, transparent)',
        }}>
          <span style={{color:'var(--chat)'}}>{Icons.at}</span>
          <input defaultValue="alice@idp.example.com"
            style={{flex:1, background:'transparent', border:'none', outline:'none',
              color:'var(--foreground)', fontSize:13, fontFamily:'JetBrains Mono, monospace'}}/>
          <span style={{color:'var(--chat)'}}>{Icons.check}</span>
        </div>
        <Mono style={{fontSize:10.5, color:'var(--success)', display:'block', marginTop:6}}>
          ✓ resolved · idp.example.com
        </Mono>

        <button style={{
          marginTop:12, width:'100%', padding:'10px 14px', borderRadius:'var(--radius)',
          background:'var(--chat)', color:'var(--primary-foreground)', border:'none',
          fontWeight:600, fontSize:13, cursor:'pointer', fontFamily:'inherit',
          display:'flex', alignItems:'center', justifyContent:'center', gap:8,
        }}>Send request {Icons.send}</button>

        <div style={{display:'flex', alignItems:'center', gap:10, margin:'14px 0 10px',
          color:'var(--muted-foreground)', fontSize:10.5}}>
          <div style={{flex:1, height:1, background:'var(--border)'}}/>
          <Mono style={{letterSpacing:'0.12em', textTransform:'uppercase'}}>or share yours</Mono>
          <div style={{flex:1, height:1, background:'var(--border)'}}/>
        </div>

        <div style={{
          padding:'8px 10px', borderRadius:'var(--radius-sm)',
          background:'color-mix(in oklab, var(--chat) 8%, var(--card))',
          border:'1px dashed color-mix(in oklab, var(--chat) 35%, var(--border))',
          display:'flex', alignItems:'center', gap:8,
        }}>
          <Mono style={{fontSize:11, color:'var(--foreground)', flex:1, fontWeight:500,
            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
            alice_z2M_4@localhost:8080
          </Mono>
          <button style={{padding:'4px 9px', fontSize:10.5, borderRadius:5,
            border:'1px solid var(--chat)', background:'transparent', color:'var(--chat)',
            cursor:'pointer', fontFamily:'inherit'}}>Copy</button>
        </div>
      </div>
    </FriendsBackdrop>
  );
}

// ── B · Tabbed popover — address / link / QR ───────────────────────────────
function AddFriendPopoverTabbed() {
  return (
    <FriendsBackdrop>
      <div style={{
        position:'absolute', top:'calc(100% + 12px)', right:0, width:420,
        background:'var(--popover)', border:'1px solid var(--border-strong)',
        borderRadius:'var(--radius-lg)',
        boxShadow:'0 24px 60px -16px rgba(0,0,0,0.55)',
        zIndex:10, overflow:'hidden',
      }}>
        <Caret/>
        <div style={{padding:'14px 16px 0'}}>
          <Serif style={{fontSize:17, fontWeight:500}}>Add a friend</Serif>
          <p style={{margin:'4px 0 12px', color:'var(--muted-foreground)', fontSize:12, fontStyle:'italic',
            fontFamily:'var(--serif, Fraunces), serif'}}>
            Federated · works across Pīna'i servers.
          </p>

          {/* segmented tabs */}
          <div style={{display:'flex', gap:2, padding:3, background:'var(--muted)',
            borderRadius:'var(--radius-sm)', marginBottom:14}}>
            {[['Address', true],['Invite link', false],['QR code', false]].map(([l,a],i) => (
              <span key={i} style={{
                flex:1, textAlign:'center', padding:'6px 8px', borderRadius:'calc(var(--radius-sm) - 1px)',
                fontSize:11.5,
                background: a ? 'var(--card)' : 'transparent',
                color: a ? 'var(--foreground)' : 'var(--muted-foreground)',
                fontWeight: a ? 500 : 400,
                boxShadow: a ? '0 1px 2px rgba(0,0,0,0.25)' : 'none',
              }}>{l}</span>
            ))}
          </div>
        </div>

        <div style={{padding:'0 16px 14px'}}>
          <div style={{
            display:'flex', alignItems:'center', gap:10, padding:'0 12px', height:42,
            background:'var(--input)', border:'1px solid var(--chat)', borderRadius:'var(--radius)',
            boxShadow:'0 0 0 3px color-mix(in oklab, var(--chat) 16%, transparent)',
          }}>
            <span style={{color:'var(--chat)'}}>{Icons.at}</span>
            <input defaultValue="alice@idp.example.com"
              style={{flex:1, background:'transparent', border:'none', outline:'none',
                color:'var(--foreground)', fontSize:13, fontFamily:'JetBrains Mono, monospace'}}/>
            <span style={{color:'var(--chat)'}}>{Icons.check}</span>
          </div>

          {/* live preview chip */}
          <div style={{
            marginTop:10, padding:'9px 12px', borderRadius:'var(--radius)',
            background:'color-mix(in oklab, var(--chat) 7%, var(--background))',
            border:'1px solid color-mix(in oklab, var(--chat) 25%, var(--border))',
            display:'flex', alignItems:'center', gap:10,
          }}>
            <Avatar name="A" color="oklch(0.74 0.06 200)" size={30}/>
            <div style={{flex:1, minWidth:0}}>
              <Serif style={{fontSize:13.5, fontWeight:500}}>alice</Serif>
              <Mono style={{fontSize:10.5, color:'var(--muted-foreground)', display:'block'}}>
                idp.example.com · 2 mutual
              </Mono>
            </div>
            <Mono style={{fontSize:9.5, padding:'2px 7px', borderRadius:10,
              background:'color-mix(in oklab, var(--success) 22%, transparent)',
              color:'var(--success)', letterSpacing:'0.08em', textTransform:'uppercase'}}>
              accepts
            </Mono>
          </div>

          <div style={{marginTop:12}}>
            <Mono style={{fontSize:10, letterSpacing:'0.12em', color:'var(--muted-foreground)',
              textTransform:'uppercase', display:'block', marginBottom:5}}>
              Optional note
            </Mono>
            <div style={{padding:'8px 10px', minHeight:50,
              background:'var(--input)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)',
              color:'var(--foreground)', fontSize:12.5, lineHeight:1.5}}>
              Hey — Maia mentioned the lantern prototype.
              <span style={{display:'inline-block', width:1.5, height:12, background:'var(--chat)',
                verticalAlign:'middle', marginLeft:1, animation:'pn-blink 1s steps(2) infinite'}}/>
            </div>
          </div>
        </div>

        {/* footer */}
        <div style={{padding:'10px 14px', borderTop:'1px solid var(--border)',
          background:'color-mix(in oklab, var(--card) 60%, transparent)',
          display:'flex', alignItems:'center', gap:10}}>
          <Mono style={{fontSize:10, color:'var(--muted-foreground)', flex:1, letterSpacing:'0.06em',
            textTransform:'uppercase'}}>↵ send · esc close</Mono>
          <button style={{padding:'7px 12px', fontSize:12, borderRadius:'var(--radius-sm)',
            border:'1px solid var(--border-strong)', background:'transparent', color:'var(--foreground)',
            cursor:'pointer', fontFamily:'inherit'}}>Cancel</button>
          <button style={{padding:'7px 14px', fontSize:12, fontWeight:600,
            borderRadius:'var(--radius-sm)', border:'none',
            background:'var(--chat)', color:'var(--primary-foreground)',
            cursor:'pointer', fontFamily:'inherit',
            display:'flex', alignItems:'center', gap:7}}>
            Send {Icons.send}
          </button>
        </div>
      </div>
    </FriendsBackdrop>
  );
}

// ── C · Searchable popover — typeahead with mutuals ────────────────────────
function AddFriendPopoverSearch() {
  return (
    <FriendsBackdrop>
      <div style={{
        position:'absolute', top:'calc(100% + 12px)', right:0, width:400,
        background:'var(--popover)', border:'1px solid var(--border-strong)',
        borderRadius:'var(--radius-lg)',
        boxShadow:'0 24px 60px -16px rgba(0,0,0,0.55)',
        zIndex:10, overflow:'hidden',
      }}>
        <Caret/>
        {/* search */}
        <div style={{padding:'12px 14px', borderBottom:'1px solid var(--border)',
          display:'flex', alignItems:'center', gap:10}}>
          <span style={{color:'var(--muted-foreground)'}}>{Icons.search}</span>
          <input defaultValue="ali"
            placeholder="Search by name or paste @user@server"
            style={{flex:1, background:'transparent', border:'none', outline:'none',
              color:'var(--foreground)', fontSize:13.5, fontFamily:'inherit'}}/>
          <Mono style={{fontSize:10, padding:'2px 6px', borderRadius:4,
            background:'var(--muted)', color:'var(--muted-foreground)'}}>esc</Mono>
        </div>

        {/* matches */}
        <div style={{padding:'8px 6px'}}>
          <Mono style={{fontSize:9.5, letterSpacing:'0.12em', color:'var(--muted-foreground)',
            textTransform:'uppercase', padding:'4px 10px'}}>Matches on your server</Mono>
          <PopRow highlight name="alice" handle="alice@idp.example.com" mutual={2} action="↵"/>
          <PopRow name="Alicia Koa" handle="alicia@kauai.pinai" mutual={5}/>
          <PopRow name="Alistair" handle="ali@studio.pinai" mutual={1}/>

          <Mono style={{fontSize:9.5, letterSpacing:'0.12em', color:'var(--muted-foreground)',
            textTransform:'uppercase', padding:'10px 10px 4px'}}>Federated lookup</Mono>
          <div style={{padding:'8px 10px', borderRadius:'var(--radius-sm)',
            display:'flex', alignItems:'center', gap:10}}>
            <span style={{width:30, height:30, borderRadius:'50%', background:'var(--muted)',
              display:'flex', alignItems:'center', justifyContent:'center',
              color:'var(--muted-foreground)'}}>{Icons.at}</span>
            <div style={{flex:1, minWidth:0}}>
              <div style={{fontSize:12.5, color:'var(--muted-foreground)'}}>
                Send to <Mono style={{color:'var(--chat)'}}>ali@…</Mono> on another server
              </div>
              <Mono style={{fontSize:10.5, color:'var(--muted-foreground)'}}>
                type the full address to resolve
              </Mono>
            </div>
            <Mono style={{fontSize:10, padding:'2px 6px', borderRadius:4,
              background:'var(--muted)', color:'var(--muted-foreground)'}}>⌘V</Mono>
          </div>
        </div>

        {/* your-handle footer */}
        <div style={{padding:'10px 14px', borderTop:'1px solid var(--border)',
          background:'color-mix(in oklab, var(--card) 60%, transparent)',
          display:'flex', alignItems:'center', gap:10}}>
          <Mono style={{fontSize:10, color:'var(--muted-foreground)', letterSpacing:'0.08em',
            textTransform:'uppercase'}}>You</Mono>
          <Mono style={{fontSize:11, color:'var(--foreground)', flex:1, fontWeight:500,
            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
            alice_z2M_4@localhost:8080
          </Mono>
          <button style={{padding:'4px 9px', fontSize:10.5, borderRadius:5,
            border:'1px solid var(--border-strong)', background:'transparent',
            color:'var(--muted-foreground)', cursor:'pointer', fontFamily:'inherit',
            display:'flex', alignItems:'center', gap:5}}>
            Copy
          </button>
        </div>
      </div>
    </FriendsBackdrop>
  );
}

function PopRow({ name, handle, mutual, highlight, action }) {
  return (
    <div style={{
      display:'flex', alignItems:'center', gap:10, padding:'7px 10px',
      borderRadius:'var(--radius-sm)',
      background: highlight ? 'color-mix(in oklab, var(--chat) 14%, transparent)' : 'transparent',
    }}>
      <Avatar name={name} color="oklch(0.74 0.06 200)" size={28}/>
      <div style={{flex:1, minWidth:0}}>
        <div style={{fontSize:12.5, color:'var(--foreground)', fontWeight: highlight ? 500 : 400,
          fontFamily:'var(--serif, Fraunces), serif'}}>{name}</div>
        <Mono style={{fontSize:10.5, color:'var(--muted-foreground)'}}>{handle}</Mono>
      </div>
      {mutual && <Mono style={{fontSize:10, color:'var(--muted-foreground)',
        padding:'1px 6px', border:'1px solid var(--border)', borderRadius:10}}>{mutual} mutual</Mono>}
      {action && <Mono style={{fontSize:10, color:'var(--chat)',
        padding:'2px 7px', borderRadius:5,
        background:'color-mix(in oklab, var(--chat) 18%, transparent)'}}>{action} send</Mono>}
    </div>
  );
}

Object.assign(window, { AddFriendPopoverCompact, AddFriendPopoverTabbed, AddFriendPopoverSearch });
