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
    <main className="min-h-screen flex items-center justify-center"
      style={{ background: 'linear-gradient(160deg, #0A0E1A 0%, #111827 60%, #0D1520 100%)' }}>
      <div className="w-full max-w-md px-6">

        <div className="text-center mb-8">
          <p className="text-xs font-semibold tracking-widest uppercase mb-3"
            style={{ color: 'rgba(255,255,255,0.3)' }}>
            Plataforma oficial de capacitación
          </p>
          <h1 className="text-3xl font-bold"
            style={{ background: 'linear-gradient(135deg, #FED809, #FFFFFF)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            montano.academy
          </h1>

          {/* Logos */}
          <div className="flex items-center justify-center gap-4 mt-6">
            {[
              { src: '/logo-cm.jpg', alt: 'Colegio Montano' },
              { src: '/logo-mac.jpg', alt: 'MAC Guatemala' },
              { src: '/logo-vitanova.jpg', alt: 'Vitanova' },
            ].map((logo, i) => (
              <div key={i} className="w-16 h-16 rounded-xl overflow-hidden bg-white flex items-center justify-center p-1">
                <img src={logo.src} alt={logo.alt} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl p-8"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <h2 className="text-white text-base font-semibold mb-6 text-center">Iniciar sesión</h2>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-widest mb-2"
                style={{ color: 'rgba(255,255,255,0.4)' }}>Correo electrónico</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@empresa.com" required
                className="w-full rounded-xl px-4 py-3 text-white text-sm outline-none"
                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }} />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-widest mb-2"
                style={{ color: 'rgba(255,255,255,0.4)' }}>Contraseña</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" required
                className="w-full rounded-xl px-4 py-3 text-white text-sm outline-none"
                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }} />
            </div>
            {error && (
              <div className="rounded-xl px-4 py-3 text-sm text-center"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#FCA5A5' }}>
                {error}
              </div>
            )}
            <button type="submit" disabled={loading}
              className="w-full rounded-xl py-3 font-bold text-sm mt-2"
              style={{ background: 'linear-gradient(135deg, #FED809, #F5C800)', color: '#0A0E1A' }}>
              {loading ? 'Iniciando sesión...' : 'Iniciar sesión →'}
            </button>
          </form>
          <p className="text-center mt-4 text-xs cursor-pointer"
            style={{ color: 'rgba(255,255,255,0.25)' }}>
            ¿Olvidaste tu contraseña?
          </p>
        </div>
      </div>
    </main>
  )
}
