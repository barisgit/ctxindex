import { expect, test } from 'bun:test'
import { getSkillContent, listSkills, type SkillsSource } from './loader'

function embedded(
  files: Array<{ readonly path: string; readonly content: string }>,
): SkillsSource {
  return {
    kind: 'embedded',
    location: 'embedded://ctxindex/skills',
    files,
  }
}

test('embedded skills list keeps references addressable but lists only top-level skills', async () => {
  const skills = embedded([
    { path: 'reference/guide.md', content: '# Guide\n\nReference summary.' },
    { path: 'README.md', content: '# Directory documentation' },
    { path: 'getting-started.md', content: '# Start\n\nStart summary.' },
  ])

  expect(await listSkills(skills)).toEqual([
    {
      name: 'getting-started',
      path: 'embedded://ctxindex/skills/getting-started.md',
      summary: 'Start summary.',
    },
  ])
})

test('embedded skill inlining preserves traversal and cycle protections', async () => {
  const traversal = embedded([
    { path: 'start.md', content: '[outside](../outside.md)' },
  ])
  await expect(
    getSkillContent(traversal, 'start', { inline: true }),
  ).rejects.toThrow('outside bundled skills location')

  const cycle = embedded([
    { path: 'a.md', content: '[B](./b.md)' },
    { path: 'b.md', content: '[A](./a.md)' },
  ])
  await expect(getSkillContent(cycle, 'a', { inline: true })).rejects.toThrow(
    'a -> b -> a',
  )
})
