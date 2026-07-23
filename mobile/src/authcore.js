// Reine, plattformunabhängige Auth-Hilfen (ohne React-Native-Abhängigkeiten),
// damit sie in Node testbar sind. api.js nutzt sie für Header & Login-Parsing.

// Baut die HTTP-Header inkl. Bearer-Token (falls vorhanden).
export function authHeaders(token, extra = {}) {
  return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

// Wertet die Login-Antwort aus: 206 = MFA nötig, 2xx+Token = Erfolg, sonst Fehler.
export function parseLogin(status, body) {
  if (status === 206) return { mfaRequired: true };
  if (status >= 200 && status < 300 && body && body.token) return { token: body.token, user: body.user };
  return { error: (body && body.error) || `HTTP ${status}` };
}
