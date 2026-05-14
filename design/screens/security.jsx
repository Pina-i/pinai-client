// Security · E2EE concerns (revised)
//
// Business rule:
//   • Friends (request accepted) — no security UI noise. They're trusted.
//   • Non-friends / first-contact strangers / rotated keys for non-friends —
//     subtle, in-context hints (chips, micro-banners). Never blocking.
//
// Artboards:
//   1. SecSubtleWarnings    — specimens of where small hints appear
//   2. SecRecoveryKey       — passphrase onboarding (Copy / Continue / Skip)
//   3. SecDevicesSettings   — Devices section inside settings layout
//   4. SecPairQrMobile      — pairing QR display (mobile)
//   5. SecPairScanMobile    — pairing scanner (mobile)
//   6. SecBadgeSpecimens    — encrypted-badge variants in context

// ── Atoms ────────────────────────────────────────────────────────────────
function QRPlate({ size = 180, accent = 'var(--foreground)', bg = 'var(--card)' }) {
  return (
    <div style={{
      width:size, height:size, background:bg, padding:10, borderRadius:10,
      border:'1px solid var(--border-strong)', position:'relative',
    }}>
      <svg viewBox="0 0 100 100" width="100%" height="100%">
        {[[0,0],[0,72],[72,0]].map(([x,y],k) => (
          <g key={k} transform={`translate(${x},${y})`}>
            <rect x="0" y="0" width="28" height="28" rx="3" fill={accent}/>
            <rect x="4" y="4" width="20" height="20" rx="2" fill={bg}/>
            <rect x="9" y="9" width="10" height="10" rx="1" fill={accent}/>
          </g>
        ))}
        <g transform="translate(70,70)">
          <rect x="0" y="0" width="14" height="14" rx="2" fill={accent}/>
          <rect x="3" y="3" width="8" height="8" rx="1" fill={bg}/>
          <rect x="5" y="5" width="4" height="4" fill={accent}/>
        </g>
        {Array.from({length:230}).map((_,i) => {
          const x=(i*17)%92+2, y=(i*23)%92+2;
          if((x<30&&y<30)||(x<30&&y>68)||(x>68&&y<30))return null;
          if(x>65&&y>65&&x<88&&y<88)return null;
          if((i*53)%100<45)return null;
          return <rect key={i} x={x} y={y} width="3" height="3" fill={accent}/>;
        })}
      </svg>
    </div>
  );
}

function SecLockMark({ size = 22, ok = true }) {
  return (
    <span style={{
      width:size, height:size, borderRadius:6,
      background: ok
        ? 'color-mix(in oklab, var(--success) 22%, transparent)'
        : 'color-mix(in oklab, var(--warning) 22%, transparent)',
      color: ok ? 'var(--success)' : 'var(--warning)',
      display:'inline-flex', alignItems:'center', justifyContent:'center', flexShrink:0,
    }}>
      <svg width={size*0.6} height={size*0.6} viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="11" width="16" height="10" rx="2"/>
        <path d="M8 11V8a4 4 0 0 1 8 0v3"/>
      </svg>
    </span>
  );
}

function CautionChip({ tone = 'warning', label = 'unverified', icon = true }) {
  const c = tone === 'warning' ? 'var(--warning)' :
            tone === 'success' ? 'var(--success)' :
            tone === 'chat'    ? 'var(--chat)' : 'var(--muted-foreground)';
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:5,
      padding:'2px 7px', borderRadius:5, fontSize:10,
      background:`color-mix(in oklab, ${c} 16%, transparent)`,
      color:c, fontFamily:'JetBrains Mono, monospace',
      letterSpacing:'0.08em', textTransform:'uppercase', fontWeight:600,
    }}>
      {icon && <span style={{width:5, height:5, borderRadius:'50%', background:c}}/>}
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 1 · Subtle, in-context safety hints (specimens)
// ─────────────────────────────────────────────────────────────────────────
function SecSubtleWarnings() {
  return (
    <Artboard w={1200} h={780}>
      <div style={{padding:'40px 56px', height:'100%', overflow:'auto'}}>
        <div style={{marginBottom:24, maxWidth:780}}>
          <Mono style={{fontSize:10, letterSpacing:'0.14em',
            color:'var(--muted-foreground)', textTransform:'uppercase'}}>
            — Security · in-context hints
          </Mono>
          <Serif style={{fontSize:34, fontWeight:400, letterSpacing:'-0.02em',
            margin:'8px 0 8px', lineHeight:1.05}}>
            Quiet for friends.{' '}
            <em style={{fontStyle:'italic', color:'var(--warning)'}}>Curious about strangers.</em>
          </Serif>
          <p style={{margin:0, color:'var(--muted-foreground)', fontSize:13.5, lineHeight:1.55}}>
            If you've accepted someone as a friend, the encryption is invisible — it just works.
            For people you haven't friended yet, we surface tiny hints in-place so you can
            decide for yourself.
          </p>
        </div>

        {/* Side-by-side: the rule */}
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:18}}>
          {/* friend — clean */}
          <div style={{padding:'16px 18px', borderRadius:'var(--radius)',
            background:'var(--card)', border:'1px solid var(--border)'}}>
            <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:12}}>
              <CautionChip tone="success" label="friend"/>
              <Mono style={{fontSize:10, color:'var(--muted-foreground)',
                letterSpacing:'0.08em'}}>no security chrome</Mono>
            </div>
            <div style={{display:'flex', alignItems:'center', gap:11,
              padding:'10px 12px', borderRadius:8,
              background:'var(--background)', border:'1px solid var(--border)'}}>
              <Avatar name="Maia" color="oklch(0.72 0.07 330)" size={32} dot="online"/>
              <div style={{flex:1, minWidth:0}}>
                <Serif style={{fontSize:14, fontWeight:500}}>Maia</Serif>
                <Mono style={{fontSize:10.5, color:'var(--muted-foreground)',
                  display:'block', marginTop:1}}>Working on the lantern proto</Mono>
              </div>
              <SecLockMark size={18}/>
            </div>
          </div>

          {/* non-friend — hinted */}
          <div style={{padding:'16px 18px', borderRadius:'var(--radius)',
            background:'color-mix(in oklab, var(--warning) 6%, var(--card))',
            border:'1px solid color-mix(in oklab, var(--warning) 30%, var(--border))'}}>
            <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:12}}>
              <CautionChip label="not your friend"/>
              <Mono style={{fontSize:10, color:'var(--muted-foreground)',
                letterSpacing:'0.08em'}}>tiny in-place hint</Mono>
            </div>
            <div style={{display:'flex', alignItems:'center', gap:11,
              padding:'10px 12px', borderRadius:8,
              background:'var(--background)', border:'1px solid var(--border)'}}>
              <Avatar name="Pierre" color="oklch(0.74 0.06 30)" size={32}/>
              <div style={{flex:1, minWidth:0}}>
                <div style={{display:'flex', alignItems:'center', gap:7}}>
                  <Serif style={{fontSize:14, fontWeight:500}}>Pierre</Serif>
                  <CautionChip label="unverified"/>
                </div>
                <Mono style={{fontSize:10.5, color:'var(--muted-foreground)',
                  display:'block', marginTop:1}}>pierre@mft.example</Mono>
              </div>
              <SecLockMark size={18} ok={false}/>
            </div>
          </div>
        </div>

        {/* Specimens */}
        <Mono style={{fontSize:9.5, letterSpacing:'0.14em',
          color:'var(--muted-foreground)', textTransform:'uppercase',
          display:'block', margin:'10px 0 12px'}}>
          Where the hint shows up
        </Mono>

        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
          {/* DM intro banner */}
          <div style={{padding:'12px 14px', borderRadius:10,
            background:'var(--card)', border:'1px solid var(--border)'}}>
            <Mono style={{fontSize:9.5, letterSpacing:'0.12em',
              color:'var(--muted-foreground)', textTransform:'uppercase',
              display:'block', marginBottom:10}}>
              First DM from a non-friend
            </Mono>
            <div style={{padding:'10px 12px', borderRadius:8,
              background:'color-mix(in oklab, var(--warning) 7%, var(--background))',
              border:'1px solid color-mix(in oklab, var(--warning) 30%, var(--border))',
              display:'flex', gap:10, alignItems:'flex-start'}}>
              <span style={{color:'var(--warning)', flexShrink:0, marginTop:1}}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
                </svg>
              </span>
              <div style={{flex:1, fontSize:12, color:'var(--foreground)', lineHeight:1.5}}>
                You don't know <Serif style={{fontWeight:500}}>Pierre</Serif> yet.
                Treat unfamiliar links and files with care.
                <div style={{display:'flex', gap:7, marginTop:8}}>
                  <button style={{padding:'5px 10px', height:28, borderRadius:6,
                    border:'1px solid var(--chat)', color:'var(--chat)',
                    background:'transparent', fontSize:11, cursor:'pointer',
                    fontFamily:'inherit', fontWeight:500}}>Add as friend</button>
                  <button style={{padding:'5px 10px', height:28, borderRadius:6,
                    border:'1px solid var(--border)', color:'var(--muted-foreground)',
                    background:'transparent', fontSize:11, cursor:'pointer',
                    fontFamily:'inherit'}}>Dismiss</button>
                </div>
              </div>
            </div>
          </div>

          {/* Channel member list */}
          <div style={{padding:'12px 14px', borderRadius:10,
            background:'var(--card)', border:'1px solid var(--border)'}}>
            <Mono style={{fontSize:9.5, letterSpacing:'0.12em',
              color:'var(--muted-foreground)', textTransform:'uppercase',
              display:'block', marginBottom:10}}>
              Channel members · mixed
            </Mono>
            <div style={{display:'flex', flexDirection:'column', gap:5}}>
              {[
                ['Maia','oklch(0.72 0.07 330)', 'friend'],
                ['Kai','oklch(0.74 0.06 200)', 'friend'],
                ['Pierre','oklch(0.74 0.06 30)', 'stranger'],
                ['Tane','oklch(0.72 0.07 25)', 'friend'],
              ].map(([n, c, kind]) => (
                <div key={n} style={{display:'flex', alignItems:'center', gap:10,
                  padding:'7px 8px', borderRadius:6,
                  background: kind === 'stranger'
                    ? 'color-mix(in oklab, var(--warning) 6%, transparent)' : 'transparent'}}>
                  <Avatar name={n} color={c} size={24}/>
                  <Serif style={{fontSize:13, fontWeight:500}}>{n}</Serif>
                  {kind === 'stranger' && <CautionChip label="not in friends"/>}
                  <span style={{flex:1}}/>
                  {kind === 'friend'
                    ? <SecLockMark size={14}/>
                    : <SecLockMark size={14} ok={false}/>}
                </div>
              ))}
            </div>
          </div>

          {/* Friend search result */}
          <div style={{padding:'12px 14px', borderRadius:10,
            background:'var(--card)', border:'1px solid var(--border)'}}>
            <Mono style={{fontSize:9.5, letterSpacing:'0.12em',
              color:'var(--muted-foreground)', textTransform:'uppercase',
              display:'block', marginBottom:10}}>
              Add-friend lookup result
            </Mono>
            <div style={{display:'flex', alignItems:'center', gap:11,
              padding:'10px 12px', borderRadius:8,
              background:'var(--background)', border:'1px solid var(--border)'}}>
              <Avatar name="A" color="oklch(0.74 0.06 200)" size={30}/>
              <div style={{flex:1, minWidth:0}}>
                <Serif style={{fontSize:13.5, fontWeight:500}}>alex</Serif>
                <Mono style={{fontSize:10.5, color:'var(--muted-foreground)',
                  display:'block', marginTop:1}}>alex@external.example</Mono>
              </div>
              <CautionChip label="external"/>
              <button style={{padding:'5px 11px', height:28, borderRadius:14,
                border:'1px solid var(--chat)', color:'var(--chat)',
                background:'transparent', fontSize:11, fontWeight:600,
                cursor:'pointer', fontFamily:'inherit'}}>Send request</button>
            </div>
          </div>

          {/* Mention */}
          <div style={{padding:'12px 14px', borderRadius:10,
            background:'var(--card)', border:'1px solid var(--border)'}}>
            <Mono style={{fontSize:9.5, letterSpacing:'0.12em',
              color:'var(--muted-foreground)', textTransform:'uppercase',
              display:'block', marginBottom:10}}>
              Mention from a non-friend
            </Mono>
            <div style={{display:'flex', gap:11, padding:'10px 12px', borderRadius:8,
              background:'var(--background)', border:'1px solid var(--border)'}}>
              <Avatar name="P" color="oklch(0.74 0.06 30)" size={28}/>
              <div style={{flex:1, minWidth:0}}>
                <div style={{display:'flex', alignItems:'center', gap:7, marginBottom:2}}>
                  <Serif style={{fontSize:13, fontWeight:500}}>Pierre</Serif>
                  <CautionChip label="not friends"/>
                  <Mono style={{fontSize:10, color:'var(--muted-foreground)',
                    marginLeft:'auto'}}>2m</Mono>
                </div>
                <div style={{fontSize:12, color:'var(--foreground)', lineHeight:1.5}}>
                  mentioned you in{' '}
                  <Mono style={{color:'var(--muted-foreground)'}}>#open-help</Mono>
                  : <em style={{fontFamily:'var(--serif), serif', fontStyle:'italic',
                  color:'var(--muted-foreground)'}}>"@alice can you take a look?"</em>
                </div>
              </div>
            </div>
          </div>
        </div>

        <Mono style={{fontSize:11, color:'var(--muted-foreground)',
          fontStyle:'italic', fontFamily:'var(--serif), serif',
          display:'block', marginTop:18, textAlign:'center', maxWidth:700,
          marginInline:'auto', lineHeight:1.5}}>
          Hints are dismissible per-conversation. They never block sending or reading —
          only inform.
        </Mono>
      </div>
    </Artboard>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 2 · Recovery key onboarding (revised)
// ─────────────────────────────────────────────────────────────────────────
const RECOVERY_WORDS = [
  'lantern','river','eagle','copper','quartz','marigold',
  'orchid','steppe','pebble','almond','heron','chestnut',
  'cinder','pollen','garnet','silvan','mariner','tundra',
  'oasis','candle','furrow','dapple','lichen','tessera',
];

function SecRecoveryKey() {
  return (
    <Artboard w={1200} h={780}>
      <div style={{padding:'40px 56px', height:'100%', overflow:'auto',
        display:'grid', gridTemplateColumns:'1.1fr 1fr', gap:36}}>
        {/* Left — copy */}
        <div>
          <div style={{display:'flex', alignItems:'center', gap:7,
            color:'var(--muted-foreground)', fontSize:12, marginBottom:14}}>
            <span>Onboarding</span>
            <span style={{color:'var(--border-strong)'}}>›</span>
            <span style={{color:'var(--foreground)', fontWeight:500}}>Recovery passphrase</span>
          </div>
          <Serif as="h1" style={{display:'block', fontSize:42, fontWeight:400,
            letterSpacing:'-0.02em', lineHeight:1.05, margin:'0 0 14px'}}>
            Bring your history <em style={{fontStyle:'italic', color:'var(--chat)'}}>with you.</em>
          </Serif>

          <p style={{margin:'0 0 14px', color:'var(--foreground)',
            fontSize:14, lineHeight:1.65, maxWidth:520}}>
            When you sign in on a new phone or laptop, this passphrase restores your
            conversation history end-to-end. Without it, switching devices means starting fresh —
            past messages stay encrypted on devices you've already paired, but a brand-new device
            can't read them.
          </p>

          <div style={{display:'flex', flexDirection:'column', gap:10, marginTop:18,
            maxWidth:540}}>
            <RowFact icon="↺" title="Switching devices"
              body="Type these 24 words on your new device to unlock prior conversations."/>
            <RowFact icon="✕" title="If you skip"
              body="You can pair more devices later from Settings → Devices, but old messages won't follow them."/>
            <RowFact icon="!" title="If you lose it"
              body="Anyone holding the words can sign in. Keep them somewhere only you reach — paper, password manager."
              tone="warning"/>
          </div>

          {/* Action row */}
          <div style={{display:'flex', gap:10, marginTop:28, alignItems:'center'}}>
            <button style={{padding:'12px 18px', height:46, borderRadius:10,
              border:'1px solid var(--chat)', background:'transparent',
              color:'var(--chat)', fontSize:13.5, fontWeight:600,
              cursor:'pointer', fontFamily:'inherit',
              display:'inline-flex', alignItems:'center', gap:8}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
              Copy passphrase
            </button>
            <button style={{padding:'12px 22px', height:46, borderRadius:10,
              border:'none', background:'var(--chat)',
              color:'var(--primary-foreground)', fontSize:13.5, fontWeight:600,
              cursor:'pointer', fontFamily:'inherit',
              display:'inline-flex', alignItems:'center', gap:8,
              boxShadow:'0 8px 18px -8px color-mix(in oklab, var(--chat) 70%, transparent)'}}>
              Continue →
            </button>
            <span style={{flex:1}}/>
            <button style={{padding:'10px 14px', height:42, borderRadius:8,
              border:'none', background:'transparent',
              color:'var(--muted-foreground)', fontSize:12.5,
              cursor:'pointer', fontFamily:'inherit',
              opacity:0.55, textDecoration:'underline',
              textUnderlineOffset:3}}>
              Skip for now
            </button>
          </div>
        </div>

        {/* Right — passphrase card */}
        <div>
          <div style={{
            padding:'20px 22px', background:'var(--card)',
            border:'1px solid var(--border-strong)', borderRadius:'var(--radius)',
            boxShadow:'0 12px 30px -10px rgba(0,0,0,0.4)',
          }}>
            <div style={{display:'flex', alignItems:'center',
              justifyContent:'space-between', marginBottom:14}}>
              <Mono style={{fontSize:9.5, letterSpacing:'0.12em',
                color:'var(--muted-foreground)', textTransform:'uppercase'}}>
                Passphrase · 24 words
              </Mono>
              <Mono style={{fontSize:9.5, padding:'1.5px 7px', borderRadius:4,
                background:'color-mix(in oklab, var(--success) 22%, transparent)',
                color:'var(--success)', letterSpacing:'0.08em', textTransform:'uppercase',
                fontWeight:600}}>strong</Mono>
            </div>

            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr',
              gap:'8px 10px'}}>
              {RECOVERY_WORDS.map((w,i) => (
                <div key={i} style={{
                  display:'flex', alignItems:'center', gap:9,
                  padding:'8px 10px', borderRadius:7,
                  background:'var(--muted)', border:'1px solid var(--border)',
                }}>
                  <Mono style={{fontSize:10, color:'var(--muted-foreground)',
                    letterSpacing:'0.06em', width:18, textAlign:'right',
                    flexShrink:0}}>{String(i+1).padStart(2,'0')}</Mono>
                  <Mono style={{fontSize:13, color:'var(--foreground)',
                    fontWeight:500}}>{w}</Mono>
                </div>
              ))}
            </div>

            <div style={{
              marginTop:14, padding:'10px 12px', borderRadius:8,
              background:'var(--muted)', display:'flex', alignItems:'center', gap:9,
              fontSize:11.5, color:'var(--muted-foreground)',
            }}>
              <span style={{color:'var(--muted-foreground)', display:'flex'}}>
                {Icons.lock}
              </span>
              <span>Made here on your device. We never see it.</span>
            </div>
          </div>
        </div>
      </div>
    </Artboard>
  );
}

function RowFact({ icon, title, body, tone }) {
  const c = tone === 'warning' ? 'var(--warning)' : 'var(--muted-foreground)';
  return (
    <div style={{display:'flex', gap:11, alignItems:'flex-start'}}>
      <span style={{
        width:22, height:22, borderRadius:5, flexShrink:0,
        background:`color-mix(in oklab, ${c} 18%, transparent)`,
        color:c, display:'flex', alignItems:'center', justifyContent:'center',
        fontFamily:'JetBrains Mono, monospace', fontSize:13, fontWeight:600,
      }}>{icon}</span>
      <div style={{flex:1, fontSize:12.5, color:'var(--foreground)', lineHeight:1.55}}>
        <Mono style={{fontSize:9.5, letterSpacing:'0.12em', color:c,
          textTransform:'uppercase', fontWeight:600,
          display:'block', marginBottom:2}}>{title}</Mono>
        <span style={{color:'var(--muted-foreground)'}}>{body}</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 2b · Recover history — enter passphrase on a new device
// Mirrors SecRecoveryKey (same layout, same word card) but inverted:
// the right card becomes a 24-slot input. Two states surfaced as separate
// artboards: empty (just-signed-in) and mid-entry (validation + one typo).
// ─────────────────────────────────────────────────────────────────────────

// Word list for the mid-entry state — first 22 match RECOVERY_WORDS,
// "marigld" is a typo (will flag), and the last two are blank.
const RECOVERY_INPUT_FILLED = [
  'lantern','river','eagle','copper','quartz','marigld',
  'orchid','steppe','pebble','almond','heron','chestnut',
  'cinder','pollen','garnet','silvan','mariner','tundra',
  'oasis','candle','furrow','dapple','','',
];

function WordSlot({ index, value, focused, status }) {
  // status: 'empty' | 'ok' | 'unknown' | 'focus'
  const isEmpty = !value;
  const borderColor =
    status === 'unknown' ? 'var(--warning)' :
    status === 'ok'      ? 'color-mix(in oklab, var(--chat) 30%, var(--border))' :
    focused              ? 'var(--chat)' :
    'var(--border)';
  const bg =
    status === 'unknown' ? 'color-mix(in oklab, var(--warning) 8%, var(--background))' :
    status === 'ok'      ? 'color-mix(in oklab, var(--chat) 5%, var(--background))' :
    'var(--background)';
  return (
    <div style={{
      display:'flex', alignItems:'center', gap:9,
      padding:'8px 10px', borderRadius:7,
      background: bg,
      border: `1px solid ${borderColor}`,
      boxShadow: focused ? '0 0 0 3px color-mix(in oklab, var(--chat) 16%, transparent)' : 'none',
      position:'relative',
    }}>
      <Mono style={{fontSize:10, color:'var(--muted-foreground)',
        letterSpacing:'0.06em', width:18, textAlign:'right',
        flexShrink:0}}>{String(index+1).padStart(2,'0')}</Mono>
      {isEmpty ? (
        focused ? (
          <span style={{
            width:1.5, height:13, background:'var(--chat)',
            animation:'pn-blink 1s steps(2) infinite', borderRadius:1,
          }}/>
        ) : (
          <Mono style={{fontSize:13, color:'color-mix(in oklab, var(--muted-foreground) 60%, transparent)',
            fontWeight:400, fontStyle:'italic'}}>—</Mono>
        )
      ) : (
        <Mono style={{fontSize:13, color:'var(--foreground)',
          fontWeight:500, flex:1, minWidth:0,
          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{value}</Mono>
      )}
      {status === 'unknown' && (
        <span style={{
          position:'absolute', top:-5, right:-5,
          width:14, height:14, borderRadius:'50%',
          background:'var(--warning)', color:'var(--background)',
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:10, fontWeight:700, fontFamily:'JetBrains Mono, monospace',
        }}>!</span>
      )}
      {status === 'ok' && !focused && (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
          stroke="var(--chat)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
          style={{flexShrink:0}}>
          <path d="M5 12l5 5 9-11"/>
        </svg>
      )}
    </div>
  );
}

function SecRecoverHistory() {
  return (
    <Artboard w={1200} h={780}>
      <div style={{padding:'40px 56px', height:'100%', overflow:'auto',
        display:'grid', gridTemplateColumns:'1.1fr 1fr', gap:36}}>
        {/* LEFT — copy */}
        <div>
          <div style={{display:'flex', alignItems:'center', gap:7,
            color:'var(--muted-foreground)', fontSize:12, marginBottom:14}}>
            <span>Sign in</span>
            <span style={{color:'var(--border-strong)'}}>›</span>
            <span>New device</span>
            <span style={{color:'var(--border-strong)'}}>›</span>
            <span style={{color:'var(--foreground)', fontWeight:500}}>Recover history</span>
          </div>

          {/* Welcome row — signed-in identity, this device */}
          <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:12,
            padding:'8px 12px 8px 8px', borderRadius:999, alignSelf:'flex-start',
            background:'color-mix(in oklab, var(--chat) 8%, var(--card))',
            border:'1px solid color-mix(in oklab, var(--chat) 28%, var(--border))',
            width:'fit-content'}}>
            <Avatar name="Alice" color="var(--chat)" size={26}/>
            <Mono style={{fontSize:11, color:'var(--foreground)', letterSpacing:'0.04em'}}>
              Welcome back, <span style={{color:'var(--chat)', fontWeight:600}}>Alice</span>
            </Mono>
            <span style={{width:3, height:3, borderRadius:'50%',
              background:'var(--border-strong)'}}/>
            <Mono style={{fontSize:10.5, color:'var(--muted-foreground)',
              letterSpacing:'0.04em'}}>iPhone 15 · just paired</Mono>
          </div>

          <Serif as="h1" style={{display:'block', fontSize:42, fontWeight:400,
            letterSpacing:'-0.02em', lineHeight:1.05, margin:'0 0 14px'}}>
            Pick up where you <em style={{fontStyle:'italic', color:'var(--chat)'}}>left off.</em>
          </Serif>

          <p style={{margin:'0 0 14px', color:'var(--foreground)',
            fontSize:14, lineHeight:1.65, maxWidth:520}}>
            Your old conversations are sealed on your other devices — only the 24 words
            you saved can unlock them here. Paste or type them once, and your messages,
            photos and rooms come right back.
          </p>

          <div style={{display:'flex', flexDirection:'column', gap:10, marginTop:18,
            maxWidth:540}}>
            <RowFact icon="↺" title="Bring everything back"
              body="Past chats, voice rooms you're in, the friends you've added. All restored on this device."/>
            <RowFact icon="✓" title="Faster: paste them all"
              body="Most password managers can paste the whole 24 words at once."/>
            <RowFact icon="?" title="Lost the passphrase?"
              body="You can still chat from this device — but messages from before today won't follow you here."
              tone="warning"/>
          </div>

          {/* Action row */}
          <div style={{display:'flex', gap:10, marginTop:28, alignItems:'center'}}>
            <button style={{padding:'12px 18px', height:46, borderRadius:10,
              border:'1px solid var(--chat)', background:'transparent',
              color:'var(--chat)', fontSize:13.5, fontWeight:600,
              cursor:'pointer', fontFamily:'inherit',
              display:'inline-flex', alignItems:'center', gap:8}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
                <rect x="8" y="2" width="8" height="4" rx="1"/>
                <path d="M9 14h6M9 18h4"/>
              </svg>
              Paste passphrase
            </button>
            <button disabled style={{padding:'12px 22px', height:46, borderRadius:10,
              border:'none', background:'color-mix(in oklab, var(--chat) 25%, transparent)',
              color:'color-mix(in oklab, var(--primary-foreground) 50%, transparent)',
              fontSize:13.5, fontWeight:600,
              cursor:'not-allowed', fontFamily:'inherit',
              display:'inline-flex', alignItems:'center', gap:8}}>
              Restore →
            </button>
            <span style={{flex:1}}/>
            <button style={{padding:'10px 14px', height:42, borderRadius:8,
              border:'none', background:'transparent',
              color:'var(--muted-foreground)', fontSize:12.5,
              cursor:'pointer', fontFamily:'inherit',
              opacity:0.65, textDecoration:'underline',
              textUnderlineOffset:3}}>
              Start fresh on this device
            </button>
          </div>
        </div>

        {/* RIGHT — empty input card */}
        <div>
          <div style={{
            padding:'20px 22px', background:'var(--card)',
            border:'1px solid var(--border-strong)', borderRadius:'var(--radius)',
            boxShadow:'0 12px 30px -10px rgba(0,0,0,0.4)',
          }}>
            <div style={{display:'flex', alignItems:'center',
              justifyContent:'space-between', marginBottom:14}}>
              <Mono style={{fontSize:9.5, letterSpacing:'0.12em',
                color:'var(--muted-foreground)', textTransform:'uppercase'}}>
                Your passphrase · 24 words
              </Mono>
              <Mono style={{fontSize:9.5, padding:'1.5px 7px', borderRadius:4,
                background:'var(--muted)', color:'var(--muted-foreground)',
                letterSpacing:'0.08em', textTransform:'uppercase',
                fontWeight:600}}>0 / 24</Mono>
            </div>

            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr',
              gap:'8px 10px'}}>
              {Array.from({length:24}).map((_,i) => (
                <WordSlot key={i} index={i} value=""
                  focused={i === 0}/>
              ))}
            </div>

            <div style={{
              marginTop:14, padding:'10px 12px', borderRadius:8,
              background:'var(--muted)', display:'flex', alignItems:'center', gap:9,
              fontSize:11.5, color:'var(--muted-foreground)',
            }}>
              <span style={{color:'var(--muted-foreground)', display:'flex'}}>
                {Icons.lock}
              </span>
              <span>Words are checked here on this device. We never see them.</span>
            </div>
          </div>
        </div>
      </div>
    </Artboard>
  );
}

// Same view, mid-entry: 22 words typed, 1 flagged as a typo, 2 still empty.
function SecRecoverHistoryEntering() {
  return (
    <Artboard w={1200} h={780}>
      <div style={{padding:'40px 56px', height:'100%', overflow:'auto',
        display:'grid', gridTemplateColumns:'1.1fr 1fr', gap:36}}>
        {/* LEFT — copy + inline correction prompt */}
        <div>
          <div style={{display:'flex', alignItems:'center', gap:7,
            color:'var(--muted-foreground)', fontSize:12, marginBottom:14}}>
            <span>Sign in</span>
            <span style={{color:'var(--border-strong)'}}>›</span>
            <span>New device</span>
            <span style={{color:'var(--border-strong)'}}>›</span>
            <span style={{color:'var(--foreground)', fontWeight:500}}>Recover history</span>
          </div>

          <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:12,
            padding:'8px 12px 8px 8px', borderRadius:999,
            background:'color-mix(in oklab, var(--chat) 8%, var(--card))',
            border:'1px solid color-mix(in oklab, var(--chat) 28%, var(--border))',
            width:'fit-content'}}>
            <Avatar name="Alice" color="var(--chat)" size={26}/>
            <Mono style={{fontSize:11, color:'var(--foreground)', letterSpacing:'0.04em'}}>
              Welcome back, <span style={{color:'var(--chat)', fontWeight:600}}>Alice</span>
            </Mono>
            <span style={{width:3, height:3, borderRadius:'50%',
              background:'var(--border-strong)'}}/>
            <Mono style={{fontSize:10.5, color:'var(--muted-foreground)',
              letterSpacing:'0.04em'}}>iPhone 15 · just paired</Mono>
          </div>

          <Serif as="h1" style={{display:'block', fontSize:42, fontWeight:400,
            letterSpacing:'-0.02em', lineHeight:1.05, margin:'0 0 14px'}}>
            Almost <em style={{fontStyle:'italic', color:'var(--chat)'}}>there.</em>
          </Serif>

          <p style={{margin:'0 0 14px', color:'var(--foreground)',
            fontSize:14, lineHeight:1.65, maxWidth:520}}>
            We've matched 21 of your 24 words. One looks like a typo, and two are still
            empty — finish those and we'll restore everything.
          </p>

          {/* Inline correction prompt */}
          <div style={{
            padding:'12px 14px', borderRadius:10, marginTop:6, maxWidth:540,
            background:'color-mix(in oklab, var(--warning) 7%, var(--background))',
            border:'1px solid color-mix(in oklab, var(--warning) 32%, var(--border))',
            display:'flex', gap:11, alignItems:'flex-start',
          }}>
            <span style={{color:'var(--warning)', flexShrink:0, marginTop:2}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
              </svg>
            </span>
            <div style={{flex:1, fontSize:12.5, color:'var(--foreground)', lineHeight:1.55}}>
              <Mono style={{fontSize:9.5, letterSpacing:'0.12em', color:'var(--warning)',
                textTransform:'uppercase', fontWeight:600,
                display:'block', marginBottom:3}}>Word 06 · not in the dictionary</Mono>
              <span>
                You wrote <Mono style={{color:'var(--warning)', fontWeight:600}}>marigld</Mono> —
                did you mean{' '}
                <button style={{padding:'2px 7px', borderRadius:5,
                  border:'1px solid var(--chat)', background:'transparent',
                  color:'var(--chat)', fontSize:11.5, fontWeight:600,
                  cursor:'pointer', fontFamily:'JetBrains Mono, monospace'}}>marigold</button>
                {' '}or{' '}
                <button style={{padding:'2px 7px', borderRadius:5,
                  border:'1px solid var(--border-strong)', background:'transparent',
                  color:'var(--muted-foreground)', fontSize:11.5,
                  cursor:'pointer', fontFamily:'JetBrains Mono, monospace'}}>marlin</button>
                ?
              </span>
            </div>
          </div>

          <div style={{display:'flex', flexDirection:'column', gap:10, marginTop:18,
            maxWidth:540}}>
            <RowFact icon="✓" title="What's ready"
              body="21 of 24 words match the dictionary. Two slots remain empty."/>
            <RowFact icon="↺" title="Take your time"
              body="Order matters — they must be in the same sequence you saved."/>
          </div>

          {/* Action row */}
          <div style={{display:'flex', gap:10, marginTop:24, alignItems:'center'}}>
            <button style={{padding:'12px 18px', height:46, borderRadius:10,
              border:'1px solid var(--border-strong)', background:'transparent',
              color:'var(--foreground)', fontSize:13.5, fontWeight:500,
              cursor:'pointer', fontFamily:'inherit',
              display:'inline-flex', alignItems:'center', gap:8}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              </svg>
              Clear all
            </button>
            <button disabled style={{padding:'12px 22px', height:46, borderRadius:10,
              border:'none', background:'color-mix(in oklab, var(--chat) 30%, transparent)',
              color:'color-mix(in oklab, var(--primary-foreground) 55%, transparent)',
              fontSize:13.5, fontWeight:600,
              cursor:'not-allowed', fontFamily:'inherit',
              display:'inline-flex', alignItems:'center', gap:8}}>
              Restore →
            </button>
            <span style={{flex:1}}/>
            <button style={{padding:'10px 14px', height:42, borderRadius:8,
              border:'none', background:'transparent',
              color:'var(--muted-foreground)', fontSize:12.5,
              cursor:'pointer', fontFamily:'inherit',
              opacity:0.65, textDecoration:'underline',
              textUnderlineOffset:3}}>
              Start fresh on this device
            </button>
          </div>
        </div>

        {/* RIGHT — partially filled input card */}
        <div>
          <div style={{
            padding:'20px 22px', background:'var(--card)',
            border:'1px solid var(--border-strong)', borderRadius:'var(--radius)',
            boxShadow:'0 12px 30px -10px rgba(0,0,0,0.4)',
          }}>
            <div style={{display:'flex', alignItems:'center',
              justifyContent:'space-between', marginBottom:14}}>
              <Mono style={{fontSize:9.5, letterSpacing:'0.12em',
                color:'var(--muted-foreground)', textTransform:'uppercase'}}>
                Your passphrase · 24 words
              </Mono>
              <Mono style={{fontSize:9.5, padding:'1.5px 7px', borderRadius:4,
                background:'color-mix(in oklab, var(--warning) 18%, transparent)',
                color:'var(--warning)', letterSpacing:'0.08em', textTransform:'uppercase',
                fontWeight:600}}>21 / 24 · 1 typo</Mono>
            </div>

            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr',
              gap:'8px 10px'}}>
              {RECOVERY_INPUT_FILLED.map((w, i) => {
                const focused = i === 22; // next empty cursor
                const status =
                  w === '' ? 'empty' :
                  w === 'marigld' ? 'unknown' :
                  'ok';
                return (
                  <WordSlot key={i} index={i} value={w}
                    focused={focused} status={status}/>
                );
              })}
            </div>

            <div style={{
              marginTop:14, padding:'10px 12px', borderRadius:8,
              background:'var(--muted)', display:'flex', alignItems:'center', gap:9,
              fontSize:11.5, color:'var(--muted-foreground)',
            }}>
              <span style={{color:'var(--muted-foreground)', display:'flex'}}>
                {Icons.lock}
              </span>
              <span>Words are checked here on this device. We never see them.</span>
            </div>
          </div>
        </div>
      </div>
    </Artboard>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 3 · Devices — Settings · Card grid + drill-in (variant C)
// Mirrors SettingsCardGrid: identity hero + 2-col tile grid on the left,
// drill-in editor on the right with "Editing · devices" header and a
// stacked device list sized for the narrower pane.
// ─────────────────────────────────────────────────────────────────────────
function SecDevicesSettings() {
  const devices = [
    { name:'MacBook Pro · Studio', kind:'laptop', fp:'7HQR-3DKM-9CTV-BWLS-2NPF',
      lastSeen:'Now', created:'14 May 2024', here:true },
    { name:'iPhone 15 · Personal', kind:'phone',  fp:'2KFW-8VXZ-Y7BE-Q5TN-RMHA',
      lastSeen:'12 min ago', created:'14 May 2024' },
    { name:'iPad mini · Reader',   kind:'tablet', fp:'P3LM-6CRT-5QHG-9DFW-XB2N',
      lastSeen:'4 days ago', created:'02 Jan 2025' },
    { name:'Mac mini · Home',      kind:'laptop', fp:'D9TS-2KMP-WX7V-NQHJ-58RY',
      lastSeen:'Signed out 18 Apr', created:'12 Mar 2024', revoked:true },
  ];
  const kindIcon = (k) => k === 'phone'
    ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/></svg>
    : k === 'tablet'
    ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M11 19h2"/></svg>
    : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="4" width="20" height="13" rx="2"/><path d="M2 20h20"/></svg>;

  return (
    <Artboard w={1200} h={780} style={{display:'flex'}}>
      {/* LEFT — landing grid (Card grid pattern from Settings C) */}
      <div style={{flex:1.05, padding:'30px 32px 28px', overflow:'auto',
        borderRight:'1px solid var(--border)'}}>
        <div style={{display:'flex', alignItems:'baseline', justifyContent:'space-between',
          marginBottom:22}}>
          <div>
            <Mono style={{fontSize:10, letterSpacing:'0.14em', color:'var(--muted-foreground)',
              textTransform:'uppercase', display:'block', marginBottom:5}}>— settings</Mono>
            <Serif style={{fontSize:28, fontWeight:400, letterSpacing:'-0.015em'}}>
              Adjust the room.
            </Serif>
          </div>
          <button style={{width:32, height:32, borderRadius:'var(--radius-sm)',
            border:'1px solid var(--border-strong)', background:'transparent',
            color:'var(--muted-foreground)', cursor:'pointer'}}>✕</button>
        </div>

        {/* identity tile */}
        <div style={{
          padding:'18px 20px', borderRadius:'var(--radius)',
          background:`linear-gradient(135deg,
            color-mix(in oklab, var(--chat) 14%, var(--card)),
            var(--card))`,
          border:'1px solid color-mix(in oklab, var(--chat) 25%, var(--border))',
          display:'flex', alignItems:'center', gap:16, marginBottom:14,
        }}>
          <div style={{position:'relative'}}>
            <Avatar name="Alice" color="var(--chat)" size={56}/>
            <div style={{position:'absolute', right:-2, bottom:-2, width:14, height:14,
              borderRadius:'50%', border:'3px solid var(--card)',
              background:'var(--success)'}}/>
          </div>
          <div style={{flex:1, minWidth:0}}>
            <Serif style={{fontSize:18, fontWeight:500, display:'block'}}>Alice Koa</Serif>
            <Mono style={{fontSize:10.5, color:'var(--muted-foreground)'}}>
              @Alice_Waбру · akasatana83@hotmail.fr
            </Mono>
          </div>
        </div>

        {/* tiles */}
        <div style={{display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:12}}>
          <SettingTile
            icon={Icons.sparkle} label="Profile"
            desc="Avatar, banner, bio, pronouns."
            preview={<span style={{fontStyle:'italic', fontFamily:'var(--serif), serif',
              fontSize:11.5, color:'var(--muted-foreground)'}}>“Designer at Kauai Studio…”</span>}
          />
          <SettingTile
            icon={Icons.lock} label="Privacy & safety"
            desc="Who can DM you, friend requests, blocked users."
            preview={<Mono style={{fontSize:10.5, color:'var(--success)'}}>● Friends-of-friends</Mono>}
          />
          <SettingTile
            icon={Icons.sun} label="Appearance"
            desc="Theme, density, font, accent."
            preview={<div style={{display:'flex', gap:4}}>
              {['var(--chat)','var(--voice)','var(--background)'].map((c,i)=>(
                <span key={i} style={{width:12, height:12, borderRadius:3, background:c,
                  border:'1px solid var(--border)'}}/>
              ))}
            </div>}
          />
          <SettingTile
            icon={Icons.bell} label="Notifications"
            desc="What pings you, when, and how loud."
            preview={<Mono style={{fontSize:10.5, color:'var(--voice)'}}>3 categories on</Mono>}
          />
          <SettingTile
            icon={Icons.headset} label="Voice & video"
            desc="Microphone, audio, push-to-talk."
            preview={<div style={{display:'inline-flex', gap:1.5, alignItems:'flex-end', height:8}}>
              {[0.4, 0.7, 0.5, 0.9, 0.6].map((h,i) => (
                <span key={i} style={{width:2, height:`${h*100}%`,
                  background:'var(--voice)', borderRadius:1}}/>
              ))}
            </div>}
          />
          <SettingTile
            icon={Icons.settings} label="Keybinds"
            desc="Shortcuts you can rewire."
            preview={<Mono style={{fontSize:10.5, color:'var(--muted-foreground)'}}>⌘K · ⌘\ · ⇧⌘M</Mono>}
          />
          {/* Devices tile — active */}
          <SettingTile
            icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="13" rx="2"/><path d="M2 20h20"/></svg>}
            label="Devices" active
            desc="Phones and laptops you're signed in on."
            preview={<Mono style={{fontSize:10.5, color:'var(--chat)'}}>3 active · 1 signed out</Mono>}
          />
          <SettingTile
            icon={Icons.lock} label="Sign out" danger
            desc="End this session on this device."
          />
        </div>

        <Mono style={{fontSize:10, color:'var(--muted-foreground)', display:'block',
          marginTop:18, textAlign:'right', letterSpacing:'0.06em'}}>
          Pīna'i v0.9 · kauai.pinai · ESC to close
        </Mono>
      </div>

      {/* RIGHT — drill-in (Devices) */}
      <div style={{flex:0.95, padding:'30px 32px', background:'var(--card)',
        display:'flex', flexDirection:'column', minWidth:0}}>
        {/* breadcrumb row — clearly its own line, generous spacing */}
        <div style={{display:'flex', alignItems:'center', gap:7,
          color:'var(--muted-foreground)', fontSize:12, marginBottom:14}}>
          <span>Settings</span>
          <span style={{color:'var(--border-strong)'}}>›</span>
          <span style={{color:'var(--foreground)', fontWeight:500}}>Devices</span>
        </div>

        <div style={{display:'flex', alignItems:'flex-start',
          justifyContent:'space-between', gap:12}}>
          <div style={{minWidth:0}}>
            <Serif as="h1" style={{margin:0, fontSize:34, fontWeight:400,
              letterSpacing:'-0.018em', lineHeight:1.1, color:'var(--foreground)'}}>
              Devices<em style={{fontStyle:'italic', color:'var(--chat)'}}>.</em>
            </Serif>
            <p style={{margin:'6px 0 0', color:'var(--muted-foreground)',
              fontSize:13, lineHeight:1.5, maxWidth:380}}>
              These are the places you're signed in to Pīna'i. Sign out anything that isn't you.
            </p>
          </div>
          <button style={{padding:'8px 12px', height:34, borderRadius:6,
            border:'none', background:'var(--chat)', color:'var(--primary-foreground)',
            fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit',
            display:'inline-flex', alignItems:'center', gap:6, flexShrink:0, whiteSpace:'nowrap',
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            Pair new
          </button>
        </div>

        <div style={{height:14}}/>

        {/* Recovery passphrase — visualization card.
            Replaces the stats row. Shows all 24 words inline so the user
            can re-read or transcribe them without leaving Devices. The whole
            card flips between "redacted" and "revealed" via the eye button;
            shown here in its revealed state. */}
        <div style={{
          padding:'14px 14px 12px', borderRadius:10,
          background:`linear-gradient(135deg,
            color-mix(in oklab, var(--chat) 10%, var(--card)),
            var(--card))`,
          border:'1px solid color-mix(in oklab, var(--chat) 28%, var(--border))',
          marginBottom:12,
        }}>
          <div style={{display:'flex', alignItems:'flex-start',
            justifyContent:'space-between', gap:10, marginBottom:10}}>
            <div style={{minWidth:0}}>
              <Mono style={{fontSize:9, letterSpacing:'0.14em',
                color:'var(--muted-foreground)', textTransform:'uppercase',
                display:'block', marginBottom:3}}>recovery passphrase · 24 words</Mono>
              <Serif style={{fontSize:14.5, fontWeight:500,
                color:'var(--foreground)', letterSpacing:'-0.005em'}}>
                Your key to past conversations<em style={{fontStyle:'italic',
                  color:'var(--chat)'}}>.</em>
              </Serif>
            </div>
            <div style={{display:'flex', alignItems:'center', gap:5,
              padding:'3px 8px', borderRadius:999,
              background:'color-mix(in oklab, var(--chat) 18%, transparent)',
              flexShrink:0}}>
              <span style={{width:5, height:5, borderRadius:'50%',
                background:'var(--chat)',
                animation:'pn-pulse 1.8s ease-in-out infinite'}}/>
              <Mono style={{fontSize:8.5, color:'var(--chat)',
                letterSpacing:'0.1em', textTransform:'uppercase',
                fontWeight:600}}>revealed</Mono>
            </div>
          </div>

          {/* 6 × 4 word grid — compact, mono, numbered.
              Tight enough to live under the title without pushing the
              device list off-screen. */}
          <div style={{display:'grid', gridTemplateColumns:'repeat(6, 1fr)',
            gap:'5px 5px'}}>
            {RECOVERY_WORDS.map((w,i) => (
              <div key={i} style={{
                display:'flex', alignItems:'center', gap:5,
                padding:'4px 6px', borderRadius:5,
                background:'var(--background)',
                border:'1px solid var(--border)',
                minWidth:0,
              }}>
                <Mono style={{fontSize:8.5, color:'var(--muted-foreground)',
                  letterSpacing:'0.05em', flexShrink:0}}>
                  {String(i+1).padStart(2,'0')}
                </Mono>
                <Mono style={{fontSize:10.5, color:'var(--foreground)',
                  fontWeight:500, overflow:'hidden', textOverflow:'ellipsis',
                  whiteSpace:'nowrap', minWidth:0}}>{w}</Mono>
              </div>
            ))}
          </div>

          {/* Action row — primary = hide, secondaries = copy/print, danger = rotate */}
          <div style={{display:'flex', alignItems:'center', gap:6,
            marginTop:11, flexWrap:'wrap'}}>
            <button style={{padding:'5px 9px', height:26, borderRadius:5,
              border:'1px solid var(--chat)', background:'var(--chat)',
              color:'var(--primary-foreground)', fontSize:11, fontWeight:600,
              cursor:'pointer', fontFamily:'inherit',
              display:'inline-flex', alignItems:'center', gap:5}}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                strokeLinejoin="round">
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/>
                <line x1="3" y1="21" x2="21" y2="3"/>
              </svg>
              Hide
            </button>
            <button style={{padding:'5px 9px', height:26, borderRadius:5,
              border:'1px solid var(--border-strong)', background:'transparent',
              color:'var(--foreground)', fontSize:11, cursor:'pointer',
              fontFamily:'inherit', display:'inline-flex',
              alignItems:'center', gap:5}}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
              Copy
            </button>
            <span style={{flex:1}}/>
            <Mono style={{fontSize:9.5, color:'var(--muted-foreground)',
              letterSpacing:'0.04em'}}>
              saved 14 May 2024
            </Mono>
          </div>

          {/* security band — same vocabulary as the onboarding card */}
          <div style={{
            marginTop:10, padding:'7px 9px', borderRadius:6,
            background:'color-mix(in oklab, var(--warning) 7%, transparent)',
            border:'1px solid color-mix(in oklab, var(--warning) 22%, var(--border))',
            display:'flex', alignItems:'center', gap:7,
            fontSize:10.5, color:'var(--muted-foreground)', lineHeight:1.4,
          }}>
            <span style={{color:'var(--warning)', display:'flex', flexShrink:0}}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"
                strokeLinejoin="round">
                <path d="M12 9v4M12 17h.01"/>
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              </svg>
            </span>
            <span>
              Anyone holding these words can sign in as you. Made here on your
              device — we never see them.
            </span>
          </div>
        </div>

        {/* device list — stacked cards */}
        <div style={{display:'flex', flexDirection:'column', gap:8, flex:1, minHeight:0,
          overflow:'auto'}}>
          {devices.map((d, i) => (
            <DeviceCard key={i} d={d}/>
          ))}
        </div>

        <Mono style={{fontSize:10.5, color:'var(--muted-foreground)',
          fontStyle:'italic', fontFamily:'var(--serif), serif',
          display:'block', marginTop:12, paddingTop:10,
          borderTop:'1px solid var(--border)', lineHeight:1.5}}>
          Don't recognize a device? Sign it out — your passphrase still works
          everywhere else.
        </Mono>
      </div>
    </Artboard>
  );
}

function DeviceCard({ d }) {
  const kindIcon = (k) => k === 'phone'
    ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/></svg>
    : k === 'tablet'
    ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M11 19h2"/></svg>
    : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="4" width="20" height="13" rx="2"/><path d="M2 20h20"/></svg>;

  return (
    <div style={{
      padding:'12px 14px', borderRadius:10,
      background: d.here
        ? 'color-mix(in oklab, var(--chat) 8%, var(--background))'
        : 'var(--background)',
      border: d.here
        ? '1px solid color-mix(in oklab, var(--chat) 30%, var(--border))'
        : '1px solid var(--border)',
      opacity: d.revoked ? 0.55 : 1,
    }}>
      <div style={{display:'flex', alignItems:'center', gap:11}}>
        <span style={{width:32, height:32, borderRadius:7,
          background: d.here ? 'var(--chat)' : 'var(--muted)',
          color: d.here ? 'var(--primary-foreground)' : 'var(--foreground)',
          display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
        }}>{kindIcon(d.kind)}</span>
        <div style={{flex:1, minWidth:0}}>
          <div style={{display:'flex', alignItems:'center', gap:7, flexWrap:'wrap'}}>
            <Serif style={{fontSize:13.5, fontWeight:500,
              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
              {d.name}
            </Serif>
            {d.here && (
              <Mono style={{fontSize:9, padding:'1px 6px', borderRadius:4,
                background:'color-mix(in oklab, var(--chat) 22%, transparent)',
                color:'var(--chat)', letterSpacing:'0.08em', textTransform:'uppercase'}}>
                this device
              </Mono>
            )}
            {d.revoked && (
              <Mono style={{fontSize:9, padding:'1px 6px', borderRadius:4,
                background:'var(--muted)', color:'var(--muted-foreground)',
                letterSpacing:'0.08em', textTransform:'uppercase'}}>
                signed out
              </Mono>
            )}
          </div>
          <div style={{display:'flex', alignItems:'center', gap:8, marginTop:3}}>
            <span style={{fontSize:11, display:'flex', alignItems:'center', gap:5,
              color: d.lastSeen === 'Now' ? 'var(--success)' : 'var(--muted-foreground)'}}>
              {d.lastSeen === 'Now' && (
                <span style={{width:5, height:5, borderRadius:'50%',
                  background:'var(--success)',
                  animation:'pn-pulse 1.6s ease-in-out infinite'}}/>
              )}
              {d.lastSeen}
            </span>
            <span style={{color:'var(--border-strong)'}}>·</span>
            <Mono style={{fontSize:10.5, color:'var(--muted-foreground)'}}>
              paired {d.created}
            </Mono>
          </div>
        </div>
        {!d.revoked && (
          <button style={{padding:'5px 10px', height:28, borderRadius:6,
            border: d.here ? '1px solid var(--border)' : '1px solid var(--destructive)',
            background:'transparent',
            color: d.here ? 'var(--muted-foreground)' : 'var(--destructive)',
            fontSize:11, cursor:'pointer', fontFamily:'inherit', flexShrink:0}}>
            {d.here ? 'Sign out' : 'Sign out'}
          </button>
        )}
      </div>
    </div>
  );
}

function SettingTile({ icon, label, desc, preview, active, danger }) {
  return (
    <div style={{
      padding:'14px 14px 12px', borderRadius:'var(--radius)',
      background: active ? 'color-mix(in oklab, var(--chat) 10%, var(--card))' : 'var(--card)',
      border: active
        ? '1px solid color-mix(in oklab, var(--chat) 35%, var(--border))'
        : '1px solid var(--border)',
      cursor:'pointer', display:'flex', flexDirection:'column', gap:6,
      minHeight:88,
    }}>
      <div style={{display:'flex', alignItems:'center', gap:8}}>
        <span style={{
          width:26, height:26, borderRadius:6,
          display:'flex', alignItems:'center', justifyContent:'center',
          background: active ? 'var(--chat)' : 'var(--muted)',
          color: active ? 'var(--primary-foreground)'
            : danger ? 'var(--destructive)' : 'var(--muted-foreground)',
        }}>{icon}</span>
        <Serif style={{fontSize:13.5, fontWeight:500,
          color: danger ? 'var(--destructive)' : 'var(--foreground)'}}>{label}</Serif>
        <div style={{flex:1}}/>
        {active && <span style={{color:'var(--chat)', fontSize:14}}>›</span>}
      </div>
      <div style={{fontSize:11.5, color:'var(--muted-foreground)', lineHeight:1.45}}>{desc}</div>
      {preview && <div style={{marginTop:'auto', paddingTop:4}}>{preview}</div>}
    </div>
  );
}


function NavRow({ label, active }) {
  return (
    <div style={{
      padding:'8px 12px', borderRadius:6,
      fontSize:13, fontWeight: active ? 500 : 400,
      color: active ? 'var(--foreground)' : 'var(--muted-foreground)',
      background: active ? 'var(--accent)' : 'transparent',
      cursor:'pointer',
      borderLeft: active ? '2px solid var(--chat)' : '2px solid transparent',
      paddingLeft: active ? 10 : 12,
    }}>{label}</div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 4 · Pairing — QR display (mobile)
// ─────────────────────────────────────────────────────────────────────────
function SecPairQrMobile() {
  return (
    <IOSDevice width={390} height={844} dark>
      <div style={{
        height:'100%', background:'var(--background)', color:'var(--foreground)',
        fontFamily:'Geist, ui-sans-serif, system-ui, sans-serif',
        position:'relative', paddingTop:54,
        display:'flex', flexDirection:'column',
      }}>
        <div style={{padding:'4px 14px 14px', display:'flex', alignItems:'center', gap:10,
          borderBottom:'1px solid var(--border)'}}>
          <button style={{width:44, height:44, borderRadius:'50%', border:'none',
            background:'transparent', color:'var(--foreground)', cursor:'pointer',
            display:'flex', alignItems:'center', justifyContent:'center'}}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 6-6 6 6 6"/>
            </svg>
          </button>
          <div style={{flex:1}}>
            <Serif style={{fontSize:18, fontWeight:500, lineHeight:1.15}}>Pair a device</Serif>
            <Mono style={{fontSize:10, color:'var(--muted-foreground)', display:'block',
              marginTop:1, letterSpacing:'0.04em'}}>show this code on your other device</Mono>
          </div>
          <Mono style={{fontSize:10, padding:'2px 7px', borderRadius:4,
            background:'color-mix(in oklab, var(--chat) 22%, transparent)',
            color:'var(--chat)', letterSpacing:'0.08em',
            textTransform:'uppercase', fontWeight:600}}>3:42</Mono>
        </div>

        <div style={{flex:1, padding:'24px 24px',
          display:'flex', flexDirection:'column', alignItems:'center'}}>
          <Mono style={{fontSize:9.5, letterSpacing:'0.14em',
            color:'var(--muted-foreground)', textTransform:'uppercase',
            display:'block', marginBottom:6}}>Step 1 of 2</Mono>
          <Serif style={{fontSize:24, fontWeight:400, letterSpacing:'-0.015em',
            textAlign:'center', lineHeight:1.15, maxWidth:300}}>
            Scan with your other<br/>
            <em style={{fontStyle:'italic', color:'var(--chat)'}}>signed-in</em> device.
          </Serif>

          <div style={{
            marginTop:24, padding:18, background:'var(--card)',
            border:'1px solid var(--border-strong)', borderRadius:18,
            position:'relative',
            boxShadow:'0 18px 40px -10px rgba(0,0,0,0.5)',
          }}>
            <QRPlate size={240} accent="var(--foreground)" bg="var(--card)"/>
            {[[0,0,0],[1,0,90],[1,1,180],[0,1,270]].map(([x,y,r],k) => (
              <span key={k} style={{
                position:'absolute',
                top: y ? 'auto' : -2, bottom: y ? -2 : 'auto',
                left: x ? 'auto' : -2, right: x ? -2 : 'auto',
                width:18, height:18,
                borderTop:'2.5px solid var(--chat)',
                borderLeft:'2.5px solid var(--chat)',
                transform:`rotate(${r}deg)`, transformOrigin:'center',
              }}/>
            ))}
          </div>

          <div style={{marginTop:22, textAlign:'center'}}>
            <Mono style={{fontSize:9.5, letterSpacing:'0.14em',
              color:'var(--muted-foreground)', textTransform:'uppercase',
              display:'block', marginBottom:6}}>or enter code manually</Mono>
            <Mono style={{fontSize:22, fontWeight:600, color:'var(--foreground)',
              letterSpacing:'0.18em', display:'block'}}>9K3 · 7QM · 4WB</Mono>
          </div>

          <div style={{
            marginTop:22, padding:'12px 14px', borderRadius:12,
            background:'var(--muted)', border:'1px solid var(--border)',
            display:'flex', alignItems:'center', gap:10, alignSelf:'stretch',
          }}>
            <span style={{width:22, height:22, borderRadius:'50%',
              background:'color-mix(in oklab, var(--chat) 22%, transparent)',
              color:'var(--chat)', display:'flex', alignItems:'center',
              justifyContent:'center', flexShrink:0}}>
              <span style={{width:8, height:8, borderRadius:'50%', background:'var(--chat)',
                animation:'pn-pulse 1.4s ease-in-out infinite'}}/>
            </span>
            <div style={{flex:1, minWidth:0}}>
              <Mono style={{fontSize:11, color:'var(--foreground)',
                letterSpacing:'0.04em', display:'block'}}>Waiting for scan…</Mono>
              <Mono style={{fontSize:10, color:'var(--muted-foreground)',
                display:'block', marginTop:1}}>iPhone 15 · 14 min ago, 4 km</Mono>
            </div>
          </div>
        </div>

        <div style={{padding:'10px 14px', paddingBottom:36}}>
          <button style={{width:'100%', height:46, borderRadius:'var(--radius)',
            border:'1px solid var(--border-strong)', background:'transparent',
            color:'var(--foreground)', fontSize:13, cursor:'pointer', fontFamily:'inherit'}}>
            Cancel pairing
          </button>
        </div>
      </div>
    </IOSDevice>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 5 · Pairing — Scanner (mobile)
// ─────────────────────────────────────────────────────────────────────────
function SecPairScanMobile() {
  return (
    <IOSDevice width={390} height={844} dark>
      <div style={{
        height:'100%', background:'#0b0b0a', color:'#eae7df',
        fontFamily:'Geist, ui-sans-serif, system-ui, sans-serif',
        position:'relative', paddingTop:54, overflow:'hidden',
      }}>
        <div style={{position:'absolute', inset:0,
          background:`
            radial-gradient(360px 240px at 50% 40%, oklch(0.20 0.01 200), oklch(0.08 0.005 200)),
            repeating-linear-gradient(45deg, oklch(0.10 0.005 200) 0 2px, oklch(0.09 0.005 200) 2px 4px)
          `, opacity:0.95}}/>
        <div style={{position:'absolute', top:'50%', left:'50%',
          transform:'translate(-50%, -50%)', opacity:0.32}}>
          <QRPlate size={220} accent="#cfcab8" bg="#1a1714"/>
        </div>

        <div style={{position:'relative', zIndex:2,
          padding:'4px 14px 14px', display:'flex', alignItems:'center', gap:10}}>
          <button style={{width:44, height:44, borderRadius:'50%', border:'none',
            background:'rgba(0,0,0,0.45)', backdropFilter:'blur(20px)',
            color:'#fff', cursor:'pointer',
            display:'flex', alignItems:'center', justifyContent:'center'}}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 6-6 6 6 6"/>
            </svg>
          </button>
          <div style={{flex:1}}>
            <Serif style={{fontSize:17, fontWeight:500, color:'#fff'}}>Scan to pair</Serif>
            <Mono style={{fontSize:10, color:'rgba(255,255,255,0.7)', letterSpacing:'0.04em',
              display:'block', marginTop:1}}>point at the code on your other device</Mono>
          </div>
        </div>

        <div style={{
          position:'absolute', top:'46%', left:'50%',
          transform:'translate(-50%, -50%)',
          width:260, height:260, zIndex:2,
        }}>
          {[[0,0,0],[1,0,90],[1,1,180],[0,1,270]].map(([x,y,r],k) => (
            <span key={k} style={{
              position:'absolute',
              top: y ? 'auto' : 0, bottom: y ? 0 : 'auto',
              left: x ? 'auto' : 0, right: x ? 0 : 'auto',
              width:36, height:36,
              borderTop:'3px solid var(--chat)',
              borderLeft:'3px solid var(--chat)',
              transform:`rotate(${r}deg)`, transformOrigin:'center',
            }}/>
          ))}
          <div style={{
            position:'absolute', left:6, right:6, top:'48%', height:2,
            background:`linear-gradient(90deg, transparent, var(--chat), transparent)`,
            boxShadow:'0 0 12px var(--chat)',
            animation:'pn-fade-in 1.6s ease-in-out infinite',
          }}/>
        </div>

        <Mono style={{
          position:'absolute', top:'46%', left:'50%',
          transform:'translate(-50%, calc(-50% + 152px))',
          zIndex:2, fontSize:11, padding:'5px 11px', borderRadius:14,
          background:'rgba(0,0,0,0.55)', backdropFilter:'blur(8px)',
          color:'rgba(255,255,255,0.85)', letterSpacing:'0.08em',
          textTransform:'uppercase', fontWeight:500,
        }}>looking for code…</Mono>

        <div style={{
          position:'absolute', left:0, right:0, bottom:0, zIndex:3,
          background:'rgba(0,0,0,0.55)', backdropFilter:'blur(20px)',
          borderTopLeftRadius:24, borderTopRightRadius:24,
          padding:'18px 22px', paddingBottom:42, color:'#fff',
        }}>
          <Mono style={{fontSize:9.5, letterSpacing:'0.14em',
            color:'rgba(255,255,255,0.6)', textTransform:'uppercase',
            display:'block', marginBottom:8}}>or pair manually</Mono>
          <div style={{
            display:'flex', alignItems:'center', gap:10, padding:'0 14px', height:48,
            background:'rgba(255,255,255,0.08)', borderRadius:12,
            border:'1px solid rgba(255,255,255,0.12)',
          }}>
            <Mono style={{fontSize:13, color:'rgba(255,255,255,0.55)',
              letterSpacing:'0.18em'}}>9K3 · 7QM · 4WB</Mono>
            <span style={{flex:1}}/>
            <Mono style={{fontSize:9.5, color:'rgba(255,255,255,0.5)',
              letterSpacing:'0.06em'}}>9 chars</Mono>
          </div>
          <button style={{
            marginTop:10, width:'100%', height:46, borderRadius:'var(--radius)',
            border:'none', background:'var(--chat)',
            color:'var(--primary-foreground)', fontSize:13, fontWeight:600,
            cursor:'pointer', fontFamily:'inherit',
          }}>Verify code</button>
        </div>
      </div>
    </IOSDevice>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 6 · Encrypted-badge specimens
// ─────────────────────────────────────────────────────────────────────────
function SecBadgeSpecimens() {
  return (
    <Artboard w={1200} h={760}>
      <div style={{padding:'40px 56px', height:'100%', display:'flex',
        flexDirection:'column', overflow:'auto'}}>
        <div style={{marginBottom:22}}>
          <Mono style={{fontSize:10, letterSpacing:'0.14em',
            color:'var(--muted-foreground)', textTransform:'uppercase'}}>
            — Component · Encrypted badge
          </Mono>
          <Serif style={{fontSize:30, fontWeight:400, letterSpacing:'-0.02em',
            margin:'8px 0 6px', lineHeight:1.05}}>
            Visible, not <em style={{fontStyle:'italic', color:'var(--muted-foreground)'}}>noisy.</em>
          </Serif>
          <p style={{margin:0, color:'var(--muted-foreground)', fontSize:13,
            maxWidth:680, lineHeight:1.55}}>
            Always-on padlock mark — calm green for friends, neutral for trusted strangers,
            amber when context flags caution. Never blocks; only informs.
          </p>
        </div>

        <div style={{display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:14,
          marginBottom:18}}>
          {[
            {tone:'success', label:'With a friend',
              sub:'Encryption is invisible — locked, no chrome.', ok:true,
              chip:<CautionChip tone="success" label="friend"/>},
            {tone:'warning', label:'With a non-friend',
              sub:'Subtle "unverified" hint inline.', ok:false,
              chip:<CautionChip label="unverified"/>},
          ].map(s => (
            <div key={s.tone} style={{
              padding:'14px 16px', borderRadius:'var(--radius)',
              background:'var(--card)',
              border: s.tone === 'warning'
                ? '1px solid color-mix(in oklab, var(--warning) 30%, var(--border))'
                : '1px solid var(--border)',
            }}>
              <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:6}}>
                <SecLockMark size={22} ok={s.ok}/>
                <Serif style={{fontSize:14, fontWeight:500}}>{s.label}</Serif>
                <span style={{flex:1}}/>
                {s.chip}
              </div>
              <Mono style={{fontSize:10.5, color:'var(--muted-foreground)',
                lineHeight:1.5}}>{s.sub}</Mono>
            </div>
          ))}
        </div>

        <Mono style={{fontSize:9.5, letterSpacing:'0.14em',
          color:'var(--muted-foreground)', textTransform:'uppercase',
          display:'block', marginBottom:10}}>In context</Mono>

        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14}}>
          {/* Channel header */}
          <div style={{padding:'12px 14px', borderRadius:10,
            background:'var(--card)', border:'1px solid var(--border)'}}>
            <Mono style={{fontSize:9.5, letterSpacing:'0.12em',
              color:'var(--muted-foreground)', textTransform:'uppercase',
              display:'block', marginBottom:10}}>Channel header</Mono>
            <div style={{display:'flex', alignItems:'center', gap:10,
              padding:'10px 14px', background:'var(--background)',
              borderRadius:8, border:'1px solid var(--border)'}}>
              <span style={{color:'var(--muted-foreground)'}}>{Icons.hash}</span>
              <Serif style={{fontSize:14, fontWeight:500}}>design-lab</Serif>
              <span style={{height:12, width:1, background:'var(--border)'}}/>
              <SecLockMark size={16}/>
              <span style={{flex:1}}/>
              <Mono style={{fontSize:10, color:'var(--muted-foreground)'}}>14 members</Mono>
            </div>
          </div>

          {/* DM header */}
          <div style={{padding:'12px 14px', borderRadius:10,
            background:'var(--card)', border:'1px solid var(--border)'}}>
            <Mono style={{fontSize:9.5, letterSpacing:'0.12em',
              color:'var(--muted-foreground)', textTransform:'uppercase',
              display:'block', marginBottom:10}}>DM with friend</Mono>
            <div style={{display:'flex', alignItems:'center', gap:10,
              padding:'10px 14px', background:'var(--background)',
              borderRadius:8, border:'1px solid var(--border)'}}>
              <Avatar name="Maia" color="oklch(0.72 0.07 330)" size={26}/>
              <Serif style={{fontSize:14, fontWeight:500}}>Maia</Serif>
              <SecLockMark size={16}/>
            </div>
          </div>

          {/* Message bubble */}
          <div style={{padding:'12px 14px', borderRadius:10,
            background:'var(--card)', border:'1px solid var(--border)'}}>
            <Mono style={{fontSize:9.5, letterSpacing:'0.12em',
              color:'var(--muted-foreground)', textTransform:'uppercase',
              display:'block', marginBottom:10}}>Message bubble</Mono>
            <div style={{display:'flex', gap:10, alignItems:'flex-start'}}>
              <Avatar name="Maia" color="oklch(0.72 0.07 330)" size={28}/>
              <div>
                <div style={{display:'flex', alignItems:'center', gap:7, marginBottom:3}}>
                  <Serif style={{fontSize:13, fontWeight:500}}>Maia</Serif>
                  <Mono style={{fontSize:10, color:'var(--muted-foreground)'}}>14:02</Mono>
                </div>
                <div style={{padding:'8px 12px', borderRadius:'10px 14px 14px 14px',
                  background:'var(--muted)', fontSize:13, maxWidth:280}}>
                  Sent the lantern proto — let me know what you think.
                </div>
              </div>
            </div>
          </div>

          {/* Conversation list — non-friend */}
          <div style={{padding:'12px 14px', borderRadius:10,
            background:'var(--card)', border:'1px solid var(--border)'}}>
            <Mono style={{fontSize:9.5, letterSpacing:'0.12em',
              color:'var(--muted-foreground)', textTransform:'uppercase',
              display:'block', marginBottom:10}}>Conversation list · non-friend</Mono>
            <div style={{display:'flex', alignItems:'center', gap:10,
              padding:'10px 12px', borderRadius:8,
              background:'var(--background)',
              border:'1px solid color-mix(in oklab, var(--warning) 25%, var(--border))'}}>
              <Avatar name="Pierre" color="oklch(0.74 0.06 30)" size={32}/>
              <div style={{flex:1, minWidth:0}}>
                <div style={{display:'flex', alignItems:'center', gap:6}}>
                  <Serif style={{fontSize:13.5, fontWeight:500}}>Pierre</Serif>
                  <CautionChip label="unverified"/>
                </div>
                <Mono style={{fontSize:11, color:'var(--muted-foreground)',
                  display:'block', marginTop:2}}>pierre@mft.example · stranger</Mono>
              </div>
              <SecLockMark size={16} ok={false}/>
            </div>
          </div>
        </div>

        {/* Hover detail */}
        <Mono style={{fontSize:9.5, letterSpacing:'0.14em',
          color:'var(--muted-foreground)', textTransform:'uppercase',
          display:'block', marginBottom:10}}>Hover · expanded detail</Mono>
        <div style={{maxWidth:420, padding:'14px 16px', borderRadius:12,
          background:'var(--popover)', border:'1px solid var(--border-strong)',
          boxShadow:'0 18px 36px -10px rgba(0,0,0,0.4)'}}>
          <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:10}}>
            <SecLockMark size={26}/>
            <div>
              <Mono style={{fontSize:9.5, letterSpacing:'0.12em', color:'var(--success)',
                fontWeight:600, textTransform:'uppercase'}}>End-to-end encrypted</Mono>
              <Serif style={{fontSize:14, fontWeight:500, display:'block'}}>
                With Maia · friend since May 2024
              </Serif>
            </div>
          </div>
          <div style={{display:'flex', flexDirection:'column', gap:6,
            paddingTop:10, borderTop:'1px solid var(--border)'}}>
            {[
              ['Encryption','On for everyone in this chat'],
              ['Their device','iPhone 15 · last seen 2m ago'],
              ['What we see','Only when messages are sent — not their contents'],
            ].map(([k, v]) => (
              <div key={k} style={{display:'flex', gap:14, fontSize:11.5}}>
                <Mono style={{color:'var(--muted-foreground)',
                  letterSpacing:'0.06em', minWidth:90}}>{k}</Mono>
                <Mono style={{color:'var(--foreground)', flex:1, minWidth:0,
                  overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{v}</Mono>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Artboard>
  );
}

// ─────────────────────────────────────────────────────────────────
// SecTitleStyles — six header compositions for picking a standard.
// Same content ("Devices" section header) treated six ways so the
// difference is purely compositional, not lexical.
// ─────────────────────────────────────────────────────────────────
function SecTitleStyles() {
  const Frame = ({ tag, title, desc, children }) => (
    <div style={{
      padding:'26px 28px 24px', borderRadius:'var(--radius)',
      background:'var(--card)', border:'1px solid var(--border)',
      display:'flex', flexDirection:'column', gap:14, minHeight:200,
    }}>
      <div style={{display:'flex', alignItems:'baseline', gap:10}}>
        <Mono style={{fontSize:10, color:'var(--muted-foreground)',
          letterSpacing:'0.14em', textTransform:'uppercase'}}>{tag}</Mono>
        <span style={{fontSize:11, color:'var(--foreground)', fontWeight:500}}>{title}</span>
        <span style={{fontSize:11, color:'var(--muted-foreground)', flex:1,
          borderBottom:'1px dashed var(--border)', transform:'translateY(-3px)'}}/>
        <span style={{fontSize:10.5, color:'var(--muted-foreground)'}}>{desc}</span>
      </div>
      <div style={{flex:1, minHeight:0}}>{children}</div>
    </div>
  );

  return (
    <div style={{
      padding:'28px 32px', background:'var(--background)', color:'var(--foreground)',
      width:'100%', height:'100%', overflow:'auto',
      fontFamily:'Geist, ui-sans-serif, system-ui, sans-serif',
    }}>
      <div style={{marginBottom:22}}>
        <Mono style={{fontSize:10, color:'var(--muted-foreground)',
          letterSpacing:'0.14em', textTransform:'uppercase'}}>Specimens · title composition</Mono>
        <h1 style={{margin:'6px 0 4px', fontSize:22, fontWeight:500,
          letterSpacing:'-0.012em'}}>Pick a header pattern</h1>
        <p style={{margin:0, color:'var(--muted-foreground)', fontSize:13, maxWidth:580}}>
          Same content, six compositions. The eyebrow + italic-clause pattern reads
          as broken when the two parts aren't grammatically continuous — these
          alternatives keep the editorial tone without that mismatch.
        </p>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>

        {/* A — Sans H1 + subtitle (cleanest, recommended for settings) */}
        <Frame tag="A" title="Sans title + subtitle" desc="Settings · recommended">
          <h1 style={{margin:0, fontSize:26, fontWeight:500, letterSpacing:'-0.015em',
            lineHeight:1.15}}>Devices</h1>
          <p style={{margin:'6px 0 0', color:'var(--muted-foreground)',
            fontSize:13, lineHeight:1.5, maxWidth:380}}>
            These are the places you're signed in to Pīna'i. Sign out anything that isn't you.
          </p>
        </Frame>

        {/* B — Breadcrumb + sans title (drill-in context) */}
        <Frame tag="B" title="Breadcrumb + title" desc="Drill-in screens">
          <div style={{display:'flex', alignItems:'center', gap:7,
            color:'var(--muted-foreground)', fontSize:12, marginBottom:8}}>
            <span>Settings</span>
            <span style={{color:'var(--border-strong)'}}>›</span>
            <span style={{color:'var(--foreground)', fontWeight:500}}>Devices</span>
          </div>
          <h1 style={{margin:0, fontSize:24, fontWeight:500, letterSpacing:'-0.012em',
            lineHeight:1.15}}>Devices</h1>
          <p style={{margin:'6px 0 0', color:'var(--muted-foreground)',
            fontSize:13, lineHeight:1.5, maxWidth:380}}>
            Every phone and laptop signed in to your account.
          </p>
        </Frame>

        {/* C — Pure serif statement (editorial, no eyebrow) */}
        <Frame tag="C" title="Serif statement" desc="Marketing · hero moments">
          <Serif style={{fontSize:36, fontWeight:300, letterSpacing:'-0.02em',
            lineHeight:1.05, display:'block'}}>
            Devices<em style={{fontStyle:'italic', color:'var(--chat)'}}>.</em>
          </Serif>
          <p style={{margin:'10px 0 0', color:'var(--muted-foreground)',
            fontSize:13, lineHeight:1.5, maxWidth:380}}>
            Where you're signed in. Sign out any you don't recognize.
          </p>
        </Frame>

        {/* D — Numbered section (editorial, table-of-contents feel) */}
        <Frame tag="D" title="Numbered section" desc="Long-form preferences">
          <div style={{display:'flex', alignItems:'baseline', gap:14}}>
            <Mono style={{fontSize:13, color:'var(--muted-foreground)',
              letterSpacing:'0.02em'}}>03 /</Mono>
            <div style={{minWidth:0, flex:1}}>
              <h1 style={{margin:0, fontSize:24, fontWeight:500, letterSpacing:'-0.012em',
                lineHeight:1.15}}>Devices</h1>
              <p style={{margin:'4px 0 0', color:'var(--muted-foreground)',
                fontSize:13, lineHeight:1.5, maxWidth:340}}>
                Every phone and laptop signed in to your account.
              </p>
            </div>
          </div>
        </Frame>

        {/* E — Self-contained italic line (the "poetic" style done right) */}
        <Frame tag="E" title="Self-contained italic" desc="When a sentence works">
          <Serif style={{fontSize:24, fontWeight:400, letterSpacing:'-0.01em',
            lineHeight:1.2, display:'block', maxWidth:480}}>
            These are the places you're <em style={{fontStyle:'italic',
              color:'var(--chat)'}}>signed in</em> from.
          </Serif>
          <p style={{margin:'12px 0 0', color:'var(--muted-foreground)',
            fontSize:12.5, lineHeight:1.55, maxWidth:380}}>
            One coherent sentence — eyebrow removed because it duplicated context.
          </p>
        </Frame>

        {/* F — Split rule (eyebrow gets its own band, then a big title) */}
        <Frame tag="F" title="Rule + title" desc="Section dividers in long forms">
          <div style={{display:'flex', alignItems:'center', gap:10,
            paddingBottom:10, borderBottom:'1px solid var(--border)', marginBottom:10}}>
            <Mono style={{fontSize:10, color:'var(--muted-foreground)',
              letterSpacing:'0.14em', textTransform:'uppercase'}}>Settings · section 03</Mono>
            <span style={{flex:1}}/>
            <Mono style={{fontSize:10, color:'var(--muted-foreground)'}}>3 active · 1 revoked</Mono>
          </div>
          <h1 style={{margin:0, fontSize:26, fontWeight:500, letterSpacing:'-0.015em',
            lineHeight:1.1}}>Devices</h1>
        </Frame>

      </div>

      {/* recommendation strip */}
      <div style={{marginTop:18, padding:'14px 16px', borderRadius:'var(--radius)',
        background:'color-mix(in oklch, var(--chat) 8%, transparent)',
        border:'1px solid color-mix(in oklch, var(--chat) 28%, transparent)',
        display:'flex', alignItems:'flex-start', gap:12,
      }}>
        <div style={{width:6, height:6, borderRadius:'50%', background:'var(--chat)',
          marginTop:7, flexShrink:0}}/>
        <div>
          <div style={{fontSize:12.5, fontWeight:500, marginBottom:2}}>
            Default applied to Devices drill-in: <Mono style={{fontSize:11.5, color:'var(--chat)'}}>B · breadcrumb + title</Mono>
          </div>
          <p style={{margin:0, fontSize:12, color:'var(--muted-foreground)', lineHeight:1.5}}>
            Tell me which you prefer and I'll standardize it across Settings,
            Recovery, Pairing, and the rest of the screens.
          </p>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, {
  SecSubtleWarnings, SecRecoveryKey,
  SecRecoverHistory, SecRecoverHistoryEntering,
  SecDevicesSettings,
  SecPairQrMobile, SecPairScanMobile, SecBadgeSpecimens,
  SecTitleStyles,
});
