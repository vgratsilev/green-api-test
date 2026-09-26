import { useEffect, useState } from 'react'

import type { createGreenApiClient } from '../../api/greenApi'
import type { GreenApiCredentials } from '../../domain/chat'

type ContactClient = Pick<ReturnType<typeof createGreenApiClient>, 'getContactInfo'>

type UseChatContactOptions = {
  client: ContactClient
  credentials: GreenApiCredentials
  phone: string
}

export function useChatContact({ client, credentials, phone }: UseChatContactOptions) {
  const [contactName, setContactName] = useState<string>()
  const [avatarUrl, setAvatarUrl] = useState<string>()
  const [contactChatId, setContactChatId] = useState<string>()

  useEffect(() => {
    let ignore = false
    const controller = new AbortController()
    const chatId = `${phone}@c.us`

    setContactName(undefined)
    setAvatarUrl(undefined)
    setContactChatId(undefined)

    void client.getContactInfo(credentials, chatId, controller.signal)
      .then((contact) => {
        const displayName = contact.contactName || contact.name
        if (ignore) return
        if (displayName) setContactName(displayName)
        if (contact.avatar && isSafeAvatarUrl(contact.avatar)) setAvatarUrl(contact.avatar)
        if (contact.chatType === 'user'
          && contact.chatId
          && (!contact.phoneNumber || contact.phoneNumber === '0' || contact.phoneNumber === phone)) {
          setContactChatId(contact.chatId)
        }
      })
      .catch(() => {})

    return () => {
      ignore = true
      controller.abort()
    }
  }, [client, credentials, phone])

  return { contactName, avatarUrl, contactChatId, clearAvatar: () => setAvatarUrl(undefined) }
}

function isSafeAvatarUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}
