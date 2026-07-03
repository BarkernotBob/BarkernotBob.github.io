import { LocalStorage, getPreferenceValues } from "@raycast/api"

/**
 * A saved chat / contact. One email = a 1:1 chat, multiple = a group chat.
 * We never call the Microsoft Graph API, so there is no auth here — everything
 * is driven by Teams "deep links" (public URLs Teams knows how to open).
 */
export type Contact = {
  id: string
  name: string
  emails: string[]
  /** Optional name shown at the top of a new group chat. */
  topicName?: string
  pinned?: boolean
  /** epoch ms of the last time this chat was opened, for sorting. */
  lastUsed?: number
}

export type Preferences = {
  defaultClient: "web" | "desktop"
}

const STORAGE_KEY = "teams-contacts"

/** Split a free-text field of emails on commas / spaces / semicolons. */
export function parseEmails(input: string): string[] {
  return input
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim())
}

export function isGroup(contact: Pick<Contact, "emails">): boolean {
  return contact.emails.length > 1
}

/**
 * Build the universal Teams deep link for a chat.
 * Ref: learn.microsoft.com "Configure deep links" → chat/0/0?users=...
 * Opening an existing 1:1 chat and starting a new one use the same URL —
 * Teams opens the existing conversation if there already is one.
 */
export function webChatLink(emails: string[], topicName?: string, message?: string): string {
  const params = new URLSearchParams()
  params.set("users", emails.join(","))
  if (topicName && emails.length > 1) params.set("topicName", topicName)
  if (message) params.set("message", message)
  return `https://teams.microsoft.com/l/chat/0/0?${params.toString()}`
}

/** The desktop-app variant of the same link (opens the installed Teams app directly). */
export function desktopChatLink(emails: string[], topicName?: string, message?: string): string {
  return webChatLink(emails, topicName, message).replace(
    "https://teams.microsoft.com/l/",
    "msteams:/l/",
  )
}

/** Pick the link that matches the user's "Open chats in" preference. */
export function preferredChatLink(emails: string[], topicName?: string, message?: string): string {
  const { defaultClient } = getPreferenceValues<Preferences>()
  return defaultClient === "desktop"
    ? desktopChatLink(emails, topicName, message)
    : webChatLink(emails, topicName, message)
}

/* ------------------------- persistence ------------------------- */

export async function loadContacts(): Promise<Contact[]> {
  const raw = await LocalStorage.getItem<string>(STORAGE_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as Contact[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function persist(contacts: Contact[]): Promise<void> {
  await LocalStorage.setItem(STORAGE_KEY, JSON.stringify(contacts))
}

/** Insert or update a contact (matched by id) and return the full list. */
export async function upsertContact(contact: Contact): Promise<Contact[]> {
  const contacts = await loadContacts()
  const index = contacts.findIndex((c) => c.id === contact.id)
  if (index >= 0) contacts[index] = contact
  else contacts.push(contact)
  await persist(contacts)
  return contacts
}

export async function deleteContact(id: string): Promise<Contact[]> {
  const contacts = (await loadContacts()).filter((c) => c.id !== id)
  await persist(contacts)
  return contacts
}

export async function togglePinned(id: string): Promise<Contact[]> {
  const contacts = await loadContacts()
  const target = contacts.find((c) => c.id === id)
  if (target) target.pinned = !target.pinned
  await persist(contacts)
  return contacts
}

/** Record that a chat was just opened, so it can float to the top of "Recent". */
export async function markUsed(id: string): Promise<void> {
  const contacts = await loadContacts()
  const target = contacts.find((c) => c.id === id)
  if (target) {
    target.lastUsed = Date.now()
    await persist(contacts)
  }
}

export function newId(): string {
  // crypto.randomUUID is available in Raycast's Node runtime.
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`
}

/* ------------------------- bulk import ------------------------- */

export type ParsedPerson = { name: string; email: string }

const EMAIL_G = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi

/** Turn an email local-part into a readable name, e.g. "john.smith" -> "John Smith". */
function prettifyLocalPart(email: string): string {
  const local = email.split("@")[0] ?? email
  const words = local
    .split(/[._-]+/)
    .map((w) => w.trim())
    .filter(Boolean)
  // If it's just a blob like "jsmith", leave it as-is rather than fake-capitalising.
  if (words.length <= 1) return words[0] ?? local
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
}

/**
 * Parse a free-form paste (from a GAL, a spreadsheet column, an email header,
 * a comma list, etc.) into one person per email. Handles:
 *   - bare emails, one per line or comma/semicolon/space separated
 *   - "Display Name <email@x.com>" and "Display Name (email@x.com)"
 *   - spreadsheet rows like "Display Name<TAB>email@x.com"
 * Names are used if present, otherwise derived from the email. De-duplicates
 * by email (case-insensitive), keeping the first/best name seen.
 */
export function parseContacts(text: string): ParsedPerson[] {
  const byEmail = new Map<string, ParsedPerson>()

  // Split into chunks on newlines, commas and semicolons (the common separators).
  for (const chunk of text.split(/[\n,;]+/)) {
    const trimmed = chunk.trim()
    if (!trimmed) continue

    const emails = trimmed.match(EMAIL_G)
    if (!emails) continue

    if (emails.length === 1) {
      const email = emails[0]
      // Whatever else is on this chunk is the display name (strip brackets/quotes).
      const leftover = trimmed
        .replace(email, "")
        .replace(/[<>()"':]/g, "")
        .replace(/\s+/g, " ")
        .trim()
      addPerson(byEmail, leftover || prettifyLocalPart(email), email)
    } else {
      // Multiple emails jammed together (e.g. space-separated) — treat each as bare.
      for (const email of emails) {
        addPerson(byEmail, prettifyLocalPart(email), email)
      }
    }
  }

  return Array.from(byEmail.values())
}

function addPerson(map: Map<string, ParsedPerson>, name: string, email: string) {
  const key = email.toLowerCase()
  const existing = map.get(key)
  // Keep a real name over a derived one if we see the same person twice.
  if (!existing || (looksDerived(existing.name, email) && !looksDerived(name, email))) {
    map.set(key, { name: name.trim(), email: email.trim() })
  }
}

function looksDerived(name: string, email: string): boolean {
  return name.toLowerCase() === prettifyLocalPart(email).toLowerCase()
}

/**
 * Add many people as 1:1 chats in a single write. Skips anyone whose email is
 * already saved (case-insensitive). Returns how many were added vs skipped.
 */
export async function bulkAddContacts(
  people: ParsedPerson[],
): Promise<{ added: number; skipped: number }> {
  const contacts = await loadContacts()
  const existing = new Set(contacts.flatMap((c) => c.emails.map((e) => e.toLowerCase())))

  let added = 0
  let skipped = 0
  for (const person of people) {
    if (existing.has(person.email.toLowerCase())) {
      skipped++
      continue
    }
    existing.add(person.email.toLowerCase())
    contacts.push({ id: newId(), name: person.name || person.email, emails: [person.email] })
    added++
  }

  if (added > 0) await LocalStorage.setItem(STORAGE_KEY, JSON.stringify(contacts))
  return { added, skipped }
}
