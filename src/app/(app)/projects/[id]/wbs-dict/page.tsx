'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AppLayout from '@/components/layout/AppLayout'

interface WBSEntry {
  id: string
  wbs_id: string
  name: string
  description: string
  level: number
  parent_id: string
  deliverable: string
  acceptance_criteria: string
  role: string
  jh: number
  start_date: string
  end_date: string
  dependencies: string
  status: 'not_started' | 'in_progress' | 'done'
}

const ROLES = ['Chef de Projet','Architecte','Developpeur','DevOps','QA/Testeur','Analyste','Consultant','Expert Metier']

const STATUS_CFG = {
  not_started: { label: 'Non demarre', cls: 'b-purple' },
  in_progress:  { label: 'En cours',   cls: 'b-amber'  },
  done:         { label: 'Termine',    cls: 'b-green'  },
}

function extractJSON(text: string): any {
  const clean = text.replace(/```json/gi,'').replace(/```/g,'').trim()
  const arr = clean.match(/\[[\s\S]*\]/)
  if (arr) return JSON.parse(arr[0])
  throw new Error('Format JSON non trouve')
}

const NAV_LABELS = ['Documents','WBS Dict','RAID','Jalons','PERT','Mind Map','Budget EVM','Gantt','Work Packages']
const NAV_ICONS: Record<string,string> = {
  'Documents':'📄','WBS Dict':'📚','RAID':'⚠','Jalons':'📅',
  'PERT':'📊','Mind Map':'🧠','Budget EVM':'💰','Gantt':'📅','Work Packages':'📦'
}

function getNavHref(label: string, id: string): string {
  const map: Record<string,string> = {
    'Documents': '/projects/'+id,
    'WBS Dict':  '/projects/'+id+'/wbs-dict',
    'RAID':      '/projects/'+id+'/raid',
    'Jalons':    '/projects/'+id+'/jalons',
    'PERT':      '/projects/'+id+'/pert',
    'Mind Map':  '/projects/'+id+'/mindmap',
    'Budget EVM':'/projects/'+id+'/budget',
    'Gantt':     '/projects/'+id+'/gantt',
    'Work Packages':'/projects/'+id+'/workpackages',
  }
  return map[label] || '/projects/'+id
}

export default function WBSDictPage() {
  const [entries, setEntries]       = useState<WBSEntry[]>([])
  const [project, setProject]       = useState<any>(null)
  const [wbsContent, setWbsContent] = useState('')
  const [loading, setLoading]       = useState(true)
  const [generating, setGenerating] = useState(false)
  const [genMsg, setGenMsg]         = useState('')
  const [editingEntry, setEditing]  = useState<WBSEntry | null>(null)
  const [lastSaved, setLastSaved]   = useState<string|null>(null)
  const [filterRole, setFilterRole] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')

  const params   = useParams()
  const router   = useRouter()
  const supabase = createClient()
  const id = params.id as string

  useEffect(() => { loadData() }, [id])

  async function loadData() {
    const { data: proj } = await supabase.from('projects').select('*').eq('id', id).single()
    setProject(proj)
    const { data: wbsDocs } = await supabase.from('documents')
      .select('content').eq('project_id', id).eq('doc_type', 'wbs')
      .order('created_at', { ascending: false }).limit(1)
    if (wbsDocs?.[0]) setWbsContent(wbsDocs[0].content)
    const { data: dictDocs } = await supabase.from('documents')
      .select('content,updated_at').eq('project_id', id).eq('doc_type', 'wbs_dict')
      .order('created_at', { ascending: false }).limit(1)
    if (dictDocs?.[0]) {
      try { setEntries(JSON.parse(dictDocs[0].content)); setLastSaved((dictDocs[0] as any).updated_at || null) } catch {}
    }
    setLoading(false)
  }

  async function saveDict(data: WBSEntry[]) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('documents').upsert({
      project_id: id, user_id: user.id,
      doc_type: 'wbs_dict',
      title: 'Dictionnaire WBS — ' + (project?.name || ''),
      content: JSON.stringify(data),
      status: 'generated',
    }, { onConflict: 'project_id,doc_type' })
    setLastSaved(new Date().toISOString())
  }

  async function generateDict() {
    setGenerating(true)
    setGenMsg('Generation du dictionnaire WBS par Claude...')
    const ctx = project?.context || {}
    const prompt = 'Tu es un expert PMI/PMBOK 7. Genere un dictionnaire WBS complet pour ce projet.\n\n'
      + 'PROJET : ' + project?.name + '\nTYPE : ' + project?.project_type + '\nSECTEUR : ' + (project?.sector||'IT') + '\n'
      + 'BUDGET : ' + (project?.budget||'') + '\nDUREE : ' + (project?.duration||'6 mois') + '\n'
      + 'WBS EXISTANT :\n' + (wbsContent ? wbsContent.slice(0,2000) : 'Non disponible') + '\n\n'
      + 'Genere 12 a 20 entrees. Reponds UNIQUEMENT avec ce JSON:\n'
      + '[{"id":"wbs_1","wbs_id":"1","name":"INITIALISATION","description":"Phase init","level":1,"parent_id":"","deliverable":"Charte","acceptance_criteria":"Validation sponsor","role":"Chef de Projet","jh":0,"start_date":"2025-01-06","end_date":"2025-01-31","dependencies":"","status":"not_started"}]'

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, maxTokens: 4000 })
      })
      const data = await res.json()
      const parsed: WBSEntry[] = extractJSON(data.text || '')
      setEntries(parsed)
      await saveDict(parsed)
      const totalJH = parsed.reduce((s, e) => s + (e.jh || 0), 0)
      setGenMsg('✓ ' + parsed.length + ' entrees generees — Total : ' + totalJH + ' JH')
    } catch (e: any) {
      setGenMsg('Erreur : ' + e.message)
    }
    setGenerating(false)
    setTimeout(() => setGenMsg(''), 5000)
  }

  async function exportToEVM() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const taskEntries = entries.filter(e => e.level > 1 && e.jh > 0)
    const RATES: Record<string,number> = {
      'Chef de Projet':650,'Architecte':800,'Developpeur':650,
      'DevOps':700,'QA/Testeur':550,'Analyste':600,'Consultant':850,'Expert Metier':700
    }
    const evmTasks = taskEntries.map(e => ({
      id: e.id, wbs_id: e.wbs_id, name: e.name, role: e.role, jh: e.jh,
      rate: RATES[e.role] || 650,
      bac: e.jh * (RATES[e.role] || 650),
      pct_complete: e.status === 'done' ? 100 : e.status === 'in_progress' ? 50 : 0,
      ac: 0, start_date: e.start_date, end_date: e.end_date,
    }))
    const totalBac = evmTasks.reduce((s, t) => s + t.bac, 0)
    const startDate = entries.reduce((min, e) => e.start_date < min ? e.start_date : min, entries[0]?.start_date || '')
    const endDate   = entries.reduce((max, e) => e.end_date > max ? e.end_date : max, entries[0]?.end_date || '')
    await supabase.from('documents').upsert({
      project_id: id, user_id: user.id, doc_type: 'budget_evm',
      title: 'Budget EVM — ' + (project?.name || ''),
      content: JSON.stringify({ tasks: evmTasks, config: { bac_total: totalBac, start_date: startDate, end_date: endDate, current_date: new Date().toISOString().split('T')[0], rates: RATES }}),
      status: 'generated',
    }, { onConflict: 'project_id,doc_type' })
    setGenMsg('✓ Donnees exportees vers Budget EVM !')
    setTimeout(() => router.push('/projects/' + id + '/budget'), 1500)
  }

  function handleWBSExport(type: string) {
    if (!type) return
    const name = project?.name || 'projet'
    if (type === 'print') {
      const w = window.open('', '_blank')
      if (w) {
        const rows = entries.map(e => '<tr><td>'+e.wbs_id+'</td><td>'+e.name+'</td><td>'+e.role+'</td><td>'+e.jh+'</td><td>'+e.status+'</td></tr>').join('')
        w.document.write('<html><head><title>WBS</title><style>table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:8px}th{background:#1F3864;color:white}</style></head><body><h1>WBS — '+name+'</h1><table><tr><th>ID</th><th>Nom</th><th>Role</th><th>JH</th><th>Statut</th></tr>'+rows+'</table></body></html>')
        w.document.close(); w.print()
      }
    } else if (type === 'excel') {
      const csvLines = ['ID;Nom;Role;JH;Statut', ...entries.map(e => [e.wbs_id, e.name, e.role, e.jh, e.status].join(';'))]
      const csv = '\uFEFF' + csvLines.join('\n')
      const a = document.createElement('a')
      a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
      a.download = 'WBS-' + name + '.csv'; a.click()
    } else if (type === 'word') {
      const rows = entries.map(e => '<tr><td>'+e.wbs_id+'</td><td>'+e.name+'</td><td>'+e.role+'</td></tr>').join('')
      const html = '<html><body><h1>WBS — '+name+'</h1><table border="1">'+rows+'</table></body></html>'
      const a = document.createElement('a')
      a.href = 'data:application/msword,' + encodeURIComponent(html)
      a.download = 'WBS-' + name + '.doc'; a.click()
    }
    setGenMsg('✓ Export ' + type + ' effectue !')
    setTimeout(() => setGenMsg(''), 3000)
  }

  function addEntry() {
    const newEntry: WBSEntry = {
      id: 'wbs_' + Date.now(), wbs_id: '', name: 'Nouvelle entree',
      description: '', level: 2, parent_id: '',
      deliverable: '', acceptance_criteria: '',
      role: 'Chef de Projet', jh: 0,
      start_date: new Date().toISOString().split('T')[0],
      end_date: new Date(Date.now()+30*86400000).toISOString().split('T')[0],
      dependencies: '', status: 'not_started',
    }
    const updated = [...entries, newEntry]
    setEntries(updated)
    setEditing(newEntry)
  }

  function updateEntry(updated: WBSEntry) {
    const newEntries = entries.map(e => e.id === updated.id ? updated : e)
    setEntries(newEntries)
    saveDict(newEntries)
    setEditing(null)
  }

  function deleteEntry(entryId: string) {
    if (!confirm('Supprimer cette entree ?')) return
    const newEntries = entries.filter(e => e.id !== entryId)
    setEntries(newEntries)
    saveDict(newEntries)
  }

  const filtered = entries.filter(e =>
    (filterRole === 'all' || e.role === filterRole) &&
    (filterStatus === 'all' || e.status === filterStatus)
  )

  const totalJH = entries.reduce((s,e) => s + (e.jh||0), 0)
  const totalBac = entries.reduce((s,e) => s + (e.jh||0) * 650, 0)
  const doneCount = entries.filter(e => e.status === 'done').length
  const inProgressCount = entries.filter(e => e.status === 'in_progress').length
  const activeHref = '/projects/'+id+'/wbs-dict'

  if (loading) return <AppLayout><div style={{textAlign:'center',padding:60,color:'var(--muted)'}}>Chargement...</div></AppLayout>

  return (
    <AppLayout>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16}}>
        <div>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
            <button onClick={() => router.push('/projects/'+id)} style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',fontSize:12}}>← Projet</button>
            <span style={{color:'var(--dim)'}}>›</span>
            <span style={{fontSize:12,color:'var(--dim)'}}>{project?.name}</span>
          </div>
          <div className="sec-label">// WBS</div>
          <h1 className="sec-title" style={{marginBottom:4}}>📚 Dictionnaire WBS</h1>
        </div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
          {lastSaved && <div style={{display:'flex',alignItems:'center',gap:6,padding:'5px 10px',background:'rgba(53,200,144,.07)',border:'1px solid rgba(53,200,144,.2)',borderRadius:7,fontSize:11}}>
            <span style={{color:'var(--green)'}}>✓</span>
            <span style={{color:'var(--muted)'}}>Sauvegarde</span>
          </div>}
          {entries.length > 0 && <>
            <select onChange={e=>{handleWBSExport(e.target.value);e.target.value=''}} style={{padding:'5px 8px',background:'var(--ink2)',border:'1px solid var(--line2)',borderRadius:7,cursor:'pointer',color:'var(--muted)',fontSize:11}}>
              <option value="">↗ Exporter</option>
              <option value="print">🖨️ Imprimer/PDF</option>
              <option value="word">📝 Word</option>
              <option value="excel">📊 Excel/CSV</option>
            </select>
            <button onClick={exportToEVM} className="btn-ghost" style={{fontSize:11,color:'var(--gold2)',borderColor:'rgba(212,168,75,.3)'}}>→ Vers EVM</button>
          </>}
          <button onClick={addEntry} className="btn-ghost" style={{fontSize:11}}>+ Entree</button>
          <button onClick={generateDict} className="btn-gold" disabled={generating} style={{fontSize:11}}>
            {generating ? '⏳ Generation...' : entries.length > 0 ? '🔄 Regenerer' : '⚡ Generer le dictionnaire'}
          </button>
        </div>
      </div>

      <div style={{display:'flex',gap:5,marginBottom:16,borderBottom:'1px solid var(--line)',paddingBottom:12,flexWrap:'wrap'}}>
        {NAV_LABELS.map(label => {
          const href = getNavHref(label, id)
          return (
            <button key={href} onClick={() => router.push(href)}
              style={{padding:'6px 12px',fontSize:11,cursor:'pointer',borderRadius:8,border:'1px solid var(--line2)',background:href===activeHref?'rgba(212,168,75,.15)':'transparent',color:href===activeHref?'var(--gold2)':'var(--muted)',fontWeight:href===activeHref?600:400,transition:'all .12s',fontFamily:'var(--mono)'}}>
              {NAV_ICONS[label]||''} {label}
            </button>
          )
        })}
      </div>

      {genMsg && (
        <div style={{padding:'10px 16px',borderRadius:9,background:genMsg.includes('Erreur')?'rgba(240,96,96,.08)':'rgba(53,200,144,.08)',border:'1px solid '+(genMsg.includes('Erreur')?'var(--red)':'var(--green)'),fontSize:12,color:genMsg.includes('Erreur')?'var(--red)':'var(--green)',marginBottom:16}}>
          {genMsg}
        </div>
      )}

      {entries.length === 0 ? (
        <div style={{textAlign:'center',padding:'80px 20px',background:'var(--ink2)',border:'1.5px solid var(--line)',borderRadius:14}}>
          <div style={{fontSize:56,marginBottom:16,opacity:.4}}>📚</div>
          <div style={{fontFamily:'var(--syne)',fontSize:20,fontWeight:700,color:'var(--white)',marginBottom:10}}>Aucun dictionnaire WBS</div>
          <div style={{fontSize:13,color:'var(--muted)',marginBottom:28}}>Generez depuis le WBS ou ajoutez manuellement.</div>
          <div style={{display:'flex',gap:12,justifyContent:'center'}}>
            <button className="btn-gold" onClick={generateDict} disabled={generating}>{generating?'⏳':'⚡ Generer le dictionnaire WBS'}</button>
            <button className="btn-ghost" onClick={addEntry}>+ Creer manuellement</button>
          </div>
        </div>
      ) : (
        <>
          <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:10,marginBottom:16}}>
            {[
              {label:'Entrees total', value:entries.length,      color:'var(--white)'},
              {label:'JH total',      value:totalJH+' JH',       color:'var(--gold2)'},
              {label:'BAC estime',    value:Math.round(totalBac/1000)+'k€', color:'var(--cyan)'},
              {label:'Terminees',     value:doneCount,            color:'var(--green)'},
              {label:'En cours',      value:inProgressCount,      color:'var(--amber)'},
            ].map(k => (
              <div key={k.label} style={{background:'var(--ink2)',border:'1.5px solid var(--line)',borderRadius:10,padding:'12px 14px'}}>
                <div style={{fontSize:9,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:6}}>{k.label}</div>
                <div style={{fontFamily:'var(--syne)',fontSize:18,fontWeight:700,color:k.color}}>{k.value}</div>
              </div>
            ))}
          </div>

          <div style={{display:'flex',gap:10,marginBottom:12,alignItems:'center',flexWrap:'wrap'}}>
            <select className="fi fi-select" value={filterRole} onChange={e=>setFilterRole(e.target.value)} style={{width:'auto',padding:'6px 30px 6px 10px',fontSize:11}}>
              <option value="all">Tous les roles</option>
              {ROLES.map(r => <option key={r}>{r}</option>)}
            </select>
            <select className="fi fi-select" value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={{width:'auto',padding:'6px 30px 6px 10px',fontSize:11}}>
              <option value="all">Tous les statuts</option>
              <option value="not_started">Non demarre</option>
              <option value="in_progress">En cours</option>
              <option value="done">Termine</option>
            </select>
            <span style={{fontSize:11,color:'var(--dim)',marginLeft:'auto'}}>{filtered.length} entrees</span>
          </div>

          <div className="card">
            <div style={{overflowX:'auto'}}>
              <table className="table" style={{minWidth:1100}}>
                <thead>
                  <tr>
                    {['ID WBS','Nom / Description','Role','JH','BAC €','Debut','Fin','Livrable','Statut','Actions'].map(h => (
                      <th key={h} style={{fontSize:9,whiteSpace:'nowrap'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(e => {
                    const rowBg = e.level===1 ? 'rgba(212,168,75,.06)' : ''
                    const indent = (e.level - 1) * 16
                    return (
                      <tr key={e.id} style={{background:rowBg}}>
                        <td style={{fontFamily:'monospace',fontSize:10,color:'var(--dim)',whiteSpace:'nowrap'}}>{e.wbs_id}</td>
                        <td style={{maxWidth:200}}>
                          <div style={{paddingLeft:indent,fontWeight:e.level===1?700:e.level===2?600:400,color:e.level===1?'var(--gold2)':'var(--text)',fontSize:11,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{e.name}</div>
                          {e.description && <div style={{paddingLeft:indent,fontSize:9,color:'var(--dim)',marginTop:2,overflow:'hidden',textOverflow:'ellipsis'}}>{e.description}</div>}
                        </td>
                        <td style={{fontSize:10,color:'var(--muted)',whiteSpace:'nowrap'}}>{e.role}</td>
                        <td>
                          <input type="number" min={0} value={e.jh}
                            onChange={ev => { const u={...e,jh:+ev.target.value}; setEntries(prev=>prev.map(x=>x.id===e.id?u:x)) }}
                            onBlur={() => saveDict(entries)}
                            style={{width:48,padding:'2px 6px',background:'var(--ink)',border:'1px solid var(--line2)',borderRadius:4,color:'var(--gold2)',fontSize:11,fontFamily:'monospace',textAlign:'center'}} />
                        </td>
                        <td style={{fontSize:10,color:'var(--cyan)',fontFamily:'monospace',whiteSpace:'nowrap'}}>{e.jh?(e.jh*650).toLocaleString('fr-FR'):''}</td>
                        <td style={{fontSize:10,color:'var(--muted)',whiteSpace:'nowrap'}}>{e.start_date}</td>
                        <td style={{fontSize:10,color:'var(--muted)',whiteSpace:'nowrap'}}>{e.end_date}</td>
                        <td style={{fontSize:9,color:'var(--muted)',maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{e.deliverable}</td>
                        <td>
                          <select value={e.status}
                            onChange={ev => { const u={...e,status:ev.target.value as WBSEntry['status']}; const ne=entries.map(x=>x.id===e.id?u:x); setEntries(ne); saveDict(ne) }}
                            style={{padding:'3px 6px',background:'var(--ink)',border:'1px solid var(--line2)',borderRadius:4,color:e.status==='done'?'var(--green)':e.status==='in_progress'?'var(--amber)':'var(--muted)',fontSize:10}}>
                            <option value="not_started">Non demarre</option>
                            <option value="in_progress">En cours</option>
                            <option value="done">Termine</option>
                          </select>
                        </td>
                        <td>
                          <div style={{display:'flex',gap:3,whiteSpace:'nowrap'}}>
                            <button onClick={() => setEditing({...e})} style={{padding:'2px 7px',background:'var(--ink3)',border:'1px solid var(--line2)',borderRadius:4,cursor:'pointer',fontSize:10,color:'var(--muted)'}}>✎</button>
                            <button onClick={() => deleteEntry(e.id)} style={{padding:'2px 7px',background:'rgba(240,96,96,.1)',border:'1px solid rgba(240,96,96,.2)',borderRadius:4,cursor:'pointer',fontSize:10,color:'var(--red)'}}>🗑</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{background:'rgba(212,168,75,.06)',borderTop:'2px solid var(--gold)'}}>
                    <td colSpan={3} style={{fontSize:11,fontWeight:700,color:'var(--gold2)',padding:'10px 16px'}}>TOTAL</td>
                    <td style={{fontSize:11,fontWeight:700,color:'var(--gold2)',fontFamily:'monospace'}}>{totalJH}</td>
                    <td style={{fontSize:11,fontWeight:700,color:'var(--cyan)',fontFamily:'monospace'}}>{Math.round(totalBac).toLocaleString('fr-FR')}</td>
                    <td colSpan={5}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}

      {editingEntry && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal" style={{width:560,maxHeight:'90vh',overflowY:'auto'}} onClick={e=>e.stopPropagation()}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
              <div style={{fontFamily:'var(--syne)',fontSize:16,fontWeight:700,color:'var(--white)'}}>✎ Modifier l'entree WBS</div>
              <button onClick={() => setEditing(null)} style={{background:'none',border:'none',color:'var(--dim)',cursor:'pointer',fontSize:22}}>×</button>
            </div>
            <div className="grid-2">
              <div className="fg">
                <label className="fl">ID WBS</label>
                <input className="fi" value={editingEntry.wbs_id} onChange={e=>setEditing({...editingEntry,wbs_id:e.target.value})} placeholder="1.2.3"/>
              </div>
              <div className="fg">
                <label className="fl">Niveau (1=Phase, 2=Lot, 3=Tache)</label>
                <select className="fi fi-select" value={editingEntry.level} onChange={e=>setEditing({...editingEntry,level:+e.target.value})}>
                  <option value={1}>1 — Phase</option>
                  <option value={2}>2 — Lot de travaux</option>
                  <option value={3}>3 — Tache detaillee</option>
                </select>
              </div>
            </div>
            <div className="fg">
              <label className="fl">Nom *</label>
              <input className="fi" value={editingEntry.name} onChange={e=>setEditing({...editingEntry,name:e.target.value})}/>
            </div>
            <div className="fg">
              <label className="fl">Description</label>
              <textarea className="fi" rows={2} value={editingEntry.description} onChange={e=>setEditing({...editingEntry,description:e.target.value})} style={{resize:'vertical'}}/>
            </div>
            <div className="grid-2">
              <div className="fg">
                <label className="fl">Role responsable</label>
                <select className="fi fi-select" value={editingEntry.role} onChange={e=>setEditing({...editingEntry,role:e.target.value})}>
                  {ROLES.map(r=><option key={r}>{r}</option>)}
                </select>
              </div>
              <div className="fg">
                <label className="fl">Charge (JH)</label>
                <input className="fi" type="number" min={0} value={editingEntry.jh} onChange={e=>setEditing({...editingEntry,jh:+e.target.value})}/>
              </div>
            </div>
            <div className="grid-2">
              <div className="fg">
                <label className="fl">Date debut</label>
                <input className="fi" type="date" value={editingEntry.start_date} onChange={e=>setEditing({...editingEntry,start_date:e.target.value})}/>
              </div>
              <div className="fg">
                <label className="fl">Date fin</label>
                <input className="fi" type="date" value={editingEntry.end_date} onChange={e=>setEditing({...editingEntry,end_date:e.target.value})}/>
              </div>
            </div>
            <div className="fg">
              <label className="fl">Livrable</label>
              <input className="fi" value={editingEntry.deliverable} onChange={e=>setEditing({...editingEntry,deliverable:e.target.value})}/>
            </div>
            <div className="fg">
              <label className="fl">Criteres d'acceptation</label>
              <textarea className="fi" rows={2} value={editingEntry.acceptance_criteria} onChange={e=>setEditing({...editingEntry,acceptance_criteria:e.target.value})} style={{resize:'vertical'}}/>
            </div>
            <div className="grid-2">
              <div className="fg">
                <label className="fl">Dependances (ID WBS)</label>
                <input className="fi" value={editingEntry.dependencies} onChange={e=>setEditing({...editingEntry,dependencies:e.target.value})} placeholder="1.1, 1.2"/>
              </div>
              <div className="fg">
                <label className="fl">Statut</label>
                <select className="fi fi-select" value={editingEntry.status} onChange={e=>setEditing({...editingEntry,status:e.target.value as WBSEntry['status']})}>
                  <option value="not_started">Non demarre</option>
                  <option value="in_progress">En cours</option>
                  <option value="done">Termine</option>
                </select>
              </div>
            </div>
            <div style={{display:'flex',gap:10}}>
              <button className="btn-gold" onClick={() => updateEntry(editingEntry)} disabled={!editingEntry.name.trim()}>✓ Sauvegarder</button>
              <button className="btn-ghost" onClick={() => setEditing(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
