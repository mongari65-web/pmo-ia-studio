'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AppLayout from '@/components/layout/AppLayout'
import ExportToolbar from '@/components/ui/ExportToolbar'

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

function parseClaudeResponse(text: string): WBSEntry[] {
  if (!text) throw new Error('Reponse vide')
  
  // Nettoyer tout ce qui n'est pas JSON
  let clean = text.trim()
  
  // Supprimer les balises markdown (backticks)
  clean = clean.replace(/^[\s\S]*?\[/, '[')
  
  // Trouver le tableau JSON
  const start = clean.indexOf('[')
  const end   = clean.lastIndexOf(']')
  
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Format JSON non trouve - veuillez reessayer')
  }
  
  const jsonStr = clean.slice(start, end + 1)
  const parsed = JSON.parse(jsonStr)
  
  if (!Array.isArray(parsed)) throw new Error('Format inattendu')
  return parsed
}

const NAV = (id: string) => [
  { label:'Documents',  href:'/projects/' + id },
  { label:'WBS Dict',   href:'/projects/' + id + '/wbs-dict' },
  { label:'RAID',       href:'/projects/' + id + '/raid' },
  { label:'Jalons',     href:'/projects/' + id + '/jalons' },
  { label:'PERT',       href:'/projects/' + id + '/pert' },
  { label:'Mind Map',   href:'/projects/' + id + '/mindmap' },
  { label:'Budget EVM', href:'/projects/' + id + '/budget' },
]

const ICON: Record<string,string> = {
  'Documents':'📄','WBS Dict':'📚','RAID':'⚠','Jalons':'📅',
  'PERT':'📊','Mind Map':'🧠','Budget EVM':'💰','Gantt':'📅','Work Packages':'📦'
}

export default function WBSDictPage() {
  const [entries, setEntries]       = useState<WBSEntry[]>([])
  const [project, setProject]       = useState<any>(null)
  const [wbsContent, setWbsContent] = useState('')
  const [loading, setLoading]       = useState(true)
  const [generating, setGenerating] = useState(false)
  const [genMsg, setGenMsg]         = useState('')
  const [editingEntry, setEditing]  = useState<WBSEntry | null>(null)
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
      .select('content').eq('project_id', id).eq('doc_type', 'wbs_dict')
      .order('created_at', { ascending: false }).limit(1)
    if (dictDocs?.[0]) {
      try { setEntries(JSON.parse(dictDocs[0].content)) } catch {}
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
  }

  async function generateDict() {
    setGenerating(true)
    setGenMsg('Generation du dictionnaire WBS par Claude...')
    const ctx = project?.context || {}
    
    // Convertir le WBS en texte lisible
    let wbsText = 'Non disponible'
    if (wbsContent) {
      try {
        const c = wbsContent.replace(/```json/gi,'').replace(/```/g,'').trim()
        const m = c.match(/\{[\s\S]*\}/)
        if (m) {
          const obj = JSON.parse(m[0])
          if (obj.wbs) {
            wbsText = Object.values(obj.wbs as Record<string,any>)
              .map((v: any) => '  '.repeat((v.level||1)-1) + (v.id||'') + ' - ' + (v.name||''))
              .join('\n')
          } else {
            wbsText = wbsContent.slice(0, 2000)
          }
        } else {
          wbsText = wbsContent.slice(0, 2000)
        }
      } catch {
        wbsText = wbsContent.slice(0, 2000)
      }
    }

    const today = new Date().toISOString().split('T')[0]
    const endDate = new Date(Date.now() + 180*86400000).toISOString().split('T')[0]
    
    const prompt = 'Tu es un expert PMI/PMBOK 7. Genere un dictionnaire WBS JSON pour ce projet.\n\n'
      + 'PROJET: ' + (project?.name || '') + '\n'
      + 'TYPE: ' + (project?.project_type || '') + '\n'
      + 'SECTEUR: ' + (project?.sector || 'IT') + '\n'
      + 'BUDGET: ' + (project?.budget || '') + '\n'
      + 'DUREE: ' + (project?.duration || '6 mois') + '\n'
      + 'WBS: ' + wbsText + '\n\n'
      + 'Genere 12 a 18 entrees. Chaque entree a: id, wbs_id, name, description, level (1/2/3), parent_id, deliverable, acceptance_criteria, role (parmi: Chef de Projet/Architecte/Developpeur/DevOps/QA-Testeur/Analyste), jh (jours-hommes), start_date (YYYY-MM-DD a partir de ' + today + '), end_date (YYYY-MM-DD), dependencies, status (not_started).\n\n'
      + 'Reponds avec UNIQUEMENT le tableau JSON, rien dautre, pas de markdown:\n[\n  {\n    "id": "wbs_1",\n    "wbs_id": "1",\n    "name": "INITIALISATION",\n    "description": "Phase initiale",\n    "level": 1,\n    "parent_id": "",\n    "deliverable": "Charte projet",\n    "acceptance_criteria": "Validation sponsor",\n    "role": "Chef de Projet",\n    "jh": 0,\n    "start_date": "' + today + '",\n    "end_date": "' + endDate + '",\n    "dependencies": "",\n    "status": "not_started"\n  }\n]'

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, maxTokens: 6000 })
      })
      const data = await res.json()
      const parsed = parseClaudeResponse(data.text || '')
      setEntries(parsed)
      await saveDict(parsed)
      const totalJH = parsed.reduce((s: number, e: WBSEntry) => s + (e.jh || 0), 0)
      setGenMsg(parsed.length + ' entrees generees — Total: ' + totalJH + ' JH')
    } catch (e: any) {
      console.error('WBS Dict error:', e)
      setGenMsg('Erreur: ' + e.message)
    }
    setGenerating(false)
    setTimeout(() => setGenMsg(''), 6000)
  }

  async function exportToEVM() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const RATES: Record<string,number> = {
      'Chef de Projet':750,'Architecte':800,'Developpeur':650,
      'DevOps':700,'QA/Testeur':550,'Analyste':600,'Consultant':850,'Expert Metier':700
    }
    const NB_PERIODS = 12

    // Dates globales du projet
    const taskEntries = entries.filter(e => e.level > 1 && e.jh > 0)
    const projectStart = entries.reduce((min, e) => !min || (e.start_date && e.start_date < min) ? e.start_date : min, '')
    const projectEnd   = entries.reduce((max, e) => !max || (e.end_date && e.end_date > max) ? e.end_date : max, '')
    const startMs = new Date(projectStart || new Date().toISOString().split('T')[0]).getTime()
    const endMs   = new Date(projectEnd || new Date(Date.now()+365*86400000).toISOString().split('T')[0]).getTime()
    const totalMs = Math.max(endMs - startMs, 1)
    const periodMs = totalMs / NB_PERIODS

    // Récupérer l'ancien EVM s'il existe pour préserver AC et pct_complete
    const { data: existingDocs } = await supabase.from('documents')
      .select('content').eq('project_id', id).eq('doc_type', 'budget_evm')
      .order('created_at', { ascending: false }).limit(1)
    
    let oldTaskMap: Record<string, any> = {}
    if (existingDocs?.[0]) {
      try {
        const old = JSON.parse(existingDocs[0].content)
        if (old.tasks) {
          old.tasks.forEach((t: any) => {
            oldTaskMap[t.wbs_id] = t
            oldTaskMap[t.name]   = t
          })
        }
      } catch {}
    }

    // Générer les tâches au nouveau format par périodes
    const newTasks = taskEntries.map(e => {
      const rate = RATES[e.role] || 650
      const tbc  = e.jh * rate

      // Répartir PV sur les périodes selon les dates de la tâche
      const tStart = new Date(e.start_date || projectStart).getTime()
      const tEnd   = new Date(e.end_date   || projectEnd).getTime()
      const pv_periods = Array(NB_PERIODS).fill(0).map((_, i) => {
        const pStart = startMs + i * periodMs
        const pEnd   = startMs + (i + 1) * periodMs
        // Chevauchement entre la tâche et la période
        const overlap = Math.max(0, Math.min(tEnd, pEnd) - Math.max(tStart, pStart))
        const taskDur = Math.max(tEnd - tStart, 1)
        return Math.round(tbc * (overlap / taskDur))
      })

      // Récupérer les anciennes données AC et % si elles existent
      const oldTask = oldTaskMap[e.wbs_id] || oldTaskMap[e.name]
      
      let ev_periods = Array(NB_PERIODS).fill(0)
      let ac_periods = Array(NB_PERIODS).fill(0)

      if (oldTask) {
        // Ancien format avec pct_complete et ac globaux → distribuer sur les périodes
        if (oldTask.pct_complete !== undefined && oldTask.pct_complete > 0) {
          // Mettre le % dans la dernière période renseignée
          const lastPeriod = Math.min(NB_PERIODS - 1, Math.floor(oldTask.pct_complete / 100 * NB_PERIODS))
          ev_periods = Array(NB_PERIODS).fill(0)
          ev_periods[lastPeriod] = oldTask.pct_complete / 100
        }
        if (oldTask.ac !== undefined && oldTask.ac > 0) {
          // Répartir l'AC sur les périodes au prorata du PV
          const totalPV = pv_periods.reduce((s, v) => s + v, 0)
          ac_periods = pv_periods.map(pv => totalPV > 0 ? Math.round(oldTask.ac * (pv / totalPV)) : 0)
        }
        // Nouveau format avec ac_periods → récupérer directement
        if (Array.isArray(oldTask.ac_periods)) ac_periods = oldTask.ac_periods
        if (Array.isArray(oldTask.ev_periods)) ev_periods = oldTask.ev_periods
      }

      return {
        id:         e.id,
        wbs_id:     e.wbs_id,
        name:       e.name,
        role:       e.role,
        tbc,
        pv_periods,
        ev_periods,
        ac_periods,
      }
    })

    // Labels périodes basés sur les dates réelles
    const period_labels = Array.from({ length: NB_PERIODS }, (_, i) => {
      const d = new Date(startMs + (i + 0.5) * periodMs)
      return d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })
    })

    const totalBac = newTasks.reduce((s, t) => s + t.tbc, 0)

    const evmData = {
      tasks: newTasks,
      config: {
        project_title:  project?.name || '',
        manager:        'Chef de Projet',
        report_date:    new Date().toISOString().split('T')[0],
        current_period: 0,
        nb_periods:     NB_PERIODS,
        period_labels,
        bac_total:      totalBac,
        start_date:     projectStart,
        end_date:       projectEnd,
        current_date:   new Date().toISOString().split('T')[0],
        rates:          RATES,
      }
    }

    await supabase.from('documents').upsert({
      project_id: id, user_id: user.id,
      doc_type: 'budget_evm',
      title: 'Budget EVM — ' + (project?.name || ''),
      content: JSON.stringify(evmData), status: 'generated',
    }, { onConflict: 'project_id,doc_type' })

    const preserved = Object.keys(oldTaskMap).length > 0
    setGenMsg('✓ ' + newTasks.length + ' taches exportees vers EVM' + (preserved ? ' · Donnees AC/% precedentes preservees' : ''))
    setTimeout(() => router.push('/projects/' + id + '/budget'), 1800)
  }

  function exportCSV() {
    const headers = ['ID WBS','Nom','Description','Niveau','Role','JH','Date debut','Date fin','Dependencies','Livrable','Criteres','Statut']
    const rows = entries.map(e => [
      e.wbs_id, e.name, e.description, e.level, e.role, e.jh,
      e.start_date, e.end_date, e.dependencies, e.deliverable, e.acceptance_criteria, e.status
    ])
    const csv = [headers, ...rows].map(r => r.map(v => '"' + String(v||'').replace(/"/g,'""') + '"').join(';')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type:'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'WBS-Dict-' + (project?.name||'projet') + '.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  function addEntry() {
    const newEntry: WBSEntry = {
      id: 'wbs_' + Date.now(), wbs_id: '', name: 'Nouvelle entree',
      description: '', level: 2, parent_id: '', deliverable: '',
      acceptance_criteria: '', role: 'Chef de Projet', jh: 0,
      start_date: new Date().toISOString().split('T')[0],
      end_date: new Date(Date.now()+30*86400000).toISOString().split('T')[0],
      dependencies: '', status: 'not_started',
    }
    setEntries(prev => [...prev, newEntry])
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
  const totalJH  = entries.reduce((s,e) => s + (e.jh||0), 0)
  const totalBac = entries.reduce((s,e) => s + (e.jh||0)*700, 0)
  const activeHref = '/projects/' + id + '/wbs-dict'

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
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          {entries.length > 0 && <>
            <button onClick={exportCSV} className="btn-ghost" style={{fontSize:11}}>↓ CSV</button>
            <button onClick={exportToEVM} className="btn-ghost" style={{fontSize:11,color:'var(--gold2)',borderColor:'rgba(212,168,75,.3)'}}>→ Vers EVM</button>
          </>}
          <button onClick={addEntry} className="btn-ghost" style={{fontSize:11}}>+ Entree</button>
          <ExportToolbar
            title={'WBS — '+(project?.name||'')}
            content={JSON.stringify(entries)}
            projectName={project?.name||''}
            docType="wbs"
            onMessage={(m:string)=>{setGenMsg(m);setTimeout(()=>setGenMsg(''),5000)}}
          />
          <button onClick={generateDict} className="btn-gold" disabled={generating} style={{fontSize:11}}>
            {generating ? '⏳ Generation...' : entries.length > 0 ? '🔄 Regenerer' : '⚡ Generer le dictionnaire'}
          </button>
        </div>
      </div>

      <div style={{display:'flex',gap:5,marginBottom:16,borderBottom:'1px solid var(--line)',paddingBottom:12,flexWrap:'wrap'}}>
        {NAV(id).map(tab => (
          <button key={tab.href} onClick={() => router.push(tab.href)}
            style={{padding:'6px 12px',fontSize:11,cursor:'pointer',borderRadius:8,border:'1px solid var(--line2)',background:tab.href===activeHref?'rgba(212,168,75,.15)':'transparent',color:tab.href===activeHref?'var(--gold2)':'var(--muted)',fontWeight:tab.href===activeHref?600:400,transition:'all .12s',fontFamily:'var(--mono)'}}>
            {ICON[tab.label]||''} {tab.label}
          </button>
        ))}
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
          <div style={{fontSize:13,color:'var(--muted)',marginBottom:28,maxWidth:520,margin:'0 auto 28px',lineHeight:1.8}}>
            {wbsContent ? 'Un WBS a ete trouve. Generez le dictionnaire avec charges JH, dates et livrables.' : 'Generez d abord le WBS dans l onglet Documents.'}
          </div>
          <div style={{display:'flex',gap:12,justifyContent:'center'}}>
            {wbsContent && <button className="btn-gold" onClick={generateDict} disabled={generating} style={{fontSize:13}}>{generating?'⏳ Generation...':'⚡ Generer le dictionnaire WBS'}</button>}
            <button className="btn-ghost" onClick={addEntry} style={{fontSize:13}}>+ Creer manuellement</button>
          </div>
        </div>
      ) : (
        <>
          <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:10,marginBottom:16}}>
            {[
              {label:'Entrees',  value:entries.length,           color:'var(--white)'},
              {label:'JH total', value:totalJH+' JH',            color:'var(--gold2)'},
              {label:'BAC est.', value:Math.round(totalBac/1000)+'k€', color:'var(--cyan)'},
              {label:'Terminees',value:entries.filter(e=>e.status==='done').length, color:'var(--green)'},
              {label:'En cours', value:entries.filter(e=>e.status==='in_progress').length, color:'var(--amber)'},
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
                  <tr>{['ID WBS','Nom','Role','JH','BAC €','Debut','Fin','Livrable','Statut','Actions'].map(h=><th key={h} style={{fontSize:9,whiteSpace:'nowrap'}}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {filtered.map(e => {
                    const bg = e.level===1?'rgba(212,168,75,.06)':e.level===2?'rgba(255,255,255,.01)':''
                    const indent = (e.level-1)*14
                    return (
                      <tr key={e.id} style={{background:bg}}>
                        <td style={{fontFamily:'monospace',fontSize:10,color:'var(--dim)'}}>{e.wbs_id}</td>
                        <td style={{maxWidth:200}}>
                          <div style={{paddingLeft:indent,fontWeight:e.level===1?700:e.level===2?600:400,color:e.level===1?'var(--gold2)':'var(--text)',fontSize:11,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{e.name}</div>
                          {e.description&&<div style={{paddingLeft:indent,fontSize:9,color:'var(--dim)',marginTop:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:180}}>{e.description}</div>}
                        </td>
                        <td style={{fontSize:10,color:'var(--muted)',whiteSpace:'nowrap'}}>{e.role}</td>
                        <td>
                          <input type="number" min={0} value={e.jh}
                            onChange={ev=>{const u={...e,jh:+ev.target.value};setEntries(prev=>prev.map(x=>x.id===e.id?u:x))}}
                            onBlur={()=>saveDict(entries)}
                            style={{width:46,padding:'2px 5px',background:'var(--ink)',border:'1px solid var(--line2)',borderRadius:4,color:'var(--gold2)',fontSize:11,fontFamily:'monospace',textAlign:'center'}}/>
                        </td>
                        <td style={{fontSize:10,color:'var(--cyan)',fontFamily:'monospace'}}>{e.jh?(e.jh*700).toLocaleString('fr-FR'):''}</td>
                        <td style={{fontSize:10,color:'var(--muted)',whiteSpace:'nowrap'}}>{e.start_date}</td>
                        <td style={{fontSize:10,color:'var(--muted)',whiteSpace:'nowrap'}}>{e.end_date}</td>
                        <td style={{fontSize:9,color:'var(--muted)',maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{e.deliverable}</td>
                        <td>
                          <select value={e.status}
                            onChange={ev=>{const u={...e,status:ev.target.value as WBSEntry['status']};const ne=entries.map(x=>x.id===e.id?u:x);setEntries(ne);saveDict(ne)}}
                            style={{padding:'3px 6px',background:'var(--ink)',border:'1px solid var(--line2)',borderRadius:4,color:e.status==='done'?'var(--green)':e.status==='in_progress'?'var(--amber)':'var(--muted)',fontSize:10}}>
                            <option value="not_started">Non demarre</option>
                            <option value="in_progress">En cours</option>
                            <option value="done">Termine</option>
                          </select>
                        </td>
                        <td>
                          <div style={{display:'flex',gap:3}}>
                            <button onClick={()=>setEditing({...e})} style={{padding:'2px 7px',background:'var(--ink3)',border:'1px solid var(--line2)',borderRadius:4,cursor:'pointer',fontSize:10,color:'var(--muted)'}}>✎</button>
                            <button onClick={()=>deleteEntry(e.id)} style={{padding:'2px 7px',background:'rgba(240,96,96,.1)',border:'1px solid rgba(240,96,96,.2)',borderRadius:4,cursor:'pointer',fontSize:10,color:'var(--red)'}}>🗑</button>
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

          <div style={{marginTop:16,display:'flex',justifyContent:'flex-end'}}>
            <button onClick={exportToEVM} className="btn-gold" style={{fontSize:13,padding:'11px 24px'}}>
              💰 Exporter vers Budget EVM →
            </button>
          </div>
        </>
      )}

      {editingEntry && (
        <div className="modal-overlay" onClick={()=>setEditing(null)}>
          <div className="modal" style={{width:520}} onClick={e=>e.stopPropagation()}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
              <div style={{fontFamily:'var(--syne)',fontSize:16,fontWeight:700,color:'var(--white)'}}>✎ Modifier l entree WBS</div>
              <button onClick={()=>setEditing(null)} style={{background:'none',border:'none',color:'var(--dim)',cursor:'pointer',fontSize:22}}>×</button>
            </div>
            <div className="grid-2">
              <div className="fg">
                <label className="fl">ID WBS</label>
                <input className="fi" value={editingEntry.wbs_id} onChange={e=>setEditing({...editingEntry,wbs_id:e.target.value})} placeholder="1.2.3"/>
              </div>
              <div className="fg">
                <label className="fl">Niveau</label>
                <select className="fi fi-select" value={editingEntry.level} onChange={e=>setEditing({...editingEntry,level:+e.target.value})}>
                  <option value={1}>1 — Phase</option>
                  <option value={2}>2 — Lot</option>
                  <option value={3}>3 — Tache</option>
                </select>
              </div>
            </div>
            <div className="fg">
              <label className="fl">Nom</label>
              <input className="fi" value={editingEntry.name} onChange={e=>setEditing({...editingEntry,name:e.target.value})}/>
            </div>
            <div className="fg">
              <label className="fl">Description</label>
              <textarea className="fi" rows={2} value={editingEntry.description} onChange={e=>setEditing({...editingEntry,description:e.target.value})} style={{resize:'vertical'}}/>
            </div>
            <div className="grid-2">
              <div className="fg">
                <label className="fl">Role</label>
                <select className="fi fi-select" value={editingEntry.role} onChange={e=>setEditing({...editingEntry,role:e.target.value})}>
                  {ROLES.map(r=><option key={r}>{r}</option>)}
                </select>
              </div>
              <div className="fg">
                <label className="fl">Charge JH</label>
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
              <label className="fl">Criteres d acceptation</label>
              <textarea className="fi" rows={2} value={editingEntry.acceptance_criteria} onChange={e=>setEditing({...editingEntry,acceptance_criteria:e.target.value})} style={{resize:'vertical'}}/>
            </div>
            <div className="grid-2">
              <div className="fg">
                <label className="fl">Dependencies</label>
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
              <button className="btn-gold" onClick={()=>updateEntry(editingEntry)} disabled={!editingEntry.name.trim()}>✓ Sauvegarder</button>
              <button className="btn-ghost" onClick={()=>setEditing(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
