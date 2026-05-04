'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AppLayout from '@/components/layout/AppLayout'

export default function DashboardPage() {
  const [projects, setProjects] = useState<any[]>([])
  const [docs, setDocs]         = useState<any[]>([])
  const [user, setUser]         = useState<any>(null)
  const router   = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUser(user)
    const { data: projs } = await supabase.from('projects').select('*').eq('user_id', user.id).eq('is_archived', false).order('created_at', { ascending: false }).limit(5)
    setProjects(projs || [])
    const { data: documents } = await supabase.from('documents').select('*, projects(name)').eq('user_id', user.id).order('created_at', { ascending: false }).limit(6)
    setDocs(documents || [])
  }

  const firstName = user?.email?.split('@')[0] || 'Chef de Projet'

  return (
    <AppLayout>
      <div className="sec-label">// Tableau de bord</div>
      <h1 style={{ fontFamily: 'var(--syne)', fontSize: 22, fontWeight: 700, color: 'var(--white)', marginBottom: 24 }}>
        Bonjour, {firstName} 👋
      </h1>

      <div className="kpi-grid">
        {[
          { label: 'Projets actifs',    value: projects.length, trend: '↑', color: 'var(--white)' },
          { label: 'Documents générés', value: docs.length,     trend: '↑', color: 'var(--white)' },
          { label: 'Modèle IA',         value: 'Claude',        trend: '✓', color: 'var(--green)' },
          { label: 'Statut',            value: 'En ligne',      trend: '●', color: 'var(--green)' },
        ].map(k => (
          <div className="kpi" key={k.label}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value" style={{ color: k.color, fontSize: typeof k.value === 'string' ? 18 : 26 }}>{k.value}</div>
            <div className="kpi-trend t-up">{k.trend} Actif</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 20 }}>
        <div>
          <div className="card">
            <div className="card-hdr">
              <div className="card-title">◈ Projets récents</div>
              <span style={{ fontSize: 10, color: 'var(--gold2)', cursor: 'pointer' }} onClick={() => router.push('/projects')}>Voir tout →</span>
            </div>
            <div style={{ padding: 0 }}>
              {projects.length === 0 ? (
                <div style={{ padding: '32px 18px', textAlign: 'center' }}>
                  <div style={{ fontSize: 24, marginBottom: 8, opacity: .4 }}>◈</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>Aucun projet. Créez votre premier projet pour commencer.</div>
                  <button className="btn-sm-gold" onClick={() => router.push('/projects/new')}>+ Créer un projet</button>
                </div>
              ) : (
                projects.map(p => (
                  <div key={p.id} onClick={() => router.push('/projects/' + p.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 18px', borderBottom: '1px solid rgba(42,42,54,.6)', cursor: 'pointer', transition: 'background .12s' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.015)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{p.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--dim)', marginTop: 2 }}>{p.project_type} · {new Date(p.created_at).toLocaleDateString('fr-FR')}</div>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--gold2)' }}>→</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card">
            <div className="card-hdr"><div className="card-title">⚡ Démarrage rapide</div></div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { icon: '✦', label: 'Nouveau projet',    sub: 'Wizard de cadrage', action: () => router.push('/projects/new') },
                { icon: '◈', label: 'Mes projets',       sub: 'Voir le portefeuille', action: () => router.push('/projects') },
                { icon: '⚡', label: 'Générateurs PMI',  sub: 'Sans projet lié', action: () => router.push('/generators') },
                { icon: '💼', label: 'Créer une propale', sub: 'Proposition client', action: () => router.push('/propale') },
              ].map(q => (
                <div key={q.label} onClick={q.action}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--ink3)', border: '1px solid var(--line)', borderRadius: 8, cursor: 'pointer', transition: 'all .12s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--gold)'; (e.currentTarget as HTMLElement).style.background = 'rgba(200,168,75,.05)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--line)'; (e.currentTarget as HTMLElement).style.background = 'var(--ink3)' }}>
                  <div style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--ink4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>{q.icon}</div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text)' }}>{q.label}</div>
                    <div style={{ fontSize: 10, color: 'var(--dim)', marginTop: 1 }}>{q.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {docs.length > 0 && (
            <div className="card">
              <div className="card-hdr"><div className="card-title">📄 Documents récents</div></div>
              <div style={{ padding: 0 }}>
                {docs.slice(0, 4).map(d => (
                  <div key={d.id} style={{ padding: '9px 18px', borderBottom: '1px solid rgba(42,42,54,.6)', fontSize: 11 }}>
                    <div style={{ color: 'var(--text)', fontWeight: 500 }}>{d.title}</div>
                    <div style={{ color: 'var(--dim)', fontSize: 10, marginTop: 2 }}>{d.projects?.name} · {new Date(d.created_at).toLocaleDateString('fr-FR')}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
