import { EventEmitter } from "node:events";

import type { Logger } from "pino";

export type DomainEvent =
  | { type: "streamerAdded"; streamerId: string }
  | { type: "streamerEmpty"; streamerId: string };

type DomainEventType = DomainEvent["type"];
type DomainEventOf<T extends DomainEventType> = Extract<
  DomainEvent,
  { type: T }
>;

export interface DomainEventBus {
  emit(event: DomainEvent): void;

  on<T extends DomainEventType>(
    type: T,
    handler: (event: DomainEventOf<T>) => Promise<void>,
  ): void;

  off<T extends DomainEventType>(
    type: T,
    handler: (event: DomainEventOf<T>) => Promise<void>,
  ): void;
}

/**
 * A small typed pub/sub used to decouple repositories from the application
 * services that react to domain events (e.g. a streamer gaining its first
 * subscriber). Every handler's rejection is caught and logged here, so a
 * transient failure in one handler can't turn into an unhandled promise
 * rejection or take down the process.
 */
export function createDomainEventBus(logger: Logger): DomainEventBus {
  const emitter = new EventEmitter();

  // `on` never registers the caller's handler directly with the underlying
  // EventEmitter - it wraps it so a rejection/throw can be caught uniformly
  // (see below). That means `off` can't just hand the original handler back
  // to `emitter.off`; it has to look up the matching wrapper, which is what
  // this map is for.
  type Wrapper = (event: DomainEvent) => void;
  type Handler = (event: DomainEvent) => Promise<void>;

  const wrappersByType = new Map<DomainEventType, Map<Handler, Wrapper>>();

  return {
    emit(event) {
      emitter.emit(event.type, event);
    },

    on(type, handler) {
      const wrapper: Wrapper = (event) => {
        // Wrapped in Promise.resolve so a handler that returns undefined
        // (common in tests) or throws synchronously is handled the same way
        // as one that returns a rejected promise.
        Promise.resolve()
          .then(() => handler(event as DomainEventOf<typeof type>))
          .catch((error: unknown) => {
            logger.error(
              { error, event },
              `Domain event handler for "${type}" failed`,
            );
          });
      };

      let wrappers = wrappersByType.get(type);

      if (!wrappers) {
        wrappers = new Map();
        wrappersByType.set(type, wrappers);
      }

      wrappers.set(handler as Handler, wrapper);

      emitter.on(type, wrapper);
    },

    off(type, handler) {
      const wrapper = wrappersByType.get(type)?.get(handler as Handler);

      if (!wrapper) {
        return;
      }

      emitter.off(type, wrapper);
      wrappersByType.get(type)?.delete(handler as Handler);
    },
  };
}
