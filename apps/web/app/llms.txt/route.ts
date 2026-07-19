import { llms } from 'fumadocs-core/source'
import { plainTextResponse } from '@/lib/shared'
import { source } from '@/lib/source'

export const revalidate = false

export function GET() {
  return plainTextResponse(llms(source).index())
}
