import { config, type AppConfig } from '../lib/config';
import { createHttpDataSource } from './adapters/http';
import { createMockDataSource } from './adapters/mock';
import type { BridgeDataSource } from './source';

export function createDataSource(cfg: AppConfig = config): BridgeDataSource {
  return cfg.dataSource === 'http' ? createHttpDataSource({ baseUrl: cfg.apiBaseUrl }) : createMockDataSource();
}

export * from './source';
