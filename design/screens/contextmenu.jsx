// Friends-list & DM context menu proposals
// Right-click on a friend row or DM item shows a contextual popover.
// Four directions, each anchored to a specific row in the Friends page.

function CMFriendsBackdrop({ children, anchorIndex = 1 }) {
  // anchorIndex: which friend row carries the highlight (where the right-click landed)
  const rows = [
    ['Bob','bob@kauai.pinai','Working on the lantern prototype','online','oklch(0.75 0.06 70)'],
    ['Maia','maia@studio.pinai','In voice · Design Lab','voice','oklch(0.72 0.07 330)', true],
    ['Kai','kai@lab.pinai','—','online','oklch(0.74 0.06 200)'],
    ['Jules','jules@studio.pinai','Idle — listening','idle','oklch(0.70 0.05 260)'],
    ['Tane','tane@lab.pinai','Offline · last seen yesterday','offline','oklch(0.72 0.07 25)'],
  ];
  return (
    <Artboard w={1200} h={780} style={{display:'flex'}}>
      <ServerRail active="home"/>

      {/* Sidebar */}
      <div style={{width:260, borderRight:'1px solid var(--border)',
        display:'flex', flexDirection:'column', background:'var(--background)'}}>
        <div style={{padding:'14px 12px 10px'}}>
          <div style={{display:'flex', alignItems:'center', gap:8, padding:'0 10px',
            height:34, background:'var(--input)', borderRadius:'var(--radius-sm)',
            border:'1px solid var(--border)',
            color:'var(--muted-foreground)', fontSize:12}}>
            {Icons.search}<span>Find or start a conversation</span>
          </div>
        </div>
        <div style={{padding:'4px 8px'}}>
          <div style={{display:'flex', alignItems:'center', gap:10, padding:'7px 10px',
            borderRadius:'var(--radius-sm)',
            background:'color-mix(in oklab, var(--chat) 16%, transparent)',
            color:'var(--chat)', fontSize:13, fontWeight:500}}>
            {Icons.users}<span style={{flex:1}}>Friends</span>
          </div>
        </div>
        <div style={{padding:'14px 18px 6px', fontFamily:'JetBrains Mono, monospace',
          fontSize:10, letterSpacing:'0.12em', color:'var(--muted-foreground)',
          textTransform:'uppercase'}}>Direct Messages</div>
        <div style={{padding:'0 8px', flex:1, opacity:0.5}}>
          {[['Bob','oklch(0.75 0.06 70)'],['Maia','oklch(0.72 0.07 330)'],
            ['Tane','oklch(0.72 0.07 25)']].map(([n,c]) => (
            <div key={n} style={{display:'flex', alignItems:'center', gap:10, padding:'7px 8px'}}>
              <Avatar name={n} color={c} size={30} square/>
              <span style={{fontSize:13, color:'var(--foreground)'}}>{n}</span>
            </div>
          ))}
        </div>
        <UserBar/>
      </div>

      <div style={{flex:1, display:'flex', flexDirection:'column'}}>
        <div style={{height:60, borderBottom:'1px solid var(--border)', padding:'0 24px',
          display:'flex', alignItems:'center', gap:16}}>
          <span style={{color:'var(--muted-foreground)'}}>{Icons.users}</span>
          <Serif style={{fontSize:20, fontWeight:450}}>Friends</Serif>
        </div>
        <div style={{padding:'22px 32px 14px', display:'flex',
          alignItems:'center', justifyContent:'space-between'}}>
          <div style={{display:'flex', gap:4, padding:3, background:'var(--muted)',
            borderRadius:'var(--radius-sm)'}}>
            {['All','Online','Pending','Blocked'].map((t,i) => (
              <span key={t} style={{padding:'7px 14px',
                borderRadius:'calc(var(--radius-sm) - 1px)', fontSize:12,
                background: i===0 ? 'var(--card)' : 'transparent',
                color: i===0 ? 'var(--foreground)' : 'var(--muted-foreground)',
                fontWeight: i===0 ? 500 : 400}}>{t}</span>
            ))}
          </div>
          <button style={{padding:'8px 16px', borderRadius:'var(--radius-sm)',
            border:'none', background:'var(--chat)', color:'var(--primary-foreground)',
            fontWeight:600, fontSize:12.5, fontFamily:'inherit', cursor:'pointer'}}>
            + Add Friend
          </button>
        </div>

        <div style={{flex:1, padding:'6px 16px', position:'relative'}}>
          {rows.map(([n, h, s, d, c, inVoice], i) => {
            const isAnchor = i === anchorIndex;
            return (
              <div key={n} data-anchor={isAnchor || undefined}
                style={{
                  display:'flex', alignItems:'center', gap:14, padding:'12px 16px',
                  borderRadius:'var(--radius)', position:'relative',
                  background: isAnchor
                    ? 'color-mix(in oklab, var(--chat) 12%, transparent)'
                    : 'transparent',
                  outline: isAnchor ? '1px solid var(--chat)' : 'none',
                  opacity: d === 'offline' ? 0.55 : 1,
                  borderBottom: '1px solid color-mix(in oklab, var(--border) 40%, transparent)',
                }}>
                <Avatar name={n} color={c} size={40} dot={d}/>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{display:'flex', alignItems:'baseline', gap:8}}>
                    <Serif style={{fontSize:16, fontWeight:450}}>{n}</Serif>
                    <Mono style={{fontSize:11, color:'var(--muted-foreground)'}}>{h}</Mono>
                  </div>
                  <div style={{fontSize:12,
                    color: inVoice ? 'var(--voice)' : 'var(--muted-foreground)',
                    marginTop:3}}>{s}</div>
                </div>
                {isAnchor && (
                  <Mono style={{fontSize:10, padding:'2px 7px', borderRadius:4,
                    background:'color-mix(in oklab, var(--chat) 22%, transparent)',
                    color:'var(--chat)', letterSpacing:'0.08em',
                    textTransform:'uppercase', fontWeight:600}}>
                    right-click
                  </Mono>
                )}
                {isAnchor && children}
              </div>
            );
          })}
        </div>
      </div>
    </Artboard>
  );
}

// Tiny SVG glyphs for the menus
const Gly = {
  msg:    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16v10H9l-4 4V6z"/></svg>,
  call:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4h4l2 5-2 1a11 11 0 005 5l1-2 5 2v4a2 2 0 01-2 2A17 17 0 013 6a2 2 0 012-2z"/></svg>,
  video:  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="6" width="14" height="12" rx="2"/><path d="m17 10 5-3v10l-5-3z"/></svg>,
  user:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/></svg>,
  share:  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="12" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="18" cy="18" r="2"/><path d="m8 11 8-4M8 13l8 4"/></svg>,
  pin:    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 17v5M7 10 5 12l7 1 1 7 2-2-1-4 4-4-7-1-1-7-2 2z"/></svg>,
  mute:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="m2 2 20 20"/></svg>,
  copy:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>,
  block:  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/></svg>,
  trash:  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14"/></svg>,
  flag:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 22V4M4 4h13l-2 4 2 4H4"/></svg>,
  note:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>,
  star:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3 2.6 5.4 5.9.6-4.3 4.2 1.3 5.8L12 16l-5.5 3 1.3-5.8L3.5 9l5.9-.6z"/></svg>,
  bell:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/></svg>,
};

// Menu shell — popover with caret hidden (anchored at cursor)
function Popover({ children, x = 240, y = 30, width = 240 }) {
  return (
    <div style={{
      position:'absolute', left:x, top:y, width, zIndex:20,
      background:'var(--popover)', color:'var(--popover-foreground)',
      border:'1px solid var(--border-strong)',
      borderRadius:'var(--radius-lg)',
      boxShadow:'0 18px 48px -10px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.02)',
      overflow:'hidden',
    }}>{children}</div>
  );
}

function MenuItem({ icon, label, hint, danger, accent, sub }) {
  const color = danger ? 'var(--destructive)'
    : accent ? 'var(--chat)'
    : 'var(--foreground)';
  return (
    <div style={{
      display:'flex', alignItems:'center', gap:10, padding:'8px 12px',
      cursor:'pointer', fontSize:13, color,
      borderRadius:6, margin:'0 4px',
    }}>
      <span style={{display:'flex', color: danger ? color :
        accent ? color : 'var(--muted-foreground)'}}>{icon}</span>
      <span style={{flex:1, display:'flex', flexDirection:'column'}}>
        <span style={{lineHeight:1.2}}>{label}</span>
        {sub && <Mono style={{fontSize:10, color:'var(--muted-foreground)',
          letterSpacing:'0.04em', marginTop:2}}>{sub}</Mono>}
      </span>
      {hint && <Mono style={{fontSize:10, color:'var(--muted-foreground)',
        padding:'1.5px 5px', borderRadius:4, background:'var(--muted)'}}>{hint}</Mono>}
    </div>
  );
}

function MenuDivider({ label }) {
  if (!label) {
    return <div style={{height:1, background:'var(--border)', margin:'5px 8px'}}/>;
  }
  return (
    <div style={{padding:'8px 12px 4px',
      fontFamily:'JetBrains Mono, monospace', fontSize:9.5,
      letterSpacing:'0.14em', color:'var(--muted-foreground)',
      textTransform:'uppercase'}}>{label}</div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// A · Classic list — vertical list, dividers, danger at bottom
// ─────────────────────────────────────────────────────────────────────────
function ContextMenuClassic() {
  return (
    <CMFriendsBackdrop anchorIndex={1}>
      <Popover x={460} y={48} width={236}>
        <div style={{padding:'6px 0'}}>
          <MenuItem icon={Gly.msg} label="Send message" hint="↵"/>
          <MenuItem icon={Gly.call} label="Start a call"/>
          <MenuItem icon={Gly.video} label="Start a video call"/>
          <MenuDivider/>
          <MenuItem icon={Gly.user} label="See profile"/>
          <MenuItem icon={Gly.copy} label="Copy handle" hint="⌘C"/>
          <MenuItem icon={Gly.share} label="Share contact"/>
          <MenuDivider/>
          <MenuItem icon={Gly.pin} label="Pin to top"/>
          <MenuItem icon={Gly.mute} label="Mute notifications"/>
          <MenuItem icon={Gly.note} label="Add a note"/>
          <MenuDivider/>
          <MenuItem icon={Gly.block} label="Block Maia" danger/>
          <MenuItem icon={Gly.trash} label="Remove friend" danger/>
        </div>
      </Popover>
    </CMFriendsBackdrop>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// B · Identity header — menu shows who the row is about up top
// ─────────────────────────────────────────────────────────────────────────
function ContextMenuIdentity() {
  return (
    <CMFriendsBackdrop anchorIndex={1}>
      <Popover x={460} y={48} width={280}>
        {/* identity header */}
        <div style={{
          padding:'14px 14px 12px',
          background:'color-mix(in oklab, var(--chat) 10%, transparent)',
          borderBottom:'1px solid var(--border)',
          display:'flex', gap:12, alignItems:'center',
        }}>
          <div style={{position:'relative', flexShrink:0}}>
            <Avatar name="Maia" color="oklch(0.72 0.07 330)" size={40}/>
            <div style={{position:'absolute', right:-1, bottom:-1, width:10, height:10,
              borderRadius:'50%', background:'var(--voice)',
              border:'2px solid var(--popover)'}}/>
          </div>
          <div style={{flex:1, minWidth:0}}>
            <Serif style={{fontSize:14, fontWeight:500, display:'block',
              lineHeight:1.1}}>Maia</Serif>
            <Mono style={{fontSize:10, color:'var(--muted-foreground)',
              display:'block', marginTop:2,
              whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>
              maia@studio.pinai
            </Mono>
            <div style={{display:'flex', alignItems:'center', gap:5, marginTop:4,
              fontSize:10.5, color:'var(--voice)'}}>
              <span style={{display:'flex'}}>{Icons.waveform}</span>
              <span>In voice · Design Lab</span>
            </div>
          </div>
        </div>
        <div style={{padding:'6px 0'}}>
          <MenuItem icon={Gly.msg} label="Send message" hint="↵"/>
          <MenuItem icon={Gly.call} label="Start a private call"/>
          <MenuDivider/>
          <MenuItem icon={Gly.user} label="See profile"/>
          <MenuItem icon={Gly.copy} label="Copy handle" hint="⌘C"/>
          <MenuDivider/>
          <MenuItem icon={Gly.mute} label="Mute notifications"/>
          <MenuItem icon={Gly.block} label="Block Maia" danger/>
          <MenuItem icon={Gly.trash} label="Remove friend" danger/>
        </div>
      </Popover>
    </CMFriendsBackdrop>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// C · Quick-action toolbar + list — icon bar up top, list below
// ─────────────────────────────────────────────────────────────────────────
function ContextMenuToolbar() {
  return (
    <CMFriendsBackdrop anchorIndex={1}>
      <Popover x={460} y={48} width={264}>
        {/* toolbar */}
        <div style={{padding:'8px 8px',
          borderBottom:'1px solid var(--border)',
          display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:4}}>
          {[
            [Gly.msg, 'Message', 'var(--chat)', true],
            [Gly.call, 'Call'],
            [Gly.video, 'Video'],
            [Gly.user, 'Profile'],
          ].map(([ic, label, tone, primary], i) => (
            <button key={i} style={{
              display:'flex', flexDirection:'column', alignItems:'center', gap:5,
              padding:'9px 4px', borderRadius:6,
              border: primary ? '1px solid var(--chat)' : '1px solid transparent',
              background: primary ? 'color-mix(in oklab, var(--chat) 14%, transparent)'
                : 'transparent',
              color: tone || 'var(--foreground)',
              fontFamily:'inherit', cursor:'pointer',
            }}>
              <span style={{display:'flex'}}>{ic}</span>
              <Mono style={{fontSize:9.5, letterSpacing:'0.06em',
                color: primary ? tone : 'var(--muted-foreground)',
                textTransform:'uppercase', fontWeight: primary ? 600 : 500}}>{label}</Mono>
            </button>
          ))}
        </div>
        <div style={{padding:'6px 0'}}>
          <MenuItem icon={Gly.share} label="Share contact"/>
          <MenuItem icon={Gly.copy} label="Copy handle" hint="⌘C"/>
          <MenuItem icon={Gly.pin} label="Pin to top"/>
          <MenuItem icon={Gly.mute} label="Mute"/>
          <MenuItem icon={Gly.note} label="Add a note"/>
          <MenuDivider/>
          <MenuItem icon={Gly.block} label="Block" danger/>
          <MenuItem icon={Gly.trash} label="Remove friend" danger/>
        </div>
      </Popover>
    </CMFriendsBackdrop>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// D · Sectioned · editorial labels grouping actions by intent
// ─────────────────────────────────────────────────────────────────────────
function ContextMenuSectioned() {
  return (
    <CMFriendsBackdrop anchorIndex={1}>
      <Popover x={460} y={48} width={258}>
        <div style={{padding:'4px 0 6px'}}>
          <MenuDivider label="Talk"/>
          <MenuItem icon={Gly.msg} label="Send message" hint="↵"/>
          <MenuItem icon={Gly.call} label="Start a call"/>
          <MenuItem icon={Gly.video} label="Start a video call"/>

          <MenuDivider label="Identity"/>
          <MenuItem icon={Gly.user} label="See profile"/>
          <MenuItem icon={Gly.copy} label="Copy handle" hint="⌘C"/>
          <MenuItem icon={Gly.share} label="Share contact"/>

          <MenuDivider label="Manage"/>
          <MenuItem icon={Gly.pin} label="Pin to top"/>
          <MenuItem icon={Gly.bell} label="Notifications" sub="All messages · ↓"/>
          <MenuItem icon={Gly.note} label="Edit private note"/>

          <MenuDivider label="Danger zone"/>
          <MenuItem icon={Gly.block} label="Block Maia" danger/>
          <MenuItem icon={Gly.trash} label="Remove friend" danger/>
        </div>
      </Popover>
    </CMFriendsBackdrop>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// E · DM-list variant — same patterns, conversation-flavoured vocabulary
// (Pin, Mark as read, Archive, Mute, Leave)
// ─────────────────────────────────────────────────────────────────────────
function ContextMenuDM() {
  // anchor on the DM sidebar instead — render a small custom backdrop
  return (
    <Artboard w={1200} h={780} style={{display:'flex'}}>
      <ServerRail active="home"/>
      <div style={{width:260, borderRight:'1px solid var(--border)',
        display:'flex', flexDirection:'column', background:'var(--background)',
        position:'relative'}}>
        <div style={{padding:'14px 12px 10px'}}>
          <div style={{display:'flex', alignItems:'center', gap:8, padding:'0 10px',
            height:34, background:'var(--input)', borderRadius:'var(--radius-sm)',
            border:'1px solid var(--border)',
            color:'var(--muted-foreground)', fontSize:12}}>
            {Icons.search}<span>Find or start a conversation</span>
          </div>
        </div>
        <div style={{padding:'14px 18px 6px', fontFamily:'JetBrains Mono, monospace',
          fontSize:10, letterSpacing:'0.12em', color:'var(--muted-foreground)',
          textTransform:'uppercase'}}>Direct Messages</div>
        <div style={{padding:'0 8px', flex:1, position:'relative'}}>
          {[
            ['Bob','oklch(0.75 0.06 70)','thinking about the meeting','2m','online'],
            ['Maia','oklch(0.72 0.07 330)','you: sounds good','1h','voice', true],
            ['Jules & Kai','oklch(0.74 0.06 200)','Kai: pushed a fix','3h'],
            ['Tane','oklch(0.72 0.07 25)','photos from the trip','yd'],
          ].map(([n, c, p, t, d, anchor], i) => (
            <div key={n} style={{
              display:'flex', alignItems:'center', gap:10, padding:'7px 8px',
              borderRadius:'var(--radius-sm)', marginBottom:1, position:'relative',
              background: anchor
                ? 'color-mix(in oklab, var(--chat) 14%, transparent)' : 'transparent',
              outline: anchor ? '1px solid var(--chat)' : 'none',
            }}>
              <Avatar name={n} color={c} size={30} dot={d} square/>
              <div style={{flex:1, minWidth:0}}>
                <div style={{display:'flex', justifyContent:'space-between', gap:6}}>
                  <div style={{fontSize:13, fontWeight:500, color:'var(--foreground)',
                    whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{n}</div>
                  <div style={{fontSize:10.5, color:'var(--muted-foreground)',
                    fontFamily:'JetBrains Mono, monospace'}}>{t}</div>
                </div>
                <div style={{fontSize:11.5, color:'var(--muted-foreground)',
                  whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{p}</div>
              </div>
              {anchor && (
                <Popover x={250} y={-4} width={236}>
                  <div style={{padding:'6px 0'}}>
                    <MenuItem icon={Gly.msg} label="Open conversation" hint="↵"/>
                    <MenuItem icon={Gly.call} label="Start a call"/>
                    <MenuDivider/>
                    <MenuItem icon={Gly.user} label="See profile"/>
                    <MenuItem icon={Gly.star} label="Mark as unread"/>
                    <MenuItem icon={Gly.pin} label="Pin to top"/>
                    <MenuItem icon={Gly.mute} label="Mute conversation"/>
                    <MenuDivider/>
                    <MenuItem icon={Gly.flag} label="Archive"/>
                    <MenuItem icon={Gly.trash} label="Leave conversation" danger/>
                  </div>
                </Popover>
              )}
            </div>
          ))}
        </div>
        <UserBar/>
      </div>
      {/* faded main */}
      <div style={{flex:1, padding:24, opacity:0.4}}>
        <Mono style={{fontSize:11, color:'var(--muted-foreground)',
          letterSpacing:'0.12em', textTransform:'uppercase'}}>
          DM sidebar · right-click on Maia
        </Mono>
        <Serif style={{fontSize:32, fontWeight:400, marginTop:10,
          color:'var(--muted-foreground)', letterSpacing:'-0.01em'}}>
          Same vocabulary, conversation-flavoured.
        </Serif>
      </div>
    </Artboard>
  );
}

Object.assign(window, {
  ContextMenuClassic, ContextMenuIdentity, ContextMenuToolbar,
  ContextMenuSectioned, ContextMenuDM,
});
