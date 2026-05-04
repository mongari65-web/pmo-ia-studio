'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AppLayout from '@/components/layout/AppLayout'

// ── TYPES ──────────────────────────────────────────────────
interface Task {
  id: string
  name: string
  duration: number
  deps: string[]   // IDs des tâches précédentes
  responsible: string
  // Calculés par CPM
  est: number      // Early Start Time
  eft: number      // Early Finish Time
  lst: number      // Late Start Time
  lft: number      // Late Finish Time
  tf: number       // Total Float (marge totale)
  critical: boolean
}

// ── ALGORITHME CPM ──────────────────────────────────────────
function computeCPM(tasks: Task[]): Task[] {
  const map: Record<string, Task> = {}
  tasks.forEach(t => { map[t.id] = { ...t, est:0, eft:0, lst:0, lft:0, tf:0, critical:false } })

  // Tri topologique (Kahn)
  const inDegree: Record<string, number> = {}
  tasks.forEach(t => { inDegree[t.id] = 0 })
  tasks.forEach(t => t.deps.forEach(d => { if (map[d]) inDegree[t.id]++ }))
  const queue = tasks.filter(t => inDegree[t.id] === 0).map(t => t.id)
  const order: string[] = []
  const visited = new Set<string>()
  while (queue.length > 0) {
    const cur = queue.shift()!
    if (visited.has(cur)) continue
    visited.add(cur)
    order.push(cur)
    tasks.forEach(t => {
      if (t.deps.includes(cur)) {
        inDegree[t.id]--
        if (inDegree[t.id] === 0) queue.push(t.id)
      }
    })
  }

  // Forward pass — calcul au plus tôt
  order.forEach(id => {
    const t = map[id]
    if (t.deps.length === 0) {
      t.est = 0
    } else {
      t.est = Math.max(...t.deps.filter(d => map[d]).map(d => map[d].eft))
    }
    t.eft = t.est + t.duration
  })

  // Durée totale du projet
  const projectDuration = Math.max(...Object.values(map).map(t => t.eft))

  // Backward pass — calcul au plus tard
  const reverseOrder = [...order].reverse()
  reverseOrder.forEach(id => {
    const t = map[id]
    const successors = tasks.filter(s => s.deps.includes(id))
    if (successors.length === 0) {
      t.lft = projectDuration
    } else {
      t.lft = Math.min(...successors.map(s => map[s.id].lst))
    }
    t.lst = t.lft - t.duration
    t.tf  = t.lst - t.est
    t.critical = t.tf === 0
  })

  return Object.values(map)
}

// ── COULEURS ────────────────────────────────────────────────
const COLORS = {
  critical:    { fill: '#2A0808', stroke: '#E05050', text: '#FF8080' },
  normal:      { fill: '#1A1A28', stroke: '#363648', text: '#D8D8F0' },
  selected:    { fill: '#1A2808', stroke: '#C8A84B', text: '#E8C86A' },
}

const NODE_W = 160
const NODE_H = 80
const H_GAP  = 220
const V_GAP  = 110

// ── LAYOUT AUTOMATIQUE ──────────────────────────────────────
function computeLayout(tasks: Task[]): Record<string, {x:number, y:number}> {
  const levels: Record<string, number> = {}
  const map: Record<string, Task> = {}
  tasks.forEach(t => { map[t.id] = t; levels[t.id] = 0 })

  // Calculer le niveau de chaque nœud (= longueur du chemin le plus long vers lui)
  const getLevel = (id: string, visited = new Set<string>()): number => {
    if (visited.has(id)) return 0
    visited.add(id)
    const task = map[id]
    if (!task || task.deps.length === 0) return 0
    return 1 + Math.max(...task.deps.filter(d => map[d]).map(d => getLevel(d, new Set(visited))))
  }
  tasks.forEach(t => { levels[t.id] = getLevel(t.id) })

  // Grouper par niveau
  const byLevel: Record<number, string[]> = {}
  tasks.forEach(t => {
    const l = levels[t.id]
    if (!byLevel[l]) byLevel[l] = []
    byLevel[l].push(t.id)
  })

  const positions: Record<string, {x:number, y:number}> = {}
  Object.entries(byLevel).forEach(([level, ids]) => {
    const l = parseInt(level)
    const totalH = ids.length * NODE_H + (ids.length - 1) * (V_GAP - NODE_H)
    ids.forEach((id, i) => {
      positions[id] = {
        x: 40 + l * H_GAP,
        y: 40 + i * V_GAP - (totalH / 2) + 200,
      }
    })
  })
  return positions
}

// ── COMPOSANT PRINCIPAL ─────────────────────────────────────
export default function PertPage() {
  const [tasks, setTasks]           = useState<Task[]>([])
  const [computed, setComputed]     = useState<Task[]>([])
  const [positions, setPositions]   = useState<Record<string, {x:number,y:number}>>({})
  const [project, setProject]       = useState<any>(null)
  const [wbsContent, setWbsContent] = useState<string>('')
  const [loading, setLoading]       = useState(true)
  const [generating, setGenerating] = useState(false)
  const [selected, setSelected]     = useState<string | null>(null)
  const [editTask, setEditTask]     = useState<Task | null>(null)
  const [showTable, setShowTable]   = useState(true)
  const [svgScale, setSvgScale]     = useState(1)
  const [genMsg, setGenMsg]         = useState('')
  const params   = useParams()
  const router   = useRouter()
  const supabase = createClient()
  const id = params.id as string

  useEffect(() => { loadData() }, [id])

  async function loadData() {
    const { data: proj } = await supabase.from('projects').select('*').eq('id', id).single()
    setProject(proj)
    // Charger le WBS existant si disponible
    const { data: docs } = await supabase.from('documents').select('content').eq('project_id', id).eq('doc_type', 'wbs').order('created_at', { ascending: false }).limit(1)
    if (docs && docs[0]) setWbsContent(docs[0].content)
    // Charger le PERT existant
    const { data: pertDocs } = await supabase.from('documents').select('content').eq('project_id', id).eq('doc_type', 'pert_data').order('created_at', { ascending: false }).limit(1)
    if (pertDocs && pertDocs[0]) {
      try {
        const parsed = JSON.parse(pertDocs[0].content)
        setTasks(parsed)
      } catch {}
    }
    setLoading(false)
  }

  // Recalculer CPM à chaque changement de tâches
  useEffect(() => {
    if (tasks.length === 0) return
    const result = computeCPM(tasks)
    setComputed(result)
    setPositions(computeLayout(result))
  }, [tasks])

  // ── Générer les tâches PERT depuis le WBS via Claude ──
  async function generateFromWBS() {
    setGenerating(true)
    setGenMsg('Extraction des tâches depuis le WBS...')

    const source = wbsContent || `Projet ${project?.name} — ${project?.project_type}`

    const prompt = `Tu es un expert en planification de projet PERT/CPM.
À partir du WBS suivant, extrais les tâches principales et génère un réseau PERT.

WBS :
${source.slice(0, 3000)}

RÈGLES ABSOLUES :
1. Générer entre 8 et 15 tâches représentatives
2. Inclure une tâche "Démarrage" (id: T0, durée: 0, pas de dépendances)
3. Inclure une tâche "Fin" (id: FIN, dépend de toutes les dernières tâches)
4. Les durées en jours ouvrés (entre 1 et 30 jours)
5. Les dépendances doivent être réalistes et cohérentes
6. Le réseau doit avoir plusieurs chemins (pas juste une séquence linéaire)

Réponds UNIQUEMENT avec un tableau JSON valide, sans texte avant ni après :
[
  {"id":"T0","name":"Démarrage","duration":0,"deps":[],"responsible":"CP"},
  {"id":"T1","name":"Cadrage et analyse","duration":5,"deps":["T0"],"responsible":"CP"},
  {"id":"T2","name":"Architecture technique","duration":8,"deps":["T1"],"responsible":"Architecte"},
  ...
  {"id":"FIN","name":"Clôture projet","duration":1,"deps":["T8","T9"],"responsible":"CP"}
]`

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, maxTokens: 2000 })
      })
      const data = await res.json()
      const text = data.text || ''

      // Extraire le JSON
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (!jsonMatch) throw new Error('Format JSON non trouvé dans la réponse')

      const parsed: Task[] = JSON.parse(jsonMatch[0])
      const withDefaults = parsed.map(t => ({
        ...t,
        est: 0, eft: 0, lst: 0, lft: 0, tf: 0, critical: false,
        responsible: t.responsible || 'CP',
        deps: t.deps || [],
      }))

      setTasks(withDefaults)
      setGenMsg('PERT généré avec succès !')

      // Sauvegarder dans Supabase
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase.from('documents').upsert({
          project_id: id, user_id: user.id,
          doc_type: 'pert_data', title: `PERT — ${project?.name}`,
          content: JSON.stringify(withDefaults), status: 'generated',
        }, { onConflict: 'project_id,doc_type' })
      }

    } catch (e: any) {
      setGenMsg('Erreur : ' + e.message)
    }
    setGenerating(false)
    setTimeout(() => setGenMsg(''), 4000)
  }

  // ── Modifier une tâche ──
  function updateTask(updated: Task) {
    setTasks(prev => prev.map(t => t.id === updated.id ? updated : t))
    setEditTask(null)
  }

  function deleteTask(taskId: string) {
    if (!confirm('Supprimer cette tâche ?')) return
    setTasks(prev => prev.filter(t => t.id !== taskId).map(t => ({
      ...t, deps: t.deps.filter(d => d !== taskId)
    })))
  }

  function addTask() {
    const newId = `T${Date.now().toString().slice(-4)}`
    const newTask: Task = {
      id: newId, name: 'Nouvelle tâche', duration: 5,
      deps: [], responsible: 'CP',
      est:0, eft:0, lst:0, lft:0, tf:0, critical:false
    }
    setTasks(prev => [...prev, newTask])
    setEditTask(newTask)
  }

  // ── Calculer les dimensions du SVG ──
  const svgWidth  = positions && Object.keys(positions).length > 0
    ? Math.max(...Object.values(positions).map(p => p.x)) + NODE_W + 60
    : 800
  const svgHeight = positions && Object.keys(positions).length > 0
    ? Math.max(...Object.values(positions).map(p => p.y)) + NODE_H + 60
    : 400

  const projectDuration = computed.length > 0 ? Math.max(...computed.map(t => t.eft)) : 0
  const criticalPath    = computed.filter(t => t.critical).map(t => t.name).join(' → ')

  if (loading) return <AppLayout><div style={{ textAlign:'center', padding:60, color:'var(--muted)', fontSize:12 }}>Chargement...</div></AppLayout>

  return (
    <AppLayout>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
            <button onClick={() => router.push(`/projects/${id}`)} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:12 }}>← Projet</button>
            <span style={{ color:'var(--dim)' }}>›</span>
            <span style={{ fontSize:12, color:'var(--dim)' }}>{project?.name}</span>
          </div>
          <div className="sec-label">// Planification</div>
          <h1 className="sec-title" style={{ marginBottom:4 }}>Diagramme PERT — Chemin Critique</h1>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={addTask} className="btn-ghost" style={{ fontSize:12 }}>+ Tâche</button>
          <button onClick={generateFromWBS} className="btn-gold" disabled={generating} style={{ fontSize:12 }}>
            {generating ? '⏳ Génération...' : '⚡ Générer depuis le WBS'}
          </button>
        </div>
      </div>

      {/* Onglets navigation */}
      <div style={{ display:'flex', gap:6, marginBottom:16, borderBottom:'1px solid var(--line)', paddingBottom:12 }}>
        {[
          { label:'📄 Documents', href:`/projects/${id}` },
          { label:'⚠ RAID', href:`/projects/${id}/raid` },
          { label:'📅 Jalons', href:`/projects/${id}/jalons` },
          { label:'📊 PERT', href:`/projects/${id}/pert` },
        ].map(tab => (
          <button key={tab.href} onClick={() => router.push(tab.href)}
            style={{ padding:'7px 16px', fontSize:12, fontFamily:'var(--mono)', cursor:'pointer', borderRadius:8, border:'1px solid var(--line2)', background: tab.href === `/projects/${id}/pert` ? 'rgba(200,168,75,.15)' : 'transparent', color: tab.href === `/projects/${id}/pert` ? 'var(--gold2)' : 'var(--muted)', fontWeight: tab.href === `/projects/${id}/pert` ? 600 : 400, transition:'all .12s' }}>
            {tab.label}
          </button>
        ))}
      </div>

      {genMsg && (
        <div style={{ padding:'8px 14px', borderRadius:8, background: genMsg.includes('Erreur') ? 'rgba(224,80,80,.08)' : 'rgba(45,184,138,.08)', border:`1px solid ${genMsg.includes('Erreur') ? 'var(--red)' : 'var(--green)'}`, fontSize:12, color: genMsg.includes('Erreur') ? 'var(--red)' : 'var(--green)', marginBottom:16 }}>
          {genMsg}
        </div>
      )}

      {tasks.length === 0 ? (
        /* État vide */
        <div style={{ textAlign:'center', padding:'60px 20px', background:'var(--ink2)', border:'1px solid var(--line)', borderRadius:12 }}>
          <div style={{ fontSize:48, marginBottom:16, opacity:.4 }}>📊</div>
          <div style={{ fontFamily:'var(--syne)', fontSize:18, fontWeight:600, color:'var(--white)', marginBottom:8 }}>Aucun diagramme PERT</div>
          <div style={{ fontSize:13, color:'var(--muted)', marginBottom:24, maxWidth:480, margin:'0 auto 24px', lineHeight:1.7 }}>
            {wbsContent
              ? 'Un WBS a été trouvé pour ce projet. Cliquez "Générer depuis le WBS" pour créer automatiquement le réseau PERT avec calcul du chemin critique.'
              : 'Générez d\'abord le WBS dans l\'onglet Documents, puis revenez ici pour générer le PERT automatiquement.'
            }
          </div>
          <div style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap' }}>
            {wbsContent && (
              <button className="btn-gold" onClick={generateFromWBS} disabled={generating} style={{ fontSize:13 }}>
                {generating ? '⏳ Génération...' : '⚡ Générer le PERT depuis le WBS'}
              </button>
            )}
            <button className="btn-ghost" onClick={addTask} style={{ fontSize:13 }}>
              + Créer manuellement
            </button>
            {!wbsContent && (
              <button className="btn-ghost" onClick={() => router.push(`/projects/${id}`)} style={{ fontSize:13 }}>
                → Générer le WBS d'abord
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:10, marginBottom:16 }}>
            {[
              { label:'Tâches total',    value: tasks.length,                              color:'var(--white)'  },
              { label:'Durée projet',    value: `${projectDuration}j`,                     color:'var(--gold2)'  },
              { label:'Tâches critiques',value: computed.filter(t => t.critical).length,   color:'var(--red)'    },
              { label:'Tâches à marge',  value: computed.filter(t => t.tf > 0 && !t.critical).length, color:'var(--green)' },
              { label:'Marge max',       value: computed.length > 0 ? `${Math.max(...computed.map(t => t.tf))}j` : '—', color:'var(--cyan)' },
            ].map(k => (
              <div key={k.label} className="kpi">
                <div className="kpi-label">{k.label}</div>
                <div className="kpi-value" style={{ fontSize:20, color:k.color }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Chemin critique */}
          {criticalPath && (
            <div style={{ padding:'10px 16px', background:'rgba(224,80,80,.08)', border:'1px solid rgba(224,80,80,.25)', borderRadius:8, marginBottom:16, fontSize:12 }}>
              <span style={{ color:'var(--red)', fontWeight:600 }}>🔴 Chemin critique : </span>
              <span style={{ color:'var(--text)' }}>{criticalPath}</span>
              <span style={{ color:'var(--muted)', marginLeft:12 }}>· Durée : {projectDuration} jours ouvrés</span>
            </div>
          )}

          {/* Toggle table / diagramme */}
          <div style={{ display:'flex', gap:8, marginBottom:16, alignItems:'center' }}>
            <div style={{ display:'flex', background:'var(--ink3)', border:'1px solid var(--line2)', borderRadius:8, overflow:'hidden' }}>
              <button onClick={() => setShowTable(true)}
                style={{ padding:'7px 16px', fontSize:12, fontFamily:'var(--mono)', cursor:'pointer', border:'none', background: showTable ? 'var(--ink4)' : 'transparent', color: showTable ? 'var(--text)' : 'var(--dim)' }}>
                📋 Tableau
              </button>
              <button onClick={() => setShowTable(false)}
                style={{ padding:'7px 16px', fontSize:12, fontFamily:'var(--mono)', cursor:'pointer', border:'none', background: !showTable ? 'var(--ink4)' : 'transparent', color: !showTable ? 'var(--text)' : 'var(--dim)' }}>
                📊 Diagramme
              </button>
            </div>
            {!showTable && (
              <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                <button onClick={() => setSvgScale(s => Math.max(.4, s-.1))} style={{ padding:'5px 10px', background:'var(--ink3)', border:'1px solid var(--line2)', borderRadius:6, color:'var(--muted)', cursor:'pointer', fontSize:14 }}>−</button>
                <span style={{ fontSize:11, color:'var(--dim)', fontFamily:'var(--mono)' }}>{Math.round(svgScale*100)}%</span>
                <button onClick={() => setSvgScale(s => Math.min(2, s+.1))} style={{ padding:'5px 10px', background:'var(--ink3)', border:'1px solid var(--line2)', borderRadius:6, color:'var(--muted)', cursor:'pointer', fontSize:14 }}>+</button>
                <button onClick={() => setSvgScale(1)} style={{ padding:'5px 10px', background:'var(--ink3)', border:'1px solid var(--line2)', borderRadius:6, color:'var(--muted)', cursor:'pointer', fontSize:11, fontFamily:'var(--mono)' }}>Reset</button>
              </div>
            )}
          </div>

          {/* ── VUE TABLEAU ── */}
          {showTable && (
            <div className="card">
              <div className="card-hdr">
                <div className="card-title">📋 Tâches — Cliquer pour modifier la durée ou les dépendances</div>
                <span style={{ fontSize:10, color:'var(--dim)' }}>Le chemin critique se recalcule automatiquement</span>
              </div>
              <div style={{ overflowX:'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      {['ID','Tâche','Durée (j)','Dépendances','Responsable','EST','EFT','LST','LFT','Marge','Critique','Actions'].map(h => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {computed.map(task => (
                      <tr key={task.id} onClick={() => setSelected(selected === task.id ? null : task.id)}
                        style={{ background: task.critical ? 'rgba(224,80,80,.04)' : selected === task.id ? 'rgba(200,168,75,.04)' : '' }}>
                        <td style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--dim)' }}>{task.id}</td>
                        <td>
                          <div style={{ fontWeight:500, color: task.critical ? 'var(--red)' : 'var(--text)' }}>
                            {task.critical && '🔴 '}{task.name}
                          </div>
                        </td>
                        <td>
                          <input type="number" min={0} max={365} value={task.duration}
                            onChange={e => {
                              const dur = parseInt(e.target.value) || 0
                              setTasks(prev => prev.map(t => t.id === task.id ? { ...t, duration: dur } : t))
                            }}
                            onClick={e => e.stopPropagation()}
                            style={{ width:60, padding:'3px 6px', background:'var(--ink)', border:'1px solid var(--line2)', borderRadius:5, color:'var(--text)', fontFamily:'var(--mono)', fontSize:12 }} />
                        </td>
                        <td style={{ fontSize:11, color:'var(--dim)', fontFamily:'var(--mono)' }}>
                          {task.deps.length > 0 ? task.deps.join(', ') : '—'}
                        </td>
                        <td style={{ fontSize:11, color:'var(--muted)' }}>{task.responsible}</td>
                        <td style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--green)' }}>{task.est}</td>
                        <td style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--green)' }}>{task.eft}</td>
                        <td style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--amber)' }}>{task.lst}</td>
                        <td style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--amber)' }}>{task.lft}</td>
                        <td>
                          <span style={{ padding:'2px 8px', borderRadius:20, fontSize:10, fontWeight:600, background: task.tf === 0 ? 'rgba(224,80,80,.15)' : 'rgba(45,184,138,.1)', color: task.tf === 0 ? 'var(--red)' : 'var(--green)' }}>
                            {task.tf}j
                          </span>
                        </td>
                        <td style={{ textAlign:'center' }}>
                          {task.critical ? <span style={{ color:'var(--red)', fontSize:14 }}>🔴</span> : <span style={{ color:'var(--green)', fontSize:12 }}>✓</span>}
                        </td>
                        <td onClick={e => e.stopPropagation()}>
                          <div style={{ display:'flex', gap:4 }}>
                            <button onClick={() => setEditTask(task)}
                              style={{ padding:'3px 8px', background:'var(--ink3)', border:'1px solid var(--line2)', borderRadius:5, cursor:'pointer', fontSize:10, color:'var(--muted)', fontFamily:'var(--mono)' }}>✎</button>
                            <button onClick={() => deleteTask(task.id)}
                              style={{ padding:'3px 8px', background:'rgba(224,80,80,.1)', border:'1px solid rgba(224,80,80,.2)', borderRadius:5, cursor:'pointer', fontSize:10, color:'var(--red)' }}>🗑</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── VUE DIAGRAMME SVG ── */}
          {!showTable && (
            <div style={{ background:'var(--ink2)', border:'1px solid var(--line)', borderRadius:12, overflow:'auto', position:'relative' }}>
              <div style={{ padding:8, borderBottom:'1px solid var(--line)', fontSize:11, color:'var(--dim)', display:'flex', gap:16, alignItems:'center' }}>
                <span style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <span style={{ width:12, height:12, borderRadius:2, background:'rgba(224,80,80,.3)', border:'2px solid var(--red)', display:'inline-block' }}></span>
                  Chemin critique (marge = 0)
                </span>
                <span style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <span style={{ width:12, height:12, borderRadius:2, background:'var(--ink4)', border:'2px solid var(--line2)', display:'inline-block' }}></span>
                  Tâches non critiques
                </span>
                <span style={{ color:'var(--dim)' }}>· Cliquer sur un nœud pour le sélectionner</span>
              </div>

              <div style={{ overflowX:'auto', overflowY:'auto', maxHeight:'60vh' }}>
                <svg
                  width={svgWidth * svgScale}
                  height={svgHeight * svgScale}
                  viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                  style={{ display:'block', fontFamily:'var(--mono)' }}
                >
                  <defs>
                    <marker id="arrow-normal" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                      <polygon points="0 0, 10 3.5, 0 7" fill="#363648" />
                    </marker>
                    <marker id="arrow-critical" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                      <polygon points="0 0, 10 3.5, 0 7" fill="#E05050" />
                    </marker>
                    <marker id="arrow-selected" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                      <polygon points="0 0, 10 3.5, 0 7" fill="#C8A84B" />
                    </marker>
                    <filter id="glow-red">
                      <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                      <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
                    </filter>
                    <filter id="glow-gold">
                      <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                      <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
                    </filter>
                  </defs>

                  {/* Flèches de dépendances */}
                  {computed.map(task => task.deps.map(depId => {
                    const from = positions[depId]
                    const to   = positions[task.id]
                    if (!from || !to) return null
                    const depTask = computed.find(t => t.id === depId)
                    const isCriticalEdge = task.critical && depTask?.critical

                    const x1 = from.x + NODE_W
                    const y1 = from.y + NODE_H / 2
                    const x2 = to.x
                    const y2 = to.y + NODE_H / 2
                    const cx = (x1 + x2) / 2

                    const isSelected = selected === task.id || selected === depId
                    const strokeColor = isCriticalEdge ? '#E05050' : isSelected ? '#C8A84B' : '#363648'
                    const markerId = isCriticalEdge ? 'arrow-critical' : isSelected ? 'arrow-selected' : 'arrow-normal'

                    // Label de durée sur l'arête
                    const midX = cx
                    const midY = (y1 + y2) / 2

                    return (
                      <g key={`${depId}-${task.id}`}>
                        <path
                          d={`M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`}
                          fill="none"
                          stroke={strokeColor}
                          strokeWidth={isCriticalEdge ? 2.5 : 1.5}
                          strokeDasharray={isCriticalEdge ? 'none' : 'none'}
                          markerEnd={`url(#${markerId})`}
                          filter={isCriticalEdge ? 'url(#glow-red)' : 'none'}
                          opacity={.85}
                        />
                      </g>
                    )
                  }))}

                  {/* Nœuds */}
                  {computed.map(task => {
                    const pos = positions[task.id]
                    if (!pos) return null
                    const isSelected = selected === task.id
                    const cfg = task.critical ? COLORS.critical : isSelected ? COLORS.selected : COLORS.normal
                    const marginLabel = task.tf === 0 ? 'Critique' : `Marge: ${task.tf}j`

                    return (
                      <g key={task.id} style={{ cursor:'pointer' }}
                        onClick={() => setSelected(isSelected ? null : task.id)}>
                        {/* Ombre */}
                        <rect x={pos.x+2} y={pos.y+2} width={NODE_W} height={NODE_H} rx={8} fill="rgba(0,0,0,.4)" />
                        {/* Corps */}
                        <rect x={pos.x} y={pos.y} width={NODE_W} height={NODE_H} rx={8}
                          fill={cfg.fill} stroke={cfg.stroke} strokeWidth={task.critical ? 2 : 1.5}
                          filter={task.critical ? 'url(#glow-red)' : isSelected ? 'url(#glow-gold)' : 'none'} />

                        {/* Ligne de séparation haut */}
                        <rect x={pos.x} y={pos.y} width={NODE_W} height={22} rx={8} fill={task.critical ? 'rgba(224,80,80,.3)' : isSelected ? 'rgba(200,168,75,.2)' : 'rgba(255,255,255,.04)'} />
                        <rect x={pos.x} y={pos.y+14} width={NODE_W} height={8} fill={task.critical ? 'rgba(224,80,80,.3)' : isSelected ? 'rgba(200,168,75,.2)' : 'rgba(255,255,255,.04)'} />

                        {/* ID */}
                        <text x={pos.x+8} y={pos.y+14} fontSize={9} fill={cfg.stroke} fontWeight={700} letterSpacing={1}>{task.id}</text>
                        {/* Durée */}
                        <text x={pos.x+NODE_W-8} y={pos.y+14} fontSize={9} fill={cfg.stroke} fontWeight={700} textAnchor="end">{task.duration}j</text>

                        {/* Nom de la tâche */}
                        <text x={pos.x+NODE_W/2} y={pos.y+38} fontSize={10} fill={cfg.text} fontWeight={500} textAnchor="middle">
                          {task.name.length > 20 ? task.name.slice(0,18)+'…' : task.name}
                        </text>

                        {/* EST | EFT */}
                        <text x={pos.x+12} y={pos.y+54} fontSize={9} fill="#4A9EF0" textAnchor="start">↑{task.est}</text>
                        <text x={pos.x+NODE_W/2} y={pos.y+54} fontSize={9} fill={task.tf === 0 ? '#FF8080' : '#8A8AA8'} textAnchor="middle">{marginLabel}</text>
                        <text x={pos.x+NODE_W-12} y={pos.y+54} fontSize={9} fill="#4A9EF0" textAnchor="end">{task.eft}↓</text>

                        {/* LST | LFT */}
                        <text x={pos.x+12} y={pos.y+68} fontSize={9} fill="#F0A832" textAnchor="start">↑{task.lst}</text>
                        <text x={pos.x+NODE_W/2} y={pos.y+68} fontSize={9} fill="#8A8AA8" textAnchor="middle">{task.responsible}</text>
                        <text x={pos.x+NODE_W-12} y={pos.y+68} fontSize={9} fill="#F0A832" textAnchor="end">{task.lft}↓</text>
                      </g>
                    )
                  })}
                </svg>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── MODAL ÉDITION TÂCHE ── */}
      {editTask && (
        <div className="modal-overlay" onClick={() => setEditTask(null)}>
          <div className="modal" style={{ width:520 }} onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <div style={{ fontFamily:'var(--syne)', fontSize:16, fontWeight:700, color:'var(--white)' }}>
                Modifier la tâche — {editTask.id}
              </div>
              <button onClick={() => setEditTask(null)} style={{ background:'none', border:'none', color:'var(--dim)', cursor:'pointer', fontSize:20 }}>×</button>
            </div>

            <div className="fg">
              <label className="fl">Nom de la tâche</label>
              <input className="fi" value={editTask.name} onChange={e => setEditTask({...editTask, name:e.target.value})} />
            </div>
            <div className="grid-2">
              <div className="fg">
                <label className="fl">Durée (jours ouvrés)</label>
                <input className="fi" type="number" min={0} value={editTask.duration} onChange={e => setEditTask({...editTask, duration:parseInt(e.target.value)||0})} />
              </div>
              <div className="fg">
                <label className="fl">Responsable</label>
                <input className="fi" value={editTask.responsible} onChange={e => setEditTask({...editTask, responsible:e.target.value})} />
              </div>
            </div>
            <div className="fg">
              <label className="fl">Dépendances (IDs séparés par des virgules)</label>
              <input className="fi" placeholder="ex: T1, T2, T3" value={editTask.deps.join(', ')}
                onChange={e => setEditTask({...editTask, deps: e.target.value.split(',').map(s=>s.trim()).filter(Boolean)})} />
              <div style={{ fontSize:10, color:'var(--dim)', marginTop:4 }}>
                IDs disponibles : {tasks.filter(t => t.id !== editTask.id).map(t => t.id).join(', ')}
              </div>
            </div>

            <div style={{ display:'flex', gap:10, marginTop:8 }}>
              <button className="btn-gold" onClick={() => updateTask(editTask)}>Mettre à jour</button>
              <button className="btn-ghost" onClick={() => setEditTask(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
