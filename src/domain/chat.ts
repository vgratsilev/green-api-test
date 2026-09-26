export type GreenApiCredentials = {
  instanceId: string
  apiToken: string
}

export type IncomingNotification = {
  idMessage?: string
  typeWebhook?: string
  chatId?: string
  outgoingStatus?: OutgoingMessageStatus
  chatType?: string
  senderPhoneNumber?: string
  typeMessage?: string
  text?: string
}

export type OutgoingMessageStatus = 'delivered' | 'read' | 'failed' | 'noAccount'

export type ReceivedNotification = {
  receiptId: number
  notification?: IncomingNotification
}
