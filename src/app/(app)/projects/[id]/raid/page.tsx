'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AppLayout from '@/components/layout/AppLayout'

type ItemType = 'risk' | 'action' | 'issue' | 'decision'
type Status = 'open' | 'in_progress' | 'closed'

const TYPE_CONFIG = {
  risk:     { label: 'Risque',    icon: '⚠', color: 'var(--red)',    bg: 'rgba(224,80,80,.1)'   },
  action:   { label: 'Action',   icon: '⚡', color: 'var(--amber)',  bg: 'rgba(240,168,50,.1)'  },
  issue:    { label: 'Issue',    icon: '🔴', color: 'var(--purple)', bg: 'rgba(123,110,246,.1)' },
  decision: { label: 'Décision', icon: '✓', color: 'var(--green)',  bg: 'rgba(45,184,138,.1)'  },
}

const STATUS_CONFIG = {
  open:        { label: 'Ouvert',     cls: 'b-red'    },
  in_progress: { label: 'En cours',   cls: 'b-amber'  },
  closed:      { label: 'Clôturé',    cls: 'b-green'  },
}

const PROB_IMPACT = [1, 2, 3, 4, 5]

const EMPTY_FORM = {
  item_type: 'risk' as ItemType,
  description: '',
  probability: 3,
  impact: 3,
  mitigation: '',
  responsible: '',
  due_date: '',
  status: 'open' as Status,
}

export default function RaidPage() {
  const [items, setItems]         = useState<any[]>([])
  const [project, setProject]     = useState<any>(null)
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [activeTab, setActiveTab] = useState<ItemType | 'all'>('all')
  const [form, setForm]           = useState(EMPTY_FORM)
  const [saving, setSaving]       = useState(false)
  const [editId, setEditId]       = useState<string | null>(null)
  const params   = useParams()
  const router   = useRouter()
  const supabase = createClient()
  const id = params.id as string

  useEffect(() => { loadData() }, [id])

  async function loadData() {
    const { data: proj } = await supabase.from('projects').select('name, project_type').eq('id', id).single()
    setProject(proj)
    const { data } = await supabase.from('raid_items').select('*').eq('project_id', id).order('created_at', { ascending: false })
    setItems(data || [])
    setLoading(false)
  }

  function set(k: string, v: any) { setForm(f => ({ ...f, [k]: v })) }

  async function saveItem() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const payload = { ...form, project_id: id, user_id: user.id }

    if (editId) {
      await supabase.from('raid_items').update(payload).eq('id', editId)
    } else {
      await supabase.from('raid_items').insert(payload)
    }

    setForm(EMPTY_FORM)
    setShowForm(false)
    setEditId(null)
    setSaving(false)
    loadData()
  }

  async function deleteItem(itemId: string) {
    if (!confirm('Supprimer cet élément RAID ?')) return
    await supabase.from('raid_items').delete().eq('id', itemId)
    loadData()
  }

  async function loadDemoRAID() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const today = new Date().toISOString().split('T')[0]
    const plus = (d: number) => { const dt=new Date(); dt.setDate(dt.getDate()+d); return dt.toISOString().split('T')[0] }
    const demoItems = [
      { item_type:'risk' as const, description:"Indisponibilite des equipes techniques lors des phases critiques", probability:4, impact:5, mitigation:"Identifier des remplacants. Planifier avec 20% de marge. Contractualiser les engagements.", responsible:'Chef de Projet', due_date:plus(30), status:'open' as const },
      { item_type:'risk' as const, description:"Incompatibilite des applications legacy avec la nouvelle plateforme JBoss EAP 8", probability:3, impact:5, mitigation:"Audit de compatibilite en phase 1. Budget de refactoring. Tests en preprod.", responsible:'Architecte Technique', due_date:plus(20), status:'in_progress' as const },
      { item_type:'risk' as const, description:"Depassement du budget alloue suite a des imprevus techniques", probability:3, impact:4, mitigation:"Reserve de contingence de 15%. Suivi EVM hebdomadaire. Alertes CPI inferieur 0.9.", responsible:'Chef de Projet', due_date:plus(60), status:'open' as const },
      { item_type:'risk' as const, description:"Perte de donnees lors de la migration des bases de donnees", probability:2, impact:5, mitigation:"Plan de sauvegarde complet. Tests de rollback valides. Fenetres de maintenance planifiees.", responsible:'DBA / Architecte', due_date:plus(45), status:'open' as const },
      { item_type:'risk' as const, description:"Resistance au changement des utilisateurs finaux", probability:4, impact:3, mitigation:"Plan de conduite du changement. Sessions de formation. Communication reguliere.", responsible:'Chef de Projet', due_date:plus(90), status:'open' as const },
      { item_type:'action' as const, description:"Organiser le kick-off meeting avec toutes les parties prenantes", probability:1, impact:1, mitigation:"Preparer le support de presentation. Inviter DSI MOA equipes techniques.", responsible:'Chef de Projet', due_date:plus(5), status:'closed' as const },
      { item_type:'action' as const, description:"Realiser l audit complet de la plateforme JBoss actuelle", probability:1, impact:1, mitigation:"Utiliser les outils d inventaire automatises. Documenter chaque serveur.", responsible:'Architecte Technique', due_date:plus(15), status:'in_progress' as const },
      { item_type:'action' as const, description:"Mettre en place l environnement de dev et les pipelines CI/CD", probability:1, impact:1, mitigation:"Utiliser Ansible. Jenkins ou GitLab CI pour les pipelines.", responsible:'DevOps Lead', due_date:plus(20), status:'open' as const },
      { item_type:'action' as const, description:"Former les administrateurs sur JBoss EAP 8 et nouvelles procedures", probability:1, impact:1, mitigation:"3 jours de formation. Creer des guides operationnels.", responsible:'Responsable Formation', due_date:plus(35), status:'open' as const },
      { item_type:'issue' as const, description:"Acces aux serveurs de production refuse par la DSI - blocage audit", probability:5, impact:4, mitigation:"Escalade vers le sponsor. Reunion de deblocage planifiee. Procedure acces securise.", responsible:'Chef de Projet', due_date:plus(3), status:'in_progress' as const },
      { item_type:'issue' as const, description:"Documentation technique de l existant incomplete ou obsolete", probability:5, impact:3, mitigation:"Reverse-engineering des applications. Documentation as-is en parallele.", responsible:'Architecte Applicatif', due_date:plus(10), status:'open' as const },
      { item_type:'issue' as const, description:"Retard livraison materiel serveur pour l infrastructure cible", probability:5, impact:4, mitigation:"Environments cloud temporaires Azure/AWS. Relancer le fournisseur.", responsible:'Responsable Infrastructure', due_date:plus(7), status:'open' as const },
      { item_type:'decision' as const, description:"Approche migration par phases Lift and Shift puis modernisation", probability:1, impact:1, mitigation:"Valide en COPIL 15/01/2025. Reduit les risques d interruption de service.", responsible:'DSI / Chef de Projet', due_date:today, status:'closed' as const },
      { item_type:'decision' as const, description:"Utiliser JBoss EAP 8.0 comme version cible LTS jusqu en 2030", probability:1, impact:1, mitigation:"Support Red Hat inclus. Compatibilite Jakarta EE 10.", responsible:'Architecte Technique', due_date:today, status:'closed' as const },
      { item_type:'decision' as const, description:"Maintenir JBoss 6 en parallele 3 mois post-migration", probability:1, impact:1, mitigation:"Budget additionnel 15k EUR. Permet un rollback securise si necessaire.", responsible:'DSI / Chef de Projet', due_date:plus(180), status:'open' as const },
    ]
        // Insert all demo items
    for (const item of demoItems) {
      await supabase.from('raid_items').insert({ ...item, project_id: id, user_id: user.id })
    }
    loadData()
  }

  function startEdit(item: any) {
    setForm({
      item_type:   item.item_type,
      description: item.description,
      probability: item.probability || 3,
      impact:      item.impact || 3,
      mitigation:  item.mitigation || '',
      responsible: item.responsible || '',
      due_date:    item.due_date || '',
      status:      item.status,
    })
    setEditId(item.id)
    setShowForm(true)
  }

  function criticality(p: number, i: number) {
    const score = p * i
    if (score >= 16) return { label: 'Critique', color: 'var(--red)' }
    if (score >= 9)  return { label: 'Élevé',    color: 'var(--amber)' }
    if (score >= 4)  return { label: 'Moyen',    color: 'var(--gold)' }
    return              { label: 'Faible',    color: 'var(--green)' }
  }

  const filtered = activeTab === 'all' ? items : items.filter(i => i.item_type === activeTab)
  const counts = {
    risk:     items.filter(i => i.item_type === 'risk').length,
    action:   items.filter(i => i.item_type === 'action').length,
    issue:    items.filter(i => i.item_type === 'issue').length,
    decision: items.filter(i => i.item_type === 'decision').length,
  }

  return (
    <AppLayout>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
            <button onClick={() => router.push(`/projects/${id}`)} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:12 }}>← Projet</button>
            <span style={{ color:'var(--dim)' }}>›</span>
            <span style={{ fontSize:12, color:'var(--dim)' }}>{project?.name}</span>
          </div>
          <div className="sec-label">// Registre</div>
          <h1 className="sec-title" style={{ marginBottom:4 }}>RAID — Risques, Actions, Issues, Décisions</h1>
          <p style={{ fontSize:12, color:'var(--muted)' }}>{items.length} élément{items.length !== 1 ? 's' : ''} au total</p>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={loadDemoRAID} className="btn-ghost" style={{fontSize:11,color:'var(--cyan)',borderColor:'rgba(58,207,207,.3)'}}>
            🎯 Charger démo RAID
          </button>
          <button className="btn-gold" onClick={() => { setShowForm(true); setEditId(null); setForm(EMPTY_FORM) }}>
            + Ajouter
          </button>
        </div>
      </div>

      {/* Navigation onglets */}
      <div style={{ display:'flex', gap:6, marginBottom:16, borderBottom:'1px solid var(--line)', paddingBottom:12 }}>
        {[
          { label:'📄 Documents',      href:`/projects/${id}` },
          { label:'📚 WBS Dict',       href:`/projects/${id}/wbs-dict` },
          { label:'⚠ RAID',            href:`/projects/${id}/raid` },
          { label:'📅 Jalons',         href:`/projects/${id}/jalons` },
          { label:'📊 PERT',           href:`/projects/${id}/pert` },
          { label:'🧠 Mind Map',       href:`/projects/${id}/mindmap` },
          { label:'💰 Budget EVM',     href:`/projects/${id}/budget` },
          { label:'📅 Gantt',          href:`/projects/${id}/gantt` },
          { label:'📦 Work Packages',  href:`/projects/${id}/workpackages` },
        ].map(tab => (
          <button key={tab.href} onClick={() => router.push(tab.href)}
            style={{ padding:'7px 16px', fontSize:12, fontFamily:'var(--mono)', cursor:'pointer', borderRadius:8, border:'1px solid var(--line2)', background: tab.href === `/projects/${id}/raid` ? 'rgba(200,168,75,.15)' : 'transparent', color: tab.href === `/projects/${id}/raid` ? 'var(--gold2)' : 'var(--muted)', fontWeight: tab.href === `/projects/${id}/raid` ? 600 : 400, transition:'all .12s' }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* KPIs RAID */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:20 }}>
        {(Object.entries(TYPE_CONFIG) as [ItemType, any][]).map(([type, cfg]) => (
          <div key={type} className="kpi" onClick={() => setActiveTab(type)}
            style={{ border: activeTab === type ? `1px solid ${cfg.color}` : '1px solid var(--line)', cursor:'pointer' }}>
            <div className="kpi-label" style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span>{cfg.icon}</span> {cfg.label}s
            </div>
            <div className="kpi-value" style={{ color: cfg.color }}>{counts[type]}</div>
            <div style={{ fontSize:10, color:'var(--dim)' }}>
              {items.filter(i => i.item_type === type && i.status === 'open').length} ouvert{items.filter(i => i.item_type === type && i.status === 'open').length !== 1 ? 's' : ''}
            </div>
          </div>
        ))}
      </div>

      {/* Tabs filtres */}
      <div style={{ display:'flex', gap:6, marginBottom:16 }}>
        {(['all', 'risk', 'action', 'issue', 'decision'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            style={{ padding:'6px 14px', fontSize:11, fontFamily:'var(--mono)', cursor:'pointer', borderRadius:20, border:'1px solid var(--line2)', background: activeTab === tab ? 'rgba(200,168,75,.15)' : 'transparent', color: activeTab === tab ? 'var(--gold2)' : 'var(--muted)', fontWeight: activeTab === tab ? 600 : 400, transition:'all .12s' }}>
            {tab === 'all' ? 'Tout' : TYPE_CONFIG[tab].label + 's'}
          </button>
        ))}
      </div>

      {/* Formulaire */}
      {showForm && (
        <div className="card" style={{ marginBottom:20 }}>
          <div className="card-hdr">
            <div className="card-title">{editId ? 'Modifier' : '+ Nouvel élément RAID'}</div>
            <button onClick={() => { setShowForm(false); setEditId(null) }} style={{ background:'none', border:'none', color:'var(--dim)', cursor:'pointer', fontSize:18 }}>×</button>
          </div>
          <div className="card-body">
            <div className="grid-2" style={{ marginBottom:14 }}>
              <div className="fg">
                <label className="fl">Type</label>
                <div style={{ display:'flex', gap:6 }}>
                  {(Object.entries(TYPE_CONFIG) as [ItemType, any][]).map(([type, cfg]) => (
                    <button key={type} onClick={() => set('item_type', type)}
                      style={{ flex:1, padding:'7px 4px', fontSize:11, fontFamily:'var(--mono)', cursor:'pointer', borderRadius:7, border:`1px solid ${form.item_type === type ? cfg.color : 'var(--line2)'}`, background: form.item_type === type ? cfg.bg : 'transparent', color: form.item_type === type ? cfg.color : 'var(--muted)', fontWeight: form.item_type === type ? 600 : 400, transition:'all .12s' }}>
                      {cfg.icon} {cfg.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="fg">
                <label className="fl">Statut</label>
                <select className="fi fi-select" value={form.status} onChange={e => set('status', e.target.value)}>
                  <option value="open">Ouvert</option>
                  <option value="in_progress">En cours</option>
                  <option value="closed">Clôturé</option>
                </select>
              </div>
            </div>

            <div className="fg">
              <label className="fl">Description *</label>
              <textarea className="fi" rows={2} placeholder="Décrire le risque, l'action, l'issue ou la décision..." value={form.description} onChange={e => set('description', e.target.value)} style={{ resize:'vertical' }} />
            </div>

            {form.item_type === 'risk' && (
              <div className="grid-2" style={{ marginBottom:14 }}>
                <div className="fg">
                  <label className="fl">Probabilité (1-5)</label>
                  <div style={{ display:'flex', gap:6 }}>
                    {PROB_IMPACT.map(n => (
                      <button key={n} onClick={() => set('probability', n)}
                        style={{ flex:1, padding:'8px 4px', fontSize:13, fontFamily:'var(--mono)', cursor:'pointer', borderRadius:6, border:`1px solid ${form.probability === n ? 'var(--gold)' : 'var(--line2)'}`, background: form.probability === n ? 'rgba(200,168,75,.2)' : 'transparent', color: form.probability === n ? 'var(--gold2)' : 'var(--muted)', fontWeight: form.probability === n ? 700 : 400 }}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="fg">
                  <label className="fl">Impact (1-5)</label>
                  <div style={{ display:'flex', gap:6 }}>
                    {PROB_IMPACT.map(n => (
                      <button key={n} onClick={() => set('impact', n)}
                        style={{ flex:1, padding:'8px 4px', fontSize:13, fontFamily:'var(--mono)', cursor:'pointer', borderRadius:6, border:`1px solid ${form.impact === n ? 'var(--red)' : 'var(--line2)'}`, background: form.impact === n ? 'rgba(224,80,80,.2)' : 'transparent', color: form.impact === n ? 'var(--red)' : 'var(--muted)', fontWeight: form.impact === n ? 700 : 400 }}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="grid-2">
              <div className="fg">
                <label className="fl">Responsable</label>
                <input className="fi" placeholder="Nom ou rôle..." value={form.responsible} onChange={e => set('responsible', e.target.value)} />
              </div>
              <div className="fg">
                <label className="fl">Échéance</label>
                <input className="fi" type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} />
              </div>
            </div>

            <div className="fg">
              <label className="fl">{form.item_type === 'risk' ? 'Plan de mitigation' : 'Notes / Actions'}</label>
              <textarea className="fi" rows={2} placeholder="Plan de mitigation, actions prévues..." value={form.mitigation} onChange={e => set('mitigation', e.target.value)} style={{ resize:'vertical' }} />
            </div>

            <div style={{ display:'flex', gap:10 }}>
              <button className="btn-gold" onClick={saveItem} disabled={saving || !form.description.trim()}>
                {saving ? 'Sauvegarde...' : editId ? 'Mettre à jour' : 'Ajouter au registre'}
              </button>
              <button className="btn-ghost" onClick={() => { setShowForm(false); setEditId(null) }}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* Liste RAID */}
      {loading ? (
        <div style={{ textAlign:'center', padding:40, color:'var(--muted)', fontSize:12 }}>Chargement...</div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">⚠</div>
          <div style={{ fontFamily:'var(--syne)', fontSize:16, fontWeight:600, color:'var(--white)', marginBottom:8 }}>
            Aucun {activeTab === 'all' ? 'élément' : TYPE_CONFIG[activeTab as ItemType]?.label.toLowerCase()}
          </div>
          <div style={{ fontSize:12, color:'var(--muted)' }}>Cliquez "+ Ajouter" pour commencer le registre RAID.</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {filtered.map(item => {
            const cfg    = TYPE_CONFIG[item.item_type as ItemType]
            const status = STATUS_CONFIG[item.status as Status]
            const crit   = item.item_type === 'risk' ? criticality(item.probability || 1, item.impact || 1) : null
            return (
              <div key={item.id} className="card" style={{ borderLeft:`3px solid ${cfg?.color}` }}>
                <div style={{ display:'flex', alignItems:'flex-start', gap:12, padding:'14px 16px' }}>
                  <div style={{ width:32, height:32, borderRadius:8, background:cfg?.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}>{cfg?.icon}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6, flexWrap:'wrap' }}>
                      <span style={{ fontSize:11, fontWeight:600, color:cfg?.color, textTransform:'uppercase', letterSpacing:'.06em' }}>{cfg?.label}</span>
                      <span className={`badge ${status?.cls}`}>{status?.label}</span>
                      {crit && (
                        <span style={{ padding:'1px 8px', borderRadius:20, fontSize:9, fontWeight:600, color:crit.color, background:`${crit.color}22` }}>
                          {crit.label} · P{item.probability}×I{item.impact}={item.probability * item.impact}
                        </span>
                      )}
                      {item.responsible && (
                        <span style={{ fontSize:10, color:'var(--dim)' }}>👤 {item.responsible}</span>
                      )}
                      {item.due_date && (
                        <span style={{ fontSize:10, color:'var(--dim)' }}>📅 {new Date(item.due_date).toLocaleDateString('fr-FR')}</span>
                      )}
                    </div>
                    <div style={{ fontSize:13, color:'var(--text)', lineHeight:1.6, marginBottom: item.mitigation ? 8 : 0 }}>{item.description}</div>
                    {item.mitigation && (
                      <div style={{ fontSize:11, color:'var(--muted)', padding:'6px 10px', background:'rgba(255,255,255,.03)', borderRadius:6, borderLeft:'2px solid var(--line2)', lineHeight:1.6 }}>
                        {item.mitigation}
                      </div>
                    )}
                  </div>
                  <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                    <button onClick={() => startEdit(item)}
                      style={{ background:'var(--ink3)', border:'1px solid var(--line2)', borderRadius:6, padding:'5px 10px', cursor:'pointer', fontSize:11, color:'var(--muted)', fontFamily:'var(--mono)' }}>
                      ✎
                    </button>
                    <button onClick={() => deleteItem(item.id)}
                      style={{ background:'rgba(224,80,80,.1)', border:'1px solid rgba(224,80,80,.2)', borderRadius:6, padding:'5px 10px', cursor:'pointer', fontSize:11, color:'var(--red)', fontFamily:'var(--mono)' }}>
                      🗑
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </AppLayout>
  )
}
