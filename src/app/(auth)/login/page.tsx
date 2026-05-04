'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [tab, setTab]           = useState<'login'|'register'>('login')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFN]      = useState('')
  const [lastName, setLN]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [msg, setMsg]           = useState('')
  const [showPwd, setShowPwd]   = useState(false)
  const router   = useRouter()
  const supabase = createClient()

  async function handleLogin() {
    if (!email || !password) { setMsg('Email et mot de passe requis'); return }
    setLoading(true); setMsg('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setMsg(error.message); setLoading(false); return }
    router.push('/dashboard')
  }

  async function handleRegister() {
    if (!email || !password) { setMsg('Email et mot de passe requis'); return }
    if (password.length < 8) { setMsg('Mot de passe trop court (8 min)'); return }
    setLoading(true); setMsg('')
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: `${firstName} ${lastName}`.trim() } }
    })
    if (error) { setMsg(error.message); setLoading(false); return }
    setMsg('Compte créé ! Connectez-vous.')
    setTab('login'); setLoading(false)
  }

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', background:'var(--ink)', fontFamily:'var(--mono)' }}>

      {/* PANNEAU GAUCHE — Photo hero */}
      <div style={{
        flex: 1,
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}>
        {/* Photo de fond */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: "url('/hero-bg.png')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'brightness(.7)',
        }} />

        {/* Overlay dégradé */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg, rgba(10,10,18,.3) 0%, rgba(10,10,18,.1) 30%, rgba(10,10,18,.7) 70%, rgba(10,10,18,.95) 100%)',
        }} />

        {/* Overlay latéral vers le formulaire */}
        <div style={{
          position: 'absolute', right: 0, top: 0, bottom: 0, width: '30%',
          background: 'linear-gradient(90deg, transparent, rgba(10,10,18,.8))',
        }} />

        {/* Contenu sur la photo */}
        <div style={{ position:'relative', zIndex:1, padding:'40px 48px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:36, height:36, borderRadius:8, background:'linear-gradient(135deg,var(--gold),var(--gold2))', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, fontWeight:900, color:'#0A0A0C', fontFamily:'var(--syne)', boxShadow:'0 4px 16px rgba(212,168,75,.4)' }}>P</div>
            <div>
              <div style={{ fontFamily:'var(--syne)', fontSize:16, fontWeight:800, color:'#fff' }}>PMO-IA Studio</div>
              <div style={{ fontSize:9, color:'rgba(255,255,255,.5)', marginTop:1 }}>v2.0 · PMBOK 7 + CPMAI</div>
            </div>
          </div>
        </div>

        <div style={{ position:'relative', zIndex:1, padding:'0 48px 52px' }}>
          <h1 style={{ fontFamily:'var(--syne)', fontSize:'clamp(28px,3vw,46px)', fontWeight:800, lineHeight:1.1, color:'#fff', marginBottom:16 }}>
            Le copilote IA<br />
            <span style={{ background:'linear-gradient(135deg,var(--gold),var(--gold2),var(--cyan))', WebkitBackgroundClip:'text', backgroundClip:'text', color:'transparent' }}>
              des Chefs de Projet
            </span>
          </h1>
          <p style={{ fontSize:13, color:'rgba(255,255,255,.7)', lineHeight:1.8, maxWidth:380, marginBottom:36 }}>
            Générez Charte, WBS, RACI, PERT, RAID et Mind Map en quelques secondes. Conçu par un CP PMP® pour des CPs.
          </p>

          {/* Features */}
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {[
              { icon:'🎯', label:'7 générateurs PMI', sub:'Charte, WBS, RACI, RAID, Recette, Gantt, PMP' },
              { icon:'📊', label:'PERT + Mind Map IA', sub:'Chemin critique automatique, Mind Map éditable' },
              { icon:'🔗', label:'Notion · Drive · Gmail', sub:'Export automatique vers vos outils' },
            ].map(f => (
              <div key={f.label} style={{ display:'flex', gap:12, padding:'10px 14px', background:'rgba(255,255,255,.08)', backdropFilter:'blur(8px)', border:'1px solid rgba(255,255,255,.12)', borderRadius:10 }}>
                <span style={{ fontSize:18 }}>{f.icon}</span>
                <div>
                  <div style={{ fontSize:12, fontWeight:600, color:'#fff' }}>{f.label}</div>
                  <div style={{ fontSize:10, color:'rgba(255,255,255,.55)', marginTop:2 }}>{f.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* PANNEAU DROIT — Formulaire */}
      <div style={{
        width: 440,
        flexShrink: 0,
        background: 'rgba(19,19,26,.97)',
        backdropFilter: 'blur(20px)',
        borderLeft: '1px solid rgba(255,255,255,.08)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '52px 44px',
        position: 'relative',
      }}>
        {/* Accent vert en haut */}
        <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:'linear-gradient(90deg,var(--gold),var(--green))' }} />

        <div style={{ marginBottom:32 }}>
          <h2 style={{ fontFamily:'var(--syne)', fontSize:26, fontWeight:800, color:'var(--white)', marginBottom:6 }}>
            {tab === 'login' ? 'Connexion' : 'Créer un compte'}
          </h2>
          <p style={{ fontSize:12, color:'var(--muted)' }}>
            {tab === 'login' ? 'Accédez à votre espace PMO-IA Studio' : '14 jours gratuits · Sans carte bancaire'}
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', marginBottom:28, background:'var(--ink3)', borderRadius:10, padding:3, border:'1.5px solid var(--line)' }}>
          {(['login','register'] as const).map(t => (
            <button key={t} onClick={() => { setTab(t); setMsg('') }}
              style={{ flex:1, padding:'9px', textAlign:'center', fontSize:13, fontWeight:500, cursor:'pointer', borderRadius:8, transition:'all .15s', color: tab===t ? 'var(--text)' : 'var(--dim)', border:'none', background: tab===t ? 'var(--ink4)' : 'transparent', fontFamily:'var(--mono)' }}>
              {t === 'login' ? 'Se connecter' : 'Créer un compte'}
            </button>
          ))}
        </div>

        {msg && (
          <div style={{ fontSize:12, color: msg.includes('créé') ? 'var(--green)' : 'var(--red)', marginBottom:16, padding:'8px 12px', background: msg.includes('créé') ? 'rgba(53,200,144,.08)' : 'rgba(240,96,96,.08)', borderRadius:6, border:`1px solid ${msg.includes('créé') ? 'rgba(53,200,144,.2)' : 'rgba(240,96,96,.2)'}` }}>
            {msg}
          </div>
        )}

        {tab === 'register' && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
            <div><label className="fl">Prénom</label><input className="fi" placeholder="Jean" value={firstName} onChange={e => setFN(e.target.value)} /></div>
            <div><label className="fl">Nom</label><input className="fi" placeholder="Dupont" value={lastName} onChange={e => setLN(e.target.value)} /></div>
          </div>
        )}

        <div style={{ marginBottom:14 }}>
          <label className="fl">Email</label>
          <input className="fi" type="email" placeholder="votre@email.fr" value={email} onChange={e => setEmail(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') tab === 'login' ? handleLogin() : handleRegister() }} />
        </div>

        <div style={{ marginBottom:24, position:'relative' }}>
          <label className="fl">Mot de passe{tab === 'register' ? ' (8 min)' : ''}</label>
          <input className="fi" type={showPwd ? 'text' : 'password'} placeholder="••••••••••••" value={password} onChange={e => setPassword(e.target.value)} style={{ paddingRight:44 }}
            onKeyDown={e => { if (e.key === 'Enter') tab === 'login' ? handleLogin() : handleRegister() }} />
          <button onClick={() => setShowPwd(!showPwd)} style={{ position:'absolute', right:12, bottom:11, background:'none', border:'none', cursor:'pointer', color:'var(--dim)', fontSize:16 }}>
            {showPwd ? '🙈' : '👁'}
          </button>
        </div>

        <button className="btn-gold" style={{ width:'100%', marginBottom:20, fontSize:14, padding:'12px' }}
          onClick={tab === 'login' ? handleLogin : handleRegister} disabled={loading}>
          {loading ? 'Chargement...' : tab === 'login' ? '→ Connexion' : '→ Créer mon compte'}
        </button>

        <div style={{ display:'flex', alignItems:'center', gap:14, margin:'4px 0 16px', fontSize:12, color:'var(--dim)' }}>
          <div style={{ flex:1, height:1, background:'var(--line2)' }} />
          ou continuer avec
          <div style={{ flex:1, height:1, background:'var(--line2)' }} />
        </div>

        <button onClick={() => supabase.auth.signInWithOAuth({ provider:'google', options:{ redirectTo: (typeof window !== 'undefined' ? window.location.origin : '') + '/auth/callback' } })}
          style={{ width:'100%', padding:'11px', border:'1.5px solid var(--line2)', borderRadius:9, background:'var(--ink3)', fontFamily:'var(--mono)', fontSize:13, color:'var(--muted)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8, transition:'all .15s' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--ink4)'; (e.currentTarget as HTMLElement).style.color = 'var(--text)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--ink3)'; (e.currentTarget as HTMLElement).style.color = 'var(--muted)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
          Continuer avec Google
        </button>

        <div style={{ marginTop:28, fontSize:10, color:'var(--dim)', textAlign:'center', lineHeight:1.6 }}>
          En vous connectant, vous acceptez nos CGU.<br/>
          <span style={{ color:'var(--gold2)' }}>PMO-IA Studio</span> · Conçu par un CP PMP® pour des CPs
        </div>
      </div>
    </div>
  )
}
