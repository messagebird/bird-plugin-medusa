import type {
  CreateNotificationDTO,
  ModuleProvider,
} from "@medusajs/framework/types";
import type {
  BirdNotificationProviderData,
  BirdNotificationProviderOptions,
} from "../src";

const options: BirdNotificationProviderOptions = {
  api_key: "bk_eu1_test_key",
  channels: ["email", "sms", "whatsapp"],
};

export const provider: ModuleProvider = {
  resolve: "@messagebird/bird-plugin-medusa/providers/bird",
  id: "bird",
  options,
};

const providerData: BirdNotificationProviderData = {
  language: "en",
  idempotency_key: "order-confirmation/order-123",
};

export const notification: CreateNotificationDTO = {
  to: "customer@example.com",
  channel: "email",
  template: "order-confirmation",
  provider_data: providerData,
};

import type {
  EmailMessageRequest,
  SmsMessageRequest,
  WhatsAppMessageRequest,
} from "../src/generated/operations.gen";

export const storedEmail: EmailMessageRequest = {
  from: "orders@example.com",
  to: ["customer@example.com"],
  template: { slug: "order-confirmation", parameters: { order_id: "123" } },
};

export const inlineSms: SmsMessageRequest = {
  from: "Bird",
  to: "+3197012345678",
  text: "Your order has shipped.",
  category: "transactional",
};

export const storedWhatsApp: WhatsAppMessageRequest = {
  to: "+3197012345678",
  template: {
    slug: "order-confirmation",
    components: [{ type: "body", parameters: [{ type: "text", text: "123" }] }],
  },
};

// @ts-expect-error An SMS template supplies its category.
export const invalidSms: SmsMessageRequest = {
  to: "+3197012345678",
  template: { slug: "order-shipped" },
  category: "transactional",
};

// @ts-expect-error A template reference must select either its ID or its slug.
export const invalidTemplate: NonNullable<EmailMessageRequest["template"]> = {
  id: "emt_example",
  slug: "order-confirmation",
};
