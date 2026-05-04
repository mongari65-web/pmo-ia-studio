'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AppLayout from '@/components/layout/AppLayout'

interface MindNode {
  id: string
  label: string
  icon?: string
  notes?: string
  children?: MindNode[]
}

const BRANCH_COLORS = [
  '#D4A84B','#5AAEF8','#35C890','#F06060',
  '#8B7EF8','#F5B840','#3ACFCF','#F07840',
]

function collectAll(node: MindNode, result: MindNode[] = []): MindNode[] {
  result.push(node)
  node.children?.forEach(c => collectAll(c, result))
  return result
}

function computePositions(
  node: MindNode, x: number, y: number,
  angle: number, span: number, depth: number, color: string,
  pos: Record<string, { x: number; y: number; color: string; depth: number; parentId?: string }>
) {
  pos[node.id] = { x, y, color, depth }
  if (!node.children?.length) return
  const radii = [0, 230, 400, 530]
  const r = radii[Math.min(depth + 1, 3)]
  const start = angle - span / 2
  const step = span / Math.max(node.children.length, 1)
  node.children.forEach((child, i) => {
    const a = start + step * i + step / 2
    const cx = x + Math.cos(a * Math.PI / 180) * r
    const cy = y + Math.sin(a * Math.PI / 180) * r
    const cc = depth === 0 ? BRANCH_COLORS[i % BRANCH_COLORS.length] : color
    pos[child.id] = { ...pos[child.id], parentId: node.id }
    computePositions(child, cx, cy, a, step * 0.85, depth + 1, cc, pos)
  })
}

function extractJSON(text: string): any {
  const clean = text.replace(/```json/gi, '').replace(/```/g, '').trim()
  const obj = clean.match(/\{[\s\S]*\}/)
  if (obj) return JSON.parse(obj[0])
  throw new Error('Format JSON non trouve')
}

export default function MindMapPage() {
  const [mindMap, setMindMap] = useState<MindNode | null>(null)
  const [project, setProject] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [genMsg, setGenMsg] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [editingNode, setEditingNode] = useState<MindNode | null>(null)
  const [scale, setScale] = useState(0.8)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  const params = useParams()
  const router = useRouter()
  const supabase = createClient()
  const id = params.id as string
  const CX = 580
  const CY = 420

  useEffect(() => { loadData() }, [id])

  async function loadData() {
    const { data: proj } = await supabase.from('projects').select('*').eq('id', id).single()
    setProject(proj)
    const { data: docs } = await supabase.from('documents')
      .select('content').eq('project_id', id).eq('doc_type', 'mindmap')
      .order('created_at', { ascending: false }).limit(1)
    if (docs?.[0]) { try { setMindMap(JSON.parse(docs[0].content)) } catch {} }
    setLoading(false)
  }

  async function saveMindMap(mm: MindNode) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('documents').upsert({
      project_id: id, user_id: user.id,
      doc_type: 'mindmap', title: 'Mind Map — ' + (project?.name || ''),
      content: JSON.stringify(mm), status: 'generated',
    }, { onConflict: 'project_id,doc_type' })
  }

  async function generateMindMap() {
    setGenerating(true)
    setGenMsg('Generation du Mind Map par Claude...')
    const ctx = project?.context || {}
    const prompt = 'Tu es un expert PMI/PMBOK 7. Genere un Mind Map complet pour ce projet.\n\nPROJET : ' + project?.name + '\nTYPE : ' + project?.project_type + '\nSECTEUR : ' + (project?.sector || 'IT') + '\nCLIENT : ' + (ctx.client_name || '') + '\nBUDGET : ' + (project?.budget || '') + '\nDUREE : ' + (project?.duration || '') + '\nCONTRAINTES : ' + (ctx.constraints?.join(', ') || '') + '\n\nReponds UNIQUEMENT avec ce JSON valide :\n{\n  "id": "root",\n  "label": "' + project?.name + '",\n  "icon": "\\ud83c\\udfaf",\n  "children": [\n    {"id":"obj","label":"Objectifs","icon":"\\ud83c\\udfaf","children":[{"id":"obj1","label":"Objectif principal","icon":"\\u25b6","notes":"","children":[]},{"id":"obj2","label":"Objectifs secondaires","icon":"\\u25b6","notes":"","children":[]},{"id":"obj3","label":"Criteres de succes","icon":"\\u2713","notes":"","children":[]},{"id":"obj4","label":"Benefices attendus","icon":"\\ud83d\\udca1","notes":"","children":[]}]},\n    {"id":"scope","label":"Perimetre","icon":"\\ud83d\\udccb","children":[{"id":"sc1","label":"IN scope principal","icon":"\\u2713","notes":"","children":[]},{"id":"sc2","label":"IN scope secondaire","icon":"\\u2713","notes":"","children":[]},{"id":"sc3","label":"OUT of scope","icon":"\\u2717","notes":"","children":[]},{"id":"sc4","label":"Hypotheses cles","icon":"\\ud83d\\udca1","notes":"","children":[]}]},\n    {"id":"team","label":"Equipe","icon":"\\ud83d\\udc65","children":[{"id":"t1","label":"Chef de Projet","icon":"\\ud83d\\udc64","notes":"","children":[]},{"id":"t2","label":"Architecte technique","icon":"\\ud83d\\udc64","notes":"","children":[]},{"id":"t3","label":"Developpeurs","icon":"\\ud83d\\udc65","notes":"","children":[]},{"id":"t4","label":"MOA / Sponsor","icon":"\\ud83d\\udc54","notes":"","children":[]},{"id":"t5","label":"Prestataire externe","icon":"\\ud83e\\udd1d","notes":"","children":[]}]},\n    {"id":"budget","label":"Budget","icon":"\\ud83d\\udcb0","children":[{"id":"b1","label":"Budget total","icon":"\\ud83d\\udcb6","notes":"","children":[]},{"id":"b2","label":"Couts infrastructure","icon":"\\ud83d\\udda5","notes":"","children":[]},{"id":"b3","label":"Couts RH","icon":"\\ud83d\\udc65","notes":"","children":[]},{"id":"b4","label":"Reserve aleas 10%","icon":"\\ud83d\\udee1","notes":"","children":[]}]},\n    {"id":"planning","label":"Planning","icon":"\\ud83d\\udcc5","children":[{"id":"p1","label":"Phase 1 - Cadrage","icon":"\\u25b6","notes":"","children":[]},{"id":"p2","label":"Phase 2 - Realisation","icon":"\\u25b6","notes":"","children":[]},{"id":"p3","label":"Phase 3 - Recette","icon":"\\u25b6","notes":"","children":[]},{"id":"p4","label":"GO-LIVE","icon":"\\ud83d\\ude80","notes":"","children":[]},{"id":"p5","label":"Date fin prevue","icon":"\\ud83c\\udfc1","notes":"","children":[]}]},\n    {"id":"risks","label":"Risques","icon":"\\u26a0\\ufe0f","children":[{"id":"r1","label":"Risque technique","icon":"\\ud83d\\udd34","notes":"","children":[]},{"id":"r2","label":"Risque planning","icon":"\\ud83d\\udfe0","notes":"","children":[]},{"id":"r3","label":"Risque budget","icon":"\\ud83d\\udfe1","notes":"","children":[]},{"id":"r4","label":"Dependances critiques","icon":"\\ud83d\\udd17","notes":"","children":[]}]},\n    {"id":"deliverables","label":"Livrables","icon":"\\ud83d\\udce6","children":[{"id":"d1","label":"Livrable technique 1","icon":"\\ud83d\\udcc4","notes":"","children":[]},{"id":"d2","label":"Livrable technique 2","icon":"\\ud83d\\udcc4","notes":"","children":[]},{"id":"d3","label":"Documentation","icon":"\\ud83d\\udcda","notes":"","children":[]},{"id":"d4","label":"Formation utilisateurs","icon":"\\ud83c\\udf93","notes":"","children":[]},{"id":"d5","label":"Rapport de recette","icon":"\\u2705","notes":"","children":[]}]},\n    {"id":"stakeholders","label":"Parties prenantes","icon":"\\ud83e\\udd1d","children":[{"id":"s1","label":"Sponsor / MOA","icon":"\\ud83d\\udc54","notes":"","children":[]},{"id":"s2","label":"Equipes metier","icon":"\\ud83d\\udc65","notes":"","children":[]},{"id":"s3","label":"DSI / IT","icon":"\\ud83d\\udcbb","notes":"","children":[]},{"id":"s4","label":"Prestataires","icon":"\\ud83c\\udfe2","notes":"","children":[]},{"id":"s5","label":"Utilisateurs finaux","icon":"\\ud83d\\udc64","notes":"","children":[]}]}\n  ]\n}'

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, maxTokens: 4000 })
      })
      const data = await res.json()
      const parsed = extractJSON(data.text || '')
      setMindMap(parsed)
      await saveMindMap(parsed)
      setGenMsg('Mind Map genere !')
    } catch (e: any) {
      setGenMsg('Erreur : ' + e.message)
    }
    setGenerating(false)
    setTimeout(() => setGenMsg(''), 5000)
  }

  function findAndUpdate(node: MindNode, targetId: string, updated: Partial<MindNode>): MindNode {
    if (node.id === targetId) return { ...node, ...updated }
    return { ...node, children: node.children?.map(c => findAndUpdate(c, targetId, updated)) }
  }

  function saveNodeEdit() {
    if (!editingNode || !mindMap) return
    const updated = findAndUpdate(mindMap, editingNode.id, {
      label: editingNode.label,
      icon: editingNode.icon,
      notes: editingNode.notes,
    })
    setMindMap(updated)
    saveMindMap(updated)
    setEditingNode(null)
  }

  function addChild(parentId: string) {
    if (!mindMap) return
    const newNode: MindNode = { id: 'n' + Date.now(), label: 'Nouveau noeud', icon: '\u25b6', notes: '', children: [] }
    function addTo(node: MindNode): MindNode {
      if (node.id === parentId) return { ...node, children: [...(node.children || []), newNode] }
      return { ...node, children: node.children?.map(addTo) }
    }
    const updated = addTo(mindMap)
    setMindMap(updated)
    saveMindMap(updated)
    setEditingNode({ ...newNode })
  }

  function deleteNode(nodeId: string) {
    if (!mindMap || nodeId === 'root') return
    function removeFrom(node: MindNode): MindNode {
      return { ...node, children: node.children?.filter(c => c.id !== nodeId).map(removeFrom) }
    }
    const updated = removeFrom(mindMap)
    setMindMap(updated)
    saveMindMap(updated)
    setSelected(null)
  }

  function exportPDF() {
    if (!mindMap || !project) return
    const branches = mindMap.children || []
    const html = '<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Mind Map - ' + project.name + '</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;color:#1A1A28}.cover{min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;background:#13131A;color:white;text-align:center;padding:60px;page-break-after:always}.cover-title{font-size:32px;font-weight:700;margin-bottom:10px}.cover-sub{font-size:16px;color:#A8A8C8}.page{padding:44px 48px;page-break-after:always}.page-hdr{border-bottom:3px solid #D4A84B;padding-bottom:14px;margin-bottom:28px}.branch-title{font-size:20px;font-weight:700;color:#1A1A28}.items{display:grid;grid-template-columns:1fr 1fr;gap:12px}.item{padding:14px;border:1.5px solid #E8E4D8;border-radius:10px}.item-label{font-size:13px;font-weight:600;color:#1A1A28;margin-bottom:4px}.item-notes{font-size:11px;color:#7A7A9A}@media print{body{-webkit-print-color-adjust:exact}}</style></head><body>'
      + '<div class="cover"><div style="font-size:52px;margin-bottom:16px">\ud83e\udde0</div><div class="cover-title">Mind Map</div><div class="cover-sub">' + project.name + '</div></div>'
      + branches.map((branch: MindNode, i: number) =>
        '<div class="page"><div class="page-hdr"><div style="font-size:22px">' + (branch.icon || '') + '</div><div class="branch-title">' + branch.label + '</div></div><div class="items">'
        + (branch.children || []).map((item: MindNode) =>
          '<div class="item"><div class="item-label">' + (item.icon || '') + ' ' + item.label + '</div>' + (item.notes ? '<div class="item-notes">' + item.notes + '</div>' : '') + '</div>'
        ).join('')
        + '</div></div>'
      ).join('')
      + '</body></html>'
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const win = window.open(url, '_blank')
    if (win) win.onload = () => setTimeout(() => win.print(), 800)
  }

  function onMouseDown(e: React.MouseEvent) {
    if ((e.target as SVGElement).tagName === 'svg') {
      setDragging(true)
      setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y })
    }
  }
  function onMouseMove(e: React.MouseEvent) {
    if (dragging) setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y })
  }
  function onMouseUp() { setDragging(false) }

  const positions: Record<string, { x: number; y: number; color: string; depth: number; parentId?: string }> = {}
  if (mindMap) computePositions(mindMap, CX, CY, 0, 360, 0, '#D4A84B', positions)
  const allNodes = mindMap ? collectAll(mindMap) : []
  const selectedNode = selected ? allNodes.find(n => n.id === selected) : null

  const navTabs = [
    { label: '📄 Documents', href: '/projects/' + id },
    { label: '⚠ RAID', href: '/projects/' + id + '/raid' },
    { label: '📅 Jalons', href: '/projects/' + id + '/jalons' },
    { label: '📊 PERT', href: '/projects/' + id + '/pert' },
    { label: '🧠 Mind Map', href: '/projects/' + id + '/mindmap' },
  ]
  const activeHref = '/projects/' + id + '/mindmap'

  if (loading) {
    return (
      <AppLayout>
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>Chargement...</div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <button onClick={() => router.push('/projects/' + id)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}>← Projet</button>
            <span style={{ color: 'var(--dim)' }}>›</span>
            <span style={{ fontSize: 12, color: 'var(--dim)' }}>{project?.name}</span>
          </div>
          <div className="sec-label">// Visualisation</div>
          <h1 className="sec-title" style={{ marginBottom: 4 }}>🧠 Mind Map du projet</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {mindMap && (
            <>
              <button onClick={exportPDF} className="btn-ghost" style={{ fontSize: 12 }}>🖨 PDF</button>
              <button onClick={() => { if (selected) addChild(selected) }} className="btn-ghost"
                style={{ fontSize: 12, opacity: selected ? 1 : 0.5 }} disabled={!selected}>
                + Enfant
              </button>
              <button onClick={() => { if (selected && selected !== 'root') deleteNode(selected) }}
                className="btn-ghost"
                style={{ fontSize: 12, color: 'var(--red)', opacity: selected && selected !== 'root' ? 1 : 0.4 }}
                disabled={!selected || selected === 'root'}>
                🗑 Supprimer
              </button>
            </>
          )}
          <button onClick={generateMindMap} className="btn-gold" disabled={generating} style={{ fontSize: 12 }}>
            {generating ? '⏳ Génération...' : mindMap ? '🔄 Regénérer' : '⚡ Générer'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, borderBottom: '1px solid var(--line)', paddingBottom: 12 }}>
        {navTabs.map(tab => (
          <button key={tab.href} onClick={() => router.push(tab.href)}
            style={{ padding: '7px 16px', fontSize: 12, cursor: 'pointer', borderRadius: 8, border: '1px solid var(--line2)', background: tab.href === activeHref ? 'rgba(212,168,75,.15)' : 'transparent', color: tab.href === activeHref ? 'var(--gold2)' : 'var(--muted)', fontWeight: tab.href === activeHref ? 600 : 400, transition: 'all .12s', fontFamily: 'var(--mono)' }}>
            {tab.label}
          </button>
        ))}
      </div>

      {genMsg && (
        <div style={{ padding: '10px 16px', borderRadius: 9, background: genMsg.includes('Erreur') ? 'rgba(240,96,96,.08)' : 'rgba(53,200,144,.08)', border: '1px solid ' + (genMsg.includes('Erreur') ? 'var(--red)' : 'var(--green)'), fontSize: 12, color: genMsg.includes('Erreur') ? 'var(--red)' : 'var(--green)', marginBottom: 16 }}>
          {genMsg}
        </div>
      )}

      {!mindMap ? (
        <div style={{ textAlign: 'center', padding: '80px 20px', background: 'var(--ink2)', border: '1.5px solid var(--line)', borderRadius: 14 }}>
          <div style={{ fontSize: 64, marginBottom: 20, opacity: 0.4 }}>🧠</div>
          <div style={{ fontFamily: 'var(--syne)', fontSize: 22, fontWeight: 700, color: 'var(--white)', marginBottom: 12 }}>Aucun Mind Map</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 28, maxWidth: 520, margin: '0 auto 28px', lineHeight: 1.8 }}>
            Générez un Mind Map visuel avec 8 branches principales personnalisées selon le contexte de votre projet.
          </div>
          <button className="btn-gold" onClick={generateMindMap} disabled={generating} style={{ fontSize: 14 }}>
            {generating ? '⏳ Génération en cours...' : '⚡ Générer le Mind Map'}
          </button>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {mindMap.children?.map((b, i) => (
                <div key={b.id} onClick={() => setSelected(b.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, background: BRANCH_COLORS[i % BRANCH_COLORS.length] + '18', border: '1px solid ' + BRANCH_COLORS[i % BRANCH_COLORS.length] + '44', fontSize: 11, color: BRANCH_COLORS[i % BRANCH_COLORS.length], cursor: 'pointer' }}>
                  {b.icon} {b.label}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button onClick={() => setScale(s => Math.max(0.3, s - 0.1))} style={{ padding: '5px 11px', background: 'var(--ink3)', border: '1px solid var(--line2)', borderRadius: 6, color: 'var(--muted)', cursor: 'pointer', fontSize: 16 }}>−</button>
              <span style={{ fontSize: 11, color: 'var(--dim)', padding: '5px 10px', background: 'var(--ink3)', border: '1px solid var(--line2)', borderRadius: 6 }}>{Math.round(scale * 100)}%</span>
              <button onClick={() => setScale(s => Math.min(2, s + 0.1))} style={{ padding: '5px 11px', background: 'var(--ink3)', border: '1px solid var(--line2)', borderRadius: 6, color: 'var(--muted)', cursor: 'pointer', fontSize: 16 }}>+</button>
              <button onClick={() => { setScale(0.8); setOffset({ x: 0, y: 0 }) }} style={{ padding: '5px 11px', background: 'var(--ink3)', border: '1px solid var(--line2)', borderRadius: 6, color: 'var(--muted)', cursor: 'pointer', fontSize: 11 }}>Reset</button>
              <span style={{ fontSize: 11, color: 'var(--dim)' }}>· Double-clic pour éditer</span>
            </div>
          </div>

          <div style={{ background: 'var(--ink2)', border: '1.5px solid var(--line)', borderRadius: 14, overflow: 'hidden', cursor: dragging ? 'grabbing' : 'grab', userSelect: 'none', height: '60vh' }}>
            <svg width="100%" height="100%" viewBox="0 0 1160 840" style={{ display: 'block' }}
              onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>
              <defs>
                <radialGradient id="bg-mm" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#1C1C28" />
                  <stop offset="100%" stopColor="#13131A" />
                </radialGradient>
                <pattern id="dots-mm" width="30" height="30" patternUnits="userSpaceOnUse">
                  <circle cx="1" cy="1" r="1" fill="rgba(255,255,255,.04)" />
                </pattern>
                <filter id="glow-mm">
                  <feGaussianBlur stdDeviation="3" result="b" />
                  <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
                <filter id="shadow-mm">
                  <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="rgba(0,0,0,.5)" />
                </filter>
              </defs>
              <rect width="1160" height="840" fill="url(#bg-mm)" />
              <rect width="1160" height="840" fill="url(#dots-mm)" />
              <g transform={'translate(' + offset.x + ',' + offset.y + ') scale(' + scale + ') translate(' + ((1 - scale) * CX / scale) + ',' + ((1 - scale) * CY / scale) + ')'}>
                {allNodes.map(node => {
                  const pos = positions[node.id]
                  if (!pos?.parentId) return null
                  const pp = positions[pos.parentId]
                  if (!pp) return null
                  const isSel = selected === node.id || selected === pos.parentId
                  const w = pos.depth === 1 ? 3 : pos.depth === 2 ? 2 : 1.2
                  const opacity = selected && !isSel ? 0.15 : 0.75
                  return (
                    <line key={'l-' + node.id}
                      x1={pp.x} y1={pp.y} x2={pos.x} y2={pos.y}
                      stroke={pos.color} strokeWidth={w} opacity={opacity} strokeLinecap="round" />
                  )
                })}
                {allNodes.map(node => {
                  const pos = positions[node.id]
                  if (!pos) return null
                  const isRoot = node.id === 'root'
                  const isSel = selected === node.id
                  const isD1 = pos.depth === 1
                  const isD2 = pos.depth === 2
                  const opacity = selected && !isSel && selected !== pos.parentId ? 0.5 : 1
                  const W = isRoot ? 170 : isD1 ? 140 : 115
                  const H = isRoot ? 52 : isD1 ? 38 : 30
                  const fs = isRoot ? 14 : isD1 ? 11.5 : 10
                  const maxLen = isRoot ? 22 : isD1 ? 18 : 15
                  const label = node.label.length > maxLen ? node.label.slice(0, maxLen - 1) + '…' : node.label
                  const fill = isRoot ? 'rgba(212,168,75,.2)' : isSel ? pos.color + '33' : isD1 ? pos.color + '18' : 'rgba(28,28,38,.95)'
                  const stroke = isRoot ? '#D4A84B' : (isSel || isD1) ? pos.color : '#454560'
                  const sw = isRoot ? 2.5 : isSel ? 2 : isD1 ? 1.8 : 1
                  return (
                    <g key={node.id} style={{ cursor: 'pointer' }} opacity={opacity}
                      onClick={e => { e.stopPropagation(); setSelected(isSel ? null : node.id) }}
                      onDoubleClick={e => { e.stopPropagation(); setEditingNode({ ...node }) }}>
                      <rect x={pos.x - W / 2} y={pos.y - H / 2} width={W} height={H} rx={isRoot ? 10 : 6}
                        fill={fill} stroke={stroke} strokeWidth={sw}
                        filter={isRoot || isSel ? 'url(#glow-mm)' : 'url(#shadow-mm)'} />
                      {node.icon && (isRoot || isD1) && (
                        <text x={pos.x - W / 2 + 8} y={pos.y + 4} fontSize={isRoot ? 16 : 13} textAnchor="start">{node.icon}</text>
                      )}
                      <text x={pos.x + (node.icon && (isRoot || isD1) ? 8 : 0)} y={pos.y + 4}
                        fontSize={fs} fill={isRoot ? '#D4A84B' : isD1 ? pos.color : '#E8E8F8'}
                        fontWeight={isRoot ? 800 : isD1 ? 600 : 400} textAnchor="middle" fontFamily="Inter,sans-serif">
                        {label}
                      </text>
                      {node.notes && isD2 && (
                        <circle cx={pos.x + W / 2 - 5} cy={pos.y - H / 2 + 5} r={4} fill={pos.color} opacity={0.7} />
                      )}
                    </g>
                  )
                })}
              </g>
            </svg>
          </div>

          {selectedNode && (
            <div style={{ marginTop: 12, padding: '14px 18px', background: 'var(--ink2)', border: '1.5px solid ' + (positions[selectedNode.id]?.color || 'var(--line)'), borderRadius: 12, display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <span style={{ fontSize: 24, flexShrink: 0 }}>{selectedNode.icon || '●'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--white)', marginBottom: 4 }}>{selectedNode.label}</div>
                {selectedNode.notes && <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 8 }}>{selectedNode.notes}</div>}
                {selectedNode.children && selectedNode.children.length > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--dim)' }}>
                    Sous-elements : {selectedNode.children.map(c => (c.icon || '') + ' ' + c.label).join(' · ')}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button onClick={() => setEditingNode({ ...selectedNode })}
                  style={{ padding: '6px 12px', background: 'var(--ink3)', border: '1px solid var(--line2)', borderRadius: 7, cursor: 'pointer', fontSize: 11, color: 'var(--muted)' }}>
                  ✎ Modifier
                </button>
                <button onClick={() => addChild(selectedNode.id)}
                  style={{ padding: '6px 12px', background: 'rgba(53,200,144,.1)', border: '1px solid rgba(53,200,144,.3)', borderRadius: 7, cursor: 'pointer', fontSize: 11, color: 'var(--green)' }}>
                  + Enfant
                </button>
                {selectedNode.id !== 'root' && (
                  <button onClick={() => deleteNode(selectedNode.id)}
                    style={{ padding: '6px 12px', background: 'rgba(240,96,96,.1)', border: '1px solid rgba(240,96,96,.3)', borderRadius: 7, cursor: 'pointer', fontSize: 11, color: 'var(--red)' }}>
                    🗑
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {editingNode && (
        <div className="modal-overlay" onClick={() => setEditingNode(null)}>
          <div className="modal" style={{ width: 480 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ fontFamily: 'var(--syne)', fontSize: 16, fontWeight: 700, color: 'var(--white)' }}>✎ Modifier le noeud</div>
              <button onClick={() => setEditingNode(null)} style={{ background: 'none', border: 'none', color: 'var(--dim)', cursor: 'pointer', fontSize: 22 }}>×</button>
            </div>
            <div className="fg">
              <label className="fl">Icone (emoji)</label>
              <input className="fi" value={editingNode.icon || ''} onChange={e => setEditingNode({ ...editingNode, icon: e.target.value })} placeholder="🎯 📋 💰..." style={{ fontSize: 18 }} />
            </div>
            <div className="fg">
              <label className="fl">Libelle *</label>
              <input className="fi" value={editingNode.label} onChange={e => setEditingNode({ ...editingNode, label: e.target.value })} placeholder="Nom du noeud..." />
            </div>
            <div className="fg">
              <label className="fl">Notes / Description</label>
              <textarea className="fi" rows={3} value={editingNode.notes || ''} onChange={e => setEditingNode({ ...editingNode, notes: e.target.value })} placeholder="Details, contexte..." style={{ resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-gold" onClick={saveNodeEdit}>Sauvegarder</button>
              <button className="btn-ghost" onClick={() => setEditingNode(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
