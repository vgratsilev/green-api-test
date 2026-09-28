import { useCallback, useEffect, useState } from 'react';

import type { createGreenApiClient } from '../../api/greenApi';
import type { GreenApiCredentials } from '../../domain/chat';

type ContactClient = Pick<ReturnType<typeof createGreenApiClient>, 'getContactInfo'>;

type UseChatContactOptions = {
  client: ContactClient;
  credentials: GreenApiCredentials;
  phone: string;
};

export function useChatContact({ client, credentials, phone }: UseChatContactOptions) {
  const [contact, setContact] = useState<{
    status: 'loading' | 'resolved' | 'unavailable';
    contactName?: string;
    avatarUrl?: string;
    contactChatId?: string;
  }>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let ignore = false;
    const controller = new AbortController();
    const chatId = `${phone}@c.us`;

    setContact({ status: 'loading' });

    void client
      .getContactInfo(credentials, chatId, controller.signal)
      .then((contact) => {
        const displayName = contact.contactName || contact.name;
        if (ignore) return;
        const contactChatId =
          contact.chatType === 'user' &&
          contact.chatId &&
          (!contact.phoneNumber || contact.phoneNumber === '0' || contact.phoneNumber === phone)
            ? contact.chatId
            : undefined;
        setContact({
          status: contactChatId ? 'resolved' : 'unavailable',
          contactName: displayName,
          avatarUrl: contact.avatar && isSafeAvatarUrl(contact.avatar) ? contact.avatar : undefined,
          contactChatId,
        });
      })
      .catch(() => {
        if (!ignore) setContact({ status: 'unavailable' });
      });

    return () => {
      ignore = true;
      controller.abort();
    };
  }, [attempt, client, credentials, phone]);

  const retry = useCallback(() => setAttempt((current) => current + 1), []);
  const clearAvatar = useCallback(() => {
    setContact((current) => ({ ...current, avatarUrl: undefined }));
  }, []);

  return { ...contact, retry, clearAvatar };
}

function isSafeAvatarUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}
