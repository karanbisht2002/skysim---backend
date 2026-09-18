"use strict";

import { providerFactory } from './factory';
import type { Provider } from '@shared/schema';

import { AiraloService } from '../services/airalo/index';
import { EsimAccessService } from '../services/esim-access/index';
import { EsimGoService } from '../services/esim-go/index';
import { MayaService } from '../services/maya/index';
import { DataPlansService } from '../services/data-plans/index';

/**
 * Register all provider implementations with the factory
 * This file is imported during application startup
 */

/**
 * Register Airalo provider
 */
providerFactory.register(
  'airalo',
  {
    slug: 'airalo',
    name: 'Airalo',
    isEnabled: true,
    syncIntervalMinutes: 60,
    supportsRefunds: true,
    supportsCancellation: true,
    supportsTopups: true,
    supportsUsageTracking: true,
  },
  (provider: Provider) => {
    return new AiraloService(provider);
  }
);

/**
 * Register eSIM Access provider
 */
providerFactory.register(
  'esim-access',
  {
    slug: 'esim-access',
    name: 'eSIM Access',
    isEnabled: true,
    syncIntervalMinutes: 60,
    supportsRefunds: false,
    supportsCancellation: true,
    supportsTopups: true,
    supportsUsageTracking: true,
  },
  (provider: Provider) => {
    return new EsimAccessService(provider);
  }
);

/**
 * Register eSIM Go provider
 */
providerFactory.register(
  'esim-go',
  {
    slug: 'esim-go',
    name: 'eSIM Go',
    isEnabled: true,
    syncIntervalMinutes: 60,
    supportsRefunds: true,
    supportsCancellation: false,
    supportsTopups: true,
    supportsUsageTracking: true,
  },
  (provider: Provider) => {
    return new EsimGoService(provider);
  }
);

/**
 * Register Maya Mobile provider
 */
providerFactory.register(
  'maya',
  {
    slug: 'maya',
    name: 'Maya Mobile',
    isEnabled: true,
    syncIntervalMinutes: 60,
    supportsRefunds: true,
    supportsCancellation: true,
    supportsTopups: true,
    supportsUsageTracking: true,
  },
  (provider: Provider) => {
    return new MayaService(provider);
  }
);



/**
 * Register DataPlans.io provider
 */
providerFactory.register(
  'data-plans',
  {
    slug: 'data-plans',
    name: 'DataPlans.io',
    isEnabled: true,
    syncIntervalMinutes: 60,
    supportsRefunds: false,
    supportsCancellation: false,
    supportsTopups: false,
    supportsUsageTracking: true,
  },
  (provider: Provider) => {
    return new DataPlansService(provider);
  }
);

console.log('[ProviderFactory] All providers registered:', providerFactory.getRegisteredSlugs());

export { providerFactory };
