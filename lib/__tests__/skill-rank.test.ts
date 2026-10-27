import { describe, expect, it } from 'vitest';
import {
  SKILL_NODES_V2,
  SKILL_NODE_IDS,
  getSkillRank,
} from '../specializations';

const jugIds = SKILL_NODE_IDS.JUGGERNAUT;
const berIds = SKILL_NODE_IDS.BERSERKER;

describe('skill rank server-rule parity', () => {
  it('returns zero for absent or malformed input', () => {
    expect(getSkillRank([], 'JUGGERNAUT')).toBe(0);
    expect(getSkillRank(null, 'JUGGERNAUT')).toBe(0);
    expect(getSkillRank('jug_1', 'JUGGERNAUT')).toBe(0);
    expect(getSkillRank([null, 4, {}, ''], 'JUGGERNAUT')).toBe(0);
  });

  it('counts distinct valid IDs and ignores duplicates, unknown, and cross-spec IDs', () => {
    expect(getSkillRank([
      jugIds[0], jugIds[0], jugIds[1], berIds[0], 'unknown', null, 7, jugIds[2],
    ], 'JUGGERNAUT')).toBe(3);
  });

  it('counts IDs only in the requested specialization', () => {
    expect(getSkillRank(berIds, 'JUGGERNAUT')).toBe(0);
    expect(getSkillRank([jugIds[0], berIds[0], berIds[1]], 'BERSERKER')).toBe(2);
  });

  it('caps rank at six even when foreign or repeated IDs are supplied', () => {
    expect(getSkillRank([...jugIds, ...jugIds, ...berIds], 'JUGGERNAUT')).toBe(6);
  });

  it('retains six unique nodes per specialization with no effects populated', () => {
    for (const ids of Object.values(SKILL_NODE_IDS)) {
      expect(ids).toHaveLength(6);
      expect(new Set(ids).size).toBe(6);
    }
    expect(SKILL_NODES_V2).toHaveLength(48);
    expect(SKILL_NODES_V2.every(node => node.effect === undefined)).toBe(true);
  });
});
