export type SubscribeResult =
  | { success: true; createdStreamer: boolean }
  | {
      success: false;
      reason: "invalid_input" | "already_subscribed" | "subscription_limit_reached";
    };

export type UnsubscribeResult =
  | { success: true; usersLeft: number }
  | {
      success: false;
      reason: "invalid_input" | "user_not_found" | "not_subscribed";
    };

export type UpdateSubscriptionResult =
  | { success: true }
  | {
      success: false;
      reason: "invalid_input" | "user_not_found" | "subscription_not_found";
    };

// Union of every reason code the three result types above can fail with -
// shared by every consumer that needs to translate a reason code into
// user-facing copy (server/src/http/routes/apiRoutes.ts,
// server/src/commands/shared/commandReplies.ts), so a reason code added to
// any of the three above fails to compile at each consumer's message map
// until it's deliberately handled there too, instead of silently falling
// through to a generic fallback message.
export type SubscribeFailureReason =
  | Extract<SubscribeResult, { success: false }>["reason"]
  | Extract<UnsubscribeResult, { success: false }>["reason"]
  | Extract<UpdateSubscriptionResult, { success: false }>["reason"];
