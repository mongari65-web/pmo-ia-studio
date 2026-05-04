'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AppLayout from '@/components/layout/AppLayout'
import ExportToolbar from '@/components/ui/ExportToolbar'

interface WorkPackage {
  id: string
  numero: string
  titre: string
  responsable: string
  statut: 'draft'|'actif'|'termine'|'suspendu'
  priorite: 'haute'|'moyenne'|'faible'
  objectif: string
  livrables: string[]
  taches: string[]
  ressources: string[]
  budget: string
  risques: string[]
  date_debut: string
  date_fin: string
  avancement: number
}

const NAV = ['Documents','WBS Dict','RAID','Jalons','PERT','Mind Map','Budget EVM','Gantt','Work Packages']
const NAV_ICONS: Record<string,string> = {'Documents':'📄','WBS Dict':'📚','RAID':'⚠','Jalons':'📅','PERT':'📊','Mind Map':'🧠','Budget EVM':'💰','Gantt':'📅','Work Packages':'📦'}
function navHref(label: string, id: string): string {
  const m: Record<string,string> = {'Documents':'/projects/'+id,'WBS Dict':'/projects/'+id+'/wbs-dict','RAID':'/projects/'+id+'/raid','Jalons':'/projects/'+id+'/jalons','PERT':'/projects/'+id+'/pert','Mind Map':'/projects/'+id+'/mindmap','Budget EVM':'/projects/'+id+'/budget','Gantt':'/projects/'+id+'/gantt','Work Packages':'/projects/'+id+'/workpackages'}
  return m[label]||'/projects/'+id
}

const STATUT_COLORS: Record<string,string> = {draft:'var(--dim)',actif:'var(--green)',termine:'var(--cyan)',suspendu:'var(--amber)'}
const PRIO_COLORS: Record<string,string> = {haute:'var(--red)',moyenne:'var(--amber)',faible:'var(--green)'}

const EMPTY_WP = (): WorkPackage => ({
  id:'WP'+Date.now(), numero:'WP'+(Math.floor(Math.random()*90)+10),
  titre:'Nouveau Work Package', responsable:'', statut:'draft', priorite:'moyenne',
  objectif:'', livrables:[''], taches:[''], ressources:[''], budget:'',
  risques:[''], date_debut:'', date_fin:'', avancement:0,
})

export default function WorkPackagesPage() {
  const [wps, setWps] = useState<WorkPackage[]>([])
  const [project, setProject] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [genMsg, setGenMsg] = useState('')
  const [loadErr, setLoadErr] = useState('')
  const [selected, setSelected] = useState<string|null>(null)
  const [view, setView] = useState<'grid'|'detail'>('grid')
  const [wbsContent, setWbsContent] = useState('')
  const [history, setHistory] = useState<any[]>([])
  const [showHistory, setShowHistory] = useState(false)

  const params = useParams(); const router = useRouter()
  const supabase = createClient(); const id = params.id as string

  useEffect(()=>{loadData()},[id])

  async function loadData() {
    try {
    const {data:proj} = await supabase.from('projects').select('*').eq('id',id).single()
    setProject(proj)
    // Load WBS content - strict filter, sanitize content
    const {data:wbs} = await supabase.from('documents').select('content')
      .eq('project_id',id).eq('doc_type','wbs')
      .order('created_at',{ascending:false}).limit(1)
    if(wbs?.[0]?.content) {
      // Only keep safe text content, strip problematic chars
      const safeContent = (wbs[0].content||'').slice(0,5000)
      setWbsContent(safeContent)
    }
    const {data:docs} = await supabase.from('documents').select('content').eq('project_id',id).eq('doc_type','workpackages').order('created_at',{ascending:false}).limit(1)
    const {data:hist} = await supabase.from('documents').select('title,content,created_at').eq('project_id',id).eq('doc_type','workpackages_history').order('created_at',{ascending:false}).limit(10)
    if(hist) setHistory(hist)
    if(docs?.[0]) {
      try {
        const content = docs[0].content
        if (!content || content.trim() === '') { setWps([]); return }
        // Try to parse - handle various formats
        let parsed: any
        try {
          parsed = JSON.parse(content)
        } catch {
          // Content is not valid JSON - delete and reset
          console.warn('Corrupt WP data detected, resetting...')
          const {data:{user}} = await supabase.auth.getUser()
          if (user) {
            await supabase.from('documents').delete()
              .eq('project_id', id).eq('doc_type', 'workpackages')
          }
          setWps([])
          setLoading(false)
          return
        }
        if (Array.isArray(parsed)) setWps(parsed)
        else if (parsed && Array.isArray(parsed.wps)) setWps(parsed.wps)
        else if (parsed && Array.isArray(parsed.tasks)) setWps([]) // wrong doc
        else setWps([])
      } catch(e) {
        console.error('WP load error:', e)
        setWps([])
      }
    }
    setLoading(false)
    } catch(e:any) { console.error('Load error:',e); setLoading(false) }
  }

  async function save(w: WorkPackage[], isNewVersion = false) {
    const {data:{user}} = await supabase.auth.getUser(); if(!user) return
    // Always save as current version
    await supabase.from('documents').upsert({
      project_id:id, user_id:user.id, doc_type:'workpackages',
      title:'Work Packages — '+(project?.name||''),
      content:JSON.stringify(w), status:'generated',
    },{onConflict:'project_id,doc_type'})
    // Save to history if new version
    if (isNewVersion) {
      const ts = new Date().toISOString().replace('T',' ').slice(0,16)
      await supabase.from('documents').insert({
        project_id:id, user_id:user.id,
        doc_type:'workpackages_history',
        title:'WP v'+(history.length+1)+' — '+ts,
        content:JSON.stringify({generated_at:ts, version:history.length+1, count:w.length, wps:w}),
        status:'archived',
      })
      // Reload history
      const {data:hist} = await supabase.from('documents').select('title,content,created_at').eq('project_id',id).eq('doc_type','workpackages_history').order('created_at',{ascending:false}).limit(20)
      if(hist) setHistory(hist)
    }
  }



  async function generateFromWBS() {
    setGenerating(true); setGenMsg('Génération des Work Packages depuis le WBS...')
    let wbsText=project?.name||'Projet'
    if(wbsContent){
      try{
        // Try to extract structured WBS data
        const stripped=wbsContent.replace(/[`]{3}json/gi,'').replace(/[`]{3}/g,'').trim()
        const m=stripped.match(/\{[\s\S]*\}/)
        if(m){
          try{
            const obj=JSON.parse(m[0])
            if(obj.wbs) wbsText=Object.values(obj.wbs as Record<string,any>).slice(0,30).map((v:any)=>(v.id||'')+' '+(v.name||'')).join('\n')
            else wbsText=stripped.slice(0,2000)
          }catch{ wbsText=stripped.replace(/['"]/g,' ').slice(0,2000) }
        } else {
          // Plain text WBS - just use it directly
          wbsText=wbsContent.replace(/[`#*]/g,'').slice(0,2000)
        }
      }catch{ wbsText=project?.name||'Projet' }
    }
    const today=new Date().toISOString().split('T')[0]
    const prompt=`Tu es expert PMBOK 7 et gestion de projet R&D. Génère des Work Packages pour ce projet au format ACMA (6 briques).
PROJET: ${project?.name||''}
WBS: ${wbsText}

Génère autant de Work Packages que nécessaire pour couvrir toutes les phases du projet (généralement entre 4 et 12 selon la complexité).
Pour chaque WP, les 6 briques doivent être complètes et précises.

Réponds UNIQUEMENT avec le tableau JSON:
[{
  "id":"WP1","numero":"WP01","titre":"Cadrage et Initialisation",
  "responsable":"Chef de Projet","statut":"actif","priorite":"haute",
  "objectif":"Définir le périmètre, les objectifs et la gouvernance du projet",
  "livrables":["Charte de projet validée","Planning initial","Matrice RACI"],
  "taches":["Rédiger la charte de projet","Identifier les parties prenantes","Tenir le kick-off meeting"],
  "ressources":["Chef de Projet (10j)","Sponsor (2j)","Analyste (5j)"],
  "budget":"15 000 EUR",
  "risques":["Périmètre mal défini","Parties prenantes indisponibles"],
  "date_debut":"${today}","date_fin":"2025-09-30","avancement":0
}]`

    try{
      const res=await fetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt,maxTokens:5000})})
      const data=await res.json(); const text=data.text||''
      const si=text.indexOf('['),ei=text.lastIndexOf(']')
      if(si===-1||ei===-1) throw new Error('JSON non trouvé')
      const parsed: WorkPackage[]=JSON.parse(text.slice(si,ei+1))
      setWps(parsed); await save(parsed, true)
      setGenMsg(parsed.length+' Work Packages générés et sauvegardés dans l\'historique !')
    }catch(e:any){setGenMsg('Erreur: '+e.message)}
    setGenerating(false); setTimeout(()=>setGenMsg(''),5000)
  }

  function addWP() {
    const w=EMPTY_WP(); const u=[...wps,w]; setWps(u); save(u)
    setSelected(w.id); setView('detail')
  }

  function deleteWP(wid: string) {
    const u=wps.filter(w=>w.id!==wid); setWps(u); save(u)
    if(selected===wid){setSelected(null);setView('grid')}
  }

  function updateWP(wid: string, field: string, value: any) {
    const u=wps.map(w=>w.id!==wid?w:{...w,[field]:value})
    setWps(u); save(u)
  }

  function updateList(wid: string, field: 'livrables'|'taches'|'ressources'|'risques', idx: number, value: string) {
    const wp=wps.find(w=>w.id===wid); if(!wp) return
    const arr=[...wp[field]]; arr[idx]=value
    updateWP(wid,field,arr)
  }
  function addListItem(wid: string, field: 'livrables'|'taches'|'ressources'|'risques') {
    const wp=wps.find(w=>w.id===wid); if(!wp) return
    updateWP(wid,field,[...wp[field],''])
  }
  function removeListItem(wid: string, field: 'livrables'|'taches'|'ressources'|'risques', idx: number) {
    const wp=wps.find(w=>w.id===wid); if(!wp) return
    updateWP(wid,field,wp[field].filter((_,i)=>i!==idx))
  }

  const sel=wps.find(w=>w.id===selected)
  const ah='/projects/'+id+'/workpackages'

  if(loading) return <AppLayout><div style={{textAlign:'center',padding:60,color:'var(--muted)'}}>Chargement...</div></AppLayout>

  return (
    <AppLayout>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16}}>
        <div>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
            <button onClick={()=>router.push('/projects/'+id)} style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',fontSize:12}}>← Projet</button>
            <span style={{color:'var(--dim)'}}>›</span>
            <span style={{fontSize:12,color:'var(--dim)'}}>{project?.name}</span>
          </div>
          <div className="sec-label">// Structure de découpage</div>
          <h1 className="sec-title" style={{marginBottom:4}}>📦 Work Packages</h1>
        </div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
          {wps.length>0&&(
            <div style={{display:'flex',gap:4,background:'var(--ink2)',border:'1px solid var(--line2)',borderRadius:8,padding:'2px'}}>
              {(['grid','detail'] as const).map(v=>(
                <button key={v} onClick={()=>{setView(v);if(v==='grid')setSelected(null)}} style={{padding:'5px 12px',borderRadius:6,border:'none',background:view===v?'var(--gold2)':'transparent',color:view===v?'#000':'var(--muted)',cursor:'pointer',fontSize:11,fontWeight:view===v?700:400}}>
                  {v==='grid'?'🔲 Grille':'📝 Détail'}
                </button>
              ))}
            </div>
          )}
          <button onClick={()=>setShowHistory(!showHistory)} className="btn-ghost" style={{fontSize:11,color:'var(--cyan)',borderColor:'rgba(58,207,207,.3)'}}>📜 Historique ({history.length})</button>
          <button onClick={addWP} className="btn-ghost" style={{fontSize:11}}>+ WP</button>
          <ExportToolbar
            title={'Work Packages — '+(project?.name||'')}
            content={JSON.stringify(wps,null,2)}
            projectName={project?.name||''}
            docType="workpackages"
            onMessage={m=>{setGenMsg(m);setTimeout(()=>setGenMsg(''),5000)}}
          />
          <button onClick={generateFromWBS} className="btn-ghost" disabled={generating} style={{fontSize:11}}>{generating?'Génération...':wps.length>0?'🔄 Nouvelle version':'⚡ Générer depuis WBS'}</button>
        </div>
      </div>

      <div style={{display:'flex',gap:5,marginBottom:16,borderBottom:'1px solid var(--line)',paddingBottom:12,flexWrap:'wrap'}}>
        {NAV.map(label=>{const href=navHref(label,id);return(
          <button key={href} onClick={()=>router.push(href)} style={{padding:'6px 12px',fontSize:11,cursor:'pointer',borderRadius:8,border:'1px solid var(--line2)',background:href===ah?'rgba(212,168,75,.15)':'transparent',color:href===ah?'var(--gold2)':'var(--muted)',fontWeight:href===ah?600:400,transition:'all .12s',fontFamily:'var(--mono)'}}>
            {NAV_ICONS[label]||''} {label}
          </button>
        )})}
      </div>

      {showHistory&&history.length>0&&(
        <div className="card" style={{marginBottom:16}}>
          <div className="card-hdr">
            <div className="card-title">📜 Historique des générations</div>
            <button onClick={()=>setShowHistory(false)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--muted)',fontSize:16}}>×</button>
          </div>
          <div className="card-body">
            {history.map((h,i)=>{
              let info: any={}
              try {
                const raw = JSON.parse(h.content)
                info = raw
              } catch {}
              return(
                <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid var(--line)'}}>
                  <div>
                    <div style={{fontSize:12,color:'var(--text)',fontWeight:500}}>{info.label||'Génération'}</div>
                    <div style={{fontSize:10,color:'var(--dim)'}}>{info.generated_at} — {info.count} Work Packages</div>
                  </div>
                  <button onClick={()=>{if(info.wps){setWps(info.wps);setShowHistory(false);setGenMsg('Version restaurée depuis l\'historique')}}}
                    style={{padding:'4px 10px',background:'rgba(212,168,75,.1)',border:'1px solid rgba(212,168,75,.3)',borderRadius:5,cursor:'pointer',fontSize:11,color:'var(--gold2)'}}>
                    Restaurer
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
      {genMsg&&(
        <div style={{padding:'10px 16px',borderRadius:9,background:genMsg.includes('Erreur')?'rgba(240,96,96,.08)':'rgba(53,200,144,.08)',border:'1px solid '+(genMsg.includes('Erreur')?'var(--red)':'var(--green)'),fontSize:12,color:genMsg.includes('Erreur')?'var(--red)':'var(--green)',marginBottom:16,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span>{genMsg}</span>
          <button onClick={()=>setGenMsg('')} style={{background:'none',border:'none',cursor:'pointer',color:'inherit',fontSize:16,opacity:.6}}>×</button>
        </div>
      )}

      {wps.length===0?(
        <div style={{textAlign:'center',padding:'80px 20px',background:'var(--ink2)',border:'1.5px solid var(--line)',borderRadius:14}}>
          <div style={{fontSize:56,marginBottom:16,opacity:.4}}>📦</div>
          <div style={{fontFamily:'var(--syne)',fontSize:20,fontWeight:700,color:'var(--white)',marginBottom:10}}>Aucun Work Package</div>
          <div style={{fontSize:13,color:'var(--muted)',marginBottom:28,maxWidth:500,margin:'0 auto 28px',lineHeight:1.8}}>
            Générez automatiquement depuis le WBS Dict ou créez manuellement.
          </div>
          <div style={{display:'flex',gap:12,justifyContent:'center'}}>
            <button className="btn-gold" onClick={generateFromWBS} disabled={generating} style={{fontSize:13}}>{generating?'Génération...':'⚡ Générer depuis WBS'}</button>
            <button className="btn-ghost" onClick={addWP} style={{fontSize:13}}>+ Créer manuellement</button>
          </div>
        </div>
      ) : view==='grid' ? (
        // ── VUE GRILLE ───────────────────────────────────
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(340px,1fr))',gap:16}}>
          {wps.map(wp=>(
            <div key={wp.id} onClick={()=>{setSelected(wp.id);setView('detail')}}
              style={{background:'var(--ink2)',border:'1.5px solid var(--line)',borderRadius:12,padding:16,cursor:'pointer',transition:'all .15s',position:'relative'}}
              onMouseEnter={e=>(e.currentTarget.style.borderColor='var(--gold2)')}
              onMouseLeave={e=>(e.currentTarget.style.borderColor='var(--line)')}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
                <div>
                  <div style={{fontSize:10,color:'var(--dim)',fontFamily:'monospace',marginBottom:3}}>{wp.numero}</div>
                  <div style={{fontFamily:'var(--syne)',fontSize:14,fontWeight:700,color:'var(--white)'}}>{wp.titre}</div>
                  {wp.responsable&&<div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>👤 {wp.responsable}</div>}
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:4,alignItems:'flex-end'}}>
                  <span style={{padding:'2px 8px',borderRadius:12,fontSize:9,fontWeight:700,background:STATUT_COLORS[wp.statut]+'22',color:STATUT_COLORS[wp.statut],border:'1px solid '+STATUT_COLORS[wp.statut]+'44',textTransform:'uppercase'}}>{wp.statut}</span>
                  <span style={{padding:'2px 8px',borderRadius:12,fontSize:9,fontWeight:700,background:PRIO_COLORS[wp.priorite]+'22',color:PRIO_COLORS[wp.priorite],border:'1px solid '+PRIO_COLORS[wp.priorite]+'44'}}>{wp.priorite}</span>
                </div>
              </div>

              {wp.objectif&&<div style={{fontSize:11,color:'var(--muted)',lineHeight:1.6,marginBottom:10,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}}>{wp.objectif}</div>}

              {/* 6 briques résumées */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginBottom:10}}>
                {[
                  {icon:'🎯',label:'Livrables',count:wp.livrables.filter(l=>l).length},
                  {icon:'✅',label:'Tâches',count:wp.taches.filter(t=>t).length},
                  {icon:'👥',label:'Ressources',count:wp.ressources.filter(r=>r).length},
                  {icon:'⚠️',label:'Risques',count:wp.risques.filter(r=>r).length},
                ].map(b=>(
                  <div key={b.label} style={{display:'flex',alignItems:'center',gap:5,fontSize:10,color:'var(--dim)'}}>
                    <span>{b.icon}</span><span>{b.count} {b.label}</span>
                  </div>
                ))}
              </div>

              {/* Budget + dates */}
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                {wp.budget&&<span style={{fontSize:11,color:'var(--gold2)',fontWeight:600}}>💰 {wp.budget}</span>}
                {wp.date_debut&&<span style={{fontSize:10,color:'var(--dim)'}}>{wp.date_debut} → {wp.date_fin}</span>}
              </div>

              {/* Barre avancement */}
              <div style={{height:4,background:'var(--ink)',borderRadius:2,overflow:'hidden'}}>
                <div style={{height:'100%',width:wp.avancement+'%',background:'var(--green)',borderRadius:2,transition:'width .3s'}}/>
              </div>
              <div style={{fontSize:9,color:'var(--dim)',marginTop:3}}>{wp.avancement}% complété</div>
            </div>
          ))}
          <div onClick={addWP} style={{border:'1.5px dashed var(--line)',borderRadius:12,padding:16,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:8,color:'var(--muted)',transition:'all .15s',minHeight:160}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--gold2)';e.currentTarget.style.color='var(--gold2)'}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--line)';e.currentTarget.style.color='var(--muted)'}}>
            <div style={{fontSize:28}}>+</div>
            <div style={{fontSize:12}}>Ajouter un WP</div>
          </div>
        </div>
      ) : (
        // ── VUE DÉTAIL ───────────────────────────────────
        <div style={{display:'flex',gap:16}}>
          {/* Liste WPs */}
          <div style={{width:220,flexShrink:0}}>
            <div className="card">
              <div className="card-hdr"><div className="card-title">Work Packages ({wps.length})</div></div>
              <div style={{display:'flex',flexDirection:'column',gap:2,padding:'8px'}}>
                {wps.map(wp=>(
                  <div key={wp.id} onClick={()=>setSelected(wp.id)}
                    style={{padding:'8px 10px',borderRadius:6,cursor:'pointer',background:selected===wp.id?'rgba(212,168,75,.12)':'transparent',border:'1px solid '+(selected===wp.id?'var(--gold2)':'transparent'),transition:'all .1s'}}>
                    <div style={{fontSize:9,color:'var(--dim)',fontFamily:'monospace'}}>{wp.numero}</div>
                    <div style={{fontSize:11,fontWeight:600,color:'var(--text)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{wp.titre}</div>
                    <div style={{display:'flex',gap:4,marginTop:3}}>
                      <span style={{fontSize:8,color:STATUT_COLORS[wp.statut]}}>{wp.statut}</span>
                      <span style={{fontSize:8,color:'var(--dim)'}}>·</span>
                      <span style={{fontSize:8,color:PRIO_COLORS[wp.priorite]}}>{wp.priorite}</span>
                    </div>
                  </div>
                ))}
                <button onClick={addWP} style={{padding:'8px',background:'transparent',border:'1px dashed var(--line)',borderRadius:6,cursor:'pointer',color:'var(--muted)',fontSize:11,marginTop:4}}>+ Nouveau WP</button>
              </div>
            </div>
          </div>

          {/* Détail WP sélectionné */}
          {sel?(
            <div style={{flex:1,minWidth:0}}>
              {/* En-tête */}
              <div style={{background:'var(--ink2)',border:'1.5px solid var(--line)',borderRadius:12,padding:16,marginBottom:16}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12}}>
                  <div style={{flex:1}}>
                    <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:6}}>
                      <input value={sel.numero} onChange={e=>updateWP(sel.id,'numero',e.target.value)} style={{width:70,padding:'3px 8px',background:'var(--ink)',border:'1px solid var(--line2)',borderRadius:5,color:'var(--dim)',fontSize:11,fontFamily:'monospace'}}/>
                      <input value={sel.titre} onChange={e=>updateWP(sel.id,'titre',e.target.value)} style={{flex:1,padding:'6px 10px',background:'var(--ink)',border:'1px solid var(--line2)',borderRadius:6,color:'var(--white)',fontSize:16,fontWeight:700,fontFamily:'var(--syne)'}}/>
                    </div>
                    <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                      <input placeholder="Responsable" value={sel.responsable} onChange={e=>updateWP(sel.id,'responsable',e.target.value)} style={{padding:'4px 10px',background:'var(--ink)',border:'1px solid var(--line2)',borderRadius:5,color:'var(--muted)',fontSize:11}}/>
                      <select value={sel.statut} onChange={e=>updateWP(sel.id,'statut',e.target.value)} style={{padding:'4px 8px',background:'var(--ink)',border:'1px solid var(--line2)',borderRadius:5,color:STATUT_COLORS[sel.statut],fontSize:11}}>
                        <option value="draft">Draft</option><option value="actif">Actif</option><option value="termine">Terminé</option><option value="suspendu">Suspendu</option>
                      </select>
                      <select value={sel.priorite} onChange={e=>updateWP(sel.id,'priorite',e.target.value)} style={{padding:'4px 8px',background:'var(--ink)',border:'1px solid var(--line2)',borderRadius:5,color:PRIO_COLORS[sel.priorite],fontSize:11}}>
                        <option value="haute">Priorité haute</option><option value="moyenne">Priorité moyenne</option><option value="faible">Priorité faible</option>
                      </select>
                      <button onClick={()=>deleteWP(sel.id)} style={{padding:'4px 10px',background:'rgba(220,38,38,.1)',border:'1px solid rgba(220,38,38,.3)',borderRadius:5,cursor:'pointer',fontSize:11,color:'var(--red)',marginLeft:'auto'}}>🗑 Supprimer</button>
                    </div>
                  </div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
                  <div className="fg"><label className="fl">Date début</label><input className="fi" type="date" value={sel.date_debut} onChange={e=>updateWP(sel.id,'date_debut',e.target.value)}/></div>
                  <div className="fg"><label className="fl">Date fin</label><input className="fi" type="date" value={sel.date_fin} onChange={e=>updateWP(sel.id,'date_fin',e.target.value)}/></div>
                  <div className="fg"><label className="fl">Avancement : <strong style={{color:'var(--green)'}}>{sel.avancement}%</strong></label><input type="range" min={0} max={100} step={5} value={sel.avancement} onChange={e=>updateWP(sel.id,'avancement',+e.target.value)} style={{width:'100%',accentColor:'var(--green)'}}/></div>
                </div>
              </div>

              {/* 6 Briques ACMA */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>

                {/* Brique 1 — Objectif */}
                <div className="card" style={{borderLeft:'3px solid #2563EB'}}>
                  <div className="card-hdr"><div className="card-title">🎯 Objectif</div></div>
                  <div className="card-body">
                    <textarea value={sel.objectif} onChange={e=>updateWP(sel.id,'objectif',e.target.value)} placeholder="Décrire l'objectif principal de ce Work Package..."
                      style={{width:'100%',minHeight:80,padding:'8px',background:'var(--ink)',border:'1px solid var(--line2)',borderRadius:6,color:'var(--text)',fontSize:12,resize:'vertical',lineHeight:1.6}}/>
                  </div>
                </div>

                {/* Brique 2 — Budget */}
                <div className="card" style={{borderLeft:'3px solid #D97706'}}>
                  <div className="card-hdr"><div className="card-title">💰 Budget</div></div>
                  <div className="card-body">
                    <input className="fi" placeholder="ex: 25 000 EUR" value={sel.budget} onChange={e=>updateWP(sel.id,'budget',e.target.value)} style={{fontSize:16,fontWeight:700,color:'var(--gold2)'}}/>
                    <div style={{fontSize:11,color:'var(--dim)',marginTop:8}}>Inclure toutes les ressources humaines et matérielles</div>
                  </div>
                </div>

                {/* Brique 3 — Livrables */}
                <div className="card" style={{borderLeft:'3px solid #059669'}}>
                  <div className="card-hdr">
                    <div className="card-title">📋 Livrables</div>
                    <button onClick={()=>addListItem(sel.id,'livrables')} style={{padding:'2px 8px',background:'rgba(5,150,105,.1)',border:'1px solid rgba(5,150,105,.3)',borderRadius:5,cursor:'pointer',fontSize:11,color:'var(--green)'}}>+</button>
                  </div>
                  <div className="card-body" style={{display:'flex',flexDirection:'column',gap:6}}>
                    {sel.livrables.map((l,i)=>(
                      <div key={i} style={{display:'flex',gap:6,alignItems:'center'}}>
                        <span style={{color:'var(--green)',fontSize:12}}>●</span>
                        <input value={l} onChange={e=>updateList(sel.id,'livrables',i,e.target.value)} placeholder="Livrable..." style={{flex:1,padding:'4px 8px',background:'var(--ink)',border:'1px solid var(--line2)',borderRadius:5,color:'var(--text)',fontSize:11}}/>
                        <button onClick={()=>removeListItem(sel.id,'livrables',i)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--dim)',fontSize:14,padding:'0 2px'}}>×</button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Brique 4 — Tâches */}
                <div className="card" style={{borderLeft:'3px solid #7C3AED'}}>
                  <div className="card-hdr">
                    <div className="card-title">✅ Tâches</div>
                    <button onClick={()=>addListItem(sel.id,'taches')} style={{padding:'2px 8px',background:'rgba(124,58,237,.1)',border:'1px solid rgba(124,58,237,.3)',borderRadius:5,cursor:'pointer',fontSize:11,color:'var(--purple)'}}>+</button>
                  </div>
                  <div className="card-body" style={{display:'flex',flexDirection:'column',gap:6}}>
                    {sel.taches.map((t,i)=>(
                      <div key={i} style={{display:'flex',gap:6,alignItems:'center'}}>
                        <span style={{color:'var(--purple)',fontSize:12}}>▸</span>
                        <input value={t} onChange={e=>updateList(sel.id,'taches',i,e.target.value)} placeholder="Tâche à réaliser..." style={{flex:1,padding:'4px 8px',background:'var(--ink)',border:'1px solid var(--line2)',borderRadius:5,color:'var(--text)',fontSize:11}}/>
                        <button onClick={()=>removeListItem(sel.id,'taches',i)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--dim)',fontSize:14,padding:'0 2px'}}>×</button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Brique 5 — Ressources */}
                <div className="card" style={{borderLeft:'3px solid #0891B2'}}>
                  <div className="card-hdr">
                    <div className="card-title">👥 Ressources</div>
                    <button onClick={()=>addListItem(sel.id,'ressources')} style={{padding:'2px 8px',background:'rgba(8,145,178,.1)',border:'1px solid rgba(8,145,178,.3)',borderRadius:5,cursor:'pointer',fontSize:11,color:'var(--cyan)'}}>+</button>
                  </div>
                  <div className="card-body" style={{display:'flex',flexDirection:'column',gap:6}}>
                    {sel.ressources.map((r,i)=>(
                      <div key={i} style={{display:'flex',gap:6,alignItems:'center'}}>
                        <span style={{color:'var(--cyan)',fontSize:12}}>👤</span>
                        <input value={r} onChange={e=>updateList(sel.id,'ressources',i,e.target.value)} placeholder="ex: Chef de Projet (10j)" style={{flex:1,padding:'4px 8px',background:'var(--ink)',border:'1px solid var(--line2)',borderRadius:5,color:'var(--text)',fontSize:11}}/>
                        <button onClick={()=>removeListItem(sel.id,'ressources',i)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--dim)',fontSize:14,padding:'0 2px'}}>×</button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Brique 6 — Risques */}
                <div className="card" style={{borderLeft:'3px solid #DC2626'}}>
                  <div className="card-hdr">
                    <div className="card-title">⚠️ Risques</div>
                    <button onClick={()=>addListItem(sel.id,'risques')} style={{padding:'2px 8px',background:'rgba(220,38,38,.1)',border:'1px solid rgba(220,38,38,.3)',borderRadius:5,cursor:'pointer',fontSize:11,color:'var(--red)'}}>+</button>
                  </div>
                  <div className="card-body" style={{display:'flex',flexDirection:'column',gap:6}}>
                    {sel.risques.map((r,i)=>(
                      <div key={i} style={{display:'flex',gap:6,alignItems:'center'}}>
                        <span style={{color:'var(--red)',fontSize:12}}>⚠</span>
                        <input value={r} onChange={e=>updateList(sel.id,'risques',i,e.target.value)} placeholder="Risque identifié..." style={{flex:1,padding:'4px 8px',background:'var(--ink)',border:'1px solid var(--line2)',borderRadius:5,color:'var(--text)',fontSize:11}}/>
                        <button onClick={()=>removeListItem(sel.id,'risques',i)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--dim)',fontSize:14,padding:'0 2px'}}>×</button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ):(
            <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--muted)',fontSize:13}}>
              Sélectionner un Work Package dans la liste
            </div>
          )}
        </div>
      )}
    </AppLayout>
  )
}
