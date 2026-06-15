'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError('Correo o contraseña incorrectos'); setLoading(false); return }
    if (data.user) router.push('/dashboard')
  }

  return (
    <main className="min-h-screen flex" style={{ background: '#F5F7FA' }}>

      {/* Panel izquierdo — branding */}
      <div className="hidden lg:flex w-1/2 flex-col justify-between p-14"
        style={{ background: '#1C2B4A' }}>
        <div>
          <div className="flex items-center gap-2.5 mb-16">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-black"
              style={{ background: '#3B5BDB', color: 'white' }}>M</div>
            <span className="text-white font-bold text-base">montano.academy</span>
          </div>
          <h1 className="text-4xl font-black text-white leading-tight mb-4">
            Plataforma oficial<br />de capacitación
          </h1>
          <p className="text-base" style={{ color: 'rgba(255,255,255,0.5)' }}>
            Entrena, evalúa y certifica a tus colaboradores con inteligencia artificial.
          </p>
        </div>

        {/* Logos empresas */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest mb-4"
            style={{ color: 'rgba(255,255,255,0.3)' }}>Empresas del grupo</p>
          <div className="flex items-center gap-3">
            {[
              { src: '/logo-cm.jpg', alt: 'Colegio Montano' },
              { src: '/logo-mac.jpg', alt: 'MAC Guatemala' },
              { src: '/logo-vitanova.jpg', alt: 'Vitanova' },
              { src: '/logo-escolaris.png', alt: 'Escolaris' },
            ].map((logo, i) => (
              <div key={i} className="w-14 h-14 rounded-xl bg-white flex items-center justify-center p-2"
                style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
                <img src={logo.src} alt={logo.alt} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Panel derecho — formulario */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">

          {/* Logo mobile */}
          <div className="flex items-center gap-2.5 mb-10 lg:hidden">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-black"
              style={{ background: '#3B5BDB', color: 'white' }}>M</div>
            <span className="font-bold text-base" style={{ color: '#0F172A' }}>montano.academy</span>
          </div>

          <h2 className="text-2xl font-black mb-1" style={{ color: '#0F172A' }}>Bienvenido</h2>
          <p className="text-sm mb-8" style={{ color: '#94A3B8' }}>Ingresa con tu cuenta institucional</p>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold mb-2" style={{ color: '#475569' }}>
                Correo electrónico
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="tu@empresa.com"
                required
                className="w-full border rounded-xl px-4 py-3.5 text-sm outline-none transition-all"
                style={{ borderColor: '#E2E8F0', color: '#0F172A', background: 'white' }}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-2" style={{ color: '#475569' }}>
                Contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full border rounded-xl px-4 py-3.5 text-sm outline-none transition-all"
                style={{ borderColor: '#E2E8F0', color: '#0F172A', background: 'white' }}
              />
            </div>

            {error && (
              <div className="px-4 py-3 rounded-xl text-sm"
                style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl py-3.5 font-bold text-sm text-white transition-all"
              style={{ background: loading ? '#94A3B8' : '#3B5BDB' }}>
              {loading ? 'Iniciando sesión...' : 'Iniciar sesión →'}
            </button>
          </form>

          <p className="text-center mt-6 text-xs cursor-pointer hover:underline"
            style={{ color: '#94A3B8' }}>
            ¿Olvidaste tu contraseña? Contacta a tu administrador
          </p>

          {/* Logos mobile */}
          <div className="flex items-center justify-center gap-3 mt-10 lg:hidden">
            {[
              { src: '/logo-cm.jpg', alt: 'CM' },
              { src: '/logo-mac.jpg', alt: 'MAC' },
              { src: '/logo-vitanova.jpg', alt: 'Vitanova' },
              { src: '/logo-escolaris.png', alt: 'Escolaris' },
            ].map((logo, i) => (
              <div key={i} className="w-10 h-10 rounded-lg bg-white flex items-center justify-center p-1.5 border"
                style={{ borderColor: '#E2E8F0' }}>
                <img src={logo.src} alt={logo.alt} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              </div>
            ))}
          </div>

          <p className="text-center mt-8 text-xs" style={{ color: '#CBD5E1' }}>
            © 2025 Grupo Montano · montano.academy
          </p>
        </div>
      </div>
    </main>
  )
}
