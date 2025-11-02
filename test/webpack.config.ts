import * as path from 'path'
import * as webpack from 'webpack'

const webpackConfig: webpack.Configuration = {
  target: 'web',
  plugins: [
    new webpack.EnvironmentPlugin({
      NODE_DEBUG: JSON.stringify(true),
    }),
  ],
  resolve: {
    alias: {
      '@streamaus/interceptors': path.resolve(__dirname, '..'),
    },
  },
}

export default webpackConfig
