import { supabase } from './supabase'

const FEATURES_URL = 'https://zjkuexlzcvlqliovadsa.supabase.co/functions/v1/features-api'
const FEATURES_PUBLISHABLE_KEY = 'sb_publishable_QZHsF6SPpVi5SuOkTuhTWQ_7MqPgKc6'

export type FeatureProfile = {
  id: string
  email: string | null
  full_name: string | null
  city: string | null
  study_area: string | null
  course_year: string | null
  university: string | null
  is_premium: boolean
  created_at: string
}

export type CommunityPost = {
  id: string
  user_id: string
  category: string | null
  title: string | null
  description: string | null
  city: string | null
  created_at: string
}

export type ExamMatch = {
  id: string
  user_id: string
  course_name: string | null
  exam_date: string | null
  status: string | null
  created_at: string
}

export type HouseExpense = {
  id: string
  payer_id: string
  group_name: string | null
  amount: number
  description: string | null
  created_at: string
}

/**
 * Calls the secondary project without creating a second browser login.
 * The primary SMLQUIZ session is verified server-side by features-api.
 * Never put a service_role/secret key in this file.
 */
export async function callFeaturesApi<T>(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  if (!supabase) throw new Error('Il collegamento a SMLQUIZ non è disponibile.')
  const { data, error } = await supabase.auth.getSession()
  if (error) throw new Error('Non riesco a verificare la sessione. Accedi di nuovo.')
  const token = data.session?.access_token
  if (!token) throw new Error('Accedi per utilizzare questa funzione.')

  const response = await fetch(FEATURES_URL, {
    method: 'POST',
    headers: {
      apikey: FEATURES_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, ...payload }),
  })

  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(typeof result?.error === 'string' ? result.error : 'Operazione non riuscita.')
  }
  return result as T
}

export const featureApi = {
  getProfile: () => callFeaturesApi<{ profile: FeatureProfile }>('profile.get'),
  updateProfile: (profile: Partial<Pick<FeatureProfile, 'full_name' | 'city' | 'study_area' | 'course_year' | 'university'>>) =>
    callFeaturesApi<{ profile: FeatureProfile }>('profile.update', profile as Record<string, unknown>),

  listPosts: (limit = 20) => callFeaturesApi<{ posts: CommunityPost[] }>('posts.list', { limit }),
  createPost: (post: Pick<CommunityPost, 'category' | 'title' | 'description' | 'city'>) =>
    callFeaturesApi<{ post: CommunityPost }>('posts.create', post as Record<string, unknown>),
  updatePost: (id: string, patch: Partial<Pick<CommunityPost, 'category' | 'title' | 'description' | 'city'>>) =>
    callFeaturesApi<{ post: CommunityPost }>('posts.update', { id, ...patch }),
  deletePost: (id: string) => callFeaturesApi<{ deleted: true }>('posts.delete', { id }),

  listExams: () => callFeaturesApi<{ exams: ExamMatch[] }>('exams.list'),
  createExam: (exam: Pick<ExamMatch, 'course_name' | 'exam_date'> & { status?: string }) =>
    callFeaturesApi<{ exam: ExamMatch }>('exams.create', exam as Record<string, unknown>),
  updateExam: (id: string, patch: Partial<Pick<ExamMatch, 'course_name' | 'exam_date' | 'status'>>) =>
    callFeaturesApi<{ exam: ExamMatch }>('exams.update', { id, ...patch }),
  deleteExam: (id: string) => callFeaturesApi<{ deleted: true }>('exams.delete', { id }),

  listExpenses: () => callFeaturesApi<{ expenses: HouseExpense[] }>('expenses.list'),
  createExpense: (expense: Pick<HouseExpense, 'group_name' | 'amount' | 'description'>) =>
    callFeaturesApi<{ expense: HouseExpense }>('expenses.create', expense as Record<string, unknown>),
  deleteExpense: (id: string) => callFeaturesApi<{ deleted: true }>('expenses.delete', { id }),
}
