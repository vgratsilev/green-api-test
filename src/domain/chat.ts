export type GreenApiCredentials = {
  instanceId: string
  apiToken: string
}

export type IncomingNotification = {
  idMessage?: string
  typeWebhook?: string
  chatType?: string
  senderPhoneNumber?: string
  typeMessage?: string
  text?: string
}

export type ReceivedNotification = {
  receiptId: number
  notification?: IncomingNotification
}
