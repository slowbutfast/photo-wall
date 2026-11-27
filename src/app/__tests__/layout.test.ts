import { describe, expect, it } from 'vitest';

import { metadata } from '../layout';

describe('root layout metadata', () => {
  it('names the public browser tab greg\u2019s photo wall', () => {
    expect(metadata.title).toBe("greg's photo wall");
  });
});
