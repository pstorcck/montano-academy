import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const resend = new Resend(process.env.RESEND_API_KEY!)

function generatePassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let password = ''
  for (let i = 0; i < 8; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return 'Mt' + password
}

export async function POST(req: NextRequest) {
  try {
    const { full_name, email, role, company_id, company_name, send_invite } = await req.json()

    if (send_invite) {
      // Flujo de invitación por email (Supabase magic link)
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: { full_name, company_id, role }
      })

      if (authError || !authData?.user) {
        return NextResponse.json({ error: authError?.message || 'Error creando usuario' }, { status: 400 })
      }

      await supabaseAdmin.from('profiles').upsert({
        id: authData.user!.id,
        full_name, email, company_id, role, is_active: true,
      }, { onConflict: 'id' })

      return NextResponse.json({ success: true })
    }

    // Flujo con contraseña temporal
    const tempPassword = generatePassword()

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    })

    if (authError || !authData?.user) {
      return NextResponse.json({ error: authError?.message || 'Error creando usuario' }, { status: 400 })
    }

    await supabaseAdmin.from('profiles').upsert({
      id: authData.user!.id,
      full_name, email, company_id, role, is_active: true,
    }, { onConflict: 'id' })

    // Enviar email de bienvenida con contraseña
    await resend.emails.send({
      from: 'montano.academy <noreply@montano.academy>',
      to: email,
      subject: `Bienvenido/a a montano.academy — ${company_name || 'Grupo Montano'}`,
      html: `
<html>
<head><meta charset="utf-8"><style>
body { margin: 0; padding: 0; background: #F0EEE8; font-family: 'Helvetica Neue', Arial, sans-serif; }
.container { max-width: 560px; margin: 40px auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
.header { background: linear-gradient(135deg, #043851, #0067A9); padding: 40px 40px 32px; text-align: center; }
.logo-text { font-size: 28px; font-weight: 900; color: #FED809; letter-spacing: -0.5px; }
.tagline { font-size: 12px; color: rgba(255,255,255,0.6); margin-top: 6px; letter-spacing: 0.1em; text-transform: uppercase; }
.body { padding: 40px; }
.title { font-size: 22px; font-weight: 700; color: #1A1A2E; margin-bottom: 12px; }
.text { font-size: 15px; color: #6B7280; line-height: 1.6; margin-bottom: 24px; }
.creds { background: #F9FAFB; border: 1px solid #E8E8E0; border-radius: 12px; padding: 20px 24px; margin-bottom: 24px; }
.cred-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #F0F0F0; }
.cred-row:last-child { border-bottom: none; }
.cred-label { font-size: 12px; font-weight: 600; color: #9A9AAA; text-transform: uppercase; letter-spacing: 0.05em; }
.cred-value { font-size: 14px; font-weight: 700; color: #1A1A2E; font-family: monospace; }
.btn { display: block; width: fit-content; margin: 0 auto 32px; padding: 14px 36px; background: #0067A9; color: white; text-decoration: none; border-radius: 12px; font-size: 15px; font-weight: 700; }
.small { font-size: 12px; color: #9A9AAA; line-height: 1.6; }
.footer { background: #F9FAFB; padding: 24px 40px; text-align: center; }
.footer-text { font-size: 12px; color: #9A9AAA; }
</style></head>
<body>
<div class="container">
  <div class="header">
    <div class="logo-text">montano.academy</div>
    <div class="tagline">Plataforma oficial de capacitación</div>
  </div>
  <div class="body">
    <div class="title">¡Bienvenido/a, ${full_name}!</div>
    <div class="text">Tu cuenta en montano.academy ha sido creada. Aquí están tus credenciales de acceso:</div>
    <div class="creds">
      <div class="cred-row">
        <span class="cred-label">Usuario</span>
        <span class="cred-value">${email}</span>
      </div>
      <div class="cred-row">
        <span class="cred-label">Contraseña temporal</span>
        <span class="cred-value">${tempPassword}</span>
      </div>
    </div>
    <a href="https://montano.academy" class="btn">Ingresar a montano.academy →</a>
    <div class="small">
      Por seguridad, te recomendamos cambiar tu contraseña después de tu primer ingreso.<br>
      Si tienes problemas para acceder, contacta a tu administrador.
    </div>
  </div>
  <div class="footer">
    <div class="footer-text">
      Grupo Montano · Colegio Montano · MAC Guatemala · Vitanova<br>
      montano.academy
    </div>
  </div>
</div>
</body>
</html>`
    })

    // Sincronizar a Monday automáticamente
    try {
      await fetch('https://montano.academy/api/monday/sync-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: authData.user.id })
      })
    } catch (e) {
      console.log('Monday sync error:', e)
    }

    return NextResponse.json({ success: true, tempPassword })

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
