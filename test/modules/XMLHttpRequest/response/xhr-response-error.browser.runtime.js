import { XMLHttpRequestInterceptor } from '@streamaus/interceptors/XMLHttpRequest'

const interceptor = new XMLHttpRequestInterceptor()

interceptor.on('request', ({ controller }) => {
  controller.respondWith(Response.error())
})

interceptor.apply()
