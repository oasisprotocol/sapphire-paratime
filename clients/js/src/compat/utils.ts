import { Cipher } from '../cipher.js';

const SAPPHIRE_PROP = 'sapphire';

export type SapphireAnnex = {
  [SAPPHIRE_PROP]: {
    cipher: Cipher;
  };
};

export type Hooks<T> = {
  [K in keyof T]?: T[K];
};

export function makeProxy<U extends object>(
  upstream: U,
  cipher: Cipher,
  hooks: Hooks<U>,
): U & SapphireAnnex {
  return new Proxy(upstream, {
    get(upstream, prop) {
      if (prop === SAPPHIRE_PROP) return { cipher };
      if (prop in hooks) return Reflect.get(hooks, prop);
      const value = Reflect.get(upstream, prop);
      return typeof value === 'function' ? value.bind(upstream) : value;
    },
  }) as U & SapphireAnnex;
}
