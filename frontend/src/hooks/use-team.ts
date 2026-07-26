import { useEffect, useState } from 'react';
import {
  fetchMyTeams,
  getStoredTeam,
  getTeamId,
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

  return { teams, current, loading, switchTo };
}
