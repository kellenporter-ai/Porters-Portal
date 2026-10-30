// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SkillTreePanel from '../../components/xp/SkillTreePanel';
import { LocaleProvider } from '../i18n';

vi.mock('../../services/dataService', () => ({
  dataService: { unlockSkill: vi.fn() },
}));
vi.mock('../../components/ToastProvider', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
vi.mock('../../components/ConfirmDialog', () => ({
  useConfirm: () => ({ confirm: vi.fn() }),
}));
vi.mock('../sfx', () => ({ sfx: { skillUnlock: vi.fn() } }));

function renderPanel(unlockedSkills: string[]) {
  return render(
    <LocaleProvider>
      <SkillTreePanel
        specialization="JUGGERNAUT"
        skillPoints={8}
        unlockedSkills={unlockedSkills}
        level={20}
      />
    </LocaleProvider>,
  );
}

describe('SkillTreePanel node effects', () => {
  it('shows owned nodes without a multiplier ramp', () => {
    renderPanel(['jug_1', 'jug_2', 'jug_3']);

    expect(screen.getByRole('heading', { name: 'Rank 3 / 6' })).toBeInTheDocument();
    expect(screen.getByText('3 of 6 nodes unlocked')).toBeInTheDocument();
    expect(screen.queryByText(/Current \(Rank|Next \(Rank|Max \(Rank|damage when active/i)).not.toBeInTheDocument();
  });

  it('shows the empty and complete owned-node states', () => {
    const { unmount } = renderPanel([]);
    expect(screen.getByText('0 of 6 nodes unlocked')).toBeInTheDocument();
    unmount();

    renderPanel(['jug_1', 'jug_2', 'jug_3', 'jug_4', 'jug_5', 'jug_6']);
    expect(screen.getByText('6 of 6 nodes unlocked')).toBeInTheDocument();
  });

  it('renders real mechanics on node cards instead of generic rank advancement', () => {
    renderPanel(['jug_1', 'jug_2', 'jug_3']);

    expect(screen.getByText('Heavy Hand')).toBeInTheDocument();
    expect(screen.getByText('Unbroken')).toBeInTheDocument();
    expect(screen.getAllByText('+8% damage')).not.toHaveLength(0);
    expect(screen.getByText('A miss keeps half your streak while above half health')).toBeInTheDocument();
    expect(screen.getByText('+12% damage while below half health')).toBeInTheDocument();
    expect(screen.queryByText(/Advances .* to Rank/i)).not.toBeInTheDocument();
  });
});
