'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getBranding } from '@/lib/branding'
import { useRouter } from 'next/navigation'

export default function DashboardPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<any>(null)
  const [company, setCompany] = useState<any>(null)
  const [certificate, setCertificate] = useState<any>(null)
  const [conversation, setConversation] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*, companies(*)')
        .eq('id', user.id)
        .single()

      if (profileData) {
        setProfile(profileData)
        setCompany(profileData.companies)

        // Buscar certificado
        const { data: cert } = await supabase
          .from('certificates')
          .select('*')
          .eq('user_id', user.id)
          .order('issued_at', { ascending: false })
          .limit(1)
          .single()
        setCertificate(cert)

        // Buscar conversación activa
        const { data: conv } = await supabase
          .from('conversations')
          .select('*')
          .eq('user_id', user.id)
          .order('started_at', { ascending: false })
          .limit(1)
          .single()
        setConversation(conv)
      }
      setLoading(false)
    }
    loadProfile()
  }, [router])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0A0E1A' }}>
      <div className="text-white text-sm">Cargando...</div>
    </div>
  )

  const branding = company ? getBranding(company.slug) : getBranding('colegio-montano')

  const status = certificate ? 'completed' : conversation?.status === 'active' ? 'active' : 'pending'

  return (
    <div className="min-h-screen flex" style={{ background: '#F8F7F4' }}>

      {/* Sidebar */}
      <div className="w-60 min-h-screen flex flex-col" style={{ background: branding.bgColor }}>
        <div className="p-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg overflow-hidden bg-white" style={{ padding: '3px' }}>
              <img src={branding.logoUrl} alt={branding.name}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
            <div>
              <p className="text-xs font-bold text-white leading-tight">{branding.name}</p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>montano.academy</p>
            </div>
          </div>
          <p className="text-xs mt-2" style={{ color: branding.secondaryColor }}>
            {branding.tagline}
          </p>
        </div>

        <nav className="p-3 flex-1">
          <div className="text-xs font-bold uppercase tracking-widest px-2 mt-3 mb-2"
            style={{ color: 'rgba(255,255,255,0.22)' }}>Principal</div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg mb-1"
            style={{ background: `${branding.secondaryColor}18`, color: branding.secondaryColor }}>
            <span className="text-sm">⊞</span>
            <span className="text-sm font-semibold">Mi aprendizaje</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg mb-1 cursor-pointer"
            style={{ color: 'rgba(255,255,255,0.5)' }}
            onClick={() => router.push('/induccion')}>
            <span className="text-sm">◎</span>
            <span className="text-sm">Mi inducción</span>
          </div>
          <div className="text-xs font-bold uppercase tracking-widest px-2 mt-4 mb-2"
            style={{ color: 'rgba(255,255,255,0.22)' }}>Personal</div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg mb-1 cursor-pointer"
            style={{ color: 'rgba(255,255,255,0.5)' }}
            onClick={() => router.push('/certificados')}>
            <span className="text-sm">◈</span>
            <span className="text-sm">Certificados</span>
          </div>
          {['superadmin', 'admin'].includes(profile?.role) && (
            <>
              <div className="text-xs font-bold uppercase tracking-widest px-2 mt-4 mb-2"
                style={{ color: 'rgba(255,255,255,0.22)' }}>Administración</div>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg mb-1 cursor-pointer"
                style={{ color: 'rgba(255,255,255,0.5)' }}
                onClick={() => router.push('/admin')}>
                <span className="text-sm">⚙</span>
                <span className="text-sm">Panel admin</span>
              </div>
            </>
          )}
        </nav>

        <div className="p-4 border-t flex items-center gap-3"
          style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
            style={{ background: branding.primaryColor }}>
            {profile?.full_name?.charAt(0) || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-white truncate">{profile?.full_name}</div>
            <div className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
              {profile?.role === 'superadmin' ? 'Super Admin' :
               profile?.role === 'admin' ? 'Administrador' : 'Colaborador'}
            </div>
          </div>
          <button onClick={handleLogout} className="text-xs cursor-pointer"
            style={{ color: 'rgba(255,255,255,0.3)' }}>↩</button>
        </div>
      </div>

      {/* Main */}
      <div cl
cat > app/dashboard/page.tsx << 'EOF'
'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getBranding } from '@/lib/branding'
import { useRouter } from 'next/navigation'

export default function DashboardPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<any>(null)
  const [company, setCompany] = useState<any>(null)
  const [certificate, setCertificate] = useState<any>(null)
  const [conversation, setConversation] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*, companies(*)')
        .eq('id', user.id)
        .single()

      if (profileData) {
        setProfile(profileData)
        setCompany(profileData.companies)

        // Buscar certificado
        const { data: cert } = await supabase
          .from('certificates')
          .select('*')
          .eq('user_id', user.id)
          .order('issued_at', { ascending: false })
          .limit(1)
          .single()
        setCertificate(cert)

        // Buscar conversación activa
        const { data: conv } = await supabase
          .from('conversations')
          .select('*')
          .eq('user_id', user.id)
          .order('started_at', { ascending: false })
          .limit(1)
          .single()
        setConversation(conv)
      }
      setLoading(false)
    }
    loadProfile()
  }, [router])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0A0E1A' }}>
      <div className="text-white text-sm">Cargando...</div>
    </div>
  )

  const branding = company ? getBranding(company.slug) : getBranding('colegio-montano')

  const status = certificate ? 'completed' : conversation?.status === 'active' ? 'active' : 'pending'

  return (
    <div className="min-h-screen flex" style={{ background: '#F8F7F4' }}>

      {/* Sidebar */}
      <div className="w-60 min-h-screen flex flex-col" style={{ background: branding.bgColor }}>
        <div className="p-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg overflow-hidden bg-white" style={{ padding: '3px' }}>
              <img src={branding.logoUrl} alt={branding.name}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
            <div>
              <p className="text-xs font-bold text-white leading-tight">{branding.name}</p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>montano.academy</p>
            </div>
          </div>
          <p className="text-xs mt-2" style={{ color: branding.secondaryColor }}>
            {branding.tagline}
          </p>
        </div>

        <nav className="p-3 flex-1">
          <div className="text-xs font-bold uppercase tracking-widest px-2 mt-3 mb-2"
            style={{ color: 'rgba(255,255,255,0.22)' }}>Principal</div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg mb-1"
            style={{ background: `${branding.secondaryColor}18`, color: branding.secondaryColor }}>
            <span className="text-sm">⊞</span>
            <span className="text-sm font-semibold">Mi aprendizaje</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg mb-1 cursor-pointer"
            style={{ color: 'rgba(255,255,255,0.5)' }}
            onClick={() => router.push('/induccion')}>
            <span className="text-sm">◎</span>
            <span className="text-sm">Mi inducción</span>
          </div>
          <div className="text-xs font-bold uppercase tracking-widest px-2 mt-4 mb-2"
            style={{ color: 'rgba(255,255,255,0.22)' }}>Personal</div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg mb-1 cursor-pointer"
            style={{ color: 'rgba(255,255,255,0.5)' }}
            onClick={() => router.push('/certificados')}>
            <span className="text-sm">◈</span>
            <span className="text-sm">Certificados</span>
          </div>
          {['superadmin', 'admin'].includes(profile?.role) && (
            <>
              <div className="text-xs font-bold uppercase tracking-widest px-2 mt-4 mb-2"
                style={{ color: 'rgba(255,255,255,0.22)' }}>Administración</div>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg mb-1 cursor-pointer"
                style={{ color: 'rgba(255,255,255,0.5)' }}
                onClick={() => router.push('/admin')}>
                <span className="text-sm">⚙</span>
                <span className="text-sm">Panel admin</span>
              </div>
            </>
          )}
        </nav>

        <div className="p-4 border-t flex items-center gap-3"
          style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
            style={{ background: branding.primaryColor }}>
            {profile?.full_name?.charAt(0) || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-white truncate">{profile?.full_name}</div>
            <div className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
              {profile?.role === 'superadmin' ? 'Super Admin' :
               profile?.role === 'admin' ? 'Administrador' : 'Colaborador'}
            </div>
          </div>
          <button onClick={handleLogout} className="text-xs cursor-pointer"
            style={{ color: 'rgba(255,255,255,0.3)' }}>↩</button>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col">
        <div className="bg-white border-b px-8 h-16 flex items-center justify-between"
          style={{ borderColor: '#E8E8E0' }}>
          <h1 className="text-lg font-bold" style={{ color: '#1A1A2E' }}>Mi aprendizaje</h1>
          <div className="text-xs font-semibold px-3 py-1 rounded-full"
            style={{
              background: status === 'completed' ? '#DCFCE7' : status === 'active' ? '#FFFBE6' : '#F3F4F6',
              color: status === 'completed' ? '#166534' : status === 'active' ? '#B45309' : '#6B7280',
              border: `1px solid ${status === 'completed' ? '#BBF7D0' : status === 'active' ? '#FDE68A' : '#E5E7EB'}`
            }}>
            {status === 'completed' ? 'Completado' : status === 'active' ? 'En progreso' : 'Sin iniciar'}
          </div>
        </div>

        <div className="p-8">
          <div className="mb-6">
            <h2 className="text-2xl font-bold" style={{ color: '#1A1A2E' }}>
              Hola, {profile?.full_name?.split(' ')[0]} 👋
            </h2>
            <p className="text-sm mt-1" style={{ color: '#7A7A8A' }}>
              {status === 'completed'
                ? '¡Felicidades! Completaste tu inducción exitosamente.'
                : status === 'active'
                ? 'Tu inducción está en progreso. Continúa cuando estés listo.'
                : 'Bienvenido a montano.academy. Tu inducción está lista para comenzar.'}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-white rounded-xl p-5 border" style={{ borderColor: '#E8E8E0' }}>
              <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: '#9A9AAA' }}>Estado</div>
              <div className="text-base font-bold" style={{ color: '#1A1A2E' }}>
                {status === 'completed' ? '✅ Completado' : status === 'active' ? '🟡 En progreso' : '⚪ Sin iniciar'}
              </div>
            </div>
            <div className="bg-white rounded-xl p-5 border" style={{ borderColor: '#E8E8E0' }}>
              <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: '#9A9AAA' }}>Inducción</div>
              <div className="text-base font-bold" style={{ color: '#1A1A2E' }}>
                {status === 'completed' ? 'Finalizada' : 'Pendiente'}
              </div>
            </div>
            <div className="bg-white rounded-xl p-5 border" style={{ borderColor: '#E8E8E0'}}
              onClick={() => certificate && router.push('/certificados')}
              style={{ borderColor: '#E8E8E0', cursor: certificate ? 'pointer' : 'default' }}>
              <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: '#9A9AAA' }}>Certificado</div>
              <div className="text-base font-bold" style={{ color: certificate ? branding.primaryColor : '#1A1A2E' }}>
                {certificate ? `Ver certificado →` : '—'}
              </div>
            </div>
          </div>

          <div className="text-sm font-bold mb-4" style={{ color: '#1A1A2E' }}>
            Mi curso asignado
          </div>

          <div className="bg-white rounded-2xl overflow-hidden border max-w-md cursor-pointer hover:shadow-lg transition-all"
            style={{ borderColor: '#E8E8E0' }}
            onClick={() => router.push('/induccion')}>
            <div className="p-6 relative overflow-hidden"
              style={{ background: `linear-gradient(135deg, ${branding.bgColor}, ${branding.primaryColor})` }}>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 w-20 h-20 opacity-15">
                <img src={branding.logoUrl} alt={branding.name}
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              </div>
              <div className="text-xs font-bold uppercase tracking-widest mb-1"
                style={{ color: branding.secondaryColor }}>{branding.name}</div>
              <div className="text-lg font-bold text-white">Inducción General</div>
              <div className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
                Conversación con {branding.agentName}
              </div>
            </div>
            <div className="p-5">
              <div className="flex justify-between items-center mb-4">
                <span className="text-sm font-semibold px-3 py-1 rounded-full"
                  style={{
                    background: status === 'completed' ? '#DCFCE7' : status === 'active' ? '#FFFBE6' : '#F3F4F6',
                    color: status === 'completed' ? '#166534' : status === 'active' ? '#B45309' : '#6B7280'
                  }}>
                  {status === 'completed' ? 'Completado' : status === 'active' ? 'En progreso' : 'Sin iniciar'}
                </span>
                {certificate && (
                  <span className="text-sm font-bold" style={{ color: branding.primaryColor }}>
                    {certificate.score}/100
                  </span>
                )}
              </div>
              <div className="flex gap-4 text-xs mb-4" style={{ color: '#9A9AAA' }}>
                <span>{branding.agentName}</span>
                <span>~60 min</span>
                <span>Certificado incluido</span>
              </div>
              <button className="w-full py-3 rounded-xl text-sm font-bold text-white"
                style={{ background: status === 'completed' ? '#6B7280' : branding.primaryColor }}>
                {status === 'completed' ? 'Ver conversación' : status === 'active' ? 'Continuar inducción →' : 'Iniciar mi inducción →'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
