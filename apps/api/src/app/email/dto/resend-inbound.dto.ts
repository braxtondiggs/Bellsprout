export interface ResendInboundPayload {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  reply_to?: string;
  headers: Record<string, string>;
  attachments?: ResendAttachment[];
}

export interface ResendAttachment {
  filename: string;
  content: string; // Base64 encoded
  contentType: string;
  size: number;
}
