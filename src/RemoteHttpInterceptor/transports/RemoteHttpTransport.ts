/**
 * Transport interface for communication between RemoteHttpInterceptor and RemoteHttpResolver.
 * This abstraction allows for different transport mechanisms to be used while maintaining
 * the same message format and communication patterns.
 */

import { Logger } from '@open-draft/logger'

/**
 * Options for creating a transport instance.
 */
export interface RemoteHttpTransportOptions {
  /**
   * Optional name for the transport instance.
   * Used for logging and debugging purposes.
   */
  name?: string

  /**
   * Optional message prefix for filtering messages.
   * Must match the interceptor transport prefix.
   * Defaults to 'rn-webview-interceptor'.
   */
  messagePrefix?: string
}

/**
 * Message handler function type.
 */
export type RemoteHttpTransportMessageHandler = (message: string) => void

/**
 * Subscription function type for cleanup.
 */
export type RemoteHttpTransportSubscription = () => void

/**
 * Core Transport interface that defines the contract for communication
 * between interceptor and resolver.
 */
// export interface RemoteHttpTransport {
//   /**
//    * Send a message to the remote endpoint.
//    * @param message The message to send.
//    * @returns A promise that resolves when the message is sent, or void.
//    */
//   send(message: string): void | Promise<void>

//   /**
//    * Set up a message listener to handle incoming messages.
//    * @param handler The function to call when a message is received.
//    * @returns A subscription function that can be called to remove the listener.
//    */
//   onMessage(handler: RemoteHttpTransportMessageHandler): RemoteHttpTransportSubscription

//   /**
//    * Clean up resources and remove event listeners.
//    */
//   dispose(): void

//   /**
//    * Check if this transport is available in the current environment.
//    * @returns True if the transport can be used in the current environment.
//    */
//   isAvailable(): boolean
// }

/**
 * Abstract base class for transport implementations.
 * Provides common functionality and logging.
 */
export abstract class RemoteHttpTransport {
  private readonly messagePrefix: string

  protected logger: Logger
  protected subscriptions: RemoteHttpTransportSubscription[] = []
  protected disposed: boolean = false
  protected messageHandlers: Set<RemoteHttpTransportMessageHandler> = new Set()

  constructor(protected readonly options: RemoteHttpTransportOptions = {}) {
    this.logger = new Logger(options.name || this.constructor.name)
    this.messagePrefix = options.messagePrefix || 'remote-http-transport'
    this.logger.info('created ' + this.constructor.name)
  }

  /**
   * Send a prefixed message to the remote endpoint.
   * @param message The message to send.
   */
  send(message: string): void | Promise<void> {
    if (this.disposed) {
      this.logger.info('transport disposed, cannot send message')
      return
    }

    return this.sendMessage(`${this.messagePrefix}:${message}`)
  }

  /**
   * Send a message to the remote endpoint.
   * @param message The message to send.
   */
  abstract sendMessage(message: string): void | Promise<void>

  /**
   * Set up a message listener to handle incoming messages.
   * @param handler The function to call when a message is received.
   * @returns A subscription function that can be called to remove the listener.
   */
  protected onMessage(
    handler: RemoteHttpTransportMessageHandler
  ): RemoteHttpTransportSubscription {
    this.logger.info('adding message handler')
    this.messageHandlers.add(handler)

    const unsubscribe = () => {
      this.logger.info('removing message handler')
      this.messageHandlers.delete(handler)
    }

    return unsubscribe
  }

  /**
   * Add a message listener to the transport.
   * @param handler The function to call when a message is received.
   * @returns A subscription function that can be called to remove the listener.
   */
  addMessageListener(
    handler: RemoteHttpTransportMessageHandler
  ): RemoteHttpTransportSubscription {
    if (this.disposed) {
      this.logger.info('transport disposed, cannot add message listener')
      return () => {}
    }

    const unsubscribe = this.onMessage((message) => {
      // Check if this message is for our transport
      if (!this.isTransportMessage(message)) {
        return false // Not handled by transport
      }
      // Remove prefix and process
      const cleanMessage = message.substring(this.messagePrefix.length + 1)
      return handler(cleanMessage)
    })
    this.addSubscription(unsubscribe)
    return unsubscribe
  }

  /**
   * Handle an incoming message from any transport mechanism.
   * Checks if the message is intended for this transport using the configured prefix,
   * processes it by removing the prefix, logs it, and notifies all registered handlers.
   *
   * @param message The raw message string to process
   * @returns true if the message was handled by this transport, false otherwise
   */
  handleMessage(message: string): boolean {
    if (!this.isTransportMessage(message)) {
      return false // Not handled by transport
    }

    this.logger.info('received transport message:', message)

    // Notify all registered handlers
    this.messageHandlers.forEach((handler) => {
      try {
        handler(message)
      } catch (error) {
        this.logger.error('Error in message handler:', error)
      }
    })

    return true // Handled by transport
  }

  /**
   * Check if a message is intended for this transport.
   */
  protected isTransportMessage(message: string): boolean {
    return message.startsWith(`${this.messagePrefix}:`)
  }

  /**
   * Check if this transport is available in the current environment.
   * @returns True if the transport can be used in the current environment.
   */
  abstract isAvailable(): boolean

  /**
   * Clean up resources and remove event listeners.
   */
  dispose(): void {
    if (this.disposed) {
      this.logger.info('transport already disposed, skipping...')
      return
    }

    this.logger.info('disposing transport...')

    // Call all subscription cleanup functions
    for (const unsubscribe of this.subscriptions) {
      unsubscribe()
    }

    this.subscriptions = []
    this.disposed = true
    this.messageHandlers.clear()

    this.logger.info('transport disposed')
  }

  /**
   * Add a subscription to be cleaned up when the transport is disposed.
   * @param subscription The subscription function to add.
   */
  protected addSubscription(
    subscription: RemoteHttpTransportSubscription
  ): void {
    this.subscriptions.push(subscription)
  }

  /**
   * Get the message prefix used by this transport.
   */
  getMessagePrefix(): string {
    return this.messagePrefix
  }
}
