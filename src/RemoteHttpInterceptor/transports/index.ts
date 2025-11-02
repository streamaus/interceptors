/**
 * Transport layer for RemoteHttpInterceptor and RemoteHttpResolver.
 *
 * This module provides a pluggable transport system that allows different
 * communication mechanisms to be used between interceptor and resolver
 * while maintaining the same message format and API.
 */

export {
  RemoteHttpTransport,
  RemoteHttpTransportOptions,
  RemoteHttpTransportMessageHandler,
  RemoteHttpTransportSubscription,
} from './RemoteHttpTransport'

export {
  ChildProcessRemoteHttpInterceptorTransport,
  ChildProcessRemoteHttpInterceptorTransportOptions,
  ChildProcessRemoteHttpResolverTransport,
  ChildProcessRemoteHttpResolverTransportOptions
} from './ChildProcessRemoteHttpTransport'

export {
  IframeRemoteHttpInterceptorTransport,
  IframeRemoteHttpInterceptorTransportOptions,
  IframeRemoteHttpResolverTransport,
  IframeRemoteHttpResolverTransportOptions
} from './IframeRemoteHttpTransport'
