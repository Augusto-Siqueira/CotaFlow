"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export interface HomeStats {
  vigentes: number;
  rascunhos: number;
  mes: number;
  clientes: number;
}

export interface RecentQuote {
  id: string;
  origin: string | null;
  destination: string | null;
  full_freight: number | null;
  status: string;
  version: number;
  created_at: string;
  clients: { name: string } | null;
}

export function useHomeData(limit = 6) {
  const [stats, setStats] = useState<HomeStats | null>(null);
  const [recent, setRecent] = useState<RecentQuote[] | null>(null);

  useEffect(() => {
    async function load() {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const count = (q: PromiseLike<{ count: number | null }>) =>
        q.then((r) => r.count ?? 0);
      const head = { count: "exact", head: true } as const;

      const [vigentes, rascunhos, mes, clientes, recentRes] = await Promise.all([
        count(supabase.from("quotes").select("id", head).eq("status", "vigente")),
        count(supabase.from("quotes").select("id", head).eq("status", "rascunho")),
        count(
          supabase
            .from("quotes")
            .select("id", head)
            .gte("created_at", monthStart.toISOString())
        ),
        count(supabase.from("clients").select("id", head)),
        supabase
          .from("quotes")
          .select(
            "id, origin, destination, full_freight, status, version, created_at, clients(name)"
          )
          .order("created_at", { ascending: false })
          .limit(limit),
      ]);

      setStats({ vigentes, rascunhos, mes, clientes });
      setRecent((recentRes.data as unknown as RecentQuote[]) ?? []);
    }
    load();
  }, [limit]);

  return { stats, recent };
}
