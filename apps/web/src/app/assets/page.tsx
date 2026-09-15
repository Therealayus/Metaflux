"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "@/components/data-states";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/use-session";

interface GraphNode {
  id: string;
  type: string;
  product: string;
  name: string;
  metaId: string;
  healthy: boolean;
  children: GraphNode[];
  missingChildren: string[];
}

const TYPE_LABEL: Record<string, string> = {
  business: "Business",
  facebook_page: "Facebook Page",
  instagram_business_account: "Instagram Business",
  whatsapp_business_account: "WhatsApp Business",
  phone_number: "Phone",
  ad_account: "Ad Account",
};

function Node({ node, depth }: { node: GraphNode; depth: number }) {
  return (
    <div style={{ paddingLeft: depth * 20 }}>
      <p className="py-0.5 font-mono text-[13px] text-zinc-300">
        <span className="text-zinc-600">{depth === 0 ? "" : "└─ "}</span>
        <span className="text-zinc-500">{TYPE_LABEL[node.type] ?? node.type}: </span>
        {node.name} <span className={node.healthy ? "text-emerald-300" : "text-amber-300"}>●</span>
      </p>
      {node.children.map((c) => (
        <Node key={c.id} node={c} depth={depth + 1} />
      ))}
      {node.missingChildren.map((m) => (
        <p key={m} style={{ paddingLeft: 20 }} className="py-0.5 font-mono text-[13px] text-amber-300/80">
          <span className="text-zinc-600">└─ </span>{TYPE_LABEL[m] ?? m}: missing —{" "}
          <Link href="/connections" className="underline hover:text-amber-200">connect to unlock</Link>
        </p>
      ))}
    </div>
  );
}

export default function AssetsPage() {
  const { loading: sessionLoading } = useSession();
  const [graph, setGraph] = useState<GraphNode[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    setError(null);
    api<GraphNode[]>("/api/v1/assets")
      .then(setGraph)
      .catch((e: ApiError) => setError(e.message));
  }

  useEffect(() => {
    if (!sessionLoading) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionLoading]);

  return (
    <AppShell>
      <PageHeader title="Asset graph" body="Business → Pages → Instagram · WABA → phone numbers. Missing assets are stated honestly." />
      {error ? <div className="mb-4"><ErrorBlock message={error} onRetry={refresh} /></div> : null}
      {!graph ? (
        <LoadingBlock />
      ) : graph.length === 0 ? (
        <EmptyBlock
          title="No assets discovered"
          body="Connect a Meta account, then run asset discovery from the Health page. Your Business, Pages, Instagram accounts and phone numbers will appear here."
          action={<Link href="/connections" className="inline-flex h-10 items-center rounded-lg bg-indigo-500 px-5 text-sm font-medium text-white hover:bg-indigo-400">Connect Meta</Link>}
        />
      ) : (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 leading-loose">
          {graph.map((n) => (
            <Node key={n.id} node={n} depth={0} />
          ))}
        </div>
      )}
    </AppShell>
  );
}
