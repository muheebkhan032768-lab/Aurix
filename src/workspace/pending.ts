export interface ComposerAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  dataBase64?: string;
  text?: string;
}

export interface PendingAsk {
  text: string;
  attachments?: ComposerAttachment[];
  nonce: number;
}
