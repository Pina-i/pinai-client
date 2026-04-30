// Screen 1: Sign-in (refined editorial)
function SignInScreen() {
  const [tab, setTab] = React.useState('signin');
  return (
    <Artboard w={1200} h={780}>
      {/* ambient backdrop */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `
          radial-gradient(900px 500px at 70% 20%, color-mix(in oklab, var(--chat) 10%, transparent), transparent 60%),
          radial-gradient(700px 500px at 20% 110%, color-mix(in oklab, var(--voice) 8%, transparent), transparent 55%)
        `,
      }}/>
      {/* grain texture */}
      <div style={{
        position:'absolute', inset:0, opacity:0.035, mixBlendMode:'overlay', pointerEvents:'none',
        backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")`,
      }}/>

      {/* top rule w/ coordinates */}
      <div style={{position:'absolute', top:0, left:0, right:0, padding:'24px 32px', display:'flex', justifyContent:'space-between',
        fontFamily:'JetBrains Mono, ui-monospace, monospace', fontSize:10.5, letterSpacing:'0.08em',
        color:'var(--muted-foreground)', textTransform:'uppercase'}}>
        <span>Pīna'i · v2.0.4</span>
        <span>Self-hosted · Federated · Open-source</span>
      </div>

      <div style={{position:'absolute', inset:0, display:'grid', gridTemplateColumns:'1.1fr 1fr'}}>
        {/* Left: editorial mark */}
        <div style={{padding:'64px 56px', display:'flex', flexDirection:'column', justifyContent:'space-between', borderRight:'1px solid var(--border)'}}>
          <div style={{display:'flex', alignItems:'center', gap:12}}>
            <Mountain size={34}/>
            <Serif as="div" style={{fontSize:26, fontWeight:500, letterSpacing:'-0.01em'}}>Pīna'i</Serif>
          </div>

          <div>
            <Serif as="h1" style={{fontSize:76, lineHeight:0.95, fontWeight:350, margin:0, letterSpacing:'-0.025em',
              fontVariationSettings:"'opsz' 144, 'SOFT' 30"}}>
              Quiet<br/>
              <em style={{fontStyle:'italic', color:'var(--chat)', fontWeight:300}}>rooms</em>,<br/>
              loud<br/>
              <em style={{fontStyle:'italic', color:'var(--voice)', fontWeight:300}}>voices</em>.
            </Serif>
            <p style={{maxWidth:380, marginTop:28, color:'var(--muted-foreground)', lineHeight:1.55, fontSize:14}}>
              A community space you host yourself. Federated by design,
              owned by the people who gather in it.
            </p>
          </div>

          <div style={{display:'flex', gap:20, fontSize:11, color:'var(--muted-foreground)',
            fontFamily:'JetBrains Mono, ui-monospace, monospace', textTransform:'uppercase', letterSpacing:'0.08em'}}>
            <span>↳ Docs</span>
            <span>↳ Status</span>
            <span>↳ Source</span>
          </div>
        </div>

        {/* Right: form card */}
        <div style={{display:'flex', alignItems:'center', justifyContent:'center', padding:40}}>
          <div style={{width:380}}>
            <div style={{marginBottom:28}}>
              <div style={{fontFamily:'JetBrains Mono, ui-monospace, monospace', fontSize:10.5, letterSpacing:'0.12em',
                color:'var(--muted-foreground)', textTransform:'uppercase'}}>— Welcome back</div>
              <Serif as="h2" style={{fontSize:32, fontWeight:400, margin:'10px 0 0', letterSpacing:'-0.015em'}}>
                Sign in to continue
              </Serif>
            </div>

            {/* tabs */}
            <div style={{display:'flex', gap:2, padding:3, background:'var(--muted)', borderRadius:'var(--radius-sm)', marginBottom:20}}>
              {[['signin','Sign in'],['register','Register']].map(([k,l]) => (
                <button key={k} onClick={()=>setTab(k)}
                  style={{
                    flex:1, padding:'9px 10px', borderRadius:'calc(var(--radius-sm) - 1px)',
                    border:'none', cursor:'pointer',
                    background: tab===k ? 'var(--card)' : 'transparent',
                    color: tab===k ? 'var(--foreground)' : 'var(--muted-foreground)',
                    fontWeight: tab===k ? 500 : 400, fontSize:12.5,
                    fontFamily:'inherit', letterSpacing:'0.02em',
                    boxShadow: tab===k ? '0 1px 2px rgba(0,0,0,0.25)' : 'none',
                  }}>{l}</button>
              ))}
            </div>

            {/* Fields */}
            <Field label="Email" icon={Icons.mail} placeholder="ada@lovelace.net" />
            <Field label="Password" icon={Icons.lock} placeholder="••••••••••••" type="password" />
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', margin:'4px 0 18px'}}>
              <label style={{display:'flex', alignItems:'center', gap:8, fontSize:12, color:'var(--muted-foreground)'}}>
                <span style={{width:14, height:14, borderRadius:3, border:'1px solid var(--border-strong)', display:'inline-block'}}/>
                Keep me signed in
              </label>
              <a style={{fontSize:12, color:'var(--chat)', textDecoration:'none'}}>Forgot?</a>
            </div>

            <button style={{
              width:'100%', padding:'12px 14px', borderRadius:'var(--radius)',
              background:'var(--chat)', color:'var(--primary-foreground)',
              border:'none', cursor:'pointer', fontWeight:600, fontSize:13.5,
              fontFamily:'inherit', letterSpacing:'0.005em',
              boxShadow:'0 1px 0 rgba(255,255,255,0.15) inset, 0 8px 24px -8px color-mix(in oklab, var(--chat) 40%, transparent)',
            }}>
              Sign in →
            </button>

            <div style={{margin:'22px 0', display:'flex', alignItems:'center', gap:12, color:'var(--muted-foreground)', fontSize:11}}>
              <div style={{flex:1, height:1, background:'var(--border)'}}/>
              <span style={{fontFamily:'JetBrains Mono, ui-monospace, monospace', letterSpacing:'0.12em', textTransform:'uppercase'}}>or</span>
              <div style={{flex:1, height:1, background:'var(--border)'}}/>
            </div>

            <button style={{
              width:'100%', padding:'11px 14px', borderRadius:'var(--radius)',
              background:'transparent', color:'var(--foreground)',
              border:'1px solid var(--border-strong)', cursor:'pointer', fontSize:13, fontFamily:'inherit',
              display:'flex', alignItems:'center', justifyContent:'center', gap:10,
            }}>
              <span style={{width:6, height:6, borderRadius:'50%', background:'var(--voice)'}}/>
              Continue with Identity Provider
            </button>
          </div>
        </div>
      </div>
    </Artboard>
  );
}

function Field({ label, icon, placeholder, type='text' }) {
  return (
    <div style={{marginBottom:14}}>
      <div style={{fontFamily:'JetBrains Mono, ui-monospace, monospace', fontSize:10, letterSpacing:'0.12em',
        color:'var(--muted-foreground)', textTransform:'uppercase', marginBottom:7}}>
        {label}
      </div>
      <div style={{
        display:'flex', alignItems:'center', gap:10, padding:'0 12px', height:42,
        background:'var(--input)', borderRadius:'var(--radius)', border:'1px solid var(--border)',
      }}>
        <span style={{color:'var(--muted-foreground)', display:'flex'}}>{icon}</span>
        <input type={type} placeholder={placeholder}
          style={{flex:1, background:'transparent', border:'none', outline:'none',
            color:'var(--foreground)', fontSize:13.5, fontFamily:'inherit'}}/>
      </div>
    </div>
  );
}

window.SignInScreen = SignInScreen;
