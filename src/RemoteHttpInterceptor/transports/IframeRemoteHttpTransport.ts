/**
 * Iframe Transport for browser environments.
 *
 * This module provides separate transport classes for interceptor and resolver
 * sides of iframe communication, eliminating the need for dual-mode classes
 * with conditional logic.
 */

import { RemoteHttpTransport, RemoteHttpTransportMessageHandler, RemoteHttpTransportSubscription, RemoteHttpTransportOptions } from './RemoteHttpTransport'

/**
 * Options for creating an IframeRemoteHttpInterceptorTransport instance.
 */
export interface IframeRemoteHttpInterceptorTransportOptions extends RemoteHttpTransportOptions {
  /**
   * The allowed origin for postMessage communication.
   * Use '*' to allow any origin (not recommended for production).
   * Defaults to '*' for maximum compatibility.
   */
  targetOrigin?: string

  /**
   * Optional source origin validation.
   * If provided, only messages from this origin will be accepted.
   */
  sourceOrigin?: string
}

/**
 * Options for creating an IframeRemoteHttpResolverTransport instance.
 */
export interface IframeRemoteHttpResolverTransportOptions extends RemoteHttpTransportOptions {
  /**
   * The target iframe window to communicate with.
   * Required for resolver-side transport.
   */
  targetWindow: Window

  /**
   * The allowed origin for postMessage communication.
   * Use '*' to allow any origin (not recommended for production).
   * Defaults to '*' for maximum compatibility.
   */
  targetOrigin?: string

  /**
   * Optional source origin validation.
   * If provided, only messages from this origin will be accepted.
   */
  sourceOrigin?: string
}

/**
 * Transport implementation for the interceptor side of iframe communication.
 *
 * This transport runs in an iframe and communicates with the parent window
 * using the postMessage API.
 */
export class IframeRemoteHttpInterceptorTransport extends RemoteHttpTransport {
  private readonly targetOrigin: string
  private readonly sourceOrigin?: string

  constructor(options: IframeRemoteHttpInterceptorTransportOptions = {}) {
    super({ name: 'IframeRemoteHttpInterceptorTransport', ...options })

    this.targetOrigin = options.targetOrigin || '*'
    this.sourceOrigin = options.sourceOrigin

    this.logger.info(
      'target origin: %s',
      this.targetOrigin
    )
  }

  /**
   * Send a message to the parent window using postMessage.
   */
  sendMessage(message: string): void {
    // Check if we're in a browser environment
    if (typeof window === 'undefined') {
      this.logger.error('window is not available - not running in browser environment')
      return
    }

    try {
      this.logger.info('sending message to parent window:', message)
      window.parent.postMessage(message, this.targetOrigin)
    } catch (error) {
      this.logger.error('failed to send message via postMessage:', error)
    }
  }

  /**
   * Set up a message listener for postMessage events from the parent window.
   */
  onMessage(handler: RemoteHttpTransportMessageHandler): RemoteHttpTransportSubscription {
    const messageListener = (event: MessageEvent) => {
      // Validate source origin if specified
      if (this.sourceOrigin && event.origin !== this.sourceOrigin) {
        this.logger.info(
          'ignoring message from unauthorized origin: %s (expected: %s)',
          event.origin,
          this.sourceOrigin
        )
        return
      }

      // Validate message format (should be a string)
      if (typeof event.data !== 'string') {
        this.logger.info('ignoring non-string message:', typeof event.data)
        return
      }

      // Validate source window (should be parent window)
      if (event.source !== window.parent) {
        this.logger.info('ignoring message from unexpected source window')
        return
      }

      this.logger.info('received message from %s:', event.origin, event.data)
      handler(event.data)
    }

    this.logger.info('adding postMessage listener to window')
    window.addEventListener('message', messageListener)

    const unsubscribe = () => {
      this.logger.info('removing postMessage listener from window')
      window.removeEventListener('message', messageListener)
    }

    return unsubscribe
  }

  /**
   * Check if this transport is available in the current environment.
   *
   * For interceptor mode: Checks if we're in a browser iframe environment.
   */
  isAvailable(): boolean {
    // Check if we're in a browser environment with postMessage support
    if (typeof window === 'undefined' || typeof window.postMessage !== 'function') {
      return false
    }

    // For interceptor mode, check if we're in an iframe
    return window !== window.parent
  }

  /**
   * Get the target origin for postMessage.
   */
  getTargetOrigin(): string {
    return this.targetOrigin
  }

  /**
   * Get the source origin validation setting.
   */
  getSourceOrigin(): string | undefined {
    return this.sourceOrigin
  }
}

/**
 * Transport implementation for the resolver side of iframe communication.
 *
 * This transport runs in the parent window and communicates with an iframe
 * using the postMessage API.
 */
export class IframeRemoteHttpResolverTransport extends RemoteHttpTransport {
  private readonly targetWindow: Window
  private readonly targetOrigin: string
  private readonly sourceOrigin?: string

  constructor(options: IframeRemoteHttpResolverTransportOptions) {
    super({ name: 'IframeRemoteHttpResolverTransport', ...options })

    this.targetWindow = options.targetWindow
    this.targetOrigin = options.targetOrigin || '*'
    this.sourceOrigin = options.sourceOrigin

    this.logger.info(
      'target origin: %s',
      this.targetOrigin
    )
  }

  /**
   * Send a message to the iframe window using postMessage.
   */
  sendMessage(message: string): void {
    try {
      this.logger.info('sending message to iframe window:', message)
      this.targetWindow.postMessage(message, this.targetOrigin)
    } catch (error) {
      this.logger.error('failed to send message via postMessage:', error)
    }
  }

  /**
   * Set up a message listener for postMessage events from the iframe.
   */
  onMessage(handler: RemoteHttpTransportMessageHandler): RemoteHttpTransportSubscription {
    // In Node.js environment, return a no-op subscription
    if (typeof window === 'undefined') {
      this.logger.info('Node.js environment detected, returning no-op message listener')
      return () => {}
    }

    const messageListener = (event: MessageEvent) => {
      // Validate source origin if specified
      if (this.sourceOrigin && event.origin !== this.sourceOrigin) {
        this.logger.info(
          'ignoring message from unauthorized origin: %s (expected: %s)',
          event.origin,
          this.sourceOrigin
        )
        return
      }

      // Validate source window (should be the target iframe)
      if (event.source !== this.targetWindow) {
        this.logger.info('ignoring message from unexpected source window')
        return
      }

      this.logger.info('received message from %s:', event.origin, event.data)
      handler(event.data)
    }

    this.logger.info('adding postMessage listener to window')
    window.addEventListener('message', messageListener)

    const unsubscribe = () => {
      this.logger.info('removing postMessage listener from window')
      window.removeEventListener('message', messageListener)
    }

    return unsubscribe
  }

  /**
   * Check if this transport is available in the current environment.
   *
   * For resolver mode: Checks if we're in a browser environment with a valid target window.
   */
  isAvailable(): boolean {
    // Check if we're in a browser environment with postMessage support
    if (typeof window === 'undefined' || typeof window.postMessage !== 'function') {
      return false
    }

    // For resolver mode, check if target window is available and different from current window
    return !!this.targetWindow && this.targetWindow !== window
  }

  /**
   * Get the target origin for postMessage.
   */
  getTargetOrigin(): string {
    return this.targetOrigin
  }

  /**
   * Get the source origin validation setting.
   */
  getSourceOrigin(): string | undefined {
    return this.sourceOrigin
  }

  /**
   * Get the target window.
   */
  getTargetWindow(): Window {
    return this.targetWindow
  }
}
