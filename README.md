# Bird notifications for Medusa

Send email, SMS, and WhatsApp notifications from your Medusa v2 application with Bird. This notification provider runs in your Medusa server and uses your workspace's Bird API key. It supports Medusa 2.21.2 and later v2 releases.

## Install and configure

Install the [Bird notification provider](https://www.npmjs.com/package/@messagebird/bird-plugin-medusa) from npm:

```sh
npm install @messagebird/bird-plugin-medusa
```

Set your Bird credentials in your hosting platform's environment settings. For local development, add them to `.env` and keep that file out of version control:

```dotenv
BIRD_API_KEY=your_bird_access_key
BIRD_EMAIL_FROM=notifications@example.com
BIRD_SMS_FROM=YourShop
```

Set `BIRD_WHATSAPP_FROM` to your connected WhatsApp number when sending from it. Omit sender variables for channels you do not use.

Add the provider to the Notification Module in your existing `medusa-config.ts`. Keep its other application settings and environment loading:

```ts
import { defineConfig, loadEnv } from "@medusajs/framework/utils";

loadEnv(process.env.NODE_ENV || "development", process.cwd());

module.exports = defineConfig({
  modules: [
    {
      resolve: "@medusajs/medusa/notification",
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/notification-local",
            id: "local",
            options: { channels: ["feed"] },
          },
          {
            resolve: "@messagebird/bird-plugin-medusa/providers/bird",
            id: "bird",
            options: {
              channels: ["email", "sms", "whatsapp"],
              api_key: process.env.BIRD_API_KEY,
              email_from: process.env.BIRD_EMAIL_FROM,
              sms_from: process.env.BIRD_SMS_FROM,
              whatsapp_from: process.env.BIRD_WHATSAPP_FROM,
            },
          },
        ],
      },
    },
  ],
});
```

Keep the local `feed` provider for Medusa admin notifications such as product and order exports. Configuring `providers` replaces Medusa's default provider list. Medusa routes each channel to one provider: remove a channel from an existing provider before assigning it to Bird. Register this package in the Notification Module; it needs no entry in `plugins`.

Restart or redeploy Medusa after changing the configuration. On Medusa Cloud, enable the **Build** flag for the environment variables used here. Credentials and defaults are server configuration; this package adds no admin settings page or OAuth connection form.

Create an API key in your [Bird workspace](https://bird.com/dashboard) with send permissions for the channels you enable: `emails:write`, `sms:write`, and `whatsapp:write`. Keep it in server environment variables. The provider derives the API region from the key; no workspace ID or region setting is needed. Use a `bk_<region>_…` API key. Short-lived OAuth tokens (`bt_…`) are not supported.

Use a verified email domain for `BIRD_EMAIL_FROM` and a configured SMS sender for `BIRD_SMS_FROM`. Configure only the channels you use. A notification's `from` overrides its channel's default sender. For WhatsApp, use a connected number as `BIRD_WHATSAPP_FROM`. For built-in SMS and WhatsApp templates, use their `bird_…` slug and omit `notification.from`; the provider skips the configured default sender. When referring to a built-in template by ID instead, use a provider configuration without that channel's default sender.

## Send an order notification

Create and publish an email template with the slug `order-confirmation` in Bird, including an `order_id` variable. Add `src/subscribers/order-placed.ts`:

```ts
import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { Modules } from "@medusajs/framework/utils";

type OrderEvent = SubscriberArgs<{ id: string }>;

export default async function orderPlaced(args: OrderEvent) {
  const container = args.container;
  const data = args.event.data;
  const order = await container.resolve(Modules.ORDER).retrieveOrder(data.id);
  if (!order.email) return;
  await container.resolve(Modules.NOTIFICATION).createNotifications({
    to: order.email,
    channel: "email",
    template: "order-confirmation",
    data: { order_id: order.display_id },
    idempotency_key: `order-confirmation/${order.id}`,
    provider_data: { idempotency_key: `order-confirmation/${order.id}` },
  });
}

export const config: SubscriberConfig = { event: "order.placed" };
```

`template` accepts a Bird email template ID (`emt_…`) or SMS template ID (`smt_…`), or a published template slug. For email and SMS, `data` becomes the template's `parameters`. Pass `provider_data.language` when the template requires a language.

Send SMS through the same Notification Module:

```ts
await notificationModuleService.createNotifications({
  to: "+31612345678",
  channel: "sms",
  template: "order-shipped",
  data: { order_id: "123", tracking_url: "https://shop.example/track/123" },
});
```

Create and publish `order-shipped` as an SMS template first. Its category comes from the template; do not pass `provider_data.category` for SMS template sends.

WhatsApp uses `channel: "whatsapp"` and accepts approved template IDs (`wat_…`) or slugs. Pass template components in `data.components`. See [WhatsApp templates and text](whatsapp.md) for examples and sender requirements.

## Inline content and provider options

When `content` is present, it takes precedence over `template`. Medusa still requires a `template` string; use a descriptive label such as `order-receipt`. Email requires `content.subject` and `content.html` or `content.text`. SMS and WhatsApp accept only `content.text`. Inline email and SMS messages default to `transactional`; use `provider_data.category: "marketing"` for marketing content.

Email `data` maps to Bird's inline Liquid parameters. Render SMS and WhatsApp text in your app or use a stored template; their inline text does not interpolate `data`. WhatsApp text requires an open customer service window.

Supported `provider_data` fields:

- `language`: Stored template language tag, such as `nl`.
- `category`: Email accepts `transactional` or `marketing`; inline SMS also accepts `authentication` or `service`.
- `cc`, `bcc`, `reply_to`: Email address arrays.
- `preview_url`: Boolean for inline WhatsApp link previews, disabled by default.
- `idempotency_key`: Stable key for retries of the same message, at most 255 characters.

Medusa email attachments map to Bird attachments without re-encoding their base64 `content`. For an inline image, set `disposition: "inline"` and `id`, then reference `cid:<id>` in the HTML. SMS and WhatsApp notifications do not accept Medusa attachments; WhatsApp template media belongs in `data.components`.

The returned ID confirms API acceptance. Delivery is asynchronous; use Bird's [message APIs](https://bird.com/docs/api/reference) or [webhooks](https://bird.com/docs/guides/webhooks) to track the outcome. Medusa's notification success state does not confirm delivery to an inbox or handset.

The provider makes one request with a 30-second timeout. It does not retry an uncertain send. Medusa's notification idempotency key is separate from Bird's; set `provider_data.idempotency_key` too when retrying. Bird retains responses for three hours by default, with the limits described in the [API reference](https://bird.com/docs/api/reference/create-email-message).

## Develop

Run `pnpm lint`, `pnpm test`, and `pnpm build` in this package. Lint uses Medusa's module-provider ESLint preset and checks TypeScript types. Tests mock Bird's HTTP responses and send no messages. Run `pnpm test:integration` for the real Medusa Notification Module and PostgreSQL checks; see [integration test prerequisites and database cleanup](integration-tests/README.md). `npm pack` creates an installable package for testing in a Medusa application before publication; integration tests are included in source mirrors and excluded from npm packages.

Source changes live in the Bird monorepo. The [release repository](https://github.com/messagebird/bird-plugin-medusa) is a mirror; versions and releases follow Bird's surface release process. Publishing and Medusa catalog visibility are separate steps. This package includes Medusa's documented notification integration discovery keywords.
