// Screen: 404 — Off the trail.
// Three desktop directions + a mobile variant, all sharing the project's
// editorial chrome (PronounceBadge · v2.0.4 top-left; meta top-right).
//
// A · Editorial split    — matches sign-in / verify-email composition.
// B · Centered cartography — topographic contours + giant serif 404.
// C · Server log         — terminal-flavored trace, code-aesthetic.
// Mobile · A condensed take for phone-sized errors.

const LOST_URL = '/voice/kauai/the-summit-room/2024-11-07';

// ── Shared decor ────────────────────────────────────────────────────────
function NFBackdrop() {
  return (
    <>
      <div style={{
        position:'absolute', inset:0,
        backgroundImage:`
          radial-gradient(900px 500px at 70% 18%, color-mix(in oklab, var(--chat) 9%, transparent), transparent 60%),
          radial-gradient(700px 500px at 18% 110%, color-mix(in oklab, var(--voice) 8%, transparent), transparent 55%)
        `,
      }}/>
      <div style={{
        position:'absolute', inset:0, opacity:0.035, mixBlendMode:'overlay', pointerEvents:'none',
        backgroundImage:`url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")`,
      }}/>
    </>
  );
}

function NFTopRule({ right }) {
  return (
    <div style={{position:'absolute', top:0, left:0, right:0,
      padding:'24px 32px', display:'flex', justifyContent:'space-between',
      fontFamily:'JetBrains Mono, monospace', fontSize:10.5,
      letterSpacing:'0.08em', color:'var(--muted-foreground)',
      textTransform:'uppercase', zIndex:2}}>
      <span style={{display:'inline-flex', alignItems:'center', gap:8}}>
        <PronounceBadge size="sm"/>
        <span>· v2.0.4</span>
      </span>
      {right}
    </div>
  );
}

// Concentric topographic contour lines — a mountain seen from above
function TopoContours({ width = 560, height = 560, stroke = 'currentColor', opacity = 0.18 }) {
  const cx = width/2, cy = height/2;
  // irregular polygon points, scaled per ring — feels like elevation rings
  const seed = [
    [0,  -1.00], [0.30, -0.92], [0.55, -0.74], [0.78, -0.50],
    [0.95, -0.20], [1.00,  0.15], [0.88,  0.46], [0.62,  0.72],
    [0.28,  0.92], [-0.10, 1.00], [-0.46, 0.86], [-0.74, 0.62],
    [-0.92, 0.30], [-1.00,-0.05], [-0.92,-0.38], [-0.70,-0.66],
    [-0.42,-0.86], [-0.18,-0.98],
  ];
  const rings = 11;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden
      style={{display:'block', overflow:'visible'}}>
      {Array.from({length:rings}).map((_, i) => {
        const t = (i + 1) / rings;
        const r = t * (Math.min(width, height) * 0.46);
        // slight wobble per ring so they don't look mechanical
        const wob = 1 + 0.04 * Math.sin(i * 2.3);
        const pts = seed.map(([x,y], j) => {
          const jitter = 1 + 0.03 * Math.sin(i * 1.7 + j * 0.9);
          return `${(cx + x * r * wob * jitter).toFixed(2)},${(cy + y * r * wob * jitter).toFixed(2)}`;
        }).join(' ');
        return (
          <polygon key={i} points={pts} fill="none"
            stroke={stroke} strokeWidth={0.6}
            style={{opacity: opacity * (1 - i * 0.04)}}/>
        );
      })}
      {/* peak crosshair */}
      <g style={{opacity: 0.9}}>
        <circle cx={cx} cy={cy} r={3} fill="var(--chat)"/>
        <circle cx={cx} cy={cy} r={11} fill="none" stroke="var(--chat)" strokeWidth={0.8} opacity={0.5}/>
        <line x1={cx-22} y1={cy} x2={cx-13} y2={cy} stroke="var(--chat)" strokeWidth={0.8} opacity={0.7}/>
        <line x1={cx+13} y1={cy} x2={cx+22} y2={cy} stroke="var(--chat)" strokeWidth={0.8} opacity={0.7}/>
        <line x1={cx} y1={cy-22} x2={cx} y2={cy-13} stroke="var(--chat)" strokeWidth={0.8} opacity={0.7}/>
        <line x1={cx} y1={cy+13} x2={cx} y2={cy+22} stroke="var(--chat)" strokeWidth={0.8} opacity={0.7}/>
      </g>
    </svg>
  );
}

// ── Shared "what now" actions ──────────────────────────────────────────
function NFActions({ stack = false, primaryLabel = 'Back to your rooms' }) {
  const wrap = stack
    ? { display:'flex', flexDirection:'column', gap:10, width:'100%' }
    : { display:'flex', flexWrap:'wrap', gap:10, alignItems:'center' };
  return (
    <div style={wrap}>
      <button style={{
        padding:'12px 18px', borderRadius:'var(--radius)',
        background:'var(--chat)', color:'var(--primary-foreground)',
        border:'none', cursor:'pointer',
        fontWeight:600, fontSize:13.5, fontFamily:'inherit',
        display:'inline-flex', alignItems:'center', justifyContent:'center', gap:10,
        boxShadow:'0 1px 0 rgba(255,255,255,0.15) inset, 0 8px 24px -8px color-mix(in oklab, var(--chat) 40%, transparent)',
      }}>
        {primaryLabel} →
      </button>
      <button style={{
        padding:'11px 16px', borderRadius:'var(--radius)',
        background:'transparent', color:'var(--foreground)',
        border:'1px solid var(--border-strong)', cursor:'pointer',
        fontSize:13, fontFamily:'inherit',
        display:'inline-flex', alignItems:'center', gap:8,
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18l-6-6 6-6"/>
        </svg>
        Go back
      </button>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// A · Editorial split — same chrome as sign-in / verify-email
// ──────────────────────────────────────────────────────────────────────
function NotFoundEditorial() {
  return (
    <Artboard w={1200} h={780}>
      <NFBackdrop/>

      <NFTopRule right={
        <span style={{display:'inline-flex', alignItems:'center', gap:14}}>
          <span style={{display:'inline-flex', alignItems:'center', gap:6}}>
            <span style={{width:6, height:6, borderRadius:'50%',
              background:'var(--destructive)',
              boxShadow:'0 0 0 3px color-mix(in oklab, var(--destructive) 18%, transparent)'}}/>
            Status · 404 · route not found
          </span>
          <span style={{color:'var(--border-strong)'}}>|</span>
          <a style={{color:'var(--muted-foreground)', textDecoration:'none', cursor:'pointer'}}>
            ↗ check service status
          </a>
        </span>
      }/>

      <div style={{position:'absolute', inset:0,
        display:'grid', gridTemplateColumns:'1.1fr 1fr'}}>

        {/* LEFT — editorial */}
        <div style={{padding:'64px 56px', display:'flex', flexDirection:'column',
          justifyContent:'space-between', borderRight:'1px solid var(--border)',
          position:'relative', overflow:'hidden'}}>

          {/* faint contours behind the headline */}
          <div style={{position:'absolute', right:-180, top:-60, opacity:0.5,
            color:'var(--muted-foreground)', pointerEvents:'none'}}>
            <TopoContours width={620} height={620} opacity={0.16}/>
          </div>

          <div style={{display:'flex', alignItems:'center', gap:12, position:'relative'}}>
            <Mountain size={36}/>
            <Serif as="div" style={{fontSize:26, fontWeight:500,
              letterSpacing:'-0.01em', lineHeight:1}}>Pīna'i</Serif>
          </div>

          <div style={{position:'relative'}}>
            <Serif as="h1" style={{fontSize:84, lineHeight:0.92, fontWeight:350,
              margin:0, letterSpacing:'-0.028em',
              fontVariationSettings:"'opsz' 144, 'SOFT' 30"}}>
              Off the<br/>
              <em style={{fontStyle:'italic', color:'var(--chat)', fontWeight:300}}>trail.</em>
            </Serif>
            <p style={{maxWidth:400, marginTop:28, color:'var(--muted-foreground)',
              lineHeight:1.55, fontSize:14}}>
              The page you went looking for isn't on the map — maybe the room
              was archived, the link expired, or a typo wandered in. Either
              way, the summit is still where you left it.
            </p>
          </div>

          <div style={{display:'flex', gap:20, fontSize:11, color:'var(--muted-foreground)',
            fontFamily:'JetBrains Mono, monospace',
            textTransform:'uppercase', letterSpacing:'0.08em'}}>
            <span>↳ Docs</span>
            <span>↳ Status</span>
            <span>↳ Source</span>
          </div>
        </div>

        {/* RIGHT — card */}
        <div style={{display:'flex', alignItems:'center',
          justifyContent:'center', padding:40, position:'relative'}}>

          <div style={{width:420}}>

            {/* gigantic 404 numeral, mono, almost a watermark */}
            <Mono style={{fontSize:140, lineHeight:0.85, color:'var(--foreground)',
              letterSpacing:'-0.04em', fontWeight:500, display:'block',
              opacity:0.95}}>
              4<span style={{color:'var(--chat)'}}>0</span>4
            </Mono>

            <Mono style={{fontSize:10.5, letterSpacing:'0.12em',
              color:'var(--muted-foreground)', textTransform:'uppercase',
              display:'block', margin:'18px 0 10px'}}>
              — Where you tried to go
            </Mono>

            {/* URL trace card */}
            <div style={{
              padding:'14px 16px', borderRadius:'var(--radius)',
              background:'var(--card)', border:'1px solid var(--border)',
              fontFamily:'JetBrains Mono, monospace', fontSize:12.5,
              color:'var(--muted-foreground)', lineHeight:1.7,
              overflow:'hidden',
            }}>
              <div style={{display:'flex', gap:10, alignItems:'baseline'}}>
                <span style={{color:'var(--chat)'}}>GET</span>
                <span style={{color:'var(--foreground)', flex:1, overflow:'hidden',
                  textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
                  pinai://kauai{LOST_URL}
                </span>
              </div>
              <div style={{display:'flex', gap:10, alignItems:'baseline',
                color:'var(--muted-foreground)'}}>
                <span style={{color:'var(--destructive)'}}>404</span>
                <span>room archived 2 months ago by <span style={{color:'var(--foreground)'}}>@maia</span></span>
              </div>
            </div>

            <Mono style={{fontSize:10.5, letterSpacing:'0.12em',
              color:'var(--muted-foreground)', textTransform:'uppercase',
              display:'block', margin:'24px 0 12px'}}>
              — Suggested paths
            </Mono>

            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8,
              marginBottom:20}}>
              {[
                ['Friends',       '12 online',  'var(--chat)'],
                ['Voice rooms',   '3 live',     'var(--voice)'],
                ['Direct messages', '2 unread',  'var(--foreground)'],
                ['Inbox',         'all caught up', 'var(--muted-foreground)'],
              ].map(([k, v, color], i) => (
                <a key={i} style={{
                  display:'flex', alignItems:'center', justifyContent:'space-between',
                  padding:'11px 13px', borderRadius:'var(--radius-sm)',
                  border:'1px solid var(--border)', background:'var(--card)',
                  textDecoration:'none', cursor:'pointer',
                  transition:'border-color 140ms',
                }}>
                  <span style={{fontSize:13, color:'var(--foreground)'}}>{k}</span>
                  <span style={{display:'inline-flex', alignItems:'center', gap:6,
                    fontFamily:'JetBrains Mono, monospace', fontSize:10.5,
                    color:'var(--muted-foreground)'}}>
                    <span style={{width:5, height:5, borderRadius:'50%', background:color}}/>
                    {v}
                  </span>
                </a>
              ))}
            </div>

            <NFActions/>
          </div>
        </div>
      </div>
    </Artboard>
  );
}

// ──────────────────────────────────────────────────────────────────────
// B · Centered cartography
// ──────────────────────────────────────────────────────────────────────
function NotFoundCartography() {
  return (
    <Artboard w={1200} h={780}>
      <NFBackdrop/>

      <NFTopRule right={
        <span style={{display:'inline-flex', alignItems:'center', gap:14}}>
          <span style={{display:'inline-flex', alignItems:'center', gap:6}}>
            <span style={{width:6, height:6, borderRadius:'50%',
              background:'var(--destructive)'}}/>
            HTTP 404 · ROUTE NOT FOUND
          </span>
          <span style={{color:'var(--border-strong)'}}>|</span>
          <a style={{color:'var(--muted-foreground)', textDecoration:'none', cursor:'pointer'}}>
            ↗ check service status
          </a>
        </span>
      }/>

      {/* big contours, dead-center */}
      <div style={{position:'absolute', inset:0,
        display:'flex', alignItems:'center', justifyContent:'center',
        pointerEvents:'none', color:'var(--muted-foreground)'}}>
        <TopoContours width={760} height={760} opacity={0.22}/>
      </div>

      {/* annotations on the contour map */}
      <Mono style={{position:'absolute', top:'33%', left:'18%',
        fontSize:10, letterSpacing:'0.12em', color:'var(--voice)',
        textTransform:'uppercase'}}>
        <span style={{opacity:0.7}}>// last known position</span><br/>
        <span style={{color:'var(--muted-foreground)'}}>48.8584° N · 2.2945° E</span>
      </Mono>

      <Mono style={{position:'absolute', top:'62%', right:'14%',
        fontSize:10, letterSpacing:'0.12em', color:'var(--chat)',
        textTransform:'uppercase', textAlign:'right'}}>
        <span style={{opacity:0.7}}>// peak elevation</span><br/>
        <span style={{color:'var(--muted-foreground)'}}>3,776 m · the summit</span>
      </Mono>

      {/* center content */}
      <div style={{position:'absolute', inset:0,
        display:'flex', flexDirection:'column', alignItems:'center',
        justifyContent:'center', zIndex:2}}>

        <Mono style={{fontSize:10.5, letterSpacing:'0.22em',
          color:'var(--muted-foreground)', textTransform:'uppercase',
          marginBottom:18}}>
          — You are here · roughly —
        </Mono>

        <Serif style={{fontSize:240, lineHeight:0.85, fontWeight:300,
          letterSpacing:'-0.045em', margin:0,
          fontVariationSettings:"'opsz' 144, 'SOFT' 30",
          display:'flex', alignItems:'baseline', gap:4}}>
          <span>4</span>
          <span style={{color:'var(--chat)', fontStyle:'italic', fontWeight:300}}>0</span>
          <span>4</span>
        </Serif>

        <Serif style={{fontSize:32, fontWeight:350, marginTop:18,
          letterSpacing:'-0.015em'}}>
          You've wandered off the map.
        </Serif>

        <p style={{margin:'14px 0 28px', maxWidth:520, textAlign:'center',
          color:'var(--muted-foreground)', fontSize:14, lineHeight:1.6}}>
          No room, channel, or person lives at this address. The trail might
          have moved, been archived, or never existed at all.
        </p>

        <NFActions primaryLabel="Take me back to base camp"/>

        <Mono style={{marginTop:32, fontSize:10.5, letterSpacing:'0.12em',
          color:'var(--muted-foreground)', textTransform:'uppercase',
          display:'inline-flex', alignItems:'center', gap:10}}>
          <span style={{width:10, height:1, background:'var(--border-strong)'}}/>
          ref:&nbsp;<span style={{color:'var(--foreground)'}}>pinai://kauai{LOST_URL}</span>
          <span style={{width:10, height:1, background:'var(--border-strong)'}}/>
        </Mono>
      </div>
    </Artboard>
  );
}

// ──────────────────────────────────────────────────────────────────────
// C · Server-log / terminal
// ──────────────────────────────────────────────────────────────────────
function NotFoundTerminal() {
  const COLOR = {
    gray: 'var(--muted-foreground)',
    chat: 'var(--chat)',
    voice: 'var(--voice)',
    ink:  'color-mix(in oklab, var(--foreground) 85%, transparent)',
    fg:   'var(--foreground)',
    warn: 'var(--warning)',
    err:  'var(--destructive)',
  };
  // Each line is an array of [colorKey, text] segments.
  const lines = [
    [['chat', '$ '], ['fg', 'pinai trace --route /voice/kauai/the-summit-room']],
    [['gray', '[14:02:18] '], ['chat', '→ '], ['ink', 'resolving kauai.pinai...']],
    [['gray', '[14:02:18] '], ['chat', '→ '], ['ink', 'ok — server reachable (e2e ready, 18 ms)']],
    [['gray', '[14:02:18] '], ['chat', '→ '], ['ink', 'looking up room: '], ['fg', 'the-summit-room']],
    [['gray', '[14:02:19] '], ['warn', '! '], ['ink', 'no live record at this path']],
    [['gray', '[14:02:19] '], ['warn', '! '], ['ink', 'checking archive...']],
    [['gray', '[14:02:19] '], ['ink', 'archive: room closed 67 days ago by '], ['fg', '@maia']],
    [['gray', '[14:02:19] '], ['err', '✗ '], ['fg', 'HTTP 404 · the request never reached the summit']],
  ];

  return (
    <Artboard w={1200} h={780}>
      <NFBackdrop/>

      <NFTopRule right={
        <span style={{display:'inline-flex', alignItems:'center', gap:14}}>
          <span style={{display:'inline-flex', alignItems:'center', gap:6}}>
            <span style={{width:6, height:6, borderRadius:'50%',
              background:'var(--destructive)'}}/>
            HTTP 404 · ROUTE NOT FOUND
          </span>
          <span style={{color:'var(--border-strong)'}}>|</span>
          <a style={{color:'var(--muted-foreground)', textDecoration:'none', cursor:'pointer'}}>
            ↗ open service status
          </a>
        </span>
      }/>

      <div style={{position:'absolute', inset:'88px 80px 64px',
        display:'grid', gridTemplateColumns:'1.05fr 1fr', gap:48,
        alignItems:'center'}}>

        {/* LEFT — terminal */}
        <div style={{
          background:'color-mix(in oklab, var(--card) 92%, black 8%)',
          border:'1px solid var(--border)',
          borderRadius:'var(--radius)',
          boxShadow:'0 20px 60px -20px rgba(0,0,0,0.5), 0 0 0 1px color-mix(in oklab, var(--chat) 6%, transparent)',
          overflow:'hidden',
        }}>
          {/* term bar */}
          <div style={{
            padding:'10px 14px', borderBottom:'1px solid var(--border)',
            display:'flex', alignItems:'center', gap:10,
            fontFamily:'JetBrains Mono, monospace', fontSize:11,
            color:'var(--muted-foreground)', letterSpacing:'0.04em',
          }}>
            <span style={{display:'inline-flex', gap:6}}>
              <span style={{width:10, height:10, borderRadius:'50%', background:'#e06c75', opacity:0.7}}/>
              <span style={{width:10, height:10, borderRadius:'50%', background:'#e5c07b', opacity:0.7}}/>
              <span style={{width:10, height:10, borderRadius:'50%', background:'#98c379', opacity:0.7}}/>
            </span>
            <span style={{marginLeft:6}}>~/pinai · trace</span>
            <span style={{marginLeft:'auto', fontSize:10.5, textTransform:'uppercase',
              letterSpacing:'0.12em'}}>session #4c2-a91</span>
          </div>
          <div style={{padding:'22px 24px',
            fontFamily:'JetBrains Mono, monospace', fontSize:13,
            lineHeight:1.85, color:'var(--foreground)'}}>
            {lines.map((line, i) => (
              <div key={i}>
                {line.map(([c, txt], k) => (
                  <span key={k} style={{color: COLOR[c]}}>{txt}</span>
                ))}
              </div>
            ))}
            {/* cursor */}
            <div>
              <span style={{color:'var(--muted-foreground)'}}>[14:02:19] </span>
              <span style={{color:'var(--chat)'}}>$ </span>
              <span style={{display:'inline-block', width:8, height:16,
                background:'var(--chat)', verticalAlign:'-3px',
                animation:'pn-blink 1s steps(2) infinite'}}/>
            </div>
          </div>
        </div>

        {/* RIGHT — narrative + actions */}
        <div>
          <Mono style={{fontSize:10.5, letterSpacing:'0.12em',
            color:'var(--muted-foreground)', textTransform:'uppercase',
            display:'block', marginBottom:14}}>
            — Error 404 · the request never reached the summit
          </Mono>

          <Serif as="h1" style={{fontSize:64, lineHeight:0.95, fontWeight:350,
            margin:0, letterSpacing:'-0.025em',
            fontVariationSettings:"'opsz' 144, 'SOFT' 30"}}>
            Trail<br/>
            <em style={{fontStyle:'italic', color:'var(--chat)', fontWeight:300}}>ends</em>
            <span> here.</span>
          </Serif>

          <p style={{margin:'22px 0 26px', maxWidth:380,
            color:'var(--muted-foreground)', fontSize:14, lineHeight:1.6}}>
            We walked the route as far as it goes. The room you're looking for
            was archived, the link copy-pasted with a stray character, or it
            simply never existed. The trace on the left has the gory bits.
          </p>

          <NFActions/>

          <div style={{marginTop:26, paddingTop:18,
            borderTop:'1px solid var(--border)',
            fontSize:11.5, color:'var(--muted-foreground)', lineHeight:1.6,
            display:'flex', gap:20, flexWrap:'wrap'}}>
            <span>Persistent? <a style={{color:'var(--chat)', textDecoration:'underline',
              textUnderlineOffset:3, cursor:'pointer'}}>send the trace to your server admin</a></span>
          </div>
        </div>
      </div>
    </Artboard>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Mobile — condensed take
// ──────────────────────────────────────────────────────────────────────
function NotFoundMobile() {
  return (
    <Artboard w={390} h={844} style={{background:'var(--background)'}}>
      <NFBackdrop/>

      {/* status bar surrogate */}
      <div style={{position:'absolute', top:0, left:0, right:0, height:44,
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'0 24px', fontFamily:'JetBrains Mono, monospace',
        fontSize:11, color:'var(--muted-foreground)',
        letterSpacing:'0.04em'}}>
        <span>9:41</span>
        <span style={{display:'inline-flex', gap:6, alignItems:'center'}}>
          <span style={{display:'inline-flex', gap:2, alignItems:'flex-end'}}>
            <span style={{width:3, height:5, background:'var(--foreground)', borderRadius:1}}/>
            <span style={{width:3, height:7, background:'var(--foreground)', borderRadius:1}}/>
            <span style={{width:3, height:9, background:'var(--foreground)', borderRadius:1}}/>
            <span style={{width:3, height:11, background:'var(--foreground)', borderRadius:1, opacity:0.4}}/>
          </span>
          <span>5G</span>
          <span style={{display:'inline-block', width:22, height:10,
            border:'1px solid var(--muted-foreground)', borderRadius:2,
            position:'relative'}}>
            <span style={{position:'absolute', inset:1, width:'70%',
              background:'var(--foreground)', borderRadius:1}}/>
          </span>
        </span>
      </div>

      {/* page chrome — back chevron + mountain mark */}
      <div style={{position:'absolute', top:54, left:0, right:0,
        padding:'0 20px', display:'flex',
        alignItems:'center', justifyContent:'space-between'}}>
        <button style={{
          width:36, height:36, borderRadius:'50%',
          background:'var(--card)', border:'1px solid var(--border)',
          display:'inline-flex', alignItems:'center', justifyContent:'center',
          color:'var(--foreground)', cursor:'pointer',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </button>
        <Mountain size={22}/>
        <span style={{width:36}}/>
      </div>

      {/* faint contours behind the body */}
      <div style={{position:'absolute', inset:0,
        display:'flex', alignItems:'center', justifyContent:'center',
        pointerEvents:'none', color:'var(--muted-foreground)'}}>
        <TopoContours width={460} height={460} opacity={0.18}/>
      </div>

      {/* body */}
      <div style={{position:'absolute', inset:'130px 24px 32px',
        display:'flex', flexDirection:'column', alignItems:'center',
        textAlign:'center', zIndex:2}}>

        <Mono style={{fontSize:10, letterSpacing:'0.22em',
          color:'var(--muted-foreground)', textTransform:'uppercase'}}>
          — Off the map —
        </Mono>

        <Serif style={{fontSize:170, lineHeight:0.85, fontWeight:300,
          letterSpacing:'-0.05em', margin:'10px 0 6px',
          fontVariationSettings:"'opsz' 144, 'SOFT' 30",
          display:'flex', alignItems:'baseline', gap:2}}>
          <span>4</span>
          <span style={{color:'var(--chat)', fontStyle:'italic'}}>0</span>
          <span>4</span>
        </Serif>

        <Serif style={{fontSize:26, fontWeight:350,
          letterSpacing:'-0.015em', marginTop:8}}>
          Off the trail.
        </Serif>

        <p style={{margin:'12px 14px 0', color:'var(--muted-foreground)',
          fontSize:13.5, lineHeight:1.55}}>
          The room you're looking for isn't where it used to be. The summit's
          still where you left it though.
        </p>

        <div style={{
          marginTop:22, padding:'10px 14px',
          background:'var(--card)', border:'1px solid var(--border)',
          borderRadius:999,
          fontFamily:'JetBrains Mono, monospace', fontSize:11,
          color:'var(--muted-foreground)', maxWidth:'100%',
          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
        }}>
          <span style={{color:'var(--destructive)'}}>404</span>
          {' · '}
          pinai://kauai{LOST_URL}
        </div>

        <div style={{flex:1}}/>

        <div style={{width:'100%', display:'flex', flexDirection:'column', gap:10}}>
          <button style={{
            width:'100%', padding:'14px', borderRadius:'var(--radius)',
            background:'var(--chat)', color:'var(--primary-foreground)',
            border:'none', fontWeight:600, fontSize:14, fontFamily:'inherit',
            boxShadow:'0 1px 0 rgba(255,255,255,0.15) inset, 0 8px 24px -8px color-mix(in oklab, var(--chat) 40%, transparent)',
          }}>
            Back to your friends
          </button>
          <button style={{
            width:'100%', padding:'13px', borderRadius:'var(--radius)',
            background:'transparent', color:'var(--foreground)',
            border:'1px solid var(--border-strong)',
            fontSize:13.5, fontFamily:'inherit',
          }}>
            Try again
          </button>
        </div>
      </div>

      {/* home indicator */}
      <div style={{position:'absolute', bottom:8, left:0, right:0,
        display:'flex', justifyContent:'center'}}>
        <span style={{width:134, height:5, borderRadius:3,
          background:'color-mix(in oklab, var(--foreground) 40%, transparent)'}}/>
      </div>
    </Artboard>
  );
}

Object.assign(window, {
  NotFoundEditorial,
  NotFoundCartography,
  NotFoundTerminal,
  NotFoundMobile,
});
