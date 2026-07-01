import {
  Action,
  ActionPanel,
  Alert,
  Clipboard,
  Color,
  Icon,
  List,
  closeMainWindow,
  confirmAlert,
  open,
  showHUD,
  showToast,
  Toast,
} from "@raycast/api"
import { usePromise } from "@raycast/utils"
import { useState } from "react"
import NewChat from "./new-chat"
import {
  Contact,
  deleteContact,
  desktopChatLink,
  isEmail,
  isGroup,
  loadContacts,
  markUsed,
  parseEmails,
  preferredChatLink,
  togglePinned,
  webChatLink,
} from "./teams"

export default function SearchChats() {
  const { data: contacts = [], isLoading, revalidate } = usePromise(loadContacts)
  const [searchText, setSearchText] = useState("")

  const query = searchText.trim().toLowerCase()
  const filtered = contacts.filter((c) => {
    if (!query) return true
    return (
      c.name.toLowerCase().includes(query) || c.emails.some((e) => e.toLowerCase().includes(query))
    )
  })

  const pinned = filtered.filter((c) => c.pinned).sort(byRecent)
  const others = filtered.filter((c) => !c.pinned).sort(byRecent)

  // If what you typed is a full email (or emails) that isn't already saved,
  // offer to start a chat with it directly.
  const typedEmails = parseEmails(searchText)
  const typedIsEmail = typedEmails.length > 0 && typedEmails.every(isEmail)
  const alreadySaved = contacts.some(
    (c) => c.emails.slice().sort().join(",") === typedEmails.slice().sort().join(","),
  )
  const showAdHoc = typedIsEmail && !alreadySaved

  return (
    <List
      isLoading={isLoading}
      searchText={searchText}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder="Search saved chats, or type an email to start one…"
    >
      {showAdHoc && (
        <List.Section title="Start a new chat">
          <ChatItem
            key="adhoc"
            contact={{ id: "adhoc", name: typedEmails.join(", "), emails: typedEmails }}
            ephemeral
            revalidate={revalidate}
            searchText={searchText}
          />
        </List.Section>
      )}

      <List.Section title="Pinned">
        {pinned.map((c) => (
          <ChatItem key={c.id} contact={c} revalidate={revalidate} searchText={searchText} />
        ))}
      </List.Section>

      <List.Section title={pinned.length ? "Other Chats" : "Chats"}>
        {others.map((c) => (
          <ChatItem key={c.id} contact={c} revalidate={revalidate} searchText={searchText} />
        ))}
      </List.Section>

      <List.EmptyView
        icon={Icon.SpeechBubble}
        title={contacts.length === 0 ? "No saved chats yet" : "No matches"}
        description={
          contacts.length === 0
            ? "Type someone's Teams email above to start a chat, or press ⌘N to add one."
            : "Type a full email address to start a new chat with someone not in your list."
        }
        actions={
          <ActionPanel>
            <Action.Push
              icon={Icon.Plus}
              title="New Chat"
              target={<NewChat onSaved={revalidate} />}
            />
          </ActionPanel>
        }
      />
    </List>
  )
}

function byRecent(a: Contact, b: Contact): number {
  return (b.lastUsed ?? 0) - (a.lastUsed ?? 0)
}

function ChatItem(props: {
  contact: Contact
  revalidate: () => void
  searchText: string
  ephemeral?: boolean
}) {
  const { contact, revalidate, ephemeral } = props
  const group = isGroup(contact)

  async function openChat(link: string) {
    if (!ephemeral) await markUsed(contact.id).catch(() => undefined)
    await open(link)
    await closeMainWindow()
    await showHUD("Opening Microsoft Teams…")
    revalidate()
  }

  const accessories: List.Item.Accessory[] = []
  if (contact.pinned) accessories.push({ icon: Icon.Tack, tooltip: "Pinned" })
  accessories.push({ text: group ? `${contact.emails.length} people` : contact.emails[0] })

  return (
    <List.Item
      icon={
        group
          ? { source: Icon.TwoPeople, tintColor: Color.Purple }
          : { source: Icon.Person, tintColor: Color.Purple }
      }
      title={contact.name}
      subtitle={contact.topicName}
      accessories={accessories}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <Action
              icon={Icon.Play}
              title="Open in Teams"
              onAction={() => openChat(preferredChatLink(contact.emails, contact.topicName))}
            />
            <Action
              icon={Icon.Globe}
              title="Open in Teams (Web)"
              shortcut={{ modifiers: ["cmd"], key: "w" }}
              onAction={() => openChat(webChatLink(contact.emails, contact.topicName))}
            />
            <Action
              icon={Icon.Desktop}
              title="Open in Teams (Desktop App)"
              shortcut={{ modifiers: ["cmd", "shift"], key: "d" }}
              onAction={() => openChat(desktopChatLink(contact.emails, contact.topicName))}
            />
          </ActionPanel.Section>

          <ActionPanel.Section>
            {ephemeral ? (
              <Action.Push
                icon={Icon.Plus}
                title="Save & Edit Chat"
                shortcut={{ modifiers: ["cmd"], key: "s" }}
                target={
                  <NewChat defaultRecipients={contact.emails.join(", ")} onSaved={revalidate} />
                }
              />
            ) : (
              <>
                <Action.Push
                  icon={Icon.Pencil}
                  title="Edit Chat"
                  shortcut={{ modifiers: ["cmd"], key: "e" }}
                  target={<NewChat contact={contact} onSaved={revalidate} />}
                />
                <Action
                  icon={contact.pinned ? Icon.TackDisabled : Icon.Tack}
                  title={contact.pinned ? "Unpin" : "Pin"}
                  shortcut={{ modifiers: ["cmd", "shift"], key: "p" }}
                  onAction={async () => {
                    await togglePinned(contact.id)
                    revalidate()
                  }}
                />
                <Action
                  icon={Icon.Trash}
                  title="Delete Chat"
                  style={Action.Style.Destructive}
                  shortcut={{ modifiers: ["ctrl"], key: "x" }}
                  onAction={async () => {
                    const ok = await confirmAlert({
                      title: `Delete "${contact.name}"?`,
                      message:
                        "This only removes it from Raycast. Your Teams history is untouched.",
                      primaryAction: { title: "Delete", style: Alert.ActionStyle.Destructive },
                    })
                    if (ok) {
                      await deleteContact(contact.id)
                      await showToast({ style: Toast.Style.Success, title: "Deleted" })
                      revalidate()
                    }
                  }}
                />
              </>
            )}
          </ActionPanel.Section>

          <ActionPanel.Section>
            <Action.Push
              icon={Icon.Plus}
              title="New Chat"
              shortcut={{ modifiers: ["cmd"], key: "n" }}
              target={<NewChat onSaved={revalidate} />}
            />
            <Action
              icon={Icon.Clipboard}
              title="Copy Teams Link"
              shortcut={{ modifiers: ["cmd"], key: "c" }}
              onAction={async () => {
                await Clipboard.copy(webChatLink(contact.emails, contact.topicName))
                await showToast({ style: Toast.Style.Success, title: "Copied Teams link" })
              }}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  )
}
