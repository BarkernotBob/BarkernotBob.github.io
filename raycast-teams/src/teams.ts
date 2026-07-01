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
