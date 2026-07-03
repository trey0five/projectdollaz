// A member invite emails a link to /login?invite=<token>. The invitee usually has
// NO account yet, so they must register → verify email → sign in before the invite
// can be accepted (acceptInvite needs an authenticated, email-matched user). That
// detour loses the token from the URL, so we STASH it in localStorage the moment we
// see it (on the login/register pages) and redeem it once the user is authenticated
// (SchoolContext.loadSchools). The token is randomBytes(32).toString('hex').
const KEY = 'finrep_pending_invite'
const TOKEN_RE = /^[0-9a-f]{32,160}$/i

/** Read an `?invite=` token from a URL search string, stash it, and return it.
 *  Falls back to any already-stashed token. */
export function captureInviteFromUrl(search) {
  try {
    const t = new URLSearchParams(search || '').get('invite')
    if (t && TOKEN_RE.test(t)) {
      localStorage.setItem(KEY, t)
      return t
    }
  } catch {
    /* ignore malformed URL / storage errors */
  }
  return getPendingInvite()
}

export function getPendingInvite() {
  try {
    return localStorage.getItem(KEY) || null
  } catch {
    return null
  }
}

export function clearPendingInvite() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
