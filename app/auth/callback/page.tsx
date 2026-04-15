'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function AuthCallbackPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Supabase maneja el token automáticamente desde el hash de la URL
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        if (session) setReady(true)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) { setError('Las contraseñas no coinciden'); return }
    if (password.length < 8) { setError('La contraseña debe tener al menos 8 caracteres'); return }

    setLoading(true)
    setError('')

    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push('/dashboard')
  }

  if (!ready) return (
    <main className="min-h-screen flex items-center justify-center"
      style={{ background: 'linear-gradient(160deg, #0A0E1A 0%, #111827 60%, #0D1520 100%)' }}>
      <div className="text-center">
        <div className="text-white text-sm mb-2">Verificando tu invitación...</div>
        <div className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>Por favor espera</div>
      </div>
    </main>
  )

  return (
    <main className="min-h-screen flex items-center justify-center"
      style={{ background: 'linear-gradient(160deg, #0A0E1A 0%, #111827 60%, #0D1520 100%)' }}>
      <div className="w-full max-w-md px-6">

        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold"
            style={{ background: 'linear-gradient(135deg, #FED809, #FFFFFF)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            montano.academy
          </h1>
          <p className="text-sm mt-3" style={{ color: 'rgba(255,255,255,0.5)' }}>
            Bienvenido/a — Crea tu contraseña para acceder
          </p>
        </div>

        <div className="rounded-2xl p-8"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>

          <h2 className="text-white text-base font-semibold mb-6 text-center">
            Crear contraseña
          </h2>

          <form onSubmit={handleSetPassword} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-widest mb-2"
                style={{ color: 'rgba(255,255,255,0.4)' }}>Nueva contraseña</label>
              <input type="password" value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres" required
                className="w-full rounded-xl px-4 py-3 text-white text-sm outline-none"
                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }} />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-widest mb-2"
                style={{ color: 'rgba(255,255,255,0.4)' }}>Confirmar contraseña</label>
              <input type="password" value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Repite tu contraseña" required
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
              {loading ? 'Guardando...' : 'Crear contraseña y entrar →'}
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}
