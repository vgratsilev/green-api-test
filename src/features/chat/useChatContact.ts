import { useEffect, useState } from 'react'

import type { createGreenApiClient } from '../../api/greenApi'
import type { GreenApiCredentials } from '../../domain/chat'

type ContactClient = Pick<ReturnType<typeof createGreenApiClient>, 'getContactInfo' | 'getAvatar'>

type UseChatContactOptions = {
  client: ContactClient
  credentials: GreenApiCredentials
  phone: string
}

export function useChatContact({ client, credentials, phone }: UseChatContactOptions) {
  const [contactName, setContactName] = useState<string>()
  const [avatarUrl, setAvatarUrl] = useState<string>()

  useEffect(() => {
    let ignore = false
    const controller = new AbortController()
    const chatId = `${phone}@c.us`

    setContactName(undefined)
    setAvatarUrl(undefined)

    void client.getContactInfo(credentials, chatId, controller.signal)
      .then((contact) => {
        const displayName = contact.contactName || contact.name
        if (!ignore && displayName) setContactName(displayName)
      })
      .catch(() => {})

    void client.getAvatar(credentials, chatId, controller.signal)
      .then((avatar) => {
        if (!ignore && avatar.available && avatar.url) setAvatarUrl(avatar.url)
      })
      .catch(() => {})

    return () => {
      ignore = true
      controller.abort()
    }
  }, [client, credentials, phone])

  return { contactName, avatarUrl, clearAvatar: () => setAvatarUrl(undefined) }
}
