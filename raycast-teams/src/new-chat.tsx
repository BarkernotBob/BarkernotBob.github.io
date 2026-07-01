import {
  Action,
  ActionPanel,
  Form,
  Icon,
  closeMainWindow,
  open,
  popToRoot,
  showHUD,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api"
import { useState } from "react"
import {
  Contact,
  isEmail,
  isGroup,
  markUsed,
  newId,
  parseEmails,
  preferredChatLink,
  upsertContact,
} from "./teams"

type Props = {
  /** When present, the form edits this existing contact instead of creating one. */
  contact?: Contact
  /** Prefills the recipients box (e.g. from something typed in the search bar). */
  defaultRecipients?: string
  /** Called after a successful save so a parent list can refresh. */
  onSaved?: () => void
}

export default function NewChat(props: Props) {
  const { contact, defaultRecipients, onSaved } = props
  const { pop } = useNavigation()
  const editing = Boolean(contact)

  const [recipients, setRecipients] = useState(
    contact?.emails.join(", ") ?? defaultRecipients ?? "",
  )
  const [recipientsError, setRecipientsError] = useState<string | undefined>()

  function validate(value: string): boolean {
    const emails = parseEmails(value)
    if (emails.length === 0) {
      setRecipientsError("Add at least one email address")
      return false
    }
    const bad = emails.find((e) => !isEmail(e))
    if (bad) {
      setRecipientsError(`"${bad}" doesn't look like an email`)
      return false
    }
    setRecipientsError(undefined)
    return true
  }

  async function buildAndSave(values: {
    recipients: string
    name: string
    topicName: string
    message: string
    save: boolean
  }) {
    if (!validate(values.recipients)) return null
    const emails = parseEmails(values.recipients)

    const record: Contact = {
      id: contact?.id ?? newId(),
      name: values.name.trim() || emails.join(", "),
      emails,
      topicName: values.topicName.trim() || undefined,
      pinned: contact?.pinned,
      lastUsed: contact?.lastUsed,
    }

    if (editing || values.save) {
      await upsertContact(record)
    }
    return record
  }

  async function handleOpen(values: {
    recipients: string
    name: string
    topicName: string
    message: string
    save: boolean
  }) {
    const record = await buildAndSave(values)
    if (!record) return
    await markUsed(record.id).catch(() => undefined)
    const link = preferredChatLink(
      record.emails,
      record.topicName,
      values.message.trim() || undefined,
    )
    await open(link)
    await closeMainWindow()
    await showHUD("Opening Microsoft Teams…")
    onSaved?.()
  }

  async function handleSaveOnly(values: {
    recipients: string
    name: string
    topicName: string
    message: string
    save: boolean
  }) {
    const record = await buildAndSave({ ...values, save: true })
    if (!record) return
    await showToast({ style: Toast.Style.Success, title: editing ? "Chat updated" : "Chat saved" })
    onSaved?.()
    if (editing) pop()
    else popToRoot()
  }

  const groupHint = isGroup({ emails: parseEmails(recipients) })

  return (
    <Form
      navigationTitle={editing ? "Edit Teams Chat" : "New Teams Chat"}
      actions={
        <ActionPanel>
          <Action.SubmitForm icon={Icon.Play} title="Open in Teams" onSubmit={handleOpen} />
          <Action.SubmitForm
            icon={Icon.SaveDocument}
            title={editing ? "Save Changes" : "Save Without Opening"}
            shortcut={{ modifiers: ["cmd"], key: "s" }}
            onSubmit={handleSaveOnly}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="recipients"
        title="Recipients"
        placeholder="alex@contoso.com, sam@contoso.com"
        info="One email for a direct chat, or several (comma-separated) for a group chat. These are the people's Teams/Office 365 email addresses."
        value={recipients}
        error={recipientsError}
        onChange={(v) => {
          setRecipients(v)
          if (recipientsError) validate(v)
        }}
        onBlur={(e) => validate(e.target.value ?? "")}
      />
      <Form.TextField
        id="name"
        title="Saved Name"
        placeholder="Optional — e.g. Alex Kim"
        info="A friendly label used only inside Raycast so you can find this chat again. Leave blank to use the email(s)."
        defaultValue={contact?.name ?? ""}
      />
      {groupHint && (
        <Form.TextField
          id="topicName"
          title="Group Name"
          placeholder="Optional — e.g. Weekend Trip"
          info="Shown as the title of the group chat inside Teams."
          defaultValue={contact?.topicName ?? ""}
        />
      )}
      {!groupHint && (
        <Form.Description text="Add more emails above (comma-separated) to create a group chat." />
      )}
      <Form.Separator />
      <Form.TextArea
        id="message"
        title="First Message"
        placeholder="Optional — pre-fill a message (not sent automatically)"
        info="Teams drops this into the message box for you; you still press Send yourself."
      />
      {!editing && (
        <Form.Checkbox id="save" label="Save this chat for next time" defaultValue={true} />
      )}
    </Form>
  )
}
