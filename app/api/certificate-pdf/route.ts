import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const LOGO_MAP: Record<string, string> = {
  'colegio-montano': 'logo-cm.jpg',
  'mac': 'logo-mac.jpg',
  'vitanova': 'logo-vitanova.jpg',
}

function getLogoBase64(slug: string): string {
  try {
    const filename = LOGO_MAP[slug] || 'logo-cm.jpg'
    const filepath = join(process.cwd(), 'public', filename)
    const buffer = readFileSync(filepath)
    return `data:image/jpeg;base64,${buffer.toString('base64')}`
  } catch {
    return ''
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const certId = searchParams.get('id')
  const userId = searchParams.get('user_id')
  const companyId = searchParams.get('company_id')

  let cert: any = null

  if (certId) {
    const { data } = await supabaseAdmin
      .from('certificates')
      .select('*, profiles(full_name), companies(name, slug, primary_color, secondary_color)')
      .eq('id', certId)
      .single()
    cert = data
  } else if (userId && companyId) {
    const { data: profile } = await supabaseAdmin
      .from('profiles').select('full_name').eq('id', userId).single()
    const { data: company } = await supabaseAdmin
      .from('companies').select('name, slug, primary_color, secondary_color').eq('id', companyId).single()

    if (!profile || !company) {
      return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    }

    const { data: existingCert } = await supabaseAdmin
      .from('certificates').select('*')
      .eq('user_id', userId).eq('company_id', companyId).single()

    if (existingCert) {
      cert = { ...existingCert, profiles: profile, companies: company }
    } else {
      const year = new Date().getFullYear()
      const slug = company.slug.toUpperCase().slice(0, 2)
      const certNumber = `MA-${slug}-${year}-${Math.floor(Math.random() * 900) + 100}`
      const { data: newCert } = await supabaseAdmin
        .from('certificates')
        .insert({ user_id: userId, company_id: companyId, certificate_number: certNumber, score: 100 })
        .select().single()
      cert = { ...newCert, profiles: profile, companies: company }
    }
  }

  if (!cert) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const primary = cert.companies?.primary_color || '#0067A9'
  const secondary = cert.companies?.secondary_color || '#FED809'
  const slug = cert.companies?.slug || 'colegio-montano'
  const companyName = cert.companies?.name || 'Grupo Montano'
  const userName = cert.profiles?.full_name || 'Colaborador'
  const logoBase64 = getLogoBase64(slug)
  const issuedDate = new Date(cert.issued_at || new Date()).toLocaleDateString('es-GT', {
    year: 'numeric', month: 'long', day: 'numeric'
  })
  const year = new Date(cert.issued_at || new Date()).getFullYear()

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Certificado — ${userName}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
    background: #EEECEA;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px 16px;
  }
  .cert {
    width: 860px;
    background: white;
    box-shadow: 0 25px 80px rgba(0,0,0,0.18);
    border-radius: 2px;
    overflow: hidden;
  }
  .bar-top { height: 14px; background: ${primary}; }
  .bar-accent { height: 5px; background: linear-gradient(90deg, ${secondary} 0%, ${primary} 100%); }
  .body {
    padding: 52px 100px 44px;
    text-align: center;
    position: relative;
  }
  .watermark {
    position: absolute; top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    font-size: 220px; font-weight: 900;
    color: ${primary}; opacity: 0.025;
    pointer-events: none; white-space: nowrap;
    letter-spacing: -12px; line-height: 1;
  }
  .logo-wrap {
    width: 140px; height: 140px;
    margin: 0 auto 24px;
    display: flex; align-items: center; justify-content: center;
  }
  .logo-wrap img { width: 100%; height: 100%; object-fit: contain; }
  .issued-by {
    font-size: 10px; font-weight: 700;
    letter-spacing: 0.28em; text-transform: uppercase;
    color: #AAAAB8; margin-bottom: 14px;
  }
  .title {
    font-size: 40px; font-weight: 900;
    color: ${primary}; line-height: 1.1; margin-bottom: 6px;
  }
  .subtitle {
    font-size: 11px; color: #AAAAB8;
    letter-spacing: 0.1em; margin-bottom: 26px;
  }
  .divider {
    width: 64px; height: 4px;
    background: linear-gradient(90deg, ${primary}, ${secondary});
    margin: 0 auto 26px; border-radius: 2px;
  }
  .presents { font-size: 13px; color: #9A9AAA; margin-bottom: 10px; }
  .name {
    font-size: 46px; font-weight: 900;
    color: ${primary}; line-height: 1.05;
    display: inline-block;
    padding-bottom: 12px;
    border-bottom: 2px solid #EAEAEA;
    min-width: 380px;
    margin-bottom: 0;
  }
  .course-pre { font-size: 13px; color: #9A9AAA; margin-top: 20px; margin-bottom: 6px; }
  .course { font-size: 21px; font-weight: 800; color: ${primary}; margin-bottom: 34px; }
  .footer {
    display: flex; justify-content: center; gap: 64px;
    padding-top: 22px; border-top: 1px solid #F0F0F0;
  }
  .fi { text-align: center; }
  .fv { font-size: 13px; font-weight: 700; color: ${primary}; }
  .fl { font-size: 9px; color: #AAAAB8; text-transform: uppercase; letter-spacing: 0.12em; margin-top: 4px; }
  .badge {
    background: ${primary}; color: ${secondary};
    padding: 4px 16px; border-radius: 100px;
    font-weight: 900; font-size: 13px; display: inline-block;
  }
  .bar-bottom { height: 8px; background: linear-gradient(90deg, ${primary}, ${secondary}); }
  .actions {
    margin-top: 24px; text-align: center;
  }
  .btn-print {
    background: ${primary}; color: white;
    border: none; padding: 13px 36px;
    border-radius: 12px; font-size: 15px;
    font-weight: 700; cursor: pointer;
    font-family: inherit; margin-right: 10px;
    letter-spacing: 0.02em;
  }
  .btn-close {
    background: transparent; border: 1.5px solid #D0D0D8;
    padding: 13px 24px; border-radius: 12px;
    font-size: 14px; cursor: pointer; font-family: inherit;
    color: #6B7280;
  }
  .hint { margin-top: 10px; font-size: 11px; color: #AAAAB8; }
  @media print {
    body { background: white; padding: 0; }
    .cert { box-shadow: none; width: 100%; border-radius: 0; }
    .actions { display: none; }
    @page { size: A4 landscape; margin: 0; }
  }
</style>
</head>
<body>
<div class="cert">
  <div class="bar-top"></div>
  <div class="bar-accent"></div>
  <div class="body">
    <div class="watermark">${companyName.toUpperCase()}</div>
    <div class="logo-wrap">
      ${logoBase64 ? `<img src="${logoBase64}" alt="${companyName}" />` : `<span style="font-size:24px;font-weight:900;color:${secondary}">${companyName.slice(0,2).toUpperCase()}</span>`}
    </div>
    <div class="issued-by">Grupo Montano &nbsp;·&nbsp; montano.academy</div>
    <div class="title">Certificado de Finalización</div>
    <div class="subtitle">Programa de Inducción Institucional &nbsp;·&nbsp; ${year}</div>
    <div class="divider"></div>
    <div class="presents">Este certificado acredita que</div>
    <div class="name">${userName}</div>
    <div class="course-pre">ha completado satisfactoriamente</div>
    <div class="course">Inducción General &nbsp;—&nbsp; ${companyName}</div>
    <div class="footer">
      <div class="fi">
        <div class="fv">${issuedDate}</div>
        <div class="fl">Fecha de emisión</div>
      </div>
      <div class="fi">
        <div class="fv">${cert.certificate_number}</div>
        <div class="fl">Número de certificado</div>
      </div>
      <div class="fi">
        <div class="fv"><span class="badge">${cert.score}/100</span></div>
        <div class="fl">Punteo final</div>
      </div>
    </div>
  </div>
  <div class="bar-bottom"></div>
</div>
<div class="actions">
  <button class="btn-print" onclick="window.print()">Guardar como PDF</button>
  <button class="btn-close" onclick="window.close()">Cerrar</button>
  <p class="hint">En el diálogo de impresión selecciona "Guardar como PDF" como destino</p>
</div>
</body>
</html>`

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  })
}
