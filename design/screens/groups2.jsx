// Group conversations — the MANAGE flow.
// Built on helpers from groups.jsx (on window): GroupSidebar, AvatarStack,
// ServerTag, PickRow, Check, MemberChip, Scrim, ModalHead, PEOPLE, YOU,
// Globe, Crown, UserPlus, isFederated.
//
// Covers: the created group (end state), the members panel where add/remove
// live, the add-members picker, the admin remove confirmation, and the
// fork case — adding someone to a 1:1 starts a NEW group and leaves the
// private two-person conversation untouched.

// ── The group conversation main area (header + thread) ──────────────────
function GroupChatBase({ panelOpen, panelProps }) {
  const members = [YOU, PEOPLE.maia, PEOPLE.kai, PEOPLE.tane];
  return (
    <div style={{flex:1, display:'flex', flexDirection:'column', minWidth:0}}>
      {/* group thread header */}
      <div style={{height:60, borderBottom:'1px solid var(--border)', padding:'0 22px',
        display:'flex', alignItems:'center', gap:14}}>
        <AvatarStack people={[PEOPLE.maia, PEOPLE.kai, PEOPLE.tane]} size={34} max={3} ring="var(--background)"/>
        <div style={{minWidth:0}}>
          <div style={{display:'flex', alignItems:'center', gap:8}}>
            <Serif style={{fontSize:17, fontWeight:450}}>Maia, Kai &amp; Tane</Serif>
          </div>
          <div style={{fontSize:11, color:'var(--muted-foreground)',
            fontFamily:'JetBrains Mono, monospace', letterSpacing:'0.04em',
            display:'flex', alignItems:'center', gap:6}}>
            4 members · 2 online
            <span style={{color:'var(--border-strong)'}}>·</span>
            <span style={{display:'inline-flex', alignItems:'center', gap:4, color:'var(--chat)'}}>
              <Globe size={10}/> 2 federated
            </span>
          </div>
        </div>
        <div style={{flex:1}}/>
        <IconBtn>{Icons.headset}</IconBtn>
        {/* members button — opens the panel */}
        <button title="Members" style={{height:30, padding:'0 10px', borderRadius:'var(--radius-sm)',
          border: panelOpen ? '1px solid var(--chat)' : '1px solid var(--border)',
          background: panelOpen ? 'color-mix(in oklab, var(--chat) 14%, transparent)' : 'transparent',
          color: panelOpen ? 'var(--chat)' : 'var(--muted-foreground)', cursor:'pointer',
          display:'flex', alignItems:'center', gap:7, fontFamily:'inherit', fontSize:12.5}}>
          {Icons.users}<span>4</span>
        </button>
        <IconBtn>{Icons.more}</IconBtn>
      </div>

      {/* body — thread + (optional) members panel, both BELOW the header
          so the panel lives only inside the chat, not the top bar */}
      <div style={{flex:1, display:'flex', minHeight:0}}>
       <div style={{flex:1, display:'flex', flexDirection:'column', minWidth:0}}>
      {/* messages */}
      <div style={{flex:1, overflow:'hidden', padding:'24px 28px 16px',
        display:'flex', flexDirection:'column', gap:2}}>
        {/* system: group created */}
        <SystemLine>
          <Serif style={{color:'var(--foreground)', fontWeight:500}}>Alice</Serif> created the group ·
          added <b style={{fontWeight:500, color:'var(--foreground)'}}>Maia</b>,
          <b style={{fontWeight:500, color:'var(--foreground)'}}> Kai</b> and
          <b style={{fontWeight:500, color:'var(--foreground)'}}> Tane</b>
        </SystemLine>

        <GMsg first name="Maia" color="oklch(0.72 0.07 330)" time="14:21" server="studio.pinai">
          <p style={{margin:0}}>A room of our own — love it. Hi from studio.pinai 👋</p>
        </GMsg>
        <GMsg first name="Kai" color="oklch(0.74 0.06 200)" time="14:22" server="lab.pinai">
          <p style={{margin:0}}>Federation working a treat. I'll drop the build notes here.</p>
        </GMsg>
        <GMsg first self name="Alice" color="var(--chat)" time="14:24">
          <p style={{margin:0}}>Perfect. Keeping everything for the launch in this one thread.</p>
        </GMsg>
        <GMsg first name="Tane" color="oklch(0.72 0.07 25)" time="14:25" server="kauai.pinai">
          <p style={{margin:0}}>👌 here for it</p>
        </GMsg>
      </div>

      {/* composer (condensed) */}
      <div style={{padding:'0 22px 20px'}}>
        <div style={{border:'1px solid var(--border-strong)', borderRadius:'var(--radius-lg)',
          background:'var(--card)', padding:'10px', display:'flex', alignItems:'center', gap:10}}>
          <IconBtn>{Icons.plusCircle}</IconBtn>
          <div style={{flex:1, fontSize:13.5, color:'var(--muted-foreground)'}}>Message the group…</div>
          <button style={{width:32, height:28, border:'none', borderRadius:'var(--radius-sm)',
            background:'var(--chat)', color:'var(--primary-foreground)', cursor:'pointer',
            display:'flex', alignItems:'center', justifyContent:'center'}}>{Icons.send}</button>
        </div>
      </div>
       </div>
       {panelOpen && <MembersPanel {...(panelProps || {})}/>}
      </div>
    </div>
  );
}

function SystemLine({ children }) {
  return (
    <div style={{display:'flex', alignItems:'center', gap:12, margin:'4px 0 14px',
      fontSize:11.5, color:'var(--muted-foreground)'}}>
      <div style={{flex:1, height:1, background:'var(--border)'}}/>
      <span style={{textAlign:'center', maxWidth:440, lineHeight:1.5}}>{children}</span>
      <div style={{flex:1, height:1, background:'var(--border)'}}/>
    </div>
  );
}

function GMsg({ first, self, name, color, time, server, children }) {
  const fed = server && server !== HOME_SERVER;
  return (
    <div style={{display:'flex', gap:14, padding: first ? '12px 0 2px' : '0 0 2px 54px', alignItems:'flex-start'}}>
      {first && <Avatar name={name} color={color} size={40} dot={self ? undefined : 'online'}/>}
      <div style={{flex:1, minWidth:0}}>
        {first && (
          <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:3}}>
            <Serif style={{fontSize:14.5, fontWeight:500, color: self ? 'var(--chat)' : 'var(--foreground)'}}>{name}</Serif>
            {fed && <ServerTag server={server} size="sm"/>}
            <Mono style={{fontSize:10.5, color:'var(--muted-foreground)'}}>{time}</Mono>
          </div>
        )}
        <div style={{fontSize:13.5, lineHeight:1.55, color:'var(--foreground)'}}>{children}</div>
      </div>
    </div>
  );
}

// ── Members panel (docked inside the chat area, below the thread header) —
//    shown to everyone in the conversation. Lists members; each row has a
//    single "⋯" that opens a popover of actions. ───────────────────────────
function MembersPanel({ activeName = 'Maia', menuFor, isAdmin = true }) {
  const roster = [
    { p: YOU, role:'admin', you:true },
    { p: PEOPLE.maia, role:'member' },
    { p: PEOPLE.kai,  role:'member' },
    { p: PEOPLE.tane, role:'member' },
  ];
  return (
    <div style={{width:284, borderLeft:'1px solid var(--border)', background:'var(--background)',
      display:'flex', flexDirection:'column', flexShrink:0}}>
      {/* panel header — sits inside the chat body, not the top bar */}
      <div style={{padding:'14px 14px 12px 18px', display:'flex', alignItems:'center',
        justifyContent:'space-between', flexShrink:0}}>
        <div style={{display:'flex', alignItems:'baseline', gap:8}}>
          <Serif style={{fontSize:16, fontWeight:450}}>Members</Serif>
          <Mono style={{fontSize:10.5, color:'var(--muted-foreground)'}}>4 of 10</Mono>
        </div>
        {isAdmin && (
          <button title="Add people" style={{width:30, height:30, borderRadius:'var(--radius-sm)',
            border:'1px solid var(--border)', background:'transparent', color:'var(--chat)',
            cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center'}}>
            <UserPlus size={16}/>
          </button>
        )}
      </div>

      {/* roster */}
      <div style={{flex:1, overflow:'auto', padding:'10px 8px'}}>
        <Mono style={{fontSize:9, letterSpacing:'0.14em', textTransform:'uppercase',
          color:'var(--muted-foreground)', padding:'4px 10px 6px', display:'block'}}>Admin</Mono>
        {roster.filter(r => r.role==='admin').map((r,i) => (
          <RosterRow key={i} {...r} active={activeName === (r.you ? 'You' : r.p.name)} isAdmin={isAdmin}/>
        ))}
        <Mono style={{fontSize:9, letterSpacing:'0.14em', textTransform:'uppercase',
          color:'var(--muted-foreground)', padding:'14px 10px 6px', display:'block'}}>Members</Mono>
        {roster.filter(r => r.role==='member').map((r,i) => (
          <RosterRow key={i} {...r} active={activeName === r.p.name}
            showMenu={menuFor === r.p.name} isAdmin={isAdmin}/>
        ))}
      </div>

      {/* leave */}
      <div style={{padding:'12px 14px', borderTop:'1px solid var(--border)'}}>
        <button style={{width:'100%', padding:'9px', borderRadius:'var(--radius)',
          border:'1px solid var(--border)', background:'transparent', color:'var(--destructive)',
          cursor:'pointer', fontFamily:'inherit', fontSize:12.5,
          display:'flex', alignItems:'center', justifyContent:'center', gap:8}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
          Leave group
        </button>
      </div>
    </div>
  );
}

function RosterRow({ p, role, you, active, showMenu, isAdmin }) {
  const highlight = active || showMenu;
  return (
    <div style={{position:'relative'}}>
      <div style={{display:'flex', alignItems:'center', gap:11, padding:'8px 10px',
        borderRadius:'var(--radius-sm)',
        background: highlight ? 'color-mix(in oklab, var(--chat) 9%, transparent)' : 'transparent'}}>
        <Avatar name={p.name} color={p.color} size={34} dot={p.dot}/>
        <div style={{flex:1, minWidth:0}}>
          <div style={{display:'flex', alignItems:'center', gap:7}}>
            <Serif style={{fontSize:14, fontWeight:450, whiteSpace:'nowrap'}}>{you ? 'You' : p.name}</Serif>
            {role==='admin' && (
              <span style={{display:'inline-flex', alignItems:'center', gap:3, color:'var(--voice)',
                fontSize:10, fontFamily:'JetBrains Mono, monospace', letterSpacing:'0.04em'}}>
                <Crown size={10}/> admin
              </span>
            )}
          </div>
          <div style={{marginTop:2}}><ServerTag server={p.server} size="sm"/></div>
        </div>

        {/* one action button — opens the actions popover */}
        {!you && (
          <button title="Actions" style={{width:28, height:28, borderRadius:'50%', flexShrink:0,
            border: showMenu ? '1px solid var(--border-strong)' : '1px solid transparent',
            background: showMenu ? 'var(--card)' : 'transparent', cursor:'pointer',
            color:'var(--muted-foreground)', display:'flex', alignItems:'center', justifyContent:'center'}}>
            {Icons.more}
          </button>
        )}
      </div>

      {/* actions popover */}
      {showMenu && (
        <div style={{position:'absolute', right:8, top:46, width:210, zIndex:20,
          background:'var(--popover)', border:'1px solid var(--border-strong)',
          borderRadius:'var(--radius)', boxShadow:'0 18px 50px -16px rgba(0,0,0,0.6)', padding:5}}>
          <MenuLine icon={
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16v10H9l-4 4V6z"/></svg>
          } label="Message privately"/>
          <MenuLine icon={
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3z"/></svg>
          } label="Call"/>
          <MenuLine icon={
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="3.5"/><path d="M5 21c0-3.9 3.1-7 7-7s7 3.1 7 7"/></svg>
          } label="See profile"/>
          {isAdmin && (<>
            <div style={{height:1, background:'var(--border)', margin:'5px 4px'}}/>
            <MenuLine icon={<Crown size={15}/>} label="Make admin"/>
            <MenuLine icon={
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.3 2.7-6 6-6 1 0 1.9.2 2.7.6"/><path d="M15 14h6"/></svg>
            } label="Remove from group" danger/>
          </>)}
        </div>
      )}
    </div>
  );
}

function MenuLine({ icon, label, danger }) {
  return (
    <div style={{display:'flex', alignItems:'center', gap:10, padding:'8px 10px',
      borderRadius:'var(--radius-sm)', cursor:'pointer', fontSize:13,
      color: danger ? 'var(--destructive)' : 'var(--foreground)'}}>
      <span style={{display:'flex', color: danger ? 'var(--destructive)' : 'var(--muted-foreground)'}}>{icon}</span>
      {label}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 4 · CREATED — the new group, end state (panel closed)
// ─────────────────────────────────────────────────────────────────────────
function GroupCreated() {
  return (
    <Artboard w={1200} h={780} style={{display:'flex', position:'relative'}}>
      <ServerRail active="home"/>
      <GroupSidebar groupRow="top" activeName="__group"/>
      <GroupChatBase/>
    </Artboard>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 5 · MEMBERS PANEL open (add/remove entry, admin controls)
// ─────────────────────────────────────────────────────────────────────────
function GroupMembersPanel() {
  return (
    <Artboard w={1200} h={780} style={{display:'flex', position:'relative'}}>
      <ServerRail active="home"/>
      <GroupSidebar groupRow="top" activeName="__group"/>
      <GroupChatBase panelOpen panelProps={{ menuFor:'Maia' }}/>
    </Artboard>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 6 · ADD MEMBERS — picker reopened in "add" mode over the group
// ─────────────────────────────────────────────────────────────────────────
function GroupAddMembers() {
  return (
    <Artboard w={1200} h={780} style={{display:'flex', position:'relative'}}>
      <ServerRail active="home"/>
      <GroupSidebar groupRow="top" activeName="__group"/>
      <GroupChatBase panelOpen/>

      <Scrim>
        <div style={{width:540, borderRadius:'var(--radius-xl)', overflow:'hidden',
          background:'var(--popover)', border:'1px solid var(--border-strong)',
          boxShadow:'0 40px 100px -24px rgba(0,0,0,0.7)', display:'flex', flexDirection:'column',
          maxHeight:560}}>
          <ModalHead eyebrow="Maia, Kai & Tane · 4 of 10" title="Add people"/>

          <div style={{padding:'12px 16px', display:'flex', alignItems:'center', gap:10,
            borderBottom:'1px solid var(--border)'}}>
            <span style={{color:'var(--muted-foreground)'}}>{Icons.search}</span>
            <input placeholder="Search friends, or paste @user@server"
              style={{flex:1, background:'transparent', border:'none', outline:'none',
                color:'var(--foreground)', fontSize:13.5, fontFamily:'inherit'}}/>
          </div>

          <div style={{flex:1, overflow:'auto', padding:'10px 10px', minHeight:0}}>
            <Mono style={{fontSize:9.5, letterSpacing:'0.12em', textTransform:'uppercase',
              color:'var(--muted-foreground)', padding:'4px 10px', display:'block'}}>Suggested</Mono>
            <PickRow p={PEOPLE.bob} selected/>
            <PickRow p={PEOPLE.jun} selected/>
            <PickRow p={PEOPLE.noa}/>
            <Mono style={{fontSize:9.5, letterSpacing:'0.12em', textTransform:'uppercase',
              color:'var(--muted-foreground)', padding:'12px 10px 4px', display:'block'}}>Already in this group</Mono>
            <PickRow p={PEOPLE.maia} disabled/>
            <PickRow p={PEOPLE.tane} disabled/>
          </div>

          <div style={{padding:'14px 16px', borderTop:'1px solid var(--border)'}}>
            <div style={{display:'flex', alignItems:'flex-start', gap:8, marginBottom:12,
              fontSize:11.5, color:'var(--muted-foreground)', lineHeight:1.5}}>
              <span style={{color:'var(--muted-foreground)', marginTop:1}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></svg>
              </span>
              <span>New members join the same conversation and see messages from here on.</span>
            </div>
            <div style={{display:'flex', gap:10}}>
              <button style={{padding:'11px 16px', borderRadius:'var(--radius)', background:'transparent',
                color:'var(--foreground)', border:'1px solid var(--border-strong)', cursor:'pointer',
                fontSize:13, fontFamily:'inherit'}}>Cancel</button>
              <button style={{flex:1, padding:'11px', borderRadius:'var(--radius)', background:'var(--chat)',
                color:'var(--primary-foreground)', border:'none', cursor:'pointer', fontWeight:600,
                fontSize:13.5, fontFamily:'inherit',
                boxShadow:'0 1px 0 rgba(255,255,255,0.15) inset, 0 8px 24px -10px color-mix(in oklab, var(--chat) 45%, transparent)'}}>
                Add 2 people
              </button>
            </div>
          </div>
        </div>
      </Scrim>
    </Artboard>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 7 · REMOVE MEMBER — admin confirmation
// ─────────────────────────────────────────────────────────────────────────
function GroupRemoveMember() {
  return (
    <Artboard w={1200} h={780} style={{display:'flex', position:'relative'}}>
      <ServerRail active="home"/>
      <GroupSidebar groupRow="top" activeName="__group"/>
      <GroupChatBase panelOpen panelProps={{ activeName:'Tane', menuFor:'Tane' }}/>

      <Scrim>
        <div style={{width:420, borderRadius:'var(--radius-xl)', overflow:'hidden',
          background:'var(--popover)', border:'1px solid var(--border-strong)',
          boxShadow:'0 40px 100px -24px rgba(0,0,0,0.7)'}}>
          <div style={{padding:'24px 24px 0', display:'flex', flexDirection:'column', alignItems:'center',
            textAlign:'center'}}>
            <div style={{position:'relative', marginBottom:14}}>
              <Avatar name="Tane" color="oklch(0.72 0.07 25)" size={56}/>
              <div style={{position:'absolute', right:-4, bottom:-4, width:24, height:24,
                borderRadius:'50%', background:'var(--destructive)', border:'3px solid var(--popover)',
                display:'flex', alignItems:'center', justifyContent:'center', color:'white'}}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2.6" strokeLinecap="round"><path d="M5 12h14"/></svg>
              </div>
            </div>
            <Serif style={{fontSize:21, fontWeight:450, letterSpacing:'-0.01em'}}>Remove Tane?</Serif>
            <p style={{margin:'10px 0 0', fontSize:13.5, color:'var(--muted-foreground)', lineHeight:1.6}}>
              Tane will be removed from <b style={{color:'var(--foreground)', fontWeight:500}}>Maia, Kai &amp; Tane</b> and
              won't see new messages. Earlier messages stay with the group.
            </p>
          </div>
          <div style={{padding:'20px 24px 24px', display:'flex', gap:10}}>
            <button style={{flex:1, padding:'11px', borderRadius:'var(--radius)', background:'transparent',
              color:'var(--foreground)', border:'1px solid var(--border-strong)', cursor:'pointer',
              fontSize:13, fontFamily:'inherit'}}>Cancel</button>
            <button style={{flex:1, padding:'11px', borderRadius:'var(--radius)',
              background:'var(--destructive)', color:'white', border:'none', cursor:'pointer',
              fontWeight:600, fontSize:13, fontFamily:'inherit'}}>Remove</button>
          </div>
        </div>
      </Scrim>
    </Artboard>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 8 · THE FORK CASE — adding to a 1:1 starts a NEW group
//     The private (two-person) conversation can't be mutated, so this is
//     framed as creating a new conversation that keeps the original intact.
// ─────────────────────────────────────────────────────────────────────────
function DMChatBase() {
  return (
    <div style={{flex:1, display:'flex', flexDirection:'column', minWidth:0}}>
      <div style={{height:60, borderBottom:'1px solid var(--border)', padding:'0 22px',
        display:'flex', alignItems:'center', gap:14}}>
        <Avatar name="Maia" color="oklch(0.72 0.07 330)" size={34} dot="voice"/>
        <div>
          <Serif style={{fontSize:17, fontWeight:450}}>Maia</Serif>
          <div style={{fontSize:11, color:'var(--muted-foreground)',
            fontFamily:'JetBrains Mono, monospace', letterSpacing:'0.04em'}}>
            <span style={{color:'var(--voice)'}}>●</span> in voice · maia@studio.pinai
          </div>
        </div>
        <div style={{flex:1}}/>
        <IconBtn>{Icons.headset}</IconBtn>
        {/* the affordance that triggers the fork */}
        <button title="Add people" style={{height:30, padding:'0 11px', borderRadius:'var(--radius-sm)',
          border:'1px solid var(--chat)', background:'color-mix(in oklab, var(--chat) 14%, transparent)',
          color:'var(--chat)', cursor:'pointer', display:'flex', alignItems:'center', gap:7,
          fontFamily:'inherit', fontSize:12.5}}>
          <UserPlus size={15}/> Add people
        </button>
        <IconBtn>{Icons.more}</IconBtn>
      </div>
      <div style={{flex:1, overflow:'hidden', padding:'24px 28px 16px',
        display:'flex', flexDirection:'column', gap:2}}>
        <GMsg first name="Maia" color="oklch(0.72 0.07 330)" time="13:48">
          <p style={{margin:0}}>The launch plan looks tight — should we pull Kai and Tane in?</p>
        </GMsg>
        <GMsg first self name="Alice" color="var(--chat)" time="13:50">
          <p style={{margin:0}}>Good idea, let me add them.</p>
        </GMsg>
      </div>
      <div style={{padding:'0 22px 20px'}}>
        <div style={{border:'1px solid var(--border-strong)', borderRadius:'var(--radius-lg)',
          background:'var(--card)', padding:'10px', display:'flex', alignItems:'center', gap:10}}>
          <IconBtn>{Icons.plusCircle}</IconBtn>
          <div style={{flex:1, fontSize:13.5, color:'var(--muted-foreground)'}}>Message Maia…</div>
          <button style={{width:32, height:28, border:'none', borderRadius:'var(--radius-sm)',
            background:'var(--chat)', color:'var(--primary-foreground)', cursor:'pointer',
            display:'flex', alignItems:'center', justifyContent:'center'}}>{Icons.send}</button>
        </div>
      </div>
    </div>
  );
}

function GroupForkFromDM() {
  return (
    <Artboard w={1200} h={780} style={{display:'flex', position:'relative'}}>
      <ServerRail active="home"/>
      <GroupSidebar activeName="Maia"/>
      <DMChatBase/>

      <Scrim>
        <div style={{width:520, borderRadius:'var(--radius-xl)', overflow:'hidden',
          background:'var(--popover)', border:'1px solid var(--border-strong)',
          boxShadow:'0 40px 100px -24px rgba(0,0,0,0.7)'}}>
          {/* explanatory header band */}
          <div style={{padding:'20px 22px', background:'color-mix(in oklab, var(--chat) 10%, var(--popover))',
            borderBottom:'1px solid var(--border)', display:'flex', gap:14}}>
            <div style={{width:38, height:38, borderRadius:'50%', flexShrink:0,
              background:'color-mix(in oklab, var(--chat) 22%, transparent)', color:'var(--chat)',
              display:'flex', alignItems:'center', justifyContent:'center'}}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 3v12M6 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9c0 6-12 3-12 6"/></svg>
            </div>
            <div>
              <Serif as="h2" style={{fontSize:19, fontWeight:450, margin:0, letterSpacing:'-0.01em'}}>
                This starts a new conversation
              </Serif>
              <p style={{margin:'7px 0 0', fontSize:12.5, color:'var(--muted-foreground)', lineHeight:1.55}}>
                Your chat with <b style={{color:'var(--foreground)', fontWeight:500}}>Maia</b> is private — just the
                two of you. Adding someone creates a separate group, and your one-to-one stays exactly as it is.
              </p>
            </div>
          </div>

          {/* before → after diagram */}
          <div style={{padding:'20px 22px', display:'flex', alignItems:'center', gap:16}}>
            <div style={{flex:1, padding:'12px', borderRadius:'var(--radius)', border:'1px solid var(--border)',
              background:'var(--card)'}}>
              <Mono style={{fontSize:9, letterSpacing:'0.12em', textTransform:'uppercase',
                color:'var(--muted-foreground)', display:'block', marginBottom:9}}>Stays</Mono>
              <div style={{display:'flex', alignItems:'center', gap:10}}>
                <Avatar name="Maia" color="oklch(0.72 0.07 330)" size={30} square/>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:13, fontWeight:500}}>Maia</div>
                  <Mono style={{fontSize:10, color:'var(--muted-foreground)'}}>private · 1:1</Mono>
                </div>
              </div>
            </div>
            <span style={{color:'var(--muted-foreground)', flexShrink:0}}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
            </span>
            <div style={{flex:1, padding:'12px', borderRadius:'var(--radius)',
              border:'1px solid color-mix(in oklab, var(--chat) 40%, var(--border))',
              background:'color-mix(in oklab, var(--chat) 8%, var(--card))'}}>
              <Mono style={{fontSize:9, letterSpacing:'0.12em', textTransform:'uppercase',
                color:'var(--chat)', display:'block', marginBottom:9}}>New group</Mono>
              <div style={{display:'flex', alignItems:'center', gap:10}}>
                <AvatarStack people={[PEOPLE.maia, PEOPLE.kai, PEOPLE.tane]} size={28} max={3}
                  ring="color-mix(in oklab, var(--chat) 8%, var(--card))"/>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:13, fontWeight:500}}>Maia + 2</div>
                  <Mono style={{fontSize:10, color:'var(--muted-foreground)'}}>you're admin</Mono>
                </div>
              </div>
            </div>
          </div>

          {/* who to add */}
          <div style={{padding:'0 22px 4px'}}>
            <Mono style={{fontSize:9.5, letterSpacing:'0.12em', textTransform:'uppercase',
              color:'var(--muted-foreground)', display:'block', marginBottom:6}}>Bring along</Mono>
            <div style={{display:'flex', flexWrap:'wrap', gap:8, marginBottom:6}}>
              <MemberChip p={{...PEOPLE.maia, name:'Maia'}} onRemove={false}/>
              <MemberChip p={PEOPLE.kai}/>
              <MemberChip p={PEOPLE.tane}/>
              <span style={{display:'inline-flex', alignItems:'center', gap:6, padding:'4px 12px',
                borderRadius:999, border:'1px dashed var(--border-strong)', color:'var(--muted-foreground)',
                fontSize:12, cursor:'pointer'}}>{Icons.plus} Add more</span>
            </div>
          </div>

          <div style={{padding:'16px 22px 22px', display:'flex', gap:10}}>
            <button style={{padding:'11px 16px', borderRadius:'var(--radius)', background:'transparent',
              color:'var(--foreground)', border:'1px solid var(--border-strong)', cursor:'pointer',
              fontSize:13, fontFamily:'inherit'}}>Cancel</button>
            <button style={{flex:1, padding:'11px', borderRadius:'var(--radius)', background:'var(--chat)',
              color:'var(--primary-foreground)', border:'none', cursor:'pointer', fontWeight:600,
              fontSize:13.5, fontFamily:'inherit',
              boxShadow:'0 1px 0 rgba(255,255,255,0.15) inset, 0 8px 24px -10px color-mix(in oklab, var(--chat) 45%, transparent)'}}>
              Create group with 3 →
            </button>
          </div>
        </div>
      </Scrim>
    </Artboard>
  );
}

Object.assign(window, {
  GroupChatBase, GMsg, SystemLine, MembersPanel, RosterRow, MenuLine, DMChatBase,
  GroupCreated, GroupMembersPanel, GroupAddMembers, GroupRemoveMember, GroupForkFromDM,
});
