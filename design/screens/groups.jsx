// Group conversations — shared helpers + the CREATE flow.
// Desktop. Reuses ServerRail / UserBar / Avatar / NavItem / SectionHead /
// DMItem / Icons / Serif / Mono from the app shell.
//
// Model note (per product): a "private" conversation isn't a setting — it's
// simply a conversation between exactly two people. You can't toggle privacy.
// So changing the membership of a 1:1 can't mutate it in place; it forks a
// brand-new group and leaves the original two-person thread untouched.
// (That fork case lives in groups2.jsx.)

// ── People & servers ────────────────────────────────────────────────────
const HOME_SERVER = 'kauai.pinai';
const YOU = { name:'Alice', color:'var(--chat)', server:'kauai.pinai', handle:'alice@kauai.pinai' };
const PEOPLE = {
  maia: { name:'Maia', color:'oklch(0.72 0.07 330)', server:'studio.pinai', handle:'maia@studio.pinai', dot:'voice',   mutual:7 },
  kai:  { name:'Kai',  color:'oklch(0.74 0.06 200)', server:'lab.pinai',    handle:'kai@lab.pinai',     dot:'online',  mutual:4 },
  tane: { name:'Tane', color:'oklch(0.72 0.07 25)',  server:'kauai.pinai',  handle:'tane@kauai.pinai',  dot:'online',  mutual:9 },
  bob:  { name:'Bob',  color:'oklch(0.75 0.06 70)',  server:'kauai.pinai',  handle:'bob@kauai.pinai',   dot:'offline', mutual:3 },
  jun:  { name:'Jun',  color:'oklch(0.70 0.08 150)', server:'studio.pinai', handle:'jun@studio.pinai',  dot:'online',  mutual:2 },
  noa:  { name:'Noa',  color:'oklch(0.73 0.07 280)', server:'kauai.pinai',  handle:'noa@kauai.pinai',   dot:'offline', mutual:5 },
};
const isFederated = (p) => p.server !== HOME_SERVER;

// ── Tiny glyphs not in the shared Icons set ─────────────────────────────
const Globe = ({ size = 11 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18"/>
  </svg>
);
const Crown = ({ size = 11 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <path d="M3 7l4 4 5-7 5 7 4-4-2 12H5L3 7z"/>
  </svg>
);
const UserPlus = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.3 2.7-6 6-6 1.2 0 2.3.3 3.2.9"/><path d="M18 11v6M15 14h6"/>
  </svg>
);

// ── Cross-server tag — federated members shown explicitly ───────────────
function ServerTag({ server, size = 'md' }) {
  const fed = server !== HOME_SERVER;
  const sm = size === 'sm';
  return (
    <span style={{display:'inline-flex', alignItems:'center', gap:4,
      fontFamily:'JetBrains Mono, monospace',
      fontSize: sm ? 9 : 9.5, letterSpacing:'0.04em',
      padding: sm ? '1px 6px' : '2px 7px', borderRadius:999,
      border:`1px solid ${fed ? 'color-mix(in oklab, var(--chat) 32%, var(--border))' : 'var(--border)'}`,
      background: fed ? 'color-mix(in oklab, var(--chat) 8%, transparent)' : 'transparent',
      color: fed ? 'var(--chat)' : 'var(--muted-foreground)'}}>
      {fed && <Globe size={sm ? 8.5 : 9.5}/>}
      {server}
    </span>
  );
}

// ── Stacked group avatar ────────────────────────────────────────────────
function AvatarStack({ people, size = 30, max = 4, ring = 'var(--card)' }) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <div style={{display:'flex', alignItems:'center'}}>
      {shown.map((p, i) => (
        <div key={i} style={{marginLeft: i ? -size*0.34 : 0, borderRadius:'50%',
          border:`2px solid ${ring}`, position:'relative', zIndex: shown.length - i}}>
          <Avatar name={p.name} color={p.color} size={size}/>
        </div>
      ))}
      {extra > 0 && (
        <div style={{marginLeft:-size*0.34, width:size, height:size, borderRadius:'50%',
          border:`2px solid ${ring}`, background:'var(--muted)', display:'flex',
          alignItems:'center', justifyContent:'center', fontSize:size*0.32,
          fontFamily:'JetBrains Mono, monospace', color:'var(--muted-foreground)'}}>
          +{extra}
        </div>
      )}
    </div>
  );
}

// ── Selected-member chip ────────────────────────────────────────────────
function MemberChip({ p, onRemove = true }) {
  return (
    <span style={{display:'inline-flex', alignItems:'center', gap:7,
      padding:'4px 6px 4px 4px', borderRadius:999,
      background:'var(--card)', border:'1px solid var(--border)'}}>
      <Avatar name={p.name} color={p.color} size={20}/>
      <span style={{fontSize:12, color:'var(--foreground)'}}>{p.name}</span>
      {onRemove && (
        <span style={{width:16, height:16, borderRadius:'50%', display:'flex',
          alignItems:'center', justifyContent:'center', cursor:'pointer',
          color:'var(--muted-foreground)', background:'var(--muted)'}}>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.6" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </span>
      )}
    </span>
  );
}

// ── Checkbox ────────────────────────────────────────────────────────────
function Check({ on, dim }) {
  return (
    <span style={{width:20, height:20, borderRadius:6, flexShrink:0,
      border:`1.5px solid ${on ? 'var(--chat)' : 'var(--border-strong)'}`,
      background: on ? 'var(--chat)' : 'transparent',
      opacity: dim ? 0.5 : 1,
      display:'flex', alignItems:'center', justifyContent:'center',
      color:'var(--primary-foreground)'}}>
      {on && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5 9-11"/></svg>}
    </span>
  );
}

// ── A picker result row ─────────────────────────────────────────────────
function PickRow({ p, selected, disabled, disabledNote }) {
  return (
    <div style={{display:'flex', alignItems:'center', gap:11, padding:'8px 10px',
      borderRadius:'var(--radius-sm)', cursor: disabled ? 'default' : 'pointer',
      background: selected ? 'color-mix(in oklab, var(--chat) 12%, transparent)' : 'transparent',
      opacity: disabled ? 0.55 : 1}}>
      <Avatar name={p.name} color={p.color} size={32} dot={p.dot}/>
      <div style={{flex:1, minWidth:0}}>
        <div style={{display:'flex', alignItems:'center', gap:8}}>
          <Serif style={{fontSize:14, fontWeight:450, color:'var(--foreground)'}}>{p.name}</Serif>
          <ServerTag server={p.server} size="sm"/>
        </div>
        <Mono style={{fontSize:10.5, color:'var(--muted-foreground)'}}>{p.handle}</Mono>
      </div>
      {disabled
        ? <Mono style={{fontSize:10, color:'var(--muted-foreground)', textTransform:'uppercase',
            letterSpacing:'0.08em'}}>{disabledNote || 'in group'}</Mono>
        : <Check on={selected}/>}
    </div>
  );
}

// ── Scrim + modal shell ─────────────────────────────────────────────────
function Scrim({ children, align = 'center' }) {
  return (
    <div style={{position:'absolute', inset:0, zIndex:40, display:'flex',
      alignItems: align === 'center' ? 'center' : 'stretch',
      justifyContent: align === 'right' ? 'flex-end' : 'center',
      background:'color-mix(in oklab, var(--background) 60%, transparent)',
      backdropFilter:'blur(3px)'}}>
      {children}
    </div>
  );
}

function ModalHead({ eyebrow, title, onClose = true }) {
  return (
    <div style={{padding:'18px 22px 14px', borderBottom:'1px solid var(--border)',
      display:'flex', alignItems:'flex-start', gap:12}}>
      <div style={{flex:1}}>
        {eyebrow && <Mono style={{fontSize:9.5, letterSpacing:'0.14em', textTransform:'uppercase',
          color:'var(--muted-foreground)', display:'block', marginBottom:5}}>{eyebrow}</Mono>}
        <Serif as="h2" style={{fontSize:22, fontWeight:450, margin:0, letterSpacing:'-0.01em'}}>{title}</Serif>
      </div>
      {onClose && (
        <button style={{width:30, height:30, borderRadius:'50%', border:'1px solid var(--border)',
          background:'transparent', color:'var(--muted-foreground)', cursor:'pointer',
          display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      )}
    </div>
  );
}

// ── The app shell behind every artboard (dimmable) ──────────────────────
function GroupSidebar({ activeName, groupRow, entryTip }) {
  return (
    <div style={{width:240, borderRight:'1px solid var(--border)', display:'flex',
      flexDirection:'column', flexShrink:0}}>
      <div style={{padding:'14px 12px 10px'}}>
        <div style={{display:'flex', alignItems:'center', gap:8, padding:'0 10px', height:34,
          background:'var(--input)', borderRadius:'var(--radius-sm)', border:'1px solid var(--border)',
          color:'var(--muted-foreground)', fontSize:12}}>
          {Icons.search}<span>Search conversations</span>
        </div>
      </div>
      <div style={{padding:'0 8px'}}>
        <NavItem icon={Icons.users} label="Friends"/>
      </div>
      {/* DM header — the group+ affordance opens the member picker directly */}
      <div style={{padding:'14px 18px 6px', display:'flex', alignItems:'center',
        justifyContent:'space-between'}}>
        <span style={{fontFamily:'JetBrains Mono, monospace', fontSize:10, letterSpacing:'0.12em',
          color:'var(--muted-foreground)', textTransform:'uppercase'}}>Direct Messages</span>
        <button title="New group" style={{width:26, height:26, padding:0, borderRadius:'var(--radius-sm)',
          border:'none', cursor:'pointer', position:'relative',
          background: entryTip ? 'color-mix(in oklab, var(--chat) 18%, transparent)' : 'transparent',
          color: entryTip ? 'var(--chat)' : 'var(--muted-foreground)',
          display:'flex', alignItems:'center', justifyContent:'center'}}>
          {Icons.users}
          <span style={{position:'absolute', right:-3, bottom:-3, width:13, height:13,
            borderRadius:'50%', background:'var(--chat)', color:'var(--primary-foreground)',
            border:'1.5px solid var(--background)', display:'flex', alignItems:'center',
            justifyContent:'center'}}>
            <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="4.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
          </span>
        </button>
      </div>
      <div style={{padding:'0 8px', flex:1}}>
        {groupRow === 'top' && (
          <div style={{borderRadius:'var(--radius-sm)', background:'color-mix(in oklab, var(--chat) 14%, transparent)'}}>
            <GroupDMRow active/>
          </div>
        )}
        <DMItem name="Bob" color="oklch(0.75 0.06 70)" preview="thinking about the meeting" time="2m" dot="online"/>
        {activeName === 'Maia'
          ? <div style={{borderRadius:'var(--radius-sm)', background:'color-mix(in oklab, var(--chat) 14%, transparent)'}}>
              <DMItem name="Maia" color="oklch(0.72 0.07 330)" preview="you: sounds good" time="now" dot="voice"/>
            </div>
          : <DMItem name="Maia" color="oklch(0.72 0.07 330)" preview="you: sounds good" time="now" dot="voice"/>}
        <DMItem name="Jules & Kai" color="oklch(0.74 0.06 200)" preview="Kai: pushed a fix" time="3h"/>
        <DMItem name="Tane" color="oklch(0.72 0.07 25)" preview="photos from the trip" time="yd"/>
      </div>
      <UserBar/>
    </div>
  );
}

// A DM-list row for a group (stacked avatar instead of one)
function GroupDMRow({ active, name = 'Maia, Kai & Tane', preview = 'you: created the group', time = 'now', unread }) {
  return (
    <div style={{display:'flex', alignItems:'center', gap:10, padding:'7px 8px',
      borderRadius:'var(--radius-sm)', cursor:'pointer', marginBottom:1}}>
      <div style={{width:30, flexShrink:0}}>
        <AvatarStack people={[PEOPLE.maia, PEOPLE.kai, PEOPLE.tane]} size={22} max={3}
          ring={active ? 'color-mix(in oklab, var(--chat) 14%, var(--background))' : 'var(--background)'}/>
      </div>
      <div style={{flex:1, minWidth:0}}>
        <div style={{display:'flex', justifyContent:'space-between', gap:6}}>
          <div style={{fontSize:13, fontWeight: unread ? 600 : 500, color:'var(--foreground)',
            whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{name}</div>
          <div style={{fontSize:10.5, color:'var(--muted-foreground)', fontFamily:'JetBrains Mono, monospace'}}>{time}</div>
        </div>
        <div style={{fontSize:11.5, color:'var(--muted-foreground)', whiteSpace:'nowrap',
          overflow:'hidden', textOverflow:'ellipsis'}}>{preview}</div>
      </div>
    </div>
  );
}

// Faint empty main area for entry-point artboard
function EmptyMain({ children }) {
  return (
    <div style={{flex:1, display:'flex', flexDirection:'column', minWidth:0, position:'relative'}}>
      <div style={{height:60, borderBottom:'1px solid var(--border)'}}/>
      <div style={{flex:1, display:'flex', alignItems:'center', justifyContent:'center',
        flexDirection:'column', gap:14, color:'var(--muted-foreground)'}}>
        <div style={{opacity:0.5}}><Mountain size={48}/></div>
        <Serif style={{fontSize:18, color:'var(--muted-foreground)'}}>Pick up where you left off</Serif>
      </div>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 1 · ENTRY POINT — the group+ icon in the DM header opens the picker
// ─────────────────────────────────────────────────────────────────────────
function GroupEntry() {
  return (
    <Artboard w={1200} h={780} style={{display:'flex', position:'relative'}}>
      <ServerRail active="home"/>
      <GroupSidebar entryTip/>
      <EmptyMain/>

      {/* tooltip pointing at the New-group icon */}
      <div style={{position:'absolute', left:196, top:170, width:188, zIndex:50,
        background:'var(--popover)', border:'1px solid var(--border-strong)',
        borderRadius:'var(--radius)', boxShadow:'0 18px 50px -16px rgba(0,0,0,0.55)',
        padding:'11px 13px'}}>
        <div style={{position:'absolute', top:-5, left:82, width:10, height:10,
          background:'var(--popover)', borderLeft:'1px solid var(--border-strong)',
          borderTop:'1px solid var(--border-strong)', transform:'rotate(45deg)'}}/>
        <div style={{display:'flex', alignItems:'center', gap:8}}>
          <span style={{color:'var(--chat)', display:'flex'}}>{Icons.users}</span>
          <span style={{fontSize:13, fontWeight:600, color:'var(--foreground)'}}>New group</span>
        </div>
        <div style={{fontSize:11.5, color:'var(--muted-foreground)', marginTop:5, lineHeight:1.45}}>
          Pick people and start a group — opens the member picker.
        </div>
      </div>
    </Artboard>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 2A · MEMBER PICKER — roomy two-pane modal (the deliberate path)
// ─────────────────────────────────────────────────────────────────────────
function GroupPickerTwoPane() {
  const selected = [PEOPLE.maia, PEOPLE.kai, PEOPLE.tane];
  return (
    <Artboard w={1200} h={780} style={{display:'flex', position:'relative'}}>
      <ServerRail active="home"/>
      <GroupSidebar/>
      <EmptyMain/>

      <Scrim>
        <div style={{width:760, height:540, borderRadius:'var(--radius-xl)', overflow:'hidden',
          background:'var(--popover)', border:'1px solid var(--border-strong)',
          boxShadow:'0 40px 100px -24px rgba(0,0,0,0.7)', display:'flex', flexDirection:'column'}}>
          <ModalHead eyebrow="New group" title="Who's in?"/>

          <div style={{flex:1, display:'flex', minHeight:0}}>
            {/* LEFT — search + lists */}
            <div style={{flex:'1 1 58%', display:'flex', flexDirection:'column',
              borderRight:'1px solid var(--border)', minWidth:0}}>
              <div style={{padding:'12px 16px', display:'flex', alignItems:'center', gap:10,
                borderBottom:'1px solid var(--border)'}}>
                <span style={{color:'var(--muted-foreground)'}}>{Icons.search}</span>
                <input defaultValue="" placeholder="Search friends, or paste @user@server"
                  style={{flex:1, background:'transparent', border:'none', outline:'none',
                    color:'var(--foreground)', fontSize:13.5, fontFamily:'inherit'}}/>
              </div>
              <div style={{flex:1, overflow:'auto', padding:'10px 10px'}}>
                <Mono style={{fontSize:9.5, letterSpacing:'0.12em', textTransform:'uppercase',
                  color:'var(--muted-foreground)', padding:'4px 10px', display:'block'}}>On {HOME_SERVER}</Mono>
                <PickRow p={PEOPLE.tane} selected/>
                <PickRow p={PEOPLE.bob}/>
                <PickRow p={PEOPLE.noa}/>
                <Mono style={{fontSize:9.5, letterSpacing:'0.12em', textTransform:'uppercase',
                  color:'var(--muted-foreground)', padding:'12px 10px 4px', display:'flex',
                  alignItems:'center', gap:6}}><Globe size={10}/> Federated · other servers</Mono>
                <PickRow p={PEOPLE.maia} selected/>
                <PickRow p={PEOPLE.kai} selected/>
                <PickRow p={PEOPLE.jun}/>
              </div>
            </div>

            {/* RIGHT — optional name + selected rail */}
            <div style={{flex:'1 1 42%', display:'flex', flexDirection:'column', minWidth:0}}>
              {/* optional name */}
              <div style={{padding:'14px 16px 13px', borderBottom:'1px solid var(--border)'}}>
                <div style={{display:'flex', alignItems:'baseline', justifyContent:'space-between',
                  marginBottom:7}}>
                  <Mono style={{fontSize:9.5, letterSpacing:'0.12em', textTransform:'uppercase',
                    color:'var(--muted-foreground)'}}>Group name</Mono>
                  <Mono style={{fontSize:9, letterSpacing:'0.08em', textTransform:'uppercase',
                    color:'var(--muted-foreground)'}}>Optional</Mono>
                </div>
                <div style={{display:'flex', alignItems:'center', gap:8, height:40, padding:'0 12px',
                  borderRadius:'var(--radius)', border:'1px solid var(--border-strong)',
                  background:'var(--input)'}}>
                  <span style={{flex:1, fontSize:13.5, color:'var(--muted-foreground)',
                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>Maia, Kai &amp; Tane</span>
                </div>
                <div style={{fontSize:11, color:'var(--muted-foreground)', marginTop:7,
                  display:'flex', alignItems:'center', gap:6}}>
                  <span style={{display:'flex', color:'var(--chat)'}}>{Icons.sparkle}</span>
                  Leave blank to use members' names
                </div>
              </div>

              <div style={{padding:'14px 16px 10px', display:'flex', alignItems:'baseline',
                justifyContent:'space-between'}}>
                <Mono style={{fontSize:9.5, letterSpacing:'0.12em', textTransform:'uppercase',
                  color:'var(--muted-foreground)'}}>Selected</Mono>
                <Mono style={{fontSize:11, color:'var(--foreground)'}}>
                  {selected.length} <span style={{color:'var(--muted-foreground)'}}>of 10</span>
                </Mono>
              </div>
              <div style={{flex:1, overflow:'auto', padding:'0 16px',
                display:'flex', flexWrap:'wrap', gap:8, alignContent:'flex-start'}}>
                <MemberChip p={{...YOU, name:'You'}} onRemove={false}/>
                {selected.map((p,i) => <MemberChip key={i} p={p}/>)}
              </div>
              <div style={{padding:'14px 16px', borderTop:'1px solid var(--border)'}}>
                <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:12,
                  fontSize:11.5, color:'var(--muted-foreground)'}}>
                  <Globe size={12}/>
                  <span>2 members are on other servers — they'll join over federation.</span>
                </div>
                <button style={{width:'100%', padding:'11px', borderRadius:'var(--radius)',
                  background:'var(--chat)', color:'var(--primary-foreground)', border:'none',
                  cursor:'pointer', fontWeight:600, fontSize:13.5, fontFamily:'inherit',
                  display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                  boxShadow:'0 1px 0 rgba(255,255,255,0.15) inset, 0 8px 24px -10px color-mix(in oklab, var(--chat) 45%, transparent)'}}>
                  Create group
                </button>
              </div>
            </div>
          </div>
        </div>
      </Scrim>
    </Artboard>
  );
}

Object.assign(window, {
  HOME_SERVER, YOU, PEOPLE, isFederated,
  Globe, Crown, UserPlus, ServerTag, AvatarStack, MemberChip, Check, PickRow,
  Scrim, ModalHead, GroupSidebar, GroupDMRow, EmptyMain,
  GroupEntry, GroupPickerTwoPane,
});
