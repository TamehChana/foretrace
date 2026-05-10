import { useEffect, useState } from 'react';
import { healthPayloadSchema, type HealthPayload } from '@foretrace/shared';
import { apiUrl } from '../api-url';

export type ApiHealthState =
  | { status: 'loading' }
  | { status: 'ok'; payload: HealthPayload }
  | { status: 'error'; message: string };

export function useApiHealth(): ApiHealthState {
  const [state, setState] = useState<ApiHealthState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetch(apiUrl('/health'))
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data: unknown = await res.json();
        return healthPayloadSchema.parse(data);
      })
      .then((payload) => {
        if (!cancelled) {
          setState({ status: 'ok', payload });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            message: err instanceof Error ? err.message : 'Request failed',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
