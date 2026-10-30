import { describe, expect, it } from 'vitest';
import {
  SKILL_NODES_V2,
  SKILL_TREE_V2,
  getNodeEffect,
} from '../specializations';

const trees = Object.values(SKILL_TREE_V2);

describe('skill tree effect metadata', () => {
  it('has eight six-node trees with the established costs and tiers', () => {
    expect(trees).toHaveLength(8);
    for (const tree of trees) {
      expect(tree).toHaveLength(6);
      expect(tree.map(node => node.cost)).toEqual([1, 1, 2, 2, 3, 5]);
      expect(tree.map(node => node.tier)).toEqual([1, 2, 3, 4, 5, 6]);
    }
  });

  it('keeps every node id and cost aligned with the structural tree', () => {
    for (const node of trees.flat()) {
      const structuralNode = SKILL_NODES_V2.find(candidate => candidate.id === node.id);
      expect(structuralNode, node.id).toBeDefined();
      expect(structuralNode?.cost).toBe(node.cost);
    }
  });

  it('keeps display names aligned to prevent UI and engine drift', () => {
    for (const node of trees.flat()) {
      expect(SKILL_NODES_V2.find(candidate => candidate.id === node.id)?.name).toBe(node.name);
    }
  });

  it('gives every node a non-empty concrete effect with no em-dash', () => {
    for (const node of trees.flat()) {
      expect(node.effect.trim().length, node.id).toBeGreaterThan(0);
      // These exact engine strings use words such as "half" and "first"
      // instead of numerals. Do not invent numbers just to satisfy a format.
      const wordedRules = new Set(['jug_2', 'sni_4', 'spd_2', 'sch_2']);
      if (!wordedRules.has(node.id)) expect(node.effect, node.id).toMatch(/\d/);
      expect(node.effect, node.id).not.toContain('—');
    }
  });

  it('looks up effects by id and returns null for unknown ids', () => {
    expect(getNodeEffect('jug_1')).toBe('+8% damage');
    expect(getNodeEffect('unknown')).toBeNull();
  });
});
