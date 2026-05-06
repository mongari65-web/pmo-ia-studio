// app/api/notion-export/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { title, blocks } = await req.json()
  const contentText = (blocks as any[])
    .map((b) => b.content ?? b.text ?? JSON.stringify(b))
    .join('\n')

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'mcp-client-2025-04-04',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        mcp_servers: [
          { type: 'url', url: 'https://mcp.notion.com/mcp', name: 'notion' }
        ],
        messages: [{
          role: 'user',
          content: `Crée une page Notion avec le titre "${title}" et ce contenu:\n\n${contentText}\n\nRéponds uniquement avec l'URL de la page créée au format JSON: {"url": "https://notion.so/..."}`,
        }],
      }),
    })

    const data = await response.json()
    const text = (data.content ?? [])
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('')

    try {
      return NextResponse.json(JSON.parse(text))
    } catch {
      return NextResponse.json({ url: null, message: text })
    }
  } catch (e: any) {
    return NextResponse.json({ url: null, error: e.message }, { status: 500 })
  }
}
