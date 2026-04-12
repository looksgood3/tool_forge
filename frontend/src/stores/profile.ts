import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ProfileState {
  nickname: string
  avatarDataUrl: string
  ai: {
    configured: boolean
    provider?: 'openai' | 'anthropic' | 'custom'
    model?: string
  }
  setNickname: (nickname: string) => void
  setAvatar: (avatarDataUrl: string) => void
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set) => ({
      nickname: '开发者',
      avatarDataUrl: '',
      ai: { configured: false },
      setNickname: (nickname) => set({ nickname }),
      setAvatar: (avatarDataUrl) => set({ avatarDataUrl }),
    }),
    { name: 'tool-forge:profile' }
  )
)
