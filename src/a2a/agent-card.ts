export function buildAgentCard(baseUrl: string): Record<string, unknown> {
  return {
    name: "Govrail Gateway",
    version: "0.1.0",
    capabilities: {
      tasks: true,
      streaming: true,
    },
    endpoints: {
      message_send: `${baseUrl}/api/v1/a2a/message:send`,
      message_stream: `${baseUrl}/api/v1/a2a/message:stream`,
      task_get: `${baseUrl}/api/v1/a2a/tasks/{id}`,
      task_cancel: `${baseUrl}/api/v1/a2a/tasks/{id}:cancel`,
    },
  };
}
