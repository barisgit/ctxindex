import { plainTextResponse } from '@/lib/shared'
import { getLLMText, source } from '@/lib/source'

export const revalidate = false

export async function GET() {
  const scan = source.getPages().map(getLLMText)
  const scanned = await Promise.all(scan)

  return plainTextResponse(scanned.join('\n\n'))
}
