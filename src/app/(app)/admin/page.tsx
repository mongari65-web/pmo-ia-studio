'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AppLayout from '@/components/layout/AppLayout'

const ADMIN_EMAIL = 'mongari65@gmail.com'

interface User {
  id: string
  email: string
  full_name?: string
  role: string
  is_suspended: boolean
  created_at: string
  last_login?: string
  project_count?: number
  doc_count?: number
}

interface Setting {
  key: string
  value: string
}

const SETTING_LABELS: Record<string, { label: string; type: string; desc: string }> = {
  site_title:             { label: 'Titre du site',          type: 'text',     desc: 'Nom affiché dans la topbar et les emails' },
  site_tagline:           { label: 'Slogan',                 type: 'text',     desc: 'Affiché sous le titre' },
  site_description:       { label: 'Description',            type: 'textarea', desc: 'Description sur la page de connexion' },
  welcome_email_enabled:  { label: 'Email de bienvenue',     type: 'toggle',   desc: 'Envoyer un email à chaque nouvelle inscription' },
  admin_notify_enabled:   { label: 'Notification admin',     type: 'toggle',   desc: 'Recevoir un email à chaque nouvelle inscription' },
  admin_email:            { label: 'Email administrateur',   type: 'text',     desc: 'Email qui reçoit les notifications' },
  max_projects_free:      { label: 'Projets max (gratuit)',  type: 'number',   desc: 'Nombre de projets autorisés en plan gratuit' },
  max_docs_free:          { label: 'Documents max (gratuit)', type: 'number',  desc: 'Nombre de documents autorisés en plan gratuit' },
}

export default function AdminPage() {
  const [activeTab, setActiveTab]   = useState<'dashboard'|'users'|'settings'|'logs'>('dashboard')
  const [users, setUsers]           = useState<User[]>([])
  const [settings, setSettings]     = useState<Setting[]>([])
  const [logs, setLogs]             = useState<any[]>([])
  const [stats, setStats]           = useState({ users: 0, projects: 0, docs: 0, newThisWeek: 0 })
  const [loading, setLoading]       = useState(true)
  const [unauthorized, setUnauth]   = useState(false)
  const [saving, setSaving]         = useState(false)
  const [editSettings, setEditSettings] = useState<Record<string, string>>({})
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [userProjects, setUserProjects] = useState<any[]>([])
  const [sendingEmail, setSendingEmail] = useState(false)
  const [msg, setMsg]               = useState('')

  const router   = useRouter()
  const supabase = createClient()

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || user.email !== ADMIN_EMAIL) {
      setUnauth(true)
      setLoading(false)
      return
    }
    await Promise.all([loadStats(), loadUsers(), loadSettings(), loadLogs()])
    setLoading(false)
  }

  async function loadStats() {
    const { data: profiles } = await supabase.from('profiles').select('id, created_at')
    const { data: projects }  = await supabase.from('projects').select('id')
    const { data: docs }      = await supabase.from('documents').select('id')
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const newThisWeek = profiles?.filter(p => p.created_at > oneWeekAgo).length || 0
    setStats({
      users:       profiles?.length || 0,
      projects:    projects?.length || 0,
      docs:        docs?.length || 0,
      newThisWeek,
    })
  }

  async function loadUsers() {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })

    if (!profiles) return

    const usersWithCounts = await Promise.all(profiles.map(async p => {
      const { count: pc } = await supabase.from('projects').select('*', { count: 'exact', head: true }).eq('user_id', p.id)
      const { count: dc } = await supabase.from('documents').select('*', { count: 'exact', head: true }).eq('user_id', p.id)
      return { ...p, project_count: pc || 0, doc_count: dc || 0 }
    }))

    setUsers(usersWithCounts as User[])
  }

  async function loadSettings() {
    const { data } = await supabase.from('site_settings').select('*')
    if (data) {
      setSettings(data)
      const edits: Record<string, string> = {}
      data.forEach(s => { edits[s.key] = s.value })
      setEditSettings(edits)
    }
  }

  async function loadLogs() {
    const { data } = await supabase
      .from('activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
    setLogs(data || [])
  }

  async function loadUserProjects(userId: string) {
    const { data } = await supabase
      .from('projects')
      .select('*, documents(count)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    setUserProjects(data || [])
  }

  async function suspendUser(userId: string, suspend: boolean) {
    await supabase.from('profiles').update({ is_suspended: suspend }).eq('id', userId)
    await loadUsers()
    showMsg(suspend ? 'Compte suspendu' : 'Compte réactivé')
  }

  async function deleteUser(userId: string, email: string) {
    if (!confirm('Supprimer définitivement le compte ' + email + ' et tous ses projets ?')) return
    await supabase.from('projects').delete().eq('user_id', userId)
    await supabase.from('documents').delete().eq('user_id', userId)
    await supabase.from('profiles').delete().eq('id', userId)
    setSelectedUser(null)
    await loadUsers()
    await loadStats()
    showMsg('Compte supprimé')
  }

  async function saveSettings() {
    setSaving(true)
    for (const [key, value] of Object.entries(editSettings)) {
      await supabase.from('site_settings').upsert({ key, value, updated_at: new Date().toISOString() })
    }
    await loadSettings()
    setSaving(false)
    showMsg('Paramètres sauvegardés !')
  }

  async function sendWelcomeEmail(email: string, name: string) {
    setSendingEmail(true)
    try {
      await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: email,
          subject: 'Bienvenue sur PMO-IA Studio !',
          project_name: 'PMO-IA Studio',
          doc_type: 'welcome',
          doc_label: 'Bienvenue',
          sender_name: 'L\'équipe PMO-IA Studio',
          content: 'Bonjour ' + (name || '') + ',\n\nBienvenue sur PMO-IA Studio — Le copilote IA des Chefs de Projet !\n\nVotre compte a été créé avec succès. Vous pouvez maintenant :\n\n✦ Créer vos projets et générer vos documents PMI\n📊 Utiliser le diagramme PERT avec calcul du chemin critique\n🧠 Générer des Mind Maps de vos projets\n⚠ Gérer votre registre RAID\n📅 Suivre vos jalons\n\nConnectez-vous sur : ' + editSettings['admin_email'] + '\n\nBonne gestion de projets !\nL\'équipe PMO-IA Studio',
        })
      })
      showMsg('Email de bienvenue envoyé !')
    } catch (e) {
      showMsg('Erreur envoi email')
    }
    setSendingEmail(false)
  }

  function showMsg(text: string) {
    setMsg(text)
    setTimeout(() => setMsg(''), 3000)
  }

  if (loading) return (
    <AppLayout>
      <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>Chargement administration...</div>
    </AppLayout>
  )

  if (unauthorized) return (
    <AppLayout>
      <div style={{ textAlign: 'center', padding: 80 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
        <div style={{ fontFamily: 'var(--syne)', fontSize: 22, fontWeight: 700, color: 'var(--red)', marginBottom: 8 }}>Accès refusé</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 24 }}>Vous n'avez pas les droits d'accès à cette page.</div>
        <button className="btn-gold" onClick={() => router.push('/dashboard')}>← Retour au dashboard</button>
      </div>
    </AppLayout>
  )

  const tabs = [
    { id: 'dashboard', icon: '⊞', label: 'Dashboard' },
    { id: 'users',     icon: '👥', label: 'Utilisateurs (' + users.length + ')' },
    { id: 'settings',  icon: '⚙', label: 'Paramètres site' },
    { id: 'logs',      icon: '📋', label: 'Logs activité' },
  ]

  return (
    <AppLayout>
      {/* Header admin */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ padding: '2px 10px', background: 'rgba(240,96,96,.15)', border: '1px solid rgba(240,96,96,.3)', borderRadius: 20, fontSize: 10, color: 'var(--red)', fontWeight: 600 }}>🔐 ADMIN</span>
          </div>
          <div className="sec-label">// Administration</div>
          <h1 className="sec-title" style={{ marginBottom: 4 }}>Panneau d'administration</h1>
        </div>
        {msg && (
          <div style={{ padding: '8px 16px', background: 'rgba(53,200,144,.1)', border: '1px solid rgba(53,200,144,.3)', borderRadius: 9, fontSize: 12, color: 'var(--green)' }}>
            ✓ {msg}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 24, borderBottom: '1px solid var(--line)', paddingBottom: 12 }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
            style={{ padding: '8px 18px', fontSize: 12, cursor: 'pointer', borderRadius: 8, border: '1px solid var(--line2)', background: activeTab === tab.id ? 'rgba(212,168,75,.15)' : 'transparent', color: activeTab === tab.id ? 'var(--gold2)' : 'var(--muted)', fontWeight: activeTab === tab.id ? 600 : 400, transition: 'all .12s', fontFamily: 'var(--mono)', display: 'flex', alignItems: 'center', gap: 6 }}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ── DASHBOARD ── */}
      {activeTab === 'dashboard' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 24 }}>
            {[
              { label: 'Utilisateurs total', value: stats.users,       color: 'var(--white)',  icon: '👥' },
              { label: 'Nouveaux cette semaine', value: stats.newThisWeek, color: 'var(--green)', icon: '✦' },
              { label: 'Projets créés',      value: stats.projects,    color: 'var(--gold2)',  icon: '◈' },
              { label: 'Documents générés',  value: stats.docs,        color: 'var(--cyan)',   icon: '📄' },
            ].map(k => (
              <div key={k.label} className="kpi">
                <div className="kpi-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>{k.icon}</span> {k.label}
                </div>
                <div className="kpi-value" style={{ color: k.color }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Derniers inscrits */}
          <div className="card">
            <div className="card-hdr">
              <div className="card-title">👥 Dernières inscriptions</div>
            </div>
            <table className="table">
              <thead><tr><th>Email</th><th>Rôle</th><th>Projets</th><th>Documents</th><th>Inscrit le</th><th>Actions</th></tr></thead>
              <tbody>
                {users.slice(0, 10).map(u => (
                  <tr key={u.id}>
                    <td style={{ color: 'var(--text)', fontWeight: 500 }}>{u.email}</td>
                    <td><span className={u.role === 'admin' ? 'badge b-gold' : 'badge b-purple'}>{u.role}</span></td>
                    <td style={{ color: 'var(--gold2)' }}>{u.project_count}</td>
                    <td style={{ color: 'var(--cyan)' }}>{u.doc_count}</td>
                    <td style={{ color: 'var(--dim)' }}>{new Date(u.created_at).toLocaleDateString('fr-FR')}</td>
                    <td>
                      <button onClick={() => sendWelcomeEmail(u.email, u.full_name || '')}
                        style={{ padding: '4px 10px', background: 'rgba(212,168,75,.1)', border: '1px solid rgba(212,168,75,.3)', borderRadius: 6, cursor: 'pointer', fontSize: 10, color: 'var(--gold2)' }}>
                        ✉ Bienvenue
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── UTILISATEURS ── */}
      {activeTab === 'users' && (
        <div style={{ display: 'grid', gridTemplateColumns: selectedUser ? '1fr 380px' : '1fr', gap: 20 }}>
          <div className="card">
            <div className="card-hdr">
              <div className="card-title">👥 Tous les utilisateurs ({users.length})</div>
            </div>
            <table className="table">
              <thead>
                <tr><th>Email</th><th>Rôle</th><th>Statut</th><th>Projets</th><th>Docs</th><th>Inscrit</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} style={{ background: selectedUser?.id === u.id ? 'rgba(212,168,75,.04)' : '' }}>
                    <td>
                      <div style={{ fontWeight: 500, color: 'var(--text)', fontSize: 12 }}>{u.email}</div>
                      {u.full_name && <div style={{ fontSize: 10, color: 'var(--dim)' }}>{u.full_name}</div>}
                    </td>
                    <td><span className={u.role === 'admin' ? 'badge b-gold' : 'badge b-purple'}>{u.role}</span></td>
                    <td>
                      <span className={u.is_suspended ? 'badge b-red' : 'badge b-green'}>
                        {u.is_suspended ? 'Suspendu' : 'Actif'}
                      </span>
                    </td>
                    <td style={{ color: 'var(--gold2)', fontWeight: 600 }}>{u.project_count}</td>
                    <td style={{ color: 'var(--cyan)' }}>{u.doc_count}</td>
                    <td style={{ color: 'var(--dim)', fontSize: 11 }}>{new Date(u.created_at).toLocaleDateString('fr-FR')}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={() => { setSelectedUser(u); loadUserProjects(u.id) }}
                          style={{ padding: '4px 8px', background: 'var(--ink3)', border: '1px solid var(--line2)', borderRadius: 5, cursor: 'pointer', fontSize: 10, color: 'var(--muted)' }}>
                          👁 Voir
                        </button>
                        <button onClick={() => suspendUser(u.id, !u.is_suspended)}
                          style={{ padding: '4px 8px', background: u.is_suspended ? 'rgba(53,200,144,.1)' : 'rgba(240,168,50,.1)', border: '1px solid ' + (u.is_suspended ? 'rgba(53,200,144,.3)' : 'rgba(240,168,50,.3)'), borderRadius: 5, cursor: 'pointer', fontSize: 10, color: u.is_suspended ? 'var(--green)' : 'var(--amber)' }}>
                          {u.is_suspended ? '✓ Réactiver' : '⊘ Suspendre'}
                        </button>
                        {u.email !== ADMIN_EMAIL && (
                          <button onClick={() => deleteUser(u.id, u.email)}
                            style={{ padding: '4px 8px', background: 'rgba(240,96,96,.1)', border: '1px solid rgba(240,96,96,.3)', borderRadius: 5, cursor: 'pointer', fontSize: 10, color: 'var(--red)' }}>
                            🗑
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Détail utilisateur */}
          {selectedUser && (
            <div>
              <div className="card" style={{ marginBottom: 12 }}>
                <div className="card-hdr">
                  <div className="card-title">👤 {selectedUser.email}</div>
                  <button onClick={() => setSelectedUser(null)} style={{ background: 'none', border: 'none', color: 'var(--dim)', cursor: 'pointer', fontSize: 18 }}>×</button>
                </div>
                <div className="card-body">
                  {[
                    { label: 'Email', value: selectedUser.email },
                    { label: 'Rôle', value: selectedUser.role },
                    { label: 'Statut', value: selectedUser.is_suspended ? '🔴 Suspendu' : '🟢 Actif' },
                    { label: 'Projets', value: selectedUser.project_count + '' },
                    { label: 'Documents', value: selectedUser.doc_count + '' },
                    { label: 'Inscrit le', value: new Date(selectedUser.created_at).toLocaleDateString('fr-FR') },
                  ].map(row => (
                    <div key={row.label} style={{ display: 'flex', gap: 12, padding: '7px 0', borderBottom: '1px solid var(--line)' }}>
                      <div style={{ width: 80, fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.06em', flexShrink: 0 }}>{row.label}</div>
                      <div style={{ fontSize: 12, color: 'var(--text)' }}>{row.value}</div>
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                    <button onClick={() => sendWelcomeEmail(selectedUser.email, selectedUser.full_name || '')}
                      style={{ padding: '6px 12px', background: 'rgba(212,168,75,.1)', border: '1px solid rgba(212,168,75,.3)', borderRadius: 7, cursor: 'pointer', fontSize: 11, color: 'var(--gold2)' }}>
                      ✉ Email bienvenue
                    </button>
                    {selectedUser.email !== ADMIN_EMAIL && (
                      <button onClick={() => deleteUser(selectedUser.id, selectedUser.email)}
                        style={{ padding: '6px 12px', background: 'rgba(240,96,96,.1)', border: '1px solid rgba(240,96,96,.3)', borderRadius: 7, cursor: 'pointer', fontSize: 11, color: 'var(--red)' }}>
                        🗑 Supprimer le compte
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="card-hdr"><div className="card-title">◈ Projets ({userProjects.length})</div></div>
                <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                  {userProjects.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>Aucun projet</div>
                  ) : userProjects.map(p => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid rgba(53,53,72,.4)' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{p.name}</div>
                        <div style={{ fontSize: 10, color: 'var(--dim)', marginTop: 2 }}>{p.project_type} · {new Date(p.created_at).toLocaleDateString('fr-FR')}</div>
                      </div>
                      <span style={{ fontSize: 10, color: 'var(--cyan)' }}>{p.documents?.[0]?.count || 0} docs</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── PARAMÈTRES ── */}
      {activeTab === 'settings' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

            {/* Textes interface */}
            <div className="card">
              <div className="card-hdr"><div className="card-title">✏ Textes de l'interface</div></div>
              <div className="card-body">
                {['site_title', 'site_tagline', 'site_description'].map(key => {
                  const cfg = SETTING_LABELS[key]
                  return (
                    <div key={key} className="fg">
                      <label className="fl">{cfg.label}</label>
                      {cfg.type === 'textarea' ? (
                        <textarea className="fi" rows={2} value={editSettings[key] || ''} onChange={e => setEditSettings(s => ({ ...s, [key]: e.target.value }))} style={{ resize: 'vertical' }} />
                      ) : (
                        <input className="fi" value={editSettings[key] || ''} onChange={e => setEditSettings(s => ({ ...s, [key]: e.target.value }))} />
                      )}
                      <div style={{ fontSize: 10, color: 'var(--dim)', marginTop: 3 }}>{cfg.desc}</div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Notifications */}
            <div className="card">
              <div className="card-hdr"><div className="card-title">🔔 Notifications email</div></div>
              <div className="card-body">
                {['welcome_email_enabled', 'admin_notify_enabled', 'admin_email'].map(key => {
                  const cfg = SETTING_LABELS[key]
                  const val = editSettings[key] || ''
                  return (
                    <div key={key} className="fg">
                      <label className="fl">{cfg.label}</label>
                      {cfg.type === 'toggle' ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div onClick={() => setEditSettings(s => ({ ...s, [key]: val === 'true' ? 'false' : 'true' }))}
                            style={{ width: 44, height: 24, borderRadius: 12, background: val === 'true' ? 'var(--green)' : 'var(--ink4)', border: '1px solid var(--line2)', cursor: 'pointer', position: 'relative', transition: 'all .2s' }}>
                            <div style={{ position: 'absolute', top: 3, left: val === 'true' ? 22 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'all .2s', boxShadow: '0 1px 4px rgba(0,0,0,.3)' }} />
                          </div>
                          <span style={{ fontSize: 12, color: val === 'true' ? 'var(--green)' : 'var(--dim)' }}>
                            {val === 'true' ? 'Activé' : 'Désactivé'}
                          </span>
                        </div>
                      ) : (
                        <input className="fi" value={val} onChange={e => setEditSettings(s => ({ ...s, [key]: e.target.value }))} />
                      )}
                      <div style={{ fontSize: 10, color: 'var(--dim)', marginTop: 3 }}>{cfg.desc}</div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Limites plan gratuit */}
            <div className="card">
              <div className="card-hdr"><div className="card-title">🔒 Limites plan gratuit</div></div>
              <div className="card-body">
                {['max_projects_free', 'max_docs_free'].map(key => {
                  const cfg = SETTING_LABELS[key]
                  return (
                    <div key={key} className="fg">
                      <label className="fl">{cfg.label}</label>
                      <input className="fi" type="number" value={editSettings[key] || ''} onChange={e => setEditSettings(s => ({ ...s, [key]: e.target.value }))} />
                      <div style={{ fontSize: 10, color: 'var(--dim)', marginTop: 3 }}>{cfg.desc}</div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Test notifications */}
            <div className="card">
              <div className="card-hdr"><div className="card-title">🧪 Tester les notifications</div></div>
              <div className="card-body">
                <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16, lineHeight: 1.7 }}>
                  Envoyer un email de test à votre adresse admin pour vérifier que les notifications fonctionnent.
                </p>
                <button onClick={() => sendWelcomeEmail(ADMIN_EMAIL, 'Administrateur')}
                  disabled={sendingEmail}
                  className="btn-gold" style={{ width: '100%' }}>
                  {sendingEmail ? '⏳ Envoi...' : '✉ Envoyer email de test'}
                </button>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
            <button className="btn-gold" onClick={saveSettings} disabled={saving} style={{ fontSize: 14, padding: '12px 28px' }}>
              {saving ? '⏳ Sauvegarde...' : '✓ Sauvegarder tous les paramètres'}
            </button>
          </div>
        </div>
      )}

      {/* ── LOGS ── */}
      {activeTab === 'logs' && (
        <div className="card">
          <div className="card-hdr">
            <div className="card-title">📋 Logs d'activité ({logs.length})</div>
            <button onClick={loadLogs} style={{ padding: '5px 12px', background: 'var(--ink3)', border: '1px solid var(--line2)', borderRadius: 6, cursor: 'pointer', fontSize: 11, color: 'var(--muted)' }}>
              ↻ Rafraîchir
            </button>
          </div>
          {logs.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
              Aucun log pour le moment. Les logs s'accumuleront au fil de l'utilisation.
            </div>
          ) : (
            <table className="table">
              <thead><tr><th>Action</th><th>Utilisateur</th><th>Détails</th><th>Date</th></tr></thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id}>
                    <td><span className="badge b-purple">{log.action}</span></td>
                    <td style={{ fontSize: 11, color: 'var(--muted)' }}>{log.user_id?.slice(0, 8)}...</td>
                    <td style={{ fontSize: 11, color: 'var(--dim)' }}>{JSON.stringify(log.details)?.slice(0, 60)}</td>
                    <td style={{ fontSize: 11, color: 'var(--dim)' }}>{new Date(log.created_at).toLocaleString('fr-FR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </AppLayout>
  )
}
