import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Company = {
  id: string
  name: string
  slug: string
  primary_color: string
  secondary_color: string
  logo_url: string | null
}

export type Profile = {
  id: string
  full_name: string
  email: string
  company_id: string
  role: 'superadmin' | 'admin' | 'collaborator'
  is_active: boolean
  avatar_url: string | null
}

export type Conversation = {
  id: string
  user_id: string
  company_id: string
  status: 'active' | 'completed' | 'abandoned'
  score: number | null
  started_at: string
  completed_at: string | null
}

export type Message = {
  id: string
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

export type Certificate = {
  id: string
  user_id: string
  company_id: string
  certificate_number: string
  score: number
  pdf_url: string | null
  issued_at: string
}
