// Authentifizierung: scrypt-Passwort-Hashing, Sitzungs-Tokens (nur Hash in der DB), Benutzernamen-Regeln, Rate-Limits.
import crypto from 'node:crypto';

const scrypt = (pw, salt, n = 16384) => new Promise((res, rej) => crypto.scrypt(pw, salt, 64, { N: n, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (e, k) => (e ? rej(e) : res(k))));
export async function hashPassword(pw) { const salt = crypto.randomBytes(16); const h = await scrypt(pw, salt); return `scrypt$16384$${salt.toString('hex')}$${h.toString('hex')}`; }
export async function verifyPassword(pw, stored) {
  const [alg, n, salt, hash] = String(stored).split('$'); if (alg !== 'scrypt') return false;
  const h = await scrypt(pw, Buffer.from(salt, 'hex'), +n), a = Buffer.from(hash, 'hex');
  return h.length === a.length && crypto.timingSafeEqual(h, a);
}
export const newToken = () => crypto.randomBytes(32).toString('base64url');
export const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

const RESERVED = ['admin', 'administrator', 'owner', 'moderator', 'mod', 'system', 'server', 'staff', 'support', 'neon', 'neonfrontier', 'frontier', 'bot', 'guest', 'gast', 'null', 'undefined', 'aurelio', 'aureliozingarello', 'zingarello', 'root'];
const BAD = ['fuck', 'shit', 'bitch', 'nazi', 'hitler', 'nigg', 'fick', 'hurensohn', 'wichser', 'arschloch', 'scheiss', 'fotze', 'nutte', 'porn', 'rape', 'cunt', 'penis', 'vagina'];
const norm = (s) => s.toLowerCase().replace(/[0@]/g, 'o').replace(/[1!|]/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/[5$]/g, 's').replace(/[_\-.]/g, '');
export function validateUsername(u, { isOwnerName = false } = {}) {
  if (typeof u !== 'string') return 'Benutzername fehlt.';
  if (!/^[A-Za-z0-9_-]{3,16}$/.test(u)) return 'Benutzername: 3–16 Zeichen, nur Buchstaben, Zahlen, _ und -.';
  const n = norm(u);
  if (!isOwnerName && RESERVED.some(r => norm(r) === n)) return 'Dieser Benutzername ist reserviert.';
  if (BAD.some(b => n.includes(norm(b)))) return 'Dieser Benutzername ist nicht erlaubt.';
  return null;
}
export function validatePassword(p) {
  if (typeof p !== 'string' || p.length < 8) return 'Passwort: mindestens 8 Zeichen.';
  if (p.length > 128) return 'Passwort: höchstens 128 Zeichen.';
  if (/^(.)\1+$/.test(p) || ['12345678', 'password', 'passwort', 'qwertzui', 'qwertyui'].includes(p.toLowerCase())) return 'Dieses Passwort ist zu einfach.';
  return null;
}
export const filterText = (t) => { let o = String(t); for (const b of BAD) o = o.replace(new RegExp(b, 'gi'), '*'.repeat(b.length)); return o; };

// Einfacher Fenster-Ratelimiter im Speicher (pro Schlüssel: max Treffer in windowMs). hit() liefert 0 = erlaubt, sonst Sekunden bis Freigabe.
export class RateLimiter {
  constructor() { this.m = new Map(); setInterval(() => { const now = Date.now(); for (const [k, v] of this.m) if (v.reset < now) this.m.delete(k); }, 60000).unref(); }
  hit(key, max, windowMs) {
    const now = Date.now(); let v = this.m.get(key); if (!v || v.reset < now) { v = { n: 0, reset: now + windowMs }; this.m.set(key, v); }
    v.n++; return v.n <= max ? 0 : Math.ceil((v.reset - now) / 1000);
  }
  count(key) { const v = this.m.get(key); return v && v.reset > Date.now() ? v.n : 0; }
  clear(key) { this.m.delete(key); }
}

export const ROLE_RANK = { PLAYER: 0, MODERATOR: 1, ADMIN: 2, OWNER: 3 };
export const can = (role, min) => (ROLE_RANK[role] ?? 0) >= ROLE_RANK[min];
