import { useEffect, useState } from 'react';
import {
  agentClient,
  type AgentConnectionStatus,
  type AgentHelloPayload,
} from '@/lib/agent-client';

export function useAgent() {
  const [status, setStatus] = useState<AgentConnectionStatus>(
    agentClient.getStatus(),
  );
  const [hello, setHello] = useState<AgentHelloPayload | null>(
    agentClient.getHello(),
  );

  useEffect(() => {
    agentClient.connect();
    const unsubStatus = agentClient.subscribeStatus(setStatus);
    const unsubHello = agentClient.subscribeHello(setHello);
    return () => {
      unsubStatus();
      unsubHello();
    };
  }, []);

  return {
    status,
    version: hello?.version ?? null,
    capabilities: hello?.capabilities ?? [],
    connected: status === 'connected',
    ping: () => agentClient.ping(),
  };
}
