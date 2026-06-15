// Friends · Profile card modal
// Opens when "See profile" is chosen from the friend context menu.
// A centered modal over the (dimmed) Friends page, showing Maia's identity:
// avatar, display name + name-pronunciation, ActivityPub actor address,
// bio, pronouns, and a few relationship facts. Sage is the accent.

// ── Maia's record (mirrors the friends list anchor row) ─────────────────
const MAIA_PROFILE = {
  name:    'Maia',
  color:   'oklch(0.72 0.07 330)',
  handle:  '@maia@studio.pinai',
  actor:   'https://studio.pinai/users/maia',
  phon:    '/ˈmaɪ.ə/',
  say:     'MY-ah',           // English-friendly transcription for TTS
  pronouns:'she / her',
  bio:     "Designer at the Studio. I look after Pīna'i's voice rooms and the small, careful details in between. Tea over coffee, mountains over meetings.",
  joined:  'November 2023',
  mutuals: 7,
  servers: ['studio', 'kauai'],
};

// ── A pronunciation badge, parameterised (the sign-in one is hard-wired) ─
function NamePronounce({ phon, say, size = 'md' }) {
  const [playing, setPlaying] = React.useState(false);
  const sm = size === 'sm';
  const speak = React.useCallback(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(say);
    u.lang = 'en-US'; u.rate = 0.82; u.pitch = 1.02;
    u.onend = () => setPlaying(false);
    u.onerror = () => setPlaying(false);
    setPlaying(true);
    window.speechSynthesis.speak(u);
  }, [say]);
  const iconPx = sm ? 9 : 11;
  return (
    <button
      onClick={speak}
      aria-label={`Hear how ${say} is pronounced`}
      title="Hear how it's pronounced"
      style={{
        display:'inline-flex', alignItems:'center', gap: sm ? 5 : 7,
        padding: sm ? '2px 7px 2px 6px' : '4px 10px 4px 8px',
        borderRadius:999,
        border:'1px solid color-mix(in oklab, var(--chat) 24%, var(--border))',
        background:'color-mix(in oklab, var(--chat) 6%, transparent)',
        color: playing ? 'var(--chat)' : 'var(--muted-foreground)',
        cursor:'pointer', fontFamily:'inherit', lineHeight:1,
        transition:'color 160ms, background 160ms, border-color 160ms',
      }}
      onMouseEnter={e => { e.currentTarget.style.color='var(--chat)';
        e.currentTarget.style.background='color-mix(in oklab, var(--chat) 14%, transparent)'; }}
      onMouseLeave={e => { e.currentTarget.style.color = playing ? 'var(--chat)' : 'var(--muted-foreground)';
        e.currentTarget.style.background='color-mix(in oklab, var(--chat) 6%, transparent)'; }}
    >
      <span style={{display:'inline-flex', width:iconPx, height:iconPx,
        alignItems:'center', justifyContent:'center'}}>
        <svg width={iconPx} height={iconPx} viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 5L6 9H2v6h4l5 4V5z" fill="currentColor" stroke="none" opacity="0.85"/>
          {!playing && <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>}
          {playing && (<>
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07">
              <animate attributeName="opacity" values="0.3;1;0.3" dur="1.1s" repeatCount="indefinite"/>
            </path>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14">
              <animate attributeName="opacity" values="0.15;0.9;0.15" dur="1.1s" begin="0.18s" repeatCount="indefinite"/>
            </path>
          </>)}
        </svg>
      </span>
      <span style={{fontFamily:'var(--serif), serif', fontStyle:'italic',
        fontWeight:400, fontSize: sm ? 10.5 : 13, letterSpacing:'0.01em',
        lineHeight:1, color:'inherit'}}>{phon}</span>
    </button>
  );
}

// ── A copyable address row ──────────────────────────────────────────────
function AddressRow({ label, value, mono = true }) {
  return (
    <div style={{display:'flex', alignItems:'center', gap:10,
      padding:'10px 12px', borderRadius:'var(--radius-sm)',
      background:'var(--card)', border:'1px solid var(--border)'}}>
      <div style={{flex:1, minWidth:0}}>
        <Mono style={{fontSize:9, letterSpacing:'0.14em', textTransform:'uppercase',
          color:'var(--muted-foreground)', display:'block', marginBottom:3}}>{label}</Mono>
        <span style={{
          fontFamily: mono ? 'JetBrains Mono, monospace' : 'inherit',
          fontSize:12.5, color:'var(--foreground)',
          display:'block', whiteSpace:'nowrap', overflow:'hidden',
          textOverflow:'ellipsis'}}>{value}</span>
      </div>
      <button title="Copy" style={{
        flexShrink:0, width:30, height:30, borderRadius:'var(--radius-sm)',
        border:'1px solid var(--border)', background:'transparent',
        color:'var(--muted-foreground)', cursor:'pointer',
        display:'flex', alignItems:'center', justifyContent:'center'}}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
      </button>
    </div>
  );
}

function ProfilePill({ children, tone }) {
  return (
    <span style={{display:'inline-flex', alignItems:'center', gap:6,
      padding:'4px 10px', borderRadius:999, fontSize:11.5,
      border:`1px solid ${tone ? `color-mix(in oklab, ${tone} 30%, var(--border))` : 'var(--border)'}`,
      background: tone ? `color-mix(in oklab, ${tone} 10%, transparent)` : 'var(--card)',
      color: tone || 'var(--muted-foreground)'}}>
      {children}
    </span>
  );
}

// ── The modal card ──────────────────────────────────────────────────────
function ProfileModal({ u = MAIA_PROFILE }) {
  return (
    <div style={{
      width:440, borderRadius:'var(--radius-xl)', overflow:'hidden',
      background:'var(--popover)', color:'var(--popover-foreground)',
      border:'1px solid var(--border-strong)',
      boxShadow:'0 40px 100px -24px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.02)',
      position:'relative',
    }}>
      {/* banner */}
      <div style={{height:104, position:'relative',
        background:`linear-gradient(135deg,
          color-mix(in oklab, ${u.color} 42%, var(--background)),
          color-mix(in oklab, var(--chat) 26%, var(--background)))`}}>
        {/* topo line texture */}
        <svg width="440" height="104" viewBox="0 0 440 104" preserveAspectRatio="none"
          style={{position:'absolute', inset:0, opacity:0.25}} aria-hidden>
          {[18,38,58,78,98].map((cy,i) => (
            <path key={i} d={`M0 ${cy} C 90 ${cy-14}, 160 ${cy+12}, 250 ${cy-8} S 400 ${cy+10}, 440 ${cy-6}`}
              fill="none" stroke="white" strokeWidth="0.8"/>
          ))}
        </svg>
        {/* close button */}
        <button title="Close" style={{position:'absolute', top:12, right:12,
          width:30, height:30, borderRadius:'50%',
          background:'color-mix(in oklab, var(--background) 55%, transparent)',
          border:'1px solid color-mix(in oklab, white 14%, transparent)',
          color:'var(--foreground)', cursor:'pointer',
          display:'flex', alignItems:'center', justifyContent:'center',
          backdropFilter:'blur(4px)'}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      {/* avatar overlapping the banner */}
      <div style={{padding:'0 24px', marginTop:-44, position:'relative'}}>
        <div style={{position:'relative', width:88, height:88}}>
          <div style={{width:88, height:88, borderRadius:'50%',
            border:'4px solid var(--popover)',
            background:u.color, display:'flex', alignItems:'center',
            justifyContent:'center', color:'oklch(0.18 0.008 60)',
            fontFamily:'var(--serif, Fraunces), serif', fontSize:38, fontWeight:600}}>
            {u.name[0]}
          </div>
          <div style={{position:'absolute', right:4, bottom:4, width:16, height:16,
            borderRadius:'50%', background:'var(--voice)',
            border:'3px solid var(--popover)'}}/>
        </div>
      </div>

      {/* identity */}
      <div style={{padding:'14px 24px 4px'}}>
        <div style={{display:'flex', alignItems:'center', gap:12, flexWrap:'wrap'}}>
          <Serif style={{fontSize:28, fontWeight:450, letterSpacing:'-0.015em',
            lineHeight:1}}>{u.name}</Serif>
          <NamePronounce phon={u.phon} say={u.say}/>
        </div>

        <div style={{display:'flex', alignItems:'center', gap:8, marginTop:10,
          flexWrap:'wrap'}}>
          <ProfilePill>{u.pronouns}</ProfilePill>
        </div>

        {/* bio */}
        <p style={{margin:'16px 0 0', fontSize:13.5, lineHeight:1.6,
          color:'var(--secondary-foreground)'}}>
          {u.bio}
        </p>
      </div>

      {/* addresses */}
      <div style={{padding:'18px 24px 4px', display:'flex',
        flexDirection:'column', gap:8}}>
        <AddressRow label="Handle" value={u.handle}/>
      </div>

      {/* relationship facts */}
      <div style={{padding:'14px 24px 0', display:'flex', gap:22,
        fontSize:12, color:'var(--muted-foreground)'}}>
        <span style={{display:'inline-flex', flexDirection:'column', gap:2}}>
          <Serif style={{fontSize:18, color:'var(--foreground)', fontWeight:450}}>{u.mutuals}</Serif>
          mutual friends
        </span>
        <span style={{display:'inline-flex', flexDirection:'column', gap:2}}>
          <Serif style={{fontSize:18, color:'var(--foreground)', fontWeight:450}}>{u.servers.length}</Serif>
          shared servers
        </span>
        <span style={{display:'inline-flex', flexDirection:'column', gap:2}}>
          <Serif style={{fontSize:18, color:'var(--foreground)', fontWeight:450,
            fontStyle:'italic'}}>Nov ’23</Serif>
          friends since
        </span>
      </div>

      {/* actions */}
      <div style={{padding:'20px 24px 24px', display:'flex', gap:10}}>
        <button style={{flex:1, padding:'11px 14px', borderRadius:'var(--radius)',
          background:'var(--chat)', color:'var(--primary-foreground)',
          border:'none', cursor:'pointer', fontWeight:600, fontSize:13,
          fontFamily:'inherit', display:'inline-flex', alignItems:'center',
          justifyContent:'center', gap:8,
          boxShadow:'0 1px 0 rgba(255,255,255,0.15) inset, 0 8px 24px -10px color-mix(in oklab, var(--chat) 45%, transparent)'}}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16v10H9l-4 4V6z"/></svg>
          Message
        </button>
        <button style={{padding:'11px 14px', borderRadius:'var(--radius)',
          background:'transparent', color:'var(--foreground)',
          border:'1px solid var(--border-strong)', cursor:'pointer',
          fontSize:13, fontFamily:'inherit', display:'inline-flex',
          alignItems:'center', gap:8}}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="6" width="14" height="12" rx="2"/><path d="m17 10 5-3v10l-5-3z"/></svg>
          Call
        </button>
        <button title="More" style={{width:42, borderRadius:'var(--radius)',
          background:'transparent', color:'var(--muted-foreground)',
          border:'1px solid var(--border-strong)', cursor:'pointer',
          display:'flex', alignItems:'center', justifyContent:'center'}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>
        </button>
      </div>
    </div>
  );
}

// ── Artboard: modal open over the dimmed Friends page ───────────────────
function ContextMenuProfile() {
  return (
    <Artboard w={1200} h={780} style={{display:'flex', position:'relative'}}>
      {/* dimmed underlying friends page */}
      <div style={{position:'absolute', inset:0, filter:'saturate(0.9)'}}>
        <CMFriendsBackdrop anchorIndex={1}/>
      </div>
      {/* scrim */}
      <div style={{position:'absolute', inset:0,
        background:'color-mix(in oklab, var(--background) 64%, transparent)',
        backdropFilter:'blur(3px)'}}/>
      {/* modal */}
      <div style={{position:'absolute', inset:0, display:'flex',
        alignItems:'center', justifyContent:'center', zIndex:30}}>
        <ProfileModal/>
      </div>
    </Artboard>
  );
}

Object.assign(window, { ProfileModal, ContextMenuProfile, NamePronounce });
