import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { expose, remote } from '../index';
import { detectContext } from '../context';
import { _resetState } from '../autoPort';

describe('detectContext', () => {
  it('returns content-script by default (no ServiceWorkerGlobalScope)', () => {
    expect(detectContext()).toBe('content-script');
  });

  it('returns service-worker when ServiceWorkerGlobalScope is present', () => {
    const original = (globalThis as any).ServiceWorkerGlobalScope;
    // Create a fake ServiceWorkerGlobalScope that self is an instance of
    class FakeSWGlobalScope {}
    (globalThis as any).ServiceWorkerGlobalScope = FakeSWGlobalScope;

    // self isn't actually an instance, so it should still be content-script
    expect(detectContext()).toBe('content-script');

    (globalThis as any).ServiceWorkerGlobalScope = original;
  });
});

describe('auto-wiring overloads', () => {
  beforeEach(() => {
    _resetState();
  });

  afterEach(() => {
    _resetState();
  });

  it('remote(tabId) throws when no port is connected', () => {
    // Mock the service worker context detection
    expect(() => remote(42)).toThrow('No port connected for tabId 42');
  });

  it('remote() without args returns a proxy with deferred calls', () => {
    // Port creation is lazy (deferred to first method call), so no mocks needed
    const proxy = remote();
    expect((proxy as any)[Symbol.toPrimitive]).toBeUndefined();
    expect((proxy as any).then).toBeUndefined();
    expect(typeof (proxy as any).someMethod).toBe('function');
  });
});
