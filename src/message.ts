import type { ProviderSendNotificationDTO } from "@medusajs/framework/types";
import { MedusaError } from "@medusajs/framework/utils";
import { birdOperations } from "./generated/operations.gen";
import type {
  EmailMessageRequest,
  SmsMessageRequest,
  WhatsAppMessageRequest,
} from "./generated/operations.gen";
import type { BirdNotificationProviderOptions } from "./types";

export function invalid(message: string): never {
  throw new MedusaError(MedusaError.Types.INVALID_DATA, message);
}

function nonBlank(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function regionalOrigin(key: unknown): string {
  if (typeof key !== "string")
    invalid("Set api_key to a current Bird API key.");
  const match = /^bk_([a-z]{2}\d+)_[A-Za-z0-9_-]+$/.exec(key);
  if (!match)
    invalid(
      "Set api_key to a current Bird API key beginning with bk_<region>_.",
    );
  return `https://${match[1]}.platform.bird.com`;
}

export function validateOptions(
  options: BirdNotificationProviderOptions,
): void {
  regionalOrigin(options.api_key);
  if (
    !Array.isArray(options.channels) ||
    !options.channels.length ||
    options.channels.some(
      (c) => c !== "email" && c !== "sms" && c !== "whatsapp",
    )
  ) {
    invalid("Set channels to email, sms, whatsapp, or a combination of them.");
  }
  for (const field of ["email_from", "sms_from", "whatsapp_from"] as const) {
    if (options[field] !== undefined && !nonBlank(options[field])) {
      invalid(
        `Set ${field} to a non-empty sender, or omit it and supply notification.from.`,
      );
    }
  }
}

export function prepareMessage(
  notification: ProviderSendNotificationDTO,
  options: BirdNotificationProviderOptions,
) {
  const channel = notification.channel;
  if (
    (channel !== "email" && channel !== "sms" && channel !== "whatsapp") ||
    !options.channels.includes(channel)
  ) {
    invalid(
      "This Bird provider is not configured for the notification channel. Enable email, sms, or whatsapp in channels.",
    );
  }
  if (!nonBlank(notification.to))
    invalid("Set notification.to to a recipient.");
  const extra = notification.provider_data ?? {};
  const allowed = new Set([
    "language",
    "idempotency_key",
    ...(channel === "whatsapp" ? ["preview_url"] : ["category"]),
    ...(channel === "email" ? ["cc", "bcc", "reply_to"] : []),
  ]);
  if (Object.keys(extra).some((key) => !allowed.has(key))) {
    invalid(
      "Unsupported provider_data field. See the Bird provider's documented options.",
    );
  }
  const idempotencyKey = extra.idempotency_key;
  if (
    idempotencyKey !== undefined &&
    (!nonBlank(idempotencyKey) ||
      idempotencyKey.length > 255 ||
      /[\r\n]/.test(idempotencyKey))
  ) {
    invalid(
      "Set provider_data.idempotency_key to a non-empty string of at most 255 characters without line breaks.",
    );
  }
  const language = extra.language;
  if (language !== undefined && !nonBlank(language))
    invalid("Set provider_data.language to a language tag, or omit it.");
  if (
    notification.data != null &&
    (typeof notification.data !== "object" || Array.isArray(notification.data))
  ) {
    invalid(
      "Set notification.data to an object containing template parameters.",
    );
  }
  const connection = { idempotencyKey: idempotencyKey as string | undefined };
  switch (channel) {
    case "email":
      return {
        ...birdOperations.email,
        ...connection,
        body: prepareEmailMessage(notification, options, language),
      };
    case "sms":
      return {
        ...birdOperations.sms,
        ...connection,
        body: prepareSmsMessage(notification, options, language),
      };
    case "whatsapp":
      return {
        ...birdOperations.whatsapp,
        ...connection,
        body: prepareWhatsAppMessage(notification, options, language),
      };
  }
}

function category<T extends string>(
  value: unknown,
  categories: readonly T[],
  channel: string,
): T {
  for (const candidate of categories) {
    if (value === candidate) return candidate;
  }
  return invalid(`Unsupported ${channel} category.`);
}

function templateSelector(template: string, prefix: string) {
  if (!nonBlank(template)) {
    invalid(
      "Set notification.template to a Bird template ID or slug, or supply inline content.",
    );
  }
  const value = template.trim();
  return value.startsWith(prefix) ? { id: value } : { slug: value };
}

function prepareEmailMessage(
  notification: ProviderSendNotificationDTO,
  options: BirdNotificationProviderOptions,
  language: string | undefined,
): EmailMessageRequest {
  const from = notification.from?.trim() || options.email_from;
  if (!from) {
    invalid(
      "Set email_from or notification.from to an address on your verified Bird domain.",
    );
  }
  const extra = notification.provider_data ?? {};
  const body: EmailMessageRequest = { from, to: [notification.to] };
  const content = notification.content;
  if (content != null) {
    if (extra.language !== undefined) {
      invalid(
        "provider_data.language applies to stored templates. Omit it for inline content.",
      );
    }
    if (
      !nonBlank(content.subject) ||
      (!nonBlank(content.html) && !nonBlank(content.text))
    ) {
      invalid(
        "Inline email requires content.subject and content.html or content.text.",
      );
    }
    body.subject = content.subject;
    if (content.html !== undefined) body.html = content.html;
    if (content.text !== undefined) body.text = content.text;
    if (notification.data != null) body.parameters = notification.data;
    body.category = category(
      extra.category ?? "transactional",
      birdOperations.email.categories,
      "email",
    );
  } else {
    body.template = {
      ...templateSelector(notification.template, "emt_"),
      ...(language === undefined ? {} : { language }),
      ...(notification.data == null ? {} : { parameters: notification.data }),
    };
    if (extra.category !== undefined) {
      body.category = category(
        extra.category,
        birdOperations.email.categories,
        "email",
      );
    }
  }
  for (const field of ["cc", "bcc", "reply_to"] as const) {
    const addresses = extra[field];
    if (addresses !== undefined) {
      if (
        !Array.isArray(addresses) ||
        !addresses.length ||
        addresses.some((address) => !nonBlank(address))
      ) {
        invalid(
          `Set provider_data.${field} to a non-empty array of email addresses.`,
        );
      }
      body[field] = addresses;
    }
  }
  if (notification.attachments?.length) {
    body.attachments = notification.attachments.map((attachment) => {
      if (
        attachment.disposition &&
        !["attachment", "inline"].includes(attachment.disposition)
      ) {
        invalid("Email attachment disposition must be attachment or inline.");
      }
      if (attachment.disposition === "inline" && !nonBlank(attachment.id)) {
        invalid(
          "An inline attachment requires an id referenced by cid: in the HTML.",
        );
      }
      if (attachment.id && attachment.disposition === "attachment") {
        invalid(
          "Omit attachment.id for a downloadable attachment, or set disposition to inline.",
        );
      }
      return {
        filename: attachment.filename,
        content: attachment.content,
        ...(attachment.content_type
          ? { content_type: attachment.content_type }
          : {}),
        ...(attachment.id ? { content_id: attachment.id } : {}),
      };
    });
  }
  return body;
}

function messagingSender(
  notification: ProviderSendNotificationDTO,
  defaultSender: string | undefined,
): string | undefined {
  if (
    notification.content == null &&
    notification.template?.trim().startsWith("bird_")
  ) {
    if (nonBlank(notification.from)) {
      invalid(
        "Omit notification.from for built-in SMS and WhatsApp templates; Bird selects their sender.",
      );
    }
    return undefined;
  }
  return notification.from?.trim() || defaultSender;
}

function prepareSmsMessage(
  notification: ProviderSendNotificationDTO,
  options: BirdNotificationProviderOptions,
  language: string | undefined,
): SmsMessageRequest {
  if (notification.attachments?.length)
    invalid("SMS notifications do not support attachments.");
  const from = messagingSender(notification, options.sms_from);
  const extra = notification.provider_data ?? {};
  const content = notification.content;
  if (content != null) {
    if (extra.language !== undefined) {
      invalid(
        "provider_data.language applies to stored templates. Omit it for inline content.",
      );
    }
    if (!from)
      invalid(
        "Set sms_from or notification.from before sending inline sms content.",
      );
    if (
      !nonBlank(content.text) ||
      content.html !== undefined ||
      content.subject !== undefined
    ) {
      invalid(
        "Inline SMS requires content.text and does not support content.html or content.subject.",
      );
    }
    if (notification.data && Object.keys(notification.data).length) {
      invalid(
        "Inline SMS does not interpolate notification.data. Render content.text before sending, or use a stored template.",
      );
    }
    return {
      from,
      to: notification.to,
      text: content.text,
      category: category(
        extra.category ?? "transactional",
        birdOperations.sms.categories,
        "sms",
      ),
    };
  }
  if (extra.category !== undefined) {
    invalid(
      "Omit provider_data.category for SMS templates; the template supplies it.",
    );
  }
  return {
    to: notification.to,
    ...(from ? { from } : {}),
    template: {
      ...templateSelector(notification.template, "smt_"),
      ...(language === undefined ? {} : { language }),
      ...(notification.data == null ? {} : { parameters: notification.data }),
    },
  };
}

function prepareWhatsAppMessage(
  notification: ProviderSendNotificationDTO,
  options: BirdNotificationProviderOptions,
  language: string | undefined,
): WhatsAppMessageRequest {
  const from = messagingSender(notification, options.whatsapp_from);
  const body: WhatsAppMessageRequest = {
    to: notification.to,
    ...(from ? { from } : {}),
  };
  const extra = notification.provider_data ?? {};
  if (notification.attachments?.length) {
    invalid(
      "WhatsApp notifications do not support attachments. Use media in an approved template's components.",
    );
  }
  if (notification.content != null) {
    if (extra.language !== undefined) {
      invalid(
        "provider_data.language applies to stored templates. Omit it for inline content.",
      );
    }
    if (!from) {
      invalid(
        "Set whatsapp_from or notification.from before sending inline WhatsApp content.",
      );
    }
    const content = notification.content;
    if (
      !nonBlank(content.text) ||
      content.html !== undefined ||
      content.subject !== undefined
    ) {
      invalid(
        "Inline WhatsApp requires content.text and does not support content.html or content.subject.",
      );
    }
    if ([...content.text].length > 4096) {
      invalid("Inline WhatsApp content.text must be at most 4096 characters.");
    }
    if (notification.data && Object.keys(notification.data).length) {
      invalid(
        "Inline WhatsApp does not interpolate notification.data. Render content.text before sending, or use a stored template.",
      );
    }
    if (
      extra.preview_url !== undefined &&
      typeof extra.preview_url !== "boolean"
    ) {
      invalid("Set provider_data.preview_url to a boolean, or omit it.");
    }
    body.text = {
      body: content.text,
      ...(extra.preview_url === undefined
        ? {}
        : { preview_url: extra.preview_url }),
    };
  } else {
    if (!nonBlank(notification.template)) {
      invalid(
        "Set notification.template to a Bird WhatsApp template ID or slug, or supply inline content.",
      );
    }
    if (extra.preview_url !== undefined) {
      invalid(
        "provider_data.preview_url applies to inline WhatsApp text. Omit it for stored templates.",
      );
    }
    const data = notification.data ?? {};
    if (
      Object.keys(data).some((key) => key !== "components") ||
      (data.components !== undefined &&
        (!Array.isArray(data.components) ||
          data.components.some(
            (component) =>
              !component ||
              typeof component !== "object" ||
              Array.isArray(component) ||
              !nonBlank(component.type),
          )))
    ) {
      invalid(
        "Set WhatsApp notification.data.components to an array of template component objects with a type, or omit data for a template without parameters.",
      );
    }
    const template = notification.template.trim();
    body.template = {
      ...templateSelector(template, "wat_"),
      ...(language === undefined ? {} : { language }),
      ...(data.components === undefined ? {} : { components: data.components }),
    };
  }
  return body;
}
