import { useParams, Navigate } from 'react-router-dom'
import { getToolComponent } from './registry'

export function ToolRouter() {
  const { toolId } = useParams<{ toolId: string }>()
  const Component = toolId ? getToolComponent(toolId) : undefined
  if (!Component) return <Navigate to="/" replace />
  return <Component />
}
