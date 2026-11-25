# Changelog

## 0.2.0

- **Breaking:** WhatsApp maximum-price inputs are narrower. A template language's `optimization_spec.bid_amount` accepts at most 50000 per 1,000 deliveries (0.50 per delivery), country overrides and a send's `bid_multiplier` accept 0.1 to 2, and a send is refused when its multiplier takes the recipient country's maximum price above 0.50 per delivery. Requests outside these ranges that were accepted before now return 422; lower the value to stay within them.
- Clarify recovery guidance for calls blocked by number ownership or activation checks.

## 0.1.5

- The send broadcast reference now documents the 409 conflict a reschedule can return while the broadcast is being prepared to send now, in which case its schedule does not change.

## 0.1.4

- Internal improvements.

## 0.1.3

- Internal improvements.

## 0.1.2

- Correct the Apple Messages descriptions for `origin`, `last_message` and the invitation `conversation_id`, and the `remediation` of a `not_found_error` on a send, to reflect that accepting an invitation opens the conversation while the business is connected and the customer has not left the thread; an acceptance received while the business is disconnected, or after the customer left, opens none; it links an existing conversation at once, and otherwise `conversation_id` stays absent until their next message.

## 0.1.1

- The README now links directly to `@messagebird/bird-plugin-medusa` on npm and focuses configuration on a `bk_<region>_…` Bird API key.

## 0.1.0

- Add the Bird notification provider for Medusa v2 with email, SMS, and WhatsApp delivery.
