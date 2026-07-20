import { expect, spyOn, test } from 'bun:test'
import { printExtensionDiagnostics } from './definitions'

test('renders safe Extension diagnostics with their configured path', () => {
  const error = spyOn(console, 'error').mockImplementation(() => {})
  try {
    printExtensionDiagnostics([
      {
        path: '/safe/configured/package',
        message: 'Extension entry could not be evaluated',
      },
    ])

    expect(error).toHaveBeenCalledWith(
      'Extension /safe/configured/package: Extension entry could not be evaluated',
    )
  } finally {
    error.mockRestore()
  }
})
