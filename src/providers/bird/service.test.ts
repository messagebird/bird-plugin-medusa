import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AbstractNotificationProviderService,
  Modules,
} from "@medusajs/framework/utils";
import type { ProviderSendNotificationDTO } from "@medusajs/framework/types";
import provider, { BirdNotificationProviderService } from "./index";
import type { BirdNotificationProviderOptions } from "../../types";

const apiKey = "bk_eu1_medusa_test_key";
const options: BirdNotificationProviderOptions = {
  api_key: apiKey,
  channels: ["email", "sms"],
  email_from: "Shop <orders@example.com>",
  sms_from: "MyShop",
};
const email: ProviderSendNotificationDTO = {
  channel: "email",
  to: "customer@example.com",
  template: "order-confirmation",
  data: { order_id: "123" },
};
const sms: ProviderSendNotificationDTO = {
  channel: "sms",
  to: "+31612345678",
  template: "order-shipped",
  data: { order_id: "123" },
};
function service(overrides: Partial<BirdNotificationProviderOptions> = {}) {
  return new BirdNotificationProviderService({}, { ...options, ...overrides });
}
function mockResponse(body: unknown = { id: "em_accepted" }, status = 202) {
  return vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })),
  );
}
function sent() {
  const [url, init] = vi.mocked(fetch).mock.calls[0];
  return { url, ...init, body: JSON.parse(init!.body as string) };
}
afterEach(() => vi.unstubAllGlobals());

describe("Medusa registration", () => {
  it("exports a notification module provider with a native service", () => {
    expect(provider.module).toBe(Modules.NOTIFICATION);
    expect(provider.services).toEqual([BirdNotificationProviderService]);
    expect(service()).toBeInstanceOf(AbstractNotificationProviderService);
  });
  it.each([
    undefined,
    "legacy_key",
    "bt_eu1_oauth_token",
    "bk_eu1.evil_example",
    "bk_eu1_",
    " bk_eu1_key",
  ])("rejects invalid keys without printing them", (key) => {
    expect(() => service({ api_key: key as string })).toThrow("current Bird");
  });
  it("rejects missing or unsupported channels at startup", () => {
    expect(() => service({ channels: [] })).toThrow("channels");
    expect(() => service({ channels: ["voice"] as never })).toThrow("channels");
  });
});

describe("email", () => {
  it("sends a stored template with data, language, and retry key to the key's region", async () => {
    mockResponse();
    const result = await service().send({
      ...email,
      provider_data: {
        language: "nl",
        idempotency_key: "order-confirmation/123",
      },
    });
    expect(result).toEqual({ id: "em_accepted" });
    expect(sent()).toMatchObject({
      url: "https://eu1.platform.bird.com/v1/email/messages",
      method: "POST",
      redirect: "error",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Idempotency-Key": "order-confirmation/123",
      },
      body: {
        from: "Shop <orders@example.com>",
        to: ["customer@example.com"],
        template: {
          slug: "order-confirmation",
          language: "nl",
          parameters: { order_id: "123" },
        },
      },
    });
    expect(sent().body).not.toHaveProperty("category");
  });
  it("sends inline HTML and text, addresses and attachments through the US host", async () => {
    mockResponse();
    await service({ api_key: "bk_us1_test_key" }).send({
      ...email,
      from: "support@example.com",
      content: {
        subject: "Order {{ order_id }}",
        html: '<img src="cid:logo"/>',
        text: "Order {{ order_id }}",
      },
      provider_data: {
        cc: ["staff@example.com"],
        bcc: ["audit@example.com"],
        reply_to: ["help@example.com"],
      },
      attachments: [
        {
          filename: "invoice.pdf",
          content: "cGRm",
          content_type: "application/pdf",
        },
        {
          filename: "logo.png",
          content: "cG5n",
          disposition: "inline",
          id: "logo",
        },
      ],
    });
    expect(sent().url).toBe("https://us1.platform.bird.com/v1/email/messages");
    expect(sent().body).toEqual({
      from: "support@example.com",
      to: ["customer@example.com"],
      subject: "Order {{ order_id }}",
      html: '<img src="cid:logo"/>',
      text: "Order {{ order_id }}",
      parameters: { order_id: "123" },
      category: "transactional",
      cc: ["staff@example.com"],
      bcc: ["audit@example.com"],
      reply_to: ["help@example.com"],
      attachments: [
        {
          filename: "invoice.pdf",
          content: "cGRm",
          content_type: "application/pdf",
        },
        { filename: "logo.png", content: "cG5n", content_id: "logo" },
      ],
    });
  });
  it("uses template IDs and supports explicit marketing classification", async () => {
    mockResponse();
    await service().send({
      ...email,
      template: "emt_01krdgeqcxet5s7t44vh8rt9mg",
      provider_data: { category: "marketing" },
    });
    expect(sent().body.template.id).toBe("emt_01krdgeqcxet5s7t44vh8rt9mg");
    expect(sent().body.category).toBe("marketing");
  });
});

describe("SMS", () => {
  it("maps inline content with a transactional default and recipient override", async () => {
    mockResponse({ id: "sms_accepted" });
    await service().send({
      ...sms,
      from: "+3197000000000",
      data: null,
      content: { text: "Order 123 has shipped" },
    });
    expect(sent().url).toBe("https://eu1.platform.bird.com/v1/sms/messages");
    expect(sent().body).toEqual({
      to: "+31612345678",
      from: "+3197000000000",
      text: "Order 123 has shipped",
      category: "transactional",
    });
  });
  it("maps workspace templates without forbidden category or inline fields", async () => {
    mockResponse();
    await service().send({
      ...sms,
      template: "smt_01krdgeqcxet5s7t44vh8rt9mg",
      provider_data: { language: "nl" },
    });
    expect(sent().body).toEqual({
      to: "+31612345678",
      from: "MyShop",
      template: {
        id: "smt_01krdgeqcxet5s7t44vh8rt9mg",
        language: "nl",
        parameters: { order_id: "123" },
      },
    });
  });
  it("omits the configured sender for built-in template slugs", async () => {
    mockResponse();
    await service().send({
      ...sms,
      template: "bird_otp_verification",
      data: { code: "123456" },
    });
    expect(sent().body).not.toHaveProperty("from");
  });
});

describe("validation before network requests", () => {
  it.each(["sms", "whatsapp"])(
    "rejects an explicit sender for a built-in %s template",
    async (channel) => {
      mockResponse();
      await expect(
        service({ channels: ["sms", "whatsapp"] }).send({
          channel,
          to: sms.to,
          template: "bird_otp_verification",
          from: "MyShop",
        }),
      ).rejects.toThrow("Omit notification.from");
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it.each([
    [{ ...email, content: { html: "<p>Hello</p>" } }, "content.subject"],
    [{ ...email, content: { subject: "Hello" } }, "content.html"],
    [
      {
        ...email,
        attachments: [
          { filename: "logo", content: "eA==", disposition: "inline" },
        ],
      },
      "requires an id",
    ],
    [
      { ...sms, provider_data: { category: "transactional" } },
      "template supplies it",
    ],
    [{ ...sms, content: { text: "Hi" } }, "does not interpolate"],
    [
      { ...sms, content: { text: "Hi", html: "Hi" }, data: null },
      "does not support",
    ],
    [
      { ...sms, attachments: [{ filename: "test.txt", content: "eA==" }] },
      "do not support attachments",
    ],
    [
      { ...sms, provider_data: { cc: ["test@example.com"] } },
      "Unsupported provider_data",
    ],
    [
      { ...email, provider_data: { headers: { Authorization: "other" } } },
      "Unsupported provider_data",
    ],
    [
      { ...email, provider_data: { idempotency_key: "hello\nworld" } },
      "without line breaks",
    ],
    [
      { ...email, provider_data: { cc: "staff@example.com" } },
      "array of email addresses",
    ],
    [{ ...email, channel: "whatsapp" }, "not configured"],
    [{ ...email, template: "" }, "Bird template"],
  ] as const)(
    "rejects unsupported notification %#",
    async (notification, expected) => {
      mockResponse();
      await expect(
        service().send(notification as ProviderSendNotificationDTO),
      ).rejects.toThrow(expected);
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it("rejects a missing sender before contacting Bird", async () => {
    mockResponse();
    await expect(
      service({ email_from: undefined }).send(email),
    ).rejects.toThrow("verified Bird domain");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not serialize circular parameters or leak their contents", async () => {
    mockResponse();
    const data: Record<string, unknown> = { secret: apiKey };
    data.self = data;
    await expect(service().send({ ...email, data })).rejects.toThrow(
      "JSON-serializable",
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("Bird failures", () => {
  it("preserves field paths and validation details while redacting credentials", async () => {
    mockResponse(
      {
        error: {
          param: "template",
          message: "Invalid template.",
          remediation: "Check its parameters.",
          details: [
            { param: "template.parameters.order_id", message: "Required." },
            {
              param: "from",
              message: `Invalid ${apiKey} or bt_us1_other_token`,
            },
            null,
            { param: 42, message: { private: "omit" } },
          ],
        },
      },
      422,
    );
    await expect(service().send(email)).rejects.toThrow(
      "template: Invalid template. Check its parameters. template.parameters.order_id: Required. from: Invalid [redacted] or [redacted]",
    );
  });

  it.each([401, 403, 422, 429, 503])(
    "shows the Bird message and remediation for HTTP %i without secrets",
    async (status) => {
      mockResponse(
        {
          error: {
            message: `Invalid key ${apiKey}`,
            remediation: "Create an API key with email send permission.",
          },
        },
        status,
      );
      await expect(service().send(email)).rejects.toThrow(
        `Bird rejected the notification (HTTP ${status}): Invalid key [redacted] Create an API key with email send permission.`,
      );
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );
  it("handles non-JSON failures without exposing response content", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(`<html>${apiKey}</html>`, { status: 502 }),
        ),
    );
    await expect(service().send(email)).rejects.toThrow("Check the API key");
  });
  it("never treats a missing message ID as confirmed acceptance", async () => {
    mockResponse({ status: "accepted" });
    await expect(service().send(email)).rejects.toThrow(
      "Bird returned no message ID",
    );
  });
  it("does not retry uncertain network failures or expose their raw error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error(apiKey)));
    await expect(service().send(email)).rejects.toThrow(
      "Check connectivity and Bird message history",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("WhatsApp", () => {
  const whatsapp: ProviderSendNotificationDTO = {
    channel: "whatsapp",
    to: "+31612345678",
    template: "order-confirmation",
    data: {
      components: [
        {
          type: "body",
          parameters: [{ type: "text", name: "ref", text: "ORDER-123" }],
        },
      ],
    },
  };
  function whatsappService(
    overrides: Partial<BirdNotificationProviderOptions> = {},
  ) {
    return service({
      channels: ["email", "sms", "whatsapp"],
      whatsapp_from: "+13124495648",
      ...overrides,
    });
  }

  it("maps an authored template and components without changing their shape", async () => {
    mockResponse({ id: "wam_accepted" });
    const result = await whatsappService().send({
      ...whatsapp,
      provider_data: { language: "en", idempotency_key: "whatsapp-order/123" },
    });
    expect(result).toEqual({ id: "wam_accepted" });
    expect(sent()).toMatchObject({
      url: "https://eu1.platform.bird.com/v1/whatsapp/messages",
      headers: { "Idempotency-Key": "whatsapp-order/123" },
      body: {
        from: "+13124495648",
        to: "+31612345678",
        template: {
          slug: "order-confirmation",
          language: "en",
          components: whatsapp.data!.components,
        },
      },
    });
    expect(sent().body).not.toHaveProperty("category");
    expect(sent().body.template).not.toHaveProperty("parameters");
  });

  it("lets a Bird-managed template ID select its own sender", async () => {
    mockResponse({ id: "wam_accepted" });
    await whatsappService({ whatsapp_from: undefined }).send({
      ...whatsapp,
      template: "wat_01ky4x8e4ger5apvse2ja3k2mw",
      data: null,
    });
    expect(sent().body).toEqual({
      to: whatsapp.to,
      template: { id: "wat_01ky4x8e4ger5apvse2ja3k2mw" },
    });
  });

  it("omits the configured sender for a built-in template slug", async () => {
    mockResponse({ id: "wam_accepted" });
    await whatsappService().send({
      ...whatsapp,
      template: " bird_delivery_update ",
    });
    expect(sent().body).not.toHaveProperty("from");
    expect(sent().body.template.slug).toBe("bird_delivery_update");
  });

  it("counts Unicode characters in inline text at the 4096-character boundary", async () => {
    mockResponse({ id: "wam_accepted" });
    const text = "😀".repeat(4096);
    await whatsappService().send({
      ...whatsapp,
      template: "bird_reply",
      content: { text },
      data: null,
    });
    expect(sent().body.text.body).toBe(text);
    expect(sent().body.from).toBe("+13124495648");
    await expect(
      whatsappService().send({
        ...whatsapp,
        content: { text: text + "😀" },
        data: null,
      }),
    ).rejects.toThrow("4096");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("maps inline text, a sender override and preview_url through the key's region", async () => {
    mockResponse({ id: "wam_accepted" });
    await whatsappService({ api_key: "bk_us1_whatsapp_test" }).send({
      ...whatsapp,
      from: "+13124495569",
      data: null,
      content: { text: "Your order: https://shop.example/orders/123" },
      provider_data: { preview_url: true },
    });
    expect(sent().url).toBe(
      "https://us1.platform.bird.com/v1/whatsapp/messages",
    );
    expect(sent().body).toEqual({
      from: "+13124495569",
      to: whatsapp.to,
      text: {
        body: "Your order: https://shop.example/orders/123",
        preview_url: true,
      },
    });
  });

  it.each([
    [{ data: { order_id: "123" } }, "data.components"],
    [{ data: { components: "body" } }, "data.components"],
    [{ data: { components: [null] } }, "data.components"],
    [{ data: { components: [{}] } }, "data.components"],
    [{ content: { text: "Hi" } }, "does not interpolate"],
    [
      { content: { html: "<p>Hi</p>", text: "Hi" }, data: null },
      "does not support",
    ],
    [
      { content: { subject: "Hi", text: "Hi" }, data: null },
      "does not support",
    ],
    [{ content: { text: "x".repeat(4097) }, data: null }, "4096"],
    [
      { provider_data: { category: "transactional" } },
      "Unsupported provider_data",
    ],
    [{ provider_data: { preview_url: true } }, "inline WhatsApp"],
    [
      {
        content: { text: "Hi" },
        data: null,
        provider_data: { preview_url: "true" },
      },
      "boolean",
    ],
    [
      { attachments: [{ filename: "test.txt", content: "eA==" }] },
      "do not support attachments",
    ],
  ])(
    "rejects unsupported WhatsApp input %# before sending",
    async (change, expected) => {
      mockResponse();
      await expect(
        whatsappService().send({ ...whatsapp, ...change }),
      ).rejects.toThrow(expected as string);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("rejects inline text without a sender", async () => {
    mockResponse();
    await expect(
      whatsappService({ whatsapp_from: undefined }).send({
        ...whatsapp,
        data: null,
        content: { text: "Hi" },
      }),
    ).rejects.toThrow("whatsapp_from");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a blank configured WhatsApp sender", () => {
    expect(() => whatsappService({ whatsapp_from: " " })).toThrow(
      "whatsapp_from",
    );
  });

  it("preserves Bird's closed service-window remediation without retrying", async () => {
    mockResponse(
      {
        error: {
          message: "The WhatsApp customer service window is closed.",
          remediation: "Send an approved template instead.",
        },
      },
      422,
    );
    await expect(
      whatsappService().send({
        ...whatsapp,
        data: null,
        content: { text: "Hi" },
      }),
    ).rejects.toThrow(
      "Bird rejected the notification (HTTP 422): The WhatsApp customer service window is closed. Send an approved template instead.",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
