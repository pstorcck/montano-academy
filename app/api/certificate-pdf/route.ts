import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const certId = searchParams.get('id')

  if (!certId) {
    return NextResponse.json({ error: 'Falta el ID del certificado' }, { status: 400 })
  }

  const { data: cert } = await supabase
    .from('certificates')
    .select('*, profiles(full_name), companies(name, slug, primary_color, secondary_color)')
    .eq('id', certId)
    .single()

  if (!cert) {
    return NextResponse.json({ error: 'Certificado no encontrado' }, { status: 404 })
  }

  const primaryColor = cert.companies?.primary_color || '#0067A9'
  const secondaryColor = cert.companies?.secondary_color || '#FED809'
  const companyName = cert.companies?.name || 'Grupo Montano'
  const userName = cert.profiles?.full_name || 'Colaborador'
  const issuedDate = new Date(cert.issued_at).toLocaleDateString('es-GT', {
    year: 'numeric', month: 'long', day: 'numeric'
  })

  const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Helvetica Neue', Arial, sans-serif;
    background: white;
    width: 297mm;
    height: 210mm;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .cert {
    width: 100%;
    height: 100%;
    background: white;
    position: relative;
    overflow: hidden;
  }
  .top-bar { height: 10px; background: ${primaryColor}; }
  .gold-bar { height: 4px; background: linear-gradient(90deg, ${secondaryColor}, ${primaryColor}); }
  .body {
    padding: 40px 80px;
    text-align: center;
    position: relative;
  }
  .watermark {
    position: absolute;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    font-size: 180px;
    font-weight: 900;
    color: ${primaryColor};
    opacity: 0.03;
    letter-spacing: -10px;
    pointer-events: none;
    white-space: nowrap;
  }
  .seal {
    width: 80px; height: 80px;
    border-radius: 50%;
    background: ${primaryColor};
    border: 4px solid ${secondaryColor};
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 20px;
    font-size: 22px;
    font-weight: 900;
    color: ${secondaryColor};
  }
  .issued-by {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: #9A9AAA;
    margin-bottom: 10px;
  }
  .title {
    font-size: 38px;
    font-weight: 800;
    color: ${primaryColor};
    margin-bottom: 4px;
  }
  .subtitle {
    font-size: 12px;
    color: #9A9AAA;
    letter-spacing: 0.08em;
    margin-bottom: 24px;
  }
  .divider {
    width: 60px; height: 3px;
    background: linear-gradient(90deg, ${primaryColor}, ${secondaryColor});
    margin: 0 auto 24px;
  }
  .presents {
    font-size: 13px;
    color: #9A9AAA;
    margin-bottom: 8px;
  }
  .name {
    font-size: 40px;
    font-weight: 800;
    color: ${primaryColor};
    padding-bottom: 10px;
    border-bottom: 2px solid #E8E8E0;
    display: inline-block;
    min-width: 350px;
    margin-bottom: 16px;
  }
  .course-pre {
    font-size: 13px;
    color: #9A9AAA;
    margin-bottom: 4px;
  }
  .course {
    font-size: 22px;
    font-weight: 700;
    color: ${primaryColor};
    margin-bottom: 28px;
  }
  .footer {
    display: flex;
    justify-content: center;
    gap: 60px;
    padding-top: 20px;
    border-top: 1px solid #F0F0F0;
  }
  .footer-item { text-align: center; }
  .footer-val {
    font-size: 13px;
    font-weight: 700;
    color: ${primaryColor};
  }
  .footer-label {
    font-size: 10px;
    color: #9A9AAA;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-top: 3px;
  }
  .score {
    background: ${primaryColor};
    color: ${secondaryColor};
    padding: 3px 14px;
    border-radius: 100px;
    font-weight: 800;
    font-size: 13px;
  }
  .bottom-bar {
    position: absolute;
    bottom: 0; left: 0; right: 0;
    height: 6px;
    background: linear-gradient(90deg, ${primaryColor}, ${secondaryColor});
  }
</style>
</head>
<body>
<div class="cert">
  <div class="top-bar"></div>
  <div class="gold-bar"></div>
  <div class="body">
    <div class="watermark">${cert.companies?.slug?.toUpperCase() || 'GM'}</div>
    <div class="seal">${companyName.slice(0,2).toUpperCase()}</div>
    <div class="issued-by">Grupo Montano · montano.academy</div>
    <div class="title">Certificado de Finalización</div>
    <div class="subtitle">Programa de Inducción Institucional · ${new Date(cert.issued_at).getFullYear()}</div>
    <div class="divider"></div>
    <div class="presents">Este certificado acredita que</div>
    <div class="name">${userName}</div>
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
        <div class="footer-val"><span class="score">${cert.score}/100</span></div>
        <div class="footer-label">Punteo final</div>
      </div>
    </div>
  </div>
  <div class="bottom-bar"></div>
</div>
</body>
</html>
  `

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html',
      'Content-Disposition': `attachment; filename="Certificado-${cert.certificate_number}.html"`,
    }
  })
}
