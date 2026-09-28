import { useCallback, useEffect, useState } from 'react';

import type { createGreenApiClient } from '../../api/greenApi';
import type { GreenApiCredentials } from '../../domain/chat';

type ContactClient = Pick<ReturnType<typeof createGreenApiClient>, 'getContactInfo'>;

export type ChatContactSnapshot = {
  contactName?: string;
  avatarUrl?: string;
};

type UseChatContactOptions = {
  client: ContactClient;
  credentials: GreenApiCredentials;
  phone: string;
  initialContact?: ChatContactSnapshot;
  onContactChange?: (contact: ChatContactSnapshot) => void;
};

export function useChatContact({
  client,
  credentials,
  phone,
  initialContact,
  onContactChange,
}: UseChatContactOptions) {
  const [contact, setContact] = useState<{
    status: 'loading' | 'resolved' | 'unavailable';
    contactName?: string;
    avatarUrl?: string;
    contactChatId?: string;
  }>({ status: 'loading', ...initialContact });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    onContactChange?.({ contactName: contact.contactName, avatarUrl: contact.avatarUrl });
  }, [contact.contactName, contact.avatarUrl, onContactChange]);

  useEffect(() => {
    let ignore = false;
    const controller = new AbortController();
    const chatId = `${phone}@c.us`;

    setContact((current) => ({ ...current, status: 'loading', contactChatId: undefined }));

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
        if (!ignore) {
          setContact((current) => ({
            ...current,
            status: 'unavailable',
            contactChatId: undefined,
          }));
        }
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
