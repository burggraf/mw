export interface SongFolder {
  id: string
  churchId: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
}

export interface SongFolderInput {
  name: string
  description?: string
}
