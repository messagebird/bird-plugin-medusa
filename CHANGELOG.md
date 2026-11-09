# Changelog

## 0.1.3

- Internal improvements.

## 0.1.2

- Correct the Apple Messages descriptions for `origin`, `last_message` and the invitation `conversation_id`, and the `remediation` of a `not_found_error` on a send, to reflect that accepting an invitation opens the conversation while the business is connected and the customer has not left the thread; an acceptance received while the business is disconnected, or after the customer left, opens none; it links an existing conversation at once, and otherwise `conversation_id` stays absent until their next message.

## 0.1.1

- The README now links directly to `@messagebird/bird-plugin-medusa` on npm and focuses configuration on a `bk_<region>_…` Bird API key.

## 0.1.0

- Add the Bird notification provider for Medusa v2 with email, SMS, and WhatsApp delivery.
