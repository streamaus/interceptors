import { FetchInterceptor } from '@streamaus/interceptors/fetch'

const interceptor = new FetchInterceptor()
interceptor.apply()

window.interceptor = interceptor
