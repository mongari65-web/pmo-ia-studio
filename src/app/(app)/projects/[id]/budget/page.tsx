'use client'
import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AppLayout from '@/components/layout/AppLayout'
import ExportToolbar from '@/components/ui/ExportToolbar'

interface EVMTask {
  id: string
  wbs_id: string
  name: string
  role: string
  tbc: number
  pv_periods: number[]
  ev_periods: number[]
  ac_periods: number[]
}

interface Config {
  project_title: string
  manager: string
  report_date: string
  current_period: number
  period_labels: string[]
  nb_periods: number
}

const DEFAULT_CONFIG: Config = {
  project_title: '',
  manager: '',
  report_date: new Date().toISOString().split('T')[0],
  current_period: 0,
  period_labels: Array.from({length:12}, (_,i) => 'P'+(i+1)),
  nb_periods: 12,
}

const NAV_LABELS = ['Documents','WBS Dict','RAID','Jalons','PERT','Mind Map','Budget EVM','Gantt','Work Packages']
const NAV_ICONS: Record<string,string> = {
  'Documents':'\u{1F4C4}','WBS Dict':'\u{1F4DA}','RAID':'\u26A0','Jalons':'\u{1F4C5}',
  'PERT':'\u{1F4CA}','Mind Map':'\u{1F9E0}','Budget EVM':'\u{1F4B0}'
}

function getNavHref(label: string, id: string): string {
  if (label === 'Documents') return '/projects/'+id
  if (label === 'WBS Dict')  return '/projects/'+id+'/wbs-dict'
  if (label === 'RAID')      return '/projects/'+id+'/raid'
  if (label === 'Jalons')    return '/projects/'+id+'/jalons'
  if (label === 'PERT')      return '/projects/'+id+'/pert'
  if (label === 'Mind Map')  return '/projects/'+id+'/mindmap'
  if (label === 'Gantt') return '/projects/'+id+'/gantt'
  if (label === 'Work Packages') return '/projects/'+id+'/workpackages'
  if (label === 'Gantt') return '/projects/'+id+'/gantt'
  if (label === 'Work Packages') return '/projects/'+id+'/workpackages'
  return '/projects/'+id+'/budget'
}

function cumSum(arr: number[]): number[] {
  let s = 0
  return arr.map(v => { s += (v||0); return s })
}

function computeAll(tasks: EVMTask[], config: Config) {
  const N  = config.nb_periods
  const cp = Math.min(config.current_period, N-1)

  const pvC = Array(N).fill(0) as number[]
  const evC = Array(N).fill(0) as number[]
  const acC = Array(N).fill(0) as number[]

  tasks.forEach(t => {
    const pv = cumSum((t.pv_periods||[]).slice(0,N).concat(Array(Math.max(0,N-(t.pv_periods||[]).length)).fill(0)))
    const ac = cumSum((t.ac_periods||[]).slice(0,N).concat(Array(Math.max(0,N-(t.ac_periods||[]).length)).fill(0)))
    // EV: take last non-zero pct and apply to tbc
    const evP = t.ev_periods||[]
    let lastPct = 0
    for (let i = 0; i < N; i++) {
      if (evP[i] !== undefined && evP[i] > 0) lastPct = evP[i]
      evC[i] += lastPct * t.tbc
    }
    pv.forEach((v,i) => { pvC[i] += v })
    ac.forEach((v,i) => { acC[i] += v })
  })

  const bac = tasks.reduce((s,t) => s+t.tbc, 0)
  const pv  = pvC[cp] || 0
  const ev  = evC[cp] || 0
  const ac  = acC[cp] || 0
  const cv  = ev - ac
  const sv  = ev - pv
  const cpi = ac > 0 ? ev / ac : 1
  const spi = pv > 0 ? ev / pv : 1
  const eac = cpi > 0 ? bac / cpi : bac
  const etc = eac - ac
  const vac = bac - eac
  const tcpi = (bac - ev) > 0 ? (bac - ev) / Math.max(1, bac - ac) : 1
  const pct = bac > 0 ? (ev / bac) * 100 : 0

  return { bac, pv, ev, ac, cv, sv, cpi, spi, eac, etc, vac, tcpi, pct, pvC, evC, acC }
}

function idxColor(v: number): string {
  return v >= 1 ? 'var(--green)' : v >= 0.9 ? 'var(--amber)' : 'var(--red)'
}
function fmtEur(v: number): string {
  return v.toLocaleString('fr-FR', {style:'currency', currency:'EUR', maximumFractionDigits:0})
}
function fmtN(v: number): string {
  return isFinite(v) ? v.toFixed(2) : '-'
}

function EVMChart({ pvC, evC, acC, bac, cp, N, labels, cpi }: {
  pvC: number[], evC: number[], acC: number[],
  bac: number, cp: number, N: number, labels: string[], cpi: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef  = useRef<any>(null)
  const acNow = acC[cp]||0
  const evNow = evC[cp]||0
  const pvNow = pvC[cp]||0
  const eac   = cpi>0?bac/cpi:bac
  const etc   = eac-acNow
  const tcpi  = (bac-evNow)>0?(bac-evNow)/Math.max(1,bac-acNow):1
  const cv    = evNow-acNow
  const sv    = evNow-pvNow
  const eacProj = Array.from({length:N},(_,i)=>i<cp?null as unknown as number:Math.round(acNow+(pvC[i]-pvNow)/Math.max(0.01,cpi)))
  const f  = (v:number) => Math.round(Math.abs(v)).toLocaleString('fr-FR')+'\u20ac'
  const fs = (v:number) => (v>=0?'+':'')+Math.round(v).toLocaleString('fr-FR')+'\u20ac'

  useEffect(()=>{
    if(!canvasRef.current||typeof window==='undefined') return
    const build = () => {
      const Chart=(window as any).Chart
      if(!Chart) return
      if(chartRef.current){chartRef.current.destroy();chartRef.current=null}
      const maxY=Math.max(bac*1.15,...pvC)

      const bgPl={id:'bg3',beforeDraw(c:any){c.ctx.save();c.ctx.fillStyle='#F8FAFC';c.ctx.fillRect(0,0,c.width,c.height);c.ctx.restore()}}

      const an={id:'an3',afterDraw(chart:any){
        const {ctx,chartArea:ca,scales:{x,y}}=chart
        if(!x||!y||!ca) return
        const xCP=x.getPixelForValue(cp),xE=x.getPixelForValue(N-1)
        const yB=y.getPixelForValue(bac),yM=y.getPixelForValue(bac*1.10)
        const yEA=y.getPixelForValue(eac),yAC=y.getPixelForValue(acNow)
        const yEV=y.getPixelForValue(evNow),yPV=y.getPixelForValue(pvNow)
        ctx.save()

        // Mgmt Reserve
        ctx.fillStyle='rgba(186,230,253,.3)';ctx.fillRect(ca.left,yM,ca.width,yB-yM)
        ctx.strokeStyle='rgba(14,165,233,.3)';ctx.setLineDash([5,4]);ctx.lineWidth=1;ctx.strokeRect(ca.left,yM,ca.width,yB-yM);ctx.setLineDash([])
        ctx.font='bold 11px sans-serif';ctx.fillStyle='#0369A1';ctx.fillText('Management Reserve (+10%)',ca.left+10,yM+16)

        // BAC
        ctx.strokeStyle='#B45309';ctx.setLineDash([7,4]);ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(ca.left,yB);ctx.lineTo(ca.right,yB);ctx.stroke();ctx.setLineDash([])
        ctx.font='bold 11px sans-serif';ctx.fillStyle='#92400E';ctx.textAlign='right';ctx.fillText('BAC '+f(bac),ca.right-4,yB-5);ctx.textAlign='left'

        // Risk
        ctx.fillStyle='rgba(220,38,38,.2)';ctx.fillRect(xE-44,yEA,44,yB-yEA)
        ctx.strokeStyle='rgba(220,38,38,.45)';ctx.lineWidth=1;ctx.strokeRect(xE-44,yEA,44,yB-yEA)
        ctx.font='bold 10px sans-serif';ctx.fillStyle='#991B1B';ctx.textAlign='center';ctx.fillText('RISK',xE-22,(yEA+yB)/2+4);ctx.textAlign='left'

        // Today
        ctx.strokeStyle='#1E293B';ctx.lineWidth=2.5;ctx.setLineDash([]);ctx.beginPath();ctx.moveTo(xCP,ca.top);ctx.lineTo(xCP,ca.bottom);ctx.stroke()
        ctx.font='bold 11px sans-serif';ctx.fillStyle='#1E293B';ctx.textAlign='center';ctx.fillText('Today',xCP,ca.bottom+20);ctx.textAlign='left'

        // Ref lines AC EV PV
        const refLines = [[yAC,'#059669','AC'],[yEV,'#D97706','EV'],[yPV,'#2563EB','PV']]
        for (let ri=0;ri<refLines.length;ri++) {
          const ry=refLines[ri][0] as number, rc=refLines[ri][1] as string, rl=refLines[ri][2] as string
          ctx.strokeStyle=rc;ctx.lineWidth=1.5;ctx.setLineDash([5,3])
          ctx.beginPath();ctx.moveTo(ca.left,ry);ctx.lineTo(xCP,ry);ctx.stroke();ctx.setLineDash([])
          ctx.font='bold 10px sans-serif';ctx.fillStyle=rc;ctx.textAlign='right'
          ctx.fillText(rl,ca.left-3,ry+3);ctx.textAlign='left'
        }

        // CV bubble
        if(Math.abs(cv)>bac*.005&&Math.abs(yAC-yEV)>22){
          const bx=xCP-46,mid=(yAC+yEV)/2
          ctx.strokeStyle='#059669';ctx.lineWidth=2;ctx.beginPath()
          ctx.moveTo(bx+8,yAC);ctx.lineTo(bx+2,yAC);ctx.lineTo(bx+2,yEV);ctx.lineTo(bx+8,yEV);ctx.stroke()
          ctx.fillStyle='#ECFDF5';ctx.beginPath();(ctx as any).roundRect(bx-90,mid-22,86,44,5);ctx.fill()
          ctx.strokeStyle='#059669';ctx.lineWidth=1.5;ctx.beginPath();(ctx as any).roundRect(bx-90,mid-22,86,44,5);ctx.stroke()
          ctx.fillStyle='#065F46';ctx.font='bold 10px sans-serif';ctx.textAlign='center'
          ctx.fillText('Cost Variance',bx-47,mid-7)
          ctx.font='bold 13px sans-serif';ctx.fillStyle='#047857';ctx.fillText(fs(cv),bx-47,mid+8)
          ctx.font='10px sans-serif';ctx.fillStyle='#064E3B';ctx.fillText(cv>=0?'Sous budget':'Surcout',bx-47,mid+21);ctx.textAlign='left'
        }

        // SV bubble
        if(Math.abs(sv)>bac*.005&&Math.abs(yEV-yPV)>22){
          const bx=xCP+46,mid=(yEV+yPV)/2
          ctx.strokeStyle='#D97706';ctx.lineWidth=2;ctx.beginPath()
          ctx.moveTo(bx-8,yEV);ctx.lineTo(bx-2,yEV);ctx.lineTo(bx-2,yPV);ctx.lineTo(bx-8,yPV);ctx.stroke()
          ctx.fillStyle='#FFFBEB';ctx.beginPath();(ctx as any).roundRect(bx+2,mid-22,90,44,5);ctx.fill()
          ctx.strokeStyle='#D97706';ctx.lineWidth=1.5;ctx.beginPath();(ctx as any).roundRect(bx+2,mid-22,90,44,5);ctx.stroke()
          ctx.fillStyle='#92400E';ctx.font='bold 10px sans-serif';ctx.textAlign='center'
          ctx.fillText('Sched. Variance',bx+47,mid-7)
          ctx.font='bold 13px sans-serif';ctx.fillStyle='#B45309';ctx.fillText(fs(sv),bx+47,mid+8)
          ctx.font='10px sans-serif';ctx.fillStyle='#78350F';ctx.fillText(sv>=0?'En avance':'En retard',bx+47,mid+21);ctx.textAlign='left'
        }

        // EAC bubble right
        ctx.fillStyle='#EDE9FE';ctx.beginPath();(ctx as any).roundRect(ca.right+6,yEA-18,130,34,5);ctx.fill()
        ctx.strokeStyle='#7C3AED';ctx.lineWidth=1.5;ctx.beginPath();(ctx as any).roundRect(ca.right+6,yEA-18,130,34,5);ctx.stroke()
        ctx.font='10px sans-serif';ctx.fillStyle='#5B21B6';ctx.fillText('Estimate at Completion',ca.right+10,yEA-4)
        ctx.font='bold 12px sans-serif';ctx.fillStyle='#4C1D95';ctx.fillText('EAC = '+f(eac),ca.right+10,yEA+12)

        // ETC bubble top
        ctx.fillStyle='#ECFDF5';ctx.beginPath();(ctx as any).roundRect(xCP+8,ca.top+8,118,32,5);ctx.fill()
        ctx.strokeStyle='#059669';ctx.lineWidth=1.5;ctx.beginPath();(ctx as any).roundRect(xCP+8,ca.top+8,118,32,5);ctx.stroke()
        ctx.font='10px sans-serif';ctx.fillStyle='#065F46';ctx.fillText('Estimate to Complete',xCP+12,ca.top+20)
        ctx.font='bold 12px sans-serif';ctx.fillStyle='#047857';ctx.fillText('ETC = '+f(etc),xCP+12,ca.top+33)

        // TCPI badge
        const tc=tcpi<=1?'#059669':tcpi<=1.1?'#D97706':'#DC2626'
        const tb=tcpi<=1?'#ECFDF5':tcpi<=1.1?'#FFFBEB':'#FEF2F2'
        ctx.fillStyle=tb;ctx.beginPath();(ctx as any).roundRect(ca.left+8,ca.top+8,76,44,6);ctx.fill()
        ctx.strokeStyle=tc;ctx.lineWidth=2;ctx.beginPath();(ctx as any).roundRect(ca.left+8,ca.top+8,76,44,6);ctx.stroke()
        ctx.font='bold 10px sans-serif';ctx.fillStyle=tc;ctx.textAlign='center'
        ctx.fillText('TCPI',ca.left+46,ca.top+23)
        ctx.font='bold 16px sans-serif';ctx.fillText(tcpi.toFixed(2),ca.left+46,ca.top+41);ctx.textAlign='left'

        ctx.restore()
      }}

      chartRef.current=new Chart(canvasRef.current,{
        type:'line',
        data:{labels:labels.slice(0,N),datasets:[
          {label:'PV',data:pvC,borderColor:'#2563EB',borderWidth:3,pointRadius:4,pointBackgroundColor:'#2563EB',backgroundColor:'transparent',tension:0.35,order:3},
          {label:'EV',data:evC.map((v,i)=>i<=cp?v:null),borderColor:'#D97706',borderWidth:3,pointRadius:4,pointBackgroundColor:'#D97706',backgroundColor:'transparent',tension:0.35,order:2},
          {label:'AC',data:acC.map((v,i)=>i<=cp?v:null),borderColor:'#059669',borderWidth:3,pointRadius:4,pointBackgroundColor:'#059669',backgroundColor:'transparent',tension:0.35,order:1},
          {label:'EAC',data:eacProj,borderColor:'#7C3AED',borderWidth:2,pointRadius:3,pointBackgroundColor:'#7C3AED',backgroundColor:'transparent',borderDash:[8,5],tension:0.25,order:0},
        ]},
        options:{
          responsive:true,maintainAspectRatio:false,animation:false,
          plugins:{legend:{display:false},tooltip:{callbacks:{label:(c:any)=>c.dataset.label+': '+(c.parsed.y!==null?Math.round(c.parsed.y).toLocaleString('fr-FR')+'\u20ac':'-')}}},
          scales:{
            x:{grid:{color:'rgba(0,0,0,.07)'},ticks:{color:'#374151',font:{size:11}},border:{color:'rgba(0,0,0,.12)'}},
            y:{min:0,max:Math.ceil(maxY/10000)*10000,grid:{color:'rgba(0,0,0,.07)'},ticks:{color:'#374151',font:{size:11},callback:(v:any)=>Math.round(v/1000)+'k'},border:{color:'rgba(0,0,0,.12)'}}
          },
          layout:{padding:{right:150,top:60,bottom:35,left:15}}
        },
        plugins:[bgPl,an]
      })
    }
    if((window as any).Chart){build()}
    else{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js';s.onload=build;document.head.appendChild(s)}
    return()=>{if(chartRef.current){chartRef.current.destroy();chartRef.current=null}}
  },[pvC.join(','),evC.join(','),acC.join(','),bac,cp,N,cpi])

  return (
    <div style={{width:'100%',height:'100%',borderRadius:8,overflow:'hidden',
      background:'#F8FAFC',border:'1px solid rgba(0,0,0,.08)'}}>
      <canvas ref={canvasRef} style={{display:'block',width:'100%',height:'100%',background:'#F8FAFC'}}/>
    </div>
  )
}

export default function BudgetEVMPage() {
  const [tasks, setTasks]     = useState<EVMTask[]>([])
  const [config, setConfig]   = useState<Config>({...DEFAULT_CONFIG})
  const [project, setProject] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [genMsg, setGenMsg]   = useState('')
  const [activeTab, setActiveTab] = useState('report' as string)
  const [wbsContent, setWbsContent] = useState('')

  const params   = useParams()
  const router   = useRouter()
  const supabase = createClient()
  const id  = params.id as string
  const N   = config.nb_periods
  const cp  = config.current_period

  const m = useMemo(() => computeAll(tasks, config), [tasks, config])
  const { bac, pv, ev, ac, cv, sv, cpi, spi, eac, etc, vac, tcpi, pct, pvC, evC, acC } = m

  useEffect(() => { loadData() }, [id])

  async function loadData() {
    const { data: proj } = await supabase.from('projects').select('*').eq('id', id).single()
    setProject(proj)
    const { data: wbsDocs } = await supabase.from('documents')
      .select('content').eq('project_id', id).eq('doc_type', 'wbs')
      .order('created_at',{ascending:false}).limit(1)
    if (wbsDocs?.[0]) setWbsContent(wbsDocs[0].content)
    const { data: budgetDocs } = await supabase.from('documents')
      .select('content').eq('project_id', id).eq('doc_type', 'budget_evm')
      .order('created_at',{ascending:false}).limit(1)
    if (budgetDocs?.[0]) {
      try {
        const saved = JSON.parse(budgetDocs[0].content)
        if (saved.tasks && saved.tasks.length > 0) {
          const first = saved.tasks[0]
          const isOld = first.bac !== undefined && !Array.isArray(first.pv_periods)
          if (isOld) {
            const NB = 12
            const cfg = saved.config || {}
            const s0 = new Date(cfg.start_date || new Date().toISOString().split('T')[0]).getTime()
            const e0 = new Date(cfg.end_date || new Date(Date.now()+365*86400000).toISOString().split('T')[0]).getTime()
            const dur = Math.max(e0-s0, 1)
            const pms = dur/NB
            const migrated: EVMTask[] = saved.tasks.map((t: any) => {
              const tbc = t.bac || (t.jh||0)*(t.rate||650)
              const ts = new Date(t.start_date||cfg.start_date||new Date()).getTime()
              const te = new Date(t.end_date||cfg.end_date||new Date(Date.now()+dur)).getTime()
              const pv_p = Array(NB).fill(0).map((_,i) => {
                const ps = s0+i*pms, pe = s0+(i+1)*pms
                const ov = Math.max(0, Math.min(te,pe)-Math.max(ts,ps))
                return Math.round(tbc*(ov/Math.max(te-ts,1)))
              })
              const ev_p = Array(NB).fill(0)
              if (t.pct_complete > 0) {
                const lp = Math.min(NB-1, Math.floor(t.pct_complete/100*NB))
                ev_p[lp] = t.pct_complete/100
              }
              const ac_p = Array(NB).fill(0)
              if (t.ac > 0) {
                const tot = pv_p.reduce((s: number,v: number)=>s+v,0)
                pv_p.forEach((pv: number,i: number) => { ac_p[i] = tot>0?Math.round(t.ac*(pv/tot)):0 })
              }
              return { id:t.id, wbs_id:t.wbs_id, name:t.name, role:t.role||'', tbc, pv_periods:pv_p, ev_periods:ev_p, ac_periods:ac_p }
            })
            const labels = Array.from({length:NB},(_,i) => {
              const d = new Date(s0+(i+.5)*pms)
              return d.toLocaleDateString('fr-FR',{month:'short',year:'2-digit'})
            })
            setTasks(migrated)
            setConfig({...DEFAULT_CONFIG, nb_periods:NB, period_labels:labels, project_title:cfg.project_title||''})
          } else {
            setTasks(saved.tasks)
            if (saved.config) setConfig({...DEFAULT_CONFIG,...saved.config})
          }
        }
      } catch(e) { console.error('Load error',e) }
    }
    setLoading(false)
  }

  async function save(t: EVMTask[], c: Config) {
    if (!t || t.length === 0) return
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const payload = {
        project_id: id,
        user_id: user.id,
        doc_type: 'budget_evm',
        title: 'Budget EVM — ' + (c.project_title || project?.name || id),
        content: JSON.stringify({ tasks: t, config: c }),
        status: 'generated',
      }
      // Try upsert first
      const { error } = await supabase.from('documents').upsert(payload, { onConflict: 'project_id,doc_type' })
      if (error) {
        // Fallback: delete then insert
        await supabase.from('documents').delete().eq('project_id', id).eq('doc_type', 'budget_evm')
        await supabase.from('documents').insert(payload)
      }
    } catch(e) { console.error('EVM save error:', e) }
  }

  function updatePeriod(taskId: string, arr: 'pv_periods'|'ev_periods'|'ac_periods', idx: number, val: number) {
    setTasks(prev => {
      const updated = prev.map(t => {
        if (t.id !== taskId) return t
        const newArr = [...(t[arr]||Array(N).fill(0))]
        while (newArr.length < N) newArr.push(0)
        newArr[idx] = val
        return {...t, [arr]:newArr}
      })
      save(updated, config)
      return updated
    })
  }

  function updateTask(taskId: string, field: string, value: any) {
    setTasks(prev => {
      const updated = prev.map(t => t.id!==taskId ? t : {...t, [field]:value})
      save(updated, config)
      return updated
    })
  }

  function loadDemoData() {
    const N2 = 12
    const CP2 = 6
    // Données calculées pour CPI=1.10 et SPI=0.90
    const demoTasks: EVMTask[] = [
      {id:'T1',wbs_id:'1.1',name:'Cadrage et initialisation',role:'Chef de Projet',tbc:7500,
       pv_periods:[3750,3750,0,0,0,0,0,0,0,0,0,0],
       ev_periods:[0,0,0,0,0,0,0.8438,0,0,0,0,0],
       ac_periods:[1477,1477,0,0,0,0,1273,0,0,0,0,0]},
      {id:'T2',wbs_id:'1.2',name:'Analyse de l existant',role:'Analyste',tbc:9600,
       pv_periods:[3200,3200,3200,0,0,0,0,0,0,0,0,0],
       ev_periods:[0,0,0,0,0,0,0.8438,0,0,0,0,0],
       ac_periods:[1890,1890,1890,0,0,0,628,0,0,0,0,0]},
      {id:'T3',wbs_id:'2.1',name:'Architecture cible',role:'Architecte',tbc:12000,
       pv_periods:[0,4000,4000,4000,0,0,0,0,0,0,0,0],
       ev_periods:[0,0,0,0,0,0,0.8438,0,0,0,0,0],
       ac_periods:[0,2364,2364,2364,0,0,787,0,0,0,0,0]},
      {id:'T4',wbs_id:'2.2',name:'Developpement migration',role:'Developpeur',tbc:26000,
       pv_periods:[0,0,4333,4333,4333,4333,4333,4335,0,0,0,0],
       ev_periods:[0,0,0,0,0,0,0.5625,0,0,0,0,0],
       ac_periods:[0,0,2560,2560,2560,2560,2558,0,0,0,0,0]},
      {id:'T5',wbs_id:'2.3',name:'Integration et tests',role:'QA/Testeur',tbc:11000,
       pv_periods:[0,0,0,0,0,2750,2750,2750,2750,0,0,0],
       ev_periods:[0,0,0,0,0,0,0.1688,0,0,0,0,0],
       ac_periods:[0,0,0,0,0,1624,541,0,0,0,0,0]},
      {id:'T6',wbs_id:'3.1',name:'Infrastructure DevOps',role:'DevOps',tbc:8400,
       pv_periods:[0,0,2100,2100,2100,2100,0,0,0,0,0,0],
       ev_periods:[0,0,0,0,0,0,0.8438,0,0,0,0,0],
       ac_periods:[0,0,1240,1240,1240,1240,647,0,0,0,0,0]},
      {id:'T7',wbs_id:'3.2',name:'Formation utilisateurs',role:'Analyste',tbc:5500,
       pv_periods:[0,0,0,0,0,0,0,0,2750,2750,0,0],
       ev_periods:[0,0,0,0,0,0,0,0,0,0,0,0],
       ac_periods:[0,0,0,0,0,0,0,0,0,0,0,0]},
      {id:'T8',wbs_id:'4.1',name:'Pilotage et gouvernance',role:'Chef de Projet',tbc:6000,
       pv_periods:[545,545,545,545,545,545,545,545,545,545,545,545],
       ev_periods:[0,0,0,0,0,0,0.8438,0,0,0,0,0],
       ac_periods:[322,322,322,322,322,322,234,0,0,0,0,0]},
    ]
    const demoConfig: Config = {
      project_title: project?.name || 'Projet Demo',
      manager: 'Chef de Projet PMP',
      report_date: new Date().toISOString().split('T')[0],
      current_period: CP2,
      period_labels: ['Jan','Fev','Mar','Avr','Mai','Jun','Jul','Aou','Sep','Oct','Nov','Dec'],
      nb_periods: N2,
    }
    setTasks(demoTasks)
    setConfig(demoConfig)
    save(demoTasks, demoConfig)
    setGenMsg('Donnees demo chargees ! CPI=1.10 SPI=0.90 — Periode courante : Juillet')
    setTimeout(() => setGenMsg(''), 5000)
  }

  function addTask() {
    const t: EVMTask = {
      id:'T'+Date.now(), wbs_id:(tasks.length+1)+'.0', name:'Nouvelle tache',
      role:'Developpeur', tbc:0,
      pv_periods:Array(N).fill(0), ev_periods:Array(N).fill(0), ac_periods:Array(N).fill(0),
    }
    const updated = [...tasks, t]
    setTasks(updated)
    save(updated, config)
  }

  function deleteTask(taskId: string) {
    if (!confirm('Supprimer cette tache ?')) return
    const updated = tasks.filter(t => t.id!==taskId)
    setTasks(updated)
    save(updated, config)
  }

  async function generateFromWBS() {
    setGenerating(true)
    setGenMsg('Generation depuis le WBS...')
    let wbsText = 'Projet '+(project?.name||'')
    if (wbsContent) {
      try {
        const stripped = wbsContent.replace(/[`]{3}json/gi,'').replace(/[`]{3}/g,'').trim()
        const m2 = stripped.match(/\{[\s\S]*\}/)
        if (m2) {
          try {
            const obj = JSON.parse(m2[0])
            if (obj.wbs) wbsText = Object.values(obj.wbs as Record<string,any>).map((v:any)=>v.id+' - '+v.name).join('\n')
            else wbsText = wbsContent.slice(0,2000)
          } catch { wbsText = wbsContent.slice(0,2000) }
        } else { wbsText = wbsContent.slice(0,2000) }
      } catch { wbsText = wbsContent.slice(0,2000) }
    }
    const ex = Array(N).fill(0).map((_,i) => i<2 ? Math.round(7500/2) : 0).join(',')
    const prompt = 'Tu es expert EVM/PMBOK 7. Genere un plan EVM par periodes pour ce projet.\n\n'
      + 'PROJET: '+(project?.name||'')+' | BUDGET: '+(project?.budget||'')+' | DUREE: '+(project?.duration||'12 periodes')+'\n'
      + 'WBS: '+wbsText+'\n\n'
      + 'Genere 6 a 10 taches. Pour chaque tache, repartis le TBC sur '+N+' periodes dans pv_periods.\n'
      + 'Reponds avec UNIQUEMENT le tableau JSON brut:\n'
      + '[{"id":"T1","wbs_id":"1.1","name":"Cadrage","role":"Chef de Projet","tbc":7500,'
      + '"pv_periods":['+ex+'],'
      + '"ev_periods":'+JSON.stringify(Array(N).fill(0))+','
      + '"ac_periods":'+JSON.stringify(Array(N).fill(0))+'}]'
    try {
      const res = await fetch('/api/generate', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({prompt, maxTokens:5000})
      })
      const data = await res.json()
      const text = data.text||''
      const si = text.indexOf('['), ei = text.lastIndexOf(']')
      if (si===-1||ei===-1) throw new Error('JSON non trouve')
      const parsed: EVMTask[] = JSON.parse(text.slice(si,ei+1))
      const norm = parsed.map(t => ({
        ...t,
        pv_periods:(t.pv_periods||[]).slice(0,N).concat(Array(Math.max(0,N-(t.pv_periods||[]).length)).fill(0)),
        ev_periods:(t.ev_periods||[]).slice(0,N).concat(Array(Math.max(0,N-(t.ev_periods||[]).length)).fill(0)),
        ac_periods:(t.ac_periods||[]).slice(0,N).concat(Array(Math.max(0,N-(t.ac_periods||[]).length)).fill(0)),
      }))
      const nc = {...config, project_title:project?.name||'', manager:'Chef de Projet'}
      setTasks(norm); setConfig(nc)
      await save(norm, nc)
      setGenMsg(norm.length+' taches generees !')
    } catch(e:any) { setGenMsg('Erreur: '+e.message) }
    setGenerating(false)
    setTimeout(()=>setGenMsg(''), 5000)
  }

  function exportCSV() {
    const hdrs = ['WBS','Tache','TBC','PV','EV','AC','CV','SV','CPI','SPI','EAC']
    const rows = tasks.map(t => {
      const pvT = pvC[cp]||0
      const evT = evC[cp]||0
      const acT = acC[cp]||0
      const cpiT = acT>0?evT/acT:1
      const eacT = cpiT>0?t.tbc/cpiT:t.tbc
      return [t.wbs_id, t.name, t.tbc, Math.round(pvT), Math.round(evT), Math.round(acT),
              Math.round(evT-acT), Math.round(evT-pvT), cpiT.toFixed(2),
              pvT>0?(evT/pvT).toFixed(2):'-', Math.round(eacT)]
    })
    const csv = [hdrs,...rows].map(r=>r.join(';')).join('\n')
    const blob = new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'EVM-'+(project?.name||'projet')+'.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  function exportExcel() {
    const doExport = () => {
      const XLSX = (window as any).XLSX
      if (!XLSX) return
      const wb = XLSX.utils.book_new()
      const perL = config.period_labels.slice(0,N)

      // ── Onglet 1 : PV ─────────────────────────────────
      const pvHdr = ['WBS','Tache','Role','TBC EUR',...perL.map(l=>l+' PV cum'),'BAC']
      const pvRows = tasks.map(t => {
        let s=0; const cum=(t.pv_periods||[]).slice(0,N).map(v=>{s+=v;return Math.round(s)})
        while(cum.length<N) cum.push(cum[cum.length-1]||0)
        return [t.wbs_id,t.name,t.role,t.tbc,...cum,t.tbc]
      })
      const pvFoot=['','TOTAL PV','',Math.round(bac),...pvC.slice(0,N).map(v=>Math.round(v||0)),Math.round(bac)]
      const ws1=XLSX.utils.aoa_to_sheet([pvHdr,...pvRows,[],pvFoot])
      ws1['!cols']=[{wch:7},{wch:28},{wch:16},{wch:10},...Array(N+1).fill({wch:9})]
      XLSX.utils.book_append_sheet(wb,ws1,'PV - Planned Value')

      // ── Onglet 2 : EV ─────────────────────────────────
      const evHdr = ['WBS','Tache','TBC EUR',...perL.map(l=>l+' %'),'EV Periode']
      const evRows = tasks.map(t => {
        const pcts=(t.ev_periods||[]).slice(0,N).map(v=>+(v||0).toFixed(3))
        while(pcts.length<N) pcts.push(0)
        const evCp=pcts[cp]||0
        return [t.wbs_id,t.name,t.tbc,...pcts,Math.round(evCp*t.tbc)]
      })
      const evFoot=['','TOTAL EV',Math.round(bac),...Array(N).fill(''),Math.round(ev)]
      const ws2=XLSX.utils.aoa_to_sheet([evHdr,...evRows,[],evFoot])
      ws2['!cols']=[{wch:7},{wch:28},{wch:10},...Array(N+1).fill({wch:8})]
      XLSX.utils.book_append_sheet(wb,ws2,'EV - Earned Value')

      // ── Onglet 3 : AC ─────────────────────────────────
      const acHdr = ['WBS','Tache','TBC EUR',...perL.map(l=>l+' AC'),'Total AC','CV EUR','CV%']
      const acRows = tasks.map(t => {
        const acp=(t.ac_periods||[]).slice(0,N).map(v=>Math.round(v||0))
        while(acp.length<N) acp.push(0)
        const totalAC=acp.reduce((s,v)=>s+v,0)
        const evCp=(t.ev_periods||[])[cp]||0; const evVal=Math.round(evCp*t.tbc)
        const cvT=evVal-totalAC; const cvPct=totalAC>0?+(cvT/totalAC*100).toFixed(1):0
        return [t.wbs_id,t.name,t.tbc,...acp,totalAC,cvT,cvPct]
      })
      const acFoot=['','TOTAL AC',Math.round(bac),...acC.slice(0,N).map(v=>Math.round(v||0)),Math.round(ac),Math.round(cv),'']
      const ws3=XLSX.utils.aoa_to_sheet([acHdr,...acRows,[],acFoot])
      ws3['!cols']=[{wch:7},{wch:28},{wch:10},...Array(N).fill({wch:9}),{wch:10},{wch:10},{wch:7}]
      XLSX.utils.book_append_sheet(wb,ws3,'AC - Actual Cost')

      // ── Onglet 4 : Courbe S + KPIs ────────────────────
      const sHdr=['Periode','PV Cumulatif','EV Cumulatif','AC Cumulatif','EAC Projection','CV','SV','CPI','SPI']
      const sRows=perL.map((l,i)=>{
        const pvI=Math.round(pvC[i]||0)
        const evI=i<=cp?Math.round(evC[i]||0):null
        const acI=i<=cp?Math.round(acC[i]||0):null
        const cpiI=evI&&acI&&acI>0?+(evI/acI).toFixed(2):null
        const spiI=evI&&pvI>0?+(evI/pvI).toFixed(2):null
        const eacP=i>=cp&&cpi>0?Math.round(ac+(pvC[i]-pvC[cp])/cpi):null
        return[l,pvI,evI,acI,eacP,evI&&acI?evI-acI:null,evI?evI-pvI:null,cpiI,spiI]
      })
      const kpis=[
        [],[' INDICATEURS EVM','Valeur','Interpretation'],
        ['BAC Budget at Completion',Math.round(bac)+'EUR','Budget initial'],
        ['EAC Estimate at Completion',Math.round(eac)+'EUR',eac>bac?'ALERTE depassement BAC':'OK sous BAC'],
        ['ETC Estimate to Complete',Math.round(etc)+'EUR','Reste a depenser'],
        ['VAC Variance at Completion',Math.round(vac)+'EUR',vac>=0?'Economies prevues':'Depassement prevu'],
        ['CPI Cost Performance Index',+cpi.toFixed(2),cpi>=1?'Sous budget':'Surcout'],
        ['SPI Schedule Performance Index',+spi.toFixed(2),spi>=1?'En avance':'En retard'],
        ['TCPI To Complete Perf. Index',+tcpi.toFixed(2),tcpi<=1.1?'Atteignable':'Difficile'],
        ['CV Cost Variance',Math.round(cv)+'EUR',cv>=0?'Economies':'Surcout'],
        ['SV Schedule Variance',Math.round(sv)+'EUR',sv>=0?'En avance':'En retard'],
        [],['Periode courante',config.period_labels[cp]||'P'+(cp+1),''],
        ['Projet',config.project_title||project?.name||'',''],
        ['Date rapport',config.report_date,''],
        ['Prepare par',config.manager||'',''],
      ]
      const ws4=XLSX.utils.aoa_to_sheet([sHdr,...sRows,...kpis])
      ws4['!cols']=[{wch:12},{wch:14},{wch:14},{wch:14},{wch:14},{wch:12},{wch:12},{wch:8},{wch:8}]
      XLSX.utils.book_append_sheet(wb,ws4,'Courbe S et Metriques')

      // ── Onglet 5 : Page de garde ──────────────────────
      const pg=[
        ['EARNED VALUE MANAGEMENT — RAPPORT DE PERFORMANCE'],
        [],
        ['Projet',config.project_title||project?.name||''],
        ['Periode courante',config.period_labels[cp]||'P'+(cp+1)],
        ['Date rapport',config.report_date],
        ['Prepare par',config.manager||'Chef de Projet'],
        [],
        ['INDICATEUR','VALEUR','STATUT'],
        ['BAC',Math.round(bac),'Budget initial'],
        ['EAC',Math.round(eac),eac>bac?'DEPASSEMENT':'OK'],
        ['ETC',Math.round(etc),'Reste a depenser'],
        ['VAC',Math.round(vac),vac>=0?'Economies':'Depassement prevu'],
        ['CPI',+cpi.toFixed(2),cpi>=1?'Sous budget':'Surcout'],
        ['SPI',+spi.toFixed(2),spi>=1?'En avance':'En retard'],
        ['TCPI',+tcpi.toFixed(2),tcpi<=1.1?'Atteignable':'Difficile'],
        ['CV',Math.round(cv),cv>=0?'OK':'Surcout'],
        ['SV',Math.round(sv),sv>=0?'En avance':'En retard'],
      ]
      const ws0=XLSX.utils.aoa_to_sheet(pg)
      ws0['!cols']=[{wch:28},{wch:16},{wch:20}]
      XLSX.utils.book_append_sheet(wb,ws0,'Rapport EVM',true)

      XLSX.writeFile(wb,'EVM-'+(project?.name||'projet')+'-'+(config.period_labels[cp]||'P'+(cp+1))+'.xlsx')
    }
    if((window as any).XLSX){ doExport() }
    else {
      const s=document.createElement('script')
      s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
      s.onload=doExport; document.head.appendChild(s)
    }
  }


  const iS = {width:'58px',padding:'2px 4px',background:'var(--ink)',border:'1px solid var(--line2)',borderRadius:3,color:'var(--text)',fontSize:10,fontFamily:'monospace' as const,textAlign:'center' as const}
  const cS = {fontSize:10,fontFamily:'monospace' as const,textAlign:'right' as const}
  const activeHref = '/projects/'+id+'/budget'

  if (loading) {
    return (
      <AppLayout>
        <div style={{textAlign:'center',padding:60,color:'var(--muted)'}}>Chargement...</div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16}}>
        <div>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
            <button onClick={()=>router.push('/projects/'+id)} style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',fontSize:12}}>{'<-'} Projet</button>
            <span style={{color:'var(--dim)'}}>{'>'}</span>
            <span style={{fontSize:12,color:'var(--dim)'}}>{project?.name}</span>
          </div>
          <div className="sec-label">// Earned Value Management</div>
          <h1 className="sec-title" style={{marginBottom:4}}>Budget et Suivi EVM</h1>
        </div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          {tasks.length>0 && <button onClick={exportCSV} className="btn-ghost" style={{fontSize:11}}>↓ CSV</button>}
          {tasks.length>0 && <button onClick={exportExcel} className="btn-ghost" style={{fontSize:11,color:'var(--green)',borderColor:'rgba(53,200,144,.3)'}}>↓ Excel 4 onglets</button>}
          <button onClick={loadDemoData} className="btn-ghost" style={{fontSize:11,color:'var(--cyan)',borderColor:'rgba(58,207,207,.3)'}}>
            Demo CPI=1.1 SPI=0.9
          </button>
          <button onClick={addTask} className="btn-ghost" style={{fontSize:11}}>+ Tache</button>
          <button onClick={generateFromWBS} className="btn-gold" disabled={generating} style={{fontSize:11}}>
            {generating ? 'Generation...' : 'Generer depuis WBS'}
          </button>
        </div>
      </div>

      <div style={{display:'flex',gap:5,marginBottom:16,borderBottom:'1px solid var(--line)',paddingBottom:12,flexWrap:'wrap'}}>
        {NAV_LABELS.map(label => {
          const href = getNavHref(label, id)
          return (
            <button key={href} onClick={()=>router.push(href)}
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

      {tasks.length===0 ? (
        <div style={{textAlign:'center',padding:'80px 20px',background:'var(--ink2)',border:'1.5px solid var(--line)',borderRadius:14}}>
          <div style={{fontSize:56,marginBottom:16,opacity:.4}}>{'💰'}</div>
          <div style={{fontFamily:'var(--syne)',fontSize:20,fontWeight:700,color:'var(--white)',marginBottom:10}}>Aucun plan EVM</div>
          <div style={{fontSize:13,color:'var(--muted)',marginBottom:28,maxWidth:500,margin:'0 auto 28px',lineHeight:1.8}}>
            Importez les donnees depuis le WBS Dict ou generez automatiquement.
          </div>
          <div style={{display:'flex',gap:12,justifyContent:'center'}}>
            <button className="btn-gold" onClick={generateFromWBS} disabled={generating} style={{fontSize:13}}>
              {generating?'Generation...':'Generer depuis WBS'}
            </button>
            <button className="btn-ghost" onClick={()=>router.push('/projects/'+id+'/wbs-dict')} style={{fontSize:13}}>
              Aller au WBS Dict
            </button>
          </div>
        </div>
      ) : (
        <>
          <div style={{background:'var(--ink2)',border:'1.5px solid var(--line)',borderRadius:10,padding:'12px 16px',marginBottom:12}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
              <div style={{fontSize:12,fontWeight:600,color:'var(--muted)'}}>
                Periode courante :
                <select value={cp} onChange={e=>{const nc={...config,current_period:+e.target.value};setConfig(nc);save(tasks,nc)}}
                  style={{marginLeft:8,padding:'2px 8px',background:'var(--ink3)',border:'1px solid var(--line2)',borderRadius:5,color:'var(--gold2)',fontSize:11}}>
                  {config.period_labels.slice(0,N).map((l,i)=><option key={i} value={i}>{l}</option>)}
                </select>
              </div>
              <div style={{fontSize:10,color:'var(--dim)'}}>BAC total : <strong style={{color:'var(--white)'}}>{fmtEur(bac)}</strong></div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(8,1fr)',gap:8}}>
              {[
                {l:'PV', v:fmtEur(pv), c:'#4285F4', s:'Planifie'},
                {l:'EV', v:fmtEur(ev), c:'var(--green)', s:'Acquis'},
                {l:'AC', v:fmtEur(ac), c:'var(--red)', s:'Reel'},
                {l:'CV', v:fmtEur(cv), c:cv>=0?'var(--green)':'var(--red)', s:cv>=0?'OK':'Surcout'},
                {l:'SV', v:fmtEur(sv), c:sv>=0?'var(--green)':'var(--red)', s:sv>=0?'Avance':'Retard'},
                {l:'CPI',v:fmtN(cpi),  c:idxColor(cpi), s:'Perf cout'},
                {l:'SPI',v:fmtN(spi),  c:idxColor(spi), s:'Perf delai'},
                {l:'EAC',v:fmtEur(eac),c:eac>bac?'var(--red)':'var(--amber)', s:'Prevision'},
              ].map(k=>(
                <div key={k.l} style={{textAlign:'center'}}>
                  <div style={{fontSize:8,color:'var(--dim)',textTransform:'uppercase',marginBottom:3}}>{k.l}</div>
                  <div style={{fontSize:13,fontWeight:700,color:k.c}}>{k.v}</div>
                  <div style={{fontSize:8,color:k.c,marginTop:1}}>{k.s}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{display:'flex',gap:6,marginBottom:16,flexWrap:'wrap'}}>
            {(['report','ev','ac','courbe','guide','config'] as const).map(tid => {
              const labels: Record<string,string> = {
                report:'Rapport EVM', ev:'Feuille EV', ac:'Feuille AC',
                courbe:'Courbe S', guide:'Guide EVM', config:'Configuration'
              }
              const icons: Record<string,string> = {
                report:'📊', ev:'📈', ac:'💸', courbe:'📉', guide:'📖', config:'⚙'
              }
              return (
                <button key={tid} onClick={()=>setActiveTab(tid)}
                  style={{padding:'7px 14px',fontSize:11,cursor:'pointer',borderRadius:8,border:'1px solid var(--line2)',background:activeTab===tid?'rgba(212,168,75,.15)':'transparent',color:activeTab===tid?'var(--gold2)':'var(--muted)',fontWeight:activeTab===tid?600:400,transition:'all .12s',fontFamily:'var(--mono)'}}>
                  {icons[tid]} {labels[tid]}
                </button>
              )
            })}
          </div>

          {activeTab==='report' && (
            <div>
              <div style={{background:'var(--ink2)',border:'1.5px solid var(--line)',borderRadius:10,padding:'16px 20px',marginBottom:12,display:'flex',justifyContent:'space-between'}}>
                <div>
                  <div style={{fontFamily:'var(--syne)',fontSize:18,fontWeight:700,color:'var(--white)',marginBottom:4}}>{config.project_title||project?.name}</div>
                  <div style={{fontSize:12,color:'var(--muted)'}}>Rapport Earned Value Analysis</div>
                </div>
                <div style={{textAlign:'right',fontSize:11,color:'var(--dim)'}}>
                  <div>Periode : <strong style={{color:'var(--gold2)'}}>{config.period_labels[cp]||'P'+(cp+1)}</strong></div>
                  <div style={{marginTop:4}}>{config.report_date}</div>
                </div>
              </div>
              <div className="card">
                <div className="card-hdr"><div className="card-title">Planned Value — Budget planifie cumulatif</div></div>
                <div style={{margin:'8px 16px 0',padding:'10px 14px',background:'rgba(66,133,244,.06)',border:'1px solid rgba(66,133,244,.2)',borderRadius:8,fontSize:11,color:'var(--muted)',lineHeight:1.7}}>
                  <strong style={{color:'#4285F4'}}>PV (Planned Value) :</strong> Budget cumulatif prévu à chaque période, calculé automatiquement depuis le TBC et les dates du WBS Dict.
                  <span style={{color:'var(--dim)',marginLeft:8}}>Ne pas modifier — c'est la référence de base du projet.</span>
                </div>
                <div style={{overflowX:'auto'}}>
                  <table className="table" style={{minWidth:800}}>
                    <thead>
                      <tr>
                        <th style={{fontSize:9}}>WBS</th>
                        <th style={{fontSize:9,minWidth:140}}>Tache</th>
                        <th style={{fontSize:9}}>TBC</th>
                        {config.period_labels.slice(0,N).map((l,i)=>(
                          <th key={i} style={{fontSize:9,background:i===cp?'rgba(212,168,75,.1)':''}}>{l}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tasks.map(t=>{
                        const cs = cumSum((t.pv_periods||[]).slice(0,N))
                        return (
                          <tr key={t.id}>
                            <td style={{fontSize:10,color:'var(--dim)',fontFamily:'monospace'}}>{t.wbs_id}</td>
                            <td style={{fontSize:11,color:'var(--text)',fontWeight:500}}>{t.name}</td>
                            <td style={{...cS,color:'var(--gold2)',fontWeight:600}}>{Math.round(t.tbc).toLocaleString('fr-FR')}</td>
                            {cs.map((v,i)=>(
                              <td key={i} style={{...cS,color:i===cp?'#4285F4':'var(--muted)',background:i===cp?'rgba(66,133,244,.06)':''}}>
                                {v>0?Math.round(v).toLocaleString('fr-FR'):'-'}
                              </td>
                            ))}
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{background:'rgba(66,133,244,.06)',borderTop:'2px solid #4285F4'}}>
                        <td colSpan={2} style={{fontSize:11,fontWeight:700,color:'#4285F4',padding:'8px 16px'}}>Total PV</td>
                        <td style={{...cS,color:'var(--gold2)',fontWeight:700}}>{Math.round(bac).toLocaleString('fr-FR')}</td>
                        {pvC.map((v,i)=>(
                          <td key={i} style={{...cS,color:'#4285F4',fontWeight:600,background:i===cp?'rgba(66,133,244,.1)':''}}>
                            {Math.round(v).toLocaleString('fr-FR')}
                          </td>
                        ))}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
              <div className="card" style={{marginTop:12}}>
                <div className="card-hdr"><div className="card-title">Metriques EVM par periode</div></div>
                <div style={{overflowX:'auto'}}>
                  <table className="table" style={{minWidth:800}}>
                    <thead>
                      <tr>
                        <th style={{fontSize:9,minWidth:180}}>Indicateur</th>
                        {config.period_labels.slice(0,N).map((l,i)=>(
                          <th key={i} style={{fontSize:9,background:i===cp?'rgba(212,168,75,.1)':''}}>{l}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        {l:'AC cumulatif', arr:acC, c:'var(--red)'},
                        {l:'EV cumulatif', arr:evC, c:'var(--green)'},
                      ].map(row=>(
                        <tr key={row.l}>
                          <td style={{fontSize:11,color:row.c,fontWeight:500}}>{row.l}</td>
                          {row.arr.slice(0,N).map((v,i)=>(
                            <td key={i} style={{...cS,color:i<=cp?row.c:'var(--dim)',background:i===cp?'rgba(212,168,75,.04)':''}}>
                              {i<=cp&&v>0?Math.round(v).toLocaleString('fr-FR'):'-'}
                            </td>
                          ))}
                        </tr>
                      ))}
                      {[
                        {l:'CV (EV-AC)', fn:(i:number)=>i<=cp?evC[i]-acC[i]:null, isIdx:false, pos:true},
                        {l:'SV (EV-PV)', fn:(i:number)=>i<=cp?evC[i]-pvC[i]:null, isIdx:false, pos:true},
                        {l:'CPI (EV/AC)', fn:(i:number)=>i<=cp&&acC[i]>0?evC[i]/acC[i]:null, isIdx:true, pos:false},
                        {l:'SPI (EV/PV)', fn:(i:number)=>i<=cp&&pvC[i]>0?evC[i]/pvC[i]:null, isIdx:true, pos:false},
                        {l:'EAC (BAC/CPI)', fn:(i:number)=>{if(i>cp)return null;const c2=acC[i]>0?evC[i]/acC[i]:1;return c2>0?bac/c2:bac}, isIdx:false, pos:false},
                      ].map(row=>(
                        <tr key={row.l}>
                          <td style={{fontSize:11,color:'var(--muted)',fontWeight:500}}>{row.l}</td>
                          {Array.from({length:N},(_,i)=>{
                            const v=row.fn(i)
                            if(v===null) return <td key={i} style={{...cS,color:'var(--dim)'}}>-</td>
                            const col = row.isIdx ? idxColor(v) : row.pos===true ? (v>=0?'var(--green)':'var(--red)') : 'var(--amber)'
                            return <td key={i} style={{...cS,color:col,background:i===cp?'rgba(212,168,75,.04)':''}}>
                              {row.isIdx ? v.toFixed(2) : Math.round(v).toLocaleString('fr-FR')}
                            </td>
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab==='ev' && (
            <div className="card">
              <div className="card-hdr">
                <div className="card-title">Feuille EV — % avancement cumule par periode (0 a 1)</div>
              </div>
              <div style={{margin:'8px 16px 0',padding:'10px 14px',background:'rgba(53,200,144,.06)',border:'1px solid rgba(53,200,144,.2)',borderRadius:8,fontSize:11,color:'var(--muted)',lineHeight:1.7}}>
                <strong style={{color:'var(--green)'}}>Comment remplir :</strong> Saisir le <strong style={{color:'var(--text)'}}>% cumulé réalisé</strong> entre 0 et 1 pour chaque tâche à chaque période.
                <span style={{color:'var(--dim)',marginLeft:8}}>Ex : 0.25 = 25% · 0.50 = 50% · 1.00 = 100% terminé</span>
                <br/>
                <strong style={{color:'var(--green)'}}>Règle :</strong> La valeur doit être <strong style={{color:'var(--text)'}}>croissante</strong> — on ne peut pas "désavancer". Laisser 0 si la tâche n'a pas démarré.
              </div>
              <div style={{overflowX:'auto'}}>
                <table className="table" style={{minWidth:900}}>
                  <thead>
                    <tr>
                      <th style={{fontSize:9}}>WBS</th>
                      <th style={{fontSize:9,minWidth:140}}>Tache</th>
                      <th style={{fontSize:9}}>TBC</th>
                      {config.period_labels.slice(0,N).map((l,i)=>(
                        <th key={i} style={{fontSize:9,background:i===cp?'rgba(53,200,144,.1)':''}}>{l}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map(t=>(
                      <tr key={t.id}>
                        <td style={{fontSize:10,color:'var(--dim)',fontFamily:'monospace'}}>{t.wbs_id}</td>
                        <td style={{fontSize:11,color:'var(--text)',fontWeight:500}}>{t.name}</td>
                        <td style={{...cS,color:'var(--gold2)',fontWeight:600}}>{Math.round(t.tbc).toLocaleString('fr-FR')}</td>
                        {Array.from({length:N},(_,i)=>(
                          <td key={i} style={{background:i===cp?'rgba(53,200,144,.06)':''}}>
                            <input type="number" min={0} max={1} step={0.05}
                              value={(t.ev_periods||[])[i]||0}
                              onChange={e=>updatePeriod(t.id,'ev_periods',i,Math.min(1,+e.target.value))}
                              style={{...iS,color:'var(--green)'}}/>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{background:'rgba(53,200,144,.06)',borderTop:'2px solid var(--green)'}}>
                      <td colSpan={2} style={{fontSize:11,fontWeight:700,color:'var(--green)',padding:'8px 16px'}}>EV Cumulatif</td>
                      <td></td>
                      {evC.slice(0,N).map((v,i)=>(
                        <td key={i} style={{...cS,color:'var(--green)',fontWeight:600,background:i===cp?'rgba(53,200,144,.1)':''}}>
                          {i<=cp&&v>0?Math.round(v).toLocaleString('fr-FR'):'-'}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {activeTab==='ac' && (
            <div className="card">
              <div className="card-hdr">
                <div className="card-title">Feuille AC — Couts reels par periode (en EUR)</div>
              </div>
              <div style={{margin:'8px 16px 0',padding:'10px 14px',background:'rgba(240,96,96,.06)',border:'1px solid rgba(240,96,96,.2)',borderRadius:8,fontSize:11,color:'var(--muted)',lineHeight:1.7}}>
                <strong style={{color:'var(--red)'}}>Comment remplir :</strong> Saisir les <strong style={{color:'var(--text)'}}>coûts réels dépensés</strong> (en €) pour chaque tâche à chaque période.
                <span style={{color:'var(--dim)',marginLeft:8}}>Ex : factures prestataires, salaires, licences de cette période</span>
                <br/>
                <strong style={{color:'var(--red)'}}>Attention :</strong> Saisir le montant de <strong style={{color:'var(--text)'}}>la période uniquement</strong> (pas le cumulatif) — le total cumulatif est calculé automatiquement sur la ligne du bas.
              </div>
              <div style={{overflowX:'auto'}}>
                <table className="table" style={{minWidth:900}}>
                  <thead>
                    <tr>
                      <th style={{fontSize:9}}>WBS</th>
                      <th style={{fontSize:9,minWidth:140}}>Tache</th>
                      <th style={{fontSize:9}}>TBC</th>
                      {config.period_labels.slice(0,N).map((l,i)=>(
                        <th key={i} style={{fontSize:9,background:i===cp?'rgba(240,96,96,.1)':''}}>{l}</th>
                      ))}
                      <th style={{fontSize:9}}>Total AC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map(t=>{
                      const totalAC = (t.ac_periods||[]).reduce((s,v)=>s+(v||0),0)
                      return (
                        <tr key={t.id}>
                          <td style={{fontSize:10,color:'var(--dim)',fontFamily:'monospace'}}>{t.wbs_id}</td>
                          <td style={{fontSize:11,color:'var(--text)',fontWeight:500}}>{t.name}</td>
                          <td style={{...cS,color:'var(--gold2)',fontWeight:600}}>{Math.round(t.tbc).toLocaleString('fr-FR')}</td>
                          {Array.from({length:N},(_,i)=>(
                            <td key={i} style={{background:i===cp?'rgba(240,96,96,.06)':''}}>
                              <input type="number" min={0}
                                value={(t.ac_periods||[])[i]||0}
                                onChange={e=>updatePeriod(t.id,'ac_periods',i,+e.target.value)}
                                style={{...iS,color:'var(--red)'}}/>
                            </td>
                          ))}
                          <td style={{...cS,color:totalAC>t.tbc?'var(--red)':'var(--muted)',fontWeight:600}}>
                            {Math.round(totalAC).toLocaleString('fr-FR')}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{background:'rgba(240,96,96,.06)',borderTop:'2px solid var(--red)'}}>
                      <td colSpan={2} style={{fontSize:11,fontWeight:700,color:'var(--red)',padding:'8px 16px'}}>Total AC periode</td>
                      <td></td>
                      {Array.from({length:N},(_,i)=>{
                        const tot=tasks.reduce((s,t)=>s+((t.ac_periods||[])[i]||0),0)
                        return <td key={i} style={{...cS,color:'var(--red)',fontWeight:600,background:i===cp?'rgba(240,96,96,.1)':''}}>
                          {tot>0?Math.round(tot).toLocaleString('fr-FR'):'-'}
                        </td>
                      })}
                      <td></td>
                    </tr>
                    <tr style={{background:'rgba(240,96,96,.03)'}}>
                      <td colSpan={2} style={{fontSize:11,fontWeight:700,color:'var(--red)',padding:'4px 16px'}}>AC Cumulatif</td>
                      <td></td>
                      {acC.slice(0,N).map((v,i)=>(
                        <td key={i} style={{...cS,color:'var(--red)',background:i===cp?'rgba(240,96,96,.1)':''}}>
                          {i<=cp&&v>0?Math.round(v).toLocaleString('fr-FR'):'-'}
                        </td>
                      ))}
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {activeTab==='courbe' && (
            <div>
              <div className="card" style={{marginBottom:16,overflow:'visible'}}>
                <div className="card-hdr">
                  <div className="card-title">Courbe S — EVM dynamique</div>
                  <div style={{fontSize:10,color:'var(--dim)'}}>Mise a jour automatique a chaque saisie</div>
                </div>
                <div style={{padding:0,background:'#F8FAFC',borderRadius:6,height:520}} className="evm-bg">
                  <style dangerouslySetInnerHTML={{__html:`.evm-bg,.evm-bg *,.evm-bg canvas,.evm-bg svg{background:#F8FAFC !important;color:#1E293B}`}}/>
                  <EVMChart pvC={pvC} evC={evC} acC={acC} bac={bac} cpi={cpi} cp={cp} N={N} labels={config.period_labels}/>
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12}}>
                {[
                  {title:'Analyse Cout', items:[
                    {l:'CPI', v:fmtN(cpi), c:idxColor(cpi), d:cpi>=1?'Sous budget':'Depassement'},
                    {l:'CV',  v:fmtEur(cv), c:cv>=0?'var(--green)':'var(--red)', d:cv>=0?'Economies':'Surcout'},
                    {l:'EAC', v:fmtEur(eac),c:'var(--amber)', d:'Cout final prevu'},
                    {l:'VAC', v:fmtEur(vac),c:vac>=0?'var(--green)':'var(--red)', d:vac>=0?'Economie':'Depassement'},
                  ]},
                  {title:'Analyse Delais', items:[
                    {l:'SPI', v:fmtN(spi), c:idxColor(spi), d:spi>=1?'En avance':'En retard'},
                    {l:'SV',  v:fmtEur(sv), c:sv>=0?'var(--green)':'var(--red)', d:sv>=0?'Avance':'Retard'},
                    {l:'PV',  v:fmtEur(pv), c:'#4285F4', d:'Valeur planifiee'},
                    {l:'EV',  v:fmtEur(ev), c:'var(--green)', d:'Valeur acquise'},
                  ]},
                  {title:'Previsions', items:[
                    {l:'BAC',  v:fmtEur(bac), c:'var(--white)', d:'Budget initial'},
                    {l:'AC',   v:fmtEur(ac),  c:'var(--red)', d:'Cout reel cumul'},
                    {l:'ETC',  v:fmtEur(etc), c:'var(--muted)', d:'Reste a depenser'},
                    {l:'TCPI', v:fmtN(tcpi),  c:idxColor(1/Math.max(0.01,tcpi)), d:tcpi<=1?'Atteignable':'Difficile'},
                  ]},
                ].map(section=>(
                  <div key={section.title} className="card">
                    <div className="card-hdr"><div className="card-title">{section.title}</div></div>
                    <div className="card-body">
                      {section.items.map(item=>(
                        <div key={item.l} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'7px 0',borderBottom:'1px solid var(--line)'}}>
                          <div>
                            <div style={{fontSize:9,color:'var(--dim)',textTransform:'uppercase',letterSpacing:'.06em'}}>{item.l}</div>
                            <div style={{fontSize:9,color:item.c,marginTop:1}}>{item.d}</div>
                          </div>
                          <div style={{fontFamily:'var(--syne)',fontSize:14,fontWeight:700,color:item.c}}>{item.v}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab==='guide' && (
            <div style={{display:'flex',flexDirection:'column',gap:16}}>
              <div style={{background:'linear-gradient(135deg,rgba(212,168,75,.08),rgba(58,207,207,.05))',border:'1.5px solid rgba(212,168,75,.2)',borderRadius:12,padding:'20px 24px'}}>
                <div style={{fontFamily:'var(--syne)',fontSize:18,fontWeight:700,color:'var(--white)',marginBottom:8}}>Guide Earned Value Management (EVM)</div>
                <div style={{fontSize:13,color:'var(--muted)',lineHeight:1.8}}>
                  Methode PMI/PMBOK 7 qui integre perimetre, delais et couts pour mesurer la performance projet.
                </div>
              </div>
              <div className="card">
                <div className="card-hdr"><div className="card-title">Les 3 valeurs fondamentales</div></div>
                <div className="card-body">
                  <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16}}>
                    {[
                      {color:'#4285F4', name:'PV - Planned Value', fr:'Valeur Planifiee',
                       def:'Budget prevu pour le travail planifie a une date donnee.',
                       how:'Calcule automatiquement depuis le TBC reparti par periode selon les dates WBS Dict.',
                       ex:'Tache de 10 000 EUR sur 4 mois = PV 2 500 EUR par mois'},
                      {color:'#35C890', name:'EV - Earned Value', fr:'Valeur Acquise',
                       def:'Valeur du travail reellement accompli en euros.',
                       how:'Saisir dans Feuille EV le % cumule (0 a 1) par tache par periode.',
                       ex:'Tache 10 000 EUR a 60% = EV 6 000 EUR'},
                      {color:'#F06060', name:'AC - Actual Cost', fr:'Cout Reel',
                       def:'Couts reels engages pour le travail accompli.',
                       how:'Saisir dans Feuille AC les couts depenses par tache par periode.',
                       ex:'Tache payee 7 000 EUR alors que prevue 6 000 EUR'},
                    ].map(v=>(
                      <div key={v.name} style={{padding:'16px',background:'var(--ink)',border:'1.5px solid '+v.color+'33',borderRadius:10}}>
                        <div style={{fontSize:13,fontWeight:700,color:v.color,marginBottom:4}}>{v.name}</div>
                        <div style={{fontSize:10,color:'var(--dim)',marginBottom:8}}>{v.fr}</div>
                        <div style={{fontSize:11,color:'var(--muted)',lineHeight:1.7,marginBottom:8}}>{v.def}</div>
                        <div style={{fontSize:11,color:'var(--dim)',background:'var(--ink2)',borderRadius:6,padding:'8px',marginBottom:6}}>
                          <strong style={{color:v.color}}>Remplir : </strong>{v.how}
                        </div>
                        <div style={{fontSize:10,color:'var(--dim)',fontStyle:'italic'}}>{v.ex}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="card">
                <div className="card-hdr"><div className="card-title">Formules EVM et interpretation</div></div>
                <div className="card-body">
                  <div style={{overflowX:'auto'}}>
                    <table className="table">
                      <thead><tr><th>Indicateur</th><th>Formule</th><th>Ideal</th><th>Interpretation</th><th>Action</th></tr></thead>
                      <tbody>
                        {[
                          {n:'CV Cost Variance',c:'var(--green)',f:'CV = EV - AC',i:'CV > 0',t:'Positif = sous budget. Negatif = depassement.',a:'Analyser les taches en rouge'},
                          {n:'SV Schedule Variance',c:'var(--green)',f:'SV = EV - PV',i:'SV > 0',t:'Positif = en avance. Negatif = en retard.',a:'Prioriser les taches critiques'},
                          {n:'CPI Cost Performance',c:'var(--cyan)',f:'CPI = EV / AC',i:'CPI >= 1',t:'>=1 OK. 0.9-1 attention. <0.9 alerte rouge.',a:'CPI<0.9 : revoir les ressources'},
                          {n:'SPI Schedule Performance',c:'var(--cyan)',f:'SPI = EV / PV',i:'SPI >= 1',t:'>=1 en avance. <1 en retard.',a:'SPI<0.9 : accelerer les taches'},
                          {n:'EAC Estimate At Completion',c:'var(--amber)',f:'EAC = BAC / CPI',i:'EAC <= BAC',t:'Prevision du cout total final.',a:'EAC>BAC : alerter le sponsor'},
                          {n:'ETC Estimate To Complete',c:'var(--amber)',f:'ETC = EAC - AC',i:'ETC <= BAC-AC',t:'Budget restant necessaire pour finir.',a:'Comparer avec budget disponible'},
                          {n:'VAC Variance At Completion',c:'var(--purple)',f:'VAC = BAC - EAC',i:'VAC >= 0',t:'Positif = economies. Negatif = depassement prevu.',a:'Si negatif : plan de recuperation'},
                          {n:'TCPI To Complete Performance',c:'var(--purple)',f:'TCPI = (BAC-EV)/(BAC-AC)',i:'TCPI <= 1.1',t:'Efficacite requise sur le restant.',a:'TCPI>1.1 : revoir le BAC'},
                        ].map(f=>(
                          <tr key={f.n}>
                            <td style={{fontWeight:600,color:f.c,fontSize:11}}>{f.n}</td>
                            <td style={{fontFamily:'monospace',fontSize:11,color:'var(--text)'}}>{f.f}</td>
                            <td style={{fontSize:11,color:'var(--green)'}}>{f.i}</td>
                            <td style={{fontSize:11,color:'var(--muted)',minWidth:200}}>{f.t}</td>
                            <td style={{fontSize:10,color:'var(--dim)',minWidth:160}}>{f.a}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
              <div className="card">
                <div className="card-hdr"><div className="card-title">Comment utiliser ce tableau - Etapes</div></div>
                <div className="card-body">
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
                    <div>
                      {[
                        {s:'1',c:'var(--gold2)',t:'Initialiser depuis WBS Dict',d:'Aller dans WBS Dict, renseigner JH et dates, cliquer Exporter vers EVM. Le PV est calcule automatiquement.'},
                        {s:'2',c:'#4285F4',t:'Configurer les periodes',d:'Dans Config, definir les libelles (Sem 1, Jan 25...) et le nombre de periodes.'},
                        {s:'3',c:'#35C890',t:'Saisir avancement EV',d:'Dans Feuille EV, saisir le % cumule (entre 0 et 1) par tache chaque periode. Exemple 0.25 = 25%.'},
                        {s:'4',c:'#F06060',t:'Saisir les couts reels AC',d:'Dans Feuille AC, saisir les couts depenses cette periode pour chaque tache en euros.'},
                        {s:'5',c:'var(--purple)',t:'Analyser la Courbe S',d:'La courbe se met a jour automatiquement. Choisir la periode courante pour voir les metriques.'},
                        {s:'6',c:'var(--amber)',t:'Surveiller les alertes',d:'CPI<0.9 = depassement. SPI<0.9 = retard. EAC>BAC = budget insuffisant. Agir immediatement.'},
                      ].map(s=>(
                        <div key={s.s} style={{display:'flex',gap:12,padding:'12px 0',borderBottom:'1px solid var(--line)'}}>
                          <div style={{width:28,height:28,borderRadius:'50%',background:s.c+'22',border:'1.5px solid '+s.c,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:s.c,flexShrink:0}}>
                            {s.s}
                          </div>
                          <div>
                            <div style={{fontSize:12,fontWeight:600,color:'var(--text)',marginBottom:3}}>{s.t}</div>
                            <div style={{fontSize:11,color:'var(--muted)',lineHeight:1.6}}>{s.d}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div>
                      <div style={{background:'var(--ink)',borderRadius:10,padding:'16px',marginBottom:14}}>
                        <div style={{fontSize:12,fontWeight:600,color:'var(--gold2)',marginBottom:10}}>Seuils de performance</div>
                        <div style={{display:'grid',gridTemplateColumns:'60px 1fr 1fr 1fr',gap:4,marginBottom:6}}>
                          <div style={{fontSize:9,color:'var(--dim)'}}>Indice</div>
                          <div style={{fontSize:9,padding:'2px 4px',background:'rgba(53,200,144,.15)',color:'var(--green)',textAlign:'center',borderRadius:3}}>Vert</div>
                          <div style={{fontSize:9,padding:'2px 4px',background:'rgba(245,184,64,.15)',color:'var(--amber)',textAlign:'center',borderRadius:3}}>Orange</div>
                          <div style={{fontSize:9,padding:'2px 4px',background:'rgba(240,96,96,.15)',color:'var(--red)',textAlign:'center',borderRadius:3}}>Rouge</div>
                        </div>
                        {[
                          {i:'CPI', v:'>= 1.0', o:'0.9-1.0', r:'< 0.9'},
                          {i:'SPI', v:'>= 1.0', o:'0.9-1.0', r:'< 0.9'},
                          {i:'CV',  v:'> 0',    o:'= 0',     r:'< 0'},
                          {i:'SV',  v:'> 0',    o:'= 0',     r:'< 0'},
                          {i:'TCPI',v:'<= 1.0', o:'1.0-1.1', r:'> 1.1'},
                        ].map(r=>(
                          <div key={r.i} style={{display:'grid',gridTemplateColumns:'60px 1fr 1fr 1fr',gap:4,marginBottom:6}}>
                            <div style={{fontSize:11,fontWeight:600,color:'var(--text)'}}>{r.i}</div>
                            <div style={{fontSize:10,padding:'2px 6px',background:'rgba(53,200,144,.1)',color:'var(--green)',textAlign:'center',borderRadius:3}}>{r.v}</div>
                            <div style={{fontSize:10,padding:'2px 6px',background:'rgba(245,184,64,.1)',color:'var(--amber)',textAlign:'center',borderRadius:3}}>{r.o}</div>
                            <div style={{fontSize:10,padding:'2px 6px',background:'rgba(240,96,96,.1)',color:'var(--red)',textAlign:'center',borderRadius:3}}>{r.r}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab==='config' && (
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
              <div className="card">
                <div className="card-hdr"><div className="card-title">Parametres du rapport</div></div>
                <div className="card-body">
                  {[
                    {l:'Titre du projet', k:'project_title', ph:project?.name||''},
                    {l:'Prepare par',     k:'manager',       ph:'Chef de Projet'},
                    {l:'Date du rapport', k:'report_date',   ph:'', type:'date'},
                  ].map(f=>(
                    <div key={f.k} className="fg">
                      <label className="fl">{f.l}</label>
                      <input className="fi" type={f.type||'text'} placeholder={f.ph}
                        value={(config as any)[f.k]||''}
                        onChange={e=>{const nc={...config,[f.k]:e.target.value};setConfig(nc);save(tasks,nc)}}/>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card">
                <div className="card-hdr"><div className="card-title">Periodes de suivi</div></div>
                <div className="card-body">
                  <div className="fg">
                    <label className="fl">Nombre de periodes (4 a 24)</label>
                    <input className="fi" type="number" min={4} max={24} value={N}
                      onChange={e=>{
                        const nb=Math.min(24,Math.max(4,+e.target.value))
                        const nc={...config,nb_periods:nb,period_labels:Array.from({length:nb},(_,i)=>config.period_labels[i]||'P'+(i+1))}
                        setConfig(nc);save(tasks,nc)
                      }}/>
                  </div>
                  <div className="fg">
                    <label className="fl">Libelles (separes par virgule)</label>
                    <input className="fi" value={config.period_labels.slice(0,N).join(',')}
                      onChange={e=>{
                        const labels=e.target.value.split(',').map((s: string)=>s.trim())
                        const nc={...config,period_labels:labels}
                        setConfig(nc);save(tasks,nc)
                      }}
                      placeholder="Sem 1,Sem 2,... ou Jan,Fev,..."/>
                    <div style={{fontSize:10,color:'var(--dim)',marginTop:3}}>Ex: Jan,Fev,Mar ou Sem 1,Sem 2,Sem 3</div>
                  </div>
                  <div className="fg">
                    <label className="fl">Taches — Nom et TBC</label>
                    {tasks.map(t=>(
                      <div key={t.id} style={{display:'flex',gap:8,marginBottom:8,alignItems:'center'}}>
                        <input value={t.wbs_id} onChange={e=>updateTask(t.id,'wbs_id',e.target.value)}
                          style={{width:60,padding:'5px 8px',background:'var(--ink)',border:'1px solid var(--line2)',borderRadius:6,color:'var(--dim)',fontSize:11}} placeholder="WBS"/>
                        <input value={t.name} onChange={e=>updateTask(t.id,'name',e.target.value)}
                          style={{flex:1,padding:'5px 8px',background:'var(--ink)',border:'1px solid var(--line2)',borderRadius:6,color:'var(--text)',fontSize:11}}/>
                        <input type="number" min={0} value={t.tbc} onChange={e=>updateTask(t.id,'tbc',+e.target.value)}
                          style={{width:80,padding:'5px 8px',background:'var(--ink)',border:'1px solid var(--line2)',borderRadius:6,color:'var(--gold2)',fontSize:11,fontFamily:'monospace'}} placeholder="TBC"/>
                        <button onClick={()=>deleteTask(t.id)} style={{padding:'4px 8px',background:'rgba(240,96,96,.1)',border:'1px solid rgba(240,96,96,.2)',borderRadius:5,cursor:'pointer',fontSize:11,color:'var(--red)'}}>X</button>
                      </div>
                    ))}
                    <button onClick={addTask} style={{padding:'6px 12px',background:'var(--ink3)',border:'1px solid var(--line2)',borderRadius:6,cursor:'pointer',fontSize:11,color:'var(--muted)',marginTop:4}}>+ Tache</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </AppLayout>
  )
}