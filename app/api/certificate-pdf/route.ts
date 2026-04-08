import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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
    // Generar certificado manual desde admin
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('full_name, email')
      .eq('id', userId)
      .single()

    const { data: company } = await supabaseAdmin
      .from('companies')
      .select('name, slug, primary_color, secondary_color')
      .eq('id', companyId)
      .single()

    if (!profile || !company) {
      return NextResponse.json({ error: 'Usuario o empresa no encontrada' }, { status: 404 })
    }

    // Verificar si ya tiene certificado
    const { data: existingCert } = await supabaseAdmin
      .from('certificates')
      .select('*')
      .eq('user_id', userId)
      .eq('company_id', companyId)
      .single()

    if (existingCert) {
      cert = { ...existingCert, profiles: profile, companies: company }
    } else {
      // Crear certificado nuevo
      const year = new Date().getFullYear()
      const slug = company.slug.toUpperCase().slice(0, 2)
      const certNumber = `MA-${slug}-${year}-${Math.floor(Math.random() * 900) + 100}`

      const { data: newCert } = await supabaseAdmin
        .from('certificates')
        .insert({
          user_id: userId,
          company_id: companyId,
          certificate_number: certNumber,
          score: 100,
        })
        .select()
        .single()

      cert = { ...newCert, profiles: profile, companies: company }
    }
  }

  if (!cert) {
    return NextResponse.json({ error: 'Certificado no encontrado' }, { status: 404 })
  }

  const primary = cert.companies?.primary_color || '#0067A9'
  const secondary = cert.companies?.secondary_color || '#FED809'
  const companyName = cert.companies?.name || 'Grupo Montano'
  const userName = cert.profiles?.full_name || 'Colaborador'
  const initials = companyName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
  const issuedDate = new Date(cert.issued_at || new Date()).toLocaleDateString('es-GT', {
    year: 'numeric', month: 'long', day: 'numeric'
  })
  const year = new Date(cert.issued_at || new Date()).getFullYear()

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Certificado - ${userName}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; }
  body {
    font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
    background: #f5f5f5;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 20px;
  }
  .cert {
    width: 900px;
    background: white;
    box-shadow: 0 20px 60px rgba(0,0,0,0.15);
    position: relative;
    overflow: hidden;
  }
  .bar-top { height: 12px; background: ${primary}; }
  .bar-gold { height: 5px; background: linear-gradient(90deg, ${secondary}, ${primary}); }
  .body { padding: 50px 90px; text-align: center; position: relative; }
  .watermark {
    position: absolute; top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    font-size: 200px; font-weight: 900;
    color: ${primary}; opacity: 0.03;
    pointer-events: none; white-space: nowrap;
    letter-spacing: -10px;
  }
  .seal {
    width: 90px; height: 90px; border-radius: 50%;
    background: ${primary}; border: 4px solid ${secondary};
    display: flex; align-items: center; justify-content: center;
    margin: 0 auto 24px;
    font-size: 26px; font-weight: 900; color: ${secondary};
    letter-spacing: -1px;
  }
  .issued-by {
    font-size: 11px; font-weight: 700;
    letter-spacing: 0.25em; text-transform: uppercase;
    color: #9A9AAA; margin-bottom: 12px;
  }
  .title {
    font-size: 42px; font-weight: 900;
    color: ${primary}; margin-bottom: 6px; line-height: 1.1;
  }
  .subtitle {
    font-size: 12px; color: #9A9AAA;
    letter-spacing: 0.1em; margin-bottom: 28px;
  }
  .divider {
    width: 70px; height: 4px; margin: 0 auto 28px;
    background: linear-gradient(90deg, ${primary}, ${secondary});
    border-radius: 2px;
  }
  .presents { font-size: 14px; color: #9A9AAA; margin-bottom: 10px; }
  .name-wrapper { display: inline-block; margin-bottom: 6px; }
  .name {
    font-size: 44px; font-weight: 900; color: ${primary};
    padding-bottom: 12px;
    border-bottom: 2px solid #E8E8E0;
    min-width: 400px; display: block;
    line-height: 1.1;
  }
  .course-pre { font-size: 14px; color: #9A9AAA; margin-top: 20px; margin-bottom: 6px; }
  .course { font-size: 22px; font-weight: 800; color: ${primary}; margin-bottom: 32px; }
  .footer {
    display: flex; justify-content: center; gap: 70px;
    padding-top: 24px; border-top: 1px solid #F0F0F0;
  }
  .footer-item { text-align: center; }
  .footer-val { font-size: 14px; font-weight: 700; color: ${primary}; }
  .footer-label {
    font-size: 10px; color: #9A9AAA;
    text-transform: uppercase; letter-spacing: 0.1em; margin-top: 4px;
  }
  .score-badge {
    background: ${primary}; color: ${secondary};
    padding: 4px 16px; border-radius: 100px;
    font-weight: 900; font-size: 14px;
    display: inline-block;
  }
  .bar-bottom {
    height: 8px;
    background: linear-gradient(90deg, ${primary}, ${secondary});
  }
  .no-print { text-align: center; padding: 20px; }
  .print-btn {
    background: ${primary}; color: white;
    border: none; padding: 12px 32px;
    border-radius: 12px; font-size: 15px;
    font-weight: 700; cursor: pointer;
    font-family: inherit; margin-right: 10px;
  }
  .print-btn:hover { opacity: 0.9; }
  @media print {
    body { background: white; padding: 0; }
    .cert { box-shadow: none; width: 100%; }
    .no-print { display: none; }
    @page { size: landscape; margin: 0; }
  }
</style>
</head>
<body>
<div>
  <div class="cert">
    <div class="bar-top"></div>
    <div class="bar-gold"></div>
    <div class="body">
      <div class="watermark">${initials}</div>
      <div class="seal">${initials}</div>
      <div class="issued-by">Grupo Montano · montano.academy</div>
      <div class="title">Certificado de Finalización</div>
      <div class="subtitle">Programa de Inducción Institucional · ${year}</div>
      <div class="divider"></div>
      <div class="presents">Este certificado acredita que</div>
      <div class="name-wrapper">
        <span class="name">${userName}</span>
      </div>
      <div class="course-pre">ha completado satisfactoriamente</div>
      <div class="course">Inducción General — ${companyName}</div>
      <div class="footer">
        <div class="footer-item">
          <div class="footer-val">${issuedDate}</div>
          <div class="footer-label">Fecha de emisión</div>
        </div>
        <div class="footer-item">
          <div class="footer-val">${cert.certificate_number}</div>
          <div class="footer-label">Número de certificado</div>
        </div>
        <div class="footer-item">
          <div class="footer-val"><span class="score-badge">${cert.score}/100</span></div>
          <div class="footer-label">Punteo final</div>
        </div>
      </div>
    </div>
    <div class="bar-bottom"></div>
  </div>
  <div class="no-print">
    <button class="print-btn" onclick="window.print()">Guardar como PDF</button>
    <button onclick="window.close()" style="background:transparent;border:1px solid #ddd;padding:12px 24px;border-radius:12px;cursor:pointer;font-size:14px;">Cerrar</button>
    <p style="margin-top:10px;font-size:12px;color:#9A9AAA;">Haz click en "Guardar como PDF" → En el diálogo elige "Guardar como PDF"</p>
  </div>
</div>
</body>
</html>`

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    }
  })
}
