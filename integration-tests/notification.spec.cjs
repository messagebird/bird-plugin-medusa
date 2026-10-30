const { randomUUID } = require("node:crypto");
const { Modules } = require("@medusajs/framework/utils");
const {
  moduleIntegrationTestRunner,
  TestDatabaseUtils,
} = require("@medusajs/test-utils");
const models = require("@medusajs/notification/dist/models");

const dbName = `medusa_bird_test_${randomUUID().replaceAll("-", "")}`;
const database = TestDatabaseUtils.dbTestUtilFactory();
const email = {
  to: "customer@example.test",
  channel: "email",
  template: "order-receipt",
  content: { subject: "Order {{ reference }}", text: "Your order is ready." },
};
const components = [
  {
    type: "body",
    parameters: [{ type: "text", name: "reference", text: "ORDER-TEST" }],
  },
];
const whatsapp = {
  to: "+15555550101",
  channel: "whatsapp",
  template: "order-update",
  data: { components },
  provider_data: { language: "en" },
};

describe("Bird through Medusa's Notification Module", () => {
  afterAll(async () => {
    await database.shutdown(dbName);
  });

  moduleIntegrationTestRunner({
    moduleName: Modules.NOTIFICATION,
    resolve: require.resolve("@medusajs/notification"),
    moduleModels: Object.values(models),
    dbName,
    moduleOptions: {
      providers: [
        {
          resolve:
            require.resolve("@messagebird/bird-plugin-medusa/providers/bird"),
          id: "bird",
          options: {
            channels: ["email", "sms", "whatsapp"],
            api_key: "bk_eu1_integration_fixture",
            email_from: "orders@example.test",
            sms_from: "Example",
          },
        },
        {
          resolve: require.resolve("@medusajs/notification-local"),
          id: "local",
          options: { channels: ["feed"] },
        },
      ],
    },
    injectedDependencies: {
      logger: { info() {}, warn() {}, error() {}, debug() {} },
    },
    testSuite: ({ service }) => {
      let request;
      beforeEach(() => {
        request = jest
          .spyOn(globalThis, "fetch")
          .mockImplementation(async () => {
            throw new Error(
              "Unexpected HTTP request in a mocked integration test",
            );
          });
      });
      afterEach(() => jest.restoreAllMocks());

      function accepted(id) {
        request.mockImplementation(
          async () => new Response(JSON.stringify({ id }), { status: 202 }),
        );
      }
      function sent() {
        const [url, init] = request.mock.calls[0];
        return { url, body: JSON.parse(init.body), headers: init.headers };
      }

      it("loads the public compiled provider and persists email acceptance and attachment data", async () => {
        accepted("mock_email_accepted");
        const result = await service.createNotifications({
          ...email,
          data: { reference: "ORDER-TEST" },
          attachments: [
            {
              filename: "receipt.txt",
              content: "VGVzdA==",
              content_type: "text/plain",
            },
          ],
          provider_data: { idempotency_key: "email-order-test" },
        });
        expect(result).toMatchObject({
          status: "success",
          provider_id: "bird",
          external_id: "mock_email_accepted",
        });
        expect(await service.retrieveNotification(result.id)).toMatchObject({
          status: "success",
          external_id: "mock_email_accepted",
        });
        expect(sent()).toMatchObject({
          url: "https://eu1.platform.bird.com/v1/email/messages",
          headers: { "Idempotency-Key": "email-order-test" },
          body: {
            to: [email.to],
            from: "orders@example.test",
            parameters: { reference: "ORDER-TEST" },
            attachments: [
              {
                filename: "receipt.txt",
                content: "VGVzdA==",
                content_type: "text/plain",
              },
            ],
          },
        });
      });

      it("deduplicates email notifications before calling the provider again", async () => {
        accepted("mock_email_deduplicated");
        const input = { ...email, idempotency_key: "email-order-test" };
        const first = await service.createNotifications(input);
        await service.createNotifications(input);
        const stored = await service.listNotifications({
          idempotency_key: input.idempotency_key,
        });
        expect(stored).toHaveLength(1);
        expect(stored[0].id).toBe(first.id);
        expect(request).toHaveBeenCalledTimes(1);
      });

      it("preserves email template parameters and language through persistence", async () => {
        accepted("mock_email_template");
        await service.createNotifications({
          to: email.to,
          channel: "email",
          template: "order-confirmation",
          data: { reference: "ORDER-TEST" },
          provider_data: { language: "en" },
        });
        expect(sent().body.template).toEqual({
          slug: "order-confirmation",
          language: "en",
          parameters: { reference: "ORDER-TEST" },
        });
      });

      it("routes inline SMS through the same registered provider", async () => {
        accepted("mock_sms_inline");
        const result = await service.createNotifications({
          to: "+15555550101",
          channel: "sms",
          template: "order-update",
          content: { text: "Your order is ready." },
        });
        expect(result).toMatchObject({
          status: "success",
          provider_id: "bird",
          external_id: "mock_sms_inline",
        });
        expect(sent()).toMatchObject({
          url: "https://eu1.platform.bird.com/v1/sms/messages",
          body: {
            from: "Example",
            to: "+15555550101",
            text: "Your order is ready.",
            category: "transactional",
          },
        });
      });

      it("retains local admin feed beside all three Bird channels", async () => {
        const result = await service.createNotifications({
          to: "admin-fixture",
          channel: "feed",
          template: "admin-ui",
          data: { title: "Export ready", description: "Test export" },
        });
        expect(result).toMatchObject({
          status: "success",
          provider_id: "local",
        });
        expect(await service.retrieveNotification(result.id)).toMatchObject({
          template: "admin-ui",
          data: { title: "Export ready", description: "Test export" },
        });
        expect(request).not.toHaveBeenCalled();
      });

      it("rejects invalid email before making an HTTP request", async () => {
        await expect(
          service.createNotifications({
            ...email,
            content: { text: "Missing subject" },
          }),
        ).rejects.toThrow("content.subject");
        expect(request).not.toHaveBeenCalled();
      });

      it("surfaces API rejection and persists Medusa failure", async () => {
        request.mockResolvedValue(
          new Response(
            JSON.stringify({
              error: {
                message: "Rate limited",
                remediation: "Wait before retrying.",
              },
            }),
            { status: 429 },
          ),
        );
        await expect(
          service.createNotifications({
            ...email,
            idempotency_key: "email-rate-limit",
          }),
        ).rejects.toThrow("HTTP 429");
        const [failed] = await service.listNotifications({
          idempotency_key: "email-rate-limit",
        });
        expect(failed.status).toBe("failure");
        expect(request).toHaveBeenCalledTimes(1);
      });

      it("maps WhatsApp components, language and API idempotency without a default sender", async () => {
        accepted("mock_whatsapp_template");
        const result = await service.createNotifications({
          ...whatsapp,
          provider_data: {
            language: "en",
            idempotency_key: "whatsapp-order-test",
          },
        });
        expect(result).toMatchObject({
          status: "success",
          provider_id: "bird",
          external_id: "mock_whatsapp_template",
        });
        expect(sent()).toMatchObject({
          url: "https://eu1.platform.bird.com/v1/whatsapp/messages",
          headers: { "Idempotency-Key": "whatsapp-order-test" },
        });
        expect(sent().body).toEqual({
          to: whatsapp.to,
          template: { slug: whatsapp.template, language: "en", components },
        });
      });

      it("deduplicates WhatsApp notifications before calling the provider again", async () => {
        accepted("mock_whatsapp_deduplicated");
        const input = { ...whatsapp, idempotency_key: "whatsapp-order-test" };
        const first = await service.createNotifications(input);
        await service.createNotifications(input);
        const stored = await service.listNotifications({
          idempotency_key: input.idempotency_key,
        });
        expect(stored).toHaveLength(1);
        expect(stored[0].id).toBe(first.id);
        expect(request).toHaveBeenCalledTimes(1);
      });

      it("preserves inline WhatsApp text, sender override and preview setting", async () => {
        accepted("mock_whatsapp_text");
        const result = await service.createNotifications({
          to: whatsapp.to,
          from: "+15555550102",
          channel: "whatsapp",
          template: "reply",
          content: { text: "Your order is ready." },
          provider_data: { preview_url: false },
        });
        expect(result.status).toBe("success");
        expect(sent().body).toEqual({
          to: whatsapp.to,
          from: "+15555550102",
          text: { body: "Your order is ready.", preview_url: false },
        });
      });

      it("rejects flat WhatsApp parameters before making an HTTP request", async () => {
        await expect(
          service.createNotifications({
            ...whatsapp,
            data: { reference: "ORDER-TEST" },
          }),
        ).rejects.toThrow("data.components");
        expect(request).not.toHaveBeenCalled();
      });

      it("persists WhatsApp service-window failure and surfaces remediation", async () => {
        request.mockResolvedValue(
          new Response(
            JSON.stringify({
              error: {
                message: "The customer service window is closed.",
                remediation: "Send an approved template instead.",
              },
            }),
            { status: 422 },
          ),
        );
        await expect(
          service.createNotifications({
            to: whatsapp.to,
            from: "+15555550102",
            channel: "whatsapp",
            template: "reply",
            content: { text: "Your order is ready." },
            idempotency_key: "whatsapp-closed-window",
          }),
        ).rejects.toThrow(
          "HTTP 422): The customer service window is closed. Send an approved template instead.",
        );
        const [failed] = await service.listNotifications({
          idempotency_key: "whatsapp-closed-window",
        });
        expect(failed.status).toBe("failure");
        expect(request).toHaveBeenCalledTimes(1);
      });

      it("maps stored SMS parameters without supplying a category", async () => {
        accepted("mock_sms_template");
        const result = await service.createNotifications({
          to: "+15555550101",
          channel: "sms",
          template: "order-update",
          data: { reference: "ORDER-TEST" },
          provider_data: { language: "en" },
        });
        expect(result.status).toBe("success");
        expect(sent().body.template).toEqual({
          slug: "order-update",
          language: "en",
          parameters: { reference: "ORDER-TEST" },
        });
        expect(sent().body).not.toHaveProperty("category");
      });
    },
  });
});
