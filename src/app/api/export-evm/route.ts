import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import os from 'os'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Write body to temp file
    const tmpDir  = os.tmpdir()
    const inFile  = path.join(tmpDir, `evm_in_${Date.now()}.json`)
    const outFile = path.join(tmpDir, `evm_out_${Date.now()}.xlsx`)

    fs.writeFileSync(inFile, JSON.stringify(body))

    // Run Python script
    await new Promise<void>((resolve, reject) => {
      const py = spawn('python3', [
        path.join(process.cwd(), 'scripts', 'export_evm.py'),
        inFile, outFile
      ])
      let stderr = ''
      py.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
      py.on('close', (code: number) => {
        if (code === 0) resolve()
        else reject(new Error('Python error: ' + stderr))
      })
    })

    const buffer = fs.readFileSync(outFile)

    // Cleanup
    try { fs.unlinkSync(inFile); fs.unlinkSync(outFile) } catch {}

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="EVM-export.xlsx"`,
      },
    })
  } catch (e: any) {
    console.error('Export EVM error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
