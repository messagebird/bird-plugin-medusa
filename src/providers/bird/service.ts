import type {
  ProviderSendNotificationDTO,
  ProviderSendNotificationResultsDTO,
} from "@medusajs/framework/types";
import {
  AbstractNotificationProviderService,
  MedusaError,
} from "@medusajs/framework/utils";
import { prepareMessage, regionalOrigin, validateOptions } from "../../message";
import type { BirdNotificationProviderOptions } from "../../types";

export class BirdNotificationProviderService extends AbstractNotificationProviderService {
  static identifier = "bird";
  protected readonly options: BirdNotificationProviderOptions;
  protected readonly origin: string;

  static validateOptions(options: BirdNotificationProviderOptions): void {
    validateOptions(options);
  }

  constructor(
    _container: Record<string, unknown>,
    options: BirdNotificationProviderOptions,
  ) {
    super();
    validateOptions(options);
    this.options = { ...options, channels: [...options.channels] };
    this.origin = regionalOrigin(options.api_key);
  }

  async send(
    notification: ProviderSendNotificationDTO,
  ): Promise<ProviderSendNotificationResultsDTO> {
    const { method, path, body, idempotencyKey } = prepareMessage(
      notification,
      this.options,
    );
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.options.api_key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    let serialized: string;
    try {
      serialized = JSON.stringify(body);
    } catch {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Notification content and parameters must be JSON-serializable.",
      );
    }
    let response: Response;
    let result: unknown;
    try {
      response = await fetch(`${this.origin}${path}`, {
        method,
        headers,
        body: serialized,
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
      });
      result = await response.json().catch(() => undefined);
    } catch {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "Bird could not confirm acceptance of the notification. Check connectivity and Bird message history before retrying; reuse provider_data.idempotency_key when supplied.",
      );
    }
    const data =
      result && typeof result === "object"
        ? (result as Record<string, unknown>)
        : {};
    if (!response.ok) {
      const error =
        data.error && typeof data.error === "object"
          ? (data.error as Record<string, unknown>)
          : {};
      const details = [formatErrorDetail(error), error.remediation].filter(
        (value): value is string =>
          typeof value === "string" && value.length > 0,
      );
      if (Array.isArray(error.details)) {
        for (const detail of error.details) {
          if (detail && typeof detail === "object") {
            const description = formatErrorDetail(detail);
            if (description) details.push(description);
          }
        }
      }
      const message = details.length
        ? details.join(" ")
        : "Check the API key, its channel permissions, and your Bird sender configuration.";
      const safe = message
        .replaceAll(this.options.api_key, "[redacted]")
        .replace(/\b(?:bk|bt)_[a-z]{2}\d+_[A-Za-z0-9_-]+/g, "[redacted]")
        .slice(0, 2000);
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Bird rejected the notification (HTTP ${response.status}): ${safe}`,
      );
    }
    if (typeof data.id !== "string" || !data.id.length) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "Bird returned no message ID. Check Bird message history before retrying; acceptance could not be confirmed.",
      );
    }
    return { id: data.id };
  }
}

function formatErrorDetail(error: Record<string, unknown>): string | undefined {
  const message = typeof error.message === "string" ? error.message : "";
  const param = typeof error.param === "string" ? error.param : "";
  return [param, message].filter(Boolean).join(": ") || undefined;
}
