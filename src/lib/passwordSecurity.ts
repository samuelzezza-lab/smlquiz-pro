export type PasswordExposure = 'safe' | 'compromised' | 'unavailable'

/**
 * Checks the password against the free Pwned Passwords range API.
 * Only the first five SHA-1 hash characters are sent; the password itself
 * and the remaining hash are never transmitted.
 */
export async function checkPasswordExposure(password: string): Promise<PasswordExposure> {
  try {
    const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(password))
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase()
    const prefix = hash.slice(0, 5)
    const suffix = hash.slice(5)
    const response = await fetch('https://api.pwnedpasswords.com/range/' + prefix, {
      method: 'GET',
      headers: { 'Add-Padding': 'true' },
      cache: 'no-store',
    })
    if (!response.ok) return 'unavailable'
    const rows = await response.text()
    const compromised = rows.split(/\r?\n/).some(line => line.split(':')[0]?.trim().toUpperCase() === suffix)
    return compromised ? 'compromised' : 'safe'
  } catch {
    return 'unavailable'
  }
}
