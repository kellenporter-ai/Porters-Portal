import { describe, expect, it } from 'vitest';
import { sanitizeTopicKey } from '../lib/bosses.js';

describe('sanitizeTopicKey', () => {
  it.each([
    [undefined, null],
    [null, null],
    ['', null],
    ['   ', null],
    ['undefined', null],
    ['NULL', null],
    ['Unit 1.2 [Adv]', 'Unit_1_2__Adv_'],
    ['a/b*c~d', 'a_b_c_d'],
    ['kinematics', 'kinematics'],
  ])('sanitizes %j', (input, expected) => {
    expect(sanitizeTopicKey(input)).toBe(expected);
  });
});
