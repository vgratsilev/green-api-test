export type GreenApiCredentials = {
  instanceId: string;
  apiToken: string;
};

export type InstanceState =
  'authorized' | 'notAuthorized' | 'blocked' | 'starting' | 'yellowCard' | 'unknown';

export type IncomingNotification = {
  idMessage?: string;
  typeWebhook?: string;
  chatId?: string;
  outgoingStatus?: OutgoingMessageStatus;
  chatType?: string;
  senderPhoneNumber?: string;
  typeMessage?: string;
  text?: string;
  /** Provider event time, or the local receive time when the provider value is missing or invalid. */
  timestamp?: number;
};

export type OutgoingMessageStatus = 'delivered' | 'read' | 'failed' | 'noAccount';

export const MAX_MESSAGE_LENGTH = 4096;

export type ReceivedNotification = {
  receiptId: number;
  notification?: IncomingNotification;
};
