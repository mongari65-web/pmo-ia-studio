'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AppLayout from '@/components/layout/AppLayout'

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  migration:   { label: 'Migration',    color: 'var(--purple)' },
  infra:       { label: 'Infrastructure', color: 'var(--blue)' },
  reseau:      { label: 'Réseau',        color: 'var(--cyan)' },
  deploiement: { label: 'Déploiement',  color: 'var(--amber)' },
  pra:         { label: 'PRA / PCA',    color: 'var(--green)' },
  solution_ia: { label: 'Solution IA',  color: 'var(--purple)' },
  rd_ia:       { label: 'R&D IA',       color: 'var(--purple)' },
  secu:        { label: 'Sécurité',     color: 'var(--red)' },
  devapp:      { label: 'Dev Agile',    color: 'var(--blue)' },
  transfoSI:   { label: 'Transfo SI',   color: 'var(--amber)' },
}

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  cadrage:      { label: 'Cadrage',      cls: 'b-purple' },
  planification:{ label: 'Planification',cls: 'b-amber'  },
  execution:    { label: 'Exécution',    cls: 'b-cyan'   },
  recette:      { label: 'Recette',      cls: 'b-gold'   },
  cloture:      { label: 'Clôture',      cls: 'b-green'  },
}

export default function ProjectsPage() {
  const [projects, setProjects]       = useState<any[]>([])
  const [loading, setLoading]         = useState(true)
  const [confirmDelete, setConfirmDelete] = useState<any>(null)
  const [deleting, setDeleting]       = useState(false)
  const router   = useRouter()
  const supabase = createClient()

  useEffect(() => { loadProjects() }, [])

  async function loadProjects() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('projects')
      .select('*, clients(name)')
      .eq('user_id', user.id)
      .eq('is_archived', false)
      .order('created_at', { ascending: false })
    setProjects(data || [])
    setLoading(false)
  }

  async function deleteProject() {
    if (!confirmDelete) return
    setDeleting(true)
    // Supprimer les documents liés
    await supabase.from('documents').delete().eq('project_id', confirmDelete.id)
    await supabase.from('raid_items').delete().eq('project_id', confirmDelete.id)
    await supabase.from('jalons').delete().eq('project_id', confirmDelete.id)
    // Supprimer le projet
    await supabase.from('projects').delete().eq('id', confirmDelete.id)
    setConfirmDelete(null)
    setDeleting(false)
    loadProjects()
  }

  return (
    <AppLayout>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:24 }}>
        <div>
          <div className="sec-label">// Portefeuille</div>
          <h1 className="sec-title" style={{ marginBottom:4 }}>Mes projets</h1>
          <p style={{ fontSize:12, color:'var(--muted)' }}>{projects.length} projet{projects.length !== 1 ? 's' : ''} en cours</p>
        </div>
        <button className="btn-gold" onClick={() => router.push('/projects/new')}>+ Nouveau projet</button>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:60, color:'var(--muted)', fontSize:12 }}>Chargement...</div>
      ) : projects.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">◈</div>
          <div style={{ fontFamily:'var(--syne)', fontSize:18, fontWeight:600, color:'var(--white)', marginBottom:8 }}>Aucun projet</div>
          <div style={{ fontSize:12, color:'var(--muted)', marginBottom:28 }}>Créez votre premier projet pour commencer à générer vos documents PMI.</div>
          <button className="btn-gold" onClick={() => router.push('/projects/new')}>Créer mon premier projet →</button>
        </div>
      ) : (
        <div className="proj-grid">
          {projects.map(p => {
            const type   = TYPE_LABELS[p.project_type]   || { label: p.project_type, color: 'var(--muted)' }
            const status = STATUS_LABELS[p.status] || { label: p.status, cls: 'b-gold' }
            return (
              <div key={p.id} className="proj-card" style={{ position:'relative' }}>
                {/* Bouton supprimer */}
                <button
                  onClick={e => { e.stopPropagation(); setConfirmDelete(p) }}
                  style={{
                    position:'absolute', top:12, right:12,
                    background:'rgba(224,80,80,.1)', border:'1px solid rgba(224,80,80,.2)',
                    borderRadius:6, width:28, height:28, cursor:'pointer',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:13, color:'var(--red)', transition:'all .12s', zIndex:2
                  }}
                  title="Supprimer ce projet"
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(224,80,80,.25)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(224,80,80,.1)' }}
                >
                  🗑
                </button>

                {/* Contenu cliquable */}
                <div onClick={() => router.push(`/projects/${p.id}`)} style={{ cursor:'pointer' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12, paddingRight:36 }}>
                    <span className={`badge ${status.cls}`}>{status.label}</span>
                    <span className="proj-type-badge" style={{ background:`${type.color}22`, color:type.color }}>{type.label}</span>
                  </div>
                  <div style={{ fontFamily:'var(--syne)', fontSize:15, fontWeight:600, color:'var(--white)', marginBottom:4, lineHeight:1.3 }}>{p.name}</div>
                  {p.clients?.name && <div style={{ fontSize:11, color:'var(--muted)', marginBottom:4 }}>Client : {p.clients.name}</div>}
                  {p.sector && <div style={{ fontSize:11, color:'var(--dim)', marginBottom:12 }}>Secteur : {p.sector}</div>}
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:12 }}>
                    <span style={{ fontSize:10, color:'var(--dim)' }}>{new Date(p.created_at).toLocaleDateString('fr-FR')}</span>
                    <span style={{ fontSize:11, color:'var(--gold2)' }}>Voir →</span>
                  </div>
                  <div className="prog-bar">
                    <div className="prog-fill" style={{ width:`${p.progress || 0}%`, background:(p.progress||0)>70?'var(--green)':(p.progress||0)>40?'var(--amber)':'var(--purple)' }} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* POPUP DE CONFIRMATION */}
      {confirmDelete && (
        <div className="modal-overlay" onClick={() => !deleting && setConfirmDelete(null)}>
          <div className="modal" style={{ width:420 }} onClick={e => e.stopPropagation()}>
            <div style={{ textAlign:'center', marginBottom:20 }}>
              <div style={{ fontSize:40, marginBottom:12 }}>🗑</div>
              <div style={{ fontFamily:'var(--syne)', fontSize:18, fontWeight:700, color:'var(--white)', marginBottom:8 }}>
                Supprimer ce projet ?
              </div>
              <div style={{ fontSize:13, color:'var(--muted)', lineHeight:1.6 }}>
                Le projet <strong style={{ color:'var(--text)' }}>"{confirmDelete.name}"</strong> et tous ses documents associés seront supprimés définitivement.
              </div>
              <div style={{ marginTop:8, padding:'8px 12px', background:'rgba(224,80,80,.08)', border:'1px solid rgba(224,80,80,.15)', borderRadius:8, fontSize:11, color:'var(--red)' }}>
                ⚠ Cette action est irréversible
              </div>
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button
                className="btn-ghost"
                style={{ flex:1 }}
                onClick={() => setConfirmDelete(null)}
                disabled={deleting}
              >
                Annuler
              </button>
              <button
                className="btn-danger"
                style={{ flex:1 }}
                onClick={deleteProject}
                disabled={deleting}
              >
                {deleting ? 'Suppression...' : 'Oui, supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
