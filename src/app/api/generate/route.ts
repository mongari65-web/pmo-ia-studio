import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { prompt, system, maxTokens } = await request.json()
    if (!prompt) return NextResponse.json({ error: 'Prompt requis' }, { status: 400 })

    const rawKey = process.env.ANTHROPIC_API_KEY || ''
    const apiKey = rawKey.replace(/[\n\r\s]/g, '')
    if (!apiKey) return NextResponse.json({ error: 'Clé API manquante' }, { status: 500 })

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: maxTokens || 4000,
        system: system || "Tu es un Chef de Projet PMP certifié. Tu génères des documents PMI en français selon PMBOK 7. Quand on te demande du JSON, tu réponds UNIQUEMENT avec le JSON valide, sans texte avant ni après, sans balises markdown.",
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    const data = await response.json()
    if (!response.ok) return NextResponse.json({ error: data.error?.message }, { status: response.status })
    const text = data.content?.[0]?.text || ''
    return NextResponse.json({ text })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
