// User Settings — full-page overlay variations
// Replaces the current cramped settings page with three editorial directions.

// Shared rail item
function RailItem({ icon, label, active, onClick, danger, badge }) {
  return (
    <div onClick={onClick} style={{
      display:'flex', alignItems:'center', gap:10, padding:'8px 12px',
      borderRadius:'var(--radius-sm)', cursor:'pointer', marginBottom:1,
      background: active ? 'color-mix(in oklab, var(--chat) 14%, transparent)' : 'transparent',
      color: active ? 'var(--chat)' : danger ? 'var(--destructive)' : 'var(--muted-foreground)',
      fontSize:13, fontWeight: active ? 500 : 400,
      fontFamily: active ? 'var(--serif, Fraunces), serif' : 'inherit',
    }}>
      {icon && <span style={{display:'flex'}}>{icon}</span>}
      <span style={{flex:1}}>{label}</span>
      {badge && <Mono style={{fontSize:10, padding:'1px 6px', borderRadius:10,
        background:'var(--muted)', color:'var(--muted-foreground)'}}>{badge}</Mono>}
    </div>
  );
}

// Section eyebrow + title
function SectionHeader({ eyebrow, title, hint }) {
  return (
    <div style={{marginBottom:18}}>
      <Mono style={{fontSize:10, letterSpacing:'0.14em', color:'var(--muted-foreground)',
        textTransform:'uppercase', display:'block', marginBottom:6}}>
        — {eyebrow}
      </Mono>
      <Serif style={{fontSize:30, fontWeight:400, letterSpacing:'-0.015em', display:'block',
        lineHeight:1.05}}>
        {title}
      </Serif>
      {hint && (
        <p style={{margin:'8px 0 0', fontSize:12.5, color:'var(--muted-foreground)',
          fontStyle:'italic', fontFamily:'var(--serif, Fraunces), serif', maxWidth:520, lineHeight:1.55}}>
          {hint}
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// A · Editorial settings — full-page overlay, live profile preview
// ─────────────────────────────────────────────────────────────────────────
function SettingsEditorial() {
  return (
    <Artboard w={1200} h={780} style={{display:'flex', background:'var(--background)'}}>
      {/* LEFT RAIL */}
      <div style={{width:240, borderRight:'1px solid var(--border)',
        display:'flex', flexDirection:'column', padding:'22px 12px 14px',
        background:'color-mix(in oklab, var(--card) 40%, transparent)'}}>
        <Mono style={{fontSize:10, letterSpacing:'0.14em', color:'var(--muted-foreground)',
          textTransform:'uppercase', padding:'0 12px 14px'}}>
          User settings
        </Mono>
        <RailItem icon={Icons.users} label="Account" active/>
        <RailItem icon={Icons.sparkle} label="Profile"/>
        <RailItem icon={Icons.lock} label="Privacy & safety"/>
        <RailItem icon={Icons.sun} label="Appearance"/>
        <RailItem icon={Icons.bell} label="Notifications" badge="3"/>
        <RailItem icon={Icons.settings} label="Keybinds"/>

        <div style={{height:1, background:'var(--border)', margin:'14px 12px'}}/>
        <Mono style={{fontSize:10, letterSpacing:'0.14em', color:'var(--muted-foreground)',
          textTransform:'uppercase', padding:'0 12px 8px'}}>
          Server · kauai.pinai
        </Mono>
        <RailItem icon={Icons.headset} label="Voice & video"/>
        <RailItem icon={Icons.message} label="Connections"/>

        <div style={{flex:1}}/>
        <RailItem icon={Icons.lock} label="Log out" danger/>
        <Mono style={{fontSize:9.5, color:'var(--muted-foreground)', padding:'10px 12px 0',
          letterSpacing:'0.06em'}}>
          Pīna'i v0.9 · kauai
        </Mono>
      </div>

      {/* MAIN */}
      <div style={{flex:1, display:'flex', flexDirection:'column', overflow:'hidden'}}>
        {/* topbar */}
        <div style={{height:60, borderBottom:'1px solid var(--border)',
          padding:'0 32px', display:'flex', alignItems:'center', gap:14}}>
          <Mono style={{fontSize:10, letterSpacing:'0.14em', color:'var(--muted-foreground)',
            textTransform:'uppercase'}}>Settings ·</Mono>
          <Serif style={{fontSize:16, fontWeight:500}}>Account</Serif>
          <div style={{flex:1}}/>
          <div style={{display:'flex', alignItems:'center', gap:8,
            padding:'5px 10px', borderRadius:'var(--radius-sm)',
            border:'1px solid var(--border)', color:'var(--muted-foreground)',
            fontSize:11.5}}>
            <span>Close</span>
            <Mono style={{fontSize:10, padding:'2px 6px', borderRadius:4,
              background:'var(--muted)', letterSpacing:'0.08em'}}>esc</Mono>
          </div>
        </div>

        {/* content */}
        <div style={{flex:1, display:'flex', overflow:'hidden'}}>
          {/* primary form column */}
          <div style={{flex:1.4, padding:'34px 36px 28px', overflow:'auto'}}>
            <SectionHeader
              eyebrow="account"
              title="Your account, plainly."
              hint="Identity, address, and the credentials you use to sign in. Display name and bio show on your profile; email is private."
            />

            {/* Identity card */}
            <div style={{
              padding:'20px 22px', borderRadius:'var(--radius)',
              border:'1px solid var(--border)', background:'var(--card)',
              marginBottom:22,
            }}>
              <Mono style={{fontSize:9.5, letterSpacing:'0.14em', color:'var(--muted-foreground)',
                textTransform:'uppercase', display:'block', marginBottom:14}}>
                Identity
              </Mono>

              {/* avatar + name row */}
              <div style={{display:'flex', gap:18, alignItems:'flex-start',
                paddingBottom:16, borderBottom:'1px solid var(--border)'}}>
                <div style={{position:'relative'}}>
                  <Avatar name="Alice" color="var(--chat)" size={72}/>
                  <div style={{position:'absolute', right:-2, bottom:-2,
                    width:24, height:24, borderRadius:'50%',
                    border:'2px solid var(--card)', background:'var(--chat)',
                    color:'var(--primary-foreground)', display:'flex',
                    alignItems:'center', justifyContent:'center', fontSize:11, cursor:'pointer'}}>
                    {Icons.plus}
                  </div>
                </div>
                <div style={{flex:1}}>
                  <Serif style={{fontSize:22, fontWeight:500, display:'block', lineHeight:1.1}}>
                    Alice Koa
                  </Serif>
                  <Mono style={{fontSize:11, color:'var(--muted-foreground)', display:'block',
                    marginTop:4}}>
                    @Alice_Waбру · kauai.pinai
                  </Mono>
                  <div style={{display:'flex', gap:6, marginTop:10}}>
                    <button style={{padding:'4px 10px', fontSize:11, borderRadius:5,
                      border:'1px solid var(--border-strong)', background:'transparent',
                      color:'var(--foreground)', cursor:'pointer', fontFamily:'inherit'}}>
                      Upload new
                    </button>
                    <button style={{padding:'4px 10px', fontSize:11, borderRadius:5,
                      border:'none', background:'transparent',
                      color:'var(--muted-foreground)', cursor:'pointer', fontFamily:'inherit'}}>
                      Remove
                    </button>
                  </div>
                </div>
              </div>

              {/* fields */}
              <FieldRow label="Display name" value="Alice"
                hint="Shown on your profile and in messages."/>
              <FieldRow label="Username" value="Alice_Waбру" mono
                hint="Your unique handle. Friends use this to find you."/>
              <FieldRow label="Bio" value="Designer at Kauai Studio — interaction & low-light interfaces. Tea drinker."
                multiline serif/>
              <FieldRow label="Pronouns" value="she / her"/>
            </div>

            {/* credentials card */}
            <div style={{
              padding:'20px 22px', borderRadius:'var(--radius)',
              border:'1px solid var(--border)', background:'var(--card)',
            }}>
              <Mono style={{fontSize:9.5, letterSpacing:'0.14em', color:'var(--muted-foreground)',
                textTransform:'uppercase', display:'block', marginBottom:14}}>
                Credentials
              </Mono>
              <FieldRow label="Email" value="akasatana83@hotmail.fr" mono/>
              <FieldRow label="Password" value="•••••••••••••" mono action="Change"/>
              <FieldRow label="Two-factor"
                value={<span style={{display:'flex', alignItems:'center', gap:7}}>
                  <span style={{width:8, height:8, borderRadius:'50%', background:'var(--success)'}}/>
                  Enabled · authenticator app
                </span>}
                action="Manage"/>
            </div>

            {/* danger */}
            <div style={{marginTop:22, padding:'14px 18px', borderRadius:'var(--radius-sm)',
              border:'1px solid color-mix(in oklab, var(--destructive) 35%, var(--border))',
              background:'color-mix(in oklab, var(--destructive) 6%, transparent)',
              display:'flex', alignItems:'center', gap:12}}>
              <div style={{flex:1}}>
                <div style={{fontSize:13, color:'var(--foreground)', fontWeight:500}}>Delete account</div>
                <div style={{fontSize:11.5, color:'var(--muted-foreground)', marginTop:2}}>
                  This is permanent. Your messages remain with their recipients.
                </div>
              </div>
              <button style={{padding:'7px 14px', fontSize:12, borderRadius:5,
                border:'1px solid var(--destructive)', background:'transparent',
                color:'var(--destructive)', cursor:'pointer', fontFamily:'inherit'}}>
                Delete
              </button>
            </div>
          </div>

          {/* live profile preview */}
          <div style={{width:340, borderLeft:'1px solid var(--border)', padding:'34px 24px',
            background:'color-mix(in oklab, var(--card) 30%, transparent)'}}>
            <Mono style={{fontSize:10, letterSpacing:'0.14em', color:'var(--muted-foreground)',
              textTransform:'uppercase', display:'block', marginBottom:12}}>
              Preview · what friends see
            </Mono>
            <div style={{borderRadius:'var(--radius)', overflow:'hidden',
              border:'1px solid var(--border-strong)', background:'var(--popover)',
              boxShadow:'0 16px 40px -12px rgba(0,0,0,0.55)'}}>
              {/* banner */}
              <div style={{height:64, background:`linear-gradient(135deg,
                color-mix(in oklab, var(--chat) 50%, transparent),
                color-mix(in oklab, var(--voice) 30%, transparent))`}}/>
              <div style={{padding:'0 18px 18px', marginTop:-30, position:'relative'}}>
                <div style={{position:'relative', width:64}}>
                  <Avatar name="Alice" color="var(--chat)" size={64}/>
                  <div style={{position:'absolute', right:-2, bottom:-2, width:16, height:16,
                    borderRadius:'50%', border:'3px solid var(--popover)',
                    background:'var(--success)'}}/>
                </div>
                <Serif style={{fontSize:18, fontWeight:500, display:'block', marginTop:10}}>Alice Koa</Serif>
                <Mono style={{fontSize:10.5, color:'var(--muted-foreground)'}}>
                  @Alice_Waбру · she/her
                </Mono>
                <div style={{marginTop:12, fontSize:12.5, fontStyle:'italic',
                  fontFamily:'var(--serif, Fraunces), serif', lineHeight:1.5,
                  color:'var(--foreground)'}}>
                  Designer at Kauai Studio — interaction &amp; low-light interfaces. Tea drinker.
                </div>
                <div style={{height:1, background:'var(--border)', margin:'14px 0'}}/>
                <Mono style={{fontSize:9.5, letterSpacing:'0.14em', color:'var(--muted-foreground)',
                  textTransform:'uppercase', display:'block', marginBottom:6}}>Member since</Mono>
                <div style={{fontSize:12, color:'var(--foreground)'}}>March 2025 · 2 mutual friends</div>

                <button style={{marginTop:14, width:'100%', padding:'8px 12px', borderRadius:'var(--radius-sm)',
                  border:'none', background:'var(--chat)', color:'var(--primary-foreground)',
                  fontWeight:600, fontSize:12.5, cursor:'pointer', fontFamily:'inherit'}}>
                  Send message
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Artboard>
  );
}

function FieldRow({ label, value, hint, mono, multiline, serif, action }) {
  return (
    <div style={{padding:'14px 0', borderBottom:'1px solid var(--border)'}}>
      <div style={{display:'flex', alignItems:'flex-start', gap:18}}>
        <div style={{width:120, flexShrink:0, paddingTop:2}}>
          <Mono style={{fontSize:10, letterSpacing:'0.12em', color:'var(--muted-foreground)',
            textTransform:'uppercase'}}>{label}</Mono>
        </div>
        <div style={{flex:1, minWidth:0}}>
          <div style={{
            fontSize: serif ? 13.5 : 13, color:'var(--foreground)',
            fontFamily: mono ? 'JetBrains Mono, monospace'
              : serif ? 'var(--serif, Fraunces), serif' : 'inherit',
            fontStyle: serif ? 'italic' : 'normal',
            lineHeight: multiline ? 1.55 : 1.4,
          }}>
            {value}
          </div>
          {hint && <div style={{fontSize:11, color:'var(--muted-foreground)', marginTop:4}}>{hint}</div>}
        </div>
        <button style={{padding:'4px 10px', fontSize:11, borderRadius:5,
          border:'1px solid var(--border-strong)', background:'transparent',
          color:'var(--foreground)', cursor:'pointer', fontFamily:'inherit', flexShrink:0}}>
          {action || 'Edit'}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// B · Two-pane editor — inline form, floating save bar
// ─────────────────────────────────────────────────────────────────────────
function SettingsTwoPane() {
  return (
    <Artboard w={1200} h={780} style={{display:'flex'}}>
      {/* RAIL */}
      <div style={{width:220, borderRight:'1px solid var(--border)',
        padding:'22px 10px 14px', background:'var(--card)'}}>
        <Mono style={{fontSize:10, letterSpacing:'0.14em', color:'var(--muted-foreground)',
          textTransform:'uppercase', padding:'0 12px 14px'}}>Settings</Mono>
        <RailItem icon={Icons.users} label="Account"/>
        <RailItem icon={Icons.sparkle} label="Profile" active/>
        <RailItem icon={Icons.lock} label="Privacy"/>
        <RailItem icon={Icons.sun} label="Appearance"/>
        <RailItem icon={Icons.bell} label="Notifications"/>
        <RailItem icon={Icons.headset} label="Voice & video"/>
        <RailItem icon={Icons.settings} label="Keybinds"/>
      </div>

      {/* MAIN */}
      <div style={{flex:1, display:'flex', flexDirection:'column', position:'relative'}}>
        {/* breadcrumb topbar */}
        <div style={{height:60, borderBottom:'1px solid var(--border)',
          padding:'0 36px', display:'flex', alignItems:'center', gap:10}}>
          <Mono style={{fontSize:11, color:'var(--muted-foreground)', letterSpacing:'0.06em'}}>
            Settings <span style={{margin:'0 6px'}}>/</span>
          </Mono>
          <Serif style={{fontSize:15, fontWeight:500}}>Profile</Serif>
          <div style={{flex:1}}/>
          <button style={{width:30, height:30, borderRadius:'var(--radius-sm)', border:'none',
            background:'transparent', color:'var(--muted-foreground)', cursor:'pointer',
            display:'flex', alignItems:'center', justifyContent:'center'}}>✕</button>
        </div>

        <div style={{flex:1, padding:'36px 56px 110px', overflow:'auto', maxWidth:780}}>
          <SectionHeader
            eyebrow="profile"
            title="The face you put forward."
            hint="Your avatar, banner and bio are visible to friends and to anyone you share a message thread with."
          />

          {/* avatar + banner */}
          <div style={{display:'grid', gridTemplateColumns:'180px 1fr', gap:20, marginBottom:28}}>
            <div>
              <Mono style={{fontSize:10, letterSpacing:'0.12em', color:'var(--muted-foreground)',
                textTransform:'uppercase', display:'block', marginBottom:6}}>Avatar</Mono>
              <div style={{
                width:160, height:160, borderRadius:'var(--radius)',
                background:'var(--chat)',
                display:'flex', alignItems:'center', justifyContent:'center',
                color:'oklch(0.18 0.008 60)', fontFamily:'var(--serif), serif',
                fontSize:72, fontWeight:500, position:'relative', cursor:'pointer',
              }}>
                A
                <div style={{position:'absolute', inset:0, borderRadius:'var(--radius)',
                  background:'rgba(0,0,0,0.5)', opacity:0,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  color:'#fff', fontSize:11.5, fontFamily:'JetBrains Mono, monospace'}}>
                  drop image
                </div>
              </div>
              <div style={{display:'flex', gap:6, marginTop:8}}>
                <button style={{flex:1, padding:'5px 0', fontSize:11, borderRadius:5,
                  border:'1px solid var(--border-strong)', background:'transparent',
                  color:'var(--foreground)', cursor:'pointer', fontFamily:'inherit'}}>Change</button>
                <button style={{padding:'5px 9px', fontSize:11, borderRadius:5,
                  border:'1px solid var(--border)', background:'transparent',
                  color:'var(--muted-foreground)', cursor:'pointer', fontFamily:'inherit'}}>Reset</button>
              </div>
            </div>
            <div>
              <Mono style={{fontSize:10, letterSpacing:'0.12em', color:'var(--muted-foreground)',
                textTransform:'uppercase', display:'block', marginBottom:6}}>Banner</Mono>
              <div style={{
                height:160, borderRadius:'var(--radius)',
                background:`linear-gradient(135deg,
                  color-mix(in oklab, var(--chat) 50%, transparent),
                  color-mix(in oklab, var(--voice) 30%, transparent))`,
                border:'1px dashed var(--border-strong)',
                display:'flex', alignItems:'center', justifyContent:'center',
                color:'var(--muted-foreground)', fontSize:12, cursor:'pointer',
              }}>
                Drop image · or click to upload (1500×500)
              </div>
              <Mono style={{fontSize:10.5, color:'var(--muted-foreground)', marginTop:8, display:'block'}}>
                Recommended size 1500×500 · max 4MB
              </Mono>
            </div>
          </div>

          {/* split rows */}
          <SplitRow label="Display name" hint="Shown alongside your messages.">
            <input defaultValue="Alice" style={inputStyle()}/>
          </SplitRow>
          <SplitRow label="Username" hint="Your unique federated handle.">
            <div style={{display:'flex', gap:0}}>
              <input defaultValue="Alice_Waбру" style={{...inputStyle(), borderTopRightRadius:0,
                borderBottomRightRadius:0, fontFamily:'JetBrains Mono, monospace'}}/>
              <span style={{padding:'0 12px', display:'flex', alignItems:'center',
                background:'var(--muted)', border:'1px solid var(--border)', borderLeft:'none',
                borderTopRightRadius:'var(--radius-sm)', borderBottomRightRadius:'var(--radius-sm)',
                fontFamily:'JetBrains Mono, monospace', fontSize:12, color:'var(--muted-foreground)'}}>
                @kauai.pinai
              </span>
            </div>
          </SplitRow>
          <SplitRow label="Pronouns" hint="Optional. Shown on your profile.">
            <input defaultValue="she / her" style={inputStyle()}/>
          </SplitRow>
          <SplitRow label="Bio" hint="Up to 190 characters. Markdown supported." dirty>
            <div style={{position:'relative'}}>
              <textarea defaultValue="Designer at Kauai Studio — interaction & low-light interfaces. Tea drinker. Looking after a fern."
                style={{...inputStyle(), minHeight:80, padding:'10px 12px',
                  fontFamily:'var(--serif), serif', fontStyle:'italic', fontSize:13.5,
                  lineHeight:1.5, resize:'none',
                  border:'1px solid var(--chat)',
                  boxShadow:'0 0 0 3px color-mix(in oklab, var(--chat) 14%, transparent)'}}/>
              <Mono style={{position:'absolute', right:10, bottom:8, fontSize:10,
                color:'var(--muted-foreground)'}}>112 / 190</Mono>
            </div>
          </SplitRow>
          <SplitRow label="Accent" hint="Used to tint your profile card.">
            <div style={{display:'flex', gap:8}}>
              {[
                ['var(--chat)', true],
                ['var(--voice)', false],
                ['oklch(0.74 0.10 260)', false],
                ['oklch(0.74 0.10 330)', false],
                ['oklch(0.74 0.10 28)', false],
              ].map(([c, a],i) => (
                <span key={i} style={{
                  width:30, height:30, borderRadius:'50%', background:c, cursor:'pointer',
                  border: a ? '2px solid var(--foreground)' : '2px solid transparent',
                  boxShadow: a ? `0 0 0 2px ${c}` : 'none',
                }}/>
              ))}
            </div>
          </SplitRow>
        </div>

        {/* floating save bar */}
        <div style={{
          position:'absolute', left:36, right:36, bottom:24,
          height:54, borderRadius:'var(--radius)',
          background:'oklch(0.16 0.012 60)',
          border:'1px solid var(--border-strong)',
          boxShadow:'0 16px 40px -12px rgba(0,0,0,0.6)',
          display:'flex', alignItems:'center', gap:14, padding:'0 14px 0 18px',
        }}>
          <span style={{width:8, height:8, borderRadius:'50%', background:'var(--voice)',
            animation:'pn-pulse 1.6s ease-in-out infinite'}}/>
          <div style={{flex:1}}>
            <div style={{fontSize:12.5, fontWeight:500, color:'var(--foreground)'}}>Careful — you have unsaved changes.</div>
            <Mono style={{fontSize:10.5, color:'var(--muted-foreground)'}}>1 field changed · bio</Mono>
          </div>
          <button style={{padding:'7px 12px', fontSize:12, borderRadius:5,
            border:'none', background:'transparent', color:'var(--muted-foreground)',
            cursor:'pointer', fontFamily:'inherit'}}>Reset</button>
          <button style={{padding:'7px 16px', fontSize:12, borderRadius:5,
            border:'none', background:'var(--success)', color:'oklch(0.16 0.030 150)',
            fontWeight:600, cursor:'pointer', fontFamily:'inherit'}}>
            Save changes
          </button>
        </div>
      </div>
    </Artboard>
  );
}

function inputStyle() {
  return {
    width:'100%', height:36, padding:'0 12px',
    background:'var(--input)', border:'1px solid var(--border)',
    borderRadius:'var(--radius-sm)', color:'var(--foreground)',
    fontSize:13, fontFamily:'inherit', outline:'none',
    boxSizing:'border-box',
  };
}

function SplitRow({ label, hint, children, dirty }) {
  return (
    <div style={{display:'grid', gridTemplateColumns:'180px 1fr', gap:32,
      padding:'18px 0', borderBottom:'1px solid var(--border)', alignItems:'flex-start'}}>
      <div>
        <div style={{display:'flex', alignItems:'center', gap:6}}>
          <Serif style={{fontSize:13.5, fontWeight:500}}>{label}</Serif>
          {dirty && <span style={{width:5, height:5, borderRadius:'50%', background:'var(--voice)'}}/>}
        </div>
        {hint && <div style={{fontSize:11, color:'var(--muted-foreground)', marginTop:3, lineHeight:1.5}}>{hint}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// C · Card grid + drill-in — landing tiles, focused editor on the right
// ─────────────────────────────────────────────────────────────────────────
function SettingsCardGrid() {
  return (
    <Artboard w={1200} h={780} style={{display:'flex'}}>
      {/* LEFT — landing grid */}
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

        {/* identity tile (wide, special) */}
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
          <button style={{padding:'7px 14px', fontSize:12, borderRadius:5,
            border:'1px solid var(--chat)', background:'transparent',
            color:'var(--chat)', cursor:'pointer', fontFamily:'inherit', fontWeight:500}}>
            Manage account
          </button>
        </div>

        {/* tiles */}
        <div style={{display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:12}}>
          <SettingTile
            icon={Icons.sparkle} label="Profile" active
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
          <SettingTile
            icon={Icons.message} label="Connected servers"
            desc="Federated identities you've linked."
            preview={<Mono style={{fontSize:10.5, color:'var(--muted-foreground)'}}>kauai · studio · lab</Mono>}
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

      {/* RIGHT — drill-in (Profile) */}
      <div style={{flex:0.95, padding:'30px 32px', background:'var(--card)',
        display:'flex', flexDirection:'column'}}>
        <Mono style={{fontSize:10, letterSpacing:'0.14em', color:'var(--muted-foreground)',
          textTransform:'uppercase', marginBottom:5}}>Editing · profile</Mono>
        <Serif style={{fontSize:24, fontWeight:400, letterSpacing:'-0.01em'}}>
          The face you put forward.
        </Serif>

        <div style={{marginTop:22, display:'flex', gap:14, alignItems:'center'}}>
          <Avatar name="Alice" color="var(--chat)" size={64}/>
          <div style={{flex:1}}>
            <button style={{padding:'5px 11px', fontSize:11.5, borderRadius:5,
              border:'1px solid var(--border-strong)', background:'transparent',
              color:'var(--foreground)', cursor:'pointer', fontFamily:'inherit'}}>
              Upload avatar
            </button>
            <Mono style={{fontSize:10, color:'var(--muted-foreground)', display:'block',
              marginTop:5}}>PNG · JPG · max 4MB</Mono>
          </div>
        </div>

        <div style={{marginTop:18, display:'flex', flexDirection:'column', gap:14}}>
          <Field label="Display name" value="Alice"/>
          <Field label="Username" value="Alice_Waбру" mono/>
          <Field label="Pronouns" value="she / her"/>
          <div>
            <Mono style={{fontSize:10, letterSpacing:'0.12em', color:'var(--muted-foreground)',
              textTransform:'uppercase', display:'block', marginBottom:5}}>Bio</Mono>
            <div style={{padding:'10px 12px', background:'var(--input)',
              border:'1px solid var(--border)', borderRadius:'var(--radius-sm)',
              fontFamily:'var(--serif), serif', fontStyle:'italic', fontSize:13,
              color:'var(--foreground)', lineHeight:1.5, minHeight:72}}>
              Designer at Kauai Studio — interaction &amp; low-light interfaces. Tea drinker. Looking after a fern.
              <span style={{display:'inline-block', width:1.5, height:12, background:'var(--chat)',
                verticalAlign:'middle', marginLeft:1, animation:'pn-blink 1s steps(2) infinite'}}/>
            </div>
            <Mono style={{fontSize:10, color:'var(--muted-foreground)', display:'block',
              marginTop:5, textAlign:'right'}}>112 / 190</Mono>
          </div>
        </div>

        <div style={{flex:1}}/>
        <div style={{display:'flex', gap:8, paddingTop:14, borderTop:'1px solid var(--border)'}}>
          <button style={{padding:'8px 12px', fontSize:12, borderRadius:5, border:'none',
            background:'transparent', color:'var(--muted-foreground)', cursor:'pointer',
            fontFamily:'inherit'}}>Reset</button>
          <div style={{flex:1}}/>
          <button style={{padding:'8px 12px', fontSize:12, borderRadius:5,
            border:'1px solid var(--border-strong)', background:'transparent',
            color:'var(--foreground)', cursor:'pointer', fontFamily:'inherit'}}>Cancel</button>
          <button style={{padding:'8px 16px', fontSize:12, borderRadius:5, border:'none',
            background:'var(--chat)', color:'var(--primary-foreground)', fontWeight:600,
            cursor:'pointer', fontFamily:'inherit'}}>Save</button>
        </div>
      </div>
    </Artboard>
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
          width:26, height:26, borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center',
          background: active ? 'var(--chat)' : 'var(--muted)',
          color: active ? 'var(--primary-foreground)' : danger ? 'var(--destructive)' : 'var(--muted-foreground)',
        }}>{icon}</span>
        <Serif style={{fontSize:13.5, fontWeight:500,
          color: danger ? 'var(--destructive)' : 'var(--foreground)'}}>{label}</Serif>
        <div style={{flex:1}}/>
        {active && <span style={{color:'var(--chat)', fontSize:14}}>{Icons.chevR}</span>}
      </div>
      <div style={{fontSize:11.5, color:'var(--muted-foreground)', lineHeight:1.45}}>{desc}</div>
      {preview && <div style={{marginTop:'auto', paddingTop:4}}>{preview}</div>}
    </div>
  );
}

function Field({ label, value, mono }) {
  return (
    <div>
      <Mono style={{fontSize:10, letterSpacing:'0.12em', color:'var(--muted-foreground)',
        textTransform:'uppercase', display:'block', marginBottom:5}}>{label}</Mono>
      <div style={{padding:'9px 12px', background:'var(--input)',
        border:'1px solid var(--border)', borderRadius:'var(--radius-sm)',
        fontSize:13, color:'var(--foreground)',
        fontFamily: mono ? 'JetBrains Mono, monospace' : 'inherit'}}>
        {value}
      </div>
    </div>
  );
}

Object.assign(window, {
  SettingsEditorial,
  SettingsTwoPane,
  SettingsCardGrid,
});
