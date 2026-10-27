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

describe('SkillTreePanel rank truthfulness', () => {
  it('renders rank three from distinct unlocked Juggernaut nodes and shows current, next, and max effects', () => {
    renderPanel(['jug_1', 'jug_2', 'jug_3']);

    expect(screen.getByRole('heading', { name: 'Rank 3 / 6' })).toBeInTheDocument();
    expect(screen.getByText('Your hits grow stronger as your health drops.')).toBeInTheDocument();
    expect(screen.getByText('Current (Rank 3)')).toBeInTheDocument();
    expect(screen.getByText('Next (Rank 4)')).toBeInTheDocument();
    expect(screen.getByText('Max (Rank 6)')).toBeInTheDocument();
    expect(screen.getByText('Up to 1.09x damage when active')).toBeInTheDocument();
    expect(screen.getByText('Up to 1.18x damage when active')).toBeInTheDocument();
  });

  it('shows no zero bonus and hides next at rank six', () => {
    const { unmount } = renderPanel([]);
    expect(screen.getByText('No bonus yet. Unlock a node to begin.')).toBeInTheDocument();
    expect(screen.queryByText('Current (Rank 0)')).not.toBeInTheDocument();
    unmount();

    renderPanel(['jug_1', 'jug_2', 'jug_3', 'jug_4', 'jug_5', 'jug_6']);
    expect(screen.queryByText('Next (Rank 7)')).not.toBeInTheDocument();
  });

  it('uses an advance prompt instead of per-node mechanical effect claims', () => {
    renderPanel(['jug_1', 'jug_2', 'jug_3']);

    expect(screen.getAllByText('Advances Juggernaut to Rank 4')).toHaveLength(3);
    expect(screen.queryByText(/nearby allies/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/armor/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/reflect/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/dodge/i)).not.toBeInTheDocument();
  });
});
