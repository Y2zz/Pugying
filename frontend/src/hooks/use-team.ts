import { useEffect, useState } from 'react';
import {
  fetchMyTeams,
  getStoredTeam,
  getTeamId,
  leaveTeam,
  setStoredTeam,
  switchTeam,
  type TeamOption,
} from '@/lib/api';

export function useTeam() {
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [current, setCurrent] = useState<TeamOption | null>(getStoredTeam());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void fetchMyTeams()
      .then((items) => {
        if (cancelled) {
          return;
        }
        setTeams(items);
        const id = getTeamId();
        const match = items.find((item) => item.id === id) ?? null;
        if (match) {
          setStoredTeam(match);
          setCurrent(match);
        } else if (items.length === 1) {
          setStoredTeam(items[0]);
          setCurrent(items[0]);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTeams([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const switchTo = async (team: TeamOption) => {
    if (team.id === current?.id) {
      return;
    }
    await switchTeam(team);
    setCurrent(team);
    window.location.reload();
  };

  const leaveCurrent = async () => {
    if (!current) {
      throw new Error('未选择团队');
    }
    const remaining = teams.filter((team) => team.id !== current.id);
    if (remaining.length === 0) {
      throw new Error('不能离开唯一的团队');
    }
    await leaveTeam(current.id);
    await switchTeam(remaining[0]);
    setCurrent(remaining[0]);
    setTeams(remaining);
    window.location.reload();
  };

  return { teams, current, loading, switchTo, leaveCurrent };
}
