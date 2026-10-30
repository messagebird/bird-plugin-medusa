# WhatsApp notifications

Enable `whatsapp` in the Bird provider's `channels` and give your API key `whatsapp:write`. The provider uses the same regional API host, error handling, and idempotency behavior as email and SMS.

## Send an approved template

Set `template` to a WhatsApp template ID (`wat_…`) or slug. Pass the approved language's components in `data.components`, using Bird's [template component format](https://bird.com/docs/api/reference/create-whatsapp-message). Email and SMS parameter maps do not apply to WhatsApp.

This built-in delivery template selects its own sender. The provider skips `whatsapp_from` for `bird_…` slugs; omit `from` in the notification:

```ts
await notificationModuleService.createNotifications({
  to: customer.phone,
  channel: "whatsapp",
  template: "bird_delivery_update",
  data: {
    components: [
      {
        type: "body",
        parameters: [
          { type: "text", name: "ref", text: String(order.display_id) },
          { type: "text", name: "date", text: deliveryDate },
        ],
      },
    ],
  },
  idempotency_key: `delivery-update/${order.id}`,
  provider_data: {
    language: "en",
    idempotency_key: `delivery-update/${order.id}`,
  },
});
```

For your workspace's approved templates, set `whatsapp_from` to a connected number belonging to the template's WhatsApp Business Account, or supply `notification.from`. Use the parameter names or positions required by the approved language. Header media, buttons, and carousel parameters stay inside their template components; Bird validates their shape against the template. Omit `data` for a template without parameters. Template categories come from the template; `provider_data.category` is unsupported.

## Send text in an open conversation

Freeform text requires an open 24-hour customer service window for the recipient and sender. Use a connected sender and render the final text in your application:

```ts
await notificationModuleService.createNotifications({
  to: customer.phone,
  from: process.env.BIRD_WHATSAPP_FROM,
  channel: "whatsapp",
  template: "delivery-reply",
  content: { text: `Your tracking link: ${trackingUrl}` },
  provider_data: { preview_url: true },
});
```

Medusa requires a `template` label even when `content` supplies the text. Inline WhatsApp accepts 1–4096 characters in `content.text`; it rejects HTML, subjects, attachments, template `data`, and `provider_data.language`. Link previews are disabled unless `provider_data.preview_url` is `true`.

Bird enforces the service window. A closed window returns an error with instructions to use an approved template. A message accepted just before the window closes can still fail asynchronously. Inspect the Bird message or its webhooks for delivery; Medusa's success status records API acceptance.
