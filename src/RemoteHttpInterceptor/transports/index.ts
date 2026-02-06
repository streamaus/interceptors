/**
 * Transport layer for RemoteHttpInterceptor and RemoteHttpResolver.
 *
 * This module provides a pluggable transport system that allows different
 * communication mechanisms to be used between interceptor and resolver
 * while maintaining the same message format and API.
 */

export {
  RemoteHttpTransport,
  type RemoteHttpTransportOptions,
  type RemoteHttpTransportMessageHandler,
  type RemoteHttpTransportSubscription,
} from './RemoteHttpTransport'

export {
  ChildProcessRemoteHttpInterceptorTransport,
  type ChildProcessRemoteHttpInterceptorTransportOptions,
  ChildProcessRemoteHttpResolverTransport,
  type ChildProcessRemoteHttpResolverTransportOptions
} from './ChildProcessRemoteHttpTransport'

export {
  IframeRemoteHttpInterceptorTransport,
  type IframeRemoteHttpInterceptorTransportOptions,
  IframeRemoteHttpResolverTransport,
  type IframeRemoteHttpResolverTransportOptions
} from './IframeRemoteHttpTransport'
