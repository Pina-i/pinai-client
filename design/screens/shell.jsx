// Shared app-shell chrome (server rail + user bar)
function ServerRail({ active = 'home' }) {
  const servers = [
    { id: 'home', home: true },
    { id: 'kauai', label: 'K', voice: false },
    { id: 'design', label: 'D', voice: true, speaking: true, unread: 3 },
    { id: 'studio', label: 'S', voice: false, unread: 0 },
    { id: 'lab', label: 'L', voice: false },
  ];
  return (
    <div style={{
      width:64, height:'100%', background:'var(--background)',
      borderRight:'1px solid var(--border)', padding:'14px 0',
      display:'flex', flexDirection:'column', alignItems:'center', gap:10,
    }}>
      {servers.map(s => (
        <ServerPill key={s.id} {...s} active={active===s.id}/>
      ))}
      <div style={{width:24, height:1, background:'var(--border)', margin:'6px 0'}}/>
      <button style={{
        width:40, height:40, borderRadius:'var(--radius)', border:'1px dashed var(--border-strong)',
        background:'transparent', color:'var(--muted-foreground)', cursor:'pointer',
        display:'flex', alignItems:'center', justifyContent:'center',
      }}>{Icons.plus}</button>
    </div>
  );
}

function ServerPill({ home, label, voice, speaking, unread, active }) {
  return (
    <div style={{position:'relative', width:40, height:40}}>
      {/* active indicator */}
      <div style={{position:'absolute', left:-14, top:'50%', transform:'translateY(-50%)',
        width:3, height: active ? 22 : (unread ? 8 : 0),
        background: active ? 'var(--foreground)' : 'var(--muted-foreground)',
        borderRadius:'0 2px 2px 0', transition:'height .2s'}}/>
      <div style={{
        width:40, height:40, borderRadius: active ? 'var(--radius-sm)' : '50%',
        background: home ? 'var(--card)' : 'var(--muted)',
        border: active ? '1px solid var(--border-strong)' : '1px solid transparent',
        display:'flex', alignItems:'center', justifyContent:'center',
        color: 'var(--foreground)', fontSize:14, fontFamily:'var(--serif, Fraunces), serif',
        transition:'border-radius .2s', cursor:'pointer',
      }}>
        {home ? <Mountain size={22}/> : <span style={{fontWeight:500}}>{label}</span>}
      </div>
      {/* speaking ring */}
      {speaking && (
        <div style={{position:'absolute', inset:-3, borderRadius:'calc(var(--radius-sm) + 3px)',
          border:'1.5px solid var(--voice)', opacity:0.9,
          animation:'pn-pulse 1.6s ease-in-out infinite'}}/>
      )}
    </div>
  );
}

function UserBar({ compact = false }) {
  return (
    <div style={{
      height:54, background:'var(--card)',
      borderTop:'1px solid var(--border)',
      padding:'0 10px', display:'flex', alignItems:'center', gap:8,
    }}>
      <Avatar name="Alice" color="var(--chat)" size={30} dot="online"/>
      <div style={{flex:1, minWidth:0}}>
        <div style={{fontSize:12.5, fontWeight:600, lineHeight:1.1, fontFamily:'inherit'}}>Alice Koa</div>
        <div style={{fontSize:10.5, color:'var(--muted-foreground)',
          fontFamily:'JetBrains Mono, ui-monospace, monospace', letterSpacing:'0.04em'}}>
          <span style={{color:'var(--success)'}}>●</span> online · kauai.pinai
        </div>
      </div>
      <IconBtn>{Icons.mic}</IconBtn>
      <IconBtn>{Icons.headset}</IconBtn>
      <IconBtn>{Icons.settings}</IconBtn>
    </div>
  );
}

function Avatar({ name, color, size = 32, dot, square }) {
  return (
    <div style={{position:'relative', width:size, height:size, flexShrink:0}}>
      <div style={{
        width:'100%', height:'100%',
        borderRadius: square ? 'var(--radius-sm)' : '50%',
        background: color || 'var(--muted)',
        display:'flex', alignItems:'center', justifyContent:'center',
        color: 'oklch(0.18 0.008 60)', fontSize: size*0.42, fontWeight:600,
        fontFamily:'var(--serif, Fraunces), serif',
      }}>{name?.[0]}</div>
      {dot && (
        <div style={{position:'absolute', right:-1, bottom:-1, width:10, height:10,
          borderRadius:'50%', border:'2px solid var(--card)',
          background: dot==='online' ? 'var(--success)' : dot==='voice' ? 'var(--voice)' : 'var(--muted-foreground)'}}/>
      )}
    </div>
  );
}

function IconBtn({ children, active, onClick, danger, tone = 'ghost' }) {
  const bg = tone==='solid' ? 'var(--muted)' : 'transparent';
  return (
    <button onClick={onClick} style={{
      width:30, height:30, borderRadius:'var(--radius-sm)', border:'none',
      background: active ? 'var(--muted)' : bg,
      color: danger ? 'var(--destructive)' : active ? 'var(--foreground)' : 'var(--muted-foreground)',
      cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
      fontFamily:'inherit',
    }}>{children}</button>
  );
}

Object.assign(window, { ServerRail, UserBar, Avatar, IconBtn });
