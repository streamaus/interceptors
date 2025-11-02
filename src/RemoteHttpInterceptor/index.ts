import type { HttpRequestEventMap } from '../glossary'
import { Interceptor } from '../Interceptor'
import { BatchInterceptor, type ExtractEventMapType } from '../BatchInterceptor'
import type { ClientRequestInterceptor } from '../interceptors/ClientRequest'
import type { XMLHttpRequestInterceptor } from '../interceptors/XMLHttpRequest'
import type { FetchInterceptor } from '../interceptors/fetch'
import { handleRequest } from '../utils/handleRequest'
import { RequestController } from '../RequestController'
import { FetchResponse } from '../utils/fetchUtils'
import { isResponseError } from '../utils/responseUtils'
import type { RemoteHttpTransport } from './transports'

export * from './transports'

export interface SerializedRequest {
  id: string
  url: string
  method: string
  headers: Array<[string, string]>
  credentials: RequestCredentials
  body: string
}

interface RevivedRequest extends Omit<SerializedRequest, 'url' | 'headers'> {
  url: URL
  headers: Headers
}

export interface SerializedResponse {
  status: number
  statusText: string
  headers: Array<[string, string]>
  body: string
}

type SupportedInterceptor = ClientRequestInterceptor | XMLHttpRequestInterceptor | FetchInterceptor;
type SupportedInterceptorEvents = ExtractEventMapType<[SupportedInterceptor]>
type SupportedInterceptors = ReadonlyArray<Interceptor<SupportedInterceptorEvents>>

/**
 * Options for creating a RemoteHttpInterceptor instance.
 */
export interface RemoteHttpInterceptorOptions<Interceptors extends SupportedInterceptors> {
  /**
   * Custom transport instance to use for communication.
   */
  transport: RemoteHttpTransport
  interceptors: Interceptors
}

export class RemoteHttpInterceptor<Interceptors extends SupportedInterceptors> extends BatchInterceptor<
  Interceptors, SupportedInterceptorEvents
> {
  private transport: RemoteHttpTransport

  constructor(options: RemoteHttpInterceptorOptions<Interceptors>) {
    super({
      name: 'remote-interceptor',
      interceptors: options.interceptors,
    })

    this.transport = options.transport
  }

  protected setup() {
    super.setup()

    // Check if transport is available
    if (!this.transport.isAvailable()) {
      this.logger.error(
        'transport is not available in the current environment',
        this.transport.constructor.name
      )
      return
    }

    this.on('request', async ({ request, requestId, controller }) => {
      // Send the stringified intercepted request to
      // the remote resolver via transport.
      const serializedRequest = JSON.stringify({
        id: requestId,
        method: request.method,
        url: request.url,
        headers: Array.from(request.headers.entries()),
        credentials: request.credentials,
        body: ['GET', 'HEAD'].includes(request.method)
          ? null
          : await request.text(),
      } as SerializedRequest)

      this.logger.info(
        'sending serialized request via transport:',
        serializedRequest
      )

      this.transport.send(`request:${serializedRequest}`)

      return new Promise<void>((resolve) => {
        // Set up message handler for this request
        const unsubscribe = this.transport.addMessageListener((message) => {
          if (message.startsWith(`response:${requestId}`)) {
            const [, serializedResponse] =
              message.match(/^response:.+?:(.+)$/) || []

            if (!serializedResponse) {
              return resolve()
            }

            const responseInit = JSON.parse(
              serializedResponse
            ) as SerializedResponse

            const mockedResponse = new FetchResponse(responseInit.body, {
              url: request.url,
              status: responseInit.status,
              statusText: responseInit.statusText,
              headers: responseInit.headers,
            })

            /**
             * @todo Support "errorWith" as well.
             * This response handling from the child is incomplete.
             */

            controller.respondWith(mockedResponse)

            // Clean up the message handler for this request
            unsubscribe()
            return resolve()
          }
        })
      })
    })

    // Add transport cleanup to subscriptions
    this.subscriptions.push(() => {
      this.transport.dispose()
    })
  }
}

export function requestReviver(key: string, value: any) {
  switch (key) {
    case 'url':
      return new URL(value)

    case 'headers':
      return new Headers(value)

    default:
      return value
  }
}

/**
 * Options for creating a RemoteHttpResolver instance.
 */
export interface RemoteHttpResolverOptions {
  /**
   * Custom transport instance to use for communication.
   */
  transport: RemoteHttpTransport
}

export class RemoteHttpResolver extends Interceptor<HttpRequestEventMap> {
  static symbol = Symbol('remote-resolver')
  private transport: RemoteHttpTransport

  /**
   * Create a new RemoteHttpResolver instance.
   *
   * @param options Options for creating the resolver
   */
  constructor(options: RemoteHttpResolverOptions) {
    super(RemoteHttpResolver.symbol)
    this.transport = options.transport
  }

  protected setup() {
    const logger = this.logger.extend('setup')

    // Check if transport is available
    if (!this.transport.isAvailable()) {
      logger.error(
        'transport is not available in the current environment',
        this.transport.constructor.name
      )
      return
    }

    // Set up message handler for incoming requests
    this.transport.addMessageListener(async (message) => {
      logger.info('received message via transport!', message)

      if (!message.startsWith('request:')) {
        logger.info('unknown message, ignoring...')
        return
      }

      const [, serializedRequest] = message.match(/^request:(.+)$/) || []
      if (!serializedRequest) {
        return
      }

      const requestJson = JSON.parse(
        serializedRequest,
        requestReviver
      ) as RevivedRequest

      logger.info('parsed intercepted request', requestJson)

      const request = new Request(requestJson.url, {
        method: requestJson.method,
        headers: new Headers(requestJson.headers),
        credentials: requestJson.credentials,
        body: requestJson.body,
      })

      const controller = new RequestController(request, {
        passthrough: () => {},
        respondWith: async (response) => {
          if (isResponseError(response)) {
            this.logger.info('received a network error!', { response })
            throw new Error('Not implemented')
          }

          this.logger.info('received mocked response!', { response })

          const responseClone = response.clone()
          const responseText = await responseClone.text()

          response.headers.delete('content-encoding')

          // Send the mocked response via transport
          const serializedResponse = JSON.stringify({
            status: response.status,
            statusText: response.statusText,
            headers: Array.from(response.headers.entries()),
            body: responseText,
          } as SerializedResponse)

          this.transport.send(`response:${requestJson.id}:${serializedResponse}`)

          // Emit an optimistic "response" event at this point,
          // not to rely on the back-and-forth signaling for the sake of the event.
          this.emitter.emit('response', {
            request,
            requestId: requestJson.id,
            response: responseClone,
            isMockedResponse: true,
          })

          logger.info(
            'sent serialized mocked response via transport:',
            serializedResponse
          )
        },
        errorWith: (reason) => {
          this.logger.info('request has errored!', { error: reason })
          throw new Error('Not implemented')
        },
      })

      await handleRequest({
        request,
        requestId: requestJson.id,
        controller,
        emitter: this.emitter,
      })
    })

    // Add transport cleanup to subscriptions
    this.subscriptions.push(() => {
      this.transport.dispose()
    })

    logger.info('transport setup complete')
  }
}
