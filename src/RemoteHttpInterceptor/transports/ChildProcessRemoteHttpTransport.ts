/**
 * Child Process Transport for Node.js environments.
 *
 * This module provides separate transport classes for interceptor and resolver
 * sides of child process communication, eliminating the need for dual-mode
 * classes with conditional logic.
 */

import { ChildProcess } from 'child_process'
import { RemoteHttpTransport, RemoteHttpTransportMessageHandler, RemoteHttpTransportSubscription, RemoteHttpTransportOptions } from './RemoteHttpTransport'

/**
 * Options for creating a ChildProcessRemoteHttpInterceptorTransport instance.
 */
export interface ChildProcessRemoteHttpInterceptorTransportOptions extends RemoteHttpTransportOptions {
  // No additional options needed for interceptor mode
}

/**
 * Options for creating a ChildProcessRemoteHttpResolverTransport instance.
 */
export interface ChildProcessRemoteHttpResolverTransportOptions extends RemoteHttpTransportOptions {
  /**
   * The child process to communicate with.
   * Required for resolver-side transport.
   */
  process: ChildProcess
}

/**
 * Transport implementation for the interceptor side of child process communication.
 *
 * This transport runs in the child process and communicates with the parent
 * process using process.send() and process message events.
 */
export class ChildProcessRemoteHttpInterceptorTransport extends RemoteHttpTransport {
  constructor(options: ChildProcessRemoteHttpInterceptorTransportOptions = {}) {
    super({ name: 'ChildProcessRemoteHttpInterceptorTransport', ...options })
  }

  /**
   * Send a message to the parent process.
   */
  sendMessage(message: string): void {
    if (!process.send) {
      this.logger.error('process.send is not available - not running as child process')
      return
    }

    this.logger.info('sending message to parent process:', message)
    process.send(message)
  }

  /**
   * Set up a message listener to handle incoming messages from the parent process.
   */
  onMessage(handler: RemoteHttpTransportMessageHandler): RemoteHttpTransportSubscription {
    const messageListener: NodeJS.MessageListener = (message) => {
      if (typeof message === 'string') {
        this.logger.info('received message:', message)
        handler(message)
      }
    }

    this.logger.info('adding message listener to current process')
    process.addListener('message', messageListener)

    const unsubscribe = () => {
      this.logger.info('removing message listener from current process')
      process.removeListener('message', messageListener)
    }

    return unsubscribe
  }

  /**
   * Check if this transport is available in the current environment.
   *
   * For interceptor mode: Checks if process.send is available (running as child process).
   */
  isAvailable(): boolean {
    return typeof process.send === 'function'
  }
}

/**
 * Transport implementation for the resolver side of child process communication.
 *
 * This transport runs in the parent process and communicates with a child
 * process using childProcess.send() and childProcess message events.
 */
export class ChildProcessRemoteHttpResolverTransport extends RemoteHttpTransport {
  private readonly childProcess: ChildProcess

  constructor(options: ChildProcessRemoteHttpResolverTransportOptions) {
    super({ name: 'ChildProcessRemoteHttpResolverTransport', ...options })
    this.childProcess = options.process
  }

  /**
   * Send a message to the child process.
   */
  sendMessage(message: string): void {
    this.logger.info('sending message to child process:', message)
    this.childProcess.send(message, (error) => {
      if (error) {
        this.logger.error('failed to send message to child process:', error)
      }
    })
  }

  /**
   * Set up a message listener to handle incoming messages from the child process.
   */
  onMessage(handler: RemoteHttpTransportMessageHandler): RemoteHttpTransportSubscription {
    const messageListener: NodeJS.MessageListener = (message) => {
      if (typeof message === 'string') {
        this.logger.info('received message:', message)
        handler(message)
      }
    }

    this.logger.info('adding message listener to child process')
    this.childProcess.addListener('message', messageListener)

    // Also listen for process lifecycle events to clean up
    const errorListener = () => this.dispose()
    const exitListener = () => this.dispose()

    this.childProcess.once('error', errorListener)
    this.childProcess.once('exit', exitListener)

    const unsubscribe = () => {
      this.logger.info('removing message listener from child process')
      this.childProcess.removeListener('message', messageListener)
      this.childProcess.removeListener('error', errorListener)
      this.childProcess.removeListener('exit', exitListener)
    }

    return unsubscribe
  }

  /**
   * Check if this transport is available in the current environment.
   *
   * For resolver mode: Checks if a child process instance is available.
   */
  isAvailable(): boolean {
    return !!this.childProcess
  }
}
