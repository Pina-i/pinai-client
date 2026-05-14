// Mobile app — Sign-in / Friends / Voice / Add Friend (A) /
//                Notifications (A) / User status (C) / Settings (C)
//
// Mobile UX moves applied:
// • iOS frame (390×844), dark
// • Shared bottom tab bar (Friends · Messages · Voice · You)
// • Popovers → bottom sheets when contextual, full pages otherwise
// • 44pt minimum tap targets, safe-area aware
// • Bolder liberties: full-bleed editorial heroes, segmented chips that scroll,
//   dock-only voice screen, drill-in stack for settings.

const M_TAB_H = 64;       // bottom tab bar
const M_SAFE_BOTTOM = 30; // home indicator safe area

// ── Shared bottom tab bar ────────────────────────────────────────────────
function MTabBar({ active = 'friends' }) {
  const tabs = [
    { id:'friends',  label:'Friends',  icon: Icons.users },
    { id:'messages', label:'Messages', icon: Icons.message, badge: 4 },
    { id:'voice',    label:'Voice',    icon: Icons.headset, live: true },
    { id:'you',      label:'You',      avatar: true },
  ];
  return (
    <div style={{
      position:'absolute', left:0, right:0, bottom:0,
      paddingBottom: M_SAFE_BOTTOM, paddingTop:6,
      background:'color-mix(in oklab, var(--card) 85%, transparent)',
      backdropFilter:'blur(20px)',
      borderTop:'1px solid var(--border)',
      display:'flex', justifyContent:'space-around', alignItems:'center',
      zIndex:30,
    }}>
      {tabs.map(t => {
        const isActive = t.id === active;
        const tone = t.id === 'voice' && t.live ? 'var(--voice)' : 'var(--chat)';
        return (
          <button key={t.id} style={{
            flex:1, height:50, border:'none', background:'transparent',
            display:'flex', flexDirection:'column', alignItems:'center', gap:3,
            cursor:'pointer', position:'relative',
            color: isActive ? tone : 'var(--muted-foreground)',
          }}>
            <span style={{position:'relative', display:'flex'}}>
              {t.avatar ? (
                <Avatar name="Alice" color="var(--chat)" size={22}/>
              ) : t.icon}
              {t.badge && (
                <span style={{
                  position:'absolute', top:-4, right:-7,
                  minWidth:14, height:14, padding:'0 4px',
                  borderRadius:7, background:'var(--chat)',
                  color:'var(--primary-foreground)',
                  fontSize:9, fontWeight:600, letterSpacing:'0.02em',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  border:'2px solid var(--card)',
                }}>{t.badge}</span>
              )}
              {t.live && (
                <span style={{
                  position:'absolute', top:-2, right:-3,
                  width:7, height:7, borderRadius:'50%',
                  background:'var(--voice)',
                  border:'2px solid var(--card)',
                  animation:'pn-pulse 1.4s ease-in-out infinite',
                }}/>
              )}
            </span>
            <span style={{
              fontSize:9.5, fontWeight: isActive ? 600 : 500,
              fontFamily:'JetBrains Mono, monospace',
              letterSpacing:'0.04em', textTransform:'uppercase',
            }}>{t.label}</span>
            {isActive && (
              <span style={{
                position:'absolute', top:-6, width:24, height:2, borderRadius:2,
                background: tone,
              }}/>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Status-bar gap helper (sits below the iOS device's status bar) ───────
function MFrame({ children, dark = true, tone, status = true }) {
  return (
    <IOSDevice width={390} height={844} dark={dark}>
      <div style={{
        height:'100%',
        background: tone || 'var(--background)',
        color:'var(--foreground)',
        fontFamily:'Geist, ui-sans-serif, system-ui, sans-serif',
        position:'relative',
        paddingTop: status ? 54 : 0,
        display:'flex', flexDirection:'column',
        overflow:'hidden',
      }}>
        {children}
      </div>
    </IOSDevice>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 1 · SIGN-IN — editorial hero + form, bottom-sheet feel for the form
// ─────────────────────────────────────────────────────────────────────────
function MobileSignIn() {
  return (
    <MFrame status={false}>
      {/* dim ambient backdrop, photographic */}
      <div style={{
        position:'absolute', inset:0,
        background:`
          radial-gradient(440px 320px at 80% 12%, color-mix(in oklab, var(--chat) 14%, transparent), transparent 65%),
          radial-gradient(360px 320px at 5% 92%, color-mix(in oklab, var(--voice) 10%, transparent), transparent 60%),
          var(--background)
        `,
      }}/>
      {/* grain */}
      <div style={{
        position:'absolute', inset:0, opacity:0.05, mixBlendMode:'overlay', pointerEvents:'none',
        backgroundImage:`url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")`,
      }}/>

      {/* status bar gap */}
      <div style={{height:54, position:'relative', zIndex:1}}/>

      {/* top mark + version */}
      <div style={{
        padding:'8px 22px', display:'flex', alignItems:'center',
        justifyContent:'space-between', position:'relative', zIndex:1,
      }}>
        <div style={{display:'flex', alignItems:'center', gap:9}}>
          <Mountain size={22}/>
          <Serif style={{fontSize:16, fontWeight:500}}>Pīna'i</Serif>
        </div>
        <Mono style={{fontSize:9, letterSpacing:'0.12em', color:'var(--muted-foreground)',
          textTransform:'uppercase'}}>v2.0.4</Mono>
      </div>

      {/* hero */}
      <div style={{padding:'40px 28px 28px', position:'relative', zIndex:1}}>
        <Serif style={{
          fontSize:58, lineHeight:0.95, fontWeight:350, letterSpacing:'-0.025em',
          margin:0, color:'var(--foreground)',
          fontVariationSettings:"'opsz' 144, 'SOFT' 30",
        }}>
          Quiet<br/>
          <em style={{fontStyle:'italic', color:'var(--chat)', fontWeight:300}}>rooms</em>,<br/>
          loud<br/>
          <em style={{fontStyle:'italic', color:'var(--voice)', fontWeight:300}}>voices</em>.
        </Serif>
        <p style={{margin:'18px 0 0', color:'var(--muted-foreground)', lineHeight:1.5,
          fontSize:13, maxWidth:280}}>
          A community space you host yourself.
          Federated by design, owned by the people who gather in it.
        </p>
      </div>

      {/* form card — feels like a bottom sheet */}
      <div style={{
        marginTop:'auto', position:'relative', zIndex:1,
        background:'var(--card)',
        borderTop:'1px solid var(--border)',
        borderTopLeftRadius:24, borderTopRightRadius:24,
        padding:'18px 22px',
        paddingBottom: M_SAFE_BOTTOM + 18,
        boxShadow:'0 -10px 30px oklch(0.05 0.005 60 / 0.4)',
      }}>
        {/* segmented */}
        <div style={{display:'flex', gap:2, padding:3, background:'var(--muted)',
          borderRadius:'var(--radius-sm)', marginBottom:14}}>
          {[['Sign in', true],['Register', false]].map(([l, a]) => (
            <span key={l} style={{
              flex:1, textAlign:'center', padding:'9px 10px',
              borderRadius:'calc(var(--radius-sm) - 1px)', fontSize:12.5,
              background: a ? 'var(--card)' : 'transparent',
              color: a ? 'var(--foreground)' : 'var(--muted-foreground)',
              fontWeight: a ? 600 : 400,
              boxShadow: a ? '0 1px 2px rgba(0,0,0,0.25)' : 'none',
            }}>{l}</span>
          ))}
        </div>

        <MField label="Email" icon={Icons.mail} value="ada@lovelace.net"/>
        <MField label="Password" icon={Icons.lock} value="••••••••••••"/>

        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center',
          margin:'8px 0 14px'}}>
          <label style={{display:'flex', alignItems:'center', gap:8, fontSize:11.5,
            color:'var(--muted-foreground)'}}>
            <span style={{width:14, height:14, borderRadius:3,
              border:'1px solid var(--border-strong)', display:'inline-block'}}/>
            Keep me signed in
          </label>
          <a style={{fontSize:11.5, color:'var(--chat)', textDecoration:'none'}}>Forgot?</a>
        </div>

        <button style={{
          width:'100%', height:48, borderRadius:'var(--radius)',
          background:'var(--chat)', color:'var(--primary-foreground)',
          border:'none', cursor:'pointer', fontWeight:600, fontSize:14,
          fontFamily:'inherit', letterSpacing:'0.005em',
          display:'flex', alignItems:'center', justifyContent:'center', gap:8,
        }}>
          Sign in →
        </button>

        <div style={{margin:'14px 0', display:'flex', alignItems:'center', gap:10,
          color:'var(--muted-foreground)', fontSize:10}}>
          <div style={{flex:1, height:1, background:'var(--border)'}}/>
          <Mono style={{letterSpacing:'0.12em', textTransform:'uppercase'}}>or</Mono>
          <div style={{flex:1, height:1, background:'var(--border)'}}/>
        </div>

        <button style={{
          width:'100%', height:46, borderRadius:'var(--radius)',
          background:'transparent', color:'var(--foreground)',
          border:'1px solid var(--border-strong)', cursor:'pointer', fontSize:13,
          fontFamily:'inherit',
          display:'flex', alignItems:'center', justifyContent:'center', gap:10,
        }}>
          <span style={{width:6, height:6, borderRadius:'50%', background:'var(--voice)'}}/>
          Continue with Identity Provider
        </button>
      </div>
    </MFrame>
  );
}

function MField({ label, icon, value }) {
  return (
    <div style={{marginBottom:11}}>
      <Mono style={{fontSize:9.5, letterSpacing:'0.12em', color:'var(--muted-foreground)',
        textTransform:'uppercase', display:'block', marginBottom:6}}>{label}</Mono>
      <div style={{
        display:'flex', alignItems:'center', gap:10, padding:'0 14px', height:46,
        background:'var(--input)', borderRadius:'var(--radius)', border:'1px solid var(--border)',
      }}>
        <span style={{color:'var(--muted-foreground)', display:'flex'}}>{icon}</span>
        <span style={{flex:1, color:'var(--foreground)', fontSize:14}}>{value}</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 2 · FRIENDS — header, search, segmented filter, friend rows, FAB+, tabs
// ─────────────────────────────────────────────────────────────────────────
function MobileFriends() {
  return (
    <MFrame>
      {/* header */}
      <div style={{
        padding:'4px 14px 12px', display:'flex', alignItems:'flex-end', gap:10,
      }}>
        <div style={{flex:1, minWidth:0}}>
          <Mono style={{fontSize:9.5, letterSpacing:'0.14em', color:'var(--muted-foreground)',
            textTransform:'uppercase', display:'block'}}>— people you keep close</Mono>
          <Serif style={{fontSize:32, fontWeight:400, letterSpacing:'-0.02em',
            lineHeight:1.05, marginTop:2}}>Friends</Serif>
        </div>
        <button style={{
          width:44, height:44, flexShrink:0, borderRadius:'50%',
          border:'none', background:'var(--chat)',
          color:'var(--primary-foreground)', cursor:'pointer',
          display:'flex', alignItems:'center', justifyContent:'center',
          boxShadow:'0 6px 16px -6px color-mix(in oklab, var(--chat) 60%, transparent)',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M12 5v14M5 12h14"/>
          </svg>
        </button>
        <button style={{
          width:44, height:44, flexShrink:0, borderRadius:'var(--radius-sm)',
          border:'1px solid var(--border-strong)', background:'var(--card)',
          color:'var(--foreground)', cursor:'pointer', position:'relative',
          display:'flex', alignItems:'center', justifyContent:'center',
        }}>
          {Icons.bell}
          <span style={{position:'absolute', top:8, right:8, width:7, height:7,
            borderRadius:'50%', background:'var(--voice)',
            border:'2px solid var(--card)'}}/>
        </button>
      </div>

      {/* search */}
      <div style={{padding:'0 14px 10px'}}>
        <div style={{
          display:'flex', alignItems:'center', gap:10, padding:'0 14px', height:42,
          background:'var(--muted)', borderRadius:12, color:'var(--muted-foreground)',
          fontSize:14,
        }}>
          {Icons.search}
          <span>Find a friend or start a chat</span>
        </div>
      </div>

      {/* filter chips, scrollable */}
      <div style={{
        display:'flex', gap:6, padding:'0 14px 10px',
        overflowX:'auto',
      }}>
        {[
          ['All', true, null],
          ['Online', false, 3],
          ['Pending', false, 2],
          ['Blocked', false, null],
        ].map(([l, a, n]) => (
          <span key={l} style={{
            display:'inline-flex', alignItems:'center', gap:7, flexShrink:0,
            padding:'7px 14px', borderRadius:20, fontSize:12.5,
            background: a ? 'var(--card)' : 'transparent',
            color: a ? 'var(--foreground)' : 'var(--muted-foreground)',
            border: a ? '1px solid var(--border-strong)' : '1px solid var(--border)',
            fontWeight: a ? 500 : 400,
          }}>
            {l}
            {n !== null && (
              <Mono style={{
                fontSize:9.5, padding:'1px 6px', borderRadius:8,
                background: l === 'Pending'
                  ? 'color-mix(in oklab, var(--voice) 22%, transparent)'
                  : 'var(--muted)',
                color: l === 'Pending' ? 'var(--voice)' : 'var(--muted-foreground)',
              }}>{n}</Mono>
            )}
          </span>
        ))}
      </div>

      {/* section heading */}
      <div style={{padding:'4px 18px 6px', display:'flex',
        alignItems:'baseline', justifyContent:'space-between'}}>
        <Mono style={{fontSize:9.5, letterSpacing:'0.14em',
          color:'var(--muted-foreground)', textTransform:'uppercase'}}>
          Online — 3
        </Mono>
        <Mono style={{fontSize:9.5, letterSpacing:'0.04em',
          color:'var(--muted-foreground)'}}>showing all</Mono>
      </div>

      {/* friend list */}
      <div style={{
        flex:1, overflow:'auto', padding:'0 8px',
        paddingBottom: M_TAB_H + M_SAFE_BOTTOM + 12,
      }}>
        <MFriendRow name="Bob" handle="bob@kauai.pinai" status="Working on the lantern prototype"
          color="oklch(0.75 0.06 70)" dot="online"/>
        <MFriendRow name="Maia" handle="maia@studio.pinai" status="In voice · Design Lab"
          color="oklch(0.72 0.07 330)" dot="voice" inVoice/>
        <MFriendRow name="Kai" handle="kai@lab.pinai" status="—"
          color="oklch(0.74 0.06 200)" dot="online"/>
        <MFriendRow name="Jules" handle="jules@studio.pinai" status="Idle — listening"
          color="oklch(0.70 0.05 260)" dot="idle"/>
        <MFriendRow name="Tane" handle="tane@lab.pinai" status="Offline · last seen yesterday"
          color="oklch(0.72 0.07 25)" offline/>
      </div>

      <MTabBar active="friends"/>
    </MFrame>
  );
}

function MFriendRow({ name, handle, status, color, dot, inVoice, offline }) {
  return (
    <div style={{
      display:'flex', alignItems:'center', gap:12, padding:'10px 10px',
      borderRadius:12,
      opacity: offline ? 0.55 : 1,
    }}>
      <Avatar name={name} color={color} size={42} dot={dot}/>
      <div style={{flex:1, minWidth:0}}>
        <Serif style={{fontSize:15, fontWeight:500, lineHeight:1.2}}>{name}</Serif>
        <div style={{
          fontSize:11.5, color: inVoice ? 'var(--voice)' : 'var(--muted-foreground)',
          marginTop:2, display:'flex', alignItems:'center', gap:5,
          whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
        }}>
          {inVoice && <span style={{color:'var(--voice)', display:'flex'}}>{Icons.waveform}</span>}
          <span style={{whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>
            {status}
          </span>
        </div>
      </div>
      <button style={{
        width:36, height:36, borderRadius:'50%', border:'1px solid var(--border)',
        background:'var(--card)', color:'var(--muted-foreground)',
        cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
      }}>{Icons.message}</button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 3 · VOICE ROOM — full-bleed stage, 2x2 tiles, raised hands, dock
// ─────────────────────────────────────────────────────────────────────────
function MobileVoice() {
  return (
    <MFrame tone={`
      radial-gradient(360px 280px at 80% 0%, color-mix(in oklab, var(--voice) 18%, transparent), transparent 60%),
      radial-gradient(300px 240px at 0% 100%, color-mix(in oklab, var(--voice) 10%, transparent), transparent 60%),
      var(--background)
    `}>
      {/* stage header */}
      <div style={{
        padding:'4px 8px 12px', display:'flex', alignItems:'center', gap:10,
        borderBottom:'1px solid var(--border)',
      }}>
        <button style={{
          width:40, height:40, borderRadius:'50%', border:'none',
          background:'var(--card)', color:'var(--foreground)',
          cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </button>
        <div style={{flex:1, minWidth:0}}>
          <div style={{display:'flex', alignItems:'center', gap:6}}>
            <span style={{color:'var(--voice)', display:'flex'}}>{Icons.headset}</span>
            <Serif style={{fontSize:15, fontWeight:500, lineHeight:1.1}}>Lantern — Room 3</Serif>
          </div>
          <div style={{display:'flex', alignItems:'center', gap:8, marginTop:3}}>
            <span style={{
              fontSize:9.5, padding:'1.5px 7px', borderRadius:20,
              background:'color-mix(in oklab, var(--voice) 22%, transparent)',
              color:'var(--voice)', fontFamily:'JetBrains Mono, monospace',
              letterSpacing:'0.08em',
            }}>LIVE 00:42</span>
            <Mono style={{fontSize:10, color:'var(--muted-foreground)'}}>
              4 of 8 · 48kHz
            </Mono>
          </div>
        </div>
        <button style={{
          width:40, height:40, borderRadius:'var(--radius-sm)',
          border:'1px solid var(--border)', background:'var(--card)',
          color:'var(--muted-foreground)', cursor:'pointer',
          display:'flex', alignItems:'center', justifyContent:'center',
        }}>{Icons.more}</button>
      </div>

      {/* now-speaking strip */}
      <div style={{padding:'12px 14px 10px',
        display:'flex', alignItems:'center', gap:10}}>
        <Mono style={{fontSize:9, letterSpacing:'0.14em',
          color:'var(--muted-foreground)', textTransform:'uppercase'}}>
          Now —
        </Mono>
        <Serif style={{fontSize:15, fontWeight:400, fontStyle:'italic'}}>Maia</Serif>
        <Waveform/>
      </div>

      {/* 2x2 tile grid */}
      <div style={{
        flex:1, padding:'4px 14px 10px',
        display:'grid', gridTemplateColumns:'1fr 1fr', gap:10,
        minHeight:0,
      }}>
        <MTile name="Alice" color="var(--chat)" you role="Host"/>
        <MTile name="Maia" color="oklch(0.72 0.07 330)" speaking role="Speaker"/>
        <MTile name="Jules" color="oklch(0.70 0.05 260)" muted role="Listener"/>
        <MTile name="Tane" color="oklch(0.72 0.07 25)" video role="Speaker"/>
      </div>

      {/* hands raised rail */}
      <div style={{
        margin:'0 14px 10px', padding:'8px 12px',
        border:'1px solid var(--border)', borderRadius:12,
        background:'color-mix(in oklab, var(--card) 80%, transparent)',
        display:'flex', alignItems:'center', gap:10,
      }}>
        <Mono style={{fontSize:9, letterSpacing:'0.14em',
          color:'var(--muted-foreground)', textTransform:'uppercase'}}>Hands —</Mono>
        <div style={{display:'flex'}}>
          {[['K','oklch(0.74 0.06 200)'],['R','oklch(0.72 0.07 110)'],['N','oklch(0.72 0.07 25)']].map(([n,c],i) => (
            <div key={i} style={{marginLeft: i?-7:0}}>
              <Avatar name={n} color={c} size={22}/>
            </div>
          ))}
        </div>
        <span style={{flex:1, fontSize:11.5, color:'var(--muted-foreground)',
          fontStyle:'italic', fontFamily:'var(--serif, Fraunces), serif',
          whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>
          Kai, Ren, Nia
        </span>
        <button style={{
          padding:'4px 10px', fontSize:11, borderRadius:14,
          border:'1px solid var(--voice)', color:'var(--voice)',
          background:'transparent', cursor:'pointer',
        }}>Invite →</button>
      </div>

      {/* dock — full-bleed at bottom, replaces tab bar */}
      <div style={{
        margin:'0 12px',
        padding:'10px 12px',
        marginBottom: M_SAFE_BOTTOM + 6,
        background:'var(--card)', border:'1px solid var(--border-strong)',
        borderRadius:24,
        boxShadow:'0 16px 36px -12px rgba(0,0,0,0.6)',
        display:'flex', flexDirection:'column', gap:10,
      }}>
        {/* level meter */}
        <div style={{display:'flex', alignItems:'center', gap:10}}>
          <Mono style={{fontSize:9.5, color:'var(--muted-foreground)',
            letterSpacing:'0.08em'}}>IN</Mono>
          <div style={{flex:1, height:5, borderRadius:3,
            background:'var(--muted)', position:'relative', overflow:'hidden'}}>
            <div style={{position:'absolute', left:0, top:0, bottom:0, width:'62%',
              background:'linear-gradient(90deg, var(--voice), color-mix(in oklab, var(--voice) 60%, var(--destructive)))'}}/>
          </div>
          <Mono style={{fontSize:9.5, color:'var(--muted-foreground)'}}>-12dB</Mono>
        </div>
        {/* buttons */}
        <div style={{display:'flex', gap:8, alignItems:'center'}}>
          <MDockBtn active tone="voice">{Icons.mic}</MDockBtn>
          <MDockBtn>{Icons.headset}</MDockBtn>
          <MDockBtn>{Icons.screen}</MDockBtn>
          <MDockBtn>{Icons.sparkle}</MDockBtn>
          <div style={{flex:1}}/>
          <button style={{
            padding:'10px 16px', height:44, borderRadius:22,
            border:'1px solid var(--destructive)',
            background:'color-mix(in oklab, var(--destructive) 22%, transparent)',
            color:'var(--destructive)', fontSize:12.5, fontWeight:600,
            cursor:'pointer', fontFamily:'inherit',
          }}>Leave</button>
        </div>
      </div>
    </MFrame>
  );
}

function MTile({ name, color, speaking, muted, video, you, role }) {
  return (
    <div style={{
      position:'relative', borderRadius:14, overflow:'hidden',
      background: video
        ? `repeating-linear-gradient(135deg, oklch(0.28 0.02 60) 0 10px, oklch(0.24 0.02 60) 10px 20px)`
        : 'var(--card)',
      border:'1px solid var(--border)',
      display:'flex', alignItems:'center', justifyContent:'center',
      minHeight:0, aspectRatio:'1/1',
    }}>
      {speaking && (
        <div style={{position:'absolute', inset:0, borderRadius:'inherit', pointerEvents:'none',
          boxShadow:'inset 0 0 0 2px var(--voice), 0 0 24px -4px var(--voice)',
          animation:'pn-glow 1.6s ease-in-out infinite'}}/>
      )}
      {!video && <Avatar name={name} color={color} size={56}/>}
      {/* nameplate */}
      <div style={{position:'absolute', left:8, bottom:8, right:8,
        display:'flex', alignItems:'center', gap:6}}>
        <Serif style={{
          fontSize:12, fontWeight:500,
          background:'color-mix(in oklab, var(--background) 70%, transparent)',
          padding:'2px 7px', borderRadius:5, backdropFilter:'blur(6px)',
          whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
        }}>
          {name}{you && <span style={{color:'var(--muted-foreground)', fontStyle:'italic'}}> · you</span>}
        </Serif>
      </div>
      {/* status chip */}
      <div style={{position:'absolute', top:7, right:7}}>
        {muted ? (
          <div style={{width:22, height:22, borderRadius:'50%',
            background:'color-mix(in oklab, var(--destructive) 30%, var(--card))',
            color:'var(--destructive)', display:'flex',
            alignItems:'center', justifyContent:'center'}}>
            <span style={{transform:'scale(0.6)', display:'flex'}}>{Icons.micOff}</span>
          </div>
        ) : speaking ? <Waveform small/> : null}
      </div>
      <Mono style={{
        position:'absolute', top:7, left:7,
        fontSize:8.5, padding:'1px 5px', borderRadius:4,
        background:'color-mix(in oklab, var(--background) 70%, transparent)',
        color:'var(--muted-foreground)',
        textTransform:'uppercase', letterSpacing:'0.08em',
        backdropFilter:'blur(6px)',
      }}>{role}</Mono>
    </div>
  );
}

function MDockBtn({ children, active, tone }) {
  const isVoice = tone === 'voice';
  return (
    <button style={{
      width:44, height:44, borderRadius:'50%',
      background: active
        ? (isVoice ? 'color-mix(in oklab, var(--voice) 22%, transparent)' : 'var(--muted)')
        : 'var(--muted)',
      color: active ? (isVoice ? 'var(--voice)' : 'var(--foreground)') : 'var(--muted-foreground)',
      border: active && isVoice ? '1px solid color-mix(in oklab, var(--voice) 50%, transparent)' : '1px solid transparent',
      cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
    }}>{children}</button>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 4 · ADD FRIEND (variant A) — full page modal, single field + send
// ─────────────────────────────────────────────────────────────────────────
function MobileAddFriend() {
  return (
    <MFrame>
      <MModalHeader title="Add a friend" subtitle="By address · works across servers"/>

      <div style={{flex:1, padding:'16px 20px', overflow:'auto'}}>
        {/* email input — focused state */}
        <Mono style={{fontSize:9.5, letterSpacing:'0.12em', color:'var(--muted-foreground)',
          textTransform:'uppercase', display:'block', marginBottom:7}}>
          Friend's address
        </Mono>
        <div style={{
          display:'flex', alignItems:'center', gap:10, padding:'0 14px', height:48,
          background:'var(--input)', border:'1px solid var(--chat)', borderRadius:'var(--radius)',
          boxShadow:'0 0 0 3px color-mix(in oklab, var(--chat) 16%, transparent)',
        }}>
          <span style={{color:'var(--chat)'}}>{Icons.at}</span>
          <span style={{flex:1, color:'var(--foreground)',
            fontFamily:'JetBrains Mono, monospace', fontSize:13.5}}>
            alice@idp.example.com
          </span>
          <span style={{color:'var(--success)', display:'flex'}}>{Icons.check}</span>
        </div>
        <Mono style={{fontSize:11, color:'var(--success)', display:'block', marginTop:7}}>
          ✓ resolved · idp.example.com
        </Mono>

        {/* live preview chip */}
        <div style={{
          marginTop:14, padding:'12px 12px', borderRadius:12,
          background:'color-mix(in oklab, var(--chat) 7%, var(--background))',
          border:'1px solid color-mix(in oklab, var(--chat) 25%, var(--border))',
          display:'flex', alignItems:'center', gap:10,
        }}>
          <Avatar name="A" color="oklch(0.74 0.06 200)" size={36}/>
          <div style={{flex:1, minWidth:0}}>
            <Serif style={{fontSize:14, fontWeight:500}}>alice</Serif>
            <Mono style={{fontSize:10.5, color:'var(--muted-foreground)', display:'block',
              marginTop:1}}>idp.example.com · 2 mutual</Mono>
          </div>
          <Mono style={{fontSize:9.5, padding:'2px 7px', borderRadius:8,
            background:'color-mix(in oklab, var(--success) 22%, transparent)',
            color:'var(--success)', letterSpacing:'0.08em',
            textTransform:'uppercase'}}>accepts</Mono>
        </div>

        <button style={{
          marginTop:14, width:'100%', height:48, borderRadius:'var(--radius)',
          background:'var(--chat)', color:'var(--primary-foreground)', border:'none',
          fontWeight:600, fontSize:14, cursor:'pointer', fontFamily:'inherit',
          display:'flex', alignItems:'center', justifyContent:'center', gap:9,
        }}>Send request {Icons.send}</button>

        {/* divider */}
        <div style={{display:'flex', alignItems:'center', gap:10,
          margin:'24px 0', color:'var(--muted-foreground)', fontSize:10}}>
          <div style={{flex:1, height:1, background:'var(--border)'}}/>
          <Mono style={{letterSpacing:'0.12em', textTransform:'uppercase'}}>or share yours</Mono>
          <div style={{flex:1, height:1, background:'var(--border)'}}/>
        </div>

        {/* your handle card */}
        <div style={{
          padding:'14px 14px', borderRadius:14,
          background:'color-mix(in oklab, var(--chat) 8%, var(--card))',
          border:'1px dashed color-mix(in oklab, var(--chat) 35%, var(--border))',
        }}>
          <Mono style={{fontSize:9.5, letterSpacing:'0.12em',
            color:'var(--muted-foreground)', textTransform:'uppercase',
            display:'block', marginBottom:6}}>Your handle</Mono>
          <Mono style={{fontSize:13, color:'var(--foreground)', fontWeight:500,
            wordBreak:'break-all', display:'block', marginBottom:10}}>
            alice_z2M_4@localhost:8080
          </Mono>
          <div style={{display:'flex', gap:8}}>
            <button style={{
              flex:1, height:40, borderRadius:8,
              border:'1px solid var(--chat)', background:'transparent',
              color:'var(--chat)', fontSize:12, fontWeight:600, cursor:'pointer',
              fontFamily:'inherit',
              display:'flex', alignItems:'center', justifyContent:'center', gap:7,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
              Copy
            </button>
            <button style={{
              flex:1, height:40, borderRadius:8,
              border:'1px solid var(--border-strong)', background:'transparent',
              color:'var(--foreground)', fontSize:12, fontWeight:500, cursor:'pointer',
              fontFamily:'inherit',
              display:'flex', alignItems:'center', justifyContent:'center', gap:7,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v13"/>
              </svg>
              Share
            </button>
          </div>
        </div>

        <Mono style={{fontSize:10.5, color:'var(--muted-foreground)',
          fontStyle:'italic', fontFamily:'var(--serif, Fraunces), serif',
          display:'block', marginTop:18, textAlign:'center', lineHeight:1.5}}>
          Federated · works across all Pīna'i servers.
        </Mono>
      </div>
    </MFrame>
  );
}

function MModalHeader({ title, subtitle, action }) {
  return (
    <div style={{
      padding:'4px 14px 14px',
      borderBottom:'1px solid var(--border)',
      display:'flex', alignItems:'center', gap:10,
    }}>
      <button style={{
        width:44, height:44, borderRadius:'50%', border:'none',
        background:'transparent', color:'var(--foreground)', cursor:'pointer',
        display:'flex', alignItems:'center', justifyContent:'center',
      }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m15 6-6 6 6 6"/>
        </svg>
      </button>
      <div style={{flex:1, minWidth:0}}>
        <Serif style={{fontSize:18, fontWeight:500, lineHeight:1.15}}>{title}</Serif>
        {subtitle && (
          <Mono style={{fontSize:10.5, color:'var(--muted-foreground)',
            letterSpacing:'0.04em', marginTop:1, display:'block'}}>{subtitle}</Mono>
        )}
      </div>
      {action}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 5 · NOTIFICATIONS (variant A) — Editorial inbox full-page
// ─────────────────────────────────────────────────────────────────────────
function MobileNotifications() {
  return (
    <MFrame>
      <MModalHeader title="Notifications" subtitle="3 new · today"
        action={
          <button style={{
            padding:'7px 11px', height:32, borderRadius:8,
            border:'1px solid var(--border)', background:'transparent',
            color:'var(--muted-foreground)', fontSize:11, cursor:'pointer',
            fontFamily:'inherit',
          }}>Mark all</button>
        }/>

      {/* filter pills */}
      <div style={{display:'flex', gap:6, padding:'12px 14px 6px',
        overflowX:'auto'}}>
        {[['All', true],['Unread', false],['Mentions', false],['Voice', false]].map(([l, a]) => (
          <span key={l} style={{
            flexShrink:0, padding:'6px 14px', borderRadius:20, fontSize:12,
            border: a ? '1px solid var(--border-strong)' : '1px solid var(--border)',
            background: a ? 'var(--accent)' : 'transparent',
            color: a ? 'var(--foreground)' : 'var(--muted-foreground)',
            fontWeight: a ? 500 : 400,
          }}>{l}</span>
        ))}
      </div>

      <div style={{flex:1, overflow:'auto'}}>
        {/* TODAY */}
        <div style={{padding:'8px 8px 0'}}>
          <Mono style={{fontSize:9.5, letterSpacing:'0.14em',
            color:'var(--muted-foreground)', textTransform:'uppercase',
            padding:'8px 12px', display:'block'}}>Today</Mono>

          {/* friend request — primary */}
          <div style={{
            position:'relative', display:'flex', gap:11, padding:'12px 12px',
            borderRadius:12,
            background:'color-mix(in oklab, var(--chat) 8%, transparent)',
          }}>
            <span style={{position:'absolute', left:4, top:20, width:5, height:5,
              borderRadius:'50%', background:'var(--chat)'}}/>
            <Avatar name="Pierre" color="oklch(0.74 0.06 30)" size={40}/>
            <div style={{flex:1, minWidth:0}}>
              <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:3}}>
                <MKind kind="friend"/>
                <Mono style={{fontSize:10, color:'var(--muted-foreground)',
                  marginLeft:'auto'}}>2m</Mono>
              </div>
              <div style={{fontSize:13.5, color:'var(--foreground)', lineHeight:1.4}}>
                <Serif style={{fontWeight:500}}>Pierre</Serif> sent you a friend request.
              </div>
              <Mono style={{fontSize:10.5, color:'var(--muted-foreground)',
                display:'block', marginTop:2}}>pierre@mft.pinai</Mono>
              <div style={{display:'flex', gap:7, marginTop:10}}>
                <button style={{
                  padding:'8px 16px', minHeight:36, fontSize:12.5, fontWeight:600,
                  borderRadius:18, border:'none', background:'var(--chat)',
                  color:'var(--primary-foreground)', cursor:'pointer', fontFamily:'inherit',
                }}>Accept</button>
                <button style={{
                  padding:'8px 14px', minHeight:36, fontSize:12.5, borderRadius:18,
                  border:'1px solid var(--border-strong)', background:'transparent',
                  color:'var(--muted-foreground)', cursor:'pointer', fontFamily:'inherit',
                }}>Decline</button>
              </div>
            </div>
          </div>

          {/* mention */}
          <div style={{
            position:'relative', display:'flex', gap:11, padding:'12px 12px',
            borderRadius:12,
          }}>
            <span style={{position:'absolute', left:4, top:20, width:5, height:5,
              borderRadius:'50%', background:'var(--chat)'}}/>
            <Avatar name="Maia" color="oklch(0.72 0.07 330)" size={40}/>
            <div style={{flex:1, minWidth:0}}>
              <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:3}}>
                <MKind kind="mention"/>
                <Mono style={{fontSize:10, color:'var(--muted-foreground)'}}>#design-lab</Mono>
                <Mono style={{fontSize:10, color:'var(--muted-foreground)',
                  marginLeft:'auto'}}>14m</Mono>
              </div>
              <div style={{fontSize:13, color:'var(--foreground)', lineHeight:1.5}}>
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
            position:'relative', display:'flex', gap:11, padding:'12px 12px',
            borderRadius:12,
            background:'color-mix(in oklab, var(--voice) 7%, transparent)',
          }}>
            <span style={{position:'absolute', left:4, top:20, width:5, height:5,
              borderRadius:'50%', background:'var(--voice)'}}/>
            <Avatar name="Kai" color="oklch(0.74 0.06 200)" size={40}/>
            <div style={{flex:1, minWidth:0}}>
              <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:3}}>
                <MKind kind="voice"/>
                <Mono style={{fontSize:10, color:'var(--muted-foreground)',
                  marginLeft:'auto'}}>just now</Mono>
              </div>
              <div style={{fontSize:13, color:'var(--foreground)', lineHeight:1.4}}>
                <Serif style={{fontWeight:500}}>Kai</Serif> added you to a voice room ·{' '}
                <Mono style={{fontSize:11.5, color:'var(--voice)'}}>Design Lab</Mono>
              </div>
              <div style={{display:'flex', gap:7, marginTop:10}}>
                <button style={{
                  padding:'8px 16px', minHeight:36, fontSize:12.5, fontWeight:600,
                  borderRadius:18, border:'none', background:'var(--voice)',
                  color:'var(--voice-foreground)', cursor:'pointer', fontFamily:'inherit',
                }}>Open room</button>
                <button style={{
                  padding:'8px 14px', minHeight:36, fontSize:12.5, borderRadius:18,
                  border:'1px solid var(--border-strong)', background:'transparent',
                  color:'var(--muted-foreground)', cursor:'pointer', fontFamily:'inherit',
                }}>Dismiss</button>
              </div>
            </div>
          </div>
        </div>

        {/* EARLIER */}
        <div style={{padding:'4px 8px 16px'}}>
          <Mono style={{fontSize:9.5, letterSpacing:'0.14em',
            color:'var(--muted-foreground)', textTransform:'uppercase',
            padding:'12px 12px 6px', display:'block'}}>Earlier this week</Mono>

          <div style={{display:'flex', gap:11, padding:'10px 12px',
            borderRadius:12, opacity:0.85}}>
            <Avatar name="Jules" color="oklch(0.70 0.05 260)" size={32}/>
            <div style={{flex:1}}>
              <div style={{fontSize:12.5, color:'var(--foreground)', lineHeight:1.4}}>
                <Serif style={{fontWeight:500}}>Jules</Serif> accepted your friend request.
              </div>
              <Mono style={{fontSize:10, color:'var(--muted-foreground)'}}>Tue · 14:02</Mono>
            </div>
          </div>

          <div style={{display:'flex', gap:11, padding:'10px 12px',
            borderRadius:12, opacity:0.85}}>
            <span style={{width:32, height:32, borderRadius:'50%', background:'var(--muted)',
              display:'flex', alignItems:'center', justifyContent:'center',
              color:'var(--muted-foreground)', flexShrink:0}}>{Icons.sparkle}</span>
            <div style={{flex:1}}>
              <div style={{fontSize:12.5, color:'var(--foreground)', lineHeight:1.4}}>
                Server <Mono style={{color:'var(--foreground)'}}>kauai.pinai</Mono> updated to v0.9.
              </div>
              <Mono style={{fontSize:10, color:'var(--muted-foreground)'}}>Mon · 09:18</Mono>
            </div>
          </div>
        </div>
      </div>
    </MFrame>
  );
}

function MKind({ kind }) {
  const map = {
    friend:  ['friend',  'var(--chat)'],
    mention: ['mention', 'var(--chat)'],
    voice:   ['voice',   'var(--voice)'],
  };
  const [label, color] = map[kind] || [kind, 'var(--muted-foreground)'];
  return (
    <Mono style={{
      fontSize:9.5, letterSpacing:'0.1em', textTransform:'uppercase',
      color, padding:'1.5px 6px', borderRadius:4,
      background:`color-mix(in oklab, ${color} 14%, transparent)`,
    }}>{label}</Mono>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 6 · USER STATUS (variant C) — bottom sheet over Friends
// ─────────────────────────────────────────────────────────────────────────
const M_STATUSES = [
  { id:'online',  label:'Online',         color:'var(--success)',          desc:'Available · friends can ping you.' },
  { id:'idle',    label:'Idle',           color:'oklch(0.78 0.10 80)',     desc:'Away from keyboard.' },
  { id:'dnd',     label:'Do not disturb', color:'var(--destructive)',      desc:'Notifications muted.' },
  { id:'invis',   label:'Invisible',      color:'var(--muted-foreground)', desc:'Appear offline; still receive.' },
  { id:'offline', label:'Offline',        color:'var(--border-strong)',    desc:'Disconnected.' },
];

function MobileUserStatus() {
  const current = 'online';
  return (
    <MFrame>
      {/* dimmed friends backdrop */}
      <div style={{flex:1, opacity:0.18, pointerEvents:'none'}}>
        <div style={{padding:'4px 14px 12px', display:'flex', alignItems:'flex-end', gap:10}}>
          <div style={{flex:1}}>
            <Mono style={{fontSize:9.5, letterSpacing:'0.14em',
              color:'var(--muted-foreground)', textTransform:'uppercase'}}>— people you keep close</Mono>
            <Serif style={{fontSize:32, fontWeight:400, letterSpacing:'-0.02em',
              lineHeight:1.05, marginTop:2}}>Friends</Serif>
          </div>
        </div>
      </div>

      {/* dim overlay */}
      <div style={{position:'absolute', inset:0,
        background:'oklch(0.05 0.005 60 / 0.5)', zIndex:20}}/>

      {/* bottom sheet */}
      <div style={{
        position:'absolute', left:0, right:0, bottom:0, zIndex:21,
        background:'var(--popover)',
        borderTopLeftRadius:24, borderTopRightRadius:24,
        boxShadow:'0 -16px 40px rgba(0,0,0,0.5)',
        padding:'10px 0 0',
        paddingBottom: M_SAFE_BOTTOM,
        maxHeight:'90%',
        display:'flex', flexDirection:'column',
      }}>
        {/* grab handle */}
        <div style={{display:'flex', justifyContent:'center', padding:'2px 0 4px'}}>
          <div style={{width:36, height:4, borderRadius:4,
            background:'var(--border-strong)'}}/>
        </div>

        {/* identity hero */}
        <div style={{padding:'14px 18px 14px',
          background:'color-mix(in oklab, var(--chat) 10%, transparent)',
          borderBottom:'1px solid var(--border)',
          display:'flex', gap:14, alignItems:'flex-start'}}>
          <div style={{position:'relative'}}>
            <Avatar name="Alice" color="var(--chat)" size={56}/>
            <div style={{position:'absolute', right:-2, bottom:-2, width:16, height:16,
              borderRadius:'50%', border:'3px solid var(--popover)',
              background:'var(--success)'}}/>
          </div>
          <div style={{flex:1, minWidth:0}}>
            <div style={{display:'flex', alignItems:'baseline', gap:8, flexWrap:'wrap'}}>
              <Serif style={{fontSize:18, fontWeight:500, lineHeight:1.1}}>Alice Koa</Serif>
              <Mono style={{fontSize:9.5, padding:'1px 6px', borderRadius:4,
                background:'color-mix(in oklab, var(--success) 22%, transparent)',
                color:'var(--success)', letterSpacing:'0.08em', textTransform:'uppercase'}}>
                online
              </Mono>
            </div>
            <Mono style={{fontSize:10.5, color:'var(--muted-foreground)',
              display:'block', marginTop:2}}>alice@kauai.pinai · she/her</Mono>
            <div style={{marginTop:8, fontSize:12.5, fontStyle:'italic',
              fontFamily:'var(--serif, Fraunces), serif', color:'var(--foreground)',
              lineHeight:1.5}}>
              Designer at Kauai Studio — interaction &amp; low-light interfaces. Tea drinker.
            </div>
          </div>
        </div>

        {/* live activity card */}
        <div style={{padding:'14px 18px 8px'}}>
          <Mono style={{fontSize:9.5, letterSpacing:'0.14em',
            color:'var(--muted-foreground)', textTransform:'uppercase',
            display:'block', marginBottom:8}}>Now</Mono>

          <div style={{
            padding:'12px 14px', borderRadius:12,
            background:'color-mix(in oklab, var(--voice) 12%, transparent)',
            border:'1px solid color-mix(in oklab, var(--voice) 30%, var(--border))',
          }}>
            <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:6}}>
              <span style={{color:'var(--voice)', display:'flex'}}>{Icons.headset}</span>
              <Mono style={{fontSize:10, letterSpacing:'0.1em', color:'var(--voice)',
                textTransform:'uppercase', fontWeight:600}}>In voice · live</Mono>
              <Mono style={{fontSize:10, color:'var(--muted-foreground)',
                marginLeft:'auto'}}>22m</Mono>
            </div>
            <Serif style={{fontSize:14, fontWeight:500, display:'block'}}>Design Lab</Serif>
            <div style={{display:'flex', alignItems:'center', gap:6, marginTop:5,
              fontSize:11.5, color:'var(--muted-foreground)'}}>
              <span style={{display:'inline-flex', gap:1.5,
                alignItems:'flex-end', height:8}}>
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
            <div style={{display:'flex', gap:8, marginTop:10}}>
              <button style={{
                flex:1, height:36, borderRadius:18, fontSize:11.5, fontWeight:600,
                border:'1px solid var(--voice)', background:'transparent',
                color:'var(--voice)', cursor:'pointer', fontFamily:'inherit',
                display:'flex', alignItems:'center', justifyContent:'center', gap:6,
              }}>{Icons.micOff} Mute</button>
              <button style={{
                flex:1, height:36, borderRadius:18, fontSize:11.5,
                border:'1px solid var(--border-strong)', background:'transparent',
                color:'var(--muted-foreground)', cursor:'pointer', fontFamily:'inherit',
              }}>Leave</button>
            </div>
          </div>
        </div>

        {/* presence list */}
        <div style={{padding:'10px 12px 6px', flex:1, overflow:'auto'}}>
          <Mono style={{fontSize:9.5, letterSpacing:'0.14em',
            color:'var(--muted-foreground)', textTransform:'uppercase',
            padding:'4px 8px', display:'block'}}>Presence</Mono>
          {M_STATUSES.map(s => {
            const active = s.id === current;
            return (
              <div key={s.id} style={{
                display:'flex', alignItems:'center', gap:12, padding:'12px 10px',
                borderRadius:10, cursor:'pointer',
                background: active ? 'var(--accent)' : 'transparent',
                minHeight:48,
              }}>
                <span style={{
                  width:11, height:11, borderRadius:'50%', background:s.color, flexShrink:0,
                  boxShadow: active ? `0 0 0 4px color-mix(in oklab, ${s.color} 30%, transparent)` : 'none',
                }}/>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{fontSize:14, color:'var(--foreground)',
                    fontWeight: active ? 500 : 400,
                    fontFamily: active ? 'var(--serif, Fraunces), serif' : 'inherit'}}>
                    {s.label}
                  </div>
                  <div style={{fontSize:11.5, color:'var(--muted-foreground)',
                    marginTop:1}}>{s.desc}</div>
                </div>
                {active && <span style={{color:'var(--chat)', fontSize:16}}>{Icons.check}</span>}
              </div>
            );
          })}
        </div>

        {/* footer */}
        <div style={{padding:'10px 14px 6px', borderTop:'1px solid var(--border)',
          display:'flex', gap:8, alignItems:'center'}}>
          <button style={{flex:1, height:42, borderRadius:10,
            border:'1px solid var(--border)', background:'transparent',
            color:'var(--foreground)', fontSize:12.5, cursor:'pointer',
            fontFamily:'inherit', display:'flex', alignItems:'center',
            justifyContent:'center', gap:6}}>
            {Icons.users} Profile
          </button>
          <button style={{flex:1, height:42, borderRadius:10,
            border:'1px solid var(--border)', background:'transparent',
            color:'var(--foreground)', fontSize:12.5, cursor:'pointer',
            fontFamily:'inherit', display:'flex', alignItems:'center',
            justifyContent:'center', gap:6}}>
            {Icons.settings} Settings
          </button>
          <button style={{flex:1, height:42, borderRadius:10,
            border:'1px solid var(--destructive)', background:'transparent',
            color:'var(--destructive)', fontSize:12.5, cursor:'pointer',
            fontFamily:'inherit'}}>
            Sign out
          </button>
        </div>
      </div>
    </MFrame>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 7 · SETTINGS (variant C) — card grid landing, full page
// ─────────────────────────────────────────────────────────────────────────
function MobileSettings() {
  return (
    <MFrame>
      <MModalHeader title="Settings" subtitle="kauai.pinai · v0.9"/>

      <div style={{flex:1, overflow:'auto', padding:'14px 14px',
        paddingBottom: M_SAFE_BOTTOM + 30}}>
        {/* identity tile (full-width hero) */}
        <div style={{
          padding:'16px 16px', borderRadius:14,
          background:`linear-gradient(135deg,
            color-mix(in oklab, var(--chat) 14%, var(--card)),
            var(--card))`,
          border:'1px solid color-mix(in oklab, var(--chat) 25%, var(--border))',
          display:'flex', alignItems:'center', gap:14, marginBottom:14,
        }}>
          <div style={{position:'relative', flexShrink:0}}>
            <Avatar name="Alice" color="var(--chat)" size={50}/>
            <div style={{position:'absolute', right:-2, bottom:-2, width:14, height:14,
              borderRadius:'50%', border:'3px solid var(--card)',
              background:'var(--success)'}}/>
          </div>
          <div style={{flex:1, minWidth:0}}>
            <Serif style={{fontSize:16, fontWeight:500, display:'block',
              lineHeight:1.15}}>Alice Koa</Serif>
            <Mono style={{fontSize:10, color:'var(--muted-foreground)',
              display:'block', marginTop:2,
              whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>
              alice@kauai.pinai
            </Mono>
          </div>
        </div>

        {/* card grid 2 cols */}
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
          <MSettingTile icon={Icons.sparkle} label="Profile" active
            desc="Avatar, banner, bio."/>
          <MSettingTile icon={Icons.lock} label="Privacy"
            desc="DMs, requests, blocks."/>
          <MSettingTile icon={Icons.sun} label="Appearance"
            desc="Theme, density, font."/>
          <MSettingTile icon={Icons.bell} label="Notifications"
            desc="What pings you, when."/>
          <MSettingTile icon={Icons.headset} label="Voice & video"
            desc="Microphone, audio."/>
          <MSettingTile icon={Icons.settings} label="Keybinds"
            desc="Shortcuts you can rewire."/>
        </div>

        {/* full-width rows */}
        <div style={{marginTop:14, display:'flex', flexDirection:'column', gap:6}}>
          <MSettingRow icon={Icons.message} label="Connected servers"
            sub="kauai · studio · lab"/>
          <MSettingRow icon={Icons.help} label="Help & support"
            sub="docs.pinai · status"/>
          <MSettingRow icon={Icons.lock} label="Sign out"
            danger sub="End this session"/>
        </div>

        <Mono style={{fontSize:10, color:'var(--muted-foreground)',
          display:'block', marginTop:18, textAlign:'center',
          letterSpacing:'0.06em'}}>
          Pīna'i v0.9 · kauai.pinai
        </Mono>
      </div>
    </MFrame>
  );
}

function MSettingTile({ icon, label, desc, active, danger }) {
  return (
    <div style={{
      padding:'14px 12px 12px', borderRadius:12,
      background: active ? 'color-mix(in oklab, var(--chat) 10%, var(--card))' : 'var(--card)',
      border: active
        ? '1px solid color-mix(in oklab, var(--chat) 35%, var(--border))'
        : '1px solid var(--border)',
      cursor:'pointer', display:'flex', flexDirection:'column', gap:6,
      minHeight:96,
    }}>
      <div style={{display:'flex', alignItems:'center', gap:8}}>
        <span style={{
          width:28, height:28, borderRadius:7,
          background: active ? 'var(--chat)' : 'var(--muted)',
          color: active ? 'var(--primary-foreground)' : danger ? 'var(--destructive)' : 'var(--muted-foreground)',
          display:'flex', alignItems:'center', justifyContent:'center',
        }}>{icon}</span>
        <Serif style={{fontSize:13.5, fontWeight:500,
          color: danger ? 'var(--destructive)' : 'var(--foreground)'}}>{label}</Serif>
      </div>
      <div style={{fontSize:11.5, color:'var(--muted-foreground)',
        lineHeight:1.4}}>{desc}</div>
    </div>
  );
}

function MSettingRow({ icon, label, sub, danger }) {
  return (
    <div style={{
      display:'flex', alignItems:'center', gap:12, padding:'12px 14px',
      borderRadius:12, background:'var(--card)', border:'1px solid var(--border)',
      cursor:'pointer', minHeight:54,
    }}>
      <span style={{
        width:30, height:30, borderRadius:8,
        background:'var(--muted)',
        color: danger ? 'var(--destructive)' : 'var(--muted-foreground)',
        display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
      }}>{icon}</span>
      <div style={{flex:1, minWidth:0}}>
        <Serif style={{fontSize:14, fontWeight:500,
          color: danger ? 'var(--destructive)' : 'var(--foreground)'}}>
          {label}
        </Serif>
        <Mono style={{fontSize:10.5, color:'var(--muted-foreground)',
          display:'block', marginTop:1}}>{sub}</Mono>
      </div>
      <span style={{color:'var(--muted-foreground)', fontSize:14}}>{Icons.chevR}</span>
    </div>
  );
}

Object.assign(window, {
  MobileSignIn, MobileFriends, MobileVoice,
  MobileAddFriend, MobileNotifications,
  MobileUserStatus, MobileSettings,
});
