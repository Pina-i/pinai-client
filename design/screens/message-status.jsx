// Message status badges — proposals for sent/read indicators
// All applied to self-sent messages using the real chat layout
// (flat rows: avatar + name + time, then text — no bubbles).
// States covered: sending · sent · delivered · read

// Row that mirrors Msg from chat.jsx — extended with a status slot
// rendered next to the name/time line on `first` rows, or floated to the
// right of the text on subsequent rows.
function MsgRow({ first, name, color, time, self, status, statusInline, children }) {
  return (
    <div style={{display:'flex', gap:14,
      padding: first ? '14px 0 2px' : '0 0 2px 54px',
      alignItems:'flex-start'}}>
      {first && <Avatar name={name} color={color} size={40}/>}
      <div style={{flex:1, minWidth:0}}>
        {first && (
          <div style={{display:'flex', alignItems:'baseline', gap:8, marginBottom:3}}>
            <Serif style={{fontSize:14.5, fontWeight:500,
              color: self ? 'var(--chat)' : 'var(--foreground)'}}>{name}</Serif>
            <Mono style={{fontSize:10.5, color:'var(--muted-foreground)'}}>{time}</Mono>
            {status && <span style={{display:'inline-flex', alignItems:'center', gap:5}}>{status}</span>}
          </div>
        )}
        <div style={{fontSize:13.5, lineHeight:1.55, color:'var(--foreground)',
          textWrap:'pretty', display:'flex', alignItems:'flex-end', gap:10,
          justifyContent:'space-between'}}>
          <span style={{flex:1, minWidth:0}}>{children}</span>
          {statusInline && (
            <span style={{flexShrink:0, paddingBottom:1}}>{statusInline}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function Thread({ children, label, desc }) {
  return (
    <div style={{
      padding:'18px 18px 14px', borderRadius:'var(--radius)',
      background:'var(--card)', border:'1px solid var(--border)',
      display:'flex', flexDirection:'column', gap:0,
    }}>
      <div style={{display:'flex', alignItems:'baseline', gap:10, marginBottom:8,
        paddingBottom:10, borderBottom:'1px solid var(--border)'}}>
        <Mono style={{fontSize:10, color:'var(--muted-foreground)',
          letterSpacing:'0.14em', textTransform:'uppercase'}}>{label}</Mono>
        <span style={{fontSize:11, color:'var(--muted-foreground)',
          fontStyle:'italic', fontFamily:'var(--serif), serif'}}>{desc}</span>
      </div>
      <div style={{
        background:'var(--background)', borderRadius:10, padding:'2px 14px 10px',
        display:'flex', flexDirection:'column', gap:0,
      }}>{children}</div>
    </div>
  );
}

function MessageStatusProposals() {
  return (
    <div style={{
      width:'100%', height:'100%', overflow:'auto',
      padding:'28px 32px', background:'var(--background)',
      color:'var(--foreground)',
      fontFamily:'Geist, ui-sans-serif, system-ui, sans-serif',
    }}>
      <div style={{marginBottom:22, maxWidth:680}}>
        <Mono style={{fontSize:10, color:'var(--muted-foreground)',
          letterSpacing:'0.14em', textTransform:'uppercase'}}>
          Specimens · message status
        </Mono>
        <Serif as="h1" style={{margin:'8px 0 6px', fontSize:32, fontWeight:400,
          letterSpacing:'-0.018em', lineHeight:1.05}}>
          Sent, delivered, <em style={{fontStyle:'italic', color:'var(--chat)'}}>read.</em>
        </Serif>
        <p style={{margin:0, color:'var(--muted-foreground)', fontSize:13,
          lineHeight:1.55}}>
          Six treatments for read-receipt indicators on self-sent messages, using
          the existing flat row layout (no bubbles). Each thread ends in a different
          state; the legend below each maps the badge vocabulary.
        </p>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
        <VariantTicks/>
        <VariantText/>
        <VariantAvatarPip/>
        <VariantAccent/>
        <VariantTrailing/>
        <VariantSeenChip/>
      </div>
    </div>
  );
}

Object.assign(window, { MessageStatusProposals, MsgRow, Thread });
