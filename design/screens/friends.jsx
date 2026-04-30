// Screen 2: Friends (refined list view, redesigned chrome)
function FriendsScreen() {
  const [filter, setFilter] = React.useState('All');
  return (
    <Artboard w={1200} h={780} style={{display:'flex'}}>
      <ServerRail active="home"/>
      {/* Sidebar */}
      <div style={{width:260, borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', background:'var(--background)'}}>
        <div style={{padding:'14px 12px 10px'}}>
          <div style={{
            display:'flex', alignItems:'center', gap:8, padding:'0 10px', height:34,
            background:'var(--input)', borderRadius:'var(--radius-sm)', border:'1px solid var(--border)',
            color:'var(--muted-foreground)', fontSize:12,
          }}>
            {Icons.search}
            <span>Find or start a conversation</span>
            <span style={{marginLeft:'auto', fontFamily:'JetBrains Mono, monospace', fontSize:10,
              padding:'2px 5px', background:'var(--muted)', borderRadius:4}}>⌘K</span>
          </div>
        </div>

        <div style={{padding:'4px 8px'}}>
          <NavItem icon={Icons.users} label="Friends" active badge="2"/>
          <NavItem icon={Icons.sparkle} label="Discover"/>
          <NavItem icon={Icons.pin} label="Pinned"/>
        </div>

        <SectionHead>Direct Messages <span style={{opacity:0.4}}>· 3</span></SectionHead>
        <div style={{padding:'0 8px', flex:1, overflow:'hidden'}}>
          <DMItem name="Bob" color="oklch(0.75 0.06 70)" preview="thinking about the meeting" time="2m" dot="online"/>
          <DMItem name="Maia" color="oklch(0.72 0.07 330)" preview="you: sounds good" time="1h" dot="voice" unread={4}/>
          <DMItem name="Jules & Kai" color="oklch(0.74 0.06 200)" preview="Kai: pushed a fix" time="3h"/>
          <DMItem name="Tane" color="oklch(0.72 0.07 25)" preview="photos from the trip" time="yd"/>
        </div>
        <UserBar/>
      </div>

      {/* Main */}
      <div style={{flex:1, display:'flex', flexDirection:'column'}}>
        <TopBar title="Friends" subtitle="Manage the people you keep close."/>

        <div style={{padding:'22px 32px 14px', display:'flex', alignItems:'center', justifyContent:'space-between'}}>
          <div style={{display:'flex', gap:4, padding:3, background:'var(--muted)', borderRadius:'var(--radius-sm)'}}>
            {['All','Online','Pending','Blocked'].map(t => (
              <button key={t} onClick={()=>setFilter(t)} style={{
                padding:'7px 14px', borderRadius:'calc(var(--radius-sm) - 1px)', border:'none',
                cursor:'pointer', fontSize:12,
                background: filter===t ? 'var(--card)' : 'transparent',
                color: filter===t ? 'var(--foreground)' : 'var(--muted-foreground)',
                fontWeight: filter===t ? 500 : 400,
                fontFamily:'inherit',
                boxShadow: filter===t ? '0 1px 2px rgba(0,0,0,0.25)' : 'none',
              }}>
                {t}{t==='Pending' && <span style={{marginLeft:6, color:'var(--voice)'}}>2</span>}
              </button>
            ))}
          </div>
          <button style={{
            padding:'8px 16px', borderRadius:'var(--radius-sm)', border:'none',
            background:'var(--chat)', color:'var(--primary-foreground)', fontWeight:600, fontSize:12.5,
            fontFamily:'inherit', cursor:'pointer',
          }}>+ Add Friend</button>
        </div>

        <div style={{padding:'4px 32px 10px', display:'flex', alignItems:'center', justifyContent:'space-between',
          fontFamily:'JetBrains Mono, monospace', fontSize:10, letterSpacing:'0.12em',
          color:'var(--muted-foreground)', textTransform:'uppercase', borderBottom:'1px solid var(--border)', paddingBottom:10}}>
          <span>Online — 3</span>
          <span>Showing {filter.toLowerCase()}</span>
        </div>

        <div style={{flex:1, overflow:'auto', padding:'6px 16px'}}>
          <FriendRow name="Bob" handle="bob@kauai.pinai" status="Working on the lantern prototype" color="oklch(0.75 0.06 70)" dot="online"/>
          <FriendRow name="Maia" handle="maia@studio.pinai" status="In voice · Design Lab" color="oklch(0.72 0.07 330)" dot="voice" inVoice/>
          <FriendRow name="Kai" handle="kai@lab.pinai" status="—" color="oklch(0.74 0.06 200)" dot="online" mutual={4}/>
          <FriendRow name="Jules" handle="jules@studio.pinai" status="Idle — listening" color="oklch(0.70 0.05 260)" dot="idle"/>
          <FriendRow name="Tane" handle="tane@lab.pinai" status="Offline · last seen yesterday" color="oklch(0.72 0.07 25)" offline/>
        </div>
      </div>
    </Artboard>
  );
}

function SectionHead({ children }) {
  return (
    <div style={{padding:'14px 18px 6px', fontFamily:'JetBrains Mono, monospace',
      fontSize:10, letterSpacing:'0.12em', color:'var(--muted-foreground)', textTransform:'uppercase',
      display:'flex', alignItems:'center', justifyContent:'space-between'}}>
      <span>{children}</span>
      <span style={{cursor:'pointer'}}>＋</span>
    </div>
  );
}

function NavItem({ icon, label, active, badge }) {
  return (
    <div style={{
      display:'flex', alignItems:'center', gap:10, padding:'7px 10px',
      borderRadius:'var(--radius-sm)', cursor:'pointer', marginBottom:1,
      background: active ? 'color-mix(in oklab, var(--chat) 16%, transparent)' : 'transparent',
      color: active ? 'var(--chat)' : 'var(--muted-foreground)',
      fontSize:13, fontWeight: active ? 500 : 400,
    }}>
      {icon}<span style={{flex:1}}>{label}</span>
      {badge && <span style={{fontSize:10, padding:'1px 6px', borderRadius:10,
        background: active ? 'var(--chat)' : 'var(--muted)',
        color: active ? 'var(--primary-foreground)' : 'var(--muted-foreground)'}}>{badge}</span>}
    </div>
  );
}

function DMItem({ name, color, preview, time, dot, unread }) {
  return (
    <div style={{
      display:'flex', alignItems:'center', gap:10, padding:'7px 8px',
      borderRadius:'var(--radius-sm)', cursor:'pointer', marginBottom:1,
    }}>
      <Avatar name={name} color={color} size={30} dot={dot} square/>
      <div style={{flex:1, minWidth:0}}>
        <div style={{display:'flex', justifyContent:'space-between', gap:6}}>
          <div style={{fontSize:13, fontWeight: unread ? 600 : 500, color:'var(--foreground)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{name}</div>
          <div style={{fontSize:10.5, color:'var(--muted-foreground)', fontFamily:'JetBrains Mono, monospace'}}>{time}</div>
        </div>
        <div style={{fontSize:11.5, color: unread ? 'var(--foreground)' : 'var(--muted-foreground)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>
          {preview}
        </div>
      </div>
      {unread && <span style={{fontSize:10, minWidth:16, height:16, padding:'0 5px',
        borderRadius:10, background:'var(--chat)', color:'var(--primary-foreground)',
        display:'flex', alignItems:'center', justifyContent:'center', fontWeight:600}}>{unread}</span>}
    </div>
  );
}

function TopBar({ title, subtitle }) {
  return (
    <div style={{
      height:60, borderBottom:'1px solid var(--border)', padding:'0 24px',
      display:'flex', alignItems:'center', gap:16,
    }}>
      <span style={{color:'var(--muted-foreground)'}}>{Icons.users}</span>
      <Serif as="h1" style={{fontSize:20, fontWeight:450, margin:0, letterSpacing:'-0.01em'}}>{title}</Serif>
      <div style={{width:1, height:18, background:'var(--border)'}}/>
      <span style={{fontSize:12.5, color:'var(--muted-foreground)', fontStyle:'italic', fontFamily:'var(--serif, Fraunces), serif'}}>{subtitle}</span>
      <div style={{flex:1}}/>
      <IconBtn>{Icons.sun}</IconBtn>
      <IconBtn>{Icons.bell}</IconBtn>
      <IconBtn>{Icons.help}</IconBtn>
    </div>
  );
}

function FriendRow({ name, handle, status, color, dot, inVoice, mutual, offline }) {
  return (
    <div style={{
      display:'flex', alignItems:'center', gap:14, padding:'12px 16px',
      borderRadius:'var(--radius)', cursor:'pointer',
      opacity: offline ? 0.55 : 1,
      borderBottom:'1px solid color-mix(in oklab, var(--border) 40%, transparent)',
    }}>
      <Avatar name={name} color={color} size={40} dot={dot}/>
      <div style={{flex:1, minWidth:0}}>
        <div style={{display:'flex', alignItems:'baseline', gap:8}}>
          <Serif style={{fontSize:16, fontWeight:450}}>{name}</Serif>
          <Mono style={{fontSize:11, color:'var(--muted-foreground)'}}>{handle}</Mono>
          {mutual && <span style={{fontSize:10.5, color:'var(--muted-foreground)',
            padding:'1px 7px', border:'1px solid var(--border)', borderRadius:10}}>{mutual} mutual</span>}
        </div>
        <div style={{fontSize:12, color: inVoice ? 'var(--voice)' : 'var(--muted-foreground)', marginTop:3,
          display:'flex', alignItems:'center', gap:6}}>
          {inVoice && <span style={{color:'var(--voice)'}}>{Icons.waveform}</span>}
          {status}
        </div>
      </div>
      <IconBtn>{Icons.message}</IconBtn>
      {inVoice ? (
        <button style={{padding:'6px 12px', borderRadius:'var(--radius-sm)', border:'1px solid var(--voice)',
          background:'transparent', color:'var(--voice)', fontSize:12, cursor:'pointer', fontFamily:'inherit',
          display:'flex', alignItems:'center', gap:6}}>
          {Icons.headset} Join
        </button>
      ) : <IconBtn>{Icons.more}</IconBtn>}
    </div>
  );
}

window.FriendsScreen = FriendsScreen;
