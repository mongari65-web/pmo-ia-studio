'use client'
import { useState, useEffect, createContext, useContext } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const ToastContext = createContext<(msg: string) => void>(() => {})
export const useToast = () => useContext(ToastContext)

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser]   = useState<any>(null)
  const [toast, setToast] = useState('')
  const router   = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.push('/login')
      else setUser(user)
    })
  }, [])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  async function logout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const nav = [
    { section: 'Workspace', items: [
      { href: '/dashboard',    icon: '⊞', label: 'Dashboard' },
      { href: '/projects',     icon: '◈', label: 'Mes projets' },
      { href: '/projects/new', icon: '✦', label: 'Nouveau projet', badge: 'IA', badgeClass: 'sb-green' },
    ]},
    { section: 'Générateurs', items: [
      { href: '/generators', icon: '⚡', label: 'Documents PMI' },
      { href: '/propale',    icon: '💼', label: 'Propale / Contrat' },
    ]},
    { section: 'Portfolio', items: [
      { href: '/clients',  icon: '◎', label: 'Clients' },
      { href: '/settings', icon: '⚙', label: 'Configuration' },
    ]},
    ...(user?.email === 'mongari65@gmail.com' ? [{ section: 'Administration', items: [
      { href: '/admin', icon: '🔐', label: 'Panneau Admin', badge: 'ADMIN', badgeClass: 'sb-red' },
    ]}] : []),
  ]

  if (!user) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'var(--ink)', color:'var(--text)' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontFamily:'var(--syne)', fontSize:20, fontWeight:700, color:'var(--gold2)', marginBottom:8 }}>PMO-IA Studio</div>
        <div style={{ fontSize:13, color:'var(--muted)' }}>Chargement...</div>
      </div>
    </div>
  )

  return (
    <ToastContext.Provider value={showToast}>
      <div className="app-shell">

        {/* SIDEBAR */}
        <nav className="sidebar">
          <div className="s-brand" onClick={() => router.push('/dashboard')}>
            <div className="s-mark">P</div>
            <div>
              <div style={{ fontFamily:'var(--syne)', fontSize:13, fontWeight:800, color:'var(--white)', lineHeight:1.2 }}>PMO-IA Studio</div>
              <div style={{ fontSize:9, color:'var(--dim)', marginTop:2 }}>v2.0 · PMBOK 7</div>
            </div>
          </div>

          {nav.map(group => (
            <div key={group.section}>
              <div className="s-section">{group.section}</div>
              {group.items.map((item: any) => (
                <a key={item.href}
                  className={`s-item${pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href)) ? ' active' : ''}`}
                  onClick={() => router.push(item.href)}
                  style={{ cursor:'pointer' }}>
                  <span style={{ fontSize:15 }}>{item.icon}</span>
                  <span style={{ flex:1 }}>{item.label}</span>
                  {item.badge && <span className={`s-badge ${item.badgeClass}`}>{item.badge}</span>}
                </a>
              ))}
            </div>
          ))}

          <div style={{ marginTop:'auto', borderTop:'1px solid var(--line)', padding:'10px' }}>
            <div className="user-card">
              <div className="avatar">{user.email?.slice(0,2).toUpperCase()}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:11, fontWeight:600, color:'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{user.email}</div>
                <div style={{ fontSize:9, color:'var(--green)', marginTop:2, display:'flex', alignItems:'center', gap:4 }}>
                  <span style={{ width:5, height:5, borderRadius:'50%', background:'var(--green)', display:'inline-block' }}></span>
                  Chef de Projet · Pro
                </div>
              </div>
              <button onClick={logout} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--dim)', fontSize:16, padding:4 }} title="Déconnexion">⏻</button>
            </div>
          </div>
        </nav>

        {/* MAIN */}
        <div className="main-area">

          {/* ── HERO TOPBAR ── */}
          <header style={{
            position: 'relative',
            height: 110,
            flexShrink: 0,
            overflow: 'hidden',
            cursor: 'pointer',
          }} onClick={() => router.push('/dashboard')}>

            {/* Photo pleine largeur — affichée sans zoom */}
            <div style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: "url('/hero-bg.png')",
              backgroundSize: '100% auto',
              backgroundPosition: 'center center',
              backgroundRepeat: 'no-repeat',
              backgroundColor: '#0D1A0D',
            }} />

            {/* Overlay sombre pour lisibilité */}
            <div style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(90deg, rgba(10,10,18,.85) 0%, rgba(10,10,18,.65) 55%, rgba(10,10,18,.35) 100%)',
            }} />

            {/* Bordure bas dégradée */}
            <div style={{
              position: 'absolute',
              bottom: 0, left: 0, right: 0,
              height: 2,
              background: 'linear-gradient(90deg, var(--gold), var(--green), transparent)',
            }} />

            {/* Contenu incrusté */}
            <div style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 28px',
              zIndex: 2,
            }}>
              {/* Titre + slogan */}
              <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 9,
                  background: 'linear-gradient(135deg,var(--gold),var(--gold2))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 17, fontWeight: 900, color: '#0A0A0C',
                  fontFamily: 'var(--syne)',
                  boxShadow: '0 2px 12px rgba(212,168,75,.5)',
                  flexShrink: 0,
                }}>P</div>

                <div>
                  <div style={{
                    fontFamily: 'var(--syne)',
                    fontSize: 20,
                    fontWeight: 900,
                    color: '#FFFFFF',
                    letterSpacing: '-.4px',
                    lineHeight: 1,
                    textShadow: '0 1px 8px rgba(0,0,0,.6)',
                  }}>
                    PMO-IA Studio
                  </div>
                  <div style={{
                    fontSize: 12,
                    color: 'rgba(255,255,255,.75)',
                    marginTop: 4,
                    fontStyle: 'italic',
                    textShadow: '0 1px 4px rgba(0,0,0,.5)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}>
                    Le copilote IA des
                    <span style={{
                      color: 'var(--gold2)',
                      fontStyle: 'normal',
                      fontWeight: 700,
                      textShadow: '0 0 12px rgba(212,168,75,.4)',
                    }}>Chefs de Projet</span>
                    <span style={{ color:'rgba(255,255,255,.3)' }}>·</span>
                    <span style={{ color:'var(--cyan)', fontStyle:'normal', fontWeight:600, fontSize:10 }}>PMBOK 7</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display:'flex', alignItems:'center', gap:10 }} onClick={e => e.stopPropagation()}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '5px 12px',
                  background: 'rgba(53,200,144,.12)',
                  border: '1px solid rgba(53,200,144,.3)',
                  borderRadius: 20,
                  backdropFilter: 'blur(4px)',
                }}>
                  <span style={{ width:6, height:6, borderRadius:'50%', background:'var(--green)', display:'inline-block', boxShadow:'0 0 6px var(--green)' }}></span>
                  <span style={{ fontSize:10, color:'var(--green)', fontWeight:600 }}>Claude AI · En ligne</span>
                </div>
                <button className="btn-sm-gold" onClick={() => router.push('/projects/new')}>
                  + Nouveau projet
                </button>
              </div>
            </div>
          </header>

          <main className="content">{children}</main>
        </div>

        <div className={`toast${toast ? ' show' : ''}`}>
          <span style={{ color:'var(--green)' }}>✓</span> {toast}
        </div>
      </div>
    </ToastContext.Provider>
  )
}
