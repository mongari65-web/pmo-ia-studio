import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const ADMIN_EMAIL = 'mongari65@gmail.com'

async function getAccessToken(): Promise<string> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
      grant_type:    'refresh_token',
    }),
  })
  const data = await response.json()
  if (!data.access_token) throw new Error('Token invalide')
  return data.access_token
}

function encodeBase64(str: string): string {
  return Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function sendEmail(to: string, subject: string, htmlBody: string) {
  const accessToken = await getAccessToken()
  const emailLines = [
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(htmlBody).toString('base64'),
  ]
  const rawEmail = encodeBase64(emailLines.join('\r\n'))
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: rawEmail }),
  })
  return res.ok
}

export async function POST(request: NextRequest) {
  try {
    const { type, user_email, user_name, user_id } = await request.json()

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Récupérer les paramètres du site
    const { data: settings } = await supabase
      .from('site_settings')
      .select('key, value')

    const cfg: Record<string, string> = {}
    settings?.forEach(s => { cfg[s.key] = s.value })

    const date = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    const time = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

    // ── EMAIL DE BIENVENUE ──────────────────────────────────
    if (type === 'welcome' && cfg['welcome_email_enabled'] === 'true') {
      const welcomeHtml = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><style>
  body{font-family:Arial,sans-serif;color:#1A1A28;background:#f8f8f8;margin:0;padding:0}
  .container{max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08)}
  .header{background:linear-gradient(135deg,#13131A,#1C1C26);padding:32px;text-align:center}
  .logo{width:56px;height:56px;background:linear-gradient(135deg,#D4A84B,#F0C060);border-radius:14px;display:inline-flex;align-items:center;justify-content:center;font-size:24px;font-weight:900;color:#0A0A0C;margin-bottom:16px}
  .brand{color:#fff;font-size:22px;font-weight:700;margin-bottom:4px}
  .tagline{color:#A8A8C8;font-size:12px}
  .body{padding:36px}
  .greeting{font-size:18px;font-weight:700;color:#1A1A28;margin-bottom:12px}
  .text{font-size:13px;color:#5A5A72;line-height:1.8;margin-bottom:20px}
  .features{background:#F8F7F0;border-radius:10px;padding:20px;margin-bottom:24px}
  .feature{display:flex;gap:12px;padding:8px 0;border-bottom:1px solid #E8E4D8}
  .feature:last-child{border-bottom:none}
  .feat-icon{font-size:18px;flex-shrink:0}
  .feat-text{font-size:12px;color:#1A1A28;font-weight:500}
  .feat-sub{font-size:11px;color:#7A7A9A;margin-top:2px}
  .cta{display:block;text-align:center;padding:14px 28px;background:linear-gradient(135deg,#D4A84B,#F0C060);color:#0A0A0C;text-decoration:none;border-radius:9px;font-weight:700;font-size:14px;margin:24px 0}
  .footer{background:#F8F7F0;padding:20px 32px;text-align:center;font-size:11px;color:#A8A8C8}
</style></head><body>
<div class="container">
  <div class="header">
    <div class="logo">P</div>
    <div class="brand">PMO-IA Studio</div>
    <div class="tagline">Le copilote IA des Chefs de Projet</div>
  </div>
  <div class="body">
    <div class="greeting">Bienvenue ${user_name ? 'sur PMO-IA Studio, ' + user_name + ' !' : 'sur PMO-IA Studio !'}</div>
    <div class="text">
      Votre compte a été créé avec succès. Vous avez maintenant accès à l'assistant IA le plus avancé pour la gestion de projets, conçu par un Chef de Projet PMP® certifié.
    </div>
    <div class="features">
      ${[
        ['🎯', '7 générateurs PMI', 'Charte, WBS, RACI, RAID, Recette, Gantt, PMP'],
        ['📊', 'Diagramme PERT automatique', 'Chemin critique calculé en temps réel'],
        ['🧠', 'Mind Map interactif', 'Éditable et exportable en PDF'],
        ['🔗', 'Notion · Drive · Gmail', 'Export automatique vers vos outils'],
        ['⚠', 'RAID & Jalons', 'Suivi complet de vos projets'],
      ].map(([icon, title, sub]) => `
        <div class="feature">
          <div class="feat-icon">${icon}</div>
          <div><div class="feat-text">${title}</div><div class="feat-sub">${sub}</div></div>
        </div>
      `).join('')}
    </div>
    <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://pmo-ia-studio.vercel.app'}/dashboard" class="cta">
      → Accéder à mon espace PMO-IA Studio
    </a>
    <div class="text" style="font-size:12px">
      Bonne gestion de projets !<br>
      <strong>L'équipe PMO-IA Studio</strong>
    </div>
  </div>
  <div class="footer">
    Généré le ${date} · PMO-IA Studio v2.0 · PMBOK 7<br>
    Cet email vous a été envoyé suite à votre inscription.
  </div>
</div>
</body></html>`

      await sendEmail(user_email, 'Bienvenue sur PMO-IA Studio !', welcomeHtml)
    }

    // ── NOTIFICATION ADMIN ──────────────────────────────────
    if (type === 'new_user' && cfg['admin_notify_enabled'] === 'true') {
      const adminHtml = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><style>
  body{font-family:Arial,sans-serif;color:#1A1A28;background:#f8f8f8;margin:0;padding:0}
  .container{max-width:500px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08)}
  .header{background:linear-gradient(135deg,#1A0A0A,#2A1A1A);padding:20px 28px;display:flex;align-items:center;gap:12px}
  .badge{padding:4px 12px;background:rgba(240,96,96,.2);border:1px solid rgba(240,96,96,.4);border-radius:20px;font-size:11px;color:#F06060;font-weight:600}
  .title{color:#fff;font-size:16px;font-weight:700;margin-left:auto}
  .body{padding:28px}
  .row{display:flex;gap:12px;padding:9px 0;border-bottom:1px solid #E8E4D8}
  .row-label{width:100px;font-size:11px;color:#A8A8C8;text-transform:uppercase;letter-spacing:.06em;flex-shrink:0}
  .row-value{font-size:12px;color:#1A1A28;font-weight:500}
  .footer{background:#F8F7F0;padding:16px 28px;font-size:11px;color:#A8A8C8;text-align:center}
</style></head><body>
<div class="container">
  <div class="header">
    <div class="badge">🔔 NOUVEAU MEMBRE</div>
    <div class="title">PMO-IA Studio</div>
  </div>
  <div class="body">
    <p style="font-size:13px;color:#5A5A72;margin-bottom:20px;line-height:1.7">
      Un nouvel utilisateur vient de s'inscrire sur <strong>PMO-IA Studio</strong>.
    </p>
    ${[
      ['Email', user_email],
      ['Nom', user_name || 'Non renseigné'],
      ['ID', user_id?.slice(0, 16) + '...'],
      ['Date', date + ' à ' + time],
    ].map(([label, value]) => `
      <div class="row">
        <div class="row-label">${label}</div>
        <div class="row-value">${value}</div>
      </div>
    `).join('')}
  </div>
  <div class="footer">
    Notification automatique · PMO-IA Studio Admin
  </div>
</div>
</body></html>`

      await sendEmail(ADMIN_EMAIL, '🔔 Nouveau membre : ' + user_email, adminHtml)
    }

    // Logger l'activité
    await supabase.from('activity_logs').insert({
      user_id,
      action: type,
      details: { email: user_email, name: user_name },
    })

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('Erreur notification admin:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
