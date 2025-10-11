import WatchFilePlugin from '@mytonwallet/webpack-watch-file-plugin';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import type { Configuration } from 'webpack';
import { BannerPlugin, EnvironmentPlugin, ProvidePlugin } from 'webpack';

import { convertI18nYamlToJson } from './dev/locales/convertI18nYamlToJson';

dotenv.config();

const { APP_ENV = 'production' } = process.env;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const appVersion = require('./package.json').version;

export default function createConfig(
  _: any,
  { mode = 'production' }: { mode: 'none' | 'development' | 'production' },
): Configuration {
  return {
    mode,

    optimization: {
      usedExports: true,
      minimize: APP_ENV === 'production',
    },

    entry: {
      main: {
        import: './src/api/air/index.ts',
        // Air doesn't support dynamic importing. This option inlines all dynamic imports.
        chunkLoading: false,
      },
    },

    output: {
      filename: 'mytonwallet-sdk.js',
      path: path.resolve(__dirname, 'dist-air'),
      clean: true,
    },

    module: {
      rules: [
        {
          test: /\.(ts|tsx|js)$/,
          loader: 'babel-loader',
          exclude: /node_modules/,
        },
        {
          test: /\.m?js$/,
          resolve: {
            fullySpecified: false,
          },
        },
      ],
    },

    resolve: {
      extensions: ['.js', '.ts', '.tsx'],
      fallback: {
        stream: require.resolve('stream-browserify'),
        process: require.resolve('process/browser'),
      },
    },

    plugins: [
      new BannerPlugin({
        banner: 'window.XMLHttpRequest = undefined;',
        raw: true,
      }),
      new ProvidePlugin({
        Buffer: ['buffer', 'Buffer'],
      }),
      new ProvidePlugin({
        process: 'process/browser',
      }),
      new EnvironmentPlugin({
        APP_ENV: 'production',
        APP_VERSION: appVersion,
        IS_CAPACITOR: '1',
        IS_AIR_APP: '1',
        TONHTTPAPI_MAINNET_URL: '',
        TONHTTPAPI_MAINNET_API_KEY: '',
        TONHTTPAPI_TESTNET_URL: '',
        TONHTTPAPI_TESTNET_API_KEY: '',
        TONAPIIO_MAINNET_URL: '',
        TONAPIIO_TESTNET_URL: '',
        TONHTTPAPI_V3_MAINNET_API_KEY: '',
        TONHTTPAPI_V3_TESTNET_API_KEY: '',
        BRILLIANT_API_BASE_URL: '',
        TRON_MAINNET_API_URL: '',
        TRON_TESTNET_API_URL: '',
        PROXY_HOSTS: '',
        STAKING_POOLS: '',
      }),
      new WatchFilePlugin({
        rules: [
          {
            name: 'Air i18n to JSON conversion',
            files: 'src/i18n/air/*.yaml',
            action: (filePath) => {
              const i18nYaml = fs.readFileSync(filePath, 'utf8');
              const i18nJson = convertI18nYamlToJson(i18nYaml, mode === 'production');

              if (!i18nJson) {
                return;
              }

              const fileName = path.basename(filePath, '.yaml');
              const outputDir = path.resolve(
                __dirname,
                'mobile/android/air/SubModules/AirAsFramework/src/main/assets/i18n',
              );
              if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
              }

              const outputPath = path.join(outputDir, `air_${fileName}.json`);
              fs.writeFileSync(outputPath, i18nJson, 'utf-8');
            },
            firstCompilation: true,
          },
        ],
      }),
    ],

    devtool: APP_ENV === 'production' ? undefined : 'inline-source-map',
  };
}
