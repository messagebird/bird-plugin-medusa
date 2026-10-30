import type {
  birdOperations,
  EmailMessageRequest,
  SmsMessageRequest,
} from "./generated/operations.gen";

export type BirdNotificationProviderOptions = {
  api_key: string;
  channels: (keyof typeof birdOperations)[];
  email_from?: string;
  sms_from?: string;
  whatsapp_from?: string;
};

export type BirdNotificationProviderData = {
  language?: string;
  category?: EmailMessageRequest["category"] | SmsMessageRequest["category"];
  idempotency_key?: string;
  preview_url?: boolean;
  cc?: string[];
  bcc?: string[];
  reply_to?: string[];
};
