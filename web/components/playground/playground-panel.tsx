"use client";

import dynamic from "next/dynamic";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => <Textarea className="min-h-[320px]" defaultValue='{\n  "thread_id": "demo",\n  "input": "Run catalog_router"\n}' />
});

export function PlaygroundPanel() {
  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Request</CardTitle>
          <Button size="sm">Invoke</Button>
        </CardHeader>
        <CardContent>
          <MonacoEditor
            height="360px"
            theme="vs-dark"
            defaultLanguage="json"
            defaultValue={JSON.stringify(
              {
                agent_id: "catalog_router",
                input: {
                  prompt: "Summarize the latest approval queue for tenant_demo"
                }
              },
              null,
              2,
            )}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              scrollBeyondLastLine: false
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Response</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            className="min-h-[360px] font-mono text-xs"
            defaultValue={JSON.stringify(
              {
                thread_id: "thr_demo_4901",
                status: "running",
                result: null,
                logs_url: "/logs?thread_id=thr_demo_4901"
              },
              null,
              2,
            )}
          />
        </CardContent>
      </Card>
    </div>
  );
}
