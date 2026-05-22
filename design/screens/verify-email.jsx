// Screen: Verify email — OTP after register
// Mirrors SignInScreen's left-editorial / right-form split. Three states
// surfaced as separate artboards: empty (just-sent), mid-entry (4 of 6
// digits typed), and resent (cooldown timer + confirmation toast).

const OTP_LEN = 6;
const COVER_EMAIL = 'akasatana83@hotmail.fr';

// ── Editorial left panel — identical chrome to SignInScreen ─────────────
function VerifyLeftPanel({ headline }) {
  return (
    <div style={{
      padding:'64px 56px', display:'flex', flexDirection:'column',
      justifyContent:'space-between', borderRight:'1px solid var(--border)',
      position:'relative',
    }}>
      <div style={{display:'flex', alignItems:'center', gap:12}}>
        <Mountain size={36}/>
        <Serif as="div" style={{fontSize:26, fontWeight:500,
          letterSpacing:'-0.01em', lineHeight:1}}>Pīna'i</Serif>
      </div>

      <div>
        <Serif as="h1" style={{fontSize:72, lineHeight:0.95, fontWeight:350,
          margin:0, letterSpacing:'-0.025em',
          fontVariationSettings:"'opsz' 144, 'SOFT' 30"}}>
          {headline}
        </Serif>
        <p style={{maxWidth:380, marginTop:28, color:'var(--muted-foreground)',
          lineHeight:1.55, fontSize:14}}>
          We sent a six-digit code to make sure this inbox is yours.
          Type it in to finish setting up your account.
        </p>
      </div>

      {/* footer link row — matches SignInScreen */}
      <div style={{display:'flex', gap:20, fontSize:11, color:'var(--muted-foreground)',
        fontFamily:'JetBrains Mono, ui-monospace, monospace',
        textTransform:'uppercase', letterSpacing:'0.08em'}}>
        <span>↳ Docs</span>
        <span>↳ Status</span>
        <span>↳ Source</span>
      </div>
    </div>
  );
}

function ProgressStep({ n, label, done, active }) {
  const color = done ? 'var(--chat)' :
    active ? 'var(--foreground)' :
    'var(--muted-foreground)';
  return (
    <div style={{display:'flex', alignItems:'center', gap:12}}>
      <span style={{
        width:22, height:22, borderRadius:'50%', flexShrink:0,
        display:'inline-flex', alignItems:'center', justifyContent:'center',
        border: done
          ? '1px solid var(--chat)'
          : active
            ? '1px solid var(--foreground)'
            : '1px solid var(--border-strong)',
        background: done
          ? 'color-mix(in oklab, var(--chat) 18%, transparent)'
          : 'transparent',
        color,
        fontFamily:'JetBrains Mono, monospace',
        fontSize:9.5, letterSpacing:'0.04em',
        position:'relative',
      }}>
        {done ? (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12l5 5 9-11"/>
          </svg>
        ) : n}
        {active && (
          <span style={{
            position:'absolute', inset:-4, borderRadius:'50%',
            border:'1px solid color-mix(in oklab, var(--foreground) 24%, transparent)',
            animation:'pn-pulse 2s ease-in-out infinite',
          }}/>
        )}
      </span>
      <span style={{fontSize:13, color, letterSpacing:'-0.005em'}}>{label}</span>
    </div>
  );
}

// ── OTP digit cell ──────────────────────────────────────────────────────
function OTPDigit({ value, focused, error }) {
  const filled = !!value;
  const borderColor =
    error   ? 'var(--destructive)' :
    focused ? 'var(--chat)' :
    filled  ? 'color-mix(in oklab, var(--chat) 30%, var(--border-strong))' :
    'var(--border-strong)';
  const bg =
    error   ? 'color-mix(in oklab, var(--destructive) 6%, var(--background))' :
    filled  ? 'color-mix(in oklab, var(--chat) 5%, var(--background))' :
    'var(--background)';
  return (
    <div style={{
      width:46, height:54, borderRadius:'var(--radius)',
      border: `1px solid ${borderColor}`,
      background: bg,
      boxShadow: focused
        ? '0 0 0 3px color-mix(in oklab, var(--chat) 18%, transparent)'
        : 'none',
      display:'flex', alignItems:'center', justifyContent:'center',
      fontFamily:'var(--serif, Fraunces), serif',
      fontSize:26, fontWeight:400, letterSpacing:0,
      color: error ? 'var(--destructive)' : 'var(--foreground)',
      position:'relative',
      transition:'border-color 140ms, box-shadow 140ms, background 140ms',
    }}>
      {filled ? value : (focused ? (
        <span style={{
          width:1.5, height:24, background:'var(--chat)',
          animation:'pn-blink 1s steps(2) infinite', borderRadius:1,
        }}/>
      ) : (
        <span style={{
          width:14, height:1.5, background:'var(--border-strong)', borderRadius:1,
        }}/>
      ))}
    </div>
  );
}

function OTPInput({ digits = ['','','','','',''], cursor = 0, error = false }) {
  return (
    <div style={{display:'flex', alignItems:'center', gap:8}}>
      {digits.slice(0, 3).map((d, i) => (
        <OTPDigit key={i} value={d} focused={cursor === i} error={error}/>
      ))}
      <span style={{
        width:14, height:1.5, background:'var(--border-strong)',
        margin:'0 2px', borderRadius:1,
      }}/>
      {digits.slice(3, 6).map((d, i) => (
        <OTPDigit key={i+3} value={d} focused={cursor === i+3} error={error}/>
      ))}
    </div>
  );
}

// ── Email row (with "change" affordance) ────────────────────────────────
function EmailLine() {
  return (
    <div style={{
      display:'inline-flex', alignItems:'center', gap:10,
      padding:'8px 12px 8px 10px', borderRadius:999,
      background:'var(--card)',
      border:'1px solid var(--border)',
      marginBottom:18,
    }}>
      <span style={{color:'var(--muted-foreground)', display:'flex'}}>{Icons.mail}</span>
      <Mono style={{fontSize:11.5, color:'var(--foreground)', letterSpacing:'0.02em'}}>
        {COVER_EMAIL}
      </Mono>
      <span style={{width:3, height:3, borderRadius:'50%',
        background:'var(--border-strong)'}}/>
      <button style={{
        padding:0, border:'none', background:'transparent',
        color:'var(--chat)', fontSize:11.5, cursor:'pointer',
        fontFamily:'inherit', textDecoration:'underline',
        textUnderlineOffset:3,
      }}>change</button>
    </div>
  );
}

// ── Right-side form card ────────────────────────────────────────────────
function VerifyFormCard({ state }) {
  const isEmpty = state === 'empty';
  const isMid   = state === 'midEntry';
  const isResent = state === 'resent';

  const digits = isEmpty   ? ['','','','','',''] :
                 isMid     ? ['4','7','2','9','',''] :
                             ['','','','','',''];
  const cursor = isMid ? 4 : 0;

  // Buttons / footer state
  const canSubmit = isMid; // shown enabled mid-entry for completeness, though only 4/6 typed — keep disabled
  const submitDisabled = !isEmpty ? (digits.filter(Boolean).length < OTP_LEN) : true;

  // Resend pill: live → "send again", post-click → countdown
  const resendCountdown = isResent ? 56 : null;

  return (
    <div style={{width:420}}>
      <div style={{marginBottom:22}}>
        <a style={{display:'inline-flex', alignItems:'center', gap:6,
          fontFamily:'JetBrains Mono, ui-monospace, monospace',
          fontSize:10.5, letterSpacing:'0.08em',
          color:'var(--muted-foreground)', textTransform:'uppercase',
          textDecoration:'none', cursor:'pointer'}}>
          ← back to sign in
        </a>
        <Serif as="h2" style={{fontSize:32, fontWeight:400,
          margin:'10px 0 12px', letterSpacing:'-0.015em', lineHeight:1.1}}>
          Check your inbox.
        </Serif>
        <p style={{margin:'0 0 18px', color:'var(--muted-foreground)',
          fontSize:13.5, lineHeight:1.55, maxWidth:380}}>
          We just sent a one-time code to
        </p>
        <EmailLine/>
      </div>

      <div style={{marginBottom:8}}>
        <Mono style={{fontSize:10, letterSpacing:'0.12em',
          color:'var(--muted-foreground)', textTransform:'uppercase',
          display:'block', marginBottom:10}}>
          Six-digit code
        </Mono>
        <OTPInput digits={digits} cursor={cursor}/>
      </div>

      {/* validation row */}
      <div style={{
        minHeight:22, marginTop:10, marginBottom:18,
        display:'flex', alignItems:'center', gap:8,
        fontSize:11.5, fontFamily:'JetBrains Mono, monospace',
        letterSpacing:'0.04em',
        color: isMid ? 'var(--chat)' : 'var(--muted-foreground)',
      }}>
        {isEmpty && (<>
          <span style={{
            width:6, height:6, borderRadius:'50%',
            background:'var(--muted-foreground)', opacity:0.5,
          }}/>
          Codes expire in 10 minutes.
        </>)}
        {isMid && (<>
          <span style={{
            width:6, height:6, borderRadius:'50%', background:'var(--chat)',
            animation:'pn-pulse 1.8s ease-in-out infinite',
          }}/>
          {digits.filter(Boolean).length} of {OTP_LEN} typed · paste with ⌘V
        </>)}
        {isResent && (<>
          <span style={{
            width:6, height:6, borderRadius:'50%', background:'var(--success)',
          }}/>
          New code sent. The previous one no longer works.
        </>)}
      </div>

      <button
        disabled={submitDisabled}
        style={{
          width:'100%', padding:'12px 14px', borderRadius:'var(--radius)',
          background: submitDisabled
            ? 'color-mix(in oklab, var(--chat) 30%, transparent)'
            : 'var(--chat)',
          color: submitDisabled
            ? 'color-mix(in oklab, var(--primary-foreground) 55%, transparent)'
            : 'var(--primary-foreground)',
          border:'none', cursor: submitDisabled ? 'not-allowed' : 'pointer',
          fontWeight:600, fontSize:13.5,
          fontFamily:'inherit', letterSpacing:'0.005em',
          boxShadow: submitDisabled
            ? 'none'
            : '0 1px 0 rgba(255,255,255,0.15) inset, 0 8px 24px -8px color-mix(in oklab, var(--chat) 40%, transparent)',
        }}
      >
        Verify and continue →
      </button>

      {/* divider */}
      <div style={{margin:'22px 0 16px', display:'flex', alignItems:'center', gap:12,
        color:'var(--muted-foreground)', fontSize:11}}>
        <div style={{flex:1, height:1, background:'var(--border)'}}/>
        <span style={{fontFamily:'JetBrains Mono, monospace',
          letterSpacing:'0.12em', textTransform:'uppercase'}}>didn't get it?</span>
        <div style={{flex:1, height:1, background:'var(--border)'}}/>
      </div>

      {/* resend area */}
      <div style={{display:'flex', alignItems:'center', gap:10}}>
        <button
          disabled={!!resendCountdown}
          style={{
            flex:1, padding:'11px 14px', borderRadius:'var(--radius)',
            background:'transparent',
            color: resendCountdown ? 'var(--muted-foreground)' : 'var(--foreground)',
            border:'1px solid var(--border-strong)',
            cursor: resendCountdown ? 'not-allowed' : 'pointer',
            fontSize:13, fontFamily:'inherit',
            display:'flex', alignItems:'center', justifyContent:'center', gap:10,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>
            <path d="M21 3v5h-5"/>
            <path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
            <path d="M3 21v-5h5"/>
          </svg>
          {resendCountdown
            ? <>Resend in <Mono style={{color:'var(--chat)'}}>{`0:${String(resendCountdown).padStart(2,'0')}`}</Mono></>
            : 'Send a new code'}
        </button>
      </div>

      <p style={{
        margin:'18px 0 0', fontSize:11.5, color:'var(--muted-foreground)',
        lineHeight:1.55, maxWidth:380,
      }}>
        Still nothing? Check your spam folder, or{' '}
        <a style={{color:'var(--chat)', textDecoration:'underline',
          textUnderlineOffset:3, cursor:'pointer'}}>contact support</a>.
      </p>
    </div>
  );
}

// ── The artboard wrapper — same backdrop as SignInScreen ────────────────
function VerifyEmailScreen({ state = 'empty', headline }) {
  return (
    <Artboard w={1200} h={780}>
      {/* ambient backdrop */}
      <div style={{
        position:'absolute', inset:0,
        backgroundImage:`
          radial-gradient(900px 500px at 70% 20%, color-mix(in oklab, var(--chat) 10%, transparent), transparent 60%),
          radial-gradient(700px 500px at 20% 110%, color-mix(in oklab, var(--voice) 8%, transparent), transparent 55%)
        `,
      }}/>
      {/* grain texture */}
      <div style={{
        position:'absolute', inset:0, opacity:0.035, mixBlendMode:'overlay', pointerEvents:'none',
        backgroundImage:`url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")`,
      }}/>

      {/* top rule */}
      <div style={{position:'absolute', top:0, left:0, right:0,
        padding:'24px 32px', display:'flex', justifyContent:'space-between',
        fontFamily:'JetBrains Mono, monospace', fontSize:10.5,
        letterSpacing:'0.08em', color:'var(--muted-foreground)',
        textTransform:'uppercase', zIndex:2}}>
        <span style={{display:'inline-flex', alignItems:'center', gap:8}}>
          <PronounceBadge size="sm"/>
          <span>· v2.0.4</span>
        </span>
        <span>Self-hosted · Federated · Open-source</span>
      </div>

      <div style={{position:'absolute', inset:0,
        display:'grid', gridTemplateColumns:'1.1fr 1fr'}}>
        <VerifyLeftPanel headline={headline}/>

        {/* Right: form card */}
        <div style={{display:'flex', alignItems:'center',
          justifyContent:'center', padding:40, position:'relative'}}>

          <VerifyFormCard state={state}/>
        </div>
      </div>
    </Artboard>
  );
}

// ── Three states as separate exports ────────────────────────────────────
function VerifyEmailEmpty() {
  return <VerifyEmailScreen state="empty" headline={
    <>Almost <em style={{fontStyle:'italic', color:'var(--chat)', fontWeight:300}}>in.</em></>
  }/>;
}
function VerifyEmailMidEntry() {
  return <VerifyEmailScreen state="midEntry" headline={
    <>Almost <em style={{fontStyle:'italic', color:'var(--chat)', fontWeight:300}}>in.</em></>
  }/>;
}
function VerifyEmailResent() {
  return <VerifyEmailScreen state="resent" headline={
    <>Almost <em style={{fontStyle:'italic', color:'var(--chat)', fontWeight:300}}>in.</em></>
  }/>;
}

Object.assign(window, {
  VerifyEmailScreen,
  VerifyEmailEmpty,
  VerifyEmailMidEntry,
  VerifyEmailResent,
});
