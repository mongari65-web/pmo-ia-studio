'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AppLayout from '@/components/layout/AppLayout'

const JALON_TYPES = {
  livrable:   { label: 'Livrable',    icon: '📦', color: 'var(--blue)'   },
  go_nogo:    { label: 'GO/NO-GO',   icon: '🚦', color: 'var(--amber)'  },
  recette:    { label: 'Recette',     icon: '🧪', color: 'var(--purple)' },
  deploiement:{ label: 'Déploiement', icon: '🚀', color: 'var(--cyan)'   },
  reunion:    { label: 'Réunion',     icon: '👥', color: 'var(--green)'  },
  autre:      { label: 'Autre',       icon: '📌', color: 'var(--muted)'  },
}

const STATUS_JALONS = {
  pending:     { label: 'À venir',   cls: 'b-amber' },
  in_progress: { label: 'En cours', cls: 'b-cyan'  },
  done:        { label: 'Atteint',  cls: 'b-green' },
  blocked:     { label: 'Bloqué',   cls: 'b-red'   },
}

export default function JalonsPage() {
  const [jalons, setJalons]     = useState<any[]>([])
  const [project, setProject]   = useState<any>(null)
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [editId, setEditId]     = useState<string | null>(null)
  const [form, setForm]         = useState({
    name: '', jalon_type: 'livrable', target_date: '', status: 'pending', notes: ''
  })
  const params   = useParams()
  const router   = useRouter()
  const supabase = createClient()
  const id = params.id as string

  useEffect(() => { loadData() }, [id])

  async function loadData() {
    const { data: proj } = await supabase.from('projects').select('name').eq('id', id).single()
    setProject(proj)
    const { data } = await supabase.from('jalons').select('*').eq('project_id', id).order('target_date', { ascending: true })
    setJalons(data || [])
    setLoading(false)
  }

  function set(k: string, v: any) { setForm(f => ({ ...f, [k]: v })) }

  async function saveJalon() {
    if (!form.name.trim()) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const payload = { ...form, project_id: id, user_id: user.id }
    if (editId) {
      await supabase.from('jalons').update(payload).eq('id', editId)
    } else {
      await supabase.from('jalons').insert(payload)
    }
    setForm({ name: '', jalon_type: 'livrable', target_date: '', status: 'pending', notes: '' })
    setShowForm(false); setEditId(null); setSaving(false)
    loadData()
  }

  async function deleteJalon(jalonId: string) {
    if (!confirm('Supprimer ce jalon ?')) return
    await supabase.from('jalons').delete().eq('id', jalonId)
    loadData()
  }

  async function toggleStatus(item: any) {
    const next = { pending: 'in_progress', in_progress: 'done', done: 'pending', blocked: 'pending' }
    await supabase.from('jalons').update({ status: next[item.status as keyof typeof next] }).eq('id', item.id)
    loadData()
  }

  const today = new Date()
  const overdue = jalons.filter(j => j.status !== 'done' && j.target_date && new Date(j.target_date) < today)
  const upcoming = jalons.filter(j => j.status !== 'done' && j.target_date && new Date(j.target_date) >= today)
  const done = jalons.filter(j => j.status === 'done')

  function JalonCard({ item }: { item: any }) {
    const cfg = JALON_TYPES[item.jalon_type as keyof typeof JALON_TYPES] || JALON_TYPES.autre
    const status = STATUS_JALONS[item.status as keyof typeof STATUS_JALONS]
    const isOverdue = item.status !== 'done' && item.target_date && new Date(item.target_date) < today
    const daysLeft = item.target_date ? Math.ceil((new Date(item.target_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null

    return (
      <div className="card" style={{ borderLeft: `3px solid ${isOverdue ? 'var(--red)' : cfg.color}` }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px' }}>
          <div style={{ width:36, height:36, borderRadius:8, background:`${cfg.color}22`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0, cursor:'pointer' }}
            onClick={() => toggleStatus(item)} title="Cliquer pour changer le statut">
            {cfg.icon}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4, flexWrap:'wrap' }}>
              <span style={{ fontSize:13, fontWeight:500, color:'var(--text)' }}>{item.name}</span>
              <span className={`badge ${status?.cls}`}>{status?.label}</span>
              <span style={{ fontSize:10, color:isOverdue ? 'var(--red)' : 'var(--dim)' }}>
                {cfg.label}
              </span>
            </div>
            <div style={{ display:'flex', gap:16, alignItems:'center' }}>
              {item.target_date && (
                <span style={{ fontSize:11, color: isOverdue ? 'var(--red)' : 'var(--dim)', fontWeight: isOverdue ? 600 : 400 }}>
                  📅 {new Date(item.target_date).toLocaleDateString('fr-FR')}
                  {daysLeft !== null && item.status !== 'done' && (
                    <span style={{ marginLeft:6, color: isOverdue ? 'var(--red)' : daysLeft <= 7 ? 'var(--amber)' : 'var(--dim)' }}>
                      ({isOverdue ? `${Math.abs(daysLeft)}j de retard` : daysLeft === 0 ? "aujourd'hui" : `J-${daysLeft}`})
                    </span>
                  )}
                </span>
              )}
              {item.notes && <span style={{ fontSize:11, color:'var(--muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:300 }}>{item.notes}</span>}
            </div>
          </div>
          <div style={{ display:'flex', gap:6, flexShrink:0 }}>
            <button onClick={() => { setForm({ name:item.name, jalon_type:item.jalon_type, target_date:item.target_date||'', status:item.status, notes:item.notes||'' }); setEditId(item.id); setShowForm(true) }}
              style={{ background:'var(--ink3)', border:'1px solid var(--line2)', borderRadius:6, padding:'5px 10px', cursor:'pointer', fontSize:11, color:'var(--muted)', fontFamily:'var(--mono)' }}>✎</button>
            <button onClick={() => deleteJalon(item.id)}
              style={{ background:'rgba(224,80,80,.1)', border:'1px solid rgba(224,80,80,.2)', borderRadius:6, padding:'5px 10px', cursor:'pointer', fontSize:11, color:'var(--red)', fontFamily:'var(--mono)' }}>🗑</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <AppLayout>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
            <button onClick={() => router.push(`/projects/${id}`)} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:12 }}>← Projet</button>
            <span style={{ color:'var(--dim)' }}>›</span>
            <span style={{ fontSize:12, color:'var(--dim)' }}>{project?.name}</span>
          </div>
          <div className="sec-label">// Planning</div>
          <h1 className="sec-title" style={{ marginBottom:4 }}>Jalons du projet</h1>
          <p style={{ fontSize:12, color:'var(--muted)' }}>{jalons.length} jalon{jalons.length !== 1 ? 's' : ''} · {overdue.length} en retard · {done.length} atteint{done.length !== 1 ? 's' : ''}</p>
        </div>
        <button className="btn-gold" onClick={() => { setShowForm(true); setEditId(null); setForm({ name:'', jalon_type:'livrable', target_date:'', status:'pending', notes:'' }) }}>
          + Ajouter un jalon
        </button>
      </div>

      {/* Navigation onglets */}
      <div style={{ display:'flex', gap:6, marginBottom:16, borderBottom:'1px solid var(--line)', paddingBottom:12 }}>
        {[
          { label:'📄 Documents', href:`/projects/${id}` },
          { label:'⚠ RAID',      href:`/projects/${id}/raid` },
          { label:'📅 Jalons',   href:`/projects/${id}/jalons` },
          { label:'📊 PERT',     href:`/projects/${id}/pert` },
          { label:'🧠 Mind Map', href:`/projects/${id}/mindmap` },
        ].map(tab => (
          <button key={tab.href} onClick={() => router.push(tab.href)}
            style={{ padding:'7px 16px', fontSize:12, fontFamily:'var(--mono)', cursor:'pointer', borderRadius:8, border:'1px solid var(--line2)', background: tab.href === `/projects/${id}/jalons` ? 'rgba(200,168,75,.15)' : 'transparent', color: tab.href === `/projects/${id}/jalons` ? 'var(--gold2)' : 'var(--muted)', fontWeight: tab.href === `/projects/${id}/jalons` ? 600 : 400, transition:'all .12s' }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:20 }}>
        {[
          { label:'Total', value:jalons.length, color:'var(--white)' },
          { label:'En retard', value:overdue.length, color:'var(--red)' },
          { label:'À venir', value:upcoming.length, color:'var(--amber)' },
          { label:'Atteints', value:done.length, color:'var(--green)' },
        ].map(k => (
          <div key={k.label} className="kpi">
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value" style={{ color:k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Formulaire */}
      {showForm && (
        <div className="card" style={{ marginBottom:20 }}>
          <div className="card-hdr">
            <div className="card-title">{editId ? 'Modifier le jalon' : '+ Nouveau jalon'}</div>
            <button onClick={() => { setShowForm(false); setEditId(null) }} style={{ background:'none', border:'none', color:'var(--dim)', cursor:'pointer', fontSize:18 }}>×</button>
          </div>
          <div className="card-body">
            <div className="fg"><label className="fl">Nom du jalon *</label>
              <input className="fi" placeholder="Ex : GO recette VABF, Livraison lot 1..." value={form.name} onChange={e => set('name', e.target.value)} />
            </div>
            <div className="grid-2">
              <div className="fg"><label className="fl">Type</label>
                <select className="fi fi-select" value={form.jalon_type} onChange={e => set('jalon_type', e.target.value)}>
                  {Object.entries(JALON_TYPES).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                </select>
              </div>
              <div className="fg"><label className="fl">Statut</label>
                <select className="fi fi-select" value={form.status} onChange={e => set('status', e.target.value)}>
                  {Object.entries(STATUS_JALONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
            </div>
            <div className="grid-2">
              <div className="fg"><label className="fl">Date cible</label>
                <input className="fi" type="date" value={form.target_date} onChange={e => set('target_date', e.target.value)} />
              </div>
              <div className="fg"><label className="fl">Notes</label>
                <input className="fi" placeholder="Notes, critères d'acceptation..." value={form.notes} onChange={e => set('notes', e.target.value)} />
              </div>
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button className="btn-gold" onClick={saveJalon} disabled={saving || !form.name.trim()}>
                {saving ? 'Sauvegarde...' : editId ? 'Mettre à jour' : 'Ajouter le jalon'}
              </button>
              <button className="btn-ghost" onClick={() => { setShowForm(false); setEditId(null) }}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign:'center', padding:40, color:'var(--muted)' }}>Chargement...</div>
      ) : jalons.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">📅</div>
          <div style={{ fontFamily:'var(--syne)', fontSize:16, fontWeight:600, color:'var(--white)', marginBottom:8 }}>Aucun jalon</div>
          <div style={{ fontSize:12, color:'var(--muted)' }}>Ajoutez vos jalons pour suivre l'avancement du projet.</div>
        </div>
      ) : (
        <>
          {overdue.length > 0 && (
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:11, color:'var(--red)', fontWeight:600, letterSpacing:'.08em', textTransform:'uppercase', marginBottom:10, display:'flex', alignItems:'center', gap:6 }}>
                <span>⚠</span> En retard ({overdue.length})
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {overdue.map(j => <JalonCard key={j.id} item={j} />)}
              </div>
            </div>
          )}
          {upcoming.length > 0 && (
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:11, color:'var(--amber)', fontWeight:600, letterSpacing:'.08em', textTransform:'uppercase', marginBottom:10 }}>
                À venir ({upcoming.length})
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {upcoming.map(j => <JalonCard key={j.id} item={j} />)}
              </div>
            </div>
          )}
          {done.length > 0 && (
            <div>
              <div style={{ fontSize:11, color:'var(--green)', fontWeight:600, letterSpacing:'.08em', textTransform:'uppercase', marginBottom:10 }}>
                Atteints ({done.length})
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:8, opacity:.7 }}>
                {done.map(j => <JalonCard key={j.id} item={j} />)}
              </div>
            </div>
          )}
        </>
      )}
    </AppLayout>
  )
}
